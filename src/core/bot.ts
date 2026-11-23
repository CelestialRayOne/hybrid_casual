// Deterministic players used for solvability checks, tuning and hints.
//
// - The greedy bot simulates every visible group and a targeted set of power uses one action ahead and picks
//   the best-scoring result (ties: first candidate). It is meant to be competent, not optimal. The generator
//   uses it as the solvability check; the view can use `suggestAction` for hints.
// - The casual player model (CASUAL_PROFILE) stands in for a first-time human on calibration runs; see
//   "Casual player model" below and docs/architecture.md, "Difficulty calibration".
// A power use is two recorded actions: `arm` then `tap`.
import { armPower, stars, tap } from './actions';
import {
  NEIGHBOURS,
  blockColor,
  cellAt,
  cloneState,
  isRelicGone,
  isRelicVisible,
  isStuckGem,
  isVisible,
  listGroups,
  relicCells,
  relicNeighbours,
} from './board';
import { createLevelState } from './level';
import { Rng, hashSeed } from './rng';
import { powerThreshold } from './tray';
import { COLUMNS, SCROLL_TRIGGER_ROWS, VISIBLE_ROWS } from './types';
import type { ActionResult, CoreEvent, LevelDef, LevelState, PerkId, Pos, Relic } from './types';

export type BotAction = { type: 'tap'; at: Pos } | { type: 'arm'; trayIndex: number };

export interface BotOptions {
  /** Safety cap on decisions (default 400). */
  maxActions?: number;
}

export interface BotResult {
  won: boolean;
  status: LevelState['status'];
  movesUsed: number;
  /** Every action in order; replaying them on createLevelState(def, perks, attemptSeed) reproduces the game. */
  actions: BotAction[];
  powersCharged: number;
  powersUsed: number;
  rescues: number;
  shuffles: number;
  collected: number;
  bonusCollected: number;
  reforgeTokens: number;
  maxDepth: number;
  stars: 1 | 2 | 3 | null;
  final: LevelState;
}

// ---- Evaluation -------------------------------------------------------------------------------

const W = {
  win: 1e7,
  collected: 5000,
  chip: 600,
  /** Held power: base + per level (a power is worth roughly a crust chip or two). */
  power: 150,
  powerLevel: 120,
  move: 60,
  scroll: 40,
  blockAboveLine: 6,
  relicBlockNeighbour: 15,
  relicDirtHp: 25,
  relicBedrockNeighbour: 120,
  groupPotential: 2,
  topRowBlock: 4,
  topRowLoner: 30,
  ledgeLoner: 15,
  /** A simulated action that needed a rescue power was a dead end. */
  rescue: 500,
};

/** Heuristic value of a position (higher is better). */
export function evaluate(s: LevelState): number {
  if (s.status === 'won') return W.win;
  if (s.status === 'lost') return -W.win;
  let v = Math.min(s.collected, s.goal) * W.collected;
  let target: Relic | null = null;
  for (const r of s.relics) {
    if (r.collected || isRelicGone(s, r)) continue;
    v += (s.rules.crustHp - r.crust) * W.chip;
    if (!target || r.y < target.y) target = r;
    if (!isRelicVisible(s, r)) continue;
    for (const n of relicNeighbours(r)) {
      const c = cellAt(s, n.x, n.y);
      if (!c) continue;
      if (c.kind === 'block') v += W.relicBlockNeighbour;
      else if (c.kind === 'dirt') v -= W.relicDirtHp * c.hp;
      else if (c.kind === 'bedrock') v -= W.relicBedrockNeighbour;
    }
  }
  v += s.scroll * W.scroll;
  for (const p of s.tray) v += W.power + p.level * W.powerLevel;
  if (s.movesLeft !== null) v += s.movesLeft * W.move;
  if (target) {
    const line = Math.min(target.y - 3, s.grid.length);
    let above = 0;
    for (let y = s.scroll; y < line; y++) {
      const row = s.grid[y];
      if (row) for (const c of row) if (c.kind === 'block') above++;
    }
    v -= above * W.blockAboveLine;
  }
  for (const g of listGroups(s)) v += (g.length - 1) * W.groupPotential;
  const top = s.scroll + SCROLL_TRIGGER_ROWS;
  const bottom = Math.min(s.scroll + VISIBLE_ROWS, s.grid.length);
  for (let y = s.scroll; y < bottom; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const c = blockColor(s, x, y);
      if (c === null) continue;
      const lonely = NEIGHBOURS.every((d) => !isVisible(s, x + d.x, y + d.y) || blockColor(s, x + d.x, y + d.y) !== c);
      if (y < top && !isStuckGem(s, x, y)) v -= W.topRowBlock + (lonely ? W.topRowLoner : 0);
      if (lonely) {
        const under = cellAt(s, x, y + 1)?.kind;
        if (under === 'dirt' || under === 'bedrock') v -= W.ledgeLoner;
      }
    }
  }
  return v;
}

