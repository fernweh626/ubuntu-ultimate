import type { SQLiteDatabase } from 'expo-sqlite';

import { getMeId } from './repo';

/*
 * Your own schedule: practices and games for the teams you're on, with your answer, the head count,
 * and whether you've done the check-in for the ones that are over.
 */

export type ScheduleItem = {
  key: string;
  kind: 'practice' | 'game';
  id: string;
  teamId: string;
  teamName: string;
  at: string;
  endAt: string;
  title: string;
  place: string | null;
  cancelled: boolean;
  status: string | null; // my answer
  coming: number;
  late: number;
  cant: number;
  checkedIn: boolean;
  played: boolean;
  gameStatus?: string;
};

export async function mySchedule(db: SQLiteDatabase, now = new Date(), weeks = 4) {
  const meId = await getMeId(db);
  if (!meId) return { meId: null, items: [] as ScheduleItem[], teams: 0 };
  const teams = await db.getAllAsync<{ team_id: string; name: string }>(
    `SELECT m.team_id, t.name FROM membership m JOIN team t ON t.id = m.team_id
      WHERE m.person_id = ? AND m.end_date IS NULL AND m.deleted_at IS NULL AND t.deleted_at IS NULL GROUP BY m.team_id`,
    meId,
  );
  if (!teams.length) return { meId, items: [], teams: 0 };
  const ids = teams.map((t) => t.team_id);
  const q = ids.map(() => '?').join(',');
  const from = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const to = new Date(now.getTime() + weeks * 7 * 86400_000).toISOString();
  const multi = teams.length > 1;

  const practices = await db.getAllAsync<{ id: string; team_id: string; team: string; title: string | null; started_at: string; duration_min: number; venue: string | null; cancelled_at: string | null; status: string | null; coming: number; late: number; cant: number; checked: number }>(
    `SELECT s.id, s.team_id, t.name AS team, s.title, s.started_at, s.duration_min, v.name AS venue, s.cancelled_at,
            (SELECT status FROM practice_rsvp r WHERE r.session_id = s.id AND r.person_id = ?) AS status,
            (SELECT COUNT(*) FROM practice_rsvp r WHERE r.session_id = s.id AND r.status IN ('going','late')) AS coming,
            (SELECT COUNT(*) FROM practice_rsvp r WHERE r.session_id = s.id AND r.status = 'late') AS late,
            (SELECT COUNT(*) FROM practice_rsvp r WHERE r.session_id = s.id AND r.status = 'not_going') AS cant,
            EXISTS (SELECT 1 FROM reflection rf WHERE rf.session_id = s.id AND rf.person_id = ?) AS checked
       FROM session s JOIN team t ON t.id = s.team_id LEFT JOIN venue v ON v.id = s.venue_id
      WHERE s.kind = 'practice' AND s.deleted_at IS NULL AND s.team_id IN (${q}) AND s.started_at >= ? AND s.started_at <= ?`,
    meId,
    meId,
    ...ids,
    from,
    to,
  );
  const games = await db.getAllAsync<{ id: string; status: string; team_a_id: string; team_b_id: string; a: string; b: string; scheduled_at: string | null; started_at: string | null; venue: string | null; event: string | null }>(
    `SELECT g.id, g.status, g.team_a_id, g.team_b_id, ta.name AS a, tb.name AS b, g.scheduled_at, g.started_at, v.name AS venue, e.name AS event
       FROM game g JOIN team ta ON ta.id = g.team_a_id JOIN team tb ON tb.id = g.team_b_id
       LEFT JOIN venue v ON v.id = g.venue_id LEFT JOIN event e ON e.id = g.event_id
      WHERE g.deleted_at IS NULL AND (g.team_a_id IN (${q}) OR g.team_b_id IN (${q}))
        AND COALESCE(g.started_at, g.scheduled_at) >= ? AND COALESCE(g.started_at, g.scheduled_at) <= ?`,
    ...ids,
    ...ids,
    from,
    to,
  );

  const items: ScheduleItem[] = practices.map((p) => ({
    key: `p:${p.id}`,
    kind: 'practice',
    id: p.id,
    teamId: p.team_id,
    teamName: p.team,
    at: p.started_at,
    endAt: new Date(Date.parse(p.started_at) + p.duration_min * 60_000).toISOString(),
    title: `${multi ? `${p.team} practice` : 'Practice'}${p.title ? ` · ${p.title}` : ''}`,
    place: p.venue,
    cancelled: !!p.cancelled_at,
    status: p.status,
    coming: p.coming,
    late: p.late,
    cant: p.cant,
    checkedIn: !!p.checked,
    played: p.status === 'going' || p.status === 'late',
  }));
  for (const g of games) {
    const mine = ids.includes(g.team_a_id) ? g.team_a_id : g.team_b_id;
    const at = g.started_at ?? g.scheduled_at!;
    const answers = await db.getAllAsync<{ person_id: string; status: string }>(`SELECT person_id, status FROM game_availability WHERE game_id = ? AND team_id = ?`, g.id, mine);
    const played = !!(await db.getFirstAsync(`SELECT 1 FROM game_player WHERE game_id = ? AND person_id = ? AND confirmation != 'removed'`, g.id, meId));
    const checked = !!(await db.getFirstAsync(`SELECT 1 FROM reflection WHERE game_id = ? AND person_id = ?`, g.id, meId));
    const opp = mine === g.team_a_id ? g.b : g.a;
    items.push({
      key: `g:${g.id}`,
      kind: 'game',
      id: g.id,
      teamId: mine,
      teamName: mine === g.team_a_id ? g.a : g.b,
      at,
      endAt: new Date(Date.parse(at) + 100 * 60_000).toISOString(),
      title: `${multi ? `${mine === g.team_a_id ? g.a : g.b} ` : ''}v ${opp}`,
      place: [g.venue, g.event].filter(Boolean).join(' · ') || null,
      cancelled: false,
      status: answers.find((x) => x.person_id === meId)?.status ?? null,
      coming: answers.filter((x) => x.status === 'available' || x.status === 'late').length,
      late: answers.filter((x) => x.status === 'late').length,
      cant: answers.filter((x) => x.status === 'unavailable').length,
      checkedIn: checked,
      played,
      gameStatus: g.status,
    });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  return { meId, items, teams: teams.length };
}
