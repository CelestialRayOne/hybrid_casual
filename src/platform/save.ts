// Player progress persistence behind the async `SaveStore` interface (see docs/architecture.md, "Platform API").
//
// Backends:
// - `localStorageSaveStore(key)`: the MVP backend (web, Basic Launch).
// - `memorySaveStore()`: tests and the fallback when storage is unavailable.
// - Future: a CrazyGames Data-module store for Full Launch. `window.CrazyGames.SDK.data` exposes the same
//   synchronous getItem/setItem/removeItem shape as localStorage (docs.crazygames.com/sdk/data/), limited to
//   1 MB of JSON in total, so it plugs in through `kvSaveStore(kv, key)` below. On first run that store copies
//   the existing localStorage value into the Data module when the Data module has none (portal guidance), then
//   reads only from the Data module. A Capacitor Preferences store (async) would implement `SaveStore` directly.
//
// All loaded data goes through `migrateProgress` then `sanitizeProgress`, so a corrupt, partial or hand-edited
// save can never crash the game: unknown fields are dropped and invalid fields fall back to defaults.

import { LEVEL_COUNT } from '../core/types';
import type { Progress } from '../core/types';
import { MAX_REFORGE_TOKENS, PERK_IDS, PERK_POINT_AFTER, isPerkId } from '../core/rules';
import { defaultProgress } from '../core/progress';
import { type KeyValue, safeLocalStorage } from './storage';

export { defaultProgress };

export interface SaveStore {
  load(): Promise<Progress>;
  save(p: Progress): Promise<void>;
  reset(): Promise<void>;
}

export const SAVE_VERSION = 2 as const satisfies Progress['version'];
/** The storage key keeps its v1 name: the version lives inside the JSON, so old saves are found and migrated. */
export const DEFAULT_SAVE_KEY = 'gemdig.progress.v1';

/**
 * Upgrade steps keyed by the version they upgrade FROM. `migrations[1]` turns a v1 object into v2, etc.
 * Each step receives untrusted data (already JSON-parsed) and must return an object with `version` bumped.
 */
export type Migrations = Readonly<Record<number, (old: Record<string, unknown>) => Record<string, unknown>>>;

/** v1 perks that survive into v2 unchanged. Every other v1 perk was removed (stamps are gone). */
const V1_KEPT: ReadonlySet<string> = new Set(['jeweler_brilliant', 'arch_softcrust', 'alch_transmute']);

/**
 * v1 -> v2 (gem powers replace stamps; perk points replace perk picks):
 * - perks: kept if still in the game (jeweler_brilliant, arch_softcrust, alch_transmute); every removed perk
 *   (jeweler_resonance, arch_keeneye, alch_reserves, smith_apprentice, smith_forge, anything unknown) is dropped;
 * - perkPointsGranted: every level of the new schedule (3, 7, 11, 15, 19) the player has already won, so no
 *   point is offered twice; v1 `perkPicksTaken` (levels 4, 10, 16) is not carried over as such;
 * - perkPoints (unspent) = max(removed perk count, granted points - kept perks): each removed perk becomes a
 *   point, and the player never has fewer points than the new schedule entitles them to;
 * - reforgeTokens 0; tutorialsSeen kept (default []); stars, unlocked and settings unchanged.
 */
export function migrateV1toV2(old: Record<string, unknown>): Record<string, unknown> {
  const perks = Array.isArray(old.perks) ? [...new Set(old.perks.filter((p): p is string => typeof p === 'string'))] : [];
  const kept = perks.filter((p) => V1_KEPT.has(p));
  const removed = perks.length - kept.length;
  const stars = isRecord(old.stars) ? old.stars : {};
  const won = (l: number) => {
    const v = stars[String(l)];
    return typeof v === 'number' && v > 0;
  };
  const granted = PERK_POINT_AFTER.filter(won);
  return {
    ...old,
    version: 2,
    perks: kept,
    perkPoints: Math.max(removed, granted.length - kept.length),
    perkPointsGranted: granted,
    reforgeTokens: 0,
    tutorialsSeen: Array.isArray(old.tutorialsSeen) ? old.tutorialsSeen : [],
  };
}

export const MIGRATIONS: Migrations = { 1: migrateV1toV2 };

/** Tutorial ids are short view-level names; anything else in a save is dropped. */
const TUTORIAL_ID = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const MAX_TUTORIALS = 32;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

/**
 * Applies migrations until the data reaches SAVE_VERSION. Returns null when the data cannot be brought to the
 * current version (not an object, missing/invalid version, a version from a newer build, or a failing step).
 */
export function migrateProgress(raw: unknown, migrations: Migrations = MIGRATIONS): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  let data: Record<string, unknown> = raw;
  // Bounded loop: one step per version, so a buggy step that forgets to bump the version cannot spin forever.
  for (let guard = 0; guard < 100; guard++) {
    const v = data.version;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > SAVE_VERSION) return null;
    if (v === SAVE_VERSION) return data;
    const step = migrations[v];
    if (!step) return null;
    try {
      const next = step(data);
      if (!isRecord(next) || typeof next.version !== 'number' || next.version <= v) return null;
      data = next;
    } catch {
      return null;
    }
  }
  return null;
}

