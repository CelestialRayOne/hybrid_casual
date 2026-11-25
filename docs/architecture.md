# Architecture and module contracts

This file is the contract between modules. `docs/spec.md` defines the rules, `CLAUDE.md` the constraints, and `src/core/types.ts` the data model.

## Layers

```
src/core/       pure TS rules (no Phaser/DOM). Deterministic. Unit-tested with Vitest.
src/platform/   SaveStore, Platform (CrazyGames SDK), Ads, AudioService, safe area. Implementations swap per host.
src/telemetry/  on-device playtest event log.
src/game/       Phaser 4 scenes and views. Render core state, animate CoreEvents, translate input to core actions.
src/main.ts     composition root: picks platform implementations, boots Phaser.
```

The dependency direction is `game -> core`, `game -> platform`, `game -> telemetry`, and `main -> everything`. Core imports nothing outside `src/core`.

## Core API (`src/core/index.ts` re-exports these)

v2 (2026-11-20): gem powers replace tetromino stamps; relic boons; per-attempt randomness; perk points with reforge.

```ts
// rng.ts: mulberry32 (public domain, vendored). The state is a single uint32 so it fits in LevelState.
nextRandom(state): [value /* [0,1) */, nextState];  nextInt(state, n);  hashSeed(...ints);  class Rng

// rules.ts
rulesFor(perks): Rules                    // powerThreshold 6, trayCapacity 3 (4), crustHp 2 (1), revealRows 2 (5), bonusRelics 0 (1), ...
PERKS, PATHS, PERK_IDS, isPerkId(v)       // jeweler_brilliant, jeweler_flawless, arch_softcrust, arch_treasure,
                                          // alch_transmute, alch_volatile, smith_toolbelt, smith_tempered
offerPerks(owned, seed): PerkId[]         // up to 3 not-yet-owned, deterministic
PERK_POINT_AFTER = [3, 7, 11, 15, 19];  MAX_REFORGE_TOKENS = 9;  CONTINUE_MOVES = 5

// progress.ts: pure Progress v2 helpers (return a new object, or the same one when nothing changes)
defaultProgress(); pendingPerkPoints(p): number[]; perkPointDue(p, level); grantPerkPoint(p, level);
grantPendingPerkPoints(p); nextPerkPointLevel(p); canSpendPerkPoint / spendPerkPoint(p, perk);
perkStatus(p, perk): 'owned' | 'available' | 'locked'; canReforge / reforge(p) (1 token: all perks back as points);
addReforgeTokens(p, n) (clamped 0..9)

// level.ts
createLevelState(def, perks, attemptSeed): LevelState  // one ATTEMPT: structure from def, randomness from attemptSeed
visibleRows(state); findGroup(state, at); listGroups(state); hasAnyGroup(state); canTriggerAt(state, at)
sealingBedrock(def); validateLevelDef(def, { strictDepth? }); serializeState / deserializeState (STATE_FORMAT_VERSION 2)

// actions.ts: each mutates `state` and returns ActionResult with ordered CoreEvents
tap(state, at)              // armed power: triggers it at `at` (any visible cell); otherwise clears the group (2+)
armPower(state, trayIndex)  // toggle; arming another slot moves the arm. Free.
disarmPower(state)
transmute(state, at)        // alch_transmute, 1 move, refused while armed ('power_armed')
useContinue(state)          // +5 moves once, lost -> playing
stars(state); levelResult(state): { status, stars, collected, goal, bonusCollected, reforgeTokens, powersUsed, ... }

// tray.ts / powers.ts (tables for the view and tests)
chargeLevel(state, size); powerThreshold(state); powerKind(color)
WILDFIRE_SPREAD [3,6,10,15,22]; TIDAL_LINES; SHAKER_RADIUS [1,1,2,2,3]; SHAKER_DIRT [2,2,3,3,3]; SHAKER_CRUST [1,1,2,2,3]; SHAKER_FISSURES [2,2,3,3,4]; SHAKER_FISSURE_LENGTH [2,3,3,4,4];
LIGHTNING_STRIKES [3,5,8,12,16]; DRILL_ROWS [4,6,8,all,all]; DRILL_HALF_WIDTH [0,0,0,0,1]; DRILL_BLAST [1,1,2,2,row]; drillShape(state, at, level)

// board.ts
isVisible, isRelicVisible, isRelicGone (a bonus relic that scrolled away), isStranded, isStuckGem, relicCells, cloneState, maxScroll

// generator.ts / levels.ts
LEVEL_PARAMS; getLevel(id); generateLevel(params); generateLevelReport(params); clearLevelCache(); RELIC_VARIANTS = 6
AUTHORED_LEVELS; parseAsciiLevel(src)     // 'o' = random gem per attempt, r/b/g/y/p = pinned gem

// bot.ts
playBot(def, perks, attemptSeed, opts?); playBotFrom(state); suggestAction(state): {type:'tap',at} | {type:'power',trayIndex,at}
playCasual(def, perks, attemptSeed, modelSeed, opts?); playCasualFrom(state, seed); CASUAL_PROFILE; RANDOM_PROFILE
applyBotAction(state, a)                  // BotAction = {type:'tap',at} | {type:'arm',trayIndex}; a power use = arm + tap

// levelTable.ts (generated) + calibrate.ts (tooling, not re-exported)
LEVEL_MOVES; calibrateLevel(def, runs?); targetWinRate(id)
```

