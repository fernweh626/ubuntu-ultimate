import type { SQLiteDatabase } from 'expo-sqlite';

import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { markFeedbackSent, saveFeedback, unsentFeedback } from './development';

async function imageBytes(uri: string): Promise<{ data: ArrayBuffer | Blob; type: string }> {
  if (Platform.OS === 'web' || uri.startsWith('data:') || uri.startsWith('blob:')) {
    const blob = await (await fetch(uri)).blob();
    return { data: blob, type: blob.type || 'image/jpeg' };
  }
  const { File } = await import('expo-file-system');
  const bytes = await new File(uri).bytes();
  return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, type: uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

/** Upload a report's screenshots to the private "feedback" bucket; returns their storage paths. */
async function uploadImages(id: string, uris: string[]) {
  const paths: string[] = [];
  for (const [i, uri] of uris.slice(0, 3).entries()) {
    const { data, type } = await imageBytes(uri);
    const path = `${id}/${i + 1}.${type === 'image/png' ? 'png' : 'jpg'}`;
    const { error } = await supabase.storage.from('feedback').upload(path, data, { contentType: type });
    if (error && !/exists|duplicate/i.test(error.message)) throw error;
    paths.push(path);
  }
  return paths;
}

/** Admins: short-lived links to view a report's screenshots. */
export async function feedbackImageUrls(images: string | null | undefined) {
  const paths = images ? (JSON.parse(images) as string[]) : [];
  if (!paths.length) return [];
  const { data } = await supabase.storage.from('feedback').createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
}

/**
 * Send any feedback still waiting on this phone. Works without signing in (the server only lets
 * people add reports, not read them). Returns how many went.
 */
export async function sendPendingFeedback(db: SQLiteDatabase) {
  let sent = 0;
  for (const f of await unsentFeedback(db)) {
    // Screenshots first (to the private bucket); the report keeps their paths.
    let images: string[] = [];
    try {
      images = await uploadImages(f.id, f.images_json ? (JSON.parse(f.images_json) as string[]) : []);
    } catch {
      break; // no signal: try the whole report again later
    }
    const { error } = await supabase.from('feedback').insert({
      images: images.length ? JSON.stringify(images) : null,
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
  images: string | null;
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
  await saveFeedback(db, { kind: 'other', title: title.slice(0, 200), body: body.slice(0, 5000), screen: null, app_version: null, device: null, contact_ok: 1, person_id: personId, images_json: null });
  return (await sendPendingFeedback(db).catch(() => 0)) > 0;
}
