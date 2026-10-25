import { View } from 'react-native';

import { bestLines, completionRates, pct, per, perPoint, topPairs, type TeamAdvanced } from '@/domain/advanced-stats';
import type { PlayerGameStats } from '@/domain/stats';

import { Card, StatTile, T } from './components';
import { colors, font, space } from './theme';

type Name = (personId: string | null) => string;

/**
 * Full-mode stats for one team (one game or a whole season): possessions, conversion, pass chains,
 * favourite pass pairs, best seven together, and per-point rates for each player.
 */
export function AdvancedStats({ t, players, name }: { t: TeamAdvanced; players: PlayerGameStats[]; name: Name }) {
  const pairs = topPairs(t, 5);
  const lines = bestLines(t, 2, 3);
  const rows = players
    .filter((p) => p.points > 0)
    .map((p) => ({ p, pp: perPoint(p), cr: completionRates(p) }))
    .sort((a, b) => b.p.points - a.p.points);
  const fmt = (n: number | null) => (n == null ? '–' : n.toFixed(2).replace(/0$/, ''));

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <StatTile value={pct(t.scoringPossessions, t.possessions) != null ? `${pct(t.scoringPossessions, t.possessions)}%` : '–'} label="Possessions scored" />
        <StatTile value={pct(t.afterTurnScored, t.afterTurn) != null ? `${pct(t.afterTurnScored, t.afterTurn)}%` : '–'} label="Scored after a turn" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <StatTile value={fmt(per(t.passesInScoring, t.scoringPossessions))} label="Passes per goal" />
        <StatTile value={fmt(per(t.completions, t.possessions))} label="Passes per possession" />
        <StatTile value={t.longestChain} label="Longest chain" />
      </View>
      <T v="small">
        {t.possessions} possessions, {t.scoringPossessions} scored. “Scored after a turn” = got the disc back (a D or their turnover) and scored with it.
      </T>

      {pairs.length ? (
        <Card>
          <T v="smallStrong">Pass pairs (thrower → receiver)</T>
          {pairs.map((c) => (
            <View key={`${c.from}>${c.to}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <T style={{ flex: 1 }} numberOfLines={1}>
                {name(c.from)} → {name(c.to)}
              </T>
              <T v="bodyStrong">{c.count}</T>
            </View>
          ))}
        </Card>
      ) : null}

      {lines.length ? (
        <Card>
          <T v="smallStrong">Best seven on the field together</T>
          {lines.map((l) => (
            <View key={l.ids.join()} style={{ paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <T v="bodyStrong">
                {l.scored - l.conceded >= 0 ? '+' : ''}
                {l.scored - l.conceded} · {l.scored}–{l.conceded} in {l.played} points
              </T>
              <T v="small">{l.ids.map(name).join(', ')}</T>
            </View>
          ))}
        </Card>
      ) : null}

      {rows.length ? (
        <Card style={{ paddingHorizontal: 0 }}>
          <T v="smallStrong" style={{ paddingHorizontal: space.md }}>
            Per point played
          </T>
          <View style={{ flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: 4 }}>
            <T v="label" style={{ flex: 1 }}>
              Player
            </T>
            {['Pts', 'G', 'A', 'D', 'Turn', 'Thr %', 'Ctch %'].map((h) => (
              <T key={h} v="label" style={{ width: h.includes('%') ? 46 : 36, textAlign: 'center' }}>
                {h}
              </T>
            ))}
          </View>
          {rows.map(({ p, pp, cr }) => (
            <View key={p.personId} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 36, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <T v="small" numberOfLines={1} style={{ flex: 1, color: colors.ink, fontFamily: font.semibold }}>
                {name(p.personId)}
              </T>
              {[String(p.points), fmt(pp.goals), fmt(pp.assists), fmt(pp.ds), fmt(pp.turns), cr.throwing == null ? '–' : String(cr.throwing), cr.catching == null ? '–' : String(cr.catching)].map((v, i) => (
                <T key={i} v="small" style={{ width: i >= 5 ? 46 : 36, textAlign: 'center', color: colors.ink }}>
                  {v}
                </T>
              ))}
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
