# Data model

Every phone keeps the whole working set in SQLite (`mobile/src/db/schema.ts`) and works offline. Signed-in
phones sync with Supabase Postgres (`supabase/migrations/`), which has the same tables plus row-level
security. Sync lives in `mobile/src/db/sync.ts`.

## Conventions

- **Ids** are text. Rows made on a phone use random UUIDs (v4), so phones can create offline without clashing.
  Shared content (clubs, teams, fields, calendar, pickups, links, the demo season) uses ids hashed from its
  name (`md5('kind:name')`, `src/db/seed-ids.ts`), so every phone and the server agree on them.
  Per-person answers use composite ids, e.g. `session_id:person_id`, so two phones answering agree.
- **Timestamps** are ISO-8601 strings: `created_at`, `updated_at`, and `deleted_at` for soft deletes.
- **Stats are never stored.** Every number in a report is computed from the game event log and the point rows
  (`src/domain/stats.ts`). Fixing a mistake in the log fixes every report that uses it.
- **History is kept.** Leaving a team sets `membership.end_date`; undo marks an event `voided_at`.
- **Migrations** are numbered strings run in order (`PRAGMA user_version`, now 20). Never edit one that has
  shipped; add a new one. Table rebuilds marked `-- @fk-off` run with foreign keys off and are checked after.
  `repairDrift()` fixes tables early test phones may have in an older shape.

## Sync

- **Push:** SQLite triggers write every change to `sync_outbox` (one row per record). `push()` upserts in
  chunks of 200; a refused row is retried alone, then dropped and listed on Account & sync.
- **Pull:** per table, rows changed since a cursor (`server_updated_at`), written with triggers muted
  (`app_meta.sync_pulling`). Deletes arrive as tombstones from `deleted_row`.
- **First sync on a phone** (`prepareFirstSync`): adopt shared ids for starter content, remove the sample
  teams, then queue only what was made on this phone (`sharedContent()` knows the rest).
- **Players** upload as insert-if-new plus update-by-id: surnames aren't readable on the server (see below),
  and an upsert's ON CONFLICT DO UPDATE needs read access to every column it sets.
- The first account to sign in becomes admin (`claim_first_admin`).

## Privacy on the server

- `person` is readable column by column: no surname, email or birth date. Apps read `person_public`, which
  shows under-18s as first name + surname initial (except to themselves).
- Email and birth date live in `person_private`, readable only by that player.
- Development, readiness and contact data (accreditation, registration, self-ratings, fitness, check-ins)
  are readable by the player, their team staff and coordinators (`staff_of_person`).
- Follows are private to the account. Pickup RSVPs are readable by signed-in players (head counts).

## Tables

**Games and scoring**

| Table | One row per | Key columns |
| --- | --- | --- |
| `game` | Game or fixture | teams, event, venue, status, tracking mode, rules (JSON), first pull, ratio for point 1, home team, postponements, forfeit, stage/round, light results (`result_mode`, `final_a/b`, `winner_team_id`), weather, video |
| `point` | Point | number, half, offence team, ABBA ratio, puller, pull outcome, `pulled_at`, `scored_at`, scoring team |
| `point_player` | Player on the line for a point | point, team, person |
| `game_event` | Something that happened | seq, type, team, actor, secondary (receiver / assist / sub), tertiary (hockey assist), value, device, `voided_at` |
| `game_player` | Player in a game's squad | jersey and position for this game, status (tired / injured), confirmation, `added_in_game` |
| `game_status_log` | Postponement, forfeit, reschedule | action, team, reason, previous date |
| `spirit_score` | One team's spirit score for the other | five categories 0–4, comments per category, overall |
| `saved_line` + `saved_line_member` | Named line (Super O, Zone D) | team, side, members |

**People, teams and access**

| Table | One row per | Key columns |
| --- | --- | --- |
| `person` | Player, for life | names, nickname, gender, number, position, `is_placeholder`, photo; email and birth date stay local (server: `person_private`) |
| `team` | Team | name, kind, region, city, colours, contacts, club, division, `is_sample` |
| `club` + `club_staff` | Club running several teams | contacts; club admins/coaches act as staff on every team in it |
| `membership` | A person's time on a team | kind (`core` / `guest` / `mercenary`), scope (`permanent` / `event` for hats), role, jersey, start/end |
| `join_request` | Request to join a team | kind, message, status; approved by team staff (`decide_join_request`) |
| `role_grant` | Admin / coordinator / scorekeeper level | given by admins (`grant_level`); pull-only on phones |
| `follow` | Followed team, event, player or pickup | kind, target |

