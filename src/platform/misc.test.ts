import { describe, expect, it } from 'vitest';
import { noopAds } from './ads';
import { onVisibilityChange } from './lifecycle';
import { readSafeArea } from './safearea';

function fakeTarget() {
  const handlers = new Map<string, Set<() => void>>();
  return {
    handlers,
    addEventListener: (t: string, h: () => void) => { if (!handlers.has(t)) handlers.set(t, new Set()); handlers.get(t)!.add(h); },
    removeEventListener: (t: string, h: () => void) => { handlers.get(t)?.delete(h); },
    fire: (t: string) => handlers.get(t)?.forEach((h) => h()),
  };
}

describe('onVisibilityChange', () => {
  it('by default ignores window blur/focus (CrazyGames handles focus loss) but reports tab hiding', () => {
    const doc = Object.assign(fakeTarget(), { visibilityState: 'visible' as DocumentVisibilityState, hasFocus: () => true });
    const win = fakeTarget();
    const seen: boolean[] = [];
    const off = onVisibilityChange((v) => seen.push(v), { doc: doc as never, win: win as never });
    win.fire('blur'); win.fire('focus');
    expect(win.handlers.get('blur')?.size ?? 0).toBe(0);
    doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
    doc.visibilityState = 'visible'; doc.fire('visibilitychange');
    off();
    expect(seen).toEqual([false, true]);
  });

  it('with includeFocus reports visibility and focus changes once each, and unsubscribes', () => {
    const doc = Object.assign(fakeTarget(), { visibilityState: 'visible' as DocumentVisibilityState, hasFocus: () => true });
    const win = fakeTarget();
    const seen: boolean[] = [];
    const off = onVisibilityChange((v) => seen.push(v), { doc: doc as never, win: win as never, includeFocus: true });
    doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
    doc.fire('visibilitychange');
    doc.visibilityState = 'visible'; doc.fire('visibilitychange');
    win.fire('blur'); win.fire('blur'); win.fire('focus');
    off();
    win.fire('blur');
    expect(seen).toEqual([false, true, false, true]);
    expect([...doc.handlers.values()].every((s) => s.size === 0)).toBe(true);
  });

  it('is a no-op without a document', () => {
    expect(() => onVisibilityChange(() => {})()).not.toThrow();
  });
});

describe('readSafeArea', () => {
  it('returns zeros without a DOM or probe', () => {
    expect(readSafeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    const doc = { getElementById: () => null, defaultView: {} } as unknown as Document;
    expect(readSafeArea(doc)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('reads computed px and ignores junk', () => {
    const el = {};
    const doc = {
      getElementById: (id: string) => (id === 'safe-probe' ? el : null),
      defaultView: { getComputedStyle: () => ({ top: '44px', right: 'auto', bottom: '34.5px', left: '-3px' }) },
    } as unknown as Document;
    expect(readSafeArea(doc)).toEqual({ top: 44, right: 0, bottom: 34.5, left: 0 });
  });
});

describe('noopAds', () => {
  it('is disabled and always skips', async () => {
    const ads = noopAds();
    expect(ads.enabled).toBe(false);
    expect(await ads.midgame()).toBe('skipped');
    expect(await ads.rewarded()).toBe('skipped');
  });
});
