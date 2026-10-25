import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { Competition, TimelineItem } from '@/db/home';
import { timeOfDay } from '@/domain/format';

import { Chip, Icon, T } from './components';
import { KindIcon } from './kind-icon';
import { colors, font, space } from './theme';

/** A league, tournament or pickup you're in: name, what's next, where. */
export function CompetitionCard({ c }: { c: Competition }) {
  return (
    <Pressable
      onPress={() => router.push(c.kind === 'event' ? `/event/${c.id}` : '/hub/pickups')}
      accessibilityRole="button"
      style={{ width: 200, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <View style={{ height: 6, backgroundColor: c.color }} />
      <View style={{ padding: space.md, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: colors.ink }}>
          {c.name}
        </Text>
        <T v="small" numberOfLines={1} style={{ color: colors.ink }}>
          {c.line1}
        </T>
        <T v="small" numberOfLines={1}>
          {c.line2}
        </T>
      </View>
    </Pressable>
  );
}

/** One thing on your timeline: kind icon, time, title, competition tag. */
export function TimelineRow({ it, first }: { it: TimelineItem; first: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(it.url as never)}
      accessibilityRole="button"
      style={{ flexDirection: 'row', gap: space.md, padding: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider, alignItems: 'center' }}>
      <KindIcon kind={it.kind} />
      <Text style={{ width: 52, fontFamily: font.display, fontSize: 20, color: colors.ink }}>{timeOfDay(it.at)}</Text>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {it.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          {it.tag ? <TagChip name={it.tag.name} color={it.tag.color} /> : null}
          {it.following ? <Chip label="Following" tone="neutral" /> : null}
          {it.subtitle ? (
            <T v="small" numberOfLines={1} style={{ flexShrink: 1 }}>
              {it.subtitle}
            </T>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-right" color={colors.faint} />
    </Pressable>
  );
}

/** Competition tag: coloured dot + name, so two leagues on the same day are easy to tell apart. */
function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 12, color }}>
        {name}
      </Text>
    </View>
  );
}
