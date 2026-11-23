// Dev-only sound audition page: http://localhost:5173/dev/sound-preview.html (not part of the production build).
import { GEM_SOUND_NAMES, POWER_SOUND_FOR_COLOR, type PlayOptions, type SoundId, SOUND_IDS, synthAudio } from '../src/platform/audio';
import { renderSound } from '../src/platform/sounds';
import { analyse } from '../src/platform/audio/analysis';

const audio = synthAudio();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { capture: true });

const colorSel = $<HTMLSelectElement>('color');
GEM_SOUND_NAMES.forEach((n, i) => colorSel.add(new Option(`${i} ${n} (${POWER_SOUND_FOR_COLOR[i]})`, String(i))));

function options(): PlayOptions {
  const num = (id: string) => Number($<HTMLInputElement>(id).value);
  const pitchRaw = $<HTMLInputElement>('pitch').value;
  return {
    color: num('color'), level: num('level'), size: num('size'), index: num('index'), volume: num('volume'),
    ...(pitchRaw === '' ? {} : { pitch: Number(pitchRaw) }),
  };
}

const canvas = $<HTMLCanvasElement>('wave');
function draw(id: SoundId, o: PlayOptions): void {
  const sr = 32000;
  const t0 = performance.now();
  const x = renderSound(id, sr, o);
  const ms = performance.now() - t0;
  const m = analyse(x, sr);
  const g = canvas.getContext('2d');
  if (!g) return;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#f2b631';
  const per = Math.max(1, Math.floor(x.length / w));
  for (let px = 0; px < w; px++) {
    let peak = 0;
    for (let i = px * per; i < (px + 1) * per && i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]!));
    g.fillRect(px, h / 2 - peak * h / 2, 1, Math.max(1, peak * h));
  }
  $('info').textContent = `${id} ${JSON.stringify(o)}\n` +
    `${m.durationSec.toFixed(2)} s  peak ${m.peak.toFixed(2)}  loudness ${m.loudnessDb.toFixed(1)} dB  ` +
    `centroid ${m.centroidHz.toFixed(0)} Hz  (offline render ${ms.toFixed(1)} ms, all layers mixed)`;
}

function play(id: SoundId, o = options()): void {
  audio.play(id, o);
  draw(id, o);
}

const GROUPS: [string, readonly SoundId[]][] = [
  ['Board', ['clear', 'tap_invalid', 'dirt_crack', 'dirt_break', 'crust_chip', 'bedrock_shatter', 'shuffle', 'geode']],
  ['Relics and rewards', ['relic_reveal', 'boon', 'reforge_token', 'perk_pick', 'star']],
  ['Powers', ['power_charge', 'power_merge', 'power_arm', 'power_disarm', 'fire', 'wave', 'quake', 'lightning', 'zap', 'drill']],
  ['Flow and UI', ['level_start', 'win', 'lose', 'ui_click', 'ui_open', 'ui_close']],
];
const listed = new Set(GROUPS.flatMap(([, ids]) => ids));
const rest = SOUND_IDS.filter((id) => !listed.has(id));
if (rest.length) GROUPS.push(['Other', rest]);

const after = (ms: number, fn: () => void) => setTimeout(fn, ms);
const SEQUENCES: [string, () => void][] = [
  ['Clear sizes 2..18', () => [2, 3, 4, 5, 6, 7, 9, 12, 15, 18].forEach((size, i) => after(i * 380, () => play('clear', { ...options(), size, pitch: undefined })))],
  ['All colours', () => [0, 1, 2, 3, 4].forEach((color, i) => after(i * 450, () => play('clear', { ...options(), color })))],
  ['Chain lightning x8', () => { play('lightning'); for (let i = 0; i < 8; i++) after(120 + i * 70, () => play('zap', { ...options(), index: i })); }],
  ['Stars 1-2-3', () => [0, 1, 2].forEach((index, i) => after(i * 350, () => play('star', { ...options(), index })))],
  ['Charge levels 1..5', () => [1, 2, 3, 4, 5].forEach((level, i) => after(i * 900, () => play('power_charge', { ...options(), level })))],
  ['Dirt x6 (variation)', () => { for (let i = 0; i < 6; i++) after(i * 160, () => play(i === 5 ? 'dirt_break' : 'dirt_crack')); }],
];

const root = $('groups');
const section = (title: string) => {
  const h = document.createElement('h2');
  h.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'grid';
  root.append(h, grid);
  return grid;
};
for (const [title, ids] of GROUPS) {
  const grid = section(title);
  for (const id of ids) {
    const b = document.createElement('button');
    b.textContent = id;
    b.onclick = () => play(id);
    grid.append(b);
  }
}
const seqGrid = section('Sequences');
for (const [name, fn] of SEQUENCES) {
  const b = document.createElement('button');
  b.className = 'seq';
  b.textContent = name;
  b.onclick = fn;
  seqGrid.append(b);
}
