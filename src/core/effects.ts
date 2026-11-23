// Shared consequences of clears and powers: dirt damage, crust chips, relic collection, boons, bedrock
// shatter and reforge-token rolls. Every function appends events in a deterministic order.
import { EMPTY, cellAt, clearRelicCells, isRelicGone, isRelicVisible, relicById, setCell } from './board';
import { nextRandom } from './rng';
import { chargeLevel, chargePower, chargeRandomPower, clampLevel } from './tray';
import { COLUMNS } from './types';
import type { BoonId, CoreEvent, GemColor, LevelState, Pos, Relic, ReforgeReason } from './types';

export const key = (x: number, y: number) => y * COLUMNS + x;
export const unkey = (k: number): Pos => ({ x: k % COLUMNS, y: Math.floor(k / COLUMNS) });

/** Moves granted per Sun Coin stack. */
export const SUN_COIN_MOVES = 2;
/** Reforge token chances (docs/spec.md, "Perk paths (v2)"). */
export const TOKEN_BIG_GROUP_SIZE = 20;
export const TOKEN_BIG_GROUP_CHANCE = 0.4;
export const TOKEN_THREE_STAR_CHANCE = 0.3;
export const TOKEN_BONUS_RELICS = 3;

/** Draws a float in [0, 1) from the state's rng. */
export function drawFloat(state: LevelState): number {
  const [v, s] = nextRandom(state.rngState);
  state.rngState = s;
  return v;
}

/** Deals `amount` damage to each dirt cell in `targets` (keys), row-major. */
export function damageDirt(state: LevelState, targets: Iterable<number>, amount: number, events: CoreEvent[]): void {
  for (const k of [...new Set(targets)].sort((a, b) => a - b)) {
    const p = unkey(k);
    const c = cellAt(state, p.x, p.y);
    if (!c || c.kind !== 'dirt') continue;
    const hp = Math.max(0, c.hp - amount);
    setCell(state, p.x, p.y, hp === 0 ? EMPTY() : { kind: 'dirt', hp });
    events.push({ type: 'dirtDamaged', at: p, hp });
  }
}

/** Crust chips are multiplied by 1 + Ancient Key stacks ("later chips count double", triple, ...). */
export function chipMultiplier(state: LevelState): number {
  return 1 + state.boons.ancient_key;
}

/** Chips each relic id once by `amount` x the Ancient Key multiplier, ascending id; collects at 0. */
export function chipRelics(state: LevelState, ids: Iterable<number>, amount: number, events: CoreEvent[]): void {
  const mult = chipMultiplier(state);
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const relic = relicById(state, id);
    if (!relic || relic.collected) continue;
    relic.crust = Math.max(0, relic.crust - amount * mult);
    events.push({ type: 'crustChipped', relicId: id, crust: relic.crust });
    if (relic.crust === 0) collectRelic(state, relic, events);
  }
}

/** Shatters whole bedrock slabs by id (ascending). */
export function shatterBedrock(state: LevelState, ids: Iterable<number>, events: CoreEvent[]): void {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const cells: Pos[] = [];
    state.grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c.kind === 'bedrock' && c.id === id) {
          setCell(state, x, y, EMPTY());
          cells.push({ x, y });
        }
      }),
    );
    if (cells.length) events.push({ type: 'bedrockShattered', id, cells });
  }
}

export function awardToken(state: LevelState, reason: ReforgeReason, events: CoreEvent[]): void {
  state.stats.reforgeTokens++;
  events.push({ type: 'reforgeTokenEarned', reason });
}

/**
 * Collects a relic: clears its cells, counts it, emits `relicCollected`, then applies its boon (which may
 * chain: an Ancient Key can collect more relics, each applying its own boon, depth first).
 */
