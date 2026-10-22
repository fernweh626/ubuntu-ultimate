import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Person } from '@/db/types';
import { displayName } from '@/domain/format';
import type { PlayerGameStats } from '@/domain/stats';

import { T } from './components';
import { colors, font, space } from './theme';

type Col = { key: keyof PlayerGameStats | 'turnovers'; label: string; title: string };

const COLS: Col[] = [
  { key: 'points', label: 'Pts', title: 'Points played' },
  { key: 'goals', label: 'G', title: 'Goals' },
  { key: 'assists', label: 'A', title: 'Assists' },
  { key: 'intercepts', label: 'I', title: 'Intercepts' },
  { key: 'turnovers', label: 'TO', title: 'Turnovers' },
  { key: 'plusMinus', label: '+/−', title: 'Plus/minus' },
];

const value = (s: PlayerGameStats, k: Col['key']) =>
  k === 'turnovers' ? s.drops + s.throwaways + s.stalls : (s[k] as number);

export function PlayerTable({
  rows,
  people,
  extra,
}: {
  rows: PlayerGameStats[];
  people: Map<string, Pick<Person, 'first_name' | 'last_name' | 'birth_date'>>;
  extra?: (s: PlayerGameStats) => string | null;
}) {
  const [sort, setSort] = useState<Col['key']>('plusMinus');
  const sorted = [...rows]
    .filter((r) => people.has(r.personId))
    .sort((a, b) => value(b, sort) - value(a, sort) || people.get(a.personId)!.first_name.localeCompare(people.get(b.personId)!.first_name));

  if (sorted.length === 0) return <T v="small">No player stats recorded.</T>;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.neutralTint, paddingHorizontal: space.md, minHeight: 40 }}>
        <T v="label" style={{ flex: 1 }}>
          Player
        </T>
        {COLS.map((c) => (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${c.title}`}
            onPress={() => setSort(c.key)}
            style={{ width: 38, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
            <T v="label" style={{ color: sort === c.key ? colors.brand : colors.muted }}>
              {c.label}
            </T>
          </Pressable>
        ))}
      </View>
      {sorted.map((r, i) => {
        const p = people.get(r.personId)!;
        const sub = extra?.(r);
        return (
          <Pressable
            key={r.personId}
            onPress={() => router.push(`/player/${r.personId}`)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space.md,
              minHeight: 48,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.divider,
              backgroundColor: pressed ? colors.neutralTint : colors.surface,
            })}>
            <View style={{ flex: 1, paddingVertical: 6 }}>
              <T v="smallStrong" numberOfLines={1}>
                {displayName(p)}
              </T>
              {sub ? <T style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>{sub}</T> : null}
            </View>
            {COLS.map((c) => (
              <T
                key={c.key}
                style={{
                  width: 38,
                  textAlign: 'center',
                  fontFamily: sort === c.key ? font.bold : font.regular,
                  fontSize: 15,
                  color: colors.ink,
                }}>
                {value(r, c.key)}
              </T>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}
