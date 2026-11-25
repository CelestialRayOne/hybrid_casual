// The five gem powers (docs/spec.md, "Gem powers (v2)"; precise rules in docs/architecture.md, "Gem powers").
//
// Common rules:
// - Only cells inside the visible window are affected. The tapped cell is always "touched": bedrock there
//   shatters for every power.
// - Bedrock: any slab the power touches (per-power rule below) shatters whole.
// - Powers never destroy relics; they chip crusts (x the Ancient Key multiplier), once per relic per power
//   (Chain Lightning: once per relic per strike).
// - Gems destroyed by a power never charge powers. The one exception is Wildfire's initial tapped GROUP: it is
//   a real group clear (charges a power at the threshold, pays geodes, Brilliant Cut, the 20+ token roll),
//   exactly like a tap. This prevents endless power chains.
// - Geodes destroyed by a power still pay out their Lv1 power (of the geode's colour) (owner playtest 2026-11-23: a geode that
//   vanished without its power felt wrong). `destroyed` flags them; actions.ts pays them.
//
// Per power ("cleared" = cells that deal adjacency damage):
// - Wildfire: clears the tapped gem's group (any size, even 1). Fire then spreads from the cleared cells (or
//   from the tapped cell when it holds no gem) by orthogonal steps through gem and empty cells (dirt, relics
//   and bedrock block it) and burns the N nearest gems. Ties at the last distance reached are broken by the
//   rng. Group + burnt gems are "cleared": each orthogonally adjacent dirt takes 1 (+ Compass) damage, each
//   adjacent relic 1 chip, each adjacent slab shatters; once per target.
// - Tidal Wave: rows/columns through the tapped cell. "3 rows" = the tapped row +-1; "3 columns" likewise.
//   Gems in the lines are destroyed; dirt takes 1 damage; relics 1 chip; slabs in the lines shatter. No
//   adjacency damage.
// - Earthshaker: origin = the tapped gem's group (or the tapped cell). Area = cells within CHEBYSHEV radius r
//   of any origin cell (a square ring, reads naturally on a grid). From the tapped cell, F fissures crack
//   outwards in distinct random directions (of 8); each wanders +-45 degrees per step (rng) around its heading
//   and reaches L cells beyond the area (fewer at the edge of the view). Dirt in the area and the fissures takes
//   D damage, relics with any cell in them C chips once, slabs in them shatter. Gems are left alone.
//   (Owner playtest 2026-11-24: one-shotting all dirt at Lv1 was too strong; fissures add randomness.)
// - Chain Lightning: strikes N distinct visible gems: the tapped gem first (if the tap was on a gem), the
//   rest uniformly at random (rng). Each struck gem is destroyed and deals 1 damage to each orthogonally
//   adjacent dirt and 1 chip to each adjacent relic (per strike: damage from several strikes adds up), and
//   shatters adjacent slabs.
// - Drill: from the tapped cell straight down for L rows (Lv4-5: to the bottom of the view; Lv5 3 columns
//   wide: tapped column +-1). At the last bored row it breaks through sideways: the cells within B columns of
//   the tapped column on that row (Lv5: the whole row) are hit too. Destroys gems and dirt outright, chips each
//   relic by 2 once, shatters slabs; it bores through everything. `drillShape` is shared with the preview.
//   (Owner playtest 2026-11-24: drill was weak at low levels and lost to Tidal Wave at Lv5.)
import { EMPTY, NEIGHBOURS, cellAt, drawInt, findGroup, isVisible, relicById, setCell } from './board';
import { chipMultiplier, collectRelic, damageDirt, key, shatterBedrock } from './effects';
import { COLUMNS, POWER_KINDS, VISIBLE_ROWS } from './types';
import type { CoreEvent, GemColor, LevelState, Pos, PowerEffect, PowerKind, PowerLevel } from './types';

