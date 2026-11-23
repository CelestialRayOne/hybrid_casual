import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TELEMETRY_KEY, type KeyValue, type TelemetryEvent, createTelemetry, parseStoredEvents, summarize } from './index';

function fakeStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  const writes: string[] = [];
  const kv: KeyValue = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { writes.push(k); data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
  return { kv, data, writes };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createTelemetry', () => {
  it('logs session_start with the event shape', () => {
    const t = createTelemetry(null, { now: () => 1000, sessionId: 'abc' });
    t.log('tap', { level: 1, valid: true });
    expect(t.events()).toEqual([
      { t: 1000, s: 'abc', type: 'session_start' },
      { t: 1000, s: 'abc', type: 'tap', data: { level: 1, valid: true } },
    ]);
  });

  it('caps the ring buffer, keeping the newest events', () => {
    const t = createTelemetry(null, { max: 5 });
    for (let i = 0; i < 20; i++) t.log('n', { i });
    const ev = t.events();
    expect(ev).toHaveLength(5);
    expect(ev.map((e) => e.data?.i)).toEqual([15, 16, 17, 18, 19]);
  });

  it('defaults to 2000 events', () => {
    const t = createTelemetry(null);
    for (let i = 0; i < 2100; i++) t.log('n');
    expect(t.events()).toHaveLength(2000);
  });

  it('stores a compact format and still reads the old v1 format', () => {
    const { kv, data } = fakeStorage();
    const t = createTelemetry(kv, { sessionId: 'sess', now: () => 5 });
    t.log('tap', { level: 2, valid: true });
    t.flush();
    const stored = JSON.parse(data.get(DEFAULT_TELEMETRY_KEY)!) as { v: number; s: string[]; e: unknown[] };
    expect(stored).toEqual({ v: 2, s: ['sess'], e: [[5, 0, 'session_start'], [5, 0, 'tap', { level: 2, valid: true }]] });
    expect(parseStoredEvents(data.get(DEFAULT_TELEMETRY_KEY)!)).toEqual(t.events());
    const v1 = JSON.stringify({ v: 1, events: [{ t: 1, s: 'a', type: 'x' }] });
    expect(parseStoredEvents(v1)).toEqual([{ t: 1, s: 'a', type: 'x' }]);
    expect(parseStoredEvents(JSON.stringify({ v: 2, s: ['a'], e: [[1, 0, 'ok'], [2, 9, 'no session'], 'junk', [3, 0, 'bad', [1]]] }))).toEqual([
      { t: 1, s: 'a', type: 'ok' },
    ]);
  });

  it('debounces persistence to one write per second and flushes on demand', () => {
    const { kv, data, writes } = fakeStorage();
    const t = createTelemetry(kv, { sessionId: 's1' });
    for (let i = 0; i < 50; i++) t.log('n');
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(999);
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(writes).toHaveLength(1);
    t.log('m');
    t.flush();
    expect(writes).toHaveLength(2);
    vi.advanceTimersByTime(5000);
    expect(writes).toHaveLength(2); // timer cancelled by flush, nothing dirty
    expect(parseStoredEvents(data.get(DEFAULT_TELEMETRY_KEY)!)).toHaveLength(52);
  });

  it('restores stored events across sessions', () => {
    const { kv } = fakeStorage();
    const a = createTelemetry(kv, { sessionId: 'a' });
    a.log('tap', { level: 1, valid: false });
    a.endSession();
    const b = createTelemetry(kv, { sessionId: 'b' });
    expect(b.events().map((e) => `${e.s}:${e.type}`)).toEqual(['a:session_start', 'a:tap', 'a:session_end', 'b:session_start']);
    expect(b.summary().sessions).toBe(2);
  });

  it('survives corrupt stored data', () => {
    for (const raw of ['{nope', 'null', '42', '{"events":"x"}']) {
      const t = createTelemetry(fakeStorage({ [DEFAULT_TELEMETRY_KEY]: raw }).kv, { sessionId: 'x' });
      expect(t.events().map((e) => e.type)).toEqual(['session_start']);
    }
    const mixed = JSON.stringify({
      v: 1,
      events: [{ t: 1, s: 'a', type: 'ok' }, { t: 'x', s: 'a', type: 'bad' }, null, { t: 2, s: 'a', type: 'bad', data: [1] }, { t: 3, s: 'a', type: 'ok2', data: {} }],
    });
    const t = createTelemetry(fakeStorage({ [DEFAULT_TELEMETRY_KEY]: mixed }).kv, { sessionId: 'x' });
    expect(t.events().map((e) => e.type)).toEqual(['ok', 'ok2', 'session_start']);
  });

  it('survives storage that throws', () => {
    const fail = () => { throw new Error('denied'); };
    const t = createTelemetry({ getItem: fail, setItem: fail, removeItem: fail });
    t.log('n');
    expect(() => { vi.advanceTimersByTime(2000); t.flush(); t.clear(); }).not.toThrow();
    expect(t.events()).toHaveLength(0);
  });

  it('trims on quota errors instead of losing everything', () => {
    const { kv, data } = fakeStorage();
    const real = kv.setItem;
    kv.setItem = (k, v) => { if (v.length > 400) throw new Error('QuotaExceededError'); real(k, v); };
    const t = createTelemetry(kv, { sessionId: 's' });
    for (let i = 0; i < 20; i++) t.log('n');
    t.flush();
    const kept = parseStoredEvents(data.get(DEFAULT_TELEMETRY_KEY)!);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(21);
    expect(kept.at(-1)?.type).toBe('n');
    // The in-memory buffer is trimmed too, so the next write fits without hitting the quota again.
    expect(t.events()).toHaveLength(kept.length);
    let failures = 0;
    const counting = kv.setItem;
    kv.setItem = (k, v) => { try { counting(k, v); } catch (e) { failures++; throw e; } };
    t.log('m');
    t.flush();
    expect(failures).toBe(0);
    expect(t.events().at(-1)?.type).toBe('m');
  });

  it('keeps events in memory when storage refuses every write', () => {
    const { kv } = fakeStorage();
    kv.setItem = () => { throw new Error('SecurityError'); };
    const t = createTelemetry(kv, { sessionId: 's' });
    for (let i = 0; i < 5; i++) t.log('n');
    t.flush();
    expect(t.events()).toHaveLength(6);
  });

  it('snapshots data and drops non-serialisable data', () => {
    const t = createTelemetry(null);
    const d: Record<string, unknown> = { level: 1 };
    t.log('a', d);
    d.level = 2;
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    t.log('b', cyclic);
    const [, a, b] = t.events();
    expect(a!.data).toEqual({ level: 1 });
    expect(b!.data).toBeUndefined();
  });

  it('clear wipes memory and storage', () => {
    const { kv, data } = fakeStorage();
    const t = createTelemetry(kv);
    t.log('n');
    t.flush();
    t.clear();
    expect(t.events()).toEqual([]);
    expect(data.has(DEFAULT_TELEMETRY_KEY)).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(data.has(DEFAULT_TELEMETRY_KEY)).toBe(false);
  });

  it('exports JSON with summary and events, without network', () => {
    const t = createTelemetry(null, { sessionId: 'z' });
    t.log('level_start', { level: 1 });
    const out = JSON.parse(t.exportJson());
    expect(out.sessionId).toBe('z');
    expect(out.events).toHaveLength(2);
    expect(out.summary.totals.attempts).toBe(1);
  });
});

