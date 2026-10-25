import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { createGame, createScrimmageSides, eventTeams, getAccess, getEvent, getGameListItem, getTeam, listEvents, listPeople, listTeams, roster, startScheduledGame } from '@/db/repo';
import { ScrimmagePicker, type Sides } from '@/ui/scrimmage';
import type { Division, RosterEntry, Team, TrackingMode } from '@/db/types';
import { shortName } from '@/domain/format';
import { RULE_PRESETS, rulesFor } from '@/domain/rules';
import { Button, Card, Choice, Footer, Icon, Screen, Section, Segmented, Sheet, T, TeamSwatch } from '@/ui/components';
import { EventPicker, SoonFixtures } from '@/ui/event-picker';
import { FieldPicker } from '@/ui/field-picker';
import { QuickAddPlayer } from '@/ui/quick-add-player';
import { colors, font, space } from '@/ui/theme';

const MODES: { value: TrackingMode; label: string; body: string }[] = [
  {
    value: 'lite',
    label: 'Lite',
    body: 'Scores, assists, lines and pulls. Quickest.',
  },
  {
    value: 'standard',
    label: 'Standard',
    body: 'Adds turnovers by type and player, and intercepts.',
  },
  {
    value: 'full',
    label: 'Full',
    body: 'Every pass: hockey assists, touches and completions.',
  },
];

