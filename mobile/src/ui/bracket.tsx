import { router } from 'expo-router';
import { View } from 'react-native';

import type { BracketSlotRow, GameListItem } from '@/db/repo';
import { describeSource, type Source } from '@/domain/formats';
import { shortDate, timeOfDay } from '@/domain/format';

import { Card, Chip, T, TeamSwatch } from './components';
import { colors, font, space } from './theme';

/** Playoff slots by round. Undecided sides read "Winner of Semi-final 1", "2nd Pool B", etc. */
export function BracketView({
  slots,
  games,
  teamName,
  teamColor,
}: {
  slots: BracketSlotRow[];
  games: GameListItem[];
  teamName: (id: string) => string;
  teamColor: (id: string) => string | null;
}) {
  const slotName = (id: string) => slots.find((s) => s.id === id)?.name ?? 'earlier game';
  const rounds = Array.from(new Set(slots.map((s) => s.round))).sort((a, b) => a - b);
  const maxRound = rounds[rounds.length - 1];
  const roundTitle = (r: number) => (r === maxRound ? 'Finals' : r === maxRound - 1 ? 'Semi-finals' : r === 1 ? 'First round' : `Round ${r}`);

  return (
    <View style={{ gap: space.lg }}>
      {rounds.map((r) => (
        <View key={r} style={{ gap: space.sm }}>
          <T v="label">{roundTitle(r)}</T>
          {slots
            .filter((s) => s.round === r)
            .map((s) => {
              const g = s.game_id ? games.find((x) => x.id === s.game_id) : undefined;
              const sides: { id: string | null; label: string; score: number | null; won: boolean }[] = g
                ? [
                    { id: g.team_a_id, label: g.a_name, score: g.status === 'scheduled' ? null : g.score_a, won: g.status === 'final' && g.score_a > g.score_b },
                    { id: g.team_b_id, label: g.b_name, score: g.status === 'scheduled' ? null : g.score_b, won: g.status === 'final' && g.score_b > g.score_a },
                  ]
                : [
                    { id: null, label: describeSource(JSON.parse(s.source_a) as Source, slotName), score: null, won: false },
                    { id: null, label: describeSource(JSON.parse(s.source_b) as Source, slotName), score: null, won: false },
                  ];
              return (
                <Card key={s.id} onPress={g ? () => router.push(g.status === 'scheduled' ? `/game/${g.id}/fixture` : g.status === 'live' ? `/game/${g.id}` : `/game/${g.id}/report`) : undefined}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T v="smallStrong">{s.name}</T>
                    {g?.status === 'live' ? (
                      <Chip label="LIVE" tone="danger" />
                    ) : g?.status === 'final' ? (
                      <Chip label="Final" tone="neutral" />
                    ) : g ? (
                      <T v="small">{g.scheduled_at ? `${shortDate(g.scheduled_at)} ${timeOfDay(g.scheduled_at)}` : 'Time TBC'}</T>
                    ) : (
                      <Chip label="Waiting" tone="neutral" />
                    )}
                  </View>
                  {sides.map((side, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 }}>
                      {side.id ? <TeamSwatch color={teamColor(side.id)} size="sm" /> : <View style={{ width: 8 }} />}
                      <T style={{ flex: 1, fontFamily: side.won ? font.bold : side.id ? font.semibold : font.regular, color: side.id ? colors.ink : colors.muted }} numberOfLines={1}>
                        {side.id ? teamName(side.id) || side.label : side.label}
                      </T>
                      {side.score != null ? <T style={{ fontFamily: font.display, fontSize: 20 }}>{side.score}</T> : null}
                    </View>
                  ))}
                </Card>
              );
            })}
        </View>
      ))}
    </View>
  );
}
