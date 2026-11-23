// Small offline DSP toolkit for the synthesized sound set. Pure TypeScript on Float32Arrays, so the exact same
// code renders the sounds in the browser (in idle time, into AudioBuffers) and in Node tests (metrics, WAVs).
// Everything is deterministic: noise comes from a seeded xorshift generator.

/** Time-varying value: a constant, or a function of normalised position u in [0, 1] over the buffer. */
export type Curve = number | ((u: number) => number);

const TAU = Math.PI * 2;

/** Seeded xorshift32 generator. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  /** Uniform in [0, 1). */
  next(): number {
    let s = this.s;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    this.s = s;
    return s / 4294967296;
  }
  /** Uniform in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
}

/** Exponential sweep a -> b (frequencies), optionally eased with `pow` (>1 = slow start). */
export const sweep = (a: number, b: number, pow = 1) => (u: number) => a * (b / a) ** (u ** pow);
/** Exponential rise a -> peak at `at`, then fall to b. */
export const arc = (a: number, peak: number, b: number, at: number) => (u: number) =>
  u < at ? a * (peak / a) ** (u / at) : peak * (b / peak) ** ((u - at) / (1 - at));

function curveAt(c: Curve, u: number): number {
  return typeof c === 'number' ? c : c(u);
}

/** White noise in [-1, 1). */
export function noise(sr: number, dur: number, rng: Rng): Float32Array {
  const b = new Float32Array(Math.max(1, Math.round(dur * sr)));
  for (let i = 0; i < b.length; i++) b[i] = rng.next() * 2 - 1;
  return b;
}

/**
 * Oscillator. `wave`: 0 sine, 1 triangle, 2 saw (naive: always low-pass it), 3 "soft square" (sine through tanh).
 * Frequency curves are evaluated every 16 samples.
 */
export function osc(sr: number, dur: number, freq: Curve, wave = 0, phase = 0): Float32Array {
  const n = Math.max(1, Math.round(dur * sr));
  const b = new Float32Array(n);
  let p = phase; // in cycles
  for (let i = 0; i < n; i += 16) {
    const inc = Math.min(curveAt(freq, i / n), sr * 0.45) / sr;
    const end = Math.min(n, i + 16);
    if (wave === 0) for (let j = i; j < end; j++, p += inc) b[j] = Math.sin(TAU * p);
    else if (wave === 1) for (let j = i; j < end; j++, p += inc) b[j] = 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5);
    else if (wave === 2) for (let j = i; j < end; j++, p += inc) b[j] = 2 * (p - Math.floor(p)) - 1;
    else for (let j = i; j < end; j++, p += inc) b[j] = Math.tanh(3 * Math.sin(TAU * p)) * 0.9;
    if (p > 1e6) p -= Math.floor(p);
  }
  return b;
}

/** Two-operator FM: sin(carrier + index(t) * sin(modulator)). index decays from `index` to `indexEnd`. */
export function fm(sr: number, dur: number, f: Curve, ratio: number, index: number, indexDecay: number, indexEnd = 0): Float32Array {
  const n = Math.max(1, Math.round(dur * sr));
  const b = new Float32Array(n);
  let pc = 0, pm = 0, inc = 0;
  const k = Math.exp(-1 / (indexDecay * sr));
  let idx = index - indexEnd;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) inc = (TAU * Math.min(curveAt(f, i / n), sr * 0.4)) / sr;
    b[i] = Math.sin(pc + (indexEnd + idx) * Math.sin(pm));
    pc += inc;
    pm += inc * ratio;
    idx *= k;
  }
  return b;
}

/**
 * Zero-delay-feedback state-variable filter (stable under fast cutoff modulation), in place.
 * `mode`: 'lp' | 'hp' | 'bp' (bp is normalised to unity gain at the centre). Cutoff curves update every 16 samples.
 */
export function filt(b: Float32Array, sr: number, mode: 'lp' | 'hp' | 'bp', cut: Curve, q = 0.707): Float32Array {
  const n = b.length;
  const k = 1 / q;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const fc = Math.min(Math.max(curveAt(cut, i / n), 10), sr * 0.45);
      const g = Math.tan((Math.PI * fc) / sr);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v0 = b[i]!;
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    b[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 * k : v0 - k * v1 - v2;
  }
  return b;
}

