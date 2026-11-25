// Core data model (v2: gem powers, relic boons, per-attempt randomness). Pure data: no Phaser, no DOM.
// Everything here must be JSON-serialisable.
// Coordinates: x = column (0 = left), y = row in the WHOLE level column (0 = top of level).
// The player sees rows [state.scroll, state.scroll + VISIBLE_ROWS).

/** Number of levels in the game (ids 1..LEVEL_COUNT). Also re-exported by generator.ts. */
export const LEVEL_COUNT = 20;

export const COLUMNS = 8;
export const VISIBLE_ROWS = 10;
/** Board scrolls while this many top visible rows hold no coloured blocks. */
export const SCROLL_TRIGGER_ROWS = 3;

/** Gem colours. Index is stable (used in saves and level data). */
export type GemColor = 0 | 1 | 2 | 3 | 4;
export const GEM_NAMES = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst'] as const;

export type Cell =
  | { kind: 'empty' }
  /** A gem. `geode: true` = sparkling geode gem: clearing it in a group grants a random Lv1 power. */
  | { kind: 'block'; color: GemColor; geode?: true }
  /** Fixed. hp 1..3. Becomes empty at 0. */
  | { kind: 'dirt'; hp: number }
  /** Fixed while crusted. A 2x2 relic occupies 4 cells with the same id; crust hp is stored on the relic, not the cell. */
  | { kind: 'relic'; id: number }
  /** Fixed stone slab of 2-4 orthogonally connected cells sharing `id`. Only gem powers break it (whole slab). */
  | { kind: 'bedrock'; id: number };

/** The 6 relic types; each grants an in-level boon. Index = relic art variant. */
export type BoonId = 'sun_coin' | 'chalice' | 'compass' | 'star_amulet' | 'ancient_key' | 'crowned_ring';
export const BOON_IDS: readonly BoonId[] = Object.freeze([
  'sun_coin',
  'chalice',
  'compass',
  'star_amulet',
  'ancient_key',
  'crowned_ring',
] as BoonId[]);

export interface Relic {
  id: number;
  /** Top-left cell. */
  x: number;
  y: number;
  size: 1 | 2;
  crust: number;
  collected: boolean;
  /** Relic art variant = index into BOON_IDS. Rolled per attempt unless the level pins it. */
  variant: number;
  /** The boon this relic grants (BOON_IDS[variant]). */
  boon: BoonId;
  /** Bonus relic (placed per attempt, never required, may scroll away). Goal relics are false. */
  bonus: boolean;
}

/** Gem power kinds, one per gem colour (index = GemColor). */
export type PowerKind = 'wildfire' | 'tidal' | 'earthshaker' | 'lightning' | 'drill';
export const POWER_KINDS: readonly PowerKind[] = Object.freeze([
  'wildfire',
  'tidal',
  'earthshaker',
  'lightning',
  'drill',
] as PowerKind[]);

export type PowerLevel = 1 | 2 | 3 | 4 | 5;

export interface Power {
  color: GemColor;
  level: PowerLevel;
  /** Charge order (lower = older); used for "replace the oldest" ties. Kept on merge. */
  seq: number;
}

export type PathId = 'jeweler' | 'archaeologist' | 'alchemist' | 'blacksmith';
export type PerkId =
  | 'jeweler_brilliant' // Brilliant Cut: a clear of 10+ gives +1 move
  | 'jeweler_flawless' // Flawless: powers charged from 12+ groups get +1 level
  | 'arch_softcrust' // Soft Brush: crusts have 1 HP
  | 'arch_treasure' // Treasure Sense: +1 bonus relic, outlines 5 rows below the board
  | 'alch_transmute' // Transmutation: once per level, recolour a group to a neighbour's colour (1 move)
  | 'alch_volatile' // Volatile Mix: using a power has a 25% chance to leave a random Lv1 power
  | 'smith_toolbelt' // Tool Belt: tray holds 4
  | 'smith_tempered'; // Tempered: powers trigger 1 level stronger (cap 5)

/** Effective rule values after perks are applied. Built by `rulesFor(perks)`. */
export interface Rules {
  /** Smallest group that charges a power, before Crowned Ring boons. Default 6. */
  powerThreshold: number;
  trayCapacity: number; // default 3
  crustHp: number; // default 2
  revealRows: number; // default 2
  /** Extra bonus relics per attempt (Treasure Sense). */
  bonusRelics: number;
  brilliantMoveAt: number | null; // jeweler_brilliant: 10
  flawlessAt: number | null; // jeweler_flawless: 12
  transmutesPerLevel: number; // alch_transmute: 1
  volatileChance: number; // alch_volatile: 0.25
  temperedBonus: number; // smith_tempered: 1
}

