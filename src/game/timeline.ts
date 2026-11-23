// Turns the ordered CoreEvents of one action into a timed animation plan (pure, unit-tested).
//
// Model: events come in "impact phases" (clears, power effects, damage, chips, reveals, awards) that overlap,
// separated by sequential steps (fall, scroll, shuffle) that each wait for the previous phase. `block` is how
// long a step holds the board (the next sequential step waits for it); visuals may keep playing a little longer
// (the pop fade, the landing squash) without blocking input. A relic reveal adds a hit-stop: everything after it
// is pushed back by `hitStopMs`, and the scene freezes tweens for that window.
//
// Gem powers: each power has its own choreography (`powerTiming`): the time its effect reaches every cell. Damage
// events that follow a power (dirt, bedrock, crusts) land when the effect reaches them, so a drill cracks the dirt
// as it bores through it and a fire burns the dirt next to it as it spreads.
import type { CoreEvent, Pos } from '../core';

export const TIMING = {
  /** Gem pop visual length and how long it blocks the fall. */
  popMs: 160,
  popBlockMs: 105,
  /** Per-gem stagger of the pop ripple from the tapped cell, capped. */
  popStaggerMs: 12,
  popStaggerMaxMs: 60,
  dirtAt: 55,
  dirtBlockMs: 60,
  bedrockAt: 40,
  bedrockBlockMs: 120,
  crustAt: 70,
  crustBlockMs: 60,
  relicAt: 95,
  hitStopMs: 120,
  /** Consequences of a boon (Ancient Key chips, Sun Coin moves, Star Amulet power) wait this long after the reveal. */
  boonChainMs: 260,
  awardAt: 90,
  recolourBlockMs: 240,
  /** Fall duration grows with sqrt(rows): gravity-like, never sluggish. */
  fallBaseMs: 85,
  fallPerSqrtRowMs: 55,
  fallMaxMs: 300,
  landSquashMs: 90,
  scrollBaseMs: 170,
  scrollPerRowMs: 85,
  scrollMaxMs: 620,
  shuffleMs: 420,
  /** A damage target lands this long after the power effect reaches it. */
  powerHitLagMs: 60,
} as const;

export type PowerEvent = Extract<CoreEvent, { type: 'powerTriggered' }>;

export interface PowerTiming {
  /** How long the power's own animation holds the board (ms). */
  duration: number;
  /** When the effect reaches cell `p` (or the nearest touched cell next to it): damage targets. */
  hitTime(p: Pos): number;
  /** When the effect plays on cell `p` of its own pattern (group, burnt, line, strike, path): gem animations. */
  cellTime(p: Pos): number;
}

const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const manh = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Time of the nearest timed cell that is `p` itself or orthogonally next to it; `fallback` if none. */
function nearestTimed(timed: ReadonlyMap<number, number>, p: Pos, fallback: number): number {
  let best = Infinity;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = timed.get((p.y + dy) * 64 + (p.x + dx));
    if (t !== undefined && t < best) best = t;
  }
  return best === Infinity ? fallback : best;
}

const k = (p: Pos) => p.y * 64 + p.x;

/** Gap between two Chain Lightning strikes: 60-80 ms, tighter for many strikes so the chain stays short. */
export function lightningInterval(strikes: number): number {
  return Math.min(80, 600 / Math.max(1, strikes));
}

/** Drill: lead-in before the bit moves, and ms per row bored. */
export function drillPace(e: { from: number; to: number }): { lead: number; perRow: number; rows: number } {
  const rows = Math.max(1, e.to - e.from + 1);
  return { lead: 130, perRow: Math.min(78, 560 / rows), rows };
}

