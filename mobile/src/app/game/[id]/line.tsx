import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { useData } from '@/db/live';
import { peopleById } from '@/db/reports';
import { addGamePlayer, getPerson, getTeam, loadGameData, recentLoad, saveLine, savedLines, setLine, setPlayerStatus } from '@/db/repo';
import type { GamePlayer } from '@/db/types';
import { deriveState, fitness, lineFor, type Fitness } from '@/domain/engine';
import { shortName } from '@/domain/format';
import { canAddToLine, lineNeed, ratioCode } from '@/domain/rules';
import { BreakClock } from '@/ui/break-clock';
import { Button, Choice, Field, Footer, Icon, RatioBadge, Screen, Sheet, T } from '@/ui/components';
import { QuickAddPlayer } from '@/ui/quick-add-player';
import { byMatching, MatchingHeader, PosTag } from '@/ui/roster';
import { colors, space } from '@/ui/theme';

// Effort × minutes; e.g. a 90-minute practice at effort 5, or an hour at effort 7.
const HEAVY_LOAD = 420;
const DOT = { fresh: colors.brand, tiring: colors.warn, tired: colors.danger } as const;

export default function LineBuilder() {
  const { id, team: teamId } = useLocalSearchParams<{ id: string; team: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const data = await loadGameData(d, id);
      if (!data) return null;
      const team = await getTeam(d, teamId);
      const other = await getTeam(d, data.game.team_a_id === teamId ? data.game.team_b_id : data.game.team_a_id);
      const people = await peopleById(d, data.players.map((p) => p.person_id));
      const lines = await savedLines(d, teamId);
      // Heavy sessions in the last day and a half (from reflections) count towards fatigue too.
      const recent = await recentLoad(d, data.players.filter((p) => p.team_id === teamId).map((p) => p.person_id));
      return { data, team: team!, people, lines, recent, other };
    },
    [id, teamId],
  );
  // null = untouched: show the line already saved for this point.
  const [edited, setChosen] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [lineName, setLineName] = useState('');
  const [adding, setAdding] = useState(false);

  const data = bundle?.data;
  const state = data ? deriveState(data) : null;
  const point = state?.point;

  const fit = useMemo(() => (data ? fitness(data, teamId) : new Map<string, Fitness>()), [data, teamId]);

  if (!bundle || !data || !point) return <Screen edges={[]}>{null}</Screen>;
  const chosen = edited ?? lineFor(data, point.id, teamId);

  const { team, people, lines, other } = bundle;
  const onO = point.offense_team_id === teamId;
  const squad = data.players.filter((p) => p.team_id === teamId);
  const person = (pid: string) => people.get(pid);
  const gender = (pid: string) => person(pid)?.gender;
  const LINE_SIZE = state?.rules.playersPerSide ?? 7;
  const need = lineNeed(point.ratio, LINE_SIZE);
  const w = chosen.filter((p) => gender(p) === 'W').length;
  const m = chosen.filter((p) => gender(p) === 'M').length;
  const ratioOk = !need || (w === need.W && m === need.M);
  const freshness = (pid: string) => {
    const f = fit.get(pid);
    return f ? f.consecutive * 10 + f.recentSeconds / 60 - f.restedPoints * 3 : 0;
  };
  const available = (gp: GamePlayer) => gp.status !== 'injured' && gp.status !== 'out';

  /** Fill the line from a pool, freshest first, honouring the ratio when there is one. */
  function pickFrom(pool: string[]) {
    const sorted = [...pool].sort((a, b) => freshness(a) - freshness(b));
    if (!need) return sorted.slice(0, LINE_SIZE);
    const ws = sorted.filter((p) => gender(p) === 'W').slice(0, need.W);
    const ms = sorted.filter((p) => gender(p) === 'M').slice(0, need.M);
    const rest = sorted.filter((p) => !ws.includes(p) && !ms.includes(p));
    return [...ws, ...ms, ...rest].slice(0, LINE_SIZE);
  }

  const fits = (pid: string) => canAddToLine(chosen.map(gender), gender(pid), need, LINE_SIZE);
  const toggle = (pid: string) => {
    if (chosen.includes(pid)) return setChosen(chosen.filter((x) => x !== pid));
    if (fits(pid)) return setChosen([...chosen, pid]);
    const g = gender(pid);
    if (chosen.length < LINE_SIZE && need && (g === 'W' || g === 'M'))
      Alert.alert(`${need[g]} ${g === 'W' ? 'women' : 'men'} already on`, `This point is ${need.W}F ${need.M}M. Take someone off first.`);
  };

  function suggestFor(pid: string) {
    const p = person(pid);
    const gp = squad.find((s) => s.person_id === pid);
    return squad
      .filter((s) => available(s) && !chosen.includes(s.person_id) && gender(s.person_id) === p?.gender)
      .sort(
        (a, b) =>
          Number((b.position ?? person(b.person_id)?.position) === (gp?.position ?? p?.position)) -
            Number((a.position ?? person(a.person_id)?.position) === (gp?.position ?? p?.position)) ||
          freshness(a.person_id) - freshness(b.person_id),
      )
      .slice(0, 2)
      .map((s) => s.person_id);
  }

  async function save() {
    if (chosen.length !== LINE_SIZE || !ratioOk) {
      const problem = chosen.length !== LINE_SIZE ? `${chosen.length} players picked (this game is ${LINE_SIZE} a side).` : `Ratio is ${w}F ${m}M; this ${ratioCode(point!.ratio, point!.number)} point needs ${need!.W}F ${need!.M}M.`;
      Alert.alert('Use this line anyway?', problem, [
        { text: 'Fix it', style: 'cancel' },
        { text: 'Use it', onPress: commit },
      ]);
      return;
    }
    await commit();
  }

  async function commit() {
    await setLine(db, point!.id, teamId, chosen);
    router.back();
  }

  async function saveAsLine() {
    if (!lineName.trim()) return;
    await saveLine(db, teamId, lineName, onO ? 'O' : 'D', chosen);
    setSaving(false);
    setLineName('');
  }

  const row = (gp: GamePlayer, on: boolean) => {
    const pid = gp.person_id;
    const p = person(pid);
    if (!p) return null;
    const f = fit.get(pid);
    const heavy = (bundle!.recent.get(pid) ?? 0) >= HEAVY_LOAD;
    const base = f?.level ?? 'fresh';
    const level = gp.status === 'tired' ? 'tired' : heavy && base === 'fresh' ? 'tiring' : base;
    const injured = gp.status === 'injured';
    const subs = on && level !== 'fresh' ? suggestFor(pid) : [];
    const full = !on && !fits(pid);
    return (
      <View key={pid} style={{ gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          disabled={injured}
          onPress={() => toggle(pid)}
          onLongPress={() =>
            Alert.alert(shortName(p), 'Mark as…', [
              { text: 'Fine', onPress: () => setPlayerStatus(db, id, pid, 'available') },
              { text: 'Tired', onPress: () => setPlayerStatus(db, id, pid, 'tired') },
              { text: 'Injured', onPress: () => setPlayerStatus(db, id, pid, 'injured') },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            minHeight: 58,
            paddingHorizontal: space.md,
            borderRadius: 12,
            borderWidth: on ? 2 : 1,
            borderColor: on ? (level === 'tired' ? colors.danger : colors.brand) : colors.border,
            backgroundColor: injured ? colors.neutralTint : on ? colors.brandTint : pressed ? colors.neutralTint : colors.surface,
            opacity: injured ? 0.55 : full ? 0.45 : 1,
          })}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: injured ? colors.faint : DOT[level] }} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">
              {shortName(p)}
              {gp.jersey_number ? <T v="small"> #{gp.jersey_number}</T> : null}
            </T>
            <T v="small">
              {[p.gender === 'W' ? 'F' : p.gender === 'M' ? 'M' : null, `${f?.pointsPlayed ?? 0} pts`, f?.consecutive ? `${f.consecutive} in a row` : f?.restedPoints ? `rested ${f.restedPoints}` : null, injured ? 'injured' : gp.status === 'tired' ? 'says tired' : heavy ? 'played hard recently' : null]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
          <PosTag position={gp.position ?? p.position} />
          <Icon name={on ? 'check-circle' : full ? 'minus-circle-outline' : 'plus-circle-outline'} color={on ? colors.brand : colors.faint} />
        </Pressable>
        {subs.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xl }}>
            <T v="small" style={{ color: colors.warnInk }}>
              Swap for
            </T>
            {subs.map((s) => (
              <Choice
                key={s}
                label={shortName(person(s)!)}
                onPress={() => setChosen(chosen.map((x) => (x === pid ? s : x)))}
                style={{ minHeight: 40, paddingHorizontal: 12 }}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const onLine = squad.filter((s) => chosen.includes(s.person_id));
  const bench = squad
    .filter((s) => !chosen.includes(s.person_id))
    .sort((a, b) => Number(!available(a)) - Number(!available(b)) || freshness(a.person_id) - freshness(b.person_id));
  const relevantLines = lines.filter((l) => l.side === 'any' || l.side === (onO ? 'O' : 'D'));
  const otherLines = lines.filter((l) => !relevantLines.includes(l));

  return (
    <>
      <Stack.Screen options={{ title: `${team.name} · point ${point.number}` }} />
      <Screen
        edges={[]}
        header={state ? <BreakClock data={data} state={state} teamName={(tid) => (tid === team.id ? team.name : other?.name ?? '')} /> : undefined}
        footer={
          <Footer>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="bodyStrong" style={{ color: ratioOk && chosen.length === LINE_SIZE ? colors.brandDark : colors.warnInk }}>
                {chosen.length}/{LINE_SIZE} · {w}F {m}M{need ? ` (need ${need.W}F ${need.M}M)` : ''}
              </T>
              <Button label="Save as…" kind="ghost" onPress={() => setSaving(true)} style={{ minHeight: 36, paddingHorizontal: 0 }} />
            </View>
            <Button label="Confirm line" kind="primary" big onPress={save} />
          </Footer>
        }>
        <RatioBadge ratio={point.ratio} point={point.number} />
        <T v="small">
          {onO ? 'Receiving — on offence.' : 'Pulling — on defence.'} Tap to add or remove. Long-press a player to mark them tired or injured.
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Choice label="Auto: freshest" onPress={() => setChosen(pickFrom(squad.filter(available).map((s) => s.person_id)))} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          {[...relevantLines, ...otherLines].map((l) => (
            <Choice
              key={l.id}
              label={l.name}
              sublabel={l.side === 'any' ? undefined : l.side === 'O' ? 'Offence' : 'Defence'}
              onPress={() => setChosen(pickFrom(l.member_ids.filter((pid) => squad.some((s) => s.person_id === pid && available(s)))))}
              style={{ minHeight: 40, paddingHorizontal: 14 }}
            />
          ))}
          <Choice label="Clear" onPress={() => setChosen([])} style={{ minHeight: 40, paddingHorizontal: 14 }} />
        </ScrollView>

        <T v="label">On the line</T>
        {onLine.length ? onLine.map((gp) => row(gp, true)) : <T v="small">Nobody yet — tap players below, or load a saved line.</T>}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T v="label">Bench · freshest first</T>
          <Button label="Add player" icon="account-plus" kind="ghost" onPress={() => setAdding(true)} style={{ minHeight: 32, paddingHorizontal: 0 }} />
        </View>
        {byMatching(
          bench.map((gp) => ({ gp, gender: person(gp.person_id)?.gender ?? null, first_name: person(gp.person_id)?.first_name ?? '' })),
          true,
        ).map((g) => (
          <View key={g.key} style={{ gap: 6 }}>
            <MatchingHeader group={g} inline />
            {g.items.map((x) => row(x.gp, false))}
          </View>
        ))}
      </Screen>

      <Sheet visible={saving} onClose={() => setSaving(false)} title="Save as a line">
        <Field label="Name" value={lineName} onChangeText={setLineName} placeholder={onO ? 'Super O' : 'Super D'} autoFocus />
        <Button label="Save" kind="primary" onPress={saveAsLine} />
      </Sheet>
      <QuickAddPlayer
        visible={adding}
        teamId={teamId}
        teamName={team.name}
        onClose={() => setAdding(false)}
        onAdded={async (pid) => {
          const p = await getPerson(db, pid);
          await addGamePlayer(db, id, teamId, pid, p?.preferred_number ?? null);
          setAdding(false);
        }}
      />
    </>
  );
}