**Data model (types.ts).** `Cell` = empty | block `{color, geode?}` | dirt `{hp}` | relic `{id}` | bedrock `{id}`. `Relic` adds `variant` (art, = index into `BOON_IDS`), `boon` and `bonus`. `Power = {color, level 1-5, seq}`; `POWER_KINDS[color]` = wildfire, tidal, earthshaker, lightning, drill. `LevelDef` adds `boss`, `cluster`, `bonusRelics [min, max]`, `geodeRate`, `pinned: Pos[]`, `startPowers` and `tutorial?: TutorialId[]` ('tap', 'dirt', 'charge', 'use', 'bedrock'). Its `relics` are the goal relics (goal = their count). `LevelState` adds `attemptSeed`, `goal`, `collected`, `tray: Power[]`, `armed`, `powerSeq`, `boons: Record<BoonId, number>` and `stats` (groups, powers charged/used, geodes, bonusCollected, reforgeTokens, rescues, shuffles).

**Events.**
- `cleared {cells, color, size, geodes?}`: tap clears only.
- `powerTriggered {trayIndex, color, power, level, at, effect, cells, destroyed}`. `effect` holds the per-power pattern:
  - wildfire `{group, burnt[{at, step}]}`;
  - tidal `{rows, cols}`;
  - earthshaker `{origin, radius, area, fissures}` (`area` = the certain square, `fissures` = each crack's cells outside it, in travel order);
  - lightning `{strikes}`;
  - drill `{cols, from, to, path, blast}` (`path` includes the `blast` cells).
  `cells` and `destroyed` are in animation order.
- Damage and relics: `dirtDamaged`, `bedrockShattered`, `crustChipped`, `relicCollected {relicId, boon, bonus, collected, goal}`, `boonGained {boon, stacks, relicId}`.
- `bonusMove {amount, source: brilliant | sun_coin | continue}`.
- The tray:
  - `powerCharged {color, level, index, merged, source: group | geode | boon | volatile | rescue, replaced?}`;
  - `powerArmed`, `powerDisarmed`;
  - `geodeCleared`.
- `fell`, `scrolled`, `recoloured`, `shuffled`.
- `reforgeTokenEarned {reason: big_group | bonus_relics | three_stars}`.
- `won {stars}`, `lost`.

Fail reasons: `not_playing`, `not_a_group`, `out_of_view`, `no_power`, `power_armed`, `no_transmute`, `no_target`, `continue_used`, `no_moves`.

### Resolution order inside one action
1. The action's own effect:
   - **Group tap:** remove the group (`cleared`), then adjacency damage once per target: adjacent dirt takes `1 + Compass` damage, adjacent relics 1 chip (times the Ancient Key multiplier). Group clears never affect bedrock.
   - **Power trigger:** take the armed power out of the tray. Effective level = level + Tempered (cap 5). Run the power (`powerTriggered`), then apply its damage in a fixed order: dirt (row-major), bedrock slabs (by id), crusts (by relic id).
2. Each relic that reaches crust 0 is collected (`relicCollected`) and its boon applies at once (`boonGained`, then its effect). Chains (Ancient Key) resolve depth first.
3. Rewards:
   - Group clears (taps, and Wildfire's tapped group of 2+): Brilliant Cut +1 move, the power charge, geodes (each `geodeCleared` plus a Lv1 power of the geode's colour), the 20+ token roll.
   - After a power: the Volatile Mix roll.
4. Settle: gravity (blocks only, whole column), then scroll, then free stranded relics (except sealed ones). Repeat while something was freed.
5. Moves: a tap, transmute or power trigger costs 1. A power trigger at 0 moves is free (last chance).
6. End check:
   - **Win:** `collected >= goal` (checked first). A 3-star win then rolls the 30% token.
   - **Lose:** 0 moves and an empty tray.
7. Dead board, only with an empty tray:
   - a sealed relic gives a rescue power;
   - no visible group: shuffle or recolour, or a rescue power when no two gems touch.

Actions only accept positions inside the visible window (`out_of_view`). All randomness goes through `state.rngState` (in-level) or the attempt rng (setup). The same (def, perks, attemptSeed, actions) always gives the same state and events.

### Gem powers (decided 2026-11-20, core v2)
- **Charging:**
  - A group of `T` or more charges a power of its colour, where `T = max(4, 6 - Crowned Ring stacks)`.
  - Level = `1 + floor((size - T) / 3)`, capped at 5. With T = 6 the bands are 6-8, 9-11, 12-14, 15-17 and 18+; a lowered threshold shifts every band down by the same amount.
  - Then +1 per Chalice stack, and +1 for Flawless when the raw group is 12+, still capped at 5.
- **Tray:** 3 slots, 4 with Tool Belt. A new charge is placed in this order:
  - a same-colour power merges in place (`max(old, new) + 1`, cap 5; the slot keeps its age);
  - otherwise it takes a free slot;
  - otherwise it replaces the lowest level in that slot (tie: the oldest, lowest `seq`); if that lowest level is still higher than the new power's, the new power is skipped (`powerSkipped`, toast + telemetry).
  Random powers (Star Amulet, Volatile Mix) can be any of the 5 kinds, even on 4-colour levels. A geode always grants its own colour (owner playtest 2026-11-24).
- **What charges:** only real group clears, which means a tap or **Wildfire's tapped group** (2+). That group behaves exactly like a tap: it charges, pays geodes, triggers Brilliant Cut and rolls for the token. Gems destroyed by a power (burnt, swept, struck, drilled) never charge powers. This prevents endless power chains. Geodes are the exception: a geode destroyed by a power still pays its Lv1 power (`geodeCleared` + `powerCharged` source geode, timed to when the power reaches it; once per geode, so Wildfire's group geodes are not paid twice). Owner playtest 2026-11-23.
- **Touch rule:** every power touches the tapped cell, so bedrock there shatters the whole slab, for every power. Powers only reach the visible window and never destroy relics; they chip crusts (times the Ancient Key multiplier).
- **Wildfire:**
  - Clears the tapped gem's group, even of size 1. On a non-gem tap, the fire starts at that cell.
  - The spread is a multi-source BFS by orthogonal steps through gem and empty cells; dirt, relics and bedrock block it.
  - The N nearest gems burn. Ties at the last distance reached are picked by the rng.
  - Group and burnt cells deal adjacency damage like a clear, once per target: dirt 1 + Compass, relics 1 chip, adjacent slabs shatter.