// ---- Candidates --------------------------------------------------------------------------------

function scoreAfter(sim: LevelState, res: ActionResult): number {
  if (!res.ok) return -Infinity;
  let v = evaluate(sim);
  if (res.events.some((e) => e.type === 'powerCharged' && e.source === 'rescue')) v -= W.rescue;
  return v;
}

/** True if a relic or a bedrock slab is in view (worth spending a power on). */
function powerWorthy(s: LevelState): boolean {
  if (s.relics.some((r) => !r.collected && isRelicVisible(s, r))) return true;
  const bottom = Math.min(s.scroll + VISIBLE_ROWS, s.grid.length);
  for (let y = s.scroll; y < bottom; y++) for (let x = 0; x < COLUMNS; x++) if (cellAt(s, x, y)?.kind === 'bedrock') return true;
  return false;
}

/**
 * Cells worth aiming a power at: visible relics, their neighbours and the 3 cells above them, every visible
 * bedrock cell, and the first cells of the largest groups (Wildfire/Earthshaker origins, digging). Deduped,
 * in a fixed order, at most `limit`.
 */
export function powerTargets(s: LevelState, limit = 24): Pos[] {
  const out: Pos[] = [];
  const seen = new Set<number>();
  const add = (p: Pos) => {
    const k = p.y * COLUMNS + p.x;
    if (seen.has(k) || !isVisible(s, p.x, p.y)) return;
    seen.add(k);
    out.push({ x: p.x, y: p.y });
  };
  for (const r of s.relics) {
    if (r.collected || !isRelicVisible(s, r)) continue;
    for (const c of relicCells(r)) add(c);
    for (const n of relicNeighbours(r)) add(n);
    for (let i = 0; i < r.size; i++) for (let d = 2; d <= 4; d++) add({ x: r.x + i, y: r.y - d });
  }
  const bottom = Math.min(s.scroll + VISIBLE_ROWS, s.grid.length);
  for (let y = s.scroll; y < bottom; y++) for (let x = 0; x < COLUMNS; x++) if (cellAt(s, x, y)?.kind === 'bedrock') add({ x, y });
  const groups = listGroups(s).sort((a, b) => b.length - a.length);
  for (const g of groups.slice(0, 4)) add(g[0] as Pos);
  // Top rows (digging towards the next relic).
  for (let x = 1; x < COLUMNS; x += 3) add({ x, y: s.scroll });
  return out.slice(0, limit);
}

/** Every visible cell (forced power use with no better idea). */
function allVisible(s: LevelState): Pos[] {
  const out: Pos[] = [];
  const bottom = Math.min(s.scroll + VISIBLE_ROWS, s.grid.length);
  for (let y = s.scroll; y < bottom; y++) for (let x = 0; x < COLUMNS; x++) out.push({ x, y });
  return out;
}

function simulatePower(s: LevelState, trayIndex: number, at: Pos): number {
  const sim = cloneState(s);
  sim.armed = null;
  if (!armPower(sim, trayIndex).ok) return -Infinity;
  return scoreAfter(sim, tap(sim, at));
}

