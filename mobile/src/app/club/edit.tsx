import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { getClub, saveClub, type ClubInput } from '@/db/clubs';
import { getMeId } from '@/db/repo';
import { Button, Choice, Field, Footer, Icon, Screen, Section } from '@/ui/components';
import { PhoneField } from '@/ui/phone-field';
import { colors, space } from '@/ui/theme';

const PALETTE = ['#BF0000', '#E0561B', '#E8A33D', '#C9A227', '#2E8B57', '#00562B', '#1F6B4A', '#0E7C86', '#2F6FB2', '#1D3F8F', '#5B3FA8', '#61223B', '#C2185B', '#6D4C41', '#5A615C', '#14181A'];

/** Create or edit a club. You become its first club admin, with staff rights on all its teams. */
export default function ClubEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<ClubInput>({ name: '', region: 'western', primary_color: PALETTE[6] });
  useEffect(() => {
    if (id) getClub(db, id).then((c) => c && setF(c));
  }, [db, id]);
  const set = <K extends keyof ClubInput>(k: K, v: ClubInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const opt = (k: keyof ClubInput) => (v: string) => set(k, (v || null) as never);

  async function save() {
    if (!f.name.trim()) return Alert.alert('Add the club name');
    const clubId = await saveClub(db, { ...f, id }, await getMeId(db));
    if (id) router.back();
    else router.replace(`/club/${clubId}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit club' : 'New club' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save club" kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Club name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Chilli Ultimate Club" />
        <Field label="Short name" value={f.short_name ?? ''} onChangeText={(v) => set('short_name', v.toUpperCase().slice(0, 5) || null)} autoCapitalize="characters" />
        <Section title="Club colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: f.primary_color === c }}
                onPress={() => set('primary_color', c)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: f.primary_color === c ? 3 : 0, borderColor: colors.ink }}>
                {f.primary_color === c ? <Icon name="check" color="#fff" /> : null}
              </Pressable>
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
        <Field label="About the club" value={f.about ?? ''} onChangeText={opt('about')} multiline placeholder="Who you are, when you train, how to join" />
        <Section title="Contact">
          <PhoneField label="Phone / WhatsApp" value={f.contact_phone ?? ''} onChange={opt('contact_phone')} />
          <Field label="Email" value={f.contact_email ?? ''} onChangeText={opt('contact_email')} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Website" value={f.website ?? ''} onChangeText={opt('website')} autoCapitalize="none" />
          <Field label="Instagram / Facebook" value={f.social ?? ''} onChangeText={opt('social')} autoCapitalize="none" />
        </Section>
      </Screen>
    </>
  );
}
