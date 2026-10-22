import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { createGame, eventTeams, getEvent, listEvents, listTeams, listVenues, roster } from '@/db/repo';
import type { Division, RosterEntry, Team, TrackingMode } from '@/db/types';
import { shortName } from '@/domain/format';
import { RULE_PRESETS, rulesFor } from '@/domain/rules';
import { Button, Card, Choice, Footer, Icon, Screen, Section, Segmented, Sheet, T, TeamSwatch } from '@/ui/components';
import { QuickAddPlayer } from '@/ui/quick-add-player';
import { colors, font, space } from '@/ui/theme';

const MODES: { value: TrackingMode; label: string; body: string }[] = [
  { value: 'lite', label: 'Lite', body: 'Scores, assists, lines and pulls. Quickest.' },
  { value: 'standard', label: 'Standard', body: 'Adds turnovers by type and player, and intercepts.' },
  { value: 'full', label: 'Full', body: 'Every pass: hockey assists, touches and completions.' },
];

export default function NewGame() {
  const params = useLocalSearchParams<{ eventId?: string }>();
  const db = useSQLiteContext();
  const teamRows = useData(listTeams);
  const teams = useMemo(() => teamRows ?? [], [teamRows]);
  const events = useData(listEvents) ?? [];
  const venues = useData(listVenues) ?? [];

  const [eventId, setEventId] = useState<string | null>(params.eventId ?? null);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [rosterA, setRosterA] = useState<RosterEntry[]>([]);
  const [rosterB, setRosterB] = useState<RosterEntry[]>([]);
  const [outA, setOutA] = useState<string[]>([]);
  const [outB, setOutB] = useState<string[]>([]);
  const [preset, setPreset] = useState('wfdf');
  const [division, setDivision] = useState<Division>('mixed');
  const [mode, setMode] = useState<TrackingMode>('standard');
  const [firstPull, setFirstPull] = useState<'A' | 'B'>('A');
  const [ratio, setRatio] = useState<'W' | 'M'>('W');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [picking, setPicking] = useState<'A' | 'B' | null>(null);
  const [adding, setAdding] = useState<'A' | 'B' | null>(null);
  const [q, setQ] = useState('');
  const [eventTeamIds, setEventTeamIds] = useState<string[]>([]);

  useEffect(() => {
    if (!eventId) return;
    eventTeams(db, eventId).then((ts) => setEventTeamIds(ts.map((t) => t.id)));
    getEvent(db, eventId).then((e) => e && setDivision(e.division));
  }, [db, eventId]);
  const inEvent = useMemo(() => (eventId ? eventTeamIds : []), [eventId, eventTeamIds]);

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

  async function start() {
    if (!teamA || !teamB) return Alert.alert('Pick both teams');
    const squadA = rosterA.filter((p) => !outA.includes(p.id));
    const squadB = rosterB.filter((p) => !outB.includes(p.id));
    if (squadA.length === 0 && squadB.length === 0 && mode !== 'lite') {
      return Alert.alert('No players', 'Add players to at least one team, or use Lite mode to just count goals.');
    }
    const rules = rulesFor(preset, division);
    const id = await createGame(db, {
      eventId,
      venueId,
      teamAId: teamA.id,
      teamBId: teamB.id,
      trackingMode: mode,
      rules,
      firstPullTeamId: firstPull === 'A' ? teamA.id : teamB.id,
      ratioPoint1: rules.mixedRatio ? ratio : null,
      squads: [
        ...squadA.map((p) => ({ teamId: teamA.id, personId: p.id, jersey: p.jersey_number, position: p.position })),
        ...squadB.map((p) => ({ teamId: teamB.id, personId: p.id, jersey: p.jersey_number, position: p.position })),
      ],
    });
    router.replace(`/game/${id}`);
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
      <Stack.Screen options={{ title: 'New game' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Start game" icon="whistle" kind="primary" big onPress={start} disabled={!teamA || !teamB} />
          </Footer>
        }>
        <Section title="Teams">
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'stretch' }}>
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

        {squadBlock('A')}
        {squadBlock('B')}

        <Section title="Tournament or league (optional)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Choice label="None (friendly)" selected={!eventId} onPress={() => setEventId(null)} style={{ paddingHorizontal: 14 }} />
            {events.map((e) => (
              <Choice key={e.id} label={e.name} selected={eventId === e.id} onPress={() => setEventId(e.id)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>

        <Section title="Division">
          <Segmented
            value={division}
            onChange={setDivision}
            options={[
              { value: 'mixed', label: 'Mixed' },
              { value: 'open', label: 'Open' },
              { value: 'women', label: 'Women' },
            ]}
          />
        </Section>

        <Section title="Rules">
          {RULE_PRESETS.map((p) => (
            <Choice key={p.id} label={p.name} sublabel={p.summary} selected={preset === p.id} onPress={() => setPreset(p.id)} tall style={{ alignItems: 'flex-start' }} />
          ))}
        </Section>

        <Section title="How much to track">
          <Segmented value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />
          <T v="small">{MODES.find((m) => m.value === mode)!.body}</T>
        </Section>

        {teamA && teamB ? (
          <Section title="Disc flip: who pulls first?">
            <Segmented
              value={firstPull}
              onChange={setFirstPull}
              options={[
                { value: 'A', label: teamA.name },
                { value: 'B', label: teamB.name },
              ]}
            />
          </Section>
        ) : null}

        {division === 'mixed' && preset !== 'casual' ? (
          <Section title="Ratio for point 1">
            <Segmented
              value={ratio}
              onChange={setRatio}
              options={[
                { value: 'W', label: '4 women' },
                { value: 'M', label: '4 men' },
              ]}
            />
            <T v="small">Then it alternates in blocks of two (ABBA). The app tells you each point.</T>
          </Section>
        ) : null}

        <Section title="Field (for weather and wind)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Choice label="Not listed" selected={!venueId} onPress={() => setVenueId(null)} style={{ paddingHorizontal: 14 }} />
            {venues.map((v) => (
              <Choice key={v.id} label={v.name} sublabel={v.city ?? undefined} selected={venueId === v.id} onPress={() => setVenueId(v.id)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
      </Screen>

      <Sheet visible={!!picking} onClose={() => setPicking(null)} title={`Pick team ${picking === 'A' ? '1' : '2'}`}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search"
          placeholderTextColor={colors.faint}
          style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.md, fontFamily: font.regular, fontSize: 16, backgroundColor: colors.surface }}
        />
        {inEvent.length ? <T v="label">In this event first</T> : null}
        {teamChoices.map((t) => (
          <Choice key={t.id} label={t.name} dot={t.primary_color ?? colors.faint} onPress={() => pickTeam(t)} style={{ alignItems: 'flex-start' }} />
        ))}
        <Button label="Create a new team" icon="plus" kind="ghost" onPress={() => { setPicking(null); router.push('/team/edit'); }} />
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