export function collectRelic(state: LevelState, relic: Relic, events: CoreEvent[]): void {
  if (relic.collected) return;
  clearRelicCells(state, relic);
  state.collected++;
  if (relic.bonus) state.stats.bonusCollected++;
  events.push({
    type: 'relicCollected',
    relicId: relic.id,
    boon: relic.boon,
    bonus: relic.bonus,
    collected: state.collected,
    goal: state.goal,
  });
  if (relic.bonus && state.stats.bonusCollected >= TOKEN_BONUS_RELICS && !state.stats.bonusTokenGiven) {
    state.stats.bonusTokenGiven = true;
    awardToken(state, 'bonus_relics', events);
  }
  applyBoon(state, relic.boon, relic.id, events);
}

/** Applies one stack of a boon (docs/spec.md, "Relic boons (v2)"). */
export function applyBoon(state: LevelState, boon: BoonId, relicId: number, events: CoreEvent[]): void {
  const stacks = ++state.boons[boon];
  events.push({ type: 'boonGained', boon, stacks, relicId });
  switch (boon) {
    case 'sun_coin':
      if (state.movesLeft !== null) {
        state.movesLeft += SUN_COIN_MOVES;
        events.push({ type: 'bonusMove', amount: SUN_COIN_MOVES, source: 'sun_coin' });
      }
      break;
    case 'star_amulet':
      // Lv1 for the first stack, Lv2 for the second, Lv3 after that.
      chargeRandomPower(state, clampLevel(Math.min(3, stacks)), 'boon', events);
      break;
    case 'ancient_key': {
      // Remaining crusts lose 1 HP now (not multiplied). Visible relics may break and are collected (their
      // boons chain). Relics below the window keep at least 1 HP (no collection off-screen); relics that
      // scrolled away above the window are gone and untouched.
      for (const r of state.relics) {
        if (r.collected || isRelicGone(state, r)) continue;
        const visible = isRelicVisible(state, r);
        const crust = Math.max(visible ? 0 : 1, r.crust - 1);
        if (crust === r.crust) continue;
        r.crust = crust;
        events.push({ type: 'crustChipped', relicId: r.id, crust });
        if (crust === 0) collectRelic(state, r, events);
      }
      break;
    }
    // chalice, compass, crowned_ring: passive, read where they apply.
    default:
      break;
  }
}

/** The once-per-attempt 40% roll for the first group of 20+. */
export function bigGroupRoll(state: LevelState, size: number, events: CoreEvent[]): void {
  if (size < TOKEN_BIG_GROUP_SIZE || state.stats.bigGroupRolled) return;
  state.stats.bigGroupRolled = true;
  if (drawFloat(state) < TOKEN_BIG_GROUP_CHANCE) awardToken(state, 'big_group', events);
}

/** A geode gem was cleared (by a group or a power): it grants a random Lv1 power. */
export function payGeode(state: LevelState, at: Pos, color: GemColor, events: CoreEvent[]): void {
  state.stats.geodes++;
  events.push({ type: 'geodeCleared', at: { ...at }, color });
  chargeRandomPower(state, 1, 'geode', events);
}

/**
 * Rewards of a real group clear (a tap, or Wildfire's tapped group), in this order: Brilliant Cut move,
 * the power charge (threshold/bands in tray.ts), geodes (each grants a random Lv1 power), the 20+ token roll.
 */
export function groupRewards(state: LevelState, cells: Pos[], color: GemColor, geodes: Pos[], events: CoreEvent[]): void {
  const size = cells.length;
  state.stats.groups++;
  state.stats.biggestGroup = Math.max(state.stats.biggestGroup, size);
  if (state.rules.brilliantMoveAt !== null && size >= state.rules.brilliantMoveAt && state.movesLeft !== null) {
    state.movesLeft += 1;
    events.push({ type: 'bonusMove', amount: 1, source: 'brilliant' });
  }
  const level = chargeLevel(state, size);
  if (level !== null) chargePower(state, color, level, 'group', events);
  for (const g of geodes) payGeode(state, g, color, events);
  bigGroupRoll(state, size, events);
}
