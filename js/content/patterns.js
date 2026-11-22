// Topic — Patterns & repetition: fract tiling, floor cell ids, checkers, bricks, polar coords, radial repeat, mirroring.
import { tf, q, distinct, BW, GRAY3, f, n, G } from './_kit.js';

// ---------------------------------------------------------------- shared GLSL helpers
const D = `
float gridL(vec2 uv){
  vec2 g = abs(fract(uv * 10.0 + 0.5) - 0.5) / 10.0;
  float l = 1.0 - smoothstep(0.0, 0.004, min(g.x, g.y));
  vec2 h = abs(uv - 0.5);
  float m = 1.0 - smoothstep(0.0, 0.005, min(h.x, h.y));
  return max(l * 0.5, m);
}
vec3 bgCol(vec2 uv){ return vec3(0.09, 0.1, 0.15) + 0.1 * gridL(uv); }
float tileLines(vec2 uv, vec2 n){ vec2 g = fract(uv * n); vec2 e = min(g, 1.0 - g) / n; return 1.0 - smoothstep(0.002, 0.005, min(e.x, e.y)); }
float mark(vec2 uv, vec2 p, float r){ return 1.0 - smoothstep(r - 0.004, r + 0.004, length(uv - p)); }
vec2 radRep(vec2 p, float n){ float s = TAU / n; float a = atan(p.y, p.x); a = mod(a + s * 0.5, s) - s * 0.5; return length(p) * vec2(cos(a), sin(a)); }
float polarGrid(vec2 uv){
  vec2 p = uv - 0.5; float r = length(p); float a = atan(p.y, p.x);
  float rl = abs(fract(r * 10.0 + 0.5) - 0.5) / 10.0;
  float al = abs(fract(a / TAU * 8.0 + 0.5) - 0.5) / 8.0 * TAU * r;
  return max(0.5 * (1.0 - smoothstep(0.0, 0.004, rl)), 0.6 * (1.0 - smoothstep(0.0, 0.004, al)));
}
`;
const S = (frag, uniforms, extra) => ({ frag, defs: D, ...(uniforms ? { uniforms } : {}), ...(extra || {}) });
const TEX = (name, wrap = 'repeat') => ({ uTex: { name, filter: 'linear', wrap } });

// ---------------------------------------------------------------- JS helpers
const r2 = (x) => Math.round(x * 100) / 100;
const N = (x) => n(r2(x));
const fr = (x) => x - Math.floor(x);

/** Paint helper: regenerate until no cell centre sits within `margin` of a threshold (val near 0). */
function safePaint(rng, make, W, H, margin = 0.025) {
  let c;
  for (let i = 0; i < 120; i++) {
    c = make();
    let ok = true, on = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      if (Math.abs(c.val(u, v)) < margin) ok = false;
      if (c.val(u, v) < 0) on++;
    }
    if (ok && on >= 3 && on <= W * H - 3) return c;
  }
  return c;
}

/** mcq from a pool of snippets sharing prefix/suffix. dir: 'c2i' code → image, 'i2c' image → code */
function poolMcq(rng, level, pool, { prefix = '', suffix = '', dir, extra, tail = '' }) {
  const avail = pool.filter((p) => (p.lvl || 1) <= level);
  const ans = rng.pick(avail);
  const opts = distinct(rng, ans, () => rng.pick(avail), 4, (x) => x.code);
  const spec = (o) => S(prefix + o.code + suffix, o.u, extra);
  const ex = `<p>${ans.why || ''}</p>${tail}`;
  if (dir === 'c2i') return { prompt: 'Which image does this code draw?', code: prefix + ans.code + suffix, options: opts.map((o) => ({ shader: spec(o) })), explain: ex };
  return {
    prompt: 'Which code drew this image?', shader: spec(ans), options: opts.map((o) => ({ code: o.code })),
    sub: prefix ? `Every option starts with:<br><code>${prefix.trim().replace(/\n/g, '<br>')}</code>` : '', explain: ex,
  };
}
const dir = (rng) => (rng.chance() ? 'c2i' : 'i2c');
/** Show the untouched letterF texture next to the result image (mirror game). */
function withOriginal(item) {
  const { shader, ...rest } = item;
  return { ...rest, shaders: [{ spec: S('col = texture2D(uTex, uv).rgb;', null, { textures: TEX('letterF', 'clamp') }), label: 'original texture' }, { spec: shader, label: 'result' }] };
}

