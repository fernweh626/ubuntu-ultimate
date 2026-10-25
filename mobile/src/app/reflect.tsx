import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { peopleById } from '@/db/reports';
import { getAccess, getMe, getMyReflection, getSession, getTeam, listPeople, loadGameData, myShoutout, roster, saveReflection, saveShoutout } from '@/db/repo';
import type { Person } from '@/db/types';
import { shortName } from '@/domain/format';
import { ASKS, BODY_AREAS, parseAnswers, PLAYING_TIME_LABEL, type Answers, type NiggleSeverity, type PlayingTime, type ReflectionKind, type ReflectionRow } from '@/domain/reflection';
import { computeGameStats } from '@/domain/stats';
import { Button, Card, Choice, EmptyState, Field, Footer, Screen, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

type Loaded = {
  me: Person;
  kind: ReflectionKind;
  /** Gym and physio save as practice reflections but ask their own questions. */
  ask: ReflectionKind | 'gym' | 'physio';
  title: string;
  teamId: string | null;
  teamName: string | null;
  teammates: Person[];
  pointsPlayed: { total: number; o: number; d: number } | null;
  defaultMinutes: number | null;
  isStaff: boolean;
  existing: ReflectionRow | null;
  shout: { to: string; reason: string | null } | null;
};

export default function Reflect() {
  const { gameId, sessionId } = useLocalSearchParams<{ gameId?: string; sessionId?: string }>();
  const loaded = useData<Loaded | null>(
    async (d) => {
      const me = await getMe(d);
      if (!me) return null;
      const access = await getAccess(d);
      if (gameId) {
        const data = await loadGameData(d, gameId);
        if (!data) return null;
        const gp = data.players.find((p) => p.person_id === me.id);
        const teamId = gp?.team_id ?? null;
        const team = teamId ? await getTeam(d, teamId) : null;
        const other = teamId ? await getTeam(d, teamId === data.game.team_a_id ? data.game.team_b_id : data.game.team_a_id) : null;
        const s = computeGameStats(data).players[me.id];
        const mates = await peopleById(
          d,
          data.players.filter((p) => p.team_id === teamId && p.person_id !== me.id).map((p) => p.person_id),
        );
        const shout = await myShoutout(d, me.id, { gameId });
        // Minutes actually on the field, from the points this player was on the line for.
        const onField = data.points
          .filter((p) => p.pulled_at && p.scored_at && data.lines.some((x) => x.point_id === p.id && x.person_id === me.id))
          .reduce((sum, p) => sum + (Date.parse(p.scored_at!) - Date.parse(p.pulled_at!)) / 60000, 0);
        return {
          me,
          kind: 'game',
          ask: 'game',
          title: other ? `${team?.name ?? 'Your game'} v ${other.name}` : 'Your game',
          teamId,
          teamName: team?.name ?? null,
          teammates: [...mates.values()].sort((a, b) => a.first_name.localeCompare(b.first_name)),
          pointsPlayed: s ? { total: s.points, o: s.oPoints, d: s.dPoints } : null,
          defaultMinutes: onField ? Math.round(onField) : null,
          isStaff: !!teamId && access.staffTeamIds.includes(teamId),
          existing: await getMyReflection(d, me.id, { gameId }),
          shout: shout ? { to: shout.to_person_id, reason: shout.reason } : null,
        };
      }
      const session = sessionId ? await getSession(d, sessionId) : null;
      if (!session) return null;
      const team = session.team_id ? await getTeam(d, session.team_id) : null;
      const mates = session.team_id ? (await roster(d, session.team_id)).filter((p) => p.id !== me.id) : (await listPeople(d)).filter((p) => p.id !== me.id);
      const shout = await myShoutout(d, me.id, { sessionId });
      return {
        me,
        kind: session.kind === 'pickup' ? 'pickup' : 'practice',
        ask: session.kind === 'pickup' ? 'pickup' : session.kind === 'gym' || session.kind === 'physio' ? session.kind : 'practice',
        title: session.title || (session.kind === 'pickup' ? 'Pickup' : session.kind === 'gym' ? 'Gym' : session.kind === 'physio' ? 'Physio' : `${team?.name ?? 'Team'} practice`),
        teamId: session.team_id,
        teamName: team?.name ?? null,
        teammates: mates,
        pointsPlayed: null,
        defaultMinutes: session.duration_min,
        isStaff: !!session.team_id && access.staffTeamIds.includes(session.team_id),
        existing: await getMyReflection(d, me.id, { sessionId }),
        shout: shout ? { to: shout.to_person_id, reason: shout.reason } : null,
      };
    },
    [gameId, sessionId],
  );

  if (loaded === undefined) return <Screen edges={[]}>{null}</Screen>;
  if (loaded === null) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="account-question-outline"
          title="Who are you?"
          body="Pick yourself in Me (top right on any tab) so your answers are saved to you."
          action={<Button label="Go to Me" kind="primary" onPress={() => router.push('/me')} />}
        />
      </Screen>
    );
  }
  return <ReflectForm key={loaded.existing?.id ?? 'new'} l={loaded} gameId={gameId ?? null} sessionId={sessionId ?? null} />;
}

