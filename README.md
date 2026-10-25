# Ubuntu Ultimate

A free app for the whole South African ultimate community. It started as a replacement for Stall Count (scoring and stats) and grew into everything around the game: your team's week, pickups, hat tournaments, leagues, AGMs and your own development.

Android first (Expo / React Native), with a web version for desk work. Works offline; syncs when there's signal.

- **Product spec:** https://claude.ai/artifact/3Qjhbogiimn1v5tHmGkfQt
- **In the app:** Me → **Help & how-to guide** explains every feature, with screenshots.

---

## Run it in 5 minutes

You need **Node.js 22.13+** (the tests use Node's built-in SQLite), **git**, and **Expo Go** (SDK 57) on an Android phone on the same Wi-Fi as your computer.

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

The app ships with the real SA clubs and fields (from the clubs' own public pages) and a made-up season around them: invented squads for every team, the Cape Town Mixed League, the Demo Cup (its final is scored in full mode, every pass), Chilli Legends practices, two hats and an AGM. **Every player, game and score in the demo is invented.**

1. **First run:** the welcome flow asks who you are, your team and your region. Pick **Chilli Legends** to see a busy week.
Four tabs (**Home, Play, Teams, More**) and **Me** behind your picture at the top right. The website is the same app in a phone-width column.

1. **First run:** the welcome flow asks who you are, your team and your region. Pick **Chilli Legends** to see a busy week.
2. **Home:** only what's next for you: one card with what's waiting for your answer, your live games, and your next week.
3. **Score a game:** Play → **Score a game**. Pick a league (searchable, by region) to see its fixtures in the next 36 hours, or two teams. Try **Lite** tracking: disc flip, pick a line, PULL, tap the scorer. Undo works all the way back. End it to see the report. **Full** tracking (every pass) adds possessions, pass chains, pass pairs and the best seven.
4. **My schedule:** Me → **My schedule**. Going / Late / Can't, and a **Past** tab with what you went to.
5. **My stats:** Me → **My stats**. Filter by season, league or tournament and team, and share it as an image or text.
6. **Hats:** More → **Hat tournaments** → the Clifton Beach Hat. Sign up, then look at the drawn Winter Hat for the result.
7. **Teams → Players:** search someone and tap the star to follow them. Tap any team or player name anywhere to open their page.
8. **Try other roles:** More → Settings → **Access level** → *Try a level on this phone* (Player, Scorekeeper, Team staff, Coordinator, Admin). This switch only exists while signed out. Signed in, the server decides your level.
   - As **Team staff** on a team page: join requests (label and approve many at once), practices, the register, readiness and accreditation checks, exports.
   - As **Coordinator**: Play → **Leagues & tournaments** (round robin, Swiss, playoffs), **Set up a hat** (payments, the draw), calendar and announcements.

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
| `mobile/src/app/` | Screens (Expo Router: every file is a screen; `(tabs)/` are the four tabs) |
| `mobile/src/ui/` | Shared components (`components.tsx`: Screen, Card, Field with the formatting bar, RichText, Sheet…) |
| `mobile/src/db/repo/` | Local database queries, one file per area: `core`, `me`, `people`, `games`, `community`, `sessions` (import from `@/db/repo`) |
| `mobile/src/db/` | Schema and migrations, sync, seed and demo content, plus development, membership, schedule and reports queries |
| `mobile/src/domain/` | Pure logic, no React: game engine, stats and full-mode stats, rules, formats, hats, accreditation, rich text, schedules |
| `mobile/src/notify/` | Notifications: what to remind about, and delivery on phone and web |
| `mobile/src/lib/` | Platform glue: Supabase client, web helpers (alerts, sharing, printing), preview mode |
| `mobile/src/content/` | Static content: clubs, countries and regions, associations, the in-app guide, spirit examples |
| `supabase/migrations/` | Server tables, row-level security, functions |
| `tools/demo/` | Builds the made-up demo content (no real player data goes in) |
| `mobile/tests/` | Tests (`npm test`), with Expo modules shimmed in `tests/shims/` |
| `docs/data-model.md` | Every table, sync, privacy on the server, permissions, fixtures and formats |

**Checks** (from `mobile/`):

```bash
npm run typecheck      # TypeScript
npx eslint src tests
npm run format:check   # Prettier (house style in .prettierrc.json; npm run format fixes it)
npm test               # 48 test files against a real in-memory SQLite; npm test -- hat sync runs a subset
```

The tests cover the game engine and stats (including full-mode possessions and pass chains), formats
and brackets, hats and the draw, schedules and notifications planning, permissions, accreditation
rules, rich text, privacy, migrations from old phones, and what sync uploads. CI runs all four checks.

## Known gaps

- **Safari** (web) doesn't start the in-browser database yet. Use a Chromium browser.
- **Pushes when the app is closed** need an installed build (APK). Expo Go only does on-phone reminders.
- **The spectator live link** (`web/live/`) is built but not hosted.
- **No UI tests.** The tests cover logic and the database. Screens are checked by hand (and on web with Playwright, not in the repo).

## Feedback

In the app: More → **Report a bug or suggest an idea**. It goes straight to the admins' inbox. GitHub issues work too.

---

<details>
<summary>Maintainers: database, backups and data rules</summary>

- **Supabase project** `sa-ultimate` (ref `fcsdtbvcvlmspjcfnfto`, London). The app only holds the **publishable** key, which is safe because row-level security decides access. New database changes go in a new file in `supabase/migrations/`, applied with `npx supabase db push -p "$SUPABASE_DB_PASSWORD"`.
- **The database password** lives only in the git-ignored `.env.local` at the repo root. Never commit it or put any secret key in the app.
- **Backups:** a nightly encrypted copy to the private repo `ubuntu-ultimate-backups`, kept separate so code collaborators can't reach the backup login. Opening a backup needs the private key, kept outside git.
- **Personal data (POPIA):** Stall Count exports and CSVs are git-ignored. Never commit real names. Demo content uses invented names only.
- **First sign-in becomes admin** (`claim_first_admin`). After that, admins hand out levels.

</details>
