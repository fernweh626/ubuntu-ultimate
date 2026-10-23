import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { gameAvailability, setAvailability } from '@/db/development';
import { useData } from '@/db/live';
import type { GameListItem } from '@/db/repo';
import { shortDate, timeOfDay } from '@/domain/format';

import { AnswerButtons, type Answer } from './answer';
import { Card, Section, T, TeamSwatch } from './components';
import { KindIcon } from './kind-icon';
import { colors, font, space } from './theme';

const TO: Record<Answer, 'available' | 'late' | 'unavailable'> = { yes: 'available', late: 'late', no: 'unavailable' };
const FROM = (s: string | null): Answer | null => (s === 'available' ? 'yes' : s === 'late' ? 'late' : s === 'unavailable' ? 'no' : null);

/** A team's next games with who's coming: the F/M split, who can't, who hasn't answered, and your answer. */
export function TeamFixtures({ teamId, games, meId, onSquad }: { teamId: string; games: GameListItem[]; meId: string | null; onSquad: boolean }) {
  const db = useSQLiteContext();
  const [opened] = useState(() => Date.now() - 3 * 3600_000);
  const next = games
    .filter((g) => g.status === 'scheduled' && (!g.scheduled_at || Date.parse(g.scheduled_at) >= opened))
    .sort((a, b) => (a.scheduled_at ?? '9999').localeCompare(b.scheduled_at ?? '9999'))
    .slice(0, 4);
  const counts = useData(
    async (d) => Object.fromEntries(await Promise.all(next.map(async (g) => [g.id, await gameAvailability(d, g.id, teamId)] as const))),
    [teamId, next.map((g) => g.id).join()],
  );
  if (!next.length) return null;

  return (
    <Section title="Coming up">
      {next.map((g) => {
        const list = counts?.[g.id] ?? [];
        const yes = list.filter((p) => p.status === 'available' || p.status === 'late');
        const f = yes.filter((p) => p.gender === 'W').length;
        const late = list.filter((p) => p.status === 'late').length;
        const cant = list.filter((p) => p.status === 'unavailable').length;
        const quiet = list.filter((p) => !p.status).length;
        const mine = list.find((p) => p.personId === meId)?.status ?? null;
        const opp = g.team_a_id === teamId ? g.b_name : g.a_name;
        const oppColor = g.team_a_id === teamId ? g.b_color : g.a_color;
        return (
          <Card key={g.id}>
            <Pressable onPress={() => router.push(`/game/${g.id}/fixture`)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <KindIcon kind="game" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <T v="small">v</T>
                  <TeamSwatch color={oppColor} size="sm" />
                  <T v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {opp}
                  </T>
                </View>
                <T v="small" numberOfLines={1}>
                  {[g.scheduled_at ? `${shortDate(g.scheduled_at)} · ${timeOfDay(g.scheduled_at)}` : 'Date to be confirmed', g.venue_name].filter(Boolean).join(' · ')}
                </T>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              <T style={{ fontFamily: font.bold, fontSize: 14 }}>
                {yes.length} coming
                <T style={{ fontFamily: font.regular, fontSize: 14, color: colors.muted }}>
                  {' '}
                  ({f} F · {yes.length - f} M{late ? ` · ${late} late` : ''})
                </T>
              </T>
              <T v="small">{cant} can’t</T>
              <T v="small" style={{ color: quiet ? colors.warnInk : colors.muted }}>
                {quiet} not answered
              </T>
            </View>
            {onSquad && meId ? (
              <AnswerButtons compact yesLabel="I’ll play" noLabel="Can’t play" value={FROM(mine)} onAnswer={(a, note) => setAvailability(db, g.id, teamId, meId, a ? TO[a] : null, note)} />
            ) : null}
          </Card>
        );
      })}
    </Section>
  );
}
