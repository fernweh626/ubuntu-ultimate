# Ubuntu Ultimate — mobile app

Expo (React Native) app, Android first. Everything is stored on the phone in SQLite and works offline.

## Run it

```bash
npm install
npx expo start --lan  # then scan the QR code with Expo Go (SDK 57) on your phone
```

Phone setup, troubleshooting and a 10-minute tour are in the [main README](../README.md#run-it-in-5-minutes).

## Where things live

| Path | What |
| --- | --- |
| `src/app/` | Screens (Expo Router: every file is a route) |
| `src/db/` | SQLite schema, migrations, seed data and queries |
| `src/domain/` | Game engine, stats, rules and formatting — plain TypeScript, no UI |
| `src/content/` | Static content: regions, clubs, links, rules, the in-app guide, spirit examples, demo season |
| `tests/` | Tests (`npm test`): real in-memory SQLite, Expo modules shimmed |
| `src/ui/` | Design system and shared components |

The data model is described in `../docs/data-model.md`.

## Checks

```bash
npm run typecheck
npx eslint src tests
npm test
```
