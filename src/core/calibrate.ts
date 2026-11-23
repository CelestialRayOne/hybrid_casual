// Difficulty calibration: how many moves each level gets.
//
// The casual player model (bot.ts, CASUAL_PROFILE) plays each level CALIBRATION_RUNS times, run i on ATTEMPT
// seed i (so every run sees a different random attempt: colours, geodes, bonus relics, relic types) with model
// seed i. A level's move budget is the one whose casual win rate is closest to the target (targetWinRate;
// ties go to the more generous budget). The result is precomputed into LEVEL_MOVES (levelTable.ts) so nothing
// is simulated at runtime; the TUNING=1 report in tuning.test.ts recomputes the table, checks it against the
// committed one and can rewrite it. Everything here is deterministic.
import { playBot, playCasual, RANDOM_PROFILE } from './bot';
import type { BotResult, CasualProfile } from './bot';
import { createLevelState } from './level';
import type { LevelDef } from './types';

/** Casual runs per level (attempt seeds 1..N). */
export const CALIBRATION_RUNS = 60;
/** Move budget used for "unlimited" calibration runs. */
const PLENTY = 999;

/**
 * Target first-try win rate of the casual model, per level id. Level 1 has no move limit.
 * Onboarding (2-5) is nearly always won; the middle (6-15) about 70% with the hard boss levels 10 and 15
 * near a coin flip; the last stretch (16-19) 56%, the final boss 20 hardest.
 */
export function targetWinRate(id: number): number | null {
  if (id <= 1) return null;
  if (id <= 5) return 0.92;
  if (id === 10 || id === 15) return 0.53;
  if (id <= 15) return 0.7;
  if (id === 20) return 0.45;
  return 0.56;
}

export interface Calibration {
  id: number;
  moves: number | null;
  /** Moves the greedy bot needs on attempt 1 (unlimited budget). */
  greedyMoves: number;
  /** Casual model win rate at `moves` (1 for unlimited levels). */
  casualWinRate: number;
  /** Uniform random play win rate at `moves`. */
  randomWinRate: number;
  /** Median casual moves-to-win with an unlimited budget. */
  casualMedian: number;
  /** Relics on the board per attempt (goal + bonus): mean, min, max over the runs. */
  relics: { mean: number; min: number; max: number };
  /** Casual power uses per game at the budget: mean, min, max. */
  powerUses: { mean: number; min: number; max: number };
  /** Mean bonus relics collected per game at the budget. */
  bonusCollected: number;
}

function runs(def: LevelDef, moves: number, profile: Readonly<CasualProfile> | undefined, n: number): BotResult[] {
  const d: LevelDef = { ...def, moves };
  const out: BotResult[] = [];
  for (let i = 1; i <= n; i++) out.push(playCasual(d, [], i, i, profile ? { profile } : {}));
  return out;
}

const rate = (rs: BotResult[]) => rs.filter((r) => r.won).length / rs.length;
const stat = (xs: number[]) => ({
  mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  min: Math.min(...xs),
  max: Math.max(...xs),
});

/** Calibrates one level (its own `moves` field is ignored). */
export function calibrateLevel(def: LevelDef, n = CALIBRATION_RUNS): Calibration {
  const target = targetWinRate(def.id);
  const open: LevelDef = { ...def, moves: def.moves === null && target === null ? null : PLENTY };
  const greedyMoves = playBot(open, [], 1).movesUsed;
  const relicCounts: number[] = [];
  for (let i = 1; i <= n; i++) relicCounts.push(createLevelState(def, [], i).relics.length);
  const unlimited = runs(open, PLENTY, undefined, n);
  const used = unlimited.map((r) => (r.won ? r.movesUsed : PLENTY)).sort((a, b) => a - b);
  const casualMedian = used[Math.floor((n - 1) / 2)] as number;
  const summary = (rs: BotResult[]) => ({
    relics: stat(relicCounts),
    powerUses: stat(rs.map((r) => r.powersUsed)),
    bonusCollected: rs.reduce((a, r) => a + r.bonusCollected, 0) / rs.length,
  });
  if (target === null) {
    return { id: def.id, moves: null, greedyMoves, casualWinRate: rate(unlimited), randomWinRate: 1, casualMedian, ...summary(unlimited) };
  }
  // The unlimited-budget distribution gives the estimate; real runs at that budget confirm it (Sun Coins,
  // the free last-chance power and the end check make the two differ slightly).
  const estimate = used[Math.max(0, Math.ceil(target * n) - 1)] as number;
  let moves = Math.max(1, Math.min(PLENTY - 1, estimate) - 3);
  let at = runs(def, moves, undefined, n);
  while (rate(at) < target && moves < PLENTY) at = runs(def, ++moves, undefined, n);
  if (moves > 1) {
    const lower = runs(def, moves - 1, undefined, n);
    if (target - rate(lower) < rate(at) - target) {
      moves--;
      at = lower;
    }
  }
  return {
    id: def.id,
    moves,
    greedyMoves,
    casualWinRate: rate(at),
    randomWinRate: rate(runs(def, moves, RANDOM_PROFILE, n)),
    casualMedian,
    ...summary(at),
  };
}
