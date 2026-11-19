# WatchLine

Show and movie tracker (inspired by the iOS app Showline) for macOS and Windows; Android next.
Bootstrapped from OnTrack (~/OnTrack): same stack, updater, sync and release tooling.
See README.md for features and build commands.

## Architecture decisions

- One Expo SDK 58 / React Native codebase. Desktop = `expo export --platform web` wrapped in Electron
  (`desktop/`, plain CommonJS, served over `app://`). Navigation is `@react-navigation/native-stack`
  directly (no Expo Router). Tabs are a `useTab` store; the root stack holds detail screens.
- Data: TMDB only (`src/lib/tmdb.ts`), key `EXPO_PUBLIC_TMDB_KEY` (v3 key or v4 token). Responses
  are cached in memory and on disk (`desktop` cache files via `cache:*` IPC, AsyncStorage on phones),
  stale copies used offline. "Where to watch" = TMDB watch/providers (JustWatch; credit it).
- Your data is one JSON document (`src/lib/store.ts`): `items` (library, id `tv:<id>`/`movie:<id>`)
  and `watches` (one per watched episode `tv:<id>:<s>:<e>` or movie `movie:<id>`), plus settings.
- Progress is computed, never stored (`src/lib/progress.ts`, tested): aired = up to TMDB's
  `last_episode_to_air`; Up Next = the episode after the furthest watched one; specials and skipped
  seasons don't count. `src/lib/library.ts` holds the actions and the status rules (`syncStatus`).
- Sync with Google (`src/lib/sync.ts`): per-entry last-write-wins with tombstones over `items` and
  `watches`, so two devices marking different episodes both survive.
- Updater: GitHub Releases of Deli5150/watchlist; asset names must match `desktop/updater.cjs` and
  `src/lib/updater.ts`. Phones use `src/ui/UpdatePrompt.tsx` (Apollo-style sheet).
- Themes: `colors` in `src/ui/theme.ts` is one mutable object; App re-keys on theme change. Use
  `colors.*`; text on `colors.accent` uses `colors.onAccent`.
- Look: a merge of Showline's design and WatchLine's own (user's request, 2026-11-18): condensed
  headings in Barlow Semi Condensed (`display()` in theme.ts, loaded in App.tsx), uppercase
  `SectionHeader`s with icons, title pages = banner fading into the page with the cover art at its bottom-left
  (user preferred this to Showline's logo hero), then Details | Progress | Cast & Crew (Season.tsx is the Progress panel; there is no Season route). Shows starts with
  the pinned Watchlist row (watching shows; `HScroll` = mouse wheel scrolls it sideways). Keep the
  Cinema accent and the desktop sidebar as WatchLine's own.
- Layout: `useWide()` (web ≥860px) = sidebar (Shows, Movies, Library, Calendar, Discover, Search,
  History, Settings); phones get the floating TabBar (Shows, Movies, Library, Discover + a round
  Search button); Calendar/History/Settings open from `ScreenTitle`'s buttons.
- Library (user's request, 2026-11-19): shows = Watchlist (watching), Watch Later (planned; old
  paused/dropped count here), Caught Up (computed: watching + every aired episode watched),
  Finished; movies = Watchlist (planned), Watch Later (`later`), Watched. No Paused/Dropped/Favorites rows.
- Named WatchLine (renamed from WatchList 2026-11-19). Internal ids keep "watchlist" (bundle id,
  storage keys, `WATCHLIST_*` env vars, repo Deli5150/watchlist); desktop keeps the old
  `WatchList` data folder (main.cjs). "Watchlist" is also the name of the pinned-shows feature.
- Wallpapers: `src/lib/wallpaper.ts` (built-ins drawn by `scripts/render-wallpapers.cjs`, or your
  own: desktop `userData/wallpaper.txt`, phones a file in documents), drawn by `Backdrop` in kit.tsx.
- Phone trailers: full-screen player, Back closes it, orientation unlocked while open (expo-screen-orientation).

## Before finishing a change

`npm run typecheck`, `npm test`, and for UI changes rebuild (`node scripts/desktop.mjs`) and take
screenshots: in desktop/, `WATCHLIST_SHOTS=<dir> WATCHLIST_SHOT_STEPS="name:click text|@aria-label|!js,…"
./node_modules/.bin/electron . --user-data-dir=<scratch>`.
