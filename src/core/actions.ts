// Player actions. Each mutates `state` in place and returns the ordered events for the view.
// Resolution order: docs/architecture.md, "Resolution order inside one action".
import { EMPTY, NEIGHBOURS, blockColor, cellAt, findGroup, isVisible, setCell } from './board';
import { chipRelics, damageDirt, drawFloat, groupRewards, key, payGeode, unkey } from './effects';
import { runPower } from './powers';
import { finishAction, stars } from './resolve';
import { CONTINUE_MOVES } from './rules';
import { resolveDeadBoard } from './shuffle';
import { chargeRandomPower, clampLevel } from './tray';
import type { ActionResult, CoreEvent, GemColor, LevelState, Pos } from './types';

export { stars };

type Fail = Extract<ActionResult, { ok: false }>;
const fail = (reason: Fail['reason']): Fail => ({ ok: false, reason });

/**
 * Tap a visible cell.
 * - With a power armed: triggers it at `at` (any visible cell: gem, dirt, relic, bedrock or empty).
 *   Costs 1 move, or nothing when 0 moves are left (the last-chance rule: a held power keeps the level
 *   alive, so it must stay usable).
 * - Otherwise: clears the gem group at `at` if it has 2+ gems. Costs 1 move.
 */
export function tap(state: LevelState, at: Pos): ActionResult {
  if (state.status !== 'playing') return fail('not_playing');
  if (!isVisible(state, at.x, at.y)) return fail('out_of_view');
  if (state.armed !== null) return triggerArmed(state, at);
  const group = findGroup(state, at);
  if (group.length < 2) return fail('not_a_group');
  if (state.movesLeft === 0) return fail('no_moves');
  const color = blockColor(state, at.x, at.y) as GemColor;
  const events: CoreEvent[] = [];
  const geodes = group.filter((p) => {
    const c = cellAt(state, p.x, p.y);
    return c?.kind === 'block' && c.geode === true;
  });

  // 1. Remove.
  const cleared = new Set(group.map((p) => key(p.x, p.y)));
  for (const p of group) setCell(state, p.x, p.y, EMPTY());
  const ev: CoreEvent = { type: 'cleared', cells: group.map((p) => ({ ...p })), color, size: group.length };
  if (geodes.length) ev.geodes = geodes.map((p) => ({ ...p }));
  events.push(ev);

  // 2. Adjacency damage, at most once per target per clear. Targets must be visible. Bedrock is unaffected.
  const dirt = new Set<number>();
  const relics = new Set<number>();
  for (const p of group) {
    for (const d of NEIGHBOURS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      if (!isVisible(state, nx, ny) || cleared.has(key(nx, ny))) continue;
      const c = cellAt(state, nx, ny);
      if (c?.kind === 'dirt') dirt.add(key(nx, ny));
      else if (c?.kind === 'relic') relics.add(c.id);
    }
  }
  damageDirt(state, dirt, 1 + state.boons.compass, events);
  chipRelics(state, relics, 1, events);

  // 3. Rewards: Brilliant Cut, power charge, geodes, token roll.
  groupRewards(state, group, color, geodes, events);

  finishAction(state, events, 1);
  return { ok: true, events };
}

function triggerArmed(state: LevelState, at: Pos): ActionResult {
  const index = state.armed as number;
  const power = state.tray[index];
  if (!power) {
    state.armed = null;
    return fail('no_power');
  }
  const free = state.movesLeft === 0;
  const events: CoreEvent[] = [];
  state.tray.splice(index, 1);
  state.armed = null;
  const level = clampLevel(power.level + state.rules.temperedBonus);
  const out = runPower(state, power.color, level, at, index, events);
  state.stats.powersUsed++;
  const groupPaid = out.group.length >= 2 && out.groupColor !== null;
  if (groupPaid) groupRewards(state, out.group, out.groupColor!, out.groupGeodes, events);
  // Geodes the power destroyed pay out too (Wildfire's group geodes were already paid above).
  for (const d of out.destroyed) {
    if (!d.geode) continue;
    if (groupPaid && out.groupGeodes.some((g) => g.x === d.at.x && g.y === d.at.y)) continue;
    payGeode(state, d.at, d.color, events);
  }
  if (state.rules.volatileChance > 0 && drawFloat(state) < state.rules.volatileChance) {
    chargeRandomPower(state, 1, 'volatile', events);
  }
  finishAction(state, events, free ? 0 : 1);
  return { ok: true, events };
}

/**
 * Arms the power in tray slot `trayIndex` (the next board tap triggers it). Arming the armed slot again
 * disarms it (toggle); arming another slot moves the arm. Free, no board change.
 */
