import type { SQLiteDatabase } from 'expo-sqlite';

import { nextPickup } from './home';
import { getMeId } from './repo';

/*
 * Your own schedule: practices and games for the teams you're on, hats you've signed up for,
 * meetings you're going to and the pickups you go to, with your answer, the head count, and
 * whether you've done the check-in for the ones that are over.
 */

export type ScheduleItem = {
  key: string;
  kind: 'practice' | 'game' | 'hat' | 'meeting' | 'pickup';
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
  /** Pickups: the day (YYYY-MM-DD) the answer is for. */
  onDate?: string;
};

const localIso = (date: string, time: string | null) => new Date(`${date}T${time || '09:00'}:00`).toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** What's over: the last year of practices, games, hats, meetings and pickups, newest first. */
export async function myPastSchedule(db: SQLiteDatabase, now = new Date()) {
  const r = await mySchedule(db, now, 0, 365);
  return { ...r, items: r.items.filter((i) => Date.parse(i.endAt) < now.getTime()).reverse() };
}

/** Did I go? Practices and pickups from my answer (or check-in), games from the confirmed line-up. */
export function attended(i: ScheduleItem): 'went' | 'missed' | 'unknown' {
  if (i.kind === 'game') return i.played ? 'went' : i.status === 'unavailable' ? 'missed' : 'unknown';
  if (i.kind === 'practice') return i.status === 'not_going' ? 'missed' : i.played || i.checkedIn ? 'went' : 'unknown';
  return i.status === 'not_going' ? 'missed' : i.status ? 'went' : 'unknown';
}

