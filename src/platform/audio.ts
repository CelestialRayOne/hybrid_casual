// AudioService: the synthesized sound set (sounds.ts, rendered by the pure-TS DSP in audio/dsp.ts) pre-rendered to
// AudioBuffers on ONE AudioContext and played through a master gain + soft compressor.
//
// Portal rules (CLAUDE.md): no sound before the first user gesture; the context is created/resumed inside a
// gesture via `unlock()` (iOS); the host's `muteAudio` overrides the player's toggle (`setHostMuted`).
// Gesture cost: `unlock()` only creates/resumes the context and builds two nodes. Buffers render in idle time
// (requestIdleCallback, else short tasks), most-used first; a sound needed before its turn renders on demand
// (a few ms for one buffer).

import {
  type BufferKey, type PlayOptions, type SoundId, RENDER_RATE, allBufferKeys, bufferKeyString, renderBuffer, resolvePlay,
} from './sounds';

export {
  GEM_SOUND_NAMES, LEGACY_SOUND_ALIASES, POWER_SOUND_FOR_COLOR, SOUND_IDS, clearPitchForGroupSize,
  type PlayOptions, type SoundId,
} from './sounds';

export interface AudioService {
  /** Call from a user gesture (pointerdown/keydown). Safe to call on every gesture; cheap after the first. */
  unlock(): void;
  /** See `PlayOptions` for which ids use `color`, `level`, `index`, `size` and `pitch`. */
  play(id: SoundId, opts?: PlayOptions): void;
  /** The player's sound setting. */
  setEnabled(on: boolean): void;
  /** Host mute (CrazyGames `muteAudio`, or an ad playing). Overrides `setEnabled(true)`. */
  setHostMuted(muted: boolean): void;
}

export function nullAudio(): AudioService {
  return { unlock() {}, play() {}, setEnabled() {}, setHostMuted() {} };
}

/** Drops repeats of the same key within `windowMs` (e.g. ten dirt cells cracking in the same frame). */
export function createThrottle(windowMs: number): (key: string, nowMs: number) => boolean {
  const last = new Map<string, number>();
  return (key, nowMs) => {
    const prev = last.get(key);
    if (prev !== undefined && nowMs - prev < windowMs) return false;
    last.set(key, nowMs);
    return true;
  };
}

/** The subset of AudioContext this service uses (lets tests pass a fake). */
export type AudioContextLike = Pick<
  AudioContext,
  'state' | 'sampleRate' | 'currentTime' | 'destination' | 'resume' | 'createBuffer' | 'createBufferSource' | 'createGain' | 'createDynamicsCompressor'
>;

export interface SynthAudioOptions {
  /** Master gain into the compressor. Default 1 (each sound is loudness-normalised to about -17 dBFS). */
  masterVolume?: number;
  /** Clock in ms for throttling. Default `performance.now()`. */
  now?: () => number;
  /** The same request (id + options) is dropped if repeated within this window. Default 30 ms. */
  throttleMs?: number;
  /** Max simultaneous voices (buffer sources); extra plays are dropped. Default 20. */
  maxVoices?: number;
  /** Random source for per-play variation. Default `Math.random`. */
  random?: () => number;
  /** Background warm-up of every buffer after the first unlock. Default true. */
  warmUp?: boolean;
}
/** @deprecated v1 name. */
export type ZzfxAudioOptions = SynthAudioOptions;

function createDefaultContext(): AudioContextLike | null {
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

type IdleDeadlineLike = { timeRemaining(): number };
type IdleScheduler = (cb: (d: IdleDeadlineLike) => void) => void;

function idleScheduler(): IdleScheduler {
  const g = globalThis as { requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, o?: { timeout: number }) => number };
  if (typeof g.requestIdleCallback === 'function') {
    const ric = g.requestIdleCallback.bind(globalThis);
    return (cb) => { ric(cb, { timeout: 1500 }); };
  }
  // No idle callbacks (Safari): short tasks with an 8 ms budget each, yielding a frame in between.
  return (cb) => { setTimeout(() => { const end = performance.now() + 8; cb({ timeRemaining: () => end - performance.now() }); }, 16); };
}

/** After `unlock()` asks to resume, plays are still accepted for this long (they start when the context runs). */
const RESUME_GRACE_MS = 400;
/** A voice whose `onended` never fires (closed/interrupted context) is released this long after it should end. */
const VOICE_GRACE_MS = 250;

/**
 * `ctx` is optional: by default the context is created lazily inside the first `unlock()` (a user gesture), so
 * nothing audio-related exists before that. Without Web Audio (tests, very old browsers) everything is a no-op.
 */
