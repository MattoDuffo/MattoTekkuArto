// Topic — Shaping functions: thinking in graphs, step, smoothstep, clamp/min/max,
// fract/floor/mod, abs, pow, sin/cos.
import { tf, q, BW, GRAY3, f, n, G } from './_kit.js';

// ================================================================ helpers
const GR = { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 };

/** Brightness strip: col = vec3(expr). Expressions may use `x` (= uv.x) or uv directly. */
const img = (e) => ({ frag: /\bx\b/.test(e.replace(/uv\.x/g, '')) ? `float x = uv.x;\ncol = vec3(${e});` : `col = vec3(${e});` });
/** Code shown for an expression */
const imgCode = (e) => (/\bx\b/.test(e.replace(/uv\.x/g, '')) ? `float x = uv.x;\ncol = vec3(${e});` : `col = vec3(${e});`);

/** Paints y = expr(x) as brightness AND draws its curve in orange on top. */
const plotSpec = (expr, uniforms, defs) => ({
  defs: `${defs || ''}\nfloat plotF(float x){ return ${expr}; }`,
  frag: `float x = uv.x;\nfloat y = plotF(x);\ncol = vec3(clamp(y, 0.0, 1.0)) * 0.8;\n// distance to the curve, corrected for its slope\nfloat dy = (plotF(x + 0.003) - plotF(x - 0.003)) / 0.006;\nfloat d = abs(uv.y - y) / sqrt(1.0 + dy * dy);\ncol = mix(col, vec3(1.0, 0.45, 0.15), 1.0 - smoothstep(0.004, 0.011, d));`,
  uniforms,
});

/** Neutral grid to tap on when the picture should NOT give the answer away (lines every 0.25, faint every 0.05). */
const GRID = {
  frag: `vec2 g = abs(fract(uv * 4.0 + 0.5) - 0.5);\nfloat l = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y));\nvec2 g2 = abs(fract(uv * 20.0 + 0.5) - 0.5);\nfloat l2 = 1.0 - smoothstep(0.0, 0.05, min(g2.x, g2.y));\ncol = vec3(0.1, 0.11, 0.15) + l * 0.3 + l2 * 0.06;`,
};

/** Graph option for mcq (k makes options distinguishable for the validator). */
const gOpt = (fn, k, opts = {}) => ({ graph: { fns: [{ f: fn }], opts: { ...GR, ...opts } }, k });

/** Max difference between two (x,y) → value functions, sampled over the unit square, clamped to the visible range. */
function fnDiff(a, b, lo = 0, hi = 1) {
  let m = 0;
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 6; j++) {
    const x = (i + 0.37) / 25.4, y = (j + 0.41) / 7.4;
    const va = Math.min(hi, Math.max(lo, a(x, y))), vb = Math.min(hi, Math.max(lo, b(x, y)));
    m = Math.max(m, Math.abs(va - vb));
  }
  return m;
}
/**
 * Pick n entries {e, js} from makeWrong() that are all visibly different from each other
 * (max difference ≥ minDiff). Correct one first.
 */
function pickFns(rng, correct, makeWrong, n = 4, minDiff = 0.25, lo = 0, hi = 1) {
  const out = [correct];
  for (let t = 0; out.length < n && t < 300; t++) {
    const w = makeWrong(rng, t);
    if (!w || out.some((o) => o.e === w.e || fnDiff(o.js, w.js, lo, hi) < minDiff)) continue;
    out.push(w);
  }
  return out;
}
/** Tap score that only looks at u (for vertical stripes). */
const scoreU = (targets, r = 0.04) => (u) => {
  const d = Math.min(...targets.map((t) => Math.abs(u - t)));
  return d <= r ? 1 : Math.max(0, 1 - (d - r) / (r * 3));
};
const lvlPool = (arr, level) => arr.filter((x) => (x.lvl || 1) <= level);

// ================================================================ concept: graphs
const FN = [
  { e: 'x', js: (x) => x, lvl: 1 },
  { e: '1.0 - x', js: (x) => 1 - x, lvl: 1 },
  { e: 'x * x', js: (x) => x * x, lvl: 1 },
  { e: '0.5', js: () => 0.5, lvl: 1 },
  { e: 'step(0.5, x)', js: (x) => G.step(0.5, x), lvl: 1 },
  { e: 'x * 2.0', js: (x) => x * 2, lvl: 2 },
  { e: 'sqrt(x)', js: Math.sqrt, lvl: 2 },
  { e: 'abs(x - 0.5) * 2.0', js: (x) => Math.abs(x - 0.5) * 2, lvl: 2 },
  { e: '1.0 - abs(x - 0.5) * 2.0', js: (x) => 1 - Math.abs(x - 0.5) * 2, lvl: 2 },
  { e: 'x * 0.5', js: (x) => x * 0.5, lvl: 2 },
  { e: 'fract(x * 2.0)', js: (x) => G.fract(x * 2), lvl: 3 },
  { e: '1.0 - x * x', js: (x) => 1 - x * x, lvl: 3 },
  { e: 'x * 0.5 + 0.5', js: (x) => x * 0.5 + 0.5, lvl: 3 },
  { e: 'floor(x * 4.0) / 3.0', js: (x) => Math.floor(x * 4) / 3, lvl: 3 },
  { e: '0.5 + 0.5 * sin(x * TAU)', js: (x) => 0.5 + 0.5 * Math.sin(x * G.TAU), lvl: 3 },
];
const DEMO_FNS = [
  { e: 'x', js: (x) => x, say: 'a straight ramp: y equals x' },
  { e: 'x * x', js: (x) => x * x, say: 'stays low for a while, then shoots up' },
  { e: '1.0 - x', js: (x) => 1 - x, say: 'a ramp going down' },
  { e: 'step(0.5, x)', js: (x) => G.step(0.5, x), say: '0 then suddenly 1 — a hard edge' },
  { e: 'sqrt(x)', js: Math.sqrt, say: 'rises fast, then flattens out' },
  { e: '1.0 - abs(x - 0.5) * 2.0', js: (x) => 1 - Math.abs(x - 0.5) * 2, say: 'a tent: peak in the middle' },
];
const demoFn = (v) => DEMO_FNS[Math.round(v.k)] || DEMO_FNS[0];

// inverse-able functions for "tap where y = t"
const INV = [
  { e: 'x', js: (x) => x, inv: (t) => t, lvl: 1 },
  { e: '1.0 - x', js: (x) => 1 - x, inv: (t) => 1 - t, lvl: 1 },
  { e: 'x * 2.0', js: (x) => 2 * x, inv: (t) => t / 2, lvl: 1 },
  { e: 'x * x', js: (x) => x * x, inv: Math.sqrt, lvl: 2, why: (t) => `x × x = ${n(t)} → x = √${n(t)} ≈ ${n(Math.sqrt(t), 2)}` },
  { e: 'sqrt(x)', js: Math.sqrt, inv: (t) => t * t, lvl: 2, why: (t) => `√x = ${n(t)} → x = ${n(t)}² = ${n(t * t, 3)}` },
  { e: 'x * 0.5 + 0.25', js: (x) => x * 0.5 + 0.25, inv: (t) => (t - 0.25) * 2, lvl: 3, why: (t) => `x × 0.5 + 0.25 = ${n(t)} → x = (${n(t)} − 0.25) × 2 = ${n((t - 0.25) * 2)}` },
  { e: '1.0 - x * 2.0', js: (x) => 1 - 2 * x, inv: (t) => (1 - t) / 2, lvl: 3, why: (t) => `1 − 2x = ${n(t)} → x = (1 − ${n(t)}) / 2 = ${n((1 - t) / 2)}` },
];

// ================================================================ concept: step
function stepPaint(rng, level) {
  const W = level === 1 ? 4 : 8;
  const T = W === 4 ? [0.25, 0.5, 0.75] : [0.25, 0.375, 0.5, 0.625, 0.75];
  const t = () => rng.pick(T);
  const two = () => { const [a, b] = rng.pickN(T, 2).sort((p, q2) => p - q2); return [a, b]; };
  const L1 = [
    () => { const a = t(); return { code: `col = vec3(step(${f(a)}, uv.x));`, solve: (u) => G.step(a, u), note: `step(${n(a)}, uv.x) is 1 wherever uv.x ≥ ${n(a)}: the part to the <b>right</b> of the edge.` }; },
    () => { const a = t(); return { code: `col = vec3(step(${f(a)}, uv.y));`, solve: (u, v) => G.step(a, v), note: `Same edge test, but on uv.y: everything <b>above</b> ${n(a)} is white.` }; },
    () => { const a = t(); return { code: `col = vec3(1.0 - step(${f(a)}, uv.x));`, solve: (u) => 1 - G.step(a, u), note: `1.0 − step flips 0↔1, so now the <b>left</b> of ${n(a)} is white.` }; },
  ];
  const L2 = [
    () => { const a = t(); return { code: `col = vec3(step(uv.x, ${f(a)}));`, solve: (u) => G.step(u, a), note: `Trap! The arguments are swapped: step(uv.x, ${n(a)}) asks "is ${n(a)} ≥ uv.x?" — true on the <b>left</b>.` }; },
    () => { const [a, b] = two(); return { code: `col = vec3(step(${f(a)}, uv.x) - step(${f(b)}, uv.x));`, solve: (u) => G.step(a, u) - G.step(b, u), note: `Right of ${n(a)} gives 1, right of ${n(b)} gives 1 too, and 1 − 1 = 0. Only the band between ${n(a)} and ${n(b)} survives.` }; },
    () => { const a = t(); return { code: `col = vec3(1.0 - step(${f(a)}, uv.y));`, solve: (u, v) => 1 - G.step(a, v), note: `Below ${n(a)} is white (flipped step on uv.y).` }; },
  ];
  const L3 = [
    () => { const a = t(), b = t(); return { code: `float m = step(${f(a)}, uv.x) * step(${f(b)}, uv.y);\ncol = vec3(m);`, solve: (u, v) => G.step(a, u) * G.step(b, v), note: 'Multiplying masks = AND: a pixel is white only if BOTH steps are 1.' }; },
    () => { const a = t(), b = t(); return { code: `float m = (1.0 - step(${f(a)}, uv.x)) * step(${f(b)}, uv.y);\ncol = vec3(m);`, solve: (u, v) => (1 - G.step(a, u)) * G.step(b, v), note: `Left of ${n(a)} AND above ${n(b)}.` }; },
    () => { const [a, b] = two(); return { code: `float m = step(${f(a)}, uv.y) * step(uv.y, ${f(b)});\ncol = vec3(m);`, solve: (u, v) => G.step(a, v) * G.step(v, b), note: `step(${n(a)}, uv.y) = "above ${n(a)}", step(uv.y, ${n(b)}) = "below ${n(b)}". Multiply → horizontal band.` }; },
  ];
  const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2, ...L2] : [...L2, ...L3, ...L3];
  return { ...rng.pick(pool)(), W };
}

// ================================================================ concept: smoothstep
const ssJs = (a, b) => (x) => G.smoothstep(a, b, x);

// ================================================================ concept: fract
function fractPaint(rng, level) {
  const L1 = [
    () => ({ code: 'col = vec3(step(0.5, fract(uv.x * 2.0)));', W: 8, solve: (u) => G.step(0.5, G.fract(u * 2)), note: 'uv.x × 2 runs 0→2. fract() makes it 0→1 twice. step(0.5, …) is white in the second half of each repeat.' }),
    () => ({ code: 'col = vec3(step(0.5, fract(uv.y * 2.0)));', W: 8, solve: (u, v) => G.step(0.5, G.fract(v * 2)), note: 'Same as on x, but vertical: two repeats from bottom to top, top half of each is white.' }),
    () => ({ code: 'col = vec3(floor(uv.x * 3.0) / 2.0);', W: 6, palette: GRAY3, solve: (u) => Math.floor(u * 3), note: 'floor(uv.x × 3) is the cell number 0, 1 or 2. Divided by 2 → 0, 0.5, 1.' }),
    () => ({ code: 'col = vec3(floor(uv.x * 2.0));', W: 4, solve: (u) => Math.floor(u * 2), note: 'uv.x × 2 runs 0→2. floor gives 0 on the left half and 1 on the right half.' }),
    () => ({ code: 'col = vec3(1.0 - step(0.5, fract(uv.x * 2.0)));', W: 8, solve: (u) => 1 - G.step(0.5, G.fract(u * 2)), note: 'Two repeats; the 1.0 − makes the FIRST half of each repeat white.' }),
  ];
  const L2 = [
    () => ({ code: 'col = vec3(1.0 - step(0.5, fract(uv.x * 4.0)));', W: 8, solve: (u) => 1 - G.step(0.5, G.fract(u * 4)), note: '4 repeats across; in each one the FIRST half is white because of the 1.0 −.' }),
    () => ({ code: 'col = vec3(mod(floor(uv.x * 4.0), 2.0));', W: 8, solve: (u) => G.mod(Math.floor(u * 4), 2), note: 'Cells 0,1,2,3 → mod 2 → 0,1,0,1: every odd cell is white.' }),
    () => ({ code: 'col = vec3(floor(uv.y * 3.0) / 2.0);', W: 6, palette: GRAY3, solve: (u, v) => Math.floor(v * 3), note: 'Three horizontal bands: 0, 0.5, 1 from bottom to top.' }),
    () => ({ code: 'col = vec3(step(0.5, fract(uv.y * 4.0)));', W: 8, solve: (u, v) => G.step(0.5, G.fract(v * 4)), note: 'Four repeats bottom→top, the upper half of each is white: 4 thin horizontal stripes.' }),
    () => ({ code: 'col = vec3(mod(floor(uv.y * 4.0) + 1.0, 2.0));', W: 8, solve: (u, v) => G.mod(Math.floor(v * 4) + 1, 2), note: 'Rows 0,1,2,3 → +1 → 1,2,3,4 → mod 2 → 1,0,1,0: the bottom row is white.' }),
  ];
  const L3 = [
    () => ({ code: 'vec2 c = floor(uv * 2.0);\ncol = vec3(mod(c.x + c.y, 2.0));', W: 8, solve: (u, v) => G.mod(Math.floor(u * 2) + Math.floor(v * 2), 2), note: 'Cell index sum even → black, odd → white: a 2×2 checkerboard.' }),
    () => ({ code: 'vec2 c = floor(uv * 4.0);\ncol = vec3(mod(c.x + c.y, 2.0));', W: 8, solve: (u, v) => G.mod(Math.floor(u * 4) + Math.floor(v * 4), 2), note: 'A 4×4 checkerboard: each cell is 2×2 painted pixels here.' }),
    () => ({ code: 'vec2 g = fract(uv * 2.0);\ncol = vec3(step(0.5, g.x) * step(0.5, g.y));', W: 8, solve: (u, v) => G.step(0.5, G.fract(u * 2)) * G.step(0.5, G.fract(v * 2)), note: 'Inside each of the 2×2 tiles, only the top-right quarter is white.' }),
    () => ({ code: 'col = vec3(floor(fract(uv.x * 2.0) * 3.0) / 2.0);', W: 6, palette: GRAY3, solve: (u) => Math.floor(G.fract(u * 2) * 3), note: 'Two repeats, and inside each a 3-step staircase 0, 0.5, 1.' }),
  ];
  const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2, ...L2] : [...L2, ...L3, ...L3];
  return rng.pick(pool)();
}