- **Tidal Wave:**
  - Lines by level: Lv1 the row; Lv2 row + column; Lv3 "3 rows" (tapped row ±1); Lv4 3 rows + column; Lv5 3 rows + 3 columns (tapped column ±1).
  - Gems are destroyed, dirt takes 1 damage, relics take 1 chip once, and slabs in the lines shatter. No adjacency damage.
  - Cells are ordered outwards (Manhattan) for the wave animation.
- **Earthshaker:**
  - The origin is the tapped gem's group (or the tapped cell). The area is every cell within **Chebyshev** distance of the radius: a square, which reads naturally on the grid.
  - Fissures: from the tapped cell, 2 / 2 / 3 / 3 / 4 cracks set off in distinct random headings (of 8, rng). Each step turns 45 degrees left or right of its heading with 1/4 chance each (never back), so a crack wanders but always moves away. Cells in the square or already cracked are passed over; a crack ends after 2 / 3 / 3 / 4 / 4 new cells or at the edge of the view. Fissures are not previewed (only the square is).
  - Dirt in the square and the fissures takes 2 / 2 / 3 / 3 / 3 damage (Lv3+ clears any dirt, max hp is 3), each relic touching them takes the level's chips once, and slabs in them shatter. Gems are untouched.
  - Radius 1 / 1 / 2 / 2 / 3, crust chips 1 / 1 / 2 / 2 / 3 (owner playtest 2026-11-24: buffed, then rebalanced: no one-shot below Lv3, random fissures).