export default {
  id: 'patterns',
  title: 'Patterns & repetition',
  icon: '🔲',
  blurb: 'Tiles, grids, checkers, bricks, rays and kaleidoscopes — draw one thing, get hundreds.',
  cheatsheet: `
<p><b>Tile</b>: <code>vec2 g = fract(uv * N);</code> → N×N tiles, each with its own 0..1 coords.</p>
<p><b>Cell id</b>: <code>vec2 id = floor(uv * N);</code> → (0,0) bottom-left … (N−1, N−1). <code>uv * N = id + g</code>.</p>
<p><b>Random per tile</b>: <code>hash(id)</code> — same id, same number.</p>
<pre class="code">float stripes = mod(floor(uv.x * N), 2.0);
float checker = mod(floor(uv.x * N) + floor(uv.y * N), 2.0);
float diag    = step(0.5, fract((uv.x + uv.y) * N));
// bricks: shift odd rows by half a brick
vec2 p = uv * vec2(4.0, 8.0);
p.x += 0.5 * mod(floor(p.y), 2.0);
vec2 g = fract(p);</pre>
<p><b>Polar</b>: <code>p = uv - 0.5; r = length(p); a = atan(p.y, p.x);</code> (a: −π..π, 0 = right, counter-clockwise). Rays: <code>fract(a / TAU * N)</code>.</p>
<p><b>Radial repeat</b>: <code>s = TAU / N; a = mod(a + s/2, s) - s/2; p = r * vec2(cos(a), sin(a));</code></p>
<p><b>Mirror</b>: <code>p = abs(p)</code> folds space. Mirrored tiling: <code>abs(fract(x) - 0.5) * 2.0</code>.</p>
<p>Unity: Fraction, Floor, Modulo, Tiling And Offset, Polar Coordinates nodes. Unreal: Frac, Floor, Fmod, VectorToRadialValue.</p>`,
  concepts: [
    // ================================================================== 1. tiling with fract
    {
      id: 'patterns.tile',
      title: 'Tiling with fract',
      blurb: 'Multiply uv, keep the fraction: every tile gets its own little uv.',
      lesson: [
        {
          title: 'Make the numbers bigger',
          body: `<p>Start simple: multiply uv by N. Now <code>uv.x * N</code> runs from <b>0 to N</b> across the image instead of 0 to 1.</p>
<p>If we show it as brightness, everything above 1 is just white (colours stop at 1). So most of the image is wasted… for now.</p>`,
          controls: [{ name: 'n', label: 'N', min: 1, max: 6, step: 1, value: 3 }],
          shader: (v) => S('col = vec3(uv.x * uN);', { uN: v.n }),
          graph: { fns: (v) => [{ f: (x) => x * v.n, label: 'uv.x * N' }], opts: (v) => ({ xmin: 0, xmax: 1, ymin: -0.2, ymax: Math.max(1.2, v.n + 0.2) }) },
          code: (v) => `col = vec3(uv.x * ${f(v.n)}); // goes 0 → ${v.n}, but colour clamps at 1`,
        },
        {
          title: 'fract: keep what\'s after the dot',
          body: `<p><code>fract(x)</code> throws away the whole-number part and keeps the rest:</p>
<pre class="code">fract(0.3) = 0.3
fract(1.3) = 0.3
fract(2.75) = 0.75</pre>
<p>So <code>fract(uv.x * N)</code> climbs 0 → 1, <b>jumps back to 0</b>, climbs again… N times. A sawtooth.</p>`,
          controls: [{ name: 'n', label: 'N', min: 1, max: 8, step: 1, value: 3 }],
          graph: { fns: (v) => [{ f: (x) => fr(x * v.n), label: 'fract(uv.x * N)' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 } },
          shader: (v) => S('col = vec3(fract(uv.x * uN));', { uN: v.n }),
          code: (v) => `col = vec3(fract(uv.x * ${f(v.n)})); // ${v.n} ramps`,
          quiz: { q: 'fract(3.7) = ?', options: ['3', '0.7', '0.3'], answer: 1, explain: 'Drop the whole part (3), keep 0.7.' },
        },
        {
          title: 'In 2D: each tile gets its own uv',
          body: `<p>Do it on both axes at once:</p>
<pre class="code">vec2 g = fract(uv * N);
col = vec3(g, 0.0);</pre>
<p>Remember <code>col = vec3(uv, 0.0)</code> draws black → red → green → yellow. Now you get <b>N×N mini copies</b> of that square. Inside every tile, <code>g</code> goes 0..1 exactly like uv did.</p>
<div class="note">Key idea: <code>g</code> is a "local uv" for the tile. Anything you can draw with uv, you can draw with g — and it repeats.</div>`,
          controls: [{ name: 'n', label: 'N', min: 1, max: 8, step: 1, value: 3 }],
          shader: (v) => S('vec2 g = fract(uv * uN);\ncol = vec3(g, 0.0);', { uN: v.n }),
          code: (v) => `vec2 g = fract(uv * ${f(v.n)});\ncol = vec3(g, 0.0);`,
        },
        {
          title: 'Draw once, get many',
          body: `<p>Draw a circle in the middle of the <b>local</b> uv (0.5, 0.5) — you get one per tile:</p>
<pre class="code">vec2 g = fract(uv * N);
float d = length(g - 0.5);
if (d < r) col = vec3(1.0);</pre>
<div class="analogy">🧱 <b>Analogy:</b> a rubber stamp. You carve one design (the tile), then stamp it across the whole wall. fract is the stamping.</div>`,
          controls: [
            { name: 'n', label: 'N (tiles per side)', min: 1, max: 10, step: 1, value: 4 },
            { name: 'r', label: 'r (in tile units)', min: 0.05, max: 0.7, step: 0.01, value: 0.3 },
          ],
          shader: (v) => S('vec2 g = fract(uv * uN);\ncol = vec3(0.1, 0.11, 0.16);\nif (length(g - 0.5) < uR) col = vec3(1.0, 0.72, 0.3);', { uN: v.n, uR: v.r }),
          code: (v) => `vec2 g = fract(uv * ${f(v.n)});\nif (length(g - 0.5) < ${f(v.r, 2)}) col = orange;${v.r > 0.5 ? '\n// r > 0.5: the circle is cut off at the tile border!' : ''}`,
          after: '<div class="tip">💡 Unity Shader Graph: <b>Tiling And Offset</b> node = <code>uv * tiling + offset</code>, then <b>Fraction</b>. Unreal: multiply TexCoord, then <b>Frac</b>.</div>',
          quiz: { q: 'Why is r measured in "tile units"?', options: ['Because the circle is drawn using g, which goes 0..1 inside each tile', 'Because uv is always 0..1', 'It isn\'t, r is in pixels'], answer: 0, explain: 'g is the local uv. r = 0.5 touches the tile edges no matter how many tiles there are.' },
        },
        {
          title: 'Different counts per axis',
          body: `<p>Multiply by a <code>vec2</code> to get a different number of tiles horizontally and vertically.</p>
<p>Watch the circles: when tiles aren't square, the circle (round in <i>g</i> space) gets <b>squashed</b> into an oval on screen.</p>`,
          controls: [
            { name: 'nx', label: 'tiles in x', min: 1, max: 8, step: 1, value: 4 },
            { name: 'ny', label: 'tiles in y', min: 1, max: 8, step: 1, value: 2 },
          ],
          shader: (v) => S('vec2 g = fract(uv * vec2(uNx, uNy));\ncol = vec3(g, 0.0) * 0.5;\nif (length(g - 0.5) < 0.3) col = vec3(1.0, 0.72, 0.3);', { uNx: v.nx, uNy: v.ny }),
          code: (v) => `vec2 g = fract(uv * vec2(${f(v.nx)}, ${f(v.ny)}));\nif (length(g - 0.5) < 0.3) col = orange;`,
          quiz: { q: 'With uv * vec2(4.0, 2.0), the tiles are…', options: ['Wider than they are tall', 'Taller than they are wide', 'Square'], answer: 1, explain: '4 tiles across → each is 0.25 wide. 2 tiles up → each is 0.5 tall. So they are tall.' },
        },
      ],
      games: [
        {
          id: 'fract-num', title: 'fract in your head', engine: 'numeric', rounds: 6,
          blurb: 'Compute fract() of numbers and scaled uvs.',
          gen: (rng, level) => {
            let code, ans, ex;
            const kind = level === 1 ? 'plain' : level === 2 ? rng.pick(['plain', 'scaled', 'scaled']) : rng.pick(['scaled', 'neg', 'offset']);
            if (kind === 'plain') {
              const x = r2(rng.int(0, 9) + rng.pick([0.1, 0.25, 0.3, 0.5, 0.6, 0.75, 0.9]));
              ans = r2(fr(x)); code = `float x = fract(${f(x, 2)});`;
              ex = `Drop the whole part: ${N(Math.floor(x))} → keep <b>${N(ans)}</b>.`;
            } else if (kind === 'scaled') {
              let u, k, p;
              do { u = rng.step(0.05, 0.95, 0.05); k = rng.int(2, 6); p = r2(u * k); } while (Math.abs(p - Math.round(p)) < 0.04);
              ans = r2(fr(p)); code = `// uv.x = ${f(u, 2)}\nfloat g = fract(uv.x * ${f(k)});`;
              ex = `${N(u)} × ${k} = ${N(p)}. fract → <b>${N(ans)}</b>. The pixel is in tile ${Math.floor(p)}, ${Math.round(ans * 100)}% of the way across it.`;
            } else if (kind === 'neg') {
              const x = -rng.pick([0.25, 0.75, 0.1, 0.4, 1.25, 1.6]);
              ans = r2(fr(x)); code = `float x = fract(${f(x, 2)});`;
              ex = `fract(x) = x − floor(x). floor(${N(x)}) = ${Math.floor(x)} (rounds DOWN, towards −∞). ${N(x)} − (${Math.floor(x)}) = <b>${N(ans)}</b>. fract is never negative!`;
            } else {
              let u, k, o, p;
              do { u = rng.step(0.05, 0.95, 0.05); k = rng.int(2, 5); o = rng.pick([0.5, 0.25]); p = r2(u * k + o); } while (Math.abs(p - Math.round(p)) < 0.04);
              ans = r2(fr(p)); code = `// uv.x = ${f(u, 2)}\nfloat g = fract(uv.x * ${f(k)} + ${f(o, 2)});`;
              ex = `${N(u)} × ${k} + ${N(o)} = ${N(p)} → fract = <b>${N(ans)}</b>. Adding an offset slides the tiles sideways.`;
            }
            return { prompt: 'What is the result?', code, answer: ans, explain: `<p>${ex}</p>` };
          },
        },
        {
          id: 'tile-match', title: 'Tile count matcher', engine: 'slider', rounds: 4,
          blurb: 'How many tiles? Set N so your dot grid matches.',
          gen: (rng, level) => {
            const nx = rng.int(2, level === 1 ? 6 : 8), ny = level === 1 ? nx : rng.int(1, 8);
            const r = level === 3 ? rng.step(0.15, 0.45, 0.05) : 0.3;
            const params = level === 1
              ? [{ name: 'n', label: 'N', min: 1, max: 8, step: 1, target: nx }]
              : [{ name: 'nx', label: 'tiles in x', min: 1, max: 8, step: 1, target: nx }, { name: 'ny', label: 'tiles in y', min: 1, max: 8, step: 1, target: ny }];
            if (level === 3) params.push({ name: 'r', label: 'r', min: 0.05, max: 0.5, step: 0.05, target: r });
            const get = (p) => [p.n ?? p.nx, p.n ?? p.ny, p.r ?? r];
            return {
              prompt: level === 1 ? 'Match the number of tiles N.' : level === 2 ? 'Match the tile counts in x and y.' : 'Match the tile counts and the dot radius.',
              sub: 'Count the dots in one row and one column.',
              params,
              build: (p) => { const [a, b, rr] = get(p); return S('vec2 g = fract(uv * uN);\ncol = vec3(0.1, 0.11, 0.16);\nif (length(g - 0.5) < uR) col = vec3(1.0, 0.72, 0.3);', { uN: [a, b], uR: rr }); },
              code: (p) => { const [a, b, rr] = get(p); return `vec2 g = fract(uv * vec2(${f(a)}, ${f(b)}));\nif (length(g - 0.5) < ${f(rr, 2)}) col = orange;`; },
              explain: `<p>Target: ${nx} × ${ny} tiles${level === 3 ? `, r = ${N(r)}` : ''}. One dot per tile, so counting dots = counting tiles.</p>`,
            };
          },
        },
        {
          id: 'tile-pick', title: 'Tile code ↔ image', engine: 'mcq', rounds: 8,
          blurb: 'Read fract code, pick the pattern (or the other way round).',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(fract(uv.x * 3.0));', why: '3 horizontal ramps (dark → bright, left to right, three times).' },
            { code: 'col = vec3(fract(uv.y * 3.0));', why: '3 vertical ramps: fract of uv.y repeats bottom → top.' },
            { code: 'col = vec3(fract(uv * 3.0), 0.0);', why: '3×3 tiles, each a tiny copy of vec3(uv, 0.0): black, red, green, yellow corners.' },
            { code: 'col = vec3(step(length(fract(uv * 3.0) - 0.5), 0.3));', why: '3×3 grid of dots: a circle in every tile.' },
            { code: 'col = vec3(fract(uv.x * 6.0));', why: '6 ramps across.', lvl: 2 },
            { code: 'col = vec3(step(length(fract(uv * 5.0) - 0.5), 0.3));', why: '5×5 dots.', lvl: 2 },
            { code: 'col = vec3(uv.x * 3.0);', why: 'No fract: one ramp that hits white at uv.x = 1/3 and stays white.', lvl: 2 },
            { code: 'col = vec3(step(length(fract(uv * vec2(4.0, 2.0)) - 0.5), 0.3));', why: '4 tiles across, 2 up: tall tiles → the circles are stretched into tall ovals.', lvl: 3 },
            { code: 'col = vec3(fract(uv.x * 3.0) * fract(uv.y * 3.0));', why: 'Product of two sawtooths: each tile is dark except the top-right corner.', lvl: 3 },
          ], { dir: dir(rng) }),
        },
        {
          id: 'tile-gpu', title: 'Be the GPU: fract', engine: 'paint', rounds: 3,
          blurb: 'Compute fract(uv * N) per pixel and paint the result.',
          gen: (rng, level) => {
            const W = 6;
            const c0 = safePaint(rng, () => {
              const A = rng.pick([2, 3]), T = rng.pick([0.3, 0.5, 0.7]);
              const axis = rng.pick(['x', 'y']);
              const kinds = level === 1 ? ['one'] : level === 2 ? ['one', 'lt'] : ['and', 'or', 'lt'];
              const k = rng.pick(kinds);
              const B = rng.pick([2, 3]), T2 = rng.pick([0.3, 0.5, 0.7]);
              if (k === 'one') return { val: (u, v) => T - fr((axis === 'x' ? u : v) * A), code: `if (fract(uv.${axis} * ${f(A)}) > ${f(T)}) col = vec3(1.0);` };
              if (k === 'lt') return { val: (u, v) => fr((axis === 'x' ? u : v) * A) - T, code: `if (fract(uv.${axis} * ${f(A)}) < ${f(T)}) col = vec3(1.0);` };
              const a = (u) => T - fr(u * A), b = (v) => T2 - fr(v * B);
              if (k === 'and') return { val: (u, v) => Math.max(a(u), b(v)), code: `if (fract(uv.x * ${f(A)}) > ${f(T)} &&\n    fract(uv.y * ${f(B)}) > ${f(T2)}) col = vec3(1.0);` };
              return { val: (u, v) => Math.min(a(u), b(v)), code: `if (fract(uv.x * ${f(A)}) > ${f(T)} ||\n    fract(uv.y * ${f(B)}) > ${f(T2)}) col = vec3(1.0);` };
            }, W, W, 0.04);
            return {
              prompt: 'Paint what this shader outputs:',
              code: c0.code, w: W, h: W, palette: BW, showUV: true,
              solve: (u, v) => +(c0.val(u, v) < 0),
              explain: '<p>For each cell: multiply its uv by N, keep the fraction, compare. The pattern repeats N times because fract restarts at every whole number.</p>',
            };
          },
        },
      ],
    },
    // ================================================================== 2. cell ids
    {
      id: 'patterns.cells',
      title: 'Cell IDs with floor',
      blurb: 'floor tells each pixel WHICH tile it is in — so every tile can be different.',
      lesson: [
        {
          title: 'floor: which tile am I in?',
          body: `<p><code>fract</code> told us <i>where inside</i> a tile we are. Its partner <code>floor</code> tells us <b>which tile</b>:</p>
<pre class="code">floor(2.6) = 2.0   // round DOWN to a whole number</pre>
<p><code>floor(uv.x * N)</code> gives 0 for the first tile, 1 for the next, … up to N − 1. Divide by N − 1 to see it as brightness: a staircase.</p>`,
          controls: [{ name: 'n', label: 'N', min: 2, max: 8, step: 1, value: 4 }],
          graph: { fns: (v) => [{ f: (x) => Math.min(Math.floor(x * v.n), v.n - 1), label: 'floor(uv.x * N)' }], opts: (v) => ({ xmin: 0, xmax: 1, ymin: -0.3, ymax: v.n }) },
          shader: (v) => S('col = vec3(floor(uv.x * uN) / (uN - 1.0));', { uN: v.n }),
          code: (v) => `float id = floor(uv.x * ${f(v.n)}); // 0, 1, … ${v.n - 1}\ncol = vec3(id / ${f(v.n - 1)});`,
        },
        {
          title: 'id + fract = the full address',
          body: `<p>Every number splits into a whole part and a fraction: <code>x = floor(x) + fract(x)</code>.</p>
<p>So <code>uv * N</code> = <b>which tile</b> (id) + <b>where inside it</b> (g). Like a street address: house number + which room.</p>
<p>Drag the probe and watch both parts.</p>`,
          controls: [
            { name: 'n', label: 'N', min: 2, max: 8, step: 1, value: 4 },
            { name: 'px', label: 'probe uv.x', min: 0, max: 0.99, step: 0.01, value: 0.65 },
          ],
          shader: (v) => S('float x = uv.x * uN;\ncol = vec3(0.15 + 0.6 * floor(x) / uN, 0.2, 0.15 + 0.6 * fract(x));\ncol += 0.5 * tileLines(uv, vec2(uN, 1.0));\ncol = mix(col, vec3(1.0), 1.0 - smoothstep(0.003, 0.006, abs(uv.x - uP)));', { uN: v.n, uP: v.px }),
          code: (v) => { const x = r2(v.px * v.n); return `// uv.x = ${f(v.px, 2)}\nuv.x * ${f(v.n)} = ${f(x, 2)}\nfloor(${f(x, 2)}) = ${f(Math.floor(x))}   // tile id\nfract(${f(x, 2)}) = ${f(r2(fr(x)), 2)}   // position inside the tile`; },
        },
        {
          title: '2D ids',
          body: `<p>With a <code>vec2</code>, every tile gets a 2D id:</p>
<pre class="code">vec2 id = floor(uv * N);
col = vec3(id / (N - 1.0), 0.0);</pre>
<p>Bottom-left tile is (0, 0). Going right increases id.x (more red), going up increases id.y (more green). Each tile is one flat colour: every pixel inside it gets the <b>same</b> id.</p>`,
          controls: [{ name: 'n', label: 'N', min: 2, max: 8, step: 1, value: 4 }],
          shader: (v) => S('vec2 id = floor(uv * uN);\ncol = vec3(id / (uN - 1.0), 0.0);\ncol += 0.3 * tileLines(uv, vec2(uN));', { uN: v.n }),
          code: (v) => `vec2 id = floor(uv * ${f(v.n)}); // (0,0) … (${v.n - 1},${v.n - 1})\ncol = vec3(id / ${f(v.n - 1)}, 0.0);`,
          quiz: { q: 'With N = 4, what is the id of the top-right tile?', options: ['(4, 4)', '(3, 3)', '(1, 1)'], answer: 1, explain: 'ids start at 0, so with 4 tiles they go 0, 1, 2, 3. Top-right = (3, 3).' },
        },
        {
          title: 'A random value per tile',
          body: `<p>Feed the id into a <b>hash</b>: a function that turns any input into a random-looking number 0..1.</p>
<pre class="code">float rnd = hash(id);</pre>
<p>The important part: <b>same input → same output</b>. All pixels in a tile share the id, so they all get the same random value → each tile is one flat random grey.</p>
<div class="analogy">🎲 Like giving every apartment number a fixed "random" paint colour from a lookup table. Apartment 23 is always teal, no matter who asks.</div>`,
          controls: [
            { name: 'n', label: 'N', min: 2, max: 16, step: 1, value: 6 },
            { name: 's', label: 'seed (added to id)', min: 0, max: 10, step: 1, value: 0 },
          ],
          shader: (v) => S('vec2 id = floor(uv * uN);\ncol = vec3(hash(id + uS));', { uN: v.n, uS: v.s }),
          code: (v) => `vec2 id = floor(uv * ${f(v.n)});\ncol = vec3(hash(id + ${f(v.s)})); // new seed → new random layout`,
          after: '<div class="tip">Try hash(uv) instead of hash(id) in your head: every <i>pixel</i> would get its own value → TV static. Using the id is what makes it per-tile.</div>',
        },
        {
          title: 'Use the id to vary each tile',
          body: `<p>Now combine both: <b>g</b> (local uv) draws the shape, <b>id</b> decides how this particular copy looks.</p>
<pre class="code">vec2 id = floor(uv * N);
vec2 g  = fract(uv * N);
float rnd = hash(id);
float r = 0.1 + 0.3 * rnd;                  // random size
vec3 c = hsv2rgb(vec3(rnd, 0.6, 1.0));      // random colour
if (length(g - 0.5) < r) col = c;</pre>
<p>That's the recipe for star fields, random floor tiles, sprinkled decals…</p>`,
          controls: [
            { name: 'n', label: 'N', min: 2, max: 12, step: 1, value: 5 },
            { name: 'v', label: 'size variation', min: 0, max: 0.35, step: 0.01, value: 0.3 },
          ],
          shader: (v) => S('vec2 id = floor(uv * uN);\nvec2 g = fract(uv * uN);\nfloat rnd = hash(id);\nfloat r = 0.4 - uV + uV * rnd;\ncol = vec3(0.08, 0.09, 0.13);\nif (length(g - 0.5) < r) col = hsv2rgb(vec3(rnd, 0.6, 1.0));', { uN: v.n, uV: v.v }),
          code: (v) => `float r = ${f(0.4 - v.v, 2)} + ${f(v.v, 2)} * hash(id);`,
        },
      ],
      games: [
        {
          id: 'cell-id', title: 'Which cell?', engine: 'numeric', rounds: 6,
          blurb: 'Compute floor(uv * N) for a pixel.',
          gen: (rng, level) => {
            const pickU = (k) => { let u, p; do { u = rng.step(0.05, 0.95, 0.05); p = r2(u * k); } while (Math.abs(p - Math.round(p)) < 0.04); return u; };
            if (level === 1) {
              const k = rng.int(2, 6), u = pickU(k);
              const id = Math.floor(r2(u * k));
              return {
                prompt: 'What is <code>id</code>?', code: `// uv.x = ${f(u, 2)}\nfloat id = floor(uv.x * ${f(k)});`,
                answer: id, tolerance: 0.01,
                explain: `<p>${N(u)} × ${k} = ${N(u * k)} → floor → <b>${id}</b>. (ids go 0 … ${k - 1}.)</p>`,
              };
            }
            const kx = rng.int(2, 6), ky = level === 2 ? kx : rng.int(2, 6);
            const u = pickU(kx), v = pickU(ky);
            const id = [Math.floor(r2(u * kx)), Math.floor(r2(v * ky))];
            return {
              prompt: 'What is <code>id</code>?',
              code: `// uv = (${f(u, 2)}, ${f(v, 2)})\nvec2 id = floor(uv * ${kx === ky ? f(kx) : `vec2(${f(kx)}, ${f(ky)})`});`,
              wrap: 'vec2', labels: ['x', 'y'],
              shader: level === 2 ? S('col = bgCol(uv) + 0.25 * tileLines(uv, uK);\ncol = mix(col, vec3(1.0, 0.3, 0.3), mark(uv, uP, 0.02));', { uK: [kx, ky], uP: [u, v] }) : undefined,
              answer: id, tolerance: 0.01,
              explain: `<p>x: ${N(u)} × ${kx} = ${N(u * kx)} → <b>${id[0]}</b>. y: ${N(v)} × ${ky} = ${N(v * ky)} → <b>${id[1]}</b>.</p><p>Count from 0 at the bottom-left!</p>`,
            };
          },
        },
        {
          id: 'cell-tap', title: 'Tap the tile', engine: 'tap', rounds: 6,
          blurb: 'Find the tile with a given id.',
          gen: (rng, level) => {
            const nx = level === 1 ? rng.int(3, 4) : level === 2 ? rng.int(4, 6) : rng.int(3, 7);
            const ny = level === 3 ? rng.int(3, 7) : nx;
            const id = [rng.int(0, nx - 1), rng.int(0, ny - 1)];
            const ctr = [(id[0] + 0.5) / nx, (id[1] + 0.5) / ny];
            const code = nx === ny ? `vec2 id = floor(uv * ${f(nx)});` : `vec2 id = floor(uv * vec2(${f(nx)}, ${f(ny)}));`;
            return {
              prompt: `Tap the tile with <b>id = (${id[0]}, ${id[1]})</b>.`,
              code,
              sub: 'Each tile has a random grey: hash(id).',
              shader: S('vec2 id = floor(uv * uK);\ncol = vec3(0.15 + 0.5 * hash(id + 3.0));\ncol = mix(col, vec3(0.0), tileLines(uv, uK));', { uK: [nx, ny] }),
              score: (u, v) => (Math.min(Math.floor(u * nx), nx - 1) === id[0] && Math.min(Math.floor(v * ny), ny - 1) === id[1] ? 1 : 0),
              reveal: [ctr],
              explain: `<p>There are ${nx} columns (id.x 0…${nx - 1}, left → right) and ${ny} rows (id.y 0…${ny - 1}, <b>bottom → top</b>). Count ${id[0]} over from the left and ${id[1]} up from the bottom.</p>`,
            };
          },
        },
        {
          id: 'cell-pick', title: 'Floor code ↔ image', engine: 'mcq', rounds: 8,
          blurb: 'Staircases, per-tile colours and random tiles.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(floor(uv.x * 4.0) / 3.0);', why: '4 flat steps from black to white, left → right.' },
            { code: 'col = vec3(floor(uv.y * 4.0) / 3.0);', why: '4 flat steps from black to white, bottom → top.' },
            { code: 'col = vec3(floor(uv * 3.0) / 2.0, 0.0);', why: '3×3 flat tiles: red grows to the right, green grows upward.' },
            { code: 'col = vec3(hash(floor(uv * 4.0)));', why: 'Random grey per tile, 4×4 tiles.' },
            { code: 'col = vec3(fract(uv.x * 4.0));', why: 'That\'s fract, not floor: 4 smooth ramps, not flat steps.', lvl: 2 },
            { code: 'col = vec3(hash(floor(uv * 8.0)));', why: 'Random grey per tile, 8×8 tiles.', lvl: 2 },
            { code: 'col = vec3(hash(uv));', why: 'hash of uv (not id): every pixel is different → noise/static.', lvl: 2 },
            { code: 'col = vec3(floor(uv.x * 2.0));', why: 'floor(uv.x × 2) is 0 or 1: black left half, white right half.', lvl: 3 },
            { code: 'col = vec3((floor(uv.x * 4.0) + floor(uv.y * 4.0)) / 6.0);', why: 'Sum of ids: a diagonal staircase, darkest bottom-left, white top-right.', lvl: 3 },
          ], { dir: dir(rng) }),
        },
        {
          id: 'cell-gpu', title: 'Be the GPU: floor', engine: 'paint', rounds: 3,
          blurb: 'Compute the cell id of each pixel and paint the result.',
          gen: (rng, level) => {
            const rules = [
              { lvl: 1, code: 'col = vec3(floor(uv.x * 3.0) / 2.0);', pal: GRAY3, solve: (u) => Math.floor(u * 3), note: 'floor(uv.x * 3) is 0, 1 or 2 → divided by 2 → 0, 0.5, 1.' },
              { lvl: 1, code: 'col = vec3(floor(uv.y * 3.0) / 2.0);', pal: GRAY3, solve: (u, v) => Math.floor(v * 3), note: 'Same, but along uv.y: rows instead of columns.' },
              { lvl: 1, code: 'vec2 id = floor(uv * 3.0);\nif (id.x == id.y) col = vec3(1.0);', pal: BW, solve: (u, v) => +(Math.floor(u * 3) === Math.floor(v * 3)), note: 'Tiles where column = row: the diagonal (0,0), (1,1), (2,2).' },
              { lvl: 2, code: 'vec2 id = floor(uv * 3.0);\nif (id.x > id.y) col = vec3(1.0);', pal: BW, solve: (u, v) => +(Math.floor(u * 3) > Math.floor(v * 3)), note: 'Tiles below the diagonal: column bigger than row.' },
              { lvl: 2, code: 'vec2 id = floor(uv * 2.0);\ncol = vec3((id.x + id.y) / 2.0);', pal: GRAY3, solve: (u, v) => Math.floor(u * 2) + Math.floor(v * 2), note: '2×2 tiles: id sum is 0 (bottom-left), 1 (two tiles), 2 (top-right).' },
              { lvl: 2, code: 'vec2 id = floor(uv * vec2(2.0, 3.0));\nif (id.x + id.y >= 2.0) col = vec3(1.0);', pal: BW, solve: (u, v) => +(Math.floor(u * 2) + Math.floor(v * 3) >= 2), note: '2 columns (3 cells wide each) and 3 rows (2 cells tall each).' },
              { lvl: 3, code: 'float x = fract(uv.x * 2.0);\ncol = vec3(floor(x * 3.0) / 2.0);', pal: GRAY3, solve: (u) => Math.floor(fr(u * 2) * 3), note: 'fract first makes 2 repeats; floor(x × 3) cuts each repeat into 3 steps.' },
              { lvl: 3, code: 'vec2 id = floor(uv * 3.0);\nif (id.x + id.y == 2.0) col = vec3(1.0);', pal: BW, solve: (u, v) => +(Math.floor(u * 3) + Math.floor(v * 3) === 2), note: 'The anti-diagonal: (2,0), (1,1), (0,2).' },
            ];
            const r = rng.pick(rules.filter((x) => x.lvl <= level && (level < 3 || x.lvl >= 2)));
            return {
              prompt: 'Paint what this shader outputs:', code: r.code, w: 6, h: 6, palette: r.pal, showUV: level < 3,
              solve: r.solve, explain: `<p>${r.note}</p><p>Tile borders fall between cells here, so every cell is clearly in one tile.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 3. checkers & stripes
    {
      id: 'patterns.checker',
      title: 'Checkerboards & stripes',
      blurb: 'Odd/even tiles with mod(), and diagonal stripes from uv.x + uv.y.',
      lesson: [
        {
          title: 'Stripes: odd or even?',
          body: `<p><code>mod(x, 2.0)</code> is the remainder after dividing by 2: <b>0 for even</b> numbers, <b>1 for odd</b>.</p>
<p>Apply it to the tile id and every other tile lights up:</p>
<pre class="code">float s = mod(floor(uv.x * N), 2.0); // 0,1,0,1,…</pre>`,
          controls: [{ name: 'n', label: 'N', min: 2, max: 16, step: 1, value: 6 }],
          graph: { fns: (v) => [{ f: (x) => G.mod(Math.floor(x * v.n), 2), label: 'mod(floor(uv.x*N), 2)' }], opts: { xmin: 0, xmax: 1, ymin: -0.2, ymax: 1.2 } },
          shader: (v) => S('col = vec3(mod(floor(uv.x * uN), 2.0));', { uN: v.n }),
          code: (v) => `col = vec3(mod(floor(uv.x * ${f(v.n)}), 2.0));`,
          after: '<div class="tip">HLSL has <code>fmod</code>, which behaves differently for negative numbers. GLSL <code>mod</code> is always ≥ 0 for a positive divisor. Unreal: Fmod node; Unity: Modulo node.</div>',
        },
        {
          title: 'Stripes with fract + step',
          body: `<p>Another way: <code>step(t, fract(uv.x * N))</code>. It's white once the local position passes t.</p>
<p>Bonus: now you can change the <b>thickness</b> of the stripes — impossible with the mod version.</p>`,
          controls: [
            { name: 'n', label: 'N', min: 1, max: 12, step: 1, value: 5 },
            { name: 't', label: 't (threshold)', min: 0.05, max: 0.95, step: 0.05, value: 0.5 },
          ],
          shader: (v) => S('col = vec3(step(uT, fract(uv.x * uN)));', { uN: v.n, uT: v.t }),
          code: (v) => `col = vec3(step(${f(v.t, 2)}, fract(uv.x * ${f(v.n)})));\n// white part of each stripe: ${Math.round((1 - v.t) * 100)}%`,
          quiz: { q: 'With t = 0.8, the white stripes are…', options: ['Thin (20% of each tile)', 'Thick (80% of each tile)', 'Half and half'], answer: 0, explain: 'White only where fract > 0.8: the last 20% of each tile.' },
        },
        {
          title: 'Checkerboard = add the ids',
          body: `<p>The classic checker:</p>
<pre class="code">vec2 id = floor(uv * N);
float c = mod(id.x + id.y, 2.0);</pre>
<p><b>Why it works:</b> step one tile in <i>any</i> direction (right or up) and id.x + id.y changes by 1 → even flips to odd. So neighbours always differ. The table shows the sums for a 4×4 board.</p>`,
          controls: [{ name: 'n', label: 'N', min: 2, max: 12, step: 1, value: 4 }],
          shader: (v) => S('vec2 id = floor(uv * uN);\ncol = vec3(mod(id.x + id.y, 2.0));', { uN: v.n }),
          visual: (el) => {
            const tbl = document.createElement('div');
            tbl.style.cssText = 'display:grid;grid-template-columns:repeat(4,44px);gap:3px;justify-content:center;margin:10px 0;font:600 13px ui-monospace,monospace';
            for (let y = 3; y >= 0; y--) for (let x = 0; x < 4; x++) {
              const c = document.createElement('div');
              const s = x + y;
              c.textContent = `${x}+${y}=${s}`;
              c.style.cssText = `height:34px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:11px;${s % 2 ? 'background:#eee;color:#111' : 'background:#222;color:#ddd'}`;
              tbl.append(c);
            }
            el.append(tbl);
          },
          code: (v) => `vec2 id = floor(uv * ${f(v.n)});\ncol = vec3(mod(id.x + id.y, 2.0)); // even sum → black, odd → white`,
          after: '<p class="small dim">The prelude has <code>checker(uv, n)</code> doing exactly this.</p>',
        },
        {
          title: 'Diagonal stripes',
          body: `<p><code>uv.x + uv.y</code> has the <b>same value along every diagonal line</b> (↘ direction): (0.2, 0.3) and (0.4, 0.1) both give 0.5.</p>
<p>So stripes made from it run diagonally:</p>
<pre class="code">col = vec3(step(0.5, fract((uv.x + uv.y) * N)));</pre>
<p><code>uv.x - uv.y</code> gives the other diagonal. And any direction works with <code>dot(uv, dir)</code> — the angle slider.</p>`,
          controls: [
            { name: 'n', label: 'N', min: 1, max: 10, step: 1, value: 4 },
            { name: 'a', label: 'angle (degrees)', min: 0, max: 180, step: 5, value: 45 },
          ],
          shader: (v) => S('vec2 dir = vec2(cos(uA), sin(uA));\ncol = vec3(step(0.5, fract(dot(uv, dir) * uN)));', { uN: v.n, uA: (v.a * Math.PI) / 180 }),
          code: (v) => { const c = Math.cos((v.a * Math.PI) / 180), s = Math.sin((v.a * Math.PI) / 180); return `vec2 dir = vec2(${f(c, 2)}, ${f(s, 2)}); // ${v.a}°${v.a === 45 ? ' ≈ uv.x + uv.y (scaled)' : v.a === 0 ? ' → just uv.x' : v.a === 90 ? ' → just uv.y' : ''}\ncol = vec3(step(0.5, fract(dot(uv, dir) * ${f(v.n)})));`; },
          after: '<div class="note">The stripes run <b>perpendicular</b> to dir: dir points the way the value grows, the stripes are the lines where it stays constant.</div>',
        },
        {
          title: 'Grid lines (graph paper)',
          body: `<p>Stripes in both directions combined with <code>max</code> (= "either one") give a grid:</p>
<pre class="code">vec2 g = fract(uv * N);
float lx = step(1.0 - w, g.x);
float ly = step(1.0 - w, g.y);
col = vec3(max(lx, ly));</pre>`,
          controls: [
            { name: 'n', label: 'N', min: 2, max: 16, step: 1, value: 8 },
            { name: 'w', label: 'line width w', min: 0.02, max: 0.5, step: 0.01, value: 0.08 },
          ],
          shader: (v) => S('vec2 g = fract(uv * uN);\ncol = vec3(max(step(1.0 - uW, g.x), step(1.0 - uW, g.y)));', { uN: v.n, uW: v.w }),
          code: (v) => `vec2 g = fract(uv * ${f(v.n)});\ncol = vec3(max(step(${f(1 - v.w, 2)}, g.x), step(${f(1 - v.w, 2)}, g.y)));`,
          quiz: { q: 'What would min() instead of max() give?', options: ['Only the small squares where both lines cross', 'The same grid', 'A checkerboard'], answer: 0, explain: 'min = "both": white only where a vertical AND a horizontal line overlap — little dots at the crossings.' },
        },
      ],
      games: [
        {
          id: 'checker-gpu', title: 'Be the GPU: checkers', engine: 'paint', rounds: 3,
          blurb: 'Odd or even? Paint stripes and checkerboards cell by cell.',
          gen: (rng, level) => {
            const W = 6;
            const pick = rng.pick;
            const rules = {
              1: [
                () => { const a = pick([2, 3, 6]); return { code: `col = vec3(mod(floor(uv.x * ${f(a)}), 2.0));`, solve: (u) => G.mod(Math.floor(u * a), 2), note: `floor(uv.x × ${a}) counts columns; mod 2 alternates 0, 1, 0, 1.` }; },
                () => { const a = pick([2, 3, 6]); return { code: `col = vec3(mod(floor(uv.y * ${f(a)}), 2.0));`, solve: (u, v) => G.mod(Math.floor(v * a), 2), note: 'Same, along uv.y → horizontal bands.' }; },
              ],
              2: [
                () => { const a = pick([2, 3, 6]); return { code: `vec2 id = floor(uv * ${f(a)});\ncol = vec3(mod(id.x + id.y, 2.0));`, solve: (u, v) => G.mod(Math.floor(u * a) + Math.floor(v * a), 2), note: 'Checker: odd id sum → white. Bottom-left tile (0,0) is black.' }; },
                () => { const a = pick([2, 3]), b = a === 2 ? 3 : 2; return { code: `vec2 id = floor(uv * vec2(${f(a)}, ${f(b)}));\ncol = vec3(mod(id.x + id.y, 2.0));`, solve: (u, v) => G.mod(Math.floor(u * a) + Math.floor(v * b), 2), note: `A checker with ${a} columns and ${b} rows: the tiles are not square.` }; },
              ],
              3: [
                () => ({ code: 'col = vec3(mod(floor((uv.x + uv.y) * 2.5), 2.0));', solve: (u, v) => G.mod(Math.floor((u + v) * 2.5), 2), note: 'uv.x + uv.y is constant along ↘ diagonals, so floor/mod of it makes diagonal stripes. Compute it per cell: e.g. (0.25, 0.42) → 0.67 × 2.5 = 1.67 → floor 1 → white.' }),
                () => ({ code: 'vec2 id = floor(uv * 3.0);\ncol = vec3(mod(id.x * id.y, 2.0));', solve: (u, v) => G.mod(Math.floor(u * 3) * Math.floor(v * 3), 2), note: 'A product is odd only if BOTH ids are odd: only tile (1,1) is white.' }),
                () => ({ code: 'vec2 id = floor(uv * 6.0);\ncol = vec3(mod(id.x - id.y, 3.0) < 0.5 ? 1.0 : 0.0);', solve: (u, v) => +(G.mod(Math.floor(u * 6) - Math.floor(v * 6), 3) === 0), note: 'mod 3 of id.x − id.y: every 3rd diagonal is white. GLSL mod of a negative number is still positive: mod(−3, 3) = 0, mod(−1, 3) = 2.' }),
              ],
            };
            const pool = level === 1 ? rules[1] : level === 2 ? [...rules[1], ...rules[2], ...rules[2]] : [...rules[2], ...rules[3], ...rules[3]];
            const r = pick(pool)();
            return { prompt: 'Paint what this shader outputs:', code: r.code, w: W, h: W, palette: BW, showUV: level < 3, solve: r.solve, explain: `<p>${r.note}</p>` };
          },
        },
        {
          id: 'checker-pick', title: 'Stripe & checker code', engine: 'mcq', rounds: 8,
          blurb: 'Match the pattern to its code.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(mod(floor(uv.x * 4.0), 2.0));', why: '4 columns alternating: vertical stripes.' },
            { code: 'col = vec3(mod(floor(uv.y * 4.0), 2.0));', why: '4 rows alternating: horizontal stripes.' },
            { code: 'col = vec3(mod(floor(uv.x * 4.0) + floor(uv.y * 4.0), 2.0));', why: 'Sum of ids → 4×4 checkerboard.' },
            { code: 'col = vec3(step(0.5, fract((uv.x + uv.y) * 3.0)));', why: 'uv.x + uv.y is constant along ↘ diagonals → diagonal stripes.' },
            { code: 'col = vec3(step(0.5, fract((uv.x - uv.y) * 3.0)));', why: 'uv.x − uv.y: stripes along the other diagonal (↗).', lvl: 2 },
            { code: 'col = vec3(step(0.8, fract(uv.x * 4.0)));', why: 'Threshold 0.8: thin white stripes (20%).', lvl: 2 },
            { code: 'col = vec3(mod(floor(uv.x * 8.0) + floor(uv.y * 8.0), 2.0));', why: '8×8 checkerboard.', lvl: 2 },
            { code: 'col = vec3(mod(floor(uv.x * 4.0) + floor(uv.y * 2.0), 2.0));', why: '4 columns, 2 rows: a checker with tall tiles.', lvl: 3 },
            { code: 'vec2 g = fract(uv * 4.0);\ncol = vec3(max(step(0.9, g.x), step(0.9, g.y)));', why: 'max of two thin stripe sets → grid lines.', lvl: 3 },
          ], { dir: dir(rng) }),
        },
        {
          id: 'stripe-match', title: 'Stripe matcher', engine: 'slider', rounds: 4,
          blurb: 'Match the number and thickness of the stripes.',
          gen: (rng, level) => {
            const nn = rng.int(2, 9), t = rng.step(0.2, 0.8, 0.1);
            const diag = level === 3;
            const params = [{ name: 'n', label: 'N (stripes)', min: 1, max: 10, step: 1, target: nn }];
            if (level >= 2) params.push({ name: 't', label: 't (threshold)', min: 0.1, max: 0.9, step: 0.1, target: t });
            const tt = (p) => (p.t ?? 0.5);
            const expr = diag ? '(uv.x + uv.y) * 0.5' : 'uv.x';
            return {
              prompt: diag ? 'Match these diagonal stripes.' : level === 1 ? 'Match the number of stripes.' : 'Match the count and the thickness.',
              sub: 'Bigger t = thinner white part.',
              params,
              build: (p) => S(`col = vec3(step(uT, fract(${expr} * uN)));`, { uN: p.n, uT: tt(p) }),
              code: (p) => `col = vec3(step(${f(tt(p), 1)}, fract(${expr} * ${f(p.n)})));`,
              explain: `<p>Target N = ${nn}${level >= 2 ? `, t = ${N(t)} (white is ${Math.round((1 - t) * 100)}% of each stripe)` : ''}. ${diag ? '(uv.x + uv.y) × 0.5 goes 0 → 1 from corner to corner, so N counts the stripes along the diagonal.' : 'Count the white stripes: one per tile.'}</p>`,
            };
          },
        },
        {
          id: 'checker-fill', title: 'Fill the pattern', engine: 'codefill', rounds: 5,
          blurb: 'Fill in the blanks to make the target pattern.',
          gen: (rng) => {
            const V = [
              { template: 'float c = mod(floor(uv.x * 4.0) [[0]] floor(uv.y * 4.0), [[1]]);\ncol = vec3(c);', slots: [{ options: ['+', '*', '/', '-'], answer: '+' }, { options: ['2.0', '3.0', '1.0', '2'], answer: '2.0' }], ex: 'Checker = mod(id.x + id.y, 2.0). (Minus works too: the difference changes by 1 per step as well. "2" without the dot is an int → compile error.)' },
              { template: 'col = vec3(mod(floor([[0]] * 5.0), 2.0));', slots: [{ options: ['uv.x', 'uv.y', 'uv', 'uv.x + uv.y'], answer: 'uv.x' }], ex: 'Vertical stripes depend only on uv.x. (Using "uv" makes a vec2, and vec3(vec2) has too few components → compile error.)' },
              { template: 'col = vec3(mod(floor([[0]] * 5.0), 2.0));', slots: [{ options: ['uv.x', 'uv.y', 'uv', 'uv.x + uv.y'], answer: 'uv.y' }], ex: 'Horizontal stripes depend only on uv.y.' },
              { template: 'col = vec3(step(0.5, fract(([[0]]) * 3.0)));', slots: [{ options: ['uv.x + uv.y', 'uv.x - uv.y', 'uv.x * uv.y', 'uv.x'], answer: 'uv.x + uv.y' }], ex: 'Stripes running ↘ come from uv.x + uv.y (constant along those lines).' },
              { template: 'col = vec3(step(0.5, fract(([[0]]) * 3.0)));', slots: [{ options: ['uv.x + uv.y', 'uv.x - uv.y', 'uv.x * uv.y', 'uv.y'], answer: 'uv.x - uv.y' }], ex: 'Stripes running ↗ come from uv.x − uv.y.' },
              { template: 'vec2 g = fract(uv * 5.0);\ncol = vec3([[0]](step(0.8, g.x), step(0.8, g.y)));', slots: [{ options: ['max', 'min', 'mod', 'step'], answer: 'max' }], ex: 'Grid lines = vertical lines OR horizontal lines → max. (min gives only the crossings.)' },
            ];
            const vr = rng.pick(V);
            return {
              prompt: 'Fill the blanks so "Yours" matches the target.',
              template: vr.template, slots: vr.slots,
              build: (vals) => S(vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i])),
              explain: `<p>${vr.ex}</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 4. bricks & offsets
    {
      id: 'patterns.brick',
      title: 'Offsets & brick patterns',
      blurb: 'Shift every other row by half a tile: bricks, hex-ish grids, staggered patterns.',
      lesson: [
        {
          title: 'Real bricks don\'t line up',
          body: `<p>A plain grid looks like bathroom tiles. Real brick walls are <b>staggered</b>: every other row is shifted by half a brick, so the joints don't line up (and the wall doesn't fall over).</p>
