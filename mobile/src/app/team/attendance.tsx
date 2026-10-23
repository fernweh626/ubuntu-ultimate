import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { attendanceRanking } from '@/db/development';
import { useData } from '@/db/live';
import { getTeam } from '@/db/repo';
import { displayName } from '@/domain/format';
import { Card, Screen, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

type Period = '8w' | 'year' | 'all';

function since(p: Period, now: number) {
  if (p === '8w') return new Date(now - 56 * 86400_000).toISOString();
  if (p === 'year') return `${new Date(now).getFullYear()}-01-01T00:00:00.000Z`;
  return '2000-01-01T00:00:00.000Z';
}

/** Staff only: who turns up. Ranked by practices attended, then fewest no-shows, then games played. */
export default function Attendance() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const [period, setPeriod] = useState<Period>('8w');
  const [opened] = useState(() => Date.now());
  const bundle = useData(async (d) => ({ team: await getTeam(d, teamId), rank: await attendanceRanking(d, teamId, since(period, opened)) }), [teamId, period]);
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { team, rank } = bundle;

  return (
    <>
      <Stack.Screen options={{ title: `${team?.name ?? 'Team'} · attendance` }} />
      <Screen edges={[]}>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: '8w', label: 'Last 8 weeks' },
            { value: 'year', label: 'This year' },
            { value: 'all', label: 'All time' },
          ]}
        />
        <Card>
          <T v="bodyStrong">
            {rank.practices} practice{rank.practices === 1 ? '' : 's'} · {rank.games} game{rank.games === 1 ? '' : 's'}
          </T>
          <T v="small">
            {rank.withRegister === rank.practices
              ? 'Every practice had a register taken.'
              : `${rank.withRegister} of ${rank.practices} had a register; for the rest, saying “going” counts as attending. Take the register on the practice page for exact numbers.`}{' '}
            A no-show is saying “going” and not being on the register. Only staff see this page.
          </T>
        </Card>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
          {rank.rows.map((r, i) => {
            const pct = r.practices ? r.attended / r.practices : 0;
            return (
              <Pressable
                key={r.personId}
                onPress={() => router.push(`/player/${r.personId}`)}
                accessibilityRole="button"
                style={{ padding: space.md, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <T style={{ width: 24, fontFamily: font.display, fontSize: 18, color: i < 3 ? colors.brand : colors.faint }}>{i + 1}</T>
                  <T v="bodyStrong" style={{ flex: 1, color: r.gender === 'W' ? '#6B2C91' : r.gender === 'M' ? '#1D3F8F' : colors.ink }}>
                    {displayName(r)}
                  </T>
                  <T style={{ fontFamily: font.display, fontSize: 20 }}>
                    {r.attended}/{r.practices}
                  </T>
                </View>
                <View style={{ marginLeft: 24 + space.md, height: 8, borderRadius: 4, backgroundColor: colors.neutralTint, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: pct >= 0.75 ? colors.brand : pct >= 0.5 ? colors.warn : colors.danger }} />
                </View>
                <T v="small" style={{ marginLeft: 24 + space.md }}>
                  {[
                    r.practices ? `${Math.round(pct * 100)}% of practices` : null,
                    r.noShows ? `${r.noShows} no-show${r.noShows > 1 ? 's' : ''}` : null,
                    rank.games ? `played ${r.gamesPlayed}/${rank.games} games` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </T>
              </Pressable>
            );
          })}
        </View>
      </Screen>
    </>
  );
}
