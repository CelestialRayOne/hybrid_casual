// The power tray: charging, merging and replacing powers (docs/spec.md, "Gem powers (v2)").
import { drawInt } from './board';
import type { CoreEvent, GemColor, LevelState, PowerLevel, PowerSource } from './types';

export const MAX_POWER_LEVEL = 5;
/** Crowned Ring can lower the charge threshold to this, never below. */
export const MIN_POWER_THRESHOLD = 4;
/** Group sizes per power level band (6-8, 9-11, ...). */
export const POWER_BAND = 3;

export const clampLevel = (n: number): PowerLevel => Math.max(1, Math.min(MAX_POWER_LEVEL, Math.floor(n))) as PowerLevel;

/** Effective charge threshold: the perk-adjusted base minus 1 per Crowned Ring stack, at least 4. */
export function powerThreshold(state: LevelState): number {
  return Math.max(MIN_POWER_THRESHOLD, state.rules.powerThreshold - state.boons.crowned_ring);
}

/**
 * Level a group of `size` charges, or null below the threshold T. Bands start at T and are 3 wide
 * (T..T+2 -> 1, T+3..T+5 -> 2, ... capped at 5): with T = 6 that is the spec table 6-8/9-11/12-14/15-17/18+,
 * and a lowered threshold shifts every band down by the same amount. Then +1 per Chalice stack and +1 for
 * Flawless when the raw group size is >= 12, capped at 5.
 */
export function chargeLevel(state: LevelState, size: number): PowerLevel | null {
  const t = powerThreshold(state);
  if (size < t) return null;
  let level = 1 + Math.floor((size - t) / POWER_BAND);
  level += state.boons.chalice;
  if (state.rules.flawlessAt !== null && size >= state.rules.flawlessAt) level += 1;
  return clampLevel(level);
}

/**
 * Puts a power into the tray and emits `powerCharged`:
 * - a power of the same colour already in the tray absorbs it: level = max(old, new) + 1, capped at 5;
 * - otherwise it takes a free slot (appended);
 * - otherwise (tray full) it replaces the lowest-level power; ties go to the oldest (lowest seq). The new
 *   power takes that slot index. If even that power has a higher level than the new one, the new power is
 *   skipped instead (`powerSkipped`): a full tray never loses a stronger power (owner playtest 2026-11-23).
 * Never called while a power is armed (charging only happens inside actions, after the armed power fired).
 */
export function chargePower(
  state: LevelState,
  color: GemColor,
  level: PowerLevel,
  source: PowerSource,
  events: CoreEvent[],
): void {
  const same = state.tray.findIndex((p) => p.color === color);
  if (same >= 0) {
    const p = state.tray[same]!;
    p.level = clampLevel(Math.max(p.level, level) + 1);
    events.push({ type: 'powerCharged', color, level: p.level, index: same, merged: true, source });
  } else if (state.tray.length < state.rules.trayCapacity) {
    state.tray.push({ color, level, seq: state.powerSeq++ });
    events.push({ type: 'powerCharged', color, level, index: state.tray.length - 1, merged: false, source });
  } else {
    let idx = 0;
    state.tray.forEach((p, i) => {
      const best = state.tray[idx]!;
      if (p.level < best.level || (p.level === best.level && p.seq < best.seq)) idx = i;
    });
    const old = state.tray[idx]!;
    if (old.level > level) {
      events.push({ type: 'powerSkipped', color, level, source });
      return;
    }
    state.tray[idx] = { color, level, seq: state.powerSeq++ };
    events.push({
      type: 'powerCharged',
      color,
      level,
      index: idx,
      merged: false,
      source,
      replaced: { color: old.color, level: old.level },
    });
  }
  state.stats.powersCharged++;
}

/** A power of a random colour (any of the 5 powers, regardless of the level's gem colours). */
export function chargeRandomPower(state: LevelState, level: PowerLevel, source: PowerSource, events: CoreEvent[]): void {
  chargePower(state, drawInt(state, 5) as GemColor, level, source, events);
}
