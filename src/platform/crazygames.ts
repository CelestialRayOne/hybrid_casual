// CrazyGames SDK v3 wrapper implementing `Platform` (docs/architecture.md, "Platform API"; rules in CLAUDE.md).
//
// The SDK is loaded by the official script tag in index.html, never bundled. The typings below are hand-written
// and cover only what this game uses. API names verified on 2026-11-20 against:
//   https://docs.crazygames.com/sdk/intro/  - `await SDK.init()`, `SDK.environment`: 'local' | 'crazygames' | 'disabled'
//                                             ("disabled": other domains, where SDK calls throw errors)
//   https://docs.crazygames.com/sdk/game/   - `SDK.game.loadingStart/loadingStop/gameplayStart/gameplayStop/happytime()`,
//                                             `SDK.game.settings.muteAudio`, `SDK.game.addSettingsChangeListener(cb)` /
//                                             `removeSettingsChangeListener(cb)`, cb receives the new settings object
//   https://docs.crazygames.com/sdk/user/   - `SDK.user.systemInfo` (sync property): `{ device: { type: 'desktop' |
//                                             'tablet' | 'mobile' }, browser, os, countryCode, locale }`
//   https://docs.crazygames.com/sdk/data/   - `SDK.data.getItem/setItem/removeItem/clear` (sync, 1 MB), see save.ts
//
// Every SDK call is wrapped: an SDK bug or a host quirk must never break the game.

export type DeviceType = 'desktop' | 'tablet' | 'mobile' | 'unknown';

export interface Platform {
  readonly name: 'crazygames' | 'local' | 'none';
  /**
   * Never throws (rejects never). Resolves after at most ~3 s; until the SDK is ready the platform is a no-op.
   * If the SDK finishes init later, it is adopted then and the current state is replayed.
   */
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  /** Idempotent: repeated calls without a matching stop are ignored. */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Only for rare big moments (e.g. finishing a whole set of levels). */
  happytime(): void;
  /** The host's `muteAudio` setting. It overrides the player's own sound toggle. */
  isMutedByHost(): boolean;
  /** Called only when the host mute flag changes. Returns an unsubscribe function. */
  onMuteChange(cb: (muted: boolean) => void): () => void;
  deviceType(): DeviceType;
}

// ---- Minimal SDK v3 typings -------------------------------------------------------------------------------

export type CrazyGamesEnvironment = 'local' | 'crazygames' | 'disabled';

export interface CrazyGamesSettings {
  muteAudio?: boolean;
  disableChat?: boolean;
}

export interface CrazyGamesGameModule {
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  readonly settings?: CrazyGamesSettings;
  addSettingsChangeListener?(listener: (settings: CrazyGamesSettings) => void): void;
  removeSettingsChangeListener?(listener: (settings: CrazyGamesSettings) => void): void;
}

export interface CrazyGamesSystemInfo {
  device?: { type?: string };
  browser?: { name?: string; version?: string };
  os?: { name?: string; version?: string };
  countryCode?: string;
  locale?: string;
}

export interface CrazyGamesSdk {
  init(): Promise<void>;
  readonly environment: CrazyGamesEnvironment;
  readonly game: CrazyGamesGameModule;
  readonly user?: { readonly systemInfo?: CrazyGamesSystemInfo };
  /** Present in the SDK; not used until Full Launch (see save.ts). */
  readonly data?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; clear(): void };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSdk };
  }
}

/** The SDK object if the script tag loaded, else undefined. */
export function findCrazyGamesSdk(): CrazyGamesSdk | undefined {
  try {
    return (globalThis as { CrazyGames?: { SDK?: CrazyGamesSdk } }).CrazyGames?.SDK;
  } catch {
    return undefined;
  }
}

// ---- Implementations ------------------------------------------------------------------------------------

export function noopPlatform(): Platform {
  return {
    name: 'none',
    init: async () => {},
    loadingStart() {},
    loadingStop() {},
    gameplayStart() {},
    gameplayStop() {},
    happytime() {},
    isMutedByHost: () => false,
    onMuteChange: () => () => {},
    deviceType: () => 'unknown',
  };
}

export interface CrazyGamesPlatformOptions {
  /** Default: `window.CrazyGames.SDK` looked up at init time. */
  sdk?: CrazyGamesSdk;
  /** Give up waiting for `SDK.init()` after this long. Default 3000 ms. */
  timeoutMs?: number;
}

