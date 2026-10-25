/* Shared helpers for the local database: ids, timestamps, and write() (a transaction that tells screens to refresh). */

import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { notifyChanged } from '../live';

export const uuid = () => randomUUID();

/** Person columns safe to load into screens: email is never selected. */
export const personCols = (alias = '') => {
  const a = alias ? `${alias}.` : '';
  return `${a}id, ${a}first_name, ${a}last_name, ${a}nickname, NULL AS email, ${a}birth_date, ${a}gender, ${a}preferred_number, ${a}position, ${a}is_placeholder, ${a}photo_uri`;
};
export const now = () => new Date().toISOString();

export async function write<T>(db: SQLiteDatabase, fn: () => Promise<T>): Promise<T> {
  let result!: T;
  await db.withTransactionAsync(async () => {
    result = await fn();
  });
  notifyChanged();
  return result;
}

export async function deviceId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'device_id'`);
  if (row) return row.value;
  const id = uuid();
  await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('device_id', ?)`, id);
  return id;
}
