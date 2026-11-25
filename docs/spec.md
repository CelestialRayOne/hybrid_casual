# MVP spec: Gem Rush, a gem dig puzzle (name decided by the owner 2026-11-23)

**Status: APPROVED by owner 2026-11-20.** The v2 changes (randomness, gem powers, relic boons, perks screen with respec, sound) were requested by the owner on 2026-11-20 and designed by Claude under delegation. Tech, platform and asset rules live in `CLAUDE.md`.

Owner decisions (2026-11-20): stamps are free to place; one free +5 moves continue per level; telemetry is on-device only; CrazyGames SDK is included in the Basic Launch build for game events (no ads); art direction is **bright jewel tones on warm earth**; the name is decided at the end; perk content is decided by Claude (owner adjusts after playtesting); level select is included; owner makes covers/videos from the MVP. Owner's AI-generated ESR art is allowed after curation; anything carrying third-party IP is excluded.

## Goal

Answer one question: **does it play?** Players should understand it without text, want "one more level", and feel losses are fair.

The test is a CrazyGames **Basic Launch** build. Basic Launch is judged on average session length (10+ min), day-1 retention (10–15%), the share of players who play at least 1 minute (80%+), and thumbnail CTR. The CTR criterion is new, so verify it against the current docs.

## Board and tapping

- **Board:** 8 columns × 10 visible rows in a portrait column. The HUD (moves, relics found/goal, boons, depth) sits on top and the power tray at the bottom. Cells are at least 32 CSS px on desktop and 40 px on touch.
- **Colours:** 4 in levels 1–10, 5 from level 11. Each colour also has its own glyph, so colour-blind players can read the board.
- **Tap:** a tap clears an orthogonal group of 2+ same-colour blocks and costs 1 move.
  - The group highlights on press and clears on release. Dragging off cancels the tap.
  - A single block wobbles and costs nothing.
- **Gravity:** only coloured blocks fall, straight down. Nothing refills from above.
  - Dirt, crusted relics and bedrock are fixed. Blocks rest on them.
- **Digging:** each level is a pre-generated column 20–34 rows deep (no refill, so deeper would exceed 60–120 s levels).
  - While the top 3 visible rows contain no coloured blocks, the board scrolls up 1 row. Fixed cells don't count for this check.
  - Scrolling repeats until the check fails or the bottom of the level is visible.
  - A depth meter counts the rows scrolled.

## Obstacles and relics

- **Dirt:** 1–3 hit points, shown as cracks.
  - Each clear deals 1 damage to every dirt cell orthogonally adjacent to any cleared cell, at most once per clear.
  - A dirt cell at 0 HP becomes empty.
- **Relics:** a relic is 1×1 or 2×2 and sits inside a 2-HP crust.
  - The crust takes at most 1 chip per clear.
  - When the crust breaks, the relic flies straight to the HUD.
- **Bedrock:** fixed stone slabs of 2–4 cells in varied shapes. Group clears don't hurt them. Any gem power that touches a slab shatters the whole slab.
- **Win and lose:**
  - **Win:** collect the level's **goal** number of relics, shown as "found / goal". Win is checked before lose.
  - **Lose:** 0 moves left and no power in the tray.
  - **Level 1** has no move limit.
  - **Continue:** one free "+5 moves" per level. This is the future rewarded-ad slot.
- **Stars:** 3 stars at ≥40% of moves left, 2 at ≥15%, otherwise 1. Using the continue caps the result at 1 star.
- **No group on the board:**
  - If the tray is empty, a free shuffle of visible colours runs. It aims for 3+ groups and guarantees at least 1.
  - If fewer than 2 blocks share a colour, the fewest blocks needed are recoloured to form 1 group.

## Randomness (v2, owner request 2026-11-20)

Each **attempt** gets a fresh random seed, while the level's structure stays authored.

- **Fixed per level (the design):**
  - depth;
  - the layout of dirt veins and bedrock;
  - colour count;
  - the goal relic count and the guaranteed relics' depths;
  - the move limit.
- **Random per attempt:**
  - **Gem colours:** re-rolled, using the level's clustering.
  - **Bonus relics:** 0–3 extra relics at random spots, so a level can have more relics than its goal.
  - **Relic types:** each type grants a different boon (see below).
  - **Geodes:** rare sparkling geode gems, about 1 in 60. Clearing one in a group, or destroying it with a power, grants a level-1 power of the geode's own colour (owner playtest 2026-11-23; own colour 2026-11-24).
- **Boss levels** (owner request 2026-11-20): a few levels are **boss levels**, shown to the player with a boss badge, a "BOSS LEVEL" intro banner and a distinct level-select tile. They roll many bonus relics and more geodes and act as the climax of each stretch of levels.
- **Calibration:** move limits are calibrated over many random attempts, so the win-rate targets hold on average while attempts still vary.

## Gem powers (v2, replaces tetromino stamps)

- **Earning:** clearing a group of **6+** gems charges a power of **that gem's colour**. Its level depends on group size:

| Group | 6–8 | 9–11 | 12–14 | 15–17 | 18+ |
|---|---|---|---|---|---|
| Power level | 1 | 2 | 3 | 4 | 5 |

