// Exports the three store covers to ../covers/ (run with the dev server up: npm run dev, then node scripts/export-covers.mjs).
/* global window, document, URL, Buffer */ // Node script; window/document only appear inside page.evaluate callbacks.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../../covers/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await p.goto('http://localhost:5173/dev/covers.html');
await p.waitForFunction(() => window.coversReady === true, null, { timeout: 30000 });
console.log('font ok:', await p.evaluate(() => document.fonts.check('100px "Lilita One"')));
for (const k of ['landscape', 'portrait', 'square']) {
  const url = await p.evaluate((kind) => window.renderCover(kind), k);
  fs.writeFileSync(`${out}/gem-rush-cover-${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
console.log(fs.readdirSync(out));
