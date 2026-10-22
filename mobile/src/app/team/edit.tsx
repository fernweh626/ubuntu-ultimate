import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { getTeam, saveTeam, type TeamInput } from '@/db/repo';
import { Button, Choice, Field, Footer, Icon, Screen, Section, T } from '@/ui/components';
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<TeamInput>({ name: '', kind: 'club', region: 'western', primary_color: PALETTE[6] });

  useEffect(() => {
    if (id) getTeam(db, id).then((t) => t && setF(t));
  }, [db, id]);

  const set = <K extends keyof TeamInput>(k: K, v: TeamInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const opt = (k: keyof TeamInput) => (v: string) => set(k, (v || null) as never);

  async function save() {
    if (!f.name.trim()) return Alert.alert('Add the team name');
    const newId = await saveTeam(db, { ...f, id });
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
          <Field label="Phone / WhatsApp" value={f.contact_phone ?? ''} onChangeText={opt('contact_phone')} keyboardType="phone-pad" />
          <Field label="Email" value={f.contact_email ?? ''} onChangeText={opt('contact_email')} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Website" value={f.website ?? ''} onChangeText={opt('website')} autoCapitalize="none" />
          <Field label="Instagram or Facebook link" value={f.social ?? ''} onChangeText={opt('social')} autoCapitalize="none" />
        </Section>
        <Field label="About the team" value={f.about ?? ''} onChangeText={opt('about')} multiline placeholder="Training times, who can join, anything new players should know" />
      </Screen>
    </>
  );
}
