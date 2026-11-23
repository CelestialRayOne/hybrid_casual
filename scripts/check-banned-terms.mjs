// Fails if the build output contains Blizzard/Diablo or other third-party IP terms (see CLAUDE.md).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.argv[2] ?? 'dist';
const TERMS = [
  'diablo', 'blizzard', 'horadric', 'horazon', 'sanctuary', 'tristram', 'baal', 'mephisto', 'duriel',
  'tal rasha', 'annihilus', 'stone of jordan', 'frostmourne', 'icecrown', 'lich king', 'eastern sun',
  'resurrected', 'nephalem', 'lord of terror', 'behelit', 'lightsaber', 'lightsabre',
];
const WORDS = ['esr', 'd2r', 'zod', 'jah', 'ber', 'cham', 'lo', 'sur', 'ist', 'vex', 'ohm'];
const TEXT_EXT = new Set(['.js', '.html', '.css', '.json', '.txt', '.svg', '.map']);
// Rune names are short; only flag them as quoted standalone strings to avoid false hits in minified code.
const wordRes = WORDS.map((w) => new RegExp(`["'\`]${w}["'\`]`, 'i'));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let hits = 0;
for (const file of walk(ROOT)) {
  const lowerName = file.toLowerCase();
  for (const t of TERMS) if (lowerName.includes(t.replace(/ /g, ''))) { console.error(`filename: ${file} ~ ${t}`); hits++; }
  if (!TEXT_EXT.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8').toLowerCase();
  for (const t of TERMS) if (text.includes(t)) { console.error(`${file}: "${t}"`); hits++; }
  wordRes.forEach((re, i) => { if (re.test(text)) { console.error(`${file}: word "${WORDS[i]}"`); hits++; } });
}
if (hits) { console.error(`\n${hits} banned-term hit(s).`); process.exit(1); }
console.log(`IP check passed (${ROOT}).`);
