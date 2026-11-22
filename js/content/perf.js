// Topic — Performance on the GPU.
import { tf, q, distinct, f, n, h, canvas2d } from './_kit.js';

// ====================================================================== helpers
const IPHONE = { w: 2532, h: 1170 };
const MPX = (IPHONE.w * IPHONE.h) / 1e6; // ≈ 2.96

/** Simple horizontal bar chart: rows [{label, value, color}] */
function bars(el, rows, max, unit = '') {
  const c = canvas2d(300, 28 * rows.length + 8); const { ctx } = c;
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, c.h);
  rows.forEach((r, i) => {
    const y = 6 + i * 28;
    ctx.fillStyle = '#272a37'; ctx.fillRect(110, y, 180, 18);
    ctx.fillStyle = r.color || '#7c6cff'; ctx.fillRect(110, y, Math.max(1, Math.min(1, r.value / max) * 180), 18);
    ctx.fillStyle = '#c9cde0'; ctx.font = '11px sans-serif'; ctx.fillText(r.label, 4, y + 13);
    ctx.fillStyle = '#fff'; ctx.fillText(r.text ?? (n(r.value, 2) + unit), 114, y + 13);
  });
  el.append(c.el);
}

// Simulated float16 (mediump) rounding: 10 mantissa bits
const HALF_DEFS = 'float toHalf(float x){ if (x == 0.0) return 0.0; float e = floor(log2(abs(x))); float s = exp2(e - 10.0); return floor(x / s + 0.5) * s; }';
const halfStep = (x) => Math.pow(2, Math.floor(Math.log2(x)) - 10);

// Overdraw heat map (particles from a hash, counted per pixel)
const HEAT_FRAG = `float cnt = 0.0;
for (int i = 0; i < 40; i++) {
  if (float(i) >= uN) break;
  vec2 c = 0.15 + 0.7 * hash2(vec2(float(i), 3.7));
  if (length(uv - c) < uR) cnt += 1.0;
}
vec3 heat = cnt < 0.5 ? vec3(0.05) : hsv2rgb(vec3(0.66 - min(cnt, 8.0) / 8.0 * 0.66, 0.85, 0.95));
col = heat;`;

