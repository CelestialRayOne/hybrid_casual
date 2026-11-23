// Level state creation (one ATTEMPT of a level) and read-only queries used by the view.
import { NEIGHBOURS, findGroup, hasAnyGroup, isVisible, listGroups, relicCells } from './board';
import { rollAttempt } from './attempt';
import { Rng, hashSeed } from './rng';
import { endCheck, settleBoard } from './resolve';
import { rulesFor } from './rules';
import { resolveDeadBoard } from './shuffle';
import { clampLevel } from './tray';
import { BOON_IDS, COLUMNS, VISIBLE_ROWS } from './types';
import type { AttemptStats, BoonId, Cell, CoreEvent, LevelDef, LevelState, PerkId, Pos } from './types';

export { findGroup, hasAnyGroup, listGroups };

export const MIN_LEVEL_ROWS = 20;
export const MAX_LEVEL_ROWS = 60;
export const MAX_GOAL_RELICS = 4;
export const MAX_START_POWERS = 2;

const noBoons = (): Record<BoonId, number> =>
  Object.fromEntries(BOON_IDS.map((b) => [b, 0])) as Record<BoonId, number>;

const freshStats = (): AttemptStats => ({
  groups: 0,
  biggestGroup: 0,
  powersCharged: 0,
  powersUsed: 0,
  geodes: 0,
  bonusCollected: 0,
  reforgeTokens: 0,
  bigGroupRolled: false,
  bonusTokenGiven: false,
  rescues: 0,
  shuffles: 0,
});

/**
 * Starts an ATTEMPT of a level: copies the structure, applies perks (crust hp, tray size, transmutes, ...),
 * rolls this attempt's randomness from `attemptSeed` (gem colours, geodes, relic types, bonus relics; see
 * attempt.ts), puts the level's start powers in the tray, then settles the board exactly like an action
 * would (gravity, scroll, stranded relics, dead board) without reporting events: the view renders the
 * returned state as the starting picture.
 * Deterministic for (def, perks, attemptSeed). The client passes a fresh seed per attempt (e.g. from the
 * clock); tests and tools pass fixed ones. Throws if `def` is structurally invalid.
 */
export function createLevelState(def: LevelDef, perks: readonly PerkId[], attemptSeed: number): LevelState {
  const errors = validateLevelDef(def, { strictDepth: false });
  if (errors.length) throw new Error(`Invalid level ${def.id}: ${errors.join('; ')}`);
  const rules = rulesFor(perks);
  const seed = attemptSeed >>> 0;
  const state: LevelState = {
    def,
    attemptSeed: seed,
    grid: def.rows.map((row) => row.map((c) => ({ ...c }) as Cell)),
    relics: def.relics.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      size: r.size,
      crust: rules.crustHp,
      collected: false,
      variant: 0,
      boon: BOON_IDS[0]!,
      bonus: false,
    })),
    goal: def.relics.length,
    collected: 0,
    scroll: 0,
    movesLeft: def.moves,
    movesUsed: 0,
    tray: [],
    armed: null,
    powerSeq: 0,
    boons: noBoons(),
    transmutesLeft: rules.transmutesPerLevel,
    continueUsed: false,
    status: 'playing',
    rngState: hashSeed(def.seed, def.id, seed),
    maxDepth: 0,
    rules,
    stats: freshStats(),
  };
  rollAttempt(state, new Rng(hashSeed(def.seed, def.id, seed, 0xa77e)));
  for (const p of def.startPowers.slice(0, rules.trayCapacity)) {
    state.tray.push({ color: p.color, level: clampLevel(p.level), seq: state.powerSeq++ });
  }
  const ignored: CoreEvent[] = [];
  settleBoard(state, ignored);
  endCheck(state, ignored);
  resolveDeadBoard(state, ignored);
  return state;
}

/** Rows the player sees: [from, to). */
export function visibleRows(state: LevelState): { from: number; to: number } {
  return { from: state.scroll, to: Math.min(state.scroll + VISIBLE_ROWS, state.grid.length) };
}

/** True if a power armed now could be triggered at `at` (any visible cell). */
export function canTriggerAt(state: LevelState, at: Pos): boolean {
  return state.status === 'playing' && state.armed !== null && isVisible(state, at.x, at.y);
}