/**
 * Amplitude envelope in place: raised-cosine attack (seconds), then exponential decay with time constant `decay`
 * (Infinity = hold), and a raised-cosine release over the last `release` seconds.
 */
export function env(b: Float32Array, sr: number, attack: number, decay = Infinity, release = 0.01): Float32Array {
  const n = b.length;
  const na = Math.max(1, Math.round(attack * sr));
  const nr = Math.min(n, Math.max(1, Math.round(release * sr)));
  const k = Number.isFinite(decay) ? Math.exp(-1 / (decay * sr)) : 1;
  let g = 1;
  for (let i = 0; i < n; i++) {
    let e = i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : (g *= k);
    const r = n - i;
    if (r < nr) e *= 0.5 - 0.5 * Math.cos((Math.PI * r) / nr);
    b[i]! *= e;
  }
  return b;
}

/** Multiplies by an arbitrary gain curve of u in [0, 1] (evaluated every 8 samples, linearly interpolated). */
export function shape(b: Float32Array, fn: (u: number) => number): Float32Array {
  const n = b.length;
  let g0 = 0, g1 = fn(0);
  for (let i = 0; i < n; i++) {
    const j = i & 7;
    if (j === 0) { g0 = g1; g1 = fn(Math.min(1, (i + 8) / n)); }
    b[i]! *= g0 + ((g1 - g0) * j) / 8;
  }
  return b;
}

/** Soft saturation for warmth (unity small-signal gain, gently rounded peaks). */
export function saturate(b: Float32Array, drive: number): Float32Array {
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i]! * drive) * norm;
  return b;
}

export function rms(b: Float32Array, from = 0, to = b.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i]! * b[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

export function peakOf(b: Float32Array): number {
  let p = 0;
  for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]!); if (a > p) p = a; }
  return p;
}

/** Loudness proxy: the highest RMS over any 100 ms window (short-term loudness of the sound's main body). */
export function shortTermRms(b: Float32Array, sr: number, windowSec = 0.1): number {
  const w = Math.max(1, Math.min(b.length, Math.round(windowSec * sr)));
  let s = 0;
  for (let i = 0; i < w; i++) s += b[i]! * b[i]!;
  let best = s;
  for (let i = w; i < b.length; i++) {
    s += b[i]! * b[i]! - b[i - w]! * b[i - w]!;
    if (s > best) best = s;
  }
  return Math.sqrt(Math.max(0, best) / w);
}

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-9));

/** A mono sound under construction: layers are mixed into `out` at time offsets. */
export class Track {
  readonly out: Float32Array;
  constructor(readonly sr: number, seconds: number, readonly rng: Rng) {
    this.out = new Float32Array(Math.max(1, Math.ceil(seconds * sr)));
  }

  mix(b: Float32Array, at = 0, gain = 1): this {
    const o = this.out;
    const i0 = Math.round(at * this.sr);
    const n = Math.min(b.length, o.length - i0);
    for (let i = Math.max(0, -i0); i < n; i++) o[i0 + i]! += b[i]! * gain;
    return this;
  }

  /** One exponentially decaying sine partial (modal synthesis), recursive oscillator: cheap and exact. */
  modal(at: number, f: number, amp: number, decay: number, attack = 0.0015, phase = 0): this {
    const sr = this.sr, o = this.out;
    if (f <= 0 || f >= sr * 0.45 || amp === 0) return this;
    const i0 = Math.round(at * sr);
    const n = Math.min(o.length - i0, Math.ceil(decay * 9.3 * sr));
    const w = (TAU * f) / sr, c = Math.cos(w), s = Math.sin(w);
    let re = Math.cos(phase), im = Math.sin(phase), g = amp, a = 0;
    const r = Math.exp(-1 / (decay * sr));
    const ka = 1 - Math.exp(-1 / (Math.max(attack, 1e-4) * sr));
    for (let i = Math.max(0, -i0); i < n; i++) {
      a += (1 - a) * ka;
      o[i0 + i]! += im * g * a;
      const nre = re * c - im * s;
      im = re * s + im * c;
      re = nre;
      g *= r;
    }
    return this;
  }

