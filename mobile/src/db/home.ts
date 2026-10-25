import type { SQLiteDatabase } from 'expo-sqlite';

import { regionName } from '@/content/hub';
import { DAYS_LONG, shortDate, weekdayIndex } from '@/domain/format';

import { getMeId, listGames, listPickups, type GameListItem } from './repo';
import type { PickupSpot } from './types';

/*
 * What Home shows "for you": a strip of the competitions you're in, and one timeline of the next
 * seven days sorted by time (not grouped by league), each item tagged with its competition.
 * Deliberately small: events your team isn't playing in this week stay inside the competition page.
 */

export type Tag = { name: string; color: string };

export type Competition = {
  key: string;
  kind: 'event' | 'pickup';
  id: string;
  name: string;
  color: string;
  line1: string;
  line2: string;
};

export type TimelineItem = {
  key: string;
  at: string;
  kind: 'game' | 'pickup' | 'practice' | 'hat' | 'meeting';
  title: string;
  subtitle: string;
  tag: Tag | null;
  following: boolean;
  url: string;
};

// Distinct from the raspberry/teal used for female/male matching, and readable as text on white.
const TAG_COLORS = ['#C2410C', '#1E40AF', '#B45309', '#6D28D9', '#4D7C0F', '#334155', '#854D0E', '#15803D', '#7C2D12', '#3730A3'];

function tagColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

/** "Cape Town Mixed League 2026" → "Cape Town Mixed League": the year is noise on a tag. */
export const tagName = (name: string) => name.replace(/\s*\b(19|20)\d\d\b\s*$/, '').trim() || name;

/** Next start of a weekly pickup at or after `from` (a session that started under 2 hours ago still counts). */
export function nextPickup(p: Pick<PickupSpot, 'day_of_week' | 'start_time'>, from: Date) {
  const [h, m] = p.start_time.split(':').map(Number);
  const d = new Date(from);
  d.setHours(h || 0, m || 0, 0, 0);
  d.setDate(d.getDate() + ((p.day_of_week - weekdayIndex(from) + 7) % 7));
  if (d.getTime() < from.getTime() - 2 * 3600_000) d.setDate(d.getDate() + 7);
  return d;
}

const WEEK = 7 * 86400_000;