<p>We'll build the right one step by step.</p>`,
          shaders: [
            { spec: S('vec2 p = uv * vec2(4.0, 8.0);\nvec2 g = fract(p);\nfloat m = step(0.06, g.x) * step(0.12, g.y);\ncol = mix(vec3(0.85), vec3(0.7, 0.3, 0.2), m);'), label: 'plain grid' },
            { spec: S('vec2 p = uv * vec2(4.0, 8.0);\np.x += 0.5 * mod(floor(p.y), 2.0);\nvec2 g = fract(p);\nfloat m = step(0.06, g.x) * step(0.12, g.y);\ncol = mix(vec3(0.85), vec3(0.7, 0.3, 0.2), m);'), label: 'brick (offset rows)' },
          ],
        },
        {
          title: 'Step 1: which row am I in?',
          body: `<p>Scale uv so a brick is 1×1 in <code>p</code>, then the row number is just <code>floor(p.y)</code> (cell ids!).</p>
<pre class="code">vec2 p = uv * vec2(4.0, 8.0); // 4 bricks across, 8 rows
float row = floor(p.y);
float odd = mod(row, 2.0);     // 1 on odd rows, 0 on even</pre>
<p>Below: odd rows highlighted.</p>`,
          shader: S('vec2 p = uv * vec2(4.0, 8.0);\nfloat odd = mod(floor(p.y), 2.0);\ncol = mix(vec3(0.15), vec3(0.3, 0.8, 1.0), odd);\ncol = mix(col, vec3(0.0), tileLines(uv, vec2(4.0, 8.0)));'),
          code: 'vec2 p = uv * vec2(4.0, 8.0);\nfloat odd = mod(floor(p.y), 2.0);\ncol = mix(dark, blue, odd); // rows 1, 3, 5, 7 are blue',
          quiz: { q: 'Row 0 is at the bottom. Is row 0 "odd"?', options: ['No — mod(0, 2) = 0', 'Yes', 'Depends on N'], answer: 0, explain: '0 is even. So the bottom row is not shifted.' },
        },
        {
          title: 'Step 2: shift the odd rows',
          body: `<p>Add the offset to <code>p.x</code> <b>before</b> taking fract. Only odd rows get it, because odd is 0 elsewhere:</p>
<pre class="code">p.x += offset * mod(floor(p.y), 2.0);
vec2 g = fract(p);   // local brick coords</pre>
<p>Slide the offset: 0 = grid, 0.5 = proper brick, 1.0 = …back to a grid (shifting by a whole brick changes nothing!).</p>`,
          controls: [{ name: 'o', label: 'offset', min: 0, max: 1, step: 0.05, value: 0.5 }],
          shader: (v) => S('vec2 p = uv * vec2(4.0, 8.0);\np.x += uO * mod(floor(p.y), 2.0);\nvec2 g = fract(p);\nfloat m = step(0.06, g.x) * step(0.12, g.y);\ncol = mix(vec3(0.85), vec3(0.7, 0.3, 0.2), m);', { uO: v.o }),
          code: (v) => `vec2 p = uv * vec2(4.0, 8.0);\np.x += ${f(v.o, 2)} * mod(floor(p.y), 2.0);\nvec2 g = fract(p);\nfloat brick = step(0.06, g.x) * step(0.12, g.y); // mortar where g is near 0`,
          after: '<div class="note">Order matters: <b>offset first, then fract/floor</b>. The offset moves the bricks; fract then cuts the shifted space into tiles.</div>',
        },
        {
          title: 'Brick proportions & mortar',
          body: `<p>The scale <code>vec2(nx, ny)</code> sets how many bricks across and how many rows. A real brick is about twice as wide as tall, so in a square image use <b>ny ≈ 2 × nx</b>.</p>
<p>The mortar: <code>step(w, g.x) * step(w, g.y)</code> is 1 in the brick and 0 in a thin strip at the left and bottom of each tile.</p>`,
          controls: [
            { name: 'nx', label: 'bricks across', min: 1, max: 8, step: 1, value: 3 },
            { name: 'ny', label: 'rows', min: 1, max: 16, step: 1, value: 6 },
            { name: 'w', label: 'mortar', min: 0, max: 0.3, step: 0.01, value: 0.06 },
          ],
          shader: (v) => S('vec2 p = uv * vec2(uNx, uNy);\np.x += 0.5 * mod(floor(p.y), 2.0);\nvec2 g = fract(p);\nvec2 id = floor(p);\nfloat m = step(uW * 0.5, g.x) * step(uW, g.y);\nvec3 b = vec3(0.7, 0.3, 0.2) * (0.8 + 0.4 * hash(id));\ncol = mix(vec3(0.85), b, m);', { uNx: v.nx, uNy: v.ny, uW: v.w }),
          code: (v) => `vec2 p = uv * vec2(${f(v.nx)}, ${f(v.ny)});\np.x += 0.5 * mod(floor(p.y), 2.0);\nvec2 g = fract(p);\nvec2 id = floor(p);  // per-brick id → random tint with hash(id)\nfloat m = step(${f(v.w / 2, 3)}, g.x) * step(${f(v.w, 2)}, g.y);`,
          after: '<p class="small dim">Bonus: each brick has a random tint from <code>hash(id)</code> — the id is taken <i>after</i> the shift, so it follows the bricks.</p>',
        },
        {
          title: 'Other offsets',
          body: `<p>Same trick, different offset rules:</p>
<ul><li><code>p.x += 0.5 * mod(row, 2.0)</code> — brick (running bond)</li>
<li><code>p.x += 0.25 * row</code> — every row shifts a bit more → a <b>staircase</b></li>
<li><code>p.x += uTime * (odd * 2.0 - 1.0)</code> — rows sliding in opposite directions (conveyor belts!)</li></ul>`,
          controls: [{ name: 'm', label: 'mode (0 brick, 1 staircase, 2 sliding)', min: 0, max: 2, step: 1, value: 2 }],
          shader: (v) => S('vec2 p = uv * vec2(4.0, 8.0);\nfloat row = floor(p.y);\nfloat odd = mod(row, 2.0);\nif (uM < 0.5) p.x += 0.5 * odd;\nelse if (uM < 1.5) p.x += 0.25 * row;\nelse p.x += uTime * 0.5 * (odd * 2.0 - 1.0);\nvec2 g = fract(p);\nfloat m = step(0.05, g.x) * step(0.1, g.y);\ncol = mix(vec3(0.85), vec3(0.3, 0.5, 0.8), m);', { uM: v.m }),
          code: (v) => ['p.x += 0.5 * odd;', 'p.x += 0.25 * row;', 'p.x += uTime * 0.5 * (odd * 2.0 - 1.0); // +1 or −1'][v.m],
        },
      ],
      games: [
        {
          id: 'brick-match', title: 'Brick matcher', engine: 'slider', rounds: 4,
          blurb: 'Match the row offset (and brick counts).',
          gen: (rng, level) => {
            const o = rng.pick(level === 1 ? [0, 0.25, 0.5, 0.75] : [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
            const nx = level === 1 ? 4 : rng.int(2, 6), ny = level === 1 ? 8 : rng.int(3, 10);
            const params = [{ name: 'o', label: 'offset', min: 0, max: 1, step: 0.05, target: o }];
            if (level >= 2) params.push({ name: 'nx', label: 'bricks across', min: 1, max: 8, step: 1, target: nx });
            if (level === 3) params.push({ name: 'ny', label: 'rows', min: 1, max: 12, step: 1, target: ny });
            const g = (p) => [p.o, p.nx ?? nx, p.ny ?? (level === 2 ? ny : ny)];
            return {
              prompt: level === 1 ? 'Match the offset of the odd rows.' : 'Match the offset and the brick counts.',
              sub: 'Compare an odd row (2nd from the bottom) with the row below it.',
              params, compare: 'pixels',
              build: (p) => { const [oo, a, b] = g(p); return S('vec2 p = uv * vec2(uNx, uNy);\np.x += uO * mod(floor(p.y), 2.0);\nvec2 gg = fract(p);\nfloat m = step(0.06, gg.x) * step(0.12, gg.y);\ncol = mix(vec3(0.85), vec3(0.7, 0.3, 0.2), m);', { uO: oo, uNx: a, uNy: b }); },
              code: (p) => { const [oo, a, b] = g(p); return `vec2 p = uv * vec2(${f(a)}, ${f(b)});\np.x += ${f(oo, 2)} * mod(floor(p.y), 2.0);`; },
              explain: `<p>Target offset = ${N(o)} of a brick. (Offsets 0 and 1 look identical — a whole brick of shift is invisible.)</p>`,
            };
          },
        },
        {
          id: 'brick-num', title: 'Brick address', engine: 'numeric', rounds: 6,
          blurb: 'Work out the row, the shift and the local position for a point.',
          gen: (rng, level) => {
            const px = r2(rng.int(0, 3) + rng.step(0.1, 0.9, 0.1));
            const py = r2(rng.int(0, 7) + rng.step(0.1, 0.9, 0.1));
            const row = Math.floor(py), odd = row % 2;
            const sx = r2(px + 0.5 * odd);
            const code = `vec2 p = vec2(${f(px, 2)}, ${f(py, 2)});\np.x += 0.5 * mod(floor(p.y), 2.0);`;
            const ask = level === 1 ? rng.pick(['row', 'px']) : level === 2 ? rng.pick(['px', 'gx']) : rng.pick(['gx', 'idx']);
            const map = {
              row: { q: 'What is <code>floor(p.y)</code> (the row)?', code: `vec2 p = vec2(${f(px, 2)}, ${f(py, 2)});`, a: row },
              px: { q: 'What is <code>p.x</code> after the shift?', code, a: sx },
              gx: { q: 'What is <code>fract(p.x)</code> after the shift?', code: code + '\nfloat gx = fract(p.x);', a: r2(fr(sx)) },
              idx: { q: 'What is <code>floor(p.x)</code> after the shift (the brick number in this row)?', code: code + '\nfloat ix = floor(p.x);', a: Math.floor(sx) },
            }[ask];
            return {
              prompt: map.q, code: map.code, answer: map.a,
              explain: `<p>Row = floor(${N(py)}) = ${row} → ${odd ? '<b>odd</b>, so p.x gets +0.5' : '<b>even</b>, so no shift'}. p.x = ${N(px)}${odd ? ' + 0.5' : ''} = ${N(sx)}. fract = ${N(fr(sx))}, floor = ${Math.floor(sx)}.</p>`,
            };
          },
        },
        {
          id: 'brick-pick', title: 'Which offset rule?', engine: 'mcq', rounds: 8,
          blurb: 'Bricks, staircases, columns — read the offset code.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'p.x += 0.0;', why: 'No offset: a plain grid.' },
            { code: 'p.x += 0.5 * mod(floor(p.y), 2.0);', why: 'Odd rows shifted half a brick: classic brick. (Fun fact: 0.5 * floor(p.y) would look identical — a shift of a whole brick is invisible.)' },
            { code: 'p.x += 0.25 * floor(p.y);', why: 'Each row shifts a quarter more than the one below: a staircase.' },
            { code: 'p.y += 0.5 * mod(floor(p.x), 2.0);', why: 'The offset is on y, chosen by the column: odd COLUMNS slide up half a tile.', lvl: 2 },
            { code: 'p.x += 0.25 * mod(floor(p.y), 2.0);', why: 'Odd rows shifted only a quarter brick.', lvl: 2 },
            { code: 'p.y += 0.25 * floor(p.x);', why: 'Offset on y, growing with each column: the columns step upward like a staircase.', lvl: 3 },
          ], { prefix: 'vec2 p = uv * vec2(4.0, 8.0);\n', suffix: '\nvec2 g = fract(p);\ncol = mix(vec3(0.85), vec3(0.7, 0.3, 0.2), step(0.06, g.x) * step(0.12, g.y));', dir: 'i2c' }),
        },
      ],
    },
    // ================================================================== 5. polar coordinates
    {
      id: 'patterns.polar',
      title: 'Polar coordinates',
      blurb: 'Describe each pixel by angle and radius instead of x and y.',
      lesson: [
        {
          title: 'Two new numbers: how far, which way',
          body: `<p>Instead of "x across, y up", describe a pixel by:</p>
<ul><li><b>r</b> — how far from the centre: <code>length(p)</code></li><li><b>a</b> — which direction: <code>atan(p.y, p.x)</code></li></ul>
<pre class="code">vec2 p = uv - 0.5;        // centre at (0, 0)
float r = length(p);
float a = atan(p.y, p.x); // angle in radians</pre>
<div class="analogy">📡 A radar screen or a clock: "the plane is 3 km away at 2 o'clock". That's polar.</div>`,
          shaders: [
            { spec: S('vec2 p = uv - 0.5;\ncol = vec3(length(p) * 2.0);'), label: 'r (× 2 to be visible)' },
            { spec: S('vec2 p = uv - 0.5;\ncol = vec3(atan(p.y, p.x) / TAU + 0.5);'), label: 'a (remapped to 0..1)' },
          ],
          after: '<p class="small dim">The angle image has a hard seam on the left: that\'s where the angle jumps from +π to −π.</p>',
        },
        {
          title: 'Reading the angle',
          body: `<p><code>atan(y, x)</code> returns radians from <b>−π to π</b> (−180° to 180°):</p>
<ul><li>0 → pointing <b>right</b></li><li>π/2 ≈ 1.57 → <b>up</b></li><li>±π ≈ ±3.14 → <b>left</b> (the seam)</li><li>−π/2 ≈ −1.57 → <b>down</b></li></ul>
<p>It goes <b>counter-clockwise</b>. Move the probe.</p>`,
          controls: [
            { name: 'd', label: 'probe direction (°)', min: -180, max: 180, step: 5, value: 45 },
            { name: 'r', label: 'probe distance', min: 0.05, max: 0.45, step: 0.01, value: 0.3 },
          ],
          shader: (v) => { const a = (v.d * Math.PI) / 180; return S('vec2 p = uv - 0.5;\ncol = vec3(atan(p.y, p.x) / TAU + 0.5) * 0.7 + 0.3 * polarGrid(uv);\ncol = mix(col, vec3(1.0, 0.4, 0.3), 1.0 - smoothstep(0.003, 0.007, sdSegment(uv, vec2(0.5), uP)));\ncol = mix(col, vec3(1.0, 0.4, 0.3), mark(uv, uP, 0.018));', { uP: [0.5 + v.r * Math.cos(a), 0.5 + v.r * Math.sin(a)] }); },
          code: (v) => { const a = (v.d * Math.PI) / 180; const x = v.r * Math.cos(a), y = v.r * Math.sin(a); return `vec2 p = vec2(${f(x, 2)}, ${f(y, 2)});\nfloat r = length(p);       // ${f(v.r, 2)}\nfloat a = atan(p.y, p.x);  // ${f(Math.atan2(y, x), 2)} rad = ${Math.round((Math.atan2(y, x) * 180) / Math.PI)}°`; },
          after: '<div class="tip">HLSL calls it <code>atan2(y, x)</code> — same argument order. Watch out: GLSL\'s single-argument <code>atan(y/x)</code> loses which quadrant you\'re in.</div>',
          quiz: { q: 'What does atan(p.y, p.x) return for a pixel straight below the centre?', options: ['π/2 ≈ 1.57', '−π/2 ≈ −1.57', '0'], answer: 1, explain: 'Down is a quarter turn clockwise from "right" → negative: −π/2.' },
        },
        {
          title: 'Rays: repeat the angle',
          body: `<p>Turn the angle into "turns" (0..1 around the circle) by dividing by <code>TAU</code> (= 2π, a full turn). Then it's just like uv.x — and we already know how to make stripes from that!</p>
<pre class="code">float t = a / TAU;                     // −0.5 .. 0.5 turns
float rays = step(0.5, fract(t * N));  // N rays</pre>`,
          controls: [
            { name: 'n', label: 'N rays', min: 1, max: 24, step: 1, value: 8 },
            { name: 'w', label: 'threshold', min: 0.1, max: 0.9, step: 0.05, value: 0.5 },
          ],
          shader: (v) => S('vec2 p = uv - 0.5;\nfloat t = atan(p.y, p.x) / TAU;\ncol = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.45, 0.1), step(uW, fract(t * uN)));', { uN: v.n, uW: v.w }),
          code: (v) => `vec2 p = uv - 0.5;\nfloat t = atan(p.y, p.x) / TAU;\nfloat rays = step(${f(v.w, 2)}, fract(t * ${f(v.n)}));`,
          quiz: { q: 'Why use a whole number for N?', options: ['Otherwise the rays don\'t fit around the circle and there\'s a seam on the left', 'GLSL only accepts whole numbers', 'It doesn\'t matter'], answer: 0, explain: 'The angle jumps at ±π (left side). With a whole N, fract(t·N) is the same on both sides of the jump, so no seam.' },
        },
        {
          title: 'Pie slices',
          body: `<p>Remap the angle to 0..1 and compare it with a fill amount: a <b>pie chart</b> — or a radial progress bar / ability cooldown in a game UI.</p>
<pre class="code">float t = atan(p.y, p.x) / TAU + 0.5;  // 0..1, starting on the left
float pie = step(t, fill);</pre>`,
          controls: [{ name: 'k', label: 'fill', min: 0, max: 1, step: 0.01, value: 0.65 }],
          shader: (v) => S('vec2 p = uv - 0.5;\nfloat t = atan(p.y, p.x) / TAU + 0.5;\nfloat r = length(p);\ncol = vec3(0.1, 0.11, 0.16);\nif (r < 0.4 && r > 0.25) col = mix(vec3(0.25), vec3(0.3, 0.9, 0.6), step(t, uK));', { uK: v.k }),
          code: (v) => `float t = atan(p.y, p.x) / TAU + 0.5;\nif (r < 0.4 && r > 0.25)               // ring\n  col = mix(grey, green, step(t, ${f(v.k, 2)}));`,
          after: '<p class="small dim">It fills counter-clockwise starting from the left (where t = 0). Want it to start at the top and go clockwise, like a clock? Swap the arguments: <code>t = fract(atan(p.x, p.y) / TAU);</code></p>',
        },
        {
          title: 'Rings & spirals',
          body: `<p>Repeat the <b>radius</b> instead and you get rings: <code>fract(r * N)</code>. Mix angle and radius and you get a <b>spiral</b>:</p>
<pre class="code">float s = fract(a / TAU + r * twist);</pre>
<p>Moving outward (r grows) shifts the angle pattern → the stripes wind around.</p>`,
          controls: [{ name: 'k', label: 'twist', min: 0, max: 10, step: 0.5, value: 4 }],
          shader: (v) => S('vec2 p = uv - 0.5;\nfloat a = atan(p.y, p.x);\nfloat r = length(p);\ncol = vec3(step(0.5, fract(a / TAU * 3.0 + r * uK)));', { uK: v.k }),
          code: (v) => `col = vec3(step(0.5, fract(a / TAU * 3.0 + r * ${f(v.k, 1)})));${v.k === 0 ? ' // twist 0 → straight rays' : ''}`,
        },
      ],
      games: [
        {
          id: 'polar-num', title: 'Angle & radius', engine: 'numeric', rounds: 6,
          blurb: 'Compute angle (in degrees) or radius of a point.',
          gen: (rng, level) => {
            const kind = level === 1 ? 'deg' : level === 2 ? rng.pick(['deg', 'deg', 'rad']) : rng.pick(['deg', 'turn', 'rad']);
            if (kind === 'rad') {
              const [a, b, c] = rng.pick([[0.3, 0.4, 0.5], [0.24, 0.32, 0.4], [0.18, 0.24, 0.3], [0.12, 0.16, 0.2], [0.15, 0.2, 0.25]]);
              const p = rng.chance() ? [a * rng.sign(), b * rng.sign()] : [b * rng.sign(), a * rng.sign()];
              return { prompt: 'What is <code>r</code>?', code: `vec2 p = vec2(${f(p[0], 2)}, ${f(p[1], 2)});\nfloat r = length(p);`, answer: c, explain: `<p>sqrt(${N(p[0])}² + ${N(p[1])}²) = <b>${N(c)}</b>. Radius ignores direction.</p>` };
            }
            const steps = level === 1 ? [0, 90, 180, -90] : [0, 45, 90, 135, 180, -45, -90, -135];
            const deg = rng.pick(steps);
            const L = rng.pick([0.2, 0.3, 0.4]);
            const p = [r2(L * Math.cos((deg * Math.PI) / 180)), r2(L * Math.sin((deg * Math.PI) / 180))].map((x) => (Math.abs(x) < 1e-9 ? 0 : x));
            const real = r2((Math.atan2(p[1], p[0]) * 180) / Math.PI);
            const fromUv = level === 3;
            const pre = fromUv ? `// uv = (${f(r2(p[0] + 0.5), 2)}, ${f(r2(p[1] + 0.5), 2)})\nvec2 p = uv - 0.5;` : `vec2 p = vec2(${f(p[0], 2)}, ${f(p[1], 2)});`;
            if (kind === 'turn') {
              const t = r2(real / 360 + 0.5);
              return { prompt: 'What is <code>t</code>?', code: `${pre}\nfloat t = atan(p.y, p.x) / TAU + 0.5;`, answer: t, explain: `<p>p = (${N(p[0])}, ${N(p[1])}) points at ${real}°. In turns: ${real} / 360 = ${n(real / 360, 3)}, + 0.5 = <b>${n(t, 3)}</b>.</p>` };
            }
            return {
              prompt: 'What is the angle in <b>degrees</b>?', code: `${pre}\nfloat a = degrees(atan(p.y, p.x));`,
              sub: '0° = right, counter-clockwise is positive, range −180..180.',
              answer: real, tolerance: 0.6,
              explain: `<p>p = (${N(p[0])}, ${N(p[1])}) points ${dirName(real)} → <b>${real}°</b>. ${real < 0 ? 'Below the x axis angles are negative.' : ''}${Math.abs(real) === 180 ? ' Straight left is the seam: atan returns +180°.' : ''}</p>`,
            };
          },
        },
        {
          id: 'polar-tap', title: 'Find the polar point', engine: 'tap', rounds: 6,
          blurb: 'Given angle and radius, tap the spot.',
          gen: (rng, level) => {
            const steps = level === 1 ? [0, 90, 180, 270] : level === 2 ? [0, 45, 90, 135, 180, 225, 270, 315] : [30, 60, 120, 150, 210, 240, 300, 330, 45, 135];
            let deg = rng.pick(steps);
            if (deg > 180) deg -= 360;
            const r = rng.pick([0.1, 0.2, 0.3, 0.4]);
            const t = [0.5 + r * Math.cos((deg * Math.PI) / 180), 0.5 + r * Math.sin((deg * Math.PI) / 180)];
            const useRad = level === 3 && rng.chance(0.4);
            const radTxt = { 30: 'π/6', 60: 'π/3', 120: '2π/3', 150: '5π/6', [-150]: '−5π/6', [-120]: '−2π/3', [-60]: '−π/3', [-30]: '−π/6', 45: 'π/4', 135: '3π/4' }[deg];
            return {
              prompt: `Tap the point with <b>r = ${n(r)}</b> and <b>a = ${useRad && radTxt ? radTxt : deg + '°'}</b>.`,
              sub: 'Centre = (0.5, 0.5). Rings every 0.1, rays every 45°. 0° = right, counter-clockwise.',
              shader: S('col = vec3(0.08, 0.09, 0.13) + 0.35 * polarGrid(uv);'),
              target: t, radius: 0.04,
              explain: `<p>Start at the centre, face right (0°), turn ${deg >= 0 ? 'counter-clockwise' : 'clockwise'} by ${Math.abs(deg)}°, walk out ${r} (${Math.round(r * 10)} ring${r > 0.1 ? 's' : ''}).</p>`,
            };
          },
        },
        {
          id: 'polar-pick', title: 'Polar code ↔ image', engine: 'mcq', rounds: 8,
          blurb: 'Rays, rings, pies and spirals.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(step(0.5, fract(a / TAU * 4.0)));', why: '4 rays (white wedges): the angle repeated 4 times.' },
            { code: 'col = vec3(step(0.5, fract(a / TAU * 12.0)));', why: '12 thin rays.' },
            { code: 'col = vec3(step(0.5, fract(r * 6.0)));', why: 'Repeating the radius → concentric rings.' },
            { code: 'col = vec3(step(a / TAU + 0.5, 0.25));', why: 'Pie: white where t < 0.25 — a quarter, starting from the left going counter-clockwise (the bottom-left quarter).' },
            { code: 'col = vec3(r * 2.0);', why: 'Radius as brightness: black centre, bright corners.', lvl: 2 },
            { code: 'col = vec3(a / TAU + 0.5);', why: 'Angle as brightness: a sweep with a seam on the left.', lvl: 2 },
            { code: 'col = vec3(step(0.5, fract(a / TAU * 3.0 + r * 4.0)));', why: 'Angle + radius → a 3-armed spiral.', lvl: 3 },
            { code: 'col = vec3(step(0.5, fract(a / TAU * 4.0)) * step(r, 0.3));', why: 'Rays multiplied by a disc mask: 4 wedges only inside r < 0.3.', lvl: 3 },
          ], { prefix: 'vec2 p = uv - 0.5;\nfloat r = length(p);\nfloat a = atan(p.y, p.x);\n', dir: dir(rng) }),
        },
        {
          id: 'rays-match', title: 'Sunburst matcher', engine: 'slider', rounds: 4,
          blurb: 'Match the number of rays (and their width, and the twist).',
          gen: (rng, level) => {
            const nn = rng.int(3, 16), w = rng.step(0.2, 0.8, 0.1), k = rng.step(-6, 6, 1) || 3;
            const params = [{ name: 'n', label: 'N rays', min: 1, max: 20, step: 1, target: nn }];
            if (level >= 2) params.push({ name: 'w', label: 'threshold', min: 0.1, max: 0.9, step: 0.1, target: w });
            if (level === 3) params.push({ name: 'k', label: 'twist', min: -8, max: 8, step: 1, target: k });
            return {
              prompt: level === 1 ? 'How many rays? Match N.' : level === 2 ? 'Match the number of rays and their width.' : 'Match rays, width and twist.',
              sub: 'Count the white rays all the way around.',
              params,
              build: (p) => S('vec2 p = uv - 0.5;\nfloat t = atan(p.y, p.x) / TAU + length(p) * uK;\ncol = mix(vec3(1.0, 0.85, 0.3), vec3(0.6, 0.2, 0.1), step(uW, fract(t * uN)));', { uN: p.n, uW: p.w ?? 0.5, uK: (p.k ?? 0) / Math.max(1, p.n) }),
              code: (p) => `float t = atan(p.y, p.x) / TAU${p.k ? ` + r * ${f(p.k / Math.max(1, p.n), 2)}` : ''};\ncol = mix(yellow, brown, step(${f(p.w ?? 0.5, 1)}, fract(t * ${f(p.n)})));`,
              explain: `<p>Target: N = ${nn}${level >= 2 ? `, threshold ${N(w)}` : ''}${level === 3 ? `, twist ${k}` : ''}. Tip: count rays in one quarter and multiply by 4.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 6. radial repetition
    {
      id: 'patterns.radial',
      title: 'Radial repetition',
      blurb: 'Repeat a shape around the centre: flowers, gears, clock marks.',
      lesson: [
        {
          title: 'Copies around a circle',
          body: `<p>Tiling repeats a shape in a <b>grid</b>. Often we want copies around a <b>circle</b> instead: petals, clock ticks, gear teeth, a ring of lights.</p>
<p>The idea: chop the circle into N equal pie slices and make every slice show the <b>same</b> thing — exactly like fract chops a line into tiles.</p>`,
          controls: [{ name: 'n', label: 'N', min: 1, max: 16, step: 1, value: 6 }],
          shader: (v) => S('vec2 p = radRep(uv - 0.5, uN);\nfloat d = length(p - vec2(0.3, 0.0)) - 0.06;\ncol = vec3(0.1, 0.11, 0.16);\ncol = mix(col, vec3(1.0, 0.72, 0.3), 1.0 - smoothstep(-0.004, 0.004, d));', { uN: v.n }),
          code: (v) => `vec2 p = radRep(uv - 0.5, ${f(v.n)}); // repeat ${v.n}×\nfloat d = length(p - vec2(0.3, 0.0)) - 0.06; // ONE dot, drawn on the right`,
        },
        {
          title: 'How it works',
          body: `<p>Inside <code>radRep</code> (it's 4 lines):</p>
<pre class="code">float s = TAU / N;              // angle of one slice
float a = atan(p.y, p.x);       // this pixel's angle
a = mod(a + s * 0.5, s) - s * 0.5; // angle WITHIN its slice
p = length(p) * vec2(cos(a), sin(a)); // back to x, y</pre>
<ol><li>Slice size: a full turn divided by N.</li><li>Get the angle (polar).</li><li><code>mod</code> = fract for angles: every slice gets angles from −s/2 to +s/2, centred on 0 (pointing right).</li><li>Rebuild the point from radius + new angle. Now every pixel thinks it's in the slice on the right.</li></ol>
<p>Below: brightness = angle within the slice. Every slice is a copy of the one on the right.</p>`,
          controls: [{ name: 'n', label: 'N', min: 1, max: 12, step: 1, value: 5 }],
          shader: (v) => S('vec2 p = uv - 0.5;\nfloat s = TAU / uN;\nfloat a = atan(p.y, p.x);\na = mod(a + s * 0.5, s) - s * 0.5;\ncol = vec3(a / s + 0.5);\ncol = mix(col, vec3(1.0, 0.3, 0.3), 1.0 - smoothstep(0.004, 0.008, abs(p.y)) * step(0.0, p.x));', { uN: v.n }),
          code: (v) => `float s = TAU / ${f(v.n)}; // = ${f((2 * Math.PI) / v.n, 3)} rad = ${n(360 / v.n, 1)}°\na = mod(a + s * 0.5, s) - s * 0.5;\ncol = vec3(a / s + 0.5); // red line: angle 0, the slice we "draw in"`,
        },
        {
          title: 'Draw anything in the slice',
          body: `<p>After radRep, draw your shape <b>pointing right</b> (along +x). It appears N times.</p>
<p>A thin box pointing outward becomes petals, sun rays, clock ticks or gear teeth:</p>
<pre class="code">p = radRep(p, N);
float d = sdBox(p - vec2(0.25, 0.0), vec2(len, 0.03));</pre>`,
          controls: [
            { name: 'n', label: 'N', min: 2, max: 24, step: 1, value: 12 },
            { name: 'l', label: 'petal length', min: 0.02, max: 0.2, step: 0.01, value: 0.08 },
          ],
          shader: (v) => S('vec2 p = radRep(uv - 0.5, uN);\nfloat d = sdBox(p - vec2(0.3, 0.0), vec2(uL, 0.025)) - 0.01;\nd = min(d, length(uv - 0.5) - 0.12);\ncol = vec3(0.1, 0.11, 0.16);\ncol = mix(col, vec3(1.0, 0.72, 0.3), 1.0 - smoothstep(-0.004, 0.004, d));', { uN: v.n, uL: v.l }),
          code: (v) => `vec2 p = radRep(uv - 0.5, ${f(v.n)});\nfloat d = sdBox(p - vec2(0.3, 0.0), vec2(${f(v.l, 2)}, 0.025)) - 0.01;\nd = min(d, length(uv - 0.5) - 0.12); // + a centre disc (union!)`,
          quiz: { q: 'You draw a dot at (0.0, 0.3) instead of (0.3, 0.0) after radRep. With N = 6, what happens?', options: ['The dots are cut off — (0, 0.3) is outside the slice', 'Same result', 'You get 12 dots'], answer: 0, explain: 'Each slice only covers ±30° around "right". A point straight up is outside it, so the dot gets chopped by the slice borders. Always draw along +x.' },
        },
        {
          title: 'Which slice am I in?',
          body: `<p>Just like <code>floor</code> gave tile ids, we can number the slices:</p>
<pre class="code">float id = mod(floor((a + s * 0.5) / s), N); // 0 … N−1</pre>
<p>(The <code>mod</code> glues the two halves of the left slice together: atan jumps from +π to −π there.) Feed the id into a hash or a palette and every copy can look different.</p>`,
          controls: [{ name: 'n', label: 'N', min: 2, max: 16, step: 1, value: 8 }],
          shader: (v) => S('vec2 p = uv - 0.5;\nfloat s = TAU / uN;\nfloat a = atan(p.y, p.x);\nfloat id = mod(floor((a + s * 0.5) / s), uN);\nvec2 q = radRep(p, uN);\nfloat d = length(q - vec2(0.3, 0.0)) - 0.07;\ncol = hsv2rgb(vec3(hash(vec2(id, 1.0)), 0.5, 0.35));\ncol = mix(col, hsv2rgb(vec3(id / uN, 0.7, 1.0)), 1.0 - smoothstep(-0.004, 0.004, d));', { uN: v.n }),
          code: (v) => `float s = TAU / ${f(v.n)};\nfloat id = mod(floor((a + s * 0.5) / s), ${f(v.n)}); // 0 … ${v.n - 1}, 0 = the slice on the right\ncol = hsv2rgb(vec3(id / ${f(v.n)}, 0.7, 1.0));`,
        },
      ],
      games: [
        {
          id: 'radial-match', title: 'Ring of dots matcher', engine: 'slider', rounds: 4,
          blurb: 'Match how many copies, and how far out they sit.',
          gen: (rng, level) => {
            const nn = rng.int(3, 12), R = rng.step(0.15, 0.35, 0.05), s = rng.step(0.03, 0.09, 0.02);
            const params = [{ name: 'n', label: 'N copies', min: 1, max: 16, step: 1, target: nn }];
            if (level >= 2) params.push({ name: 'r', label: 'ring radius', min: 0.1, max: 0.4, step: 0.05, target: R });
            if (level === 3) params.push({ name: 's', label: 'dot size', min: 0.01, max: 0.11, step: 0.02, target: s });
            return {
              prompt: level === 1 ? 'Match the number of dots.' : 'Match the count and the layout.',
              sub: 'Grid lines every 0.1, centre at the bright cross.',
              params,
              build: (p) => S('vec2 q = radRep(uv - 0.5, uN);\nfloat d = length(q - vec2(uR, 0.0)) - uS;\ncol = mix(bgCol(uv), vec3(1.0, 0.72, 0.3), 1.0 - smoothstep(-0.004, 0.004, d));', { uN: p.n, uR: p.r ?? 0.3, uS: p.s ?? 0.06 }),
              code: (p) => `vec2 q = radRep(uv - 0.5, ${f(p.n)});\nfloat d = length(q - vec2(${f(p.r ?? 0.3, 2)}, 0.0)) - ${f(p.s ?? 0.06, 2)};`,
              explain: `<p>Target: ${nn} copies${level >= 2 ? `, at radius ${N(R)}` : ''}${level === 3 ? `, size ${N(s)}` : ''}. The first copy always sits on the right (angle 0).</p>`,
            };
          },
        },
        {
          id: 'radial-num', title: 'Slice maths', engine: 'numeric', rounds: 6,
          blurb: 'Slice sizes, slice ids and angles inside a slice (in degrees).',
          gen: (rng, level) => {
            const nn = rng.pick([3, 4, 5, 6, 8, 9, 10, 12]);
            const s = 360 / nn;
            const kind = level === 1 ? 'size' : level === 2 ? rng.pick(['size', 'id', 'id']) : rng.pick(['id', 'local', 'local']);
            if (kind === 'size') return { prompt: `With N = ${nn}, how many <b>degrees</b> is one slice?`, code: `float s = TAU / ${f(nn)}; // in radians`, answer: r2(s), tolerance: 0.6, explain: `<p>A full turn is 360°. 360 / ${nn} = <b>${n(s, 2)}°</b>. (In radians: 2π / ${nn} ≈ ${n((2 * Math.PI) / nn, 3)}.)</p>` };
            let ang; do { ang = rng.int(1, 35) * 10; } while (Math.abs(fr(ang / s) - 0) < 0.05 || Math.abs(fr(ang / s) - 1) < 0.05);
            if (kind === 'id') {
              const id = Math.floor(ang / s);
              return { prompt: 'Slices are numbered 0, 1, 2… counter-clockwise starting at 0° (right). Which slice is this pixel in?', code: `// pixel angle = ${ang}°, N = ${nn}\nfloat id = floor(angle / (360.0 / ${f(nn)}));`, answer: id, tolerance: 0.01, explain: `<p>Slice size = ${n(s, 2)}°. ${ang} / ${n(s, 2)} = ${n(ang / s, 2)} → floor → <b>${id}</b>.</p>` };
            }
            const local = r2(ang - Math.floor(ang / s) * s);
            return { prompt: 'How many degrees past the start of its slice is this pixel?', code: `// pixel angle = ${ang}°, N = ${nn}\nfloat local = mod(angle, 360.0 / ${f(nn)});`, answer: local, tolerance: 0.6, explain: `<p>Slice size ${n(s, 2)}°. ${ang} = ${Math.floor(ang / s)} × ${n(s, 2)} + <b>${n(local, 2)}</b>. mod keeps the remainder — the same job fract does for tiles. That's what radRep does (centred on 0 instead).</p>` };
          },
        },
        {
          id: 'radial-pick', title: 'Count the copies', engine: 'mcq', rounds: 8,
          blurb: 'Match radRep code to its image.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'p = radRep(p, 3.0);\nd = length(p - vec2(0.3, 0.0)) - 0.08;', why: '3 dots around the centre, the first pointing right.' },
            { code: 'p = radRep(p, 5.0);\nd = length(p - vec2(0.3, 0.0)) - 0.08;', why: '5 dots.' },
            { code: 'p = radRep(p, 8.0);\nd = length(p - vec2(0.3, 0.0)) - 0.05;', why: '8 smaller dots.' },
            { code: 'p = radRep(p, 6.0);\nd = length(p - vec2(0.15, 0.0)) - 0.06;', why: '6 dots close to the centre (radius 0.15).' },
            { code: 'p = radRep(p, 12.0);\nd = sdBox(p - vec2(0.3, 0.0), vec2(0.08, 0.015));', why: '12 thin bars pointing outward: clock ticks.', lvl: 2 },
            { code: 'p = radRep(p, 4.0);\nd = sdBox(p - vec2(0.25, 0.0), vec2(0.15, 0.05));', why: '4 fat arms → a plus/cross shape.', lvl: 2 },
            { code: 'p = radRep(p, 6.0);\nd = length(p - vec2(0.3, 0.0)) - 0.08;', why: '6 dots.', lvl: 3 },
            { code: 'p = radRep(p, 16.0);\nd = sdBox(p - vec2(0.3, 0.0), vec2(0.1, 0.02));', why: '16 rays: a sunburst.', lvl: 3 },
          ], { prefix: 'vec2 p = uv - 0.5;\nfloat d;\n', suffix: '\ncol = vec3(1.0 - smoothstep(-0.004, 0.004, d));', dir: dir(rng) }),
        },
      ],
    },
    // ================================================================== 7. mirroring
    {
      id: 'patterns.mirror',
      title: 'Mirroring & kaleidoscopes',
      blurb: 'abs() folds space: symmetry, seamless tiles, kaleidoscopes.',
      lesson: [
        {
          title: 'abs folds space',
          body: `<p>Centre the coordinates, then take <code>abs</code> of x:</p>
<pre class="code">vec2 p = uv - 0.5;
p.x = abs(p.x);</pre>
<p>A pixel on the left at x = −0.3 now gets 0.3 — the same value as its mirror twin on the right. So the left half becomes a <b>mirror copy</b> of the right half.</p>
<div class="analogy">📄 Fold a sheet of paper with wet paint on one side: the paint prints onto the other half. abs is the fold.</div>`,
          shaders: [
            { spec: S('col = texture2D(uTex, uv).rgb;', null, { textures: TEX('letterF', 'clamp') }), label: 'original' },
            { spec: S('vec2 p = uv - 0.5;\np.x = abs(p.x);\ncol = texture2D(uTex, p + 0.5).rgb;', null, { textures: TEX('letterF', 'clamp') }), label: 'p.x = abs(p.x)' },
          ],
          after: '<p class="small dim">Note: it\'s the <b>right</b> half (positive x) that gets copied onto the left — negative values are folded onto positive ones.</p>',
        },
        {
          title: 'Fold both axes',
          body: `<p><code>p = abs(p)</code> folds x and y: the top-right quarter is copied into all four quarters. 4-way symmetry for free.</p>
<p>Remember <code>sdBox</code> starts with <code>abs(p)</code>? It only has to describe one corner of the box — the fold makes the other three.</p>`,
          controls: [{ name: 'o', label: 'fold position', min: 0, max: 0.3, step: 0.01, value: 0 }],
          shaders: [
            { spec: (v) => S('vec2 p = uv - 0.5;\np.y = abs(p.y + uO) - uO;\ncol = texture2D(uTex, p + 0.5).rgb;', { uO: v.o }, { textures: TEX('letterF', 'clamp') }), label: 'abs on y' },
            { spec: (v) => S('vec2 p = uv - 0.5;\np = abs(p + uO) - uO;\ncol = texture2D(uTex, p + 0.5).rgb;', { uO: v.o }, { textures: TEX('letterF', 'clamp') }), label: 'abs on both' },
          ],
          code: (v) => `vec2 p = uv - 0.5;\np = abs(p${v.o ? ` + ${f(v.o, 2)}) - ${f(v.o, 2)}` : ')'}; // ${v.o ? 'fold line moved to −' + n(v.o) : 'fold lines through the centre'}\ncol = texture2D(uTex, p + 0.5).rgb;`,
          after: '<p class="small dim">Moving the fold: <code>abs(p + k) - k</code> mirrors around −k instead of 0.</p>',
        },
        {
          title: 'Mirrored tiling (no seams)',
          body: `<p>Plain <code>fract</code> tiling jumps from 1 back to 0 at every border — a visible <b>seam</b> if the edges of your tile don't match.</p>
<p>Fix: mirror every other tile. This "ping-pong" goes 0 → 1 → 0 → 1:</p>
<pre class="code">float tri = abs(fract(x * 0.5) * 2.0 - 1.0);  // triangle wave</pre>
<p>Or simply <code>1.0 - abs(fract(x) * 2.0 - 1.0)</code>-style variants. Compare the two graphs, then the textures.</p>`,
          controls: [{ name: 'n', label: 'tiles', min: 1, max: 5, step: 1, value: 3 }],
          graph: {
            fns: (v) => [
              { f: (x) => fr(x * v.n), label: 'fract', dash: [5, 4], color: '#888' },
              { f: (x) => Math.abs(fr(x * v.n * 0.5) * 2 - 1), label: 'mirrored' },
            ],
            opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 },
          },
          shaders: [
            { spec: (v) => S('col = texture2D(uTex, fract(uv * uN)).rgb;', { uN: v.n }, { textures: TEX('letterF', 'clamp') }), label: 'fract: jumps' },
            { spec: (v) => S('vec2 m = abs(fract(uv * uN * 0.5) * 2.0 - 1.0);\ncol = texture2D(uTex, m).rgb;', { uN: v.n }, { textures: TEX('letterF', 'clamp') }), label: 'mirrored: seamless' },
          ],
          after: '<div class="tip">Texture samplers can do this for you: wrap mode <b>Mirror</b> (Unity: <i>Mirror</i>, Unreal: <i>Mirror</i>, GL: <code>MIRRORED_REPEAT</code>).</div>',
        },
        {
          title: 'Kaleidoscope',
          body: `<p>Combine radial repetition with a mirror. After splitting the angle into slices, <code>abs</code> folds each slice in half:</p>
<pre class="code">float s = TAU / N;
a = abs(mod(a + s * 0.5, s) - s * 0.5); // mirror inside the slice
p = r * vec2(cos(a), sin(a));</pre>
<p>Now neighbouring slices are mirror images, so the edges always match — that's what a real kaleidoscope's mirrors do.</p>`,
          controls: [{ name: 'n', label: 'slices N', min: 2, max: 16, step: 1, value: 6 }],
          shader: (v) => S('vec2 p = uv - 0.5;\nfloat s = TAU / uN;\nfloat a = atan(p.y, p.x) + uTime * 0.1;\na = abs(mod(a + s * 0.5, s) - s * 0.5);\np = length(p) * vec2(cos(a), sin(a));\ncol = texture2D(uTex, p * 1.3 + vec2(0.2, 0.5)).rgb;', { uN: v.n }, { textures: TEX('photo', 'mirror') }),
          code: (v) => `float s = TAU / ${f(v.n)};\na = abs(mod(a + s * 0.5, s) - s * 0.5);\np = r * vec2(cos(a), sin(a));\ncol = texture2D(uTex, p * 1.3 + vec2(0.2, 0.5)).rgb;`,
          quiz: { q: 'What\'s the difference from plain radRep?', options: ['The abs() mirrors each slice, so neighbours are mirror images', 'Nothing', 'It has twice as many slices but no mirroring'], answer: 0, explain: 'radRep copies slices (rotational symmetry). The extra abs adds a mirror inside each slice (mirror symmetry) → kaleidoscope.' },
        },
      ],
      games: [
        {
          id: 'mirror-pick', title: 'Which fold?', engine: 'mcq', rounds: 8,
          blurb: 'The letter F tells you exactly how space was folded.',
          gen: (rng, level) => withOriginal(poolMcq(rng, level, [
            { code: '// no change', why: 'The original F.' },
            { code: 'p.x = abs(p.x);', why: 'Right half mirrored onto the left: two Fs back to back.' },
            { code: 'p.y = abs(p.y);', why: 'Top half mirrored onto the bottom.' },
            { code: 'p = abs(p);', why: 'Top-right quarter copied into all four quarters.' },
            { code: 'p.x = -p.x;', why: 'No abs, just a sign flip: the whole F is mirrored (it reads backwards).', lvl: 2 },
            { code: 'p.x = -abs(p.x);', why: 'abs then negate: the LEFT half is copied onto the right.', lvl: 2 },
            { code: 'p.y = -p.y;', why: 'Flipped upside down.', lvl: 3 },
            { code: 'p = abs(p) - 0.25;', why: 'Fold, then shift: four small quarter-F pieces arranged around the centre.', lvl: 3 },
          ], { prefix: 'vec2 p = uv - 0.5;\n', suffix: '\ncol = texture2D(uTex, p + 0.5).rgb;', extra: { textures: TEX('letterF', 'clamp') }, dir: 'i2c' })),
        },
        {
          id: 'mirror-gpu', title: 'Be the GPU: symmetry', engine: 'paint', rounds: 3,
          blurb: 'Rules using abs() — notice the symmetry as you paint.',
          gen: (rng, level) => {
            const W = 6;
            const c0 = safePaint(rng, () => {
              const k = rng.pick([0.15, 0.25, 0.3, 0.35]), k2 = rng.pick([0.2, 0.3, 0.4]);
              const R = level === 1
                ? [
                  { val: (u) => k - Math.abs(u - 0.5), code: `if (abs(uv.x - 0.5) > ${f(k)}) col = vec3(1.0);`, note: `abs(uv.x − 0.5) = distance from the vertical centre line. White further than ${k} on either side.` },
                  { val: (u, v) => Math.abs(v - 0.5) - k, code: `if (abs(uv.y - 0.5) < ${f(k)}) col = vec3(1.0);`, note: 'A horizontal band, symmetric around uv.y = 0.5.' },
                ]
                : level === 2 ? [
                  { val: (u, v) => Math.abs(u - 0.5) + Math.abs(v - 0.5) - k2 - 0.1, code: `if (abs(uv.x - 0.5) + abs(uv.y - 0.5) < ${f(k2 + 0.1)}) col = vec3(1.0);`, note: 'Sum of both distances → a diamond, symmetric in both axes.' },
                  { val: (u, v) => Math.abs(u - 0.5) - (v - 0.2), code: 'if (abs(uv.x - 0.5) < uv.y - 0.2) col = vec3(1.0);', note: 'A V shape (a cone opening upward), mirrored around the centre line.' },
                  { val: (u, v) => Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) - k, code: `vec2 p = abs(uv - 0.5);\nif (max(p.x, p.y) < ${f(k)}) col = vec3(1.0);`, note: 'abs on both axes + max → a centred square.' },
                ]
                  : [
                    { val: (u, v) => Math.abs(Math.abs(u - 0.5) - 0.25) - 0.1, code: 'float x = abs(abs(uv.x - 0.5) - 0.25);\nif (x < 0.1) col = vec3(1.0);', note: 'Fold, shift, fold again: two stripes at x = 0.25 and 0.75.' },
                    { val: (u, v) => Math.hypot(Math.abs(u - 0.5) - 0.25, v - 0.5) - k2, code: `vec2 p = uv - 0.5;\np.x = abs(p.x);\nif (length(p - vec2(0.25, 0.0)) < ${f(k2)}) col = vec3(1.0);`, note: 'One circle at x = +0.25 — the fold creates its twin at −0.25.' },
                    { val: (u, v) => Math.abs(fr(u * 1.5) * 2 - 1) - 0.5, code: 'float m = abs(fract(uv.x * 1.5) * 2.0 - 1.0);\nif (m < 0.5) col = vec3(1.0);', note: 'Triangle wave: goes 1 → 0 → 1 across each repeat; white where it dips below 0.5.' },
                  ];
              return rng.pick(R);
            }, W, W, 0.03);
            return { prompt: 'Paint what this shader outputs:', code: c0.code, w: W, h: W, palette: BW, showUV: true, solve: (u, v) => +(c0.val(u, v) < 0), explain: `<p>${c0.note}</p><p>Notice: your painting is mirror-symmetric. abs() did that.</p>` };
          },
        },
        {
          id: 'mirror-num', title: 'Folding numbers', engine: 'numeric', rounds: 6,
          blurb: 'Compute abs folds and triangle waves.',
          gen: (rng, level) => {
            const kind = level === 1 ? 'abs' : level === 2 ? rng.pick(['abs', 'tri']) : rng.pick(['tri', 'shift']);
            if (kind === 'abs') {
              const u = rng.step(0.05, 0.95, 0.05);
              const a = r2(Math.abs(u - 0.5));
              return { prompt: 'What is <code>x</code>?', code: `// uv.x = ${f(u, 2)}\nfloat x = abs(uv.x - 0.5);`, answer: a, explain: `<p>${N(u)} − 0.5 = ${N(u - 0.5)} → abs → <b>${N(a)}</b>. uv.x = ${N(1 - u)} would give the same: that's the mirror.</p>` };
            }
            if (kind === 'tri') {
              const x = r2(rng.int(0, 3) + rng.step(0.1, 0.9, 0.1));
              const fx = r2(fr(x)), t = r2(Math.abs(fx * 2 - 1));
              return { prompt: 'What is <code>m</code>?', code: `float x = ${f(x, 2)};\nfloat m = abs(fract(x) * 2.0 - 1.0);`, answer: t, explain: `<p>fract(${N(x)}) = ${N(fx)} → × 2 − 1 = ${N(fx * 2 - 1)} → abs → <b>${N(t)}</b>.</p><p>This wave is 1 at tile edges and 0 in the middle, and never jumps.</p>` };
            }
            const p = rng.step(-0.45, 0.45, 0.05), k = rng.pick([0.1, 0.2, 0.25]);
            const a = r2(Math.abs(p) - k);
            return { prompt: 'What is <code>x</code>?', code: `float px = ${f(p, 2)};\nfloat x = abs(px) - ${f(k, 2)};`, answer: a, explain: `<p>abs(${N(p)}) = ${N(Math.abs(p))}, − ${N(k)} = <b>${N(a)}</b>. Fold, then shift: a shape drawn at x = ${N(k)} appears on both sides.</p>` };
          },
        },
      ],
    },
  ],
};

function dirName(deg) {
  return { 0: 'right', 45: 'up-right', 90: 'up', 135: 'up-left', 180: 'left', [-180]: 'left', [-45]: 'down-right', [-90]: 'down', [-135]: 'down-left' }[Math.round(deg)] || 'that way';
}
