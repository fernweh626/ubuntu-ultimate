import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { syncNow } from './sync';

/*
 * Accreditation certificates live in the private "accreditation" bucket, one folder per player, so
 * team staff can open and check them. Only PDFs; the bucket refuses anything else.
 */

async function pdfBytes(uri: string): Promise<ArrayBuffer | Blob> {
  if (Platform.OS === 'web' || uri.startsWith('data:') || uri.startsWith('blob:')) return (await fetch(uri)).blob();
  const { File } = await import('expo-file-system');
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Upload my certificate; returns its storage path. Needs signal and an account. */
export async function uploadCertificate(personId: string, uri: string) {
  const path = `${personId}/${Date.now()}.pdf`;
  const { error } = await supabase.storage.from('accreditation').upload(path, await pdfBytes(uri), { contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}

/** A short-lived link to open a certificate (the player, their team staff and coordinators). */
export async function certificateUrl(path: string) {
  const { data, error } = await supabase.storage.from('accreditation').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

/** Team staff or a coordinator: the level and expiry match the certificate (or they don't, with a note). */
export async function verifyAccreditation(db: SQLiteDatabase, personId: string, ok: boolean, note?: string) {
  const { error } = await supabase.rpc('verify_accreditation', { p_person: personId, ok, note: note ?? null });
  if (error) throw new Error(error.message);
  await syncNow(db);
}
