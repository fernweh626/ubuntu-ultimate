import { File, Paths } from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, peopleById } from '@/db/reports';
import { getEvent, getTeam, listGamesForEvent, listGamesForTeam } from '@/db/repo';
import { attendanceCsv, eventsCsv, gamesCsv, playerGamesCsv, pointsCsv } from '@/domain/export';
import { displayName } from '@/domain/format';
import { Button, Card, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

async function attendanceRows(db: SQLiteDatabase, teamId: string) {
  return db.getAllAsync<{ date: string; title: string | null; cancelled: boolean; personId: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null; rsvp: string | null; attended: number | null }>(
    `SELECT substr(s.started_at, 1, 10) AS date, s.title, s.cancelled_at IS NOT NULL AS cancelled, p.id AS personId, p.first_name, p.last_name, p.birth_date, p.gender,
            r.status AS rsvp, a.attended
       FROM session s
       JOIN membership m ON m.team_id = s.team_id AND m.deleted_at IS NULL
       JOIN person p ON p.id = m.person_id
       LEFT JOIN practice_rsvp r ON r.session_id = s.id AND r.person_id = p.id
       LEFT JOIN practice_attendance a ON a.session_id = s.id AND a.person_id = p.id
      WHERE s.team_id = ? AND s.kind = 'practice' AND s.deleted_at IS NULL
      GROUP BY s.id, p.id
      ORDER BY s.started_at, p.first_name`,
    teamId,
  );
}

/** Staff export a team's or a competition's data as CSV files for their own analysis. */
export default function Export() {
  const { teamId, eventId } = useLocalSearchParams<{ teamId?: string; eventId?: string }>();
  const bundle = useData(
    async (d) => {
      const items = teamId ? await listGamesForTeam(d, teamId) : await listGamesForEvent(d, eventId!);
      const games = await loadFinishedGames(d, items);
      const ids = new Set<string>();
      games.forEach((g) => g.data.players.forEach((p) => ids.add(p.person_id)));
      const people = await peopleById(d, [...ids]);
      const label = teamId ? ((await getTeam(d, teamId))?.name ?? 'team') : ((await getEvent(d, eventId!))?.name ?? 'event');
      const attendance = teamId ? await attendanceRows(d, teamId) : [];
      return { games, people, label, attendance };
    },
    [teamId, eventId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { games, people, label, attendance } = bundle;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().slice(0, 10);

  async function share(name: string, make: () => string) {
    setBusy(name);
    try {
      const file = new File(Paths.cache, `${slug}-${name}-${stamp}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(make());
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: `${label}: ${name}`, UTI: 'public.comma-separated-values-text' });
    } catch (e) {
      Alert.alert('Couldn’t export', String(e));
    } finally {
      setBusy(null);
    }
  }

  const files: { name: string; title: string; body: string; make: () => string; show: boolean }[] = [
    { name: 'games', title: 'Games', body: 'One row per game: score, holds, breaks, turnovers for both teams.', make: () => gamesCsv(games), show: true },
    { name: 'player-games', title: 'Player stats per game', body: 'One row per player per game: points, goals, assists, Ds, turnovers, +/−.', make: () => playerGamesCsv(games, people, teamId), show: true },
    { name: 'points', title: 'Points', body: 'One row per point: who was on, ratio, hold/break, length, scorer.', make: () => pointsCsv(games, people), show: true },
    { name: 'events', title: 'Every action', body: 'The raw play-by-play: passes, turnovers, goals, timeouts, subs, with timestamps.', make: () => eventsCsv(games, people), show: true },
    {
      name: 'practice-attendance',
      title: 'Practice attendance',
      body: 'One row per player per practice: what they said and whether they came.',
      make: () => attendanceCsv(attendance.map((r) => ({ ...r, name: displayName(r) }))),
      show: !!teamId,
    },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Export data' }} />
      <Screen edges={[]}>
        <Card>
          <T v="bodyStrong">{label}</T>
          <T v="small">
            {games.length} finished game{games.length === 1 ? '' : 's'}. CSV files open in Excel, Google Sheets, pandas or R; they join on game_id and person_id. No emails or birth dates are included, and under-18s show as first name + initial.
          </T>
        </Card>
        {files
          .filter((f) => f.show)
          .map((f) => (
            <Card key={f.name}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{f.title}</T>
                  <T v="small">{f.body}</T>
                </View>
                {busy === f.name ? <ActivityIndicator color={colors.brand} /> : <Button label="Share" icon="file-delimited-outline" onPress={() => share(f.name, f.make)} disabled={!!busy || (!games.length && f.name !== 'practice-attendance')} />}
              </View>
            </Card>
          ))}
      </Screen>
    </>
  );
}