/**
 * Behaves as a no-op until `SDK.init()` succeeds in the 'crazygames' or 'local' environment, and stays a no-op for
 * the whole session if the SDK is missing, reports 'disabled' or init rejects. `init()` stops waiting after the
 * timeout so boot is never blocked, but a late success still adopts the SDK.
 *
 * Loading and gameplay state are tracked even before the SDK is ready; once it is, the CURRENT state is replayed
 * (e.g. `loadingStart()` during boot is still reported; after a late init only what is still active, such as
 * gameplay, is reported). The host mute flag is applied through the change listeners too.
 */
export function crazyGamesPlatform(opts: CrazyGamesPlatformOptions = {}): Platform {
  const timeoutMs = opts.timeoutMs ?? 3000;
  let sdk: CrazyGamesSdk | null = null; // non-null only when ready and enabled
  let env: Platform['name'] = 'none';
  let initPromise: Promise<void> | null = null;
  let loading = false;
  let playing = false;
  let hostMuted = false;
  const muteListeners = new Set<(muted: boolean) => void>();

  function call(fn: (g: CrazyGamesGameModule) => void): void {
    if (!sdk) return;
    try {
      fn(sdk.game);
    } catch {
      // Swallow: SDK errors must not reach game code.
    }
  }

  function setHostMuted(m: boolean): void {
    if (m === hostMuted) return;
    hostMuted = m;
    for (const cb of [...muteListeners]) {
      try {
        cb(m);
      } catch {
        // A faulty listener must not stop the others.
      }
    }
  }

  function readEnv(s: CrazyGamesSdk): CrazyGamesEnvironment | null {
    try {
      const e = s.environment;
      return e === 'crazygames' || e === 'local' || e === 'disabled' ? e : null;
    } catch {
      return null;
    }
  }

  /** Makes `s` the live SDK (once) and replays the current loading/gameplay state and host mute. */
  function adopt(s: CrazyGamesSdk): void {
    if (sdk) return;
    const e = readEnv(s);
    if (e !== 'crazygames' && e !== 'local') return;
    sdk = s;
    env = e;
    try {
      // Through setHostMuted so listeners subscribed before init learn the host mute too.
      setHostMuted(s.game.settings?.muteAudio === true);
      s.game.addSettingsChangeListener?.((settings) => setHostMuted(settings?.muteAudio === true));
    } catch {
      // Settings are optional; default to not muted.
    }
    // Replay state requested before the SDK was ready.
    if (loading) call((g) => g.loadingStart());
    if (playing) call((g) => g.gameplayStart());
  }

  async function doInit(): Promise<void> {
    const s = opts.sdk ?? findCrazyGamesSdk();
    if (!s) return;
    if (readEnv(s) === 'disabled') return; // Skip init entirely: in 'disabled' SDK calls may throw.

    // The SDK is adopted whenever init succeeds, even after the timeout: the timeout only stops
    // boot from waiting. A late adoption replays the then-current state (see adopt).
    const ready = Promise.resolve()
      .then(() => s.init())
      .then(
        () => { adopt(s); },
        () => {},
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
    try {
      await Promise.race([ready, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get name() { return env; },
    init() {
      initPromise ??= doInit().catch(() => {});
      return initPromise;
    },
    loadingStart() {
      if (loading) return;
      loading = true;
      call((g) => g.loadingStart());
    },
    loadingStop() {
      if (!loading) return;
      loading = false;
      call((g) => g.loadingStop());
    },
    gameplayStart() {
      if (playing) return;
      playing = true;
      call((g) => g.gameplayStart());
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      call((g) => g.gameplayStop());
    },
    happytime() {
      call((g) => g.happytime());
    },
    isMutedByHost: () => hostMuted,
    onMuteChange(cb) {
      muteListeners.add(cb);
      return () => { muteListeners.delete(cb); };
    },
    deviceType() {
      if (!sdk) return 'unknown';
      try {
        const t = sdk.user?.systemInfo?.device?.type;
        return t === 'desktop' || t === 'tablet' || t === 'mobile' ? t : 'unknown';
      } catch {
        return 'unknown';
      }
    },
  };
}
