// Validates all content in a real browser (WebGL): compiles every shader,
// runs every generator at every level, mounts each engine once.
// Usage: node tools/validate.mjs [topicId] [--n=8]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const args = process.argv.slice(2);
const topic = args.find((a) => !a.startsWith('--'));
const n = (args.find((a) => a.startsWith('--n=')) || '--n=6').slice(4);

const server = await serve(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/tools/validate.html?n=${n}${topic ? '&topic=' + topic : ''}`);
await page.waitForFunction(() => document.title === 'done', null, { timeout: 600000 });
const res = await page.evaluate(() => window.__RESULT);
await browser.close();
server.close();

const { stats, problems } = res;
console.log(`Checked ${stats.topics} topics, ${stats.concepts} concepts, ${stats.games} games, ${stats.slides} slides, ${stats.items} items, ${stats.shaders} unique shaders.`);
const all = [...problems, ...consoleErrors.map((m) => ({ where: 'pageerror', msg: m }))];
if (!all.length) { console.log('✅ No problems found.'); process.exit(0); }
// group identical messages
const groups = new Map();
for (const p of all) {
  const key = p.msg.split('\n').slice(0, 3).join('\n');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p.where);
}
console.log(`❌ ${all.length} problems (${groups.size} distinct):\n`);
for (const [msg, wheres] of groups) {
  console.log(`• ${wheres[0]}${wheres.length > 1 ? `  (+${wheres.length - 1} more)` : ''}\n  ${msg.replace(/\n/g, '\n  ')}\n`);
}
process.exit(1);
