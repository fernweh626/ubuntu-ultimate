/* The info hub: pickups and their RSVPs, the calendar and meeting RSVPs, and announcements. */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Announcement, CalendarEntry, PickupSpot } from '../types';
import { now, uuid, write } from './core';
import { getMeId } from './me';
import { RsvpStatus } from './sessions';

/* ---------------- Info hub: pickups & calendar ---------------- */

export function listPickups(db: SQLiteDatabase) {
  return db.getAllAsync<PickupSpot>(`SELECT * FROM pickup_spot WHERE deleted_at IS NULL ORDER BY day_of_week, start_time`);
}

export function getPickup(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<PickupSpot>(`SELECT * FROM pickup_spot WHERE id = ?`, id);
}

export function savePickup(db: SQLiteDatabase, p: Omit<PickupSpot, 'id' | 'is_sample'> & { id?: string }) {
  return write(db, async () => {
    const id = p.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO pickup_spot (id, name, region, city, area, day_of_week, start_time, end_time, venue_text, map_url,
         contact_name, contact_phone, whatsapp_url, level, cost, notes, created_by_person, editor_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, region = excluded.region, city = excluded.city,
         area = excluded.area, day_of_week = excluded.day_of_week, start_time = excluded.start_time,
         end_time = excluded.end_time, venue_text = excluded.venue_text, map_url = excluded.map_url,
         contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
         whatsapp_url = excluded.whatsapp_url, level = excluded.level, cost = excluded.cost, notes = excluded.notes,
         editor_ids = excluded.editor_ids, is_sample = 0, updated_at = excluded.updated_at`,
      id,
      p.name.trim(),
      p.region,
      p.city.trim(),
      p.area,
      p.day_of_week,
      p.start_time,
      p.end_time,
      p.venue_text,
      p.map_url,
      p.contact_name,
      p.contact_phone,
      p.whatsapp_url,
      p.level,
      p.cost,
      p.notes,
      p.created_by_person ?? (await getMeId(db)),
      p.editor_ids ?? null,
      ts,
      ts,
    );
    return id;
  });
}

export function deletePickup(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE pickup_spot SET deleted_at = ? WHERE id = ?`, now(), id));
}

export function listCalendar(db: SQLiteDatabase) {
  return db.getAllAsync<CalendarEntry>(`SELECT * FROM calendar_entry WHERE deleted_at IS NULL ORDER BY COALESCE(start_date, '9999'), name`);
}

export function getCalendarEntry(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<CalendarEntry>(`SELECT * FROM calendar_entry WHERE id = ?`, id);
}

export function saveCalendarEntry(db: SQLiteDatabase, c: Omit<CalendarEntry, 'id'> & { id?: string }) {
  return write(db, async () => {
    const id = c.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO calendar_entry (id, name, kind, level, region, location, start_date, end_date, month_hint, status, url,
         notes, start_time, end_time, meeting_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, level = excluded.level,
         region = excluded.region, location = excluded.location, start_date = excluded.start_date,
         end_date = excluded.end_date, month_hint = excluded.month_hint, status = excluded.status, url = excluded.url,
         notes = excluded.notes, start_time = excluded.start_time, end_time = excluded.end_time,
         meeting_url = excluded.meeting_url, updated_at = excluded.updated_at`,
      id,
      c.name.trim(),
      c.kind,
      c.level,
      c.region,
      c.location,
      c.start_date,
      c.end_date,
      c.month_hint,
      c.status,
      c.url,
      c.notes,
      c.start_time ?? null,
      c.end_time ?? null,
      c.meeting_url ?? null,
      ts,
      ts,
    );
    return id;
  });
}

export function deleteCalendarEntry(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE calendar_entry SET deleted_at = ? WHERE id = ?`, now(), id));
}

/* ---------------- Meeting RSVPs ---------------- */

export function setMeetingRsvp(db: SQLiteDatabase, entryId: string, personId: string, status: RsvpStatus | null, note: string | null = null) {
  return write(db, async () => {
    const id = `${entryId}:${personId}`;
    if (!status) return void (await db.runAsync(`DELETE FROM meeting_rsvp WHERE id = ?`, id));
    const ts = now();
    await db.runAsync(
      `INSERT INTO meeting_rsvp (id, calendar_entry_id, person_id, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
      id,
      entryId,
      personId,
      status,
      status === 'going' ? null : note,
      ts,
      ts,
    );
  });
}

/* ---------------- Pickup RSVPs ---------------- */

/** "I'm going" to a pickup on one day (YYYY-MM-DD). Clearing deletes it. */
export function setPickupRsvp(db: SQLiteDatabase, pickupId: string, onDate: string, personId: string, status: RsvpStatus | null, note: string | null = null) {
  return write(db, async () => {
    const id = `${pickupId}:${onDate}:${personId}`;
    if (!status) return void (await db.runAsync(`DELETE FROM pickup_rsvp WHERE id = ?`, id));
    const ts = now();
    await db.runAsync(
      `INSERT INTO pickup_rsvp (id, pickup_id, on_date, person_id, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
      id,
      pickupId,
      onDate,
      personId,
      status,
      status === 'going' ? null : note,
      ts,
      ts,
    );
  });
}

export function meetingRsvps(db: SQLiteDatabase, entryId: string) {
  return db.getAllAsync<{ person_id: string; status: RsvpStatus; note: string | null; first_name: string; last_name: string; birth_date: string | null }>(
    `SELECT r.person_id, r.status, r.note, p.first_name, p.last_name, p.birth_date FROM meeting_rsvp r JOIN person p ON p.id = r.person_id
      WHERE r.calendar_entry_id = ? ORDER BY p.first_name COLLATE NOCASE`,
    entryId,
  );
}

/* ---------------- Announcements ---------------- */

export function listAnnouncements(db: SQLiteDatabase) {
  return db.getAllAsync<Announcement>(`SELECT * FROM announcement WHERE deleted_at IS NULL ORDER BY pinned DESC, published_at DESC`);
}

export function getAnnouncement(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Announcement>(`SELECT * FROM announcement WHERE id = ?`, id);
}

export function saveAnnouncement(db: SQLiteDatabase, a: Omit<Announcement, 'id' | 'published_at'> & { id?: string }) {
  return write(db, async () => {
    const id = a.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO announcement (id, region_code, title, body, link_url, link_label, pinned, published_at, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET region_code = excluded.region_code, title = excluded.title, body = excluded.body,
         link_url = excluded.link_url, link_label = excluded.link_label, pinned = excluded.pinned, updated_at = excluded.updated_at`,
      id,
      a.region_code,
      a.title.trim(),
      a.body,
      a.link_url,
      a.link_label,
      a.pinned,
      ts,
      a.created_by_id,
      ts,
      ts,
    );
    return id;
  });
}

export function deleteAnnouncement(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE announcement SET deleted_at = ?, updated_at = ? WHERE id = ?`, now(), now(), id));
}
