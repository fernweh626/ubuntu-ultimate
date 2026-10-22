import { router } from 'expo-router';
import { View } from 'react-native';

import type { GameListItem } from '@/db/repo';
import { shortDate } from '@/domain/format';

import { Card, Chip, T, TeamSwatch } from './components';
import { colors, font, space } from './theme';

export function GameCard({ g }: { g: GameListItem }) {
  const live = g.status === 'live';
  const aWon = g.status === 'final' && g.score_a > g.score_b;
  const bWon = g.status === 'final' && g.score_b > g.score_a;
  return (
    <Card
      onPress={() => router.push(live ? `/game/${g.id}` : `/game/${g.id}/report`)}
      style={live ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {live ? <Chip label="LIVE" tone="danger" icon="circle" /> : <Chip label="Final" tone="neutral" />}
        <T v="small" numberOfLines={1} style={{ flexShrink: 1, marginLeft: space.sm }}>
          {[g.event_name, shortDate(g.started_at ?? g.created_at)].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <TeamSwatch color={g.a_color} />
          <T v="bodyStrong" numberOfLines={2} style={{ flex: 1, opacity: bWon ? 0.6 : 1 }}>
            {g.a_name}
          </T>
        </View>
        <T style={{ fontFamily: font.display, fontSize: 34, lineHeight: 38 }}>
          {g.score_a} – {g.score_b}
        </T>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'flex-end' }}>
          <T v="bodyStrong" numberOfLines={2} style={{ flex: 1, textAlign: 'right', opacity: aWon ? 0.6 : 1 }}>
            {g.b_name}
          </T>
          <TeamSwatch color={g.b_color} />
        </View>
      </View>
    </Card>
  );
}

export function FormDots({ form }: { form: ('W' | 'L' | 'D')[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {form.slice(-5).map((r, i) => (
        <View
          key={i}
          accessibilityLabel={r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: r === 'W' ? colors.brand : r === 'L' ? colors.warn : colors.faint,
          }}
        />
      ))}
    </View>
  );
}
