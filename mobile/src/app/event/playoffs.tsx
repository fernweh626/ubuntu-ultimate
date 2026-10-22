import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { createBracket, deleteBracket, fillBracketNow, getAccess, getEvent, resolveBracket, scheduleSlot, type BracketSlotRow, type GameListItem } from '@/db/repo';
import { buildBracket, type SeedMode } from '@/domain/formats';
import { dmyToIso, localDmy, timeOfDay } from '@/domain/format';
import { BracketView } from '@/ui/bracket';
import { Button, Card, Choice, DateField, Field, Screen, Section, Segmented, Sheet, T } from '@/ui/components';
import { FieldPicker } from '@/ui/field-picker';
import { colors, space } from '@/ui/theme';

export default function Playoffs() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ ...(await resolveBracket(d, eventId)), event: await getEvent(d, eventId), access: await getAccess(d) }), [eventId]);
  const [size, setSize] = useState<string>('4');
  const [mode, setMode] = useState<SeedMode>('standings');
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState<{ slot: BracketSlotRow; game?: GameListItem } | null>(null);

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { teams, games, slots, state, event, access } = bundle;
  const runsEvents = access.level === 'admin' || access.level === 'coordinator';
  const pools = Array.from(new Set(teams.map((t) => t.pool).filter(Boolean)));
  const openPoolGames = games.filter((g) => g.stage !== 'playoff' && g.status !== 'final').length;
  const n = size === 'all' ? teams.length : Number(size);
  const preview = n >= 2 ? buildBracket(n, mode, full) : [];

  async function create() {
    if (n < 2) return Alert.alert('Needs at least 2 teams');
    if (n > teams.length) return Alert.alert(`Only ${teams.length} teams in this event`);
    const made = await createBracket(db, eventId, buildBracket(n, mode, full));
    Alert.alert(
      'Bracket created',
      made
        ? `${made} game${made > 1 ? 's are' : ' is'} ready. Tap any game to set its time and field.`
        : 'Games appear as soon as results decide who plays. You can set times and fields now.',
    );
  }

  const openSlot = (slot: BracketSlotRow, game?: GameListItem) => {
    if (runsEvents) setEditing({ slot, game });
    else if (game) router.push(game.status === 'scheduled' ? `/game/${game.id}/fixture` : game.status === 'live' ? `/game/${game.id}` : `/game/${game.id}/report`);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Playoffs' }} />
      <Screen edges={[]}>
        {slots.length ? (
          <>
            <BracketView
              title={`${event?.name ?? 'Playoffs'}`}
              slots={slots}
              state={state}
              games={games}
              teamName={(id) => teams.find((t) => t.id === id)?.name ?? ''}
              teamColor={(id) => teams.find((t) => t.id === id)?.primary_color ?? null}
              onSlotPress={openSlot}
            />
            <T v="small">Teams move on automatically when each game ends. {runsEvents ? 'Tap a game to set its time and field — you can do this before the teams are known.' : ''}</T>
            {runsEvents ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label="Check results"
                  icon="refresh"
                  onPress={async () => {
                    const made = await fillBracketNow(db, eventId);
                    Alert.alert(made ? `${made} new game${made > 1 ? 's' : ''} added` : 'Nothing new yet', made ? undefined : openPoolGames ? `${openPoolGames} pool game${openPoolGames > 1 ? 's' : ''} still to finish.` : undefined);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Remove"
                  icon="delete-outline"
                  kind="danger"
                  onPress={() =>
                    Alert.alert('Remove the playoff bracket?', 'Unplayed playoff games are removed too. Played ones stay.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => deleteBracket(db, eventId) },
                    ])
                  }
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}
          </>
        ) : !runsEvents ? (
          <Card>
            <T v="small">The coordinator hasn’t set up the playoffs yet.</T>
          </Card>
        ) : (
          <>
            <T v="small">
              Teams are seeded from the round robin / Swiss / pool games{openPoolGames ? ` — ${openPoolGames} still to play, so the first games appear once those finish` : ''}. Odd numbers get byes for the top seeds.
            </T>
            <Section title="Who’s in">
              <Segmented
                value={size}
                onChange={setSize}
                options={[
                  { value: '4', label: 'Top 4' },
                  { value: '8', label: 'Top 8' },
                  { value: 'all', label: `All ${teams.length}` },
                ]}
              />
            </Section>
            <Section title="Seeded by">
              <Choice label="Standings" sublabel="1 v 4, 2 v 3 … from the overall table" selected={mode === 'standings'} onPress={() => setMode('standings')} tall style={{ alignItems: 'flex-start' }} />
              {pools.length > 1 ? (
                <Choice label="Pool positions (crossovers)" sublabel="A1, B1, A2, B2 … so pool winners meet runners-up" selected={mode === 'pools'} onPress={() => setMode('pools')} tall style={{ alignItems: 'flex-start' }} />
              ) : null}
              <Choice label="Seeds (straight knockout)" sublabel="Your seeding order from Edit event — no pool play needed" selected={mode === 'seed'} onPress={() => setMode('seed')} tall style={{ alignItems: 'flex-start' }} />
            </Section>
            <Section title="Placings">
              <Segmented
                value={full ? 'full' : 'top'}
                onChange={(v) => setFull(v === 'full')}
                options={[
                  { value: 'top', label: 'Winners + 3rd place' },
                  { value: 'full', label: 'Every team placed' },
                ]}
              />
              <T v="small">{full ? 'Losing teams keep playing for 5th–8th, 9th–16th … so everyone finishes with a place.' : 'Only the top places are played for; everyone else is ranked by the standings.'}</T>
            </Section>
            {preview.length ? (
              <Card style={{ backgroundColor: colors.brandTint, borderColor: colors.brandTint }}>
                <T v="smallStrong">{preview.length} playoff games</T>
                <T v="small">{Array.from(new Set(preview.map((p) => p.group))).join(' · ')}</T>
              </Card>
            ) : null}
            <Button label="Create bracket" icon="tournament" kind="primary" big onPress={create} />
          </>
        )}
      </Screen>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.slot.name ?? ''}>
        {editing ? (
          <SlotSchedule
            key={editing.slot.id}
            slot={editing.slot}
            game={editing.game}
            onSave={async (at, venueId) => {
              await scheduleSlot(db, editing.slot.id, at, venueId);
              setEditing(null);
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function SlotSchedule({ slot, game, onSave }: { slot: BracketSlotRow; game?: GameListItem; onSave: (at: string | null, venueId: string | null) => void }) {
  const at0 = game?.scheduled_at ?? slot.scheduled_at;
  const [date, setDate] = useState(localDmy(at0));
  const [time, setTime] = useState(at0 ? timeOfDay(at0) : '09:00');
  const [venueId, setVenueId] = useState(game?.venue_id ?? slot.venue_id);
  return (
    <>
      {game ? (
        <Button
          label={game.status === 'final' ? 'Open report' : game.status === 'live' ? 'Open live game' : 'Open game'}
          icon="open-in-new"
          onPress={() => router.push(game.status === 'scheduled' ? `/game/${game.id}/fixture` : game.status === 'live' ? `/game/${game.id}` : `/game/${game.id}/report`)}
        />
      ) : (
        <T v="small">Teams not known yet. Set the time and field now and the game gets them automatically.</T>
      )}
      {game?.status !== 'final' && game?.status !== 'live' ? (
        <>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1.4 }}>
              <DateField label="Date" value={date} onChangeText={setDate} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Time" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <FieldPicker value={venueId} onChange={setVenueId} />
          <Button
            label="Save time and field"
            kind="primary"
            onPress={() => {
              let at: string | null = null;
              if (date) {
                const iso = dmyToIso(date);
                if (!iso || !/^\d{1,2}:\d{2}$/.test(time)) return Alert.alert('Check the date and time', 'Use dd/mm/yyyy and HH:MM.');
                const [hh, mm] = time.split(':').map(Number);
                const d = new Date(`${iso}T00:00:00`);
                d.setHours(hh, mm, 0, 0);
                at = d.toISOString();
              }
              onSave(at, venueId);
            }}
          />
        </>
      ) : null}
    </>
  );
}