describe('summarize', () => {
  const ev = (t: number, s: string, type: string, data?: Record<string, unknown>): TelemetryEvent => ({ t, s, type, ...(data ? { data } : {}) });

  it('computes per-level and session statistics', () => {
    const events = [
      ev(0, 'a', 'session_start'),
      ev(10, 'a', 'level_start', { level: 1 }),
      ev(11, 'a', 'tap', { level: 1, valid: true }),
      ev(12, 'a', 'tap', { level: 1, valid: false }),
      ev(13, 'a', 'tap', { level: 1, valid: true }),
      ev(14, 'a', 'tap', { level: 1, valid: true }),
      ev(15, 'a', 'stamp_earned', { level: 1 }),
      ev(16, 'a', 'stamp_used', { level: 1 }),
      ev(20, 'a', 'level_won', { level: 1, movesLeft: 4, stars: 3 }),
      ev(30, 'a', 'level_start', { level: 2 }),
      ev(40, 'a', 'level_lost', { level: 2 }),
      ev(41, 'a', 'continue_used', { level: 2 }),
      ev(50, 'a', 'level_won', { level: 2, movesLeft: 1 }),
      ev(1000, 'b', 'session_start'),
      ev(1100, 'b', 'level_start', { level: 2 }),
      ev(1200, 'b', 'level_quit', { level: 2 }),
      ev(1300, 'b', 'level_start', { level: 1 }),
      ev(1400, 'b', 'level_won', { level: 1, movesLeft: null }), // unlimited moves: excluded from the average
      ev(1500, 'b', 'level_start', { level: 1 }),
      ev(1600, 'b', 'level_won', { level: 1, movesLeft: 8 }),
      ev(1700, 'b', 'tap', { level: 'x' }), // ignored for level stats
    ];
    const s = summarize(events);
    expect(s.sessions).toBe(2);
    expect(s.avgSessionMs).toBe((50 + 700) / 2);
    expect(s.events).toBe(events.length);

    const l1 = s.levels.find((l) => l.level === 1)!;
    expect(l1).toMatchObject({ attempts: 3, wins: 3, winRate: 1, avgMovesLeftOnWin: 6, taps: 4, invalidTaps: 1, invalidTapPct: 25, powersEarned: 1, powersUsed: 1 });
    const l2 = s.levels.find((l) => l.level === 2)!;
    expect(l2).toMatchObject({ attempts: 2, wins: 1, losses: 1, quits: 1, continues: 1, winRate: 0.5, avgMovesLeftOnWin: 1, invalidTapPct: 0 });
    expect(s.levels.map((l) => l.level)).toEqual([1, 2]);
    expect(s.totals).toMatchObject({ attempts: 5, wins: 4, winRate: 0.8, avgMovesLeftOnWin: 13 / 3, taps: 4, invalidTapPct: 25 });
  });

  it('handles an empty log', () => {
    const s = summarize([]);
    expect(s).toMatchObject({ sessions: 0, avgSessionMs: 0, levels: [], events: 0 });
    expect(s.totals.winRate).toBe(0);
    expect(s.totals.avgMovesLeftOnWin).toBeNull();
  });

  it('counts v2 power, boon, geode, bonus relic and token events per level', () => {
    const events = [
      ev(0, 'a', 'level_start', { level: 5, boss: true }),
      ev(1, 'a', 'power_charged', { level: 5, color: 1, powerLevel: 1, merged: false, source: 'group' }),
      ev(2, 'a', 'power_charged', { level: 5, color: 1, powerLevel: 2, merged: true, source: 'group' }),
      ev(3, 'a', 'power_used', { level: 5, color: 1, powerLevel: 2 }),
      ev(4, 'a', 'boon_gained', { level: 5, boon: 'chalice', stacks: 1 }),
      ev(5, 'a', 'geode', { level: 5 }),
      ev(6, 'a', 'bonus_relic', { level: 5 }),
      ev(7, 'a', 'reforge_token_earned', { level: 5, reason: 'bonus_relics' }),
      ev(8, 'a', 'perk_point_earned', { level: 5 }),
      ev(9, 'a', 'reforge_used', { refunded: 2 }),
    ];
    const s = summarize(events);
    const l5 = s.levels.find((l) => l.level === 5)!;
    expect(l5).toMatchObject({ attempts: 1, powersEarned: 2, powersUsed: 1, boons: 1, geodes: 1, bonusRelics: 1, reforgeTokens: 1 });
    expect(s.totals).toMatchObject({ powersEarned: 2, powersUsed: 1 });
  });
});
