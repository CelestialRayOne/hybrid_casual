import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CrazyGamesEnvironment, type CrazyGamesSdk, type CrazyGamesSettings, crazyGamesPlatform, noopPlatform } from './crazygames';
import { createPlatform } from './index';

function fakeSdk(opts: { env?: CrazyGamesEnvironment; init?: () => Promise<void>; muted?: boolean; device?: string } = {}) {
  const calls: string[] = [];
  const listeners: ((s: CrazyGamesSettings) => void)[] = [];
  const record = (name: string) => () => { calls.push(name); };
  const sdk: CrazyGamesSdk = {
    environment: opts.env ?? 'crazygames',
    init: opts.init ?? (async () => { calls.push('init'); }),
    game: {
      loadingStart: record('loadingStart'),
      loadingStop: record('loadingStop'),
      gameplayStart: record('gameplayStart'),
      gameplayStop: record('gameplayStop'),
      happytime: record('happytime'),
      settings: { muteAudio: opts.muted ?? false },
      addSettingsChangeListener: (cb) => { listeners.push(cb); },
    },
    user: { systemInfo: { device: { type: opts.device ?? 'mobile' } } },
  };
  const emit = (s: CrazyGamesSettings) => listeners.forEach((l) => l(s));
  return { sdk, calls, emit };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('crazyGamesPlatform', () => {
  it('initialises and forwards events', async () => {
    const { sdk, calls } = fakeSdk({ device: 'tablet' });
    const p = crazyGamesPlatform({ sdk });
    expect(p.name).toBe('none');
    await p.init();
    expect(p.name).toBe('crazygames');
    p.loadingStart(); p.loadingStop(); p.gameplayStart(); p.happytime();
    expect(calls).toEqual(['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'happytime']);
    expect(p.deviceType()).toBe('tablet');
  });

  it('reports the local environment', async () => {
    const p = crazyGamesPlatform({ sdk: fakeSdk({ env: 'local' }).sdk });
    await p.init();
    expect(p.name).toBe('local');
  });

  it('is a no-op in the disabled environment and never calls init', async () => {
    const { sdk, calls } = fakeSdk({ env: 'disabled' });
    sdk.game.gameplayStart = () => { throw new Error('disabled'); };
    const p = crazyGamesPlatform({ sdk });
    await p.init();
    p.loadingStart(); p.gameplayStart(); p.happytime();
    expect(calls).toEqual([]);
    expect(p.name).toBe('none');
    expect(p.deviceType()).toBe('unknown');
  });

  it('stops waiting after the timeout, then adopts a late init and replays the current state', async () => {
    vi.useFakeTimers();
    let resolveInit!: () => void;
    const { sdk, calls } = fakeSdk({ muted: true, init: () => new Promise<void>((r) => { resolveInit = r; }) });
    const p = crazyGamesPlatform({ sdk, timeoutMs: 3000 });
    const seen: boolean[] = [];
    p.onMuteChange((m) => seen.push(m));
    const done = p.init();
    p.loadingStart();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBeUndefined();
    expect(p.name).toBe('none');
    // Boot carried on without the SDK: loading finished and play began.
    p.loadingStop();
    p.gameplayStart();
    expect(calls).toEqual([]);
    resolveInit();
    await vi.runAllTimersAsync();
    expect(p.name).toBe('crazygames');
    // Only what is still active is replayed; the host mute reaches early listeners.
    expect(calls).toEqual(['gameplayStart']);
    expect(p.isMutedByHost()).toBe(true);
    expect(seen).toEqual([true]);
    p.gameplayStop();
    expect(calls).toEqual(['gameplayStart', 'gameplayStop']);
  });

  it('tells listeners subscribed before init that the host muted', async () => {
    const { sdk } = fakeSdk({ muted: true });
    const p = crazyGamesPlatform({ sdk });
    const seen: boolean[] = [];
    p.onMuteChange((m) => seen.push(m));
    await p.init();
    expect(seen).toEqual([true]);
    expect(p.isMutedByHost()).toBe(true);
  });

  it('never throws when init rejects or the SDK is missing', async () => {
    const { sdk, calls } = fakeSdk({ init: () => Promise.reject(new Error('boom')) });
    const p = crazyGamesPlatform({ sdk });
    await expect(p.init()).resolves.toBeUndefined();
    p.gameplayStart();
    expect(calls).toEqual([]);
    await expect(crazyGamesPlatform().init()).resolves.toBeUndefined();
  });

  it('gameplayStart/Stop and loading are idempotent', async () => {
    const { sdk, calls } = fakeSdk();
    const p = crazyGamesPlatform({ sdk });
    await p.init();
    p.gameplayStop();
    p.gameplayStart(); p.gameplayStart();
    p.gameplayStop(); p.gameplayStop();
    p.gameplayStart();
    p.loadingStop(); p.loadingStart(); p.loadingStart();
    expect(calls.slice(1)).toEqual(['gameplayStart', 'gameplayStop', 'gameplayStart', 'loadingStart']);
  });

  it('replays state requested before init finished', async () => {
    const { sdk, calls } = fakeSdk();
    const p = crazyGamesPlatform({ sdk });
    const done = p.init();
    p.loadingStart();
    await done;
    expect(calls).toEqual(['init', 'loadingStart']);
  });

  it('swallows SDK call errors', async () => {
    const { sdk } = fakeSdk();
    sdk.game.happytime = () => { throw new Error('x'); };
    const p = crazyGamesPlatform({ sdk });
    await p.init();
    expect(() => p.happytime()).not.toThrow();
  });

  it('reads and follows the host mute setting', async () => {
    const { sdk, emit } = fakeSdk({ muted: true });
    const p = crazyGamesPlatform({ sdk });
    await p.init();
    expect(p.isMutedByHost()).toBe(true);
    const seen: boolean[] = [];
    const off = p.onMuteChange((m) => seen.push(m));
    emit({ muteAudio: true }); // unchanged: no callback
    emit({ muteAudio: false });
    emit({ muteAudio: true });
    off();
    emit({ muteAudio: false });
    expect(seen).toEqual([false, true]);
    expect(p.isMutedByHost()).toBe(false);
  });

  it('maps unknown device types to unknown', async () => {
    const p = crazyGamesPlatform({ sdk: fakeSdk({ device: 'fridge' }).sdk });
    await p.init();
    expect(p.deviceType()).toBe('unknown');
  });
});

describe('createPlatform / noopPlatform', () => {
  it('picks noop without the SDK and the wrapper with it', async () => {
    const none = createPlatform();
    await none.init();
    expect(none.name).toBe('none');
    vi.stubGlobal('CrazyGames', { SDK: fakeSdk().sdk });
    const p = createPlatform();
    await p.init();
    expect(p.name).toBe('crazygames');
  });

  it('noop platform is inert', async () => {
    const p = noopPlatform();
    await p.init();
    expect(p.isMutedByHost()).toBe(false);
    expect(p.deviceType()).toBe('unknown');
    expect(() => p.onMuteChange(() => {})()).not.toThrow();
  });
});
