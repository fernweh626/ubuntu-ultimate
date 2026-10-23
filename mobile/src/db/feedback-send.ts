import type { SQLiteDatabase } from 'expo-sqlite';

import { supabase } from '@/lib/supabase';

import { markFeedbackSent, saveFeedback, unsentFeedback } from './development';

/**
 * Send any feedback still waiting on this phone. Works without signing in (the server only lets
 * people add reports, not read them). Returns how many went.
 */
export async function sendPendingFeedback(db: SQLiteDatabase) {
  let sent = 0;
  for (const f of await unsentFeedback(db)) {
    const { error } = await supabase.from('feedback').insert({
      id: f.id,
      kind: f.kind,
      title: f.title,
      body: f.body,
      screen: f.screen,
      app_version: f.app_version,
      device: f.device,
      contact_ok: f.contact_ok,
      person_id: f.contact_ok ? f.person_id : null,
      created_at: f.created_at,
    });
    // 23505 = already there (sent before, but we didn't hear back).
    if (!error || error.code === '23505') {
      await markFeedbackSent(db, f.id);
      sent += 1;
    } else break;
  }
  return sent;
}

export type ServerFeedback = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  screen: string | null;
  app_version: string | null;
  device: string | null;
  contact_ok: number;
  person_id: string | null;
  created_at: string;
  status: 'new' | 'planned' | 'in_progress' | 'done' | 'wont_do';
  admin_note: string | null;
};

/** Admins only (the server enforces it). */
export async function allFeedback() {
  const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as ServerFeedback[];
}

export async function setFeedbackStatus(id: string, status: ServerFeedback['status'], note: string | null) {
  const { error } = await supabase.from('feedback').update({ status, admin_note: note }).eq('id', id);
  if (error) throw error;
}

/**
 * A request to the admins (access, or a privacy request): goes through the feedback inbox with the
 * player's name attached so an admin can reply. Returns true if it went now, false if it's queued.
 */
export async function sendRequest(db: SQLiteDatabase, title: string, body: string, personId: string | null) {
  await saveFeedback(db, { kind: 'other', title: title.slice(0, 200), body: body.slice(0, 5000), screen: null, app_version: null, device: null, contact_ok: 1, person_id: personId });
  return (await sendPendingFeedback(db).catch(() => 0)) > 0;
}
