// Renders every real buffer of the sound set and checks objective quality metrics.
//   Table:  SOUND_REPORT=1 npx vitest run src/platform/audio/sounds.metrics.test.ts
//   WAVs:   SOUND_EXPORT="dirA;dirB" npx vitest run src/platform/audio/sounds.metrics.test.ts
import { describe, expect, it } from 'vitest';
import { type BufferKey, GEM_SOUND_NAMES, RENDER_RATE, TARGET_DB, allBufferKeys, bufferKeyString, renderBuffer } from '../sounds';
import { type SoundMetrics, analyse, encodeWav } from './analysis';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/** Recipe loudness offsets (dB vs TARGET_DB), mirrored here so the test pins the intended balance. */
const DB_OFFSET: Record<string, number> = {
  tap_invalid: -6, clear_shimmer: -3, clear_chord: -2, dirt_crack: -4, dirt_break: -2, crust_chip: -5, relic_reveal: 1,
  charge_full: -2, power_merge: 0.5, power_arm: -3, power_disarm: -5, fire: 0.5, quake: 0.5, zap: -3,
  bedrock_shatter: 1, shuffle: -3, win: 1.5, lose: -2, reforge_token: 0.5, ui_click: -9, ui_open: -6, ui_close: -7,
};
/** [min, max] duration in seconds (including tail). */
const DURATION: Record<string, [number, number]> = {
  ui_click: [0.08, 0.3], tap_invalid: [0.2, 0.5], dirt_crack: [0.2, 0.55], crust_chip: [0.2, 0.6], zap: [0.25, 0.6],
  ui_open: [0.3, 0.7], ui_close: [0.3, 0.7], power_arm: [0.3, 0.7], power_disarm: [0.3, 0.7], win: [2, 3.1],
  relic_reveal: [1.1, 2.1], lose: [1.2, 2.1],
};
const DEFAULT_DURATION: [number, number] = [0.3, 1.8];
/** Spectral centroid ceiling (Hz). Most sounds stay under 4 kHz; a few sparkly ones get a little more room. */
const CENTROID_MAX: Record<string, number> = { crust_chip: 4500, clear_shimmer: 4500, geode: 4500, zap: 4500 };

function label(k: BufferKey): string {
  const parts: string[] = [k.id];
  if (k.id === 'clear' || k.id === 'power_charge') parts.push(GEM_SOUND_NAMES[k.color] ?? String(k.color));
  if (k.id === 'clear') parts.push(`s${k.step}`);
  if (k.variant) parts.push(`v${k.variant}`);
  return parts.join('_');
}

const SR = RENDER_RATE;
const rendered: { key: BufferKey; name: string; samples: Float32Array; m: SoundMetrics; ms: number }[] = [];
const t0 = performance.now();
for (const key of allBufferKeys()) {
  const s = performance.now();
  const samples = renderBuffer(key, SR);
  rendered.push({ key, name: label(key), samples, m: analyse(samples, SR), ms: performance.now() - s });
}
const totalMs = performance.now() - t0;

describe('sound set metrics', () => {
  it('prints the metrics table when SOUND_REPORT is set', () => {
    if (!env.SOUND_REPORT) return;
    const rows = rendered.map(({ name, m, ms }) =>
      `${name.padEnd(24)} ${m.durationSec.toFixed(2).padStart(5)}s  peak ${m.peak.toFixed(2)}  ` +
      `loud ${m.loudnessDb.toFixed(1).padStart(6)} dB  centroid ${m.centroidHz.toFixed(0).padStart(5)} Hz  ` +
      `dc ${m.dc.toExponential(1).padStart(8)}  onset ${m.onsetRatio.toFixed(2)}  ${ms.toFixed(1).padStart(5)} ms`);
    console.log(`${rows.join('\n')}\n${rendered.length} buffers, ${rendered.reduce((a, r) => a + r.m.durationSec, 0).toFixed(1)} s audio, rendered in ${totalMs.toFixed(0)} ms at ${SR} Hz`);
  });

  it.each(rendered.map((r) => [bufferKeyString(r.key), r] as const))('%s is clean, bounded and consistent', (_k, r) => {
    const { m, key } = r;
    expect(m.finite).toBe(true);
    expect(m.peak).toBeLessThanOrEqual(0.9);
    expect(m.peak).toBeGreaterThan(0.05);
    const [lo, hi] = DURATION[key.id] ?? DEFAULT_DURATION;
    expect(m.durationSec).toBeGreaterThanOrEqual(lo);
    expect(m.durationSec).toBeLessThanOrEqual(hi);
    // Loudness: within 1.5 dB of the sound's intended level (the limiter may only cost a little).
    expect(Math.abs(m.loudnessDb - (TARGET_DB + (DB_OFFSET[key.id] ?? 0)))).toBeLessThan(1.5);
    expect(Math.abs(m.dc)).toBeLessThan(0.002);
    expect(m.centroidHz).toBeLessThan(CENTROID_MAX[key.id] ?? 4000);
    expect(m.centroidHz).toBeGreaterThan(80);
    // No click: the first 2 ms ramp in (raised-cosine fade), never starting at full level.
    const n2 = Math.round(0.002 * SR);
    for (let i = 0; i < n2; i++) expect(Math.abs(r.samples[i]!)).toBeLessThanOrEqual(0.9 * (i / n2) + 1e-6);
  });

  it('keeps the whole set loudness-consistent (spread of base-level sounds within 2 dB)', () => {
    const base = rendered.filter((r) => !(r.key.id in DB_OFFSET)).map((r) => r.m.loudnessDb);
    expect(Math.max(...base) - Math.min(...base)).toBeLessThan(2);
  });

  it('exports WAVs when SOUND_EXPORT is set', async () => {
    const dirs = env.SOUND_EXPORT?.split(';').filter(Boolean) ?? [];
    if (!dirs.length) return;
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as {
      mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: Uint8Array): void;
    };
    const WAV_RATE = 24000;
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
      for (const r of rendered) fs.writeFileSync(`${dir}/${r.name}.wav`, encodeWav(renderBuffer(r.key, WAV_RATE), WAV_RATE));
    }
  });
});