export async function homeFeed(db: SQLiteDatabase, now = new Date()) {
  const meId = await getMeId(db);
  const myTeams = meId
    ? await db.getAllAsync<{ team_id: string; name: string }>(
        `SELECT m.team_id, t.name FROM membership m JOIN team t ON t.id = m.team_id
          WHERE m.person_id = ? AND m.end_date IS NULL AND m.deleted_at IS NULL AND t.deleted_at IS NULL`,
        meId,
      )
    : [];
  const mine = new Set(myTeams.map((t) => t.team_id));
  const follows = await db.getAllAsync<{ kind: string; target_id: string }>(`SELECT kind, target_id FROM follow`);
  const followedTeams = new Set(follows.filter((f) => f.kind === 'team').map((f) => f.target_id));
  const followedEvents = new Set(follows.filter((f) => f.kind === 'event').map((f) => f.target_id));
  const followedPickups = new Set(follows.filter((f) => f.kind === 'pickup').map((f) => f.target_id));
  // Players you follow (a partner, a friend): their current teams' games count as followed.
  const playerIds = follows.filter((f) => f.kind === 'player').map((f) => f.target_id);
  const playerTeams = new Map<string, string[]>();
  if (playerIds.length) {
    const rows = await db.getAllAsync<{ team_id: string; first_name: string }>(
      `SELECT m.team_id, p.first_name FROM membership m JOIN person p ON p.id = m.person_id
        WHERE m.person_id IN (${playerIds.map(() => '?').join(',')}) AND m.end_date IS NULL AND m.deleted_at IS NULL`,
      ...playerIds,
    );
    for (const r of rows) {
      playerTeams.set(r.team_id, [...(playerTeams.get(r.team_id) ?? []), r.first_name]);
      followedTeams.add(r.team_id);
    }
  }
  const today = now.toISOString().slice(0, 10);

  // Competitions: events my teams are entered in, plus followed ones, that haven't finished.
  type Ev = { id: string; name: string; kind: string; region: string | null; location: string | null; start_date: string | null; end_date: string | null; mine: number };
  const myIds = [...mine];
  const events = await db.getAllAsync<Ev>(
    `SELECT e.id, e.name, e.kind, e.region, e.location, e.start_date, e.end_date,
            EXISTS (SELECT 1 FROM event_team et WHERE et.event_id = e.id AND et.team_id IN (${myIds.map(() => '?').join(',') || "''"})) AS mine
       FROM event e
      WHERE e.deleted_at IS NULL AND COALESCE(e.end_date, e.start_date, '9999') >= ?
        AND e.kind IN ('tournament','league')`,
    ...myIds,
    today,
  );
  const games = await listGames(db);
  const tagFor = new Map<string, Tag>();
  const competitions: Competition[] = [];
  for (const e of events.filter((x) => x.mine || followedEvents.has(x.id))) {
    const tag = { name: tagName(e.name), color: tagColor(e.id) };
    tagFor.set(e.id, tag);
    const next = games
      .filter((g) => g.event_id === e.id && g.status === 'scheduled' && g.scheduled_at && (mine.has(g.team_a_id) || mine.has(g.team_b_id)))
      .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))[0];
    const opp = next ? (mine.has(next.team_a_id) ? next.b_name : next.a_name) : null;
    competitions.push({
      key: `e:${e.id}`,
      kind: 'event',
      id: e.id,
      name: tag.name,
      color: tag.color,
      line1: next ? `Next: ${shortDate(next.scheduled_at)} v ${opp}` : e.mine ? 'Standings & fixtures' : 'Following',
      line2: [e.kind === 'league' ? 'League' : 'Tournament', e.location ?? (e.region ? regionName(e.region) : null)].filter(Boolean).join(' · '),
    });
  }
  const pickups = (await listPickups(db)).filter((p) => followedPickups.has(p.id));
  for (const p of pickups) {
    const tag = { name: p.name, color: tagColor(p.id) };
    tagFor.set(p.id, tag);
    competitions.push({
      key: `p:${p.id}`,
      kind: 'pickup',
      id: p.id,
      name: p.name,
      color: tag.color,
      line1: `Pickup · ${DAYS_LONG[p.day_of_week]}s ${p.start_time}`,
      line2: [p.area, p.city].filter(Boolean).join(' · '),
    });
  }

  // Timeline: the next 7 days.
  const end = now.getTime() + WEEK;
  const items: TimelineItem[] = [];
  const multi = mine.size > 1;
  for (const g of games) {
    if (g.status !== 'scheduled' || !g.scheduled_at) continue;
    const t = Date.parse(g.scheduled_at);
    if (t < now.getTime() - 3 * 3600_000 || t > end) continue;
    const isMine = mine.has(g.team_a_id) || mine.has(g.team_b_id);
    const isFollowed = followedTeams.has(g.team_a_id) || followedTeams.has(g.team_b_id);
    if (!isMine && !isFollowed) continue;
    const myName = mine.has(g.team_a_id) ? g.a_name : g.b_name;
    const opp = mine.has(g.team_a_id) ? g.b_name : g.a_name;
    items.push({
      key: `g:${g.id}`,
      at: g.scheduled_at,
      kind: 'game',
      title: isMine ? (multi ? `${myName} v ${opp}` : `v ${opp}`) : `${g.a_name} v ${g.b_name}`,
      subtitle: [
        !isMine
          ? [...(playerTeams.get(g.team_a_id) ?? []), ...(playerTeams.get(g.team_b_id) ?? [])].join(' & ') + (playerTeams.has(g.team_a_id) || playerTeams.has(g.team_b_id) ? ' playing' : '') || null
          : null,
        g.venue_name,
        isMine && mine.has(g.home_team_id ?? g.team_a_id) ? 'you’re home: bring cones' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tag: g.event_id ? (tagFor.get(g.event_id) ?? (g.event_name ? { name: tagName(g.event_name), color: tagColor(g.event_id) } : null)) : null,
      following: !isMine,
      url: `/game/${g.id}/fixture`,
    });
  }
  for (const p of pickups) {
    const at = nextPickup(p, now);
    if (at.getTime() > end) continue;
    items.push({
      key: `p:${p.id}:${at.toISOString().slice(0, 10)}`,
      at: at.toISOString(),
      kind: 'pickup',
      title: p.name,
      subtitle: [p.venue_text, p.area].filter(Boolean).join(' · '),
      tag: { name: 'Pickup', color: tagFor.get(p.id)!.color },
      following: false,
      url: '/hub/pickups',
    });
  }
  if (myIds.length) {
    const sessions = await db.getAllAsync<{ id: string; title: string | null; started_at: string; team: string; venue: string | null; cancelled_at: string | null; my_status: string | null }>(
      `SELECT s.id, s.title, s.started_at, s.cancelled_at, t.name AS team, v.name AS venue,
              (SELECT status FROM practice_rsvp r WHERE r.session_id = s.id AND r.person_id = ?) AS my_status
         FROM session s JOIN team t ON t.id = s.team_id LEFT JOIN venue v ON v.id = s.venue_id
        WHERE s.deleted_at IS NULL AND s.kind = 'practice' AND s.team_id IN (${myIds.map(() => '?').join(',')})
          AND s.started_at >= ? AND s.started_at <= ?`,
      meId,
      ...myIds,
      new Date(now.getTime() - 3 * 3600_000).toISOString(),
      new Date(end).toISOString(),
    );
    for (const s of sessions) {
      const answer = s.cancelled_at
        ? 'Cancelled'
        : s.my_status === 'going'
          ? 'You’re going'
          : s.my_status === 'late'
            ? 'You’ll be late'
            : s.my_status === 'not_going'
              ? 'Not going'
              : 'Are you coming? Tap to answer';
      items.push({
        key: `s:${s.id}`,
        at: s.started_at,
        kind: 'practice',
        title: `${multi ? `${s.team} practice` : 'Practice'}${s.title ? ` · ${s.title}` : ''}`,
        subtitle: [answer, s.venue].filter(Boolean).join(' · '),
        tag: { name: 'Practice', color: '#475569' },
        following: false,
        url: `/practice/${s.id}`,
      });
    }
  }
  if (meId) {
    // Hats you've signed up for and meetings you're going to, from My schedule.
    const fromDay = new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const toDay = new Date(end).toISOString().slice(0, 10);
    const hats = await db.getAllAsync<{ id: string; name: string; start_date: string; start_time: string | null; location: string | null; attending: string }>(
      `SELECT e.id, e.name, e.start_date, e.start_time, e.location, h.attending FROM hat_signup h JOIN event e ON e.id = h.event_id
        WHERE h.person_id = ? AND h.attending IN ('yes','maybe') AND e.deleted_at IS NULL AND e.start_date >= ? AND e.start_date <= ?`,
      meId,
      fromDay,
      toDay,
    );
    for (const h of hats)
      items.push({
        key: `h:${h.id}`,
        at: new Date(`${h.start_date}T${h.start_time || '09:00'}:00`).toISOString(),
        kind: 'hat',
        title: h.name,
        subtitle: [h.attending === 'yes' ? 'You’re signed up' : 'Maybe', h.location].filter(Boolean).join(' · '),
        tag: null,
        following: false,
        url: `/hat/${h.id}`,
      });
    const meetings = await db.getAllAsync<{ id: string; name: string; start_date: string; start_time: string | null; meeting_url: string | null; location: string | null }>(
      `SELECT c.id, c.name, c.start_date, c.start_time, c.meeting_url, c.location FROM meeting_rsvp r JOIN calendar_entry c ON c.id = r.calendar_entry_id
        WHERE r.person_id = ? AND r.status IN ('going','late') AND c.deleted_at IS NULL AND c.start_date >= ? AND c.start_date <= ?`,
      meId,
      fromDay,
      toDay,
    );
    for (const m of meetings)
      items.push({
        key: `m:${m.id}`,
        at: new Date(`${m.start_date}T${m.start_time || '09:00'}:00`).toISOString(),
        kind: 'meeting',
        title: m.name,
        subtitle: ['You’re going', m.meeting_url ? 'Online' : m.location].filter(Boolean).join(' · '),
        tag: null,
        following: false,
        url: `/hub/meeting/${m.id}`,
      });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));

  // Results from the last week, for teams/events in scope.
  const inScope = (g: GameListItem) =>
    mine.has(g.team_a_id) || mine.has(g.team_b_id) || followedTeams.has(g.team_a_id) || followedTeams.has(g.team_b_id) || (!!g.event_id && followedEvents.has(g.event_id));
  const weekAgo = new Date(now.getTime() - WEEK).toISOString();
  const recent = games.filter((g) => g.status === 'final' && inScope(g) && (g.ended_at ?? g.started_at ?? '') >= weekAgo).slice(0, 3);
  const live = games.filter((g) => g.status === 'live' && inScope(g));

  return {
    competitions,
    timeline: items,
    recent,
    live,
    hasScope: mine.size + followedTeams.size + followedEvents.size + followedPickups.size > 0,
  };
}

/** "Today", "Tomorrow", or "Sat 25 Oct" for a timeline day header. */
export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t.getTime()) / 86400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return shortDate(iso);
}
