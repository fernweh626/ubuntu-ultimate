import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { breakClock, currentSegment, type GameData, type LiveState } from '@/domain/engine';
import { clock } from '@/domain/format';

import { colors, font, space } from './theme';

const LOOK = {
  timeout: { bg: colors.warn, ink: '#1A1200', title: 'Timeout' },
  halftime: { bg: colors.brandDark, ink: '#FFFFFF', title: 'Halftime' },
  between: { bg: colors.night, ink: '#FFFFFF', title: 'Pull in' },
};

/**
 * Huge countdown for timeouts, halftime and the gap between points — readable from the sideline.
 * Renders nothing when play is on.
 */
export function BreakClock({ data, state, teamName }: { data: GameData; state: LiveState; teamName: (id: string) => string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const info = breakClock(data, state);
  if (!info) return null;
  const seg = currentSegment(info.segments, now);
  const over = seg.remaining < 0;
  const look = LOOK[seg.kind];
  const sub =
    seg.kind === 'timeout'
      ? state.phase === 'inpoint'
        ? over
          ? 'Time’s up — play on'
          : 'Play resumes when this hits zero'
        : over
          ? 'Pull is late'
          : 'Until the pull'
      : seg.kind === 'halftime'
        ? over
          ? 'Halftime’s over'
          : `Then ${state.rules.pullWithinSeconds}s to pull`
        : over
          ? 'Pull is late'
          : seg.remaining <= 10
            ? 'Get set!'
            : 'Lines on the field';
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={`${look.title}${info.teamId ? ` ${teamName(info.teamId)}` : ''}: ${Math.round(Math.abs(seg.remaining))} seconds ${over ? 'over' : 'left'}`}
      style={{ backgroundColor: over ? colors.danger : look.bg, paddingVertical: space.md, paddingHorizontal: space.lg, alignItems: 'center' }}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, letterSpacing: 3, color: over ? '#fff' : look.ink }}>
        {look.title.toUpperCase()}
        {info.teamId ? ` · ${teamName(info.teamId).toUpperCase()}` : ''}
      </Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{ fontFamily: font.display, fontSize: 120, lineHeight: 124, color: over ? '#fff' : look.ink, fontVariant: ['tabular-nums'] }}>
        {over ? `+${clock(-seg.remaining)}` : clock(Math.ceil(seg.remaining))}
      </Text>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: over ? '#fff' : look.ink, opacity: 0.85 }}>{sub}</Text>
    </View>
  );
}
