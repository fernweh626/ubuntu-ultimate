import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/db/live';
import { listPeople, savePerson } from '@/db/repo';
import type { Gender } from '@/db/types';
import { displayName } from '@/domain/format';

import { Button, Card, Choice, Field, Section, Segmented, Sheet, T, TeamSwatch } from './components';
import { MatchingGroups, PosTag } from './roster';
import { colors, space } from './theme';

export type Sides = { light: string[]; dark: string[] };
const SIDES = [
  { key: 'light', name: 'Light', color: '#E9ECEF' },
  { key: 'dark', name: 'Dark', color: '#293750' },
] as const;

/** Light v Dark for a scrimmage or pickup: add anyone (or a new name) to either side. */
export function ScrimmagePicker({ value, onChange }: { value: Sides; onChange: (v: Sides) => void }) {
  const db = useSQLiteContext();
  const people = useData(listPeople) ?? [];
  const [adding, setAdding] = useState<'light' | 'dark' | null>(null);
  const [q, setQ] = useState('');
  const [gender, setGender] = useState<Gender>('W');
  const taken = new Set([...value.light, ...value.dark]);
  const s = q.trim().toLowerCase();
  const found = s.length >= 2 ? people.filter((p) => !taken.has(p.id) && `${p.first_name} ${p.last_name} ${p.nickname ?? ''}`.toLowerCase().includes(s)).slice(0, 8) : [];
  const add = (side: 'light' | 'dark', id: string) => onChange({ ...value, [side]: [...value[side], id] });
  const remove = (id: string) => onChange({ light: value.light.filter((x) => x !== id), dark: value.dark.filter((x) => x !== id) });
  const swap = (id: string) => (value.light.includes(id) ? onChange({ light: value.light.filter((x) => x !== id), dark: [...value.dark, id] }) : onChange({ dark: value.dark.filter((x) => x !== id), light: [...value.light, id] }));

  return (
    <>
      {SIDES.map((side) => {
        const list = people.filter((p) => value[side.key].includes(p.id));
        return (
          <Section
            key={side.key}
            title={`${side.name} · ${list.length} · ${list.filter((p) => p.gender === 'W').length}F ${list.filter((p) => p.gender === 'M').length}M`}
            action={<Button label="Add" icon="account-plus" kind="ghost" onPress={() => setAdding(side.key)} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
            {list.length ? (
              <View style={{ gap: space.sm }}>
                <MatchingGroups
                  inline
                  list={list}
                  render={(p) => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <TeamSwatch color={side.color} size="sm" />
                      <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                        {displayName(p)}
                      </T>
                      <PosTag position={p.position} />
                      <Button label={side.key === 'light' ? '→ Dark' : '→ Light'} kind="ghost" onPress={() => swap(p.id)} style={{ minHeight: 32, paddingHorizontal: 6 }} />
                      <Button label="✕" kind="ghost" onPress={() => remove(p.id)} accessibilityLabel={`Remove ${p.first_name}`} style={{ minHeight: 32, paddingHorizontal: 6 }} />
                    </View>
                  )}
                />
              </View>
            ) : (
              <Card onPress={() => setAdding(side.key)}>
                <T v="small">Nobody on {side.name} yet. Tap to add who’s playing.</T>
              </Card>
            )}
          </Section>
        );
      })}

      <Sheet visible={!!adding} onClose={() => { setAdding(null); setQ(''); }} title={`Add to ${adding === 'dark' ? 'Dark' : 'Light'}`}>
        <Field label="Name" value={q} onChangeText={setQ} placeholder="Search, or type a new name" autoFocus />
        {found.map((p) => (
          <Choice key={p.id} label={displayName(p)} sublabel={p.gender === 'W' ? 'Female matching' : p.gender === 'M' ? 'Male matching' : undefined} onPress={() => { add(adding!, p.id); setQ(''); }} style={{ alignItems: 'flex-start' }} />
        ))}
        {s.length >= 2 ? (
          <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.md }}>
            <T v="small">Not in the app yet? Add “{q.trim()}” for this game:</T>
            <Segmented
              value={gender}
              onChange={setGender}
              options={[
                { value: 'W', label: 'Female matching' },
                { value: 'M', label: 'Male matching' },
              ]}
            />
            <Button
              label={`Add ${q.trim()}`}
              icon="account-plus"
              onPress={async () => {
                const [first, ...rest] = q.trim().split(/\s+/);
                const id = await savePerson(db, { first_name: first, last_name: rest.join(' '), gender, is_placeholder: 1 });
                add(adding!, id);
                setQ('');
              }}
            />
          </View>
        ) : null}
        <Button label="Done" kind="primary" onPress={() => { setAdding(null); setQ(''); }} />
      </Sheet>
    </>
  );
}
