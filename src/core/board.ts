// Low-level board helpers shared by level.ts, actions.ts, the bot and the generator.
//
// Invariant: core never mutates a Cell object in place; it always writes a new object into the
// grid. That lets `cloneState` share cell objects between states and only copy the row arrays.
import { nextInt } from './rng';
import { COLUMNS, SCROLL_TRIGGER_ROWS, VISIBLE_ROWS } from './types';
import type { Cell, GemColor, LevelState, Pos, Relic } from './types';

export const EMPTY = (): Cell => ({ kind: 'empty' });

export function levelHeight(state: LevelState): number {
  return state.grid.length;
}

/** Largest scroll value: the level bottom is visible once scroll reaches it. */
export function maxScroll(state: LevelState): number {
  return Math.max(0, state.grid.length - VISIBLE_ROWS);
}

export function inGrid(state: LevelState, x: number, y: number): boolean {
  return x >= 0 && x < COLUMNS && y >= 0 && y < state.grid.length;
}

/** True if (x, y) is on the board and inside the visible window. */
export function isVisible(state: LevelState, x: number, y: number): boolean {
  return (
    x >= 0 &&
    x < COLUMNS &&
    y >= state.scroll &&
    y < state.scroll + VISIBLE_ROWS &&
    y < state.grid.length
  );
}

export function cellAt(state: LevelState, x: number, y: number): Cell | undefined {
  return state.grid[y]?.[x];
}

export function setCell(state: LevelState, x: number, y: number, cell: Cell): void {
  const row = state.grid[y];
  if (!row) throw new Error(`setCell out of range: ${x},${y}`);
  row[x] = cell;
}

export function blockColor(state: LevelState, x: number, y: number): GemColor | null {
  const c = cellAt(state, x, y);
  return c && c.kind === 'block' ? c.color : null;
}

export const NEIGHBOURS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Draws an integer in [0, n) from the state's RNG stream. */
export function drawInt(state: LevelState, n: number): number {
  const [v, s] = nextInt(state.rngState, n);
  state.rngState = s;
  return v;
}

export function sortPos(cells: Pos[]): Pos[] {
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Orthogonally connected same-colour blocks containing `at`, restricted to the visible window
 * (hidden blocks below the board never join a group). Returns [] if `at` is not a visible block.
 * The result is sorted row-major and includes single-block "groups" (length 1).
 */
export function findGroup(state: LevelState, at: Pos): Pos[] {
  if (!isVisible(state, at.x, at.y)) return [];
  const color = blockColor(state, at.x, at.y);
  if (color === null) return [];
  const seen = new Set<number>([at.y * COLUMNS + at.x]);
  const stack: Pos[] = [{ x: at.x, y: at.y }];
  const out: Pos[] = [];
  while (stack.length) {
    const p = stack.pop() as Pos;
    out.push(p);
    for (const d of NEIGHBOURS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      const key = ny * COLUMNS + nx;
      if (seen.has(key) || !isVisible(state, nx, ny) || blockColor(state, nx, ny) !== color) continue;
      seen.add(key);
      stack.push({ x: nx, y: ny });
    }
  }
  return sortPos(out);
}

/** All visible groups of size >= 2, in row-major order of their first cell. */
export function listGroups(state: LevelState): Pos[][] {
  const seen = new Set<number>();
  const groups: Pos[][] = [];
  const top = state.scroll;
  const bottom = Math.min(state.scroll + VISIBLE_ROWS, state.grid.length);
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const key = y * COLUMNS + x;
      if (seen.has(key) || blockColor(state, x, y) === null) continue;
      const g = findGroup(state, { x, y });
      for (const p of g) seen.add(p.y * COLUMNS + p.x);
      if (g.length >= 2) groups.push(g);
    }
  }
  return groups;
}

/** True if any visible group of 2+ exists. */
export function hasAnyGroup(state: LevelState): boolean {
  const top = state.scroll;
  const bottom = Math.min(state.scroll + VISIBLE_ROWS, state.grid.length);
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const c = blockColor(state, x, y);
      if (c === null) continue;
      if (x + 1 < COLUMNS && blockColor(state, x + 1, y) === c) return true;
      if (y + 1 < bottom && blockColor(state, x, y + 1) === c) return true;
    }
  }
  return false;
}

export function relicCells(relic: Pick<Relic, 'x' | 'y' | 'size'>): Pos[] {
  const out: Pos[] = [];
  for (let dy = 0; dy < relic.size; dy++) {
    for (let dx = 0; dx < relic.size; dx++) out.push({ x: relic.x + dx, y: relic.y + dy });
  }
  return out;
}