  /** Filtered noise burst with an attack/decay envelope. */
  burst(at: number, dur: number, o: {
    amp: number; attack?: number; decay?: number; release?: number;
    lp?: Curve; hp?: Curve; bp?: Curve; q?: number; shape?: (u: number) => number;
  }): this {
    const b = noise(this.sr, dur, this.rng);
    if (o.bp !== undefined) filt(b, this.sr, 'bp', o.bp, o.q ?? 1);
    if (o.lp !== undefined) filt(b, this.sr, 'lp', o.lp, o.bp !== undefined ? 0.707 : o.q ?? 0.707);
    if (o.hp !== undefined) filt(b, this.sr, 'hp', o.hp, 0.707);
    env(b, this.sr, o.attack ?? 0.002, o.decay ?? Infinity, o.release ?? Math.min(0.05, dur / 3));
    if (o.shape) shape(b, o.shape);
    return this.mix(b, at, o.amp);
  }

  /** Oscillator voice with envelope and optional low-pass. */
  tone(at: number, dur: number, f: Curve, o: {
    amp: number; wave?: number; attack?: number; decay?: number; release?: number; lp?: Curve; q?: number;
    shape?: (u: number) => number;
  }): this {
    const b = osc(this.sr, dur, f, o.wave ?? 0);
    if (o.lp !== undefined) filt(b, this.sr, 'lp', o.lp, o.q ?? 0.707);
    env(b, this.sr, o.attack ?? 0.003, o.decay ?? Infinity, o.release ?? Math.min(0.08, dur / 3));
    if (o.shape) shape(b, o.shape);
    return this.mix(b, at, o.amp);
  }

  /** Scatters `count` events over [at, at + dur]; `cluster` > 1 bunches them towards the start. */
  grains(at: number, dur: number, count: number, cluster: number, make: (t: number, u: number, i: number) => void): this {
    for (let i = 0; i < count; i++) {
      const u = this.rng.next() ** cluster;
      make(at + u * dur, u, i);
    }
    return this;
  }

  saturate(drive: number): this {
    saturate(this.out, drive);
    return this;
  }

  /** Feedback echo with a low-passed loop (soft, dark repeats). */
  echo(time: number, feedback: number, mix: number, lpHz = 3000): this {
    const o = this.out, d = Math.max(1, Math.round(time * this.sr));
    const line = new Float32Array(o.length);
    const a = 1 - Math.exp((-TAU * lpHz) / this.sr);
    let lp = 0;
    for (let i = 0; i < o.length; i++) {
      const tap = i >= d ? line[i - d]! : 0;
      lp += a * (tap - lp);
      line[i] = o[i]! + lp * feedback;
      o[i]! += lp * mix;
    }
    return this;
  }

  /**
   * Shared soft-room reverb (mono Freeverb-style: damped combs + allpasses, band-limited input, short pre-delay).
   * The wet signal is scaled so its RMS is `mix` x the dry RMS, which keeps the room level consistent per sound.
   */
  room(mix: number, size = 0.8, damp = 0.4): this {
    if (mix <= 0) return this;
    const sr = this.sr, o = this.out, n = o.length, k = sr / 44100;
    // Schroeder layout: 4 damped combs (mutually prime lengths) into 3 allpasses for diffusion. Unrolled with
    // local state: this loop is the single hottest part of rendering.
    const L = (l: number) => Math.max(1, Math.round(l * k));
    const c0 = new Float32Array(L(893)), c1 = new Float32Array(L(1021)), c2 = new Float32Array(L(1138)), c3 = new Float32Array(L(1246));
    const p0 = new Float32Array(L(556)), p1 = new Float32Array(L(341)), p2 = new Float32Array(L(225));
    let i0 = 0, i1 = 0, i2 = 0, i3 = 0, j0 = 0, j1 = 0, j2 = 0, s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    const pre = Math.round(0.012 * sr);
    const wet = new Float32Array(n);
    const hpA = Math.exp((-TAU * 220) / sr), lpA = 1 - Math.exp((-TAU * 4500) / sr), d1 = 1 - damp;
    let hpPrevIn = 0, hpOut = 0, lpOut = 0;
    for (let i = 0; i < n - pre; i++) {
      const x = o[i]!;
      hpOut = hpA * (hpOut + x - hpPrevIn);
      hpPrevIn = x;
      lpOut += lpA * (hpOut - lpOut);
      const inp = lpOut * 0.05;
      const y0 = c0[i0]!, y1 = c1[i1]!, y2 = c2[i2]!, y3 = c3[i3]!;
      s0 = y0 * d1 + s0 * damp; c0[i0] = inp + s0 * size; if (++i0 >= c0.length) i0 = 0;
      s1 = y1 * d1 + s1 * damp; c1[i1] = inp + s1 * size; if (++i1 >= c1.length) i1 = 0;
      s2 = y2 * d1 + s2 * damp; c2[i2] = inp + s2 * size; if (++i2 >= c2.length) i2 = 0;
      s3 = y3 * d1 + s3 * damp; c3[i3] = inp + s3 * size; if (++i3 >= c3.length) i3 = 0;
      let sum = y0 + y1 + y2 + y3;
      let bo = p0[j0]!; p0[j0] = sum + bo * 0.5; if (++j0 >= p0.length) j0 = 0; sum = bo - sum;
      bo = p1[j1]!; p1[j1] = sum + bo * 0.5; if (++j1 >= p1.length) j1 = 0; sum = bo - sum;
      bo = p2[j2]!; p2[j2] = sum + bo * 0.5; if (++j2 >= p2.length) j2 = 0; sum = bo - sum;
      wet[i + pre] = sum;
    }
    const w = rms(wet), d = rms(o);
    if (w > 0) {
      const g = (mix * d) / w;
      for (let i = 0; i < n; i++) o[i]! += wet[i]! * g;
    }
    return this;
  }
}

