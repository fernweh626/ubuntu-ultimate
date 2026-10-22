import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { createSession, type SessionRow } from '@/db/repo';
import { dmyToIso, localDmy } from '@/domain/format';

import { Button, Choice, DateField, Field, Segmented, Sheet, T } from './components';
import { space } from './theme';

/**
 * Log a practice, pickup or other session, then go straight to its questionnaire.
 * `teams` = teams the person can log a practice for; `fixedTeamId` when started from a team page.
 */
export function LogSessionSheet({
  visible,
  onClose,
  meId,
  teams,
  fixedTeamId,
}: {
  visible: boolean;
  onClose: () => void;
  meId: string;
  teams: { id: string; name: string }[];
  fixedTeamId?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Log a session">
      {visible ? <LogForm onClose={onClose} meId={meId} teams={teams} fixedTeamId={fixedTeamId} /> : null}
    </Sheet>
  );
}

function LogForm({ onClose, meId, teams, fixedTeamId }: { onClose: () => void; meId: string; teams: { id: string; name: string }[]; fixedTeamId?: string }) {
  const db = useSQLiteContext();
  const [kind, setKind] = useState<SessionRow['kind']>(fixedTeamId ? 'practice' : 'pickup');
  const [teamId, setTeamId] = useState<string | null>(fixedTeamId ?? teams[0]?.id ?? null);
  const [date, setDate] = useState(() => localDmy(new Date().toISOString()));
  const [time, setTime] = useState('18:00');
  const [minutes, setMinutes] = useState('90');
  const [title, setTitle] = useState('');

  async function save() {
    const iso = dmyToIso(date);
    if (!iso || !/^\d{1,2}:\d{2}$/.test(time)) return Alert.alert('Check the date and time', 'Use dd/mm/yyyy and HH:MM.');
    const mins = Number(minutes);
    if (!mins) return Alert.alert('How long was it?', 'Add the minutes.');
    if (kind === 'practice' && !teamId) return Alert.alert('Which team’s practice?');
    const [hh, mm] = time.split(':').map(Number);
    const start = new Date(`${iso}T00:00:00`);
    start.setHours(hh, mm, 0, 0);
    const id = await createSession(db, {
      kind,
      teamId: kind === 'practice' ? teamId : null,
      title: title.trim() || null,
      startedAt: start.toISOString(),
      durationMin: mins,
      venueId: null,
      createdById: meId,
    });
    onClose();
    router.push({ pathname: '/reflect', params: { sessionId: id } });
  }

  return (
    <>
      {!fixedTeamId ? (
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'practice', label: 'Practice' },
            { value: 'pickup', label: 'Pickup' },
            { value: 'other', label: 'Other' },
          ]}
        />
      ) : null}
      {kind === 'practice' && !fixedTeamId ? (
        teams.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {teams.map((t) => (
              <Choice key={t.id} label={t.name} selected={teamId === t.id} onPress={() => setTeamId(t.id)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        ) : (
          <T v="small">Join a team first to log its practices.</T>
        )
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1.4 }}>
          <DateField label="Date" value={date} onChangeText={setDate} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Start" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Minutes" value={minutes} onChangeText={(v) => setMinutes(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
        </View>
      </View>
      <Field label="Name (optional)" value={title} onChangeText={setTitle} placeholder={kind === 'pickup' ? 'e.g. Green Point Tuesday' : kind === 'other' ? 'e.g. Throwing session' : 'e.g. Zone D practice'} />
      <Button label="Save and answer questions" kind="primary" big onPress={save} />
    </>
  );
}
