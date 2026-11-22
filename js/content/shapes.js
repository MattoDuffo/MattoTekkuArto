// Topic — Shapes & distance fields: circles, SDFs, soft edges, outlines, primitives, booleans, glow.
import { tf, q, distinct, BW, f, n, G } from './_kit.js';

// ---------------------------------------------------------------- shared GLSL helpers
// One defs string used by every shader in this topic (unused functions are free).
const D = `
float gridL(vec2 uv){
  vec2 g = abs(fract(uv * 10.0 + 0.5) - 0.5) / 10.0;
  float l = 1.0 - smoothstep(0.0, 0.004, min(g.x, g.y));
  vec2 h = abs(uv - 0.5);
  float m = 1.0 - smoothstep(0.0, 0.005, min(h.x, h.y));
  return max(l * 0.5, m);
}
vec3 bgCol(vec2 uv){ return vec3(0.09, 0.1, 0.15) + 0.1 * gridL(uv); }
vec3 show(vec2 uv, float d){ return mix(bgCol(uv), vec3(1.0, 0.72, 0.3), 1.0 - smoothstep(-0.004, 0.004, d)); }
vec3 sdfVis(float d){
  vec3 c = d > 0.0 ? vec3(0.95, 0.6, 0.28) : vec3(0.35, 0.68, 1.0);
  c *= 0.45 + 0.55 * min(abs(d) * 2.5, 1.0);
  float m = abs(fract(d * 10.0 + 0.5) - 0.5) * 0.1;
  c *= 0.45 + 0.55 * smoothstep(0.0015, 0.0045, m);
  return mix(vec3(1.0), c, smoothstep(0.003, 0.007, abs(d)));
}
float mark(vec2 uv, vec2 p, float r){ return 1.0 - smoothstep(r - 0.004, r + 0.004, length(uv - p)); }
float lineMask(float d, float w){ return 1.0 - smoothstep(w - 0.003, w + 0.003, abs(d)); }
float smin(float a, float b, float k){ k = max(k, 0.0001); float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
`;
const S = (frag, uniforms) => ({ frag, defs: D, ...(uniforms ? { uniforms } : {}) });

// ---------------------------------------------------------------- JS mirrors
const r2 = (x) => Math.round(x * 100) / 100;
const N = (x) => n(r2(x));
const sdCircleJS = (px, py, r) => Math.hypot(px, py) - r;
const sdBoxJS = (px, py, bx, by) => {
  const dx = Math.abs(px) - bx, dy = Math.abs(py) - by;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
};
const sdSegJS = (px, py, ax, ay, bx, by) => {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const hh = G.clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * hh, pay - bay * hh);
};
const sminJS = (a, b, k) => { const hh = G.clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return G.mix(b, a, hh) - k * hh * (1 - hh); };

// Offsets (dx, dy) with "nice" lengths: Pythagorean triples scaled so everything has ≤ 2 decimals.
const TRIPLES = [];
for (const [a, b, c] of [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]) {
  for (const s of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1]) {
    const A = r2(a * s), B = r2(b * s), C = r2(c * s);
    if (A >= 0.06 && B <= 0.4 && C <= 0.5 && Math.abs(Math.hypot(A, B) - C) < 1e-9) TRIPLES.push([A, B, C]);
  }
}
function niceOffset(rng, level) {
  if (level === 1) {
    const k = rng.pick([0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) * rng.sign();
    return rng.chance() ? [k, 0] : [0, k];
  }
  const [a, b] = rng.pick(TRIPLES);
  let o = rng.chance() ? [a, b] : [b, a];
  return [o[0] * rng.sign(), o[1] * rng.sign()];
}
/** centre c so that c + off stays inside [0.05, 0.95] */
function centreFor(rng, off, fixed) {
  if (fixed) return [0.5, 0.5];
  const pick1 = (o) => {
    const lo = Math.max(0.1, 0.05 - o), hi = Math.min(0.9, 0.95 - o);
    const opts = []; for (let x = 0.1; x <= 0.9 + 1e-9; x += 0.05) if (x >= lo - 1e-9 && x <= hi + 1e-9) opts.push(r2(x));
    return opts.length ? rng.pick(opts) : 0.5;
  };
  return [pick1(off[0]), pick1(off[1])];
}

/** Paint-engine helper: keep generating until no cell centre is within `margin` of an edge. */
function safePaint(rng, make, W, H, margin = 0.025) {
  let c;
  for (let i = 0; i < 120; i++) {
    c = make();
    let ok = true, on = 0;
    for (let y = 0; y < H && ok; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      for (const chk of c.checks || [c.val]) if (Math.abs(chk(u, v)) < margin) ok = false;
      if (c.val(u, v) < 0) on++;
    }
    if (ok && on >= 3 && on <= W * H - 3) return c;
  }
  return c;
}

/** Find a point on the contour sd(p) = X, inside the square (for tap reveals). */
function contourPoint(sd, c, X) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  for (const [dx, dy] of dirs) {
    let prev = sd(c[0], c[1]) - X;
    for (let t = 0.002; t < 0.75; t += 0.002) {
      const x = c[0] + dx * t, y = c[1] + dy * t;
      const cur = sd(x, y) - X;
      if (prev < 0 !== cur < 0) { if (x > 0.04 && x < 0.96 && y > 0.04 && y < 0.96) return [x, y]; break; }
      prev = cur;
    }
  }
  return null;
}

/** mcq from a pool of code lines that all share a prefix. dir 'c2i' = code → image, 'i2c' = image → code */
function poolMcq(rng, level, pool, prefix, dir, explainTail = '', suffix = '') {
  const avail = pool.filter((p) => (p.lvl || 1) <= level);
  const ans = rng.pick(avail);
  const opts = distinct(rng, ans, () => rng.pick(avail), 4, (x) => x.code);
  const spec = (o) => S(prefix + o.code + suffix);
  const ex = `<p>${ans.why || ''}</p>${explainTail}`;
  if (dir === 'c2i') return { prompt: 'Which image does this code draw?', code: prefix + ans.code + suffix, options: opts.map((o) => ({ shader: spec(o) })), explain: ex };
  return { prompt: 'Which code drew this image?', shader: spec(ans), options: opts.map((o) => ({ code: o.code })), sub: prefix ? `Every option starts with:<br><code>${prefix.trim().replace(/\n/g, '<br>')}</code>` : '', explain: ex };
}

