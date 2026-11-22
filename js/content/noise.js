// Topic — Noise: controlled randomness for organic looks.
import { tf, q, distinct, f, G, h, shaderView } from './_kit.js';

// ---------------------------------------------------------------- JS mirrors (for graphs & answers)
// A double-precision 1D hash, only used for drawing illustrative graphs.
const rnd1 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fade = (t) => t * t * (3 - 2 * t);
/** 1D value noise. mode 0 = blocky, 1 = linear, 2 = smooth fade */
const vn1 = (x, mode = 2) => {
  const i = Math.floor(x), t = x - i, a = rnd1(i), b = rnd1(i + 1);
  const u = mode === 0 ? 0 : mode === 1 ? t : fade(t);
  return a + (b - a) * u;
};
/** 1D gradient noise around 0.5 */
const gn1 = (x) => {
  const i = Math.floor(x), t = x - i;
  const ga = rnd1(i) * 2 - 1, gb = rnd1(i + 1) * 2 - 1;
  const a = ga * t, b = gb * (t - 1);
  return 0.5 + (a + (b - a) * fade(t));
};
const fbm1 = (x, oct) => { let v = 0, a = 0.5, s = 0; for (let i = 0; i < oct; i++) { v += a * vn1(x); s += a; x *= 2; a *= 0.5; } return v / s; };
const r2 = (x) => Math.round(x * 100) / 100;
/** codefill: preview starts with a WRONG token so the answer isn't given away */
const noPeek = (slots) => slots.map((sl) => ({ ...sl, placeholder: sl.options.find((o) => o !== sl.answer) }));

// ---------------------------------------------------------------- shared GLSL helpers
// value noise with a selectable interpolation: m 0 = blocky, 1 = linear, 2 = smooth
const VN_MODE = `
float vnM(vec2 p, float m){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = m < 0.5 ? vec2(0.0) : (m < 1.5 ? f : f * f * (3.0 - 2.0 * f));
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gridLine(vec2 p){ vec2 g = abs(fract(p + 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }`;

// fBm with a controllable number of octaves / lacunarity / gain.
const FBM_N = `
float fbmRaw(vec2 p, float oct, float lac, float gain){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 8; i++){
    if (float(i) >= oct) break;
    v += a * vnoise(p); p *= lac; a *= gain;
  }
  return v;
}
float fbmN(vec2 p, float oct, float lac, float gain){
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 8; i++){ if (float(i) >= oct) break; s += a; a *= gain; }
  return fbmRaw(p, oct, lac, gain) / s;
}`;

// Voronoi returning (F1, F2, random id of nearest cell). jit 0 = regular grid, 1 = fully random.
const VOR = `
vec3 vor(vec2 p, float jit){
  vec2 i = floor(p); vec2 f = fract(p);
  float d1 = 8.0; float d2 = 8.0; float id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.5 + jit * (hash2(i + g) - 0.5);
    float d = length(g + o - f);
    if (d < d1){ d2 = d1; d1 = d; id = hash(i + g); }
    else if (d < d2){ d2 = d; }
  }
  return vec3(d1, d2, id);
}`;

// Distance to 8 explicit points (uniforms uP0..uP7) — used where JS must know the exact answer.
const PTS = `
void tryP(vec2 p, vec2 q, inout float d1, inout float d2, inout float id, float k){
  float d = length(p - q);
  if (d < d1){ d2 = d1; d1 = d; id = k; } else if (d < d2){ d2 = d; }
}`;
const PTS_BODY = `float d1 = 9.0; float d2 = 9.0; float id = 0.0;
tryP(uv, uP0, d1, d2, id, 0.0); tryP(uv, uP1, d1, d2, id, 1.0);
tryP(uv, uP2, d1, d2, id, 2.0); tryP(uv, uP3, d1, d2, id, 3.0);
tryP(uv, uP4, d1, d2, id, 4.0); tryP(uv, uP5, d1, d2, id, 5.0);
tryP(uv, uP6, d1, d2, id, 6.0); tryP(uv, uP7, d1, d2, id, 7.0);
`;
/** 8 random points with a minimum spacing */
function scatter(rng, minD = 0.2) {
  const pts = [];
  for (let tries = 0; pts.length < 8 && tries < 2000; tries++) {
    const p = [r2(rng.float(0.08, 0.92)), r2(rng.float(0.08, 0.92))];
    if (pts.every((q2) => Math.hypot(p[0] - q2[0], p[1] - q2[1]) >= minD)) pts.push(p);
  }
  while (pts.length < 8) pts.push([r2(rng.float(0.05, 0.95)), r2(rng.float(0.05, 0.95))]);
  return pts;
}
const ptsUniforms = (pts) => Object.fromEntries(pts.map((p, i) => ['uP' + i, p]));
const f1f2 = (pts, u, v) => {
  const d = pts.map((p) => Math.hypot(u - p[0], v - p[1])).sort((a, b) => a - b);
  return [d[0], d[1]];
};

// The "zoo" of noise kinds, for recognition games.
const ZOO = {
  white: { name: 'White noise (hash per pixel)', frag: (s) => `col = vec3(hash(floor(uv * 160.0) + ${f(s)}));` },
  cells: { name: 'Random value per cell (blocky)', frag: (s, k) => `col = vec3(hash(floor(uv * ${f(k)}) + ${f(s)}));` },
  value: { name: 'Value noise', frag: (s, k) => `col = vec3(vnoise(uv * ${f(k)} + ${f(s)}));` },
  gradient: { name: 'Gradient (Perlin-style) noise', frag: (s, k) => `col = vec3(gnoise(uv * ${f(k)} + ${f(s)}));` },
  fbm: { name: 'fBm (several octaves)', frag: (s, k) => `col = vec3(fbm(uv * ${f(k * 0.6)} + ${f(s)}));` },
  voronoi: { name: 'Voronoi / cellular', frag: (s, k) => `col = vec3(voronoi(uv * ${f(k)} + ${f(s)}));` },
  warp: { name: 'Domain-warped fBm', frag: (s, k) => `vec2 p = uv * ${f(k * 0.5)} + ${f(s)};\nvec2 w = vec2(fbm(p), fbm(p + 5.2));\ncol = vec3(fbm(p + 3.0 * w));` },
};

