import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_CLUBS } from '@/content/hub';
import { supabase } from '@/lib/supabase';

import { notifyChanged } from './live';
import { seedId } from './seed-ids';
import { adoptIds } from './shared-ids';

/*
 * Offline-first sync with Supabase.
 *  push: every local change is in sync_outbox (filled by triggers); send upserts/deletes in table order.
 *  pull: for each table, fetch rows changed on the server since the last pull (server_updated_at), plus
 *        tombstones for deletes, and write them locally with the outbox triggers switched off.
 * Conflicts: last write wins per row. Game events are append-only, so two scorers never overwrite each other.
 */

type TableSpec = {
  name: string;
  pk: string[];
  /** Server table or view to pull from (defaults to the same name). */
  pullFrom?: string;
  /** Pushed from the phone? Server-owned tables (levels) are pull-only. */
  push?: boolean;
  /** Local-only columns that never leave the phone. */
  localOnly?: string[];
};

// Parents before children so pushes and pulls apply cleanly.
export const TABLES: TableSpec[] = [
  { name: 'person', pk: ['id'], pullFrom: 'person_public', localOnly: ['email', 'birth_date'] },
  { name: 'club', pk: ['id'] },
  { name: 'team', pk: ['id'] },
  { name: 'club_staff', pk: ['id'] },
  { name: 'membership', pk: ['id'] },
  { name: 'venue', pk: ['id'] },
  { name: 'event', pk: ['id'] },
  { name: 'event_team', pk: ['id'] },
  { name: 'game', pk: ['id'] },
  { name: 'game_player', pk: ['id'] },
  { name: 'point', pk: ['id'] },
  { name: 'point_player', pk: ['point_id', 'person_id'] },
  { name: 'game_event', pk: ['id'] },
  { name: 'saved_line', pk: ['id'] },
  { name: 'saved_line_member', pk: ['line_id', 'person_id'] },
  { name: 'spirit_score', pk: ['id'] },
  { name: 'pickup_spot', pk: ['id'] },
  { name: 'calendar_entry', pk: ['id'] },
  { name: 'follow', pk: ['id'] },
  { name: 'game_status_log', pk: ['id'] },
  { name: 'bracket_slot', pk: ['id'] },
  { name: 'session', pk: ['id'] },
  { name: 'practice_rsvp', pk: ['id'] },
  { name: 'practice_attendance', pk: ['id'] },
  { name: 'game_availability', pk: ['id'] },
  { name: 'accreditation', pk: ['id'], localOnly: ['photo_uri'] },
  { name: 'self_rating', pk: ['id'] },
  { name: 'registration', pk: ['id'] },
  { name: 'association_standing', pk: ['id'], push: false },
  { name: 'org_link', pk: ['id'] },
  { name: 'announcement', pk: ['id'] },
  { name: 'meeting_rsvp', pk: ['id'] },
  { name: 'hat_signup', pk: ['id'] },
  { name: 'fitness_test', pk: ['id'] },
  { name: 'reflection', pk: ['id'] },
  { name: 'shoutout', pk: ['id'] },
  { name: 'join_request', pk: ['id'] },
  { name: 'role_grant', pk: ['id'], push: false },
];

const order = new Map(TABLES.map((t, i) => [t.name, i]));
const columnsCache = new Map<string, string[]>();

async function localColumns(db: SQLiteDatabase, table: string) {
  if (!columnsCache.has(table)) {
    const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    columnsCache.set(table, rows.map((r) => r.name));
  }
  return columnsCache.get(table)!;
}

