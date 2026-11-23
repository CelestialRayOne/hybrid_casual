// Local-only playtest event log (docs/architecture.md, "Telemetry"). NO NETWORK, EVER: events stay on the
// device and leave it only when the tester exports them by hand (`exportJson()`, e.g. from the ?debug=1 overlay).

/** Minimal synchronous storage (localStorage satisfies it). */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TelemetryEvent {
  /** ms since epoch */
  t: number;
  /** session id */
  s: string;
  type: string;
  data?: Record<string, unknown>;
}

/**
 * Event types the summary understands. Other types are stored and exported but not summarised.
 * `level` is the level id (number) in every level-scoped event.
 */
export const TELEMETRY_EVENTS = {
  sessionStart: 'session_start',       // logged automatically by createTelemetry
  sessionEnd: 'session_end',           // via endSession() (e.g. on pagehide); optional, lengths don't rely on it
  levelStart: 'level_start',           // { level, boss?, perks, seed }   one attempt
  levelWon: 'level_won',               // { level, boss?, movesLeft: number | null, stars, relics, goal, bonus }
  levelLost: 'level_lost',             // { level, boss? }      out of moves (before/without a continue)
  levelQuit: 'level_quit',             // { level, boss? }      left or restarted mid-level
  tap: 'tap',                          // { level, valid: boolean }
  powerCharged: 'power_charged',       // { level, color, powerLevel, merged, source }
  powerSkipped: 'power_skipped',       // { level, color, powerLevel, source } (tray full of stronger powers)
  powerUsed: 'power_used',             // { level, color, powerLevel }
  boonGained: 'boon_gained',           // { level, boon, stacks }
  geode: 'geode',                      // { level }
  bonusRelic: 'bonus_relic',           // { level }
  reforgeTokenEarned: 'reforge_token_earned', // { level, reason }
  reforgeUsed: 'reforge_used',         // { refunded }
  perkPointEarned: 'perk_point_earned', // { level }
  perkPointSpent: 'perk_point_spent',  // { perk, from: 'offer' | 'screen' }
  perkPointSaved: 'perk_point_saved',  // { level }
  continueUsed: 'continue_used',       // { level }
  /** v1 events, still counted as powers in old logs. */
  stampEarned: 'stamp_earned',
  stampUsed: 'stamp_used',
} as const;

export interface LevelSummary {
  level: number;
  attempts: number;
  wins: number;
  losses: number;
  quits: number;
  /** wins / attempts, 0..1 (0 when there are no attempts). */
  winRate: number;
  /** Mean `movesLeft` over wins with a numeric value; null if none. */
  avgMovesLeftOnWin: number | null;
  taps: number;
  invalidTaps: number;
  /** invalidTaps / taps * 100 (0 when there are no taps). */
  invalidTapPct: number;
  /** Powers charged (v1 logs: stamps earned). */
  powersEarned: number;
  /** Powers used (v1 logs: stamps placed). */
  powersUsed: number;
  boons: number;
  geodes: number;
  bonusRelics: number;
  reforgeTokens: number;
  continues: number;
}

export interface TelemetrySummary {
  levels: LevelSummary[];
  totals: Omit<LevelSummary, 'level'>;
  sessions: number;
  /** Mean of (last event - first event) per session, in ms. */
  avgSessionMs: number;
  events: number;
}

export interface Telemetry {
  readonly sessionId: string;
  log(type: string, data?: Record<string, unknown>): void;
  events(): TelemetryEvent[];
  summary(): TelemetrySummary;
  exportJson(): string;
  /** Deletes every stored event (this session keeps its id). */
  clear(): void;
  /** Writes pending events now (call on pagehide / visibility hidden). */
  flush(): void;
  /** Logs `session_end` and flushes. */
  endSession(): void;
}

export interface TelemetryOptions {
  /**
   * Ring buffer size. Default 2000 (about 60-100 KB stored in the compact format; the log shares localStorage with
   * the save, so it must stay small).
   */
  max?: number;
  /** Storage key. Default 'gemdig.telemetry.v1'. */
  key?: string;
  /** Persistence delay after a log. Default 1000 ms. */
  persistDelayMs?: number;
  /** Clock (ms epoch). Default Date.now. */
  now?: () => number;
  /** Session id. Default random. */
  sessionId?: string;
}

