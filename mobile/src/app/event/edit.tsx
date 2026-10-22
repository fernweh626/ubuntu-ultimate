import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { useData } from '@/db/live';
import { eventTeams, getEvent, listTeams, saveEvent, type EventInput } from '@/db/repo';
import { Button, Choice, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const POOLS = ['A', 'B', 'C', 'D'];

export default function EventEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const teams = useData(listTeams) ?? [];
  const [f, setF] = useState<EventInput>({ name: '', kind: 'tournament', level: 'regional', division: 'mixed', region: 'western', teams: [] });
  const [usePools, setUsePools] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getEvent(db, id), eventTeams(db, id)]).then(([e, ts]) => {
      if (!e) return;
      setF({ ...e, teams: ts.map((t) => ({ teamId: t.id, pool: t.pool })) });
      setUsePools(ts.some((t) => t.pool));
    });
  }, [db, id]);

  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const selected = (tid: string) => f.teams.find((t) => t.teamId === tid);
  const toggleTeam = (tid: string) =>
    set('teams', selected(tid) ? f.teams.filter((t) => t.teamId !== tid) : [...f.teams, { teamId: tid, pool: usePools ? 'A' : null }]);
  const cyclePool = (tid: string) =>
    set(
      'teams',
      f.teams.map((t) => (t.teamId === tid ? { ...t, pool: POOLS[(POOLS.indexOf(t.pool ?? 'A') + 1) % POOLS.length] } : t)),
    );

  async function save() {
    if (!f.name.trim()) return Alert.alert('Give it a name');
    for (const d of [f.start_date, f.end_date]) {
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return Alert.alert('Dates should look like 2026-10-02');
    }
    const newId = await saveEvent(db, { ...f, id, teams: f.teams.map((t) => ({ ...t, pool: usePools ? t.pool : null })) });
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
            {(['mixed', 'open', 'women', 'u17', 'u20', 'u24', 'masters'] as const).map((d) => (
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
            <Field label="Starts" value={f.start_date ?? ''} onChangeText={(v) => set('start_date', v || null)} placeholder="2026-10-02" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Ends" value={f.end_date ?? ''} onChangeText={(v) => set('end_date', v || null)} placeholder="2026-10-04" keyboardType="numbers-and-punctuation" />
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

        <Field label="YouTube link (optional)" value={f.video_url ?? ''} onChangeText={(v) => set('video_url', v || null)} autoCapitalize="none" />
        <Field label="Photos folder link (Google Photos / Drive)" value={f.photos_url ?? ''} onChangeText={(v) => set('photos_url', v || null)} autoCapitalize="none" />
      </Screen>
    </>
  );
}