export default {
  id: 'noise',
  title: 'Noise',
  icon: '🌫️',
  blurb: 'Controlled randomness: hashes, value & gradient noise, fBm, Voronoi and warping.',
  cheatsheet: `
<p><b>Hash</b>: turns a position into a pseudo-random number in 0..1. Same input → same output, always.</p>
<pre class="code">float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
hash(floor(uv * 8.0));   // one random value per cell (8×8 grid)</pre>
<p><b>Value noise</b>: random values on grid corners, blended with the fade curve <code>f*f*(3.0-2.0*f)</code>.</p>
<p><b>Gradient noise</b>: random <i>directions</i> on corners, <code>dot(gradient, offset)</code>, then blended. Less blocky.</p>
<p><b>Frequency</b>: <code>noise(uv * k)</code> → k grid cells across. Bigger k = smaller features.</p>
<pre class="code">// fBm: octaves of noise
float v = 0.0, a = 0.5;
for (int i = 0; i < 5; i++) {
  v += a * vnoise(p);
  p *= 2.0;   // lacunarity: frequency multiplier
  a *= 0.5;   // gain: amplitude multiplier
}</pre>
<p><b>Voronoi</b>: distance to the nearest random point (one per cell, check 3×3 neighbours). <b>F2−F1</b> → cracks.</p>
<p><b>Masks</b>: <code>step(t, n)</code> / <code>smoothstep(t-w, t+w, n)</code>. <b>Warping</b>: <code>noise(p + k * noise2(p))</code>.</p>`,
  concepts: [
    // ================================================================== HASH
    {
      id: 'noise.hash',
      title: 'Randomness from a hash',
      blurb: 'Shaders have no random(). A hash turns a position into a repeatable "random" number.',
      lesson: [
        {
          title: 'There is no random()',
          body: `<p>In a normal script you'd call <code>random()</code>. GLSL has <b>no random function</b>. Why not?</p>
<ul><li>Every pixel runs <b>independently</b> and at the same time — there's no shared "dice" they could take turns rolling.</li>
<li>A shader has <b>no memory</b> — a random value would change every frame and flicker like TV static.</li></ul>
<p>What we want instead: a number that <i>looks</i> random, but is <b>always the same</b> for the same position.</p>
<div class="analogy">📖 <b>Analogy:</b> instead of rolling a die, you look your seat number up in a big book of scrambled numbers. Seat 17 always gets the same number — but nobody could guess it from the seat number.</div>`,
          shader: { frag: 'col = vec3(hash(floor(uv * 160.0)));' },
          code: '// every pixel looks up a "random" grey from its own position\ncol = vec3(hash(floor(uv * 160.0)));',
        },
        {
          title: 'A hash is a number scrambler',
          body: `<p>A <b>hash</b> function takes an input and scrambles it so badly that neighbouring inputs give unrelated outputs.</p>
<p>The classic shader trick: take <code>sin(x)</code> (a smooth wave), <b>multiply by a huge number</b>, then keep only the part after the decimal point with <code>fract()</code>.</p>
<p>Drag the multiplier. With a small one you still see the wave. With a huge one, tiny changes of x make wild jumps — it looks random.</p>`,
          controls: [{ name: 'm', label: 'multiplier = 10^s', min: 0, max: 4.6, step: 0.1, value: 0.5 }],
          graph: {
            fns: (v) => [{ f: (x) => { const y = Math.sin(x) * Math.pow(10, v.m); return y - Math.floor(y); }, label: 'fract(sin(x) * m)' }],
            opts: { xmin: 0, xmax: 6, ymin: -0.05, ymax: 1.05 },
          },
          code: (v) => `float m = ${f(Math.pow(10, v.m), 1)};\nfloat r = fract(sin(x) * m);\n// real hash uses m ≈ 43758.5453`,
          after: '<div class="note">It isn\'t truly random — it\'s <b>pseudo-random</b>: a fixed formula that just looks messy. That\'s exactly what we need.</div>',
        },
        {
          title: 'Same input → same output',
          body: `<p>The prelude gives you <code>hash(vec2 p)</code>. It mixes x and y with a <code>dot</code>, then scrambles:</p>
<pre class="code">float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}</pre>
<p>Because it's a formula, it's <b>deterministic</b>: the pattern below never flickers. To get a <i>different</i> pattern, change the input — e.g. add a <b>seed</b>. Slide the seed away and back: the old pattern returns exactly.</p>`,
          controls: [{ name: 's', label: 'seed', min: 0, max: 5, step: 1, value: 0 }],
          shader: (v) => ({ frag: 'col = vec3(hash(floor(uv * 8.0) + uSeed));', uniforms: { uSeed: v.s } }),
          code: (v) => `vec2 cell = floor(uv * 8.0);\ncol = vec3(hash(cell + ${f(v.s)})); // seed ${v.s}`,
          quiz: { q: 'You render the same frame twice with the same hash code. The noise will…', options: ['Be identical both times', 'Be different each time', 'Flicker randomly'], answer: 0, explain: 'A hash is a pure formula of its input. Same input, same output — no flicker.' },
        },
        {
          title: 'Per pixel vs per cell',
          body: `<p>What you <b>feed</b> the hash decides what the randomness looks like:</p>
<ul><li><code>hash(uv)</code> — every pixel has a different uv → every pixel is random → <b>white noise</b> (static).</li>
<li><code>hash(floor(uv * N))</code> — <code>floor</code> makes all pixels in a cell share the same id (you know this from tiling!) → <b>one random value per cell</b>.</li></ul>
<p>Slide N: from a few big random tiles to (almost) per-pixel noise.</p>`,
          controls: [{ name: 'n', label: 'N (cells across)', min: 2, max: 64, step: 1, value: 6 }],
          shader: (v) => ({ frag: 'vec2 id = floor(uv * uN);\ncol = vec3(hash(id));', uniforms: { uN: v.n } }),
          code: (v) => `vec2 id = floor(uv * ${f(v.n)}); // ${v.n}×${v.n} cells\ncol = vec3(hash(id));`,
        },
        {
          title: 'Random colours & choices',
          body: `<p>Need more than one random number per cell? Hash slightly different inputs: <code>id</code>, <code>id + 7.0</code>, <code>id + 13.0</code>… each gives an unrelated value.</p>
<p>Use them for anything: a random colour, a random rotation, "is there a flower in this tile?" (<code>step(0.7, hash(id))</code>)…</p>`,
          controls: [{ name: 'p', label: 'chance threshold', min: 0, max: 1, step: 0.05, value: 0.6 }],
          shader: (v) => ({ frag: 'vec2 id = floor(uv * 6.0);\nvec3 rc = vec3(hash(id), hash(id + 7.0), hash(id + 13.0));\nfloat on = step(uP, hash(id + 31.0));\ncol = rc * on;', uniforms: { uP: v.p } }),
          code: (v) => `vec2 id = floor(uv * 6.0);\nvec3 rc = vec3(hash(id), hash(id + 7.0), hash(id + 13.0));\nfloat on = step(${f(v.p, 2)}, hash(id + 31.0)); // ~${Math.round((1 - v.p) * 100)}% of tiles on\ncol = rc * on;`,
          after: '<div class="tip">💡 Unity Shader Graph: <b>Random Range</b> node is a hash like this. Unreal: there\'s no single node; people use a custom HLSL <code>frac(sin(dot(...)))</code> or a small noise texture.</div>',
          quiz: { q: 'Why do all pixels in one cell get the same random value with <code>hash(floor(uv * 6.0))</code>?', options: ['floor() gives them all the same integer cell id, so the hash input is identical', 'hash() averages the pixels of a cell', 'The GPU caches the first pixel\'s result'], answer: 0, explain: 'Same input → same output. floor() makes the input identical across the whole cell.' },
        },
      ],
      games: [
        {
          id: 'pixel-or-cell', title: 'Code → randomness', engine: 'mcq', rounds: 8,
          blurb: 'Read the hash code and pick the picture it makes.',
          gen: (rng, level) => {
            const Ns = level === 1 ? [3, 6] : level === 2 ? [3, 4, 6, 10] : [4, 5, 6, 8, 12];
            const makers = [
              () => ({ code: 'col = vec3(hash(uv));', key: 'white' }),
              () => { const N = rng.pick(Ns); return { code: `col = vec3(hash(floor(uv * ${f(N)})));`, key: 'cell' + N }; },
              () => { const N = rng.pick(Ns); return { code: `col = vec3(hash(vec2(floor(uv.x * ${f(N)}), 0.0)));`, key: 'col' + N }; },
              () => { const N = rng.pick(Ns); return { code: `col = vec3(hash(vec2(0.0, floor(uv.y * ${f(N)}))));`, key: 'row' + N }; },
              () => { const N = rng.pick(Ns); return { code: `vec2 id = floor(uv * ${f(N)});\ncol = vec3(hash(id), hash(id + 7.0), hash(id + 13.0));`, key: 'rgb' + N }; },
              () => { const N = rng.pick(Ns); return { code: `vec2 id = floor(uv * ${f(N)});\ncol = vec3(step(0.5, hash(id)));`, key: 'bw' + N }; },
            ];
            const pool = level === 1 ? makers.slice(0, 3) : makers;
            const ans = rng.pick(pool)();
            const opts = distinct(rng, ans, () => rng.pick(pool)(), 4, (x) => x.key);
            return {
              prompt: 'Which image does this code produce?',
              code: ans.code,
              options: opts.map((o) => ({ shader: { frag: o.code } })),
              explain: '<p>Ask: <b>what goes into the hash?</b> Plain <code>uv</code> = different for every pixel → static. <code>floor(uv * N)</code> = same for a whole cell → N×N tiles. Only <code>uv.x</code> → columns, only <code>uv.y</code> → rows.</p>',
            };
          },
        },
        {
          id: 'cell-id', title: 'Which cell am I in?', engine: 'numeric', rounds: 6,
          blurb: 'Compute the cell id that a pixel feeds into the hash.',
          gen: (rng, level) => {
            const N = level === 1 ? rng.pick([2, 4, 10]) : level === 2 ? rng.pick([3, 4, 5, 8]) : rng.pick([3, 6, 7, 12]);
            const ix = rng.int(0, N - 1), iy = rng.int(0, N - 1);
            let u = r2((ix + rng.float(0.25, 0.75)) / N), vv = r2((iy + rng.float(0.25, 0.75)) / N);
            const id = [Math.floor(u * N), Math.floor(vv * N)];
            if (level === 3) {
              const s = rng.pick([1, 2, 3]);
              return {
                prompt: `A pixel at <b>uv = (${u}, ${vv})</b>. What exact input does the hash get?`,
                code: `vec2 id = floor(uv * ${f(N)});\nfloat r = hash(id + ${f(s)}); // ← input = id + ${f(s)}`,
                answer: [id[0] + s, id[1] + s], wrap: 'vec2', labels: ['x', 'y'],
                explain: `<p>uv × ${N} = (${r2(u * N)}, ${r2(vv * N)}) → floor → (${id[0]}, ${id[1]}) → plus seed ${s} → (${id[0] + s}, ${id[1] + s}). Every pixel in that cell sends the <b>same</b> input, so they all get the same random value.</p>`,
              };
            }
            return {
              prompt: `A pixel at <b>uv = (${u}, ${vv})</b>. Which cell id goes into the hash?`,
              code: `vec2 id = floor(uv * ${f(N)});\ncol = vec3(hash(id));`,
              answer: id, wrap: 'vec2', labels: ['x', 'y'],
              explain: `<p>uv × ${N} = (${r2(u * N)}, ${r2(vv * N)}). <code>floor</code> drops the decimals → <b>(${id[0]}, ${id[1]})</b>. All pixels of that cell share this id, so they share one random value.</p>`,
            };
          },
        },
        {
          id: 'match-grid', title: 'Match the random grid', engine: 'slider', rounds: 4,
          blurb: 'Find the cell counts (and seed) that reproduce the target exactly.',
          gen: (rng, level) => {
            const N = rng.int(2, 10), Ny = rng.int(2, 10), S = rng.int(0, 5);
            const params = [{ name: 'nx', label: level === 1 ? 'N' : 'N.x', min: 1, max: 12, step: 1, target: N }];
            if (level >= 2) params.push({ name: 'ny', label: 'N.y', min: 1, max: 12, step: 1, target: level === 2 ? Ny : N });
            if (level === 3) params.push({ name: 's', label: 'seed', min: 0, max: 5, step: 1, target: S });
            const get = (p) => [p.nx, p.ny ?? p.nx, p.s ?? 0];
            return {
              prompt: level === 1 ? 'Set N so the random tiles match the target.' : level === 2 ? 'Set the number of cells in x and y.' : 'Match cells AND the seed (the seed changes which random values appear).',
              sub: 'Count the tiles along the bottom edge and up the side.',
              params,
              build: (p) => { const [a, b, s] = get(p); return { frag: 'col = vec3(hash(floor(uv * uN) + uS));', uniforms: { uN: [a, b], uS: s } }; },
              code: (p) => { const [a, b, s] = get(p); return `vec2 id = floor(uv * vec2(${f(a)}, ${f(b)}));\ncol = vec3(hash(id + ${f(s)}));`; },
              tolerance: 0.02,
              explain: '<p>The pattern only matches when the inputs are <b>identical</b> — a hash gives a totally different value for even a slightly different input. That\'s also why a different seed gives a brand-new pattern.</p>',
            };
          },
        },
        {
          id: 'hash-facts', title: 'Hash: true or false?', engine: 'mcq', rounds: 8,
          blurb: 'Quick concept checks about pseudo-random numbers in shaders.',
          questions: [
            tf('GLSL has a built-in random() function.', false, 'No — that\'s why we build hashes from sin/fract or integer bit tricks.'),
            tf('A hash returns the same value every time for the same input.', true, 'Deterministic: that\'s what keeps the pattern stable from frame to frame.'),
            tf('<code>hash(uv)</code> gives one random value per grid cell.', false, 'uv is different for every pixel → per-pixel white noise. You need <code>floor(uv * N)</code> for cells.'),
            tf('Adding a constant (a seed) to the hash input gives a different random pattern.', true, 'Different input → unrelated output. <code>hash(id + 7.0)</code> is a fresh random value.'),
            tf('<code>fract(sin(x) * 43758.5)</code> is truly random.', false, 'It\'s pseudo-random: a fixed formula that just looks chaotic.'),
            tf('A hash makes neighbouring inputs give similar outputs.', false, 'The opposite: neighbouring inputs should give unrelated outputs. Smoothness comes later, from <i>noise</i> functions built on top of hashes.'),
            tf('To animate random tiles you can add <code>floor(uTime)</code> to the hash input.', true, 'The input changes once per second → every tile picks a new value once per second.', 2),
            tf('<code>hash(vec2(floor(uv.x * 5.0), 0.0))</code> makes 5 random vertical stripes.', true, 'Only x matters, so every pixel in a column shares the same input.', 2),
            q('You want ~20% of tiles to have a flower. Which test?', ['step(0.8, hash(id))', 'step(0.2, hash(id))', 'hash(id) * 0.2', 'fract(id * 0.2)'], 'hash is roughly uniform in 0..1, so it\'s ≥ 0.8 about 20% of the time.'),
            q('Why does <code>hash()</code> multiply by a huge number before <code>fract()</code>?', ['To make tiny input changes jump wildly in the output', 'To make the output bigger than 1', 'To make it smoother', 'GLSL requires it'], 'The huge factor amplifies small differences; fract keeps only the chaotic decimals.'),
            q('Two different random values for the same cell are best made by…', ['hash(id) and hash(id + 7.0)', 'hash(id) twice', 'hash(id) and hash(id) * 2.0', 'random(id)'], 'Different inputs give unrelated outputs. hash(id)*2 is not independent — it\'s just the same value scaled.', { level: 2 }),
            tf('A hash on the GPU can give slightly different results on different hardware.', true, 'The sin-based hash depends on float precision; that\'s why some engines prefer integer hashes or a noise texture.', 3),
          ],
        },
      ],
    },
    // ================================================================== VALUE NOISE
    {
      id: 'noise.value',
      title: 'Value noise',
      blurb: 'Random values on grid corners, smoothly blended in between.',
      lesson: [
        {
          title: 'From blocks to hills',
          body: `<p>Random tiles are blocky. Nature (clouds, rock, terrain) is <b>smooth but random</b>: hills, not staircases.</p>
<p>Idea: put a random value on each <b>grid point</b> (integer positions), then <b>blend</b> between neighbouring points.</p>
<p>Here's a 1D line. The dots are random heights at x = 0, 1, 2, …  Move the slider: <b>0 = blocky</b> (just hold the value), <b>1 = straight lines</b>, <b>2 = smooth fade</b>.</p>`,
          controls: [{ name: 'm', label: 'blend: 0 blocky · 1 linear · 2 smooth', min: 0, max: 2, step: 1, value: 0 }],
          graph: {
            fns: (v) => [{ f: (x) => vn1(x, v.m), label: ['blocky', 'linear', 'smooth'][v.m] }],
            opts: { xmin: 0, xmax: 8, ymin: -0.05, ymax: 1.05, points: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: i, y: rnd1(i), color: '#ff7ab2', r: 4 })) },
          },
          code: (v) => `float i = floor(x);       // grid point on the left\nfloat t = fract(x);       // 0..1 position between points\nfloat a = hash1(i), b = hash1(i + 1.0);\n${['float y = a;                      // hold', 'float y = mix(a, b, t);           // straight line', 'float y = mix(a, b, t*t*(3.0-2.0*t)); // smooth'][v.m]}`,
        },
        {
          title: 'Why the smooth fade?',
          body: `<p>With <b>linear</b> blending, the slope jumps suddenly at every grid point — you get sharp <b>creases</b>. In 2D those creases look like a visible grid of diamonds.</p>
<p>The fade curve <code>t*t*(3.0 - 2.0*t)</code> (that's just <code>smoothstep(0,1,t)</code>!) is <b>flat at both ends</b>, so segments join without a kink.</p>
<p>Drag t and compare the two numbers.</p>`,
          controls: [{ name: 't', label: 't', min: 0, max: 1, step: 0.01, value: 0.25 }],
          graph: {
            fns: () => [{ f: (x) => x, label: 'linear: t' }, { f: fade, label: 'fade: t*t*(3-2t)' }],
            opts: (v) => ({ xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05, vlines: [{ x: v.t, color: '#888' }], points: [{ x: v.t, y: v.t, color: '#ffd479' }, { x: v.t, y: fade(v.t), color: '#6bdfff' }] }),
          },
          code: (v) => `t          = ${f(v.t, 2)}\nfade(t)    = ${f(v.t, 2)} * ${f(v.t, 2)} * (3.0 - 2.0 * ${f(v.t, 2)}) = ${f(fade(v.t), 3)}`,
          after: '<div class="note">Near 0 and 1 the fade barely moves (flat ends). In the middle it moves faster. Flat ends = no creases.</div>',
        },
        {
          title: 'Now in 2D: four corners',
          body: `<p>In 2D each grid cell has <b>4 corners</b>, each with a random value. A pixel blends them in two steps:</p>
<ol><li>blend bottom-left ↔ bottom-right using x,</li><li>blend top-left ↔ top-right using x,</li><li>blend those two results using y.</li></ol>
<p>That's <b>bilinear</b> blending — the same thing a texture does between texels. Compare the three blend modes (grid lines in red):</p>`,
          controls: [
            { name: 'm', label: 'blend: 0 blocky · 1 linear · 2 smooth', min: 0, max: 2, step: 1, value: 1 },
            { name: 'g', label: 'show grid', min: 0, max: 1, step: 1, value: 1 },
          ],
          shader: (v) => ({ defs: VN_MODE, frag: 'vec2 p = uv * 5.0;\ncol = vec3(vnM(p, uM));\ncol = mix(col, vec3(1.0, 0.2, 0.3), gridLine(p) * uG);', uniforms: { uM: v.m, uG: v.g } }),
          code: (v) => `vec2 p = uv * 5.0;\nvec2 i = floor(p), f = fract(p);\nvec2 u = ${['vec2(0.0); // no blending', 'f;         // linear', 'f*f*(3.0-2.0*f); // smooth fade'][v.m]}\nfloat bottom = mix(hash(i),              hash(i + vec2(1,0)), u.x);\nfloat top    = mix(hash(i + vec2(0,1)),  hash(i + vec2(1,1)), u.x);\ncol = vec3(mix(bottom, top, u.y));`,
          after: '<div class="tip">With linear blending, look for the star/diamond shapes along grid lines. The smooth fade hides them.</div>',
        },
        {
          title: 'The whole function',
          body: `<p>The prelude's <code>vnoise(p)</code> is exactly this. Use it like any function: give it a position, get a smooth value in 0..1.</p>
<p>Notice the result is still a bit "grid-aligned": bright and dark spots sit on grid points. The next concept fixes that.</p>`,
          shader: { frag: 'col = vec3(vnoise(uv * 6.0));' },
          code: `float vnoise(vec2 p){
  vec2 i = floor(p);                 // which cell
  vec2 f = fract(p);                 // where inside it (0..1)
  vec2 u = f * f * (3.0 - 2.0 * f);  // smooth fade
  return mix(mix(hash(i),               hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
col = vec3(vnoise(uv * 6.0));`,
          quiz: { q: 'At an exact grid point (f = 0), what does value noise return?', options: ['Exactly that corner\'s hash value', 'Always 0.5', 'The average of 4 corners'], answer: 0, explain: 'u = 0 → mix picks the first value → hash(i). Value noise passes exactly through the random corner values.' },
        },
      ],
      games: [
        {
          id: 'which-blend', title: 'Blocky, linear or smooth?', engine: 'mcq', rounds: 8,
          blurb: 'Identify how the random corner values were blended.',
          gen: (rng, level) => {
            const k = rng.int(3, 7), s = rng.int(0, 40);
            const kinds = [
              { name: 'Blocky (no blending)', m: 0 },
              { name: 'Linear blending', m: 1 },
              { name: 'Smooth fade blending', m: 2 },
            ];
            const extra = [{ name: 'White noise (per pixel)', white: true }, { name: 'Gradient noise', grad: true }];
            const pool = level === 1 ? kinds : level === 2 ? [...kinds, extra[0]] : [...kinds, ...extra];
            const ans = rng.pick(level === 3 ? pool : kinds);
            const opts = distinct(rng, ans, () => rng.pick(pool), Math.min(4, pool.length), (x) => x.name);
            const frag = ans.white ? `col = vec3(hash(floor(uv * 150.0) + ${f(s)}));` : ans.grad ? `col = vec3(gnoise(uv * ${f(k)} + ${f(s)}));` : `col = vec3(vnM(uv * ${f(k)} + ${f(s)}, ${f(ans.m)}));`;
            return {
              prompt: 'How were the random values blended here?',
              shader: { defs: VN_MODE, frag },
              options: opts.map((o) => o.name),
              explain: '<p><b>Blocky</b>: flat squares. <b>Linear</b>: smooth-ish but with sharp creases and diamond/star shapes along the grid. <b>Smooth fade</b>: soft blobs, no creases. <b>Gradient noise</b> looks softer still and less grid-aligned.</p>',
            };
          },
        },
        {
          id: 'fade-math', title: 'Fade by hand', engine: 'numeric', rounds: 6,
          blurb: 'Compute the fade curve and the blended noise value.',
          gen: (rng, level) => {
            const t = rng.pick([0.25, 0.5, 0.75, 0.1, 0.9]);
            const ft = fade(t);
            if (level === 1) {
              return {
                prompt: `Compute the fade curve at <b>t = ${t}</b>.`,
                code: `float u = t * t * (3.0 - 2.0 * t);`,
                answer: +ft.toFixed(4), tolerance: 0.011,
                explain: `<p>${t} × ${t} = ${+(t * t).toFixed(4)} ; 3 − 2×${t} = ${3 - 2 * t} ; product = <b>${ft.toFixed(4)}</b>. Compare with linear t = ${t}: the fade is ${ft < t ? 'smaller (slower start)' : ft > t ? 'bigger (it catches up near the end)' : 'the same at the midpoint'}.</p>`,
              };
            }
            const a = rng.pick([0, 0.2, 0.4, 0.6]), b = rng.pick([0.8, 1, 0.2, 0.4].filter((x) => x !== a));
            if (level === 2) {
              const ans = a + (b - a) * ft;
              return {
                prompt: `1D value noise. Left grid point has <b>a = ${a}</b>, right has <b>b = ${b}</b>. The pixel is at <b>t = ${t}</b> between them. What value?`,
                code: `float u = t * t * (3.0 - 2.0 * t);\nfloat n = mix(a, b, u);`,
                answer: +ans.toFixed(4), tolerance: 0.011,
                explain: `<p>u = fade(${t}) = ${ft.toFixed(4)}. mix(${a}, ${b}, u) = ${a} + (${b} − ${a}) × ${ft.toFixed(4)} = <b>${ans.toFixed(4)}</b>.</p>`,
              };
            }
            // level 3: 2D, four corners
            const c = [rng.pick([0, 0.2, 0.4]), rng.pick([0.6, 0.8, 1]), rng.pick([0.2, 0.4, 0.6]), rng.pick([0, 0.8, 1])];
            const tx = rng.pick([0.5, 0.25, 0.75]), ty = rng.pick([0.5, 0, 1]);
            const ux = fade(tx), uy = fade(ty);
            const bottom = c[0] + (c[1] - c[0]) * ux, top = c[2] + (c[3] - c[2]) * ux;
            const ans = bottom + (top - bottom) * uy;
            return {
              prompt: `2D value noise. Corners: bottom-left <b>${c[0]}</b>, bottom-right <b>${c[1]}</b>, top-left <b>${c[2]}</b>, top-right <b>${c[3]}</b>. Pixel at f = (${tx}, ${ty}). Value?`,
              code: `vec2 u = f * f * (3.0 - 2.0 * f);\nfloat bottom = mix(BL, BR, u.x);\nfloat top    = mix(TL, TR, u.x);\nfloat n      = mix(bottom, top, u.y);`,
              answer: +ans.toFixed(4), tolerance: 0.011,
              explain: `<p>u = (${ux.toFixed(4)}, ${uy.toFixed(4)}). bottom = ${bottom.toFixed(4)}, top = ${top.toFixed(4)}, result = <b>${ans.toFixed(4)}</b>. (fade(0) = 0, fade(0.5) = 0.5, fade(1) = 1 — handy shortcuts.)</p>`,
            };
          },
        },
        {
          id: 'build-vnoise', title: 'Build value noise', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the missing pieces of a value noise function.',
          gen: (rng, level) => {
            const k = rng.int(3, 8);
            const variants = [
              {
                lvl: 1,
                template: 'vec2 i = floor(p);\nvec2 f = fract(p);\nvec2 u = f * f * (3.0 - 2.0 * f);\nfloat bottom = mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x);\nfloat top = mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x);\ncol = vec3(mix(bottom, top, [[0]]));',
                slots: [{ options: ['u.y', 'u.x', 'f.x', '0.5'], answer: 'u.y' }],
              },
              {
                lvl: 1,
                template: 'vec2 i = [[0]](p);\nvec2 f = fract(p);\nvec2 u = f * f * (3.0 - 2.0 * f);\nfloat bottom = mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x);\nfloat top = mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x);\ncol = vec3(mix(bottom, top, u.y));',
                slots: [{ options: ['floor', 'fract', 'abs', 'sin'], answer: 'floor' }],
              },
              {
                lvl: 2,
                template: 'vec2 i = floor(p);\nvec2 f = fract(p);\nvec2 u = f * f * (3.0 - 2.0 * [[0]]);\nfloat bottom = mix(hash(i), hash(i + vec2(1.0, 0.0)), [[1]]);\nfloat top = mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x);\ncol = vec3(mix(bottom, top, u.y));',
                slots: [{ options: ['f', 'i', 'p', 'uv'], answer: 'f' }, { options: ['u.x', 'u.y', 'f.y', '1.0'], answer: 'u.x' }],
              },
              {
                lvl: 3,
                template: 'vec2 i = floor(p);\nvec2 f = [[0]](p);\nvec2 u = f * f * (3.0 - 2.0 * f);\nfloat bottom = mix(hash(i), hash(i + [[1]]), u.x);\nfloat top = mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x);\ncol = vec3(mix(bottom, top, [[2]]));',
                slots: [{ options: ['fract', 'floor', 'sign', 'abs'], answer: 'fract' }, { options: ['vec2(1.0, 0.0)', 'vec2(0.0, 1.0)', 'vec2(1.0, 1.0)', 'vec2(0.5)'], answer: 'vec2(1.0, 0.0)' }, { options: ['u.y', 'u.x', 'f.y', 'i.y'], answer: 'u.y' }],
              },
            ];
            const vr = rng.pick(variants.filter((x) => x.lvl === level || (level === 3 && x.lvl === 2)));
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Complete the value noise so it matches the target:',
              sub: `<code>p = uv * ${f(k)}</code> is set up for you.`,
              template: vr.template,
              slots: noPeek(vr.slots),
              build: (vals) => ({ frag: `vec2 p = uv * ${f(k)};\n` + fill(vals) }),
              explain: '<p><code>floor</code> = which cell, <code>fract</code> = where inside it. The fade uses <code>f</code>. Bottom & top rows blend along <b>x</b> (<code>u.x</code>), then the two rows blend along <b>y</b> (<code>u.y</code>).</p>',
            };
          },
        },
        {
          id: 'value-facts', title: 'Value noise quiz', engine: 'mcq', rounds: 6,
          blurb: 'Concept questions about how value noise is built.',
          questions: [
            q('Where does value noise store its random values?', ['On the integer grid points (cell corners)', 'On every pixel', 'In a texture', 'At the cell centres only'], 'Each grid point gets hash(point). Everything in between is blended.'),
            q('Why use <code>t*t*(3-2t)</code> instead of plain t for blending?', ['Its slope is zero at 0 and 1, so cells join without creases', 'It is cheaper', 'It makes values brighter', 'It makes the noise random'], 'Linear blending has a slope jump at each grid point → visible creases.'),
            q('How many hash() calls does one 2D value-noise lookup need?', ['4', '1', '2', '9'], 'One per cell corner: (0,0), (1,0), (0,1), (1,1).'),
            q('Blending 4 corner values with x then y is called…', ['Bilinear interpolation', 'Bicubic hashing', 'Mipmapping', 'Dithering'], 'Same as what a texture sampler does between 4 texels.'),
            tf('Value noise returns 0..1 because it blends values that are all in 0..1.', true, 'A mix of numbers in 0..1 always stays in 0..1.'),
            tf('In value noise, bright and dark spots tend to sit on grid points.', true, 'The extremes are the random corner values themselves, so features line up with the grid a bit.', 2),
            tf('<code>smoothstep(0.0, 1.0, t)</code> equals <code>t*t*(3.0-2.0*t)</code> for t in 0..1.', true, 'Yes — smoothstep IS that cubic, after clamping and remapping t.', 2),
            tf('Value noise changes every frame unless you add uTime.', false, 'It\'s built from a hash, so it\'s fixed. Add time to the input to animate it.'),
            q('In Unity Shader Graph, which node is basically value noise?', ['Simple Noise', 'Voronoi', 'Gradient Noise', 'Checkerboard'], 'Simple Noise = value noise (with a few octaves). Gradient Noise = Perlin-style.', { level: 2 }),
            q('What is <code>fract(p)</code> used for in noise code?', ['Position inside the current cell (0..1)', 'Which cell we\'re in', 'The random value', 'The fade curve'], 'floor(p) = cell id, fract(p) = local position.'),
          ],
        },
      ],
    },
    // ================================================================== GRADIENT NOISE
    {
      id: 'noise.gradient',
      title: 'Gradient (Perlin-style) noise',
      blurb: 'Random directions instead of random values — softer and less blocky.',
      lesson: [
        {
          title: 'Value noise looks griddy',
          body: `<p>Look closely at value noise (left): blobs line up in rows and columns, because the brightest and darkest points sit on grid points.</p>
<p>Ken Perlin's idea (1983, for the film <i>Tron</i>): store a random <b>direction</b> (a gradient — "which way is uphill") at each grid point, instead of a random height.</p>`,
          shaders: [
            { spec: { frag: 'col = vec3(vnoise(uv * 6.0));' }, label: 'value noise' },
            { spec: { frag: 'col = vec3(gnoise(uv * 6.0));' }, label: 'gradient noise' },
          ],
          after: '<div class="analogy">⛰️ <b>Analogy:</b> value noise says "at this post the ground is 3 m high". Gradient noise says "at this post the ground is at sea level, sloping up towards the north-east". The hills form <i>between</i> the posts.</div>',
        },
        {
          title: 'A random arrow per grid point',
          body: `<p>Each grid point gets a random unit vector: <code>angle = hash(i) * TAU</code>, <code>g = vec2(cos(angle), sin(angle))</code>. (In the prelude this is <code>grad2(i)</code>.)</p>
<p>The red arrows below are those gradients, starting at the blue grid points. Notice: the noise gets brighter <b>in the direction the arrow points</b>, and darker behind it.</p>`,
          controls: [{ name: 'k', label: 'grid size', min: 2, max: 6, step: 1, value: 3 }],
          shader: (v) => ({
            defs: `float arrows(vec2 p){
  vec2 i = floor(p); float m = 0.0;
  for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++){
    vec2 c = i + vec2(float(x), float(y));
    vec2 g = grad2(c);
    vec2 tip = c + g * 0.42;
    m = max(m, 1.0 - smoothstep(0.02, 0.045, sdSegment(p, c, tip)));
    // arrow head: two short strokes
    vec2 s = vec2(-g.y, g.x);
    m = max(m, 1.0 - smoothstep(0.02, 0.045, sdSegment(p, tip, tip - g * 0.12 + s * 0.08)));
    m = max(m, 1.0 - smoothstep(0.02, 0.045, sdSegment(p, tip, tip - g * 0.12 - s * 0.08)));
  }
  return m;
}
float dots(vec2 p){ vec2 c = floor(p + 0.5); return 1.0 - smoothstep(0.05, 0.08, length(p - c)); }`,
            frag: 'vec2 p = uv * uK;\ncol = vec3(gnoise(p));\ncol = mix(col, vec3(1.0, 0.3, 0.4), arrows(p));\ncol = mix(col, vec3(0.2, 0.8, 1.0), dots(p));',
            uniforms: { uK: v.k },
          }),
          code: (v) => `vec2 p = uv * ${f(v.k)};\n// at each corner c:  g = grad2(c)  (a random unit arrow)\ncol = vec3(gnoise(p));`,
        },
        {
          title: 'Each corner makes a tilted ramp',
          body: `<p>For a pixel, each of the 4 corners asks: "how far is this pixel <b>along my arrow</b>?" That's a <b>dot product</b>:</p>
<pre class="code">float a = dot(grad2(corner), p - corner);</pre>
<p>It's 0 at the corner itself, positive in front of the arrow, negative behind — a tilted <b>ramp</b>. Pick a corner below to see its ramp alone (mid-grey = 0), or 4 to see them blended.</p>`,
          controls: [{ name: 'c', label: 'corner: 0 BL · 1 BR · 2 TL · 3 TR · 4 blended', min: 0, max: 4, step: 1, value: 0 }],
          shader: (v) => ({
            defs: `float cornerRamp(vec2 p, float which){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(grad2(i), f);
  float b = dot(grad2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  if (which < 0.5) return a; if (which < 1.5) return b; if (which < 2.5) return c; if (which < 3.5) return d;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gridL(vec2 p){ vec2 g = abs(fract(p + 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }`,
            frag: 'vec2 p = uv * 2.0 + 0.3;\ncol = vec3(0.5 + (uC < 3.5 ? 0.35 : 0.7) * cornerRamp(p, uC));\ncol = mix(col, vec3(1.0, 0.2, 0.3), gridL(p));',
            uniforms: { uC: v.c },
          }),
          code: (v) => v.c < 4 ? `// only the ${['bottom-left', 'bottom-right', 'top-left', 'top-right'][v.c]} corner's ramp:\nfloat r = dot(grad2(corner), p - corner);\ncol = vec3(0.5 + 0.7 * r);` : `// all four ramps, blended with the same fade as value noise\nfloat n = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);\ncol = vec3(0.5 + 0.7 * n);`,
        },
        {
          title: 'Zero at every grid point',
          body: `<p>Because each ramp is 0 at its own corner, gradient noise is <b>exactly 0 (mid-grey) at every grid point</b>. The hills and valleys form <i>between</i> grid points, in all sorts of directions.</p>
<p>That's why it looks less blocky. The 1D version below: every curve crosses the middle line at whole numbers.</p>`,
          controls: [{ name: 'k', label: 'show value noise for comparison', min: 0, max: 1, step: 1, value: 0 }],
          graph: {
            fns: (v) => [{ f: gn1, label: 'gradient noise' }, ...(v.k ? [{ f: (x) => vn1(x), label: 'value noise', dash: [5, 4] }] : [])],
            opts: { xmin: 0, xmax: 8, ymin: -0.05, ymax: 1.05, hlines: [{ y: 0.5, color: '#666' }], xstep: 1 },
          },
          after: '<div class="tip">💡 The prelude remaps it: <code>gnoise = 0.5 + 0.7 * n</code> so it fits roughly in 0..1 like value noise. Unity: <b>Gradient Noise</b> node. Unreal: <b>Noise</b> node → Function: Gradient / Perlin. <b>Simplex</b> noise is an improved cousin on a triangle grid.</div>',
          quiz: { q: 'What value does raw gradient noise have exactly at a grid point?', options: ['0 (mid-grey after remapping)', 'The corner\'s random value', '1'], answer: 0, explain: 'dot(gradient, p - corner) with p = corner is dot(g, 0) = 0.' },
        },
      ],
      games: [
        {
          id: 'value-or-gradient', title: 'Value or gradient?', engine: 'buckets', rounds: 2,
          blurb: 'Sort noise images: blocky-ish value noise or softer gradient noise.',
          gen: (rng, level) => {
            const items = [];
            for (let i = 0; i < 10; i++) {
              const g = i % 2 === 1;
              const k = level === 3 ? rng.int(4, 7) : rng.int(3, 4);
              const s = rng.int(0, 99);
              const fn = g ? 'gnoise' : 'vnoise';
              const grid = level < 3 ? '\nvec2 c = floor(p + 0.5);\ncol = mix(col, vec3(0.2, 0.6, 1.0), 1.0 - smoothstep(0.05, 0.09, length(p - c)));' : '';
              items.push({ shader: { frag: `vec2 p = uv * uK + uS;\ncol = vec3(${fn}(p));${grid}`, uniforms: { uK: k, uS: [s, s] } }, bucket: g ? 1 : 0 });
            }
            return {
              prompt: 'Value noise or gradient noise?',
              sub: level < 3 ? 'Blue dots = grid points. Value noise: the darkest/brightest spots sit ON the dots. Gradient noise: every dot sits on mid-grey, features are between dots.' : 'Value noise: blobs line up in rows/columns. Gradient noise: softer, swirlier, less grid-aligned.',
              buckets: ['🧱 Value', '🌀 Gradient'],
              items,
              explain: '<p>Value noise passes through random values AT the grid points, so its extremes sit there. Gradient noise is exactly 0 (mid-grey) at every grid point; its hills form in between, so it looks less aligned.</p>',
            };
          },
        },
        {
          id: 'corner-dot', title: 'Corner contribution', engine: 'numeric', rounds: 6,
          blurb: 'Compute dot(gradient, offset) — what one corner adds to the noise.',
          gen: (rng, level) => {
            const G1 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
            const G2 = [[0.6, 0.8], [0.8, -0.6], [-0.6, 0.8], [-0.8, -0.6]];
            const g = rng.pick(level === 1 ? G1 : level === 2 ? [...G1, ...G2] : G2);
            const fr = [rng.pick([0.25, 0.5, 0.75]), rng.pick([0.25, 0.5, 0.75])];
            const corners = { 'bottom-left (0,0)': [0, 0], 'bottom-right (1,0)': [1, 0], 'top-left (0,1)': [0, 1], 'top-right (1,1)': [1, 1] };
            const cname = level === 1 ? 'bottom-left (0,0)' : rng.pick(Object.keys(corners));
            const c = corners[cname];
            const off = [fr[0] - c[0], fr[1] - c[1]];
            const ans = g[0] * off[0] + g[1] * off[1];
            return {
              prompt: `Pixel at <b>f = (${fr[0]}, ${fr[1]})</b> inside its cell. The <b>${cname}</b> corner has gradient <b>g = (${g[0]}, ${g[1]})</b>. What does that corner contribute?`,
              code: `vec2 offset = f - corner;   // = (${f(off[0], 2)}, ${f(off[1], 2)})\nfloat r = dot(g, offset);`,
              answer: +ans.toFixed(4),
              explain: `<p>dot = ${g[0]} × ${off[0]} + ${g[1]} × ${off[1]} = <b>${+ans.toFixed(4)}</b>. ${ans > 0 ? 'Positive: the pixel lies in <b>front</b> of the arrow (uphill).' : ans < 0 ? 'Negative: the pixel lies <b>behind</b> the arrow (downhill).' : 'Zero: the pixel is exactly sideways to the arrow.'}</p>`,
            };
          },
        },
        {
          id: 'gradient-facts', title: 'Gradient noise quiz', engine: 'mcq', rounds: 7,
          blurb: 'Concept checks on Perlin-style noise.',
          questions: [
            q('What does gradient noise store at each grid point?', ['A random direction (unit vector)', 'A random brightness', 'A random colour', 'Nothing'], 'A random gradient — "which way is uphill".'),
            q('How is one corner\'s contribution computed?', ['dot(gradient, p - corner)', 'hash(corner)', 'length(p - corner)', 'gradient * hash(p)'], 'A dot product: how far the pixel is along the arrow.'),
            q('Why does gradient noise look less blocky than value noise?', ['Its value is 0 at every grid point, so features form between them in any direction', 'It uses more octaves', 'It uses a texture', 'It doesn\'t use a grid at all'], 'Extremes no longer sit on grid points → less grid alignment.'),
            tf('Gradient noise still uses the smooth fade to blend the 4 corners.', true, 'Same u = f*f*(3-2f) blend as value noise — only the corner values differ.'),
            tf('Raw gradient noise is always between 0 and 1.', false, 'It\'s centred on 0 (roughly −0.7..0.7 in 2D). We remap it, e.g. 0.5 + 0.7*n.'),
            tf('A pixel exactly on a grid point gets raw gradient noise = 0.', true, 'offset = 0 → dot(g, 0) = 0.'),
            q('Perlin noise was invented for which film?', ['Tron (1982)', 'Toy Story (1995)', 'Star Wars (1977)', 'Avatar (2009)'], 'Ken Perlin made it after working on Tron, to get rid of the "machine-like" look of CG; he later won a technical Oscar for it.', { level: 2 }),
            q('A corner gradient is (1, 0). Where is its ramp brightest?', ['To the right of the corner', 'Above the corner', 'At the corner', 'To the left'], 'dot((1,0), offset) = offset.x → grows to the right.'),
            tf('Simplex noise is a variant of gradient noise on a triangular grid.', true, 'Fewer corners per cell (3 in 2D) → cheaper and fewer directional artifacts.', 3),
            q('Unreal\'s Noise node "Gradient" function and Unity\'s "Gradient Noise" node are…', ['Perlin-style gradient noise', 'Voronoi', 'White noise', 'Texture lookups'], 'Both implement gradient noise variants.', { level: 2 }),
          ],
        },
      ],
    },
    // ================================================================== FREQUENCY
    {
      id: 'noise.freq',
      title: 'Frequency & scale',
      blurb: 'uv * k zooms the noise: bigger k → more, smaller features.',
      lesson: [
        {
          title: 'k = cells across',
          body: `<p>Noise has one grid cell per 1 unit of input. uv only goes 0..1, so <code>noise(uv)</code> is less than one cell — just a smooth blur.</p>
<p>Multiply: <code>noise(uv * k)</code> spans <b>k cells</b> across the square. This k is the <b>frequency</b>.</p>`,
          controls: [{ name: 'k', label: 'frequency k', min: 1, max: 40, step: 1, value: 4 }],
          shader: (v) => ({ frag: 'col = vec3(gnoise(uv * uK));', uniforms: { uK: v.k } }),
          code: (v) => `col = vec3(gnoise(uv * ${f(v.k)})); // ${v.k} cells across → features ≈ ${n3(1 / v.k)} wide`,
          after: '<div class="analogy">🔍 It\'s like a zoom lens in reverse: bigger k = zooming <b>out</b> on an infinite noise landscape, so you see more hills, each one smaller.</div>',
        },
        {
          title: 'Frequency vs feature size',
          body: `<p><b>Frequency</b> = how many features per unit. <b>Wavelength</b> (feature size) = roughly <code>1 / k</code>.</p>
<p><b>Double k → features half as big.</b> Here's a 1D slice. Try k = 2, 4, 8.</p>`,
          controls: [{ name: 'k', label: 'k', min: 1, max: 16, step: 1, value: 2 }],
          graph: { fns: (v) => [{ f: (x) => gn1(x * v.k), label: `gnoise(x * ${v.k})` }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          code: (v) => `float y = gnoise(x * ${f(v.k)});\n// ~${v.k} bumps between x = 0 and 1`,
        },
        {
          title: 'Stretching and scrolling',
          body: `<p><code>uv * vec2(kx, ky)</code> lets you use <b>different frequencies</b> per axis → streaks: wood grain, brushed metal, rain, scratches.</p>
<p>Adding an offset moves through the noise. Add <code>uTime</code> to the offset and it <b>scrolls</b> — the base of fog, fire and water movement.</p>`,
          controls: [
            { name: 'kx', label: 'k.x', min: 1, max: 30, step: 1, value: 2 },
            { name: 'ky', label: 'k.y', min: 1, max: 30, step: 1, value: 20 },
            { name: 's', label: 'scroll speed (x)', min: 0, max: 3, step: 0.1, value: 0.5 },
          ],
          shader: (v) => ({ frag: 'col = vec3(gnoise(uv * uK + vec2(uTime * uS, 0.0)));', uniforms: { uK: [v.kx, v.ky], uS: v.s } }),
          code: (v) => `vec2 p = uv * vec2(${f(v.kx)}, ${f(v.ky)});\np += vec2(uTime * ${f(v.s, 1)}, 0.0); // scroll\ncol = vec3(gnoise(p));`,
          quiz: { q: '<code>noise(uv * vec2(2.0, 30.0))</code> gives…', options: ['Horizontal streaks (stretched along x)', 'Vertical streaks', 'Very fine uniform noise'], answer: 0, explain: 'Few cells along x (wide features), many along y (thin features) → long horizontal streaks.' },
        },
        {
          title: 'Moving at the right speed',
          body: `<p>Careful: adding <code>uTime * s</code> <i>after</i> multiplying by k moves the pattern <b>s cells</b> per second. Each cell is 1/k of the square, so it moves <b>s / k</b> uv per second.</p>
<p>Adding it <i>before</i> multiplying, <code>(uv + uTime * s) * k</code>, moves s uv per second no matter what k is.</p>
<div class="note">Rule of thumb: offset inside the multiply is in <b>uv units</b>; offset after it is in <b>cell units</b>.</div>`,
          controls: [{ name: 'k', label: 'k', min: 2, max: 20, step: 1, value: 4 }],
          shaders: [
            { spec: (v) => ({ frag: 'col = vec3(gnoise(uv * uK + vec2(uTime, 0.0)));', uniforms: { uK: v.k } }), label: 'uv*k + t' },
            { spec: (v) => ({ frag: 'col = vec3(gnoise((uv + vec2(uTime * 0.25, 0.0)) * uK));', uniforms: { uK: v.k } }), label: '(uv + t*0.25)*k' },
          ],
          code: (v) => `// left : moves 1 cell/s = ${n3(1 / v.k)} uv/s (slower as k grows)\n// right: moves 0.25 uv/s, whatever k is`,
        },
      ],
      games: [
        {
          id: 'match-freq', title: 'Match the frequency', engine: 'slider', rounds: 4,
          blurb: 'Tune k (and more) so your noise matches the target.',
          gen: (rng, level) => {
            const k = rng.int(2, 14), ky = rng.int(2, 14), o = rng.step(0, 3, 0.5);
            const params = [{ name: 'k', label: level === 2 ? 'k.x' : 'k', min: 1, max: 16, step: 1, target: k }];
            if (level === 2) params.push({ name: 'ky', label: 'k.y', min: 1, max: 16, step: 1, target: ky });
            if (level === 3) params.push({ name: 'o', label: 'offset x (cells)', min: 0, max: 3, step: 0.5, target: o });
            const vals = (p) => [p.k, p.ky ?? p.k, p.o ?? 0];
            return {
              prompt: level === 1 ? 'Set the frequency k to match the target.' : level === 2 ? 'Set separate x and y frequencies.' : 'Match the frequency, then slide the offset until the blobs line up.',
              sub: 'Count blobs across one edge — that\'s about k.',
              params,
              build: (p) => { const [a, b, c] = vals(p); return { frag: 'col = vec3(gnoise(uv * uK + vec2(uO, 0.0)));', uniforms: { uK: [a, b], uO: c } }; },
              code: (p) => { const [a, b, c] = vals(p); return `col = vec3(gnoise(uv * vec2(${f(a)}, ${f(b)}) + vec2(${f(c, 1)}, 0.0)));`; },
              tolerance: 0.03,
              explain: '<p>k = number of noise cells across the square. More k → smaller features. An offset of 1.0 slides the pattern by exactly one cell.</p>',
            };
          },
        },
        {
          id: 'which-k', title: 'Spot the frequency', engine: 'mcq', rounds: 8,
          blurb: 'Look at the noise and pick the code that made it.',
          gen: (rng, level) => {
            const pool = level === 1 ? [2, 6, 24] : level === 2 ? [2, 4, 8, 16, 32] : [3, 4, 6, 8, 10, 12];
            const stretch = level === 3 && rng.chance(0.4);
            const mk = () => stretch ? { kx: rng.pick(pool), ky: rng.pick(pool) } : { kx: 0, ky: 0, k: rng.pick(pool) };
            const ans = mk();
            const opts = distinct(rng, ans, mk, Math.min(4, stretch ? 4 : pool.length), (o) => JSON.stringify(o));
            const code = (o) => o.k ? `col = vec3(gnoise(uv * ${f(o.k)}));` : `col = vec3(gnoise(uv * vec2(${f(o.kx)}, ${f(o.ky)})));`;
            return {
              prompt: 'Which code made this noise?',
              shader: { frag: code(ans) },
              options: opts.map((o) => ({ code: code(o) })),
              explain: '<p>Count features along an edge: about k bumps across. With <code>vec2(kx, ky)</code> the noise is squashed: many features along the axis with the big number.</p>',
            };
          },
        },
        {
          id: 'freq-math', title: 'Frequency maths', engine: 'numeric', rounds: 6,
          blurb: 'Cells, feature sizes and scroll speeds as numbers.',
          gen: (rng, level) => {
            const kinds = level === 1 ? ['cells', 'size', 'want'] : level === 2 ? ['size', 'want', 'double', 'offset'] : ['double', 'offset', 'speed', 'speedIn'];
            const kind = rng.pick(kinds);
            const k = rng.pick([2, 4, 5, 8, 10]);
            if (kind === 'cells') return { prompt: `How many noise cells fit across the square for <code>gnoise(uv * ${f(k)})</code>?`, answer: k, explain: `<p>uv goes 0..1, times ${k} → 0..${k}: <b>${k}</b> cells.</p>` };
            if (kind === 'size') return { prompt: `Roughly how wide (in uv) is one noise cell in <code>gnoise(uv * ${f(k)})</code>?`, answer: 1 / k, tolerance: 0.011, explain: `<p>1 / ${k} = <b>${n3(1 / k)}</b> of the square.</p>` };
            if (kind === 'want') { const s = rng.pick([0.5, 0.25, 0.2, 0.1, 0.125]); return { prompt: `You want noise cells about <b>${s}</b> uv wide. What k?`, code: 'col = vec3(gnoise(uv * k));', answer: 1 / s, explain: `<p>k = 1 / size = 1 / ${s} = <b>${1 / s}</b>.</p>` }; }
            if (kind === 'double') { const b = rng.pick([1, 1.5, 3]); const t = rng.int(2, 3); return { prompt: `Start with k = ${b}. You <b>double</b> it ${t} times. What is k now?`, answer: b * 2 ** t, explain: `<p>${b} × 2${t === 2 ? ' × 2' : ' × 2 × 2'} = <b>${b * 2 ** t}</b>. Feature size shrank to 1/${2 ** t}.</p>` }; }
            if (kind === 'offset') { const o = rng.pick([1, 2, 3]); const kk = rng.pick([4, 8, 10]); return { prompt: `<code>gnoise(uv * ${f(kk)} + vec2(${f(o)}, 0.0))</code>. How far (in uv) is the pattern shifted compared with no offset?`, answer: o / kk, explain: `<p>The offset is added in cell units: ${o} cells × (1/${kk} uv per cell) = <b>${n3(o / kk)}</b> uv.</p>` }; }
            if (kind === 'speed') { const s = rng.pick([1, 2, 3]); const kk = rng.pick([4, 5, 10]); return { prompt: `How many uv per second does this noise scroll?`, code: `col = vec3(gnoise(uv * ${f(kk)} + vec2(uTime * ${f(s)}, 0.0)));`, answer: s / kk, explain: `<p>${s} cells per second ÷ ${kk} cells per uv = <b>${n3(s / kk)}</b> uv/s. Raising k would make it look slower!</p>` }; }
            const s = rng.pick([0.1, 0.2, 0.5]); const kk = rng.pick([4, 8]);
            return { prompt: `How many uv per second does this noise scroll?`, code: `col = vec3(gnoise((uv + vec2(uTime * ${f(s)}, 0.0)) * ${f(kk)}));`, answer: s, explain: `<p>The time offset is added <i>before</i> the × ${kk}, so it's in uv units: <b>${s}</b> uv/s, independent of k.</p>` };
          },
        },
      ],
    },
    // ================================================================== FBM
    {
      id: 'noise.fbm',
      title: 'fBm & octaves',
      blurb: 'Stack noise layers: each finer and fainter than the last.',
      lesson: [
        {
          title: 'Detail at every scale',
          body: `<p>A mountain range has <b>big</b> shapes (the mountains), <b>medium</b> ones (ridges), <b>small</b> ones (rocks), <b>tiny</b> ones (pebbles). One noise layer only has one feature size.</p>
<p><b>fBm</b> (fractal Brownian motion) adds several noise layers — called <b>octaves</b> — each one <b>smaller</b> and <b>fainter</b>. Add octaves one by one:</p>`,
          controls: [{ name: 'o', label: 'octaves', min: 1, max: 7, step: 1, value: 1 }],
          shader: (v) => ({ defs: FBM_N, frag: 'float n = fbmN(uv * 3.0, uO, 2.0, 0.5);\ncol = vec3((n - 0.5) * 1.8 + 0.5); // extra contrast', uniforms: { uO: v.o } }),
          graph: { fns: (v) => [{ f: (x) => fbm1(x * 3, v.o), label: `${v.o} octave${v.o > 1 ? 's' : ''}` }], opts: { xmin: 0, xmax: 2, ymin: -0.05, ymax: 1.05 } },
          after: '<div class="analogy">🗺️ Like drawing a coastline: first the rough outline, then bays, then rocks, then pebbles. Each pass adds smaller, subtler wiggles.</div>',
        },
        {
          title: 'The loop',
          body: `<p>Each turn of the loop adds one octave, then <b>doubles the frequency</b> and <b>halves the amplitude</b> for the next one.</p>
<p>Watch the table of frequencies and amplitudes update as you add octaves.</p>`,
          controls: [{ name: 'o', label: 'octaves', min: 1, max: 6, step: 1, value: 3 }],
          shader: (v) => ({ defs: FBM_N, frag: 'col = vec3(fbmRaw(uv * 3.0, uO, 2.0, 0.5));', uniforms: { uO: v.o } }),
          code: (v) => {
            let rows = '', fr = 3, a = 0.5, s = 0;
            for (let i = 0; i < v.o; i++) { s += a; rows += `\n// octave ${i + 1}: frequency ${n3(fr)}, amplitude ${n3(a)}`; fr *= 2; a *= 0.5; }
            return `float v = 0.0, a = 0.5;\nvec2 p = uv * 3.0;\nfor (int i = 0; i < ${v.o}; i++) {\n  v += a * vnoise(p);\n  p *= 2.0;   // finer\n  a *= 0.5;   // fainter\n}${rows}\n// max possible total = ${n3(s)}`;
          },
          after: '<div class="note">Why fainter? Small details should be small bumps. If every octave were full strength, the result would look like harsh static.</div>',
        },
        {
          title: 'Lacunarity & gain',
          body: `<p>The two multipliers have names:</p>
<ul><li><b>Lacunarity</b>: how much the <b>frequency</b> grows per octave (usually 2.0).</li>
<li><b>Gain</b> (or persistence): how much the <b>amplitude</b> shrinks per octave (usually 0.5).</li></ul>
<p>High gain → rough, gritty (like rock). Low gain → soft and smooth (like clouds).</p>`,
          controls: [
            { name: 'l', label: 'lacunarity', min: 1.2, max: 3.5, step: 0.1, value: 2 },
            { name: 'g', label: 'gain', min: 0.2, max: 0.9, step: 0.05, value: 0.5 },
          ],
          shader: (v) => ({ defs: FBM_N, frag: 'float n = fbmN(uv * 3.0, 6.0, uL, uG);\ncol = vec3((n - 0.5) * 1.8 + 0.5);', uniforms: { uL: v.l, uG: v.g } }),
          code: (v) => `// 6 octaves\nfor (int i = 0; i < 6; i++) {\n  v += a * vnoise(p);\n  p *= ${f(v.l, 1)};   // lacunarity\n  a *= ${f(v.g, 2)};  // gain\n}`,
        },
        {
          title: 'Amplitudes add up',
          body: `<p>With gain 0.5 starting at 0.5, the amplitudes are 0.5, 0.25, 0.125, 0.0625 … Their sum approaches <b>1.0</b> but never reaches it. So fBm stays in 0..1 — handy!</p>
<p>With other gains, the total is different, so people often <b>divide by the total</b> to normalise.</p>`,
          controls: [
            { name: 'o', label: 'octaves', min: 1, max: 8, step: 1, value: 3 },
            { name: 'g', label: 'gain', min: 0.3, max: 0.8, step: 0.1, value: 0.5 },
          ],
          visual: (el, v) => {
            let a = 0.5, s = 0;
            const bars = [];
            for (let i = 0; i < v.o; i++) { bars.push(a); s += a; a *= v.g; }
            el.innerHTML = `<div style="position:relative;display:flex;height:22px;border-radius:6px;overflow:hidden;background:#22252f;margin:6px 0">${bars.map((b, i) => `<div style="width:${(b / 2.5) * 100}%;background:hsl(${200 + i * 25},70%,${55 - i * 4}%);border-right:1px solid #000"></div>`).join('')}<div style="position:absolute;left:40%;top:0;bottom:0;border-left:2px dashed #fff"></div></div><div class="small dim">each block = one octave's amplitude · dashed line = 1.0</div>`;
          },
          code: (v) => { let a = 0.5, s = 0; const parts = []; for (let i = 0; i < v.o; i++) { parts.push(n3(a)); s += a; a *= v.g; } return `// amplitudes: ${parts.join(' + ')}\n// total     = ${n3(s)}`; },
          quiz: { q: 'Gain 0.5, starting amplitude 0.5, 3 octaves. What is the maximum total?', options: ['0.875', '1.5', '0.75', '1.0'], answer: 0, explain: '0.5 + 0.25 + 0.125 = 0.875.' },
        },
        {
          title: 'Octaves cost',
          body: `<p>Each octave is <b>one more noise call</b> per pixel. 8 octaves ≈ 8× the cost of 1.</p>
<p>And octaves smaller than a pixel are wasted: they just add shimmer. At 300 px wide and base k = 3, octave 8 has frequency 3 × 2⁷ = 384 cells — smaller than a pixel!</p>
<div class="tip">💡 Unreal's <b>Noise</b> node has a <b>Levels</b> input = octaves (watch its instruction count grow). In Unity Shader Graph, <b>Simple Noise</b> already sums 3 octaves; for more, chain nodes or write a Custom Function. Often a <b>tiling noise texture</b> sampled 2–3 times at different scales is cheaper than maths.</div>`,
        },
      ],
      games: [
        {
          id: 'match-octaves', title: 'Match the fBm', engine: 'slider', rounds: 4,
          blurb: 'Tune octaves (then gain and lacunarity) to match the target.',
          gen: (rng, level) => {
            const o = rng.int(1, 6), g = rng.step(0.3, 0.8, 0.1), l = rng.pick([1.5, 2, 2.5, 3]);
            const params = [{ name: 'o', label: 'octaves', min: 1, max: 6, step: 1, target: o }];
            if (level >= 2) params.push({ name: 'g', label: 'gain', min: 0.3, max: 0.8, step: 0.05, target: g });
            if (level === 3) params.push({ name: 'l', label: 'lacunarity', min: 1.5, max: 3, step: 0.5, target: l });
            const vals = (p) => [p.o, p.g ?? 0.5, p.l ?? 2];
            return {
              prompt: level === 1 ? 'How many octaves does the target have?' : level === 2 ? 'Match octaves and gain.' : 'Match octaves, gain and lacunarity.',
              sub: 'More octaves = finer detail on the edges. Higher gain = rougher, more contrast in the details.',
              params,
              build: (p) => { const [a, b, c] = vals(p); return { defs: FBM_N, frag: 'float n = fbmN(uv * 3.0, uO, uL, uG);\ncol = vec3((n - 0.5) * 1.8 + 0.5);', uniforms: { uO: a, uG: b, uL: c } }; },
              code: (p) => { const [a, b, c] = vals(p); return `for (int i = 0; i < ${a}; i++) {\n  v += amp * vnoise(p);\n  p *= ${f(c, 1)};   amp *= ${f(b, 2)};\n}`; },
              compare: level === 1 ? undefined : 'pixels',
              tolerance: 0.03,
              explain: '<p>Octave count shows in the <b>finest</b> detail. Gain controls how strong those details are; lacunarity how much smaller each layer gets.</p>',
            };
          },
        },
        {
          id: 'octave-sum', title: 'Octave maths', engine: 'numeric', rounds: 6,
          blurb: 'Sum the amplitudes, or find the frequency of an octave.',
          gen: (rng, level) => {
            const kind = level === 1 ? rng.pick(['sum', 'freq']) : level === 2 ? rng.pick(['sum', 'freq', 'amp']) : rng.pick(['sum', 'lac', 'amp']);
            if (kind === 'freq') {
              const k = rng.pick([1, 2, 3, 4]), oc = rng.int(2, 5);
              return { prompt: `Base frequency k = ${k}, lacunarity 2.0. What is the frequency of octave <b>${oc}</b>?`, sub: 'Octave 1 uses k itself.', answer: k * 2 ** (oc - 1), explain: `<p>Octave 1: ${k}. Each next one ×2 → ${k} × 2^${oc - 1} = <b>${k * 2 ** (oc - 1)}</b>.</p>` };
            }
            if (kind === 'lac') {
              const k = rng.pick([1, 2, 4]), lac = rng.pick([1.5, 3]), oc = rng.int(2, 4);
              const ans = k * lac ** (oc - 1);
              return { prompt: `Base k = ${k}, lacunarity <b>${lac}</b>. Frequency of octave ${oc}?`, answer: ans, explain: `<p>${k} × ${lac}^${oc - 1} = <b>${n3(ans)}</b>.</p>` };
            }
            if (kind === 'amp') {
              const a0 = rng.pick([0.5, 1]), g = rng.pick([0.5, 0.25, 0.6]), oc = rng.int(2, 4);
              const ans = a0 * g ** (oc - 1);
              return { prompt: `Start amplitude ${a0}, gain ${g}. What is the amplitude of octave <b>${oc}</b>?`, answer: +ans.toFixed(4), explain: `<p>${a0} × ${g}^${oc - 1} = <b>${+ans.toFixed(4)}</b>.</p>` };
            }
            const a0 = level === 1 ? 0.5 : rng.pick([0.5, 1]), g = level === 1 ? 0.5 : rng.pick([0.5, 0.6, 0.4]), oc = level === 1 ? rng.int(2, 4) : rng.int(2, 4);
            let s = 0, a = a0; const parts = [];
            for (let i = 0; i < oc; i++) { s += a; parts.push(+a.toFixed(4)); a *= g; }
            return {
              prompt: `What is the <b>maximum total</b> of this fBm (each noise returns at most 1)?`,
              code: `float v = 0.0, a = ${f(a0)};\nfor (int i = 0; i < ${oc}; i++) {\n  v += a * vnoise(p);\n  p *= 2.0;\n  a *= ${f(g)};\n}`,
              answer: +s.toFixed(4),
              explain: `<p>Amplitudes: ${parts.join(' + ')} = <b>${+s.toFixed(4)}</b>.</p>`,
            };
          },
        },
        {
          id: 'pick-octaves', title: 'Code → fBm image', engine: 'mcq', rounds: 8,
          blurb: 'Read the octave count and pick the matching image.',
          gen: (rng, level) => {
            const pool = level === 1 ? [1, 3, 7] : level === 2 ? [1, 2, 4, 6] : [2, 3, 4, 5, 6];
            const o = rng.pick(pool);
            const opts = distinct(rng, o, () => rng.pick(pool), Math.min(4, pool.length));
            const sp = (k) => ({ defs: FBM_N, frag: 'float n = fbmN(uv * 3.0 + 1.7, uO, 2.0, 0.5);\ncol = vec3((n - 0.5) * 1.8 + 0.5);', uniforms: { uO: k } });
            return {
              prompt: `Which image uses <b>${o}</b> octave${o > 1 ? 's' : ''}?`,
              code: `for (int i = 0; i < ${o}; i++) {\n  v += a * vnoise(p);  p *= 2.0;  a *= 0.5;\n}`,
              options: opts.map((k) => ({ shader: sp(k) })),
              explain: '<p>All images share octave 1 (the big shapes). Each extra octave adds a finer layer of detail on top — compare the edges of the blobs.</p>',
            };
          },
        },
        {
          id: 'fill-fbm', title: 'Write the fBm loop', engine: 'codefill', rounds: 4,
          blurb: 'Fill the blanks in the octave loop.',
          gen: (rng, level) => {
            const variants = [
              { template: 'float v = 0.0;\nfloat a = 0.5;\nvec2 p = uv * 3.0;\nfor (int i = 0; i < 5; i++) {\n  v += a * vnoise(p);\n  p *= [[0]];\n  a *= 0.5;\n}\ncol = vec3(v);', slots: [{ options: ['2.0', '0.5', '1.0', '-2.0'], answer: '2.0' }] },
              { template: 'float v = 0.0;\nfloat a = 0.5;\nvec2 p = uv * 3.0;\nfor (int i = 0; i < 5; i++) {\n  v += a * vnoise(p);\n  p *= 2.0;\n  a *= [[0]];\n}\ncol = vec3(v);', slots: [{ options: ['0.5', '2.0', '1.0', '0.0'], answer: '0.5' }] },
              { template: 'float v = 0.0;\nfloat a = 0.5;\nvec2 p = uv * 3.0;\nfor (int i = 0; i < [[0]]; i++) {\n  v += [[1]] * vnoise(p);\n  p *= 2.0;\n  a *= 0.5;\n}\ncol = vec3(v);', slots: [{ options: ['1', '3', '6', '1.0'], answer: String(rng.pick([1, 3, 6])) }, { options: ['a', 'p.x', '1.0', 'v'], answer: 'a' }] },
              { template: 'float v = 0.0;\nfloat a = 0.5;\nvec2 p = uv * 3.0;\nfor (int i = 0; i < 5; i++) {\n  v += a * [[0]];\n  p *= [[1]];\n  a *= [[2]];\n}\ncol = vec3(v);', slots: [{ options: ['vnoise(p)', 'vnoise(uv)', 'hash(p)', 'p.x'], answer: 'vnoise(p)' }, { options: ['2.0', '0.5', '1.0'], answer: '2.0' }, { options: ['0.5', '2.0', '1.0'], answer: '0.5' }] },
            ];
            const vr = level === 1 ? rng.pick(variants.slice(0, 2)) : level === 2 ? variants[2] : variants[3];
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Complete the fBm so it matches the target:',
              sub: level === 2 ? 'Count the detail layers to find the octave count.' : 'Frequency goes up, amplitude goes down.',
              template: vr.template,
              slots: noPeek(vr.slots),
              build: (vals) => ({ frag: fill(vals) }),
              explain: '<p>Standard fBm: <code>p *= 2.0</code> (lacunarity, finer) and <code>a *= 0.5</code> (gain, fainter). Using <code>vnoise(uv)</code> instead of <code>vnoise(p)</code> would add the same layer again and again. In WebGL 1 the loop count must be an <b>int</b> constant.</p>',
            };
          },
        },
      ],
    },
    // ================================================================== VORONOI
    {
      id: 'noise.voronoi',
      title: 'Cellular / Voronoi noise',
      blurb: 'Distance to the nearest random point: cells, bubbles and cracks.',
      lesson: [
        {
          title: 'Scatter points, measure distance',
          body: `<p>A totally different kind of noise. Scatter random <b>points</b>. For every pixel, find the distance to the <b>nearest</b> point. Colour = that distance.</p>
<p>Near a point → dark. Far from all points → bright. Each point "owns" the pixels closest to it: those are its <b>cell</b>.</p>
<div class="analogy">🏪 <b>Analogy:</b> shops in a city. Every house goes to its nearest shop. The borders between shop territories form the cell pattern.</div>`,
          shader: { defs: VOR, frag: 'vec3 v = vor(uv * 5.0, 1.0);\ncol = vec3(v.x);\ncol = mix(col, vec3(1.0, 0.3, 0.3), 1.0 - smoothstep(0.03, 0.06, v.x));' },
          code: '// one random point per grid cell\nfloat d = distance_to_nearest_point(uv * 5.0);\ncol = vec3(d);  // red dots = the points',
        },
        {
          title: 'One point per grid cell',
          body: `<p>Searching thousands of points per pixel would be way too slow. The trick: use a grid again. Each cell gets <b>one point</b>, placed at a random offset inside it: <code>cell + hash2(cell)</code>.</p>
<p>The <b>jitter</b> slider scales that random offset. At 0, every point sits in its cell's centre → a regular grid of circles. At 1, fully random → organic cells.</p>`,
          controls: [{ name: 'j', label: 'jitter', min: 0, max: 1, step: 0.05, value: 0.3 }],
          shader: (v) => ({ defs: VOR + VN_MODE, frag: 'vec2 p = uv * 5.0;\nvec3 v = vor(p, uJ);\ncol = vec3(v.x);\ncol = mix(col, vec3(1.0, 0.3, 0.3), 1.0 - smoothstep(0.03, 0.06, v.x));\ncol = mix(col, vec3(0.3, 0.6, 1.0), gridLine(p) * 0.6);', uniforms: { uJ: v.j } }),
          code: (v) => `vec2 point = cell + 0.5 + ${f(v.j, 2)} * (hash2(cell) - 0.5);`,
        },
        {
          title: 'Why check the neighbours?',
          body: `<p>The nearest point is <b>not always</b> in the pixel's own cell — it can be just across the border in a neighbouring cell. So we check the <b>3×3</b> block of cells around us (9 points).</p>
<p>Switch to "own cell only" and look at the ugly seams along the grid lines.</p>`,
          controls: [{ name: 's', label: '0 = own cell only · 1 = 3×3 neighbours', min: 0, max: 1, step: 1, value: 1 }],
          shader: (v) => ({
            defs: `float vorS(vec2 p, float all){
  vec2 i = floor(p); vec2 f = fract(p); float md = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    if (all < 0.5 && (x != 0 || y != 0)) continue;
    vec2 g = vec2(float(x), float(y));
    md = min(md, length(g + hash2(i + g) - f));
  }
  return md;
}`,
            frag: 'col = vec3(vorS(uv * 5.0, uS));', uniforms: { uS: v.s },
          }),
          code: (v) => v.s ? 'for (int y = -1; y <= 1; y++)\n  for (int x = -1; x <= 1; x++) {\n    vec2 g = vec2(float(x), float(y));\n    md = min(md, length(g + hash2(i + g) - f));\n  }' : '// only the point in my own cell:\nmd = length(hash2(i) - f);\n// → wrong near borders!',
        },
        {
          title: 'Distance → bubbles, cell id → colours',
          body: `<p>The distance (called <b>F1</b>) is a smooth field, so all your shaping tools work on it: <code>1.0 - d</code> for glowing blobs, <code>step(r, d)</code> for dots.</p>
<p>Also remember <b>which point</b> was nearest. Hash that cell's id → <b>one random value per Voronoi cell</b> → stained glass, cobblestones, crystal facets.</p>`,
          controls: [{ name: 'm', label: '0 F1 · 1 1−F1 · 2 dots · 3 cell colour', min: 0, max: 3, step: 1, value: 0 }],
          shader: (v) => ({ defs: VOR, frag: 'vec3 v = vor(uv * 5.0, 1.0);\nif (uM < 0.5) col = vec3(v.x);\nelse if (uM < 1.5) col = vec3(1.0 - v.x);\nelse if (uM < 2.5) col = vec3(1.0 - step(0.25, v.x));\nelse col = hsv2rgb(vec3(v.z, 0.6, 0.9));', uniforms: { uM: v.m } }),
          code: (v) => ['col = vec3(F1);', 'col = vec3(1.0 - F1);', 'col = vec3(1.0 - step(0.25, F1)); // dots of radius 0.25', 'col = hsv2rgb(vec3(cellId, 0.6, 0.9)); // random hue per cell'][v.m],
        },
        {
          title: 'F2 − F1: cracks',
          body: `<p>Also track the distance to the <b>second</b> nearest point (<b>F2</b>). On a border between two cells, both points are equally far → <b>F2 − F1 = 0</b>. Deep inside a cell it's large.</p>
<p>So <code>F2 − F1</code> is a "distance to the border" — threshold it for cracks, dried mud, scales, cell walls.</p>`,
          controls: [{ name: 'w', label: 'crack width', min: 0.01, max: 0.3, step: 0.01, value: 0.06 }],
          shader: (v) => ({ defs: VOR, frag: 'vec3 v = vor(uv * 5.0, 1.0);\nfloat edge = v.y - v.x;\nfloat crack = 1.0 - smoothstep(uW, uW + 0.02, edge);\ncol = mix(vec3(0.75, 0.55, 0.35), vec3(0.15, 0.08, 0.05), crack);', uniforms: { uW: v.w } }),
          code: (v) => `float edge = F2 - F1;   // 0 on the border\nfloat crack = 1.0 - smoothstep(${f(v.w, 2)}, ${f(v.w + 0.02, 2)}, edge);\ncol = mix(mud, darkCrack, crack);`,
          after: '<div class="tip">💡 Unity: <b>Voronoi</b> node (outputs <i>Out</i> = F1 and <i>Cells</i> = cell id; "Angle Offset" animates the points). Unreal: <b>Noise</b> node → Voronoi, or <b>VoronoiNoise</b> material function. Used for caustics, skin cells, lizard scales, cracked earth.</div>',
          quiz: { q: 'A pixel is exactly on the border between two cells. F2 − F1 is…', options: ['0', '1', 'The cell size'], answer: 0, explain: 'Both points are equally far → F1 = F2 → difference 0. That\'s why F2−F1 lights up the cell borders.' },
        },
      ],
      games: [
        {
          id: 'voronoi-out', title: 'Image → Voronoi code', engine: 'mcq', rounds: 8,
          blurb: 'Which Voronoi output made this image?',
          gen: (rng, level) => {
            const k = rng.int(4, 7), s = rng.int(0, 50);
            const outs = [
              { code: 'col = vec3(F1);', frag: 'col = vec3(v.x);' },
              { code: 'col = vec3(1.0 - F1);', frag: 'col = vec3(1.0 - v.x);' },
              { code: 'col = vec3(step(0.3, F1));', frag: 'col = vec3(step(0.3, v.x));' },
              { code: 'col = vec3(cellId);', frag: 'col = vec3(v.z);' },
              { code: 'col = vec3(step(0.08, F2 - F1));', frag: 'col = vec3(step(0.08, v.y - v.x));' },
              { code: 'col = vec3(F2 - F1);', frag: 'col = vec3(v.y - v.x);' },
              { code: 'col = vec3(1.0 - step(0.3, F1));', frag: 'col = vec3(1.0 - step(0.3, v.x));' },
            ];
            const pool = level === 1 ? [outs[0], outs[3], outs[4]] : level === 2 ? outs.slice(0, 5) : outs;
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), Math.min(4, pool.length), (o) => o.code);
            return {
              prompt: 'Which line made this image?',
              sub: 'F1 = distance to nearest point, F2 = to second nearest, cellId = random value of the nearest cell.',
              shader: { defs: VOR, frag: `vec3 v = vor(uv * ${f(k)} + ${f(s)}, 1.0);\n${ans.frag}` },
              options: opts.map((o) => ({ code: o.code })),
              explain: '<p><b>F1</b>: dark dots at points, bright far away. <b>cellId</b>: flat random greys per cell. <b>F2−F1</b>: dark on the borders. <code>step</code> turns any of them into hard black/white shapes.</p>',
            };
          },
        },
        {
          id: 'tap-voronoi', title: 'Find it in the cells', engine: 'tap', rounds: 5,
          blurb: 'Tap the seed points, the farthest spot, or a cell border.',
          gen: (rng, level) => {
            const pts = scatter(rng, level === 1 ? 0.24 : 0.2);
            const uniforms = ptsUniforms(pts);
            const kind = level === 1 ? 'seed' : level === 2 ? rng.pick(['seed', 'far', 'border']) : rng.pick(['far', 'border']);
            if (kind === 'seed') {
              return {
                prompt: 'Tap one of the <b>points</b> (the centre of any dark spot).',
                code: 'col = vec3(F1 * 3.0); // distance to nearest point',
                shader: { defs: PTS, frag: PTS_BODY + 'col = vec3(d1 * 3.0);', uniforms },
                targets: pts, radius: 0.04,
                explain: '<p>F1 is 0 exactly at a point, so the points are the darkest spots — the centres of the dark "wells".</p>',
              };
            }
            if (kind === 'far') {
              let best = 0;
              for (let y = 0; y <= 50; y++) for (let x = 0; x <= 50; x++) best = Math.max(best, f1f2(pts, x / 50, y / 50)[0]);
              const reveal = [];
              for (let y = 0; y <= 50; y++) for (let x = 0; x <= 50; x++) if (f1f2(pts, x / 50, y / 50)[0] >= best - 0.004 && reveal.length < 3 && reveal.every((r) => Math.hypot(r[0] - x / 50, r[1] - y / 50) > 0.1)) reveal.push([x / 50, y / 50]);
              return {
                prompt: 'Tap the spot that is <b>farthest from every point</b> (the brightest pixel).',
                code: 'col = vec3(F1 * 3.0);',
                shader: { defs: PTS, frag: PTS_BODY + 'col = vec3(d1 * 3.0);', uniforms },
                score: (u, v) => { const d = f1f2(pts, u, v)[0]; return Math.max(0, Math.min(1, 1 - (best - d - 0.02) / 0.08)); },
                reveal,
                explain: `<p>The brightest pixel has the largest F1 (≈ ${n3(best)} here). It sits where three cells meet — a corner of the Voronoi diagram — or at the image edge.</p>`,
              };
            }
            const reveal = [];
            for (let y = 1; y < 40 && reveal.length < 8; y++) for (let x = 1; x < 40 && reveal.length < 8; x++) {
              const [a, b] = f1f2(pts, x / 40, y / 40);
              if (b - a < 0.006 && reveal.every((r) => Math.hypot(r[0] - x / 40, r[1] - y / 40) > 0.18)) reveal.push([x / 40, y / 40]);
            }
            return {
              prompt: 'Tap anywhere <b>exactly on a border</b> between two cells.',
              sub: 'Borders are where the colour suddenly changes.',
              code: 'col = hsv2rgb(vec3(cellId * 0.13, 0.55, 0.9));',
              shader: { defs: PTS, frag: PTS_BODY + 'col = hsv2rgb(vec3(id * 0.13, 0.55, 0.9)) * (0.6 + 0.4 * smoothstep(0.0, 0.25, d1));', uniforms },
              score: (u, v) => { const [a, b] = f1f2(pts, u, v); return Math.max(0, Math.min(1, 1 - (b - a - 0.02) / 0.06)); },
              reveal: reveal.length ? reveal : [pts[0]],
              explain: (el) => {
                el.append(h('p', { html: 'On a border F1 = F2, so <b>F2 − F1 = 0</b>. Here is F2 − F1 for this picture — the black lines are the borders:' }));
                el.append(h('div.view-wrap', shaderView({ defs: PTS, frag: PTS_BODY + 'col = vec3(smoothstep(0.0, 0.08, d2 - d1));', uniforms }, { size: 160 })));
              },
            };
          },
        },
        {
          id: 'match-cells', title: 'Match the cells', engine: 'slider', rounds: 4,
          blurb: 'Tune cell density, jitter and crack width.',
          gen: (rng, level) => {
            const k = rng.int(3, 9), j = rng.step(0, 1, 0.25), w = rng.step(0.02, 0.2, 0.02);
            const params = [{ name: 'k', label: 'cells across k', min: 2, max: 10, step: 1, target: k }];
            if (level >= 2) params.push({ name: 'j', label: 'jitter', min: 0, max: 1, step: 0.05, target: j });
            if (level === 3) params.push({ name: 'w', label: 'crack width', min: 0.02, max: 0.2, step: 0.01, target: w });
            const vals = (p) => [p.k, p.j ?? 1, p.w ?? 0.06];
            return {
              prompt: level === 1 ? 'Set the number of cells across.' : level === 2 ? 'Set cells and jitter (0 = perfect grid, 1 = random).' : 'Set cells, jitter and crack width.',
              params,
              build: (p) => { const [a, b, c] = vals(p); return { defs: VOR, frag: 'vec3 v = vor(uv * uK, uJ);\nfloat crack = 1.0 - smoothstep(uW, uW + 0.02, v.y - v.x);\ncol = mix(vec3(0.8, 0.6, 0.4), vec3(0.1), crack);', uniforms: { uK: a, uJ: b, uW: c } }; },
              code: (p) => { const [a, b, c] = vals(p); return `vec3 v = vor(uv * ${f(a)}, ${f(b, 2)}); // jitter\nfloat crack = 1.0 - smoothstep(${f(c, 2)}, ${f(c + 0.02, 2)}, F2 - F1);`; },
              tolerance: 0.04,
              explain: '<p>k = cells per side. Jitter 0 gives a square grid of identical cells; jitter 1 gives fully irregular ones. Crack width thresholds F2 − F1.</p>',
            };
          },
        },
        {
          id: 'voronoi-facts', title: 'Voronoi quiz', engine: 'mcq', rounds: 7,
          blurb: 'Concept checks about cellular noise.',
          questions: [
            q('What does F1 measure?', ['Distance to the nearest feature point', 'Number of cells', 'A random value per pixel', 'Distance to the image centre'], 'F1 = distance to closest point.'),
            q('Why does a Voronoi shader check 3×3 neighbouring cells?', ['The nearest point might be in a neighbouring cell', 'To blur the result', 'To make 9 octaves', 'WebGL requires loops of 9'], 'Only checking your own cell gives seams at grid borders.'),
            q('Which output gives cracks along the cell borders?', ['F2 − F1', 'F1', 'cell id', 'F1 + F2'], 'F2 − F1 = 0 exactly on borders.'),
            q('How do you give each Voronoi cell its own random colour?', ['Hash the id of the nearest point\'s cell', 'Use F1 as hue', 'Use uv as colour', 'Add time'], 'Remember which cell won, then hash its id.'),
            tf('With jitter 0, Voronoi cells form a regular square grid.', true, 'All points sit at cell centres → equal square cells.'),
            tf('F1 is largest exactly at a feature point.', false, 'F1 is 0 at a point (distance to itself). It\'s largest far from all points.'),
            tf('Voronoi noise is good for cracked mud, scales and caustics.', true, 'Anything with cells or a network of lines.'),
            q('How many point distances does a 3×3 Voronoi check per pixel?', ['9', '4', '1', '27'], '3 × 3 = 9 candidate points.', { level: 2 }),
            tf('Animating the point offsets over time (e.g. sin(uTime + hash)) makes the cells wobble.', true, 'Unity\'s "Angle Offset" does exactly that — great for caustics.', 2),
            q('Value noise and Voronoi both start with…', ['A grid of cells and a hash per cell', 'A texture', 'A loop over all pixels', 'Random directions'], 'Both use floor(p) for a cell id and hash it — then do different things with it.', { level: 2 }),
          ],
        },
      ],
    },
    // ================================================================== WARP & MASKS
    {
      id: 'noise.warp',
      title: 'Masks & domain warping',
      blurb: 'Threshold noise into shapes; offset uv by noise for swirls.',
      lesson: [
        {
          title: 'Noise is just data',
          body: `<p>Noise is a number from 0 to 1 at every pixel. Nobody says it has to be a grey picture! Threshold it with <code>step</code> and you get <b>shapes</b>: islands, puddles, camouflage.</p>
<p>Drag the threshold: more and more of the "landscape" sinks below the water line.</p>`,
          controls: [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (v) => ({ frag: 'float n = fbm(uv * 4.0);\nfloat land = step(uT, n);\ncol = mix(vec3(0.1, 0.3, 0.7), vec3(0.3, 0.7, 0.3), land);', uniforms: { uT: v.t } }),
          code: (v) => `float n = fbm(uv * 4.0);\nfloat land = step(${f(v.t, 2)}, n);   // 1 where n ≥ ${f(v.t, 2)}\ncol = mix(water, grass, land);`,
          after: '<div class="analogy">🌊 Think of the noise as a height map and the threshold as the sea level. Raise the sea → fewer, smaller islands.</div>',
        },
        {
          title: 'Soft masks: clouds',
          body: `<p><code>step</code> gives hard edges. <code>smoothstep(t - w, t + w, n)</code> gives a soft edge of width w — perfect for clouds and fog.</p>
<p>t = coverage (how much sky is cloudy), w = softness.</p>`,
          controls: [
            { name: 't', label: 'threshold t', min: 0.2, max: 0.8, step: 0.01, value: 0.5 },
            { name: 'w', label: 'softness w', min: 0.01, max: 0.3, step: 0.01, value: 0.1 },
          ],
          shader: (v) => ({ frag: 'float n = fbm(uv * 3.0 + vec2(uTime * 0.05, 0.0));\nfloat c = smoothstep(uT - uW, uT + uW, n);\ncol = mix(vec3(0.3, 0.55, 0.95), vec3(1.0), c);', uniforms: { uT: v.t, uW: v.w } }),
          code: (v) => `float n = fbm(uv * 3.0 + vec2(uTime * 0.05, 0.0));\nfloat c = smoothstep(${f(v.t - v.w, 2)}, ${f(v.t + v.w, 2)}, n);\ncol = mix(sky, white, c);`,
        },
        {
          title: 'Erosion / dissolve',
          body: `<p>Animate the threshold and the shape <b>eats itself away</b> — the classic <b>dissolve</b> effect for disappearing enemies or burning paper.</p>
<p>Bonus: the band <i>just above</i> the threshold is the burning edge: <code>step(t, n) - step(t + 0.05, n)</code>.</p>`,
          controls: [{ name: 't', label: 'dissolve amount', min: 0, max: 1, step: 0.01, value: 0.4 }],
          shader: (v) => ({ frag: 'vec3 base = texture2D(uTex, uv).rgb;\nfloat n = fbm(uv * 5.0);\nfloat keep = step(uT, n);\nfloat edge = keep - step(uT + 0.05, n);\ncol = base * keep + vec3(1.0, 0.5, 0.1) * edge * 2.0;', uniforms: { uT: v.t }, textures: { uTex: 'photo' } }),
          code: (v) => `float n = fbm(uv * 5.0);\nfloat keep = step(${f(v.t, 2)}, n);          // 0 = dissolved\nfloat edge = keep - step(${f(v.t + 0.05, 2)}, n);  // thin band\ncol = base * keep + orange * edge * 2.0;`,
          after: '<div class="tip">💡 In engines this is the <b>alpha clip / opacity mask</b> with a noise texture and a "dissolve" parameter. In Unreal: <i>Opacity Mask</i> + a noise texture; Unity: <i>Alpha Clip Threshold</i>.</div>',
        },
        {
          title: 'Domain warping: bend the input',
          body: `<p>Here's a powerful idea: instead of changing the <b>output</b> of a pattern, change its <b>input</b>. Offset <code>uv</code> by some noise before drawing.</p>
<p>Below, straight stripes get their uv pushed around by fBm. Increase the warp amount.</p>`,
          controls: [{ name: 'a', label: 'warp amount', min: 0, max: 0.5, step: 0.01, value: 0.1 }],
          shader: (v) => ({ frag: 'vec2 off = vec2(fbm(uv * 4.0), fbm(uv * 4.0 + 5.2)) - 0.5;\nvec2 q = uv + uA * off;\ncol = vec3(0.5 + 0.5 * sin(q.x * 40.0));', uniforms: { uA: v.a } }),
          code: (v) => `vec2 off = vec2(fbm(uv * 4.0), fbm(uv * 4.0 + 5.2)) - 0.5;\nvec2 q = uv + ${f(v.a, 2)} * off;   // bent coordinates\ncol = vec3(0.5 + 0.5 * sin(q.x * 40.0)); // stripes, drawn at q`,
          after: '<div class="note">Two fBm lookups (one shifted by 5.2) give two independent numbers → an offset <b>vector</b>. The <code>- 0.5</code> centres it so it pushes both ways.</div>',
        },
        {
          title: 'Warp noise with noise',
          body: `<p>Now warp <b>noise itself</b> by noise: <code>fbm(p + k * fbm2(p))</code>. You get marble, smoke, gas giants, alien flesh. Add time inside for slow, swirly motion.</p>`,
          controls: [{ name: 'k', label: 'warp strength k', min: 0, max: 5, step: 0.1, value: 2 }],
          shader: (v) => ({ frag: 'vec2 p = uv * 3.0;\nvec2 w = vec2(fbm(p + uTime * 0.1), fbm(p + 5.2 - uTime * 0.1));\nfloat n = fbm(p + uK * w);\ncol = mix(vec3(0.1, 0.05, 0.2), vec3(1.0, 0.7, 0.4), n);\ncol = mix(col, vec3(0.2, 0.6, 0.9), w.x * w.x);', uniforms: { uK: v.k } }),
          code: (v) => `vec2 p = uv * 3.0;\nvec2 w = vec2(fbm(p + uTime * 0.1), fbm(p + 5.2 - uTime * 0.1));\nfloat n = fbm(p + ${f(v.k, 1)} * w);   // noise of warped coords`,
          after: '<div class="tip">💡 Same idea as UV distortion with a flow/noise texture in engines: Unreal\'s <b>Panner</b> + noise texture → add to UVs.</div>',
          quiz: { q: 'Domain warping changes…', options: ['The input coordinates before a pattern is evaluated', 'The output colour after', 'The number of octaves'], answer: 0, explain: 'You warp the domain (the coordinates), then evaluate the pattern there.' },
        },
      ],
      games: [
        {
          id: 'name-noise', title: 'Name that noise', engine: 'mcq', rounds: 8,
          blurb: 'Review: which kind of noise is this?',
          gen: (rng, level) => {
            const keys = level === 1 ? ['white', 'value', 'voronoi', 'fbm'] : level === 2 ? ['white', 'cells', 'value', 'gradient', 'fbm', 'voronoi'] : Object.keys(ZOO);
            const ans = rng.pick(keys);
            const opts = distinct(rng, ans, () => rng.pick(keys), 4);
            const s = rng.int(0, 60), k = rng.int(4, 7);
            return {
              prompt: 'What kind of noise is this?',
              shader: { frag: ZOO[ans].frag(s, k) },
              options: opts.map((o) => ZOO[o].name),
              explain: '<p><b>White</b>: per-pixel static. <b>Per cell</b>: flat squares. <b>Value</b>: soft blobs on a grid. <b>Gradient</b>: softer, swirlier. <b>fBm</b>: blobs with fine detail on top. <b>Voronoi</b>: dark dots in bright cells. <b>Warped</b>: marbled, swirly fBm.</p>',
            };
          },
        },
        {
          id: 'match-mask', title: 'Match the mask', engine: 'slider', rounds: 4,
          blurb: 'Tune threshold, softness and warp to match the target.',
          gen: (rng, level) => {
            const t = rng.step(0.35, 0.65, 0.05), w = rng.step(0.02, 0.2, 0.02), a = rng.step(0, 0.4, 0.05);
            const params = [{ name: 't', label: 'threshold', min: 0.2, max: 0.8, step: 0.01, target: t }];
            if (level >= 2) params.push({ name: 'w', label: 'softness', min: 0.01, max: 0.25, step: 0.01, target: w });
            if (level === 3) params.push({ name: 'a', label: 'warp amount', min: 0, max: 0.5, step: 0.01, target: a });
            const vals = (p) => [p.t, p.w ?? 0.01, p.a ?? 0];
            return {
              prompt: level === 1 ? 'Set the threshold so the islands match.' : level === 2 ? 'Match the threshold and the edge softness.' : 'Match threshold, softness and how much the stripes are warped.',
              params,
              build: (p) => { const [a, b, c] = vals(p); return { frag: 'vec2 q = uv + uA * (vec2(fbm(uv * 3.0), fbm(uv * 3.0 + 5.2)) - 0.5);\nfloat n = fbm(q * 4.0);\ncol = vec3(smoothstep(uT - uW, uT + uW, n));', uniforms: { uT: a, uW: b, uA: c } }; },
              code: (p) => { const [a, b, c] = vals(p); return `vec2 q = uv + ${f(c, 2)} * warp(uv);\nfloat n = fbm(q * 4.0);\ncol = vec3(smoothstep(${f(a - b, 2)}, ${f(a + b, 2)}, n));`; },
              compare: 'pixels',
              explain: '<p>Higher threshold → less white. Softness widens the grey edge. Warp amount bends the shapes sideways.</p>',
            };
          },
        },
        {
          id: 'noise-for-job', title: 'Which noise for the job?', engine: 'buckets', rounds: 2,
          blurb: 'Pick the right kind of noise for each effect.',
          gen: () => ({
            prompt: 'Which noise would you start from?',
            buckets: ['📺 Hash / white', '☁️ Smooth / fBm', '🔷 Voronoi'],
            count: 10,
            items: [
              { text: 'TV static', bucket: 0 },
              { text: 'Fluffy clouds', bucket: 1 },
              { text: 'Cracked dry mud', bucket: 2, why: 'Cracks = cell borders (F2 − F1).' },
              { text: 'Terrain height map', bucket: 1 },
              { text: 'Pool caustics', bucket: 2, why: 'Bright wiggly network = Voronoi borders, animated.' },
              { text: 'Random colour per floor tile', bucket: 0, why: 'One hash per tile id — no smoothness needed.' },
              { text: 'Smoke / fog', bucket: 1 },
              { text: 'Lizard scales', bucket: 2 },
              { text: 'Film grain', bucket: 0 },
              { text: 'Marble (warped)', bucket: 1, why: 'Domain-warped fBm.' },
              { text: 'Cobblestone street', bucket: 2 },
              { text: 'Dissolve mask', bucket: 1, why: 'A smooth noise thresholded over time.' },
              { text: 'Random star positions in a grid', bucket: 0, why: 'hash(cell) decides if/where a star is.' },
              { text: 'Giraffe pattern', bucket: 2 },
            ],
          }),
        },
        {
          id: 'mask-fill', title: 'Mask it', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the mask code to match the target.',
          gen: (rng, level) => {
            const k = rng.pick(['3.0', '6.0', '12.0']);
            const masks = ['step(0.5, n)', '1.0 - step(0.5, n)', 'n', 'smoothstep(0.4, 0.6, n)'];
            const m = rng.pick(masks);
            if (level === 1) {
              return {
                prompt: 'Choose the mask line that matches the target:',
                template: `float n = fbm(uv * ${k});\ncol = vec3([[0]]);`,
                slots: noPeek([{ options: masks, answer: m }]),
                build: (vals) => ({ frag: `float n = fbm(uv * ${k});\ncol = vec3(${vals[0]});` }),
                explain: '<p><code>step(0.5, n)</code>: white where n ≥ 0.5, hard edge. <code>1.0 - …</code> inverts. <code>smoothstep</code>: soft edge. Plain <code>n</code>: the raw grey noise.</p>',
              };
            }
            const amt = rng.pick(['0.0', '0.2', '0.5']);
            const tmpl = level === 2 ? `float n = fbm(uv * [[0]]);\ncol = vec3([[1]]);` : `vec2 q = uv + [[2]] * (vec2(fbm(uv * 3.0), fbm(uv * 3.0 + 5.2)) - 0.5);\nfloat n = fbm(q * [[0]]);\ncol = vec3([[1]]);`;
            const slots = [{ options: ['3.0', '6.0', '12.0'], answer: k }, { options: masks, answer: m }];
            if (level === 3) slots.push({ options: ['0.0', '0.2', '0.5'], answer: amt });
            return {
              prompt: level === 2 ? 'Pick the frequency and the mask:' : 'Pick frequency, mask and warp amount:',
              template: tmpl,
              slots: noPeek(slots),
              build: (vals) => ({ frag: tmpl.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]) }),
              explain: '<p>Frequency = blob size. Mask = how the grey becomes shapes. Warp amount = how bent the shapes are (0.0 = not at all).</p>',
            };
          },
        },
      ],
    },
  ],
};

function n3(x) { return +(+x).toFixed(3) + ''; }
