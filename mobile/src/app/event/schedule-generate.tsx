import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { createFixtures, eventTeams, getEvent, listVenues } from '@/db/repo';
import { assignSlots, roundRobin, type Slot } from '@/domain/fixtures';
import { dmyToIso, shortDate, timeOfDay } from '@/domain/format';
import { rulesFor } from '@/domain/rules';
import { Button, Card, Choice, DateField, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { space } from '@/ui/theme';

export default function ScheduleGenerate() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => ({ event: await getEvent(d, eventId), teams: await eventTeams(d, eventId), venues: await listVenues(d) }),
    [eventId],
  );
  const [excluded, setExcluded] = useState<string[]>([]);
  const [firstDate, setFirstDate] = useState('');
  const [every, setEvery] = useState('7');
  const [times, setTimes] = useState('18:00, 19:30');
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [cycles, setCycles] = useState<'1' | '2'>('1');
  const [byPool, setByPool] = useState(true);

  const teams = useMemo(() => (bundle?.teams ?? []).filter((t) => !excluded.includes(t.id)), [bundle, excluded]);
  const pools = Array.from(new Set(teams.map((t) => t.pool ?? '')));
  const usePools = byPool && pools.length > 1;

  const startIso = dmyToIso(firstDate);
  const timeList = times
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  // Slots fill field by field at each kick-off time: 18:00 P1, 18:00 P2, 19:30 P1, 19:30 P2 …
  const slots: Slot[] = timeList.flatMap((time) => (fieldIds.length ? fieldIds : [null]).map((venueId) => ({ venueId, time })));

  const fixtures = useMemo(() => {
    if (!startIso) return [];
    const groups = usePools ? pools.map((p) => teams.filter((t) => (t.pool ?? '') === p)) : [teams];
    // Pools share the same match days, so merge their rounds before handing out slots.
    const pairings = groups.flatMap((g) => roundRobin(g.map((t) => t.id), Number(cycles)));
    return assignSlots(pairings, startIso, Math.max(1, Number(every) || 7), slots);
  }, [startIso, usePools, pools, teams, cycles, every, slots]);

  if (!bundle?.event) return <Screen edges={[]}>{null}</Screen>;
  const { event, venues } = bundle;
  const name = (id: string) => bundle.teams.find((t) => t.id === id)?.name ?? '';
  const venueName = (id: string | null) => venues.find((v) => v.id === id)?.name ?? 'Field TBC';
  const rounds = new Set(fixtures.map((f) => f.round)).size;

  async function create() {
    if (!startIso) return Alert.alert('Add the first match day', 'Use dd/mm/yyyy.');
    if (!timeList.length) return Alert.alert('Add at least one kick-off time', 'For example 18:00, 19:30');
    if (!fixtures.length) return Alert.alert('Not enough teams');
    const rules = rulesFor(event!.kind === 'league' ? 'league' : 'wfdf', event!.division);
    await createFixtures(
      db,
      fixtures.map((f) => ({ eventId, homeId: f.homeId, awayId: f.awayId, scheduledAt: f.scheduledAt, venueId: f.venueId, rules })),
    );
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Generate round robin' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={fixtures.length ? `Create ${fixtures.length} games over ${rounds} rounds` : 'Create games'} kind="primary" big onPress={create} disabled={!fixtures.length} />
          </Footer>
        }>
        <T v="small">Every team plays every other team. Home and away alternate so each team sets up the field about half the time.</T>
        <Section title={`Teams · ${teams.length}`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {bundle.teams.map((t) => (
              <Choice
                key={t.id}
                label={t.pool ? `${t.name} (${t.pool})` : t.name}
                selected={!excluded.includes(t.id)}
                onPress={() => setExcluded(excluded.includes(t.id) ? excluded.filter((x) => x !== t.id) : [...excluded, t.id])}
                style={{ paddingHorizontal: 14 }}
              />
            ))}
          </View>
          {pools.length > 1 ? <Choice label="Only play within pools" selected={byPool} onPress={() => setByPool(!byPool)} /> : null}
        </Section>
        <Section title="How many times do teams meet?">
          <Segmented
            value={cycles}
            onChange={setCycles}
            options={[
              { value: '1', label: 'Once' },
              { value: '2', label: 'Twice (home & away)' },
            ]}
          />
        </Section>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1.3 }}>
            <DateField label="First match day" value={firstDate} onChangeText={setFirstDate} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Days between" value={every} onChangeText={(v) => setEvery(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
        </View>
        <Field label="Kick-off times" value={times} onChangeText={setTimes} placeholder="18:00, 19:30" hint="Separate with commas. Each time is used on every field you pick." />
        <Section title="Fields">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {venues.map((v) => (
              <Choice
                key={v.id}
                label={v.name}
                selected={fieldIds.includes(v.id)}
                onPress={() => setFieldIds(fieldIds.includes(v.id) ? fieldIds.filter((x) => x !== v.id) : [...fieldIds, v.id])}
                style={{ paddingHorizontal: 14 }}
              />
            ))}
          </View>
          <T v="small">
            {slots.length
              ? `${slots.length} game slot${slots.length > 1 ? 's' : ''} per match day. Extra games roll onto the next day.`
              : 'Pick fields and times to see slots.'}
          </T>
        </Section>
        {fixtures.length ? (
          <Section title="Preview · first two rounds">
            {fixtures
              .filter((f) => f.round <= 2)
              .map((f, i) => (
                <Card key={i}>
                  <T v="small">
                    Round {f.round} · {shortDate(f.scheduledAt)} {timeOfDay(f.scheduledAt)} · {venueName(f.venueId)}
                  </T>
                  <T v="bodyStrong">
                    {name(f.homeId)} <T v="small">(home)</T> v {name(f.awayId)}
                  </T>
                </Card>
              ))}
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