// ================================================================ topic
export default {
  id: 'shaping',
  title: 'Shaping functions',
  icon: '📈',
  blurb: 'step, smoothstep, fract, abs, pow, sin: the building blocks of every mask and gradient.',
  cheatsheet: `
<p>A <b>shaping function</b> takes a number (often <code>uv.x</code>, a distance, or time) and bends it into a new number. Paint it as brightness to <i>see</i> its graph.</p>
<pre class="code">float x = uv.x;
// graph as brightness:
col = vec3(f(x));</pre>
<ul>
<li><code>step(e, x)</code>: 0 if x &lt; e, else 1 (edge FIRST!). <code>1.0 - step</code> flips it.</li>
<li><code>smoothstep(a, b, x)</code>: 0 below a, 1 above b, smooth S between. 0.5 at (a+b)/2.</li>
<li><code>clamp(x, lo, hi)</code>, <code>saturate(x)</code> = clamp 0..1, <code>min(x, c)</code> = ceiling, <code>max(x, c)</code> = floor.</li>
<li><code>fract(x)</code>: decimals only → repeats. <code>floor(x)</code>: which cell. <code>mod(x, m)</code>: repeats every m.</li>
<li><code>abs(x - c)</code>: distance to c (V shape). <code>abs(uv.x - 0.5)</code> mirrors.</li>
<li><code>pow(x, p)</code> on 0..1: p &gt; 1 darker/sharper, p &lt; 1 brighter/softer. Ends stay 0 and 1.</li>
<li><code>sin(x * TAU * freq + phase)</code> is −1..1 → <code>0.5 + 0.5 * sin(…)</code> for 0..1.</li>
</ul>
<p>HLSL / nodes: <code>frac</code> = fract, <code>lerp</code> = mix, <code>saturate</code>, Step, Smoothstep, Power, Fraction, Floor, Absolute, Sine.</p>`,
  concepts: [
    // ------------------------------------------------------------------ graphs
    {
      id: 'shaping.graphs',
      title: 'Thinking in graphs',
      blurb: 'A 1D function painted as brightness: the most useful mental picture in shaders.',
      lesson: [
        {
          title: 'A function is a little machine',
          body: `<p>A <b>function</b> takes a number in and gives a number out. We call the input <code>x</code> and the output <code>y</code>.</p>
<p>Here the machine is <code>y = x * x</code>. Drag <b>x</b> and watch the dot: it sits at height <code>y</code>.</p>
<div class="analogy">🧃 <b>Analogy:</b> a juicer. Put a number in the top, a number comes out the bottom. The <b>graph</b> is a diary of <i>every</i> number you could put in and what came out.</div>`,
          controls: [{ name: 'x', label: 'x (input)', min: 0, max: 1, step: 0.01, value: 0.5 }],
          graph: {
            fns: [{ f: (x) => x * x, label: 'y = x * x' }],
            opts: (v) => ({ ...GR, points: [{ x: v.x, y: v.x * v.x, label: `y = ${n(v.x * v.x, 2)}` }], vlines: [{ x: v.x, color: '#6c7289' }] }),
          },
          code: (v) => `float x = ${f(v.x, 2)};\nfloat y = x * x;   // = ${n(v.x * v.x, 3)}`,
        },
        {
          title: 'From graph to picture',
          body: `<p>In a shader, every <b>column of pixels</b> has its own <code>uv.x</code>. So let <code>x = uv.x</code>, and use <code>y</code> as the <b>brightness</b>:</p>
<pre class="code">float x = uv.x;
col = vec3(y);   // y = f(x)</pre>
<p>High on the graph = bright column. Low = dark column. Slide through a few functions and compare the graph with the picture.</p>`,
          controls: [{ name: 'k', label: 'function #', min: 0, max: DEMO_FNS.length - 1, step: 1, value: 1 }],
          shader: (v) => img(demoFn(v).e),
          graph: { fns: (v) => [{ f: demoFn(v).js, label: 'y = ' + demoFn(v).e }], opts: GR },
          code: (v) => `${imgCode(demoFn(v).e)}\n// ${demoFn(v).say}`,
        },
        {
          title: 'Both at once',
          body: `<p>Trick used all over shader tutorials: paint the brightness <b>and</b> draw the curve on top in a second colour. Then you can read the function straight off the image.</p>
<p>The orange line is drawn where the pixel's <code>uv.y</code> is close to <code>y</code>: "am I near the curve?"</p>
<p class="small dim">(The demos in this app also correct the distance for the curve's slope, so steep parts don't get thin.)</p>`,
          controls: [{ name: 'k', label: 'function #', min: 0, max: DEMO_FNS.length - 1, step: 1, value: 4 }],
          shader: (v) => plotSpec(demoFn(v).e),
          code: (v) => `float x = uv.x;\nfloat y = ${demoFn(v).e};\ncol = vec3(y);\n// orange where uv.y is within ~0.01 of y:\nfloat line = 1.0 - smoothstep(0.004, 0.014, abs(uv.y - y));\ncol = mix(col, vec3(1.0, 0.45, 0.15), line);`,
          size: 260,
        },
        {
          title: 'Below 0 and above 1',
          body: `<p>The screen can only show 0 (black) to 1 (white). But <code>y</code> can be <i>anything</i>: −0.5, 2.0, 37…</p>
<p>Try <code>y = x * a + b</code>. When the curve leaves the 0..1 band, the picture just stays black or white — the <b>screen clips</b>. The number itself is still out there!</p>
<div class="note">Clipping only happens at the very end, on screen. If you use <code>y</code> for more maths first (multiply, mix…), the "invisible" values still matter. We'll tame them with <code>clamp</code> later.</div>`,
          controls: [
            { name: 'a', label: 'a (slope)', min: -2, max: 3, step: 0.05, value: 2 },
            { name: 'b', label: 'b (offset)', min: -1, max: 1, step: 0.05, value: -0.5 },
          ],
          shader: (v) => plotSpec('x * uA + uB', { uA: v.a, uB: v.b }),
          graph: { fns: (v) => [{ f: (x) => x * v.a + v.b }], opts: { xmin: 0, xmax: 1, ymin: -1, ymax: 2, hlines: [{ y: 1, color: '#3ddc97' }, { y: 0, color: '#3ddc97' }] } },
          code: (v) => `float y = x * ${f(v.a, 2)} + ${f(v.b, 2)};\n// left edge  y = ${n(v.b, 2)}\n// right edge y = ${n(v.a + v.b, 2)}\ncol = vec3(y); // screen shows only 0..1`,
        },
        {
          title: 'Why this matters',
          body: `<p>Almost every effect is "take a number, <b>shape</b> it, use it". A circle mask is a shaped <i>distance</i>. A fade is a shaped <i>time</i>. A rim light is a shaped <i>angle</i>.</p>
<p>The rest of this topic is a toolbox of shaping functions: <code>step</code>, <code>smoothstep</code>, <code>clamp</code>, <code>fract</code>, <code>abs</code>, <code>pow</code>, <code>sin</code>. For each one, learn its <b>graph</b> — then you can predict the picture.</p>
<div class="tip">🎛️ In Shader Graph / Unreal, these are the Step, Smoothstep, Clamp, Fraction (Frac), Absolute, Power and Sine nodes. Same graphs, same pictures.</div>`,
          shader: { frag: 'float d = length(uv - 0.5);\ncol = vec3(1.0 - smoothstep(0.25, 0.3, d)) * vec3(1.0, 0.6, 0.2);' },
          code: 'float d = length(uv - 0.5);          // a number: distance\nfloat m = 1.0 - smoothstep(0.25, 0.3, d); // shaped into a mask\ncol = m * vec3(1.0, 0.6, 0.2);',
          quiz: { q: 'A graph is high on the left and low on the right. The brightness picture is…', options: ['Bright on the left, dark on the right', 'Dark on the left, bright on the right', 'Bright at the top, dark at the bottom'], answer: 0, explain: 'x runs left→right, and the height y becomes brightness. High on the left = bright on the left.' },
        },
      ],
      games: [
        {
          id: 'graph-to-image', title: 'Graph → Picture', engine: 'mcq', rounds: 8,
          blurb: 'See the curve, pick the brightness image it paints.',
          gen: (rng, level) => {
            const pool = lvlPool(FN, level + 1);
            const ans = rng.pick(lvlPool(FN, level));
            const opts = pickFns(rng, ans, () => rng.pick(pool), 4, level === 3 ? 0.2 : 0.3, 0, 1);
            return {
              prompt: 'This graph is painted as brightness (<code>col = vec3(y)</code>, x = uv.x). Which picture is it?',
              graph: { fns: [{ f: ans.js }], opts: GR },
              options: opts.map((o) => ({ shader: img(o.e) })),
              explain: `<p>It was <code>y = ${ans.e}</code>. Read the graph left → right: the height at each x is the brightness of that column. Above 1 = white, below 0 = black.</p>`,
            };
          },
        },
        {
          id: 'image-to-graph', title: 'Picture → Graph', engine: 'mcq', rounds: 8,
          blurb: 'See the brightness image, pick its graph.',
          gen: (rng, level) => {
            const pool = lvlPool(FN, level + 1);
            const ans = rng.pick(lvlPool(FN, level));
            const opts = pickFns(rng, ans, () => rng.pick(pool), 4, level === 3 ? 0.2 : 0.3, -0.1, 1.1);
            return {
              prompt: 'Which graph made this brightness picture?',
              sub: 'Scan the picture left → right and imagine its height.',
              shader: img(ans.e),
              options: opts.map((o) => gOpt(o.js, o.e)),
              explain: `<p>It was <code>y = ${ans.e}</code>. Black columns = y at 0 (or below), white = 1 (or above), grey in between.</p>`,
            };
          },
        },
        {
          id: 'read-value', title: 'Read the machine', engine: 'numeric', rounds: 6,
          blurb: 'Put a number into a function, compute what comes out.',
          gen: (rng, level) => {
            const X = rng.step(0.1, 0.9, 0.1);
            const fns = [
              { e: 'x * x', js: (x) => x * x },
              { e: '1.0 - x', js: (x) => 1 - x },
              { e: 'x * 2.0', js: (x) => 2 * x },
              { e: 'x * 0.5 + 0.25', js: (x) => x * 0.5 + 0.25, lvl: 2 },
              { e: '1.0 - x * x', js: (x) => 1 - x * x, lvl: 2 },
              { e: 'x * 2.0 - 0.5', js: (x) => 2 * x - 0.5, lvl: 3 },
              { e: '(1.0 - x) * x', js: (x) => (1 - x) * x, lvl: 3 },
            ];
            const fn = rng.pick(lvlPool(fns, level));
            const y = +fn.js(X).toFixed(4);
            const shown = level < 3;
            return {
              prompt: `<code>y = ${fn.e}</code><br>What is <b>y</b> when <b>x = ${n(X)}</b>?`,
              sub: shown ? 'The graph is there to help you check.' : 'No graph this time — compute it.',
              graph: shown ? { fns: [{ f: fn.js }], opts: { xmin: 0, xmax: 1, ymin: -0.6, ymax: 2, vlines: [{ x: X, color: '#6c7289' }] } } : undefined,
              answer: y,
              explain: `<p>Plug in x = ${n(X)}: <code>${fn.e.replace(/x/g, n(X))}</code> = <b>${n(y, 3)}</b>.</p>${y > 1 || y < 0 ? `<p>On screen this column would just look ${y > 1 ? 'white' : 'black'} — the screen clips — but y really is ${n(y, 3)}.</p>` : ''}`,
            };
          },
        },
        {
          id: 'where-half', title: 'Where is it 0.5?', engine: 'tap', rounds: 6,
          blurb: 'Run the function backwards: tap the x where y reaches a value.',
          gen: (rng, level) => {
            const fn = rng.pick(lvlPool(INV, level));
            let t = level === 1 ? 0.5 : rng.pick([0.25, 0.5, 0.75]);
            if (fn.inv(t) < 0.05 || fn.inv(t) > 0.95) t = 0.5;
            const xs = fn.inv(t);
            const helper = level === 1;
            return {
              prompt: `<code>float x = uv.x;<br>y = ${fn.e};</code><br>Tap where <b>y = ${n(t)}</b>.`,
              sub: helper ? 'The orange curve is the graph. Find where it crosses the dashed height.' : 'The picture is just a grid (lines every 0.25). Work out x yourself!',
              shader: helper
                ? { ...plotSpec(fn.e), frag: plotSpec(fn.e).frag + `\nfloat dash = step(0.5, fract(uv.x * 20.0)) * (1.0 - smoothstep(0.003, 0.008, abs(uv.y - ${f(t)})));\ncol = mix(col, vec3(0.4, 0.9, 1.0), dash);` }
                : GRID,
              score: scoreU([xs], 0.04),
              reveal: [[xs, t]],
              explain: `<p>${fn.why ? fn.why(t) : `Solve <code>${fn.e} = ${n(t)}</code> → x = ${n(xs, 3)}`}.</p><p>Going from "I want this output" back to "which input gives it" is how you place edges and gradients exactly where you want them.</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ step
    {
      id: 'shaping.step',
      title: 'step: the hard edge',
      blurb: 'step(edge, x): 0 before the edge, 1 after. Masks without if.',
      lesson: [
        {
          title: 'The "if" way',
          body: `<p>You already know this: "if I'm right of the line, be white".</p>
<p>Every pixel compares its own <code>uv.x</code> with the edge. Left side fails → stays black. Right side passes → white.</p>`,
          controls: [{ name: 'e', label: 'edge', min: 0, max: 1, step: 0.01, value: 0.4 }],
          shader: (v) => ({ frag: 'if (uv.x >= uE) col = vec3(1.0);', uniforms: { uE: v.e } }),
          code: (v) => `if (uv.x >= ${f(v.e, 2)}) col = vec3(1.0);`,
        },
        {
          title: 'step() does the same in one call',
          body: `<p><code>step(edge, x)</code> returns:</p>
<ul><li><b>0.0</b> if <code>x &lt; edge</code></li><li><b>1.0</b> if <code>x ≥ edge</code></li></ul>
<p>Its graph is a single stair: flat at 0, then a jump to 1 at the edge.</p>
<div class="analogy">🚪 <b>Analogy:</b> a doorway. Before the door you're outside (0). The moment you cross it you're inside (1). No in-between.</div>`,
          controls: [{ name: 'e', label: 'edge', min: 0, max: 1, step: 0.01, value: 0.4 }],
          shader: (v) => plotSpec('step(uE, x)', { uE: v.e }),
          graph: { fns: (v) => [{ f: (x) => G.step(v.e, x), label: 'step(edge, x)' }], opts: (v) => ({ ...GR, vlines: [{ x: v.e, color: '#ff7ab2', label: 'edge' }] }) },
          code: (v) => `col = vec3(step(${f(v.e, 2)}, uv.x));\n// uv.x < ${n(v.e, 2)} → 0.0   uv.x ≥ ${n(v.e, 2)} → 1.0`,
        },
        {
          title: 'The argument-order trap',
          body: `<p><b>Edge comes FIRST.</b> <code>step(edge, x)</code>. It's very easy to swap them by accident.</p>
<p>Read <code>step(a, b)</code> as: <b>"is b at least a?"</b> → 1 if yes.</p>
<ul><li><code>step(0.3, uv.x)</code>: is uv.x ≥ 0.3? → right side white.</li>
<li><code>step(uv.x, 0.3)</code>: is 0.3 ≥ uv.x? → <b>left</b> side white!</li></ul>`,
          controls: [{ name: 'e', label: 'value', min: 0, max: 1, step: 0.01, value: 0.3 }],
          shaders: [
            { spec: (v) => ({ frag: 'col = vec3(step(uE, uv.x));', uniforms: { uE: v.e } }), label: 'step(e, uv.x)' },
            { spec: (v) => ({ frag: 'col = vec3(step(uv.x, uE));', uniforms: { uE: v.e } }), label: 'step(uv.x, e)' },
          ],
          code: (v) => `step(${f(v.e, 2)}, uv.x) // "uv.x ≥ ${n(v.e, 2)}?" → right white\nstep(uv.x, ${f(v.e, 2)}) // "${n(v.e, 2)} ≥ uv.x?" → left white`,
          quiz: { q: 'What does <code>step(0.7, 0.2)</code> return?', options: ['1.0', '0.0', '0.7'], answer: 1, explain: 'Is 0.2 ≥ 0.7? No → 0.0. The second argument is tested against the first.' },
        },
        {
          title: 'Flip it with 1.0 − step',
          body: `<p>A mask is just numbers 0..1, so you can do maths on it. <code>1.0 - m</code> turns 0 into 1 and 1 into 0: the mask is <b>inverted</b>.</p>
<p>Shader people do this constantly: "I have the outside, I want the inside".</p>`,
          controls: [{ name: 'e', label: 'edge', min: 0, max: 1, step: 0.01, value: 0.6 }],
          shaders: [
            { spec: (v) => ({ frag: 'col = vec3(step(uE, uv.y));', uniforms: { uE: v.e } }), label: 'm = step(e, uv.y)' },
            { spec: (v) => ({ frag: 'col = vec3(1.0 - step(uE, uv.y));', uniforms: { uE: v.e } }), label: '1.0 − m' },
          ],
          code: (v) => `float m = step(${f(v.e, 2)}, uv.y); // top white\ncol = vec3(1.0 - m);           // bottom white`,
        },
        {
          title: 'Two steps make a band',
          body: `<p>Want white only <b>between</b> a and b? Two ways:</p>
<pre class="code">// subtract: "after a" minus "after b"
step(a, x) - step(b, x)
// multiply: "after a" AND "before b"
step(a, x) * step(x, b)</pre>
<p>Multiplying masks is the shader version of <b>AND</b>: both must be 1.</p>`,
          controls: [
            { name: 'a', label: 'a', min: 0, max: 1, step: 0.01, value: 0.3 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.01, value: 0.65 },
          ],
          shader: (v) => plotSpec('step(uA, x) - step(uB, x)', { uA: v.a, uB: v.b }),
          code: (v) => `float band = step(${f(v.a, 2)}, uv.x) - step(${f(v.b, 2)}, uv.x);\ncol = vec3(band);${v.a > v.b ? '\n// a > b: the result goes NEGATIVE (shows black)!' : ''}`,
        },
        {
          title: 'Why not just use if?',
          body: `<p><code>step</code> is a <b>value</b>, not a jump in the code. So you can:</p>
<ul><li>multiply, add and invert masks like numbers</li><li>use it on <b>vectors</b>: <code>step(0.5, uv)</code> tests x and y at once</li><li>feed it into <code>mix</code> to choose between colours</li></ul>
<p>Below: <code>step(vec2(0.5), uv)</code> gives a vec2 of two masks; we show them as red and green.</p>
<div class="tip">Modern GPUs handle simple ifs fine, but the "masks are numbers" mindset is what makes node graphs (Step → Multiply → Lerp) click.</div>`,
          shader: { frag: 'vec2 m = step(vec2(0.5), uv);\ncol = vec3(m, 0.0);' },
          code: 'vec2 m = step(vec2(0.5), uv); // (x ≥ 0.5?, y ≥ 0.5?)\ncol = vec3(m, 0.0); // red = right, green = top, yellow = both',
          quiz: { q: 'What does <code>col = vec3(step(0.5, uv.y));</code> look like?', options: ['Top half white, bottom black', 'Bottom half white, top black', 'Left half white'], answer: 0, explain: 'uv.y grows upward. Where uv.y ≥ 0.5 (top half), step gives 1.' },
        },
      ],
      games: [
        {
          id: 'step-paint', title: 'Be the GPU: step', engine: 'paint', rounds: 4,
          blurb: 'Run step() for every pixel and paint the mask.',
          gen: (rng, level) => {
            const r = stepPaint(rng, level);
            return {
              prompt: 'Paint what this shader outputs:',
              code: r.code, w: r.W, h: r.W, palette: BW, solve: r.solve, showUV: level < 3,
              explain: `<p>${r.note}</p><p>Rule: <code>step(edge, x)</code> = 0 if x &lt; edge, otherwise 1.</p>`,
            };
          },
        },
        {
          id: 'step-image', title: 'step code → picture', engine: 'mcq', rounds: 8,
          blurb: 'Read a step() line, pick the mask it makes. Watch the argument order!',
          gen: (rng, level) => {
            const E = level === 1 ? [0.25, 0.5, 0.75] : [0.2, 0.3, 0.4, 0.6, 0.7, 0.8];
            const make = (lvl) => {
              const a = rng.pick(E), b = rng.pick(E);
              const opts = [
                { e: `step(${f(a)}, uv.x)`, js: (x) => G.step(a, x) },
                { e: `step(${f(a)}, uv.y)`, js: (x, y) => G.step(a, y) },
                { e: `1.0 - step(${f(a)}, uv.x)`, js: (x) => 1 - G.step(a, x) },
                { e: `step(uv.x, ${f(a)})`, js: (x) => G.step(x, a), lvl: 2 },
                { e: `step(uv.y, ${f(a)})`, js: (x, y) => G.step(y, a), lvl: 2 },
                { e: `step(${f(a)}, uv.x) * step(${f(b)}, uv.y)`, js: (x, y) => G.step(a, x) * G.step(b, y), lvl: 3 },
                { e: `step(${f(Math.min(a, b))}, uv.x) - step(${f(Math.max(a, b))}, uv.x)`, js: (x) => G.step(Math.min(a, b), x) - G.step(Math.max(a, b), x), lvl: 3, ok: a !== b },
              ].filter((o) => (o.lvl || 1) <= lvl && o.ok !== false);
              return rng.pick(opts);
            };
            const ans = make(level);
            const opts = pickFns(rng, ans, () => make(Math.min(3, level + 1)), 4, 0.5);
            return {
              prompt: 'Which picture does this make?',
              code: `col = vec3(${ans.e});`,
              options: opts.map((o) => ({ shader: img(o.e) })),
              explain: `<p>Read <code>step(a, b)</code> as "is b ≥ a?". In <code>${ans.e}</code> that means: ${/step\(uv/.test(ans.e) ? 'the uv value is the <b>edge</b> here, so the test is flipped → white where uv is <b>smaller</b>.' : 'white where uv is at least the edge.'}</p>`,
            };
          },
        },
        {
          id: 'step-eval', title: 'Compute step', engine: 'numeric', rounds: 6,
          blurb: 'Quick mental maths with step().',
          gen: (rng, level) => {
            const V = () => rng.step(0.1, 0.9, 0.1);
            const kinds = [
              () => { const a = V(); let b = V(); if (b === a) b = +(a > 0.5 ? a - 0.2 : a + 0.2).toFixed(2); return { e: `step(${f(a)}, ${f(b)})`, ans: G.step(a, b), why: `Is ${n(b)} ≥ ${n(a)}? ${b >= a ? 'Yes → 1' : 'No → 0'}.` }; },
              () => { const a = V(); let b = V(); if (b === a) b = +(a > 0.5 ? a - 0.3 : a + 0.3).toFixed(2); return { e: `1.0 - step(${f(a)}, ${f(b)})`, ans: 1 - G.step(a, b), why: `step(${n(a)}, ${n(b)}) = ${G.step(a, b)} (is ${n(b)} ≥ ${n(a)}?), then 1 − that = ${1 - G.step(a, b)}.`, lvl: 2 }; },
              () => { const a = V(); return { e: `step(${f(a)}, ${f(a)})`, ans: 1, why: `Equal counts! step returns 1 when x ≥ edge, and ${n(a)} ≥ ${n(a)} is true.`, lvl: 2 }; },
              () => { const a = V(); const x = V(); return { e: `step(uv.x, ${f(a)})`, pre: `uv.x = ${n(x)}`, ans: G.step(x, a), why: `Swapped order: is ${n(a)} ≥ uv.x (${n(x)})? ${a >= x ? 'Yes → 1' : 'No → 0'}.`, lvl: 2 }; },
              () => { const [a, b] = [V(), V()].sort(); const x = V(); return { e: `step(${f(a)}, uv.x) - step(${f(b)}, uv.x)`, pre: `uv.x = ${n(x)}`, ans: G.step(a, x) - G.step(b, x), why: `${G.step(a, x)} − ${G.step(b, x)} = ${G.step(a, x) - G.step(b, x)}.`, lvl: 3 }; },
              () => { const a = V(), b = V(); const x = V(), y = V(); return { e: `step(${f(a)}, uv.x) * step(${f(b)}, uv.y)`, pre: `uv = (${n(x)}, ${n(y)})`, ans: G.step(a, x) * G.step(b, y), why: `${G.step(a, x)} × ${G.step(b, y)} = ${G.step(a, x) * G.step(b, y)}. Multiply = both must be 1.`, lvl: 3 }; },
              () => { const a = V(); const x = V(); return { e: `step(${f(a)}, uv.x) * 0.5`, pre: `uv.x = ${n(x)}`, ans: G.step(a, x) * 0.5, why: `step gives ${G.step(a, x)}, times 0.5 = ${G.step(a, x) * 0.5}. Masks can be scaled like any number.`, lvl: 3 }; },
            ];
            const k = rng.pick(lvlPool(kinds.map((fn, i) => ({ fn, lvl: [1, 2, 2, 2, 3, 3, 3][i] })), level)).fn();
            return {
              prompt: `${k.pre ? k.pre + '<br>' : ''}What is <code>${k.e}</code>?`,
              answer: k.ans,
              explain: `<p>${k.why}</p><p>Rule: <code>step(edge, x)</code> = 0 if x &lt; edge, else 1.</p>`,
            };
          },
        },
        {
          id: 'step-tune', title: 'Match the edge', engine: 'slider', rounds: 4,
          blurb: 'Slide the edge values until your mask matches the target.',
          gen: (rng, level) => {
            if (level === 1) {
              const e = rng.step(0.15, 0.85, 0.05);
              return {
                prompt: 'Move the edge so your mask matches the target.',
                params: [{ name: 'e', label: 'edge', min: 0, max: 1, step: 0.01, target: e }],
                build: (p) => ({ frag: 'col = vec3(step(uE, uv.x));', uniforms: { uE: p.e } }),
                code: (p) => `col = vec3(step(${f(p.e, 2)}, uv.x));`,
                explain: `<p>The edge was at ${n(e)}: the jump from black to white happens exactly where uv.x = edge.</p>`,
              };
            }
            const a = rng.step(0.1, 0.5, 0.05), b = +(a + rng.step(0.2, 0.4, 0.05)).toFixed(2);
            const vert = level === 3 && rng.chance(0.5);
            const c = vert ? 'uv.y' : 'uv.x';
            return {
              prompt: `Set <b>a</b> and <b>b</b> so the band matches.`,
              sub: 'White where a ≤ ' + c + ' < b.',
              params: [
                { name: 'a', label: 'a (start)', min: 0, max: 1, step: 0.01, target: a },
                { name: 'b', label: 'b (end)', min: 0, max: 1, step: 0.01, target: b },
              ],
              build: (p) => ({ frag: `col = vec3(step(uA, ${c}) - step(uB, ${c}));`, uniforms: { uA: p.a, uB: p.b } }),
              code: (p) => `col = vec3(step(${f(p.a, 2)}, ${c}) - step(${f(p.b, 2)}, ${c}));`,
              explain: `<p>Band from ${n(a)} to ${n(b)}. "After a" minus "after b" leaves only the stretch in between.${level > 1 ? ' If a > b the subtraction goes negative and shows black everywhere.' : ''}</p>`,
            };
          },
        },
        {
          id: 'step-fill', title: 'Build the mask', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the step() call to recreate the target mask.',
          gen: (rng, level) => {
            const a = rng.pick([0.3, 0.4, 0.6, 0.7]);
            const variants = [
              { t: `col = vec3(step([[0]], [[1]]));`, s: [[f(a), ['uv.x', f(1 - a), '0.5']], ['uv.x', [f(a), 'uv.y', '1.0']]], why: `step(${n(a)}, uv.x): edge first, then the value to test.` },
              { t: `col = vec3([[0]] - step(${f(a)}, [[1]]));`, s: [['1.0', ['0.0', '0.5', f(a)]], ['uv.y', ['uv.x', f(a), '1.0']]], why: 'Bottom is white → it\'s the flipped version of "above the edge" on uv.y.' },
              { t: `col = vec3(step([[0]], uv.x) * step(uv.x, [[1]]));`, s: [['0.3', ['0.7', '0.5', 'uv.y']], ['0.7', ['0.3', '0.5', 'uv.y']]], why: 'step(0.3, uv.x) = "right of 0.3", step(uv.x, 0.7) = "left of 0.7". Multiplied → band 0.3..0.7.', lvl: 2 },
              { t: `col = vec3(step([[0]], uv.y) - step([[1]], uv.y));`, s: [['0.25', ['0.75', '0.5', 'uv.x']], ['0.5', ['0.25', '0.75', 'uv.x']]], why: 'Above 0.25 minus above 0.5 → horizontal band 0.25..0.5.', lvl: 2 },
              { t: `col = vec3(step(0.5, uv.x) * [[0]]);`, s: [['step(0.5, uv.y)', ['step(uv.y, 0.5)', '1.0 - step(0.5, uv.x)', 'uv.y']]], why: 'Top-right quarter: right half AND top half.', lvl: 3 },
              { t: `col = vec3([[0]](0.5, uv.x), 0.0, [[1]](uv.x, 0.5));`, s: [['step', ['max', 'smoothstep', 'mix']], ['step', ['min', 'mix', 'max']]], why: 'Red where uv.x ≥ 0.5, blue where 0.5 ≥ uv.x: two steps with swapped arguments are opposite masks.', lvl: 3 },
            ];
            const vr = rng.pick(lvlPool(variants, level));
            const slots = vr.s.map(([ans, wrong]) => ({ options: [wrong[0], ans, ...wrong.slice(1)], answer: ans }));
            const fill = (vals) => vr.t.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Fill the blanks so "Yours" matches the target.',
              template: vr.t, slots,
              build: (vals) => ({ frag: fill(vals) }),
              explain: `<p>${vr.why}</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ smoothstep
    {
      id: 'shaping.smoothstep',
      title: 'smoothstep: the soft edge',
      blurb: 'Two edges and a smooth S-curve between them. The most used function in VFX.',
      lesson: [
        {
          title: 'Hard edges look cheap',
          body: `<p>Real things rarely have perfectly hard edges, and on screen a hard edge shows <b>jaggies</b> (stair-stepped pixels).</p>
<p>Left: a circle made with <code>step</code>. Right: the same circle with a <b>soft edge</b>. Drag the softness.</p>`,
          controls: [{ name: 'w', label: 'softness', min: 0.001, max: 0.2, step: 0.001, value: 0.04 }],
          shaders: [
            { spec: { frag: 'float d = length(uv - 0.5);\ncol = vec3(1.0 - step(0.3, d));' }, label: 'step' },
            { spec: (v) => ({ frag: 'float d = length(uv - 0.5);\ncol = vec3(1.0 - smoothstep(0.3 - uW, 0.3 + uW, d));', uniforms: { uW: v.w } }), label: 'smoothstep' },
          ],
          code: (v) => `float d = length(uv - 0.5);  // distance to centre\n// hard:\ncol = vec3(1.0 - step(0.3, d));\n// soft:\ncol = vec3(1.0 - smoothstep(${f(0.3 - v.w, 3)}, ${f(0.3 + v.w, 3)}, d));`,
        },
        {
          title: 'smoothstep(edge0, edge1, x)',
          body: `<p>Two edges instead of one:</p>
<ul><li>x below <b>edge0</b> → <b>0</b></li><li>x above <b>edge1</b> → <b>1</b></li><li>in between → a smooth climb from 0 to 1</li></ul>
<div class="analogy">🛝 <b>Analogy:</b> step is a wall you jump up. smoothstep is a <b>ramp</b>: edge0 is where the ramp starts, edge1 is where it reaches the top.</div>`,
          controls: [
            { name: 'a', label: 'edge0', min: 0, max: 1, step: 0.01, value: 0.25 },
            { name: 'b', label: 'edge1', min: 0, max: 1, step: 0.01, value: 0.7 },
          ],
          shader: (v) => plotSpec('smoothstep(uA, uB, x)', { uA: v.a, uB: v.b }),
          graph: { fns: (v) => [{ f: ssJs(v.a, v.b), label: 'smoothstep' }], opts: (v) => ({ ...GR, vlines: [{ x: v.a, color: '#6bdfff', label: 'e0' }, { x: v.b, color: '#ff7ab2', label: 'e1' }] }) },
          code: (v) => `col = vec3(smoothstep(${f(v.a, 2)}, ${f(v.b, 2)}, uv.x));\n// black left of ${n(v.a, 2)}, white right of ${n(v.b, 2)}`,
        },
        {
          title: 'What happens inside',
          body: `<p>smoothstep does two things:</p>
<pre class="code">// 1. where am I between the edges? (0..1)
float t = (x - e0) / (e1 - e0);
t = clamp(t, 0.0, 1.0);
// 2. bend the straight line into an S
return t * t * (3.0 - 2.0 * t);</pre>
<p>Step 1 is a straight ramp (blue). Step 2 makes the <b>ends flat</b> (yellow), so there's no visible crease where the ramp starts and stops.</p>
<p>Drag x and watch both numbers.</p>`,
          controls: [{ name: 'x', label: 'x', min: 0, max: 1, step: 0.01, value: 0.35 }],
          graph: {
            fns: [{ f: ssJs(0.2, 0.8), label: 'smoothstep(0.2, 0.8, x)' }, { f: (x) => G.clamp((x - 0.2) / 0.6, 0, 1), label: 't (straight)', color: '#6bdfff', dash: [5, 4] }],
            opts: (v) => ({ ...GR, points: [{ x: v.x, y: G.smoothstep(0.2, 0.8, v.x), color: '#ffd479' }, { x: v.x, y: G.clamp((v.x - 0.2) / 0.6, 0, 1), color: '#6bdfff' }], vlines: [{ x: v.x, color: '#6c7289' }] }),
          },
          code: (v) => { const t = G.clamp((v.x - 0.2) / 0.6, 0, 1); return `// smoothstep(0.2, 0.8, ${n(v.x, 2)})\nt = (${n(v.x, 2)} - 0.2) / 0.6 → clamped ${n(t, 3)}\ns = t*t*(3 - 2t) = ${n(t * t * (3 - 2 * t), 3)}`; },
          after: '<div class="note">Key fact: exactly halfway between the edges, t = 0.5 and the result is <b>0.5</b>. At a quarter, it is only 0.156 (the S starts slowly).</div>',
        },
        {
          title: 'Think "centre and width"',
          body: `<p>Artists usually think: "edge <b>here</b>, this <b>soft</b>". Write it as:</p>
<pre class="code">smoothstep(c - w, c + w, x)</pre>
<p><code>c</code> is where the value is 0.5, <code>w</code> is how far the blur spreads each way. As w → 0 it turns into a step.</p>`,
          controls: [
            { name: 'c', label: 'centre c', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 'w', label: 'width w', min: 0.005, max: 0.5, step: 0.005, value: 0.15 },
          ],
          shader: (v) => plotSpec('smoothstep(uC - uW, uC + uW, x)', { uC: v.c, uW: v.w }),
          code: (v) => `col = vec3(smoothstep(${f(v.c, 2)} - ${f(v.w, 3)}, ${f(v.c, 2)} + ${f(v.w, 3)}, uv.x));\n// = smoothstep(${n(v.c - v.w, 3)}, ${n(v.c + v.w, 3)}, uv.x)`,
        },
        {
          title: 'Going down instead of up',
          body: `<p>To go from 1 down to 0, flip it: <code>1.0 - smoothstep(a, b, x)</code>.</p>
<p>You'll also see <code>smoothstep(b, a, x)</code> (edges swapped). It works on most GPUs, but the GLSL spec says the result is <b>undefined</b> when edge0 ≥ edge1. The <code>1.0 −</code> version is always safe.</p>`,
          controls: [
            { name: 'a', label: 'a', min: 0, max: 1, step: 0.01, value: 0.3 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.01, value: 0.6 },
          ],
          shader: (v) => plotSpec('1.0 - smoothstep(uA, uB, x)', { uA: v.a, uB: v.b }),
          graph: { fns: (v) => [{ f: ssJs(v.a, v.b), label: 'smoothstep(a,b,x)', color: '#6c7289', dash: [4, 4] }, { f: (x) => 1 - G.smoothstep(v.a, v.b, x), label: '1 − smoothstep' }], opts: GR },
          code: (v) => `col = vec3(1.0 - smoothstep(${f(v.a, 2)}, ${f(v.b, 2)}, uv.x));\n// white on the left, fading out between ${n(v.a, 2)} and ${n(v.b, 2)}`,
        },
        {
          title: 'A soft band',
          body: `<p>Same trick as with step: one smoothstep going up minus one going up later = a soft band.</p>
<pre class="code">smoothstep(a - w, a, x)
  - smoothstep(b, b + w, x)</pre>
<p>This is how you make soft stripes, glowing scan lines, or a soft ring (use a distance as x).</p>`,
          controls: [
            { name: 'a', label: 'a', min: 0, max: 1, step: 0.01, value: 0.35 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.01, value: 0.6 },
            { name: 'w', label: 'softness w', min: 0.005, max: 0.3, step: 0.005, value: 0.08 },
          ],
          shader: (v) => plotSpec('smoothstep(uA - uW, uA, x) - smoothstep(uB, uB + uW, x)', { uA: v.a, uB: v.b, uW: v.w }),
          code: (v) => `float band = smoothstep(${f(v.a - v.w, 3)}, ${f(v.a, 2)}, uv.x)\n           - smoothstep(${f(v.b, 2)}, ${f(v.b + v.w, 3)}, uv.x);`,
          quiz: { q: 'What is <code>smoothstep(0.2, 0.6, 0.4)</code>?', options: ['0.5', '0.4', '0.2'], answer: 0, explain: '0.4 is exactly halfway between 0.2 and 0.6, so t = 0.5, and the S-curve gives 0.5 at its middle.' },
        },
      ],
      games: [
        {
          id: 'ss-eval', title: 'Compute smoothstep', engine: 'numeric', rounds: 6,
          blurb: 'Where am I between the edges? Then bend it.',
          gen: (rng, level) => {
            const e0 = rng.pick([0.1, 0.2, 0.3, 0.4]);
            const w = rng.pick([0.2, 0.4]);
            const e1 = +(e0 + w).toFixed(2);
            const ts = level === 1 ? [0, 0.5, 1, 0.5] : level === 2 ? [0, 0.25, 0.5, 0.75, 1] : [0.25, 0.5, 0.75];
            const t = rng.pick(ts);
            let x;
            if (t === 0) x = +(Math.max(0, e0 - rng.pick([0.05, 0.1]))).toFixed(2);
            else if (t === 1) x = +(e1 + rng.pick([0.05, 0.1])).toFixed(2);
            else x = +(e0 + t * w).toFixed(2);
            const flip = level === 3 && rng.chance(0.5);
            const s = G.smoothstep(e0, e1, x);
            const ans = flip ? 1 - s : s;
            const tt = G.clamp((x - e0) / (e1 - e0), 0, 1);
            const e = `${flip ? '1.0 - ' : ''}smoothstep(${f(e0)}, ${f(e1)}, ${f(x)})`;
            return {
              prompt: `What is <code>${e}</code>?`,
              sub: level === 1 ? 'Below edge0 → 0. Above edge1 → 1. Exactly halfway → 0.5.' : 'Remember: at t = 0.25 the S gives 0.156, at t = 0.75 it gives 0.844.',
              graph: level < 3 ? { fns: [{ f: ssJs(e0, e1) }], opts: { ...GR, xstep: 0.1, vlines: [{ x, color: '#6c7289' }] } } : undefined,
              answer: ans,
              explain: `<p>t = (${n(x)} − ${n(e0)}) / (${n(e1)} − ${n(e0)}) = ${n((x - e0) / (e1 - e0), 3)}${tt !== (x - e0) / (e1 - e0) ? ` → clamped to ${n(tt)}` : ''}.</p><p>t·t·(3 − 2t) = <b>${n(s, 3)}</b>${flip ? `, and 1 − that = <b>${n(ans, 3)}</b>` : ''}.</p>`,
            };
          },
        },
        {
          id: 'ss-tune', title: 'Match the soft edge', engine: 'slider', rounds: 4,
          blurb: 'Tune the two edges until the gradients match.',
          gen: (rng, level) => {
            const a = rng.step(0.05, 0.5, 0.05), b = +(a + rng.step(0.15, 0.45, 0.05)).toFixed(2);
            if (level === 2) {
              const c = rng.step(0.25, 0.75, 0.05), w = rng.step(0.05, 0.25, 0.05);
              return {
                prompt: 'Match the target using centre <b>c</b> and width <b>w</b>.',
                sub: 'c = where it is half-grey. w = how far the blur spreads each way.',
                params: [{ name: 'c', label: 'centre c', min: 0, max: 1, step: 0.01, target: c }, { name: 'w', label: 'width w', min: 0.01, max: 0.4, step: 0.01, target: w }],
                build: (p) => ({ frag: 'col = vec3(smoothstep(uC - uW, uC + uW, uv.x));', uniforms: { uC: p.c, uW: p.w } }),
                code: (p) => `col = vec3(smoothstep(${f(p.c, 2)} - ${f(p.w, 2)}, ${f(p.c, 2)} + ${f(p.w, 2)}, uv.x));`,
                explain: `<p>Target: c = ${n(c)}, w = ${n(w)} → smoothstep(${n(c - w, 2)}, ${n(c + w, 2)}, uv.x). Find the 50% grey first (that's c), then match the blur.</p>`,
              };
            }
            const down = level === 3;
            return {
              prompt: `Set <b>edge0</b> and <b>edge1</b> to match the target.`,
              sub: level === 1 ? 'The orange curve shows the graph — line up the start and end of the ramp.' : 'Where does it start to change? Where does it finish?',
              params: [{ name: 'a', label: 'edge0', min: 0, max: 1, step: 0.01, target: a }, { name: 'b', label: 'edge1', min: 0, max: 1, step: 0.01, target: b }],
              build: (p) => (level === 1 ? plotSpec('smoothstep(uA, uB, x)', { uA: p.a, uB: p.b }) : { frag: `col = vec3(${down ? '1.0 - ' : ''}smoothstep(uA, uB, uv.x));`, uniforms: { uA: p.a, uB: p.b } }),
              code: (p) => `col = vec3(${down ? '1.0 - ' : ''}smoothstep(${f(p.a, 2)}, ${f(p.b, 2)}, uv.x));`,
              explain: `<p>Target edges: ${n(a)} → ${n(b)}. Left of edge0 it's flat ${down ? 'white' : 'black'}, right of edge1 flat ${down ? 'black' : 'white'}.</p>`,
            };
          },
        },
        {
          id: 'ss-graph', title: 'Which smoothstep?', engine: 'mcq', rounds: 8,
          blurb: 'Read the edges off a graph and pick the matching code.',
          gen: (rng, level) => {
            const S = level === 1 ? 0.2 : 0.1;
            const mk = () => {
              const a = rng.step(0, 0.6, S), b = +(a + rng.step(S * 2, 0.6, S)).toFixed(2);
              if (b > 1) return null;
              const kind = level === 3 ? rng.pick([0, 0, 1, 2]) : rng.pick([0, 0, 0, 1]);
              if (kind === 1) return { e: `1.0 - smoothstep(${f(a)}, ${f(b)}, x)`, js: (x) => 1 - G.smoothstep(a, b, x) };
              if (kind === 2) { const m = +((a + b) / 2).toFixed(2); return { e: `step(${f(m)}, x)`, js: (x) => G.step(m, x) }; }
              return { e: `smoothstep(${f(a)}, ${f(b)}, x)`, js: ssJs(a, b) };
            };
            let ans = null; while (!ans || ans.e.startsWith('step')) ans = mk();
            const opts = pickFns(rng, ans, mk, 4, level === 3 ? 0.15 : 0.25);
            return {
              prompt: 'Which code draws this graph?',
              graph: { fns: [{ f: ans.js }], opts: { ...GR, xstep: 0.1 } },
              options: opts.map((o) => ({ code: o.e })),
              explain: `<p>It was <code>${ans.e}</code>. Find where the curve <b>leaves</b> its flat start (edge0) and where it <b>arrives</b> at its flat end (edge1).</p>`,
            };
          },
        },
        {
          id: 'ss-half', title: 'Tap the 50% point', engine: 'tap', rounds: 6,
          blurb: 'Where is smoothstep exactly half? Where does it start and stop?',
          gen: (rng, level) => {
            const a = rng.step(0.1, 0.5, 0.05), b = +(a + rng.step(0.2, 0.45, 0.05)).toFixed(2);
            const ask = level === 1 ? 'half' : rng.pick(['half', 'start', 'end', 'half']);
            const tx = ask === 'half' ? (a + b) / 2 : ask === 'start' ? a : b;
            const q2 = { half: 'exactly <b>0.5</b> (mid-grey)', start: 'the <b>last fully black</b> spot (where it starts to brighten)', end: 'the <b>first fully white</b> spot' }[ask];
            return {
              prompt: `<code>col = vec3(smoothstep(${f(a)}, ${f(b)}, uv.x));</code><br>Tap where the value is ${q2}.`,
              sub: level === 1 ? 'Here is the picture to help.' : 'Grid lines every 0.25, faint ones every 0.05.',
              shader: level === 1 ? img(`smoothstep(${f(a)}, ${f(b)}, uv.x)`) : GRID,
              score: scoreU([tx], 0.035),
              reveal: [[tx, 0.5]],
              explain: `<p>${ask === 'half' ? `Halfway between the edges: (${n(a)} + ${n(b)}) / 2 = <b>${n(tx, 3)}</b>.` : ask === 'start' ? `Below edge0 (${n(a)}) the result is exactly 0.` : `Above edge1 (${n(b)}) the result is exactly 1.`}</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ clamp / min / max
    {
      id: 'shaping.clamp',
      title: 'clamp, saturate, min & max',
      blurb: 'Put a floor and a ceiling on your numbers.',
      lesson: [
        {
          title: 'Out-of-range values bite',
          body: `<p><code>y = uv.x * 3.0 - 1.0</code> runs from −1 to 2. On screen it looks fine (clips to 0..1). But now <b>halve it</b>:</p>
<p>Left: halving the raw value. Right: clamping to 0..1 <i>first</i>, then halving. Very different — the hidden values came back!</p>`,
          shaders: [
            { spec: { frag: 'float y = uv.x * 3.0 - 1.0;\ncol = vec3(y * 0.5);' }, label: 'y * 0.5' },
            { spec: { frag: 'float y = uv.x * 3.0 - 1.0;\ncol = vec3(clamp(y, 0.0, 1.0) * 0.5);' }, label: 'clamp(y, 0, 1) * 0.5' },
          ],
          code: 'float y = uv.x * 3.0 - 1.0;          // -1 .. 2\ncol = vec3(y * 0.5);                 // -0.5 .. 1 → reaches white!\ncol = vec3(clamp(y, 0.0, 1.0) * 0.5); // 0 .. 0.5 → max mid-grey',
        },
        {
          title: 'clamp(x, lo, hi)',
          body: `<p><code>clamp</code> keeps a number between a <b>floor</b> (lo) and a <b>ceiling</b> (hi). Anything below lo becomes lo, anything above hi becomes hi, the rest passes through unchanged.</p>
<div class="analogy">🏠 <b>Analogy:</b> a ball bouncing in a room. It can go anywhere between floor and ceiling — but never through them.</div>`,
          controls: [
            { name: 'lo', label: 'lo (floor)', min: 0, max: 1, step: 0.01, value: 0.2 },
            { name: 'hi', label: 'hi (ceiling)', min: 0, max: 1, step: 0.01, value: 0.7 },
          ],
          shader: (v) => plotSpec('clamp(x, uL, uH)', { uL: v.lo, uH: v.hi }),
          graph: { fns: (v) => [{ f: (x) => G.clamp(x, v.lo, v.hi), label: 'clamp(x, lo, hi)' }, { f: (x) => x, color: '#6c7289', dash: [4, 4] }], opts: (v) => ({ ...GR, hlines: [{ y: v.lo, color: '#6bdfff' }, { y: v.hi, color: '#ff7ab2' }] }) },
          code: (v) => `col = vec3(clamp(uv.x, ${f(v.lo, 2)}, ${f(v.hi, 2)}));\n// left part stuck at ${n(v.lo, 2)}, right part stuck at ${n(v.hi, 2)}`,
        },
        {
          title: 'saturate = clamp to 0..1',
          body: `<p>Clamping to 0..1 is so common it has its own name: <b>saturate</b>.</p>
<pre class="code">saturate(x) == clamp(x, 0.0, 1.0)</pre>
<p>HLSL (Unity, Unreal) has <code>saturate</code> built in. GLSL doesn't — this app defines it for you; in plain GLSL write <code>clamp(x, 0.0, 1.0)</code>.</p>
<div class="tip">💡 Use it before anything that misbehaves outside 0..1: <code>pow</code> (negatives → NaN), <code>mix</code> factors (extrapolate), colour outputs feeding blending/bloom. On many GPUs saturate is free — a modifier on the previous instruction.</div>`,
          controls: [{ name: 'k', label: 'multiplier', min: 0.5, max: 4, step: 0.05, value: 2.5 }],
          shaders: [
            { spec: (v) => plotSpec('x * uK - 0.5', { uK: v.k }), label: 'raw: x·k − 0.5' },
            { spec: (v) => plotSpec('saturate(x * uK - 0.5)', { uK: v.k }), label: 'saturate(…)' },
          ],
          code: (v) => `float raw = uv.x * ${f(v.k, 2)} - 0.5;  // ${n(-0.5)} .. ${n(v.k - 0.5, 2)}\nfloat s = saturate(raw);            // 0 .. ${n(Math.min(1, v.k - 0.5), 2)}`,
        },
        {
          title: 'min and max: one side only',
          body: `<p>Sometimes you only need one limit:</p>
<ul><li><code>min(x, c)</code>: the <b>smaller</b> of the two → never above c (a <b>ceiling</b>)</li>
<li><code>max(x, c)</code>: the <b>bigger</b> of the two → never below c (a <b>floor</b>)</li></ul>
<p>Mind-twister: <b>min</b> makes a ceiling, <b>max</b> makes a floor. And <code>clamp(x, lo, hi) = min(max(x, lo), hi)</code>.</p>`,
          controls: [{ name: 'c', label: 'c', min: 0, max: 1, step: 0.01, value: 0.6 }],
          graph: { fns: (v) => [{ f: (x) => Math.min(x, v.c), label: 'min(x, c)' }, { f: (x) => Math.max(x, v.c), label: 'max(x, c)' }], opts: GR },
          shaders: [
            { spec: (v) => ({ frag: 'col = vec3(min(uv.x, uC));', uniforms: { uC: v.c } }), label: 'min(uv.x, c)' },
            { spec: (v) => ({ frag: 'col = vec3(max(uv.x, uC));', uniforms: { uC: v.c } }), label: 'max(uv.x, c)' },
          ],
          code: (v) => `min(uv.x, ${f(v.c, 2)}) // never brighter than ${n(v.c, 2)}\nmax(uv.x, ${f(v.c, 2)}) // never darker than ${n(v.c, 2)}`,
        },
        {
          title: 'min & max of two shapes',
          body: `<p>min and max also combine <b>two masks or gradients</b>, pixel by pixel:</p>
<ul><li><code>max(a, b)</code>: bright if <b>either</b> is bright → <b>union</b> (OR)</li><li><code>min(a, b)</code>: bright only where <b>both</b> are → <b>intersection</b> (AND)</li></ul>
<p>Two soft circles below. Slide between min and max.</p>`,
          controls: [{ name: 'm', label: 'min ← → max', min: 0, max: 1, step: 1, value: 1 }],
          shader: (v) => ({ frag: 'float a = 1.0 - smoothstep(0.2, 0.3, length(uv - vec2(0.4, 0.5)));\nfloat b = 1.0 - smoothstep(0.2, 0.3, length(uv - vec2(0.6, 0.5)));\ncol = vec3(mix(min(a, b), max(a, b), uM));', uniforms: { uM: v.m } }),
          code: (v) => `float a = 1.0 - smoothstep(0.2, 0.3, length(uv - vec2(0.4, 0.5)));\nfloat b = 1.0 - smoothstep(0.2, 0.3, length(uv - vec2(0.6, 0.5)));\ncol = vec3(${v.m > 0.5 ? 'max' : 'min'}(a, b)); // ${v.m > 0.5 ? 'union: either circle' : 'intersection: only the overlap'}`,
          quiz: { q: 'What is <code>min(0.8, 0.3)</code>?', options: ['0.3', '0.8', '0.55'], answer: 0, explain: 'min picks the smaller value.' },
        },
      ],
      games: [
        {
          id: 'clamp-eval', title: 'Floor & ceiling maths', engine: 'numeric', rounds: 6,
          blurb: 'Compute clamp, saturate, min and max.',
          gen: (rng, level) => {
            const V = () => rng.step(0.1, 0.9, 0.1);
            const big = () => rng.pick([-0.5, -0.3, 1.2, 1.5, 2]);
            const kinds = [
              () => { const a = V(), b = V(); return { e: `min(${f(a)}, ${f(b)})`, ans: Math.min(a, b), why: 'min picks the smaller one.' }; },
              () => { const a = V(), b = V(); return { e: `max(${f(a)}, ${f(b)})`, ans: Math.max(a, b), why: 'max picks the bigger one.' }; },
              () => { const x = rng.chance(0.5) ? big() : V(); return { e: `saturate(${f(x)})`, ans: G.saturate(x), why: `saturate = clamp(x, 0, 1). ${x < 0 ? 'Below 0 → 0.' : x > 1 ? 'Above 1 → 1.' : 'Already inside 0..1 → unchanged.'}` }; },
              () => { const lo = rng.pick([0.2, 0.3]), hi = rng.pick([0.6, 0.7, 0.8]); const x = rng.pick([0.1, 0.5, 0.9, 1.4, -0.2]); return { e: `clamp(${f(x)}, ${f(lo)}, ${f(hi)})`, ans: G.clamp(x, lo, hi), why: `Floor ${n(lo)}, ceiling ${n(hi)}. ${x < lo ? `${n(x)} is below the floor → ${n(lo)}.` : x > hi ? `${n(x)} is above the ceiling → ${n(hi)}.` : `${n(x)} is inside → unchanged.`}`, lvl: 2 }; },
              () => { const x = V(); return { e: `min(uv.x * 2.0, 1.0)`, pre: `uv.x = ${n(x)}`, ans: Math.min(x * 2, 1), why: `${n(x)} × 2 = ${n(x * 2)}, then min with 1 → ${n(Math.min(x * 2, 1))}.`, lvl: 2 }; },
              () => { const x = V(); return { e: `saturate(uv.x * 3.0 - 1.0)`, pre: `uv.x = ${n(x)}`, ans: G.saturate(x * 3 - 1), why: `${n(x)} × 3 − 1 = ${n(x * 3 - 1)} → saturate → ${n(G.saturate(x * 3 - 1))}.`, lvl: 3 }; },
              () => { const x = V(); const c = rng.pick([0.3, 0.6]); return { e: `max(uv.x, ${f(c)}) - ${f(c)}`, pre: `uv.x = ${n(x)}`, ans: +(Math.max(x, c) - c).toFixed(4), why: `max(${n(x)}, ${n(c)}) = ${n(Math.max(x, c))}, minus ${n(c)} = ${n(Math.max(x, c) - c)}.`, lvl: 3 }; },
            ];
            const lv = [1, 1, 1, 2, 2, 3, 3];
            const k = rng.pick(kinds.filter((_, i) => lv[i] <= level))();
            return { prompt: `${k.pre ? k.pre + '<br>' : ''}What is <code>${k.e}</code>?`, answer: k.ans, explain: `<p>${k.why}</p>` };
          },
        },
        {
          id: 'clamp-graph', title: 'Which limit?', engine: 'mcq', rounds: 8,
          blurb: 'Look at the flattened graph, pick the formula.',
          gen: (rng, level) => {
            const P = level === 1 ? [0.2, 0.4, 0.6, 0.8] : [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
            const mk = () => {
              const a = rng.pick(P), b = rng.pick(P);
              const all = [
                { e: `min(x, ${f(a)})`, js: (x) => Math.min(x, a) },
                { e: `max(x, ${f(a)})`, js: (x) => Math.max(x, a) },
                a < b ? { e: `clamp(x, ${f(a)}, ${f(b)})`, js: (x) => G.clamp(x, a, b) } : null,
                { e: 'x', js: (x) => x },
                { e: 'min(x * 2.0, 1.0)', js: (x) => Math.min(2 * x, 1), lvl: 2 },
                { e: `saturate(x * 2.0 - ${f(a)})`, js: (x) => G.saturate(2 * x - a), lvl: 3 },
                { e: `1.0 - max(x, ${f(a)})`, js: (x) => 1 - Math.max(x, a), lvl: 3 },
              ].filter((o) => o && (o.lvl || 1) <= level);
              return rng.pick(all);
            };
            let ans = mk(); while (ans.e === 'x') ans = mk();
            const opts = pickFns(rng, ans, mk, 4, level === 3 ? 0.12 : 0.18, -0.1, 1.1);
            return {
              prompt: 'Which formula draws this graph?',
              graph: { fns: [{ f: ans.js }, { f: (x) => x, color: '#4a4f63', dash: [4, 4] }], opts: { ...GR, ystep: 0.2 } },
              sub: 'Dashed line = plain x for reference.',
              options: opts.map((o) => ({ code: o.e })),
              explain: `<p>It was <code>${ans.e}</code>. Flat on top = a ceiling (min / clamp hi). Flat at the bottom = a floor (max / clamp lo).</p>`,
            };
          },
        },
        {
          id: 'clamp-tune', title: 'Match the clamp', engine: 'slider', rounds: 4,
          blurb: 'Find the floor and ceiling of a clamped gradient.',
          gen: (rng, level) => {
            const lo = rng.step(0.05, 0.4, 0.05), hi = +(lo + rng.step(0.25, 0.55, 0.05)).toFixed(2);
            const k = level === 3 ? 2 : 1;
            const e = k === 1 ? 'uv.x' : 'uv.x * 2.0 - 0.5';
            return {
              prompt: `Tune <b>lo</b> and <b>hi</b> to match the target.`,
              sub: level === 1 ? 'The curve is drawn on top to help.' : 'Dark flat part = lo. Bright flat part = hi.',
              params: [{ name: 'lo', label: 'lo', min: 0, max: 1, step: 0.01, target: lo }, { name: 'hi', label: 'hi', min: 0, max: 1, step: 0.01, target: hi }],
              build: (p) => (level === 1 ? plotSpec('clamp(x, uL, uH)', { uL: p.lo, uH: p.hi }) : { frag: `col = vec3(clamp(${e}, uL, uH));`, uniforms: { uL: p.lo, uH: p.hi } }),
              code: (p) => `col = vec3(clamp(${e}, ${f(p.lo, 2)}, ${f(p.hi, 2)}));`,
              explain: `<p>lo = ${n(lo)}, hi = ${n(hi)}. The left side is stuck at the lo grey, the right side at the hi grey, and in between the original gradient shows through.</p>`,
            };
          },
        },
        {
          id: 'clamp-facts', title: 'Limits: true or false?', engine: 'mcq', rounds: 8,
          blurb: 'Concept check on clamp, saturate, min and max.',
          questions: [
            tf('<code>min(x, 0.5)</code> can never be bigger than 0.5.', true, 'min returns the smaller of the two, so 0.5 acts as a ceiling.'),
            tf('<code>max(x, 0.2)</code> puts a ceiling at 0.2.', false, 'max puts a <b>floor</b> at 0.2: the result is never below 0.2.'),
            tf('<code>saturate(x)</code> is the same as <code>clamp(x, 0.0, 1.0)</code>.', true, 'That\'s exactly its definition (HLSL built-in).'),
            tf('Values above 1.0 are clipped on screen, so they can never cause problems.', false, 'They are only clipped on the final output. If you multiply, mix or blend first, the big value still counts.'),
            tf('<code>clamp(1.7, 0.0, 1.0)</code> returns 1.0.', true, '1.7 is above the ceiling, so it becomes 1.0.'),
            tf('<code>clamp(x, lo, hi)</code> equals <code>min(max(x, lo), hi)</code>.', true, 'First lift it to at least lo, then cap it at hi.', 2),
            tf('<code>max(a, b)</code> of two masks shows where <i>both</i> are bright.', false, 'max is bright where <b>either</b> is bright (union). Use min for "both" (intersection).', 2),
            tf('<code>min(a, b)</code> of two circle masks keeps only their overlap.', true, 'min is only high where both inputs are high.', 2),
            tf('<code>saturate(-0.4)</code> returns 0.4.', false, 'Negative values become 0. (abs would give 0.4.)'),
            tf('Plain GLSL has a built-in saturate() function.', false, 'GLSL doesn\'t — HLSL does. In GLSL write clamp(x, 0.0, 1.0) (this app adds saturate for convenience).', 2),
            q('You want a value to never go below 0. Which?', ['max(x, 0.0)', 'min(x, 0.0)', 'abs(x)', 'step(0.0, x)'], 'max(x, 0.0) keeps x when positive and gives 0 otherwise. (abs would flip negatives to positive instead.)'),
            q('Which keeps <code>t</code> inside 0..1 before using it in <code>mix</code>?', ['saturate(t)', 'fract(t)', 'max(t, 1.0)', 't * t'], 'saturate clamps to 0..1. fract would wrap around instead (1.2 → 0.2).', { level: 2 }),
            q('<code>max(dot(N, L), 0.0)</code> in lighting is used to…', ['Stop negative light on surfaces facing away', 'Make the light brighter', 'Normalize the vector'], 'Faces pointing away give a negative dot product. max(…, 0) turns that into "no light" instead of "negative light".', { level: 3 }),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ fract / floor / mod
    {
      id: 'shaping.fract',
      title: 'fract, floor & mod: repeating',
      blurb: 'The key to every stripe, tile, grid and pattern.',
      lesson: [
        {
          title: 'floor: chop off the decimals',
          body: `<p><code>floor(x)</code> rounds <b>down</b> to a whole number: <code>floor(2.7) = 2.0</code>.</p>
<p><code>fract(x)</code> is the part you chopped off: <code>fract(2.7) = 0.7</code>.</p>
<pre class="code">x == floor(x) + fract(x)</pre>
<p>Drag x and watch the two parts. The blue graph is floor (stairs), the yellow is fract (a sawtooth).</p>`,
          controls: [{ name: 'x', label: 'x', min: 0, max: 4, step: 0.01, value: 2.7 }],
          graph: {
            fns: [{ f: (x) => Math.floor(x), color: '#6bdfff', label: 'floor(x)' }, { f: G.fract, color: '#ffd479', label: 'fract(x)' }],
            opts: (v) => ({ xmin: 0, xmax: 4, ymin: -0.2, ymax: 4, xstep: 1, ystep: 1, points: [{ x: v.x, y: Math.floor(v.x), color: '#6bdfff' }, { x: v.x, y: G.fract(v.x), color: '#ffd479' }], vlines: [{ x: v.x, color: '#6c7289' }] }),
          },
          code: (v) => `floor(${f(v.x, 2)}) = ${n(Math.floor(v.x))}.0\nfract(${f(v.x, 2)}) = ${n(G.fract(v.x), 2)}`,
          after: '<div class="analogy">🕐 <b>Analogy:</b> a clock. If x is "hours since midnight", floor(x) is the hour on the display and fract(x) is how far the minute hand has gone around (0..1). The minute hand <b>keeps returning to the start</b> — that\'s repetition.</div>',
        },
        {
          title: 'fract repeats',
          body: `<p>Multiply uv.x by n first: <code>uv.x * n</code> runs 0 → n. Then <code>fract</code> cuts it into <b>n copies</b> of 0 → 1.</p>
<p>Each copy is a fresh little 0..1 ramp — like having n tiny UV spaces side by side.</p>`,
          controls: [{ name: 'n', label: 'n (repeats)', min: 1, max: 8, step: 1, value: 3 }],
          shader: (v) => plotSpec('fract(x * uN)', { uN: v.n }),
          code: (v) => `float x = uv.x * ${f(v.n)};  // 0 .. ${n(v.n)}\ncol = vec3(fract(x));     // ${n(v.n)} ramps of 0..1`,
          size: 260,
        },
        {
          title: 'floor: which cell am I in?',
          body: `<p><code>floor(uv.x * n)</code> gives the <b>cell number</b>: 0, 1, 2 … n−1. Every pixel in the same cell gets the same number.</p>
<p>Divide by n−1 to see it as greys from black to white: a <b>staircase</b> (also called posterize / quantize).</p>`,
          controls: [{ name: 'n', label: 'n (cells)', min: 2, max: 8, step: 1, value: 4 }],
          shader: (v) => plotSpec('floor(x * uN) / (uN - 1.0)', { uN: v.n }),
          code: (v) => `float cell = floor(uv.x * ${f(v.n)}); // 0, 1, … ${n(v.n - 1)}\ncol = vec3(cell / ${f(v.n - 1)});`,
          after: '<div class="tip">Posterizing a gradient (toon shading, pixel-art colour steps) is exactly this: <code>floor(v * n) / (n - 1.0)</code>.</div>',
        },
        {
          title: 'Together: tiles',
          body: `<p>Do it on both axes and you have a <b>grid</b>:</p>
<pre class="code">// WHICH tile (integer):
vec2 cell  = floor(uv * n);
// WHERE inside the tile (0..1):
vec2 local = fract(uv * n);</pre>
<p>Use <code>local</code> to draw the same thing in every tile (a circle), and <code>cell</code> to make tiles different (here: a checkerboard).</p>`,
          controls: [{ name: 'n', label: 'n', min: 1, max: 8, step: 1, value: 4 }],
          shader: (v) => ({ frag: 'vec2 cell = floor(uv * uN);\nvec2 local = fract(uv * uN);\nfloat check = mod(cell.x + cell.y, 2.0);\nfloat circle = 1.0 - smoothstep(0.3, 0.33, length(local - 0.5));\ncol = mix(vec3(0.15 + 0.2 * check), vec3(1.0, 0.6, 0.2), circle);', uniforms: { uN: v.n } }),
          code: (v) => `vec2 cell  = floor(uv * ${f(v.n)});\nvec2 local = fract(uv * ${f(v.n)});\nfloat check  = mod(cell.x + cell.y, 2.0);      // alternate tiles\nfloat circle = 1.0 - smoothstep(0.3, 0.33, length(local - 0.5));`,
          size: 260,
        },
        {
          title: 'mod(x, m): repeat every m',
          body: `<p><code>fract</code> always repeats every <b>1</b>. <code>mod(x, m)</code> repeats every <b>m</b> and goes 0 → m:</p>
<pre class="code">mod(x, m) == m * fract(x / m)</pre>
<p>Common uses: <code>mod(cell, 2.0)</code> → 0,1,0,1 (even/odd), <code>mod(uTime, 3.0)</code> → a timer that restarts every 3 seconds.</p>
<div class="note">GLSL has no <code>%</code> operator — use <code>mod</code>. HLSL's <code>fmod</code> behaves differently for negative numbers!</div>`,
          controls: [{ name: 'm', label: 'm', min: 0.1, max: 1, step: 0.05, value: 0.4 }],
          graph: { fns: (v) => [{ f: (x) => G.mod(x, v.m), label: 'mod(x, m)' }], opts: (v) => ({ ...GR, hlines: [{ y: v.m, color: '#ff7ab2' }] }) },
          code: (v) => `mod(uv.x, ${f(v.m, 2)}) // repeats every ${n(v.m, 2)}, values 0 .. ${n(v.m, 2)}`,
          quiz: { q: 'What is <code>fract(3.25)</code>?', options: ['3.0', '0.25', '0.75'], answer: 1, explain: 'fract keeps only the part after the decimal point: 0.25. (floor would give 3.0.)' },
        },
        {
          title: 'Negative numbers',
          body: `<p>One surprise: floor rounds <b>down</b>, toward minus infinity — not toward zero.</p>
<pre class="code">floor(-0.3) = -1.0   // not 0!
fract(-0.3) =  0.7   // = -0.3 - (-1.0)</pre>
<p>Good news: this means <code>fract</code> keeps making the same 0→1 sawtooth even for negative x — patterns don't break when you scroll left or use centred coordinates.</p>`,
          graph: { fns: [{ f: G.fract, label: 'fract(x)' }, { f: Math.floor, color: '#6bdfff', label: 'floor(x)' }], opts: { xmin: -2, xmax: 2, ymin: -2.2, ymax: 2.2, xstep: 0.5, ystep: 1 } },
        },
      ],
      games: [
        {
          id: 'fract-paint', title: 'Be the GPU: repeats', engine: 'paint', rounds: 4,
          blurb: 'Run fract / floor / mod for every pixel.',
          gen: (rng, level) => {
            const r = fractPaint(rng, level);
            return {
              prompt: 'Paint what this shader outputs:',
              code: r.code, w: r.W, h: r.W, palette: r.palette || BW, solve: r.solve, showUV: level < 3,
              explain: `<p>${r.note}</p>`,
            };
          },
        },
        {
          id: 'fract-eval', title: 'Compute fract & floor', engine: 'numeric', rounds: 6,
          blurb: 'Quick mental maths with fract, floor and mod.',
          gen: (rng, level) => {
            const kinds = [
              () => { const x = +(rng.int(0, 4) + rng.step(0.05, 0.95, 0.05)).toFixed(2); return { e: `fract(${f(x)})`, ans: G.fract(x), why: `Keep only the decimals: ${n(x)} → ${n(G.fract(x), 2)}.` }; },
              () => { const x = +(rng.int(0, 4) + rng.step(0.05, 0.95, 0.05)).toFixed(2); return { e: `floor(${f(x)})`, ans: Math.floor(x), why: `Round down: ${n(x)} → ${Math.floor(x)}.` }; },
              () => { const u = rng.step(0.05, 0.95, 0.05), k = rng.pick([2, 3, 4]); const p = u * k; if (Math.abs(p - Math.round(p)) < 1e-6) return null; return { e: `fract(uv.x * ${f(k)})`, pre: `uv.x = ${n(u)}`, ans: +G.fract(p).toFixed(4), why: `${n(u)} × ${k} = ${n(p)}, fract → ${n(G.fract(p), 3)}.`, lvl: 2 }; },
              () => { const u = rng.step(0.05, 0.95, 0.05), k = rng.pick([2, 3, 4, 5]); const p = u * k; if (Math.abs(p - Math.round(p)) < 1e-6) return null; return { e: `floor(uv.x * ${f(k)})`, pre: `uv.x = ${n(u)}`, ans: Math.floor(p), why: `${n(u)} × ${k} = ${n(p)}, floor → cell ${Math.floor(p)}.`, lvl: 2 }; },
              () => { const a = rng.int(2, 9), m = rng.pick([2, 3, 4]); return { e: `mod(${f(a)}, ${f(m)})`, ans: G.mod(a, m), why: `${a} = ${Math.floor(a / m)} × ${m} + ${G.mod(a, m)}. mod keeps the remainder.`, lvl: 2 }; },
              () => { const x = -rng.step(0.1, 0.9, 0.1); return { e: `fract(${f(x)})`, ans: +G.fract(x).toFixed(4), why: `floor(${n(x)}) = −1 (round DOWN), so fract = ${n(x)} − (−1) = ${n(G.fract(x), 2)}.`, lvl: 3 }; },
              () => { const x = -rng.step(0.1, 0.9, 0.1) - rng.int(0, 1); return { e: `floor(${f(x)})`, ans: Math.floor(x), why: `floor rounds toward minus infinity: ${n(x)} → ${Math.floor(x)}.`, lvl: 3 }; },
              () => { const u = rng.step(0.05, 0.95, 0.1); const c = Math.floor(u * 4); return { e: `mod(floor(uv.x * 4.0), 2.0)`, pre: `uv.x = ${n(u)}`, ans: G.mod(c, 2), why: `cell = floor(${n(u * 4)}) = ${c}, ${c} mod 2 = ${G.mod(c, 2)} (${c % 2 ? 'odd' : 'even'} cell).`, lvl: 3 }; },
            ];
            const lv = [1, 1, 2, 2, 2, 3, 3, 3];
            let k = null;
            while (!k) k = rng.pick(kinds.filter((_, i) => lv[i] <= level))();
            return { prompt: `${k.pre ? k.pre + '<br>' : ''}What is <code>${k.e}</code>?`, answer: k.ans, explain: `<p>${k.why}</p>` };
          },
        },
        {
          id: 'fract-count', title: 'Count the repeats', engine: 'slider', rounds: 4,
          blurb: 'How many times does the pattern repeat? Set n to match.',
          gen: (rng, level) => {
            if (level < 3) {
              const N = level === 1 ? rng.int(2, 5) : rng.int(3, 9);
              const vert = level === 2 && rng.chance(0.4);
              const c = vert ? 'uv.y' : 'uv.x';
              return {
                prompt: `Set <b>n</b> so your pattern matches.`,
                sub: 'Count the ramps (each one goes dark → bright).',
                params: [{ name: 'n', label: 'n', min: 1, max: 10, step: 1, target: N }],
                build: (p) => ({ frag: `col = vec3(fract(${c} * uN));`, uniforms: { uN: p.n } }),
                code: (p) => `col = vec3(fract(${c} * ${f(p.n)}));`,
                tolerance: 0.02,
                explain: `<p>n = ${N}: <code>${c} * ${N}.0</code> runs 0 → ${N}, and fract cuts it into ${N} ramps.</p>`,
              };
            }
            const nx = rng.int(2, 6), ny = rng.int(2, 6);
            return {
              prompt: 'Match the grid: set repeats on x and on y.',
              sub: 'Red = local x, green = local y inside each tile.',
              params: [{ name: 'x', label: 'n.x', min: 1, max: 8, step: 1, target: nx }, { name: 'y', label: 'n.y', min: 1, max: 8, step: 1, target: ny }],
              build: (p) => ({ frag: 'col = vec3(fract(uv * vec2(uX, uY)), 0.0);', uniforms: { uX: p.x, uY: p.y } }),
              code: (p) => `vec2 local = fract(uv * vec2(${f(p.x)}, ${f(p.y)}));\ncol = vec3(local, 0.0);`,
              tolerance: 0.02,
              explain: `<p>${nx} columns × ${ny} rows. Each tile has its own little 0..1 UV — that's why the red/green gradient repeats.</p>`,
            };
          },
        },
        {
          id: 'fract-image', title: 'Repeat code → picture', engine: 'mcq', rounds: 8,
          blurb: 'Read fract/floor/mod code, pick the picture.',
          gen: (rng, level) => {
            const mk = () => {
              const k = rng.pick([2, 3, 4]);
              const all = [
                { e: `fract(uv.x * ${f(k)})`, js: (x) => G.fract(x * k) },
                { e: `fract(uv.y * ${f(k)})`, js: (x, y) => G.fract(y * k) },
                { e: `floor(uv.x * ${f(k)}) / ${f(k - 1)}`, js: (x) => Math.floor(x * k) / (k - 1) },
                { e: `1.0 - fract(uv.x * ${f(k)})`, js: (x) => 1 - G.fract(x * k), lvl: 2 },
                { e: `step(0.5, fract(uv.x * ${f(k)}))`, js: (x) => G.step(0.5, G.fract(x * k)), lvl: 2 },
                { e: `floor(uv.y * ${f(k)}) / ${f(k - 1)}`, js: (x, y) => Math.floor(y * k) / (k - 1), lvl: 2 },
                { e: `mod(floor(uv.x * ${f(k)}) + floor(uv.y * ${f(k)}), 2.0)`, js: (x, y) => G.mod(Math.floor(x * k) + Math.floor(y * k), 2), lvl: 3 },
                { e: `fract(uv.x * ${f(k)}) * fract(uv.y * ${f(k)})`, js: (x, y) => G.fract(x * k) * G.fract(y * k), lvl: 3 },
                { e: `fract((uv.x + uv.y) * ${f(k)})`, js: (x, y) => G.fract((x + y) * k), lvl: 3 },
              ].filter((o) => (o.lvl || 1) <= level);
              return rng.pick(all);
            };
            const ans = mk();
            const opts = pickFns(rng, ans, mk, 4, 0.35);
            return {
              prompt: 'Which picture does this make?',
              code: `col = vec3(${ans.e});`,
              options: opts.map((o) => ({ shader: img(o.e) })),
              explain: `<p>Count first: <code>* ${ans.e.match(/\* (\d)/)?.[1] || 'n'}.0</code> means that many repeats. Then: fract → ramps, floor → flat steps, step(0.5, fract) → hard stripes, mod(…, 2) → alternating.</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ abs
    {
      id: 'shaping.abs',
      title: 'abs: mirror & distance',
      blurb: 'Forget the sign. Turns "x − c" into "how far from c".',
      lesson: [
        {
          title: 'abs: forget the sign',
          body: `<p><code>abs(x)</code> makes negatives positive and leaves positives alone: <code>abs(-0.3) = 0.3</code>, <code>abs(0.3) = 0.3</code>.</p>
<p>Its graph is a <b>V</b>: the left half of the line gets folded up.</p>`,
          controls: [{ name: 'x', label: 'x', min: -1, max: 1, step: 0.01, value: -0.4 }],
          graph: { fns: [{ f: Math.abs, label: 'abs(x)' }, { f: (x) => x, color: '#4a4f63', dash: [4, 4] }], opts: (v) => ({ xmin: -1, xmax: 1, ymin: -1, ymax: 1, points: [{ x: v.x, y: Math.abs(v.x), label: n(Math.abs(v.x), 2) }, { x: v.x, y: v.x, color: '#6c7289' }] }) },
          code: (v) => `abs(${f(v.x, 2)}) = ${n(Math.abs(v.x), 2)}`,
        },
        {
          title: 'Distance to a point',
          body: `<p><code>uv.x - c</code> is "how far right of c am I" — negative on the left. Wrap it in abs and the sign disappears:</p>
<pre class="code">// distance from c, either side:
abs(uv.x - c)</pre>
<p>It's 0 exactly at c and grows on both sides. As brightness: a dark <b>valley</b> at c.</p>
<div class="analogy">📏 <b>Analogy:</b> standing on a ruler. "You're 0.2 away from the 0.5 mark" — you don't care whether left or right.</div>`,
          controls: [{ name: 'c', label: 'c', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (v) => plotSpec('abs(x - uC)', { uC: v.c }),
          code: (v) => `float d = abs(uv.x - ${f(v.c, 2)}); // 0 at x = ${n(v.c, 2)}\ncol = vec3(d);`,
          size: 260,
        },
        {
          title: 'From distance to a line',
          body: `<p>Turn the dark valley into a <b>bright line</b>: shape the distance.</p>
<ul><li>Soft: <code>1.0 - d * k</code> → bright at c, fading out. Bigger k = thinner.</li>
<li>Hard: <code>step(d, w)</code> → white where d ≤ w (a line of half-width w).</li></ul>
<p>This "distance → shape" idea is the heart of drawing lines, rings and circles in shaders.</p>`,
          controls: [
            { name: 'c', label: 'position c', min: 0, max: 1, step: 0.01, value: 0.4 },
            { name: 'k', label: 'sharpness k', min: 1, max: 20, step: 0.5, value: 5 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'float d = abs(uv.x - uC);\ncol = vec3(1.0 - d * uK);', uniforms: { uC: v.c, uK: v.k } }), label: '1 − d·k' },
            { spec: (v) => ({ frag: 'float d = abs(uv.x - uC);\ncol = vec3(step(d, 0.5 / uK));', uniforms: { uC: v.c, uK: v.k } }), label: 'step(d, w)' },
          ],
          code: (v) => `float d = abs(uv.x - ${f(v.c, 2)});\ncol = vec3(1.0 - d * ${f(v.k, 1)});      // soft line\ncol = vec3(step(d, ${f(0.5 / v.k, 3)}));     // hard line, w = ${n(0.5 / v.k, 3)}`,
        },
        {
          title: 'Mirror',
          body: `<p><code>abs(uv.x - 0.5)</code> is 0.5 at both edges and 0 in the middle: the right half is a <b>mirror copy</b> of the left.</p>
<p>So anything you build from <code>mx = abs(uv.x - 0.5) * 2.0</code> instead of uv.x becomes <b>symmetric</b>. Below, the same shape (a bar from 0.6 to 0.8 of x) — normal and mirrored.</p>`,
          controls: [{ name: 'a', label: 'bar start', min: 0, max: 0.9, step: 0.01, value: 0.6 }],
          shaders: [
            { spec: (v) => ({ frag: 'float x = uv.x;\ncol = vec3(step(uA, x) - step(uA + 0.2, x));', uniforms: { uA: v.a } }), label: 'x = uv.x' },
            { spec: (v) => ({ frag: 'float x = abs(uv.x - 0.5) * 2.0;\ncol = vec3(step(uA, x) - step(uA + 0.2, x));', uniforms: { uA: v.a } }), label: 'x = abs(uv.x − 0.5) · 2' },
          ],
          code: (v) => `float x = abs(uv.x - 0.5) * 2.0; // 1 → 0 → 1\ncol = vec3(step(${f(v.a, 2)}, x) - step(${f(v.a + 0.2, 2)}, x));`,
          after: '<div class="tip">Symmetric masks (vignettes, UI frames, face-shaped effects) are almost always built with an abs fold.</div>',
        },
        {
          title: 'abs in 2D',
          body: `<p><code>abs</code> works on vectors too. <code>abs(uv - 0.5)</code> folds the square into one quarter, so all four corners behave the same.</p>
<p>Combine the two folded axes with <code>max</code> and you get the distance to the centre in "square" shape → square rings. With <code>+</code> you get a diamond.</p>`,
          controls: [{ name: 'm', label: 'max ← → sum', min: 0, max: 1, step: 1, value: 0 }],
          shader: (v) => ({ frag: 'vec2 p = abs(uv - 0.5);\nfloat d = mix(max(p.x, p.y), p.x + p.y, uM);\ncol = vec3(fract(d * 6.0));', uniforms: { uM: v.m } }),
          code: (v) => `vec2 p = abs(uv - 0.5);           // folded into one quarter\nfloat d = ${v.m > 0.5 ? 'p.x + p.y;           // diamond distance' : 'max(p.x, p.y);       // square distance'}\ncol = vec3(fract(d * 6.0));       // rings`,
          quiz: { q: 'Where is <code>abs(uv.x - 0.3)</code> darkest?', options: ['At uv.x = 0.3', 'At uv.x = 0', 'At uv.x = 1'], answer: 0, explain: 'abs(x − c) is 0 (black) exactly at c = 0.3 and grows on both sides.' },
        },
      ],
      games: [
        {
          id: 'abs-tap', title: 'Find the line', engine: 'tap', rounds: 6,
          blurb: 'Read an abs() line shader and tap where the line is.',
          gen: (rng, level) => {
            const c = rng.step(0.15, 0.85, 0.05);
            const vert = rng.chance(0.5);
            const ax = vert ? 'uv.x' : 'uv.y';
            if (level === 3 && rng.chance(0.6)) {
              const d = rng.pick([0.15, 0.2, 0.25, 0.3]);
              const ts = [0.5 - d, 0.5 + d];
              return {
                prompt: `<code>float d = abs(abs(${ax} - 0.5) - ${f(d)});<br>col = vec3(1.0 - d * 10.0);</code><br>Tap one of the bright lines.`,
                sub: 'Inner abs: distance from the centre. Outer abs: distance from THAT being ' + n(d) + '.',
                shader: GRID,
                score: (u, v) => scoreU(ts, 0.04)(vert ? u : v),
                reveal: ts.map((t) => (vert ? [t, 0.5] : [0.5, t])),
                explain: `<p>Bright where abs(${ax} − 0.5) = ${n(d)}, i.e. at ${ax} = 0.5 ± ${n(d)} → <b>${n(ts[0])}</b> and <b>${n(ts[1])}</b>. Nesting abs makes symmetric pairs.</p>`,
              };
            }
            const k = rng.pick([4, 6, 10]);
            return {
              prompt: `<code>float d = abs(${ax} - ${f(c)});<br>col = vec3(1.0 - d * ${f(k)});</code><br>Tap the <b>brightest</b> spot.`,
              sub: level === 1 ? 'Picture shown faintly behind the grid.' : 'Grid lines every 0.25.',
              shader: level === 1 ? { frag: `${GRID.frag}\nfloat d = abs(${ax} - ${f(c)});\ncol += vec3(saturate(1.0 - d * ${f(k)})) * 0.35;` } : GRID,
              score: (u, v) => scoreU([c], 0.04)(vert ? u : v),
              reveal: [vert ? [c, 0.5] : [0.5, c]],
              explain: `<p>d = 0 exactly where ${ax} = ${n(c)}, so 1 − d·${k} = 1 there (brightest). It's a ${vert ? 'vertical' : 'horizontal'} line because only ${ax} is used.</p>`,
            };
          },
        },
        {
          id: 'abs-eval', title: 'Compute abs', engine: 'numeric', rounds: 6,
          blurb: 'Distances with abs().',
          gen: (rng, level) => {
            const V = () => rng.step(0.1, 0.9, 0.1);
            const kinds = [
              () => { const x = -rng.step(0.1, 0.9, 0.1); return { e: `abs(${f(x)})`, ans: Math.abs(x), why: 'abs drops the minus sign.' }; },
              () => { const a = V(), c = V(); return { e: `abs(${f(a)} - ${f(c)})`, ans: +Math.abs(a - c).toFixed(4), why: `${n(a)} − ${n(c)} = ${n(a - c)}, abs → ${n(Math.abs(a - c))}. It's the distance between the two.` }; },
              () => { const u = V(); return { e: 'abs(uv.x - 0.5) * 2.0', pre: `uv.x = ${n(u)}`, ans: +(Math.abs(u - 0.5) * 2).toFixed(4), why: `|${n(u)} − 0.5| = ${n(Math.abs(u - 0.5))}, × 2 = ${n(Math.abs(u - 0.5) * 2)}. (This fold goes 1 → 0 → 1 across the square.)`, lvl: 2 }; },
              () => { const u = V(), c = V(); return { e: `1.0 - abs(uv.x - ${f(c)}) * 2.0`, pre: `uv.x = ${n(u)}`, ans: +(1 - Math.abs(u - c) * 2).toFixed(4), why: `distance = ${n(Math.abs(u - c))}, × 2 = ${n(Math.abs(u - c) * 2)}, 1 − that = ${n(1 - Math.abs(u - c) * 2)}.`, lvl: 2 }; },
              () => { const u = V(), w = rng.pick([0.1, 0.2, 0.3]), c = V(); if (Math.abs(Math.abs(u - c) - w) < 1e-6) return null; return { e: `step(abs(uv.x - ${f(c)}), ${f(w)})`, pre: `uv.x = ${n(u)}`, ans: G.step(+Math.abs(u - c).toFixed(4), w), why: `distance = ${n(Math.abs(u - c))}. step(d, ${n(w)}) asks "is ${n(w)} ≥ d?" → ${G.step(+Math.abs(u - c).toFixed(4), w)}.`, lvl: 3 }; },
              () => { const x = V(), y = V(); return { e: 'max(abs(uv.x - 0.5), abs(uv.y - 0.5))', pre: `uv = (${n(x)}, ${n(y)})`, ans: +Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)).toFixed(4), why: `|${n(x)} − 0.5| = ${n(Math.abs(x - 0.5))}, |${n(y)} − 0.5| = ${n(Math.abs(y - 0.5))}, max → ${n(Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)))}.`, lvl: 3 }; },
            ];
            const lv = [1, 1, 2, 2, 3, 3];
            let k = null;
            while (!k) k = rng.pick(kinds.filter((_, i) => lv[i] <= level))();
            return { prompt: `${k.pre ? k.pre + '<br>' : ''}What is <code>${k.e}</code>?`, answer: k.ans, explain: `<p>${k.why}</p>` };
          },
        },
        {
          id: 'abs-image', title: 'Picture → abs code', engine: 'mcq', rounds: 8,
          blurb: 'Look at the mirrored / line image, pick the code.',
          gen: (rng, level) => {
            const C = [0.25, 0.5, 0.75];
            const mk = () => {
              const c = rng.pick(C);
              const all = [
                { e: `abs(uv.x - ${f(c)})`, js: (x) => Math.abs(x - c) },
                { e: `1.0 - abs(uv.x - ${f(c)}) * 2.0`, js: (x) => 1 - Math.abs(x - c) * 2 },
                { e: `abs(uv.y - ${f(c)})`, js: (x, y) => Math.abs(y - c) },
                { e: `uv.x`, js: (x) => x },
                { e: `step(abs(uv.x - ${f(c)}), 0.1)`, js: (x) => G.step(Math.abs(x - c), 0.1), lvl: 2 },
                { e: `1.0 - abs(uv.y - ${f(c)}) * 4.0`, js: (x, y) => 1 - Math.abs(y - c) * 4, lvl: 2 },
                { e: 'abs(uv.x - 0.5) + abs(uv.y - 0.5)', js: (x, y) => Math.abs(x - 0.5) + Math.abs(y - 0.5), lvl: 3 },
                { e: 'max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0', js: (x, y) => Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2, lvl: 3 },
                { e: 'abs(uv.x - uv.y)', js: (x, y) => Math.abs(x - y), lvl: 3 },
              ].filter((o) => (o.lvl || 1) <= level);
              return rng.pick(all);
            };
            let ans = mk(); while (ans.e === 'uv.x') ans = mk();
            const opts = pickFns(rng, ans, mk, 4, 0.3);
            return {
              prompt: 'Which code made this image?',
              shader: img(ans.e),
              options: opts.map((o) => ({ code: o.e })),
              explain: `<p>It was <code>${ans.e}</code>. abs(x − c) alone is <b>dark</b> at c; "1 − abs(…)" or step(abs(…), w) makes it <b>bright</b> at c.</p>`,
            };
          },
        },
        {
          id: 'abs-tune', title: 'Place the line', engine: 'slider', rounds: 4,
          blurb: 'Set position and thickness of a line drawn with abs.',
          gen: (rng, level) => {
            const c = rng.step(0.15, 0.85, 0.05), w = rng.step(0.02, 0.15, 0.01);
            const mir = level === 3;
            const ex = mir ? 'abs(abs(uv.x - 0.5) - uC)' : 'abs(uv.x - uC)';
            const cT = mir ? rng.step(0.1, 0.4, 0.05) : c;
            return {
              prompt: mir ? 'Match the <b>pair</b> of lines (mirrored around 0.5).' : 'Match the line: position <b>c</b> and half-width <b>w</b>.',
              sub: mir ? 'c = how far each line is from the middle.' : undefined,
              params: [{ name: 'c', label: 'c', min: 0, max: mir ? 0.5 : 1, step: 0.01, target: cT }, { name: 'w', label: 'w (half-width)', min: 0, max: 0.2, step: 0.005, target: w }],
              build: (p) => ({ frag: `float d = ${ex};\ncol = vec3(step(d, uW));`, uniforms: { uC: p.c, uW: p.w } }),
              code: (p) => `float d = ${ex.replace('uC', f(p.c, 2))};\ncol = vec3(step(d, ${f(p.w, 3)})); // white where d ≤ w`,
              explain: mir ? `<p>Lines at 0.5 ± ${n(cT)} = ${n(0.5 - cT)} and ${n(0.5 + cT)}, each ${n(2 * w)} wide.</p>` : `<p>Centre at ${n(c)}, total width 2·w = ${n(2 * w)}.</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ pow
    {
      id: 'shaping.pow',
      title: 'pow: bending curves',
      blurb: 'Exponents bend a 0..1 ramp without moving its ends.',
      lesson: [
        {
          title: 'Bending a straight line',
          body: `<p><code>pow(x, p)</code> is x to the power p. For x between 0 and 1, something magical happens: <b>the ends never move</b> (0 stays 0, 1 stays 1) but the middle <b>bends</b>.</p>
<ul><li>p &gt; 1: sags down → darker, the bright part gets narrower</li><li>p = 1: straight line, unchanged</li><li>p &lt; 1: bulges up → brighter</li></ul>`,
          controls: [{ name: 'p', label: 'p', min: 0.2, max: 6, step: 0.05, value: 2 }],
          shader: (v) => plotSpec('pow(x, uP)', { uP: v.p }),
          graph: { fns: (v) => [{ f: (x) => Math.pow(x, v.p), label: `pow(x, ${n(v.p, 2)})` }, { f: (x) => x, color: '#4a4f63', dash: [4, 4] }], opts: GR },
          code: (v) => `col = vec3(pow(uv.x, ${f(v.p, 2)}));\n// at x = 0.5: ${n(Math.pow(0.5, v.p), 3)}`,
        },
        {
          title: 'Why does it get darker?',
          body: `<p>Multiplying two numbers below 1 makes a <b>smaller</b> number: half of a half is a quarter.</p>
<pre class="code">pow(0.5, 2.0) = 0.5 * 0.5       = 0.25
pow(0.5, 3.0) = 0.5 * 0.5 * 0.5 = 0.125
// p < 1 is a root → bigger:
pow(0.25, 0.5) = sqrt(0.25)     = 0.5</pre>
<p>But 1 × 1 is still 1, and 0 × 0 is still 0. That's why the ends are pinned.</p>`,
          controls: [
            { name: 'x', label: 'x', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 'p', label: 'p', min: 0.2, max: 5, step: 0.05, value: 2 },
          ],
          graph: { fns: (v) => [{ f: (x) => Math.pow(x, v.p) }], opts: (v) => ({ ...GR, points: [{ x: v.x, y: Math.pow(v.x, v.p), label: n(Math.pow(v.x, v.p), 3) }], vlines: [{ x: v.x, color: '#6c7289' }] }) },
          code: (v) => `pow(${f(v.x, 2)}, ${f(v.p, 2)}) = ${n(Math.pow(v.x, v.p), 4)}`,
        },
        {
          title: 'Sharpening a falloff',
          body: `<p>Huge use: <b>tightening a glow</b>. Start with a soft falloff g (1 at the centre, 0 at the rim), then raise it to a power. Higher p = tighter, hotter core, same overall size.</p>
<div class="tip">💡 Specular highlights do exactly this: <code>pow(max(dot(N, H), 0.0), shininess)</code>. Shininess 8 = broad, 128 = a tiny sharp spot. Fresnel/rim light: <code>pow(1.0 - NdotV, 3.0)</code>.</div>`,
          controls: [{ name: 'p', label: 'p', min: 0.3, max: 16, step: 0.1, value: 3 }],
          shader: (v) => ({ frag: 'float d = length(uv - 0.5);\nfloat g = max(1.0 - d * 2.0, 0.0);\ncol = vec3(1.0, 0.7, 0.3) * pow(g, uP);', uniforms: { uP: v.p } }),
          graph: { fns: (v) => [{ f: (x) => Math.pow(Math.max(1 - x * 2, 0), v.p), label: 'pow(g, p) vs distance' }], opts: { xmin: 0, xmax: 0.5, ymin: -0.1, ymax: 1.1 } },
          code: (v) => `float d = length(uv - 0.5);\nfloat g = max(1.0 - d * 2.0, 0.0); // 1 centre → 0 rim\ncol = vec3(1.0, 0.7, 0.3) * pow(g, ${f(v.p, 1)});`,
        },
        {
          title: 'Contrast & gamma-like curves',
          body: `<p>Apply pow to a whole image and you darken or brighten the <b>mid-tones</b> while black and white stay put. That's the shape of a <b>gamma</b> curve (screens use roughly <code>pow(c, 2.2)</code>).</p>`,
          controls: [{ name: 'p', label: 'p', min: 0.3, max: 3, step: 0.05, value: 1.6 }],
          shaders: [
            { spec: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'photo' } }, label: 'original' },
            { spec: (v) => ({ frag: 'col = pow(texture2D(uTex, uv).rgb, vec3(uP));', textures: { uTex: 'photo' }, uniforms: { uP: v.p } }), label: 'pow(c, p)' },
          ],
          code: (v) => `vec3 c = texture2D(uTex, uv).rgb;\ncol = pow(c, vec3(${f(v.p, 2)})); // ${v.p > 1 ? 'darker mids' : v.p < 1 ? 'brighter mids' : 'unchanged'}`,
        },
        {
          title: 'pow gotchas',
          body: `<ul>
<li><code>pow(x, 2)</code> → <b>compile error</b> in WebGL1 (2 is an int). Write <code>pow(x, 2.0)</code>.</li>
<li>Negative x: <code>pow(-0.5, 2.0)</code> is <b>undefined</b> in GLSL → often NaN → black or flickering pixels. <code>saturate</code> or <code>max(x, 0.0)</code> first!</li>
<li>pow is slower than a multiply. For p = 2 just write <code>x * x</code>.</li>
<li>For values above 1, p &gt; 1 makes them <i>bigger</i> — the "darker" rule only holds in 0..1.</li></ul>`,
          quiz: { q: 'You raise a 0..1 gradient to the power 3. What happens to the middle?', options: ['It gets darker', 'It gets brighter', 'It stays the same', 'Ends move too'], answer: 0, explain: 'p > 1 sags the curve: 0.5³ = 0.125. The ends 0 and 1 stay put.' },
        },
      ],
      games: [
        {
          id: 'pow-tune', title: 'Match the curve', engine: 'slider', rounds: 4,
          blurb: 'Find the exponent that bends the gradient like the target.',
          gen: (rng, level) => {
            const P = level === 1 ? [0.5, 1, 2, 3] : [0.33, 0.5, 0.75, 1.5, 2, 2.5, 3, 4];
            const p = rng.pick(P);
            const glow = level === 3 && rng.chance(0.5);
            if (glow) {
              const pg = rng.pick([1, 2, 4, 6, 8]);
              return {
                prompt: 'Match the glow: set the exponent <b>p</b>.',
                sub: 'Bigger p = tighter core.',
                params: [{ name: 'p', label: 'p', min: 0.5, max: 10, step: 0.1, target: pg }],
                build: (q2) => ({ frag: 'float g = max(1.0 - length(uv - 0.5) * 2.0, 0.0);\ncol = vec3(pow(g, uP));', uniforms: { uP: q2.p } }),
                code: (q2) => `float g = max(1.0 - length(uv - 0.5) * 2.0, 0.0);\ncol = vec3(pow(g, ${f(q2.p, 1)}));`,
                compare: 'pixels',
                explain: `<p>p was ${pg}. Same circle size, but the bright core shrinks as p grows.</p>`,
              };
            }
            return {
              prompt: 'Set <b>p</b> so <code>pow(uv.x, p)</code> matches the target.',
              sub: level === 1 ? 'The orange curve helps: compare the middle height.' : 'Look at the middle column: 0.5^p.',
              params: [{ name: 'p', label: 'p', min: 0.25, max: 4, step: 0.05, target: p }],
              build: (q2) => (level === 1 ? plotSpec('pow(x, uP)', { uP: q2.p }) : { frag: 'col = vec3(pow(uv.x, uP));', uniforms: { uP: q2.p } }),
              code: (q2) => `col = vec3(pow(uv.x, ${f(q2.p, 2)})); // middle = ${n(Math.pow(0.5, q2.p), 2)}`,
              compare: 'pixels',
              explain: `<p>p = ${n(p)} → the middle column is 0.5^${n(p)} = ${n(Math.pow(0.5, p), 3)}.</p>`,
            };
          },
        },
        {
          id: 'pow-graph', title: 'Which power?', engine: 'mcq', rounds: 8,
          blurb: 'Read the bend of a curve, pick the exponent.',
          gen: (rng, level) => {
            const P = level === 1 ? [0.25, 0.5, 1, 2, 4] : level === 2 ? [0.33, 0.5, 1, 2, 3, 5] : [0.5, 0.75, 1.5, 2, 3, 4];
            const ps = rng.pickN(P, 4);
            const show = level === 3;
            return {
              prompt: 'Which code draws this graph?',
              sub: show ? 'Hint: the dot is the value at x = 0.5.' : 'Below the dashed line = p > 1. Above = p < 1.',
              graph: { fns: [{ f: (x) => Math.pow(x, ps[0]) }, { f: (x) => x, color: '#4a4f63', dash: [4, 4] }], opts: { ...GR, ystep: 0.1, points: show ? [{ x: 0.5, y: Math.pow(0.5, ps[0]), label: n(Math.pow(0.5, ps[0]), 2) }] : [] } },
              options: ps.map((p) => ({ code: p === 1 ? 'x' : `pow(x, ${f(p)})` })),
              explain: `<p>It was p = ${n(ps[0])}: at x = 0.5 the value is ${n(Math.pow(0.5, ps[0]), 3)}. The further below the diagonal, the bigger p.</p>`,
            };
          },
        },
        {
          id: 'pow-eval', title: 'Compute pow', engine: 'numeric', rounds: 6,
          blurb: 'Mental exponents on numbers between 0 and 1.',
          gen: (rng, level) => {
            const L1 = [[0.5, 2], [0.1, 2], [0.3, 2], [0.9, 2], [1, 5], [0, 3], [0.2, 2], [0.5, 1]];
            const L2 = [[0.5, 3], [0.25, 0.5], [0.81, 0.5], [0.04, 0.5], [0.64, 0.5], [0.2, 3], [0.36, 0.5]];
            const L3 = [[0.5, 4], [0.09, 0.5], [0.8, 2], [0.7, 2], [0.6, 2], [0.125, 1 / 3], [0.49, 0.5]];
            const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2] : [...L2, ...L3];
            const [x, p] = rng.pick(pool);
            const ans = +Math.pow(x, p).toFixed(4);
            const pTxt = Math.abs(p - 1 / 3) < 1e-6 ? '1.0 / 3.0' : f(p);
            const why = p === 0.5 ? `Power 0.5 = square root: √${n(x)} = ${n(ans)}.` : Math.abs(p - 1 / 3) < 1e-6 ? `Power 1/3 = cube root: ${n(ans)} × ${n(ans)} × ${n(ans)} = ${n(x)}.` : p === 1 ? `Power 1 leaves x unchanged: ${n(ans)}.` : p === 0 ? 'Anything to the power 0 is 1.' : `${Array(p).fill(n(x)).join(' × ')} = ${n(ans)}.`;
            return {
              prompt: `What is <code>pow(${f(x)}, ${pTxt})</code>?`,
              sub: 'Two decimals is fine.',
              answer: ans,
              tolerance: 0.011,
              explain: `<p>${why}</p>`,
            };
          },
        },
        {
          id: 'pow-sort', title: 'Darker or brighter?', engine: 'buckets', rounds: 2,
          blurb: 'Does this curve darken, brighten or keep a 0..1 gradient?',
          gen: () => ({
            prompt: 'Compared with plain <code>x</code> (0..1), the middle gets…',
            buckets: ['🌑 Darker', '🌕 Brighter', '➖ Same'],
            count: 10,
            items: [
              { code: 'pow(x, 2.0)', bucket: 0 },
              { code: 'pow(x, 0.5)', bucket: 1, why: 'p < 1 is a root → bulges up.' },
              { code: 'pow(x, 1.0)', bucket: 2 },
              { code: 'sqrt(x)', bucket: 1, why: 'sqrt = pow(x, 0.5).' },
              { code: 'x * x', bucket: 0, why: 'x * x = pow(x, 2.0).' },
              { code: 'x * x * x', bucket: 0 },
              { code: 'pow(x, 1.0 / 2.2)', bucket: 1, why: '1/2.2 ≈ 0.45 < 1.' },
              { code: 'pow(x, 2.2)', bucket: 0 },
              { code: '1.0 - pow(1.0 - x, 2.0)', bucket: 1, why: 'Flip, darken, flip back → the curve bulges UP.' },
              { code: 'pow(x, 0.9)', bucket: 1, why: 'Only slightly, but p < 1 → brighter.' },
              { code: 'pow(x, 8.0)', bucket: 0 },
              { code: 'pow(x * x, 0.5)', bucket: 2, why: '(x²)^0.5 = x.' },
              { code: 'sqrt(x) * sqrt(x)', bucket: 2, why: '√x · √x = x.' },
            ],
            explain: '<p>For 0..1 values: p &gt; 1 → darker (sags), p &lt; 1 → brighter (bulges), p = 1 → unchanged.</p>',
          }),
        },
      ],
    },
    // ------------------------------------------------------------------ waves
    {
      id: 'shaping.waves',
      title: 'sin & cos: waves',
      blurb: 'Smooth repetition: frequency, amplitude, phase, and remapping −1..1.',
      lesson: [
        {
          title: 'sin: the wave',
          body: `<p><code>sin(x)</code> goes smoothly up and down between <b>−1 and 1</b>, forever. One full wave takes <b>2π ≈ 6.283</b> (called <code>TAU</code>).</p>
<div class="analogy">🎡 <b>Analogy:</b> your height on a Ferris wheel. Up, over the top, down, bottom, up again. sin is the height, x is how far the wheel has turned (TAU = one full turn).</div>`,
          controls: [{ name: 'x', label: 'x (turn amount)', min: 0, max: 12.57, step: 0.01, value: 1.57 }],
          graph: { fns: [{ f: Math.sin, label: 'sin(x)' }], opts: (v) => ({ xmin: 0, xmax: 12.57, ymin: -1.2, ymax: 1.2, xstep: 1.5708 * 2, ystep: 0.5, points: [{ x: v.x, y: Math.sin(v.x), label: n(Math.sin(v.x), 2) }], vlines: [{ x: 6.283, color: '#ff7ab2', label: 'TAU' }] }) },
          code: (v) => `sin(${f(v.x, 2)}) = ${n(Math.sin(v.x), 3)}\n// ${n(v.x / G.TAU, 2)} turns of the wheel`,
        },
        {
          title: 'Half the wave is missing!',
          body: `<p>Paint <code>sin</code> as brightness and the negative half is just <b>black</b> — the screen clips everything below 0.</p>
<p>Fix: squeeze −1..1 into 0..1:</p>
<pre class="code">// -1 → 0,  0 → 0.5,  1 → 1
0.5 + 0.5 * sin(x)</pre>
<div class="note">This "<b>× 0.5 + 0.5</b>" remap is everywhere: sin/cos, noise, normals as colours, dot products. Learn to spot it.</div>`,
          shaders: [
            { spec: plotSpec('sin(x * TAU * 2.0)'), label: 'sin(…)' },
            { spec: plotSpec('0.5 + 0.5 * sin(x * TAU * 2.0)'), label: '0.5 + 0.5 · sin(…)' },
          ],
          code: 'float s = sin(uv.x * TAU * 2.0);  // -1 .. 1\ncol = vec3(s);                    // left: negative half black\ncol = vec3(0.5 + 0.5 * s);        // right: full wave visible',
        },
        {
          title: 'Frequency: how many waves',
          body: `<p><code>uv.x * TAU</code> makes exactly <b>one full wave</b> across the square (uv.x 0→1 = one full turn). Multiply by a <b>frequency</b> to get that many waves:</p>
<pre class="code">sin(uv.x * TAU * freq)</pre>
<p>freq = 3 → three bright stripes. That's why you see TAU so often: it makes the numbers mean "waves per unit".</p>`,
          controls: [{ name: 'fq', label: 'frequency', min: 0.5, max: 10, step: 0.5, value: 3 }],
          shader: (v) => plotSpec('0.5 + 0.5 * sin(x * TAU * uF)', { uF: v.fq }),
          code: (v) => `col = vec3(0.5 + 0.5 * sin(uv.x * TAU * ${f(v.fq, 1)}));\n// ${n(v.fq)} waves across`,
          size: 260,
        },
        {
          title: 'Amplitude & offset',
          body: `<p>The general wave is <code>offset + amp * sin(…)</code>.</p>
<ul><li><b>amp</b>: how tall the wave is (contrast)</li><li><b>offset</b>: where its middle sits (brightness)</li></ul>
<p>0.5 + 0.5·sin is just amp 0.5, offset 0.5. Try amp 1 or offset 0.8 and watch it clip.</p>`,
          controls: [
            { name: 'a', label: 'amp', min: 0, max: 1, step: 0.01, value: 0.25 },
            { name: 'b', label: 'offset', min: 0, max: 1, step: 0.01, value: 0.5 },
          ],
          shader: (v) => plotSpec('uB + uA * sin(x * TAU * 2.0)', { uA: v.a, uB: v.b }),
          code: (v) => `col = vec3(${f(v.b, 2)} + ${f(v.a, 2)} * sin(uv.x * TAU * 2.0));\n// ranges ${n(v.b - v.a, 2)} .. ${n(v.b + v.a, 2)}`,
        },
        {
          title: 'Phase: sliding the wave',
          body: `<p>Add a number <i>inside</i> the sin and the wave <b>slides sideways</b>: <code>sin(x * TAU * freq + phase)</code>. A phase of TAU (6.283) slides it by one full wave — back where it started.</p>
<p>Put <code>uTime</code> in the phase and it moves by itself! And <code>cos</code> is just sin slid by a quarter wave (π/2).</p>`,
          controls: [
            { name: 'ph', label: 'phase', min: 0, max: 6.28, step: 0.01, value: 0 },
            { name: 'sp', label: 'speed (uTime ×)', min: 0, max: 4, step: 0.1, value: 0 },
          ],
          shader: (v) => plotSpec('0.5 + 0.5 * sin(x * TAU * 2.0 + uPh + uTime * uSp)', { uPh: v.ph, uSp: v.sp }),
          code: (v) => `col = vec3(0.5 + 0.5 * sin(uv.x * TAU * 2.0 + ${f(v.ph, 2)}${v.sp ? ` + uTime * ${f(v.sp, 1)}` : ''}));\n// phase ${n(v.ph, 2)} = ${n(v.ph / G.TAU, 2)} of a wave`,
        },
        {
          title: 'Waves in 2D',
          body: `<p>Waves can run along any number you have:</p>
<ul><li><code>sin(uv.x …) * sin(uv.y …)</code>: an egg-crate grid</li><li><code>sin(length(uv - 0.5) …)</code>: ripples from the centre</li><li><code>sin((uv.x + uv.y) …)</code>: diagonal stripes</li></ul>
<div class="tip">sin vs fract: both repeat. fract gives a hard-reset sawtooth, sin a smooth up-and-down. Pick by the look you want.</div>`,
          controls: [{ name: 'k', label: 'pattern #', min: 0, max: 2, step: 1, value: 1 }],
          shader: (v) => ({ frag: ['col = vec3(0.5 + 0.5 * sin(uv.x * TAU * 3.0) * sin(uv.y * TAU * 3.0));', 'col = vec3(0.5 + 0.5 * sin(length(uv - 0.5) * TAU * 6.0 - uTime * 3.0));', 'col = vec3(0.5 + 0.5 * sin((uv.x + uv.y) * TAU * 3.0));'][Math.round(v.k)] }),
          code: (v) => ['// egg crate\ncol = vec3(0.5 + 0.5 * sin(uv.x * TAU * 3.0) * sin(uv.y * TAU * 3.0));', '// ripples (moving)\ncol = vec3(0.5 + 0.5 * sin(length(uv - 0.5) * TAU * 6.0 - uTime * 3.0));', '// diagonal\ncol = vec3(0.5 + 0.5 * sin((uv.x + uv.y) * TAU * 3.0));'][Math.round(v.k)],
          quiz: { q: 'What range does <code>0.5 + 0.5 * sin(x)</code> cover?', options: ['−1 .. 1', '0 .. 1', '0.5 .. 1'], answer: 1, explain: 'sin is −1..1. × 0.5 → −0.5..0.5. + 0.5 → 0..1.' },
        },
      ],
      games: [
        {
          id: 'wave-tune', title: 'Match the wave', engine: 'slider', rounds: 4,
          blurb: 'Tune frequency, phase, amplitude to match the target.',
          gen: (rng, level) => {
            const fq = level === 1 ? rng.int(1, 6) : rng.step(1, 6, 0.5);
            if (level === 1) {
              return {
                prompt: 'Set the <b>frequency</b> to match.', sub: 'Count the bright stripes.',
                params: [{ name: 'f', label: 'frequency', min: 0.5, max: 8, step: 0.5, target: fq }],
                build: (p) => ({ frag: 'col = vec3(0.5 + 0.5 * sin(uv.x * TAU * uF));', uniforms: { uF: p.f } }),
                code: (p) => `col = vec3(0.5 + 0.5 * sin(uv.x * TAU * ${f(p.f, 1)}));`,
                explain: `<p>Frequency ${fq} = ${fq} full waves across the square.</p>`,
              };
            }
            if (level === 2) {
              const ph = rng.step(0.5, 5.5, 0.25);
              return {
                prompt: 'Match frequency <b>and</b> phase.', sub: 'Frequency first (count stripes), then slide with phase.',
                params: [{ name: 'f', label: 'frequency', min: 0.5, max: 8, step: 0.5, target: fq }, { name: 'p', label: 'phase', min: 0, max: 6.28, step: 0.01, target: ph }],
                build: (p) => ({ frag: 'col = vec3(0.5 + 0.5 * sin(uv.x * TAU * uF + uP));', uniforms: { uF: p.f, uP: p.p } }),
                code: (p) => `col = vec3(0.5 + 0.5 * sin(uv.x * TAU * ${f(p.f, 1)} + ${f(p.p, 2)}));`,
                compare: 'pixels',
                explain: `<p>Target: frequency ${n(fq)}, phase ${n(ph)}. Phase only slides the wave; it never changes the stripe count.</p>`,
              };
            }
            const a = rng.step(0.1, 0.5, 0.05), b = rng.step(0.3, 0.7, 0.05);
            return {
              prompt: 'Match frequency, <b>amp</b> and <b>offset</b>.', sub: 'amp = contrast, offset = mid brightness.',
              params: [{ name: 'f', label: 'frequency', min: 0.5, max: 8, step: 0.5, target: fq }, { name: 'a', label: 'amp', min: 0, max: 0.6, step: 0.01, target: a }, { name: 'b', label: 'offset', min: 0, max: 1, step: 0.01, target: b }],
              build: (p) => ({ frag: 'col = vec3(uB + uA * sin(uv.x * TAU * uF));', uniforms: { uF: p.f, uA: p.a, uB: p.b } }),
              code: (p) => `col = vec3(${f(p.b, 2)} + ${f(p.a, 2)} * sin(uv.x * TAU * ${f(p.f, 1)}));`,
              compare: 'pixels',
              explain: `<p>Target: ${n(b)} + ${n(a)}·sin(…) → brightness from ${n(b - a, 2)} to ${n(b + a, 2)}.</p>`,
            };
          },
        },
        {
          id: 'wave-eval', title: 'Compute the wave', engine: 'numeric', rounds: 6,
          blurb: 'Where on the wave is this pixel?',
          gen: (rng, level) => {
            const fq = level === 1 ? 1 : rng.pick([1, 2, 4]);
            const quarter = rng.int(0, 4);
            const u = +(quarter / (4 * fq)).toFixed(4);
            const raw = level === 3 && rng.chance(0.4);
            const useCos = level === 3 && !raw && rng.chance(0.5);
            const fn = useCos ? Math.cos : Math.sin;
            const s = +fn(u * G.TAU * fq).toFixed(6);
            const ans = raw ? s : 0.5 + 0.5 * s;
            const nm = useCos ? 'cos' : 'sin';
            const e = raw ? `${nm}(uv.x * TAU${fq > 1 ? ' * ' + f(fq) : ''})` : `0.5 + 0.5 * ${nm}(uv.x * TAU${fq > 1 ? ' * ' + f(fq) : ''})`;
            const turns = u * fq;
            return {
              prompt: `uv.x = ${n(u, 4)}<br>What is <code>${e}</code>?`,
              sub: 'Think in turns: uv.x × freq = how many full waves. ¼ turn → sin = 1, ½ → 0, ¾ → −1.',
              graph: level === 1 ? { fns: [{ f: (x) => 0.5 + 0.5 * Math.sin(x * G.TAU) }], opts: { ...GR, xstep: 0.25, vlines: [{ x: u, color: '#6c7289' }] } } : undefined,
              answer: +ans.toFixed(4),
              explain: `<p>uv.x × ${fq} = ${n(turns, 3)} turns. ${nm} of ${n(turns, 3)} turns = ${n(s, 3)}${raw ? '' : `, then 0.5 + 0.5 × ${n(s, 3)} = <b>${n(ans, 3)}</b>`}.</p>${useCos ? '<p>cos starts at the TOP of the wave (cos 0 = 1), a quarter wave ahead of sin.</p>' : ''}`,
            };
          },
        },
        {
          id: 'wave-image', title: 'Wave code → picture', engine: 'mcq', rounds: 8,
          blurb: 'Count frequency, check direction and phase, pick the image.',
          gen: (rng, level) => {
            const mk = () => {
              const k = rng.pick(level === 1 ? [1, 2, 4] : [1, 2, 3, 4, 5]);
              const all = [
                { e: `0.5 + 0.5 * sin(uv.x * TAU * ${f(k)})`, js: (x) => 0.5 + 0.5 * Math.sin(x * G.TAU * k) },
                { e: `0.5 + 0.5 * sin(uv.y * TAU * ${f(k)})`, js: (x, y) => 0.5 + 0.5 * Math.sin(y * G.TAU * k) },
                { e: `sin(uv.x * TAU * ${f(k)})`, js: (x) => Math.sin(x * G.TAU * k), lvl: 2 },
                { e: `0.5 + 0.5 * cos(uv.x * TAU * ${f(k)})`, js: (x) => 0.5 + 0.5 * Math.cos(x * G.TAU * k), lvl: 2 },
                { e: `0.5 + 0.5 * sin((uv.x + uv.y) * TAU * ${f(k)})`, js: (x, y) => 0.5 + 0.5 * Math.sin((x + y) * G.TAU * k), lvl: 3 },
                { e: `0.5 + 0.5 * sin(length(uv - 0.5) * TAU * ${f(k * 2)})`, js: (x, y) => 0.5 + 0.5 * Math.sin(Math.hypot(x - 0.5, y - 0.5) * G.TAU * k * 2), lvl: 3 },
                { e: `0.5 + 0.25 * sin(uv.x * TAU * ${f(k)})`, js: (x) => 0.5 + 0.25 * Math.sin(x * G.TAU * k), lvl: 3 },
              ].filter((o) => (o.lvl || 1) <= level);
              return rng.pick(all);
            };
            const ans = mk();
            const opts = pickFns(rng, ans, mk, 4, 0.35);
            return {
              prompt: 'Which picture does this make?',
              code: `col = vec3(${ans.e});`,
              options: opts.map((o) => ({ shader: img(o.e) })),
              explain: `<p>Check in this order: <b>which coordinate</b> (uv.x → vertical stripes, uv.y → horizontal), <b>how many waves</b> (the number after TAU), <b>remapped or not</b> (raw sin has wide black gaps), sin vs cos (cos starts bright at the left edge).</p>`,
            };
          },
        },
        {
          id: 'wave-tap', title: 'Tap a peak', engine: 'tap', rounds: 6,
          blurb: 'Work out where the wave is brightest — without seeing it.',
          gen: (rng, level) => {
            const fq = level === 1 ? rng.pick([1, 2]) : rng.pick([1, 2, 3, 4]);
            const kind = level === 3 ? rng.pick(['sin', 'cos', 'sinpi']) : 'sin';
            const off = { sin: 0.25, cos: 0, sinpi: 0.75 }[kind];
            const peaks = [];
            for (let k = -1; k <= fq + 1; k++) { const x = (off + k) / fq; if (x > -1e-9 && x < 1 + 1e-9) peaks.push(+x.toFixed(4)); }
            const inner = kind === 'sinpi' ? `sin(uv.x * TAU${fq > 1 ? ' * ' + f(fq) : ''} + PI)` : `${kind}(uv.x * TAU${fq > 1 ? ' * ' + f(fq) : ''})`;
            return {
              prompt: `<code>col = vec3(0.5 + 0.5 * ${inner});</code><br>Tap a spot where it is <b>brightest</b>.`,
              sub: level === 1 ? 'Faint picture behind the grid. Grid lines every 0.25.' : 'Grid lines every 0.25. sin peaks a quarter of the way through each wave.',
              shader: level === 1 ? { frag: `${GRID.frag}\ncol += vec3(0.5 + 0.5 * ${inner}) * 0.3;` } : GRID,
              score: scoreU(peaks, 0.04),
              reveal: peaks.map((p) => [p, 0.5]),
              explain: `<p>${fq} wave${fq > 1 ? 's' : ''} across → each is ${n(1 / fq, 3)} wide. ${kind === 'sin' ? 'sin peaks ¼ into each wave' : kind === 'cos' ? 'cos peaks at the start of each wave' : '+PI shifts the wave by half, so the peak is ¾ into each wave'}: uv.x = ${peaks.map((p) => n(p, 3)).join(', ')}.</p>`,
            };
          },
        },
      ],
    },
  ],
};
