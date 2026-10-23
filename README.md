# SA Ultimate (working name)

Scoring, line management, stats and team admin for the South African ultimate community. It's built for Android first, with a web version to follow, and is meant to replace the current Stall Count app.

- **Product spec:** https://claude.ai/artifact/3Qjhbogiimn1v5tHmGkfQt
- **Name candidates:** U-mzansi, Ubuntu Ultimate

---

## Try it on your phone with Expo Go

You run a small development server on a computer, and the **Expo Go** app on your phone loads the app from it. Nothing needs to be installed from the Play Store apart from Expo Go itself. When you save a code change, the phone reloads within a second or two.

### What you need

| | |
| --- | --- |
| **Android phone** | With **Expo Go** from the Play Store. It must support **SDK 57**: if Expo Go says "update Expo Go" or "incompatible SDK", update it, or install the SDK 57 build from https://expo.dev/go |
| **A computer** | Mac, Windows or Linux, with **Node.js 20 or newer** (https://nodejs.org, LTS version) and **git** |
| **Same Wi-Fi** | The phone and the computer must be on the same network (or use tunnel mode, below) |

### 1. Get the code (first time only)

```bash
git clone https://github.com/fernweh626/sa-ultimate.git
cd sa-ultimate/mobile
npm install
```

The repo is private, so you need to be added as a collaborator on GitHub first.

### 2. Start the dev server

```bash
cd sa-ultimate/mobile
npx expo start --lan
```

After a few seconds it prints a **QR code** and an address like `exp://192.168.0.112:8081`.

### 3. Open it on your phone

1. Open **Expo Go**.
2. Tap **Scan QR code** and scan the code in the terminal, **or** tap **Enter URL manually** and type the `exp://…:8081` address.
3. The first load takes 20–60 seconds while the app is bundled. After that it's quick.

### Every time after that

- On the computer: `cd sa-ultimate/mobile`, then `git pull` (to get the latest), then `npx expo start --lan`.
- On the phone: open Expo Go and tap the project under **Recently opened**. If the computer's Wi-Fi changed, the address changes too, so scan the new QR code.
- To reload: **shake the phone** and tap **Reload**, or press `r` in the terminal.

### If it doesn't connect

| Problem | Fix |
| --- | --- |
| Phone can't reach the computer (spinner or "could not connect") | Check both are on the **same Wi-Fi**. Guest, office and campus networks often block devices from seeing each other. Use tunnel mode instead: `npx expo start --tunnel` (slower, works over any network). |
| The address changed (new Wi-Fi, laptop moved) | Stop the server (`Ctrl+C`), start it again and scan the new QR code. |
| "Incompatible SDK" or "update Expo Go" | The app uses **Expo SDK 57**: update Expo Go to the SDK 57 version. |
| Red error screen after pulling new code | Run `npm install` (new libraries may have been added), then `npx expo start --lan --clear`. |
| Something looks stuck or out of date | `npx expo start --lan --clear` clears the bundler cache. |
| Want to start over with fresh sample data | In Android settings → Apps → Expo Go → Storage → **Clear data**. This wipes everything saved in Expo Go, for all projects. |

---

## Playing around: what to try

The app starts with the SA clubs, fields, the competitive calendar and two **sample teams** (Sample Light, Sample Dark) with made-up players, so you can score a game straight away. Everything is saved on the phone and works offline.

**Pick who you are and what you can do.** Tap the person icon at the top right of Home (that's **Me**):
- **Which player are you?** Pick yourself, or add yourself to a team. Your teams, schedule and stats follow from this.
- **Try a level on this phone:** switch between **Player, Scorekeeper, Team staff, Coordinator and Admin** to see what each can do. This is only for testing. Once you sign in, your level comes from the server.

**Things worth trying:**

| Area | Where |
| --- | --- |
| Score a game (Lite, Standard or Full tracking), lines with fitness, F1/F2/M1/M2 ratio, timeouts with the big countdown, injury subs | Home → **Score a game** |
| Game reports, share cards, PDF and image report packs | Any finished game → **Full report** |
| Leagues, round robin, Swiss draw, playoffs and brackets, postponements and forfeits | Hub → Calendar → a competition, as **Coordinator** |
| Teams and clubs with several teams (Mixed, Open, Women's…) | **Teams** tab → **Add** |
| Schedule practices, "are you coming?" (Going / Late / Can't), take the register, attendance ranking | A team page, as **Team staff** |
| My schedule, accreditation, membership numbers, self-rating, fitness tests | **Me** |
| Ready to play (accreditation + SAFDA + region), WhatsApp follow-ups, testing day, CSV exports | A team page → **Ready to play & development**, as **Team staff** |
| Paid-up list upload, form & payment links, bug/idea inbox | **Me → Admin**, as **Coordinator** or **Admin** |
| Pickups by weekday, fields, rules, info hub | **Hub** tab, and Home |
| Notifications (reminders, quiet hours) | **Me → Notifications**: use **Send me a test** |
| Report a bug or an idea | **Me → Report a bug or suggest an idea** |

**Good to know in Expo Go**
- **Notifications:** reminders scheduled by the phone itself work (game reminders, check-ins, practice reminders, accreditation expiry). Pushes sent *from the server* when the app is closed need the installed app (APK), not Expo Go.
- **Going online is optional.** **Me → Go online** creates an account and syncs to the shared database, so several phones see the same teams and games. Without it, everything stays on that phone.
- **The spectator live link** is built but not hosted yet, so the broadcast button on the scoring screen says "coming soon".

---

## How it's put together

| Path | What |
| --- | --- |
| `mobile/` | The Expo (React Native) app: see `mobile/README.md` |
| `mobile/src/app/` | Screens (Expo Router: every file is a screen) |
| `mobile/src/db/` | On-phone SQLite database: migrations, queries, sync with the server |
| `mobile/src/domain/` | Game engine, stats, rules, formats, reports: plain TypeScript |
| `supabase/migrations/` | The shared online database (Supabase, London region): tables and row-level security |
| `web/live/` | Spectator page that follows a game live (not hosted yet) |
| `docs/data-model.md` | How the data, permissions, fixtures and formats work |

**Before committing:**

```bash
cd mobile
npx tsc --noEmit     # type check
npx eslint src       # lint
```

### Online database (maintainers only)

The Supabase project is `sa-ultimate` (ref `fcsdtbvcvlmspjcfnfto`). The app only contains the **publishable** key, which is safe to ship because row-level security decides what anyone can read or write. Database changes go in a new file in `supabase/migrations/` and are applied with:

```bash
npx supabase db push -p "$SUPABASE_DB_PASSWORD"
```

The database password lives only in `.env.local` at the repo root. That file is git-ignored: **never commit it**, and never put the password or any secret key in the app.

## Data and privacy

- Stall Count exports, screenshots and CSVs (`*.zip`, `*.csv`) are git-ignored because they contain personal information (POPIA). Don't commit them.
- In the app, emails are never shown to anyone. Under-18s appear as first name + surname initial. Phone numbers, membership numbers, accreditation, ratings and fitness results are visible only to the player, their team staff and coordinators.