// ====================================================================== topic
export default {
  id: 'perf',
  title: 'Performance on the GPU',
  icon: '⚡',
  blurb: 'Where GPU time goes: pixels, overdraw, memory, branches, precision — and where to put the work.',
  cheatsheet: `
<p><b>Fragment cost ≈ cost per pixel × pixels shaded.</b> Resolution scale s → s² pixels. Full-screen passes touch every pixel.</p>
<p><b>Overdraw</b>: pixels shaded several times. Opaque: draw front to back (early-z). Transparent/particles: every layer costs.</p>
<p><b>ALU vs memory</b>: maths is cheap; texture fetches cost latency & bandwidth (mipmaps + compression help). Bake complex maths into textures (LUTs), but a few ops beat a fetch.</p>
<p><b>Branches</b>: pixels run in lockstep groups (warps/wavefronts). If a group splits, it runs <b>both</b> sides. Uniform conditions are free of divergence.</p>
<p><b>Precision</b>: <code>mediump</code>/<code>half</code> (16-bit, ~3 digits) is faster on mobile; keep <code>highp</code> for positions, uv on big textures, time.</p>
<p><b>Move work up</b>: CPU (once) → vertex (per vertex) → fragment (per pixel). Use LODs for distant objects. Every keyword doubles shader variants.</p>`,
  concepts: [
    // ------------------------------------------------------------------ 1
    {
      id: 'perf.pixels',
      title: 'Cost per pixel × pixels',
      blurb: 'The fragment shader bill is a multiplication.',
      lesson: [
        {
          title: 'The pixel bill',
          body: `<p>A fragment shader runs once per covered pixel. So the GPU time it takes is roughly:</p>
<pre class="code">time ≈ cost per pixel × number of pixels shaded</pre>
<div class="analogy">🖌️ <b>Analogy:</b> painting a house. Time = (how long one square metre takes) × (how many square metres). A fancier paint technique <i>or</i> a bigger wall both make the job longer.</div>
<p>An iPhone 12 screen is 2532 × 1170 ≈ <b>${MPX.toFixed(2)} million pixels</b>. At 60 fps you get <b>16.7 ms</b> per frame for everything.</p>`,
        },
        {
          title: 'Render scale: a quadratic win',
          body: `<p>Games on phones often render the 3D scene at a <b>lower resolution</b> and upscale. Because pixels are an <b>area</b>, the savings are <b>squared</b>: 0.5× resolution = only 25% of the pixels.</p>`,
          controls: [{ name: 's', label: 'render scale', min: 0.25, max: 1, step: 0.05, value: 0.75 }],
          shader: (v) => ({ frag: 'vec2 res = vec2(96.0 * uS);\nvec2 q = (floor(uv * res) + 0.5) / res;   // simulate the lower resolution\nvec4 sp = sphereNormal(q);\nvec3 L = normalize(vec3(0.5, 0.7, 0.6));\ncol = mix(vec3(0.15, 0.2, 0.3), vec3(1.0, 0.6, 0.3) * (0.2 + max(dot(sp.xyz, L), 0.0)), sp.w);', uniforms: { uS: v.s } }),
          visual: (el, v) => {
            const px = MPX * v.s * v.s;
            bars(el, [{ label: 'pixels shaded', value: px, text: `${px.toFixed(2)} M (${Math.round(v.s * v.s * 100)}%)`, color: '#3ddc97' }, { label: 'native', value: MPX, text: `${MPX.toFixed(2)} M (100%)`, color: '#6c7289' }], MPX);
          },
          after: '<div class="tip">Unity URP: <i>Render Scale</i>; Unreal: <code>r.ScreenPercentage</code>. Upscalers (FSR, DLSS, MetalFX) recover sharpness. UI is often rendered at full resolution on top.</div>',
        },
        {
          title: 'Full-screen passes',
          body: `<p>A shader on a small object only pays for the pixels the object covers. A <b>full-screen effect</b> (bloom, blur, colour grading, fog, SSAO) runs on <b>every pixel</b> — and many effects need several passes.</p>`,
          controls: [{ name: 'p', label: 'full-screen passes', min: 1, max: 10, step: 1, value: 4 }],
          visual: (el, v) => {
            bars(el, [
              { label: 'small icon 100×100', value: 0.01, text: '0.01 M px', color: '#3ddc97' },
              { label: 'character 600×900', value: 0.54, text: '0.54 M px', color: '#ffc857' },
              { label: `${v.p} full-screen pass${v.p > 1 ? 'es' : ''}`, value: MPX * v.p, text: `${(MPX * v.p).toFixed(1)} M px`, color: '#ff5c6c' },
            ], MPX * 10);
          },
          after: '<div class="note">On mobile, a few cheap-looking full-screen effects can cost more than the whole 3D scene. Merge passes (e.g. one "uber" post shader) and run blurs at half or quarter resolution.</div>',
          quiz: { q: 'Halving the render resolution (0.5×) leaves what fraction of the pixels?', options: ['25%', '50%', '75%'], answer: 0, explain: '0.5 × 0.5 = 0.25 — both width and height halve.' },
        },
      ],
      games: [
        {
          id: 'pixel-math', title: 'Pixel maths', engine: 'numeric', rounds: 5,
          blurb: 'Estimate pixel counts and how they scale.',
          gen: (rng, level) => {
            const R = [[1920, 1080], [1280, 720], [2532, 1170], [2560, 1440], [3840, 2160]];
            if (level === 1) {
              if (rng.chance(0.5)) { const [w, hh] = rng.pick(R); return { prompt: `A ${w}×${hh} screen has how many <b>million</b> pixels? (2 decimals)`, answer: (w * hh) / 1e6, tolerance: 0.011, explain: `<p>${w} × ${hh} = ${(w * hh).toLocaleString('en-US')} ≈ <b>${((w * hh) / 1e6).toFixed(2)} M</b>.</p>` }; }
              const s = rng.pick([0.5, 0.25, 0.75]); return { prompt: `Render scale ${n(s)} (both width and height × ${n(s)}). What fraction of the pixels is shaded?`, answer: s * s, tolerance: 0.011, explain: `<p>${n(s)} × ${n(s)} = <b>${n(s * s, 4)}</b> — area scales with the square.</p>` };
            }
            if (level === 2 || rng.chance(0.4)) {
              const mp = rng.pick([1, 2, 4]), passes = rng.pick([2, 3, 5]);
              if (rng.chance(0.5)) return { prompt: `A screen of ${mp} million pixels runs ${passes} full-screen post passes. How many million fragment shader runs is that per frame?`, answer: mp * passes, explain: `<p>${mp} M × ${passes} = <b>${mp * passes} M</b> per frame — at 60 fps that's ${mp * passes * 60} M per second.</p>` };
              const c = rng.pick([20, 50, 100]); return { prompt: `A full-screen shader costs ${c} instructions per pixel on a ${mp} M pixel screen. How many <b>million</b> instructions per frame?`, answer: c * mp, explain: `<p>${c} × ${mp} M = <b>${c * mp} M</b>. Shaving 10 instructions saves ${10 * mp} M per frame.</p>` };
            }
            const s = rng.pick([0.5, 0.75, 0.8]); const [w, hh] = rng.pick(R.slice(0, 3));
            const px = ((w * s) * (hh * s)) / 1e6;
            return { prompt: `${w}×${hh} at render scale ${n(s)}. How many <b>million</b> pixels are shaded? (2 decimals)`, answer: px, tolerance: 0.015, explain: `<p>${w * s} × ${hh * s} = ${(w * s * hh * s).toLocaleString('en-US')} ≈ <b>${px.toFixed(2)} M</b> (${Math.round(s * s * 100)}% of native).</p>` };
          },
        },
        {
          id: 'scales-with-res', title: 'Does it scale with resolution?', engine: 'buckets', rounds: 2,
          blurb: 'Which costs grow when you raise the screen resolution?',
          gen: () => ({
            prompt: 'Does this cost grow with screen resolution?',
            buckets: ['📈 Grows with pixels', '➖ Doesn\'t care'],
            count: 10,
            items: [
              { text: 'Full-screen colour grading', bucket: 0 },
              { text: 'Bloom blur passes', bucket: 0 },
              { text: 'Number of draw calls', bucket: 1, why: 'A CPU cost per object, not per pixel.' },
              { text: 'Skinning a character\'s vertices', bucket: 1, why: 'Per vertex.' },
              { text: 'A sky shader that fills the screen', bucket: 0 },
              { text: 'Physics simulation', bucket: 1 },
              { text: 'Screen-space ambient occlusion', bucket: 0 },
              { text: 'Vertex shader of a 50k-triangle mesh', bucket: 1 },
              { text: 'Fragment shader of a wall filling half the screen', bucket: 0 },
              { text: 'Uploading uniforms each frame', bucket: 1 },
              { text: 'Transparent particle overdraw', bucket: 0, why: 'Particles get bigger in pixels as resolution rises.' },
              { text: 'AI pathfinding', bucket: 1 },
            ],
          }),
        },
        {
          id: 'pixels-quiz', title: 'Budget brain', engine: 'mcq', rounds: 7,
          blurb: 'Concept questions about pixel cost.',
          questions: [
            q('At 60 fps, how long is one frame?', ['≈16.7 ms', '≈60 ms', '≈1 ms'], '1000 ms / 60.'),
            q('Which is usually more expensive?', ['A blur over the full screen', 'A blur on a 64×64 icon', 'They cost the same'], 'Cost scales with pixels covered.'),
            tf('Rendering at 0.5× resolution shades about half the pixels.', false, 'It\'s 0.5² = 25%.'),
            tf('Making a fragment shader 2× cheaper matters most on objects that cover many pixels.', true, 'The saving is multiplied by the pixel count.'),
            q('Your game is GPU-bound on a phone. Quickest broad win?', ['Lower the 3D render scale', 'Reduce draw calls', 'Use fewer textures in the UI'], 'Fewer pixels = less fragment work everywhere.', { level: 2 }),
            tf('A shader on a far-away object that covers 20 pixels is cheap per frame even if it\'s complex.', true, 'Only 20 runs — though watch the vertex count.', 2),
            q('Why do mobile games often render blur effects at quarter resolution?', ['Blur hides the low resolution and saves ~94% of pixels', 'Mobile GPUs can\'t do full-resolution blur', 'It makes the blur sharper'], '¼ × ¼ = 1/16 of the pixels.', { level: 2 }),
            tf('A higher-resolution screen makes the vertex shader cost more.', false, 'Vertex count doesn\'t change with resolution.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'perf.overdraw',
      title: 'Overdraw',
      blurb: 'Shading the same pixel again and again.',
      lesson: [
        {
          title: 'Painting the same pixel twice',
          body: `<p><b>Overdraw</b> = how many times a pixel is shaded in one frame. Overdraw 1 is perfect. Overdraw 5 means five fragment shader runs for one visible pixel.</p>
<p>Below: an overdraw <b>heat map</b> of particles. Dark blue = 1 layer, green = 3-4, red = 8+. Add particles or make them bigger.</p>`,
          controls: [
            { name: 'n', label: 'particles', min: 1, max: 40, step: 1, value: 12 },
            { name: 'r', label: 'particle radius', min: 0.05, max: 0.35, step: 0.01, value: 0.18 },
          ],
          shader: (v) => ({ frag: HEAT_FRAG, uniforms: { uN: v.n, uR: v.r } }),
          code: (v) => `area of one particle ≈ π × ${n(v.r, 2)}² = ${(Math.PI * v.r * v.r).toFixed(3)} of the image\naverage overdraw ≈ ${v.n} × ${(Math.PI * v.r * v.r).toFixed(3)} ≈ ${(v.n * Math.PI * v.r * v.r).toFixed(2)} layers`,
          after: '<div class="note">Total cost ≈ number of particles × pixels per particle. Big, screen-filling particles are the classic mobile frame-rate killer.</div>',
        },
        {
          title: 'Opaque: early-z can save you',
          body: `<p>For <b>opaque</b> objects the GPU can run the depth test <b>before</b> the fragment shader ("early-z"). If the pixel is already covered by something closer, the shader never runs.</p>
<p>That only helps if the <b>near</b> things are drawn <b>first</b>. Three walls covering the same pixels:</p>
<ul><li>Drawn back to front: each one is closer than the last → all 3 shaded → overdraw 3.</li>
<li>Drawn front to back: the first wins, the other two fail early-z → overdraw 1.</li></ul>
<div class="tip">That's why engines sort opaque objects front to back, and why many do a <b>depth pre-pass</b> (draw depth only, then shade with "equal" test). Tile-based mobile GPUs (Apple, Mali) also do hidden-surface removal in hardware — but <code>discard</code> and alpha blending defeat it.</div>`,
        },
        {
          title: 'Transparent: every layer counts',
          body: `<p>Transparent pixels must blend with what's behind, so nothing can be skipped: <b>every layer is shaded</b>. Smoke, fire, fog sheets, UI panels, foliage cards all stack up.</p>
<p>Ways to fight it:</p>
<ul><li><b>Fewer, smaller</b> particles; fade/kill ones close to the camera (they fill the screen).</li>
<li><b>Tight meshes</b>: fit the particle quad to the visible sprite shape so the transparent corners aren't shaded.</li>
<li>Render particles into a <b>lower-resolution</b> buffer.</li>
<li>Use cutout or opaque where possible (they get early-z).</li></ul>`,
          quiz: { q: 'Why can\'t early-z skip hidden transparent pixels?', options: ['Each transparent layer must be blended, so all are shaded', 'Transparent objects have no depth', 'Early-z only works on the CPU'], answer: 0, explain: 'Every transparent layer contributes to the final colour.' },
        },
      ],
      games: [
        {
          id: 'overdraw-math', title: 'Count the overdraw', engine: 'numeric', rounds: 5,
          blurb: 'Estimate fragment counts and overdraw.',
          gen: (rng, level) => {
            if (level === 1) {
              const k = rng.int(2, 6), s = rng.pick([100, 200]);
              return { prompt: `${k} transparent quads, each ${s}×${s} pixels, are stacked exactly on top of each other. What is the overdraw in that area?`, answer: k, explain: `<p>Every pixel there is shaded <b>${k}</b> times — one per layer. Total fragments: ${k} × ${s * s} = ${k * s * s}.</p>` };
            }
            if (level === 2 || rng.chance(0.5)) {
              const np = rng.pick([10, 20, 40]), ps = rng.pick([50, 100]), A = rng.pick([500, 1000]);
              const total = np * ps * ps, avg = total / (A * A);
              return rng.chance(0.5)
                ? { prompt: `${np} smoke particles, each covering ${ps}×${ps} pixels. How many fragment shader runs in total?`, answer: total, tolerance: 1, explain: `<p>${np} × ${ps * ps} = <b>${total}</b>.</p>` }
                : { prompt: `${np} particles of ${ps}×${ps} pixels are spread over a ${A}×${A} area. Average overdraw over that area? (2 decimals)`, answer: avg, tolerance: 0.011, explain: `<p>Total fragments ${total} ÷ area ${A * A} = <b>${n(avg, 3)}</b> layers on average.</p>` };
            }
            const budget = rng.pick([1, 2, 4]), ps = rng.pick([100, 200]);
            return { prompt: `You can afford ${budget} million particle fragments per frame. Each particle covers ${ps}×${ps} pixels. How many particles fit in the budget?`, answer: (budget * 1e6) / (ps * ps), tolerance: 0.5, explain: `<p>${budget},000,000 ÷ ${ps * ps} = <b>${(budget * 1e6) / (ps * ps)}</b> particles. Halving the particle size (in pixels) would allow 4× as many.</p>` };
          },
        },
        {
          id: 'hottest-spot', title: 'Find the hot spot', engine: 'tap', rounds: 5,
          blurb: 'Tap where the most particle layers stack up.',
          gen: (rng, level) => {
            const k = level === 1 ? 4 : level === 2 ? 6 : 9;
            for (let t = 0; t < 40; t++) {
              const cs = Array.from({ length: k }, () => ({ x: rng.float(0.2, 0.8), y: rng.float(0.2, 0.8), r: rng.float(0.12, 0.25) }));
              const cnt = (u, v) => cs.filter((c) => Math.hypot(u - c.x, v - c.y) < c.r).length;
              let best = 0, at = [0.5, 0.5], area = 0;
              for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) { const c = cnt((x + 0.5) / 60, (y + 0.5) / 60); if (c > best) { best = c; at = [(x + 0.5) / 60, (y + 0.5) / 60]; area = 0; } if (c === best) area++; }
              if (best < 2 || area < 6) continue;
              return {
                prompt: 'Tap the spot with the <b>highest overdraw</b> (most particles on top of each other).',
                sub: level === 3 ? 'Only the outlines are shown — count the overlapping circles.' : 'Each translucent puff adds a layer; brighter = more layers.',
                draw: (ctx, w, hh) => {
                  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, w, hh);
                  for (const c of cs) {
                    ctx.beginPath(); ctx.arc(c.x * w, (1 - c.y) * hh, c.r * w, 0, 7);
                    if (level < 3) { ctx.fillStyle = 'rgba(200,210,255,0.16)'; ctx.fill(); }
                    ctx.strokeStyle = 'rgba(200,210,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
                  }
                },
                score: (u, v) => { const c = cnt(u, v); return c === best ? 1 : c === best - 1 ? 0.5 : 0; },
                reveal: [at],
                explain: `<p>The worst spot has <b>${best}</b> layers: the fragment shader runs ${best} times there for one visible pixel. Average over the whole image is much lower — overdraw is usually concentrated where effects pile up.</p>`,
              };
            }
            return { prompt: 'Tap the centre', draw: (ctx, w, hh) => { ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, w, hh); }, target: [0.5, 0.5], explain: '' };
          },
        },
        {
          id: 'overdraw-quiz', title: 'Overdraw check', engine: 'mcq', rounds: 7,
          blurb: 'Concept questions about overdraw.',
          questions: [
            q('What does an overdraw of 4 mean?', ['That pixel was shaded 4 times this frame', 'The object is 4× too big', '4 draw calls were made'], 'Shaded four times, seen once.'),
            q('Best order for opaque objects to minimise overdraw?', ['Front to back', 'Back to front', 'Largest first'], 'Near objects first let early-z reject hidden pixels.'),
            tf('Early-z helps transparent particles.', false, 'Every transparent layer is shaded and blended.'),
            tf('A particle right in front of the camera can cover the whole screen.', true, 'Near particles are huge in pixels — cull or fade them.'),
            q('Which change reduces particle overdraw?', ['Fit the particle mesh tightly to the sprite shape', 'Use a bigger texture', 'Switch to additive blending'], 'Transparent corners of a quad still get shaded.'),
            tf('Using discard on many objects can make mobile GPUs lose hidden-surface optimisations.', true, 'The GPU can\'t know coverage before the shader runs.', 2),
            q('What is a depth pre-pass?', ['Rendering depth only first, so the colour pass shades each pixel once', 'Clearing the depth buffer twice', 'Sorting transparent objects'], 'Trades some vertex work for zero opaque overdraw.', { level: 2 }),
            tf('Overdraw cost grows with screen resolution.', true, 'Each layer\'s pixel count grows with resolution.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'perf.alu',
      title: 'Texture fetches vs maths',
      blurb: 'Calculating is cheap; fetching from memory is slow to arrive.',
      lesson: [
        {
          title: 'Two kinds of work',
          body: `<p>A shader spends time on two different things:</p>
<ul><li><b>ALU</b> (arithmetic): <code>+ − × dot mix</code>… done in registers right inside the core. Very fast.</li>
<li><b>Memory</b>: <code>texture2D()</code> reads from texture memory. It takes many cycles for the data to <b>arrive</b>, and moves data across the chip (bandwidth = power).</li></ul>
<div class="analogy">📚 <b>Analogy:</b> working out 7 × 8 in your head is instant. Looking something up means walking to the library shelf. The GPU hides the walk by working on other pixels while it waits — as long as there's enough other work to switch to.</div>`,
        },
        {
          title: 'A rough price list',
          body: `<p>Exact numbers depend on the GPU, but the <b>order</b> is fairly universal (relative cost in "simple op" units):</p>`,
          visual: (el) => bars(el, [
            { label: 'add / mul / mad', value: 1, text: '1', color: '#3ddc97' },
            { label: 'dot(vec3)', value: 2, text: '≈1–3', color: '#3ddc97' },
            { label: 'sqrt / inversesqrt', value: 4, text: '≈4', color: '#ffc857' },
            { label: 'sin / cos / exp2', value: 6, text: '≈4–8', color: '#ffc857' },
            { label: 'pow(x, y)', value: 9, text: '≈ log2 + mul + exp2', color: '#ff9f43' },
            { label: 'texture fetch', value: 20, text: 'latency 100s of cycles*', color: '#ff5c6c' },
          ], 20),
          after: '<p class="small dim">* The latency is mostly hidden when many pixels are in flight, but fetches also cost bandwidth and cache space.</p><div class="note"><code>x * x</code> is cheaper than <code>pow(x, 2.0)</code>; <code>normalize</code> = dot + inversesqrt + mul. Small things add up across millions of pixels.</div>',
        },
        {
          title: 'Maths or a lookup?',
          body: `<p>Five octaves of procedural noise (<code>fbm</code>) costs ~20 hashes with <code>sin</code>, plus dozens of mixes, <b>per pixel</b>. A pre-baked noise <b>texture</b> is one fetch. They can look very similar:</p>`,
          shaders: [
            { spec: { frag: 'col = vec3(fbm(uv * 6.0));' }, label: 'procedural <code>fbm()</code><br>≈ 100+ ALU ops' },
            { spec: { frag: 'col = texture2D(uTex, uv * 1.5).rgb;', textures: { uTex: 'noise' } }, label: 'noise <b>texture</b><br>1 fetch' },
          ],
          after: '<div class="note"><b>Rule of thumb</b>: bake <b>complex</b> functions into textures (noise, ramps/gradients, lighting LUTs). But don\'t replace a <b>couple</b> of maths ops with a texture — the fetch is the more expensive one then.</div>',
        },
        {
          title: 'Bandwidth, mipmaps & compression',
          body: `<ul><li><b>Mipmaps</b>: when a texture is shown small, sampling the full-size image jumps around in memory and thrashes the cache. The smaller mip level is cache-friendly (and looks better).</li>
<li><b>Compression</b> (ASTC, ETC2, BC): 4–8× less memory traffic per fetch.</li>
<li><b>Dependent reads</b>: using one texture's result as another's uv (<code>texture2D(B, texture2D(A, uv).rg)</code>) forces the GPU to wait for the first before it can even start the second.</li>
<li><b>Channel packing</b>: put roughness, metal and AO in R, G, B of one texture: one fetch instead of three.</li></ul>
<div class="tip">On phones, memory bandwidth is a major source of heat and battery drain — often more than the maths.</div>`,
          quiz: { q: 'You need roughness, metallic and AO masks. Cheapest setup?', options: ['Pack them into R, G, B of one texture', 'Three separate grayscale textures', 'Compute them with noise every pixel'], answer: 0, explain: 'One fetch returns all three channels.' },
        },
      ],
      games: [
        {
          id: 'count-fetches', title: 'Count the fetches', engine: 'numeric', rounds: 5,
          blurb: 'How many texture reads does this cost?',
          gen: (rng, level) => {
            if (level === 1) {
              const k = rng.int(2, 5);
              const lines = Array.from({ length: k }, (_, i) => `vec3 c${i} = texture2D(uTex, uv + vec2(${f(i * 0.01, 2)}, 0.0)).rgb;`);
              const extra = rng.pick(['float l = dot(c0, vec3(0.333));', 'vec3 m = mix(c0, c1, 0.5);', 'col = c0 * 2.0;']);
              return { prompt: 'How many texture fetches does this shader do per pixel?', code: [...lines, extra].join('\n'), answer: k, explain: `<p>Each <code>texture2D</code> call is one fetch: <b>${k}</b>. The <code>${extra.split('=')[0].trim()}</code> line is pure maths.</p>` };
            }
            const N = rng.pick([3, 5, 7, 9]);
            if (level === 2 || rng.chance(0.4)) {
              const mp = rng.pick([1, 2]);
              return { prompt: `A blur takes ${N} samples per pixel on a ${mp} million pixel screen. How many <b>million</b> texture fetches per frame?`, answer: N * mp, explain: `<p>${N} × ${mp} M = <b>${N * mp} M</b> fetches.</p>` };
            }
            return rng.chance(0.5)
              ? { prompt: `A ${N}×${N} box blur done in <b>one pass</b>: how many fetches per pixel?`, answer: N * N, explain: `<p>Every sample of the ${N}×${N} square: <b>${N * N}</b>.</p>` }
              : { prompt: `The same ${N}×${N} blur done <b>separably</b> (a horizontal pass of ${N}, then a vertical pass of ${N}). Fetches per pixel, both passes together?`, answer: 2 * N, explain: `<p>${N} + ${N} = <b>${2 * N}</b> instead of ${N * N}. Separable blurs are why big blurs are affordable.</p>` };
          },
        },
        {
          id: 'cheaper-which', title: 'Which is cheaper?', engine: 'mcq', rounds: 8,
          blurb: 'Pick the cheaper of two shader snippets.',
          questions: [
            q('Which is cheaper?', [{ code: 'float y = x * x;' }, { code: 'float y = pow(x, 2.0);' }], 'pow is usually exp2(log2(x)·y): several special-function ops. x*x is one multiply.'),
            q('Which is cheaper per pixel (5 octaves)?', [{ code: 'float nz = texture2D(uNoise, uv).r;' }, { code: 'float nz = fbm(uv * 8.0);' }], 'One fetch vs ~100 ALU ops.'),
            q('Which is cheaper?', [{ code: 'col = uTint * uIntensity; // both uniforms' }, { code: 'col = texture2D(uTintTex, vec2(0.5)).rgb * uIntensity;' }], 'A constant colour as a uniform needs no fetch at all.'),
            q('Which is cheaper?', [{ code: 'vec4 m = texture2D(uMasks, uv); // r, g, b packed' }, { code: 'float r = texture2D(uR, uv).r;\nfloat g = texture2D(uG, uv).r;\nfloat b = texture2D(uB, uv).r;' }], 'Channel packing: one fetch instead of three.'),
            q('Which samples more cheaply when the texture is far away (small on screen)?', ['A mipmapped texture', 'The same texture without mipmaps'], 'Mip levels keep neighbouring pixels reading neighbouring texels → cache hits.'),
            q('Which is cheaper?', [{ code: 'vec3 c = texture2D(uA, uv).rgb;\nvec3 d = texture2D(uB, uv).rgb;' }, { code: 'vec2 o = texture2D(uA, uv).rg;\nvec3 d = texture2D(uB, o).rgb; // dependent' }], 'The dependent read can\'t start until the first fetch returns.', { level: 2 }),
            q('Which is cheaper?', [{ code: 'float d = dot(v, v);' }, { code: 'float d = length(v) * length(v);' }], 'dot(v,v) is the squared length directly; length needs a sqrt (twice here!).', { level: 2 }),
            q('Which is cheaper?', [{ code: 'float s = x * 0.5;' }, { code: 'float s = sin(x) * sin(x) + cos(x) * cos(x) - 0.5 + x * 0.5;' }], 'Same value (sin² + cos² = 1), but the first skips 4 special-function calls. Simplify maths before shipping!', { level: 2 }),
            q('Which is cheaper on a phone?', ['ASTC-compressed texture', 'Uncompressed RGBA8 texture of the same size'], 'Compressed textures move far less data per fetch.', { level: 2 }),
            q('A simple 4-colour gradient ramp. Which is generally cheaper?', [{ code: 'col = mix(a, b, smoothstep(0.0, 1.0, t)); // a few ops' }, { code: 'col = texture2D(uRamp, vec2(t, 0.5)).rgb; // 1 fetch' }], 'For a couple of ops, maths beats a fetch. A LUT wins only when the function is complex or artist-painted.', { level: 3 }),
          ],
        },
        {
          id: 'alu-or-mem', title: 'Maths or memory?', engine: 'buckets', rounds: 2,
          blurb: 'Is this line ALU work or a memory access?',
          gen: () => ({
            prompt: 'Is this mainly ALU maths or a memory (texture) access?',
            buckets: ['🧮 ALU maths', '📚 Memory fetch'],
            count: 10,
            items: [
              { code: 'col = texture2D(uTex, uv).rgb;', bucket: 1 },
              { code: 'float d = length(uv - 0.5);', bucket: 0 },
              { code: 'float n = fbm(uv * 4.0);', bucket: 0, why: 'Procedural noise: lots of maths, no memory.' },
              { code: 'vec3 nm = texture2D(uNormal, uv).xyz;', bucket: 1 },
              { code: 'col = mix(a, b, t);', bucket: 0 },
              { code: 'float s = sin(uTime * 3.0);', bucket: 0 },
              { code: 'vec4 m = texture2D(uMasks, uv * 4.0);', bucket: 1 },
              { code: 'vec3 n = normalize(N);', bucket: 0 },
              { code: 'col = texture2D(uRamp, vec2(l, 0.5)).rgb;', bucket: 1, why: 'A LUT/ramp lookup is a fetch.' },
              { code: 'float v = voronoi(uv * 6.0);', bucket: 0 },
              { code: 'float spec = pow(max(dot(N, H), 0.0), 32.0);', bucket: 0 },
              { code: 'float z = texture2D(uDepth, uv).r;', bucket: 1 },
            ],
          }),
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      id: 'perf.branching',
      title: 'Branching & divergence',
      blurb: 'Pixels march in lockstep groups — splitting the group costs both paths.',
      lesson: [
        {
          title: 'Pixels march in groups',
          body: `<p>GPU cores don't run each pixel independently. They run <b>groups</b> of pixels (32 or 64, called a <b>warp</b> / <b>wavefront</b> / <b>subgroup</b>) with <b>one shared instruction pointer</b>: every pixel in the group executes the same instruction at the same time.</p>
<div class="analogy">🚌 <b>Analogy:</b> a tour bus. Everyone goes to the same places together. If half the group wants the museum and half the beach, the bus drives to <b>both</b>, and each half waits on the bus during the other's stop.</div>
<p>That's an <code>if</code> where pixels in one group disagree: the group runs the <code>if</code> part (others masked off), <b>then</b> the <code>else</code> part. This is <b>divergence</b>.</p>`,
        },
        {
          title: 'See the divergent groups',
          body: `<p>Condition: <code>if (length(uv - 0.5) &lt; r)</code>. The grid shows pixel groups. A group is <b>coherent</b> if all its pixels agree (cheap), <b>divergent</b> (red) if the circle's edge passes through it — it pays for both branches.</p>`,
          controls: [
            { name: 'r', label: 'circle radius', min: 0.05, max: 0.6, step: 0.01, value: 0.3 },
            { name: 'g', label: 'groups per side (bigger groups = fewer)', min: 4, max: 16, step: 1, value: 8 },
          ],
          shader: (v) => ({ frag: `vec2 cell = floor(uv * uG);
vec2 c0 = cell / uG, c1 = (cell + 1.0) / uG;            // this group's square
vec2 nearest = clamp(vec2(0.5), c0, c1);
vec2 mid = 0.5 * (c0 + c1);
vec2 far = vec2(mid.x < 0.5 ? c0.x : c1.x, mid.y < 0.5 ? c0.y : c1.y); // farthest corner
float dmin = length(nearest - 0.5), dmax = length(far - 0.5);
bool inside = length(uv - 0.5) < uR;
bool divergent = dmin < uR && dmax > uR;
col = inside ? vec3(0.95, 0.65, 0.3) : vec3(0.3, 0.45, 0.75);
if (divergent) col = mix(col, vec3(1.0, 0.15, 0.2), 0.55);
else col *= 0.6;
vec2 g = abs(fract(uv * uG + 0.5) - 0.5);
if (min(g.x, g.y) < 0.04) col = vec3(0.08);`, uniforms: { uR: v.r, uG: v.g } }),
          code: (v) => {
            let div = 0; const G = v.g;
            for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
              const c0 = [x / G, y / G], c1 = [(x + 1) / G, (y + 1) / G];
              const nx = Math.min(Math.max(0.5, c0[0]), c1[0]), ny = Math.min(Math.max(0.5, c0[1]), c1[1]);
              const fx = (c0[0] + c1[0]) / 2 < 0.5 ? c0[0] : c1[0], fy = (c0[1] + c1[1]) / 2 < 0.5 ? c0[1] : c1[1];
              const dmin = Math.hypot(nx - 0.5, ny - 0.5), dmax = Math.hypot(fx - 0.5, fy - 0.5);
              if (dmin < v.r && dmax > v.r) div++;
            }
            return `groups: ${G * G}, divergent: ${div} (${Math.round((div / (G * G)) * 100)}%)\nonly those pay for both branches`;
          },
          after: '<div class="note">Only groups on the <b>boundary</b> diverge. A big, smooth region condition is mostly coherent and cheap. A noisy, pixel-by-pixel condition makes nearly every group divergent.</div>',
        },
        {
          title: 'When ifs are fine',
          body: `<ul>
<li><b>Uniform conditions</b>: <code>if (uQuality &gt; 1.0)</code> — every pixel agrees, so no group ever diverges. Free (apart from the test).</li>
<li><b>Coherent regions</b>: sky vs ground, inside vs outside a big shape. Only boundary groups pay double.</li>
<li><b>Early outs</b> that skip expensive work for whole regions can be a big <b>win</b>.</li>
</ul>
<p>Trouble is when the condition flips <b>pixel by pixel</b> (noise, hash, fine textures) and both sides are expensive.</p>
<div class="tip">"Replace ifs with step()/mix()" is half a myth: <code>mix(a, b, step(...))</code> always computes <b>both</b> a and b. For tiny branches the compiler already does that (a "select"). For big branches, a coherent <code>if</code> is better.</div>`,
          quiz: { q: 'if (uTime > 5.0) { expensiveEffect(); } — divergent?', options: ['No — uTime is the same for every pixel', 'Yes — ifs always diverge', 'Only on mobile'], answer: 0, explain: 'A uniform condition gives every pixel the same answer.' },
        },
      ],
      games: [
        {
          id: 'coherent-or-not', title: 'Coherent or divergent?', engine: 'buckets', rounds: 2,
          blurb: 'Will pixels in a group agree on this condition?',
          gen: () => ({
            prompt: 'Will this condition mostly keep pixel groups coherent, or split them?',
            sub: 'Neighbouring pixels share a group. Do neighbours usually agree?',
            buckets: ['🟢 Mostly coherent', '🔴 Highly divergent'],
            count: 10,
            items: [
              { code: 'if (uTime > 5.0)', bucket: 0, why: 'Uniform: identical for all pixels.' },
              { code: 'if (hash(uv * 1000.0) > 0.5)', bucket: 1, why: 'Random per pixel: neighbours disagree constantly.' },
              { code: 'if (uv.y > 0.5)', bucket: 0, why: 'Only one row of groups straddles the line.' },
              { code: 'if (uQuality > 1.0)', bucket: 0 },
              { code: 'if (checker(uv, 400.0) > 0.5)', bucket: 1, why: 'A pattern finer than the groups.' },
              { code: 'if (length(uv - 0.5) < 0.3)', bucket: 0 },
              { code: 'if (texture2D(uNoise, uv * 50.0).r > 0.5)', bucket: 1, why: 'High-frequency noise flips pixel by pixel.' },
              { code: 'for (int i = 0; i < 8; i++) { if (float(i) >= uSteps) break; }', bucket: 0, why: 'uSteps is a uniform: everyone breaks at the same time.' },
              { code: 'if (N.y > 0.7) // snow on top of a big rock', bucket: 0, why: 'Smooth large-scale normals: big coherent areas.' },
              { code: 'if (fract(gl_FragCoord.x * 0.5) > 0.4)', bucket: 1, why: 'Every other pixel column.' },
              { code: 'if (uIsSelected > 0.5)', bucket: 0 },
            ],
          }),
        },
        {
          id: 'tap-divergent', title: 'Find a split group', engine: 'tap', rounds: 5,
          blurb: 'Tap a pixel group where the branch goes both ways.',
          gen: (rng, level) => {
            const G = 8;
            let cond, glsl;
            if (level === 1) {
              const cx = rng.float(0.35, 0.65), cy = rng.float(0.35, 0.65), r = rng.float(0.18, 0.32);
              cond = (u, v) => Math.hypot(u - cx, v - cy) < r; glsl = `length(uv - vec2(${f(cx)}, ${f(cy)})) < ${f(r)}`;
            } else if (level === 2) {
              const a = rng.float(-1.2, 1.2), b = rng.float(0.3, 0.7);
              cond = (u, v) => v > b + a * (u - 0.5); glsl = `uv.y > ${f(b)} + ${f(a)} * (uv.x - 0.5)`;
            } else {
              const k = rng.pick([6, 8, 10]), ph = rng.float(0, 6);
              cond = (u, v) => Math.sin(u * k + ph) + Math.sin(v * k * 0.7) > 0.4; glsl = `sin(uv.x * ${f(k)} + ${f(ph)}) + sin(uv.y * ${f(k * 0.7)}) > 0.4`;
            }
            const mixed = (x, y) => { let t = 0, s = 0; for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { s++; if (cond((x + (i + 0.5) / 12) / G, (y + (j + 0.5) / 12) / G)) t++; } return t > 0 && t < s; };
            const list = [];
            for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (mixed(x, y)) list.push([(x + 0.5) / G, (y + 0.5) / G]);
            return {
              prompt: 'Each square is a group of pixels that runs in lockstep. Tap a group that is <b>divergent</b> (its pixels take different branches).',
              code: `if (${glsl}) col = orange; else col = blue;`,
              shader: { frag: `col = (${glsl}) ? vec3(0.95, 0.65, 0.3) : vec3(0.3, 0.45, 0.75);\nvec2 g = abs(fract(uv * 8.0 + 0.5) - 0.5);\nif (min(g.x, g.y) < 0.03) col = vec3(0.06);` },
              score: (u, v) => (mixed(Math.min(G - 1, Math.floor(u * G)), Math.min(G - 1, Math.floor(v * G))) ? 1 : 0),
              reveal: rng.shuffle(list.slice()).slice(0, 8),
              explain: `<p>${list.length} of ${G * G} groups straddle the boundary — they run <b>both</b> the orange and the blue code. Groups fully inside one colour run only one side.</p>`,
            };
          },
        },
        {
          id: 'branch-cost', title: 'Price the branch', engine: 'numeric', rounds: 5,
          blurb: 'Compute how long a group of pixels spends on an if/else.',
          gen: (rng, level) => {
            const A = rng.pick([10, 20, 40]), B = rng.pick([5, 30, 60]);
            const k = level === 1 ? rng.pick([0, 32, 16]) : rng.pick([0, 1, 8, 16, 31, 32]);
            const cost = k === 32 ? A : k === 0 ? B : A + B;
            if (level === 3 && rng.chance(0.5)) {
              const groups = rng.pick([10, 20]), div = rng.pick([2, 4, 5]);
              const tot = div * (A + B) + (groups - div) * A;
              return { prompt: `The if-branch costs ${A} steps, the else-branch ${B}. ${groups} groups run this shader: ${groups - div} are fully "if", ${div} are divergent. Total steps?`, answer: tot, explain: `<p>Coherent: ${groups - div} × ${A} = ${(groups - div) * A}. Divergent: ${div} × (${A} + ${B}) = ${div * (A + B)}. Total <b>${tot}</b>.</p>` };
            }
            return {
              prompt: `<code>if (cond) { /* ${A} steps */ } else { /* ${B} steps */ }</code><br>In a group of 32 pixels, <b>${k}</b> take the if-branch and ${32 - k} take the else. How many steps does the group spend?`,
              answer: cost,
              explain: `<p>${k === 32 ? `All agree on "if": just ${A}.` : k === 0 ? `All agree on "else": just ${B}.` : `They disagree, so the group runs both: ${A} + ${B} = ${A + B}`} → <b>${cost}</b>. ${k > 0 && k < 32 ? 'Even one pixel out of 32 going the other way costs the whole group the extra branch.' : ''}</p>`,
            };
          },
        },
        {
          id: 'branch-quiz', title: 'Branch beliefs', engine: 'mcq', rounds: 6,
          blurb: 'Myths and facts about ifs in shaders.',
          questions: [
            tf('An if in a shader is always slow.', false, 'Uniform or coherent branches are cheap; only divergence costs both paths.'),
            tf('If one pixel in a 32-pixel group takes the other branch, the whole group runs both branches.', true, 'Lockstep execution: the others wait, masked off.'),
            tf('mix(a, b, step(e, x)) avoids computing a or b.', false, 'It computes both a and b, then picks.'),
            tf('A branch on a uniform value never diverges.', true, 'Every pixel sees the same uniform.'),
            q('Which condition is most likely to diverge?', [{ code: 'if (hash(uv) > 0.5)' }, { code: 'if (uv.x > 0.5)' }, { code: 'if (uMode > 0.5)' }], 'Random per pixel = neighbours disagree.'),
            q('What is a warp / wavefront?', ['A group of threads executing the same instruction together', 'A type of texture filter', 'A post effect'], 'NVIDIA: warp (32); AMD: wavefront (32/64).'),
            q('A loop with a uniform iteration count…', ['Is coherent: all pixels loop the same number of times', 'Always diverges', 'Is not allowed in GLSL'], 'Same count for all.', { level: 2 }),
            tf('An early-out that skips heavy work for large regions (like the sky) can speed things up.', true, 'Whole groups skip the work.', 2),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      id: 'perf.precision',
      title: 'Precision: highp, mediump, half',
      blurb: '16-bit floats are faster on mobile — until the numbers get big.',
      lesson: [
        {
          title: 'Not all floats are equal',
          body: `<p>A <code>float</code> can be stored with different numbers of bits:</p>
<ul><li><b>highp</b> (32-bit, HLSL <code>float</code>): ~7 significant digits.</li>
<li><b>mediump</b> (16-bit on most mobile GPUs, HLSL <code>half</code>): ~3 significant digits, max ≈ 65504.</li>
<li><b>lowp</b>: ~8–10 bits, fine for colours in 0..1 (often treated as mediump today).</li></ul>
<p>On mobile, 16-bit maths can run up to <b>2× faster</b>, uses fewer registers (more pixels in flight) and less power. Desktop GPUs mostly treat everything as 32-bit.</p>
<div class="tip">Unity shaders: <code>half</code> vs <code>float</code> (old <code>fixed</code> = lowp). Shader Graph: the node <i>Precision</i> setting. GLSL: <code>precision mediump float;</code> or per variable <code>mediump vec3 c;</code>.</div>`,
        },
        {
          title: 'Precision runs out with big numbers',
          body: `<p>A 16-bit float has about <b>11 bits</b> of precision <i>relative to its size</i>. Near 1.0 the steps are tiny (~0.001). Near 1000 the step is <b>0.5</b>! Near 4000 it's <b>2</b>.</p>
<p>Below, a pattern made from a world position <code>x = offset + uv.x * 4</code>, using <code>fract(x)</code>. Push the offset (like walking far from the world origin):</p>`,
          controls: [{ name: 'o', label: 'world offset', min: 0, max: 4000, step: 10, value: 600 }],
          shaders: [
            { spec: (v) => ({ frag: 'float x = uOff + uv.x * 4.0;\ncol = vec3(fract(x)) * vec3(0.4, 0.8, 1.0);', uniforms: { uOff: v.o } }), label: 'highp (32-bit)' },
            { spec: (v) => ({ defs: HALF_DEFS, frag: 'float x = toHalf(uOff + uv.x * 4.0);  // simulated 16-bit\ncol = vec3(fract(x)) * vec3(1.0, 0.7, 0.4);', uniforms: { uOff: v.o } }), label: 'mediump / half (16-bit)' },
          ],
          code: (v) => `near x = ${v.o + 2}: 16-bit step = ${n(halfStep(Math.max(1, v.o + 2)), 5)}\n→ fract() can only take ${Math.max(1, Math.round(1 / halfStep(Math.max(1, v.o + 2))))} different value(s)`,
          after: '<div class="note">Same thing happens with <b>time</b>: <code>sin(uTime)</code> in half precision gets choppy after a few minutes of play, because uTime is large.</div>',
        },
        {
          title: 'What needs highp?',
          body: `<ul>
<li>✅ <b>mediump is fine</b>: colours, normals, light/lerp factors, most texture results, small uv offsets.</li>
<li>⚠️ <b>keep highp</b>: world positions (big levels), depth calculations, <b>time</b>, uv for large or heavily tiled textures, accumulating sums.</li>
</ul>
<p>Common trick: subtract the camera position first (camera-relative coordinates) so numbers stay small, then use lower precision safely. Keep time small by wrapping it (<code>mod(time, period)</code>) on the CPU.</p>`,
          quiz: { q: 'A water shader scrolls with uTime in half precision. After 30 minutes the waves stutter. Why?', options: ['uTime got large, so 16-bit steps are too coarse', 'The texture ran out of memory', 'The GPU throttled'], answer: 0, explain: 'At t ≈ 1800 s the half-precision step is 1 second!' },
        },
      ],
      games: [
        {
          id: 'need-highp', title: 'Half or full?', engine: 'buckets', rounds: 2,
          blurb: 'Can this value live in 16-bit mediump/half?',
          gen: () => ({
            prompt: 'mediump/half OK, or does it need highp/float?',
            buckets: ['🪶 mediump / half', '🏋️ highp / float'],
            count: 10,
            items: [
              { text: 'A surface colour (0..1)', bucket: 0 },
              { text: 'A normalised normal vector', bucket: 0 },
              { text: 'World position in a 5 km open world', bucket: 1, why: 'Thousands of units → 16-bit steps of several units.' },
              { text: 'Time since the game started', bucket: 1, why: 'Grows forever; becomes choppy in half.' },
              { text: 'A fresnel / rim factor', bucket: 0 },
              { text: 'uv on a 4096² texture tiled 50×', bucket: 1, why: 'uv reaches 50; half steps of ~0.03 are way bigger than a texel.' },
              { text: 'Diffuse lighting term N·L', bucket: 0 },
              { text: 'Linear depth for a distant far plane', bucket: 1 },
              { text: 'A lerp factor between two colours', bucket: 0 },
              { text: 'Vertex positions of a skinned character (in the vertex shader)', bucket: 1, why: 'Positions are usually kept at full precision — visible jitter otherwise.' },
              { text: 'Roughness read from a texture', bucket: 0 },
              { text: 'An accumulated sum over 100 loop iterations', bucket: 1 },
            ],
          }),
        },
        {
          id: 'half-step', title: 'How coarse is half?', engine: 'numeric', rounds: 5,
          blurb: 'Compute the smallest step a 16-bit float can take near a value.',
          gen: (rng, level) => {
            const X = level === 1 ? rng.pick([256, 512, 1024, 2048]) : rng.pick([100, 300, 600, 1000, 1500, 3000, 5000, 9000]);
            const e = Math.floor(Math.log2(X)), s = Math.pow(2, e - 10);
            return {
              prompt: `16-bit half floats have 10 mantissa bits: the step size near x is <b>2^(floor(log2 x) − 10)</b>. What's the step near x = ${X}?`,
              sub: level === 1 ? `${X} is exactly 2^${e}.` : 'Find the power of two at or just below x first.',
              answer: s, tolerance: s < 0.2 ? 0.005 : 0.011,
              explain: `<p>2^${e} = ${Math.pow(2, e)} ≤ ${X} &lt; ${Math.pow(2, e + 1)}, so the step is 2^(${e} − 10) = 2^${e - 10} = <b>${n(s, 4)}</b>.</p><p>Any value in that range is rounded to a multiple of ${n(s, 4)} — ${s >= 1 ? 'whole units are lost!' : 'fine detail is lost.'}</p>`,
            };
          },
        },
        {
          id: 'precision-quiz', title: 'Precision check', engine: 'mcq', rounds: 6,
          blurb: 'Concept questions on float precision.',
          questions: [
            q('HLSL\'s 16-bit float type is called…', ['half', 'short', 'mini'], 'half (and half2/3/4).'),
            tf('mediump is usually faster than highp on mobile GPUs.', true, 'Twice the throughput on many chips, fewer registers.'),
            tf('Colours in 0..1 usually need highp.', false, '16-bit is plenty for 0..1 colours.'),
            q('Why does far-from-origin geometry jitter with low precision?', ['Large coordinates leave few bits for fine detail', 'The GPU clips it', 'Textures stretch'], 'Precision is relative to magnitude.'),
            q('A common fix for large world coordinates?', ['Camera-relative positions (subtract camera position first)', 'Use lowp', 'Increase texture resolution'], 'Keeps the numbers small where it matters.', { level: 2 }),
            tf('The largest finite half value is about 65504.', true, 'Beyond that it becomes infinity.', 2),
            tf('Desktop GPUs typically run mediump exactly like highp.', true, 'Most desktop GPUs just use 32-bit for everything.', 2),
            q('Time-based animation becomes choppy after long play in half precision. Fix?', ['Wrap time on the CPU (e.g. mod by a period) or use highp for it', 'Use more texture samples', 'Lower the frame rate'], 'Keep the number small or precise.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      id: 'perf.where',
      title: 'Where to compute: CPU, vertex or pixel?',
      blurb: 'Move work up the pipeline; LODs; the cost of shader variants.',
      lesson: [
        {
          title: 'Move work up the pipeline',
          body: `<p>The same line of code can run at three very different frequencies:</p>
<ul><li><b>CPU / uniform</b>: once per object per frame.</li>
<li><b>Vertex shader</b>: once per vertex (thousands).</li>
<li><b>Fragment shader</b>: once per pixel (millions).</li></ul>
<p>If a value is the same for the whole object, compute it <b>once</b> on the CPU and pass a uniform. If it changes smoothly across the surface, the vertex shader may be enough.</p>
<pre class="code">// ❌ per pixel, but identical for every pixel:
col = base * (uSunColor * uSunIntensity * 0.5);
// ✅ precompute uLight = uSunColor * uSunIntensity * 0.5 on the CPU
col = base * uLight;</pre>
<div class="note">Shader compilers can fold <i>constants</i>, but they can't know your uniforms are "the same all frame" — so do it yourself.</div>`,
        },
        {
          title: 'Per-vertex vs per-pixel lighting',
          body: `<p>Lighting computed in the <b>vertex</b> shader is interpolated across triangles (Gouraud shading). That's fine for soft diffuse light, but a sharp <b>specular highlight</b> falls between vertices and gets smeared or lost.</p>
<p>Raise the shininess and compare.</p>`,
          controls: [{ name: 's', label: 'shininess', min: 4, max: 200, step: 1, value: 120 }],
          shaders: [
            { spec: (v) => ({ mesh: 'torus', vert: 'vec3 L = normalize(vec3(0.6, 1.0, 0.45));\nvec3 V = normalize(uCamPos - pos);\nvec3 Hh = normalize(L + V);\nuv = vec2(max(dot(normal, L), 0.0), pow(max(dot(normal, Hh), 0.0), uS)); // computed per VERTEX', frag: 'col = vec3(0.3, 0.55, 1.0) * (0.15 + 0.85 * uv.x) + vec3(uv.y);', uniforms: { uS: v.s }, camera: { yaw: 0.3, pitch: 0.7, dist: 2.8 } }), label: 'per <b>vertex</b> (cheap)' },
            { spec: (v) => ({ mesh: 'torus', frag: 'vec3 L = normalize(vec3(0.6, 1.0, 0.45));\nvec3 V = normalize(uCamPos - P);\nvec3 Hh = normalize(L + V);\ncol = vec3(0.3, 0.55, 1.0) * (0.15 + 0.85 * max(dot(N, L), 0.0)) + vec3(pow(max(dot(N, Hh), 0.0), uS));', uniforms: { uS: v.s }, camera: { yaw: 0.3, pitch: 0.7, dist: 2.8 } }), label: 'per <b>pixel</b>' },
          ],
          after: '<div class="tip">Typical mobile split: diffuse, fog and vertex-lights per vertex; normal maps and specular per pixel. Unity\'s <i>Per-Vertex</i> additional lights option is exactly this trade.</div>',
        },
        {
          title: 'LODs: fewer vertices far away',
          body: `<p>A distant object might cover 30 pixels but still have 20,000 vertices — the <b>vertex</b> shader then dominates. <b>LOD</b> (level of detail) swaps in simpler meshes with distance (and often simpler shaders too).</p>
<p>Same terrain at different LOD levels:</p>`,
          controls: [{ name: 'l', label: 'LOD level', min: 0, max: 4, step: 1, value: 1 }],
          shader: (v) => ({ mesh: 'plane', wire: true, vert: 'float res = 64.0 / exp2(uLod);\nvec2 g = floor(uv * res + 0.5) / res;\npos = vec3(g.x * 2.0 - 1.0, 0.0, -(g.y * 2.0 - 1.0));\npos.y = 0.6 * (fbm(g * 3.0 + 1.0) - 0.5);', frag: 'col = mix(vec3(0.3, 0.6, 0.3), vec3(0.9), saturate(P.y * 2.0 + 0.5));', uniforms: { uLod: v.l }, camera: { pitch: 0.6, dist: 3.2 } }),
          code: (v) => { const r = 64 / Math.pow(2, v.l); return `LOD ${v.l}: ${r}×${r} quads → ${(r + 1) * (r + 1)} vertices (${Math.round(((r + 1) * (r + 1)) / 4225 * 100)}% of LOD 0)`; },
        },
        {
          title: 'Shader variants & keywords',
          body: `<p>Engines let you switch features on/off at <b>compile time</b> with keywords (<code>#ifdef NORMALMAP</code>). Each combination is a <b>separate compiled shader</b> — a variant. Static branches cost nothing at runtime, but:</p>
<p><b>Every on/off keyword doubles the number of variants.</b></p>`,
          controls: [{ name: 'k', label: 'on/off keywords', min: 0, max: 14, step: 1, value: 6 }],
          code: (v) => `variants = 2^${v.k} = ${Math.pow(2, v.k).toLocaleString('en-US')}\n× shader passes × platforms…\n→ build time, memory, and hitches when a variant compiles at runtime`,
          after: '<div class="tip">Unity: <code>shader_feature</code> (only variants used by materials are built) vs <code>multi_compile</code> (all are built). Strip unused ones. Unreal: <i>Static Switch Parameters</i> create permutations the same way; prefer dynamic (uniform) switches for rarely-varying features when the cost is small.</div>',
          quiz: { q: 'Adding one more on/off keyword to a shader with 32 variants gives…', options: ['64 variants', '33 variants', '32 variants'], answer: 0, explain: 'Each existing variant now exists with and without the new keyword.' },
        },
      ],
      games: [
        {
          id: 'where-to-compute', title: 'Where should it run?', engine: 'buckets', rounds: 2,
          blurb: 'CPU once, per vertex, or per pixel?',
          gen: () => ({
            prompt: 'Where is the cheapest place that still looks right?',
            buckets: ['🧠 CPU (once, uniform)', '📐 Per vertex', '🎨 Per pixel'],
            count: 10,
            items: [
              { text: 'Sun colour × sun intensity', bucket: 0, why: 'Same for every pixel of every object.' },
              { text: 'Grass wind sway offset', bucket: 1 },
              { text: 'Normal-map lighting detail', bucket: 2 },
              { text: 'Scroll offset = time × speed', bucket: 0, why: 'One number per frame.' },
              { text: 'Skinning a character with bones', bucket: 1 },
              { text: 'A sharp specular highlight on a low-poly mesh', bucket: 2, why: 'It would fall between vertices.' },
              { text: 'Combining two tint uniforms into one colour', bucket: 0 },
              { text: 'Billboarding particle quads', bucket: 1 },
              { text: 'A dissolve with noise + discard', bucket: 2 },
              { text: 'Soft distance fog on a dense mesh', bucket: 1, why: 'Fog changes smoothly — interpolating per-vertex fog is usually fine.' },
              { text: 'The camera\'s forward vector', bucket: 0 },
              { text: 'Sampling the albedo texture', bucket: 2 },
            ],
          }),
        },
        {
          id: 'variant-count', title: 'Count the variants', engine: 'numeric', rounds: 5,
          blurb: 'How many shader variants do these keywords produce?',
          gen: (rng, level) => {
            const k = rng.int(level === 1 ? 1 : 3, level === 1 ? 4 : 7);
            if (level === 1) return { prompt: `A shader has <b>${k}</b> independent on/off keywords. How many variants?`, answer: Math.pow(2, k), explain: `<p>2^${k} = <b>${Math.pow(2, k)}</b>. Each keyword doubles the count.</p>` };
            const three = rng.pick([3, 4]);
            const passes = level === 3 ? rng.pick([2, 3]) : 1;
            const total = Math.pow(2, k) * three * passes;
            return {
              prompt: `A shader has ${k} on/off keywords plus one keyword set with <b>${three}</b> options (e.g. quality LOW/MED/HIGH${three === 4 ? '/ULTRA' : ''})${passes > 1 ? `, and ${passes} passes (each compiled separately)` : ''}. How many variants?`,
              answer: total,
              explain: `<p>2^${k} × ${three}${passes > 1 ? ` × ${passes}` : ''} = <b>${total}</b>.</p><p>Multi-option keywords multiply by their option count.</p>`,
            };
          },
        },
        {
          id: 'where-quiz', title: 'Pipeline placement', engine: 'mcq', rounds: 7,
          blurb: 'Concept questions on where work belongs.',
          questions: [
            q('A value is identical for all pixels of an object. Where should you compute it?', ['On the CPU, passed as a uniform', 'In the fragment shader', 'In the vertex shader'], 'Once per object beats millions of times.'),
            q('Why does per-vertex specular look blotchy on low-poly meshes?', ['The highlight is only evaluated at vertices and interpolated', 'Vertex shaders have lower precision', 'Textures are missing'], 'Sharp details between vertices get lost.'),
            tf('LODs mainly reduce vertex work for distant objects.', true, 'Fewer vertices (and sometimes cheaper shaders) when detail can\'t be seen anyway.'),
            tf('Each extra on/off shader keyword doubles the possible variants.', true, '2^N growth.'),
            q('Static (#ifdef) branches vs dynamic (uniform) branches:', ['Static costs nothing at runtime but multiplies variants', 'Static is slower at runtime', 'They are identical'], 'Trade compile-time/memory for runtime speed.', { level: 2 }),
            tf('A far-away 20,000-vertex mesh covering 30 pixels is mostly fragment-bound.', false, 'Vertex work dominates there — that\'s the case LODs solve.', 2),
            q('Distance fog on a very dense terrain mesh is a good candidate for…', ['Per-vertex calculation', 'A CPU uniform', 'A texture lookup per pixel'], 'Fog varies smoothly; dense vertices sample it well.', { level: 2 }),
            q('What can cause a hitch the first time an effect appears on screen?', ['A shader variant being compiled at runtime', 'Too many uniforms', 'Mipmaps'], 'Warm up / precompile variants (Unity ShaderVariantCollection, Unreal PSO caching).', { level: 3 }),
          ],
        },
      ],
    },
  ],
};
