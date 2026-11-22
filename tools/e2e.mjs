// End-to-end smoke test: lesson → game session → results → practice, at iPhone 12 size.
// Plays every game of the given concepts by giving some answer for each round.
// Usage: node tools/e2e.mjs [outDir] [conceptId ...]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const [outDir = '/tmp', ...conceptIds] = process.argv.slice(2);
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());

async function answerRound() {
  // try each engine's interaction, whichever is present
  const stage = page.locator('#app');
  if (await page.locator('.sheet.open').count()) return;
  const opt = page.locator('.opt');
  if (await opt.count()) { await opt.first().click(); return; }
  const bucketBtns = page.locator('.buckets button');
  if (await bucketBtns.count()) {
    for (let i = 0; i < 30 && !(await page.locator('.sheet.open').count()); i++) {
      await bucketBtns.first().click().catch(() => {});
      await page.waitForTimeout(1200);
    }
    return;
  }
  const keypad = page.locator('.keypad');
  if (await keypad.count()) {
    const fields = await page.locator('.numfield').count();
    for (let i = 0; i < fields; i++) {
      await page.locator('.numfield').nth(i).click();
      await keypad.getByText('5', { exact: true }).click();
    }
    await keypad.getByText('Check').click();
    return;
  }
  const chips = page.locator('.chips .chip:not(.used)');
  const seq = page.locator('.seq');
  if (await seq.count()) {
    while (await chips.count()) await chips.first().click();
    await stage.getByText('Check').click();
    return;
  }
  const blanks = page.locator('.tk-blank');
  if (await blanks.count()) {
    const n = await blanks.count();
    for (let i = 0; i < n; i++) { await page.locator('.tk-blank').nth(i).click(); await page.locator('.chips .chip').first().click(); }
    await stage.getByText('Check', { exact: true }).click();
    return;
  }
  if (await page.locator('.pgrid').count()) {
    await page.locator('.pgrid .cell').first().click();
    await stage.getByText('Run on GPU').click();
    return;
  }
  if (await page.locator('.vec-canvas').count()) {
    const box = await page.locator('.vec-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await stage.getByText('Check', { exact: true }).click();
    return;
  }
  if (await page.locator('input[type=range]').count()) {
    await page.locator('input[type=range]').first().fill('0.5').catch(() => {});
    await stage.getByText('Check', { exact: true }).click();
    return;
  }
  const canvas = page.locator('.sview canvas, canvas');
  if (await stage.getByText('Confirm').count()) {
    const box = await canvas.first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await stage.getByText('Confirm').click();
    return;
  }
  throw new Error('Could not figure out how to answer this round');
}

async function playSession(label) {
  for (let r = 0; r < 25; r++) {
    if (await page.getByText('Done', { exact: true }).count()) break;
    await answerRound();
    await page.waitForSelector('.sheet.open', { timeout: 8000 });
    await page.locator('.sheet.open .btn').click();
    await page.waitForTimeout(350);
  }
  if (!(await page.getByText('Done', { exact: true }).count())) throw new Error(label + ': never reached results');
}

let shots = 0;
const shot = (name) => page.screenshot({ path: `${outDir}/e2e-${String(++shots).padStart(2, '0')}-${name}.png` });
const ids = conceptIds.length ? conceptIds : await (async () => {
  await page.goto(base + '#/topics');
  await page.waitForTimeout(800);
  return page.evaluate(async () => (await import('./js/core/curriculum.js')).concepts.map((c) => c.id));
})();

let played = 0;
for (const cid of ids) {
  // lesson to the end
  await page.goto(base + '#/lesson/' + cid);
  await page.waitForTimeout(500);
  for (let i = 0; i < 12; i++) {
    const next = page.getByText('Next ›');
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(150);
  }
  const games = await page.evaluate(async (id) => (await import('./js/core/curriculum.js')).getConcept(id).games.map((g) => g.id), cid);
  for (const gid of games) {
    await page.goto(base + `#/play/${cid}/${gid}`);
    await page.waitForTimeout(400);
    await page.getByText('Start ▶').click();
    await page.waitForTimeout(400);
    try { await playSession(`${cid}/${gid}`); played++; }
    catch (e) { errors.push(`${cid}/${gid}: ${e.message}`); await shot(`fail-${gid}`); }
  }
}
await page.goto(base + '#/practice/run?mode=smart&rounds=5');
await page.waitForTimeout(600);
try { await playSession('practice'); } catch (e) { errors.push('practice: ' + e.message); }
await shot('practice-results');
await page.goto(base + '#/');
await page.waitForTimeout(500);
await shot('home');
await page.goto(base + '#/stats');
await page.waitForTimeout(500);
await shot('stats');
console.log(`Played ${played} game sessions across ${ids.length} concepts.`);
if (errors.length) { console.log('ERRORS:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1; }
else console.log('✅ e2e ok');
await browser.close();
server.close();