interface PowerChoice {
  trayIndex: number;
  at: Pos;
  score: number;
}

function bestPower(s: LevelState, targets: Pos[]): PowerChoice | null {
  let best: PowerChoice | null = null;
  const tried = new Set<string>();
  s.tray.forEach((p, trayIndex) => {
    const k = `${p.color}:${p.level}`;
    if (tried.has(k)) return; // identical powers give identical results
    tried.add(k);
    for (const at of targets) {
      const score = simulatePower(s, trayIndex, at);
      if (!best || score > best.score) best = { trayIndex, at, score };
    }
  });
  return best;
}

export type Suggestion =
  | { type: 'tap'; at: Pos; score: number }
  | { type: 'power'; trayIndex: number; at: Pos; score: number };

/** The greedy bot's choice for this state, or null if it has nothing to do. Does not mutate `state`. */
export function suggestAction(state: LevelState): Suggestion | null {
  if (state.status !== 'playing') return null;
  const s = state.armed === null ? state : { ...cloneState(state), armed: null };
  const groups = s.movesLeft !== 0 ? listGroups(s) : [];
  let bestTap: Suggestion | null = null;
  for (const g of groups) {
    const at = g[0] as Pos;
    const sim = cloneState(s);
    const score = scoreAfter(sim, tap(sim, at));
    if (!bestTap || score > bestTap.score) bestTap = { type: 'tap', at, score };
  }
  if (s.tray.length > 0) {
    const forced = groups.length === 0;
    if (forced || powerWorthy(s) || s.tray.length >= s.rules.trayCapacity) {
      let targets = powerTargets(s);
      if (forced && targets.length < 8) targets = allVisible(s);
      const p = bestPower(s, targets);
      if (p && (forced || !bestTap || p.score > bestTap.score)) return { type: 'power', ...p };
    }
  }
  return bestTap;
}

// ---- Playing a level ---------------------------------------------------------------------------

function newResult(state: LevelState): BotResult {
  return {
    won: false,
    status: state.status,
    movesUsed: 0,
    actions: [],
    powersCharged: 0,
    powersUsed: 0,
    rescues: 0,
    shuffles: 0,
    collected: 0,
    bonusCollected: 0,
    reforgeTokens: 0,
    maxDepth: 0,
    stars: null,
    final: state,
  };
}

function finish(state: LevelState, r: BotResult): BotResult {
  r.won = state.status === 'won';
  r.status = state.status;
  r.movesUsed = state.movesUsed;
  r.maxDepth = state.maxDepth;
  r.stars = r.won ? stars(state) : null;
  r.powersCharged = state.stats.powersCharged;
  r.powersUsed = state.stats.powersUsed;
  r.rescues = state.stats.rescues;
  r.shuffles = state.stats.shuffles;
  r.collected = state.collected;
  r.bonusCollected = state.stats.bonusCollected;
  r.reforgeTokens = state.stats.reforgeTokens;
  return r;
}

/** Applies a power use (arm + tap) and records it. */
function usePower(state: LevelState, trayIndex: number, at: Pos, r: BotResult): boolean {
  if (state.armed !== trayIndex) {
    if (!armPower(state, trayIndex).ok) return false;
    r.actions.push({ type: 'arm', trayIndex });
  }
  const res = tap(state, at);
  if (!res.ok) return false;
  r.actions.push({ type: 'tap', at });
  return true;
}

/** Plays a level attempt from the start with the given perks. Deterministic. */
export function playBot(def: LevelDef, perks: readonly PerkId[], attemptSeed: number, opts: BotOptions = {}): BotResult {
  return playBotFrom(createLevelState(def, perks, attemptSeed), opts);
}

