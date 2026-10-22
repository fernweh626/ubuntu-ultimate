# Data model

The Android app stores everything on the phone in SQLite (`mobile/src/db/schema.ts`). The same tables will
exist in the server's Postgres database when online sync is added, so syncing is a copy rather than a rewrite.

## Conventions

- **Ids** are UUID strings generated on the device, so two phones can create rows offline without clashing.
- **Timestamps** are ISO-8601 strings: `created_at`, `updated_at`, and `deleted_at` for soft deletes on shared rows.
- **Stats are never stored.** Every number in a report is computed from the game event log and the point rows
  (`mobile/src/domain/stats.ts`). Fixing a mistake in the log fixes every report that uses it.
- **History is kept.** Leaving a team sets `membership.end_date` instead of deleting the row; undo marks an event
  `voided_at` instead of removing it.

## Tables

| Table | One row per | Key columns |
| --- | --- | --- |
| `person` | Player, for life | first/last name, nickname, email (never shown), birth date, gender, preferred number, position, `is_placeholder` (pickup names added by an organiser), `claimed_by_id` |
| `team` | Club, university, regional or national side, hat team | name, short name, kind, region, colours, contact name/phone/email, website, social |
| `membership` | A person's time on a team | kind (`core` / `guest` / `mercenary`), scope (`permanent` / `season` / `event` / `game`), role, jersey number, start/end dates |
| `venue` | Field | GPS, end-zone bearing (for upwind/downwind stats) |
| `event` | Tournament, league, scrimmage, practice or pickup session | kind, level, division, region, dates, video and photo links |
| `event_team` | Team entered in an event | pool, seed |
| `game` | Game | teams, event, venue, status, tracking mode, rules (JSON), who pulled first, ratio for point 1, weather (JSON), video link |
| `game_player` | Player available for one game | jersey number for this game (borrowed kit), position for this game, status (tired / injured) |
| `point` | Point | number, half, offence team, ABBA ratio, puller, pull outcome, `pulled_at`, `scored_at`, scoring team |
| `point_player` | Player on the line for a point | point, team, person |
| `game_event` | Something that happened | seq, type, team, actor, secondary (receiver / assist), tertiary (hockey assist), device, `voided_at` |
| `saved_line` + `saved_line_member` | Named line (Super O, Zone D) | team, side, members |
| `spirit_score` | One team's spirit score for the other | five categories 0–4, comments per category, overall comment |
| `pickup_spot` | Regular pickup game | day of week, time, city, venue, map link, WhatsApp link, contact, level, cost |
| `calendar_entry` | Competitive calendar item | dates or a rough month, level, region, status (`confirmed` / `tbc`) |

### Game event types

`pass`, `score`, `callahan`, `drop`, `throwaway`, `stall`, `intercept`, `timeout`, `halftime`,
`stoppage_start`, `stoppage_end`, `injury_sub`, `end`.

Possession, holds, breaks, clean holds, break chances, turnovers per point, pull timing, playing time,
fitness, +/− and connections are all derived from these events plus the `point` rows.

## Multiple trackers (planned)

Each event already records `device_id`. With sync, each tracker's log is kept separately and merged per point
by majority vote; disagreements are flagged for review. Nothing in the tables needs to change for that.

## Still to come with the server

Accounts and roles, join requests, pickup claims (placeholder → real person), reflections and shout-outs,
AI summaries, notifications, and the importer for the Stall Count export.

## Access levels and who can grant what

Defined in `mobile/src/domain/permissions.ts`; the server will enforce the same table.

| Level | Can do | Can give out |
| --- | --- | --- |
| Admin | Everything | Coordinator, team staff roles, scorekeeper |
| Coordinator | Run leagues, regionals, nationals | Team staff roles, scorekeeper |
| Team staff (captain, coach, spirit captain, manager) | Roster, lines, contacts, logo, spirit, confirm who played | Staff roles and scorekeeper, own team only; approve other staff |
| Scorekeeper | Start and score any game, add players | Nothing |
| Player | Start friendly games, edit own details, join teams | Nothing |

Players added during a game are marked `added_in_game`; after the game team staff confirm or remove each
player, or the player taps "I played" (`game_player.confirmation`).

Until sign-in exists, the phone stores who "me" is and a test level in `app_meta`; team staff comes from
`membership.role`.
