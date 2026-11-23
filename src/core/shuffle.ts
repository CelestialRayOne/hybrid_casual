// Dead-board handling (resolution step 8).
//
// Runs only while the game is playing and the power tray is empty.
//   0. SEALED relic: a visible relic that no gem can ever touch (isStranded) but that touches bedrock is not
//      freed by the stranded rule; the player gets a free RESCUE power instead (Drill Lv1, `powerCharged`
//      with source 'rescue'). Any power tapped on the slab shatters it.
// When no visible group exists:
//   1. If at least one pair of orthogonally adjacent visible blocks exists, the colours of the
//      visible blocks are permuted (a true shuffle: the colour multiset is unchanged). Up to
//      SHUFFLE_ATTEMPTS permutations are drawn; the first with >= SHUFFLE_TARGET groups wins,
//      otherwise the one with the most groups.
//   2. If no permutation produced a group, one is constructed: an adjacent pair is chosen and
//      given the most common colour. If every visible block has a different colour, the fewest
//      possible blocks (exactly one) are recoloured to match a neighbour.
//   3. If no two visible blocks are adjacent at all, no recolouring can help. The player is
//      given a free RESCUE power instead (Drill Lv1: it always digs, destroying gems and dirt and
//      chipping crusts), so the level stays winnable; the move limit is unaffected.
// Geode flags stay on their cells; only colours move.
import { blockColor, drawInt, hasAnyGroup, isRelicVisible, isStranded, setCell, touchesBedrock, visibleBlocks } from './board';
import { chargePower } from './tray';
import { COLUMNS } from './types';
import type { CoreEvent, GemColor, LevelState, Pos } from './types';

export const SHUFFLE_ATTEMPTS = 24;
export const SHUFFLE_TARGET = 3;

function key(p: Pos): number {
  return p.y * COLUMNS + p.x;
}

/** Counts groups of 2+ in a colour assignment over `cells` (only these cells exist). */
export function countGroupsIn(cells: readonly Pos[], colors: readonly GemColor[]): number {
  const index = new Map<number, number>();
  cells.forEach((p, i) => index.set(key(p), i));
  const seen = new Uint8Array(cells.length);
  let groups = 0;
  for (let i = 0; i < cells.length; i++) {
    if (seen[i]) continue;
    seen[i] = 1;
    const color = colors[i];
    let size = 0;
    const stack = [i];
    while (stack.length) {
      const j = stack.pop() as number;
      size++;
      const p = cells[j] as Pos;
      for (const n of [key({ x: p.x + 1, y: p.y }), key({ x: p.x - 1, y: p.y }), key({ x: p.x, y: p.y + 1 }), key({ x: p.x, y: p.y - 1 })]) {
        // Guard against wrap-around between rows for x - 1 / x + 1.
        const k = index.get(n);
        if (k === undefined || seen[k] || colors[k] !== color) continue;
        const q = cells[k] as Pos;
        if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) !== 1) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    if (size >= 2) groups++;
  }
  return groups;
}

function adjacentPairs(cells: readonly Pos[]): [number, number][] {
  const index = new Map<number, number>();
  cells.forEach((p, i) => index.set(key(p), i));
  const pairs: [number, number][] = [];
  cells.forEach((p, i) => {
    const right = p.x + 1 < COLUMNS ? index.get(key({ x: p.x + 1, y: p.y })) : undefined;
    const down = index.get(key({ x: p.x, y: p.y + 1 }));
    if (right !== undefined) pairs.push([i, right]);
    if (down !== undefined) pairs.push([i, down]);
  });
  return pairs;
}

function permute<T>(state: LevelState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = drawInt(state, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

/** Colour of the rescue power: amethyst = Drill. */
export const RESCUE_COLOR = 4 as const;

function rescue(state: LevelState, events: CoreEvent[]): void {
  state.stats.rescues++;
  chargePower(state, RESCUE_COLOR, 1, 'rescue', events);
}

/** True if a visible relic is sealed: unreachable by any clear, and touching bedrock. */
export function hasSealedRelic(state: LevelState): boolean {
  return state.relics.some((r) => !r.collected && isRelicVisible(state, r) && isStranded(state, r) && touchesBedrock(state, r));
}

/** Applies the dead-board step if needed. Appends `shuffled` or a rescue `powerCharged` event. */
export function resolveDeadBoard(state: LevelState, events: CoreEvent[]): void {
  if (state.status !== 'playing' || state.tray.length > 0) return;
  if (hasSealedRelic(state)) {
    rescue(state, events);
    return;
  }
  if (hasAnyGroup(state)) return;
  const cells = visibleBlocks(state);
  const pairs = adjacentPairs(cells);

  if (pairs.length === 0) {
    rescue(state, events);
    return;
  }

  const original = cells.map((p) => blockColor(state, p.x, p.y) as GemColor);
  let best: GemColor[] = original;
  let bestGroups = 0;
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    const perm = permute(state, original.slice());
    const g = countGroupsIn(cells, perm);
    if (g > bestGroups) {
      best = perm;
      bestGroups = g;
      if (g >= SHUFFLE_TARGET) break;
    }
  }

  if (bestGroups === 0) {
    const [a, b] = pairs[drawInt(state, pairs.length)] as [number, number];
    const counts = new Map<GemColor, number>();
    for (const c of original) counts.set(c, (counts.get(c) ?? 0) + 1);
    let top: GemColor = original[0] as GemColor;
    for (const [c, n] of [...counts.entries()].sort((p, q) => p[0] - q[0])) {
      if (n > (counts.get(top) ?? 0)) top = c;
    }
    if ((counts.get(top) ?? 0) >= 2) {
      // Put two of the most common colour on the pair, shuffle the rest elsewhere.
      const rest = original.slice();
      rest.splice(rest.indexOf(top), 1);
      rest.splice(rest.indexOf(top), 1);
      permute(state, rest);
      best = [];
      let r = 0;
      for (let i = 0; i < cells.length; i++) best.push(i === a || i === b ? top : (rest[r++] as GemColor));
    } else {
      // Every colour is unique: recolour exactly one block.
      best = original.slice();
      best[b] = best[a] as GemColor;
    }
  }

  cells.forEach((p, i) => {
    const old = state.grid[p.y]![p.x]!;
    const color = best[i] as GemColor;
    setCell(state, p.x, p.y, old.kind === 'block' && old.geode ? { kind: 'block', color, geode: true } : { kind: 'block', color });
  });
  state.stats.shuffles++;
  events.push({ type: 'shuffled', cells: cells.map((p, i) => ({ at: { ...p }, color: best[i] as GemColor })) });
}