/** Per-power choreography (see the header). Every duration stays within ~450-950 ms. */
export function powerTiming(e: PowerEvent): PowerTiming {
  const fx = e.effect;
  switch (fx.power) {
    case 'wildfire': {
      // The tapped group flares up first, then the fire spreads ring by ring in `burnt` step order.
      const groupMs = fx.group.length ? 130 : 60;
      const maxStep = fx.burnt.reduce((m, b) => Math.max(m, b.step), 1);
      const stepMs = Math.min(90, 520 / maxStep);
      const timed = new Map<number, number>();
      for (const p of fx.group) timed.set(k(p), Math.min(110, manh(p, e.at) * 18));
      if (!fx.group.length) timed.set(k(e.at), 0);
      for (const b of fx.burnt) timed.set(k(b.at), groupMs + (b.step - 1) * stepMs);
      const last = groupMs + (maxStep - 1) * stepMs;
      const duration = Math.round(Math.min(950, last + 320));
      return {
        duration,
        hitTime: (p) => nearestTimed(timed, p, last) + 160,
        cellTime: (p) => timed.get(k(p)) ?? last,
      };
    }
    case 'tidal': {
      // The wave gathers at the tapped cell, then sweeps outwards along every line.
      const lead = 110;
      const perCell = 42;
      const duration = lead + 7 * perCell + 260;
      const time = (p: Pos) => {
        let d = Infinity;
        if (fx.rows.includes(p.y)) d = Math.min(d, Math.abs(p.x - e.at.x));
        if (fx.cols.includes(p.x)) d = Math.min(d, Math.abs(p.y - e.at.y));
        if (d === Infinity) d = Math.min(manh(p, e.at), 7);
        return lead + d * perCell;
      };
      return { duration, hitTime: time, cellTime: time };
    }
    case 'earthshaker': {
      // A stomp, then shock rings roll out from the origin square by square.
      const stomp = 150;
      const perRing = 105;
      const origin = fx.origin.length ? fx.origin : [e.at];
      const duration = stomp + (fx.radius + 1) * perRing + 300;
      const time = (p: Pos) => {
        let d = Infinity;
        for (const o of origin) d = Math.min(d, cheb(o, p));
        return stomp + Math.min(d, fx.radius + 1) * perRing;
      };
      return { duration, hitTime: time, cellTime: time };
    }
    case 'lightning': {
      // Bolts jump strike to strike in order.
      const n = Math.max(1, fx.strikes.length);
      const lead = 70;
      const interval = lightningInterval(n);
      const timed = new Map<number, number>();
      fx.strikes.forEach((p, i) => {
        if (!timed.has(k(p))) timed.set(k(p), lead + i * interval);
      });
      const last = lead + (n - 1) * interval;
      return {
        duration: Math.round(last + 300),
        hitTime: (p) => nearestTimed(timed, p, last) + 20,
        cellTime: (p) => timed.get(k(p)) ?? last,
      };
    }
    case 'drill': {
      // The bit spins up at the tapped cell, then bores down row by row.
      const { lead, rows, perRow } = drillPace(fx);
      const duration = Math.round(lead + rows * perRow + 260);
      const time = (p: Pos) => lead + Math.max(0, Math.min(rows, p.y - fx.from)) * perRow;
      return { duration, hitTime: time, cellTime: time };
    }
  }
}

export interface PlannedStep {
  /** Start time in ms from the action. */
  at: number;
  /** How long this step holds the board. */
  block: number;
  event: CoreEvent;
}

export interface Plan {
  steps: PlannedStep[];
  /** Start times of hit-stops (each lasts TIMING.hitStopMs). */
  hitStops: number[];
  /** When the board is settled and input may resume. */
  settleAt: number;
}

export interface PlanOptions {
  /** Cells of a relic (for timing crust chips under a power). Without it, chips land when the power ends. */
  relicCells?: (relicId: number) => Pos[] | null;
}

export function popStagger(size: number): number {
  return Math.min(TIMING.popStaggerMaxMs, Math.max(0, size - 1) * TIMING.popStaggerMs * 0.5);
}

export function fallDuration(rows: number): number {
  if (rows <= 0) return 0;
  return Math.min(TIMING.fallMaxMs, TIMING.fallBaseMs + TIMING.fallPerSqrtRowMs * Math.sqrt(rows));
}

export function scrollDuration(rows: number): number {
  if (rows <= 0) return 0;
  return Math.min(TIMING.scrollMaxMs, TIMING.scrollBaseMs + TIMING.scrollPerRowMs * rows);
}

const SEQUENTIAL = new Set<CoreEvent['type']>(['fell', 'scrolled', 'shuffled']);

