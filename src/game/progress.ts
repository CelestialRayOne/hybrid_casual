// Pure progress rules for the view: stars, unlocks, perk offers and tutorials (saved through SaveStore by the
// caller). The perk-point / reforge economy itself lives in core (src/core/progress.ts).
import { LEVEL_COUNT, addReforgeTokens, grantPerkPoint, offerPerks } from '../core';
import type { PerkId, Progress } from '../core';

/** The level a returning player lands in: the highest unlocked one. */
export function currentLevel(p: Progress): number {
  return Math.max(1, Math.min(LEVEL_COUNT, p.unlocked));
}

export function isUnlocked(p: Progress, level: number): boolean {
  return level >= 1 && level <= Math.min(LEVEL_COUNT, p.unlocked);
}

export function starsFor(p: Progress, level: number): 0 | 1 | 2 | 3 {
  return p.stars[level] ?? 0;
}

export function totalStars(p: Progress): number {
  let n = 0;
  for (let l = 1; l <= LEVEL_COUNT; l++) n += starsFor(p, l);
  return n;
}

/** True once every level has been won at least once. */
export function allLevelsDone(p: Progress): boolean {
  return starsFor(p, LEVEL_COUNT) > 0;
}

/**
 * Records a win: keeps the best stars, unlocks the next level and grants the level's perk point (once, on the
 * PERK_POINT_AFTER levels). Returns a new object. `pointEarned` tells the caller to offer a perk.
 */
export function applyWin(p: Progress, level: number, stars: 1 | 2 | 3): Progress {
  const best = Math.max(starsFor(p, level), stars) as 1 | 2 | 3;
  const won: Progress = {
    ...p,
    stars: { ...p.stars, [level]: best },
    unlocked: Math.max(p.unlocked, Math.min(LEVEL_COUNT, level + 1)),
  };
  return grantPerkPoint(won, level);
}

/** True if `after` holds a perk point for `level` that `before` did not (the win just earned it). */
export function pointEarned(before: Progress, after: Progress, level: number): boolean {
  return after.perkPointsGranted.includes(level) && !before.perkPointsGranted.includes(level);
}

/** Adds reforge tokens earned in a level (clamped by core). */
export function applyTokens(p: Progress, n: number): Progress {
  return n > 0 ? addReforgeTokens(p, n) : p;
}

/** Deterministic perk offer (up to 3 unowned perks) for a point earned after `level`. */
export function perkOffer(p: Progress, level: number): PerkId[] {
  return offerPerks(p.perks, level * 7919 + p.perks.length * 31 + p.perkPoints);
}

/** The level after `level`, or null after the last one. */
export function nextLevelAfter(level: number): number | null {
  return level < LEVEL_COUNT ? level + 1 : null;
}

/** True once the player has completed the in-play tutorial step `id`. */
export function tutorialSeen(p: Progress, id: string): boolean {
  return p.tutorialsSeen.includes(id);
}

export function markTutorialSeen(p: Progress, id: string): Progress {
  return tutorialSeen(p, id) ? p : { ...p, tutorialsSeen: [...p.tutorialsSeen, id] };
}

/** Sorted perk list equality (to detect a perk change made on the perks screen). */
export function samePerks(a: readonly PerkId[], b: readonly PerkId[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