function Scale({ value, onChange, max, labels }: { value: number | null; onChange: (n: number) => void; max: number; labels?: [string, string] }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <Choice key={n} label={String(n)} selected={value === n} onPress={() => onChange(n)} style={{ flex: 1, paddingHorizontal: 0 }} />
        ))}
      </View>
      {labels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="small">{labels[0]}</T>
          <T v="small">{labels[1]}</T>
        </View>
      ) : null}
    </View>
  );
}

function Q({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <Card>
      <T v="bodyStrong">{title}</T>
      {children}
      {note ? <T v="small">{note}</T> : null}
    </Card>
  );
}

function ReflectForm({ l, gameId, sessionId }: { l: Loaded; gameId: string | null; sessionId: string | null }) {
  const db = useSQLiteContext();
  const asks = ASKS[l.ask];
  const e = l.existing;
  const prev = parseAnswers(e?.answers_json);
  const [answers, setAnswers] = useState<Answers>(prev);
  const [rpe, setRpe] = useState<number | null>(e?.rpe ?? null);
  const [self, setSelf] = useState<number | null>(e?.self_rating ?? null);
  const [playing, setPlaying] = useState<PlayingTime | null>(e?.playing_time ?? null);
  const [minutes, setMinutes] = useState(String(e?.minutes ?? l.defaultMinutes ?? ''));
  const [niggle, setNiggle] = useState<'no' | 'yes' | null>(e ? (e.niggle_area ? 'yes' : 'no') : null);
  const [area, setArea] = useState<string | null>(e?.niggle_area ?? null);
  const [severity, setSeverity] = useState<NiggleSeverity | null>(e?.niggle_severity ?? null);
  const [shoutTo, setShoutTo] = useState<string | null>(l.shout?.to ?? null);
  const [shoutWhy, setShoutWhy] = useState(l.shout?.reason ?? '');
  const [mateSearch, setMateSearch] = useState('');
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setAnswers((a) => ({ ...a, [k]: v }));

  async function send() {
    if (niggle === 'yes' && !area) return Alert.alert('Where is the niggle?', 'Pick a body area, or choose “No”.');
    await saveReflection(db, {
      personId: l.me.id,
      teamId: l.teamId,
      gameId,
      sessionId,
      kind: l.kind,
      minutes: minutes ? Number(minutes) : null,
      rpe,
      selfRating: self,
      playingTime: playing,
      niggleArea: niggle === 'yes' ? area : null,
      niggleSeverity: niggle === 'yes' ? severity : null,
      answers,
    });
    if (shoutTo) await saveShoutout(db, { fromId: l.me.id, toId: shoutTo, teamId: l.teamId, gameId, sessionId, reason: shoutWhy.trim() || null });
    Alert.alert('Thanks!', l.teamName ? `Your answers went to ${l.teamName}’s staff.` : 'Saved to your log.');
    router.back();
  }

  const mates = mateSearch ? l.teammates.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(mateSearch.toLowerCase())) : l.teammates.slice(0, 24);

  return (
    <>
      <Stack.Screen options={{ title: { game: 'How was the game?', practice: 'How was practice?', pickup: 'How was pickup?', gym: 'How was the gym?', physio: 'How was physio?' }[l.ask] }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={e ? 'Update my answers' : 'Send'} kind="primary" big onPress={send} />
          </Footer>
        }>
        <View>
          <T v="title">{l.title}</T>
          <T v="small">About a minute · skip anything. {l.teamName ? `Only ${l.teamName}’s staff see your answers, with your name. Shout-outs are seen by the squad.` : 'Saved to your own log.'}</T>
        </View>

        {asks.has('points') && l.pointsPlayed ? (
          <Q title={`You played ${l.pointsPlayed.total} points (${l.pointsPlayed.o} O, ${l.pointsPlayed.d} D). Is that right?`}>
            <Segmented
              value={answers.pointsPlayedConfirmed === false ? 'no' : answers.pointsPlayedConfirmed ? 'yes' : ''}
              onChange={(v) => set('pointsPlayedConfirmed', v === 'yes')}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'Not quite' },
              ]}
            />
            {answers.pointsPlayedConfirmed === false ? (
              <Field
                label="How many did you play?"
                value={answers.pointsPlayedClaimed != null ? String(answers.pointsPlayedClaimed) : ''}
                onChangeText={(v) => set('pointsPlayedClaimed', v ? Number(v.replace(/\D/g, '')) : undefined)}
                keyboardType="number-pad"
              />
            ) : null}
          </Q>
        ) : null}

        {asks.has('minutes') ? (
          <Q title={l.ask === 'gym' || l.ask === 'physio' ? 'How long was it?' : 'How long did you play?'}>
            <Field label="Minutes" value={minutes} onChangeText={(v) => setMinutes(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
          </Q>
        ) : null}

        {asks.has('playingTime') ? (
          <Q title="Your playing time felt…">
            <Segmented
              value={playing ?? ('' as PlayingTime)}
              onChange={setPlaying}
              options={(Object.keys(PLAYING_TIME_LABEL) as PlayingTime[]).map((k) => ({ value: k, label: PLAYING_TIME_LABEL[k] }))}
            />
          </Q>
        ) : null}

        {asks.has('rpe') ? (
          <Q title="How hard was it on your body?">
            <Scale value={rpe} onChange={setRpe} max={10} labels={['1 · easy', '10 · max effort']} />
          </Q>
        ) : null}

        {asks.has('niggles') ? (
          <Q title={l.ask === 'physio' ? 'What are you working on?' : 'Any niggles or injuries?'}>
            <Segmented
              value={niggle ?? ('' as 'no')}
              onChange={setNiggle}
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
            />
            {niggle === 'yes' ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {BODY_AREAS.map((b) => (
                    <Choice key={b} label={b} selected={area === b} onPress={() => setArea(b)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
                  ))}
                </View>
                <Segmented
                  value={severity ?? ('' as NiggleSeverity)}
                  onChange={setSeverity}
                  options={[
                    { value: 'mild', label: 'Mild' },
                    { value: 'moderate', label: 'Moderate' },
                    { value: 'bad', label: 'Bad' },
                  ]}
                />
              </>
            ) : null}
          </Q>
        ) : null}

        {asks.has('selfRating') ? (
          <Q title={l.kind === 'game' ? 'Rate your own game' : 'Rate your own session'}>
            <Scale value={self} onChange={setSelf} max={5} labels={['1 · rough', '5 · great']} />
          </Q>
        ) : null}

        {asks.has('team') ? (
          <Q title="Rate the team">
            <T v="small">Offence</T>
            <Scale value={answers.teamOffence ?? null} onChange={(n) => set('teamOffence', n)} max={5} />
            <T v="small">Defence</T>
            <Scale value={answers.teamDefence ?? null} onChange={(n) => set('teamDefence', n)} max={5} />
          </Q>
        ) : null}

        {asks.has('role') ? (
          <Q title="Was your role on the line clear?">
            <Segmented
              value={answers.roleClear ?? ('' as 'yes')}
              onChange={(v) => set('roleClear', v)}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'mostly', label: 'Mostly' },
                { value: 'no', label: 'No' },
              ]}
            />
          </Q>
        ) : null}

        {asks.has('connections') && l.teammates.length ? (
          <Q title="Who did you connect well with?">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {l.teammates.map((p) => {
                const on = answers.connectedWith?.includes(p.id);
                return (
                  <Choice
                    key={p.id}
                    label={shortName(p)}
                    selected={on}
                    onPress={() => set('connectedWith', on ? answers.connectedWith!.filter((x) => x !== p.id) : [...(answers.connectedWith ?? []), p.id])}
                    style={{ minHeight: 40, paddingHorizontal: 12 }}
                  />
                );
              })}
            </View>
          </Q>
        ) : null}

        {asks.has('shoutout') ? (
          <Q title="Shout-out a teammate" note={l.teamName ? 'Your squad sees shout-outs. Never public.' : 'Shown to the person you shout out.'}>
            {l.teammates.length > 24 ? (
              <TextInput
                value={mateSearch}
                onChangeText={setMateSearch}
                placeholder="Search names"
                placeholderTextColor={colors.faint}
                style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.md, fontFamily: font.regular, fontSize: 16 }}
              />
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {mates.map((p) => (
                <Choice key={p.id} label={shortName(p)} selected={shoutTo === p.id} onPress={() => setShoutTo(shoutTo === p.id ? null : p.id)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
              ))}
            </View>
            {shoutTo ? <Field label="Why?" value={shoutWhy} onChangeText={setShoutWhy} placeholder="That layout D on point 12…" /> : null}
          </Q>
        ) : null}

        {asks.has('bestMoment') ? (
          <Q title="Your best moment">
            <Field label="" value={answers.bestMoment ?? ''} onChangeText={(v) => set('bestMoment', v)} placeholder="Optional" />
          </Q>
        ) : null}

        {asks.has('wentWell') ? (
          <Q title="One thing that went well">
            <Field label="" value={answers.wentWell ?? ''} onChangeText={(v) => set('wentWell', v)} multiline />
          </Q>
        ) : null}
        {asks.has('workOn') ? (
          <Q title={l.ask === 'physio' ? 'Notes: exercises, what the physio said' : l.ask === 'gym' ? 'Notes: what you did' : 'One thing to work on (you or the team)'}>
            <Field label="" value={answers.workOn ?? ''} onChangeText={(v) => set('workOn', v)} multiline />
          </Q>
        ) : null}
        {asks.has('drill') ? (
          <Q title="What drill or skill helped most?">
            <Field label="" value={answers.drill ?? ''} onChangeText={(v) => set('drill', v)} />
          </Q>
        ) : null}

        {asks.has('spirit') ? (
          <Q title={l.kind === 'pickup' ? 'How was the spirit at pickup?' : 'How was our spirit?'}>
            <Scale value={answers.spirit ?? null} onChange={(n) => set('spirit', n)} max={5} />
            <Field label="" value={answers.spiritComment ?? ''} onChangeText={(v) => set('spiritComment', v)} placeholder="Comment (optional)" />
          </Q>
        ) : null}

        {asks.has('leadership') && l.teamName ? (
          <Q title="What would you like your leadership to know?" note="Only team staff see this, with your name.">
            <Field label="" value={answers.leadership ?? ''} onChangeText={(v) => set('leadership', v)} multiline placeholder="Anything at all" />
          </Q>
        ) : null}

        {l.isStaff ? (
          <Q title="Staff notes" note="Only staff see these.">
            {l.kind === 'game' ? (
              <>
                <Field label="How did the lines work?" value={answers.staffLines ?? ''} onChangeText={(v) => set('staffLines', v)} multiline />
                <Field label="How did our strategies work (zone, force, set plays)?" value={answers.staffStrategies ?? ''} onChangeText={(v) => set('staffStrategies', v)} multiline />
                <Field
                  label="Scouting notes on the opponent"
                  value={answers.staffScouting ?? ''}
                  onChangeText={(v) => set('staffScouting', v)}
                  multiline
                  placeholder="Key players, tendencies, what worked against them"
                />
              </>
            ) : (
              <Field label="How did the session plan work?" value={answers.staffStrategies ?? ''} onChangeText={(v) => set('staffStrategies', v)} multiline />
            )}
          </Q>
        ) : null}
      </Screen>
    </>
  );
}
