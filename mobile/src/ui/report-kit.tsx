import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import type { PacePoint } from '@/domain/report';

import { font } from './theme';

/*
 * Building blocks for report pages. Pages are a fixed 380 × ≥475 design (4:5, Instagram-friendly) so the
 * saved images look the same on every phone; they're captured at the screen's pixel density.
 */

export const PAGE_W = 380;

export type Tone = 'team' | 'dark' | 'paper';

export const ACCENT = '#F0A27E';
const NIGHT = '#1E2A40';
const PAPER = '#F7F5F0';

export function palette(tone: Tone, teamColor?: string | null) {
  if (tone === 'paper') return { bg: PAPER, ink: '#141414', muted: '#5C5C55', accent: teamColor || '#B4532C', card: '#ECE9E1', line: '#D8D4CA' };
  if (tone === 'team') return { bg: teamColor || '#293750', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)', accent: '#FFFFFF', card: 'rgba(0,0,0,0.22)', line: 'rgba(255,255,255,0.25)' };
  return { bg: NIGHT, ink: '#F4F4EF', muted: '#A5ABA6', accent: ACCENT, card: '#2A3954', line: '#34435F' };
}

type PageProps = { tone: Tone; teamColor?: string | null; header: string; index: number; total: number; children: ReactNode };

export const Page = forwardRef<ComponentRef<typeof View>, PageProps>(function Page({ tone, teamColor, header, index, total, children }, ref) {
  const p = palette(tone, teamColor);
  return (
    <View ref={ref} collapsable={false} style={{ width: PAGE_W, minHeight: PAGE_W * 1.25, backgroundColor: p.bg, padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 10, letterSpacing: 1.5, color: p.muted }}>{header.toUpperCase()}</Text>
        <Text style={{ fontFamily: font.semibold, fontSize: 10, letterSpacing: 1.5, color: p.muted }}>
          {index} / {total}
        </Text>
      </View>
      {children}
      <View style={{ flex: 1 }} />
      <Text style={{ fontFamily: font.display, fontSize: 11, letterSpacing: 2, color: p.muted, textAlign: 'right' }}>UBUNTU ULTIMATE</Text>
    </View>
  );
});

export function Kicker({ tone, children, teamColor }: { tone: Tone; children: string; teamColor?: string | null }) {
  return <Text style={{ fontFamily: font.bold, fontSize: 11, letterSpacing: 2.5, color: palette(tone, teamColor).accent }}>{children.toUpperCase()}</Text>;
}

export function Headline({ tone, children, size = 34, teamColor }: { tone: Tone; children: string; size?: number; teamColor?: string | null }) {
  return <Text style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 0.95, color: palette(tone, teamColor).ink, textTransform: 'uppercase' }}>{children}</Text>;
}

export function Body({ tone, children, style, teamColor }: { tone: Tone; children: ReactNode; style?: TextStyle; teamColor?: string | null }) {
  return <Text style={[{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: palette(tone, teamColor).muted }, style]}>{children}</Text>;
}

export function BigStat({ tone, value, label, teamColor, size = 44 }: { tone: Tone; value: string | number; label: string; teamColor?: string | null; size?: number }) {
  const p = palette(tone, teamColor);
  return (
    <View>
      <Text style={{ fontFamily: font.display, fontSize: size, lineHeight: size, color: p.ink }}>{value}</Text>
      <Text style={{ fontFamily: font.medium, fontSize: 10, letterSpacing: 1, color: p.muted }}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Tile({ tone, value, label, teamColor }: { tone: Tone; value: string | number; label: string; teamColor?: string | null }) {
  const p = palette(tone, teamColor);
  return (
    <View style={{ flex: 1, backgroundColor: p.card, padding: 10, gap: 2 }}>
      <Text style={{ fontFamily: font.display, fontSize: 26, lineHeight: 28, color: tone === 'paper' ? p.accent : p.ink }}>{value}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 11, lineHeight: 14, color: p.muted }}>{label}</Text>
    </View>
  );
}

/** Two-part horizontal bar (e.g. goals + assists), scaled to `max`. */
export function SplitBar({
  tone,
  label,
  a,
  b,
  max,
  aColor,
  bColor,
  teamColor,
}: {
  tone: Tone;
  label: string;
  a: number;
  b: number;
  max: number;
  aColor: string;
  bColor: string;
  teamColor?: string | null;
}) {
  const p = palette(tone, teamColor);
  const w = 200;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ width: 110, fontFamily: font.semibold, fontSize: 12, color: p.ink }}>
        {label}
      </Text>
      <View style={{ width: w, height: 14, flexDirection: 'row' }}>
        <View style={{ width: max ? (a / max) * w : 0, backgroundColor: aColor }} />
        <View style={{ width: max ? (b / max) * w : 0, backgroundColor: bColor, marginLeft: a && b ? 1 : 0 }} />
      </View>
      <Text style={{ fontFamily: font.display, fontSize: 16, color: p.ink }}>{a + b}</Text>
    </View>
  );
}