/** A relic counts as visible if any of its cells is inside the visible window. */
export function isRelicVisible(state: LevelState, relic: Relic): boolean {
  return relicCells(relic).some((p) => isVisible(state, p.x, p.y));
}

export function relicById(state: LevelState, id: number): Relic | undefined {
  return state.relics.find((r) => r.id === id);
}

/**
 * Gravity: every block falls straight down within its column until it rests on the level floor,
 * another block, or a fixed cell (dirt, relic, bedrock). Applies to the whole column, not only
 * the visible window. Returns the moves (from -> to), ordered by column then from bottom to top.
 */
export function applyGravity(state: LevelState): { from: Pos; to: Pos }[] {
  const moves: { from: Pos; to: Pos }[] = [];
  const h = state.grid.length;
  for (let x = 0; x < COLUMNS; x++) {
    let floor = h - 1; // lowest free slot available to the next block found above
    for (let y = h - 1; y >= 0; y--) {
      const c = cellAt(state, x, y) as Cell;
      if (c.kind === 'empty') continue;
      if (c.kind !== 'block') {
        floor = y - 1;
        continue;
      }
      if (floor !== y) {
        setCell(state, x, floor, c);
        setCell(state, x, y, EMPTY());
        moves.push({ from: { x, y }, to: { x, y: floor } });
      }
      floor--;
    }
  }
  return moves;
}

/**
 * A STUCK gem can never be cleared by a tap: no orthogonal neighbour has its colour, it is not
 * resting on another gem (so it cannot drop when something below is cleared), and no gem exists
 * above it (up to the first fixed cell) in its own or the two neighbouring columns, so nothing can
 * ever fall onto or beside it.
 * Such a gem sits on a dirt/bedrock/relic ledge or the floor. Stuck gems do not hold back the
 * scroll; see docs/architecture.md, "Stuck gems". (Breaking the ledge, a shuffle, a transmute or a power
 * could free one later; it then simply falls/plays as normal.)
 */
export function isStuckGem(state: LevelState, x: number, y: number): boolean {
  const color = blockColor(state, x, y);
  if (color === null) return false;
  for (const d of NEIGHBOURS) if (blockColor(state, x + d.x, y + d.y) === color) return false;
  if (blockColor(state, x, y + 1) !== null) return false;
  for (let cx = x - 1; cx <= x + 1; cx++) {
    if (cx < 0 || cx >= COLUMNS) continue;
    // A fixed cell beside the gem means nothing in that column can land next to it.
    if (cx !== x && cellAt(state, cx, y)?.kind !== 'empty') continue;
    // Scan up to the first fixed cell: gems can only fall onto/beside it from below that.
    for (let cy = y - 1; cy >= 0; cy--) {
      const c = cellAt(state, cx, cy) as Cell;
      if (c.kind === 'block') return false;
      if (c.kind !== 'empty') break;
    }
  }
  return true;
}

function topRowsHaveBlock(state: LevelState): boolean {
  const end = Math.min(state.scroll + SCROLL_TRIGGER_ROWS, state.grid.length);
  for (let y = state.scroll; y < end; y++) {
    const row = state.grid[y] as Cell[];
    for (let x = 0; x < COLUMNS; x++) {
      if ((row[x] as Cell).kind === 'block' && !isStuckGem(state, x, y)) return true;
    }
  }
  return false;
}

/**
 * Scrolls down one row at a time while the top SCROLL_TRIGGER_ROWS visible rows hold no block
 * (stuck gems excepted, see isStuckGem),
 * the level bottom is not yet visible, and no uncollected GOAL relic sits in the top visible row
 * (scrolling would push it out of view). Bonus relics do not hold the scroll. Returns the rows scrolled.
 */
export function scrollStep(state: LevelState): number {
  const limit = maxScroll(state);
  let rows = 0;
  while (state.scroll < limit && !topRowsHaveBlock(state)) {
    // Goal relics never leave the view uncollected; bonus relics may scroll away (they are then gone).
    if (state.relics.some((r) => !r.collected && !r.bonus && r.y <= state.scroll)) break;
    state.scroll++;
    rows++;
  }
  if (state.scroll > state.maxDepth) state.maxDepth = state.scroll;
  return rows;
}