- **Chain Lightning:**
  - The tapped gem is struck first (if the tap was on a gem), then distinct random visible gems (rng), up to N.
  - Each strike destroys its gem, deals 1 damage to each adjacent dirt and 1 chip to each adjacent relic, and shatters adjacent slabs. Damage is **per strike**, so it adds up.
- **Drill:**
  - Bores straight down from the tapped cell for 4, 6 or 8 rows; Lv4 and Lv5 reach the bottom of the view, and Lv5 is 3 wide.
  - Break-through: on the last bored row it also hits the cells within 1 / 1 / 2 / 2 columns of the tapped column; at Lv5 the whole row (buffed after owner playtest 2026-11-24).
  - Gems and dirt are destroyed outright, relics are chipped by 2 once, and slabs shatter. It bores through everything.
- **Last chance:** a level with 0 moves and a power in the tray is still playing. Arming and triggering are free then, so the held power stays usable. Group taps and transmute return `no_moves`.

### Relics, boons, goal (decided 2026-11-20)
- **Goal:**
  - `goal = def.relics.length` (the guaranteed goal relics).
  - **Any** relic collected, bonus included, counts towards it, so bonus relics make a level faster and give boons.
  - Bonus relics are placed no shallower than one row above the shallowest goal relic. Without that rule, a shallow bonus relic won a 1-relic level in 2 moves.
- **Bonus relics** never hold the scroll. They can scroll away above the view and are then gone (`isRelicGone`). Goal relics still never leave the view uncollected.
- **Boons:**
  - Sun Coin: +2 moves now (nothing on unlimited levels).
  - Chalice: +1 charge level per stack.
  - Compass: +1 adjacency dirt damage per stack on group clears (taps and Wildfire, not Lightning).
  - Star Amulet: a random power of level min(3, stacks) now.
  - Crowned Ring: threshold -1 per stack (minimum 4).
  - **Ancient Key:** every other remaining crust loses 1 HP now.
    - Visible relics can reach 0 and are collected at once, chaining their boons. This is crazier and more fun.
    - Relics below the view keep at least 1 HP, so nothing is collected off-screen.
    - Relics gone above the view are untouched.
    - Later chips are multiplied by `1 + key stacks`.
- **Reforge tokens:** counted in `stats.reforgeTokens` and announced with `reforgeTokenEarned`; the client adds them to Progress.
  - A 40% roll, once per attempt, on the first group clear of 20+.
  - Guaranteed once, on the 3rd bonus relic collected in the attempt.
  - A 30% roll on a 3-star win, after `won`.
  All rolls go through the in-level rng, so they are deterministic. Tokens earned in a lost attempt still count, because they were already announced.

### Per-attempt randomness (decided 2026-11-20)
- **Structure vs randomness:** `LevelDef` holds the structure (depth, dirt, bedrock, goal relics and their positions, colours, moves, start powers).
- **The attempt roll:** `createLevelState(def, perks, attemptSeed)` rolls from `hashSeed(def.seed, def.id, attemptSeed, 0xa77e)`, in this order:
  1. Gem colours, row-major. Each gem copies its left or upper neighbour with probability `def.cluster`. `def.pinned` cells keep their authored colour.
  2. Geodes, at `def.geodeRate`, never on pinned cells.
  3. Relic types for goal relics without a pinned variant.
  4. Bonus relics: the `def.bonusRelics` range plus Treasure Sense.
- **Seeds:** the in-level rng is `hashSeed(def.seed, def.id, attemptSeed)`. The client passes a fresh seed per attempt (e.g. `Date.now()`).
- **Bonus relic spots:**
  - gems only, never pinned cells;
  - row >= 4, and no shallower than the shallowest goal relic - 1;
  - no other relic or bedrock within Chebyshev distance 2;
  - at least 2 gem neighbours and at most 1 dirt neighbour, so a bonus relic never seals a pocket.
  20% are 2x2 when a spot exists.
