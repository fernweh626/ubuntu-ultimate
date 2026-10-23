import type { SQLiteDatabase } from 'expo-sqlite';

import { shortDate, timeOfDay } from '@/domain/format';
import { STATUS_REASONS, type StatusReason } from '@/domain/fixtures';

import { getPrefs } from './plan';

/*
 * Things that start on someone else's phone and arrive here by sync: shout-outs, fixture changes,
 * postponements and forfeits, join requests and their answers, results of followed teams.
 * We remember what we've already seen; the very first run only records a baseline, so nobody gets a
 * flood of old news.
 */

type Seen = {
  shoutouts: string[];
  requests: string[];
  decided: string[];
  status: string[];
  results: string[];
  cancelled?: string[];
  announcements?: string[];
  fixtures: Record<string, string>;
};

export type Instant = { key: string; title: string; body: string; url: string };

const EMPTY: Seen = { shoutouts: [], requests: [], decided: [], status: [], results: [], fixtures: {} };

async function load(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'notify:seen'`);
  return row ? ({ ...EMPTY, ...JSON.parse(row.value) } as Seen) : null;
}

async function save(db: SQLiteDatabase, s: Seen) {
  const trim = (xs: string[]) => xs.slice(-500);
  const v = { ...s, announcements: trim(s.announcements ?? []), cancelled: trim(s.cancelled ?? []), shoutouts: trim(s.shoutouts), requests: trim(s.requests), decided: trim(s.decided), status: trim(s.status), results: trim(s.results) };
  await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('notify:seen', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, JSON.stringify(v));
}

const name = (p: { first_name: string; last_name: string } | null) => (p ? `${p.first_name} ${p.last_name ? p.last_name[0] : ''}`.trim() : 'A teammate');

export async function detectEvents(db: SQLiteDatabase): Promise<Instant[]> {
  const me = (await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'me_person_id'`))?.value;
  if (!me) return [];
  const prefs = await getPrefs(db);
  const prev = await load(db);
  const seen: Seen = prev ?? { ...EMPTY, fixtures: {} };
  const out: Instant[] = [];
  const first = !prev;

  const teams = await db.getAllAsync<{ team_id: string; role: string }>(
    `SELECT team_id, role FROM membership WHERE person_id = ? AND end_date IS NULL AND deleted_at IS NULL`,
    me,
  );
  const mine = teams.map((t) => t.team_id);
  const staffOf = teams.filter((t) => t.role !== 'player').map((t) => t.team_id);
  const followed = (await db.getAllAsync<{ target_id: string }>(`SELECT target_id FROM follow WHERE kind = 'team'`)).map((f) => f.target_id);
  const inList = (xs: string[]) => (xs.length ? xs.map(() => '?').join(',') : `''`);

  // Shout-outs to me.
  const shouts = await db.getAllAsync<{ id: string; reason: string | null; first_name: string; last_name: string }>(
    `SELECT s.id, s.reason, p.first_name, p.last_name FROM shoutout s LEFT JOIN person p ON p.id = s.from_person_id
      WHERE s.to_person_id = ? AND s.from_person_id != ?`,
    me,
    me,
  );
  for (const s of shouts) {
    if (seen.shoutouts.includes(s.id)) continue;
    seen.shoutouts.push(s.id);
    if (!first && prefs.shoutouts) {
      out.push({ key: `shout:${s.id}`, title: `🙌 ${name(s)} shouted you out`, body: s.reason ? `“${s.reason}”` : 'Open the app to see it.', url: '/log' });
    }
  }

  // Join requests for teams I run, and answers to mine.
  if (staffOf.length) {
    const reqs = await db.getAllAsync<{ id: string; team: string; first_name: string; last_name: string; kind: string; team_id: string }>(
      `SELECT r.id, r.kind, r.team_id, t.name AS team, p.first_name, p.last_name FROM join_request r
         JOIN team t ON t.id = r.team_id LEFT JOIN person p ON p.id = r.person_id
        WHERE r.status = 'pending' AND r.team_id IN (${inList(staffOf)})`,
      ...staffOf,
    );
    for (const r of reqs) {
      if (seen.requests.includes(r.id)) continue;
      seen.requests.push(r.id);
      if (!first && prefs.joinRequests) {
        out.push({ key: `req:${r.id}`, title: `${name(r)} wants to join ${r.team}`, body: `As ${r.kind}. Approve or decline on the team page.`, url: `/team/${r.team_id}` });
      }
    }
  }
  const decided = await db.getAllAsync<{ id: string; status: string; team: string; team_id: string }>(
    `SELECT r.id, r.status, r.team_id, t.name AS team FROM join_request r JOIN team t ON t.id = r.team_id
      WHERE r.person_id = ? AND r.status IN ('approved','declined')`,
    me,
  );
  for (const r of decided) {
    if (seen.decided.includes(r.id)) continue;
    seen.decided.push(r.id);
    if (!first && prefs.joinRequests) {
      out.push({
        key: `dec:${r.id}`,
        title: r.status === 'approved' ? `You’re in! Welcome to ${r.team}` : `${r.team} declined your request`,
        body: r.status === 'approved' ? 'Their games, lines and practices now show up for you.' : 'You can ask again or contact the team.',
        url: `/team/${r.team_id}`,
      });
    }
  }

  // My teams' fixtures: time/field changes, postponements, forfeits.
  if (mine.length && prefs.fixtureChanges) {
    const fixtures = await db.getAllAsync<{ id: string; scheduled_at: string | null; venue_id: string | null; a: string; b: string; team_a_id: string }>(
      `SELECT g.id, g.scheduled_at, g.venue_id, g.team_a_id, ta.name AS a, tb.name AS b FROM game g
         JOIN team ta ON ta.id = g.team_a_id JOIN team tb ON tb.id = g.team_b_id
        WHERE g.status = 'scheduled' AND g.deleted_at IS NULL AND (g.team_a_id IN (${inList(mine)}) OR g.team_b_id IN (${inList(mine)}))`,
      ...mine,
      ...mine,
    );
    for (const f of fixtures) {
      const sig = `${f.scheduled_at ?? 'tbc'}|${f.venue_id ?? ''}`;
      const before = seen.fixtures[f.id];
      seen.fixtures[f.id] = sig;
      if (first || !before || before === sig) continue;
      const opp = mine.includes(f.team_a_id) ? f.b : f.a;
      out.push({
        key: `fix:${f.id}:${sig}`,
        title: `Game v ${opp} has moved`,
        body: f.scheduled_at ? `Now ${shortDate(f.scheduled_at)} ${timeOfDay(f.scheduled_at)}. Tap for the field and details.` : 'The new date is to be confirmed.',
        url: `/game/${f.id}/fixture`,
      });
    }
    const logs = await db.getAllAsync<{ id: string; action: string; reason: StatusReason | null; game_id: string; a: string; b: string; team_a_id: string; by: string | null }>(
      `SELECT l.id, l.action, l.reason, l.game_id, ta.name AS a, tb.name AS b, g.team_a_id, tby.name AS by
         FROM game_status_log l JOIN game g ON g.id = l.game_id
         JOIN team ta ON ta.id = g.team_a_id JOIN team tb ON tb.id = g.team_b_id LEFT JOIN team tby ON tby.id = l.team_id
        WHERE l.action IN ('postpone','forfeit') AND (g.team_a_id IN (${inList(mine)}) OR g.team_b_id IN (${inList(mine)}))`,
      ...mine,
      ...mine,
    );
    for (const l of logs) {
      if (seen.status.includes(l.id)) continue;
      seen.status.push(l.id);
      if (first) continue;
      const opp = mine.includes(l.team_a_id) ? l.b : l.a;
      out.push({
        key: `st:${l.id}`,
        title: l.action === 'postpone' ? `Game v ${opp} postponed` : `Game v ${opp}: forfeit`,
        body: `${l.by ? `${l.by} · ` : ''}${l.reason ? STATUS_REASONS[l.reason] : ''}`.trim() || 'Tap for details.',
        url: l.action === 'postpone' ? `/game/${l.game_id}/fixture` : `/game/${l.game_id}/report`,
      });
    }
  }

  // Practices of my teams that got cancelled (only if I hadn't already said I'm not coming).
  if (mine.length && prefs.practices) {
    seen.cancelled ??= [];
    const cancelled = await db.getAllAsync<{ id: string; started_at: string; team: string; status: string | null }>(
      `SELECT s.id, s.started_at, t.name AS team, (SELECT status FROM practice_rsvp r WHERE r.session_id = s.id AND r.person_id = ?) AS status
         FROM session s JOIN team t ON t.id = s.team_id
        WHERE s.kind = 'practice' AND s.cancelled_at IS NOT NULL AND s.deleted_at IS NULL AND s.team_id IN (${inList(mine)}) AND s.started_at >= ?`,
      me,
      ...mine,
      new Date().toISOString(),
    );
    for (const c of cancelled) {
      if (seen.cancelled.includes(c.id)) continue;
      seen.cancelled.push(c.id);
      if (!first && c.status !== 'not_going') {
        out.push({ key: `pcx:${c.id}`, title: `${c.team} practice cancelled`, body: `${shortDate(c.started_at)} ${timeOfDay(c.started_at)} is off.`, url: `/practice/${c.id}` });
      }
    }
  }

  // New announcements for my region or national.
  if (prefs.announcements) {
    seen.announcements ??= [];
    const home = (await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'home_region'`))?.value ?? null;
    const anns = await db.getAllAsync<{ id: string; title: string; body: string | null; region_code: string | null }>(
      `SELECT id, title, body, region_code FROM announcement WHERE deleted_at IS NULL ORDER BY published_at DESC LIMIT 50`,
    );
    for (const a of anns) {
      if (seen.announcements.includes(a.id)) continue;
      seen.announcements.push(a.id);
      if (!first && (!a.region_code || !home || home === 'all' || a.region_code === home)) {
        out.push({ key: `ann:${a.id}`, title: `📣 ${a.title}`, body: a.body ? a.body.slice(0, 140) : 'Tap to read.', url: '/hub/announcements' });
      }
    }
  }

  // Results of teams I follow (off by default).
  if (followed.length) {
    const results = await db.getAllAsync<{ id: string; a: string; b: string; sa: number; sb: number }>(
      `SELECT g.id, ta.name AS a, tb.name AS b,
              (SELECT COUNT(*) FROM point p WHERE p.game_id = g.id AND p.scoring_team_id = g.team_a_id) AS sa,
              (SELECT COUNT(*) FROM point p WHERE p.game_id = g.id AND p.scoring_team_id = g.team_b_id) AS sb
         FROM game g JOIN team ta ON ta.id = g.team_a_id JOIN team tb ON tb.id = g.team_b_id
        WHERE g.status = 'final' AND g.deleted_at IS NULL AND (g.team_a_id IN (${inList(followed)}) OR g.team_b_id IN (${inList(followed)}))`,
      ...followed,
      ...followed,
    );
    for (const r of results) {
      if (seen.results.includes(r.id)) continue;
      seen.results.push(r.id);
      if (!first && prefs.followedResults) out.push({ key: `res:${r.id}`, title: `Final: ${r.a} ${r.sa}–${r.sb} ${r.b}`, body: 'Tap for the full report.', url: `/game/${r.id}/report` });
    }
  }

  await save(db, seen);
  return out;
}