/** In-level tutorial steps the view scripts for a level (core ignores them). */
export type TutorialId = 'tap' | 'dirt' | 'charge' | 'use' | 'bedrock';

/**
 * A level as authored or generated: the fixed STRUCTURE. Immutable input to `createLevelState`, which adds
 * the per-attempt randomness (gem colours, geodes, bonus relics, relic types).
 */
export interface LevelDef {
  id: number; // 1-based level number
  seed: number;
  colors: number; // 4 or 5
  moves: number | null; // null = unlimited (level 1)
  hard: boolean;
  /** Boss level: the climax of a 5-level stretch (5, 10, 15, 20). Many bonus relics and more geodes. */
  boss: boolean;
  /**
   * Row-major, height = rows.length, each row COLUMNS long. Block colours here are placeholders: every block
   * is re-coloured per attempt except the `pinned` cells.
   */
  rows: Cell[][];
  /** Goal relics. The goal (relics needed to win) is `relics.length`. `variant` pins the relic type. */
  relics: { id: number; x: number; y: number; size: 1 | 2; variant?: number }[];
  /** 0..1: chance a re-rolled gem copies its left or upper neighbour's colour (the level's clustering). */
  cluster: number;
  /** Bonus relics per attempt, inclusive range (before Treasure Sense). */
  bonusRelics: readonly [min: number, max: number];
  /** Chance per re-rolled gem to be a geode. */
  geodeRate: number;
  /** Cells whose authored gem colour is kept on every attempt (scripted tutorial groups). */
  pinned: Pos[];
  /** Free powers in the tray at the start (bedrock that seals a goal relic requires at least one). */
  startPowers: { color: GemColor; level: PowerLevel }[];
  /** Optional tutorial steps used by the view. */
  tutorial?: TutorialId[];
}

/** Per-attempt counters, for the level result, telemetry and the bot. */
export interface AttemptStats {
  groups: number;
  biggestGroup: number;
  powersCharged: number;
  powersUsed: number;
  geodes: number;
  bonusCollected: number;
  /** Reforge tokens earned in this attempt (the client adds them to Progress, clamped to 9). */
  reforgeTokens: number;
  /** The one 40% roll for the first 20+ group of the attempt has happened. */
  bigGroupRolled: boolean;
  /** The guaranteed token for 3+ bonus relics was given. */
  bonusTokenGiven: boolean;
  rescues: number;
  shuffles: number;
}

export interface LevelState {
  def: LevelDef;
  /** The attempt seed this state was created with (client-supplied, e.g. from the clock). */
  attemptSeed: number;
  grid: Cell[][]; // full column, mutable copy of def.rows plus the attempt's randomness
  /** Goal relics first (ids 0..goal-1), then this attempt's bonus relics. */
  relics: Relic[];
  /** Relics needed to win (= def.relics.length). Any relic, bonus included, counts towards it. */
  goal: number;
  collected: number;
  scroll: number; // index of top visible row
  movesLeft: number | null;
  movesUsed: number;
  tray: Power[];
  /** Tray index of the armed power, or null. */
  armed: number | null;
  /** Next Power.seq. */
  powerSeq: number;
  /** Boon stacks collected this attempt. */
  boons: Record<BoonId, number>;
  transmutesLeft: number;
  continueUsed: boolean;
  status: 'playing' | 'won' | 'lost';
  rngState: number; // all in-level randomness; advancing it keeps replays deterministic
  maxDepth: number; // deepest scroll reached
  rules: Rules;
  stats: AttemptStats;
}

export interface Pos {
  x: number;
  y: number;
}

/** Pattern data for a triggered power, so the view can animate each one distinctly. */
export type PowerEffect =
  /** `group` = the tapped group (cleared; [] if the tap was not on a gem). `burnt` in spread order. */
  | { power: 'wildfire'; group: Pos[]; burnt: { at: Pos; step: number }[] }
  /** Rows and columns swept (visible ones only). */
  | { power: 'tidal'; rows: number[]; cols: number[] }
  /**
   * `origin` = the tapped group (or the tapped cell); `area` = the certain shaken square (Chebyshev radius);
   * `fissures` = random cracks from the tapped cell, each its cells outside `area` in travel order.
   */
  | { power: 'earthshaker'; origin: Pos[]; radius: number; area: Pos[]; fissures: Pos[][] }
  /** Strikes in order (the tapped gem first, if the tap was on a gem). */
  | { power: 'lightning'; strikes: Pos[] }
  /** `path` top-down, column by column order within a row (3 wide at Lv5). */
  | { power: 'drill'; cols: number[]; from: number; to: number; path: Pos[]; blast: Pos[] };

