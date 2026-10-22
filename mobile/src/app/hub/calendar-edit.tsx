import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { deleteCalendarEntry, getCalendarEntry, saveCalendarEntry } from '@/db/repo';
import type { CalendarEntry } from '@/db/types';
import { Button, Choice, DateField, Field, Footer, Screen, Section, T } from '@/ui/components';
import { dmyToIso, isoToDmy } from '@/domain/format';
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


export default function CalendarEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<Form>(EMPTY);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!id) return;
    getCalendarEntry(db, id).then((c) => {
      if (!c) return;
      setF(c);
      setStart(isoToDmy(c.start_date));
      setEnd(isoToDmy(c.end_date));
    });
  }, [db, id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.name.trim()) return Alert.alert('Add a name');
    const start_date = start ? dmyToIso(start) : null;
    const end_date = end ? dmyToIso(end) : null;
    if ((start && !start_date) || (end && !end_date)) return Alert.alert('Check the dates', 'Use dd/mm/yyyy, for example 04/12/2026.');
    await saveCalendarEntry(db, { ...f, start_date, end_date, status: start_date ? 'confirmed' : 'tbc', id });
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
            <DateField label="Starts" value={start} onChangeText={setStart} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="Ends" value={end} onChangeText={setEnd} />
          </View>
        </View>
        {!start ? (
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