/** Builds a valid Progress from a current-version object, keeping every valid field and defaulting the rest. */
export function sanitizeProgress(data: Record<string, unknown>): Progress {
  const out = defaultProgress();

  if (isRecord(data.stars)) {
    for (const [k, v] of Object.entries(data.stars)) {
      const id = Number(k);
      if (!isPositiveInt(id) || id > LEVEL_COUNT || String(id) !== k) continue; // only levels that exist
      if (v === 0 || v === 1 || v === 2 || v === 3) out.stars[id] = v;
    }
  }
  if (isPositiveInt(data.unlocked)) out.unlocked = Math.min(LEVEL_COUNT, data.unlocked);
  if (Array.isArray(data.perks)) {
    const seen = new Set<string>();
    for (const p of data.perks) {
      if (isPerkId(p) && !seen.has(p)) {
        seen.add(p);
        out.perks.push(p);
      }
    }
  }
  if (Array.isArray(data.perkPointsGranted)) {
    out.perkPointsGranted = [...new Set(data.perkPointsGranted.filter((l) => isPositiveInt(l) && PERK_POINT_AFTER.includes(l)))].sort(
      (a, b) => a - b,
    );
  }
  if (isNonNegInt(data.perkPoints)) out.perkPoints = Math.min(PERK_IDS.length, data.perkPoints);
  if (isNonNegInt(data.reforgeTokens)) out.reforgeTokens = Math.min(MAX_REFORGE_TOKENS, data.reforgeTokens);
  if (isRecord(data.settings) && typeof data.settings.sound === 'boolean') out.settings.sound = data.settings.sound;
  if (Array.isArray(data.tutorialsSeen)) {
    const seen = [...new Set(data.tutorialsSeen.filter((t): t is string => typeof t === 'string' && TUTORIAL_ID.test(t)))];
    out.tutorialsSeen = seen.slice(0, MAX_TUTORIALS);
  }
  return out;
}

/** Parses a stored JSON string into a valid Progress, or defaults if it is missing or unusable. */
export function parseProgress(json: string | null, migrations: Migrations = MIGRATIONS): Progress {
  if (json === null) return defaultProgress();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return defaultProgress();
  }
  const current = migrateProgress(raw, migrations);
  return current ? sanitizeProgress(current) : defaultProgress();
}

function clone(p: Progress): Progress {
  return sanitizeProgress(JSON.parse(JSON.stringify(p)) as Record<string, unknown>);
}

export function memorySaveStore(initial?: Progress): SaveStore {
  let current = initial ? clone(initial) : defaultProgress();
  return {
    load: async () => clone(current),
    save: async (p) => { current = clone(p); },
    reset: async () => { current = defaultProgress(); },
  };
}

/**
 * SaveStore over any synchronous key/value backend. A memory mirror of the last good value is always kept, so
 * when the backend throws (private mode, quota, revoked access) the game keeps working for the session with
 * in-memory progress. `kv === null` means "no storage at all" and behaves like `memorySaveStore`.
 */
export function kvSaveStore(kv: KeyValue | null, key: string, migrations: Migrations = MIGRATIONS): SaveStore {
  let mirror: Progress | null = null;
  // True while the mirror holds progress the backend failed to store; the mirror then wins over stale storage.
  let unsaved = false;
  return {
    async load() {
      if (kv && !unsaved) {
        try {
          mirror = parseProgress(kv.getItem(key), migrations);
        } catch {
          // Storage read failed: keep the mirror from earlier in the session, if any.
        }
      }
      return clone(mirror ?? defaultProgress());
    },
    async save(p) {
      mirror = clone(p);
      if (!kv) return;
      try {
        kv.setItem(key, JSON.stringify(mirror));
        unsaved = false;
      } catch {
        // Quota or access error: progress stays in the memory mirror for this session.
        unsaved = true;
      }
    },
    async reset() {
      mirror = defaultProgress();
      if (!kv) return;
      try {
        kv.removeItem(key);
        unsaved = false;
      } catch {
        unsaved = true; // The stale stored value must not come back on the next load.
      }
    },
  };
}

export interface LocalStorageSaveOptions {
  /** Override the backend (tests). Default: `window.localStorage` if usable, else memory only. */
  storage?: KeyValue | null;
  migrations?: Migrations;
}

export function localStorageSaveStore(key = DEFAULT_SAVE_KEY, opts: LocalStorageSaveOptions = {}): SaveStore {
  const kv = opts.storage !== undefined ? opts.storage : safeLocalStorage();
  return kvSaveStore(kv, key, opts.migrations ?? MIGRATIONS);
}