- **Boss levels** (owner request):
  - `LevelDef.boss` marks levels **5, 10, 15 and 20**, the end of each 5-level stretch.
  - They roll 2-3 bonus relics (5-7 relics in all), and geodes at 4% instead of 1/60.
  - 10, 15 and 20 are also `hard` (the lower win-rate targets), so boss and hard coincide there.
  - Level 5 is an onboarding boss (the bedrock tutorial) with the easy ~92% target.
  - The view shows the boss badge and banner from `def.boss`.

### Other core decisions
- **Bedrock:**
  - Fixed slabs of 2-4 orthogonally connected cells in random shapes (`growSlab`), one id per slab.
  - Group clears never affect them; any power that touches a slab shatters it whole.
  - A goal relic next to a slab requires a start power (`validateLevelDef`). Each generated sealed relic gets one free Lv1 power of a random colour.
- **Sealed relics:** a stranded relic (no live gem can ever touch it, see below) that touches bedrock is not freed. Instead, the dead-board step gives a rescue power (Drill Lv1, `source: 'rescue'`) while the tray is empty. Stranded relics with no bedrock next to them are still freed at once.
- **Rescue power:** replaces the v1 rescue stamp. When no two visible gems touch, shuffling cannot help, so the player gets a Drill Lv1, which always digs.
- **Stuck gems and stranded relics:** unchanged from v1 (`isStuckGem`, `isStranded`; review H1). Live = visible and not stuck.
- **Visible-only rules:** groups and all damage stay inside the visible window. Shuffles move colours only; geode flags stay on their cells.
- **Transmute:** accepts a single gem; ties go to the lowest colour index; geode flags stay.
- **Generator:** see the header of `generator.ts`. Seeds are pinned so each level is accepted on the first try. The greedy bot must win attempt 1 with unlimited moves and at most 1 rescue.

### Difficulty calibration (tuning)
- **Casual player model** (`bot.ts`, `CASUAL_PROFILE`): seeded, with no lookahead for taps.
  - Taps: 8% of the time a uniformly random group. Otherwise a softmax (temperature 0.6) over `0.3 x size`, plus:
    - +1 if the group charges a power;
    - +5 if it touches a visible relic;
    - +3 if it is next to dirt or bedrock beside one;
    - +1 if it lies above the next relic.
  - Powers: always used when a visible relic is sealed by bedrock or no group or move is left. Otherwise used with 50% chance per turn while a relic or slab is in view.
  - Aim: 25% of uses go to a random visible cell. The rest are aimed with the bot's evaluation over targeted cells (relics, their neighbours, cells above them, slabs, big groups).
  - `RANDOM_PROFILE` taps uniformly and fires powers at random cells straight away.
- **Greedy bot:** a one-ply simulation of every group, and of each held power on up to 24 targeted cells. Held powers have value in the evaluation, so it spends one only when that beats the best tap. It is the solvability check only.
- **Calibration** (`calibrate.ts`):
  - 60 casual runs per level. Run i uses **attempt seed i** (a different random attempt each time) and model seed i.
  - The budget is the one whose win rate is closest to the target (ties: the more generous one).
  - Targets: L1 unlimited; L2-5 92%; L6-15 70%; hard bosses L10 and L15 53%; L16-19 56%; final boss L20 45%.
  - The result is precomputed into `levelTable.ts`. `TUNING=1 npx vitest run src/core/tuning.test.ts --silent=false` recomputes it (~20 s) and fails if it is stale; `TUNING_WRITE=1` rewrites it.

Calibrated table (2026-11-20, v2):

