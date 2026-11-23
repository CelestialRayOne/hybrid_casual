import { expect, test, type Page } from '@playwright/test';

interface Summary {
  level: number;
  status: string;
  movesUsed: number;
  busy: boolean;
  animating: boolean;
  overlay: string | null;
  tray: string[];
  armed: number | null;
  powersUsed: number;
  boss: boolean;
  bossIntro: boolean;
  scroll: number;
  layout: {
    mode: string;
    cell: number;
    cellCss: number;
    levelsBtn: { x: number; y: number };
    perksBtn: { x: number; y: number };
  };
}

declare global {
  interface Window {
    __game?: {
      ready(): boolean;
      summary(): Summary | null;
      suggest(): { type: string; at?: { x: number; y: number }; trayIndex?: number } | null;
      cellToPage(x: number, y: number): { x: number; y: number } | null;
      traySlotToPage(i: number): { x: number; y: number } | null;
      startLevel(level: number): void;
    };
  }
}

/** Console errors that are not ours: the CrazyGames SDK script can't load off-portal / offline. */
const IGNORED = [/crazygames/i, /Failed to load resource/i, /ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION)/i];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** A v2 save that has won levels 1..level-1 (all tutorials seen unless `tutorials` says otherwise). */
function saveAt(level: number, tutorials: string[] = ['tap', 'dirt', 'charge', 'use', 'bedrock']): string {
  const stars: Record<number, number> = {};
  for (let l = 1; l < level; l++) stars[l] = 3;
  return JSON.stringify({
    version: 2, stars, unlocked: level, perks: [], perkPoints: 0, perkPointsGranted: [3, 7, 11, 15, 19].filter((l) => l < level),
    reforgeTokens: 0, tutorialsSeen: tutorials, settings: { sound: false },
  });
}

async function freshStart(page: Page, query = '', save: string | null = null): Promise<void> {
  await page.goto(`./${query}`);
  await page.evaluate((s) => {
    localStorage.clear();
    if (s) localStorage.setItem('gemdig.progress.v1', s);
  }, save);
  await page.reload();
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__game && window.__game.ready(), null, { timeout: 20_000 });
  // Let the level intro play so the first tap lands on a settled board.
  await page.waitForTimeout(400);
}

async function tapAt(page: Page, x: number, y: number, touch: boolean): Promise<void> {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

const isTouch = (name: string) => name.startsWith('mobile');

test('canvas appears with no console errors and no test hook in a normal session', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page);
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => typeof window.__game)).toBe('undefined');
  expect(errors).toEqual([]);
});

test('a real tap on a suggested group changes the game state', async ({ page }, info) => {
  const errors = trackErrors(page);
  await freshStart(page, '?debug=1');
  await waitReady(page);
  const before = await page.evaluate(() => window.__game!.summary()!);
  expect(before.level).toBe(1);
  expect(before.movesUsed).toBe(0);
  const sug = await page.evaluate(() => window.__game!.suggest());
  expect(sug?.type).toBe('tap');
  const pt = await page.evaluate(([x, y]) => window.__game!.cellToPage(x, y), [sug!.at!.x, sug!.at!.y] as const);
  await tapAt(page, pt!.x, pt!.y, isTouch(info.project.name));
  await page.waitForFunction(() => window.__game!.summary()!.movesUsed === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => !window.__game!.summary()!.busy, null, { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('arming a power from the tray and firing it at the board uses it', async ({ page }, info) => {
  const errors = trackErrors(page);
  const touch = isTouch(info.project.name);
  // Level 3 starts with a free Drill Lv2 in the tray.
  await freshStart(page, '?debug=1', saveAt(3));
  await waitReady(page);
  let s = await page.evaluate(() => window.__game!.summary()!);
  expect(s.level).toBe(3);
  expect(s.tray.length).toBeGreaterThan(0);
  const slot = await page.evaluate(() => window.__game!.traySlotToPage(0));
  await tapAt(page, slot!.x, slot!.y, touch);
  await page.waitForFunction(() => window.__game!.summary()!.armed === 0, null, { timeout: 3000 });
  // Tap the same slot again: disarm; and once more: armed again (arming is free).
  await tapAt(page, slot!.x, slot!.y, touch);
  await page.waitForFunction(() => window.__game!.summary()!.armed === null, null, { timeout: 3000 });
  await tapAt(page, slot!.x, slot!.y, touch);
  await page.waitForFunction(() => window.__game!.summary()!.armed === 0, null, { timeout: 3000 });
  s = await page.evaluate(() => window.__game!.summary()!);
  expect(s.movesUsed).toBe(0);
  const cell = await page.evaluate((top) => window.__game!.cellToPage(3, top + 2), s.scroll);
  await tapAt(page, cell!.x, cell!.y, touch);
  await page.waitForFunction(() => window.__game!.summary()!.powersUsed === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => { const x = window.__game!.summary()!; return !x.busy && !x.animating; }, null, { timeout: 8000 });
  s = await page.evaluate(() => window.__game!.summary()!);
  expect(s.armed).toBeNull();
  expect(s.movesUsed).toBe(1);
  expect(errors).toEqual([]);
});

test('meets the minimum cell size', async ({ page }, info) => {
  await freshStart(page, '?debug=1');
  await waitReady(page);
  const s = await page.evaluate(() => window.__game!.summary()!);
  expect(s.layout.cellCss).toBeGreaterThanOrEqual(isTouch(info.project.name) ? 40 : 32);
});

test('resizing does not throw and keeps the game playable', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page, '?debug=1');
  await waitReady(page);
  for (const [w, h] of [[800, 450], [390, 844], [1920, 1080], [360, 640], [1280, 720]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => window.__game!.summary());
  expect(s?.status).toBe('playing');
  const box = await page.locator('#game canvas').boundingBox();
  expect(Math.round(box!.width)).toBe(1280);
  expect(errors).toEqual([]);
});

test('level select opens from the HUD button', async ({ page }, info) => {
  const errors = trackErrors(page);
  await freshStart(page, '?debug=1');
  await waitReady(page);
  const s = await page.evaluate(() => window.__game!.summary()!);
  await tapAt(page, s.layout.levelsBtn.x, s.layout.levelsBtn.y, isTouch(info.project.name));
  await page.waitForFunction(() => window.__game!.summary()!.overlay === 'LevelSelect', null, { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('the perks screen opens from the HUD button', async ({ page }, info) => {
  const errors = trackErrors(page);
  await freshStart(page, '?debug=1', saveAt(4));
  await waitReady(page);
  const s = await page.evaluate(() => window.__game!.summary()!);
  await tapAt(page, s.layout.perksBtn.x, s.layout.perksBtn.y, isTouch(info.project.name));
  await page.waitForFunction(() => window.__game!.summary()!.overlay === 'Perks', null, { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('level 5 is a boss level with the boss banner (debug level jump)', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page, '?debug=1', saveAt(5));
  await waitReady(page);
  await page.evaluate(() => window.__game!.startLevel(5));
  await page.waitForFunction(() => { const s = window.__game!.summary(); return !!s && s.level === 5 && s.bossIntro; }, null, { timeout: 5000 });
  const s = await page.evaluate(() => window.__game!.summary()!);
  expect(s.boss).toBe(true);
  // The banner goes away by itself and never blocks the board.
  await page.waitForFunction(() => !window.__game!.summary()!.bossIntro, null, { timeout: 5000 });
  expect(errors).toEqual([]);
});