/**
 * Stored format. v2 is compact: `{ v: 2, s: [sessionIds], e: [[t, sessionIndex, type, data?], ...] }`.
 * v1 (`{ v: 1, events: TelemetryEvent[] }`) and bare arrays are still read. Exports use the readable v1 shape.
 */
const STORE_VERSION = 2;
const EXPORT_VERSION = 1;
export const DEFAULT_TELEMETRY_MAX = 2000;
export const DEFAULT_TELEMETRY_KEY = 'gemdig.telemetry.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEvent(v: unknown): v is TelemetryEvent {
  return (
    isRecord(v) && typeof v.t === 'number' && Number.isFinite(v.t) && typeof v.s === 'string' &&
    typeof v.type === 'string' && (v.data === undefined || isRecord(v.data))
  );
}

/** Compact v2 encoding of an event list (see STORE_VERSION). */
export function encodeStoredEvents(events: readonly TelemetryEvent[]): string {
  const sessions: string[] = [];
  const index = new Map<string, number>();
  const rows = events.map((e) => {
    let i = index.get(e.s);
    if (i === undefined) {
      i = sessions.length;
      sessions.push(e.s);
      index.set(e.s, i);
    }
    return e.data === undefined ? [e.t, i, e.type] : [e.t, i, e.type, e.data];
  });
  return JSON.stringify({ v: STORE_VERSION, s: sessions, e: rows });
}

function decodeRow(row: unknown, sessions: readonly unknown[]): unknown {
  if (!Array.isArray(row)) return null;
  const [t, i, type, data] = row as unknown[];
  const s = typeof i === 'number' ? sessions[i] : undefined;
  return row.length > 3 ? { t, s, type, data } : { t, s, type };
}

/** Parses stored events (v2 compact, v1 or a bare array), dropping anything malformed. Never throws. */
export function parseStoredEvents(json: string | null): TelemetryEvent[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    let list: unknown[] = [];
    if (isRecord(raw) && Array.isArray(raw.e)) {
      const sessions = Array.isArray(raw.s) ? raw.s : [];
      list = raw.e.map((row) => decodeRow(row, sessions));
    } else if (isRecord(raw) && Array.isArray(raw.events)) list = raw.events;
    else if (Array.isArray(raw)) list = raw;
    return list.filter(isEvent);
  } catch {
    return [];
  }
}

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  try {
    if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  } catch {
    // fall through
  }
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

function emptyCounts(): Omit<LevelSummary, 'level'> {
  return {
    attempts: 0, wins: 0, losses: 0, quits: 0, winRate: 0, avgMovesLeftOnWin: null, taps: 0, invalidTaps: 0,
    invalidTapPct: 0, powersEarned: 0, powersUsed: 0, boons: 0, geodes: 0, bonusRelics: 0, reforgeTokens: 0, continues: 0,
  };
}

/** Pure summary maths over an event list (exported for tests and offline analysis). */
export function summarize(events: readonly TelemetryEvent[]): TelemetrySummary {
  const E = TELEMETRY_EVENTS;
  const perLevel = new Map<number, Omit<LevelSummary, 'level'> & { movesLeftSum: number; movesLeftN: number }>();
  const totals = { ...emptyCounts(), movesLeftSum: 0, movesLeftN: 0 };
  const sessions = new Map<string, { first: number; last: number }>();

  for (const e of events) {
    const span = sessions.get(e.s);
    if (span) {
      span.first = Math.min(span.first, e.t);
      span.last = Math.max(span.last, e.t);
    } else {
      sessions.set(e.s, { first: e.t, last: e.t });
    }

    const lvl = e.data?.level;
    if (typeof lvl !== 'number' || !Number.isInteger(lvl)) continue;
    let row = perLevel.get(lvl);
    if (!row) {
      row = { ...emptyCounts(), movesLeftSum: 0, movesLeftN: 0 };
      perLevel.set(lvl, row);
    }
    for (const r of [row, totals]) {
      switch (e.type) {
        case E.levelStart: r.attempts++; break;
        case E.levelWon: {
          r.wins++;
          const ml = e.data?.movesLeft;
          if (typeof ml === 'number' && Number.isFinite(ml)) { r.movesLeftSum += ml; r.movesLeftN++; }
          break;
        }
        case E.levelLost: r.losses++; break;
        case E.levelQuit: r.quits++; break;
        case E.tap: r.taps++; if (e.data?.valid === false) r.invalidTaps++; break;
        case E.powerCharged: case E.stampEarned: r.powersEarned++; break;
        case E.powerUsed: case E.stampUsed: r.powersUsed++; break;
        case E.boonGained: r.boons++; break;
        case E.geode: r.geodes++; break;
        case E.bonusRelic: r.bonusRelics++; break;
        case E.reforgeTokenEarned: r.reforgeTokens++; break;
        case E.continueUsed: r.continues++; break;
      }
    }
  }

  const finish = <T extends Omit<LevelSummary, 'level'> & { movesLeftSum: number; movesLeftN: number }>(r: T) => {
    const { movesLeftSum, movesLeftN, ...rest } = r;
    return {
      ...rest,
      winRate: r.attempts > 0 ? r.wins / r.attempts : 0,
      avgMovesLeftOnWin: movesLeftN > 0 ? movesLeftSum / movesLeftN : null,
      invalidTapPct: r.taps > 0 ? (r.invalidTaps / r.taps) * 100 : 0,
    };
  };

  const spans = [...sessions.values()];
  return {
    levels: [...perLevel.entries()].sort(([a], [b]) => a - b).map(([level, r]) => ({ level, ...finish(r) })),
    totals: finish(totals),
    sessions: spans.length,
    avgSessionMs: spans.length > 0 ? spans.reduce((sum, s) => sum + (s.last - s.first), 0) / spans.length : 0,
    events: events.length,
  };
}