| L | flags | moves | greedy | casual median | casual win | target | random win | goal | relics/attempt mean (min-max) | power uses/game mean (min-max) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | - | inf | 5 | 7 | 100% | - | 100% | 1 | 1.0 (1-1) | 1.0 (0-2) |
| 2 | - | 13 | 11 | 12 | 90% | 92% | 10% | 1 | 1.0 (1-1) | 1.3 (0-3) |
| 3 | - | 15 | 9 | 13 | 90% | 92% | 32% | 1 | 1.5 (1-2) | 1.6 (0-3) |
| 4 | - | 17 | 14 | 16 | 90% | 92% | 25% | 2 | 2.5 (2-3) | 1.8 (0-4) |
| 5 | boss | 23 | 12 | 17 | 92% | 92% | 63% | 2 | 4.6 (4-5) | 2.6 (0-6) |
| 6 | - | 21 | 34 | 20 | 73% | 70% | 37% | 2 | 2.5 (2-3) | 2.5 (0-6) |
| 7 | - | 31 | 11 | 30 | 70% | 70% | 47% | 3 | 3.5 (3-4) | 4.2 (1-7) |
| 8 | - | 31 | 23 | 30 | 65% | 70% | 22% | 1 | 1.9 (1-3) | 4.0 (1-9) |
| 9 | - | 31 | 10 | 25 | 68% | 70% | 35% | 2 | 3.0 (2-4) | 3.6 (1-7) |
| 10 | boss hard | 22 | 20 | 24 | 52% | 53% | 12% | 3 | 5.6 (5-6) | 3.6 (2-6) |
| 11 | - | 23 | 23 | 23 | 72% | 70% | 18% | 2 | 2.9 (2-4) | 3.9 (2-7) |
| 12 | - | 33 | 25 | 33 | 72% | 70% | 32% | 4 | 4.9 (4-6) | 4.6 (1-9) |
| 13 | - | 34 | 30 | 32 | 72% | 70% | 25% | 1 | 1.8 (1-3) | 5.3 (2-8) |
| 14 | - | 31 | 21 | 31 | 68% | 70% | 32% | 3 | 4.2 (3-5) | 4.2 (1-9) |
| 15 | boss hard | 21 | 28 | 22 | 53% | 53% | 7% | 3 | 5.4 (5-6) | 5.7 (2-10) |
| 16 | - | 30 | 25 | 29 | 53% | 56% | 28% | 2 | 3.2 (2-5) | 5.0 (1-8) |
| 17 | - | 34 | 26 | 33 | 57% | 56% | 23% | 3 | 4.4 (3-6) | 5.1 (0-13) |
| 18 | - | 46 | 47 | 46 | 58% | 56% | 30% | 1 | 1.8 (1-2) | 5.8 (3-9) |
| 19 | - | 38 | 36 | 40 | 55% | 56% | 25% | 4 | 5.5 (4-7) | 6.3 (2-11) |
| 20 | boss hard | 30 | 29 | 32 | 47% | 45% | 13% | 4 | 6.4 (6-7) | 6.8 (4-10) |

Caveats:
- Win rates move in steps, so some levels land a few points off target.
- "greedy" is one attempt only, so it can exceed the casual median.
- Boss levels get fewer moves than their neighbours, because their many relics make them faster; their difficulty comes from the tighter budget.
- The model is a stand-in for people. Replace these numbers with playtest telemetry as soon as it exists.
- Stars (40% / 15% of moves left) were not retuned.

## Platform API (`src/platform/`)

```ts
interface SaveStore { load(): Promise<Progress>; save(p: Progress): Promise<void>; reset(): Promise<void>; }
  // localStorageSaveStore(key), memorySaveStore(); versioned and migration-ready; falls back to memory if storage throws

interface Platform {
  readonly name: 'crazygames' | 'local' | 'none';
  init(): Promise<void>;                  // never throws; stops waiting after ~3s. A later SDK init success is still adopted, replaying
                                          // the current loading/gameplay state and the host mute (through onMuteChange listeners)
  loadingStart(): void; loadingStop(): void;
  gameplayStart(): void; gameplayStop(): void;   // idempotent (tracks its own state)
  happytime(): void;
  isMutedByHost(): boolean; onMuteChange(cb: (muted: boolean) => void): void;
  deviceType(): 'desktop' | 'tablet' | 'mobile' | 'unknown';
}
  // crazyGamesPlatform(), noopPlatform(); hand-written minimal typings for window.CrazyGames.SDK v3

interface Ads { readonly enabled: boolean; midgame(): Promise<'shown'|'skipped'>; rewarded(): Promise<'rewarded'|'skipped'>; }
  // noopAds() for the MVP (always 'skipped' / enabled=false)

interface AudioService {
  unlock(): void;                        // call from a user gesture
  play(id: SoundId, opts?: { pitch?: number; volume?: number }): void;
  setEnabled(on: boolean): void;         // user setting; the host mute overrides it
}
  // synthAudio(ctx?): pre-renders every SoundId once into AudioBuffers on a single AudioContext; plays nothing before unlock

readSafeArea(): { top: number; right: number; bottom: number; left: number }   // CSS px, from #safe-probe
onVisibilityChange(cb, { includeFocus? = false })   // tab hidden/visible only by default: CrazyGames handles focus loss itself
                                                    // ("Don't call this event when the user switches focus or leaves the game area", sdk/game docs)
// Save: Progress v2 {version: 2, stars, unlocked, perks, perkPoints, perkPointsGranted, reforgeTokens, tutorialsSeen,
// settings}. sanitizeProgress clamps `unlocked` to LEVEL_COUNT, drops stars for ids outside 1..LEVEL_COUNT, keeps only
// current PerkIds, keeps perkPointsGranted to PERK_POINT_AFTER levels, clamps perkPoints to 0..8 and reforgeTokens to
// 0..9; `tutorialsSeen` (short id-shaped strings, deduplicated, at most 32) defaults to []. The storage key keeps its
// v1 name. Migration v1 -> v2 (`migrateV1toV2`): perks are kept only if still in the game (jeweler_brilliant,
// arch_softcrust, alch_transmute); perkPointsGranted = the new schedule levels (3/7/11/15/19) already won; unspent
// perkPoints = max(removed perk count, granted - kept), so each removed perk becomes a point and nobody gets fewer
// points than the new schedule gives; v1 perkPicksTaken is dropped; reforgeTokens = 0.
// AudioService: a voice is released by onended or, at the latest, shortly after its buffer length (a closed or
// interrupted context may never fire onended; a plain counter then muted everything after 16 sounds).
```

