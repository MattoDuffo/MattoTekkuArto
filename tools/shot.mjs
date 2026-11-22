// Screenshot routes at iPhone 12 size. Usage:
// node tools/shot.mjs outDir "#/" "#/concept/found.gpu" ...
// A route may include actions after a "|": e.g. "#/play/found.fragment/be-gpu|click:Start ▶|wait:800"
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const [outDir, ...routes] = process.argv.slice(2);
const server = await serve(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let i = 0;
for (const r of routes) {
  const [hash, ...acts] = r.split('|');
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`);
  await page.waitForTimeout(700);
  for (const a of acts) {
    const [k, ...rest] = a.split(':'); const v = rest.join(':');
    if (k === 'click') await page.getByText(v, { exact: false }).first().click();
    else if (k === 'css') await page.locator(v).first().click();
    else if (k === 'wait') await page.waitForTimeout(+v);
    else if (k === 'full') {}
  }
  await page.waitForTimeout(500);
  const file = `${outDir}/shot-${String(++i).padStart(2, '0')}.png`;
  await page.screenshot({ path: file, fullPage: acts.includes('full') });
  console.log(file, hash);
}
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
server.close();
