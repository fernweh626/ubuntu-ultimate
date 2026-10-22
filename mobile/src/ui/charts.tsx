import { View } from 'react-native';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { PointSummary } from '@/domain/stats';

import { T } from './components';
import { colors, DEFAULT_TEAM_COLOR, font, space } from './theme';

/** Step chart of both teams' scores, point by point; halftime is shaded. */
export function ScoreProgression({
  timeline,
  aColor,
  bColor,
  aName,
  bName,
  width = 340,
  height = 140,
}: {
  timeline: PointSummary[];
  aColor: string | null;
  bColor: string | null;
  aName: string;
  bName: string;
  width?: number;
  height?: number;
}) {
  const done = timeline.filter((t) => t.scoringTeamId);
  if (done.length === 0) return <T v="small">The chart appears after the first goal.</T>;
  const max = Math.max(done[done.length - 1].scoreA, done[done.length - 1].scoreB, 1);
  const padL = 22;
  const padB = 16;
  const w = width - padL - 6;
  const h = height - padB - 6;
  const x = (i: number) => padL + (i / done.length) * w;
  const y = (v: number) => 6 + h - (v / max) * h;
  const steps = (key: 'scoreA' | 'scoreB') => {
    const pts: string[] = [`${x(0)},${y(0)}`];
    done.forEach((t, i) => {
      const prev = i === 0 ? 0 : done[i - 1][key];
      pts.push(`${x(i + 1)},${y(prev)}`, `${x(i + 1)},${y(t[key])}`);
    });
    return pts.join(' ');
  };
  const halfIndex = done.findIndex((t, i) => i > 0 && t.point.half === 2 && done[i - 1].point.half === 1);
  const ticks = Array.from(new Set([0, Math.round(max / 2), max]));
  return (
    <View style={{ gap: space.xs }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={`Score progression, ${aName} ${done[done.length - 1].scoreA}, ${bName} ${done[done.length - 1].scoreB}`}>
        {halfIndex > 0 ? <Rect x={x(halfIndex) - 2} y={6} width={4} height={h} fill={colors.divider} /> : null}
        {ticks.map((t) => (
          <SvgText key={t} x={padL - 6} y={y(t) + 4} fontSize={10} fill={colors.muted} textAnchor="end" fontFamily={font.regular}>
            {t}
          </SvgText>
        ))}
        <Line x1={padL} x2={width - 6} y1={6 + h} y2={6 + h} stroke={colors.border} />
        <Polyline points={steps('scoreA')} fill="none" stroke={aColor || DEFAULT_TEAM_COLOR} strokeWidth={2.5} />
        <Polyline points={steps('scoreB')} fill="none" stroke={bColor || colors.faint} strokeWidth={2.5} strokeDasharray="6 3" />
      </Svg>
      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <T v="small">━ {aName}</T>
        <T v="small">╍ {bName}</T>
        {halfIndex > 0 ? <T v="small">▮ Half</T> : null}
      </View>
    </View>
  );
}

/** Horizontal bars, scaled to the largest value. */
export function Bars({ rows }: { rows: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <T v="small" style={{ width: 92, color: colors.ink }}>
            {r.label}
          </T>
          <View style={{ flex: 1, height: 12, backgroundColor: colors.neutralTint, borderRadius: 6 }}>
            <View style={{ width: `${(r.value / max) * 100}%`, height: 12, borderRadius: 6, backgroundColor: r.color ?? colors.brand }} />
          </View>
          <T v="smallStrong" style={{ width: 28, textAlign: 'right' }}>
            {r.value}
          </T>
        </View>
      ))}
    </View>
  );
}
