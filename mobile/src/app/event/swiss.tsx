import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { createSwissRound, eventRankings, listVenues } from '@/db/repo';
import { dmyToIso } from '@/domain/format';
import { Button, Card, Choice, DateField, Field, Screen, Section, T } from '@/ui/components';
import { GameCard } from '@/ui/game-bits';
import { space } from '@/ui/theme';

export default function Swiss() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ ...(await eventRankings(d, eventId)), venues: await listVenues(d) }), [eventId]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [fields, setFields] = useState<string[]>([]);

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { teams, games, standings, venues } = bundle;
  const swiss = games.filter((g) => g.stage === 'swiss');
  const rounds = Array.from(new Set(swiss.map((g) => g.round ?? 0))).sort((a, b) => a - b);
  const next = (rounds[rounds.length - 1] ?? 0) + 1;
  const left = swiss.filter((g) => g.status !== 'final').length;
  const sorted = [...standings].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.diff - a.diff || b.pointsFor - a.pointsFor);
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? '';

  async function pair() {
    let scheduledAt: string | null = null;
    if (date) {
      const iso = dmyToIso(date);
      if (!iso || !/^\d{1,2}:\d{2}$/.test(time)) return Alert.alert('Check the date and time', 'Use dd/mm/yyyy and HH:MM.');
      const [hh, mm] = time.split(':').map(Number);
      const d = new Date(`${iso}T00:00:00`);
      d.setHours(hh, mm, 0, 0);
      scheduledAt = d.toISOString();
    }
    try {
      const r = await createSwissRound(db, eventId, { scheduledAt, venueIds: fields });
      Alert.alert(`Round ${r.round} paired`, `${r.games} games${r.bye ? ` · bye: ${name(r.bye)}` : ''}.`);
    } catch (e) {
      Alert.alert('Not yet', (e as Error).message);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Swiss draw' }} />
      <Screen edges={[]}>
        <T v="small">
          Each round pairs teams with similar records who haven’t played each other yet. Pair one round at a time, after the previous round’s results are in. Odd numbers get a bye, never twice for the
          same team if it can be avoided.
        </T>
        <Card>
          <T v="title">Round {next}</T>
          {left ? (
            <T v="small">
              Round {next - 1} has {left} game{left > 1 ? 's' : ''} still to finish.
            </T>
          ) : (
            <T v="small">{teams.length} teams ready to pair.</T>
          )}
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1.4 }}>
              <DateField label="Date (optional)" value={date} onChangeText={setDate} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Time" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {venues.map((v) => (
              <Choice
                key={v.id}
                label={v.name}
                selected={fields.includes(v.id)}
                onPress={() => setFields(fields.includes(v.id) ? fields.filter((x) => x !== v.id) : [...fields, v.id])}
                style={{ minHeight: 40, paddingHorizontal: 12 }}
              />
            ))}
          </View>
          <Button label={`Pair round ${next}`} icon="shuffle-variant" kind="primary" big onPress={pair} disabled={left > 0 || teams.length < 2} />
        </Card>

        <Section title="Standings">
          <Card>
            {sorted.map((s, i) => (
              <View key={s.teamId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <T>
                  {i + 1}. {name(s.teamId)}
                </T>
                <T v="bodyStrong">
                  {s.wins}–{s.losses} · {s.diff >= 0 ? '+' : ''}
                  {s.diff}
                </T>
              </View>
            ))}
          </Card>
        </Section>

        {[...rounds].reverse().map((r) => (
          <Section key={r} title={`Round ${r}`}>
            {swiss
              .filter((g) => g.round === r)
              .map((g) => (
                <GameCard key={g.id} g={g} />
              ))}
          </Section>
        ))}
      </Screen>
    </>
  );
}
