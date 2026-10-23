import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useData } from '@/db/live';
import { peopleById } from '@/db/reports';
import {
  END_REASONS,
  endGame,
  type EndReason,
  getTeam,
  getVenue,
  loadGameData,
  pull,
  recordEvent,
  scorePoint,
  setLine,
  setPullDetails,
  substitute,
  SUB_REASONS,
  type SubReason,
  undo,
  updateGameMeta,
  updateScoreNames,
} from '@/db/repo';
import type { GameEventType, Person, PullOutcome, Team } from '@/db/types';
import { deriveState, fitness, lineFor, otherTeam, type GameData } from '@/domain/engine';
import { clock, shortName } from '@/domain/format';
import { fetchWeather } from '@/domain/weather';
import { shareLiveLink } from '@/lib/live';
import { BreakClock } from '@/ui/break-clock';
import { Button, Chip, Choice, Icon, IconButton, RatioBadge, Sheet, T } from '@/ui/components';
import { colors, DEFAULT_TEAM_COLOR, font, space } from '@/ui/theme';

type Bundle = { data: GameData; ta: Team; tb: Team; people: Map<string, Person> };

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const EVENT_TEXT: Partial<Record<GameEventType, string>> = {
  drop: 'Drop',
  throwaway: 'Throwaway',
  stall: 'Stall',
  intercept: 'Intercept',
  callahan: 'Callahan',
  score: 'Goal',
  pass: 'Pass',
  timeout: 'Timeout',
  stoppage_start: 'Discussion started',
  stoppage_end: 'Discussion ended',
  injury_sub: 'Substitution',
  halftime: 'Halftime',
};

