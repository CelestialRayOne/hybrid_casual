# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repo. Read this before doing anything.

## Project

A web puzzle game, **Gem Rush** (owner decision 2026-11-23). The name lives in one place: `GAME_TITLE` in `src/game/config.ts` (and the `<title>` in `index.html`).

- **Goal:** an MVP that answers one question: *does the game play?* Fun, understandable, does it retain.
- **Target portal:** CrazyGames, **Basic Launch first**, Full Launch only if KPIs earn the invite.
- **Platform:** web first. Mobile later as a wrapper (Capacitor) around the **same code**. Never fork the codebase per platform.
- **Spec:** `docs/spec.md` is the source of truth for scope. **No game code until the owner approves the spec.** Anything not in the spec is out of scope; ask before adding it.

## Game in one paragraph

"Gem dig" block puzzle. Tap a group of 2+ orthogonally connected same-colour blocks to clear it; clearing digs down through layers of strata to unearth relics. Clearing 6+ gems charges a **gem power** of that colour (5 kinds, levels 1–5); relics grant in-level **boons**; bedrock slabs are obstacles only powers break. Every attempt re-rolls colours, bonus relics, relic types and geodes; levels 5, 10, 15, 20 are **boss levels**. Tetromino stamps were removed in v2. Perk paths **Jeweler, Archaeologist, Alchemist, Blacksmith** come from the owner's ESR mod (concepts only, see IP rules).

## Hard rules

1. **No Blizzard or Diablo names, terms or assets.** Nothing from Diablo, D2/D2R, WoW or any other third-party IP, in code, strings, filenames, asset names or comments. ESR concepts are fine; ESR item names that are Blizzard names are not. The ESR name/logo itself does not ship either.
2. **No backend, no purchases, no accounts.** Everything runs client-side.
3. **Save on device behind a small interface** (`SaveStore`). Ads behind a small interface (`Ads`), with a no-op implementation until **CrazyGames Full Launch**. Game code never calls `localStorage`, `window.CrazyGames` or any ad API directly.
4. **First download under 8 MB** (target). CrazyGames' hard ceilings: 20 MB initial for mobile-homepage eligibility, 50 MB initial, 250 MB total, 1,500 files. Gameplay reachable in under 10 s.
5. **Portrait, touch-first, scales to any screen.** Must also work with mouse (and keyboard where sensible) on desktop, where portrait is letterboxed.
6. **Assets: code-drawn art and synthesized sound first.** See *Assets* below.
7. **Relative paths only** (`base: './'`). CrazyGames and the mobile wrapper both require it.

## Tech stack

| Thing | Choice |
|---|---|
| Language | TypeScript (strict) |
| Bundler | Vite 8 |
| Engine | Phaser 4 (pin exact version) |
| Unit tests | Vitest, for `src/core` |
| Smoke tests | Playwright, mobile portrait device profiles |
| Size budget | `size-limit` in CI |
| Node | 24 LTS, npm 11; pinned via `engines`, `.nvmrc`, `packageManager` |
| Audio | Own pure-TS synthesizer in `src/platform/audio/` (modal/FM/filters/reverb), pre-rendered to buffers behind `AudioService`. No audio files. |
| RNG | vendored sfc32/mulberry32 (public domain / MIT), seeded |
| Mobile (later) | Capacitor |

Do not use the official Phaser template's `log.js` (it sends telemetry). Scaffold fresh; use the template only as a reference.

## Architecture rules

```
src/core/      pure TypeScript game rules. NO Phaser, NO DOM, NO platform imports.
               grid, group finding (flood fill), clear, gravity, dig/scroll, dirt, relics,
               gem powers, boons, attempts (per-attempt randomness), perks and progress economy, level generator, seeded RNG, serializable state.
src/game/      Phaser scenes and views. Render core state; turn input into core commands.
src/platform/  SaveStore, Ads, AudioService, Platform (CrazyGames events) interfaces
               + implementations: localStorage, no-op, CrazyGames SDK.
src/telemetry/ local-only playtest event log (no network).
```

- The `src/core` boundary is enforced by lint (`no-restricted-imports` bans `phaser` and `src/platform`). Core must be deterministic: same seed + same moves = same board. Tests depend on that.
- Game state is plain data with a versioned `toJSON`/`fromJSON`. Save schema has a `version` field and migrations.
- `SaveStore` is **async** (so it can later be backed by the CrazyGames Data module or Capacitor Preferences). Keep saves well under 1 MB (Data module limit).
- Logic runs on delta time, never on frame counts (CrazyGames requires identical behaviour at any refresh rate).
- Layout is computed from the current game size on every resize; never hard-code screen pixels. Keep HUD and board inside the safe-area rect.
- One input zone over the board, map pointer to cell. A tap commits on pointer-up if the pointer stayed on the same group within tolerance.
- All player-facing strings go through one strings table (English only for MVP, but no inline literals in scenes).

## Screen layout

- Phaser `Scale.EXPAND` on a portrait logical base. The canvas fills the iframe; board and HUD sit in a centred portrait column; the background fills the rest (that is the desktop "letterbox").
- Must stay legible in an 800×450 iframe up to 1920×1080. Minimum cell size: 32 CSS px desktop, 40 CSS px touch.
- Safe areas: use CrazyGames' `--safe-area-inset-*` CSS variables (fallback `env()`), passed to layout as a safe rect.

## CrazyGames integration (this file owns these rules; the spec refers here)