**Competitions**

| Table | One row per | Key columns |
| --- | --- | --- |
| `event` | Tournament, league or hat | kind, level, division, region, dates, rules; hats add cost, payment link, EFT details, proof-of-payment contact, status, team count |
| `event_team` | Team entered in an event | pool, seed |
| `bracket_slot` | Playoff slot | round, sources, game, placing group |
| `hat_signup` | Player signed up for a hat | attending, wants captain, skill, paid, `paid_confirmed`, on the day |

**The week: practices, pickups, meetings**

| Table | One row per | Key columns |
| --- | --- | --- |
| `session` | Practice, pickup, gym, physio or other session | team (practices), start, length, field, `series_id` (weekly), `cancelled_at` |
| `practice_rsvp` | Player's answer for a practice | going / late / not_going, reason (staff only) |
| `practice_attendance` | Register entry | attended |
| `game_availability` | Player's answer for a fixture | available / late / unavailable |
| `pickup_spot` | Regular pickup | day of week, time, place, WhatsApp, contact, level, cost |
| `pickup_rsvp` | Answer for one pickup day | `on_date`, going / late / not_going |
| `calendar_entry` | Competitive calendar item or meeting (AGM, SGM) | dates or rough month, level, region, times, meeting link |
| `meeting_rsvp` | Answer for a meeting | going / late / not_going (apologies) |
| `announcement` | News post | region, title, body, link (an in-app route if it starts with `/`), pinned |
| `org_link` | Useful link | region, kind (merch, register, community…) |
| `venue` | Field | GPS, end-zone bearing |

**You: development and check-ins**

| Table | One row per | Key columns |
| --- | --- | --- |
| `reflection` | Check-in after a game or session | minutes, effort (RPE), self rating, playing time, niggles, answers (JSON) |
| `shoutout` | Shout-out to a teammate | from, to, game or session, reason |
| `accreditation` | Player's rules accreditation | level, expiry; certificate photo stays on the phone |
| `self_rating` | Self-rating (every six months) | five areas 1–5, notes |
| `fitness_test` | Fitness result | beep / 5-10-5 / 40 m / 60 m, value, date |
| `registration` | Player's numbers | SAFDA number, region and regional number, WhatsApp number |
| `association_standing` | Paid-up list entry | association, number, status, paid until; uploaded as CSV by admins |

**App plumbing**

| Table | What |
| --- | --- |
| `sync_outbox` | Changes waiting to upload |
| `app_meta` | This phone's settings: who "me" is, region, sync cursors, notification preferences, flags |
| `feedback` | Bug reports, ideas, access and privacy requests; sent without sign-in, read by admins |

### Game event types

`pass`, `score`, `callahan`, `drop`, `throwaway`, `stall`, `intercept`, `timeout`, `halftime`,
`stoppage_start`, `stoppage_end`, `injury_sub`, `end`.

Possession, holds, breaks, clean holds, break chances, turnovers per point, pull timing, playing time,
fitness, +/− and connections are all derived from these events plus the `point` rows.

## Planned

- **Multiple trackers:** each event already records `device_id`. Each tracker's log can be kept separately
  and merged per point by majority vote, with disagreements flagged. No table changes needed.
- **Stall Count import:** this season's games from Stall Count exports (`tools/demo/` already reads them).
- **Spectator live link:** `web/live/` follows a game in realtime (`game`, `point`, `game_event` are published).

## Access levels and who can grant what

Defined in `mobile/src/domain/permissions.ts`; the server enforces the same rules (`level_at_least`, `is_staff`, `grant_level`).

| Level | Can do | Can give out |
| --- | --- | --- |
| Admin | Everything | Coordinator, team staff roles, scorekeeper |
| Coordinator | Run leagues, regionals, nationals | Team staff roles, scorekeeper |
| Team staff (captain, coach, spirit captain, manager) | Roster, lines, contacts, logo, spirit, confirm who played | Staff roles and scorekeeper, own team only; approve other staff |
| Scorekeeper | Start and score any game, add players | Nothing |
| Player | Start friendly games, edit own details, join teams | Nothing |

Players added during a game are marked `added_in_game`; after the game team staff confirm or remove each
player, or the player taps "I played" (`game_player.confirmation`).

