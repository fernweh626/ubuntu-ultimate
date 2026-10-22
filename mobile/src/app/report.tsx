import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Print from 'expo-print';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { createRef, useMemo, useState, type ComponentRef, type ReactElement, type RefObject } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useData } from '@/db/live';
import { loadFinishedGames, peopleById, playerTotals, type LoadedGame } from '@/db/reports';
import { bracketSlots, eventTeams, finalPlacings, getEvent, getGameListItem, getTeam, listGamesForEvent, listGamesForTeam, spiritForEvent } from '@/db/repo';
import type { Person } from '@/db/types';
import { dateRange, displayName, shortDate, shortName, timeOfDay } from '@/domain/format';
import { biggestRun, connections, gameLine, mmss, pace, pctText, squadTotals, teamTotals } from '@/domain/report';
import { weatherLine, type Weather } from '@/domain/weather';
import { ScoreProgression } from '@/ui/charts';
import { Button, T } from '@/ui/components';
import { ACCENT, BigStat, Body, ConnectionWeb, Headline, Kicker, Page, PAGE_W, PaceDots, palette, ResultChip, SplitBar, Tile } from '@/ui/report-kit';
import { colors, font, space } from '@/ui/theme';

type PageEl = (ref: RefObject<ComponentRef<typeof View> | null>, index: number, total: number) => ReactElement;

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export default function Report() {
  const { kind, teamId, eventId, gameId } = useLocalSearchParams<{ kind: 'team' | 'game' | 'event'; teamId?: string; eventId?: string; gameId?: string }>();
  const bundle = useData(
    async (d) => {
      const event = eventId ? await getEvent(d, eventId) : null;
      const items =
        kind === 'team'
          ? (await listGamesForTeam(d, teamId!)).filter((g) => !eventId || g.event_id === eventId)
          : kind === 'event'
            ? await listGamesForEvent(d, eventId!)
            : [await getGameListItem(d, gameId!)].filter((g) => g != null);
      const games = await loadFinishedGames(d, items);
      games.sort((a, b) => (a.item.started_at ?? a.item.scheduled_at ?? '').localeCompare(b.item.started_at ?? b.item.scheduled_at ?? ''));
      const ids = new Set<string>();
      games.forEach((g) => {
        g.data.players.forEach((p) => ids.add(p.person_id));
        Object.keys(g.stats.players).forEach((p) => ids.add(p));
      });
      const people = await peopleById(d, [...ids]);
      const team = teamId ? await getTeam(d, teamId) : null;
      const placings = eventId ? await finalPlacings(d, eventId) : null;
      const slots = eventId ? await bracketSlots(d, eventId) : [];
      const evTeams = eventId ? await eventTeams(d, eventId) : [];
      const spirit = eventId ? await spiritForEvent(d, eventId) : [];
      return { event, games, people, team, placings, slots, evTeams, spirit };
    },
    [kind, teamId, eventId, gameId],
  );

  const pages = useMemo(() => (bundle ? build(kind, bundle, teamId ?? null) : []), [bundle, kind, teamId]);
  const refs = useMemo(() => pages.map(() => createRef<ComponentRef<typeof View>>()), [pages]);
  const [busy, setBusy] = useState<string | null>(null);

  async function capture(result: 'tmpfile' | 'base64') {
    const out: string[] = [];
    for (const r of refs) out.push(await captureRef(r.current as never, { format: 'png', quality: 1, result }));
    return out;
  }

  async function saveImages() {
    setBusy('Saving images…');
    try {
      const perm = await requestPermissionsAsync(true);
      if (!perm.granted) return Alert.alert('Allow photo access to save the images');
      for (const uri of await capture('tmpfile')) await Asset.create(uri);
      Alert.alert('Saved to Photos', `${refs.length} images — ready for WhatsApp or Instagram.`);
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setBusy(null);
    }
  }

  async function sharePdf() {
    setBusy('Making the PDF…');
    try {
      const imgs = await capture('base64');
      const html = `<html><head><style>@page{margin:0}body{margin:0}img{width:100%;display:block;page-break-after:always}</style></head><body>${imgs
        .map((b) => `<img src="data:image/png;base64,${b}"/>`)
        .join('')}</body></html>`;
      const { uri } = await Print.printToFileAsync({ html, width: 612, height: 765 });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share report', UTI: 'com.adobe.pdf' });
    } catch (e) {
      Alert.alert('Could not make the PDF', String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!bundle) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <>
      <Stack.Screen options={{ title: kind === 'team' ? 'Team report' : kind === 'game' ? 'Game report' : 'Tournament report' }} />
      <ScrollView style={{ backgroundColor: '#2A302E' }} contentContainerStyle={{ alignItems: 'center', gap: 14, paddingVertical: 16, paddingBottom: 120 }}>
        {pages.length === 0 ? (
          <T style={{ color: '#fff' }}>No finished games yet — the report fills in as games are played.</T>
        ) : (
          pages.map((p, i) => <View key={i}>{p(refs[i], i + 1, pages.length)}</View>)
        )}
      </ScrollView>
      {pages.length ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.sm, padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          {busy ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 48 }}>
              <ActivityIndicator color={colors.brand} />
              <T>{busy}</T>
            </View>
          ) : (
            <>
              <Button label="Save images" icon="image-multiple-outline" onPress={saveImages} style={{ flex: 1 }} />
              <Button label="Share PDF" icon="file-pdf-box" kind="primary" onPress={sharePdf} style={{ flex: 1 }} />
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

type Bundle = {
  event: Awaited<ReturnType<typeof getEvent>>;
  games: LoadedGame[];
  people: Map<string, Person>;
  team: Awaited<ReturnType<typeof getTeam>>;
  placings: Awaited<ReturnType<typeof finalPlacings>> | null;
  slots: Awaited<ReturnType<typeof bracketSlots>>;
  evTeams: Awaited<ReturnType<typeof eventTeams>>;
  spirit: Awaited<ReturnType<typeof spiritForEvent>>;
};

function build(kind: 'team' | 'game' | 'event', b: Bundle, teamId: string | null): PageEl[] {
  if (!b.games.length) return [];
  const nm = (id: string) => (b.people.get(id) ? shortName(b.people.get(id)!) : '—');
  const full = (id: string) => (b.people.get(id) ? displayName(b.people.get(id)!) : '—');
  const gender = (id: string) => b.people.get(id)?.gender ?? null;
  if (kind === 'team' && teamId && b.team) return teamPages(b, teamId, nm, full, gender);
  if (kind === 'game') return gamePages(b, nm, full, gender);
  return eventPages(b, nm, full);
}

/* ------------------------------ Team at an event ------------------------------ */

function teamPages(b: Bundle, teamId: string, nm: (id: string) => string, full: (id: string) => string, gender: (id: string) => 'W' | 'M' | 'X' | null): PageEl[] {
  const team = b.team!;
  const color = team.primary_color;
  const header = team.name;
  const label = (g: LoadedGame) => {
    const slot = b.slots.find((s) => s.game_id === g.item.id);
    if (slot) return slot.name;
    if (g.item.stage === 'swiss') return `Swiss round ${g.item.round}`;
    const pool = b.evTeams.find((t) => t.id === teamId)?.pool;
    return pool ? `Pool ${pool}` : null;
  };
  const lines = b.games.map((g) => gameLine(g, teamId, label(g)));
  const w = lines.filter((l) => l.result === 'W').length;
  const l = lines.filter((x) => x.result === 'L').length;
  const pf = lines.reduce((a, x) => a + x.for, 0);
  const pa = lines.reduce((a, x) => a + x.against, 0);
  const place = b.placings?.placings.find((p) => p.teamId === teamId)?.place;
  const totals = teamTotals(b.games, teamId);
  const squad = squadTotals(b.games, teamId);
  const conn = connections(b.games, teamId, gender);
  const pc = pace(b.games, teamId, full);
  const mixed = squad.some((s) => gender(s.personId) === 'W') && squad.some((s) => gender(s.personId) === 'M');
  const pages: PageEl[] = [];

  // 1. Cover
  pages.push((ref, i, n) => (
    <Page ref={ref} tone="team" teamColor={color} header={b.event?.name ?? 'Season'} index={i} total={n}>
      <Kicker tone="team">Team report</Kicker>
      <Text style={{ fontFamily: font.display, fontSize: team.name.length > 12 ? 52 : 72, lineHeight: team.name.length > 12 ? 52 : 70, color: '#fff', textTransform: 'uppercase' }}>{team.name}</Text>
      <Body tone="team">{[b.event?.location, b.event ? dateRange(b.event.start_date, b.event.end_date) : null].filter(Boolean).join(' · ')}</Body>
      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        <BigStat tone="team" value={`${w}–${l}`} label="Record" />
        <BigStat tone="team" value={pf} label="Points for" />
        <BigStat tone="team" value={pa} label="Points against" />
        {place ? <BigStat tone="team" value={ORD(place)} label={`Place of ${b.placings!.placings.length}`} /> : null}
      </View>
      <View style={{ gap: 6 }}>
        {lines.map((g) => (
          <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.22)', padding: 10 }}>
            <Text style={{ fontFamily: font.display, fontSize: 26, color: '#fff', width: 64 }}>
              {g.for}–{g.against}
            </Text>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: font.display, fontSize: 16, color: '#fff' }}>
                V {g.oppName.toUpperCase()}
              </Text>
              <Text style={{ fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                {[g.when ? `${shortDate(g.when)} ${timeOfDay(g.when)}` : null, g.label, g.forfeit ? 'forfeit' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <ResultChip result={g.result} />
          </View>
        ))}
      </View>
    </Page>
  ));

  // 2. How the games went: halves + runs
  const withHalves = lines.filter((x) => x.half1);
  if (withHalves.length) {
    const aheadAtHalf = withHalves.filter((x) => x.half1!.for > x.half1!.against);
    const wonFromAhead = aheadAtHalf.filter((x) => x.result === 'W').length;
    const comebacks = withHalves.filter((x) => x.half1!.for < x.half1!.against && x.result === 'W').length;
    const max = Math.max(...withHalves.flatMap((x) => [x.half1!.for, x.half1!.against, x.for - x.half1!.for, x.against - x.half1!.against]), 1);
    const runs = b.games.map((g) => ({ g, run: biggestRun(g) })).filter((x) => x.run && x.run.teamId === teamId).sort((a, b2) => b2.run!.n - a.run!.n);
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="dark" header={header} index={i} total={n}>
        <Kicker tone="dark">Halves</Kicker>
        <Headline tone="dark">{aheadAtHalf.length === withHalves.length ? 'Ahead at every break' : comebacks ? 'Never out of it' : 'How the games went'}</Headline>
        <Body tone="dark">
          First halves {withHalves.reduce((a, x) => a + x.half1!.for, 0)}–{withHalves.reduce((a, x) => a + x.half1!.against, 0)}. Second halves{' '}
          {withHalves.reduce((a, x) => a + x.for - x.half1!.for, 0)}–{withHalves.reduce((a, x) => a + x.against - x.half1!.against, 0)}.
        </Body>
        {withHalves.map((x, gi) => (
          <View key={x.id} style={{ gap: 3 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 12, color: palette('dark').ink }}>
              Game {gi + 1} · {x.oppName}
            </Text>
            {(
              [
                ['1st', x.half1!.for, x.half1!.against],
                ['2nd', x.for - x.half1!.for, x.against - x.half1!.against],
              ] as const
            ).map(([h, f, a]) => (
              <View key={h} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ width: 24, fontFamily: font.semibold, fontSize: 9, color: palette('dark').muted }}>{h}</Text>
                  <View style={{ width: (f / max) * 260, height: 9, backgroundColor: ACCENT }} />
                  <Text style={{ fontFamily: font.bold, fontSize: 11, color: palette('dark').ink }}>{f}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ width: 24 }} />
                  <View style={{ width: Math.max(2, (a / max) * 260), height: 9, backgroundColor: '#7B7872' }} />
                  <Text style={{ fontFamily: font.bold, fontSize: 11, color: palette('dark').muted }}>{a}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: ACCENT, marginTop: 4 }} />
        <Body tone="dark" style={{ color: palette('dark').ink }}>
          Ahead at halftime in {aheadAtHalf.length} of {withHalves.length} games; won {wonFromAhead} of those.
          {comebacks ? ` ${comebacks} comeback win${comebacks > 1 ? 's' : ''} from behind at the break.` : ''}
          {runs[0] ? ` Best run: ${runs[0].run!.n} straight goals v ${lines.find((x) => x.id === runs[0].g.item.id)?.oppName} (${runs[0].run!.from} to ${runs[0].run!.to}).` : ''}
        </Body>
      </Page>
    ));
  }

  // 3. Offence and defence
  const turnRows = [
    ['Throwaways', totals.throwaways],
    ['Drops', totals.drops],
    ['Stalls', totals.stalls],
    ['Intercepted', totals.intercepted],
  ] as const;
  const maxTurn = Math.max(1, ...turnRows.map((r) => r[1]));
  const played = totals.oPoints + totals.dPoints;
  pages.push((ref, i, n) => (
    <Page ref={ref} tone="paper" teamColor={color} header={header} index={i} total={n}>
      <Kicker tone="paper" teamColor={color}>
        Offence & defence
      </Kicker>
      <Headline tone="paper">{totals.oPoints && totals.holds / totals.oPoints >= 0.7 ? 'Held serve' : totals.dPoints && totals.breaks / totals.dPoints >= 0.4 ? 'Broke them down' : 'Where the points were won'}</Headline>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Tile tone="paper" teamColor={color} value={pctText(totals.holds, totals.oPoints)} label={`Hold rate (${totals.holds}/${totals.oPoints})`} />
        <Tile tone="paper" teamColor={color} value={pctText(totals.breaks, totals.dPoints)} label={`Break rate (${totals.breaks}/${totals.dPoints})`} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Tile tone="paper" teamColor={color} value={totals.cleanHolds} label="Clean holds (no turnover)" />
        <Tile tone="paper" teamColor={color} value={played ? (totals.turnovers / played).toFixed(1) : '–'} label="Turnovers per point" />
        <Tile tone="paper" teamColor={color} value={totals.intercepts} label="Intercepts" />
      </View>
      <Body tone="paper">
        Opponents held {pctText(totals.opp.holds, totals.opp.oPoints)} and broke {pctText(totals.opp.breaks, totals.opp.dPoints)}.
        {totals.pullCount ? ` Pulls went up ${Math.abs(Math.round(totals.pullDelay / totals.pullCount))}s ${totals.pullDelay >= 0 ? 'after' : 'before'} the limit on average.` : ''}
      </Body>
      <Text style={{ fontFamily: font.bold, fontSize: 12, color: palette('paper').ink, marginTop: 4 }}>How possessions were lost</Text>
      {turnRows.map(([lbl, v]) => (
        <View key={lbl} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ width: 84, fontFamily: font.semibold, fontSize: 12, color: palette('paper').ink }}>{lbl}</Text>
          <View style={{ width: (v / maxTurn) * 210, height: 12, backgroundColor: color || '#1F6B4A' }} />
          <Text style={{ fontFamily: font.display, fontSize: 16, color: palette('paper').ink }}>{v}</Text>
        </View>
      ))}
    </Page>
  ));

  // 4. Scoring
  const scorers = squad.filter((s) => s.goals + s.assists > 0).slice(0, 12);
  if (scorers.length) {
    const maxGA = Math.max(...scorers.map((s) => s.goals + s.assists));
    const top = scorers[0];
    const goals = squad.reduce((a, s) => a + s.goals, 0);
    const assists = squad.reduce((a, s) => a + s.assists, 0);
    const wGoals = squad.filter((s) => gender(s.personId) === 'W').reduce((a, s) => a + s.goals, 0);
    const mAssists = squad.filter((s) => gender(s.personId) === 'M').reduce((a, s) => a + s.assists, 0);
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="paper" teamColor={color} header={header} index={i} total={n}>
        <Kicker tone="paper" teamColor={color}>
          Scoring
        </Kicker>
        <Headline tone="paper">Who put the disc away</Headline>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: color || '#1F6B4A' }} />
            <Text style={{ fontFamily: font.regular, fontSize: 11, color: palette('paper').muted }}>Goals</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: '#141414' }} />
            <Text style={{ fontFamily: font.regular, fontSize: 11, color: palette('paper').muted }}>Assists</Text>
          </View>
        </View>
        {scorers.map((s) => (
          <SplitBar key={s.personId} tone="paper" label={full(s.personId)} a={s.goals} b={s.assists} max={maxGA} aColor={color || '#1F6B4A'} bColor="#141414" />
        ))}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <Tile tone="paper" teamColor={color} value={top.goals + top.assists} label={`G + A for ${nm(top.personId)} (${top.goals}G ${top.assists}A)`} />
          <Tile tone="paper" teamColor={color} value={squad.filter((s) => s.goals > 0).length} label="different players scored" />
        </View>
        {mixed ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Tile tone="paper" teamColor={color} value={`${wGoals} of ${goals}`} label="goals scored by women" />
            <Tile tone="paper" teamColor={color} value={`${mAssists} of ${assists}`} label="assists thrown by men" />
          </View>
        ) : null}
      </Page>
    ));
  }

  // 5. Connections
  if (conn.pairs.length >= 3) {
    const top = conn.pairs[0];
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="dark" header={header} index={i} total={n}>
        <Kicker tone="dark">Connections</Kicker>
        <Headline tone="dark">Who set up who</Headline>
        <Body tone="dark">
          Each line runs from the thrower to the scorer. {conn.assisted} assisted goals came from {conn.pairs.length} different pairings.
        </Body>
        <ConnectionWeb tone="dark" pairs={conn.pairs} name={nm} isWoman={(id) => gender(id) === 'W'} />
        {mixed ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Tile tone="dark" value={conn.byGender.mm} label="Man to man" />
            <Tile tone="dark" value={conn.byGender.mw} label="Man to woman" />
            <Tile tone="dark" value={conn.byGender.wm} label="Woman to man" />
            <Tile tone="dark" value={conn.byGender.ww} label="Woman to woman" />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(
            [
              ['Set up the most teammates', conn.setUpMostDifferent],
              ['Scored off the most passers', conn.scoredOffMostDifferent],
            ] as const
          ).map(([title, list]) => (
            <View key={title} style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 10, letterSpacing: 1, color: ACCENT }}>{title.toUpperCase()}</Text>
              {list.slice(0, 4).map((x) => (
                <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.regular, fontSize: 12, color: palette('dark').ink }}>
                    {nm(x.id)}
                  </Text>
                  <Text style={{ fontFamily: font.display, fontSize: 14, color: palette('dark').ink }}>{x.n}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <Body tone="dark" style={{ color: palette('dark').ink }}>
          Most repeated pairing: {full(top.from)} to {full(top.to)}, {top.count} time{top.count > 1 ? 's' : ''}.{conn.twoWay ? ` ${conn.twoWay} pair${conn.twoWay > 1 ? 's' : ''} connected both ways.` : ''}
        </Body>
      </Page>
    ));
  }

  // 6. Pace
  if (pc.points.length >= 4) {
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="dark" header={header} index={i} total={n}>
        <Kicker tone="dark">Pace</Kicker>
        <Headline tone="dark">How long did each point take?</Headline>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Tile tone="dark" value={mmss(pc.avg)} label="Average" />
          <Tile tone="dark" value={mmss(pc.median)} label="Median" />
          <Tile tone="dark" value={mmss(pc.min)} label="Shortest" />
          <Tile tone="dark" value={mmss(pc.max)} label="Longest" />
        </View>
        <PaceDots tone="dark" points={pc.points} games={lines.map((x) => x.oppName)} />
        <Body tone="dark">Minutes from pull to goal. Filled dots: {team.name} scored. Hollow: opponent scored.</Body>
        {pc.rows.map((r) => (
          <View key={r.gameIndex} style={{ flexDirection: 'row', gap: 6, borderTopWidth: 1, borderTopColor: palette('dark').line, paddingTop: 4 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.regular, fontSize: 11, color: palette('dark').ink }}>
              G{r.gameIndex + 1} {lines[r.gameIndex].oppName}
            </Text>
            <Text style={{ width: 52, fontFamily: font.regular, fontSize: 11, color: palette('dark').muted }}>avg {mmss(r.avg)}</Text>
            <Text style={{ width: 62, fontFamily: font.regular, fontSize: 11, color: palette('dark').muted }}>{r.under3} under 3m</Text>
            <Text style={{ width: 58, fontFamily: font.regular, fontSize: 11, color: palette('dark').muted }}>{r.over6} over 6m</Text>
          </View>
        ))}
        {pc.longest ? (
          <Body tone="dark" style={{ color: palette('dark').ink }}>
            Longest point: {mmss(pc.longest.seconds)}
            {pc.longest.scorer ? `, ending with a goal by ${pc.longest.scorer}` : ''}. Shortest: {mmss(pc.shortest!.seconds)}
            {pc.shortest!.scorer ? ` (${pc.shortest!.scorer} to make it ${pc.shortest!.scoreText})` : ''}.
          </Body>
        ) : null}
      </Page>
    ));
  }

  // 7. Whole squad
  pages.push((ref, i, n) => (
    <Page ref={ref} tone="paper" teamColor={color} header={header} index={i} total={n}>
      <Kicker tone="paper" teamColor={color}>
        Whole squad
      </Kicker>
      <Headline tone="paper">Everyone who played</Headline>
      <Body tone="paper">Goals, assists and intercepts. Dashed means none logged — not that they didn’t play.</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {squad.map((s) => {
          const any = s.goals + s.assists + s.intercepts > 0;
          return (
            <View
              key={s.personId}
              style={{
                width: (PAGE_W - 40 - 5) / 2,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 7,
                backgroundColor: any ? palette('paper').card : 'transparent',
                borderWidth: any ? 0 : 1,
                borderStyle: 'dashed',
                borderColor: palette('paper').line,
              }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 11, color: palette('paper').ink }}>
                {full(s.personId)}
              </Text>
              <Text style={{ fontFamily: font.display, fontSize: 13, color: any ? color || '#1F6B4A' : palette('paper').muted }}>
                {any ? `${s.goals}G ${s.assists}A${s.intercepts ? ` ${s.intercepts}D` : ''}` : '–'}
              </Text>
            </View>
          );
        })}
      </View>
    </Page>
  ));
  return pages;
}

