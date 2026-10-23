import type { SQLiteDatabase } from 'expo-sqlite';

// Every table that holds rows about one person, and the columns that point at them.
const PERSON_TABLES: [string, string[]][] = [
  ['membership', ['person_id']],
  ['registration', ['person_id']],
  ['accreditation', ['person_id']],
  ['self_rating', ['person_id']],
  ['fitness_test', ['person_id']],
  ['practice_rsvp', ['person_id']],
  ['practice_attendance', ['person_id']],
  ['game_availability', ['person_id']],
  ['meeting_rsvp', ['person_id']],
  ['hat_signup', ['person_id']],
  ['pickup_rsvp', ['person_id']],
  ['game_player', ['person_id']],
  ['point_player', ['person_id']],
  ['saved_line_member', ['person_id']],
  ['reflection', ['person_id']],
  ['shoutout', ['from_person_id', 'to_person_id']],
  ['role_grant', ['person_id']],
  ['join_request', ['person_id']],
  ['club_staff', ['person_id']],
  ['feedback', ['person_id']],
  ['game_event', ['actor_id', 'secondary_id', 'tertiary_id']],
];

/**
 * Everything this phone holds about one player, as one JSON document: their profile and every row
 * that refers to them. It's what "request my data" hands over (POPIA section 23).
 */
export async function myDataExport(db: SQLiteDatabase, personId: string) {
  const out: Record<string, unknown> = {
    about: 'Everything Ubuntu Ultimate holds about you on this phone. Signed-in data on the server is the same, synced.',
    exported_at: new Date().toISOString(),
    person: await db.getFirstAsync('SELECT * FROM person WHERE id = ?', personId),
  };
  for (const [table, cols] of PERSON_TABLES) {
    try {
      out[table] = await db.getAllAsync(`SELECT * FROM ${table} WHERE ${cols.map((c) => `${c} = ?`).join(' OR ')}`, ...cols.map(() => personId));
    } catch {
      // An older table layout on this phone: skip it rather than fail the whole export.
    }
  }
  return out;
}
