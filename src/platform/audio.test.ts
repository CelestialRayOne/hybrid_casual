import { describe, expect, it } from 'vitest';
import {
  type AudioContextLike, SOUND_IDS, clearPitchForGroupSize, createThrottle, nullAudio, synthAudio, zzfxAudio,
} from './audio';
import { CLEAR_ANCHORS, allBufferKeys, bufferKeyString, renderSound, resolvePlay } from './sounds';

function param(value = 0) {
  return {
    value,
    setTargetAtTime(v: number) { this.value = v; },
    cancelScheduledValues() {},
  };
}

function fakeContext(initialState: AudioContextState = 'suspended') {
  const started: { buffer: unknown; rate: number; volume: number; when: number }[] = [];
  let resumes = 0;
  let buffersCreated = 0;
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    state: initialState,
    sampleRate: 48000,
    currentTime: 0,
    destination: node(),
    resume() { resumes++; ctx.state = 'running'; return Promise.resolve(); },
    createBuffer: (_ch: number, length: number, sampleRate: number) => {
      buffersCreated++;
      const data = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => data };
    },
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createGain: () => ({ ...node(), gain: param(1) }),
    createBufferSource: () => {
      const src = {
        ...node(),
        buffer: null as unknown,
        playbackRate: param(1),
        onended: null as null | (() => void),
        gainRef: null as null | { gain: { value: number } },
        connect(g: { gain: { value: number } }) { src.gainRef = g; },
        start(when = 0) { started.push({ buffer: src.buffer, rate: src.playbackRate.value, volume: src.gainRef?.gain.value ?? 1, when }); },
      };
      return src;
    },
  };
  return {
    ctx: ctx as unknown as AudioContextLike & { state: AudioContextState },
    started, resumes: () => resumes, buffersCreated: () => buffersCreated,
  };
}

const still = () => 0.5; // no random jitter (2 * 0.5 - 1 = 0)

describe('synthAudio', () => {
  it('is a silent no-op without Web Audio (Node), and keeps the v1 name', () => {
    const a = synthAudio();
    expect(() => { a.unlock(); a.play('clear'); a.setEnabled(false); a.setHostMuted(true); }).not.toThrow();
    const n = nullAudio();
    expect(() => { n.unlock(); n.play('win'); }).not.toThrow();
    expect(zzfxAudio).toBe(synthAudio);
  });

  it('plays nothing before unlock, then plays after resume', () => {
    const { ctx, started, resumes } = fakeContext();
    const a = synthAudio(ctx, { now: () => 0, random: still, warmUp: false });
    a.play('clear');
    expect(started).toHaveLength(0);
    a.unlock();
    a.unlock();
    expect(resumes()).toBe(1); // second call sees 'running'
    a.play('clear', { pitch: 9 + 12, volume: 0.5 }); // nearest anchor 16 -> +5 semitones
    expect(started).toHaveLength(1);
    expect(started[0]!.rate).toBeCloseTo(2 ** (5 / 12));
    expect(started[0]!.volume).toBe(0.5);
  });

  it('queues plays right after unlock while resume is pending, but not long after', () => {
    const { ctx, started } = fakeContext();
    ctx.resume = () => new Promise(() => {}); // never resolves, state stays suspended
    let t = 0;
    const a = synthAudio(ctx, { now: () => t, warmUp: false });
    a.unlock();
    t = 50; a.play('ui_click'); // same gesture: starts as soon as the context runs
    expect(started).toHaveLength(1);
    t = 5000; a.play('win');
    expect(started).toHaveLength(1);
  });

  it('respects the player toggle and the host mute', () => {
    const { ctx, started } = fakeContext('running');
    let t = 0;
    const a = synthAudio(ctx, { now: () => (t += 100), warmUp: false });
    a.unlock();
    a.setEnabled(false);
    a.play('ui_click');
    a.setEnabled(true);
    a.setHostMuted(true);
    a.play('ui_click');
    expect(started).toHaveLength(0);
    a.setHostMuted(false);
    a.play('ui_click');
    expect(started).toHaveLength(1);
  });

  it('throttles identical requests within 30 ms but not different pitches or strike indices', () => {
    const { ctx, started } = fakeContext('running');
    let t = 0;
    const a = synthAudio(ctx, { now: () => t, warmUp: false });
    a.unlock();
    a.play('dirt_crack');
    t = 10; a.play('dirt_crack');
    t = 20; a.play('clear', { pitch: 2 }); a.play('clear', { pitch: 4 });
    a.play('zap', { index: 0 }); a.play('zap', { index: 1 }); a.play('zap', { index: 1 });
    t = 40; a.play('dirt_crack');
    expect(started).toHaveLength(6);
  });

  it('starts every layer of a big clear (main + shimmer + chord)', () => {
    const { ctx, started } = fakeContext('running');
    const a = synthAudio(ctx, { now: () => 0, random: still, warmUp: false });
    a.unlock();
    a.play('clear', { color: 2, size: 16 });
    expect(started).toHaveLength(3);
    expect(started[1]!.when).toBeGreaterThan(0); // shimmer is slightly delayed
  });

  it('caps simultaneous voices', () => {
    const { ctx, started } = fakeContext('running');
    let t = 0;
    const a = synthAudio(ctx, { now: () => (t += 10), maxVoices: 3, throttleMs: 0, warmUp: false });
    a.unlock();
    for (let i = 0; i < 6; i++) a.play('ui_click');
    expect(started).toHaveLength(3);
  });

  it('releases voices whose onended never fires (closed or interrupted context)', () => {
    const { ctx, started } = fakeContext('running');
    let t = 0;
    const a = synthAudio(ctx, { now: () => t, maxVoices: 2, throttleMs: 0, warmUp: false });
    a.unlock();
    a.play('ui_click'); a.play('tap_invalid'); a.play('win');
    expect(started).toHaveLength(2); // capped; the fake never calls onended
    t += 60_000; // long after every buffer would have finished
    a.play('ui_click'); a.play('tap_invalid');
    expect(started).toHaveLength(4);
  });

  it('warms every buffer up in the background after the first unlock, at most 32 kHz', async () => {
    const { ctx, buffersCreated } = fakeContext('running');
    const a = synthAudio(ctx);
    a.unlock();
    expect(buffersCreated()).toBe(0); // nothing rendered inside the gesture
    const total = allBufferKeys().length;
    for (let i = 0; i < 400 && buffersCreated() < total; i++) await new Promise((r) => setTimeout(r, 20));
    expect(buffersCreated()).toBe(total);
  }, 20_000);

  it('accepts the v1 stamp ids as aliases', () => {
    const { ctx, started } = fakeContext('running');
    const a = synthAudio(ctx, { now: () => 0, warmUp: false });
    a.unlock();
    a.play('stamp_earn');
    a.play('stamp_place');
    expect(started).toHaveLength(2);
  });
});

