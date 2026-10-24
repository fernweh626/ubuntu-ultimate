import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { getClub, listClubs } from '@/db/clubs';
import { useData } from '@/db/live';
import { getTeam, saveTeam, type TeamInput, setBankingDetails } from '@/db/repo';
import { DIVISIONS } from '@/domain/divisions';
import { Button, Choice, Field, Footer, Icon, Screen, Section, T } from '@/ui/components';
import { PhoneField } from '@/ui/phone-field';
import { colors, space } from '@/ui/theme';

const PALETTE = [
  '#BF0000', '#E0561B', '#E8A33D', '#C9A227', '#2E8B57', '#00562B', '#1F6B4A', '#0E7C86',
  '#2F6FB2', '#1D3F8F', '#5B3FA8', '#61223B', '#C2185B', '#6D4C41', '#5A615C', '#14181A',
];

const KINDS = [
  { value: 'club', label: 'Club' },
  { value: 'university', label: 'University' },
  { value: 'school', label: 'School' },
  { value: 'regional', label: 'Regional' },
  { value: 'national', label: 'National' },
  { value: 'hat', label: 'Hat / pickup' },
];

export default function TeamEdit() {
  const { id, clubId } = useLocalSearchParams<{ id?: string; clubId?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<TeamInput>({ name: '', kind: 'club', region: 'western', primary_color: PALETTE[6], club_id: clubId ?? null });
  const clubs = useData(listClubs) ?? [];

  useEffect(() => {
    if (id) getTeam(db, id).then((t) => t && setF(t));
    else if (clubId) {
      // A new team in a club starts with the club's colours and region.
      getClub(db, clubId).then((c) => c && setF((x) => ({ ...x, club_id: c.id, region: c.region ?? x.region, primary_color: c.primary_color ?? x.primary_color, city: c.city, name: x.name || `${c.name} ` })));
    }
  }, [db, id, clubId]);

  const set = <K extends keyof TeamInput>(k: K, v: TeamInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const opt = (k: keyof TeamInput) => (v: string) => set(k, (v || null) as never);

  async function save() {
    if (!f.name.trim()) return Alert.alert('Add the team name');
    const newId = await saveTeam(db, { ...f, id });
    await setBankingDetails(db, 'team', newId, f.banking_details ?? null);
    if (id) router.back();
    else router.replace(`/team/${newId}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit team' : 'New team' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save team" kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Team name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Chilli Legends" />
        <Field label="Short name (3 letters)" value={f.short_name ?? ''} onChangeText={(v) => set('short_name', v.toUpperCase().slice(0, 4) || null)} autoCapitalize="characters" />
        <Section title="Club">
          <T v="small">Part of a club that runs several teams (Mixed, Open, Women’s…)? Link it so they show together and club staff can manage them.</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Choice label="No club" selected={!f.club_id} onPress={() => set('club_id', null)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
            {clubs.map((c) => (
              <Choice key={c.id} label={c.name} selected={f.club_id === c.id} onPress={() => set('club_id', c.id)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
            ))}
            <Choice label="+ New club" onPress={() => router.push('/club/edit')} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          </ScrollView>
        </Section>
        <Section title="Division">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {DIVISIONS.map((d) => (
              <Choice key={d.value} label={d.label} selected={(f.division ?? null) === d.value} onPress={() => set('division', d.value)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Section title="Team colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: f.primary_color === c }}
                onPress={() => set('primary_color', c)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: c,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: f.primary_color === c ? 3 : 0,
                  borderColor: colors.ink,
                }}>
                {f.primary_color === c ? <Icon name="check" color="#fff" /> : null}
              </Pressable>
            ))}
          </View>
          <T v="small">Logo upload arrives with the online version.</T>
        </Section>
        <Section title="Type">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {KINDS.map((k) => (
              <Choice key={k.value} label={k.label} selected={f.kind === k.value} onPress={() => set('kind', k.value)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Section title="Region">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {REGIONS.map((r) => (
              <Choice key={r.code} label={r.name} selected={f.region === r.code} onPress={() => set('region', r.code)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Field label="Home town / campus" value={f.city ?? ''} onChangeText={opt('city')} />
        <Section title="How to contact the team">
          <Field label="Contact person" value={f.contact_name ?? ''} onChangeText={opt('contact_name')} />
          <PhoneField label="Phone / WhatsApp" value={f.contact_phone ?? ''} onChange={opt('contact_phone')} />
          <Field label="Email" value={f.contact_email ?? ''} onChangeText={opt('contact_email')} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Website" value={f.website ?? ''} onChangeText={opt('website')} autoCapitalize="none" />
          <Field label="Instagram or Facebook link" value={f.social ?? ''} onChangeText={opt('social')} autoCapitalize="none" />
        </Section>
        <Field label="Banking details (optional)" value={f.banking_details ?? ''} onChangeText={opt('banking_details')} multiline placeholder={'Bank: …\nAccount name: …\nAccount no: …\nBranch code: …\nReference: your name + FEES'} hint="Shown on the team page with Copy and Share, for paying team fees." />
        <Field label="About the team" value={f.about ?? ''} onChangeText={opt('about')} multiline placeholder="Training times, who can join, anything new players should know" />
      </Screen>
    </>
  );
}