async function meta(db: SQLiteDatabase, key: string) {
  return (await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, key))?.value ?? null;
}
async function setMeta(db: SQLiteDatabase, key: string, value: string | null) {
  if (value == null) await db.runAsync(`DELETE FROM app_meta WHERE key = ?`, key);
  else await db.runAsync(`INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value);
}

/** Run writes that come *from* the server without them going back into the outbox. */
async function asPull<T>(db: SQLiteDatabase, fn: () => Promise<T>) {
  await db.execAsync('PRAGMA foreign_keys = OFF');
  await setMeta(db, 'sync_pulling', '1');
  try {
    return await fn();
  } finally {
    await setMeta(db, 'sync_pulling', null);
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
}

export type SyncResult = { pushed: number; pulled: number; rejected: { table: string; message: string }[] };

/* ---------------------------------- Push ---------------------------------- */

async function push(db: SQLiteDatabase): Promise<Pick<SyncResult, 'pushed' | 'rejected'>> {
  const outbox = await db.getAllAsync<{ tbl: string; pk: string; op: 'upsert' | 'delete' }>(`SELECT tbl, pk, op FROM sync_outbox`);
  outbox.sort((a, b) => (order.get(a.tbl) ?? 99) - (order.get(b.tbl) ?? 99));
  let pushed = 0;
  const rejected: SyncResult['rejected'] = [];

  for (const spec of TABLES.filter((t) => t.push !== false)) {
    const items = outbox.filter((o) => o.tbl === spec.name);
    if (!items.length) continue;

    // Upserts, in chunks; a rejected chunk is retried row by row so one bad row doesn't block the rest.
    const ups = items.filter((i) => i.op === 'upsert');
    const cols = (await localColumns(db, spec.name)).filter((c) => !spec.localOnly?.includes(c));
    for (let i = 0; i < ups.length; i += 200) {
      const chunk = ups.slice(i, i + 200);
      const rows: Record<string, unknown>[] = [];
      for (const it of chunk) {
        const key = JSON.parse(it.pk) as Record<string, string>;
        const where = spec.pk.map((c) => `${c} = ?`).join(' AND ');
        const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM ${spec.name} WHERE ${where}`, ...spec.pk.map((c) => key[c]));
        if (row) rows.push(Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
      }
      const ok = async (subset: Record<string, unknown>[], items2: typeof chunk) => {
        if (subset.length) {
          const { error } = await supabase.from(spec.name).upsert(subset, { onConflict: spec.pk.join(',') });
          if (error) return error;
        }
        for (const it of items2) await db.runAsync(`DELETE FROM sync_outbox WHERE tbl = ? AND pk = ? AND op = 'upsert'`, it.tbl, it.pk);
        pushed += subset.length;
        return null;
      };
      const err = await ok(rows, chunk);
      if (err) {
        if (isNetwork(err)) throw new Error('offline');
        for (let k = 0; k < chunk.length; k += 1) {
          const one = rows.filter((r) => spec.pk.every((c) => String(r[c]) === String((JSON.parse(chunk[k].pk) as Record<string, string>)[c])));
          const e1 = await ok(one, [chunk[k]]);
          if (e1) {
            if (isNetwork(e1)) throw new Error('offline');
            rejected.push({ table: spec.name, message: e1.message });
            // Not allowed (e.g. no permission): drop it so it doesn't block every future sync.
            await db.runAsync(`DELETE FROM sync_outbox WHERE tbl = ? AND pk = ?`, chunk[k].tbl, chunk[k].pk);
          }
        }
      }
    }

    // Private details travel separately and are never read back for other people.
    if (spec.name === 'person' && ups.length) {
      for (const it of ups) {
        const id = (JSON.parse(it.pk) as { id: string }).id;
        const p = await db.getFirstAsync<{ email: string | null; birth_date: string | null }>(`SELECT email, birth_date FROM person WHERE id = ?`, id);
        if (p && (p.email || p.birth_date)) {
          const { error } = await supabase.from('person_private').upsert({ person_id: id, email: p.email, birth_date: p.birth_date }, { onConflict: 'person_id' });
          if (error && isNetwork(error)) throw new Error('offline');
        }
      }
    }

    for (const it of items.filter((i) => i.op === 'delete')) {
      const key = JSON.parse(it.pk) as Record<string, string>;
      const { error } = await supabase.from(spec.name).delete().match(key);
      if (error && isNetwork(error)) throw new Error('offline');
      if (error) rejected.push({ table: spec.name, message: error.message });
      await db.runAsync(`DELETE FROM sync_outbox WHERE tbl = ? AND pk = ? AND op = 'delete'`, it.tbl, it.pk);
      pushed += 1;
    }
  }
  return { pushed, rejected };
}

