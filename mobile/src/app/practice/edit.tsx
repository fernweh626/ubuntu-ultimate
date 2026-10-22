import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { getAccess, getSession, getTeam, schedulePractices, updatePractice } from '@/db/repo';
import { dmyTimeToIso, localDmy, shortDate, timeOfDay } from '@/domain/format';
import { Button, DateField, Field, Footer, Screen, Segmented, T } from '@/ui/components';
import { FieldPicker } from '@/ui/field-picker';
import { space } from '@/ui/theme';

const DURATIONS = [
  { value: '60', label: '1 h' },
  { value: '90', label: '1 h 30' },
  { value: '120', label: '2 h' },
];
const REPEAT = [
  { value: '1', label: 'Once' },
  { value: '4', label: '4 weeks' },
  { value: '8', label: '8 weeks' },
  { value: '12', label: '12 weeks' },
];

/** Team staff schedule (or edit) a practice. Weekly repeats make one practice per week, each cancellable. */
export default function PracticeEdit() {
  const { teamId, id } = useLocalSearchParams<{ teamId: string; id?: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => ({ team: await getTeam(d, teamId), existing: id ? await getSession(d, id) : null, access: await getAccess(d) }),
    [teamId, id],
  );
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  return <Form key={id ?? 'new'} db={db} teamId={teamId} teamName={bundle.team?.name ?? ''} existing={bundle.existing} meId={bundle.access.meId} />;
}

function Form({
  db,
  teamId,
  teamName,
  existing,
  meId,
}: {
  db: ReturnType<typeof useSQLiteContext>;
  teamId: string;
  teamName: string;
  existing: Awaited<ReturnType<typeof getSession>>;
  meId: string | null;
}) {
  const [date, setDate] = useState(existing ? localDmy(existing.started_at) : '');
  const [time, setTime] = useState(existing ? timeOfDay(existing.started_at) : '18:00');
  const [duration, setDuration] = useState(String(existing?.duration_min ?? 90));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [venueId, setVenueId] = useState<string | null>(existing?.venue_id ?? null);
  const [repeat, setRepeat] = useState('1');
  const [saving, setSaving] = useState(false);

  async function save() {
    const at = dmyTimeToIso(date, time);
    if (!at) return Alert.alert('Check the date and time', 'Use dd/mm/yyyy and HH:MM, e.g. 28/10/2026 and 18:00.');
    setSaving(true);
    const fields = { title: title.trim() || null, notes: notes.trim() || null, startAt: at, durationMin: Number(duration), venueId };
    try {
      if (existing) {
        await updatePractice(db, existing.id, fields);
        router.back();
      } else {
        const first = await schedulePractices(db, { ...fields, teamId, createdById: meId }, Number(repeat));
        router.replace(`/practice/${first}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const at = dmyTimeToIso(date, time);
  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit practice' : `Schedule practice · ${teamName}` }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={existing ? 'Save changes' : Number(repeat) > 1 ? `Schedule ${repeat} practices` : 'Schedule practice'} kind="primary" big onPress={save} disabled={saving} />
          </Footer>
        }>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1.4 }}>
            <DateField label="Date" value={date} onChangeText={setDate} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Start" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholder="18:00" />
          </View>
        </View>
        <T v="smallStrong">How long</T>
        <Segmented value={duration} onChange={setDuration} options={DURATIONS} />
        {!existing ? (
          <>
            <T v="smallStrong">Repeat weekly</T>
            <Segmented value={repeat} onChange={setRepeat} options={REPEAT} />
            {at && Number(repeat) > 1 ? (
              <T v="small">
                Every {shortDate(at).split(' ')[0]} at {time} until {shortDate(new Date(new Date(at).getTime() + (Number(repeat) - 1) * 7 * 86400_000).toISOString())}. You can cancel single weeks later.
              </T>
            ) : null}
          </>
        ) : null}
        <Field label="Focus (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Zone D, hucks, fitness" />
        <T v="smallStrong">Field</T>
        <FieldPicker value={venueId} onChange={setVenueId} />
        <Field label="Notes for the squad (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Bring a light and a dark shirt, cones, water…" />
      </Screen>
    </>
  );
}
