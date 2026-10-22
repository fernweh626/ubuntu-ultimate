import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, playerTotals } from '@/db/reports';
import { getPerson, joinTeam, leaveTeam, listGamesForPerson, listTeams, personHistory } from '@/db/repo';
import { displayName, initials, shortDate } from '@/domain/format';
import { Button, Card, Chip, Choice, IconButton, Screen, Section, Segmented, Sheet, StatTile, T, TeamSwatch } from '@/ui/components';
import { ShareCardSheet, type ShareCardData } from '@/ui/share-card';
import { colors, font, space } from '@/ui/theme';

const POS = { handler: 'Handler', cutter: 'Cutter', hybrid: 'Hybrid' } as const;
const KIND = { core: 'Core', guest: 'Guest', mercenary: 'Mercenary' } as const;

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const person = useData((d) => getPerson(d, id), [id]);
  const history = useData((d) => personHistory(d, id), [id]) ?? [];
  const teams = useData(listTeams) ?? [];
  const career = useData(async (d) => loadFinishedGames(d, await listGamesForPerson(d, id)), [id]);
  const [joining, setJoining] = useState(false);
  const [joinKind, setJoinKind] = useState<'core' | 'guest' | 'mercenary'>('mercenary');
  const [share, setShare] = useState<ShareCardData | null>(null);

  if (!person) return <Screen edges={[]}>{null}</Screen>;
  const name = displayName(person);
  const total = career ? playerTotals(career).get(id) : undefined;
  const byTeam = new Map<string, { name: string; games: number; goals: number; assists: number; intercepts: number }>();
  for (const g of career ?? []) {
    const s = g.stats.players[id];
    if (!s) continue;
    const teamName = s.teamId === g.item.team_a_id ? g.item.a_name : g.item.b_name;
    const row = byTeam.get(s.teamId) ?? { name: teamName, games: 0, goals: 0, assists: 0, intercepts: 0 };
    row.games += 1;
    row.goals += s.goals;
    row.assists += s.assists;
    row.intercepts += s.intercepts;
    byTeam.set(s.teamId, row);
  }
  const current = history.filter((h) => !h.end_date);
  const past = history.filter((h) => h.end_date);

  function openShare() {
    const last = career?.[0];
    const s = last?.stats.players[id];
    if (!last || !s) return;
    const mine = s.teamId;
    const theirs = mine === last.item.team_a_id ? last.item.team_b_id : last.item.team_a_id;
    setShare({
      kicker: `${last.item.event_name ?? 'Game'} · ${shortDate(last.item.started_at)}`,
      title: `${name}'s game`,
      left: { name: mine === last.item.team_a_id ? last.item.a_name : last.item.b_name, color: mine === last.item.team_a_id ? last.item.a_color : last.item.b_color, score: last.stats.teams[mine].score },
      right: { name: theirs === last.item.team_a_id ? last.item.a_name : last.item.b_name, color: theirs === last.item.team_a_id ? last.item.a_color : last.item.b_color, score: last.stats.teams[theirs].score },
      stats: [
        { label: 'Goals', value: String(s.goals) },
        { label: 'Assists', value: String(s.assists) },
        { label: 'Intercepts', value: String(s.intercepts) },
        { label: 'Points played', value: String(s.points) },
        { label: 'Turnovers', value: String(s.drops + s.throwaways + s.stalls) },
        { label: '+/−', value: `${s.plusMinus >= 0 ? '+' : ''}${s.plusMinus}` },
      ],
      highlights: s.callahans ? [`Callahan! ${s.callahans > 1 ? `×${s.callahans}` : ''}`.trim()] : [],
      footer: 'My game',
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => <IconButton icon="pencil" label="Edit player" onPress={() => router.push({ pathname: '/player/edit', params: { id } })} />,
        }}
      />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ fontFamily: font.bold, fontSize: 26, color: colors.brandDark }}>{initials(name)}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T v="heading">{name}</T>
            <T v="small">
              {[person.preferred_number ? `#${person.preferred_number}` : null, person.position ? POS[person.position] : null, person.nickname ? `“${person.nickname}”` : null]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
        </View>

        <Section title="Career · all teams">
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <StatTile value={total?.games ?? 0} label="Games" />
            <StatTile value={total?.goals ?? 0} label="Goals" />
            <StatTile value={total?.assists ?? 0} label="Assists" />
            <StatTile value={total?.intercepts ?? 0} label="Intercepts" />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <StatTile value={total?.points ?? 0} label="Points" />
            <StatTile value={total ? `${total.plusMinus >= 0 ? '+' : ''}${total.plusMinus}` : 0} label="+/−" />
            <StatTile value={total ? total.drops + total.throwaways + total.stalls : 0} label="Turnovers" />
            <StatTile value={total?.callahans ?? 0} label="Callahans" />
          </View>
          {career && career.length ? <Button label="Share my last game" icon="share-variant" kind="primary" onPress={openShare} /> : null}
        </Section>

        <Section title="Teams" action={<Button label="Join a team" icon="plus" kind="ghost" onPress={() => setJoining(true)} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
          {current.length === 0 && past.length === 0 ? <T v="small">Not on any team yet.</T> : null}
          {[...current, ...past].map((h) => (
            <Card key={h.id} onPress={() => router.push(`/team/${h.team_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <TeamSwatch color={h.primary_color} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{h.team_name}</T>
                <T v="small">
                  {h.start_date ? `Since ${shortDate(h.start_date)}` : ''}
                  {h.end_date ? ` – ${shortDate(h.end_date)}` : ''}
                  {byTeam.get(h.team_id) ? ` · ${byTeam.get(h.team_id)!.games} games, ${byTeam.get(h.team_id)!.goals}G ${byTeam.get(h.team_id)!.assists}A` : ''}
                </T>
              </View>
              <Chip label={h.end_date ? 'Former' : KIND[h.kind]} tone={h.end_date ? 'neutral' : h.kind === 'core' ? 'brand' : 'warn'} />
            </Card>
          ))}
          {current.map((h) => (
            <Button
              key={`leave-${h.id}`}
              label={`Leave ${h.team_name}`}
              kind="ghost"
              icon="logout"
              onPress={() =>
                Alert.alert(`Leave ${h.team_name}?`, 'Their history with the team is kept.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => leaveTeam(db, h.id) },
                ])
              }
            />
          ))}
        </Section>

        <Section title="Recent games">
          {(career ?? []).slice(0, 8).map((g) => {
            const s = g.stats.players[id];
            return (
              <Card key={g.item.id} onPress={() => router.push(`/game/${g.item.id}/report`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {g.item.a_name} {g.item.score_a}–{g.item.score_b} {g.item.b_name}
                  </T>
                </View>
                <T v="small">
                  {shortDate(g.item.started_at)} · {s ? `${s.points} pts · ${s.goals}G ${s.assists}A ${s.intercepts}I` : 'Did not play a point'}
                </T>
              </Card>
            );
          })}
          {career && career.length === 0 ? <T v="small">No finished games yet.</T> : null}
        </Section>
      </Screen>

      <Sheet visible={joining} onClose={() => setJoining(false)} title="Join a team">
        <Segmented
          value={joinKind}
          onChange={setJoinKind}
          options={[
            { value: 'core', label: 'Core' },
            { value: 'guest', label: 'Guest' },
            { value: 'mercenary', label: 'Mercenary' },
          ]}
        />
        <T v="small">Mercenary: playing for this team at one tournament. Guest: filling in for a game or two.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {teams
            .filter((t) => !current.some((h) => h.team_id === t.id))
            .map((t) => (
              <Choice
                key={t.id}
                label={t.name}
                dot={t.primary_color ?? undefined}
                onPress={async () => {
                  await joinTeam(db, id, t.id, joinKind, person.preferred_number);
                  setJoining(false);
                }}
                style={{ paddingHorizontal: 14 }}
              />
            ))}
        </View>
      </Sheet>
      <ShareCardSheet visible={!!share} data={share} onClose={() => setShare(null)} />
    </>
  );
}