/* ------------------------------ Single game ------------------------------ */

function gamePages(b: Bundle, nm: (id: string) => string, full: (id: string) => string, gender: (id: string) => 'W' | 'M' | 'X' | null): PageEl[] {
  const g = b.games[0];
  const { item, stats } = g;
  const A = stats.teams[item.team_a_id];
  const B = stats.teams[item.team_b_id];
  const winnerColor = A.score >= B.score ? item.a_color : item.b_color;
  const header = `${item.a_name} v ${item.b_name}`;
  const weather: Weather | null = g.data.game.weather_json ? JSON.parse(g.data.game.weather_json) : null;
  const run = biggestRun(g);
  const conn = connections([g], null, gender);
  const pages: PageEl[] = [];

  pages.push((ref, i, n) => (
    <Page ref={ref} tone="team" teamColor={winnerColor} header={item.event_name ?? 'Game'} index={i} total={n}>
      <Kicker tone="team">{item.forfeit_team_id ? 'Result · forfeit' : 'Final'}</Kicker>
      <View style={{ gap: 6, marginTop: 8 }}>
        {[
          [item.a_name, A.score],
          [item.b_name, B.score],
        ].map(([name, score]) => (
          <View key={String(name)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text numberOfLines={2} style={{ flex: 1, fontFamily: font.display, fontSize: 34, lineHeight: 34, color: '#fff', textTransform: 'uppercase' }}>
              {name}
            </Text>
            <Text style={{ fontFamily: font.display, fontSize: 72, lineHeight: 72, color: '#fff' }}>{score}</Text>
          </View>
        ))}
      </View>
      <Body tone="team">
        {[item.started_at ? `${shortDate(item.started_at)} ${timeOfDay(item.started_at)}` : null, item.venue_name, stats.durationSeconds ? `${Math.round(stats.durationSeconds / 60)} min` : null].filter(Boolean).join(' · ')}
      </Body>
      {weather ? <Body tone="team">{weatherLine(weather)}</Body> : null}
      {run ? (
        <View style={{ backgroundColor: 'rgba(0,0,0,0.22)', padding: 12 }}>
          <Text style={{ fontFamily: font.display, fontSize: 30, color: '#fff' }}>{run.n} IN A ROW</Text>
          <Body tone="team">
            Biggest run: {run.teamId === item.team_a_id ? item.a_name : item.b_name}, from {run.from} to {run.to}.
          </Body>
        </View>
      ) : null}
    </Page>
  ));

  pages.push((ref, i, n) => (
    <Page ref={ref} tone="paper" header={header} index={i} total={n}>
      <Kicker tone="paper">Score flow</Kicker>
      <Headline tone="paper">How it unfolded</Headline>
      <View style={{ backgroundColor: '#fff', padding: 8 }}>
        <ScoreProgression timeline={stats.timeline} aColor={item.a_color} bColor={item.b_color} aName={item.a_name} bName={item.b_name} width={PAGE_W - 56} height={170} />
      </View>
      {(
        [
          ['Holds', `${A.holds}/${A.oPoints}`, `${B.holds}/${B.oPoints}`],
          ['Clean holds', A.cleanHolds, B.cleanHolds],
          ['Breaks', A.breaks, B.breaks],
          ['Turnovers', A.turnovers, B.turnovers],
          ['Intercepts', A.intercepts, B.intercepts],
          ['Turnovers per point', A.oPoints + A.dPoints ? (A.turnovers / (A.oPoints + A.dPoints)).toFixed(1) : '–', B.oPoints + B.dPoints ? (B.turnovers / (B.oPoints + B.dPoints)).toFixed(1) : '–'],
        ] as const
      ).map(([lbl, a, bb]) => (
        <View key={lbl} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: palette('paper').line, paddingTop: 5 }}>
          <Text style={{ width: 70, fontFamily: font.display, fontSize: 18, color: palette('paper').ink }}>{a}</Text>
          <Text style={{ flex: 1, textAlign: 'center', fontFamily: font.regular, fontSize: 12, color: palette('paper').muted }}>{lbl}</Text>
          <Text style={{ width: 70, textAlign: 'right', fontFamily: font.display, fontSize: 18, color: palette('paper').ink }}>{bb}</Text>
        </View>
      ))}
    </Page>
  ));

  const perf = Object.values(stats.players)
    .filter((p) => p.goals + p.assists + p.intercepts > 0)
    .sort((x, y) => y.goals + y.assists + y.intercepts - (x.goals + x.assists + x.intercepts));
  if (perf.length) {
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="paper" header={header} index={i} total={n}>
        <Kicker tone="paper">Top performers</Kicker>
        <Headline tone="paper">Who made it happen</Headline>
        {[item.team_a_id, item.team_b_id].map((tid) => (
          <View key={tid} style={{ gap: 4 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: palette('paper').ink }}>{tid === item.team_a_id ? item.a_name : item.b_name}</Text>
            {perf
              .filter((p) => p.teamId === tid)
              .slice(0, 5)
              .map((p) => (
                <View key={p.personId} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: palette('paper').card, padding: 7 }}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 12, color: palette('paper').ink }}>{full(p.personId)}</Text>
                  <Text style={{ fontFamily: font.display, fontSize: 14, color: palette('paper').ink }}>
                    {p.goals}G {p.assists}A{p.intercepts ? ` ${p.intercepts}D` : ''}
                  </Text>
                </View>
              ))}
          </View>
        ))}
      </Page>
    ));
  }

  if (conn.pairs.length >= 3) {
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="dark" header={header} index={i} total={n}>
        <Kicker tone="dark">Connections</Kicker>
        <Headline tone="dark">Who set up who</Headline>
        <ConnectionWeb tone="dark" pairs={conn.pairs} name={nm} isWoman={(id) => gender(id) === 'W'} />
        <Body tone="dark" style={{ color: palette('dark').ink }}>
          Top pairing: {full(conn.pairs[0].from)} to {full(conn.pairs[0].to)} ×{conn.pairs[0].count}.
        </Body>
      </Page>
    ));
  }

  const pc = pace([g], item.team_a_id, full);
  if (pc.points.length >= 4) {
    const split = pc.points.map((p) => ({ ...p, gameIndex: p.ours ? 0 : 1, ours: true }));
    pages.push((ref, i, n) => (
      <Page ref={ref} tone="dark" header={header} index={i} total={n}>
        <Kicker tone="dark">Pace</Kicker>
        <Headline tone="dark">Point by point</Headline>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Tile tone="dark" value={mmss(pc.avg)} label="Average" />
          <Tile tone="dark" value={mmss(pc.median)} label="Median" />
          <Tile tone="dark" value={mmss(pc.max)} label="Longest" />
        </View>
        <PaceDots tone="dark" points={split} games={[`${item.a_short ?? item.a_name} scored`, `${item.b_short ?? item.b_name} scored`]} />
        <Body tone="dark">Minutes from pull to goal, one dot per point.</Body>
      </Page>
    ));
  }
  return pages;
}

