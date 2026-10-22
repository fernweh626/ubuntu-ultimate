import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { getPerson, savePerson, type PersonInput } from '@/db/repo';
import type { Gender, Position } from '@/db/types';
import { isMinor } from '@/domain/format';
import { Button, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { space } from '@/ui/theme';

export default function PlayerEdit() {
  const { id, teamId } = useLocalSearchParams<{ id?: string; teamId?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<PersonInput>({ first_name: '', last_name: '', gender: null, position: null });
  const [kind, setKind] = useState<'core' | 'guest' | 'mercenary'>('core');
  const [addAnother, setAddAnother] = useState(false);

  useEffect(() => {
    if (id) getPerson(db, id).then((p) => p && setF(p));
  }, [db, id]);

  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(another: boolean) {
    if (!f.first_name.trim()) return Alert.alert('Add a first name');
    if (f.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date)) return Alert.alert('Birth date should look like 2001-06-30');
    await savePerson(db, { ...f, id }, teamId && !id ? { teamId, kind, jersey: f.preferred_number ?? null } : undefined);
    if (another) {
      setF({ first_name: '', last_name: '', gender: f.gender, position: null });
      setAddAnother(true);
      return;
    }
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit player' : 'Add player' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {!id ? <Button label="Save & add another" onPress={() => save(true)} style={{ flex: 1 }} /> : null}
              <Button label="Save" kind="primary" onPress={() => save(false)} style={{ flex: 1 }} />
            </View>
          </Footer>
        }>
        {addAnother ? <T v="small">Saved. Add the next player, or tap Save when you’re done.</T> : null}
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="First name" value={f.first_name} onChangeText={(v) => set('first_name', v)} autoFocus={!id} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name" value={f.last_name} onChangeText={(v) => set('last_name', v)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Nickname" value={f.nickname ?? ''} onChangeText={(v) => set('nickname', v || null)} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Jersey number" value={f.preferred_number ?? ''} onChangeText={(v) => set('preferred_number', v.replace(/\D/g, '').slice(0, 3) || null)} keyboardType="number-pad" />
          </View>
        </View>
        <Section title="Plays in the ratio as">
          <Segmented<Gender | 'none'>
            value={f.gender ?? 'none'}
            onChange={(v) => set('gender', v === 'none' ? null : v)}
            options={[
              { value: 'W', label: 'Woman' },
              { value: 'M', label: 'Man' },
              { value: 'X', label: 'Other' },
            ]}
          />
        </Section>
        <Section title="Position">
          <Segmented<Position | 'none'>
            value={f.position ?? 'none'}
            onChange={(v) => set('position', v === 'none' ? null : v)}
            options={[
              { value: 'handler', label: 'Handler' },
              { value: 'cutter', label: 'Cutter' },
              { value: 'hybrid', label: 'Hybrid' },
            ]}
          />
        </Section>
        {teamId && !id ? (
          <Section title="Joining as">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'core', label: 'Core' },
                { value: 'guest', label: 'Guest' },
                { value: 'mercenary', label: 'Mercenary' },
              ]}
            />
          </Section>
        ) : null}
        <Field
          label="Birth date (optional)"
          value={f.birth_date ?? ''}
          onChangeText={(v) => set('birth_date', v || null)}
          placeholder="2001-06-30"
          keyboardType="numbers-and-punctuation"
          hint={isMinor(f.birth_date) ? 'Under 18: shown publicly as first name and surname initial only.' : 'Used for age divisions. Others only see the age group.'}
        />
        <Field
          label="Email (optional)"
          value={f.email ?? ''}
          onChangeText={(v) => set('email', v || null)}
          keyboardType="email-address"
          autoCapitalize="none"
          hint="Never shown to anyone. Only used to send game summaries and reminders."
        />
      </Screen>
    </>
  );
}