describe('createThrottle', () => {
  it('allows a key again after the window', () => {
    const allow = createThrottle(30);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 29)).toBe(false);
    expect(allow('b', 29)).toBe(true);
    expect(allow('a', 30)).toBe(true);
  });
});

describe('resolvePlay', () => {
  it('maps every public id to at least one buffer that exists', () => {
    const known = new Set(allBufferKeys().map(bufferKeyString));
    for (const id of SOUND_IDS) {
      for (const opts of [{}, { color: 4, level: 5, index: 7, size: 20 }]) {
        const layers = resolvePlay(id, opts);
        expect(layers.length).toBeGreaterThan(0);
        for (const l of layers) expect(known.has(bufferKeyString(l.key))).toBe(true);
      }
    }
  });

  it('picks the clear colour, the nearest anchor and layers for big groups', () => {
    const small = resolvePlay('clear', { color: 3, size: 4 }, still);
    expect(small).toHaveLength(1);
    expect(small[0]!.key).toMatchObject({ id: 'clear', color: 3 });
    expect(small[0]!.key.step + small[0]!.semis).toBeCloseTo(clearPitchForGroupSize(4));
    expect(resolvePlay('clear', { size: 9 }, still).map((l) => l.key.id)).toEqual(['clear', 'clear_shimmer']);
    expect(resolvePlay('clear', { size: 15 }, still).map((l) => l.key.id)).toEqual(['clear', 'clear_shimmer', 'clear_chord']);
    for (let size = 2; size <= 20; size++) {
      expect(Math.abs(resolvePlay('clear', { size }, still)[0]!.semis)).toBeLessThanOrEqual(3);
    }
    expect(CLEAR_ANCHORS.length).toBeGreaterThan(1);
  });

  it('makes power sounds fuller with level, and clamps bad options', () => {
    expect(resolvePlay('power_charge', { color: 1, level: 1 }, still)).toHaveLength(1);
    const full = resolvePlay('power_charge', { color: 1, level: 5 }, still);
    expect(full.map((l) => l.key.id)).toEqual(['power_charge', 'charge_full']);
    expect(full[0]!.semis).toBeGreaterThan(0);
    expect(resolvePlay('quake', { level: 4 }, still).map((l) => l.key.id)).toEqual(['quake', 'power_impact']);
    expect(resolvePlay('clear', { color: 99 }, still)[0]!.key.color).toBe(4);
    expect(resolvePlay('clear', { color: NaN }, still)[0]!.key.color).toBe(0);
  });

  it('rises per star and per zap strike, and varies repeats', () => {
    const stars = [0, 1, 2].map((index) => resolvePlay('star', { index }, still)[0]!.semis);
    expect(stars[0]!).toBeLessThan(stars[1]!);
    expect(stars[1]!).toBeLessThan(stars[2]!);
    const zaps = [0, 1, 2].map((index) => resolvePlay('zap', { index }, still)[0]!.semis);
    expect(zaps[0]!).toBeLessThan(zaps[1]!);
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const picks = new Set(Array.from({ length: 30 }, () => {
      const l = resolvePlay('dirt_crack', {}, rnd)[0]!;
      return `${l.key.variant}:${l.semis.toFixed(3)}`;
    }));
    expect(picks.size).toBeGreaterThan(20);
  });
});

describe('sounds', () => {
  it('renders a whole layered request offline', () => {
    const s = renderSound('clear', 22050, { color: 1, size: 15 });
    expect(s.length / 22050).toBeGreaterThan(0.8);
    expect(s.every(Number.isFinite)).toBe(true);
  });

  it('maps group sizes onto rising pentatonic steps', () => {
    const steps = [2, 3, 4, 5, 6, 7, 8, 10, 12, 30].map(clearPitchForGroupSize);
    expect(steps).toEqual([0, 2, 4, 7, 9, 12, 14, 16, 19, 19]);
    expect(clearPitchForGroupSize(NaN)).toBe(0);
    expect(clearPitchForGroupSize(1)).toBe(0);
  });
});