/* ------------------------------ Whole event ------------------------------ */

function eventPages(b: Bundle, nm: (id: string) => string, full: (id: string) => string): PageEl[] {
  const ev = b.event;
  const placings = b.placings?.placings ?? [];
  const teamName = (id: string) => b.evTeams.find((t) => t.id === id)?.name ?? '';
  const teamColor = (id: string) => b.evTeams.find((t) => t.id === id)?.primary_color ?? null;
  const champ = placings[0];
  const header = ev?.name ?? 'Tournament';
  const totals = [...playerTotals(b.games).values()];
  const leaders = (k: 'goals' | 'assists' | 'intercepts') => [...totals].filter((p) => p[k] > 0).sort((x, y) => y[k] - x[k]).slice(0, 5);
  const spiritAvg = b.evTeams
    .map((t) => {
      const got = b.spirit.filter((s) => s.to_team_id === t.id);
      return { t, avg: got.length ? got.reduce((a, s) => a + s.rules + s.fouls + s.fairness + s.attitude + s.communication, 0) / got.length : null };
    })
    .filter((x) => x.avg != null)
    .sort((x, y) => y.avg! - x.avg!);
  const scored = b.games.map((g) => ({ g, a: g.stats.teams[g.item.team_a_id].score, b: g.stats.teams[g.item.team_b_id].score })).filter((x) => !x.g.item.forfeit_team_id);
  const closest = [...scored].sort((x, y) => Math.abs(x.a - x.b) - Math.abs(y.a - y.b))[0];
  const biggest = [...scored].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
  const avgPoint = (g: LoadedGame) => g.stats.avgPointSeconds ?? 0;
  const timed = scored.filter((x) => x.g.stats.avgPointSeconds);
  const fastest = [...timed].sort((x, y) => avgPoint(x.g) - avgPoint(y.g))[0];
  const slowest = [...timed].sort((x, y) => avgPoint(y.g) - avgPoint(x.g))[0];
  const totalPoints = scored.reduce((a, x) => a + x.a + x.b, 0);
  const gTitle = (x: (typeof scored)[number]) => `${x.g.item.a_name} ${x.a}–${x.b} ${x.g.item.b_name}`;
  const pages: PageEl[] = [];

  pages.push((ref, i, n) => (
    <Page ref={ref} tone="team" teamColor={champ ? teamColor(champ.teamId) : null} header={header} index={i} total={n}>
      <Kicker tone="team">{b.placings?.decided ? 'Champions' : 'Leading the way'}</Kicker>
      {champ ? <Text style={{ fontFamily: font.display, fontSize: 60, lineHeight: 58, color: '#fff', textTransform: 'uppercase' }}>{teamName(champ.teamId)}</Text> : null}
      <Body tone="team">{[ev?.location, ev ? dateRange(ev.start_date, ev.end_date) : null, `${b.evTeams.length} teams · ${b.games.length} games`].filter(Boolean).join(' · ')}</Body>
      <View style={{ gap: 6, marginTop: 6 }}>
        {placings.slice(0, 3).map((p) => (
          <View key={p.teamId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.22)', padding: 10 }}>
            <Text style={{ fontFamily: font.display, fontSize: 30, color: '#fff', width: 52 }}>{ORD(p.place)}</Text>
            <Text style={{ flex: 1, fontFamily: font.display, fontSize: 20, color: '#fff' }}>{teamName(p.teamId).toUpperCase()}</Text>
          </View>
        ))}
      </View>
      {spiritAvg[0] ? (
        <Body tone="team" style={{ color: '#fff' }}>
          Spirit award: {spiritAvg[0].t.name} ({spiritAvg[0].avg!.toFixed(1)}/20)
        </Body>
      ) : null}
    </Page>
  ));

  pages.push((ref, i, n) => (
    <Page ref={ref} tone="paper" header={header} index={i} total={n}>
      <Kicker tone="paper">Final table</Kicker>
      <Headline tone="paper">{b.placings?.decided ? 'Where everyone finished' : 'Standings so far'}</Headline>
      {placings.map((p) => (
        <View key={p.teamId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette('paper').line, paddingVertical: 5 }}>
          <Text style={{ width: 34, fontFamily: font.display, fontSize: 20, color: palette('paper').ink }}>{p.place}</Text>
          <View style={{ width: 6, height: 22, backgroundColor: teamColor(p.teamId) || '#888' }} />
          <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: palette('paper').ink }}>{teamName(p.teamId)}</Text>
        </View>
      ))}
    </Page>
  ));

  pages.push((ref, i, n) => (
    <Page ref={ref} tone="paper" header={header} index={i} total={n}>
      <Kicker tone="paper">Leaders</Kicker>
      <Headline tone="paper">The stat sheet</Headline>
      {(
        [
          ['Goals', leaders('goals'), 'goals'],
          ['Assists', leaders('assists'), 'assists'],
          ['Intercepts', leaders('intercepts'), 'intercepts'],
        ] as const
      ).map(([title, list, k]) =>
        list.length ? (
          <View key={title} style={{ gap: 3 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 1.5, color: '#1F6B4A' }}>{title.toUpperCase()}</Text>
            {list.map((p, idx) => (
              <View key={p.personId} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: idx === 0 ? palette('paper').card : 'transparent', padding: 5 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12, color: palette('paper').ink }}>
                  {idx + 1}. {full(p.personId)} <Text style={{ color: palette('paper').muted }}>{teamName(p.teamId)}</Text>
                </Text>
                <Text style={{ fontFamily: font.display, fontSize: 15, color: palette('paper').ink }}>{p[k]}</Text>
              </View>
            ))}
          </View>
        ) : null,
      )}
    </Page>
  ));

  pages.push((ref, i, n) => (
    <Page ref={ref} tone="dark" header={header} index={i} total={n}>
      <Kicker tone="dark">Game facts</Kicker>
      <Headline tone="dark">The weekend in numbers</Headline>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <Tile tone="dark" value={b.games.length} label="Games" />
        <Tile tone="dark" value={totalPoints} label="Points scored" />
        <Tile tone="dark" value={timed.length ? mmss(timed.reduce((a, x) => a + avgPoint(x.g), 0) / timed.length) : '–'} label="Average point" />
      </View>
      {(
        [
          ['Closest game', closest ? gTitle(closest) : null],
          ['Biggest win', biggest ? gTitle(biggest) : null],
          ['Fastest game', fastest ? `${gTitle(fastest)} · ${mmss(avgPoint(fastest.g))} a point` : null],
          ['Slowest game', slowest ? `${gTitle(slowest)} · ${mmss(avgPoint(slowest.g))} a point` : null],
        ] as const
      ).map(([lbl, v]) =>
        v ? (
          <View key={lbl} style={{ borderTopWidth: 1, borderTopColor: palette('dark').line, paddingTop: 6, gap: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 10, letterSpacing: 1.5, color: ACCENT }}>{lbl.toUpperCase()}</Text>
            <Text style={{ fontFamily: font.semibold, fontSize: 14, color: palette('dark').ink }}>{v}</Text>
          </View>
        ) : null,
      )}
      {spiritAvg.length ? (
        <View style={{ gap: 3, marginTop: 4 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 10, letterSpacing: 1.5, color: ACCENT }}>SPIRIT TABLE (AVERAGE OUT OF 20)</Text>
          {spiritAvg.slice(0, 8).map((s, idx) => (
            <View key={s.t.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font.regular, fontSize: 12, color: palette('dark').ink }}>
                {idx + 1}. {s.t.name}
              </Text>
              <Text style={{ fontFamily: font.display, fontSize: 14, color: palette('dark').ink }}>{s.avg!.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Page>
  ));
  void nm;
  return pages;
}