export default function ScoreGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const now = useNow();
  const signedIn = useData(async (d) => !!(await d.getFirstAsync(`SELECT 1 FROM app_meta WHERE key = 'signed_in'`)));
  const bundle = useData<Bundle | null>(
    async (d) => {
      const data = await loadGameData(d, id);
      if (!data) return null;
      const [ta, tb] = await Promise.all([getTeam(d, data.game.team_a_id), getTeam(d, data.game.team_b_id)]);
      const people = await peopleById(d, data.players.map((p) => p.person_id));
      return { data, ta: ta!, tb: tb!, people };
    },
    [id],
  );

  const [picker, setPicker] = useState<null | { title: string; teamId: string; onPick: (personId: string | null) => void; ids?: string[] }>(null);
  const [pullSheet, setPullSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [endSheet, setEndSheet] = useState(false);
  const [endReason, setEndReason] = useState<EndReason>('cap');
  const [timeoutSheet, setTimeoutSheet] = useState(false);
  const [subSheet, setSubSheet] = useState<null | { teamId: string; outId?: string; reason?: SubReason; matched?: boolean }>(null);
  const weatherTried = useRef(false);

  const data = bundle?.data;
  const state = data ? deriveState(data) : null;

  useEffect(() => {
    if (data?.game.status === 'final') router.replace(`/game/${id}/report`);
  }, [data?.game.status, id]);

  if (!bundle || !data || !state) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.night }} />;
  }

  const { game } = data;
  const { ta, tb, people } = bundle;
  const team = (tid: string) => (tid === ta.id ? ta : tb);
  const mode = game.tracking_mode;
  const point = state.point!;
  const gameOverPending = !!point.scored_at && game.status === 'live';
  const label = (pid: string) => {
    const p = people.get(pid);
    const gp = data.players.find((x) => x.person_id === pid);
    return p ? `${shortName(p)}${gp?.jersey_number ? ` #${gp.jersey_number}` : ''}` : 'Unknown';
  };
  const lineOrRoster = (tid: string, pointId = point.id) => {
    const line = lineFor(data, pointId, tid);
    return line.length ? line : data.players.filter((p) => p.team_id === tid).map((p) => p.person_id);
  };
  const tracksPlayers = (tid: string) => data.players.some((p) => p.team_id === tid);

  async function maybeFetchWeather() {
    if (weatherTried.current || game.weather_json || !game.venue_id) return;
    weatherTried.current = true;
    const venue = await getVenue(db, game.venue_id);
    if (venue?.latitude == null || venue.longitude == null) return;
    const w = await fetchWeather(venue.latitude, venue.longitude);
    if (w) await updateGameMeta(db, game.id, { weather_json: JSON.stringify(w) });
  }

  async function doPull() {
    const missing = [ta, tb].filter((t) => tracksPlayers(t.id) && lineFor(data!, point.id, t.id).length === 0);
    const go = async () => {
      await pull(db, game.id, point.id);
      setPullSheet(true);
      maybeFetchWeather();
    };
    if (missing.length) {
      Alert.alert(
        `No line set for ${missing.map((t) => t.name).join(' and ')}`,
        'Player stats need to know who was on. Set the line, or pull anyway.',
        [
          { text: 'Set line', onPress: () => router.push({ pathname: '/game/[id]/line', params: { id, team: missing[0].id } }) },
          { text: 'Pull anyway', onPress: go },
        ],
      );
      return;
    }
    await go();
  }

  async function doScore(scoringTeamId: string, opts: Parameters<typeof scorePoint>[3] = {}) {
    let names = opts;
    if (mode === 'full' && state!.holder && !opts.type) {
      // In full mode the disc holder scored, the last thrower assisted.
      const passes = data!.events.filter((e) => e.point_id === point.id && e.type === 'pass' && !e.voided_at).sort((a, b) => a.seq - b.seq);
      const last = passes[passes.length - 1];
      const before = passes[passes.length - 2];
      names = { scorerId: state!.holder, assistId: last?.actor_id ?? null, hockeyId: before?.secondary_id === last?.actor_id ? before?.actor_id ?? null : null };
    }
    const { gameOver } = await scorePoint(db, data!, scoringTeamId, names);
    if (gameOver) promptEnd();
  }

  function promptEnd() {
    Alert.alert('Game over?', 'A team has reached the target score.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'End game', onPress: () => finish('target') },
    ]);
  }

  async function finish(reason: EndReason) {
    const fresh = await loadGameData(db, id);
    try {
      if (fresh) await endGame(db, fresh, reason);
    } catch (e) {
      return Alert.alert('Couldn’t end the game', `${String((e as Error).message ?? e)}\n\nNothing was lost. Please report this: Me → Report a bug.`);
    }
    setEndSheet(false);
    router.replace(`/game/${id}/report`);
  }

  async function turnover(type: 'drop' | 'throwaway' | 'stall') {
    const offense = state!.possession!;
    const write = (pid: string | null) => recordEvent(db, { gameId: game.id, pointId: point.id, type, teamId: offense, actorId: pid, secondaryId: type === 'drop' ? state!.holder : null });
    if (mode === 'lite') return write(null);
    if (mode === 'full' && state!.holder && type !== 'drop') return write(state!.holder);
    setPicker({
      title: type === 'drop' ? 'Who dropped it?' : type === 'stall' ? 'Who was stalled?' : 'Who threw it away?',
      teamId: offense,
      onPick: (pid) => write(pid),
    });
  }

  function intercept(callahan = false) {
    const defense = otherTeam(game, state!.possession!);
    setPicker({
      title: callahan ? 'Callahan by?' : 'Who got the intercept?',
      teamId: defense,
      onPick: async (pid) => {
        if (callahan) {
          await doScore(defense, { type: 'callahan', scorerId: pid });
        } else {
          await recordEvent(db, { gameId: game.id, pointId: point.id, type: 'intercept', teamId: defense, actorId: pid });
        }
      },
    });
  }

  async function tapPlayer(pid: string) {
    // Full mode: first tap = picked up the disc; later taps = a completed pass from the holder.
    await recordEvent(db, { gameId: game.id, pointId: point.id, type: 'pass', teamId: state!.possession, actorId: state!.holder, secondaryId: pid });
  }

  async function doUndo() {
    const what = await undo(db, data!);
    if (what === 'nothing') Alert.alert('Nothing to undo');
  }

  async function toggleStoppage() {
    await recordEvent(db, { gameId: game.id, pointId: point.id, type: state!.stoppageSince ? 'stoppage_end' : 'stoppage_start' });
  }

  const elapsedGame = state.gameStartedAt ? (now - Date.parse(state.gameStartedAt)) / 1000 : 0;
  const capNote = (() => {
    const { softCapMinutes, hardCapMinutes } = state.rules;
    if (!state.gameStartedAt || !softCapMinutes) return null;
    const mins = elapsedGame / 60;
    if (hardCapMinutes && mins >= hardCapMinutes) return 'Hard cap reached — finish this point';
    if (mins >= softCapMinutes) return `Soft cap — play to ${Math.max(state.scoreA, state.scoreB) + 1}`;
    return `Cap in ${clock(softCapMinutes * 60 - elapsedGame)}`;
  })();

  /* ---------------- Header ---------------- */
  const header = (
    <View style={{ backgroundColor: colors.night, paddingHorizontal: space.lg, paddingBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="arrow-left" label="Leave scoring" color="#fff" onPress={() => router.back()} />
        <T style={{ fontFamily: font.medium, fontSize: 13, color: colors.nightMuted }}>
          {state.gameStartedAt ? `Game ${clock(elapsedGame)}` : 'Not started'}
          {capNote ? ` · ${capNote}` : ''}
        </T>
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="flag-checkered" label="End game early" color="#fff" onPress={() => setEndSheet(true)} />
          <IconButton icon="broadcast" label="Share live link" color="#fff" onPress={() => shareLiveLink(game.id, `${ta.name} v ${tb.name}`, !!signedIn)} />
          <IconButton icon="dots-vertical" label="Game menu" color="#fff" onPress={() => setMenu(true)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TeamHead team={ta} align="left" />
        <T style={{ fontFamily: font.display, fontSize: 52, lineHeight: 56, color: '#fff' }}>
          {state.scoreA} – {state.scoreB}
        </T>
        <TeamHead team={tb} align="right" />
      </View>
      {point.ratio && !gameOverPending ? (
        <View style={{ alignItems: 'center', marginTop: space.sm }}>
          <RatioBadge ratio={point.ratio} point={point.number} onDark />
        </View>
      ) : null}
    </View>
  );

  /* ---------------- Between points ---------------- */
  const prev = state.previousPoint && state.previousPoint.scored_at && !gameOverPending ? state.previousPoint : gameOverPending ? point : null;
  const prevScore = prev ? data.events.find((e) => e.point_id === prev.id && (e.type === 'score' || e.type === 'callahan') && !e.voided_at) : null;

  const between = (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }}>
      {gameOverPending ? (
        <View style={{ backgroundColor: colors.brandTint, borderRadius: 12, padding: space.lg, gap: space.sm }}>
          <T v="title">That’s game!</T>
          <T v="small">Fill in the last goal below, then end the game to see the report.</T>
          <Button label="End game & see report" kind="primary" icon="flag-checkered" big onPress={() => finish('target')} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="label">{prev ? `Point ${point.number} next` : 'First point · ready when you are'}</T>
          <Button label="Timeout" icon="timer-pause-outline" onPress={() => setTimeoutSheet(true)} />
        </View>
      )}

      {prevScore && prev?.scoring_team_id && mode !== 'full' ? (
        <ScorerPicker
          title={`${team(prev.scoring_team_id).name} goal`}
          callahan={prevScore.type === 'callahan'}
          candidates={lineOrRoster(prev.scoring_team_id, prev.id)}
          scorerId={prevScore.actor_id}
          assistId={prevScore.secondary_id}
          label={label}
          onChange={(s, a) => updateScoreNames(db, prevScore.id, s, a)}
        />
      ) : null}
      {prevScore && mode === 'full' ? (
        <T v="small">
          Goal: {prevScore.actor_id ? label(prevScore.actor_id) : 'unknown'}
          {prevScore.secondary_id ? ` from ${label(prevScore.secondary_id)}` : ''}
        </T>
      ) : null}

      {!gameOverPending ? (
        <>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="label">Point {point.number} lines</T>
              <RatioBadge ratio={point.ratio} point={point.number} compact />
            </View>
            {[ta, tb].map((t) => {
              const line = lineFor(data, point.id, t.id);
              const onO = point.offense_team_id === t.id;
              const w = line.filter((pid) => people.get(pid)?.gender === 'W').length;
              const m = line.filter((pid) => people.get(pid)?.gender === 'M').length;
              const prevLine = state.previousPoint ? lineFor(data, state.previousPoint.id, t.id) : [];
              const tired = [...fitness(data, t.id, now).values()].filter((f) => line.includes(f.personId) && f.level !== 'fresh').length;
              return (
                <View key={t.id} style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ width: 10, height: 28, borderRadius: 3, backgroundColor: t.primary_color || DEFAULT_TEAM_COLOR }} />
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong">
                        {t.name} · {onO ? 'Offence' : 'Defence (pulls)'}
                      </T>
                      <T v="small">
                        {!tracksPlayers(t.id)
                          ? 'Not tracking players for this team'
                          : line.length
                            ? `${line.length} on · ${w}F ${m}M${tired ? ` · ${tired} tiring` : ''}`
                            : 'No line yet'}
                      </T>
                    </View>
                    {tracksPlayers(t.id) ? (
                      <Button label={line.length ? 'Edit' : 'Set line'} kind={line.length ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/game/[id]/line', params: { id, team: t.id } })} />
                    ) : null}
                  </View>
                  {tracksPlayers(t.id) && !line.length && prevLine.length ? (
                    <Button label="Same line as last point" icon="repeat" kind="ghost" onPress={() => setLine(db, point.id, t.id, prevLine)} />
                  ) : null}
                </View>
              );
            })}
          </View>
          {state.stoppageSince ? <Chip label={`Discussion · ${clock((now - Date.parse(state.stoppageSince)) / 1000)}`} tone="warn" /> : null}
          <Button label="End game early" icon="flag-checkered" kind="danger" onPress={() => setEndSheet(true)} />
        </>
      ) : null}
    </ScrollView>
  );

  /* ---------------- During a point ---------------- */
  const offense = state.possession ?? point.offense_team_id;
  const offenseTeam = team(offense);
  const defenseTeam = team(otherTeam(game, offense));
  const pointSeconds = point.pulled_at ? (now - Date.parse(point.pulled_at)) / 1000 : 0;
  const recent = data.events
    .filter((e) => e.point_id === point.id && !e.voided_at && e.type !== 'pass')
    .sort((a, b) => b.seq - a.seq)
    .slice(0, 3);

  const inPoint = (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: offenseTeam.primary_color || DEFAULT_TEAM_COLOR, paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T style={{ fontFamily: font.bold, fontSize: 17, color: '#fff' }}>{offenseTeam.name} on offence</T>
        <T style={{ fontFamily: font.medium, fontSize: 14, color: '#fff' }}>
          Point {point.number} · {clock(pointSeconds)}
          {state.turnoversThisPoint ? ` · ${state.turnoversThisPoint} TO` : ''}
        </T>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}>
        {mode === 'lite' ? (
          <View style={{ gap: space.md }}>
            <T v="label">Who scored?</T>
            {[ta, tb].map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => doScore(t.id)}
                style={({ pressed }) => ({ minHeight: 88, borderRadius: 14, backgroundColor: t.primary_color || DEFAULT_TEAM_COLOR, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <T style={{ fontFamily: font.display, fontSize: 28, color: '#fff' }}>{t.name.toUpperCase()} SCORED</T>
              </Pressable>
            ))}
            <T v="small">Lite mode: scorer and assist are picked during the pull countdown.</T>
          </View>
        ) : (
          <>
            {mode === 'full' ? (
              <View style={{ gap: space.sm }}>
                <T v="label">{state.holder ? `Disc with ${label(state.holder)} · tap the receiver` : 'Tap who picked up the disc'}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {lineOrRoster(offense).map((pid) => (
                    <Choice key={pid} label={label(pid)} selected={state.holder === pid} onPress={() => tapPlayer(pid)} tall style={{ width: '48.5%' }} />
                  ))}
                </View>
              </View>
            ) : null}
            <T v="label">Turnover by {offenseTeam.name}</T>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Drop" onPress={() => turnover('drop')} style={{ flex: 1, minHeight: 56 }} />
              <Button label="Throwaway" onPress={() => turnover('throwaway')} style={{ flex: 1.3, minHeight: 56 }} />
              <Button label="Stall" onPress={() => turnover('stall')} style={{ flex: 1, minHeight: 56 }} />
            </View>
            <T v="label">Defence by {defenseTeam.name}</T>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Intercept / D" icon="hand-back-right-outline" onPress={() => intercept(false)} style={{ flex: 2, minHeight: 56 }} />
              <Button label="Callahan" onPress={() => intercept(true)} style={{ flex: 1, minHeight: 56 }} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${offenseTeam.name} scored`}
              onPress={() => doScore(offense)}
              style={({ pressed }) => ({ minHeight: 84, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, marginTop: space.xs })}>
              <T style={{ fontFamily: font.display, fontSize: 30, color: '#fff', letterSpacing: 1 }}>{offenseTeam.name.toUpperCase()} SCORED</T>
            </Pressable>
          </>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Timeout" onPress={() => setTimeoutSheet(true)} style={{ flex: 1 }} />
          <Button label={state.stoppageSince ? `Resume ${clock((now - Date.parse(state.stoppageSince)) / 1000)}` : 'Discussion'} kind={state.stoppageSince ? 'dark' : 'secondary'} onPress={toggleStoppage} style={{ flex: 1.2 }} />
          <Button label="Sub" onPress={() => setSubSheet({ teamId: offense })} style={{ flex: 0.8 }} />
        </View>
        {recent.length ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.sm, gap: 4 }}>
            {recent.map((e) => (
              <T key={e.id} v="small">
                {EVENT_TEXT[e.type] ?? e.type}
                {e.actor_id ? ` · ${label(e.actor_id)}` : ''}
                {e.type === 'injury_sub' && e.secondary_id ? ` → ${label(e.secondary_id)}` : ''}
                {e.team_id && !e.actor_id ? ` · ${team(e.team_id).name}` : ''}
              </T>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ backgroundColor: colors.night }}>{header}</View>
      <BreakClock data={data} state={state} teamName={(tid) => team(tid).name} />
      {state.phase === 'inpoint' ? inPoint : between}

      <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Button label="Undo" icon="undo" onPress={doUndo} style={{ flex: 1, minHeight: 64 }} />
        {state.phase !== 'inpoint' && !gameOverPending ? (
          <Button label="PULL" kind="primary" big onPress={doPull} style={{ flex: 2.4 }} />
        ) : null}
      </View>

      <Sheet visible={!!picker} onClose={() => setPicker(null)} title={picker?.title ?? ''}>
        {picker ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(picker.ids ?? lineOrRoster(picker.teamId)).map((pid) => (
              <Choice
                key={pid}
                label={label(pid)}
                tall
                onPress={() => {
                  picker.onPick(pid);
                  setPicker(null);
                }}
                style={{ width: '48.5%' }}
              />
            ))}
            <Choice
              label="Unknown"
              dashed
              tall
              onPress={() => {
                picker.onPick(null);
                setPicker(null);
              }}
              style={{ width: '48.5%' }}
            />
          </View>
        ) : null}
      </Sheet>

      <PullDetailsSheet
        visible={pullSheet}
        onClose={() => setPullSheet(false)}
        candidates={lineOrRoster(otherTeam(game, point.offense_team_id))}
        label={label}
        onSave={async (pid, outcome) => {
          await setPullDetails(db, point.id, pid, outcome);
          setPullSheet(false);
        }}
      />

      <Sheet visible={timeoutSheet} onClose={() => setTimeoutSheet(false)} title="Timeout for">
        {[ta, tb].map((t) => {
          const used = state.timeoutsUsed[t.id] ?? 0;
          const left = state.rules.timeoutsPerTeam - used;
          return (
            <Choice
              key={t.id}
              label={t.name}
              sublabel={`${left > 0 ? left : 0} of ${state.rules.timeoutsPerTeam} left`}
              dot={t.primary_color ?? undefined}
              tall
              onPress={async () => {
                if (left <= 0) {
                  Alert.alert(`${t.name} has no timeouts left`);
                  return;
                }
                await recordEvent(db, { gameId: game.id, pointId: point.id, type: 'timeout', teamId: t.id });
                setTimeoutSheet(false);
              }}
            />
          );
        })}
        <T v="small">Before the pull, a timeout adds {state.rules.timeoutSeconds}s to the countdown.</T>
      </Sheet>

      <Sheet visible={!!subSheet} onClose={() => setSubSheet(null)} title="Substitution">
        {subSheet ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[ta, tb].map((t) => (
                <Choice key={t.id} label={t.name} selected={subSheet.teamId === t.id} onPress={() => setSubSheet({ teamId: t.id, reason: subSheet.reason })} style={{ flex: 1 }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {(Object.keys(SUB_REASONS) as SubReason[]).map((r) => (
                <Choice key={r} label={SUB_REASONS[r]} selected={(subSheet.reason ?? 'injury') === r} onPress={() => setSubSheet({ ...subSheet, reason: r })} style={{ flex: 1, minHeight: 40 }} />
              ))}
            </View>
            <T v="label">{subSheet.outId ? `${label(subSheet.outId)} off — who comes on?` : 'Who is coming off?'}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {(subSheet.outId
                ? data.players.filter((p) => p.team_id === subSheet.teamId && !lineFor(data, point.id, subSheet.teamId).includes(p.person_id)).map((p) => p.person_id)
                : lineFor(data, point.id, subSheet.teamId)
              ).map((pid) => (
                <Choice
                  key={pid}
                  label={label(pid)}
                  tall
                  onPress={async () => {
                    if (!subSheet.outId) return setSubSheet({ ...subSheet, outId: pid });
                    const reason = subSheet.reason ?? 'injury';
                    await substitute(db, game.id, point.id, subSheet.teamId, subSheet.outId, pid, reason);
                    const other = otherTeam(game, subSheet.teamId);
                    // The rules let the other team match an injury sub, so offer it straight away.
                    if (reason !== 'other' && !subSheet.matched) {
                      setSubSheet(null);
                      Alert.alert(`${team(other).name} may match the sub`, 'Does the other team want to sub a player too?', [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes, sub', onPress: () => setSubSheet({ teamId: other, reason: 'other', matched: true }) },
                      ]);
                    } else setSubSheet(null);
                  }}
                  style={{ width: '48.5%' }}
                />
              ))}
            </View>
          </>
        ) : null}
      </Sheet>

      <Sheet visible={endSheet} onClose={() => setEndSheet(false)} title="End game early?">
        <T v="title">
          {ta.name} {state.scoreA} – {state.scoreB} {tb.name}
        </T>
        <T v="label">Why is it ending?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(Object.keys(END_REASONS) as EndReason[])
            .filter((r) => r !== 'target')
            .map((r) => (
              <Choice key={r} label={END_REASONS[r]} selected={endReason === r} onPress={() => setEndReason(r)} style={{ paddingHorizontal: 14 }} />
            ))}
        </View>
        {state.phase === 'inpoint' ? (
          <T v="small">The point in progress isn’t finished, so it won’t count towards holds or breaks. Its turnovers and intercepts still count.</T>
        ) : null}
        <Button label={`End game at ${state.scoreA}–${state.scoreB}`} icon="flag-checkered" kind="primary" big onPress={() => finish(endReason)} />
        <Button label="Keep playing" kind="ghost" onPress={() => setEndSheet(false)} />
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Game">
        <Button label="End game early" icon="flag-checkered" kind="danger" onPress={() => { setMenu(false); setEndSheet(true); }} />
        <Button label="See live stats" icon="chart-box-outline" onPress={() => { setMenu(false); router.push(`/game/${id}/report`); }} />
        {tracksPlayers(ta.id) ? <Button label={`Edit ${ta.name} line`} icon="account-switch" onPress={() => { setMenu(false); router.push({ pathname: '/game/[id]/line', params: { id, team: ta.id } }); }} /> : null}
        {tracksPlayers(tb.id) ? <Button label={`Edit ${tb.name} line`} icon="account-switch" onPress={() => { setMenu(false); router.push({ pathname: '/game/[id]/line', params: { id, team: tb.id } }); }} /> : null}
        <T v="small">Tracking: {mode} · Everything saves on this phone as you go.</T>
      </Sheet>
    </SafeAreaView>
  );
}

function TeamHead({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <View style={{ flex: 1, alignItems: align === 'left' ? 'flex-start' : 'flex-end', gap: 4 }}>
      <View style={{ width: 32, height: 6, borderRadius: 3, backgroundColor: team.primary_color || DEFAULT_TEAM_COLOR, borderWidth: 1, borderColor: colors.nightRaised }} />
      <T numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 16, color: '#fff', textAlign: align }}>
        {team.name}
      </T>
    </View>
  );
}

function ScorerPicker({
  title,
  callahan,
  candidates,
  scorerId,
  assistId,
  label,
  onChange,
}: {
  title: string;
  callahan: boolean;
  candidates: string[];
  scorerId: string | null;
  assistId: string | null;
  label: (pid: string) => string;
  onChange: (scorer: string | null, assist: string | null) => void;
}) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="disc" color={colors.brand} />
        <T v="title">{title}</T>
        {callahan ? <Chip label="Callahan" tone="brand" /> : null}
      </View>
      <View style={{ gap: space.sm }}>
        <T v="label">Scored by</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {candidates.map((pid) => (
            <Choice key={pid} label={label(pid)} selected={scorerId === pid} onPress={() => onChange(pid, assistId === pid ? null : assistId)} style={{ width: '48.5%' }} />
          ))}
        </View>
      </View>
      {!callahan ? (
        <View style={{ gap: space.sm }}>
          <T v="label">Assist from</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {candidates
              .filter((pid) => pid !== scorerId)
              .map((pid) => (
                <Choice key={pid} label={label(pid)} selected={assistId === pid} onPress={() => onChange(scorerId, pid)} style={{ width: '48.5%' }} />
              ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PullDetailsSheet({
  visible,
  onClose,
  candidates,
  label,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  candidates: string[];
  label: (pid: string) => string;
  onSave: (pullerId: string | null, outcome: PullOutcome) => void;
}) {
  const [puller, setPuller] = useState<string | null>(null);
  const save = (outcome: PullOutcome) => {
    onSave(puller, outcome);
    setPuller(null);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Pull is up — who pulled?">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {candidates.map((pid) => (
          <Choice key={pid} label={label(pid)} selected={puller === pid} onPress={() => setPuller(pid)} style={{ width: '48.5%' }} />
        ))}
      </View>
      <T v="label">Where did it land?</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="In" kind="primary" onPress={() => save('in')} style={{ flex: 1, minHeight: 56 }} />
        <Button label="Out" onPress={() => save('out')} style={{ flex: 1, minHeight: 56 }} />
        <Button label="Brick" onPress={() => save('brick')} style={{ flex: 1, minHeight: 56 }} />
      </View>
      <Button label="Skip" kind="ghost" onPress={() => save('unknown')} />
    </Sheet>
  );
}
