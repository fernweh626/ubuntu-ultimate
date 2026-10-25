import type { SQLiteDatabase } from 'expo-sqlite';

import { ASSOCIATIONS } from '@/content/associations';
import { supabase } from '@/lib/supabase';

import { notifyChanged } from './live';
import { prefillFromRoster } from './membership';
import { setMeId } from './repo';
import { syncNow } from './sync';

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(friendly(error.message));
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(friendly(error.message));
  if (!data.session) throw new Error('Account created — check your email to confirm it, then sign in.');
}

/** Sign out but keep everything on this phone; it syncs again when you sign back in. */
export async function signOut(db: SQLiteDatabase) {
  await supabase.auth.signOut();
  await db.runAsync(`DELETE FROM app_meta WHERE key = 'signed_in'`);
  notifyChanged();
}

function friendly(m: string) {
  if (/invalid login/i.test(m)) return 'Wrong email or password.';
  if (/already registered/i.test(m)) return 'That email already has an account — sign in instead.';
  if (/password should be/i.test(m)) return 'Use a password of at least 6 characters.';
  if (/fetch|network/i.test(m)) return 'No connection. Try again when you have signal.';
  return m;
}

/** The player this account is linked to on the server, if any. */
async function linkedPersonId() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('account').select('person_id').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return (data?.person_id as string | undefined) ?? null;
}

/**
 * Link the signed-in account to a player, make them "me" on this phone, sync, and — only if nobody is
 * admin yet — make them the first admin. Returns whether they became admin.
 */
export async function linkAccount(db: SQLiteDatabase, personId: string) {
  const user = await currentUser();
  if (!user) throw new Error('Sign in first.');
  const existing = await linkedPersonId();
  if (!existing) {
    const { error } = await supabase.from('account').insert({ user_id: user.id, person_id: personId });
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That player is already linked to another account.' : friendly(error.message));
  }
  const pid = existing ?? personId;
  await setMeId(db, pid);
  // Keep the account email with the player (private: only used to send them summaries and reminders).
  if (user.email) await db.runAsync(`UPDATE person SET email = ?, updated_at = ? WHERE id = ? AND (email IS NULL OR email != ?)`, user.email, new Date().toISOString(), pid, user.email);
  await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('signed_in', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, user.id);
  // Before any upload: the very first account becomes admin. It only needs the account link above.
  const admin = await claimFirstAdmin(db);
  // Members already on an association's list (past forms): fill in what's missing from their row.
  for (const a of Object.values(ASSOCIATIONS)) await prefillFromRoster(db, pid, a).catch(() => []);
  // The first upload can be big; let it run in the background instead of holding up this screen.
  syncNow(db).catch(() => {});
  notifyChanged();
  return admin;
}

/**
 * If nobody is admin yet, make this account the first admin, and record it on the phone straight away
 * so the app shows it before the next sync brings the server's copy down. Safe to call any time.
 */
export async function claimFirstAdmin(db: SQLiteDatabase) {
  const { data, error } = await supabase.rpc('claim_first_admin');
  if (error || !data) return false;
  const pid = await linkedPersonId();
  if (pid) {
    await db.runAsync(`INSERT OR IGNORE INTO role_grant (id, person_id, level, granted_by, created_at) VALUES (?, ?, 'admin', ?, ?)`, `first-admin:${pid}`, pid, pid, new Date().toISOString());
    notifyChanged();
  }
  return true;
}

/** After signing in on a phone where the account is already linked: just reconnect and sync. */
export async function resumeAccount(db: SQLiteDatabase) {
  const pid = await linkedPersonId();
  if (!pid) return false;
  const user = await currentUser();
  await setMeId(db, pid);
  await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('signed_in', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, user!.id);
  await claimFirstAdmin(db);
  syncNow(db).catch(() => {});
  notifyChanged();
  return true;
}

/** Several at once (staff's "Approve selected"), optionally labelling them core / guest / mercenary. */
export async function decideJoinRequests(db: SQLiteDatabase, requestIds: string[], approve: boolean, kind?: 'core' | 'guest' | 'mercenary' | null) {
  const { error } = await supabase.rpc('decide_join_requests', { reqs: requestIds, approve, as_kind: kind ?? null });
  if (error) throw new Error(friendly(error.message));
  await syncNow(db);
}