function isNetwork(e: { message?: string; code?: string }) {
  return /fetch|network|timed? ?out|Failed to fetch/i.test(e.message ?? '') && !e.code;
}

/* ---------------------------------- Pull ---------------------------------- */

async function pull(db: SQLiteDatabase) {
  let pulled = 0;
  for (const spec of TABLES) {
    const cursorKey = `pull:${spec.name}`;
    let cursor = (await meta(db, cursorKey)) ?? '1970-01-01T00:00:00Z';
    const cols = await localColumns(db, spec.name);
    for (;;) {
      const { data, error } = await supabase
        .from(spec.pullFrom ?? spec.name)
        .select('*')
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(1000);
      if (error) throw new Error(isNetwork(error) ? 'offline' : `${spec.name}: ${error.message}`);
      if (!data?.length) break;
      await asPull(db, async () => {
        for (const row of data as Record<string, unknown>[]) {
          const use = cols.filter((c) => c in row && !spec.localOnly?.includes(c));
          const updates = use.filter((c) => !spec.pk.includes(c));
          await db.runAsync(
            `INSERT INTO ${spec.name} (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})
             ON CONFLICT(${spec.pk.join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}` : 'NOTHING'}`,
            ...use.map((c) => (row[c] ?? null) as string | number | null),
          );
        }
      });
      pulled += data.length;
      cursor = String((data[data.length - 1] as { server_updated_at: string }).server_updated_at);
      await setMeta(db, cursorKey, cursor);
      if (data.length < 1000) break;
    }
  }

  // Deletes made elsewhere.
  let tomb = (await meta(db, 'pull:deleted_row')) ?? '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await supabase.from('deleted_row').select('tbl, pk, deleted_at').gt('deleted_at', tomb).order('deleted_at').limit(1000);
    if (error) throw new Error(isNetwork(error) ? 'offline' : error.message);
    if (!data?.length) break;
    await asPull(db, async () => {
      for (const d of data as { tbl: string; pk: Record<string, string> }[]) {
        const spec = TABLES.find((t) => t.name === d.tbl);
        if (!spec) continue;
        await db.runAsync(`DELETE FROM ${spec.name} WHERE ${spec.pk.map((c) => `${c} = ?`).join(' AND ')}`, ...spec.pk.map((c) => d.pk[c]));
      }
    });
    tomb = (data[data.length - 1] as { deleted_at: string }).deleted_at;
    await setMeta(db, 'pull:deleted_row', tomb);
    if (data.length < 1000) break;
  }
  return pulled;
}

/* -------------------------------- First sync -------------------------------- */

export async function prepareFirstSync(db: SQLiteDatabase) {
  await asPull(db, async () => {
    // 1. Shared ids for starting data.
    await adoptIds(db);

    // 2. Remove sample teams, their made-up players and their games.
    const samples = (await db.getAllAsync<{ id: string }>(`SELECT id FROM team WHERE is_sample = 1`)).map((t) => t.id);
    if (samples.length) {
      const q = samples.map(() => '?').join(',');
      const games = (await db.getAllAsync<{ id: string }>(`SELECT id FROM game WHERE team_a_id IN (${q}) OR team_b_id IN (${q})`, ...samples, ...samples)).map((g) => g.id);
      if (games.length) {
        const gq = games.map(() => '?').join(',');
        await db.runAsync(`DELETE FROM point_player WHERE point_id IN (SELECT id FROM point WHERE game_id IN (${gq}))`, ...games);
        for (const t of ['point', 'game_event', 'game_player', 'spirit_score', 'game_status_log', 'reflection', 'shoutout', 'game_availability']) {
          await db.runAsync(`DELETE FROM ${t} WHERE game_id IN (${gq})`, ...games);
        }
        await db.runAsync(`UPDATE bracket_slot SET game_id = NULL WHERE game_id IN (${gq})`, ...games);
        await db.runAsync(`DELETE FROM game WHERE id IN (${gq})`, ...games);
      }
      const people = (
        await db.getAllAsync<{ person_id: string }>(
          `SELECT DISTINCT person_id FROM membership WHERE team_id IN (${q})
            AND person_id NOT IN (SELECT person_id FROM membership WHERE team_id NOT IN (${q}))`,
          ...samples,
          ...samples,
        )
      ).map((p) => p.person_id);
      const me = await meta(db, 'me_person_id');
      const drop = people.filter((p) => p !== me);
      await db.runAsync(`DELETE FROM saved_line_member WHERE line_id IN (SELECT id FROM saved_line WHERE team_id IN (${q}))`, ...samples);
      for (const t of ['practice_rsvp', 'practice_attendance']) await db.runAsync(`DELETE FROM ${t} WHERE session_id IN (SELECT id FROM session WHERE team_id IN (${q}))`, ...samples);
      await db.runAsync(`DELETE FROM game_availability WHERE team_id IN (${q})`, ...samples);
      if (drop.length) {
        const dq = drop.map(() => '?').join(',');
        for (const t of ['practice_rsvp', 'practice_attendance', 'game_availability', 'accreditation', 'self_rating', 'fitness_test', 'registration', 'club_staff']) await db.runAsync(`DELETE FROM ${t} WHERE person_id IN (${dq})`, ...drop);
      }
      for (const t of ['saved_line', 'membership', 'event_team', 'session']) await db.runAsync(`DELETE FROM ${t} WHERE team_id IN (${q})`, ...samples);
      await db.runAsync(`DELETE FROM follow WHERE kind = 'team' AND target_id IN (${q})`, ...samples);
      if (drop.length) await db.runAsync(`DELETE FROM person WHERE id IN (${drop.map(() => '?').join(',')})`, ...drop);
      await db.runAsync(`DELETE FROM team WHERE id IN (${q})`, ...samples);
    }
    await db.runAsync(`DELETE FROM pickup_spot WHERE is_sample = 1`);
  });

  // 3. Queue everything that isn't shared starting data.
  const seedTeamIds = await Promise.all(SEED_CLUBS.map((c) => seedId('team', c.name)));
  const seedVenueIds = await Promise.all(['Plumstead 1', 'Plumstead 2', 'Wynberg 1'].map((n) => seedId('venue', n)));
  const seedCal = new Set(
    await Promise.all((await db.getAllAsync<{ name: string }>(`SELECT name FROM calendar_entry`)).map((c) => seedId('calendar', c.name))),
  );
  const skip = new Set([...seedTeamIds, ...seedVenueIds, ...seedCal]);
  const at = new Date().toISOString();
  for (const spec of TABLES.filter((t) => t.push !== false)) {
    const rows = await db.getAllAsync<Record<string, string>>(`SELECT ${spec.pk.join(', ')} FROM ${spec.name}`);
    for (const r of rows) {
      if (spec.pk.length === 1 && skip.has(r.id)) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO sync_outbox (tbl, pk, op, at) VALUES (?, ?, 'upsert', ?)`,
        spec.name,
        JSON.stringify(Object.fromEntries(spec.pk.map((c) => [c, r[c]]))),
        at,
      );
    }
  }
}

/* --------------------------------- Run it --------------------------------- */

let running: Promise<SyncResult> | null = null;

/** Push then pull. Safe to call often: overlapping calls share one run. */
export function syncNow(db: SQLiteDatabase): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw new Error('signed-out');
    if ((await meta(db, 'sync_user')) !== user.id) {
      // First sync for this account on this phone.
      await prepareFirstSync(db);
      await setMeta(db, 'sync_user', user.id);
    }
    const { pushed, rejected } = await push(db);
    const pulled = await pull(db);
    await setMeta(db, 'sync_last', new Date().toISOString());
    if (rejected.length) await setMeta(db, 'sync_rejected', JSON.stringify(rejected.slice(-20)));
    if (pushed || pulled) notifyChanged();
    return { pushed, pulled, rejected };
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function syncStatus(db: SQLiteDatabase) {
  const [last, pending, rejected] = await Promise.all([
    meta(db, 'sync_last'),
    db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_outbox`),
    meta(db, 'sync_rejected'),
  ]);
  return { last, pending: pending?.n ?? 0, rejected: rejected ? (JSON.parse(rejected) as SyncResult['rejected']) : [] };
}