export function synthAudio(ctx?: AudioContextLike, opts: SynthAudioOptions = {}): AudioService {
  const masterVolume = opts.masterVolume ?? 1;
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const throttle = createThrottle(opts.throttleMs ?? 30);
  const maxVoices = opts.maxVoices ?? 20;
  const random = opts.random ?? Math.random;

  let context: AudioContextLike | null = ctx ?? null;
  let contextFailed = false;
  let unlocked = false;
  let resumeRequestedAt = -Infinity;
  let enabled = true;
  let hostMuted = false;
  let master: GainNode | null = null;
  /** Live voices: id -> release time (ms on `now()`). See VOICE_GRACE_MS. */
  const voices = new Map<number, number>();
  let nextVoice = 0;
  const buffers = new Map<string, AudioBuffer | null>();

  const audible = () => enabled && !hostMuted;

  function pruneVoices(t: number): void {
    for (const [id, until] of voices) if (until <= t) voices.delete(id);
  }

  function setup(c: AudioContextLike): void {
    if (master) return;
    // Gentle bus glue: soft knee, moderate ratio. Sounds arrive normalised, so this mostly catches pile-ups.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    master = c.createGain();
    master.gain.value = audible() ? masterVolume : 0;
    master.connect(comp);
  }

  function bufferFor(c: AudioContextLike, key: BufferKey): AudioBuffer | null {
    const ks = bufferKeyString(key);
    const have = buffers.get(ks);
    if (have !== undefined) return have;
    let buf: AudioBuffer | null;
    try {
      const rate = Math.min(RENDER_RATE, c.sampleRate || RENDER_RATE);
      const samples = renderBuffer(key, rate);
      buf = c.createBuffer(1, samples.length, rate);
      buf.getChannelData(0).set(samples);
    } catch {
      buf = null;
    }
    buffers.set(ks, buf);
    return buf;
  }

  function warmUp(c: AudioContextLike): void {
    const pending = allBufferKeys().filter((k) => !buffers.has(bufferKeyString(k)));
    const schedule = idleScheduler();
    const step = (d: IdleDeadlineLike) => {
      do {
        const k = pending.shift();
        if (!k) return;
        bufferFor(c, k);
      } while (d.timeRemaining() > 4);
      schedule(step);
    };
    schedule(step);
  }

  function applyGain(): void {
    if (!master || !context) return;
    const target = audible() ? masterVolume : 0;
    try {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(target, context.currentTime, 0.015);
    } catch {
      master.gain.value = target;
    }
  }

  function canPlay(c: AudioContextLike, t: number): boolean {
    if (c.state === 'running') return true;
    // Just unlocked inside this gesture: the source is queued and starts the moment resume() lands.
    return t - resumeRequestedAt < RESUME_GRACE_MS;
  }

  return {
    unlock() {
      if (!context && !contextFailed) {
        context = createDefaultContext();
        contextFailed = context === null;
      }
      const c = context;
      if (!c) return;
      const first = !unlocked;
      unlocked = true;
      try {
        setup(c);
        // Resume inside the gesture; repeated calls also recover from iOS 'interrupted' after a call or tab switch.
        if (c.state !== 'running') {
          resumeRequestedAt = now();
          void c.resume().catch(() => {});
        }
      } catch {
        return;
      }
      if (first && opts.warmUp !== false) warmUp(c);
    },

    play(id, playOpts = {}) {
      const c = context;
      if (!unlocked || !c || !master || !audible()) return;
      const t = now();
      if (!canPlay(c, t)) return;
      const volume = Math.min(1, Math.max(0, playOpts.volume ?? 1));
      if (!(volume > 0)) return;
      pruneVoices(t);
      if (voices.size >= maxVoices) return;
      const { pitch, color, level, index, size } = playOpts;
      if (!throttle(`${id}|${pitch}|${color}|${level}|${index}|${size}`, t)) return;
      for (const layer of resolvePlay(id, playOpts, random)) {
        if (voices.size >= maxVoices) break;
        const buf = bufferFor(c, layer.key);
        if (!buf) continue;
        try {
          const src = c.createBufferSource();
          src.buffer = buf;
          src.playbackRate.value = Math.min(4, Math.max(0.25, 2 ** (layer.semis / 12)));
          const gain = c.createGain();
          gain.gain.value = volume * layer.gain;
          src.connect(gain);
          gain.connect(master);
          const voice = nextVoice++;
          src.onended = () => {
            voices.delete(voice);
            try {
              src.disconnect();
              gain.disconnect();
            } catch {
              // Already disconnected.
            }
          };
          src.start(c.currentTime + layer.delay);
          const rate = src.playbackRate.value || 1;
          voices.set(voice, t + ((buf.length / (buf.sampleRate || RENDER_RATE)) * 1000) / rate + layer.delay * 1000 + VOICE_GRACE_MS);
        } catch {
          // Never let audio break gameplay.
        }
      }
    },

    setEnabled(on) {
      enabled = on;
      applyGain();
    },

    setHostMuted(m) {
      hostMuted = m;
      applyGain();
    },
  };
}

/** @deprecated v1 name, kept so existing composition code keeps working. Same as `synthAudio`. */
export const zzfxAudio = synthAudio;