Signed in, levels come from `role_grant` and team staff from `membership.role`. Signed out, a test switch
(Me → Settings → Access level) stores a level in `app_meta`, for trying the app only.

## Practices and who's coming

- `session` (kind `practice`) is scheduled by team staff, once or weekly (`series_id` links the weeks). `cancelled_at` cancels one week or that week onwards; the squad is notified.
- `practice_rsvp` holds one row per player per practice (`id` = `session_id:person_id`, so two phones answering agree): `going`, `late` or `not_going` with an optional reason that only staff see.
- The squad sees the going list and the F/M split; staff also see who hasn't answered and can answer for someone.
- After the practice, the usual check-in (`reflection` with `session_id`) and staff debrief hang off the same session.
- Notifications: "are you coming?" the day before if unanswered, a reminder 2 h before if going, a check-in 30 min after.

## Clubs, readiness and development

- `club` runs several `team`s (`team.club_id`, `team.division`). `club_staff` (admin/coach/manager) act as staff on every team in the club, on the phone (`getAccess`) and on the server (`is_staff`).
- `registration` (one per player): SAFDA number, region + regional number, and a phone number for staff to WhatsApp. Visible to the player, their staff and coordinators.
- `association_standing`: paid-up lists uploaded by coordinators/admins as CSV (Me → Admin → Paid-up lists), matched to players' numbers ignoring spaces/dashes/case. Readable by staff, and by a player for their own number. Pull-only on phones; uploads go straight to the server and replace that association's list.
- `org_link`: SAFDA and regional sign-up/payment form links, managed by coordinators.
- Ready to play (team → Ready to play & development) = valid accreditation + good standing with SAFDA + good standing with the region.
- `accreditation` (level, expiry; certificate photo/PDF stays on the phone), `self_rating` (1–5 in five areas, every six months), `fitness_test` (beep, 5-10-5, 40 m, 60 m).
- `practice_rsvp` and `game_availability` answers: going/available, late (with a note), or can't. `practice_attendance` is the staff register; the attendance ranking uses it, falling back to RSVPs.
- `feedback`: bug reports and ideas; anyone can send (no sign-in), admins read.

## Fixtures, postponements and forfeits

A scheduled game is a `game` row with `status = 'scheduled'`, a `scheduled_at` (null = date TBC), a field
(`venue_id`) and `home_team_id` — the home team sets up the field. Starting it turns the same row live, so
it stays in the event's schedule.

- **League games** can be postponed twice (`game.postponements`); after that a team that can't play forfeits.
- **Tournament games** (regionals, nationals, …) can't be postponed — only forfeited.
- Every postponement, forfeit and reschedule is logged in `game_status_log` with the team, reason
  (weather, lights, not enough men, not enough women, other + note) and the previous date.
- A forfeit sets `status = 'final'` and `forfeit_team_id`; it counts as a win for the other team at the
  game's target score to 0.

Schedules are built from an event's Schedule tab by coordinators and admins: generate a round robin
(home duty balanced to within one game per team), import a CSV (`date,time,field,home,away,pool`, dates
dd/mm/yyyy), or add games one at a time.

## Competition formats

`game.stage` says which part of an event a game belongs to: null/`pool` (round robin or pool play),
`swiss`, or `playoff`; `game.round` numbers Swiss and playoff rounds. Standings use non-playoff games only.

- **Round robin** — generated up front (see Fixtures).
- **Swiss** — one round at a time from the current standings; no rematches where possible; with an odd
  number of teams the lowest-ranked team without a bye sits out. The next round can only be paired once
  the previous one is finished.
- **Playoffs** — `bracket_slot` rows built for any number of teams (top 4, top 8 or everyone), seeded by
  standings, pool positions (A1, B1, A2, B2… = crossovers) or the coordinator's seeds, with byes filling
  odd sizes. "Every team placed" adds placing brackets (5th–8th, 9th–16th…); each placing game records the
  place it decides (`place`), and slots belong to a group (`grp`). Slots can be given a time and field
  (`scheduled_at`, `venue_id`) before their teams are known. Whenever a game in the event finishes or is
  forfeited, every slot whose two teams are now known gets its game (byes are walkovers, no game).
- **Standings** order: wins (a draw counts half), head-to-head among tied teams, point difference,
  points scored. **Final placings** come from placing games, then standings for everyone else.
- **Seeding** is the order of `event_team.seed`; pools can be split from it by snake seeding.