export async function mySchedule(db: SQLiteDatabase, now = new Date(), weeks = 4, daysBack = 7) {
  const meId = await getMeId(db);
  if (!meId) return { meId: null, items: [] as ScheduleItem[], teams: 0 };
  const teams = await db.getAllAsync<{ team_id: string; name: string }>(
    `SELECT m.team_id, t.name FROM membership m JOIN team t ON t.id = m.team_id
      WHERE m.person_id = ? AND m.end_date IS NULL AND m.deleted_at IS NULL AND t.deleted_at IS NULL GROUP BY m.team_id`,
    meId,
  );
  const ids = teams.map((t) => t.team_id);
  const q = ids.map(() => '?').join(',');
  const from = new Date(now.getTime() - daysBack * 86400_000).toISOString();
  const to = new Date(now.getTime() + weeks * 7 * 86400_000).toISOString();
  const multi = teams.length > 1;

  const practices = await db.getAllAsync<{
    id: string;
    team_id: string;
    team: string;
    title: string | null;
    started_at: string;
    duration_min: number;
    venue: string | null;
    cancelled_at: string | null;
    status: string | null;
    coming: number;
    late: number;
    cant: number;
    checked: number;
  }>(
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
  const games = await db.getAllAsync<{
    id: string;
    status: string;
    team_a_id: string;
    team_b_id: string;
    a: string;
    b: string;
    scheduled_at: string | null;
    started_at: string | null;
    venue: string | null;
    event: string | null;
  }>(
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
  items.push(...(await personalItems(db, meId, now, from, to)));
  items.sort((a, b) => a.at.localeCompare(b.at));
  return { meId, items, teams: teams.length };
}

/** Things you signed up for yourself, not through a team: hats, meetings, pickups you go to. */
async function personalItems(db: SQLiteDatabase, meId: string, now: Date, from: string, to: string): Promise<ScheduleItem[]> {
  const out: ScheduleItem[] = [];
  const base = { teamId: '', teamName: '', coming: 0, late: 0, cant: 0, checkedIn: true, played: false, cancelled: false };
  const fromDay = from.slice(0, 10);
  const toDay = to.slice(0, 10);

  const hats = await db.getAllAsync<{ id: string; name: string; start_date: string; start_time: string | null; end_date: string | null; location: string | null; attending: string; coming: number }>(
    `SELECT e.id, e.name, e.start_date, e.start_time, e.end_date, e.location, h.attending,
            (SELECT COUNT(*) FROM hat_signup x WHERE x.event_id = e.id AND x.attending = 'yes') AS coming
       FROM hat_signup h JOIN event e ON e.id = h.event_id
      WHERE h.person_id = ? AND h.attending IN ('yes','maybe') AND e.deleted_at IS NULL AND e.start_date >= ? AND e.start_date <= ?`,
    meId,
    fromDay,
    toDay,
  );
  for (const h of hats) {
    const at = localIso(h.start_date, h.start_time);
    out.push({
      ...base,
      key: `h:${h.id}`,
      kind: 'hat',
      id: h.id,
      at,
      endAt: localIso(h.end_date ?? h.start_date, '18:00'),
      title: h.name,
      place: h.location,
      status: h.attending === 'yes' ? 'going' : 'maybe',
      coming: h.coming,
    });
  }

  const meetings = await db.getAllAsync<{
    id: string;
    name: string;
    start_date: string;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    meeting_url: string | null;
    status: string;
    coming: number;
  }>(
    `SELECT c.id, c.name, c.start_date, c.start_time, c.end_time, c.location, c.meeting_url, r.status,
            (SELECT COUNT(*) FROM meeting_rsvp x WHERE x.calendar_entry_id = c.id AND x.status IN ('going','late')) AS coming
       FROM meeting_rsvp r JOIN calendar_entry c ON c.id = r.calendar_entry_id
      WHERE r.person_id = ? AND r.status IN ('going','late') AND c.deleted_at IS NULL AND c.start_date >= ? AND c.start_date <= ?`,
    meId,
    fromDay,
    toDay,
  );
  for (const m of meetings) {
    const at = localIso(m.start_date, m.start_time);
    out.push({
      ...base,
      key: `m:${m.id}`,
      kind: 'meeting',
      id: m.id,
      at,
      endAt: m.end_time ? localIso(m.start_date, m.end_time) : new Date(Date.parse(at) + 2 * 3600_000).toISOString(),
      title: m.name,
      place: m.meeting_url ? 'Online' : m.location,
      status: m.status,
      coming: m.coming,
    });
  }

  // Pickups you go to ("I go here"), every week; plus any day you said you're going to one you don't follow.
  const spots = await db.getAllAsync<{ id: string; name: string; day_of_week: number; start_time: string; end_time: string | null; venue_text: string | null; city: string }>(
    `SELECT p.id, p.name, p.day_of_week, p.start_time, p.end_time, p.venue_text, p.city FROM pickup_spot p
      WHERE p.deleted_at IS NULL AND (p.id IN (SELECT target_id FROM follow WHERE kind = 'pickup')
         OR p.id IN (SELECT pickup_id FROM pickup_rsvp WHERE person_id = ? AND on_date >= ? AND status != 'not_going'))`,
    meId,
    ymd(now),
  );
  const rsvps = await db.getAllAsync<{ pickup_id: string; on_date: string; person_id: string; status: string }>(
    `SELECT pickup_id, on_date, person_id, status FROM pickup_rsvp WHERE on_date >= ? AND on_date <= ?`,
    ymd(now),
    toDay,
  );
  const end = Date.parse(to);
  const followed = new Set((await db.getAllAsync<{ target_id: string }>(`SELECT target_id FROM follow WHERE kind = 'pickup'`)).map((f) => f.target_id));
  for (const p of spots) {
    for (let d = nextPickup(p, now); d.getTime() <= end; d = new Date(d.getTime() + 7 * 86400_000)) {
      const day = ymd(d);
      const here = rsvps.filter((r) => r.pickup_id === p.id && r.on_date === day);
      const mine = here.find((r) => r.person_id === meId)?.status ?? null;
      // Not one you go to every week: only the days you said yes to.
      if (!followed.has(p.id) && (mine === null || mine === 'not_going')) continue;
      const at = d.toISOString();
      const endAt = p.end_time ? localIso(day, p.end_time) : new Date(d.getTime() + 2 * 3600_000).toISOString();
      out.push({
        ...base,
        key: `k:${p.id}:${day}`,
        kind: 'pickup',
        id: p.id,
        onDate: day,
        at,
        endAt,
        title: p.name,
        place: [p.venue_text, p.city].filter(Boolean).join(' · '),
        status: mine,
        coming: here.filter((r) => r.status !== 'not_going').length,
        late: here.filter((r) => r.status === 'late').length,
        cant: here.filter((r) => r.status === 'not_going').length,
      });
    }
  }
  // Pickups that are over: the days I said I'd come.
  const past = await db.getAllAsync<{ id: string; name: string; start_time: string; end_time: string | null; venue_text: string | null; city: string; on_date: string; status: string }>(
    `SELECT p.id, p.name, p.start_time, p.end_time, p.venue_text, p.city, r.on_date, r.status FROM pickup_rsvp r JOIN pickup_spot p ON p.id = r.pickup_id
      WHERE r.person_id = ? AND r.on_date >= ? AND r.on_date < ? AND p.deleted_at IS NULL`,
    meId,
    fromDay,
    ymd(now),
  );
  for (const p of past) {
    const at = localIso(p.on_date, p.start_time);
    out.push({
      ...base,
      key: `k:${p.id}:${p.on_date}`,
      kind: 'pickup',
      id: p.id,
      onDate: p.on_date,
      at,
      endAt: p.end_time ? localIso(p.on_date, p.end_time) : new Date(Date.parse(at) + 2 * 3600_000).toISOString(),
      title: p.name,
      place: [p.venue_text, p.city].filter(Boolean).join(' · '),
      status: p.status,
    });
  }
  return out;
}