export function planTimeline(events: readonly CoreEvent[], opts: PlanOptions = {}): Plan {
  const steps: PlannedStep[] = [];
  const hitStops: number[] = [];
  let phaseStart = 0;
  let phaseEnd = 0;
  let shift = 0; // hit-stop delay accumulated inside the current phase
  let power: PowerTiming | null = null; // the power that opened the current phase, if any
  let chainAt = 0; // consequences of a boon wait for the reveal
  const chipAt = new Map<number, number>(); // last crust chip time per relic in this phase

  const hit = (cells: readonly Pos[], fallback: number): number => {
    if (!power || !cells.length) return fallback;
    let t = Infinity;
    for (const p of cells) t = Math.min(t, power.hitTime(p));
    return t + TIMING.powerHitLagMs;
  };

  for (const event of events) {
    if (event.type === 'won' || event.type === 'lost') {
      steps.push({ at: phaseEnd, block: 0, event });
      continue;
    }
    if (SEQUENTIAL.has(event.type)) {
      // Sequential steps wait for everything before them.
      const at = phaseEnd;
      let block: number;
      if (event.type === 'fell') {
        let rows = 0;
        for (const m of event.moves) rows = Math.max(rows, m.to.y - m.from.y);
        block = fallDuration(rows);
      } else if (event.type === 'scrolled') {
        block = scrollDuration(event.rows);
      } else {
        block = TIMING.shuffleMs;
      }
      steps.push({ at, block, event });
      phaseStart = phaseEnd = at + block;
      shift = 0;
      power = null;
      chainAt = 0;
      chipAt.clear();
      continue;
    }

    // Impact events: offset inside the phase and blocking time.
    const late = power ? power.duration * 0.55 : TIMING.awardAt;
    let offset = 0;
    let block = 0;
    switch (event.type) {
      case 'cleared':
        block = TIMING.popBlockMs + popStagger(event.size);
        break;
      case 'powerTriggered':
        power = powerTiming(event);
        block = power.duration;
        break;
      case 'dirtDamaged':
        offset = hit([event.at], TIMING.dirtAt);
        block = TIMING.dirtBlockMs;
        break;
      case 'bedrockShattered':
        offset = hit(event.cells, TIMING.bedrockAt);
        block = TIMING.bedrockBlockMs;
        break;
      case 'crustChipped': {
        const cells = power ? opts.relicCells?.(event.relicId) ?? [] : [];
        offset = power && !cells.length ? power.duration * 0.6 : hit(cells, TIMING.crustAt);
        block = TIMING.crustBlockMs;
        break;
      }
      case 'relicCollected':
        offset = Math.max(TIMING.relicAt, (chipAt.get(event.relicId) ?? 0) + 25);
        break;
      case 'boonGained':
        offset = 0;
        break;
      case 'recoloured':
        block = TIMING.recolourBlockMs;
        break;
      case 'powerCharged':
      case 'powerSkipped':
        offset = event.source === 'group' || event.source === 'geode' ? TIMING.awardAt : late;
        break;
      case 'geodeCleared':
      case 'bonusMove':
      case 'reforgeTokenEarned':
        offset = event.type === 'geodeCleared' ? TIMING.awardAt : late;
        break;
      default:
        offset = TIMING.awardAt;
        break;
    }
    let at = phaseStart + offset + shift;
    if (event.type !== 'boonGained' && event.type !== 'relicCollected' && chainAt > 0) at = Math.max(at, chainAt);
    if (event.type === 'boonGained') {
      const prev = steps[steps.length - 1];
      at = prev && prev.event.type === 'relicCollected' ? prev.at : at;
    }
    steps.push({ at, block, event });
    phaseEnd = Math.max(phaseEnd, at + block);
    if (event.type === 'crustChipped') chipAt.set(event.relicId, at - phaseStart - shift);
    if (event.type === 'relicCollected') {
      hitStops.push(at);
      shift += TIMING.hitStopMs;
      phaseEnd = Math.max(phaseEnd, at + TIMING.hitStopMs);
      chainAt = at + TIMING.hitStopMs + TIMING.boonChainMs;
    }
  }
  return { steps, hitStops, settleAt: phaseEnd };
}
