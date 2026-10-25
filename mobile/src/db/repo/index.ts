/*
 * The local database layer, one file per area. Screens import from '@/db/repo'.
 *
 *  core.ts  Shared helpers for the local database: ids, timestamps, and write() (a transaction that tells screens to refresh).
 *  me.ts  Who is using this phone: their player, access level, region and onboarding.
 *  people.ts  Teams, people and memberships, joining teams, venues, following, and saved lines.
 *  games.ts  Tournaments and leagues, games and scoring events, fixtures, spirit, light results, and formats (standings, brackets, Swiss).
 *  community.ts  The info hub: pickups and their RSVPs, the calendar and meeting RSVPs, and announcements.
 *  sessions.ts  Practices and other sessions, who is coming, reflections and shout-outs, and the personal log.
 */

export * from './core';
export * from './me';
export * from './people';
export * from './games';
export * from './community';
export * from './sessions';
