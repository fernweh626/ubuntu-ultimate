import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share, View } from 'react-native';

import { WEB_URL } from '@/content/hub';
import { useData } from '@/db/live';
import { loadFinishedGames, playerTotals } from '@/db/reports';
import { getMeId, getPerson, joinOrRequest, leaveTeam, listGamesForPerson, listTeams, personHistory } from '@/db/repo';
import { displayName, shortDate } from '@/domain/format';
import { completionRates, perPoint } from '@/domain/advanced-stats';
import { playerSeasons } from '@/domain/player-seasons';
import { Button, Card, Chip, Choice, IconButton, Screen, Section, Segmented, Sheet, StatTile, T, TeamSwatch } from '@/ui/components';
import { FollowButton } from '@/ui/follow-button';
import { VideoLink } from '@/ui/game-bits';
import { TeamLink } from '@/ui/links';
import { ShareCardSheet, type ShareCardData } from '@/ui/share-card';
import { Avatar } from '@/ui/photo';
import { colors, space } from '@/ui/theme';

const POS = { handler: 'Handler', cutter: 'Cutter', hybrid: 'Hybrid' } as const;
const KIND = { core: 'Core', guest: 'Guest', mercenary: 'Mercenary' } as const;

const CHIP = { minHeight: 36, paddingHorizontal: 12 } as const;
const TYPE_LABEL: Record<string, string> = { league: 'League', tournament: 'Tournaments', hat: 'Hats', friendly: 'Friendlies & pickups' };

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const person = useData((d) => getPerson(d, id), [id]);
  const history = useData((d) => personHistory(d, id), [id]) ?? [];
  const teams = useData(listTeams) ?? [];
  const meId = useData(getMeId);
  const career = useData(async (d) => loadFinishedGames(d, await listGamesForPerson(d, id)), [id]);
  const [joining, setJoining] = useState(false);
  const [joinKind, setJoinKind] = useState<'core' | 'guest' | 'mercenary'>('mercenary');
  const [share, setShare] = useState<ShareCardData | null>(null);
  const [f, setF] = useState<{ year?: number | null; type?: string | null; comp?: string | null; team?: string | null }>({});
  const setFilter = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));

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
  // Stats report filters: season → type → league/tournament → team. Each only offers what's left.
  const mine = (career ?? []).filter((g) => g.stats.players[id]);
  type G = (typeof mine)[number];
  const yearOf = (g: G) => Number((g.item.started_at ?? g.item.scheduled_at ?? '').slice(0, 4)) || null;
  const typeOf = (g: G): string => (g.item.event_kind === 'league' || g.item.event_kind === 'tournament' || g.item.event_kind === 'hat' ? g.item.event_kind : 'friendly');
  const teamOf = (g: G) => (g.stats.players[id].teamId === g.item.team_a_id ? g.item.a_name : g.item.b_name);
  const years = [...new Set(mine.map(yearOf).filter((y): y is number => !!y))].sort((a, b) => b - a);
  const year = f.year === undefined ? (years[0] ?? null) : f.year;
  const inYear = mine.filter((g) => year === null || yearOf(g) === year);
  const types = [...new Set(inYear.map(typeOf))];
  const type = f.type && types.includes(f.type) ? f.type : null;
  const inType = inYear.filter((g) => !type || typeOf(g) === type);
  const comps = [...new Map(inType.filter((g) => g.item.event_id).map((g) => [g.item.event_id!, g.item.event_name ?? 'Event'])).entries()];
  const comp = f.comp && comps.some(([c]) => c === f.comp) ? f.comp : null;
  const inComp = inType.filter((g) => !comp || g.item.event_id === comp);
  const teamsPlayed = [...new Map(inComp.map((g) => [g.stats.players[id].teamId, teamOf(g)])).entries()];
  const team = f.team && teamsPlayed.some(([t]) => t === f.team) ? f.team : null;
  const filtered = inComp.filter((g) => !team || g.stats.players[id].teamId === team);
  const ft = playerTotals(filtered).get(id);
  // Throwing and catching % only mean something where every pass was recorded.
  const fullTotals = playerTotals(filtered.filter((g) => g.data.game.tracking_mode === 'full')).get(id);
  const fullRates = fullTotals ? completionRates(fullTotals) : { throwing: null, catching: null };
  const seasons = playerSeasons(
    filtered.map((g) => {
      const s = g.stats.players[id];
      return {
        date: g.item.started_at ?? g.item.scheduled_at,
        eventId: g.item.event_id,
        eventName: g.item.event_name,
        teamId: s.teamId,
        teamName: teamOf(g),
        goals: s.goals,
        assists: s.assists,
        intercepts: s.intercepts,
        points: s.points,
        plusMinus: s.plusMinus,
      };
    }),
  );
  const reportTitle = [comp ? comps.find(([c]) => c === comp)?.[1] : type ? TYPE_LABEL[type] : null, team ? teamsPlayed.find(([t]) => t === team)?.[1] : null, year ?? 'All time']
    .filter(Boolean)
    .join(' · ');
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

  function shareReport() {
    if (!ft) return;
    setShare({
      kicker: reportTitle,
      title: `${name}'s stats`,
      stats: [
        { label: 'Games', value: String(ft.games) },
        { label: 'Goals', value: String(ft.goals) },
        { label: 'Assists', value: String(ft.assists) },
        { label: 'Intercepts', value: String(ft.intercepts) },
        { label: 'Points played', value: String(ft.points) },
        { label: '+/−', value: signed(ft.plusMinus) },
      ],
      highlights: ft.callahans ? [`${ft.callahans} Callahan${ft.callahans > 1 ? 's' : ''}`] : [],
      footer: 'Ubuntu Ultimate',
    });
  }
  async function shareReportText() {
    if (!ft) return;
    const text = `${name}: ${reportTitle}\n${ft.games} games · ${ft.goals} goals · ${ft.assists} assists · ${ft.intercepts} intercepts · ${signed(ft.plusMinus)}\n\nFull stats on Ubuntu Ultimate: ${WEB_URL}/player/${id}`;
    if (Platform.OS === 'web') {
      if (navigator.share) return navigator.share({ text }).catch(() => undefined);
      await Clipboard.setStringAsync(text);
      return Alert.alert('Copied', 'Paste it into WhatsApp or anywhere.');
    }
    await Share.share({ message: text });
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
      left: {
        name: mine === last.item.team_a_id ? last.item.a_name : last.item.b_name,
        color: mine === last.item.team_a_id ? last.item.a_color : last.item.b_color,
        score: last.stats.teams[mine].score,
      },
      right: {
        name: theirs === last.item.team_a_id ? last.item.a_name : last.item.b_name,
        color: theirs === last.item.team_a_id ? last.item.a_color : last.item.b_color,
        score: last.stats.teams[theirs].score,
      },
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
          <Pressable accessibilityRole="button" accessibilityLabel="Edit player" onPress={() => router.push({ pathname: '/player/edit', params: { id } })}>
            <Avatar uri={person.photo_uri} name={name} size={72} tone="tint" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <T v="heading">{name}</T>
            <T v="small">
              {[person.preferred_number ? `#${person.preferred_number}` : null, person.position ? POS[person.position] : null, person.nickname ? `“${person.nickname}”` : null]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
        </View>
        {meId !== undefined && meId !== id ? (
          <View style={{ flexDirection: 'row' }}>
            <FollowButton kind="player" id={id} />
          </View>
        ) : null}

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

        {mine.length ? (
          <Section title="Stats report">
            <Filter label="Season" all="All time" value={year} options={years.map((y) => [y, String(y)] as const)} onChange={(v) => setFilter({ year: v, comp: null })} />
            {types.length > 1 ? <Filter label="Type" value={type} options={types.map((t) => [t, TYPE_LABEL[t] ?? t] as const)} onChange={(v) => setFilter({ type: v, comp: null })} /> : null}
            {comps.length > 1 ? <Filter label="League or tournament" value={comp} options={comps} onChange={(v) => setFilter({ comp: v })} /> : null}
            {teamsPlayed.length > 1 ? <Filter label="Team" value={team} options={teamsPlayed} onChange={(v) => setFilter({ team: v })} /> : null}

            <Card>
              <T v="bodyStrong">{reportTitle}</T>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <StatTile value={ft?.games ?? 0} label="Games" />
                <StatTile value={ft?.goals ?? 0} label="Goals" />
                <StatTile value={ft?.assists ?? 0} label="Assists" />
                <StatTile value={ft?.intercepts ?? 0} label="Intercepts" />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <StatTile value={ft?.points ?? 0} label="Points" />
                <StatTile value={ft ? signed(ft.plusMinus) : 0} label="+/−" />
                <StatTile value={ft ? ft.drops + ft.throwaways + ft.stalls : 0} label="Turnovers" />
                <StatTile value={ft?.callahans ?? 0} label="Callahans" />
              </View>
              {ft?.points ? (
                <T v="small">
                  Per point played: {perPoint(ft).goals ?? 0} goals · {perPoint(ft).assists ?? 0} assists · {perPoint(ft).ds ?? 0} Ds · {perPoint(ft).turns ?? 0} turns
                  {fullRates.throwing != null ? ` · throwing ${fullRates.throwing}%` : ''}
                  {fullRates.catching != null ? ` · catching ${fullRates.catching}%` : ''}
                </T>
              ) : null}
              {ft?.games ? (
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button label="Share image" icon="image-outline" kind="primary" onPress={shareReport} style={{ flex: 1 }} />
                  <Button label="Share text" icon="share-variant" onPress={shareReportText} style={{ flex: 1 }} />
                </View>
              ) : (
                <T v="small">No games match these filters.</T>
              )}
            </Card>

            {seasons.flatMap((y) =>
              y.competitions.map((c) => (
                <Card key={`${y.year}|${c.eventId}|${c.teamId}`} onPress={c.eventId ? () => router.push(`/event/${c.eventId}`) : undefined}>
                  <T v="bodyStrong">
                    {c.name}
                    {year === null ? <T v="small"> · {y.year ?? 'Undated'}</T> : null}
                  </T>
                  <TeamLink id={c.teamId} v="small" style={{ color: colors.brand }}>
                    {c.teamName}
                  </TeamLink>
                  <T v="small">
                    {c.games} games · {c.goals}G {c.assists}A {c.intercepts}I · {signed(c.plusMinus)}
                  </T>
                </Card>
              )),
            )}
          </Section>
        ) : null}

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
                  <VideoLink url={g.item.video_url} size={22} />
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
                  if ((await joinOrRequest(db, id, t.id, joinKind)) === 'requested') Alert.alert('Request sent', `${t.name}’s captain approves it.`);
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

/** One row of filter chips: "All" plus each option. */
function Filter<V extends string | number>({
  label,
  all = 'All',
  value,
  options,
  onChange,
}: {
  label: string;
  all?: string;
  value: V | null;
  options: readonly (readonly [V, string])[];
  onChange: (v: V | null) => void;
}) {
  return (
    <>
      <T v="smallStrong">{label}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Choice label={all} selected={value === null} onPress={() => onChange(null)} style={CHIP} />
        {options.map(([v, l]) => (
          <Choice key={String(v)} label={l} selected={value === v} onPress={() => onChange(v)} style={CHIP} />
        ))}
      </View>
    </>
  );
}