Sound ids (see `src/platform/sounds.ts` `SOUND_IDS` and `PlayOptions`): `tap_invalid`, `clear` (`{color, size}`), `dirt_crack`, `dirt_break`, `crust_chip`, `relic_reveal`, `boon`, `geode`, `power_charge`, `power_merge`, `power_arm`, `power_disarm`, `fire`, `wave`, `quake`, `lightning`, `zap` (`{index}`), `drill`, `bedrock_shatter`, `shuffle`, `win`, `lose`, `star` (`{index}`), `perk_pick`, `reforge_token`, `ui_click`, `ui_open`, `ui_close`, `level_start`.

## Telemetry (`src/telemetry/`)

```ts
createTelemetry(storage: KeyValue | null, opts?: { max?: number /* default 2000 (DEFAULT_TELEMETRY_MAX) */ }): Telemetry
interface Telemetry { log(type: string, data?: Record<string, unknown>): void; events(): TelemetryEvent[]; summary(): TelemetrySummary; exportJson(): string; clear(): void; }
```

Events are kept in a ring buffer and persisted with debounce (at most one write per second) in a compact v2 format (`{ v: 2, s: [sessionIds], e: [[t, sessionIndex, type, data?]] }`; v1 is still read, exports stay in the readable v1 shape). The log shares localStorage with the save: on a quota error the newest half is kept and retried, and once a trimmed copy fits, the in-memory buffer and its cap shrink to match. If storage refuses even an empty log, events stay in memory only. There is no network. The summary gives per-level attempts, wins, win rate, average moves left, invalid-tap %, powers earned/used (v1 stamp events count as powers), boons, geodes, bonus relics, reforge tokens, continues, and session count and length. v2 events: `power_charged`, `power_used`, `boon_gained`, `geode`, `bonus_relic`, `reforge_token_earned`, `reforge_used`, `perk_point_earned`/`spent`/`saved`; level events carry `boss: true` on boss levels.

## Game (`src/game/`)

v2 (2026-11-20): stamps removed; gem powers, boons, bosses, perks screen.

- **Scenes:**
  - `Boot`: loads the save, then hands off (no title screen).
  - `Play`: board, HUD (levels / perks / settings buttons, title with boss and hard badges, moves, relic goal slots, depth, boons row) and the power tray.
  - Overlays: `LevelEnd` (win: stars, relics x/goal + bonus, boons, tokens, perk point; fail: continue once, retry), `PerkPick` (perk offer after a point: 3 cards + "Save for later"), `Perks` (perks screen: 4 paths x 2 nodes, points, tokens, next point level, Learn, Reforge with confirm), `LevelSelect` (boss tiles, perks button), `Settings`, `?debug=1` `Debug` (telemetry summary incl. powers used/earned, boons, geodes, bonus relics, tokens).
