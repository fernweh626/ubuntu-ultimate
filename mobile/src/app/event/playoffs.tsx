import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { bracketSlots, createBracket, deleteBracket, eventRankings, fillBracketNow } from '@/db/repo';
import { BRACKETS } from '@/domain/formats';
import { BracketView } from '@/ui/bracket';
import { Button, Card, Choice, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function Playoffs() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ ...(await eventRankings(d, eventId)), slots: await bracketSlots(d, eventId) }), [eventId]);
  const [choice, setChoice] = useState<string | null>(null);

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { teams, games, slots } = bundle;
  const pools = Array.from(new Set(teams.map((t) => t.pool).filter(Boolean)));
  const openPoolGames = games.filter((g) => g.stage !== 'playoff' && g.status !== 'final').length;

  async function create() {
    const t = BRACKETS.find((b) => b.id === choice);
    if (!t) return;
    if (t.id === 'crossover2' && !(pools.includes('A') && pools.includes('B'))) {
      return Alert.alert('Needs pools A and B', 'Edit the event, turn pools on and put teams in pools A and B.');
    }
    const minTeams = t.id === 'top8' ? 8 : 4;
    if (t.id !== 'crossover2' && teams.length < minTeams) return Alert.alert(`Needs at least ${minTeams} teams`);
    const made = await createBracket(db, eventId, t);
    Alert.alert('Bracket created', made ? `${made} game${made > 1 ? 's are' : ' is'} ready to schedule now.` : 'Games appear as soon as the pool results decide who plays.');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Playoffs' }} />
      <Screen edges={[]}>
        {slots.length ? (
          <>
            <T v="small">Winners and losers move on automatically when each game ends. New playoff games start with “time TBC” — open one to set its time and field.</T>
            <BracketView
              slots={slots}
              games={games}
              teamName={(id) => teams.find((t) => t.id === id)?.name ?? ''}
              teamColor={(id) => teams.find((t) => t.id === id)?.primary_color ?? null}
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label="Check results"
                icon="refresh"
                onPress={async () => {
                  const n = await fillBracketNow(db, eventId);
                  Alert.alert(n ? `${n} new game${n > 1 ? 's' : ''} added` : 'Nothing new yet', n ? undefined : openPoolGames ? `${openPoolGames} pool game${openPoolGames > 1 ? 's' : ''} still to finish.` : undefined);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Remove bracket"
                icon="delete-outline"
                kind="danger"
                onPress={() =>
                  Alert.alert('Remove the playoff bracket?', 'Unplayed playoff games are removed too. Played ones stay.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => deleteBracket(db, eventId) },
                  ])
                }
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <>
            <T v="small">
              Pick a format. Seeds come from the standings of the round robin / Swiss / pool games
              {openPoolGames ? ` — ${openPoolGames} still to play, so first-round games appear once they’re done.` : '.'}
            </T>
            <Section title="Format">
              {BRACKETS.map((b) => (
                <Choice key={b.id} label={b.name} sublabel={b.summary} selected={choice === b.id} onPress={() => setChoice(b.id)} tall style={{ alignItems: 'flex-start' }} />
              ))}
            </Section>
            {choice ? (
              <Card style={{ backgroundColor: colors.brandTint, borderColor: colors.brandTint }}>
                <T v="small">Needs: {BRACKETS.find((b) => b.id === choice)!.needs}.</T>
              </Card>
            ) : null}
            <Button label="Create bracket" icon="tournament" kind="primary" big disabled={!choice} onPress={create} />
          </>
        )}
      </Screen>
    </>
  );
}