/**
 * A crusted relic is STRANDED when no clear can ever touch it again. Only LIVE gems count: a gem
 * inside the visible window that is not stuck (see isStuckGem). The relic is stranded when none of
 * its orthogonal neighbours is a live gem and no live gem exists above its top or side neighbours
 * in those columns (gems only move down, so nothing else can arrive).
 *
 * Why stuck and hidden gems are ignored:
 * - A stuck gem has no same-colour neighbour and nothing can ever land on or beside it, so a tap
 *   can never clear it (only a shuffle, transmute, power or a broken ledge could change that).
 * - Gems above the window are always stuck: the scroll only passes a row whose gems are all stuck,
 *   the hidden rows can never change, and actions never reach them. A hidden gem resting on the
 *   relic itself (the relic sits in the top visible row) can only fall once the relic is gone.
 *   Counting such a gem held a top-row relic forever while it also blocked the scroll, which burnt
 *   the player's moves (review finding H1).
 * Such a relic could otherwise only be reached by a power. A stranded relic that touches bedrock is
 * "sealed" instead: it is not freed (breaking the slab with a power is the intended solution) and the
 * dead-board step grants a rescue power when the tray is empty (shuffle.ts).
 * See docs/architecture.md, "Stranded relics".
 */
export function isStranded(state: LevelState, relic: Relic): boolean {
  if (relic.collected) return false;
  const s = relic.size;
  const live = (x: number, y: number) =>
    y >= state.scroll && blockColor(state, x, y) !== null && !isStuckGem(state, x, y);
  const fed: Pos[] = []; // neighbours that blocks could fall into
  const below: Pos[] = [];
  for (let i = 0; i < s; i++) {
    fed.push({ x: relic.x + i, y: relic.y - 1 });
    fed.push({ x: relic.x - 1, y: relic.y + i });
    fed.push({ x: relic.x + s, y: relic.y + i });
    below.push({ x: relic.x + i, y: relic.y + s });
  }
  for (const n of [...fed, ...below]) {
    if (inGrid(state, n.x, n.y) && live(n.x, n.y)) return false;
  }
  for (const n of fed) {
    if (n.x < 0 || n.x >= COLUMNS) continue;
    for (let y = Math.min(n.y, state.grid.length - 1); y >= state.scroll; y--) {
      if (live(n.x, y)) return false;
    }
  }
  return true;
}

/** True if a bedrock cell is orthogonally adjacent to the relic (a slab seals that side). */
export function touchesBedrock(state: LevelState, relic: Relic): boolean {
  return relicNeighbours(relic).some((n) => cellAt(state, n.x, n.y)?.kind === 'bedrock');
}

/** Orthogonal neighbour cells of a relic's footprint (may be off the board). */
export function relicNeighbours(r: Pick<Relic, 'x' | 'y' | 'size'>): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < r.size; i++) {
    out.push({ x: r.x + i, y: r.y - 1 }, { x: r.x + i, y: r.y + r.size });
    out.push({ x: r.x - 1, y: r.y + i }, { x: r.x + r.size, y: r.y + i });
  }
  return out;
}

/** True once the relic is above the visible window (a bonus relic that scrolled away: gone for good). */
export function isRelicGone(state: LevelState, relic: Relic): boolean {
  return !relic.collected && relic.y + relic.size <= state.scroll;
}

/** Removes a relic's cells from the grid and marks it collected (no counting or boons: see effects.ts). */
export function clearRelicCells(state: LevelState, relic: Relic): void {
  relic.crust = 0;
  relic.collected = true;
  for (const p of relicCells(relic)) {
    const c = cellAt(state, p.x, p.y);
    if (c && c.kind === 'relic' && c.id === relic.id) setCell(state, p.x, p.y, EMPTY());
  }
}

/** Visible block positions in row-major order. */
export function visibleBlocks(state: LevelState): Pos[] {
  const out: Pos[] = [];
  const bottom = Math.min(state.scroll + VISIBLE_ROWS, state.grid.length);
  for (let y = state.scroll; y < bottom; y++) {
    for (let x = 0; x < COLUMNS; x++) if (blockColor(state, x, y) !== null) out.push({ x, y });
  }
  return out;
}

/**
 * Cheap deep copy for simulation (bot, generator). Shares `def`, `rules` and the immutable Cell
 * objects; copies everything that actions mutate.
 */
export function cloneState(state: LevelState): LevelState {
  return {
    ...state,
    grid: state.grid.map((row) => row.slice()),
    relics: state.relics.map((r) => ({ ...r })),
    tray: state.tray.map((p) => ({ ...p })),
    boons: { ...state.boons },
    stats: { ...state.stats },
  };
}
