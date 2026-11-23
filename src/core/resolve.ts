// Shared tail of every action (resolution steps in docs/architecture.md).
import { applyGravity, isRelicVisible, isStranded, scrollStep, touchesBedrock } from './board';
import { TOKEN_THREE_STAR_CHANCE, awardToken, collectRelic, drawFloat } from './effects';
import { resolveDeadBoard } from './shuffle';
import type { CoreEvent, LevelState } from './types';

/** Starting move budget used for stars. null = unlimited. */
export function moveBudget(state: LevelState): number | null {
  return state.def.moves;
}

/** 3 at >= 40% of the budget left, 2 at >= 15%, otherwise 1. Continue caps at 1; unlimited gives 3. */
export function stars(state: LevelState): 1 | 2 | 3 {
  const budget = moveBudget(state);
  if (budget === null) return 3;
  if (state.continueUsed) return 1;
  const left = state.movesLeft ?? 0;
  if (left * 100 >= budget * 40) return 3;
  if (left * 100 >= budget * 15) return 2;
  return 1;
}

/**
 * Gravity, then scroll, then frees stranded visible relics (except sealed ones that touch bedrock);
 * repeats while a relic was freed (its cells empty, which can unblock the scroll).
 * Emits `fell`/`scrolled` only when non-empty.
 */
export function settleBoard(state: LevelState, events: CoreEvent[]): void {
  for (let guard = 0; guard < 64; guard++) {
    const moves = applyGravity(state);
    if (moves.length) events.push({ type: 'fell', moves });
    const rows = scrollStep(state);
    if (rows) events.push({ type: 'scrolled', rows, scroll: state.scroll });
    let freed = false;
    for (const relic of state.relics) {
      if (relic.collected || !isRelicVisible(state, relic) || !isStranded(state, relic)) continue;
      if (touchesBedrock(state, relic)) continue; // sealed: a power must break the slab (shuffle.ts rescue)
      relic.crust = 0;
      events.push({ type: 'crustChipped', relicId: relic.id, crust: 0 });
      collectRelic(state, relic, events);
      freed = true;
    }
    if (!freed) return;
  }
}

/** Win (checked first: collected >= goal, any relic counts) or lose (0 moves and an empty tray). */
export function endCheck(state: LevelState, events: CoreEvent[]): void {
  if (state.status !== 'playing') return;
  if (state.collected >= state.goal) {
    state.status = 'won';
    state.armed = null;
    const s = stars(state);
    events.push({ type: 'won', stars: s });
    if (s === 3 && drawFloat(state) < TOKEN_THREE_STAR_CHANCE) awardToken(state, 'three_stars', events);
  } else if (state.movesLeft === 0 && state.tray.length === 0) {
    state.status = 'lost';
    state.armed = null;
    events.push({ type: 'lost' });
  }
}

/** The steps after the action-specific part. `cost` is the move cost of the action. */
export function finishAction(state: LevelState, events: CoreEvent[], cost: number): void {
  settleBoard(state, events);
  if (cost > 0) {
    state.movesUsed += cost;
    if (state.movesLeft !== null) state.movesLeft = Math.max(0, state.movesLeft - cost);
  }
  endCheck(state, events);
  resolveDeadBoard(state, events);
}