- **Stacking:** a new charge of a colour already in the tray merges into it instead of taking a slot. The merged level is the higher of the two levels + 1, capped at 5.
- **Tray:** holds 3 powers. When it is full, a new colour replaces the lowest-level power (tie: the oldest), unless that power has a higher level than the new one: then the new power is skipped and a toast says so (owner playtest 2026-11-23).
- **Using:**
  - Tap a power in the tray to **arm** it (it glows). Tap it again to disarm. On desktop, a right click also disarms it; right and middle clicks never fire a power, clear gems or press buttons.
  - The next board tap triggers the power at that cell. It costs 1 move, like a normal tap.
  - While a power is armed, any visible cell can be tapped, including single gems and dirt.
  - Powers never destroy relics directly; they chip crusts.

**The five powers** (values listed for Lv1 / Lv2 / Lv3 / Lv4 / Lv5):

| Gem | Power | Effect |
|---|---|---|
| Ruby | **Wildfire** | Clears the tapped group (if any). Fire then spreads outwards from the cleared cells to 3 / 6 / 10 / 15 / 22 more gems of any colour. Burnt gems count as cleared for dirt and crust damage. |
| Sapphire | **Tidal Wave** | Clears lines through the tapped cell: row / row + column / 3 rows / 3 rows + column / 3 rows + 3 columns. Gems in the lines are destroyed; dirt and crust in them take 1 damage. |
| Emerald | **Earthshaker** | Shakes the earth around the tapped group (or cell), within radius 1 / 1 / 2 / 2 / 3, then 2 / 2 / 3 / 3 / 4 fissures crack outwards in random directions, wandering as they go, each reaching 2 / 3 / 3 / 4 / 4 cells beyond the square. Dirt in the square and the fissures takes 2 / 2 / 3 / 3 / 3 damage (from Lv3 it clears any dirt, 3 being the most any dirt has); crusts touched are chipped by 1 / 1 / 2 / 2 / 3. Gems are left alone. (Buffed 2026-11-24; rebalanced the same day after owner playtest: no one-shot below Lv3, random fissures.) |
| Topaz | **Chain Lightning** | Strikes 3 / 5 / 8 / 12 / 16 random visible gems, different every time. Each struck gem is destroyed and deals 1 damage to adjacent dirt and crust. |
| Amethyst | **Drill** | Bores straight down from the tapped cell for 4 / 6 / 8 rows / all visible rows / all visible rows. It is 1 cell wide, or 3 at Lv5. On its last row it breaks through sideways, 1 / 1 / 2 / 2 cells to each side, or the whole row at Lv5. It destroys gems and dirt outright and chips crusts by 2. (Buffed 2026-11-24.) |

- **Bedrock:** any power that touches a slab shatters the whole slab.
- **Solvability:** a level whose required relics are sealed by bedrock starts with a free power in the tray (any power breaks a slab). The generator only accepts layouts a bot can clear.
- **Juice:** each power has its own animation and sound.

## Relic boons (v2): power creep inside a level

Each relic collected grants an **in-level boon** that lasts until the level ends. The 6 relic art pieces map to 6 boons. Collecting the same type again stacks its boon, making it stronger.

| Relic | Boon (per stack) |
|---|---|
| Sun Coin | +2 moves right away |
| Chalice | New gem powers are charged +1 level (capped at 5) |
| Compass | Group clears deal +1 damage to adjacent dirt |
| Star Amulet | A random power right away: Lv1 for the first stack, Lv2 for the second, Lv3 after that |
| Ancient Key | Remaining crusts lose 1 HP right away, and later crust chips count double |
| Crowned Ring | Powers need 1 fewer gem to charge (minimum 4) |

- **HUD:** collected boons show as small icons with stack counts. Tapping or long-pressing one shows its effect in one line.
- **Collection moment:** the relic reveal shows a short banner with the boon, e.g. "Chalice: Powers +1".
- **Bonus relics** are never required, but they are always worth digging for.

## Perk paths (v2)

- **Scope:** four paths with 2 perks each, 8 in total. The Blacksmith perks change because stamps are gone.
- **Perk points:** earned after levels **3, 7, 11, 15 and 19**, so 5 in total.
  - When a point is earned, the player picks 1 of 3 offered perks they don't own yet, or chooses "Save for later".
- **Perks screen:** opens from the HUD and from level select, and shows all four paths.
  - Each perk is marked owned, available or locked.
  - It shows unspent points, respec tokens, and the next level that grants a point.
  - Unspent points can be spent on any perk not yet owned.
- **Respec (Reforge):** spend 1 **reforge token** to refund **all** perks as points, then spend them again freely.
  - **Token sources** are random, so they feel like a treat:
    - a 30% chance on a 3-star win;
    - a 40% chance the first time in a level you clear a group of 20+ gems;
    - guaranteed when you collect 3+ bonus relics in one level.
  - A toast and a sound announce each token. The player can hold at most 9.
- **Saves:** owned perks, unspent points and tokens are saved. Old saves with stamp perks are migrated, and the removed perks become unspent points.