export function armPower(state: LevelState, trayIndex: number): ActionResult {
  if (state.status !== 'playing') return fail('not_playing');
  const p = state.tray[trayIndex];
  if (!p) return fail('no_power');
  const events: CoreEvent[] = [];
  if (state.armed === trayIndex) {
    state.armed = null;
    events.push({ type: 'powerDisarmed', index: trayIndex });
    return { ok: true, events };
  }
  if (state.armed !== null) events.push({ type: 'powerDisarmed', index: state.armed });
  state.armed = trayIndex;
  events.push({ type: 'powerArmed', index: trayIndex, color: p.color, level: p.level });
  return { ok: true, events };
}

/** Disarms the armed power, if any. */
export function disarmPower(state: LevelState): ActionResult {
  if (state.armed === null) return { ok: true, events: [] };
  const index = state.armed;
  state.armed = null;
  return { ok: true, events: [{ type: 'powerDisarmed', index }] };
}

/**
 * Alchemist perk: recolour the group at `at` (any visible block, a single block counts) to the
 * colour of an adjacent different-coloured block, choosing the colour that creates the largest
 * merged group (ties: lowest colour index). Costs 1 move; limited by `transmutesLeft`.
 * Refused while a power is armed. Geode flags stay.
 */
export function transmute(state: LevelState, at: Pos): ActionResult {
  if (state.status !== 'playing') return fail('not_playing');
  if (state.armed !== null) return fail('power_armed');
  if (!isVisible(state, at.x, at.y)) return fail('out_of_view');
  if (state.transmutesLeft <= 0) return fail('no_transmute');
  const group = findGroup(state, at);
  if (group.length === 0) return fail('not_a_group');
  if (state.movesLeft === 0) return fail('no_moves');
  const own = blockColor(state, at.x, at.y) as GemColor;
  const inGroup = new Set(group.map((p) => key(p.x, p.y)));

  // Merged size per candidate colour = group + every distinct adjacent group of that colour.
  const merged = new Map<GemColor, number>();
  const counted = new Set<number>();
  for (const p of group) {
    for (const d of NEIGHBOURS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      const c = isVisible(state, nx, ny) ? blockColor(state, nx, ny) : null;
      if (c === null || c === own || counted.has(key(nx, ny))) continue;
      const other = findGroup(state, { x: nx, y: ny });
      for (const q of other) counted.add(key(q.x, q.y));
      merged.set(c, (merged.get(c) ?? group.length) + other.length);
    }
  }
  if (merged.size === 0) return fail('no_target');
  let best: GemColor | null = null;
  for (const [c, n] of [...merged.entries()].sort((a, b) => a[0] - b[0])) {
    if (best === null || n > (merged.get(best) ?? 0)) best = c;
  }
  const color = best as GemColor;
  for (const k of inGroup) {
    const p = unkey(k);
    const old = cellAt(state, p.x, p.y);
    setCell(state, p.x, p.y, old?.kind === 'block' && old.geode ? { kind: 'block', color, geode: true } : { kind: 'block', color });
  }
  state.transmutesLeft -= 1;
  const events: CoreEvent[] = [{ type: 'recoloured', cells: group.map((p) => ({ ...p })), color }];
  finishAction(state, events, 1);
  return { ok: true, events };
}

/** The one free continue per level: +5 moves, lost -> playing. */
export function useContinue(state: LevelState): ActionResult {
  if (state.status !== 'lost' || state.movesLeft === null) return fail('not_playing');
  if (state.continueUsed) return fail('continue_used');
  state.continueUsed = true;
  state.status = 'playing';
  state.movesLeft += CONTINUE_MOVES;
  const events: CoreEvent[] = [{ type: 'bonusMove', amount: CONTINUE_MOVES, source: 'continue' }];
  resolveDeadBoard(state, events);
  return { ok: true, events };
}

export interface LevelResult {
  status: LevelState['status'];
  stars: 1 | 2 | 3 | null;
  collected: number;
  goal: number;
  bonusCollected: number;
  /** Reforge tokens earned in this attempt (add to Progress, clamped to 9). */
  reforgeTokens: number;
  powersUsed: number;
  powersCharged: number;
  movesUsed: number;
}

/** Summary of an attempt for the level-end screen and Progress bookkeeping. */
export function levelResult(state: LevelState): LevelResult {
  return {
    status: state.status,
    stars: state.status === 'won' ? stars(state) : null,
    collected: state.collected,
    goal: state.goal,
    bonusCollected: state.stats.bonusCollected,
    reforgeTokens: state.stats.reforgeTokens,
    powersUsed: state.stats.powersUsed,
    powersCharged: state.stats.powersCharged,
    movesUsed: state.movesUsed,
  };
}
