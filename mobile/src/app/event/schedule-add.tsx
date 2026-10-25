import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { createFixtures, eventTeams, getEvent } from '@/db/repo';
import { dmyToIso } from '@/domain/format';
import { rulesFor } from '@/domain/rules';
import { Button, Choice, DateField, Field, Footer, Screen, Section, T } from '@/ui/components';
import { FieldPicker } from '@/ui/field-picker';
import { space } from '@/ui/theme';

export default function ScheduleAdd() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ event: await getEvent(d, eventId), teams: await eventTeams(d, eventId) }), [eventId]);
  const [home, setHome] = useState<string | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [another, setAnother] = useState(0);

  if (!bundle?.event) return <Screen edges={[]}>{null}</Screen>;
  const { event, teams } = bundle;

  async function save(more: boolean) {
    if (!home || !away) return Alert.alert('Pick the home and away teams');
    let scheduledAt: string | null = null;
    if (date) {
      const iso = dmyToIso(date);
      if (!iso || !/^\d{1,2}:\d{2}$/.test(time)) return Alert.alert('Check the date and time', 'Use dd/mm/yyyy and HH:MM.');
      const [hh, mm] = time.split(':').map(Number);
      const d = new Date(`${iso}T00:00:00`);
      d.setHours(hh, mm, 0, 0);
      scheduledAt = d.toISOString();
    }
    await createFixtures(db, [{ eventId, homeId: home, awayId: away, scheduledAt, venueId, rules: rulesFor(event!.kind === 'league' ? 'league' : 'wfdf', event!.division) }]);
    if (more) {
      setHome(null);
      setAway(null);
      setAnother((n) => n + 1);
    } else router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Add a game' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Save & add another" onPress={() => save(true)} style={{ flex: 1 }} />
              <Button label="Save" kind="primary" onPress={() => save(false)} style={{ flex: 1 }} />
            </View>
          </Footer>
        }>
        {another ? <T v="small">{another} added. Date, time and field are kept for the next one.</T> : null}
        {teams.length < 2 ? <T>Add teams to {event.name} first (edit the event).</T> : null}
        <Section title="Home — sets up the field">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {teams.map((t) => (
              <Choice key={t.id} label={t.name} dot={t.primary_color ?? undefined} selected={home === t.id} onPress={() => setHome(t.id)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Section title="Away">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {teams
              .filter((t) => t.id !== home)
              .map((t) => (
                <Choice key={t.id} label={t.name} dot={t.primary_color ?? undefined} selected={away === t.id} onPress={() => setAway(t.id)} style={{ paddingHorizontal: 14 }} />
              ))}
          </View>
        </Section>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1.4 }}>
            <DateField label="Date (blank = TBC)" value={date} onChangeText={setDate} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholder="18:00" />
          </View>
        </View>
        <Section title="Field">
          <FieldPicker value={venueId} onChange={setVenueId} />
        </Section>
      </Screen>
    </>
  );
}
