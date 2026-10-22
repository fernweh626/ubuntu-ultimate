import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { savePerson } from '@/db/repo';
import type { Gender } from '@/db/types';

import { Button, Field, Segmented, Sheet, T } from './components';
import { space } from './theme';

/** Add someone on the spot (late arrival, borrowed player, pickup regular) without leaving the screen. */
export function QuickAddPlayer({
  visible,
  teamId,
  teamName,
  onClose,
  onAdded,
}: {
  visible: boolean;
  teamId: string;
  teamName: string;
  onClose: () => void;
  onAdded: (personId: string) => void;
}) {
  const db = useSQLiteContext();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [number, setNumber] = useState('');
  const [gender, setGender] = useState<Gender>('W');
  const [kind, setKind] = useState<'core' | 'guest' | 'mercenary'>('guest');

  async function add() {
    if (!first.trim()) return Alert.alert('Add a first name');
    const id = await savePerson(
      db,
      { first_name: first, last_name: last, gender, preferred_number: number || null },
      { teamId, kind, jersey: number || null },
    );
    setFirst('');
    setLast('');
    setNumber('');
    onAdded(id);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={`Add to ${teamName}`}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="First name" value={first} onChangeText={setFirst} autoFocus />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last name" value={last} onChangeText={setLast} />
        </View>
      </View>
      <Field label="Number (optional)" value={number} onChangeText={(v) => setNumber(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
      <Segmented
        value={gender}
        onChange={setGender}
        options={[
          { value: 'W', label: 'Female matching' },
          { value: 'M', label: 'Male matching' },
          { value: 'X', label: 'Other' },
        ]}
      />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'core', label: 'Core' },
          { value: 'guest', label: 'Guest' },
          { value: 'mercenary', label: 'Mercenary' },
        ]}
      />
      <T v="small">They can complete their profile later; their stats stay attached to them.</T>
      <Button label="Add player" kind="primary" big onPress={add} />
    </Sheet>
  );
}
