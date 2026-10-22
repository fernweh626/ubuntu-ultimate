import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { deleteCalendarEntry, getCalendarEntry, saveCalendarEntry } from '@/db/repo';
import type { CalendarEntry } from '@/db/types';
import { Button, Choice, Field, Footer, Screen, Section, T } from '@/ui/components';
import { space } from '@/ui/theme';

type Form = Omit<CalendarEntry, 'id'>;

const EMPTY: Form = {
  name: '',
  kind: 'tournament',
  level: 'regional',
  region: null,
  location: null,
  start_date: null,
  end_date: null,
  month_hint: null,
  status: 'tbc',
  url: null,
  notes: null,
};

const LEVELS = ['international', 'national', 'regional', 'league', 'social'];
const KINDS = ['tournament', 'league', 'hat', 'camp', 'other'];

const isDate = (s: string | null) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function CalendarEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<Form>(EMPTY);

  useEffect(() => {
    if (id) getCalendarEntry(db, id).then((c) => c && setF(c));
  }, [db, id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.name.trim()) return Alert.alert('Add a name');
    if (!isDate(f.start_date) || !isDate(f.end_date)) return Alert.alert('Dates should look like 2026-12-04');
    await saveCalendarEntry(db, { ...f, status: f.start_date ? 'confirmed' : 'tbc', id });
    router.back();
  }

  function remove() {
    if (!id) return;
    Alert.alert('Remove from the calendar?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteCalendarEntry(db, id);
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Calendar entry' : 'Add to calendar' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save" kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Mixed Nationals 2027" />
        <Section title="Type">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {KINDS.map((k) => (
              <Choice key={k} label={k[0].toUpperCase() + k.slice(1)} selected={f.kind === k} onPress={() => set('kind', k)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Section title="Level">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {LEVELS.map((k) => (
              <Choice key={k} label={k[0].toUpperCase() + k.slice(1)} selected={f.level === k} onPress={() => set('level', k)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Starts" value={f.start_date ?? ''} onChangeText={(v) => set('start_date', v || null)} placeholder="2026-12-04" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Ends" value={f.end_date ?? ''} onChangeText={(v) => set('end_date', v || null)} placeholder="2026-12-06" keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        {!f.start_date ? (
          <Field label="Roughly when (until dates are set)" value={f.month_hint ?? ''} onChangeText={(v) => set('month_hint', v || null)} placeholder="e.g. October" />
        ) : null}
        <Section title="Region">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Choice label="National" selected={!f.region} onPress={() => set('region', null)} style={{ paddingHorizontal: 14 }} />
            {REGIONS.map((r) => (
              <Choice key={r.code} label={r.name} selected={f.region === r.code} onPress={() => set('region', r.code)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Field label="Location" value={f.location ?? ''} onChangeText={(v) => set('location', v || null)} />
        <Field label="Website or sign-up link" value={f.url ?? ''} onChangeText={(v) => set('url', v || null)} autoCapitalize="none" />
        {f.url ? <Button label="Open link" icon="open-in-new" kind="ghost" onPress={() => Linking.openURL(f.url!)} /> : null}
        <Field label="Notes" value={f.notes ?? ''} onChangeText={(v) => set('notes', v || null)} multiline />
        {id ? <Button label="Remove from calendar" kind="danger" icon="delete-outline" onPress={remove} /> : null}
        <T v="small">Leave the dates empty to show it as “dates TBC”.</T>
      </Screen>
    </>
  );
}
