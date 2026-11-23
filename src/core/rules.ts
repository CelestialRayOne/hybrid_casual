// Perks (v2) and the effective rule values they produce. Perk names are original to this game.
import { Rng } from './rng';
import type { PathId, PerkId, Rules } from './types';

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  powerThreshold: 6,
  trayCapacity: 3,
  crustHp: 2,
  revealRows: 2,
  bonusRelics: 0,
  brilliantMoveAt: null,
  flawlessAt: null,
  transmutesPerLevel: 0,
  volatileChance: 0,
  temperedBonus: 0,
});

/** Moves granted by the one free continue per level. */
export const CONTINUE_MOVES = 5;

/** Level ids after which the player earns a perk point (5 in total). */
export const PERK_POINT_AFTER: readonly number[] = Object.freeze([3, 7, 11, 15, 19]);

/** The most reforge tokens a player can hold. */
export const MAX_REFORGE_TOKENS = 9;

export interface PerkInfo {
  path: PathId;
  name: string;
  description: string;
}

export const PATHS: Readonly<Record<PathId, { name: string }>> = Object.freeze({
  jeweler: { name: 'Jeweler' },
  archaeologist: { name: 'Archaeologist' },
  alchemist: { name: 'Alchemist' },
  blacksmith: { name: 'Blacksmith' },
});

/** Stable display order (path by path); also the order perk offers draw from. */
export const PERK_IDS: readonly PerkId[] = Object.freeze([
  'jeweler_brilliant',
  'jeweler_flawless',
  'arch_softcrust',
  'arch_treasure',
  'alch_transmute',
  'alch_volatile',
  'smith_toolbelt',
  'smith_tempered',
] as PerkId[]);

export const PERKS: Readonly<Record<PerkId, PerkInfo>> = Object.freeze({
  jeweler_brilliant: { path: 'jeweler', name: 'Brilliant Cut', description: 'Clearing 10 or more gems at once gives +1 move.' },
  jeweler_flawless: { path: 'jeweler', name: 'Flawless', description: 'Powers charged from groups of 12 or more get +1 level.' },
  arch_softcrust: { path: 'archaeologist', name: 'Soft Brush', description: 'Relic crusts have 1 HP.' },
  arch_treasure: {
    path: 'archaeologist',
    name: 'Treasure Sense',
    description: '+1 bonus relic in every level, and relic outlines show 5 rows below the board.',
  },
  alch_transmute: {
    path: 'alchemist',
    name: 'Transmutation',
    description: "Once per level, long-press a group to match a neighbour's colour (1 move).",
  },
  alch_volatile: {
    path: 'alchemist',
    name: 'Volatile Mix',
    description: 'Using a power has a 25% chance to leave a random level 1 power behind.',
  },
  smith_toolbelt: { path: 'blacksmith', name: 'Tool Belt', description: 'The power tray holds 4.' },
  smith_tempered: { path: 'blacksmith', name: 'Tempered', description: 'Powers trigger 1 level stronger (up to 5).' },
});

/** True for a string that is a current PerkId. */
export function isPerkId(v: unknown): v is PerkId {
  return typeof v === 'string' && (PERK_IDS as readonly string[]).includes(v);
}

/** Effective rule values for a set of owned perks. Pass `[]` to disable perks (debug flag). */
export function rulesFor(perks: readonly PerkId[]): Rules {
  const owned = new Set(perks);
  const rules: Rules = { ...DEFAULT_RULES };
  if (owned.has('jeweler_brilliant')) rules.brilliantMoveAt = 10;
  if (owned.has('jeweler_flawless')) rules.flawlessAt = 12;
  if (owned.has('arch_softcrust')) rules.crustHp = 1;
  if (owned.has('arch_treasure')) {
    rules.revealRows = 5;
    rules.bonusRelics = 1;
  }
  if (owned.has('alch_transmute')) rules.transmutesPerLevel = 1;
  if (owned.has('alch_volatile')) rules.volatileChance = 0.25;
  if (owned.has('smith_toolbelt')) rules.trayCapacity = 4;
  if (owned.has('smith_tempered')) rules.temperedBonus = 1;
  return rules;
}

/**
 * Up to 3 perks the player does not own yet, in a deterministic order for `seed`.
 * Fewer than 3 are returned only when fewer remain.
 */
export function offerPerks(owned: readonly PerkId[], seed: number): PerkId[] {
  const have = new Set(owned);
  const pool = PERK_IDS.filter((p) => !have.has(p));
  new Rng(seed).shuffle(pool);
  return pool.slice(0, 3);
}
