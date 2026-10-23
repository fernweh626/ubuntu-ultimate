import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, T } from './components';
import { byMatching, posShort, type Matchable, type MatchingGroup } from '@/domain/roster';

import { colors, font, space } from './theme';

export { byMatching, posShort };

/** Small position pill: C, H or Hy. */
export function PosTag({ position }: { position: string | null | undefined }) {
  const s = posShort(position);
  if (!s) return null;
  return (
    <View accessibilityLabel={position ?? undefined} style={{ minWidth: 26, paddingHorizontal: 5, height: 20, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
      <T style={{ fontFamily: font.bold, fontSize: 11, color: colors.muted }}>{s}</T>
    </View>
  );
}

/** A group heading: ♀/♂, "Female matching · 12". */
export function MatchingHeader({ group, inline }: { group: MatchingGroup<unknown>; inline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: inline ? 0 : space.md, paddingVertical: 6, backgroundColor: inline ? 'transparent' : colors.bg }}>
      <Icon name={group.key === 'W' ? 'gender-female' : group.key === 'M' ? 'gender-male' : 'account'} size={16} color={group.color} />
      <T style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 0.6, color: group.color }}>
        {group.title.toUpperCase()} · {group.items.length}
      </T>
    </View>
  );
}

/** Render a list split into matching groups with headings. */
export function MatchingGroups<P extends Matchable>({ list, keepOrder, render, inline }: { list: P[]; keepOrder?: boolean; render: (p: P) => ReactNode; inline?: boolean }) {
  return (
    <>
      {byMatching(list, keepOrder).map((g) => (
        <View key={g.key} style={{ gap: inline ? space.sm : 1 }}>
          <MatchingHeader group={g} inline={inline} />
          {g.items.map(render)}
        </View>
      ))}
    </>
  );
}