export default function NewGame() {
  const params = useLocalSearchParams<{
    eventId?: string;
    fixtureId?: string;
  }>();
  const fixtureId = params.fixtureId ?? null;
  const db = useSQLiteContext();
  const teamRows = useData(listTeams);
  const teams = useMemo(() => teamRows ?? [], [teamRows]);
  const events = useData(listEvents) ?? [];
  const access = useData(getAccess);
  const isPlayer = access?.level === 'player';

  const [eventChoice, setEventId] = useState<string | null>(params.eventId ?? null);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [rosterA, setRosterA] = useState<RosterEntry[]>([]);
  const [rosterB, setRosterB] = useState<RosterEntry[]>([]);
  const [outA, setOutA] = useState<string[]>([]);
  const [outB, setOutB] = useState<string[]>([]);
  const [presetChoice, setPreset] = useState('wfdf');
  const [division, setDivision] = useState<Division>('mixed');
  const [modeChoice, setMode] = useState<TrackingMode | null>(null);
  const [firstPull, setFirstPull] = useState<'A' | 'B'>('A');
  const [ratio, setRatio] = useState<'W' | 'M'>('W');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [picking, setPicking] = useState<'A' | 'B' | null>(null);
  const [adding, setAdding] = useState<'A' | 'B' | null>(null);
  const [q, setQ] = useState('');
  const [eventTeamIds, setEventTeamIds] = useState<string[]>([]);
  // Players start scrimmages as Light v Dark; anyone can switch to two real teams (and back).
  const [sidesChoice, setSidesChoice] = useState<'scrimmage' | 'teams' | null>(null);
  const [sides, setSides] = useState<Sides>({ light: [], dark: [] });
  const scrimmage = !fixtureId && (sidesChoice ?? (isPlayer ? 'scrimmage' : 'teams')) === 'scrimmage';

  // Players may only start friendly games (no event, casual rules); scorekeepers and staff choose freely.
  const eventId = isPlayer && !fixtureId ? null : eventChoice;
  const preset = isPlayer ? 'casual' : presetChoice;
  const mode: TrackingMode = modeChoice ?? (isPlayer ? 'lite' : 'standard');
  const eventKind = events.find((e) => e.id === eventId)?.kind;
  const friendly = preset === 'casual' || eventKind === 'scrimmage' || eventKind === 'practice' || eventKind === 'pickup';
  const usesRatio = (division === 'mixed' || division === 'beach') && !friendly;

  useEffect(() => {
    if (!eventId) return;
    eventTeams(db, eventId).then((ts) => setEventTeamIds(ts.map((t) => t.id)));
    getEvent(db, eventId).then((e) => e && setDivision(e.division));
  }, [db, eventId]);
  const inEvent = useMemo(() => (eventId ? eventTeamIds : []), [eventId, eventTeamIds]);

  // Starting a scheduled fixture: teams (home first), event, field and rules come from the schedule.
  useEffect(() => {
    if (!fixtureId) return;
    getGameListItem(db, fixtureId).then(async (f) => {
      if (!f) return;
      const homeId = f.home_team_id ?? f.team_a_id;
      const awayId = homeId === f.team_a_id ? f.team_b_id : f.team_a_id;
      const [home, away, event] = await Promise.all([getTeam(db, homeId), getTeam(db, awayId), f.event_id ? getEvent(db, f.event_id) : null]);
      if (!home || !away) return;
      setTeamA(home);
      setTeamB(away);
      setRosterA(await roster(db, home.id));
      setRosterB(await roster(db, away.id));
      setEventId(f.event_id);
      setVenueId(f.venue_id);
      if (event?.kind === 'league') setPreset('league');
    });
  }, [db, fixtureId]);

  async function loadRoster(side: 'A' | 'B', team: Team) {
    const r = await roster(db, team.id);
    if (side === 'A') {
      setRosterA(r);
      setOutA([]);
    } else {
      setRosterB(r);
      setOutB([]);
    }
  }

  async function pickTeam(team: Team) {
    if (picking === 'A') setTeamA(team);
    if (picking === 'B') setTeamB(team);
    await loadRoster(picking!, team);
    setPicking(null);
    setQ('');
  }

  const teamChoices = useMemo(() => {
    const s = q.toLowerCase();
    const list = teams.filter((t) => t.id !== teamA?.id && t.id !== teamB?.id && (!s || t.name.toLowerCase().includes(s)));
    return [...list.filter((t) => inEvent.includes(t.id)), ...list.filter((t) => !inEvent.includes(t.id))];
  }, [teams, q, teamA, teamB, inEvent]);

  async function start(resultOnly?: 'score' | 'winner' | 'none') {
    if (scrimmage) return startScrimmage(resultOnly);
    if (!teamA || !teamB) return Alert.alert('Pick both teams');
    const squadA = rosterA.filter((p) => !outA.includes(p.id));
    const squadB = rosterB.filter((p) => !outB.includes(p.id));
    if (!resultOnly && squadA.length === 0 && squadB.length === 0 && mode !== 'lite') {
      return Alert.alert('No players', 'Add players to at least one team, or use Lite mode to just count goals.');
    }
    const rules = { ...rulesFor(preset, division), mixedRatio: usesRatio };
    const game = {
      eventId,
      venueId,
      teamAId: teamA.id,
      teamBId: teamB.id,
      trackingMode: mode,
      rules,
      firstPullTeamId: firstPull === 'A' ? teamA.id : teamB.id,
      ratioPoint1: rules.mixedRatio ? ratio : null,
      squads: [
        ...squadA.map((p) => ({
          teamId: teamA.id,
          personId: p.id,
          jersey: p.jersey_number,
          position: p.position,
        })),
        ...squadB.map((p) => ({
          teamId: teamB.id,
          personId: p.id,
          jersey: p.jersey_number,
          position: p.position,
        })),
      ],
    };
    const id = fixtureId ? await startScheduledGame(db, fixtureId, game) : await createGame(db, game);
    if (resultOnly)
      router.replace({
        pathname: '/game/[id]/result',
        params: { id, mode: resultOnly },
      });
    else router.replace(`/game/${id}`);
  }

  async function startScrimmage(resultOnly?: 'score' | 'winner' | 'none') {
    const people = new Map((await listPeople(db)).map((p) => [p.id, p]));
    const { light, dark } = await createScrimmageSides(db);
    const rules = { ...rulesFor('casual', division), mixedRatio: false };
    const id = await createGame(db, {
      eventId: null,
      venueId,
      teamAId: light.id,
      teamBId: dark.id,
      trackingMode: mode,
      rules,
      firstPullTeamId: firstPull === 'A' ? light.id : dark.id,
      ratioPoint1: null,
      squads: [
        ...sides.light.map((pid) => ({
          teamId: light.id,
          personId: pid,
          jersey: null,
          position: people.get(pid)?.position ?? null,
        })),
        ...sides.dark.map((pid) => ({
          teamId: dark.id,
          personId: pid,
          jersey: null,
          position: people.get(pid)?.position ?? null,
        })),
      ],
    });
    if (resultOnly)
      router.replace({
        pathname: '/game/[id]/result',
        params: { id, mode: resultOnly },
      });
    else router.replace(`/game/${id}`);
  }

  const squadBlock = (side: 'A' | 'B') => {
    const team = side === 'A' ? teamA : teamB;
    const r = side === 'A' ? rosterA : rosterB;
    const out = side === 'A' ? outA : outB;
    const setOut = side === 'A' ? setOutA : setOutB;
    if (!team) return null;
    const inSquad = r.filter((p) => !out.includes(p.id));
    return (
      <Section
        key={side}
        title={`${team.name} squad · ${inSquad.length} · ${inSquad.filter((p) => p.gender === 'W').length}W ${inSquad.filter((p) => p.gender === 'M').length}M`}
        action={<Button label="Add" icon="account-plus" kind="ghost" onPress={() => setAdding(side)} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {r.length === 0 ? (
          <Card>
            <T v="small">No players on this team yet. Add who’s here today — it takes a few seconds each.</T>
          </Card>
        ) : (
          <>
            <T v="small">Tap anyone who isn’t playing today.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {r.map((p) => (
                <Choice
                  key={p.id}
                  label={shortName(p)}
                  sublabel={[p.jersey_number ? `#${p.jersey_number}` : null, p.gender].filter(Boolean).join(' · ')}
                  selected={!out.includes(p.id)}
                  onPress={() => setOut(out.includes(p.id) ? out.filter((x) => x !== p.id) : [...out, p.id])}
                  style={{ width: '31.5%' }}
                />
              ))}
            </View>
          </>
        )}
      </Section>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: fixtureId ? 'Start fixture' : 'New game' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Start game" icon="whistle" kind="primary" big onPress={() => start()} disabled={!scrimmage && (!teamA || !teamB)} />
          </Footer>
        }>
        {!fixtureId ? (
          <Segmented
            value={scrimmage ? 'scrimmage' : 'teams'}
            onChange={setSidesChoice}
            options={[
              { value: 'scrimmage', label: 'Light v Dark' },
              { value: 'teams', label: 'Two teams' },
            ]}
          />
        ) : null}
        {scrimmage ? <ScrimmagePicker value={sides} onChange={setSides} /> : null}
        {!scrimmage ? (
          <Section title="Teams">
            <View
              style={{
                flexDirection: 'row',
                gap: space.sm,
                alignItems: 'stretch',
              }}>
              {(['A', 'B'] as const).map((side) => {
                const t = side === 'A' ? teamA : teamB;
                return (
                  <Card key={side} onPress={() => setPicking(side)} style={{ flex: 1, minHeight: 88, justifyContent: 'center' }}>
                    {t ? (
                      <>
                        <TeamSwatch color={t.primary_color} />
                        <T v="bodyStrong" numberOfLines={2}>
                          {t.name}
                        </T>
                        <T v="small">Tap to change</T>
                      </>
                    ) : (
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        <Icon name="plus-circle-outline" color={colors.brand} size={28} />
                        <T v="smallStrong">Pick team {side === 'A' ? '1' : '2'}</T>
                      </View>
                    )}
                  </Card>
                );
              })}
            </View>
          </Section>
        ) : null}
        {!scrimmage ? squadBlock('A') : null}
        {!scrimmage ? squadBlock('B') : null}

        {isPlayer ? (
          <Card
            style={{
              backgroundColor: colors.brandTint,
              borderColor: colors.brandTint,
            }}>
            <T v="bodyStrong">Friendly game</T>
            <T v="small">Players can start scrimmages and pickups. League and tournament games are started by a scorekeeper or team staff (set your level in Me).</T>
          </Card>
        ) : null}

        {!isPlayer && !fixtureId ? <EventPicker value={eventId} onChange={setEventId} /> : null}
        {!isPlayer && !fixtureId && eventId ? <SoonFixtures eventId={eventId} /> : null}

        <Section title="Division">
          <Segmented
            value={division}
            onChange={(d) => {
              setDivision(d);
              if (d === 'beach') setPreset('beach');
            }}
            options={[
              { value: 'mixed', label: 'Mixed' },
              { value: 'open', label: 'Open' },
              { value: 'women', label: 'Women' },
              { value: 'beach', label: 'Beach' },
            ]}
          />
        </Section>

        <Section title="Rules">
          {RULE_PRESETS.filter((p) => !isPlayer || p.id === 'casual').map((p) => (
            <Choice key={p.id} label={p.name} sublabel={p.summary} selected={preset === p.id} onPress={() => setPreset(p.id)} tall style={{ alignItems: 'flex-start' }} />
          ))}
        </Section>

        <Section title="How much to track">
          <Segmented
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({
              value: m.value,
              label: isPlayer && m.value === 'lite' ? 'Lite ★' : m.label,
            }))}
          />
          {isPlayer ? <T v="small">★ Recommended for pickups and scrimmages.</T> : null}
          <T v="small">{MODES.find((m) => m.value === mode)!.body}</T>
          <T v="smallStrong" style={{ marginTop: space.sm }}>
            Not tracking points? Just record the result
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Final score" icon="scoreboard-outline" onPress={() => start('score')} style={{ flex: 1, minHeight: 44, paddingHorizontal: 6 }} />
            <Button label="Who won" icon="trophy-outline" onPress={() => start('winner')} style={{ flex: 1, minHeight: 44, paddingHorizontal: 6 }} />
            <Button label="No score" icon="hand-wave-outline" onPress={() => start('none')} style={{ flex: 1, minHeight: 44, paddingHorizontal: 6 }} />
          </View>
          <T v="small">Handy for hats and pickups: e.g. “Light 7, Dark 10”, just W/L, or nothing at all.</T>
        </Section>

        {scrimmage || (teamA && teamB) ? (
          <Section title="Disc flip: who pulls first?">
            <Segmented
              value={firstPull}
              onChange={setFirstPull}
              options={[
                { value: 'A', label: scrimmage ? 'Light' : teamA!.name },
                { value: 'B', label: scrimmage ? 'Dark' : teamB!.name },
              ]}
            />
          </Section>
        ) : null}

        {usesRatio && !scrimmage ? (
          <Section title="Ratio for point 1">
            <Segmented
              value={ratio}
              onChange={setRatio}
              options={[
                { value: 'W', label: '4 female matching' },
                { value: 'M', label: '4 male matching' },
              ]}
            />
            <T v="small">Then it alternates in blocks of two (ABBA). The app tells you each point.</T>
          </Section>
        ) : null}

        {friendly && division === 'mixed' ? <T v="small">Gender ratio isn’t enforced for friendly games.</T> : null}

        <Section title="Field">
          <FieldPicker value={venueId} onChange={setVenueId} />
        </Section>
      </Screen>

      <Sheet visible={!!picking} onClose={() => setPicking(null)} title={`Pick team ${picking === 'A' ? '1' : '2'}`}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search"
          placeholderTextColor={colors.faint}
          style={{
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: space.md,
            fontFamily: font.regular,
            fontSize: 16,
            backgroundColor: colors.surface,
          }}
        />
        {inEvent.length ? <T v="label">In this event first</T> : null}
        {teamChoices.map((t) => (
          <Choice key={t.id} label={t.name} dot={t.primary_color ?? colors.faint} onPress={() => pickTeam(t)} style={{ alignItems: 'flex-start' }} />
        ))}
        <Button
          label="Create a new team"
          icon="plus"
          kind="ghost"
          onPress={() => {
            setPicking(null);
            router.push('/team/edit');
          }}
        />
      </Sheet>

      {adding && (adding === 'A' ? teamA : teamB) ? (
        <QuickAddPlayer
          visible
          teamId={(adding === 'A' ? teamA : teamB)!.id}
          teamName={(adding === 'A' ? teamA : teamB)!.name}
          onClose={() => setAdding(null)}
          onAdded={async () => {
            const t = (adding === 'A' ? teamA : teamB)!;
            const r = await roster(db, t.id);
            if (adding === 'A') setRosterA(r);
            else setRosterB(r);
          }}
        />
      ) : null}
    </>
  );
}