/**
 * Perceived-loudness proxy: short-term RMS after a 2nd-order 150 Hz high-pass, which approximates what small
 * (phone/laptop) speakers reproduce, so a sub-bass thump cannot mask a quiet audible body.
 */
export function loudness(x: Float32Array, sr: number): number {
  return shortTermRms(filt(x.slice(), sr, 'hp', 150, 0.707), sr);
}

/** Soft limiter curve: linear below `knee`, smoothly approaching `ceiling` above it. */
function limit(x: number, knee: number, ceiling: number): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const r = ceiling - knee;
  return Math.sign(x) * (knee + r * Math.tanh((a - knee) / r));
}

export interface MasterOptions {
  /** Target short-term RMS in dBFS (see `shortTermRms`). */
  targetDb: number;
  /** Output never exceeds this peak. Default 0.89. */
  ceiling?: number;
}

/**
 * Final per-sound mastering: DC block, loudness normalisation to `targetDb`, soft peak limiting, a 2 ms
 * raised-cosine fade-in (no click), trailing silence trimmed, and a short fade-out.
 */
export function master(x: Float32Array, sr: number, o: MasterOptions): Float32Array {
  const ceiling = o.ceiling ?? 0.89, knee = ceiling * 0.66;
  // DC blocker (one-pole high-pass at ~20 Hz).
  const R = Math.exp((-TAU * 20) / sr);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    py = v - px + R * py;
    px = v;
    x[i] = py;
  }
  const target = dbToGain(o.targetDb);
  const src = x.slice();
  const pk = peakOf(src);
  let gain = pk > 0 ? target / Math.max(1e-9, loudness(src, sr)) : 0;
  // Never drive the limiter more than ~6 dB past its knee: prefer a slightly quieter sound to audible squash.
  const maxGain = pk > 0 ? (knee * 2) / pk : 0;
  // Two passes: the limiter only touches brief peaks, so one correction lands within a fraction of a dB.
  for (let iter = 0; iter < 2; iter++) {
    gain = Math.min(gain, maxGain);
    const lim = gain * pk > knee;
    for (let i = 0; i < x.length; i++) x[i] = lim ? limit(src[i]! * gain, knee, ceiling) : src[i]! * gain;
    if (iter === 1 || !lim) break;
    const got = loudness(x, sr);
    if (got <= 0 || Math.abs(gainToDb(got / target)) < 0.15) break;
    gain *= target / got;
  }
  // Trim the tail below -66 dBFS (keeping 20 ms), then fade.
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]!) < 0.0005) end--;
  end = Math.min(x.length, end + Math.round(0.02 * sr));
  const out = x.slice(0, end);
  const fin = Math.min(out.length, Math.round(0.002 * sr));
  for (let i = 0; i < fin; i++) out[i]! *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fin);
  const fout = Math.min(out.length, Math.round(0.03 * sr));
  for (let i = 0; i < fout; i++) out[out.length - 1 - i]! *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fout);
  return out;
}
