// Pure Progress helpers for the v2 perk economy: perk points, spending, reforge (respec) tokens.
// Every function returns a NEW Progress (or the same object when nothing changes); inputs are never mutated.
// Saving is the caller's job (SaveStore).
import { MAX_REFORGE_TOKENS, PERK_IDS, PERK_POINT_AFTER } from './rules';
import type { PerkId, Progress } from './types';

export const PROGRESS_VERSION = 2 as const;

export function defaultProgress(): Progress {
  return {
    version: PROGRESS_VERSION,
    stars: {},
    unlocked: 1,
    perks: [],
    perkPoints: 0,
    perkPointsGranted: [],
    reforgeTokens: 0,
    tutorialsSeen: [],
    settings: { sound: true },
  };
}

/** Point levels that were won (stars > 0) but whose point was not granted yet, ascending. */
export function pendingPerkPoints(p: Progress): number[] {
  return PERK_POINT_AFTER.filter((l) => (p.stars[l] ?? 0) > 0 && !p.perkPointsGranted.includes(l));
}

/** True if winning `level` grants a perk point that has not been granted yet. */
export function perkPointDue(p: Progress, level: number): boolean {
  return PERK_POINT_AFTER.includes(level) && !p.perkPointsGranted.includes(level);
}

/** Grants the perk point for `level` (once; only point levels). Unchanged if not due. */
export function grantPerkPoint(p: Progress, level: number): Progress {
  if (!perkPointDue(p, level)) return p;
  return {
    ...p,
    perkPoints: p.perkPoints + 1,
    perkPointsGranted: [...p.perkPointsGranted, level].sort((a, b) => a - b),
  };
}

/** Grants every pending point (e.g. on load, after a page closed on the win card). */
export function grantPendingPerkPoints(p: Progress): Progress {
  return pendingPerkPoints(p).reduce(grantPerkPoint, p);
}

/** The next level that grants a point (not granted yet), or null when all were granted. */
export function nextPerkPointLevel(p: Progress): number | null {
  return PERK_POINT_AFTER.find((l) => !p.perkPointsGranted.includes(l)) ?? null;
}

export function canSpendPerkPoint(p: Progress, perk: PerkId): boolean {
  return p.perkPoints > 0 && !p.perks.includes(perk) && PERK_IDS.includes(perk);
}

/** Spends one point on `perk`. Unchanged if no point is left or the perk is owned. */
export function spendPerkPoint(p: Progress, perk: PerkId): Progress {
  if (!canSpendPerkPoint(p, perk)) return p;
  return { ...p, perks: [...p.perks, perk], perkPoints: p.perkPoints - 1 };
}

/** owned / available (a point to spend) / locked (no point). */
export function perkStatus(p: Progress, perk: PerkId): 'owned' | 'available' | 'locked' {
  if (p.perks.includes(perk)) return 'owned';
  return p.perkPoints > 0 ? 'available' : 'locked';
}

export function canReforge(p: Progress): boolean {
  return p.reforgeTokens > 0 && p.perks.length > 0;
}

/** Spends 1 reforge token and refunds ALL owned perks as unspent points. Unchanged if not possible. */
export function reforge(p: Progress): Progress {
  if (!canReforge(p)) return p;
  return { ...p, perks: [], perkPoints: p.perkPoints + p.perks.length, reforgeTokens: p.reforgeTokens - 1 };
}

/** Adds reforge tokens (e.g. from a level result), clamped to 0..MAX_REFORGE_TOKENS. */
export function addReforgeTokens(p: Progress, n: number): Progress {
  const next = Math.max(0, Math.min(MAX_REFORGE_TOKENS, p.reforgeTokens + Math.floor(n)));
  return next === p.reforgeTokens ? p : { ...p, reforgeTokens: next };
}
