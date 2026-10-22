import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { useData } from '@/db/live';
import {
  deleteGame,
  forfeitGame,
  getAccess,
  getEvent,
  getGameListItem,
  getVenue,
  postponeGame,
  statusLog,
  updateFixture,
} from '@/db/repo';
import { canPostpone, postponeRuleText, STATUS_REASONS, type StatusReason } from '@/domain/fixtures';
import { dmyTimeToIso as toIso, localDmy, shortDate, timeOfDay } from '@/domain/format';
import { Button, Card, Chip, Choice, DateField, Field, IconButton, Screen, Section, Sheet, T, TeamSwatch } from '@/ui/components';
import { FieldPicker } from '@/ui/field-picker';
import { colors, space } from '@/ui/theme';

export default function Fixture() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const g = await getGameListItem(d, id);
      if (!g) return null;
      const [event, venue, access, log] = await Promise.all([
        g.event_id ? getEvent(d, g.event_id) : Promise.resolve(null),
        g.venue_id ? getVenue(d, g.venue_id) : Promise.resolve(null),
        getAccess(d),
        statusLog(d, id),
      ]);
      return { g, event, venue, access, log };
    },
    [id],
  );
  const [sheet, setSheet] = useState<null | 'edit' | 'postpone' | 'forfeit'>(null);

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { g, event, venue, access, log } = bundle;
  if (g.status !== 'scheduled') return <Redirect href={g.status === 'live' ? `/game/${id}` : `/game/${id}/report`} />;
  const homeId = g.home_team_id ?? g.team_a_id;
  const awayId = homeId === g.team_a_id ? g.team_b_id : g.team_a_id;
  const name = (tid: string) => (tid === g.team_a_id ? g.a_name : g.b_name);
  const color = (tid: string) => (tid === g.team_a_id ? g.a_color : g.b_color);
  const runsEvents = access.level === 'admin' || access.level === 'coordinator';
  const actsFor = [homeId, awayId].filter((t) => runsEvents || access.staffTeamIds.includes(t));
  const canStart = access.level !== 'player' || actsFor.length > 0;
  const postponeOk = canPostpone(event?.kind, g.postponements);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Fixture',
          headerRight: () => (runsEvents ? <IconButton icon="pencil" label="Edit fixture" onPress={() => setSheet('edit')} /> : null),
        }}
      />
      <Screen edges={[]}>
        <Card>
          <T v="label">{event?.name ?? 'Game'}</T>
          <T v="title">{g.scheduled_at ? `${shortDate(g.scheduled_at)} · ${timeOfDay(g.scheduled_at)}` : 'Date to be confirmed'}</T>
          {venue ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T>{venue.name}</T>
              <Button
                label="Map"
                icon="map-marker"
                kind="ghost"
                onPress={() =>
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.latitude != null ? `${venue.latitude},${venue.longitude}` : venue.name)}`,
                  )
                }
              />
            </View>
          ) : (
            <T v="small">Field not set yet</T>
          )}
          {g.postponements ? <Chip label={`Postponed ${g.postponements} of 2`} tone="warn" /> : null}
        </Card>

        {[homeId, awayId].map((t) => (
          <Card key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <TeamSwatch color={color(t)} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{name(t)}</T>
              <T v="small">{t === homeId ? 'Home — sets up the field (cones, discs, lines)' : 'Away'}</T>
            </View>
            {t === homeId ? <Chip label="Home" /> : null}
          </Card>
        ))}

        {canStart ? (
          <Button label="Start this game" icon="whistle" kind="primary" big onPress={() => router.push({ pathname: '/game/new', params: { fixtureId: id } })} />
        ) : (
          <T v="small">A scorekeeper or team staff starts this game on the day.</T>
        )}

        {actsFor.length ? (
          <Section title="Can’t make it?">
            <T v="small">{postponeRuleText(event?.kind, g.postponements)}</T>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {postponeOk ? <Button label="Postpone" icon="calendar-arrow-right" onPress={() => setSheet('postpone')} style={{ flex: 1 }} /> : null}
              <Button label="Forfeit" icon="flag-outline" kind="danger" onPress={() => setSheet('forfeit')} style={{ flex: 1 }} />
            </View>
          </Section>
        ) : null}

        {log.length ? (
          <Section title="History">
            <Card>
              {log.map((l) => (
                <View key={l.id} style={{ paddingVertical: 4 }}>
                  <T v="smallStrong">
                    {l.action === 'postpone' ? 'Postponed' : l.action === 'forfeit' ? 'Forfeited' : 'Rescheduled'}
                    {l.team_id ? ` by ${name(l.team_id)}` : ''}
                    {l.reason ? ` · ${STATUS_REASONS[l.reason]}` : ''}
                  </T>
                  <T v="small">
                    {[l.note, l.previous_scheduled_at ? `was ${shortDate(l.previous_scheduled_at)} ${timeOfDay(l.previous_scheduled_at)}` : null, `on ${shortDate(l.created_at)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </T>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {runsEvents ? (
          <Button
            label="Delete fixture"
            icon="delete-outline"
            kind="danger"
            onPress={() =>
              Alert.alert('Delete this fixture?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteGame(db, id);
                    router.back();
                  },
                },
              ])
            }
          />
        ) : null}
      </Screen>

      <Sheet visible={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit fixture">
        {sheet === 'edit' ? (
          <EditFixture
            initial={{ scheduledAt: g.scheduled_at, venueId: g.venue_id, homeId, awayId }}
            names={{ [homeId]: name(homeId), [awayId]: name(awayId) }}
            onSave={async (f) => {
              await updateFixture(db, id, f);
              setSheet(null);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet visible={sheet === 'postpone' || sheet === 'forfeit'} onClose={() => setSheet(null)} title={sheet === 'postpone' ? 'Postpone game' : 'Forfeit game'}>
        {sheet === 'postpone' || sheet === 'forfeit' ? (
          <StatusForm
            action={sheet}
            teams={actsFor.map((t) => ({ id: t, name: name(t) }))}
            onSubmit={async (teamId, reason, note, newAt) => {
              try {
                if (sheet === 'postpone') await postponeGame(db, id, teamId, reason, note, newAt);
                else {
                  await forfeitGame(db, id, teamId, reason, note);
                  router.replace(`/game/${id}/report`);
                }
                setSheet(null);
              } catch (e) {
                Alert.alert('Not possible', (e as Error).message);
              }
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function EditFixture({
  initial,
  names,
  onSave,
}: {
  initial: { scheduledAt: string | null; venueId: string | null; homeId: string; awayId: string };
  names: Record<string, string>;
  onSave: (f: { scheduledAt: string | null; venueId: string | null; homeId: string; awayId: string }) => void;
}) {
  const [date, setDate] = useState(localDmy(initial.scheduledAt));
  const [time, setTime] = useState(initial.scheduledAt ? timeOfDay(initial.scheduledAt) : '18:00');
  const [venueId, setVenueId] = useState(initial.venueId);
  const [home, setHome] = useState(initial.homeId);
  const away = home === initial.homeId ? initial.awayId : initial.homeId;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1.4 }}>
          <DateField label="Date (blank = TBC)" value={date} onChangeText={setDate} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Time" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholder="18:00" />
        </View>
      </View>
      <T v="label">Home team (sets up the field)</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {[initial.homeId, initial.awayId].map((t) => (
          <Choice key={t} label={names[t]} selected={home === t} onPress={() => setHome(t)} style={{ flex: 1 }} />
        ))}
      </View>
      <T v="label">Field</T>
      <FieldPicker value={venueId} onChange={setVenueId} />
      <Button
        label="Save"
        kind="primary"
        onPress={() => {
          const at = date ? toIso(date, time) : null;
          if (date && !at) return Alert.alert('Check the date and time', 'Use dd/mm/yyyy and HH:MM.');
          onSave({ scheduledAt: at, venueId, homeId: home, awayId: away });
        }}
      />
    </>
  );
}

function StatusForm({
  action,
  teams,
  onSubmit,
}: {
  action: 'postpone' | 'forfeit';
  teams: { id: string; name: string }[];
  onSubmit: (teamId: string, reason: StatusReason, note: string | null, newAt: string | null) => void;
}) {
  const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : '');
  const [reason, setReason] = useState<StatusReason | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  return (
    <>
      <T v="label">{action === 'postpone' ? 'Which team is asking?' : 'Which team can’t play?'}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {teams.map((t) => (
          <Choice key={t.id} label={t.name} selected={teamId === t.id} onPress={() => setTeamId(t.id)} style={{ flex: 1 }} />
        ))}
      </View>
      <T v="label">Reason</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {(Object.keys(STATUS_REASONS) as StatusReason[]).map((r) => (
          <Choice key={r} label={STATUS_REASONS[r]} selected={reason === r} onPress={() => setReason(r)} style={{ paddingHorizontal: 14 }} />
        ))}
      </View>
      <Field label={reason === 'other' ? 'Reason (required)' : 'Note (optional)'} value={note} onChangeText={setNote} multiline />
      {action === 'postpone' ? (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1.4 }}>
            <DateField label="New date (blank = TBC)" value={date} onChangeText={setDate} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
      ) : (
        <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
          <T v="small" style={{ color: colors.warnInk }}>
            The game is recorded as a loss for the team that forfeits, at the target score to 0.
          </T>
        </Card>
      )}
      <Button
        label={action === 'postpone' ? 'Postpone game' : 'Forfeit game'}
        kind={action === 'postpone' ? 'primary' : 'danger'}
        big
        onPress={() => {
          if (!teamId) return Alert.alert('Choose the team');
          if (!reason) return Alert.alert('Choose a reason');
          if (reason === 'other' && !note.trim()) return Alert.alert('Add the reason', 'Say why in the note.');
          const at = date ? toIso(date, time) : null;
          if (date && !at) return Alert.alert('Check the new date', 'Use dd/mm/yyyy and HH:MM.');
          onSubmit(teamId, reason, note.trim() || null, at);
        }}
      />
    </>
  );
}