/** Plays on from an existing state (mutates it). */
export function playBotFrom(state: LevelState, opts: BotOptions = {}): BotResult {
  const maxActions = opts.maxActions ?? 400;
  const result = newResult(state);
  if (state.armed !== null) state.armed = null;
  for (let n = 0; n < maxActions && state.status === 'playing'; n++) {
    const choice = suggestAction(state);
    if (!choice) break;
    if (choice.type === 'tap') {
      if (!tap(state, choice.at).ok) break;
      result.actions.push({ type: 'tap', at: choice.at });
    } else if (!usePower(state, choice.trayIndex, choice.at, result)) break;
  }
  return finish(state, result);
}

/** Applies one recorded bot action (used for replays and determinism tests). */
export function applyBotAction(state: LevelState, a: BotAction): ActionResult {
  return a.type === 'tap' ? tap(state, a.at) : armPower(state, a.trayIndex);
}

// ---- Casual player model -----------------------------------------------------------------------
//
// The greedy bot is far stronger than a first-time player, so move budgets derived from it are much too
// tight. The casual model is seeded, does not look ahead for taps, and picks a group by a noisy softmax over
// what a person notices at a glance (bigger groups, groups that charge a power, groups touching a relic, dirt
// around it). Powers: it always uses one on bedrock that seals a visible relic and when the board offers no
// group (or no moves are left); otherwise, while a relic or slab is in view, it uses one with `powerChance`
// per turn. It aims like a person who can see the pattern before tapping (the bot's evaluation over the
// targeted cells), except that with `powerNoise` it fires at a random visible cell.

export interface CasualProfile {
  /** Chance per tap of picking a uniformly random group (misreads, curiosity). */
  noise: number;
  /** Softmax temperature over group scores; higher is more random. */
  temperature: number;
  /** Score per gem in the group. */
  sizeWeight: number;
  /** Bonus when the group is big enough to charge a power. */
  chargeBonus: number;
  /** Bonus when the group touches a visible crusted relic. */
  relicTouch: number;
  /** Bonus when the group touches dirt or bedrock next to a visible relic. */
  relicDirt: number;
  /** Bonus when the group lies in the columns above the next relic the player can see. */
  aim: number;
  /** Chance per turn of using a held power while a relic or slab is in view (when nothing forces it). */
  powerChance: number;
  /** Chance that a power is fired at a random visible cell instead of an aimed one. */
  powerNoise: number;
}

/** The calibration player: better than random, clearly worse than the greedy bot. */
export const CASUAL_PROFILE: Readonly<CasualProfile> = Object.freeze({
  noise: 0.08,
  temperature: 0.6,
  sizeWeight: 0.3,
  chargeBonus: 1,
  relicTouch: 5,
  relicDirt: 3,
  aim: 1,
  powerChance: 0.5,
  powerNoise: 0.25,
});

/** Uniformly random taps; powers fired at random cells as soon as held. A floor, not a target. */
export const RANDOM_PROFILE: Readonly<CasualProfile> = Object.freeze({
  noise: 1,
  temperature: 1,
  sizeWeight: 0,
  chargeBonus: 0,
  relicTouch: 0,
  relicDirt: 0,
  aim: 0,
  powerChance: 1,
  powerNoise: 1,
});

export interface CasualOptions {
  profile?: Readonly<CasualProfile>;
  /** Safety cap on decisions (default 400). */
  maxActions?: number;
}

interface RelicHints {
  touch: Set<number>;
  near: Set<number>;
  sealed: boolean;
  aim: { from: number; to: number; y: number } | null;
}

function relicHints(s: LevelState): RelicHints {
  const touch = new Set<number>();
  const near = new Set<number>();
  let sealed = false;
  let aim: RelicHints['aim'] = null;
  const seeTo = s.scroll + VISIBLE_ROWS + s.rules.revealRows;
  for (const r of s.relics) {
    if (r.collected || isRelicGone(s, r)) continue;
    if (r.y < seeTo && (!aim || r.y < aim.y)) aim = { from: r.x - 1, to: r.x + r.size, y: r.y };
    if (!isRelicVisible(s, r)) continue;
    for (const n of relicNeighbours(r)) {
      const c = cellAt(s, n.x, n.y);
      if (!c || !isVisible(s, n.x, n.y)) continue;
      touch.add(n.y * COLUMNS + n.x);
      if (c.kind === 'bedrock') sealed = true;
      if (c.kind === 'dirt' || c.kind === 'bedrock') {
        for (const d of NEIGHBOURS) near.add((n.y + d.y) * COLUMNS + n.x + d.x);
      }
    }
  }
  return { touch, near, sealed, aim };
}

