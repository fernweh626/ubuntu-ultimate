import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import type { BracketSlotRow, GameListItem, SlotState } from '@/db/repo';
import { describeSource, NOBODY, type Source } from '@/domain/formats';
import { shortDate, timeOfDay } from '@/domain/format';

import { Button, T } from './components';
import { VideoLink } from './game-bits';
import { colors, DEFAULT_TEAM_COLOR, font, space } from './theme';

const W = 196;
const H = 82;
const COL_GAP = 40;
const ROW_GAP = 14;
const HEAD = 28;

type Placed = { slot: BracketSlotRow; x: number; y: number };

/** Lay out one group (Championship, 5th–8th …): rounds as columns, later games centred on the games feeding them. */
function layoutGroup(slots: BracketSlotRow[]) {
  const rounds = Array.from(new Set(slots.map((s) => s.round))).sort((a, b) => a - b);
  const placed = new Map<string, Placed>();
  rounds.forEach((r, col) => {
    let nextFree = HEAD;
    for (const sl of slots.filter((s) => s.round === r)) {
      const feeders = [JSON.parse(sl.source_a), JSON.parse(sl.source_b)]
        .filter((src: Source) => src.type === 'winner' && placed.has(src.slot))
        .map((src) => placed.get((src as { slot: string }).slot)!);
      let y = feeders.length === 2 ? (feeders[0].y + feeders[1].y) / 2 : nextFree;
      y = Math.max(y, nextFree);
      placed.set(sl.id, { slot: sl, x: col * (W + COL_GAP), y });
      nextFree = y + H + ROW_GAP;
    }
  });
  const items = [...placed.values()];
  const width = rounds.length * W + (rounds.length - 1) * COL_GAP;
  const height = Math.max(...items.map((p) => p.y + H)) + 4;
  return { items, width, height, placed };
}

export function BracketView({
  slots,
  state,
  games,
  teamName,
  teamColor,
  onSlotPress,
  title,
}: {
  slots: BracketSlotRow[];
  state: Map<string, SlotState>;
  games: GameListItem[];
  teamName: (id: string) => string;
  teamColor: (id: string) => string | null;
  onSlotPress: (slot: BracketSlotRow, game: GameListItem | undefined) => void;
  title: string;
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const shot = useRef<ComponentRef<typeof View>>(null);
  const slotName = (id: string) => slots.find((s) => s.id === id)?.name ?? 'earlier game';
  const groups = Array.from(new Set(slots.map((s) => s.grp ?? 'Championship')));

  async function share() {
    try {
      const uri = await captureRef(shot.current as never, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share bracket' });
    } catch (e) {
      Alert.alert('Could not create the image', String(e));
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="small" style={{ flex: 1 }}>
          {highlight ? `Showing ${teamName(highlight)}’s path · tap again to clear` : 'Tap a team to follow its path. Scroll sideways for later rounds.'}
        </T>
        <Button label="Share" icon="share-variant" kind="ghost" onPress={share} style={{ minHeight: 36, paddingHorizontal: 0 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: space.sm }}>
        <View ref={shot} collapsable={false} style={{ backgroundColor: colors.bg, padding: space.sm, gap: space.xl }}>
          <T style={{ fontFamily: font.display, fontSize: 22 }}>{title}</T>
          {groups.map((g) => {
            const { items, width, height, placed } = layoutGroup(slots.filter((s) => (s.grp ?? 'Championship') === g));
            return (
              <View key={g} style={{ gap: space.xs }}>
                <T v="label">{g === 'Championship' ? 'Championship' : `Playing for ${g}`}</T>
                <View style={{ width, height }}>
                  <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
                    {items.flatMap((p) =>
                      [JSON.parse(p.slot.source_a), JSON.parse(p.slot.source_b)]
                        .filter((src: Source) => src.type === 'winner' && placed.has(src.slot))
                        .map((src) => {
                          const from = placed.get((src as { slot: string }).slot)!;
                          const x1 = from.x + W;
                          const y1 = from.y + H / 2;
                          const x2 = p.x;
                          const y2 = p.y + H / 2;
                          const mid = x1 + COL_GAP / 2;
                          const winner = state.get(from.slot.id)?.winner;
                          const lit = !!highlight && winner === highlight;
                          return (
                            <Path key={`${from.slot.id}-${p.slot.id}`} d={`M${x1} ${y1} H${mid} V${y2} H${x2}`} stroke={lit ? colors.brand : colors.border} strokeWidth={lit ? 3 : 1.5} fill="none" />
                          );
                        }),
                    )}
                  </Svg>
                  {items.map((p) => {
                    const st = state.get(p.slot.id);
                    const game = p.slot.game_id ? games.find((x) => x.id === p.slot.game_id) : undefined;
                    const when = game?.scheduled_at ?? p.slot.scheduled_at;
                    const sides = [
                      { src: JSON.parse(p.slot.source_a) as Source, team: st?.a ?? null, score: game && game.status !== 'scheduled' ? (game.team_a_id === st?.a ? game.score_a : game.score_b) : null },
                      { src: JSON.parse(p.slot.source_b) as Source, team: st?.b ?? null, score: game && game.status !== 'scheduled' ? (game.team_a_id === st?.b ? game.score_a : game.score_b) : null },
                    ];
                    const involved = !!highlight && sides.some((s) => s.team === highlight);
                    return (
                      <Pressable
                        key={p.slot.id}
                        onPress={() => onSlotPress(p.slot, game)}
                        style={{
                          position: 'absolute',
                          left: p.x,
                          top: p.y,
                          width: W,
                          height: H,
                          backgroundColor: colors.surface,
                          borderRadius: 10,
                          borderWidth: involved ? 2.5 : 1,
                          borderColor: involved ? colors.brand : game?.status === 'live' ? colors.danger : colors.border,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          gap: 2,
                        }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <T style={{ fontFamily: font.semibold, fontSize: 11, color: colors.muted }} numberOfLines={1}>
                            {p.slot.name}
                          </T>
                          <T style={{ fontFamily: font.regular, fontSize: 11, color: game?.status === 'live' ? colors.danger : colors.muted }} numberOfLines={1}>
                            {game?.status === 'live' ? 'LIVE' : st?.walkover ? 'Bye' : when ? `${shortDate(when).slice(4)} ${timeOfDay(when)}` : 'Time TBC'}
                          </T>
                          {game?.video_url ? <VideoLink url={game.video_url} size={14} compact /> : null}
                        </View>
                        {sides.map((s, i) => {
                          const real = s.team && s.team !== NOBODY ? s.team : null;
                          const won = !!real && st?.winner === real;
                          return (
                            <Pressable
                              key={i}
                              disabled={!real}
                              onPress={() => setHighlight(highlight === real ? null : real)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                minHeight: 26,
                                borderRadius: 6,
                                backgroundColor: real && real === highlight ? colors.brandTint : 'transparent',
                              }}>
                              <View style={{ width: 6, height: 18, borderRadius: 2, backgroundColor: real ? teamColor(real) || DEFAULT_TEAM_COLOR : colors.divider }} />
                              <T numberOfLines={1} style={{ flex: 1, fontSize: 14, fontFamily: won ? font.bold : real ? font.semibold : font.regular, color: real ? colors.ink : colors.faint }}>
                                {real ? teamName(real) : s.team === NOBODY ? 'Bye' : describeSource(s.src, slotName)}
                              </T>
                              {s.score != null ? <T style={{ fontFamily: font.display, fontSize: 18, color: won ? colors.ink : colors.muted }}>{s.score}</T> : null}
                            </Pressable>
                          );
                        })}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
