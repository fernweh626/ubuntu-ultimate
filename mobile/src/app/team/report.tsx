import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, peopleById, playerTotals, teamAggregate } from '@/db/reports';
import { getTeam, listGamesForTeam } from '@/db/repo';
import { displayName, pct, round1, shortName } from '@/domain/format';
import { Button, Card, Choice, EmptyState, Screen, Section, StatTile, T } from '@/ui/components';
import { FormDots, GameCard } from '@/ui/game-bits';
import { PlayerTable } from '@/ui/player-table';
import { ShareCardSheet, type ShareCardData } from '@/ui/share-card';
import { space } from '@/ui/theme';

export default function TeamReport() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId?: string }>();
  const [filter, setFilter] = useState<string>(eventId ?? 'all');
  const [share, setShare] = useState<ShareCardData | null>(null);

  const team = useData((d) => getTeam(d, id), [id]);
  const loaded = useData(async (d) => {
    const games = await loadFinishedGames(d, await listGamesForTeam(d, id));
    const ids = new Set<string>();
    games.forEach((g) => Object.keys(g.stats.players).forEach((p) => ids.add(p)));
    return { games, people: await peopleById(d, [...ids]) };
  }, [id]);

  if (!team || !loaded) return <Screen edges={[]}>{null}</Screen>;

  const events = Array.from(new Map(loaded.games.filter((g) => g.item.event_id).map((g) => [g.item.event_id!, g.item.event_name ?? 'Event'])).entries());
  const games = loaded.games.filter((g) => filter === 'all' || g.item.event_id === filter);
  const agg = teamAggregate(id, games);
  const totals = [...playerTotals(games, id).values()];
  const top = (k: 'goals' | 'assists' | 'intercepts') => [...totals].sort((a, b) => b[k] - a[k])[0];
  const scopeLabel = filter === 'all' ? 'All games' : events.find(([eid]) => eid === filter)?.[1] ?? 'Event';

  function openShare() {
    const g = top('goals');
    const a = top('assists');
    setShare({
      kicker: scopeLabel,
      title: `${team!.name} — ${agg.wins}W ${agg.losses}L`,
      stats: [
        { label: 'Hold rate', value: pct(agg.holds, agg.oPoints) },
        { label: 'Break rate', value: pct(agg.breaks, agg.dPoints) },
        { label: 'Point diff', value: `${agg.pointsFor - agg.pointsAgainst >= 0 ? '+' : ''}${agg.pointsFor - agg.pointsAgainst}` },
        { label: 'Clean holds', value: String(agg.cleanHolds) },
        { label: 'Intercepts', value: String(agg.intercepts) },
        { label: 'Games', value: String(agg.games) },
      ],
      highlights: [
        g && g.goals ? `Top scorer: ${shortName(loaded!.people.get(g.personId)!)} · ${g.goals}` : null,
        a && a.assists ? `Top assists: ${shortName(loaded!.people.get(a.personId)!)} · ${a.assists}` : null,
      ].filter(Boolean) as string[],
      footer: new Date().toLocaleDateString(),
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: `${team.name} report` }} />
      <Screen edges={[]}>
        {events.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Choice label="All games" selected={filter === 'all'} onPress={() => setFilter('all')} style={{ minHeight: 40, paddingHorizontal: 14 }} />
            {events.map(([eid, name]) => (
              <Choice key={eid} label={name} selected={filter === eid} onPress={() => setFilter(eid)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
            ))}
          </ScrollView>
        ) : null}

        {agg.games === 0 ? (
          <EmptyState icon="chart-box-outline" title="No finished games" body="Finish a scored game to see this report." />
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <T v="label">Record</T>
                  <T v="heading">
                    {agg.wins}–{agg.losses}
                    {agg.draws ? `–${agg.draws}` : ''}
                  </T>
                </View>
                <FormDots form={agg.form} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <StatTile value={agg.games} label="Games" />
                <StatTile value={`${agg.pointsFor}–${agg.pointsAgainst}`} label="Points" />
                <StatTile value={`${agg.pointsFor - agg.pointsAgainst >= 0 ? '+' : ''}${agg.pointsFor - agg.pointsAgainst}`} label="Diff" />
              </View>
            </Card>
            <Section title="Offence and defence">
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <StatTile value={pct(agg.holds, agg.oPoints)} label="Hold rate" tone="brand" />
                <StatTile value={pct(agg.cleanHolds, agg.oPoints)} label="Clean holds" />
                <StatTile value={pct(agg.breaks, agg.dPoints)} label="Break rate" tone="brand" />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <StatTile value={agg.pointsPlayed ? round1(agg.turnovers / agg.pointsPlayed) : '–'} label="Turns / point" />
                <StatTile value={round1(agg.intercepts / agg.games)} label="Intercepts / game" />
                <StatTile value={`${agg.holds}/${agg.oPoints}`} label="O points held" />
              </View>
            </Section>
            <Section title="Leaders">
              <Card>
                {(['goals', 'assists', 'intercepts'] as const).map((k) => {
                  const p = top(k);
                  return (
                    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <T v="small">{k === 'goals' ? 'Goals' : k === 'assists' ? 'Assists' : 'Intercepts'}</T>
                      <T v="bodyStrong">{p && p[k] ? `${displayName(loaded.people.get(p.personId)!)} · ${p[k]}` : '–'}</T>
                    </View>
                  );
                })}
              </Card>
            </Section>
            <Section title="Players">
              <PlayerTable rows={totals} people={loaded.people} extra={(s) => `${(s as { games?: number }).games ?? 0} games`} />
            </Section>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Share card" icon="share-variant" kind="primary" onPress={openShare} style={{ flex: 1 }} />
              <Button label="Full report" icon="file-document-multiple-outline" onPress={() => router.push({ pathname: '/report', params: { kind: 'team', teamId: id, ...(eventId ? { eventId } : {}) } })} style={{ flex: 1 }} />
            </View>
            <Section title="Games">
              {games.map((g) => (
                <GameCard key={g.item.id} g={g.item} />
              ))}
            </Section>
          </>
        )}
      </Screen>
      <ShareCardSheet visible={!!share} data={share} onClose={() => setShare(null)} />
    </>
  );
}
