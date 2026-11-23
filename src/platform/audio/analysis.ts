// Offline analysis of rendered sounds (tests, WAV export, dev preview). Not used by the game at runtime.

import { gainToDb, loudness, peakOf } from './dsp';

export interface SoundMetrics {
  durationSec: number;
  peak: number;
  /** Speaker-weighted short-term loudness (see `loudness` in dsp.ts), dBFS. */
  loudnessDb: number;
  /** Mean sample value (DC offset). */
  dc: number;
  /** Energy-weighted spectral centroid over the whole sound, Hz. */
  centroidHz: number;
  /** Largest |sample| in the first 2 ms divided by the overall peak (0 = silent start, 1 = instant full level). */
  onsetRatio: number;
  /** True if every sample is a finite number. */
  finite: boolean;
}

/** In-place iterative radix-2 FFT (re, im of length 2^k). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci, ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti;
        re[a] = re[a]! + tr; im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Energy-weighted spectral centroid from Hann-windowed 2048-sample frames (hop 1024). */
export function spectralCentroid(x: Float32Array, sr: number): number {
  const N = 2048;
  let num = 0, den = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let start = 0; start < Math.max(1, x.length - N / 2); start += N / 2) {
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = (x[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      num += p * ((k * sr) / N);
      den += p;
    }
  }
  return den > 0 ? num / den : 0;
}

export function analyse(x: Float32Array, sr: number): SoundMetrics {
  let finite = true, sum = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i]!)) finite = false;
    sum += x[i]!;
  }
  const peak = peakOf(x);
  const n2 = Math.min(x.length, Math.round(0.002 * sr));
  let onset = 0;
  for (let i = 0; i < n2; i++) onset = Math.max(onset, Math.abs(x[i]!));
  return {
    durationSec: x.length / sr,
    peak,
    loudnessDb: gainToDb(loudness(x, sr)),
    dc: sum / Math.max(1, x.length),
    centroidHz: spectralCentroid(x, sr),
    onsetRatio: peak > 0 ? onset / peak : 0,
    finite,
  };
}

/** 16-bit PCM mono WAV file bytes. */
export function encodeWav(x: Float32Array, sr: number): Uint8Array {
  const bytes = new Uint8Array(44 + x.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i]!)) * 32767), true);
  return bytes;
}