export const WILDFIRE_SPREAD = [3, 6, 10, 15, 22] as const;
export const LIGHTNING_STRIKES = [3, 5, 8, 12, 16] as const;
/** Rows bored per level; Lv5 = all visible rows below the tap. */
export const DRILL_ROWS = [4, 6, 8, VISIBLE_ROWS, VISIBLE_ROWS] as const;
/** Bore half-width (0 = 1 column, 1 = 3 columns). */
export const DRILL_HALF_WIDTH = [0, 0, 0, 0, 1] as const;
/** Break-through half-width on the last bored row; Lv5 = the whole row. */
export const DRILL_BLAST = [1, 1, 2, 2, COLUMNS] as const;
export const DRILL_CRUST = 2;
/** Certain (previewed) area radius. */
export const SHAKER_RADIUS = [1, 1, 2, 2, 3] as const;
/** Dirt hp is at most 3: Lv3+ clears any dirt it reaches, Lv1-2 only cracks hard dirt. */
export const SHAKER_DIRT = [2, 2, 3, 3, 3] as const;
export const SHAKER_CRUST = [1, 1, 2, 2, 3] as const;
/** Random fissures per level, and the cells each reaches beyond the area. */
export const SHAKER_FISSURES = [2, 2, 3, 3, 4] as const;
export const SHAKER_FISSURE_LENGTH = [2, 3, 3, 4, 4] as const;
/** The 8 headings, clockwise from north. */
const HEADINGS: readonly Pos[] = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];
/** Tidal Wave line pattern per level: row offsets and column offsets from the tapped cell. */
export const TIDAL_LINES: readonly { rows: readonly number[]; cols: readonly number[] }[] = [
  { rows: [0], cols: [] },
  { rows: [0], cols: [0] },
  { rows: [-1, 0, 1], cols: [] },
  { rows: [-1, 0, 1], cols: [0] },
  { rows: [-1, 0, 1], cols: [-1, 0, 1] },
];

/** The value for `level` from a per-level table. */
const lv = <T>(table: readonly T[], level: PowerLevel): T => table[level - 1] as T;

export const powerKind = (color: GemColor): PowerKind => POWER_KINDS[color] as PowerKind;

/** What a power did, before its events are emitted. */
export interface PowerOutcome {
  effect: PowerEffect;
  cells: Pos[];
  destroyed: { at: Pos; color: GemColor; geode?: true }[];
  /** Wildfire only: the tapped group that counts as a real group clear. */
  group: Pos[];
  groupColor: GemColor | null;
  groupGeodes: Pos[];
}

/** Collected damage, applied in a fixed order after the gems are gone. */
class Damage {
  dirt = new Map<number, number>();
  relics = new Map<number, number>();
  bedrock = new Set<number>();
  addDirt(k: number, n: number) {
    this.dirt.set(k, (this.dirt.get(k) ?? 0) + n);
  }
  addRelic(id: number, n: number) {
    this.relics.set(id, (this.relics.get(id) ?? 0) + n);
  }
  /** Records damage to the fixed cell at p (visible only). */
  hit(state: LevelState, p: Pos, dirt: number, crust: number): void {
    if (!isVisible(state, p.x, p.y)) return;
    const c = cellAt(state, p.x, p.y);
    if (c?.kind === 'dirt' && dirt > 0) this.addDirt(key(p.x, p.y), dirt);
    else if (c?.kind === 'relic' && crust > 0) this.addRelic(c.id, crust);
    else if (c?.kind === 'bedrock') this.bedrock.add(c.id);
  }
  /** dirt (row-major) -> bedrock (by id) -> crusts (by id, collecting and applying boons). */
  apply(state: LevelState, events: CoreEvent[]): void {
    for (const k of [...this.dirt.keys()].sort((a, b) => a - b)) damageDirt(state, [k], this.dirt.get(k)!, events);
    shatterBedrock(state, this.bedrock, events);
    const mult = chipMultiplier(state);
    for (const id of [...this.relics.keys()].sort((a, b) => a - b)) {
      const relic = relicById(state, id);
      if (!relic || relic.collected) continue;
      relic.crust = Math.max(0, relic.crust - this.relics.get(id)! * mult);
      events.push({ type: 'crustChipped', relicId: id, crust: relic.crust });
      if (relic.crust === 0) collectRelic(state, relic, events);
    }
  }
}

function visibleCells(state: LevelState): Pos[] {
  const out: Pos[] = [];
  const bottom = Math.min(state.scroll + VISIBLE_ROWS, state.grid.length);
  for (let y = state.scroll; y < bottom; y++) for (let x = 0; x < COLUMNS; x++) out.push({ x, y });
  return out;
}

function destroyGem(state: LevelState, p: Pos, out: PowerOutcome['destroyed']): void {
  const c = cellAt(state, p.x, p.y);
  if (c?.kind !== 'block') return;
  out.push(c.geode ? { at: { x: p.x, y: p.y }, color: c.color, geode: true } : { at: { x: p.x, y: p.y }, color: c.color });
  setCell(state, p.x, p.y, EMPTY());
}