export function createTelemetry(storage: KeyValue | null, opts: TelemetryOptions = {}): Telemetry {
  let max = Math.max(1, Math.floor(opts.max ?? DEFAULT_TELEMETRY_MAX));
  const key = opts.key ?? DEFAULT_TELEMETRY_KEY;
  const delay = opts.persistDelayMs ?? 1000;
  const now = opts.now ?? Date.now;
  const sessionId = opts.sessionId ?? randomId();

  let buffer: TelemetryEvent[] = [];
  if (storage) {
    try {
      buffer = parseStoredEvents(storage.getItem(key));
    } catch {
      buffer = [];
    }
  }
  if (buffer.length > max) buffer = buffer.slice(buffer.length - max);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  function write(): void {
    if (!storage || !dirty) return;
    let events = buffer;
    // On quota errors keep the newest half and retry, down to nothing. Once a trimmed copy fits, the in-memory
    // buffer and its cap shrink to match, so later writes don't hit the quota (and re-serialise) every time.
    // If even an empty log cannot be written, storage is unusable (private mode, denied): keep memory as is.
    while (true) {
      try {
        storage.setItem(key, encodeStoredEvents(events));
        dirty = false;
        if (events !== buffer) {
          buffer = events.slice();
          max = Math.max(1, buffer.length);
        }
        return;
      } catch {
        if (events.length === 0) return;
        events = events.slice(Math.ceil(events.length / 2));
      }
    }
  }

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    write();
  }

  function schedule(): void {
    dirty = true;
    // At most one write per `delay` while events keep coming (a pure debounce could starve under constant logging).
    if (!storage || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, delay);
  }

  function log(type: string, data?: Record<string, unknown>): void {
    const e: TelemetryEvent = { t: now(), s: sessionId, type: String(type) };
    if (data !== undefined) {
      try {
        // Snapshot so later mutation by the caller can't change history; drops non-JSON values.
        const copy: unknown = JSON.parse(JSON.stringify(data));
        if (isRecord(copy)) e.data = copy;
      } catch {
        // Non-serialisable data (cycles, BigInt): keep the event without data.
      }
    }
    buffer.push(e);
    if (buffer.length > max) buffer.splice(0, buffer.length - max);
    schedule();
  }

  log(TELEMETRY_EVENTS.sessionStart);

  return {
    sessionId,
    log,
    events: () => buffer.map((e) => ({ ...e, ...(e.data ? { data: { ...e.data } } : {}) })),
    summary: () => summarize(buffer),
    exportJson: () =>
      JSON.stringify({ v: EXPORT_VERSION, exportedAt: now(), sessionId, summary: summarize(buffer), events: buffer }, null, 2),
    clear() {
      buffer = [];
      dirty = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    },
    flush,
    endSession() {
      log(TELEMETRY_EVENTS.sessionEnd);
      flush();
    },
  };
}
