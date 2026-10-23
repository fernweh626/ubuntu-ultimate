# Ubuntu Ultimate — mobile app

Expo (React Native) app, Android first. Everything is stored on the phone in SQLite and works offline.

## Run it

```bash
npm install
npx expo start --lan  # then scan the QR code with Expo Go (SDK 57) on your phone
```

Step-by-step phone setup, troubleshooting and what to try are in the [main README](../README.md#try-it-on-your-phone-with-expo-go).

## Where things live

| Path | What |
| --- | --- |
| `src/app/` | Screens (Expo Router: every file is a route) |
| `src/db/` | SQLite schema, migrations, seed data and queries |
| `src/domain/` | Game engine, stats, rules and formatting — plain TypeScript, no UI |
| `src/content/` | Info hub text: regions, clubs, rules quick reference, what is ultimate |
| `src/ui/` | Design system and shared components |

The data model is described in `../docs/data-model.md`.

## Checks

```bash
npx tsc --noEmit
npx eslint src
```
