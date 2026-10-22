import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, peopleById, playerTotals, teamAggregate } from '@/db/reports';
import { eventTeams, getEvent, listGamesForEvent, spiritForEvent } from '@/db/repo';
import { dateRange, displayName, pct, round1, shortName } from '@/domain/format';
import { rankStandings, type TeamAggregate } from '@/domain/stats';
import { Button, Card, Choice, EmptyState, IconButton, Screen, Section, T, TeamSwatch } from '@/ui/components';
import { FollowButton } from '@/ui/follow-button';
import { FormDots, GameCard } from '@/ui/game-bits';
import { PlayerTable } from '@/ui/player-table';
import { ShareCardSheet, type ShareCardData } from '@/ui/share-card';
import { colors, font, space } from '@/ui/theme';

type Tab = 'standings' | 'games' | 'leaders' | 'teams' | 'spirit';

export default function EventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('standings');
  const [share, setShare] = useState<ShareCardData | null>(null);
  const bundle = useData(
    async (d) => {
      const event = await getEvent(d, id);
      if (!event) return null;
      const [teams, games, spirit] = await Promise.all([eventTeams(d, id), listGamesForEvent(d, id), spiritForEvent(d, id)]);
      const loaded = await loadFinishedGames(d, games);
      const ids = new Set<string>();
      loaded.forEach((g) => Object.keys(g.stats.players).forEach((p) => ids.add(p)));
      return { event, teams, games, loaded, spirit, people: await peopleById(d, [...ids]) };
    },
    [id],
  );

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { event, teams, games, loaded, spirit, people } = bundle;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const aggs = teams.map((t) => teamAggregate(t.id, loaded.filter((g) => g.item.team_a_id === t.id || g.item.team_b_id === t.id)));
  const pools = Array.from(new Set(teams.map((t) => t.pool ?? ''))).sort();
  const totals = [...playerTotals(loaded).values()];
  const leaders = (k: 'goals' | 'assists' | 'intercepts' | 'plusMinus') => [...totals].sort((a, b) => b[k] - a[k]).filter((p) => p[k] > 0).slice(0, 5);
  const spiritByTeam = teams
    .map((t) => {
      const got = spirit.filter((s) => s.to_team_id === t.id);
      const sum = got.reduce((acc, s) => acc + s.rules + s.fouls + s.fairness + s.attitude + s.communication, 0);
      return { team: t, games: got.length, avg: got.length ? sum / got.length : null };
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  function openShare() {
    const ranked = rankStandings(aggs);
    const topScorer = leaders('goals')[0];
    const topAssist = leaders('assists')[0];
    setShare({
      kicker: [event.kind === 'league' ? 'League' : 'Tournament', dateRange(event.start_date, event.end_date)].filter(Boolean).join(' · '),
      title: event.name,
      stats: ranked.slice(0, 3).map((a, i) => ({ label: `${i + 1}. ${teamById.get(a.teamId)?.name ?? ''}`, value: `${a.wins}–${a.losses}` })),
      highlights: [
        topScorer ? `Top scorer: ${shortName(people.get(topScorer.personId)!)} · ${topScorer.goals}` : null,
        topAssist ? `Top assists: ${shortName(people.get(topAssist.personId)!)} · ${topAssist.assists}` : null,
        spiritByTeam[0]?.avg != null ? `Spirit leaders: ${spiritByTeam[0].team.name} · ${round1(spiritByTeam[0].avg!)}` : null,
      ].filter(Boolean) as string[],
      footer: `${loaded.length} games`,
    });
  }

  const standingsTable = (rows: TeamAggregate[]) => (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: space.md, minHeight: 36, alignItems: 'center', backgroundColor: colors.neutralTint }}>
        <T v="label" style={{ width: 22 }}>
          #
        </T>
        <T v="label" style={{ flex: 1 }}>
          Team
        </T>
        <T v="label" style={{ width: 64 }}>
          Form
        </T>
        <T v="label" style={{ width: 44, textAlign: 'center' }}>
          W–L
        </T>
        <T v="label" style={{ width: 40, textAlign: 'right' }}>
          +/−
        </T>
      </View>
      {rankStandings(rows).map((a, i) => {
        const t = teamById.get(a.teamId)!;
        const diff = a.pointsFor - a.pointsAgainst;
        return (
          <Pressable
            key={a.teamId}
            onPress={() => router.push({ pathname: '/team/report', params: { id: a.teamId, eventId: id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: pressed ? colors.neutralTint : colors.surface })}>
            <T v="bodyStrong" style={{ width: 22 }}>
              {i + 1}
            </T>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <TeamSwatch color={t.primary_color} size="sm" />
              <T v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                {t.name}
              </T>
            </View>
            <View style={{ width: 64 }}>
              <FormDots form={a.form} />
            </View>
            <T style={{ width: 44, textAlign: 'center', fontFamily: font.semibold }}>
              {a.wins}–{a.losses}
            </T>
            <T style={{ width: 40, textAlign: 'right', fontFamily: font.semibold }}>{`${diff > 0 ? '+' : ''}${diff}`}</T>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => <IconButton icon="pencil" label="Edit event" onPress={() => router.push({ pathname: '/event/edit', params: { id } })} />,
        }}
      />
      <Screen edges={[]}>
        <View>
          <T v="heading">{event.name}</T>
          <T v="small">{[dateRange(event.start_date, event.end_date), event.location, `${teams.length} teams`, event.division].filter(Boolean).join(' · ')}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Score a game" icon="whistle" kind="primary" onPress={() => router.push({ pathname: '/game/new', params: { eventId: id } })} style={{ flex: 1.4 }} />
          <Button label="Share" icon="share-variant" onPress={openShare} style={{ flex: 1 }} />
          <FollowButton kind="event" id={id} />
        </View>
        {event.video_url || event.photos_url ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {event.video_url ? <Button label="Video" icon="youtube" onPress={() => Linking.openURL(event.video_url!)} style={{ flex: 1 }} /> : null}
            {event.photos_url ? <Button label="Photos" icon="image-multiple-outline" onPress={() => Linking.openURL(event.photos_url!)} style={{ flex: 1 }} /> : null}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {(
            [
              ['standings', 'Standings'],
              ['games', `Games (${games.length})`],
              ['leaders', 'Leaders'],
              ['teams', 'Team stats'],
              ['spirit', 'Spirit'],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <Choice key={k} label={l} selected={tab === k} onPress={() => setTab(k)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          ))}
        </ScrollView>

        {teams.length === 0 ? (
          <EmptyState icon="account-group-outline" title="No teams yet" action={<Button label="Add teams" onPress={() => router.push({ pathname: '/event/edit', params: { id } })} />} />
        ) : null}

        {tab === 'standings' && teams.length ? (
          pools.length > 1 || pools[0] ? (
            pools.map((p) => (
              <Section key={p} title={p ? `Pool ${p}` : 'No pool'}>
                {standingsTable(aggs.filter((a) => (teamById.get(a.teamId)?.pool ?? '') === p))}
              </Section>
            ))
          ) : (
            standingsTable(aggs)
          )
        ) : null}
        {tab === 'standings' && teams.length ? <T v="small">Ranked by wins, then point difference, then points scored. Tap a team for its tournament report.</T> : null}

        {tab === 'games' ? (games.length ? games.map((g) => <GameCard key={g.id} g={g} />) : <EmptyState icon="whistle" title="No games yet" body="Tap “Score a game” to start one in this event." />) : null}

        {tab === 'leaders' ? (
          <>
            {(
              [
                ['goals', 'Goals'],
                ['assists', 'Assists'],
                ['intercepts', 'Intercepts'],
                ['plusMinus', '+/−'],
              ] as const
            ).map(([k, l]) => (
              <Section key={k} title={l}>
                <Card>
                  {leaders(k).length ? (
                    leaders(k).map((p, i) => (
                      <Pressable key={p.personId} onPress={() => router.push(`/player/${p.personId}`)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                        <T>
                          {i + 1}. {displayName(people.get(p.personId)!)} <T v="small">· {teamById.get(p.teamId)?.short_name ?? teamById.get(p.teamId)?.name ?? ''}</T>
                        </T>
                        <T v="bodyStrong">{p[k]}</T>
                      </Pressable>
                    ))
                  ) : (
                    <T v="small">Nothing recorded yet.</T>
                  )}
                </Card>
              </Section>
            ))}
            <Section title="All players">
              <PlayerTable rows={totals} people={people} extra={(s) => teamById.get(s.teamId)?.name ?? null} />
            </Section>
          </>
        ) : null}

        {tab === 'teams' ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', paddingHorizontal: space.md, minHeight: 36, alignItems: 'center', backgroundColor: colors.neutralTint }}>
              <T v="label" style={{ flex: 1 }}>
                Team
              </T>
              {['Hold', 'Break', 'Clean', 'TO/pt'].map((h) => (
                <T key={h} v="label" style={{ width: 52, textAlign: 'center' }}>
                  {h}
                </T>
              ))}
            </View>
            {aggs.map((a) => (
              <Pressable
                key={a.teamId}
                onPress={() => router.push({ pathname: '/team/report', params: { id: a.teamId, eventId: id } })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <T v="smallStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {teamById.get(a.teamId)?.name}
                </T>
                <T style={{ width: 52, textAlign: 'center' }}>{pct(a.holds, a.oPoints)}</T>
                <T style={{ width: 52, textAlign: 'center' }}>{pct(a.breaks, a.dPoints)}</T>
                <T style={{ width: 52, textAlign: 'center' }}>{pct(a.cleanHolds, a.oPoints)}</T>
                <T style={{ width: 52, textAlign: 'center' }}>{a.pointsPlayed ? round1(a.turnovers / a.pointsPlayed) : '–'}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {tab === 'spirit' ? (
          <Card>
            {spiritByTeam.map((s, i) => (
              <View key={s.team.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <T>
                  {i + 1}. {s.team.name} <T v="small">· {s.games} scored</T>
                </T>
                <T v="bodyStrong">{s.avg != null ? round1(s.avg) : '–'}</T>
              </View>
            ))}
            <T v="small">Average spirit received, out of 20.</T>
          </Card>
        ) : null}
      </Screen>
      <ShareCardSheet visible={!!share} data={share} onClose={() => setShare(null)} />
    </>
  );
}
