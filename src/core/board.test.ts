import { describe, expect, it } from 'vitest';
import { applyGravity, findGroup, hasAnyGroup, isRelicGone, isStranded, isStuckGem, listGroups, scrollStep } from './board';
import { tap } from './actions';
import { ascii, level, raw } from './testkit';
import type { Pos } from './types';

const E = '........';
const pad = (rows: string[], n: number) => [...rows, ...Array<string>(Math.max(0, n - rows.length)).fill(E)];
const keys = (ps: Pos[]) => ps.map((p) => `${p.x},${p.y}`);

describe('findGroup (flood fill)', () => {
  const s = raw(pad(['rrb.....', 'rbb.....', 'gbg1....', 'y.y.....'], 10));
  it.each([
    [{ x: 0, y: 0 }, ['0,0', '1,0', '0,1']],
    [{ x: 2, y: 0 }, ['2,0', '1,1', '2,1', '1,2']],
    [{ x: 0, y: 2 }, ['0,2']], // diagonal neighbours do not connect
    [{ x: 2, y: 2 }, ['2,2']],
    [{ x: 1, y: 3 }, []], // empty
    [{ x: 3, y: 2 }, []], // dirt
    [{ x: 9, y: 0 }, []], // off board
  ])('at %o', (at, expected) => {
    expect(keys(findGroup(s, at))).toEqual(expected);
  });

  it('only sees the visible window', () => {
    // Rubies at rows 0-1 and 8-11; with scroll 1 the view is rows 1..10.
    const t = raw(pad(['r.......', 'r.......'], 12).map((r, y) => (y >= 8 ? 'r.......' : r)), { scroll: 1 });
    expect(findGroup(t, { x: 0, y: 0 })).toEqual([]); // above the view
    expect(keys(findGroup(t, { x: 0, y: 1 }))).toEqual(['0,1']); // row 0 is hidden, so no pair
    // Row 11 is hidden below the view and does not join.
    expect(keys(findGroup(t, { x: 0, y: 8 }))).toEqual(['0,8', '0,9', '0,10']);
  });

  it('lists groups and detects any group', () => {
    const s2 = raw(pad(['rrb.....', 'gbb.....'], 10));
    expect(listGroups(s2).map((g) => g.length)).toEqual([2, 3]);
    expect(hasAnyGroup(s2)).toBe(true);
    expect(hasAnyGroup(raw(pad(['rbrb....', 'brbr....'], 10)))).toBe(false);
  });
});

describe('gravity', () => {
  it('drops blocks onto the floor, other blocks, dirt, bedrock and relics', () => {
    const s = raw([
      'r.g.....',
      '..1.....',
      'b.......',
      '.....b..',
      '1.....y.',
      '......A.',
      E,
      '....XXXX',
      'p.......',
      E,
    ]);
    const moves = applyGravity(s);
    expect(ascii(s)).toEqual([
      '..g.....',
      '..1.....',
      'r.......',
      'b.......',
      '1.....y.',
      '......A.',
      '.....b..',
      '....XXXX',
      E,
      'p.......',
    ]);
    expect(moves).toEqual([
      { from: { x: 0, y: 8 }, to: { x: 0, y: 9 } },
      { from: { x: 0, y: 2 }, to: { x: 0, y: 3 } },
      { from: { x: 0, y: 0 }, to: { x: 0, y: 2 } },
      { from: { x: 5, y: 3 }, to: { x: 5, y: 6 } },
    ]);
    expect(applyGravity(s)).toEqual([]);
  });

  it('applies to the whole column, including rows outside the view', () => {
    const s = raw(pad(['r.......'], 14), { scroll: 3 });
    applyGravity(s);
    expect(ascii(s)[13]).toBe('r.......');
  });
});

describe('scroll', () => {
  it('scrolls while the top 3 visible rows hold no block, ignoring fixed cells', () => {
    const s = raw(pad(['1.......', '..XXXX..', '...3....', E, E, 'rrbbggyy'], 20));
    expect(scrollStep(s)).toBe(3);
    expect(s.scroll).toBe(3);
    expect(s.maxDepth).toBe(3);
    expect(scrollStep(s)).toBe(0);
  });

  it('a row of lone, unreachable gems on the floor does not hold the scroll either', () => {
    const s = raw(pad([], 12).map((r, y) => (y === 2 ? 'rbrbrbrb' : r)));
    s.grid[3] = s.grid[2]!.map(() => ({ kind: 'dirt', hp: 1 }));
    expect(scrollStep(s)).toBe(2);
  });

  it('does not scroll while any of the top 3 rows has a (tappable) block', () => {
    const s = raw(pad([E, E, '......gg', 'g.......'], 20));
    expect(scrollStep(s)).toBe(0);
  });

  it('stops at the level bottom', () => {
    const s = raw(pad([], 13));
    expect(scrollStep(s)).toBe(3);
    expect(s.scroll).toBe(3);
  });

  it('lets an uncollected BONUS relic scroll away (goal relics never do)', () => {
    const s = raw(pad([E, E, '...A....'], 20), { bonus: [0] });
    expect(scrollStep(s)).toBe(10);
    expect(isRelicGone(s, s.relics[0]!)).toBe(true);
  });

  it('never scrolls an uncollected relic out of view', () => {
    const s = raw(pad([E, E, '...A....'], 20));
    expect(scrollStep(s)).toBe(2);
    expect(s.scroll).toBe(2);
    (s.relics[0] as { collected: boolean }).collected = true;
    s.grid[2] = E.split('').map(() => ({ kind: 'empty' }));
    expect(scrollStep(s)).toBe(8);
    expect(s.scroll).toBe(10);
  });

  it('ignores stuck gems (lone, on a ledge, nothing can ever reach them)', () => {
    // Lone ruby on a dirt ledge at row 1; the rest of the board is lower down.
    const s = raw(pad([E, '..r.....', '..2.....', E, E, E, 'ggbbggbb'], 20));
    expect(isStuckGem(s, 2, 1)).toBe(true);
    expect(scrollStep(s)).toBe(4);
  });
});