/** Bedrock slab ids orthogonally adjacent to a GOAL relic. The level then needs a start power. */
export function sealingBedrock(def: Pick<LevelDef, 'rows' | 'relics'>): number[] {
  const ids = new Set<number>();
  for (const relic of def.relics) {
    for (const p of relicCells(relic)) {
      for (const d of NEIGHBOURS) {
        const c = def.rows[p.y + d.y]?.[p.x + d.x];
        if (c && c.kind === 'bedrock') ids.add(c.id);
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/** True if the cells form one orthogonally connected piece. */
export function isConnected(cells: readonly Pos[]): boolean {
  if (cells.length === 0) return false;
  const set = new Set(cells.map((c) => c.y * COLUMNS + c.x));
  const seen = new Set<number>([cells[0]!.y * COLUMNS + cells[0]!.x]);
  const stack = [cells[0]!];
  while (stack.length) {
    const p = stack.pop()!;
    for (const d of NEIGHBOURS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      if (nx < 0 || nx >= COLUMNS) continue;
      const k = ny * COLUMNS + nx;
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return seen.size === set.size;
}

/**
 * Structural checks for authored and generated levels. Returns a list of problems ([] = valid).
 * `strictDepth` also enforces the 20-60 row range, 1-4 goal relics and the start-power rule for sealing bedrock.
 */
export function validateLevelDef(def: LevelDef, opts: { strictDepth?: boolean } = {}): string[] {
  const errors: string[] = [];
  const strict = opts.strictDepth ?? true;
  const h = def.rows.length;
  if (h < 1) errors.push('no rows');
  if (strict && (h < MIN_LEVEL_ROWS || h > MAX_LEVEL_ROWS)) errors.push(`depth ${h} outside ${MIN_LEVEL_ROWS}-${MAX_LEVEL_ROWS}`);
  if (def.colors < 2 || def.colors > 5) errors.push(`colors ${def.colors}`);
  if (def.moves !== null && (!Number.isInteger(def.moves) || def.moves < 1)) errors.push(`moves ${def.moves}`);
  if (!(def.cluster >= 0 && def.cluster <= 1)) errors.push(`cluster ${def.cluster}`);
  if (!(def.geodeRate >= 0 && def.geodeRate <= 0.2)) errors.push(`geodeRate ${def.geodeRate}`);
  const [lo, hi] = def.bonusRelics;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < lo || hi > 6) errors.push(`bonusRelics ${lo}-${hi}`);
  const bedrock = new Map<number, Pos[]>();
  const relicSeen = new Map<number, Pos[]>();
  def.rows.forEach((row, y) => {
    if (row.length !== COLUMNS) errors.push(`row ${y} has ${row.length} cells`);
    row.forEach((c, x) => {
      if (c.kind === 'block' && (!Number.isInteger(c.color) || c.color < 0 || c.color >= def.colors)) {
        errors.push(`bad colour at ${x},${y}`);
      } else if (c.kind === 'dirt' && (!Number.isInteger(c.hp) || c.hp < 1 || c.hp > 3)) {
        errors.push(`bad dirt hp at ${x},${y}`);
      } else if (c.kind === 'bedrock') {
        bedrock.set(c.id, [...(bedrock.get(c.id) ?? []), { x, y }]);
      } else if (c.kind === 'relic') {
        relicSeen.set(c.id, [...(relicSeen.get(c.id) ?? []), { x, y }]);
      }
    });
  });
  for (const [id, cells] of bedrock) {
    if (cells.length < 2 || cells.length > 4 || !isConnected(cells)) errors.push(`bedrock ${id} is not a 2-4 cell slab`);
  }
  const ids = new Set<number>();
  def.relics.forEach((r) => {
    if (ids.has(r.id)) errors.push(`duplicate relic id ${r.id}`);
    ids.add(r.id);
    if (r.variant !== undefined && !(Number.isInteger(r.variant) && r.variant >= 0 && r.variant < BOON_IDS.length)) {
      errors.push(`relic ${r.id} variant ${r.variant}`);
    }
    const want = relicCells(r);
    const got = relicSeen.get(r.id) ?? [];
    const ok =
      got.length === want.length &&
      want.every((p) => {
        const c = def.rows[p.y]?.[p.x];
        return c?.kind === 'relic' && c.id === r.id;
      });
    if (!ok) errors.push(`relic ${r.id} cells do not match its position/size`);
  });
  for (const id of relicSeen.keys()) if (!ids.has(id)) errors.push(`relic cell id ${id} has no relic entry`);
  for (const p of def.pinned) {
    if (def.rows[p.y]?.[p.x]?.kind !== 'block') errors.push(`pinned cell ${p.x},${p.y} is not a gem`);
  }
  for (const sp of def.startPowers) {
    if (!(Number.isInteger(sp.color) && sp.color >= 0 && sp.color <= 4) || !(sp.level >= 1 && sp.level <= 5)) {
      errors.push('bad start power');
    }
  }
  if (def.startPowers.length > MAX_START_POWERS) errors.push(`more than ${MAX_START_POWERS} start powers`);
  if (strict) {
    if (def.relics.length < 1) errors.push('no relics');
    if (def.relics.length > MAX_GOAL_RELICS) errors.push(`more than ${MAX_GOAL_RELICS} goal relics`);
    if (sealingBedrock(def).length > 0 && def.startPowers.length < 1) errors.push('sealing bedrock but no start power');
  }
  return errors;
}

// ---- Serialisation ---------------------------------------------------------------------------

export const STATE_FORMAT_VERSION = 2;

/** Versioned JSON for a level in progress. LevelState is plain data, so this is a thin wrapper. */
export function serializeState(state: LevelState): string {
  return JSON.stringify({ version: STATE_FORMAT_VERSION, state });
}

export function deserializeState(json: string): LevelState {
  const data = JSON.parse(json) as { version?: unknown; state?: LevelState };
  if (data.version !== STATE_FORMAT_VERSION || !data.state) {
    throw new Error(`Unsupported level state version: ${String(data.version)}`);
  }
  return data.state;
}