- **Attempts:** every level start, retry and level change creates a new attempt with a fresh seed (`(Date.now() ^ random) >>> 0`), so gems, bonus relics, relic types and geodes re-roll ("New gems every try!").
- **Powers (input):** tap a tray token to arm it (free; glowing tinted ring, token lifts, pulse), tap it again to disarm; arming another slot moves the arm. While armed, a reticle follows the mouse over the board, or appears on touch press and follows the finger; the power's certain area is shaded (`powerPreview.ts`, unit-tested against core: Tidal lines, Drill path, Earthshaker square, Wildfire tapped group, Lightning tapped cell). Releasing on a cell fires it; releasing off the board keeps it armed. A hint pill under the board names the power ("Drill Lv2 • Tap the board"; "Free!" at 0 moves).
- **Power VFX (`view/PowerFx.ts`):** per-power choreography timed by `timeline.ts` `powerTiming` (450-950 ms; input locked; damage events land when the effect reaches their cell; then gravity/scroll). Wildfire: flames leap cell to cell in `burnt` order, gems char then pop with embers. Tidal Wave: water streaks sweep out along rows/columns, gems wash away with droplets. Earthshaker: stomp, hard rumble, shock rings, rocks off dirt/stone, gems rattle; then the fissures crack outwards cell by cell (60 ms a cell) with glow, rocks and dust. Chain Lightning: flickering bolts strike to strike with a rising `zap` per strike and blue sparks. Drill: a spinning bit bores down spraying rock chunks, gems burst as it passes, then a break-through burst runs sideways along the last row. All sprites pooled (cap 120), particle emitters capped (60-140 each).
- **Tray display:** `TrayView` keeps its own displayed copy so charges land when their flight arrives (merge = level-up pop with pips filling, replace = old token drops out); the scene re-syncs it from the core tray whenever no charge flight is pending.
- **Relics and boons:** relic reveal (hit-stop, glow, arc into the next HUD slot; extra relics beyond the goal add gold-starred bonus slots), then a boon banner ("Chalice: Powers +1", `boon` sound) whose icon flies into the boons row; Sun Coin "+2" flies into the move counter, Star Amulet's power flies from the relic to the tray, Ancient Key crusts crack after the reveal. Tap a boon for a one-line tooltip. Geodes twinkle; clearing one bursts into crystal glints and its power flies to the tray.
- **Bosses:** levels with `def.boss` open with a "BOSS LEVEL" ribbon and a slam-in crest (`level_start` pitched down + low `bedrock_shatter`), show the crest in the HUD title, use the violet boss tile in level select, and win with a bigger confetti storm.
- **Perks only change between attempts:** a perk learned or reforged on the perks screen before the first move of an attempt restarts the attempt with the new perks (nothing lost); after that it applies from the next attempt, and the perks screen says so ("Changes apply from your next try"). Perk points are granted on the win (also pending ones at the next level start); the offer appears after the win card; "Save for later" keeps the point (the HUD perks button shows a count bubble).
- **Tutorials** (`def.tutorial`, persisted in `tutorialsSeen`, never block input): L1 `tap`; L2 `dirt`, then `charge` (hand on the scripted 6+ group "Clear 6+ for power", then on the tray "Tap to arm"); L3 `use` ("Tap to arm", then the hand on a good target "Tap the board"); L5 `bedrock` ("Powers break stone").
- **Art:** code-drawn textures in `src/game/art/` (`registerTextures(scene, cellPx)`), jewel tones on warm earth. The palette lives in `src/game/art/palette.ts`.
- **Layout:** recomputed on every resize from the game size and the safe area. Column: top bar (levels, perks | title | debug, settings), HUD panel, boons row, board, relic peek strip (also the armed hint), tray (3 or 4 slots). Wide (short landscape): HUD and boons on the left, tray on the right.
- **Animation:** the view applies the core action, then plays the returned events as a tween timeline. Input is locked while events play.
- **Progress safety (QA pass):** a win (stars, unlock, perk point) is saved the moment the core reports it; reforge tokens are saved the moment they are announced (they count even if the attempt is lost); Next / Retry / level picks are ignored once the scene is leaving, and board presses are ignored for 350 ms after a level starts so a double tap on Next cannot spend a move. A touch the browser cancels never commits a tap, power or button. `level_quit` is also logged on `pagehide` mid-level.
- **Backdrop:** repainted only when the size or the depth band changes (the texture outlives scene restarts), and a mid-level band change waits until the board is still (a 30-50 ms paint plus upload would otherwise hitch right after a scroll).
