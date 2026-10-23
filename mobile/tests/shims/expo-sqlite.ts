import { DatabaseSync } from 'node:sqlite';
export type SQLiteDatabase = ReturnType<typeof open>;
const norm = (args: any[]) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args).map((v: any) => (v === undefined ? null : v));
export function open(path = ':memory:') {
  const d = new DatabaseSync(path);
  let depth = 0;
  return {
    async execAsync(sql: string) { d.exec(sql); },
    async runAsync(sql: string, ...a: any[]) { const r = d.prepare(sql).run(...norm(a)); return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) }; },
    async getFirstAsync<T>(sql: string, ...a: any[]) { return (d.prepare(sql).get(...norm(a)) ?? null) as T | null; },
    async getAllAsync<T>(sql: string, ...a: any[]) { return d.prepare(sql).all(...norm(a)) as T[]; },
    async withTransactionAsync(fn: () => Promise<void>) {
      if (depth) return fn();
      depth++; d.exec('BEGIN');
      try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
  };
}
export const useSQLiteContext = () => { throw new Error('n/a'); };