export default {
  id: 'shapes',
  title: 'Shapes & distance fields',
  icon: '⭕',
  blurb: 'Draw circles, boxes, rings and glowing blobs from one idea: "how far am I?"',
  cheatsheet: `
<p><b>Distance</b> from pixel to a point: <code>length(uv - c)</code>. Threshold it → a circle.</p>
<p><b>Signed distance (SDF)</b>: <code>d = length(uv - c) - r</code> → <b>negative inside</b>, <b>0 on the edge</b>, <b>positive outside</b>.</p>
<pre class="code">float d = sdCircle(uv - c, r);         // circle
float d = sdBox(uv - c, halfSize);     // box (HALF width/height!)
float d = sdSegment(uv, a, b) - t;     // capsule / thick line
float m = 1.0 - smoothstep(-w, w, d);  // soft / anti-aliased mask
float ring = abs(d) - t;               // outline of any shape
col = mix(bg, fg, m);</pre>
<p><b>Combine</b>: union <code>min(a,b)</code>, intersection <code>max(a,b)</code>, subtract B from A <code>max(a,-b)</code>, smooth union <code>smin(a,b,k)</code>.</p>
<p><b>Glow</b>: <code>0.02 / d</code> or <code>exp(-k * d)</code> for d &gt; 0.</p>
<p>HLSL/Unity: same names (<code>length</code>, <code>smoothstep</code>, <code>abs</code>, <code>fwidth</code>). Shader Graph's Ellipse / Rectangle / Rounded Rectangle nodes are SDFs inside. TextMeshPro fonts store an SDF in a texture.</p>`,
  concepts: [
    // ================================================================== 1. circles
    {
      id: 'shapes.circle',
      title: 'Distance & circles',
      blurb: 'Every pixel measures how far it is from a point. Threshold that → a circle.',
      lesson: [
        {
          title: 'How far is this pixel from a point?',
          body: `<p>Pick a point <code>c</code>. Every pixel can measure the distance from <b>itself</b> to <code>c</code>:</p>
<pre class="code">float d = length(uv - c);</pre>
<p><code>uv - c</code> is the little arrow from <code>c</code> to the pixel. <code>length()</code> is how long that arrow is.</p>
<p>Here we just show <code>d</code> as brightness: <b>black right at c</b> (distance 0), brighter the further away. Move the point (red dot).</p>`,
          controls: [
            { name: 'cx', label: 'c.x', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 'cy', label: 'c.y', min: 0, max: 1, step: 0.01, value: 0.5 },
          ],
          shader: (v) => S('float d = length(uv - uC);\ncol = vec3(d);\ncol = mix(col, vec3(1.0, 0.2, 0.2), mark(uv, uC, 0.015));', { uC: [v.cx, v.cy] }),
          code: (v) => `vec2 c = vec2(${f(v.cx, 2)}, ${f(v.cy, 2)});\nfloat d = length(uv - c); // distance from THIS pixel to c\ncol = vec3(d);             // 0 = black at c, brighter further away`,
          quiz: { q: 'Which pixel is the darkest?', options: ['The pixel right at c', 'The pixel at the top-right corner', 'All pixels are equally dark'], answer: 0, explain: 'At c the arrow uv − c has length 0 → brightness 0 → black.' },
        },
        {
          title: 'Pythagoras does the work',
          body: `<p>How does <code>length()</code> get the number? It's good old Pythagoras:</p>
<pre class="code">length(v) = sqrt(v.x * v.x + v.y * v.y)</pre>
<p>Drag the <b>white pixel</b> around. The blue line is the arrow <code>uv - c</code>; the code shows the actual numbers for that pixel.</p>
<div class="analogy">📏 <b>Analogy:</b> stick a pin at c. Every pixel holds a ruler to the pin and reads off a number. Every pixel does this at the same time, each with its own ruler.</div>`,
          controls: [
            { name: 'px', label: 'pixel uv.x', min: 0, max: 1, step: 0.01, value: 0.8 },
            { name: 'py', label: 'pixel uv.y', min: 0, max: 1, step: 0.01, value: 0.9 },
          ],
          shader: (v) => S(`float d = length(uv - vec2(0.5));
col = vec3(d) * 0.8 + 0.15 * gridL(uv);
float s = sdSegment(uv, vec2(0.5), uP);
col = mix(col, vec3(0.3, 0.8, 1.0), 1.0 - smoothstep(0.003, 0.007, s));
col = mix(col, vec3(1.0, 0.25, 0.25), mark(uv, vec2(0.5), 0.015));
col = mix(col, vec3(1.0), mark(uv, uP, 0.018));`, { uP: [v.px, v.py] }),
          code: (v) => {
            const dx = r2(v.px - 0.5), dy = r2(v.py - 0.5);
            return `// pixel p = (${f(v.px, 2)}, ${f(v.py, 2)}), centre c = (0.5, 0.5)
vec2 a = p - c;          // (${f(dx, 2)}, ${f(dy, 2)})
float d = length(a);     // sqrt(${f(dx, 2)}² + ${f(dy, 2)}²)
                         // = sqrt(${f(dx * dx, 4)} + ${f(dy * dy, 4)})
                         // = ${f(Math.hypot(dx, dy), 3)}`;
          },
          after: '<div class="tip">💡 <code>distance(a, b)</code> is the same as <code>length(a - b)</code>. Same names in HLSL. In Unreal it\'s the <b>Distance</b> node, in Shader Graph <b>Distance</b> or <b>Length</b>.</div>',
        },
        {
          title: 'From distance to a circle',
          body: `<p>What is a circle? <b>All the points closer than r to the centre.</b></p>
<p>So each pixel just asks: "is my distance smaller than r?"</p>
<pre class="code">float d = length(uv - vec2(0.5));
col = vec3(1.0 - step(r, d)); // 1 inside, 0 outside</pre>
<p><code>step(r, d)</code> is 0 while d &lt; r, and 1 once d ≥ r. <code>1.0 - </code> flips it so the inside is white. Left: the distance, with the ring where d = r. Right: the threshold.</p>`,
          controls: [{ name: 'r', label: 'radius r', min: 0.05, max: 0.6, step: 0.01, value: 0.3 }],
          shaders: [
            { spec: (v) => S('float d = length(uv - vec2(0.5));\ncol = vec3(d);\ncol = mix(col, vec3(1.0, 0.6, 0.2), lineMask(d - uR, 0.004));', { uR: v.r }), label: 'd (orange: d = r)' },
            { spec: (v) => S('float d = length(uv - vec2(0.5));\ncol = vec3(1.0 - step(uR, d));', { uR: v.r }), label: '1.0 - step(r, d)' },
          ],
          code: (v) => `float d = length(uv - vec2(0.5));\ncol = vec3(1.0 - step(${f(v.r, 2)}, d));`,
          after: '<div class="analogy">🐕 A dog on a leash of length r tied to a post: everywhere the dog can reach is the circle.</div>',
        },
        {
          title: 'Move it, resize it',
          body: `<p>The formula never changes. Only two numbers do:</p>
<ul><li><code>c</code> — <b>where</b> the circle is (its centre)</li><li><code>r</code> — <b>how big</b> it is (its radius)</li></ul>
<p>Play with them. Watch the code update.</p>`,
          controls: [
            { name: 'cx', label: 'c.x', min: 0, max: 1, step: 0.01, value: 0.35 },
            { name: 'cy', label: 'c.y', min: 0, max: 1, step: 0.01, value: 0.6 },
            { name: 'r', label: 'r', min: 0.02, max: 0.5, step: 0.01, value: 0.2 },
          ],
          shader: (v) => S('col = bgCol(uv);\nif (length(uv - uC) < uR) col = vec3(1.0, 0.72, 0.3);', { uC: [v.cx, v.cy], uR: v.r }),
          code: (v) => `col = background;\nif (length(uv - vec2(${f(v.cx, 2)}, ${f(v.cy, 2)})) < ${f(v.r, 2)})\n  col = vec3(1.0, 0.72, 0.3);`,
          after: '<p class="small dim">The faint grid lines are every 0.1 in uv, the brighter ones at 0.5.</p>',
          quiz: { q: 'A circle with c = (0.5, 0.5) and r = 0.5 touches…', options: ['All four edges of the square', 'Only the corners', 'Nothing — it is tiny'], answer: 0, explain: 'From the centre to each edge is exactly 0.5. The corners are ~0.71 away, so they stay outside.' },
        },
        {
          title: 'Why is my circle an oval?',
          body: `<p>In this app the canvas is square, so uv is square too. On a real <b>16:9 screen</b>, uv.x is stretched over more pixels than uv.y, and your circle becomes an <b>oval</b>.</p>
<p>The fix: scale x by the aspect ratio <i>before</i> measuring. The slider plays "screen stretch".</p>`,
          controls: [{ name: 'a', label: 'p.x *= aspect', min: 0.5, max: 2, step: 0.05, value: 1.5 }],
          shader: (v) => S('vec2 p = uv - 0.5;\np.x *= uA;\ncol = bgCol(uv);\nif (length(p) < 0.3) col = vec3(1.0, 0.72, 0.3);', { uA: v.a }),
          code: (v) => `vec2 p = uv - 0.5;\np.x *= ${f(v.a, 2)}; // aspect = width / height\nif (length(p) < 0.3) col = orange;`,
          after: '<div class="tip">In a full-screen effect you\'d write <code>p.x *= uRes.x / uRes.y;</code>. Unity: <code>_ScreenParams.x / _ScreenParams.y</code>.</div>',
        },
      ],
      games: [
        {
          id: 'circle-match', title: 'Circle matcher', engine: 'slider', rounds: 4,
          blurb: 'Set the centre and radius so your circle sits exactly on the target.',
          gen: (rng, level) => {
            const R = rng.step(0.15, 0.4, 0.05);
            const cx = level === 1 ? 0.5 : rng.step(0.3, 0.7, 0.05), cy = level === 1 ? 0.5 : rng.step(0.3, 0.7, 0.05);
            const r = level === 2 ? 0.2 : R;
            const params = [];
            if (level >= 2) params.push({ name: 'cx', label: 'c.x', min: 0, max: 1, step: 0.05, target: cx }, { name: 'cy', label: 'c.y', min: 0, max: 1, step: 0.05, target: cy });
            if (level !== 2) params.push({ name: 'r', label: 'radius r', min: 0.05, max: 0.5, step: 0.05, target: r });
            const get = (p) => [p.cx ?? cx, p.cy ?? cy, p.r ?? r];
            return {
              prompt: level === 2 ? 'Move the circle onto the target (radius is fixed at 0.2).' : level === 1 ? 'Set the radius to match the target.' : 'Match the centre AND the radius.',
              sub: 'Use the grid: thin lines every 0.1, bright lines at 0.5.',
              params,
              build: (p) => { const [x, y, rr] = get(p); return S('col = show(uv, length(uv - uC) - uR);', { uC: [x, y], uR: rr }); },
              code: (p) => { const [x, y, rr] = get(p); return `float d = length(uv - vec2(${f(x, 2)}, ${f(y, 2)}));\nif (d < ${f(rr, 2)}) col = orange;`; },
              explain: `<p>Target: c = (${N(cx)}, ${N(cy)}), r = ${N(r)}. Tip: the radius is the distance from the centre to the edge — count grid lines from the middle of the circle to its rim.</p>`,
            };
          },
        },
        {
          id: 'tap-centre', title: 'Tap the centre', engine: 'tap', rounds: 6,
          blurb: 'Find the point the distance is measured from.',
          gen: (rng, level) => {
            const c = [rng.float(0.25, 0.75), rng.float(0.25, 0.75)];
            const r = rng.float(0.1, 0.22);
            const styles = level === 1 ? ['fill'] : level === 2 ? ['fill', 'ring'] : ['ring', 'field', 'field'];
            const st = rng.pick(styles);
            const frag = st === 'fill' ? 'col = show(uv, length(uv - uC) - uR);'
              : st === 'ring' ? 'col = bgCol(uv);\ncol = mix(col, vec3(1.0, 0.72, 0.3), lineMask(length(uv - uC) - uR, 0.006));'
                : 'col = vec3(length(uv - uC) * 1.6);';
            return {
              prompt: st === 'field' ? 'This image is <code>col = vec3(length(uv - c) * 1.6);</code><br>Tap the point <b>c</b>.' : 'Tap the <b>centre</b> of the circle.',
              sub: st === 'field' ? 'Where is the distance zero?' : '',
              shader: S(frag, { uC: c, uR: r }),
              target: c, radius: 0.04,
              explain: st === 'field'
                ? '<p>Distance is 0 at c, so the darkest point is the centre. Brightness grows equally in every direction → round "valley".</p>'
                : `<p>The centre c = (${c[0].toFixed(2)}, ${c[1].toFixed(2)}) is the point whose distance to every point on the rim is the same (r ≈ ${r.toFixed(2)}).</p>`,
            };
          },
        },
        {
          id: 'dist-calc', title: 'Ruler in your head', engine: 'numeric', rounds: 6,
          blurb: 'Compute the distance from a pixel to the centre, like the GPU does.',
          gen: (rng, level) => {
            const off = niceOffset(rng, level);
            const c = centreFor(rng, off, level < 3);
            const p = [r2(c[0] + off[0]), r2(c[1] + off[1])];
            const d = r2(Math.hypot(off[0], off[1]));
            return {
              prompt: 'What is <code>d</code> for this pixel?',
              code: `vec2 c = vec2(${f(c[0], 2)}, ${f(c[1], 2)});\nvec2 p = vec2(${f(p[0], 2)}, ${f(p[1], 2)}); // this pixel's uv\nfloat d = length(p - c);`,
              sub: level === 1 ? 'One of the two differences is 0 — easy!' : 'sqrt(dx² + dy²). The numbers are chosen to come out nice.',
              shader: S('col = vec3(length(uv - uC)) * 0.6 + 0.12 * gridL(uv);\ncol = mix(col, vec3(0.3, 0.8, 1.0), 1.0 - smoothstep(0.003, 0.007, sdSegment(uv, uC, uP)));\ncol = mix(col, vec3(1.0, 0.25, 0.25), mark(uv, uC, 0.018));\ncol = mix(col, vec3(1.0), mark(uv, uP, 0.018));', { uC: c, uP: p }),
              shaderCaption: 'red = c, white = p',
              answer: d,
              explain: `<p>p − c = (${N(off[0])}, ${N(off[1])}).<br>d = sqrt(${N(off[0])}² + ${N(off[1])}²) = sqrt(${n(r2(off[0] * off[0] * 10000) / 10000, 4)} + ${n(r2(off[1] * off[1] * 10000) / 10000, 4)}) = <b>${N(d)}</b>.</p><p>Distance is never negative: the signs of dx, dy disappear when squared.</p>`,
            };
          },
        },
        {
          id: 'circle-gpu', title: 'Be the GPU: circle', engine: 'paint', rounds: 3,
          blurb: 'Each pixel measures its distance and decides: inside or outside?',
          gen: (rng, level) => {
            const W = 6;
            const c0 = safePaint(rng, () => {
              const cx = level === 1 ? 0.5 : rng.pick([0.33, 0.4, 0.5, 0.6, 0.67]);
              const cy = level === 1 ? 0.5 : rng.pick([0.33, 0.4, 0.5, 0.6, 0.67]);
              const r = rng.pick([0.2, 0.3, 0.35, 0.4, 0.45]);
              const inv = level === 3 && rng.chance(0.5);
              const val = (u, v) => (inv ? -1 : 1) * (Math.hypot(u - cx, v - cy) - r);
              return { cx, cy, r, inv, val, code: `float d = length(uv - vec2(${f(cx, 2)}, ${f(cy, 2)}));\nif (d ${inv ? '>' : '<'} ${f(r, 2)}) col = vec3(1.0);` };
            }, W, W, 0.02);
            return {
              prompt: 'Paint what this shader outputs:',
              code: c0.code,
              w: W, h: W, palette: BW, showUV: true,
              solve: (u, v) => +(c0.val(u, v) < 0),
              explain: `<p>For each cell: d = distance from its centre uv to (${N(c0.cx)}, ${N(c0.cy)}). ${c0.inv ? 'Here the test is <b>&gt;</b>, so pixels <b>outside</b> the circle are white — a hole.' : 'White if d &lt; ' + N(c0.r) + '.'}</p><p>Cell centres sit at 0.08, 0.25, 0.42, 0.58, 0.75, 0.92. Remember diagonal cells are further away than straight ones: (0.25, 0.25) is 0.35 from the middle, while (0.25, 0.5) is only 0.25.</p>`,
            };
          },
        },
        {
          id: 'circle-code', title: 'Which circle code?', engine: 'mcq', rounds: 8,
          blurb: 'Look at the circle, pick the centre and radius that made it.',
          gen: (rng, level) => {
            const mk = () => {
              const cx = level === 1 ? 0.5 : rng.pick([0.3, 0.5, 0.7]);
              const cy = level === 1 ? 0.5 : rng.pick([0.3, 0.5, 0.7]);
              const r = rng.pick(level === 1 ? [0.1, 0.25, 0.4] : [0.1, 0.2, 0.3]);
              const inv = level === 3 && rng.chance(0.3);
              return { cx, cy, r, inv };
            };
            const ans = mk();
            const opts = distinct(rng, ans, mk, 4, (o) => `${o.cx},${o.cy},${o.r},${o.inv}`);
            const code = (o) => `if (length(uv - vec2(${f(o.cx)}, ${f(o.cy)})) ${o.inv ? '>' : '<'} ${f(o.r)})\n  col = vec3(1.0);`;
            return {
              prompt: 'Which code drew this image?',
              sub: 'Grid lines every 0.1.',
              shader: S(`col = bgCol(uv);\nif (length(uv - vec2(${f(ans.cx)}, ${f(ans.cy)})) ${ans.inv ? '>' : '<'} ${f(ans.r)}) col = vec3(1.0);`),
              options: opts.map((o) => ({ code: code(o) })),
              explain: `<p>Find the centre first (where is the middle of the disc?), then measure from there to the rim for r. ${ans.inv ? '<b>&gt;</b> paints everything <i>outside</i> the circle.' : ''}</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 2. SDF idea
    {
      id: 'shapes.sdf',
      title: 'Signed distance fields',
      blurb: 'Subtract the radius: negative inside, zero on the edge, positive outside.',
      lesson: [
        {
          title: 'Subtract the radius',
          body: `<p>Tiny change, huge idea. Instead of comparing <code>d &lt; r</code>, subtract:</p>
<pre class="code">float d = length(uv - c) - r;</pre>
<ul><li>Inside the circle, distance &lt; r → <b>d is negative</b></li>
<li>Exactly on the edge → <b>d = 0</b></li>
<li>Outside → <b>d is positive</b></li></ul>
<p>Below: <b style="color:#ffa040">orange = positive</b>, <b style="color:#5aaeff">blue = negative</b>, brighter = bigger number.</p>`,
          controls: [{ name: 'r', label: 'r', min: 0.05, max: 0.5, step: 0.01, value: 0.3 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - uR;\ncol = d > 0.0 ? vec3(1.0, 0.6, 0.25) * d * 3.0 : vec3(0.3, 0.65, 1.0) * -d * 3.0;', { uR: v.r }),
          code: (v) => `float d = length(uv - vec2(0.5)) - ${f(v.r, 2)};\n// d < 0: inside   d = 0: edge   d > 0: outside`,
          after: '<div class="note">This number is called a <b>signed distance</b>. A function that gives it for every point is a <b>signed distance field (SDF)</b>.</div>',
        },
        {
          title: 'Read the number',
          body: `<p>Drag the white probe. The code shows the signed distance <i>at that pixel</i>.</p>
<p>The picture uses a "map" colouring we'll use a lot: <b>blue inside, orange outside, white line where d = 0</b>, and a thin dark line every 0.1.</p>`,
          controls: [
            { name: 'px', label: 'probe x', min: 0, max: 1, step: 0.01, value: 0.75 },
            { name: 'py', label: 'probe y', min: 0, max: 1, step: 0.01, value: 0.5 },
          ],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - 0.25;\ncol = sdfVis(d);\ncol = mix(col, vec3(0.0), mark(uv, uP, 0.022));\ncol = mix(col, vec3(1.0), mark(uv, uP, 0.015));', { uP: [v.px, v.py] }),
          code: (v) => {
            const L = Math.hypot(v.px - 0.5, v.py - 0.5), d = L - 0.25;
            const where = Math.abs(d) < 0.006 ? 'ON the edge' : d < 0 ? 'INSIDE' : 'OUTSIDE';
            return `float d = length(p - vec2(0.5)) - 0.25;\n//      = ${f(L, 3)} - 0.25\n//      = ${f(d, 3)}   → ${where}`;
          },
          quiz: { q: 'At the very centre of this circle (r = 0.25), d is…', options: ['0.25', '−0.25', '0'], answer: 1, explain: 'length = 0 at the centre, so d = 0 − 0.25 = −0.25. The centre is the most "inside" point.' },
        },
        {
          title: 'Contour lines, like a hiking map',
          body: `<p>Each dark line connects pixels with the <b>same</b> distance: 0.1, 0.2, 0.3… outside and −0.1, −0.2… inside.</p>
<div class="analogy">🗺️ <b>Analogy:</b> a hiking map's contour lines show equal height. Here they show equal <i>distance to the edge</i>. The white edge is "sea level", inside is below sea, outside is above.</div>
<p>For a circle the lines are circles too, evenly spaced — because distance grows at the same speed in every direction.</p>`,
          controls: [{ name: 'r', label: 'r', min: 0.05, max: 0.45, step: 0.01, value: 0.3 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - uR;\ncol = sdfVis(d);', { uR: v.r }),
          code: (v) => `float d = length(uv - vec2(0.5)) - ${f(v.r, 2)};\ncol = sdfVis(d); // helper: colour by sign, lines every 0.1`,
          quiz: { q: 'A pixel sits on the 2nd dark line outside the white edge. Its d is…', options: ['0.2', '−0.2', '2.0'], answer: 0, explain: 'Lines are every 0.1 and outside is positive: 1st line 0.1, 2nd line 0.2.' },
        },
        {
          title: 'How the lines are drawn: fract',
          body: `<p>No magic: <code>fract(d * 10.0)</code> makes a ramp 0→1 that restarts every time d grows by 0.1. Each restart is a "line".</p>
<p>Move the slider to change how many bands per unit of distance.</p>`,
          controls: [{ name: 'k', label: 'bands per unit', min: 2, max: 30, step: 1, value: 10 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - 0.25;\ncol = vec3(fract(d * uK));', { uK: v.k }),
          code: (v) => `float d = length(uv - vec2(0.5)) - 0.25;\ncol = vec3(fract(d * ${f(v.k, 0)})); // a new band every ${n(1 / v.k, 3)} of distance`,
          after: '<p class="small dim">Notice the band edge sits exactly on the circle\'s edge (d = 0) — fract restarts at every whole number, and 0 is one of them.</p>',
        },
        {
          title: 'Why bother with the sign?',
          body: `<p>One number now answers <b>two</b> questions for every pixel:</p>
<ul><li><b>Am I inside?</b> → look at the sign</li><li><b>How far from the edge?</b> → look at the size (abs)</li></ul>
<p>That's why SDFs are everywhere: with just <code>d</code> you can make <b>soft edges, outlines, glows, shadows and combine shapes</b> — the rest of this topic!</p>`,
          shaders: [
            { spec: S('float d = length(uv - vec2(0.5)) - 0.3;\ncol = vec3(step(d, 0.0));'), label: 'sign → inside?' },
            { spec: S('float d = length(uv - vec2(0.5)) - 0.3;\ncol = vec3(abs(d) * 4.0);'), label: 'abs(d) → how far from edge' },
          ],
          after: '<div class="tip">🔤 <b>TextMeshPro</b> and many game UIs store glyphs as SDF textures: that\'s how text stays sharp at any size and gets outlines/glow for free.</div>',
        },
        {
          title: 'The sdCircle helper',
          body: `<p>Because it's so common, it gets its own function (already available in this app):</p>
<pre class="code">float sdCircle(vec2 p, float r) { return length(p) - r; }</pre>
<p><code>p</code> is the pixel position <b>relative to the shape's centre</b>. To put the circle at c, you pass <code>uv - c</code>:</p>`,
          controls: [
            { name: 'cx', label: 'c.x', min: 0, max: 1, step: 0.01, value: 0.4 },
            { name: 'cy', label: 'c.y', min: 0, max: 1, step: 0.01, value: 0.55 },
            { name: 'r', label: 'r', min: 0.05, max: 0.4, step: 0.01, value: 0.2 },
          ],
          shader: (v) => S('col = sdfVis(sdCircle(uv - uC, uR));', { uC: [v.cx, v.cy], uR: v.r }),
          code: (v) => `float d = sdCircle(uv - vec2(${f(v.cx, 2)}, ${f(v.cy, 2)}), ${f(v.r, 2)});\ncol = sdfVis(d);`,
          quiz: { q: 'To move a shape to the RIGHT by 0.2, you…', options: ['subtract 0.2 from uv.x before calling it', 'add 0.2 to the result d', 'add 0.2 to r'], answer: 0, explain: 'sdCircle(uv − c, r): a bigger c.x means you subtract more, and the shape moves right. Adding to d would shrink it; adding to r grows it.' },
        },
      ],
      games: [
        {
          id: 'sdf-value', title: 'Signed distance calculator', engine: 'numeric', rounds: 6,
          blurb: 'Compute d = length(p − c) − r. Watch the sign!',
          gen: (rng, level) => {
            const off = niceOffset(rng, level);
            const L = r2(Math.hypot(off[0], off[1]));
            const c = centreFor(rng, off, level < 3);
            const p = [r2(c[0] + off[0]), r2(c[1] + off[1])];
            const cand = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45].filter((x) => Math.abs(x - L) > 0.001);
            const r = rng.pick(cand);
            const d = r2(L - r);
            return {
              prompt: 'What is <code>d</code> at pixel p?',
              code: `vec2 p = vec2(${f(p[0], 2)}, ${f(p[1], 2)});\nfloat d = length(p - vec2(${f(c[0], 2)}, ${f(c[1], 2)})) - ${f(r, 2)};`,
              sub: 'Negative = inside. Use the − key on the keypad.',
              shader: level < 3 ? S('col = sdfVis(length(uv - uC) - uR);\ncol = mix(col, vec3(0.0), mark(uv, uP, 0.022));\ncol = mix(col, vec3(1.0), mark(uv, uP, 0.015));', { uC: c, uR: r, uP: p }) : undefined,
              answer: d,
              explain: `<p>length(p − c) = length(${N(off[0])}, ${N(off[1])}) = ${N(L)}.<br>d = ${N(L)} − ${N(r)} = <b>${N(d)}</b> → ${d < 0 ? 'negative: the pixel is <b>inside</b>' : 'positive: the pixel is <b>outside</b>'}, ${N(Math.abs(d))} away from the edge.</p>`,
            };
          },
        },
        {
          id: 'tap-contour', title: 'Tap where d = …', engine: 'tap', rounds: 6,
          blurb: 'Read the distance map: find the edge, or a contour line.',
          gen: (rng, level) => {
            const box = level === 3 && rng.chance(0.6);
            const c = [rng.step(0.35, 0.65, 0.05), rng.step(0.35, 0.65, 0.05)];
            const r = rng.step(0.15, 0.3, 0.05);
            const b = [rng.step(0.15, 0.3, 0.05), rng.step(0.15, 0.3, 0.05)];
            const X = level === 1 ? 0 : rng.pick(level === 2 ? [0, 0.1, 0.1, -0.1, 0.2] : [0, 0.1, -0.1, 0.2]);
            const sd = box ? (x, y) => sdBoxJS(x - c[0], y - c[1], b[0], b[1]) : (x, y) => sdCircleJS(x - c[0], y - c[1], r);
            const frag = box ? 'col = sdfVis(sdBox(uv - uC, uB));' : 'col = sdfVis(sdCircle(uv - uC, uR));';
            const tp = contourPoint(sd, c, X) || contourPoint(sd, c, 0);
            const Xa = contourPoint(sd, c, X) ? X : 0;
            return {
              prompt: `Tap a spot where <b>d = ${n(Xa)}</b>.`,
              sub: 'Blue = inside (negative), orange = outside (positive), white = 0, dark lines every 0.1.',
              code: box ? `float d = sdBox(uv - c, b);` : `float d = sdCircle(uv - c, r);`,
              shader: S(frag, { uC: c, uR: r, uB: b }),
              score: (u, v) => { const e = Math.abs(sd(u, v) - Xa); return e < 0.025 ? 1 : Math.max(0, 1 - (e - 0.025) / 0.05); },
              reveal: [tp],
              explain: `<p>${Xa === 0 ? 'd = 0 is the white line: the edge of the shape.' : Xa > 0 ? `Positive = outside. Count ${Math.round(Xa * 10)} dark line(s) <b>outward</b> from the white edge.` : 'Negative = inside. One dark line <b>inward</b> from the white edge is −0.1.'} Any point on that whole line is correct — the green marker is just one of them.</p>`,
            };
          },
        },
        {
          id: 'sign-sense', title: 'Inside, outside, on the edge', engine: 'mcq', rounds: 8,
          blurb: 'Quick questions to make the sign of d second nature.',
          questions: [
            q('A pixel has d = −0.2. Where is it?', ['Inside, 0.2 from the edge', 'Outside, 0.2 from the edge', 'Exactly on the edge'], 'Negative means inside. The size (0.2) is how far from the edge.'),
            q('A pixel has d = 0.0. Where is it?', ['Exactly on the edge', 'At the centre', 'Far outside'], 'Zero distance to the edge → it is on the edge.'),
            q('A pixel has d = 0.35. Where is it?', ['Outside, 0.35 from the edge', 'Inside, 0.35 from the edge', 'On the edge'], 'Positive = outside.'),
            q('Circle r = 0.3. What is d at the centre?', ['−0.3', '0.3', '0'], 'length = 0 at the centre → 0 − 0.3 = −0.3.'),
            q('Which pixel is furthest from the edge?', ['d = −0.4', 'd = 0.1', 'd = 0.25', 'd = −0.05'], 'Compare abs(d): 0.4 is the biggest. The sign only says which side.'),
            q('Which pixel is closest to the edge?', ['d = −0.02', 'd = 0.1', 'd = −0.3', 'd = 0.2'], 'abs(−0.02) = 0.02 is the smallest.'),
            tf('In an SDF, every pixel inside the shape has a negative value.', true, 'That\'s the convention: inside negative, outside positive.'),
            tf('For sdCircle, the most negative value is at the centre.', true, 'The centre is the point furthest from the edge on the inside: d = −r.'),
            tf('sdCircle(uv - c, r) gives the same value at all pixels on the same contour line.', true, 'That is what a contour line is: equal d.'),
            tf('Adding 0.1 to d makes the drawn circle bigger.', false, 'd + 0.1 makes every value more positive, so fewer pixels are negative → the shape <b>shrinks</b> by 0.1. To grow it, subtract.', 2),
            tf('Subtracting 0.1 from d grows the shape by 0.1 in every direction.', true, 'd − 0.1 < 0 where d < 0.1 → everything within 0.1 outside the old edge is now inside. (This is how you "inflate" or round any shape.)', 2),
            tf('In uv units, a circle of r = 0.5 centred at (0.5, 0.5) has d > 0 in the corners.', true, 'Corners are √0.5 ≈ 0.707 from the centre → d ≈ 0.207 > 0.', 2),
            q('Which line computes a signed distance to a circle at (0.3, 0.6), radius 0.2?', [{ code: 'length(uv - vec2(0.3, 0.6)) - 0.2' }, { code: 'length(uv + vec2(0.3, 0.6)) - 0.2' }, { code: 'length(uv - vec2(0.3, 0.6)) + 0.2' }, { code: 'length(uv) - vec2(0.3, 0.6)' }], 'Subtract the centre from uv, take the length, subtract the radius.', { level: 2 }),
            q('d = length(uv - c) - r. If d = −0.1 at some pixel, how far is that pixel from c?', ['r − 0.1', 'r + 0.1', '0.1'], 'length = d + r = r − 0.1.', { level: 3 }),
          ],
        },
        {
          id: 'sdf-look', title: 'What does d look like?', engine: 'mcq', rounds: 8,
          blurb: 'Same signed distance, different ways to turn it into colour.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(d * 2.0);', why: 'Negative values show as black (colours clamp at 0), so the disc is black and it brightens outside.' },
            { code: 'col = vec3(-d * 2.0);', why: 'Flipping the sign: brightest at the centre (d = −0.3 → 0.6), black everywhere outside.' },
            { code: 'col = vec3(step(0.0, d));', why: 'step(0.0, d) = 1 where d ≥ 0 (outside) → white outside, black disc.' },
            { code: 'col = vec3(1.0 - step(0.0, d));', why: 'Flipped step: white disc on black.' },
            { code: 'col = vec3(abs(d) * 3.0);', why: 'abs(d) is 0 on the edge → a dark ring, brighter both inward and outward.', lvl: 2 },
            { code: 'col = vec3(fract(d * 10.0));', why: 'fract repeats every 0.1 of distance → concentric bands.', lvl: 2 },
            { code: 'col = vec3(1.0 - step(0.0, d + 0.15));', why: 'd + 0.15 < 0 only where d < −0.15 → a smaller white disc (r = 0.15).', lvl: 3 },
            { code: 'col = vec3(1.0 - step(0.0, d - 0.1));', why: 'd − 0.1 < 0 where d < 0.1 → a bigger white disc (r = 0.4).', lvl: 3 },
          ], 'float d = length(uv - vec2(0.5)) - 0.3;\n', rng.chance() ? 'c2i' : 'i2c'),
        },
      ],
    },
    // ================================================================== 3. soft edges
    {
      id: 'shapes.soft',
      title: 'Soft & anti-aliased edges',
      blurb: 'Use smoothstep around d = 0 for smooth edges, blur, and masks.',
      lesson: [
        {
          title: 'Staircase edges',
          body: `<p><code>step</code> is all-or-nothing: a pixel is either fully in or fully out. But a screen pixel is a little square, and the edge often cuts <i>through</i> it.</p>
<p>The result is a <b>staircase</b> ("jaggies", aliasing). Here we fake a low-resolution screen so you can see it. Left: step. Right: the soft edge we'll learn next.</p>`,
          controls: [{ name: 'n', label: 'pixels across', min: 8, max: 64, step: 1, value: 16 }],
          shaders: [
            { spec: (v) => S('vec2 q = (floor(uv * uN) + 0.5) / uN;\nfloat d = length(q - 0.5) - 0.3;\ncol = vec3(1.0 - step(0.0, d));', { uN: v.n }), label: 'step: hard' },
            { spec: (v) => S('vec2 q = (floor(uv * uN) + 0.5) / uN;\nfloat d = length(q - 0.5) - 0.3;\nfloat w = 0.7 / uN;\ncol = vec3(1.0 - smoothstep(-w, w, d));', { uN: v.n }), label: 'smoothstep: soft' },
          ],
          after: '<div class="note">Edge pixels that are <i>half</i> covered should be <i>half</i> bright. That\'s all anti-aliasing is.</div>',
        },
        {
          title: 'smoothstep across the edge',
          body: `<p>Instead of a hard jump at d = 0, ramp smoothly from d = −w to d = +w:</p>
<pre class="code">float m = 1.0 - smoothstep(-w, w, d);</pre>
<ul><li>d ≤ −w (well inside) → m = 1</li><li>d = 0 (the edge) → m = 0.5</li><li>d ≥ +w (well outside) → m = 0</li></ul>
<p>The graph shows m as d goes from −0.3 to 0.3. Compare with the hard step (dashed).</p>`,
          controls: [{ name: 'w', label: 'edge width w', min: 0.005, max: 0.3, step: 0.005, value: 0.1 }],
          graph: {
            fns: (v) => [
              { f: (x) => 1 - G.step(0, x), label: '1 - step(0, d)', dash: [5, 4], color: '#888' },
              { f: (x) => 1 - G.smoothstep(-v.w, v.w, x), label: 'm' },
            ],
            opts: { xmin: -0.3, xmax: 0.3, ymin: -0.1, ymax: 1.1 },
          },
          code: (v) => `float m = 1.0 - smoothstep(${f(-v.w, 3)}, ${f(v.w, 3)}, d);`,
          after: '<div class="tip">Why not <code>smoothstep(w, -w, d)</code>? With the edges reversed the result is <b>undefined</b> in the GLSL spec (it happens to work on many GPUs, but not guaranteed). <code>1.0 - smoothstep(-w, w, d)</code> is safe everywhere.</div>',
        },
        {
          title: 'Edge width: crisp or blurry',
          body: `<p>The same line of code does two jobs, depending on w:</p>
<ul><li><b>Tiny w</b> (about one pixel): a crisp, clean, anti-aliased edge.</li><li><b>Big w</b>: a soft, blurry blob — great for vignettes, soft masks, fake shadows.</li></ul>`,
          controls: [{ name: 'w', label: 'w', min: 0.002, max: 0.25, step: 0.002, value: 0.06 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - 0.3;\nfloat m = 1.0 - smoothstep(-uW, uW, d);\ncol = mix(vec3(0.1, 0.11, 0.16), vec3(1.0, 0.72, 0.3), m);', { uW: v.w }),
          code: (v) => `float d = length(uv - vec2(0.5)) - 0.3;\nfloat m = 1.0 - smoothstep(${f(-v.w, 3)}, ${f(v.w, 3)}, d);\ncol = mix(background, orange, m);`,
          quiz: { q: 'What is m exactly on the edge (d = 0)?', options: ['0', '0.5', '1'], answer: 1, explain: 'd = 0 is halfway between −w and +w, and smoothstep is 0.5 at its midpoint.' },
        },
        {
          title: 'm is a mask',
          body: `<p><code>m</code> is a number from 0 to 1 per pixel: a <b>mask</b>. Use it with <code>mix</code> to blend any two colours (or textures, or whole effects):</p>
<pre class="code">col = mix(background, shapeColour, m);</pre>
<p>Use it as alpha, multiply lights by it, stack several masks — the same thing you do with masks in Photoshop or Substance.</p>`,
          controls: [
            { name: 'w', label: 'w', min: 0.002, max: 0.2, step: 0.002, value: 0.02 },
            { name: 'r', label: 'r', min: 0.05, max: 0.45, step: 0.01, value: 0.3 },
          ],
          shaders: [
            { spec: (v) => S('float d = length(uv - vec2(0.5)) - uR;\ncol = vec3(1.0 - smoothstep(-uW, uW, d));', { uW: v.w, uR: v.r }), label: 'mask m' },
            { spec: (v) => S('float d = length(uv - vec2(0.5)) - uR;\nfloat m = 1.0 - smoothstep(-uW, uW, d);\nvec3 bg = mix(vec3(0.1, 0.2, 0.5), vec3(0.6, 0.2, 0.4), uv.y);\nvec3 fg = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.4, 0.1), uv.x);\ncol = mix(bg, fg, m);', { uW: v.w, uR: v.r }), label: 'mix(bg, fg, m)' },
          ],
          code: (v) => `float d = length(uv - vec2(0.5)) - ${f(v.r, 2)};\nfloat m = 1.0 - smoothstep(${f(-v.w, 3)}, ${f(v.w, 3)}, d);\ncol = mix(bg, fg, m);`,
        },
        {
          title: 'Exactly one pixel: fwidth (optional)',
          body: `<p>A fixed w like 0.003 is "one pixel" only at one resolution. Zoom in and it gets blurry, zoom out and it gets jaggy.</p>
<p><code>fwidth(d)</code> asks the GPU: <i>how much does d change from this pixel to its neighbour?</i> That's exactly one pixel's worth of distance, at any resolution.</p>
<pre class="code">float w = fwidth(d);
float m = 1.0 - smoothstep(-w, w, d);</pre>
<p>Slider = zoom. Left uses a fixed w, right uses fwidth: it stays crisp.</p>`,
          controls: [{ name: 'z', label: 'zoom', min: 1, max: 12, step: 0.1, value: 6 }],
          shaders: [
            { spec: (v) => S('vec2 p = (uv - 0.5) / uZ + vec2(0.3, 0.0);\nfloat d = length(p) - 0.3;\nfloat w = 0.004;\ncol = vec3(1.0 - smoothstep(-w, w, d));', { uZ: v.z }), label: 'fixed w = 0.004' },
            { spec: (v) => S('vec2 p = (uv - 0.5) / uZ + vec2(0.3, 0.0);\nfloat d = length(p) - 0.3;\nfloat w = fwidth(d);\ncol = vec3(1.0 - smoothstep(-w, w, d));', { uZ: v.z }), label: 'w = fwidth(d)' },
          ],
          after: '<div class="tip">fwidth exists in HLSL too (and <code>ddx</code>/<code>ddy</code>). It works because the GPU runs pixels in little 2×2 groups and can compare neighbours. In WebGL 1 it needs an extension, which this app enables.</div>',
        },
      ],
      games: [
        {
          id: 'edge-match', title: 'Edge softness matcher', engine: 'slider', rounds: 4,
          blurb: 'Dial in the edge width w so the blur matches the target.',
          gen: (rng, level) => {
            const w = rng.pick(level === 1 ? [0.01, 0.1, 0.2] : [0.02, 0.05, 0.08, 0.12, 0.15, 0.2]);
            const r = level === 3 ? rng.step(0.15, 0.35, 0.05) : 0.3;
            const params = [{ name: 'w', label: 'edge width w', min: 0, max: 0.25, step: 0.01, target: w }];
            if (level === 3) params.push({ name: 'r', label: 'radius r', min: 0.1, max: 0.45, step: 0.05, target: r });
            return {
              prompt: level === 3 ? 'Match the edge width <b>and</b> the radius.' : 'Match the edge width w.',
              sub: 'Tip: the blur spreads from r − w to r + w.',
              params,
              build: (p) => S('float d = length(uv - vec2(0.5)) - uR;\nfloat w = max(uW, 0.002);\ncol = mix(bgCol(uv), vec3(1.0, 0.72, 0.3), 1.0 - smoothstep(-w, w, d));', { uW: p.w, uR: p.r ?? r }),
              code: (p) => `float d = length(uv - vec2(0.5)) - ${f(p.r ?? r, 2)};\nfloat m = 1.0 - smoothstep(${f(-p.w, 2)}, ${f(p.w, 2)}, d);`,
              explain: `<p>Target w = ${N(w)}. The blurry band is 2·w wide (${N(2 * w)} in uv), centred on the edge — count the grid lines it spans.</p>`,
            };
          },
        },
        {
          id: 'smooth-value', title: 'How bright is the edge pixel?', engine: 'numeric', rounds: 6,
          blurb: 'Compute m = 1 − smoothstep(−w, w, d) by hand.',
          gen: (rng, level) => {
            const w = level === 3 ? rng.pick([0.1, 0.2]) : 0.1;
            let d, extra = '';
            if (level === 1) d = rng.pick([-0.3, -0.2, -0.1, 0, 0, 0.1, 0.2, 0.3]);
            else d = rng.pick([-0.05, 0.05, -0.05, 0.05, 0, -0.15, 0.15].map((x) => r2(x * w / 0.1)));
            let codeD = `float d = ${f(d, 2)};`;
            if (level === 3 && rng.chance(0.5) && d > -0.15) {
              const rr = rng.pick([0.2, 0.25, 0.3]);
              const L = r2(rr + d);
              codeD = `float d = ${f(L, 2)} - ${f(rr, 2)}; // length(p - c) - r`;
              extra = `d = ${N(L)} − ${N(rr)} = ${N(d)}. `;
            }
            const t = G.clamp((d + w) / (2 * w), 0, 1);
            const s = t * t * (3 - 2 * t);
            const m = 1 - s;
            return {
              prompt: 'What is <code>m</code>?',
              code: `${codeD}\nfloat m = 1.0 - smoothstep(${f(-w)}, ${f(w)}, d);`,
              sub: level === 1 ? 'Outside the range −w..w smoothstep is just 0 or 1.' : 'smoothstep: t = (d − e0) / (e1 − e0), then t·t·(3 − 2t). Answer to 2 decimals.',
              graph: level === 1 ? { fns: [{ f: (x) => 1 - G.smoothstep(-w, w, x), label: 'm(d)' }], opts: { xmin: -0.3, xmax: 0.3, ymin: -0.1, ymax: 1.1 } } : undefined,
              answer: r2(m),
              tolerance: 0.011,
              explain: `<p>${extra}t = (${N(d)} − (${N(-w)})) / ${N(2 * w)} = ${n(t, 3)} (clamped to 0..1).<br>smoothstep = t²(3 − 2t) = ${n(s, 4)}.<br>m = 1 − ${n(s, 4)} = <b>${n(m, 3)}</b>.</p><p>${d < 0 ? 'Inside → m is above 0.5.' : d > 0 ? 'Outside → m is below 0.5.' : 'On the edge → exactly 0.5.'}</p>`,
            };
          },
        },
        {
          id: 'soft-pick', title: 'Hard, soft or hole?', engine: 'mcq', rounds: 8,
          blurb: 'Match edge code to its look.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(1.0 - step(0.0, d));', why: 'step = hard, all-or-nothing edge.' },
            { code: 'col = vec3(1.0 - smoothstep(-0.15, 0.15, d));', why: 'w = 0.15 → a very blurry edge, from r − 0.15 to r + 0.15.' },
            { code: 'col = vec3(smoothstep(-0.15, 0.15, d));', why: 'Without the "1.0 −" the mask is flipped: dark inside, bright outside — a blurry hole.' },
            { code: 'col = vec3(1.0 - smoothstep(-0.05, 0.05, d));', why: 'w = 0.05 → slightly soft edge.', lvl: 2 },
            { code: 'col = vec3(1.0 - smoothstep(0.0, 0.2, d));', why: 'Ramp only from d = 0 to 0.2: solid up to the edge, blur only <b>outside</b> (the shape looks bigger).', lvl: 2 },
            { code: 'col = vec3(1.0 - smoothstep(-0.2, 0.0, d));', why: 'Ramp from −0.2 to 0: the blur is all <b>inside</b>, outside the edge is already black (the shape looks smaller).', lvl: 3 },
            { code: 'col = vec3(step(0.0, d));', why: 'Hard edge, flipped: black disc on white.', lvl: 3 },
          ], 'float d = length(uv - vec2(0.5)) - 0.25;\n', rng.chance() ? 'c2i' : 'i2c', '<p>Remember: the transition happens between the two smoothstep edges.</p>'),
        },
        {
          id: 'soft-fill', title: 'Fill the soft edge', engine: 'codefill', rounds: 5,
          blurb: 'Complete the smoothstep mask so it matches the target.',
          gen: (rng, level) => {
            const w = rng.pick([0.02, 0.1, 0.2]);
            const ws = ['0.02', '0.1', '0.2'];
            const slots = [
              { options: ['1.0', '0.0', '1', 'd'], answer: '1.0' },
              { options: [...ws.map((x) => '-' + x), '0.0'], answer: '-' + f(w) },
              { options: [...ws, '0.0'], answer: f(w) },
            ];
            const template = `float d = length(uv - vec2(0.5)) - 0.3;\nfloat m = [[0]] - smoothstep([[1]], [[2]], d);\ncol = vec3(m);`;
            return {
              prompt: 'Fill the blanks so "Yours" matches the target.',
              sub: level === 1 ? 'The edge should be symmetric: −w and +w.' : 'Look at how wide the blur is. (Try "1" instead of "1.0" for fun.)',
              template, slots,
              build: (vals) => S(template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i])),
              explain: `<p>Target w = ${f(w)}: <code>1.0 - smoothstep(-${f(w)}, ${f(w)}, d)</code>. "1" is an int and GLSL ES 1.0 won't subtract a float from it — compile error!</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 4. rings
    {
      id: 'shapes.rings',
      title: 'Rings & outlines',
      blurb: 'abs(d) − thickness turns any shape into its outline.',
      lesson: [
        {
          title: 'abs(d): distance to the edge line',
          body: `<p><code>abs()</code> throws away the sign. Inside values (negative) become positive too.</p>
<p>So <code>abs(d)</code> no longer means "how far from the shape"… it means <b>"how far from the edge line"</b>, from either side.</p>
<p>The graph is a slice along the horizontal middle line (uv.y = 0.5): d in yellow, abs(d) in blue. abs folds the dip below zero upward.</p>`,
          controls: [{ name: 'r', label: 'r', min: 0.1, max: 0.4, step: 0.01, value: 0.25 }],
          graph: {
            fns: (v) => [
              { f: (x) => Math.abs(x - 0.5) - v.r, label: 'd' },
              { f: (x) => Math.abs(Math.abs(x - 0.5) - v.r), label: 'abs(d)' },
            ],
            opts: { xmin: 0, xmax: 1, ymin: -0.45, ymax: 0.5 },
          },
          shaders: [
            { spec: (v) => S('float d = length(uv - vec2(0.5)) - uR;\ncol = sdfVis(d);', { uR: v.r }), label: 'd' },
            { spec: (v) => S('float d = length(uv - vec2(0.5)) - uR;\ncol = sdfVis(abs(d));', { uR: v.r }), label: 'abs(d)' },
          ],
          after: '<p class="small dim">Right image: everything is orange (positive) now, and 0 only on the old edge.</p>',
        },
        {
          title: 'Give the line some thickness',
          body: `<p>Now subtract a thickness <code>t</code>:</p>
<pre class="code">float ring = abs(d) - t;</pre>
<p>This is negative where the pixel is <b>within t of the edge</b> — a band hugging the edge. And look: it's a brand new SDF (blue inside the band, white edges, orange outside)!</p>`,
          controls: [{ name: 't', label: 'thickness t', min: 0, max: 0.15, step: 0.005, value: 0.04 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - 0.28;\ncol = sdfVis(abs(d) - uT);', { uT: v.t }),
          code: (v) => `float d = length(uv - vec2(0.5)) - 0.28;\nfloat ring = abs(d) - ${f(v.t, 3)};\n// the band is ${f(2 * v.t, 3)} wide: t on each side of the edge`,
          quiz: { q: 'With t = 0.05, how wide is the ring band in total?', options: ['0.05', '0.1', '0.025'], answer: 1, explain: 't goes both inward and outward from the edge: 2 × 0.05 = 0.1.' },
        },
        {
          title: 'Draw the ring',
          body: `<p>A ring is just a shape with an SDF, so draw it like any other: soft edge with smoothstep.</p>`,
          controls: [
            { name: 'r', label: 'radius r', min: 0.05, max: 0.45, step: 0.01, value: 0.3 },
            { name: 't', label: 'thickness t', min: 0.005, max: 0.15, step: 0.005, value: 0.03 },
          ],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - uR;\nfloat ring = abs(d) - uT;\ncol = mix(bgCol(uv), vec3(0.4, 0.9, 1.0), 1.0 - smoothstep(-0.004, 0.004, ring));', { uR: v.r, uT: v.t }),
          code: (v) => `float d = length(uv - vec2(0.5)) - ${f(v.r, 2)};\nfloat ring = abs(d) - ${f(v.t, 3)};\nfloat m = 1.0 - smoothstep(-0.004, 0.004, ring);\ncol = mix(background, cyan, m);`,
        },
        {
          title: 'Outline ANY shape',
          body: `<p>The trick doesn't care what the shape is. Here's a box (we'll meet <code>sdBox</code> properly soon):</p>
<pre class="code">float d = sdBox(uv - 0.5, vec2(0.3, 0.2));
float outline = abs(d) - t;</pre>
<p>Notice the outside corners come out <b>rounded</b> — because the distance from a corner point is round.</p>`,
          controls: [{ name: 't', label: 'thickness t', min: 0.005, max: 0.12, step: 0.005, value: 0.03 }],
          shader: (v) => S('float d = sdBox(uv - 0.5, vec2(0.3, 0.2));\ncol = mix(bgCol(uv), vec3(0.4, 0.9, 1.0), 1.0 - smoothstep(-0.004, 0.004, abs(d) - uT));', { uT: v.t }),
          code: (v) => `float d = sdBox(uv - 0.5, vec2(0.3, 0.2));\nfloat outline = abs(d) - ${f(v.t, 3)};`,
          after: '<div class="tip">This is a cheap way to do UI outlines, selection highlights and "toon" ink lines on 2D shapes.</div>',
        },
        {
          title: 'Rings of rings',
          body: `<p>Since a ring is an SDF, you can ring it <b>again</b>:</p>
<pre class="code">float r1 = abs(d) - 0.08;   // thick ring
float r2 = abs(r1) - 0.015; // outline OF the ring → 2 thin rings</pre>
<p>Each <code>abs(...) - t</code> doubles the number of lines. Artists call this "onion" layering.</p>`,
          controls: [{ name: 'k', label: 'how many abs() layers', min: 0, max: 3, step: 1, value: 2 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - 0.3;\nif (uK > 0.5) d = abs(d) - 0.12;\nif (uK > 1.5) d = abs(d) - 0.05;\nif (uK > 2.5) d = abs(d) - 0.02;\ncol = mix(bgCol(uv), vec3(0.4, 0.9, 1.0), 1.0 - smoothstep(-0.004, 0.004, d));', { uK: v.k }),
          code: (v) => ['float d = length(uv - vec2(0.5)) - 0.3;', 'd = abs(d) - 0.12;', 'd = abs(d) - 0.05;', 'd = abs(d) - 0.02;'].slice(0, v.k + 1).join('\n') + '\ncol = mix(bg, cyan, 1.0 - smoothstep(-0.004, 0.004, d));',
        },
        {
          title: 'Fill + outline together',
          body: `<p>Layer colours with <code>mix</code>, bottom to top: background, then fill (where d &lt; 0), then outline (where the ring &lt; 0) on top.</p>`,
          controls: [{ name: 't', label: 'outline t', min: 0.005, max: 0.06, step: 0.005, value: 0.015 }],
          shader: (v) => S('float d = length(uv - vec2(0.5)) - 0.3;\nfloat fill = 1.0 - smoothstep(-0.004, 0.004, d);\nfloat line = 1.0 - smoothstep(-0.004, 0.004, abs(d) - uT);\ncol = bgCol(uv);\ncol = mix(col, vec3(1.0, 0.72, 0.3), fill);\ncol = mix(col, vec3(0.1, 0.05, 0.0), line);', { uT: v.t }),
          code: (v) => `float fill = 1.0 - smoothstep(-0.004, 0.004, d);\nfloat line = 1.0 - smoothstep(-0.004, 0.004, abs(d) - ${f(v.t, 3)});\ncol = background;\ncol = mix(col, orange, fill);   // fill first\ncol = mix(col, darkBrown, line); // outline on top`,
          quiz: { q: 'If you swap the order (outline first, then fill), what happens?', options: ['The inner half of the outline gets covered by the fill', 'Nothing changes', 'The shader fails to compile'], answer: 0, explain: 'The outline straddles the edge. The fill (d < 0) paints over its inner half, so the line looks thinner.' },
        },
      ],
      games: [
        {
          id: 'ring-match', title: 'Ring matcher', engine: 'slider', rounds: 4,
          blurb: 'Match the ring\'s radius and thickness.',
          gen: (rng, level) => {
            const r = level === 1 ? 0.3 : rng.step(0.15, 0.4, 0.05);
            const t = rng.pick(level === 1 ? [0.01, 0.05, 0.1] : [0.01, 0.02, 0.04, 0.06, 0.08]);
            const params = [];
            if (level >= 2) params.push({ name: 'r', label: 'radius r', min: 0.1, max: 0.45, step: 0.05, target: r });
            params.push({ name: 't', label: 'thickness t', min: 0, max: 0.12, step: 0.01, target: t });
            return {
              prompt: level === 1 ? 'Match the ring thickness t.' : 'Match radius and thickness.',
              sub: 'Total ring width = 2 × t.',
              params,
              build: (p) => S('float d = length(uv - vec2(0.5)) - uR;\ncol = mix(bgCol(uv), vec3(0.4, 0.9, 1.0), 1.0 - smoothstep(-0.003, 0.003, abs(d) - max(uT, 0.002)));', { uR: p.r ?? r, uT: p.t }),
              code: (p) => `float d = length(uv - vec2(0.5)) - ${f(p.r ?? r, 2)};\nfloat ring = abs(d) - ${f(p.t, 2)};`,
              explain: `<p>Target: r = ${N(r)}, t = ${N(t)}. r is measured to the <b>middle</b> of the band; the band reaches from ${N(r - t)} to ${N(r + t)}.</p>`,
            };
          },
        },
        {
          id: 'ring-value', title: 'On the ring?', engine: 'numeric', rounds: 6,
          blurb: 'Compute abs(d) − t. Negative means "on the ring".',
          gen: (rng, level) => {
            const t = rng.pick([0.05, 0.1]);
            let d = rng.pick([0.02, 0.05, 0.1, 0.15, 0.2, 0.3].filter((x) => x !== t));
            if (level >= 2 && rng.chance(0.6)) d = -d;
            let code = `float d = ${f(d, 2)};`, pre = '';
            if (level === 3 && d > -0.2) {
              const rr = rng.pick([0.25, 0.3, 0.35]);
              const L = r2(rr + d);
              code = `float d = length(p - c) - ${f(rr, 2)}; // length(p - c) = ${f(L, 2)}`;
              pre = `d = ${N(L)} − ${N(rr)} = ${N(d)}. `;
            }
            const ring = r2(Math.abs(d) - t);
            return {
              prompt: 'What is <code>ring</code>?',
              code: `${code}\nfloat ring = abs(d) - ${f(t, 2)};`,
              sub: 'Then think: is this pixel on the ring?',
              answer: ring,
              explain: `<p>${pre}abs(${N(d)}) = ${N(Math.abs(d))}, minus ${N(t)} = <b>${N(ring)}</b>.</p><p>${ring < 0 ? 'Negative → the pixel is <b>on the ring</b> (within t of the edge).' : 'Positive → the pixel is <b>off the ring</b>, ' + N(ring) + ' away from it.'} ${d < 0 ? 'The pixel was inside the circle, but abs() makes that irrelevant: only distance to the edge counts.' : ''}</p>`,
            };
          },
        },
        {
          id: 'ring-gpu', title: 'Be the GPU: ring', engine: 'paint', rounds: 3,
          blurb: 'Paint the pixels within t of the edge.',
          gen: (rng, level) => {
            const W = 6;
            const c0 = safePaint(rng, () => {
              const box = level === 3 && rng.chance(0.5);
              const R = rng.pick([0.2, 0.25, 0.3, 0.35]);
              const T = rng.pick([0.06, 0.08, 0.1]);
              const b = rng.pick([0.2, 0.25, 0.3]);
              const sd = box ? (u, v) => sdBoxJS(u - 0.5, v - 0.5, b, b) : (u, v) => Math.hypot(u - 0.5, v - 0.5) - R;
              return {
                val: (u, v) => Math.abs(sd(u, v)) - T, box,
                code: box ? `float d = sdBox(uv - 0.5, vec2(${f(b)}));\nif (abs(d) < ${f(T, 2)}) col = vec3(1.0);` : `float d = length(uv - vec2(0.5)) - ${f(R, 2)};\nif (abs(d) < ${f(T, 2)}) col = vec3(1.0);`,
                note: box ? `The box spans ${N(0.5 - b)}..${N(0.5 + b)}; white within ${N(T)} of that border (inside or outside).` : `White where the distance from the centre is between ${N(R - T)} and ${N(R + T)}.`,
              };
            }, W, W, 0.02);
            return {
              prompt: 'Paint what this shader outputs:',
              code: c0.code, w: W, h: W, palette: BW, showUV: level < 3,
              solve: (u, v) => +(c0.val(u, v) < 0),
              explain: `<p>${c0.note}</p><p>abs(d) &lt; t ⇔ "closer than t to the edge".</p>`,
            };
          },
        },
        {
          id: 'ring-code', title: 'Fill, ring or both?', engine: 'mcq', rounds: 8,
          blurb: 'Match outline code to its image.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = vec3(1.0 - step(0.0, d));', why: 'Plain fill: white where d < 0.' },
            { code: 'col = vec3(1.0 - step(0.0, abs(d) - 0.02));', why: 'Thin ring: within 0.02 of the edge.' },
            { code: 'col = vec3(1.0 - step(0.0, abs(d) - 0.1));', why: 'Thick ring: within 0.1 of the edge (0.2 wide).' },
            { code: 'col = vec3(step(0.0, abs(d) - 0.05));', why: 'No "1.0 −": everything EXCEPT the ring is white.', lvl: 2 },
            { code: 'col = vec3(1.0 - step(0.0, abs(d + 0.15) - 0.02));', why: 'd + 0.15 shrinks the circle to r = 0.15, then a thin ring of that.', lvl: 2 },
            { code: 'col = vec3(1.0 - step(0.0, abs(abs(d) - 0.08) - 0.02));', why: 'Ring of a ring → two thin rings, at r ± 0.08.', lvl: 3 },
            { code: 'col = vec3(1.0 - step(0.0, abs(d) - 0.02)) + 0.4 * (1.0 - step(0.0, d));', why: 'Grey fill plus a white outline on top (values above 1 clamp to white).', lvl: 3 },
          ], 'float d = length(uv - vec2(0.5)) - 0.3;\n', rng.chance() ? 'c2i' : 'i2c'),
        },
      ],
    },
    // ================================================================== 5. primitives
    {
      id: 'shapes.prims',
      title: 'Boxes, lines & other primitives',
      blurb: 'sdBox, rounded boxes, segments and capsules.',
      lesson: [
        {
          title: 'A box SDF',
          body: `<p>Circles aren't the only shape with a distance function. Here's the box, already in this app:</p>
<pre class="code">float d = sdBox(uv - c, b);</pre>
<p>Same pattern as the circle: <code>uv - c</code> moves it, and <code>b</code> sets its size. Same colouring: blue inside, white edge, lines every 0.1.</p>`,
          controls: [
            { name: 'bx', label: 'b.x', min: 0.02, max: 0.45, step: 0.01, value: 0.3 },
            { name: 'by', label: 'b.y', min: 0.02, max: 0.45, step: 0.01, value: 0.15 },
          ],
          shader: (v) => S('col = sdfVis(sdBox(uv - 0.5, uB));', { uB: [v.bx, v.by] }),
          code: (v) => `float d = sdBox(uv - vec2(0.5), vec2(${f(v.bx, 2)}, ${f(v.by, 2)}));\ncol = sdfVis(d);`,
        },
        {
          title: 'b is the HALF size',
          body: `<p>Watch out: <code>b</code> is the distance from the <b>centre to the side</b> — half the width and half the height. Like the radius of a circle.</p>
<p>So the box covers <code>c.x - b.x</code> to <code>c.x + b.x</code> horizontally.</p>`,
          controls: [
            { name: 'cx', label: 'c.x', min: 0, max: 1, step: 0.05, value: 0.5 },
            { name: 'bx', label: 'b.x', min: 0.05, max: 0.45, step: 0.05, value: 0.2 },
            { name: 'by', label: 'b.y', min: 0.05, max: 0.45, step: 0.05, value: 0.1 },
          ],
          shader: (v) => S('col = show(uv, sdBox(uv - vec2(uCx, 0.5), uB));', { uCx: v.cx, uB: [v.bx, v.by] }),
          code: (v) => `float d = sdBox(uv - vec2(${f(v.cx, 2)}, 0.5), vec2(${f(v.bx, 2)}, ${f(v.by, 2)}));\n// x from ${f(v.cx - v.bx, 2)} to ${f(v.cx + v.bx, 2)}  (width ${f(2 * v.bx, 2)})\n// y from ${f(0.5 - v.by, 2)} to ${f(0.5 + v.by, 2)}  (height ${f(2 * v.by, 2)})`,
          quiz: { q: 'A box with b = (0.25, 0.1) is how wide?', options: ['0.25', '0.5', '0.1'], answer: 1, explain: 'b.x is the half width: 2 × 0.25 = 0.5.' },
        },
        {
          title: 'How sdBox works (peek inside)',
          body: `<pre class="code">float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}</pre>
<ol><li><code>abs(p)</code>: a box is symmetric, so fold all four quarters onto the top-right one. (Mirroring — more in the Patterns topic.)</li>
<li><code>abs(p) - b</code>: how far past each side we are, per axis.</li>
<li><b>Outside</b>: <code>length(max(d, 0.0))</code> — past one side it's a straight distance, past a corner it's the diagonal distance to the corner. That's why contour lines are <b>round at the corners</b>.</li>
<li><b>Inside</b>: <code>max(d.x, d.y)</code> — the distance to the <i>nearest</i> side (negative).</li></ol>`,
          controls: [{ name: 'q', label: 'probe angle', min: 0, max: 6.28, step: 0.01, value: 0.6 }],
          shader: (v) => {
            const p = [0.5 + 0.38 * Math.cos(v.q), 0.5 + 0.38 * Math.sin(v.q)];
            return S('col = sdfVis(sdBox(uv - 0.5, vec2(0.2, 0.12)));\ncol = mix(col, vec3(0.0), mark(uv, uP, 0.022));\ncol = mix(col, vec3(1.0), mark(uv, uP, 0.015));', { uP: p });
          },
          code: (v) => {
            const px = r2(0.38 * Math.cos(v.q)), py = r2(0.38 * Math.sin(v.q));
            const dx = r2(Math.abs(px) - 0.2), dy = r2(Math.abs(py) - 0.12);
            const out = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)), ins = Math.min(Math.max(dx, dy), 0);
            const kind = dx > 0 && dy > 0 ? 'past a CORNER → diagonal distance' : dx > 0 || dy > 0 ? 'past one SIDE → straight distance' : 'inside';
            return `// p = (${f(px, 2)}, ${f(py, 2)}), b = (0.2, 0.12)\nd = abs(p) - b = (${f(dx, 2)}, ${f(dy, 2)})\n// ${kind}\nreturn ${f(out, 3)} + ${f(ins, 3)} = ${f(out + ins, 3)}`;
          },
        },
        {
          title: 'Rounded box: inflate it',
          body: `<p>Remember: subtracting from d <b>grows</b> a shape in every direction — and growing rounds the corners (the distance from a corner is round).</p>
<pre class="code">float d = sdBox(p, b - rad) - rad;</pre>
<p>We shrink the box by <code>rad</code> first, then grow it back by <code>rad</code>: same size, round corners. This is Shader Graph's "Rounded Rectangle".</p>`,
          controls: [{ name: 'k', label: 'corner radius', min: 0, max: 0.15, step: 0.005, value: 0.06 }],
          shader: (v) => S('float d = sdBox(uv - 0.5, vec2(0.3, 0.2) - uK) - uK;\ncol = sdfVis(d);', { uK: v.k }),
          code: (v) => `float rad = ${f(v.k, 3)};\nfloat d = sdBox(uv - 0.5, vec2(0.3, 0.2) - rad) - rad;`,
        },
        {
          title: 'Line segments & capsules',
          body: `<p><code>sdSegment(p, a, b)</code> gives the distance to the <b>line segment</b> from point a to point b. It's 0 <i>on</i> the line, so there is no inside yet…</p>
<p>…subtract a thickness and you get a <b>capsule</b> (a thick line with round ends):</p>
<pre class="code">float d = sdSegment(uv, a, b) - 0.04;</pre>`,
          controls: [
            { name: 'ax', label: 'a.x', min: 0, max: 1, step: 0.01, value: 0.2 },
            { name: 'ay', label: 'a.y', min: 0, max: 1, step: 0.01, value: 0.3 },
            { name: 'bx', label: 'b.x', min: 0, max: 1, step: 0.01, value: 0.8 },
            { name: 'by', label: 'b.y', min: 0, max: 1, step: 0.01, value: 0.7 },
            { name: 't', label: 'thickness', min: 0, max: 0.15, step: 0.005, value: 0.04 },
          ],
          shader: (v) => S('col = sdfVis(sdSegment(uv, uA, uB) - uT);', { uA: [v.ax, v.ay], uB: [v.bx, v.by], uT: v.t }),
          code: (v) => `float d = sdSegment(uv, vec2(${f(v.ax, 2)}, ${f(v.ay, 2)}), vec2(${f(v.bx, 2)}, ${f(v.by, 2)})) - ${f(v.t, 3)};`,
          after: '<div class="tip">Note: sdSegment takes <b>uv itself</b> (the endpoints are already in uv space), not <code>uv - c</code>.</div>',
        },
        {
          title: 'Infinite lines',
          body: `<p>The simplest SDF of all: distance to a horizontal line at height k is just <code>uv.y - k</code> (signed: above is positive). A vertical line: <code>uv.x - k</code>.</p>
<p>Wrap it in abs and subtract thickness and you get a stripe — the same ring trick!</p>
<pre class="code">float d = abs(uv.y - k) - t;</pre>`,
          controls: [
            { name: 'k', label: 'k (line height)', min: 0, max: 1, step: 0.01, value: 0.4 },
            { name: 't', label: 't', min: 0.005, max: 0.2, step: 0.005, value: 0.03 },
          ],
          shaders: [
            { spec: (v) => S('col = sdfVis(uv.y - uK);', { uK: v.k }), label: 'uv.y − k' },
            { spec: (v) => S('col = sdfVis(abs(uv.y - uK) - uT);', { uK: v.k, uT: v.t }), label: 'abs(uv.y − k) − t' },
          ],
          code: (v) => `float d = abs(uv.y - ${f(v.k, 2)}) - ${f(v.t, 3)};`,
          quiz: { q: 'Which is a vertical stripe at x = 0.3?', options: ['abs(uv.x - 0.3) - 0.02', 'abs(uv.y - 0.3) - 0.02', 'uv.x * 0.3 - 0.02'], answer: 0, explain: 'A vertical line is all points with the same x, so the distance only depends on uv.x.' },
        },
      ],
      games: [
        {
          id: 'box-match', title: 'Box matcher', engine: 'slider', rounds: 4,
          blurb: 'Set the half-size (and centre) of the box to match the target.',
          gen: (rng, level) => {
            const bx = rng.step(0.1, 0.4, 0.05), by = rng.step(0.1, 0.4, 0.05);
            const cx = level === 3 ? rng.step(0.35, 0.65, 0.05) : 0.5;
            const params = [
              { name: 'bx', label: 'b.x (half width)', min: 0.05, max: 0.45, step: 0.05, target: bx },
              { name: 'by', label: 'b.y (half height)', min: 0.05, max: 0.45, step: 0.05, target: by },
            ];
            if (level === 3) params.push({ name: 'cx', label: 'c.x', min: 0.2, max: 0.8, step: 0.05, target: cx });
            return {
              prompt: level === 3 ? 'Match the box size and its horizontal position.' : 'Match the box size.',
              sub: level === 1 ? 'b is HALF the width/height: count grid lines from the centre (bright lines) to a side.' : 'Grid lines every 0.1.',
              params,
              build: (p) => S('col = show(uv, sdBox(uv - vec2(uCx, 0.5), uB));', { uB: [p.bx, p.by], uCx: p.cx ?? cx }),
              code: (p) => `float d = sdBox(uv - vec2(${f(p.cx ?? cx, 2)}, 0.5), vec2(${f(p.bx, 2)}, ${f(p.by, 2)}));`,
              explain: `<p>Target b = (${N(bx)}, ${N(by)}) → the box is ${N(2 * bx)} wide and ${N(2 * by)} tall.</p>`,
            };
          },
        },
        {
          id: 'box-dist', title: 'Box distance', engine: 'numeric', rounds: 6,
          blurb: 'Work out sdBox at a point: beside a side, inside, or past a corner.',
          gen: (rng, level) => {
            const b = [rng.pick([0.1, 0.15, 0.2, 0.25]), rng.pick([0.1, 0.15, 0.2, 0.25])];
            let p, kind;
            const kinds = level === 1 ? ['side'] : level === 2 ? ['side', 'inside', 'inside'] : ['inside', 'corner', 'corner'];
            kind = rng.pick(kinds);
            if (kind === 'side') {
              const k = rng.pick([0.05, 0.1, 0.15, 0.2]);
              p = rng.chance() ? [(b[0] + k) * rng.sign(), rng.step(-b[1] + 0.05, b[1] - 0.05, 0.05)] : [rng.step(-b[0] + 0.05, b[0] - 0.05, 0.05), (b[1] + k) * rng.sign()];
            } else if (kind === 'inside') {
              p = [rng.step(-b[0] + 0.05, b[0] - 0.05, 0.05), rng.step(-b[1] + 0.05, b[1] - 0.05, 0.05)];
            } else {
              const [x, y] = rng.pick(TRIPLES.filter((t) => t[2] <= 0.25));
              p = [(b[0] + x) * rng.sign(), (b[1] + y) * rng.sign()];
            }
            p = p.map(r2);
            const d = r2(sdBoxJS(p[0], p[1], b[0], b[1]));
            const dd = [r2(Math.abs(p[0]) - b[0]), r2(Math.abs(p[1]) - b[1])];
            const why = kind === 'side' ? `Only one axis is past the box (${dd[0] > 0 ? 'x' : 'y'}), so d is the straight distance past that side: <b>${N(d)}</b>.`
              : kind === 'inside' ? `Both are negative → inside. d = max(${N(dd[0])}, ${N(dd[1])}) = <b>${N(d)}</b>: the distance to the <i>nearest</i> side.`
                : `Both positive → past a corner. d = length(${N(dd[0])}, ${N(dd[1])}) = <b>${N(d)}</b> (diagonal distance to the corner).`;
            return {
              prompt: 'What is <code>d</code>?',
              code: `vec2 p = vec2(${f(p[0], 2)}, ${f(p[1], 2)}); // relative to box centre\nfloat d = sdBox(p, vec2(${f(b[0], 2)}, ${f(b[1], 2)}));`,
              sub: 'Step 1: abs(p) − b for each axis. Step 2: which case is it?',
              shader: S('vec2 q = uv * 1.2 - 0.6;\ncol = sdfVis(sdBox(q, uB));\ncol = mix(col, vec3(0.0), mark(q, uP, 0.026));\ncol = mix(col, vec3(1.0), mark(q, uP, 0.018));', { uB: b, uP: p }),
              shaderCaption: 'view spans −0.6..0.6',
              answer: d,
              explain: `<p>abs(p) − b = (${N(dd[0])}, ${N(dd[1])}).</p><p>${why}</p>`,
            };
          },
        },
        {
          id: 'prim-pick', title: 'Name that primitive', engine: 'mcq', rounds: 8,
          blurb: 'Circle, box, capsule or line — which code drew it?',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'float d = sdCircle(uv - 0.5, 0.3);', why: 'A circle, r = 0.3.' },
            { code: 'float d = sdBox(uv - 0.5, vec2(0.3, 0.15));', why: 'A wide box: half width 0.3, half height 0.15.' },
            { code: 'float d = sdBox(uv - 0.5, vec2(0.15, 0.3));', why: 'A tall box: half width 0.15, half height 0.3.' },
            { code: 'float d = sdSegment(uv, vec2(0.2), vec2(0.8)) - 0.05;', why: 'A diagonal capsule from (0.2, 0.2) to (0.8, 0.8).' },
            { code: 'float d = abs(uv.y - 0.5) - 0.05;', why: 'A horizontal stripe across the whole image.', lvl: 2 },
            { code: 'float d = sdBox(uv - 0.5, vec2(0.15)) - 0.15;', why: 'A box inflated by 0.15: rounded corners, total half-size 0.3.', lvl: 2 },
            { code: 'float d = sdSegment(uv, vec2(0.2, 0.5), vec2(0.8, 0.5)) - 0.1;', why: 'A fat horizontal capsule with round ends.', lvl: 2 },
            { code: 'float d = sdBox(uv - vec2(0.3, 0.5), vec2(0.2));', why: 'A square shifted left: centre (0.3, 0.5).', lvl: 3 },
            { code: 'float d = abs(sdBox(uv - 0.5, vec2(0.25))) - 0.03;', why: 'An outlined square (abs − t).', lvl: 3 },
          ], '', rng.chance() ? 'c2i' : 'i2c', '', '\ncol = show(uv, d);'),
        },
        {
          id: 'box-corner', title: 'Where is the corner?', engine: 'tap', rounds: 6,
          blurb: 'Read the sdBox code and tap where the corner will be — before seeing the box.',
          gen: (rng, level) => {
            const b = [rng.step(0.1, 0.35, 0.05), rng.step(0.1, 0.35, 0.05)];
            const c = level === 1 ? [0.5, 0.5] : [rng.step(0.35, 0.65, 0.05), rng.step(0.35, 0.65, 0.05)];
            const corners = { 'top-right': [1, 1], 'top-left': [-1, 1], 'bottom-right': [1, -1], 'bottom-left': [-1, -1] };
            const name = level === 1 ? 'top-right' : rng.pick(Object.keys(corners));
            const s = corners[name];
            const t = [r2(c[0] + s[0] * b[0]), r2(c[1] + s[1] * b[1])];
            return {
              prompt: `Tap the <b>${name}</b> corner of this box.`,
              code: `float d = sdBox(uv - vec2(${f(c[0], 2)}, ${f(c[1], 2)}), vec2(${f(b[0], 2)}, ${f(b[1], 2)}));`,
              sub: 'The box is hidden! Grid lines every 0.1, bright lines at 0.5.',
              shader: S('col = bgCol(uv) * 2.0;'),
              target: t, radius: 0.04,
              explain: `<p>Corner = c ± b = (${N(c[0])} ${s[0] > 0 ? '+' : '−'} ${N(b[0])}, ${N(c[1])} ${s[1] > 0 ? '+' : '−'} ${N(b[1])}) = (${N(t[0])}, ${N(t[1])}). b is the half size, so it's measured from the centre.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 6. booleans
    {
      id: 'shapes.combine',
      title: 'Combining shapes',
      blurb: 'Union = min, intersection = max, subtraction = max(a, −b).',
      lesson: [
        {
          title: 'Two shapes, two numbers',
          body: `<p>Every pixel can compute <b>several</b> distances: one per shape.</p>
<pre class="code">float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);
float dB = sdCircle(uv - vec2(bx, 0.5), 0.22);</pre>
<p>Now the question: how do we combine two numbers into one distance that describes both shapes together?</p>`,
          controls: [{ name: 'bx', label: 'B position x', min: 0.3, max: 0.9, step: 0.01, value: 0.62 }],
          shaders: [
            { spec: S('col = sdfVis(sdCircle(uv - vec2(0.38, 0.5), 0.22));'), label: 'dA' },
            { spec: (v) => S('col = sdfVis(sdCircle(uv - vec2(uBx, 0.5), 0.22));', { uBx: v.bx }), label: 'dB' },
          ],
        },
        {
          title: 'Union: min(dA, dB)',
          body: `<p>"Inside A <b>or</b> inside B". Take the <b>smaller</b> distance:</p>
<pre class="code">float d = min(dA, dB);</pre>
<p><b>Why it works:</b> if the pixel is inside either shape, at least one value is negative → the min is negative → inside. Outside both, min picks the distance to the <i>closest</i> shape — exactly what a distance should be.</p>`,
          controls: [{ name: 'bx', label: 'B position x', min: 0.3, max: 0.9, step: 0.01, value: 0.62 }],
          shader: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = sdfVis(min(dA, dB));', { uBx: v.bx }),
          code: (v) => `float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(${f(v.bx, 2)}, 0.5), 0.22);\nfloat d = min(dA, dB); // union`,
          after: '<div class="analogy">🧲 Two magnets: a pixel feels whichever is <b>closest</b>.</div>',
        },
        {
          title: 'Intersection: max(dA, dB)',
          body: `<p>"Inside A <b>and</b> inside B". Take the <b>bigger</b> distance:</p>
<pre class="code">float d = max(dA, dB);</pre>
<p><b>Why:</b> max is negative only if <b>both</b> are negative — inside both. If even one says "outside" (positive), max is positive. Only the overlap survives: a lens shape.</p>`,
          controls: [{ name: 'bx', label: 'B position x', min: 0.3, max: 0.9, step: 0.01, value: 0.62 }],
          shader: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = sdfVis(max(dA, dB));', { uBx: v.bx }),
          code: (v) => `float d = max(dA, dB); // intersection (B at x = ${f(v.bx, 2)})`,
          quiz: { q: 'If the circles don\'t overlap at all, max(dA, dB) shows…', options: ['Nothing — no pixel is inside both', 'Both circles', 'Only the bigger circle'], answer: 0, explain: 'No pixel has both values negative, so nothing is inside.' },
        },
        {
          title: 'Subtraction: max(dA, −dB)',
          body: `<p>"Inside A <b>but not</b> inside B" — take a bite out of A.</p>
<pre class="code">float d = max(dA, -dB);</pre>
<p><b>Why:</b> <code>-dB</code> flips B inside-out: now "inside" means <i>outside</i> B. Then intersect (max) with A → "in A and not in B".</p>
<div class="analogy">🍪 A is the cookie, B is the mouth. max(cookie, −mouth) = the cookie with a bite missing.</div>`,
          controls: [{ name: 'bx', label: 'B position x', min: 0.3, max: 0.9, step: 0.01, value: 0.62 }],
          shader: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = sdfVis(max(dA, -dB));', { uBx: v.bx }),
          code: (v) => `float d = max(dA, -dB); // A minus B (B at x = ${f(v.bx, 2)})`,
          quiz: { q: 'max(−dA, dB) gives…', options: ['B with a bite taken out by A', 'A with a bite taken out by B', 'The union'], answer: 0, explain: 'The flipped one is the "mouth". Order matters for subtraction!' },
        },
        {
          title: 'All four, side by side',
          body: `<p>Same two circles (A left, B right), four operations. Move B and compare.</p>`,
          controls: [{ name: 'bx', label: 'B position x', min: 0.3, max: 0.9, step: 0.01, value: 0.62 }],
          shaders: [
            { spec: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = show(uv, min(dA, dB));', { uBx: v.bx }), label: 'min(dA, dB) — union' },
            { spec: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = show(uv, max(dA, dB));', { uBx: v.bx }), label: 'max(dA, dB) — intersection' },
            { spec: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = show(uv, max(dA, -dB));', { uBx: v.bx }), label: 'max(dA, −dB) — A minus B' },
            { spec: (v) => S('float dA = sdCircle(uv - vec2(0.38, 0.5), 0.22);\nfloat dB = sdCircle(uv - vec2(uBx, 0.5), 0.22);\ncol = show(uv, max(-dA, dB));', { uBx: v.bx }), label: 'max(−dA, dB) — B minus A' },
          ],
          after: '<div class="tip">These are the same booleans as in Houdini, Blender or a CSG modeller. In ray marching (3D SDFs) you build whole scenes from them. Small print: after max() the outside distances are only approximate — fine for drawing.</div>',
        },
      ],
      games: [
        {
          id: 'which-op', title: 'Which operation?', engine: 'mcq', rounds: 8,
          blurb: 'Look at the result and pick the boolean that made it.',
          gen: (rng, level) => {
            const ops = [
              { code: 'd = min(dA, dB);', f: 'min(dA, dB)', why: 'Everything inside A or B is filled → union (min).' },
              { code: 'd = max(dA, dB);', f: 'max(dA, dB)', why: 'Only the overlap is filled → intersection (max).' },
              { code: 'd = max(dA, -dB);', f: 'max(dA, -dB)', why: 'A is filled, except where B is → A minus B.' },
              { code: 'd = max(-dA, dB);', f: 'max(-dA, dB)', why: 'B is filled, except where A is → B minus A.' },
            ];
            const pool = level === 1 ? ops.slice(0, 3) : ops;
            const ans = rng.pick(pool);
            const sep = rng.float(0.18, 0.3);
            const ang = rng.float(0, Math.PI * 2);
            const ca = [0.5 - Math.cos(ang) * sep / 2, 0.5 - Math.sin(ang) * sep / 2], cb = [0.5 + Math.cos(ang) * sep / 2, 0.5 + Math.sin(ang) * sep / 2];
            const boxA = level === 3 && rng.chance(0.5);
            const dAexpr = boxA ? 'sdBox(uv - uA, vec2(0.17))' : 'sdCircle(uv - uA, 0.2)';
            return {
              prompt: 'Which line made this shape?',
              sub: '<b style="color:#5aaeff">Blue outline = A</b>, <b style="color:#ff7ab2">pink outline = B</b>. The filled area is the result.',
              shader: S(`float dA = ${dAexpr};\nfloat dB = sdCircle(uv - uB, 0.2);\nfloat d = ${ans.f};\ncol = show(uv, d);\ncol = mix(col, vec3(0.35, 0.68, 1.0), lineMask(dA, 0.004));\ncol = mix(col, vec3(1.0, 0.48, 0.7), lineMask(dB, 0.004));`, { uA: ca, uB: cb }),
              options: [ans, ...pool.filter((o) => o !== ans)].map((o) => ({ code: o.code })),
              answer: 0,
              explain: `<p>${ans.why}</p><p>min = OR, max = AND, minus sign = NOT.</p>`,
            };
          },
        },
        {
          id: 'bool-value', title: 'Combine the numbers', engine: 'numeric', rounds: 6,
          blurb: 'Given dA and dB at a pixel, compute the combined distance.',
          gen: (rng, level) => {
            const vals = [-0.3, -0.2, -0.15, -0.1, -0.05, 0.05, 0.1, 0.15, 0.2, 0.3];
            const dA = rng.pick(level === 1 ? vals.filter((x) => x > 0) : vals);
            const dB = rng.pick((level === 1 ? vals.filter((x) => x > 0) : vals).filter((x) => x !== dA && x !== -dA));
            const ops = level === 1 ? ['min', 'max'] : level === 2 ? ['min', 'max', 'sub'] : ['sub', 'subB', 'min', 'max'];
            const op = rng.pick(ops);
            const res = op === 'min' ? Math.min(dA, dB) : op === 'max' ? Math.max(dA, dB) : op === 'sub' ? Math.max(dA, -dB) : Math.max(-dA, dB);
            const expr = op === 'min' ? 'min(dA, dB)' : op === 'max' ? 'max(dA, dB)' : op === 'sub' ? 'max(dA, -dB)' : 'max(-dA, dB)';
            const inside = (x) => (x < 0 ? 'inside' : 'outside');
            return {
              prompt: 'What is <code>d</code>?',
              code: `float dA = ${f(dA, 2)};\nfloat dB = ${f(dB, 2)};\nfloat d = ${expr};`,
              sub: 'Then: is the pixel inside the combined shape?',
              answer: r2(res),
              explain: `<p>${expr} = <b>${N(res)}</b> → the pixel is <b>${inside(res)}</b> the result.</p><p>(It is ${inside(dA)} A and ${inside(dB)} B. ${op === 'min' ? 'Union: inside if inside either.' : op === 'max' ? 'Intersection: inside only if inside both.' : op === 'sub' ? 'A − B: inside A and NOT inside B.' : 'B − A: inside B and NOT inside A.'})</p>`,
            };
          },
        },
        {
          id: 'bool-fill', title: 'Write the boolean', engine: 'codefill', rounds: 5,
          blurb: 'Pick min or max and the right sign to build the target shape.',
          gen: (rng) => {
            const targets = [['min', 'dB'], ['max', 'dB'], ['max', '-dB']];
            const [fn, arg] = rng.pick(targets);
            const ca = [rng.step(0.35, 0.42, 0.01), rng.step(0.42, 0.58, 0.01)];
            const cb = [r2(1 - ca[0]), r2(1 - ca[1])];
            const template = `float dA = sdCircle(uv - vec2(${f(ca[0], 2)}, ${f(ca[1], 2)}), 0.2); // left\nfloat dB = sdCircle(uv - vec2(${f(cb[0], 2)}, ${f(cb[1], 2)}), 0.2); // right\nfloat d = [[0]](dA, [[1]]);\ncol = show(uv, d);`;
            const slots = [{ options: ['min', 'max', 'abs', 'step'], answer: fn }, { options: ['dB', '-dB', 'dA', '0.2'], answer: arg }];
            return {
              prompt: 'Complete the line to make the target shape.',
              sub: 'A is on the left, B on the right.',
              template, slots,
              build: (vals) => S(template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i])),
              explain: `<p>Answer: <code>${fn}(dA, ${arg})</code> — ${fn === 'min' ? 'union (A or B)' : arg === 'dB' ? 'intersection (A and B)' : 'A minus B (A and not B)'}. (abs takes only one argument, so it won't compile.)</p>`,
            };
          },
        },
        {
          id: 'bool-gpu', title: 'Be the GPU: booleans', engine: 'paint', rounds: 3,
          blurb: 'Two circles, one operation: paint the result.',
          gen: (rng, level) => {
            const W = 6;
            const ops = level === 1 ? ['min', 'max'] : ['min', 'max', 'sub'];
            const c0 = safePaint(rng, () => {
              const ca = [rng.pick([0.3, 0.35, 0.4]), rng.pick([0.4, 0.5, 0.6])], cb = [rng.pick([0.6, 0.65, 0.7]), rng.pick([0.4, 0.5, 0.6])];
              const ra = rng.pick([0.2, 0.25, 0.3]), rb = rng.pick([0.2, 0.25, 0.3]);
              const op = rng.pick(ops);
              const dA = (u, v) => Math.hypot(u - ca[0], v - ca[1]) - ra, dB = (u, v) => Math.hypot(u - cb[0], v - cb[1]) - rb;
              const val = (u, v) => (op === 'min' ? Math.min(dA(u, v), dB(u, v)) : op === 'max' ? Math.max(dA(u, v), dB(u, v)) : Math.max(dA(u, v), -dB(u, v)));
              const expr = op === 'min' ? 'min(dA, dB)' : op === 'max' ? 'max(dA, dB)' : 'max(dA, -dB)';
              return { val, checks: [dA, dB], op, code: `float dA = length(uv - vec2(${f(ca[0], 2)}, ${f(ca[1], 2)})) - ${f(ra, 2)};\nfloat dB = length(uv - vec2(${f(cb[0], 2)}, ${f(cb[1], 2)})) - ${f(rb, 2)};\nif (${expr} < 0.0) col = vec3(1.0);` };
            }, W, W, 0.02);
            return {
              prompt: 'Paint what this shader outputs:',
              code: c0.code, w: W, h: W, palette: BW, showUV: true,
              solve: (u, v) => +(c0.val(u, v) < 0),
              explain: `<p>For each pixel, ask two yes/no questions: inside A? inside B? Then ${c0.op === 'min' ? '<b>min</b> = white if <b>either</b> is yes.' : c0.op === 'max' ? '<b>max</b> = white only if <b>both</b> are yes.' : '<b>max(dA, −dB)</b> = white if inside A <b>and not</b> inside B.'}</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 7. smooth union & glow
    {
      id: 'shapes.glow',
      title: 'Smooth union & glow',
      blurb: 'Melt shapes together with smin, and make them glow with 1/d and exp(−d).',
      lesson: [
        {
          title: 'min leaves a crease',
          body: `<p>The union <code>min(dA, dB)</code> is correct, but where the two circles meet there's a <b>sharp corner</b> — look at the contour lines between them: they form a V.</p>
<p>Often we want shapes that <b>melt</b> into each other instead, like blobs of liquid.</p>`,
          controls: [{ name: 's', label: 'separation', min: 0.2, max: 0.6, step: 0.01, value: 0.42 }],
          shader: (v) => S('float dA = sdCircle(uv - vec2(0.5 - uS * 0.5, 0.5), 0.17);\nfloat dB = sdCircle(uv - vec2(0.5 + uS * 0.5, 0.5), 0.17);\ncol = sdfVis(min(dA, dB));', { uS: v.s }),
        },
        {
          title: 'smin: smooth minimum',
          body: `<p>A <b>smooth minimum</b> blends the two values when they're close to each other:</p>
<pre class="code">float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}</pre>
<p>Don't memorise it. The idea: when a and b are within <code>k</code> of each other, mix them and dip a bit lower — that fills the crease with a smooth "neck".</p>
<div class="analogy">💧 Two drops of water touching: they pull together into one blob. That's the "metaball" look.</div>`,
          controls: [
            { name: 'k', label: 'k (blend size)', min: 0, max: 0.3, step: 0.005, value: 0.1 },
            { name: 's', label: 'separation', min: 0.2, max: 0.7, step: 0.01, value: 0.45 },
          ],
          shader: (v) => S('float dA = sdCircle(uv - vec2(0.5 - uS * 0.5, 0.5), 0.17);\nfloat dB = sdCircle(uv - vec2(0.5 + uS * 0.5, 0.5), 0.17);\ncol = sdfVis(smin(dA, dB, uK));', { uK: v.k, uS: v.s }),
          code: (v) => `float d = smin(dA, dB, ${f(v.k, 3)});${v.k < 0.005 ? ' // k ≈ 0: same as min()' : ''}`,
        },
        {
          title: 'What k does',
          body: `<p>Here's a 1D view: two straight "distances" a = x and b = 1 − x. <code>min</code> makes a sharp peak where they cross. <code>smin</code> rounds the peak off; the bigger k, the wider and lower the rounding.</p>
<ul><li><b>k = 0</b> → exactly min (sharp)</li><li><b>small k</b> → subtle fillet</li><li><b>big k</b> → big gooey blend (shapes even merge before they touch)</li></ul>`,
          controls: [{ name: 'k', label: 'k', min: 0.001, max: 0.5, step: 0.005, value: 0.2 }],
          graph: {
            fns: (v) => [
              { f: (x) => Math.min(x, 1 - x), label: 'min', dash: [5, 4], color: '#888' },
              { f: (x) => sminJS(x, 1 - x, v.k), label: 'smin' },
            ],
            opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 0.6 },
          },
          code: (v) => `smin(x, 1.0 - x, ${f(v.k, 3)})`,
          after: '<div class="tip">Same idea exists as smooth max (smooth intersection/subtraction): <code>-smin(-a, -b, k)</code>. Houdini/Blender call these "smooth" or "fillet" booleans.</div>',
        },
        {
          title: 'Glow: brightness from distance',
          body: `<p>Light from a neon tube gets dimmer the further you are. We already know the distance, so:</p>
<pre class="code">float glow = 0.02 / d;   // d > 0 outside</pre>
<ul><li>Close to the edge, d is tiny → glow is big (clamped to white).</li><li>Far away, d is big → glow is small.</li></ul>
<p>Slider = strength (the number on top).</p>`,
          controls: [{ name: 'k', label: 'strength', min: 0.002, max: 0.06, step: 0.001, value: 0.02 }],
          shader: (v) => S('float d = sdCircle(uv - 0.5, 0.15);\nfloat glow = uK / max(d, 0.001);\ncol = vec3(0.3, 0.8, 1.0) * glow;', { uK: v.k }),
          code: (v) => `float d = sdCircle(uv - 0.5, 0.15);\nfloat glow = ${f(v.k, 3)} / max(d, 0.001); // max() avoids dividing by 0 (or negatives)\ncol = vec3(0.3, 0.8, 1.0) * glow;`,
          quiz: { q: 'With glow = 0.02 / d, what is the glow at d = 0.1?', options: ['0.2', '0.02', '2.0'], answer: 0, explain: '0.02 / 0.1 = 0.2. Halve the distance → double the glow.' },
        },
        {
          title: 'exp(−k·d): a controllable falloff',
          body: `<p><code>1/d</code> has a long tail — it never really reaches 0, so glows can wash out the whole screen. <code>exp(-k * d)</code> is the tunable alternative:</p>
<ul><li>At d = 0 it's exactly <b>1</b> (no clamping needed).</li><li>It drops faster with a bigger <b>k</b>.</li></ul>
<p>The graph compares them over d = 0..0.5.</p>`,
          controls: [{ name: 'k', label: 'k (falloff)', min: 1, max: 40, step: 1, value: 10 }],
          graph: {
            fns: (v) => [
              { f: (x) => Math.min(1.2, 0.02 / Math.max(x, 0.001)), label: '0.02 / d', dash: [5, 4], color: '#888' },
              { f: (x) => Math.exp(-v.k * x), label: 'exp(-k·d)' },
            ],
            opts: { xmin: 0, xmax: 0.5, ymin: -0.05, ymax: 1.1 },
          },
          shader: (v) => S('float d = sdCircle(uv - 0.5, 0.15);\nfloat glow = exp(-uK * max(d, 0.0));\ncol = vec3(1.0, 0.45, 0.8) * glow;', { uK: v.k }),
          code: (v) => `float glow = exp(-${f(v.k, 0)} * max(d, 0.0));`,
        },
        {
          title: 'Neon sign',
          body: `<p>Put it together: a thin <b>ring</b> (abs(d) − t), smooth-joined blobs, and a glow around the whole thing. All from distances.</p>`,
          controls: [
            { name: 'k', label: 'smin k', min: 0, max: 0.2, step: 0.005, value: 0.08 },
            { name: 'g', label: 'glow falloff', min: 4, max: 40, step: 1, value: 14 },
          ],
          shader: (v) => S('float dA = sdCircle(uv - vec2(0.36, 0.5 + 0.08 * sin(uTime)), 0.14);\nfloat dB = sdCircle(uv - vec2(0.64, 0.5 - 0.08 * sin(uTime)), 0.14);\nfloat d = smin(dA, dB, uK);\nfloat ring = abs(d) - 0.008;\nfloat glow = exp(-uG * max(ring, 0.0));\ncol = vec3(0.02, 0.02, 0.05) + vec3(1.0, 0.3, 0.75) * glow;\ncol = mix(col, vec3(1.0), 1.0 - smoothstep(-0.003, 0.003, ring));', { uK: v.k, uG: v.g }),
          code: (v) => `float d = smin(dA, dB, ${f(v.k, 3)});\nfloat ring = abs(d) - 0.008;\nfloat glow = exp(-${f(v.g, 0)} * max(ring, 0.0));\ncol = darkBlue + pink * glow;\ncol = mix(col, white, ringMask);`,
        },
      ],
      games: [
        {
          id: 'smin-match', title: 'Blob matcher', engine: 'slider', rounds: 4,
          blurb: 'Tune k (and the gap) so the melted blobs match.',
          gen: (rng, level) => {
            const k = rng.pick(level === 1 ? [0.0, 0.1, 0.2] : [0.02, 0.05, 0.08, 0.12, 0.16, 0.2]);
            const s = level === 1 ? 0.4 : rng.step(0.3, 0.55, 0.05);
            const params = [{ name: 'k', label: 'smin k', min: 0, max: 0.25, step: 0.01, target: k }];
            if (level >= 2) params.push({ name: 's', label: 'separation', min: 0.2, max: 0.6, step: 0.05, target: s });
            return {
              prompt: level === 1 ? 'Match the blend amount k.' : 'Match k and the separation of the two circles.',
              sub: 'k = 0 is a plain min() with a sharp crease.',
              params,
              build: (p) => S('float sp = uS;\nfloat dA = sdCircle(uv - vec2(0.5 - sp * 0.5, 0.5), 0.16);\nfloat dB = sdCircle(uv - vec2(0.5 + sp * 0.5, 0.5), 0.16);\ncol = show(uv, smin(dA, dB, uK));', { uK: p.k, uS: p.s ?? s }),
              code: (p) => `// circles at x = 0.5 ± ${f((p.s ?? s) / 2, 3)}\nfloat d = smin(dA, dB, ${f(p.k, 2)});`,
              explain: `<p>Target k = ${N(k)}${level >= 2 ? `, separation = ${N(s)}` : ''}. Look at the "neck" between the circles: the wider and fuller, the bigger k.</p>`,
            };
          },
        },
        {
          id: 'glow-match', title: 'Glow matcher', engine: 'slider', rounds: 4,
          blurb: 'Match the falloff k of exp(−k·d).',
          gen: (rng, level) => {
            const k = rng.pick(level === 1 ? [4, 12, 30] : [5, 8, 12, 16, 20, 25, 30]);
            const t = level === 3 ? rng.pick([0.1, 0.15, 0.2]) : 0.15;
            const params = [{ name: 'k', label: 'falloff k', min: 2, max: 40, step: 1, target: k }];
            if (level === 3) params.push({ name: 'r', label: 'circle r', min: 0.05, max: 0.3, step: 0.05, target: t });
            return {
              prompt: level === 3 ? 'Match the glow falloff and the circle size.' : 'Match the glow falloff k.',
              sub: 'Bigger k = tighter glow.',
              params,
              build: (p) => S('float d = sdCircle(uv - 0.5, uR);\ncol = vec3(0.3, 0.8, 1.0) * exp(-uK * max(d, 0.0));', { uK: p.k, uR: p.r ?? t }),
              code: (p) => `float d = sdCircle(uv - 0.5, ${f(p.r ?? t, 2)});\ncol = cyan * exp(-${f(p.k, 0)} * max(d, 0.0));`,
              tolerance: 0.06,
              explain: `<p>Target k = ${k}. exp(−k·d) halves every time d grows by 0.69 / k ≈ ${n(0.693 / k, 3)}.</p>`,
            };
          },
        },
        {
          id: 'glow-value', title: 'Glow brightness', engine: 'numeric', rounds: 6,
          blurb: 'Compute the 1/d glow at a pixel.',
          gen: (rng, level) => {
            const K = rng.pick([0.01, 0.02, 0.03, 0.05]);
            let d = rng.pick([0.05, 0.1, 0.2, 0.25, 0.5]);
            let pre = '', code;
            if (level >= 2 && rng.chance(0.5)) {
              const [a, b, c] = rng.pick(TRIPLES.filter((t) => [0.25, 0.5, 0.3, 0.2].includes(t[2])));
              const r = level === 3 ? rng.pick([0.05, 0.1]) : 0;
              d = r2(c - r);
              code = `float d = length(vec2(${f(a, 2)}, ${f(b, 2)}))${r ? ' - ' + f(r, 2) : ''};`;
              pre = `length = ${N(c)}${r ? `, minus ${N(r)} = ${N(d)}` : ''}. `;
            } else code = `float d = ${f(d, 2)};`;
            const clampIt = level === 3 && rng.chance(0.4);
            if (clampIt) d = rng.pick([0.01, 0.02]);
            if (clampIt) code = `float d = ${f(d, 2)};`;
            const raw = K / d;
            const ans = clampIt ? Math.min(1, raw) : raw;
            return {
              prompt: 'What is <code>glow</code>?',
              code: `${code}\nfloat glow = ${clampIt ? 'min(1.0, ' : ''}${f(K, 2)} / d${clampIt ? ')' : ''};`,
              answer: r2(ans),
              explain: `<p>${clampIt ? '' : pre}${N(K)} / ${N(d)} = ${n(raw, 3)}${clampIt ? ', then min(1.0, …) caps it at <b>1</b>.' : ' = <b>' + N(ans) + '</b>.'}</p><p>Double the distance → half the glow. That's the 1/d falloff.</p>`,
            };
          },
        },
        {
          id: 'blend-look', title: 'Melt, crease or glow?', engine: 'mcq', rounds: 8,
          blurb: 'Pick the image for each combination of two circles.',
          gen: (rng, level) => poolMcq(rng, level, [
            { code: 'col = show(uv, min(dA, dB));', why: 'Plain min: two circles with a sharp crease where they meet.' },
            { code: 'col = show(uv, smin(dA, dB, 0.2));', why: 'Big k smin: a thick gooey neck joins the circles.' },
            { code: 'col = show(uv, max(dA, dB));', why: 'max = intersection: only the small overlap.' },
            { code: 'col = vec3(0.01 / max(min(dA, dB), 0.001));', why: '1/d glow around both circles (inside → white).', lvl: 2 },
            { code: 'col = vec3(exp(-30.0 * max(min(dA, dB), 0.0)));', why: 'exp falloff: a tight, clean glow that fades to black quickly.', lvl: 2 },
            { code: 'col = show(uv, smin(dA, dB, 0.08));', why: 'Medium k: a small fillet fills the crease, but the two circles are still clearly visible.', lvl: 3 },
            { code: 'col = show(uv, abs(smin(dA, dB, 0.2)) - 0.01);', why: 'Outline of the smooth union: one continuous blobby ring.', lvl: 3 },
          ], 'float dA = sdCircle(uv - vec2(0.36, 0.5), 0.16);\nfloat dB = sdCircle(uv - vec2(0.64, 0.5), 0.16);\n', rng.chance() ? 'c2i' : 'i2c'),
        },
      ],
    },
  ],
};
