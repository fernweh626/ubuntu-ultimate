import type { SQLiteDatabase } from 'expo-sqlite';

import { shortDate, timeOfDay } from '@/domain/format';

/*
 * Which notifications this phone should have scheduled, worked out from local data. Everything here
 * is a "local" notification: it works offline and in Expo Go. Things that start on another phone
 * (shout-outs, fixture changes, join requests) are noticed when they arrive by sync — see events.ts.
 */

export type NotifyPrefs = {
  gameReminders: boolean;
  postGame: boolean;
  practices: boolean;
  accreditation: boolean;
  development: boolean;
  spirit: boolean;
  roster: boolean;
  shoutouts: boolean;
  fixtureChanges: boolean;
  joinRequests: boolean;
  followedResults: boolean;
  quietStart: number | null; // hour, e.g. 21
  quietEnd: number | null; // hour, e.g. 7
};

export const DEFAULT_PREFS: NotifyPrefs = {
  gameReminders: true,
  postGame: true,
  practices: true,
  accreditation: true,
  development: true,
  spirit: true,
  roster: true,
  shoutouts: true,
  fixtureChanges: true,
  joinRequests: true,
  followedResults: false,
  quietStart: 21,
  quietEnd: 7,
};

export async function getPrefs(db: SQLiteDatabase): Promise<NotifyPrefs> {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'notify:prefs'`);
  return { ...DEFAULT_PREFS, ...(row ? JSON.parse(row.value) : {}) };
}

export async function setPrefs(db: SQLiteDatabase, prefs: NotifyPrefs) {
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES ('notify:prefs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    JSON.stringify(prefs),
  );
}

export type Planned = { key: string; kind: keyof NotifyPrefs; at: Date; title: string; body: string; url: string; gameDay?: boolean };

// A real game's hard cap is 100 minutes, so the 100-minute reminder gets a nod to it.
const HUNDRED = [
  (v: string) => `100 minutes to the pull. That’s one full hard cap to find your boots. ${v}`,
  (v: string) => `T-minus one game length ⏱ ${v}`,
  (v: string) => `In 100 minutes this becomes a game. Hydrate now, thank yourself on point 14. ${v}`,
  (v: string) => `You have exactly one hard cap of time. Stretch, eat, find a light and a dark shirt. ${v}`,
  (v: string) => `100 minutes out. Enough time to warm up properly, not enough to talk yourself out of it. ${v}`,
];
const pick = (id: string, n: number) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % n;

/** Move a time out of quiet hours: to the end of quiet hours, but never after `latest`. */
function respectQuiet(at: Date, prefs: NotifyPrefs, latest?: Date) {
  if (prefs.quietStart == null || prefs.quietEnd == null) return at;
  const h = at.getHours() + at.getMinutes() / 60;
  const quiet = prefs.quietStart > prefs.quietEnd ? h >= prefs.quietStart || h < prefs.quietEnd : h >= prefs.quietStart && h < prefs.quietEnd;
  if (!quiet) return at;
  const moved = new Date(at);
  if (h >= prefs.quietEnd && prefs.quietStart > prefs.quietEnd) moved.setDate(moved.getDate() + 1);
  moved.setHours(prefs.quietEnd, 0, 0, 0);
  // A reminder that would land after the thing it's about is no use: send it before quiet hours instead.
  if (latest && moved >= latest) {
    const before = new Date(at);
    // Early-morning times belong to the previous evening's quiet period.
    if (prefs.quietStart > prefs.quietEnd && h < prefs.quietEnd) before.setDate(before.getDate() - 1);
    before.setHours(prefs.quietStart, 0, 0, 0);
    before.setMinutes(before.getMinutes() - 30);
    return before;
  }
  return moved;
}

const nextMorning = (d: Date) => {
  const m = new Date(d);
  m.setDate(m.getDate() + 1);
  m.setHours(9, 0, 0, 0);
  return m;
};

export async function planNotifications(db: SQLiteDatabase, now = new Date()): Promise<Planned[]> {
  const prefs = await getPrefs(db);
  const me = (await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'me_person_id'`))?.value;
  if (!me) return [];
  const out: Planned[] = [];

  // Accreditation: 6 months, 1 month and 1 week before it expires, and on the day.
  const acc = await db.getFirstAsync<{ level: string; expires_on: string | null }>(`SELECT level, expires_on FROM accreditation WHERE person_id = ?`, me);
  if (acc?.expires_on && prefs.accreditation) {
    const end = new Date(`${acc.expires_on.slice(0, 10)}T09:00:00`);
    const steps: [number, string, string][] = [
      [182, 'Your accreditation expires in 6 months', 'Plenty of time, but book the course so leagues and nationals aren’t a scramble.'],
      [30, 'Accreditation expires in a month', 'You need it valid to play leagues, regionals and nationals. Renew it soon.'],
      [7, 'Accreditation expires in a week ⚠️', 'Renew now so you’re not left off a roster. Then update the expiry in the app.'],
      [0, 'Your accreditation expires today', 'Renew it and update the date in Me → Accreditation.'],
    ];
    for (const [days, title, body] of steps) {
      out.push({ key: `acc${days}:${acc.expires_on}`, kind: 'accreditation', at: new Date(end.getTime() - days * 86400_000), title, body, url: '/accreditation' });
    }
  }

  // Self-rating: six months after the last one.
  const lastRating = await db.getFirstAsync<{ rated_on: string }>(`SELECT rated_on FROM self_rating WHERE person_id = ? ORDER BY rated_on DESC LIMIT 1`, me);
  if (lastRating && prefs.development) {
    const due = new Date(`${lastRating.rated_on.slice(0, 10)}T09:00:00`);
    due.setDate(due.getDate() + 182);
    out.push({ key: `rate:${lastRating.rated_on}`, kind: 'development', at: due, title: 'Six months on: rate yourself again', body: 'Two minutes, five areas. See how far you’ve come since last time.', url: '/rate' });
  }

  const myTeams = (
    await db.getAllAsync<{ team_id: string; role: string }>(
      `SELECT team_id, role FROM membership WHERE person_id = ? AND end_date IS NULL AND deleted_at IS NULL`,
      me,
    )
  ).map((r) => ({ id: r.team_id, staff: r.role !== 'player', spirit: r.role === 'spirit_captain' || r.role === 'captain' }));
  if (!myTeams.length) return out.filter((p) => p.at > now);
  const teamIds = myTeams.map((t) => t.id);
  const q = teamIds.map(() => '?').join(',');
  const horizon = new Date(now.getTime() + 14 * 86400_000).toISOString();

  type G = { id: string; status: string; scheduled_at: string | null; ended_at: string | null; team_a_id: string; team_b_id: string; home_team_id: string | null; a: string; b: string; venue: string | null; forfeit_team_id: string | null };
  const games = await db.getAllAsync<G>(
    `SELECT g.id, g.status, g.scheduled_at, g.ended_at, g.team_a_id, g.team_b_id, g.home_team_id, g.forfeit_team_id,
            ta.name AS a, tb.name AS b, v.name AS venue
       FROM game g JOIN team ta ON ta.id = g.team_a_id JOIN team tb ON tb.id = g.team_b_id LEFT JOIN venue v ON v.id = g.venue_id
      WHERE g.deleted_at IS NULL AND (g.team_a_id IN (${q}) OR g.team_b_id IN (${q}))
        AND (g.status = 'scheduled' AND g.scheduled_at IS NOT NULL AND g.scheduled_at <= ?
             OR g.status = 'final' AND g.ended_at >= ?)`,
    ...teamIds,
    ...teamIds,
    horizon,
    new Date(now.getTime() - 2 * 86400_000).toISOString(),
  );

  for (const g of games) {
    const mine = teamIds.includes(g.team_a_id) ? g.team_a_id : g.team_b_id;
    const opp = mine === g.team_a_id ? g.b : g.a;
    const myName = mine === g.team_a_id ? g.a : g.b;
    const home = (g.home_team_id ?? g.team_a_id) === mine;

    if (g.status === 'scheduled' && g.scheduled_at && prefs.gameReminders) {
      const start = new Date(g.scheduled_at);
      // "Are you available?" 5 days out (or now, if the fixture is sooner), until answered.
      const said = await db.getFirstAsync(`SELECT 1 FROM game_availability WHERE game_id = ? AND person_id = ?`, g.id, me);
      if (!said) {
        out.push({
          key: `avail:${g.id}:${g.scheduled_at}`,
          kind: 'gameReminders',
          at: respectQuiet(new Date(Math.max(start.getTime() - 5 * 86400_000, now.getTime() + 60_000)), prefs, start),
          title: `Can you play ${shortDate(g.scheduled_at)} v ${opp}?`,
          body: 'One tap so your captains can pick the line-up.',
          url: `/game/${g.id}/fixture`,
        });
      }
      const where = `${myName} v ${opp}${g.venue ? ` at ${g.venue}` : ''}, ${timeOfDay(g.scheduled_at)}.`;
      out.push({
        key: `game24:${g.id}:${g.scheduled_at}`,
        kind: 'gameReminders',
        at: respectQuiet(new Date(start.getTime() - 24 * 3600_000), prefs, start),
        title: `Tomorrow ${timeOfDay(g.scheduled_at)} · v ${opp}`,
        body: `${where}${home ? ' You’re home, so bring the cones and discs 🥏' : ''}`,
        url: `/game/${g.id}/fixture`,
        gameDay: true,
      });
      out.push({
        key: `game100:${g.id}:${g.scheduled_at}`,
        kind: 'gameReminders',
        // Always send this one, even in quiet hours: it's a game that's about to start.
        at: new Date(start.getTime() - 100 * 60_000),
        title: `${myName} v ${opp} · ${timeOfDay(g.scheduled_at)}`,
        body: HUNDRED[pick(g.id, HUNDRED.length)](g.venue ? `📍 ${g.venue}` : ''),
        url: `/game/${g.id}/fixture`,
        gameDay: true,
      });
    }

    if (g.status === 'final' && g.ended_at && !g.forfeit_team_id) {
      const ended = new Date(g.ended_at);
      const played = await db.getFirstAsync(
        `SELECT 1 FROM game_player WHERE game_id = ? AND person_id = ? AND confirmation != 'removed'`,
        g.id,
        me,
      );
      const answered = await db.getFirstAsync(`SELECT 1 FROM reflection WHERE game_id = ? AND person_id = ?`, g.id, me);
      if (played && !answered && prefs.postGame) {
        // One message after the game (card + check-in), and one nudge next morning if still not done.
        out.push({
          key: `post:${g.id}`,
          kind: 'postGame',
          at: respectQuiet(new Date(ended.getTime() + 30 * 60_000), prefs),
          title: 'GG! Your game card is ready',
          body: `${myName} v ${opp}. Share your card, and take 1 minute to tell your coaches how it went.`,
          url: `/game/${g.id}/report`,
        });
        out.push({
          key: `post2:${g.id}`,
          kind: 'postGame',
          at: nextMorning(ended),
          title: 'Quick one from last night',
          body: `How was ${myName} v ${opp}? It takes a minute, and your coaches read every answer.`,
          url: `/reflect?gameId=${g.id}`,
        });
      }
      const team = myTeams.find((t) => t.id === mine)!;
      if (team.spirit && prefs.spirit) {
        const done = await db.getFirstAsync(`SELECT 1 FROM spirit_score WHERE game_id = ? AND from_team_id = ?`, g.id, mine);
        if (!done) {
          out.push({
            key: `spirit:${g.id}`,
            kind: 'spirit',
            at: respectQuiet(new Date(ended.getTime() + 2 * 3600_000), prefs, new Date(ended.getTime() + 12 * 3600_000)),
            title: `Spirit score for ${opp} is due`,
            body: 'Two minutes, five categories. It closes 12 hours after the game.',
            url: `/game/${g.id}/spirit`,
          });
        }
      }
      if (team.staff && prefs.roster) {
        const pending = await db.getFirstAsync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM game_player WHERE game_id = ? AND team_id = ? AND confirmation = 'pending'`,
          g.id,
          mine,
        );
        if (pending && pending.n > 0) {
          out.push({
            key: `roster:${g.id}`,
            kind: 'roster',
            at: nextMorning(ended),
            title: `Who played for ${myName}?`,
            body: `${pending.n} player${pending.n > 1 ? 's' : ''} from v ${opp} still to confirm, so their stats count.`,
            url: `/game/${g.id}/report`,
          });
        }
      }
    }
  }

  // Practices: "are you coming?" the day before, a reminder if you're going, and a check-in after.
  if (prefs.practices) {
    const practices = await db.getAllAsync<{ id: string; title: string | null; started_at: string; duration_min: number; team: string; venue: string | null; status: string | null; answered: number }>(
      `SELECT s.id, s.title, s.started_at, s.duration_min, t.name AS team, v.name AS venue,
              (SELECT status FROM practice_rsvp r WHERE r.session_id = s.id AND r.person_id = ?) AS status,
              EXISTS (SELECT 1 FROM reflection rf WHERE rf.session_id = s.id AND rf.person_id = ?) AS answered
         FROM session s JOIN team t ON t.id = s.team_id LEFT JOIN venue v ON v.id = s.venue_id
        WHERE s.kind = 'practice' AND s.deleted_at IS NULL AND s.cancelled_at IS NULL AND s.team_id IN (${q})
          AND s.started_at >= ? AND s.started_at <= ?`,
      me,
      me,
      ...teamIds,
      new Date(now.getTime() - 2 * 86400_000).toISOString(),
      horizon,
    );
    for (const pr of practices) {
      const start = new Date(pr.started_at);
      const endAt = new Date(start.getTime() + pr.duration_min * 60_000);
      const what = `${pr.team} practice${pr.title ? ` · ${pr.title}` : ''}`;
      if (!pr.status) {
        out.push({
          key: `prsvp:${pr.id}`,
          kind: 'practices',
          at: respectQuiet(new Date(start.getTime() - 24 * 3600_000), prefs, start),
          title: `Practice tomorrow ${timeOfDay(pr.started_at)}: are you coming?`,
          body: `${what}${pr.venue ? ` at ${pr.venue}` : ''}. One tap so your captains can plan.`,
          url: `/practice/${pr.id}`,
        });
      }
      if (pr.status === 'going' || pr.status === 'late') {
        out.push({
          key: `pgo:${pr.id}`,
          kind: 'practices',
          at: respectQuiet(new Date(start.getTime() - 2 * 3600_000), prefs, start),
          title: `Practice at ${timeOfDay(pr.started_at)}`,
          body: `${what}${pr.venue ? ` · 📍 ${pr.venue}` : ''}. Light and dark shirt, water.`,
          url: `/practice/${pr.id}`,
        });
      }
      if ((pr.status === 'going' || pr.status === 'late') && !pr.answered) {
        out.push({
          key: `pafter:${pr.id}`,
          kind: 'practices',
          at: respectQuiet(new Date(endAt.getTime() + 30 * 60_000), prefs),
          title: 'How was practice?',
          body: 'A minute for your coaches: how hard it was, how you felt, anything niggling.',
          url: `/reflect?sessionId=${pr.id}`,
        });
      }
    }
  }

  // Only the future, at most three a day — except game days, which get everything for that game.
  const future = out.filter((p) => p.at > now).sort((a, b) => a.at.getTime() - b.at.getTime());
  const perDay = new Map<string, number>();
  return future.filter((p) => {
    if (p.gameDay) return true;
    const day = p.at.toDateString();
    const n = perDay.get(day) ?? 0;
    if (n >= 3) return false;
    perDay.set(day, n + 1);
    return true;
  });
}

export function describeWhen(d: Date) {
  return `${shortDate(d.toISOString())} ${timeOfDay(d.toISOString())}`;
}