/** Dot per point on a minutes axis, one row per game; filled = this team scored. */
export function PaceDots({ tone, points, games, teamColor }: { tone: Tone; points: PacePoint[]; games: string[]; teamColor?: string | null }) {
  const p = palette(tone, teamColor);
  const maxMin = Math.max(6, Math.ceil(Math.max(0, ...points.map((x) => x.seconds)) / 120) * 2);
  const left = 78;
  const w = PAGE_W - 40 - left - 6;
  const rowH = 30;
  const h = games.length * rowH + 22;
  const x = (s: number) => left + (s / 60 / maxMin) * w;
  const ticks = Array.from({ length: maxMin / 2 + 1 }, (_, i) => i * 2);
  return (
    <Svg width={PAGE_W - 40} height={h}>
      {ticks.map((t) => (
        <Line key={t} x1={x(t * 60)} x2={x(t * 60)} y1={0} y2={h - 18} stroke={p.line} strokeWidth={1} />
      ))}
      {ticks.map((t) => (
        <SvgText key={`l${t}`} x={x(t * 60)} y={h - 4} fontSize={9} fill={p.muted} textAnchor="middle" fontFamily={font.regular}>
          {t}
        </SvgText>
      ))}
      {games.map((g, gi) => (
        <SvgText key={g + gi} x={0} y={gi * rowH + rowH / 2 + 4} fontSize={10} fill={p.ink} fontFamily={font.semibold}>
          {g.length > 12 ? `${g.slice(0, 11)}…` : g}
        </SvgText>
      ))}
      {points.map((pt, i) => {
        // Small vertical jitter so stacked dots stay visible.
        const jitter = ((i * 37) % 9) - 4;
        const cy = pt.gameIndex * rowH + rowH / 2 + jitter;
        return pt.ours ? (
          <Circle key={i} cx={x(pt.seconds)} cy={cy} r={3.6} fill={tone === 'paper' ? p.accent : ACCENT} />
        ) : (
          <Circle key={i} cx={x(pt.seconds)} cy={cy} r={3.2} fill="none" stroke={p.muted} strokeWidth={1.4} />
        );
      })}
    </Svg>
  );
}

/** Who set up whom: players on a circle, a curve per assist pairing (thicker = more often). */
export function ConnectionWeb({
  tone,
  pairs,
  name,
  isWoman,
  teamColor,
}: {
  tone: Tone;
  pairs: { from: string; to: string; count: number }[];
  name: (id: string) => string;
  isWoman: (id: string) => boolean;
  teamColor?: string | null;
}) {
  const p = palette(tone, teamColor);
  const size = PAGE_W - 40;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 58;
  const ids = Array.from(new Set(pairs.flatMap((x) => [x.from, x.to])));
  const weight = new Map<string, number>();
  pairs.forEach((x) => {
    weight.set(x.from, (weight.get(x.from) ?? 0) + x.count);
    weight.set(x.to, (weight.get(x.to) ?? 0) + x.count);
  });
  // Men then women around the circle, busiest first, so the shape reads at a glance.
  ids.sort((a, b) => Number(isWoman(a)) - Number(isWoman(b)) || (weight.get(b) ?? 0) - (weight.get(a) ?? 0));
  const pos = new Map(
    ids.map((id, i) => {
      const ang = (i / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), ang }];
    }),
  );
  const maxW = Math.max(1, ...weight.values());
  const woman = tone === 'paper' ? p.accent : ACCENT;
  return (
    <Svg width={size} height={size}>
      {pairs.map((x, i) => {
        const a = pos.get(x.from)!;
        const b = pos.get(x.to)!;
        // Bend each curve towards the centre.
        const mx = (a.x + b.x) / 2 + (cx - (a.x + b.x) / 2) * 0.55;
        const my = (a.y + b.y) / 2 + (cy - (a.y + b.y) / 2) * 0.55;
        return (
          <Path
            key={i}
            d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`}
            stroke={isWoman(x.from) ? woman : p.ink}
            strokeOpacity={0.55}
            strokeDasharray={isWoman(x.from) ? '5 3' : undefined}
            strokeWidth={0.8 + x.count * 1.1}
            fill="none"
          />
        );
      })}
      {ids.map((id) => {
        const q = pos.get(id)!;
        const rad = 4 + ((weight.get(id) ?? 0) / maxW) * 12;
        const right = Math.cos(q.ang) >= 0;
        return (
          <G key={id}>
            <Circle cx={q.x} cy={q.y} r={rad} fill={isWoman(id) ? woman : p.ink} />
            <SvgText x={q.x + (right ? rad + 4 : -rad - 4)} y={q.y + 3} fontSize={9} fill={p.ink} textAnchor={right ? 'start' : 'end'} fontFamily={font.semibold}>
              {name(id)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export function ResultChip({ result }: { result: 'W' | 'L' | 'D' }) {
  return (
    <View style={{ backgroundColor: result === 'W' ? '#FFFFFF' : 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: font.display, fontSize: 15, color: result === 'W' ? '#293750' : '#FFFFFF' }}>{result === 'W' ? 'WIN' : result === 'L' ? 'LOSS' : 'DRAW'}</Text>
    </View>
  );
}
