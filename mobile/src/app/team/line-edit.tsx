import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { deleteLine, roster, saveLine, savedLines } from '@/db/repo';
import type { SavedLine } from '@/db/types';
import { shortName } from '@/domain/format';
import { Button, Choice, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { space } from '@/ui/theme';

export default function LineEdit() {
  const { teamId, id } = useLocalSearchParams<{ teamId: string; id?: string }>();
  const db = useSQLiteContext();
  const players = useData((d) => roster(d, teamId), [teamId]) ?? [];
  const [name, setName] = useState('');
  const [side, setSide] = useState<SavedLine['side']>('any');
  const [members, setMembers] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    savedLines(db, teamId).then((ls) => {
      const l = ls.find((x) => x.id === id);
      if (l) {
        setName(l.name);
        setSide(l.side);
        setMembers(l.member_ids);
      }
    });
  }, [db, id, teamId]);

  const toggle = (pid: string) => setMembers((m) => (m.includes(pid) ? m.filter((x) => x !== pid) : [...m, pid]));
  const chosen = players.filter((p) => members.includes(p.id));
  const women = chosen.filter((p) => p.gender === 'W').length;
  const men = chosen.filter((p) => p.gender === 'M').length;

  async function save() {
    if (!name.trim()) return Alert.alert('Give the line a name', 'For example “Super O” or “Zone D”.');
    await saveLine(db, teamId, name, side, members, id);
    router.back();
  }

  function remove() {
    if (!id) return;
    Alert.alert('Delete this saved line?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLine(db, id);
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit saved line' : 'New saved line' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={`Save line · ${members.length} players`} kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Super O, Zone D, Endzone O…" />
        <Section title="Use for">
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: 'O', label: 'Offence' },
              { value: 'D', label: 'Defence' },
              { value: 'any', label: 'Either' },
            ]}
          />
        </Section>
        <Section title={`Players · ${women} W · ${men} M`}>
          <T v="small">Pick as many as you like — extras become the first subs when someone is tired.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {players.map((p) => (
              <Choice
                key={p.id}
                label={shortName(p)}
                sublabel={[p.jersey_number ? `#${p.jersey_number}` : null, p.gender, p.position?.slice(0, 1).toUpperCase()].filter(Boolean).join(' · ')}
                selected={members.includes(p.id)}
                onPress={() => toggle(p.id)}
                style={{ width: '31.5%' }}
              />
            ))}
          </View>
        </Section>
        {id ? <Button label="Delete line" kind="danger" icon="delete-outline" onPress={remove} /> : null}
      </Screen>
    </>
  );
}