describe('isStuckGem', () => {
  it.each([
    ['lone gem on a ledge', ['..r.....', '..1.....'], { x: 2, y: 0 }, true],
    ['same-colour neighbour', ['..rr....', '..11....'], { x: 2, y: 0 }, false],
    ['different-colour neighbour is fine', ['..rb....', '..11....'], { x: 2, y: 0 }, true],
    ['resting on a gem (can still drop)', ['..r.....', '..b.....', '..1.....'], { x: 2, y: 0 }, false],
    ['gem above in its column', ['..g.....', '........', '..r.....', '..1.....'], { x: 2, y: 2 }, false],
    ['gem above in a side column', ['...g....', '........', '..r.....', '..1.....'], { x: 2, y: 2 }, false],
    ['gem above, but behind a ledge', ['...g....', '...2....', '..r.....', '..1.....'], { x: 2, y: 2 }, true],
    ['side column blocked at its row', ['...g....', '........', '..r2....', '..1.....'], { x: 2, y: 2 }, true],
  ] as const)('%s', (_name, rows, at, stuck) => {
    expect(isStuckGem(raw(pad([...rows], 10)), at.x, at.y)).toBe(stuck);
  });
});

describe('isStranded (relic no block can ever touch)', () => {
  it.each([
    ['nothing around or above', [E, E, '...A....', E], true],
    ['live pair beside it', [E, E, '...Arr..', E], false],
    ['live block directly below it (resting on a gem)', [E, E, '...A....', '...g....', '...b....'], false],
    ['live pair far above in a side column', ['....gg..', '....11..', '...A....', E], false],
    ['only a stuck gem beside it (lone, nothing can reach it)', [E, E, '...Ar...', '....1...'], true],
    ['only a stuck gem on top of it', [E, E, '...r....', '...A....', '...3....'], true],
    ['a stuck gem far above in a side column', ['....g...', '....1...', '...A....', E], true],
    ['block two below (not a neighbour)', [E, E, '...A....', '...1....', '...g....'], true],
    ['dirt around it does not matter', [E, '...2....', '..1A1...', '...3....'], true],
  ] as const)('%s', (_name, rows, stranded) => {
    const s = raw(pad([...rows], 10));
    expect(isStranded(s, s.relics[0]!)).toBe(stranded);
  });

  it('works for 2x2 relics', () => {
    const s = raw(pad([E, '...AA...', '...AA...', '.....g..'], 10));
    expect(isStranded(s, s.relics[0]!)).toBe(true);
    const t = raw(pad([E, '...AA...', '...AAgg.'], 10));
    expect(isStranded(t, t.relics[0]!)).toBe(false);
  });
});

describe('isStranded: gems above the visible window (review H1)', () => {
  it('ignores a hidden gem resting on a top-row relic', () => {
    // The relic is in the top visible row; the ruby on top of it is above the window.
    const s = raw(pad([E, E, E, '...r....', '...A....', '..333...', 'gbgbgbgb'], 16), { scroll: 4 });
    expect(isStranded(s, s.relics[0]!)).toBe(true);
  });

  it('ignores hidden gems in a side column, but not visible live ones', () => {
    const rows = pad(['..g.....', '..1.....', '...A....', '...3....'], 14);
    const s = raw(rows, { scroll: 2 });
    expect(isStranded(s, s.relics[0]!)).toBe(true);
    // A live pair beside the relic in view still counts.
    const t = raw(pad(['..g.....', '..1.....', '.bbA....', '...3....'], 14), { scroll: 2 });
    expect(isStranded(t, t.relics[0]!)).toBe(false);
  });
});

describe('top-row relic with a lone gem on it (review H1 regression)', () => {
  const gems = Array.from({ length: 14 }, (_, i) => (i % 2 ? 'gygygygy' : 'bbggbbgg'));
  const rows = [E, E, E, '...r....', '...A....', '..333...', ...gems];

  it('frees the relic as soon as it is reachable by nothing, without burning moves', () => {
    const s = level(rows, { moves: 30 });
    // The ruby is stuck from the start, so the relic is stranded at once and the level is won.
    expect(s.relics[0]!.collected).toBe(true);
    expect(s.status).toBe('won');
    expect(s.movesUsed).toBe(0);
  });

  it('never leaves a crusted relic pinned in the top row with no live gem near it', () => {
    // Same picture, but the ruby has a partner so it is tappable: the relic must chip normally.
    const t = level([E, E, E, '...rr...', '...A3...', '..333...', ...gems], { moves: 30 });
    expect(t.relics[0]!.collected).toBe(false);
    const res = tap(t, { x: 3, y: 3 });
    expect(res.ok).toBe(true);
    // One chip from the clear, then nothing live is left around it: freed in the same action.
    expect(t.relics[0]!.collected).toBe(true);
    expect(t.movesUsed).toBe(1);
  });
});

