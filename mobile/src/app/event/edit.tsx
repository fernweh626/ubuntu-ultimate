import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { useData } from '@/db/live';
import { eventTeams, getEvent, listTeams, saveEvent, type EventInput } from '@/db/repo';
import { Button, Choice, DateField, Field, IconButton, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { dmyToIso, isoToDmy } from '@/domain/format';
import { colors, space } from '@/ui/theme';

const POOLS = ['A', 'B', 'C', 'D'];

export default function EventEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const teams = useData(listTeams) ?? [];
  const [f, setF] = useState<EventInput>({ name: '', kind: 'tournament', level: 'regional', division: 'mixed', region: 'western', teams: [] });
  const [usePools, setUsePools] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([getEvent(db, id), eventTeams(db, id)]).then(([e, ts]) => {
      if (!e) return;
      setF({ ...e, teams: ts.map((t) => ({ teamId: t.id, pool: t.pool })) });
      setStart(isoToDmy(e.start_date));
      setEnd(isoToDmy(e.end_date));
      setUsePools(ts.some((t) => t.pool));
    });
  }, [db, id]);

  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const selected = (tid: string) => f.teams.find((t) => t.teamId === tid);
  const toggleTeam = (tid: string) =>
    set('teams', selected(tid) ? f.teams.filter((t) => t.teamId !== tid) : [...f.teams, { teamId: tid, pool: usePools ? 'A' : null }]);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= f.teams.length) return;
    const next = [...f.teams];
    [next[i], next[j]] = [next[j], next[i]];
    set('teams', next);
  };
  /** Snake seeding: 1→A, 2→B, 3→B, 4→A (two pools), and so on for more pools. */
  const snake = (pools: number) =>
    set(
      'teams',
      f.teams.map((t, i) => {
        const lap = Math.floor(i / pools);
        const pos = i % pools;
        return { ...t, pool: POOLS[lap % 2 === 0 ? pos : pools - 1 - pos] };
      }),
    );
  const cyclePool = (tid: string) =>
    set(
      'teams',
      f.teams.map((t) => (t.teamId === tid ? { ...t, pool: POOLS[(POOLS.indexOf(t.pool ?? 'A') + 1) % POOLS.length] } : t)),
    );

  async function save() {
    if (!f.name.trim()) return Alert.alert('Give it a name');
    const start_date = start ? dmyToIso(start) : null;
    const end_date = end ? dmyToIso(end) : null;
    if ((start && !start_date) || (end && !end_date)) return Alert.alert('Check the dates', 'Use dd/mm/yyyy, for example 02/10/2026.');
    // List order is the seeding: first = seed 1.
    const newId = await saveEvent(db, { ...f, start_date, end_date, id, teams: f.teams.map((t, i) => ({ ...t, seed: i + 1, pool: usePools ? t.pool : null })) });
    if (id) router.back();
    else router.replace(`/event/${newId}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit event' : 'New tournament or league' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={`Save · ${f.teams.length} teams`} kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Cape Town Mixed League 2027" />
        <Section title="Type">
          <Segmented
            value={f.kind}
            onChange={(v) => set('kind', v)}
            options={[
              { value: 'tournament', label: 'Tournament' },
              { value: 'league', label: 'League' },
              { value: 'scrimmage', label: 'Scrimmage' },
              { value: 'practice', label: 'Practice' },
            ]}
          />
        </Section>
        <Section title="Level">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(['international', 'national', 'regional', 'league', 'minor', 'social'] as const).map((l) => (
              <Choice key={l} label={l[0].toUpperCase() + l.slice(1)} selected={f.level === l} onPress={() => set('level', l)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Section title="Division">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(['mixed', 'open', 'women', 'beach', 'u17', 'u20', 'u24', 'masters'] as const).map((d) => (
              <Choice key={d} label={d.toUpperCase().startsWith('U') ? d.toUpperCase() : d[0].toUpperCase() + d.slice(1)} selected={f.division === d} onPress={() => set('division', d)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Section title="Region">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Choice label="National" selected={!f.region} onPress={() => set('region', null)} style={{ paddingHorizontal: 14 }} />
            {REGIONS.map((r) => (
              <Choice key={r.code} label={r.name} selected={f.region === r.code} onPress={() => set('region', r.code)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Field label="Location" value={f.location ?? ''} onChangeText={(v) => set('location', v || null)} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <DateField label="Starts" value={start} onChangeText={setStart} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="Ends" value={end} onChangeText={setEnd} />
          </View>
        </View>

        <Section title={`Teams · ${f.teams.length}`} action={<Button label={usePools ? 'Pools on' : 'Use pools'} kind="ghost" onPress={() => setUsePools(!usePools)} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
          {usePools ? <T v="small">Tap the pool letter next to a team to change its pool.</T> : null}
          <View style={{ gap: space.sm }}>
            {teams.map((t) => {
              const sel = selected(t.id);
              return (
                <View key={t.id} style={{ flexDirection: 'row', gap: space.sm }}>
                  <Choice label={t.name} dot={t.primary_color ?? colors.faint} selected={!!sel} onPress={() => toggleTeam(t.id)} style={{ flex: 1, alignItems: 'flex-start' }} />
                  {sel && usePools ? <Choice label={`Pool ${sel.pool ?? 'A'}`} onPress={() => cyclePool(t.id)} style={{ width: 90 }} /> : null}
                </View>
              );
            })}
          </View>
        </Section>

        {f.teams.length > 1 ? (
          <Section title="Seeding">
            <T v="small">Top = seed 1. Seeds are used for straight-knockout playoffs and to split pools fairly.</T>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              {f.teams.map((t, i) => {
                const team = teams.find((x) => x.id === t.teamId);
                return (
                  <View key={t.teamId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, minHeight: 48, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <T v="bodyStrong" style={{ width: 24 }}>
                      {i + 1}
                    </T>
                    <T style={{ flex: 1 }} numberOfLines={1}>
                      {team?.name}
                    </T>
                    {usePools ? <Choice label={t.pool ?? 'A'} onPress={() => cyclePool(t.teamId)} style={{ minHeight: 36, width: 44, paddingHorizontal: 0 }} /> : null}
                    <IconButton icon="arrow-up" label="Move up" onPress={() => move(i, -1)} />
                    <IconButton icon="arrow-down" label="Move down" onPress={() => move(i, 1)} />
                  </View>
                );
              })}
            </View>
            {usePools ? (
              <>
                <T v="small">Split into pools by seed (snake: 1, 4, 5, 8 in A; 2, 3, 6, 7 in B):</T>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  {[2, 3, 4].map((n) => (
                    <Button key={n} label={`${n} pools`} onPress={() => snake(n)} style={{ flex: 1 }} />
                  ))}
                </View>
              </>
            ) : null}
          </Section>
        ) : null}

        <Field label="YouTube link (optional)" value={f.video_url ?? ''} onChangeText={(v) => set('video_url', v || null)} autoCapitalize="none" />
        <Field label="Photos folder link (Google Photos / Drive)" value={f.photos_url ?? ''} onChangeText={(v) => set('photos_url', v || null)} autoCapitalize="none" />
      </Screen>
    </>
  );
}