Sources: docs.crazygames.com (requirements/technical, gameplay, quality, ads; sdk/*), checked 2026-11-20.
- SDK v3 loads from the official script tag (`https://sdk.crazygames.com/crazygames-sdk-v3.js`), never bundled; we write our own typings. Wrap it in `src/platform`. When `SDK.environment` is `disabled` (any non-CrazyGames host) every call is a no-op and the game is fully playable. `?useLocalSdk=true` / localhost gives the `local` mock environment.
- Basic Launch build: SDK for game events only, no ads (owner confirmed 2026-11-20). Call `loadingStart`/`loadingStop` around boot, `gameplayStart` when play begins or resumes, `gameplayStop` on level end, menus, pause and when the tab is hidden (NOT on window blur: the SDK docs say the platform handles focus loss). `happytime()` only for rare big moments.
- Audio: no sound before the first user gesture; resume the AudioContext inside a gesture (iOS). Honour the SDK `muteAudio` setting over our own toggle.
- Input/page: `user-select: none` (prefixed), `touch-action: none`, `overscroll-behavior: none`, prevent default scrolling on arrow keys, space and wheel, disable the context menu on the canvas. Support mouse and touch.
- Forbidden: custom fullscreen button, Escape / Ctrl+W bindings, external links or cross-promotion, other portals' branding.
- Device/language: read from SDK system info when available, not from touch detection. English is mandatory.
- Ad rules (Full Launch only): only at natural breaks; pause and block input on request, mute on ad start, unmute and resume on finish or error; reward only on `adFinished`; handle `adsDisabled`, `unfilled`, `adblock`, `adCooldown`, `other`; the game must work with an adblocker. Saves move to the SDK Data module (1 MB limit) with migration from localStorage.

## Assets

Priority order:
1. **Code-drawn** (Phaser Graphics, generated textures) and **synthesized** sound. Default for everything.
2. **Owner's own ESR art** (see below), processed and renamed.
3. **Outside assets: CC0 only.** Not CC-BY, not "free for use", not MIT for art. Every one is logged in `ASSETS.md` with name, source URL, author, licence and date added.

The raw owner art in `/assets/` (~213 MB) is **source material, not game files**. It is git-ignored and never imported directly.
- Only curated, renamed, resized and compressed (WebP/atlas) copies go under `public/` and get logged in `ASSETS.md` as "owner-made (ESR)".
- **Never use:** `assets/icon pack/` (third-party credits: KONG et al.), `assets/nexusmodsimages/` (game screenshots), `assets/Old Resource Images for ESR/` (D2 item names and art). Also anything whose name or look is Blizzard or other third-party IP (Frostmourne, Berserk, Dota, Star Wars, Doom, Tolkien titles, etc.).
- Give every imported file a neutral new name. The original filename goes only in the `ASSETS.md` row.
- The owner reviews all art in-game and may veto any piece; removal must be easy (one manifest file).
- Owner art is **not** covered by the repo's MIT `LICENSE`; its terms are recorded in `ASSETS.md`.
- Before any release build, grep `dist/` (case-insensitive) for banned terms: `diablo`, `blizzard`, `horadric`, `horazon`, `sanctuary`, `tristram`, `baal`, `mephisto`, `duriel`, `tal rasha`, `annihilus`, `jordan`, `frostmourne`, `icecrown`, `lich king`, `\besr\b`, `eastern sun`, `resurrected`, and D2 rune names as whole words. Keep this list in a script once the repo is scaffolded.

## Working agreements

- **Quality over speed.** Small, reviewed steps. Tests for every core rule before it is wired to rendering.
- Before calling something done, run typecheck, lint, unit tests and a build size check. Report results honestly, including failures.
- Commit only when the owner asks. The first commit (docs + scaffold) may go on `main`; after that, work on branches off `main`.
- Raise unknowns early and briefly; record decisions in `docs/spec.md` (or `docs/decisions.md` once it exists) rather than in chat only.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (http://localhost:5173). Add `?debug=1` for the telemetry overlay, debug keys (N win, R restart = new attempt, P perks off) and the `window.__game` test hook (the hook is also on in dev; `summary()`, `tap`, `arm`, `botStep`, `givePower`, `grant`, `fxFrames`, page-coordinate helpers). |
| `npm run typecheck` | `tsc --noEmit` over src, tests and configs. |
| `npm run lint` | ESLint (enforces the `src/core` import boundary). |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`: core rules, platform, telemetry, game layout/progress/timeline/power preview). |
| `npm run build` | Typecheck + production build to `dist/` (relative paths). |
| `npm run preview` | Serve `dist/` (`npx vite preview --port 4173`). |
| `npm run size` | size-limit budget: JS <= 600 kB compressed, whole `dist/` <= 8 MB. |
| `npm run check:ip` | Banned third-party IP terms scan of `dist/` (run after build). |
| `npm run e2e` / `npx playwright test` | Playwright smoke tests (`tests/e2e/`) on a Pixel 7 portrait and a 1280x720 desktop Chromium; builds and serves `dist/` on port 4173 itself. First time: `npx playwright install chromium`. |
| `npm run check` | typecheck, lint, test, build, size and IP check in one go. |
| `TUNING=1 npx vitest run src/core/tuning.test.ts --silent=false` | Print the level tuning table. |
| dev sound preview | http://localhost:5173/dev/sound-preview.html. Metrics table: `SOUND_REPORT=1 npx vitest run src/platform/audio/sounds.metrics.test.ts --silent=false` (add `SOUND_EXPORT="dir"` to export WAVs). |
| dev art preview | http://localhost:5173/dev/art-preview.html (`?view=sheet`, `?cell=32`). |
