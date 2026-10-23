# Ubuntu Ultimate

A free app for the whole South African ultimate community. It started as a replacement for Stall Count (scoring and stats) and grew into everything around the game: your team's week, pickups, hat tournaments, leagues, AGMs and your own development.

Android first (Expo / React Native), with a web version for desk work. Works offline; syncs when there's signal.

- **Product spec:** https://claude.ai/artifact/3Qjhbogiimn1v5tHmGkfQt
- **In the app:** Me → **Help & how-to guide** explains every feature, with screenshots.

---

## Run it in 5 minutes

You need **Node.js 20+**, **git**, and **Expo Go** (SDK 57) on an Android phone on the same Wi-Fi as your computer.

```bash
git clone https://github.com/fernweh626/ubuntu-ultimate.git
cd ubuntu-ultimate/mobile
npm install
npx expo start --lan
```

On the phone: open **Expo Go** → **Scan QR code** (or **Enter URL manually**: the `exp://…:8081` address it prints). The first load takes up to a minute.

**On a computer instead:** with the server running, open **http://localhost:8081** in Chrome, Edge or Brave. It must be `localhost`, and Safari doesn't work yet.

<details>
<summary>If it doesn't connect</summary>

| Problem | Fix |
| --- | --- |
| Phone can't reach the computer | Same Wi-Fi? Guest and campus networks often block it. Use `npx expo start --tunnel`. |
| "Incompatible SDK" | Update Expo Go to the SDK 57 version (https://expo.dev/go). |
| Red error after pulling | `npm install`, then `npx expo start --lan --clear`. |
| Want fresh sample data | Android settings → Apps → Expo Go → Storage → Clear data. |

</details>

## A 10-minute tour

The app ships with the real SA clubs and fields, real (anonymised) results from Western Regionals 2026 and the Stellenbosch Residence League, and a made-up Cape Town Mixed League with practices, a hat and an AGM. **Every player name in the demo is invented.**

1. **First run:** the welcome flow asks who you are, your team and your region. Pick **Chilli Legends** to see a busy week.
2. **Home:** your week (games, practices, pickups, hats, meetings) with a type icon on the left, news, and recent results.
3. **Score a game:** Home → **Score a game**. Try **Lite** tracking: disc flip, pick a line, PULL, tap the scorer. Undo works all the way back. End it to see the report.
4. **My schedule:** Me → **My schedule**. Going / Late / Can't on practices and fixtures.
5. **Hats:** Hub → **Hat tournaments** → the Clifton Beach Hat. Sign up, then look at the drawn Winter Hat for the result.
6. **Teams → Players:** search someone and tap the star to follow them.
7. **Try other roles:** Me → Settings → **Access level** → *Try a level on this phone* (Player, Scorekeeper, Team staff, Coordinator, Admin). This switch only exists while signed out. Signed in, the server decides your level.
   - As **Team staff** on a team page: practices, the register, readiness, exports.
   - As **Coordinator**: Games → **Tournaments & leagues** (round robin, Swiss, playoffs), **Set up a hat** (payments, the draw), calendar and announcements.

## What's in it

| Area | Highlights |
| --- | --- |
| **Scoring** | Lite / Standard / Full tracking, F1/F2/M1/M2 ratio (ABBA), lines with fitness, timeouts and halftime countdowns, injury subs, light results (final score, winner, or none), spirit scores with the WFDF examples |
| **Reports** | Live stats, game reports, share cards, PDF and image packs, team and player stats, CSV exports |
| **Competitions** | Leagues and tournaments, round robin, pools, Swiss, playoff brackets, postponements, forfeits, standings |
| **Teams** | Clubs with several teams, join requests approved by staff, roles, practices with RSVP and register, attendance, readiness (accreditation, SAFDA and regional standing) |
| **Community** | Pickups by weekday, hat tournaments (sign-up, payment link or EFT with proof of payment, balanced draw), calendar with AGMs and RSVPs, announcements, links, fields |
| **You** | My schedule, ultimate log (games, practices, pickups, gym, physio), check-ins, shout-outs, self-rating every 6 months, fitness tests, accreditation reminders, following teams and players |
| **Privacy** | Download my data, fix or delete requests, clear rules about who sees what |

## How it's built

```
Phone (Expo / React Native)                Supabase (London)
┌───────────────────────────┐   sync    ┌──────────────────────────┐
│ Screens (Expo Router)     │ ───────▶  │ Postgres + row-level     │
│ SQLite: the source of     │  outbox   │ security on every table  │
│ truth, works offline      │ ◀───────  │ (who may read / write)   │
└───────────────────────────┘   pull    └──────────────────────────┘
```

- **Offline-first.** Every write goes to SQLite on the phone. Triggers queue it in an outbox, and sync pushes it when online, then pulls what changed (`mobile/src/db/sync.ts`).
- **Versioned migrations** on both sides: `mobile/src/db/schema.ts` (PRAGMA user_version) and `supabase/migrations/`.
- **Pure TypeScript domain logic** (game engine, stats, formats, the hat draw) in `mobile/src/domain/`, with no React, so it's easy to test.
- **Shared seed IDs** (`md5('kind:name')`), so starter content matches across phones and the server.

| Path | What |
| --- | --- |
| `mobile/src/app/` | Screens (Expo Router: every file is a screen) |
| `mobile/src/db/` | SQLite schema, queries, sync, seed and demo content |
| `mobile/src/domain/` | Game engine, stats, rules, formats, hats, notifications planning |
| `mobile/src/content/` | Static content: clubs, links, the in-app guide, spirit examples |
| `supabase/migrations/` | Server tables, row-level security, functions |
| `tools/demo/` | Builds the anonymised demo content from Stall Count exports (exports never committed) |
| `docs/data-model.md` | Data, permissions, fixtures and formats in more depth |

**Before committing:** `cd mobile && npx tsc --noEmit && npx eslint src`

## Known gaps

- **Safari** (web) doesn't start the in-browser database yet. Use a Chromium browser.
- **Pushes when the app is closed** need an installed build (APK). Expo Go only does on-phone reminders.
- **The spectator live link** (`web/live/`) is built but not hosted.
- **No automated test runner in the repo yet.** The domain and database logic has been tested with scripts outside the repo. Moving them in is a good first task.

## Feedback

In the app: Me → **Report a bug or suggest an idea**. It goes straight to the admins' inbox. GitHub issues work too.

---

<details>
<summary>Maintainers: database, backups and data rules</summary>

- **Supabase project** `sa-ultimate` (ref `fcsdtbvcvlmspjcfnfto`, London). The app only holds the **publishable** key, which is safe because row-level security decides access. New database changes go in a new file in `supabase/migrations/`, applied with `npx supabase db push -p "$SUPABASE_DB_PASSWORD"`.
- **The database password** lives only in the git-ignored `.env.local` at the repo root. Never commit it or put any secret key in the app.
- **Backups:** a nightly encrypted copy to the private repo `ubuntu-ultimate-backups`, kept separate so code collaborators can't reach the backup login. The workflow is ready and needs a one-off GitHub permission to be switched on. Opening a backup needs the private key, kept outside git.
- **Personal data (POPIA):** Stall Count exports and CSVs are git-ignored. Never commit real names. Demo content uses invented names only.
- **First sign-in becomes admin** (`claim_first_admin`). After that, admins hand out levels.

</details>