| Path | Perk 1 | Perk 2 |
|---|---|---|
| Jeweler | **Brilliant Cut:** a clear of 10+ gives +1 move | **Flawless:** powers charged from 12+ groups get +1 level |
| Archaeologist | **Soft Brush:** crusts have 1 HP | **Treasure Sense:** +1 bonus relic each level, and relic outlines show 5 rows below the board |
| Alchemist | **Transmutation:** once per level, long-press a group to match a neighbour's colour (1 move) | **Volatile Mix:** using a power has a 25% chance to leave a random Lv1 power behind |
| Blacksmith | **Tool Belt:** the power tray holds 4 | **Tempered:** powers trigger 1 level stronger (capped at 5) |

- **Debug:** a flag disables perks so the core loop can be tested on its own.

## Levels and onboarding

- **Count:** 20 levels of 60–120 s each, about 30 min of content.
  - Levels 1–5 are hand-tuned.
  - Levels 6–20 come from a seeded generator. Its parameters are depth, colours, dirt, bedrock, relic count and depth, and moves.
- **First run:** gameplay starts straight away, with the first tap possible within about 2 s. There is no title screen.
- **Tutorial:** in play, visual and skippable. A pulsing hand shows each step, with at most 4 words.

| Level | Teaches |
|---|---|
| 1 | Tap |
| 2 | Dirt |
| 2 | A scripted 6+ group charges the first power; "Tap to arm" |
| 3 | Using the armed power; first perk point after the level |
| 5 | Bedrock ("Powers break stone") |

- **Difficulty:** levels 10, 15 and 20 are marked Hard.

| Levels | Target first-try win rate |
|---|---|
| 1–5 | ~95% |
| 6–15 | ~70% |
| 16–20 | 50–60% |

- **Tuning note (2026-11-20, review M1):** move limits are calibrated against a seeded *casual player model* (noisy, prefers big groups and groups at the relic, uses stamps sensibly), not the greedy bot, which is far stronger than a new player. Each level's limit is the one at which the model wins the target share of 60 seeded runs (level 1 unlimited; 2–5 ~92%; 6–15 ~70% with Hard 10 and 15 ~53%; 16–19 ~56%; 20 ~45%). The limits are precomputed into a committed table; see `docs/architecture.md`, "Difficulty calibration". Playtest telemetry replaces the model's numbers once it exists.

- **Screens:** game, level end (win or fail), perk pick, perks screen with respec, level select (grid of levels with stars), and settings (sound, restart level, and a small reset-progress button in the corner, with confirmation).

## Look and feel

- **Art:** code-drawn faceted gems on warm earth strata (sand, clay, ochre, umber) that deepen with depth; bright, saturated jewel-tone gems (ruby, sapphire, emerald, topaz, amethyst). Curated owner art may replace gems, relics or perk icons later.
- **Juice:**
  - Group outline and count on press.
  - Capped particles.
  - Eased falls with a squash on landing.
  - Capped shake on clears of 5+.
  - **Relic reveal** (the key moment): a 120 ms freeze, a glow, then the relic arcs to the tray.
- **Sound (v2):** the owner found v1 too blunt, too sharp and too short.
  - **Synthesis:** richer and layered, with body and tails. Each sound combines a tonal layer, a noise/texture layer, filter envelopes and a shared soft room reverb, all rendered offline to buffers.
  - **Gem clears (v3, owner playtest 2026-11-23: the mallet/bell timbres sounded "like bells"):** sharp struck-glass clinks with a crisp crack and a few tinkling shards. Each colour has its own glass overtones (ruby glass bar, sapphire glass cup, emerald crystal, topaz bright and dry, amethyst thick cup). Big groups add a glass cascade (9+) and a glass burst (15+).
  - **Clear pitch** still rises with group size on a pentatonic scale.
  - **Power sounds:** fire whoosh and crackle, water wave, earthquake (wind-up, stomp, outward thuds, rumble and debris), lightning (electric-arc buzz, spark crackle and thunder; each zap is a snap of arc and sparks), drill (motor spin-up, bit chatter and rock grind, spin-down and break-through). The last three were rebuilt in v3 (owner playtest 2026-11-23).
  - **Reward sounds:** power charge, arm, merge/level-up, boon, reforge token.
  - **Variation:** small random changes to pitch and timing, so repeats don't sound identical.
  - No music in the MVP.

## Measuring "does it play"

- **Telemetry:** an on-device event log only (no network). Open it with `?debug=1`, which shows an overlay with per-level win rate and invalid-tap %, plus JSON export.
- **Playtest with 6–10 people. Pass if:**
  - ≥80% clear level 1 unaided within 60 s.
  - ≥70% of earned powers are used.
  - ≥50% play past level 10 unprompted.
- **Pivot signal:** median session under 5 min, with drop-off in levels 2–5.

## Out of scope

- Ads, purchases, accounts, cloud save, leaderboards.
- Perk trees beyond 2 perks per path.
- Lives, currencies, shop, dailies, meta map, relic codex.
- Endless mode, level editor, story, music, languages other than English, the native mobile build.
- Tetromino stamps (removed in v2), falling rigid pieces.