function pickCasualGroup(s: LevelState, groups: Pos[][], p: Readonly<CasualProfile>, rng: Rng): Pos[] {
  if (rng.next() < p.noise) return groups[rng.int(groups.length)] as Pos[];
  const hints = relicHints(s);
  const threshold = powerThreshold(s);
  const scores = groups.map((g) => {
    let touch = false;
    let near = false;
    let aim = false;
    const a = hints.aim;
    for (const c of g) {
      const k = c.y * COLUMNS + c.x;
      if (hints.touch.has(k)) touch = true;
      if (hints.near.has(k)) near = true;
      if (a && c.x >= a.from && c.x <= a.to && c.y < a.y) aim = true;
    }
    return (
      p.sizeWeight * g.length +
      (g.length >= threshold ? p.chargeBonus : 0) +
      (touch ? p.relicTouch : 0) +
      (near ? p.relicDirt : 0) +
      (aim ? p.aim : 0)
    );
  });
  const top = Math.max(...scores);
  const weights = scores.map((v) => Math.exp((v - top) / p.temperature));
  return groups[rng.weighted(weights)] as Pos[];
}

/** Plays a level attempt with the casual player model. Deterministic for (attemptSeed, seed). */
export function playCasual(
  def: LevelDef,
  perks: readonly PerkId[],
  attemptSeed: number,
  seed: number,
  opts: CasualOptions = {},
): BotResult {
  return playCasualFrom(createLevelState(def, perks, attemptSeed), seed, opts);
}

/**
 * Plays on from an existing state with the casual model (mutates it). The model's own choices use a separate
 * RNG seeded by `seed`; the level's rng stream only advances through the actions themselves.
 */
export function playCasualFrom(state: LevelState, seed: number, opts: CasualOptions = {}): BotResult {
  const p = opts.profile ?? CASUAL_PROFILE;
  const rng = new Rng(hashSeed(seed, 0xca5a));
  const maxActions = opts.maxActions ?? 400;
  const result = newResult(state);
  if (state.armed !== null) state.armed = null;
  for (let n = 0; n < maxActions && state.status === 'playing'; n++) {
    const groups = state.movesLeft === 0 ? [] : listGroups(state);
    if (state.tray.length > 0) {
      const forced = groups.length === 0;
      const hints = relicHints(state);
      const want =
        forced || (hints.sealed && hints.touch.size > 0) || (powerWorthy(state) && rng.next() < p.powerChance);
      if (want) {
        let choice: { trayIndex: number; at: Pos } | null;
        if (rng.next() < p.powerNoise) {
          const cells = allVisible(state);
          choice = { trayIndex: rng.int(state.tray.length), at: cells[rng.int(cells.length)] as Pos };
        } else {
          let targets = powerTargets(state, 14);
          if (targets.length === 0) targets = allVisible(state);
          choice = bestPower(state, targets);
        }
        if (choice && usePower(state, choice.trayIndex, choice.at, result)) continue;
        if (forced) break;
      }
    }
    if (groups.length === 0) break;
    const at = pickCasualGroup(state, groups, p, rng)[0] as Pos;
    if (!tap(state, at).ok) break;
    result.actions.push({ type: 'tap', at });
  }
  return finish(state, result);
}

/** Counts events of a type (tooling helper). */
export function countEvents(events: readonly CoreEvent[], type: CoreEvent['type']): number {
  return events.filter((e) => e.type === type).length;
}