function shuffleInPlace<T>(state: LevelState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = drawInt(state, i + 1);
    const t = items[i] as T;
    items[i] = items[j] as T;
    items[j] = t;
  }
}

const byRowMajor = (a: Pos, b: Pos) => a.y - b.y || a.x - b.x;

/** The tapped gem's group (any size), or [] if the tapped cell is not a gem. */
function tappedGroup(state: LevelState, at: Pos): Pos[] {
  return findGroup(state, at);
}

function wildfire(state: LevelState, at: Pos, level: PowerLevel, dmg: Damage): PowerOutcome {
  const group = tappedGroup(state, at);
  const first = cellAt(state, at.x, at.y);
  const groupColor = group.length && first?.kind === 'block' ? first.color : null;
  const groupGeodes = group.filter((p) => {
    const c = cellAt(state, p.x, p.y);
    return c?.kind === 'block' && c.geode === true;
  });
  const sources = group.length ? group : [at];
  // Multi-source BFS through gems and empty cells.
  const dist = new Map<number, number>();
  const queue: Pos[] = [];
  for (const s of sources) {
    dist.set(key(s.x, s.y), 0);
    queue.push(s);
  }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    const d = dist.get(key(p.x, p.y))!;
    for (const n of NEIGHBOURS) {
      const nx = p.x + n.x;
      const ny = p.y + n.y;
      const k = key(nx, ny);
      if (dist.has(k) || !isVisible(state, nx, ny)) continue;
      const kind = cellAt(state, nx, ny)?.kind;
      if (kind !== 'block' && kind !== 'empty') continue;
      dist.set(k, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  const layers = new Map<number, Pos[]>();
  for (const p of queue) {
    const d = dist.get(key(p.x, p.y))!;
    if (d === 0 || cellAt(state, p.x, p.y)?.kind !== 'block') continue;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(p);
  }
  let budget: number = lv(WILDFIRE_SPREAD, level);
  const burnt: { at: Pos; step: number }[] = [];
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    if (budget <= 0) break;
    const layer = layers.get(d)!.sort(byRowMajor);
    if (layer.length > budget) {
      shuffleInPlace(state, layer);
      layer.length = budget;
      layer.sort(byRowMajor);
    }
    for (const p of layer) burnt.push({ at: p, step: d });
    budget -= layer.length;
  }
  const destroyed: PowerOutcome['destroyed'] = [];
  const cleared = [...group, ...burnt.map((b) => b.at)];
  for (const p of cleared) destroyGem(state, p, destroyed);
  const clearedKeys = new Set(cleared.map((p) => key(p.x, p.y)));
  const dirtDamage = 1 + state.boons.compass;
  const dirtSeen = new Set<number>();
  const relicSeen = new Set<number>();
  dmg.hit(state, at, 0, 0); // bedrock under the tap
  for (const p of cleared) {
    for (const n of NEIGHBOURS) {
      const q = { x: p.x + n.x, y: p.y + n.y };
      const k = key(q.x, q.y);
      if (clearedKeys.has(k) || !isVisible(state, q.x, q.y)) continue;
      const c = cellAt(state, q.x, q.y);
      if (c?.kind === 'dirt' && !dirtSeen.has(k)) {
        dirtSeen.add(k);
        dmg.addDirt(k, dirtDamage);
      } else if (c?.kind === 'relic' && !relicSeen.has(c.id)) {
        relicSeen.add(c.id);
        dmg.addRelic(c.id, 1);
      } else if (c?.kind === 'bedrock') dmg.bedrock.add(c.id);
    }
  }
  const cells = group.length ? [...cleared] : [{ ...at }, ...burnt.map((b) => b.at)];
  return {
    effect: { power: 'wildfire', group: group.map((p) => ({ ...p })), burnt },
    cells,
    destroyed,
    group,
    groupColor,
    groupGeodes,
  };
}

function tidal(state: LevelState, at: Pos, level: PowerLevel, dmg: Damage): PowerOutcome {
  const pattern = lv(TIDAL_LINES, level);
  const rows = pattern.rows.map((d) => at.y + d).filter((y) => isVisible(state, at.x, y));
  const cols = pattern.cols.map((d) => at.x + d).filter((x) => x >= 0 && x < COLUMNS);
  const seen = new Set<number>();
  const cells: Pos[] = [];
  for (const p of visibleCells(state)) {
    if (!rows.includes(p.y) && !cols.includes(p.x)) continue;
    seen.add(key(p.x, p.y));
    cells.push(p);
  }
  // Wave order: outwards from the tap (Manhattan), then row-major.
  const md = (p: Pos) => Math.abs(p.x - at.x) + Math.abs(p.y - at.y);
  cells.sort((a, b) => md(a) - md(b) || byRowMajor(a, b));
  const destroyed: PowerOutcome['destroyed'] = [];
  const relicSeen = new Set<number>();
  for (const p of cells) {
    const c = cellAt(state, p.x, p.y);
    if (c?.kind === 'block') destroyGem(state, p, destroyed);
    else if (c?.kind === 'relic') {
      if (!relicSeen.has(c.id)) dmg.hit(state, p, 0, 1);
      relicSeen.add(c.id);
    } else dmg.hit(state, p, 1, 0);
  }
  return { effect: { power: 'tidal', rows, cols }, cells, destroyed, group: [], groupColor: null, groupGeodes: [] };
}

/** The certain Earthshaker area (Chebyshev radius around the origin), shared with the preview. */
export function shakerArea(state: LevelState, at: Pos, level: PowerLevel): { origin: Pos[]; radius: number; area: Pos[] } {
  const group = tappedGroup(state, at);
  const origin = group.length ? group : [{ ...at }];
  const radius: number = lv(SHAKER_RADIUS, level);
  const cheb = (p: Pos) => Math.min(...origin.map((o) => Math.max(Math.abs(o.x - p.x), Math.abs(o.y - p.y))));
  const area = visibleCells(state).filter((p) => cheb(p) <= radius);
  area.sort((a, b) => cheb(a) - cheb(b) || byRowMajor(a, b));
  return { origin, radius, area };
}

/** Random fissures from the tapped cell: each lists, in travel order, its cells outside `area`. */
function shakerFissures(state: LevelState, at: Pos, level: PowerLevel, area: Pos[]): Pos[][] {
  const taken = new Set(area.map((p) => key(p.x, p.y)));
  const headings = HEADINGS.map((_, i) => i);
  shuffleInPlace(state, headings);
  const length: number = lv(SHAKER_FISSURE_LENGTH, level);
  const fissures: Pos[][] = [];
  for (const base of headings.slice(0, lv(SHAKER_FISSURES, level))) {
    const cells: Pos[] = [];
    let p = { ...at };
    // Bounded: every step moves at least one cell away along the base heading's axis.
    for (let step = 0; step < COLUMNS + VISIBLE_ROWS && cells.length < length; step++) {
      const turn = drawInt(state, 4); // 0: left, 1: right, else straight on
      const d = HEADINGS[(base + (turn === 0 ? 7 : turn === 1 ? 1 : 0)) % 8]!;
      p = { x: p.x + d.x, y: p.y + d.y };
      if (!isVisible(state, p.x, p.y)) break;
      const k = key(p.x, p.y);
      if (taken.has(k)) continue;
      taken.add(k);
      cells.push(p);
    }
    fissures.push(cells);
  }
  return fissures;
}

function earthshaker(state: LevelState, at: Pos, level: PowerLevel, dmg: Damage): PowerOutcome {
  const { origin, radius, area } = shakerArea(state, at, level);
  const fissures = shakerFissures(state, at, level, area);
  const relicSeen = new Set<number>();
  const cells = [...area, ...fissures.flat()];
  for (const p of cells) {
    const c = cellAt(state, p.x, p.y);
    if (c?.kind === 'relic') {
      if (!relicSeen.has(c.id)) dmg.hit(state, p, 0, lv(SHAKER_CRUST, level));
      relicSeen.add(c.id);
    } else if (c?.kind !== 'block') dmg.hit(state, p, lv(SHAKER_DIRT, level), 0);
  }
  return {
    effect: { power: 'earthshaker', origin: origin.map((p) => ({ ...p })), radius, area, fissures },
    cells,
    destroyed: [],
    group: [],
    groupColor: null,
    groupGeodes: [],
  };
}

function lightning(state: LevelState, at: Pos, level: PowerLevel, dmg: Damage): PowerOutcome {
  const n: number = lv(LIGHTNING_STRIKES, level);
  const gems = visibleCells(state).filter((p) => cellAt(state, p.x, p.y)?.kind === 'block');
  const tappedIsGem = cellAt(state, at.x, at.y)?.kind === 'block';
  const rest = gems.filter((p) => !(tappedIsGem && p.x === at.x && p.y === at.y));
  shuffleInPlace(state, rest);
  const strikes = [...(tappedIsGem ? [{ ...at }] : []), ...rest].slice(0, n);
  dmg.hit(state, at, 0, 0); // bedrock under the tap
  const destroyed: PowerOutcome['destroyed'] = [];
  for (const p of strikes) {
    destroyGem(state, p, destroyed);
    const relicSeen = new Set<number>();
    for (const d of NEIGHBOURS) {
      const q = { x: p.x + d.x, y: p.y + d.y };
      const c = cellAt(state, q.x, q.y);
      if (c?.kind === 'relic') {
        if (!relicSeen.has(c.id)) dmg.hit(state, q, 0, 1);
        relicSeen.add(c.id);
      } else dmg.hit(state, q, 1, 0);
    }
  }
  return { effect: { power: 'lightning', strikes }, cells: strikes, destroyed, group: [], groupColor: null, groupGeodes: [] };
}

/** The Drill's footprint: bored columns, rows `from..to`, the bore cells and the break-through cells. */
export function drillShape(state: LevelState, at: Pos, level: PowerLevel): { cols: number[]; to: number; bore: Pos[]; blast: Pos[] } {
  const half: number = lv(DRILL_HALF_WIDTH, level);
  const cols: number[] = [];
  for (let x = at.x - half; x <= at.x + half; x++) if (x >= 0 && x < COLUMNS) cols.push(x);
  const bottom = Math.min(state.scroll + VISIBLE_ROWS, state.grid.length) - 1;
  const to = Math.min(at.y + lv(DRILL_ROWS, level) - 1, bottom);
  const bore: Pos[] = [];
  for (let y = at.y; y <= to; y++) for (const x of cols) bore.push({ x, y });
  const reach: number = lv(DRILL_BLAST, level);
  const blast: Pos[] = [];
  for (let x = Math.max(0, at.x - reach); x <= Math.min(COLUMNS - 1, at.x + reach); x++) {
    if (!cols.includes(x)) blast.push({ x, y: to });
  }
  return { cols, to, bore, blast };
}

function drill(state: LevelState, at: Pos, level: PowerLevel, dmg: Damage): PowerOutcome {
  const { cols, to, bore, blast } = drillShape(state, at, level);
  const path = [...bore, ...blast];
  const destroyed: PowerOutcome['destroyed'] = [];
  const relicSeen = new Set<number>();
  for (const p of path) {
    const c = cellAt(state, p.x, p.y);
    if (c?.kind === 'block') destroyGem(state, p, destroyed);
    else if (c?.kind === 'dirt') dmg.hit(state, p, c.hp, 0);
    else if (c?.kind === 'relic') {
      if (!relicSeen.has(c.id)) dmg.hit(state, p, 0, DRILL_CRUST);
      relicSeen.add(c.id);
    } else dmg.hit(state, p, 0, 0);
  }
  return {
    effect: { power: 'drill', cols, from: at.y, to, path, blast },
    cells: path,
    destroyed,
    group: [],
    groupColor: null,
    groupGeodes: [],
  };
}

const IMPL: Record<PowerKind, (s: LevelState, at: Pos, l: PowerLevel, d: Damage) => PowerOutcome> = {
  wildfire,
  tidal,
  earthshaker,
  lightning,
  drill,
};

/**
 * Runs a power's effect at `at` (visible, validated by the caller). Mutates the grid, then appends
 * `powerTriggered` followed by its consequences (dirt, bedrock, crusts, collections and boons) to `events`.
 * Returns the outcome for the caller's follow-ups (Wildfire's group rewards).
 */
export function runPower(
  state: LevelState,
  color: GemColor,
  level: PowerLevel,
  at: Pos,
  trayIndex: number,
  events: CoreEvent[],
): PowerOutcome {
  const dmg = new Damage();
  const power = powerKind(color);
  const outcome = IMPL[power](state, at, level, dmg);
  events.push({
    type: 'powerTriggered',
    trayIndex,
    color,
    power,
    level,
    at: { ...at },
    effect: outcome.effect,
    cells: outcome.cells.map((p) => ({ ...p })),
    destroyed: outcome.destroyed,
  });
  dmg.apply(state, events);
  return outcome;
}