export type PowerSource = 'group' | 'geode' | 'boon' | 'volatile' | 'rescue';
export type ReforgeReason = 'big_group' | 'bonus_relics' | 'three_stars';

/** Events emitted by an action, in order. The view animates them; core never waits on them. */
export type CoreEvent =
  /** A group clear by a tap (not by a power). `geodes` = geode cells in the group. */
  | { type: 'cleared'; cells: Pos[]; color: GemColor; size: number; geodes?: Pos[] }
  /**
   * An armed power fired at `at`. `level` is the effective level (after Tempered). `cells` = every cell the
   * power touched, in animation order; `destroyed` = the gems it removed, in animation order. Damage,
   * shatter, crust and collection events follow it.
   */
  | {
      type: 'powerTriggered';
      trayIndex: number;
      color: GemColor;
      power: PowerKind;
      level: PowerLevel;
      at: Pos;
      effect: PowerEffect;
      cells: Pos[];
      destroyed: { at: Pos; color: GemColor }[];
    }
  | { type: 'dirtDamaged'; at: Pos; hp: number } // hp after damage; 0 = destroyed
  | { type: 'bedrockShattered'; id: number; cells: Pos[] }
  | { type: 'crustChipped'; relicId: number; crust: number }
  | { type: 'relicCollected'; relicId: number; boon: BoonId; bonus: boolean; collected: number; goal: number }
  /** A boon took effect; `stacks` = stacks of that boon after this one. */
  | { type: 'boonGained'; boon: BoonId; stacks: number; relicId: number }
  | { type: 'fell'; moves: { from: Pos; to: Pos }[] }
  | { type: 'scrolled'; rows: number; scroll: number }
  /**
   * A power entered the tray. `index` = its slot. `merged` = it stacked onto a same-colour power in that slot.
   * `replaced` = the tray was full and this power took the slot of the listed one.
   */
  | {
      type: 'powerCharged';
      color: GemColor;
      level: PowerLevel;
      index: number;
      merged: boolean;
      source: PowerSource;
      replaced?: { color: GemColor; level: PowerLevel };
    }
  /** The tray was full of higher-level powers, so this new power was not kept. */
  | { type: 'powerSkipped'; color: GemColor; level: PowerLevel; source: PowerSource }
  | { type: 'powerArmed'; index: number; color: GemColor; level: PowerLevel }
  | { type: 'powerDisarmed'; index: number }
  | { type: 'geodeCleared'; at: Pos; color: GemColor }
  | { type: 'bonusMove'; amount: number; source: 'brilliant' | 'sun_coin' | 'continue' }
  | { type: 'recoloured'; cells: Pos[]; color: GemColor }
  | { type: 'shuffled'; cells: { at: Pos; color: GemColor }[] }
  | { type: 'reforgeTokenEarned'; reason: ReforgeReason }
  | { type: 'won'; stars: 1 | 2 | 3 }
  | { type: 'lost' };

export type ActionResult =
  | { ok: true; events: CoreEvent[] }
  | {
      ok: false;
      reason:
        | 'not_playing'
        | 'not_a_group'
        | 'out_of_view'
        | 'no_power'
        | 'power_armed'
        | 'no_transmute'
        | 'no_target'
        | 'continue_used'
        | 'no_moves';
    };

/** Persistent player progress (saved via SaveStore). v2: perk points, respec tokens. */
export interface Progress {
  version: 2;
  /** stars per level id (0 = not cleared). */
  stars: Record<number, 0 | 1 | 2 | 3>;
  /** highest unlocked level id. */
  unlocked: number;
  perks: PerkId[];
  /** Unspent perk points. */
  perkPoints: number;
  /** Levels (from PERK_POINT_AFTER) whose perk point was already granted. */
  perkPointsGranted: number[];
  /** Reforge (respec) tokens held, 0..MAX_REFORGE_TOKENS. */
  reforgeTokens: number;
  /** In-play tutorial steps the player has already completed (view-level ids). */
  tutorialsSeen: string[];
  settings: { sound: boolean };
}
