// Topic — Transforming space: translate, scale, rotate, order of operations, matrices.
// Core idea taught throughout: in a fragment shader you never move the picture,
// you move the COORDINATES you read it with — so the picture moves the opposite way.
import { tf, q, distinct, f, n, nv, G, vectorPlane, h } from './_kit.js';

// ------------------------------------------------------------------ shared shader bits
// drawF(p): shows the letter-F "paper" (the texture) where p is inside 0..1, a dark
// table outside it, and a faint fixed ruler grid (every 0.25 of the SCREEN) on top.
const FDEFS = `
vec3 drawF(vec2 p){
  vec2 g = abs(fract(vUv * 4.0 + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  vec3 c = mix(vec3(0.07, 0.075, 0.1), texture2D(uTex, clamp(p, 0.0, 1.0)).rgb, inside);
  return mix(c, vec3(1.0), line * 0.13);
}`;
const fSpec = (frag, uniforms) => ({ frag, defs: FDEFS, textures: { uTex: 'letterF' }, uniforms: uniforms || {} });
const DEG = Math.PI / 180;
const r2 = (x) => +(+x).toFixed(3);
const KEYPTS = [[0.1, 0.2], [0.7, 0.35], [0.4, 0.9]];
/** key of a coordinate mapping: two programs with the same key draw the same image */
const mapKey = (fn) => JSON.stringify(KEYPTS.map((p) => fn(p).map((x) => r2(x))));
const caseKey = (c) => mapKey(c.fn);
const v2 = (x, y) => `vec2(${f(x)}, ${f(y)})`;

// ---- step library: each step has GLSL code and the same maths in JS (fn) ----
const S = {
  C: () => ({ code: 'p -= 0.5;', fn: (p) => [p[0] - 0.5, p[1] - 0.5], kind: 'T' }),
  U: () => ({ code: 'p += 0.5;', fn: (p) => [p[0] + 0.5, p[1] + 0.5], kind: 'T' }),
  T: (x, y) => ({ code: `p -= ${v2(x, y)};`, fn: (p) => [p[0] - x, p[1] - y], kind: 'T' }),
  A: (x, y) => ({ code: `p += ${v2(x, y)};`, fn: (p) => [p[0] + x, p[1] + y], kind: 'T' }),
  S: (s) => ({ code: `p *= ${f(s)};`, fn: (p) => [p[0] * s, p[1] * s], kind: 'S' }),
  S2: (sx, sy) => ({ code: `p *= ${v2(sx, sy)};`, fn: (p) => [p[0] * sx, p[1] * sy], kind: 'S2' }),
  R: (deg) => ({ code: `p = rot(radians(${f(deg)})) * p;`, fn: (p) => G.rot2(p, deg * DEG), kind: 'R' }),
};
const prog = (steps) => ({
  steps,
  code: ['vec2 p = uv;', ...steps.map((s) => s.code), 'col = drawF(p);'].join('\n'),
  fn: (p) => steps.reduce((acc, s) => s.fn(acc), p),
});
const progSpec = (pr) => fSpec(pr.code);
function permutations(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).forEach((p) => out.push([x, ...p])));
  return out;
}

// ---- simple "cases" (code + JS mapping) for the per-concept mcq games ----
const shiftCase = (dx, dy, plus = false) => ({
  code: `vec2 p = uv ${plus ? '+' : '-'} ${v2(dx, dy)};\ncol = drawF(p);`,
  fn: (p) => (plus ? [p[0] + dx, p[1] + dy] : [p[0] - dx, p[1] - dy]),
});
const scaleCase = (sx, sy, centre) => {
  const sc = sx === sy ? f(sx) : v2(sx, sy);
  return centre
    ? { code: `vec2 p = uv - 0.5;\np *= ${sc};\np += 0.5;\ncol = drawF(p);`, fn: (p) => [(p[0] - 0.5) * sx + 0.5, (p[1] - 0.5) * sy + 0.5] }
    : { code: `vec2 p = uv * ${sc};\ncol = drawF(p);`, fn: (p) => [p[0] * sx, p[1] * sy] };
};
const rotCase = (deg, centre) => (centre
  ? { code: `vec2 p = uv - 0.5;\np = rot(radians(${f(deg)})) * p;\np += 0.5;\ncol = drawF(p);`, fn: (p) => G.add(G.rot2([p[0] - 0.5, p[1] - 0.5], deg * DEG), 0.5) }
  : { code: `vec2 p = rot(radians(${f(deg)})) * uv;\ncol = drawF(p);`, fn: (p) => G.rot2(p, deg * DEG) });
const caseSpec = (c) => fSpec(c.code);

// ---- 2D canvas helpers for the matrix concept ----
// F geometry in paper space (0..1), matching the letterF texture.
const F_RECTS = [[0.273, 0.156, 0.43, 0.844], [0.273, 0.695, 0.742, 0.844], [0.273, 0.43, 0.625, 0.5625]];
const matApply = (M, p) => [M[0] * p[0] + M[2] * p[1], M[1] * p[0] + M[3] * p[1]];
/** Draw a grid + the F, both pushed through matrix M (column-major [a,b,c,d]) */
function drawSpace(P, M, opts = {}) {
  const ctx = P.ctx;
  const T = (p) => P.toPx(matApply(M, p));
  const line = (a, b, col, w = 1) => { const A = T(a), B = T(b); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); };
  const poly = (pts, fill, stroke) => {
    ctx.beginPath(); pts.forEach((p, i) => { const q2 = T(p); if (i) ctx.lineTo(q2[0], q2[1]); else ctx.moveTo(q2[0], q2[1]); }); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  };
  if (opts.ghost) {
    // the untransformed F, faint, for comparison
    const TI = (p) => P.toPx(p);
    ctx.save(); ctx.globalAlpha = 0.25;
    F_RECTS.forEach(([x0, y0, x1, y1]) => { ctx.beginPath(); [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach((p, i) => { const q2 = TI(p); if (i) ctx.lineTo(q2[0], q2[1]); else ctx.moveTo(q2[0], q2[1]); }); ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); });
    ctx.restore();
  }
  for (let k = -4; k <= 4; k++) {
    line([k, -4], [k, 4], 'rgba(107,223,255,0.22)');
    line([-4, k], [4, k], 'rgba(107,223,255,0.22)');
  }
  poly([[0, 0], [1, 0], [1, 1], [0, 1]], 'rgba(42,108,255,0.55)', '#2a6cff');
  F_RECTS.forEach(([x0, y0, x1, y1]) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], '#ffd23f'));
  const dot = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; dot.push([0.8 + 0.086 * Math.cos(a), 0.18 + 0.086 * Math.sin(a)]); }
  poly(dot, '#ff4f6d');
  if (opts.axes !== false) {
    P.arrow(matApply(M, [1, 0]), '#ff7ab2', 'x→', [0, 0], 3);
    P.arrow(matApply(M, [0, 1]), '#3ddc97', 'y→', [0, 0], 3);
  }
}
const matCode = (M) => `mat2(${M.map((x) => f(x, 2)).join(', ')})`;
/** plane half-size that fits the transformed paper nicely */
const fitR = (M) => { const ext = Math.max(...[[1, 0], [0, 1], [1, 1]].map((p) => Math.max(...matApply(M, p).map(Math.abs)))); return Math.max(1.25, Math.ceil((ext + 0.3) * 2) / 2); };
const spaceVisual = (M, R, opts) => (el) => { const P = vectorPlane(R || fitR(M), 300); P.clear({ unitCircle: false }); drawSpace(P, M, opts); el.append(P.el); };

// Matrix pools for the matrix games
const MATS1 = [
  { M: [2, 0, 0, 1], name: 'twice as wide' }, { M: [1, 0, 0, 2], name: 'twice as tall' },
  { M: [-1, 0, 0, 1], name: 'mirrored left↔right' }, { M: [1, 0, 0, -1], name: 'mirrored upside down' },
  { M: [0.5, 0, 0, 0.5], name: 'half size' }, { M: [2, 0, 0, 2], name: 'double size' },
  { M: [1.5, 0, 0, 1], name: '1.5× as wide' }, { M: [1, 0, 0, 0.5], name: 'half as tall' },
];
const MATS2 = [
  { M: [0, 1, -1, 0], name: 'rotated 90° anticlockwise' }, { M: [0, -1, 1, 0], name: 'rotated 90° clockwise' },
  { M: [-1, 0, 0, -1], name: 'rotated 180°' }, { M: [1, 0, 0.5, 1], name: 'sheared: top pushed right' },
  { M: [1, 0, -0.5, 1], name: 'sheared: top pushed left' }, { M: [1, 0.5, 0, 1], name: 'sheared: right side pushed up' },
  { M: [0, 1, 1, 0], name: 'x and y swapped (mirror on the diagonal)' },
];
const MATS3 = [
  { M: [0, 2, -2, 0], name: 'rotated 90° anticlockwise and doubled' }, { M: [-1, 0, 0.5, 1], name: 'mirrored and sheared' },
  { M: [1, 1, -1, 1], name: 'rotated 45° and bigger' }, { M: [0.5, 0, 1, 1], name: 'squashed and sheared' },
  { M: [1.5, 0.5, 0, 1], name: 'stretched and tilted' }, { M: [0, -1, -1, 0], name: 'mirrored on the other diagonal' },
];
const matPool = (level) => (level === 1 ? MATS1 : level === 2 ? [...MATS1, ...MATS2, ...MATS2] : [...MATS2, ...MATS3, ...MATS3]);

export default {
  id: 'transforms',
  title: 'Transforming space',
  icon: '🔄',
  blurb: 'Move, zoom and spin things by changing the coordinates — and why it all feels backwards.',
  cheatsheet: `
<p><b>The big idea:</b> a fragment shader can't move a picture. It changes <i>where each pixel looks</i> (the coordinates). The picture appears to do the <b>opposite</b>. Think <b>camera</b>: move the camera right → the world slides left.</p>
<ul>
<li><b>Translate:</b> <code>p = uv - offset</code> → picture moves <b>by +offset</b>. (<code>uv + offset</code> moves it the other way.)</li>
<li><b>Scale:</b> <code>p = uv * 2.0</code> → picture gets <b>smaller</b> (camera sees 2× more). <code>* 0.5</code> → bigger.</li>
<li><b>Rotate:</b> <code>p = rot(a) * p</code> → picture turns <b>clockwise</b> by a. Use <code>rot(-a)</code> to turn it anticlockwise.</li>
<li><b>Pivot:</b> scaling/rotating happens around (0,0). To use another pivot: <code>p -= pivot; …transform…; p += pivot;</code></li>
</ul>
<pre class="code">vec2 p = uv - 0.5;            // pivot = centre
p = rot(radians(30.0)) * p;   // rotate
p *= 2.0;                     // zoom out
p += 0.5;                     // back
col = texture2D(uTex, p).rgb;</pre>
<p><b>Order matters</b> when steps don't commute: translate+rotate, translate+scale, non-uniform scale+rotate.</p>
<p><b>mat2(a, b, c, d)</b>: first column (a, b) = where the x axis goes, second column (c, d) = where the y axis goes. <code>M * v = v.x * col0 + v.y * col1</code>. <code>rot(a) = mat2(cos a, sin a, -sin a, cos a)</code>.</p>`,
  concepts: [
    // ==================================================================
    {
      id: 'transforms.translate',
      title: 'Moving things (translate)',
      blurb: 'uv − offset moves the picture the "wrong" way. Here\'s why it\'s actually right.',
      lesson: [
        {
          title: 'A picture is a lookup',
          body: `<p>Meet our test picture: the letter <b>F</b> on a blue square of "paper". It's lopsided on purpose — you can always tell if it got flipped or turned.</p>
<p>Every pixel asks: <i>"what's on the paper at position <code>p</code>?"</i>. Here <code>p</code> is just <code>uv</code>, so the paper fills the square exactly.</p>
<p><code>drawF(p)</code> is our little helper: it reads the F texture at <code>p</code> (like <code>texture2D(uTex, p)</code>) and shows a dark table where <code>p</code> falls outside the paper (outside 0..1). The faint lines are a fixed ruler every 0.25.</p>`,
          shader: fSpec('vec2 p = uv;\ncol = drawF(p);'),
          code: 'vec2 p = uv;      // where should I look on the paper?\ncol = drawF(p);   // look there',
        },
        {
          title: 'Subtract an offset',
          body: `<p>Now we change <i>where pixels look</i>: <code>p = uv - offset</code>.</p>
<p>Drag the slider to a <b>positive</b> offset. Which way does the F go?</p>`,
          controls: [{ name: 'x', label: 'offset.x', min: -0.5, max: 0.5, step: 0.05, value: 0.25 }],
          shader: (v) => fSpec('vec2 p = uv - uOff;\ncol = drawF(p);', { uOff: [v.x, 0] }),
          code: (v) => `vec2 p = uv - vec2(${f(v.x, 2)}, 0.0);\ncol = drawF(p);`,
          after: '<div class="note">Minus a <b>positive</b> number moved the F to the <b>right</b> (the positive direction). It feels backwards at first — next slide explains it.</div>',
        },
        {
          title: 'Why backwards? Be one pixel',
          body: `<p>Be the pixel at <code>uv.x = 0.5</code> with <code>offset.x = 0.25</code>:</p>
<ul><li>I compute <code>p.x = 0.5 − 0.25 = 0.25</code>.</li>
<li>So I show what's on the paper at <b>0.25</b>.</li>
<li>Whatever was drawn at 0.25 now appears at <b>0.5</b> — it moved <b>right</b> by 0.25.</li></ul>
<div class="analogy">🎥 <b>Analogy: a camera.</b> Changing uv is moving the <b>camera</b>, not the object. <code>uv - 0.25</code> moves the camera 0.25 to the <i>left</i>, so on screen the world slides to the <i>right</i>. Like looking out of a moving train window.</div>
<div class="note">You're moving the <b>pen that reads the paper</b>, not the paper. The paper appears to move the opposite way.</div>`,
          shaders: [
            { spec: fSpec('vec2 p = uv;\ncol = drawF(p);'), label: '<code>p = uv</code>' },
            { spec: fSpec('vec2 p = uv - vec2(0.25, 0.0);\ncol = drawF(p);'), label: '<code>p = uv - 0.25</code> → F moved right' },
          ],
          quiz: { q: 'With <code>p = uv - vec2(0.25, 0.0)</code>, the pixel at uv.x = 0.75 shows the paper at…', options: ['x = 0.5', 'x = 1.0', 'x = 0.75'], answer: 0, explain: '0.75 − 0.25 = 0.5. That pixel shows what used to be at 0.5 — the paper slid right.' },
        },
        {
          title: 'Both directions at once',
          body: `<p><code>offset</code> is a <code>vec2</code>, so x and y move independently. Positive y moves the F <b>up</b>, negative y moves it <b>down</b>.</p>
<p>Rule of thumb: <b>subtract where you want it to go</b>.</p>`,
          controls: [
            { name: 'x', label: 'offset.x', min: -0.5, max: 0.5, step: 0.05, value: 0.2 },
            { name: 'y', label: 'offset.y', min: -0.5, max: 0.5, step: 0.05, value: -0.15 },
          ],
          shader: (v) => fSpec('vec2 p = uv - uOff;\ncol = drawF(p);', { uOff: [v.x, v.y] }),
          code: (v) => `vec2 p = uv - vec2(${f(v.x, 2)}, ${f(v.y, 2)});\ncol = drawF(p);\n// F moves by (${n(v.x)}, ${n(v.y)})`,
        },
        {
          title: 'In real engines',
          body: `<p>Real textures usually <b>repeat</b> (wrap mode "repeat"), so a moved texture never leaves a gap — it slides around and comes back on the other side. Left: our helper (dark outside). Right: a plain <code>texture2D</code> with repeat.</p>`,
          controls: [{ name: 'x', label: 'offset.x', min: -0.5, max: 0.5, step: 0.05, value: 0.3 }],
          shaders: [
            { spec: (v) => fSpec('vec2 p = uv - uOff;\ncol = drawF(p);', { uOff: [v.x, 0] }), label: 'drawF (paper)' },
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv - uOff).rgb;', textures: { uTex: { name: 'letterF', wrap: 'repeat' } }, uniforms: { uOff: [v.x, 0] } }), label: 'repeat wrap' },
          ],
          after: `<div class="tip">💡 Unity Shader Graph <b>Tiling And Offset</b> and Unreal's <b>TexCoord + Add</b> do <code>uv + offset</code>. Because it's <i>plus</i>, a positive offset moves the texture <b>left/down</b> on the surface. Same maths, just the opposite sign.</div>`,
        },
      ],
      games: [
        {
          id: 'match-offset', title: 'Slide it into place', engine: 'slider', rounds: 4,
          blurb: 'Tune the offset until your F lands on the target.',
          gen: (rng, level) => {
            const st = level === 3 ? 0.05 : 0.1;
            const pickO = () => { let x; do x = rng.step(-0.4, 0.4, st); while (Math.abs(x) < 0.05); return x; };
            const plus = level === 3 && rng.chance(0.5);
            const ox = pickO(), oy = level === 1 ? 0 : pickO();
            const params = [{ name: 'x', label: 'offset.x', min: -0.5, max: 0.5, step: 0.05, target: ox }];
            if (level > 1) params.push({ name: 'y', label: 'offset.y', min: -0.5, max: 0.5, step: 0.05, target: oy });
            const op = plus ? '+' : '-';
            return {
              prompt: 'Move your F onto the target F.',
              sub: plus ? 'Careful: this code uses <b>plus</b>!' : level === 1 ? 'Only x this time. Which sign moves it right?' : 'Use the ruler lines (every 0.25) to judge distances.',
              params,
              build: (vals) => fSpec(`vec2 p = uv ${op} uOff;\ncol = drawF(p);`, { uOff: [vals.x, vals.y ?? 0] }),
              code: (vals) => `vec2 p = uv ${op} vec2(${f(vals.x, 2)}, ${f(vals.y ?? 0, 2)});`,
              explain: plus
                ? `<p>With <code>uv + offset</code> everything flips: the F moves by <b>−offset</b>. Target offset was (${n(ox)}, ${n(oy)}), so the F moved by (${n(-ox)}, ${n(-oy)}).</p>`
                : `<p>With <code>uv - offset</code> the F moves by <b>+offset</b>: subtract where you want it to go. Target: (${n(ox)}, ${n(oy)}).</p>`,
            };
          },
        },
        {
          id: 'shift-pick', title: 'Where does it go?', engine: 'mcq', rounds: 8,
          blurb: 'Read the offset code, pick the picture.',
          gen: (rng, level) => {
            const d = level === 1 ? 0.3 : rng.pick([0.2, 0.25, 0.3]);
            let dx, dy;
            if (level === 1) [dx, dy] = rng.pick([[d, 0], [-d, 0], [0, d], [0, -d]]);
            else { dx = rng.pick([-d, d, 0.1, -0.1]); dy = rng.pick([-d, d, -0.15, 0.15]); }
            const plus = level === 3 && rng.chance(0.5);
            const ans = shiftCase(dx, dy, plus);
            const opts = distinct(rng, ans, (r) => {
              const k = r.int(0, 3);
              const c = [[-dx, -dy], [dy, dx], [dx, -dy], [-dx, dy]][k];
              return shiftCase(c[0], c[1], plus);
            }, 4, caseKey);
            return {
              prompt: 'Which picture does this code draw?',
              code: ans.code,
              options: opts.map((o) => ({ shader: caseSpec(o) })),
              explain: plus
                ? `<p><code>uv + (${n(dx)}, ${n(dy)})</code> makes every pixel look further along +offset, so the F slides by <b>(${n(-dx)}, ${n(-dy)})</b>.</p>`
                : `<p><code>uv - (${n(dx)}, ${n(dy)})</code>: each pixel looks <i>back</i> by the offset, so the F appears moved <b>forward by (${n(dx)}, ${n(dy)})</b>.</p>`,
            };
          },
        },
        {
          id: 'shift-name', title: 'Name that offset', engine: 'mcq', rounds: 8,
          blurb: 'Look at where the F went, pick the code.',
          gen: (rng, level) => {
            const d = rng.pick(level === 1 ? [0.25] : [0.2, 0.25, 0.3]);
            const choices = level === 1 ? [[d, 0], [-d, 0], [0, d], [0, -d]] : [[d, d], [-d, d], [d, -d], [-d, -d], [d, 0], [0, -d]];
            const [dx, dy] = rng.pick(choices);
            const plus = level === 3 && rng.chance(0.4);
            const ans = shiftCase(dx, dy, plus);
            const opts = distinct(rng, ans, (r) => {
              const c = r.pick([[-dx, -dy], [dy, dx], [dx, -dy], [-dx, dy], [-dy, -dx]]);
              return shiftCase(c[0], c[1], level === 3 ? r.chance(0.5) : plus);
            }, 4, caseKey);
            return {
              prompt: 'Which code moved the F like this?',
              sub: 'The faint lines are every 0.25.',
              shader: caseSpec(ans),
              options: opts.map((o) => ({ code: o.code.split('\n')[0] })),
              explain: '<p>Find how far the F moved (count ruler lines). With <code>uv - offset</code> the offset equals that movement. With <code>uv + offset</code> it\'s the negative.</p>',
            };
          },
        },
        {
          id: 'shift-gpu', title: 'Be the pixel', engine: 'numeric', rounds: 6,
          blurb: 'Compute where a pixel looks, or where a point ends up.',
          gen: (rng, level) => {
            const dx = rng.step(-0.3, 0.3, 0.1) || 0.2, dy = rng.step(-0.3, 0.3, 0.1) || -0.1;
            const code = `vec2 p = uv - ${v2(dx, dy)};\ncol = drawF(p);`;
            const forward = level === 1 || (level === 2 ? rng.chance(0.5) : rng.chance(0.3));
            if (forward) {
              const u = rng.step(0.3, 0.7, 0.1), w = rng.step(0.3, 0.7, 0.1);
              const ans = [r2(u - dx), r2(w - dy)];
              return {
                prompt: `The pixel at <b>uv = ${nv([u, w])}</b> runs this code. Which paper point <code>p</code> does it read?`,
                code, answer: ans, wrap: 'vec2',
                explain: `<p>Just do the subtraction: (${n(u)} − ${n(dx)}, ${n(w)} − ${n(dy)}) = <b>${nv(ans)}</b>.</p>`,
              };
            }
            const a = rng.step(0.3, 0.7, 0.1), b = rng.step(0.3, 0.7, 0.1);
            const ans = [r2(a + dx), r2(b + dy)];
            return {
              prompt: `A paint spot sits on the paper at <b>${nv([a, b])}</b>. At which <b>uv on screen</b> does it appear now?`,
              sub: 'Think backwards: which pixel has p equal to the spot?',
              code, answer: ans, wrap: 'vec2',
              explain: `<p>We need the pixel where <code>uv − offset = spot</code>, so <code>uv = spot + offset</code> = (${n(a)} + ${n(dx)}, ${n(b)} + ${n(dy)}) = <b>${nv(ans)}</b>. Subtracting in the code = moving forward on screen.</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'transforms.scale',
      title: 'Zooming (scale)',
      blurb: 'uv × 2 makes things SMALLER. And how to zoom around the centre.',
      lesson: [
        {
          title: 'Multiply the coordinates',
          body: `<p>Now multiply: <code>p = uv * s</code>. Try making <code>s</code> <b>bigger than 1</b>. Does the F grow or shrink?</p>`,
          controls: [{ name: 's', label: 's', min: 0.5, max: 3, step: 0.05, value: 2 }],
          shader: (v) => fSpec('vec2 p = uv * uS;\ncol = drawF(p);', { uS: v.s }),
          code: (v) => `vec2 p = uv * ${f(v.s, 2)};\ncol = drawF(p);\n// paper now ${n(1 / v.s, 2)} wide on screen`,
          after: '<div class="note">Bigger <code>s</code> → <b>smaller</b> F. The paper\'s size on screen is <b>1 / s</b>.</div>',
        },
        {
          title: 'Why smaller? Be one pixel again',
          body: `<p>With <code>s = 2</code>, the pixel at <code>uv = 0.5</code> computes <code>p = 1.0</code> — the <b>far edge</b> of the paper.</p>
<p>So the whole paper (0..1) is squeezed into the screen range 0..0.5. Half the size!</p>
<div class="analogy">🎥 <b>Camera again:</b> multiplying by 2 means each pixel covers <b>twice as much</b> of the paper. That's <b>zooming out</b> — you see more stuff, so each thing looks smaller.</div>`,
          shaders: [
            { spec: fSpec('vec2 p = uv * 2.0;\ncol = drawF(p);'), label: '<code>uv * 2.0</code> → smaller' },
            { spec: fSpec('vec2 p = uv * 0.5;\ncol = drawF(p);'), label: '<code>uv * 0.5</code> → bigger' },
          ],
          quiz: { q: 'You want the F to look <b>3× bigger</b>. Multiply uv by…', options: ['1.0 / 3.0 (≈ 0.333)', '3.0', '-3.0'], answer: 0, explain: 'Bigger on screen = each pixel covers less paper = multiply by less than 1. Size on screen = 1 / s.' },
        },
        {
          title: 'It shrinks towards the corner',
          body: `<p>Notice the F always shrinks towards the <b>bottom-left corner</b>. That's <code>uv = (0, 0)</code> — the <b>origin</b>.</p>
<p>Multiplying never changes 0: <code>0 × s = 0</code>. So the origin stays put and everything else squeezes towards it. That fixed point is the <b>pivot</b>.</p>
<p>To zoom around the <b>centre</b>, make the centre the origin first:</p>
<ol><li><code>p = uv - 0.5</code> — now the centre is (0,0)</li><li><code>p *= s</code> — zoom around it</li><li><code>p += 0.5</code> — put it back</li></ol>`,
          controls: [{ name: 's', label: 's', min: 0.5, max: 3, step: 0.05, value: 1.5 }],
          shaders: [
            { spec: (v) => fSpec('vec2 p = uv * uS;\ncol = drawF(p);', { uS: v.s }), label: 'around the corner' },
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np *= uS;\np += 0.5;\ncol = drawF(p);', { uS: v.s }), label: 'around the centre' },
          ],
          code: (v) => `vec2 p = uv - 0.5;  // centre → origin\np *= ${f(v.s, 2)};          // zoom\np += 0.5;           // back\ncol = drawF(p);`,
        },
        {
          title: 'Squash & stretch',
          body: `<p>Multiply by a <code>vec2</code> to scale x and y differently. Same backwards rule on each axis: bigger number = <b>thinner</b> in that direction.</p>`,
          controls: [
            { name: 'x', label: 's.x', min: 0.5, max: 3, step: 0.05, value: 2 },
            { name: 'y', label: 's.y', min: 0.5, max: 3, step: 0.05, value: 1 },
          ],
          shader: (v) => fSpec('vec2 p = uv - 0.5;\np *= uS;\np += 0.5;\ncol = drawF(p);', { uS: [v.x, v.y] }),
          code: (v) => `vec2 p = uv - 0.5;\np *= vec2(${f(v.x, 2)}, ${f(v.y, 2)});\np += 0.5;\ncol = drawF(p);`,
          after: '<div class="tip">💡 A negative scale mirrors: <code>p.x *= -1.0</code> flips left↔right (around the pivot).</div>',
        },
        {
          title: 'Tiling = scale + repeat',
          body: `<p>Zoom out by 3 and the paper only covers a third of the screen. But with <code>fract(p)</code> (or a repeating texture) every 0..1 square shows a full copy: <b>tiling</b>!</p>
<p><code>uv * 3.0</code> runs 0..3, <code>fract</code> turns that into 0..1, 0..1, 0..1 — three copies per row.</p>`,
          controls: [{ name: 's', label: 'tiles', min: 1, max: 6, step: 1, value: 3 }],
          shader: (v) => fSpec('vec2 p = fract(uv * uS);\ncol = drawF(p);', { uS: v.s }),
          code: (v) => `vec2 p = fract(uv * ${f(v.s)});\ncol = drawF(p);`,
          after: '<div class="tip">💡 This is exactly what the <b>Tiling</b> input of Shader Graph\'s Tiling And Offset (or a TexCoord node\'s UTiling / VTiling in Unreal) does: multiply the UVs.</div>',
          quiz: { q: '<code>fract(uv * vec2(4.0, 2.0))</code> gives how many copies in total?', options: ['8', '6', '2'], answer: 0, explain: '4 across × 2 up = 8 tiles. Each copy is 4× thinner and 2× shorter.' },
        },
      ],
      games: [
        {
          id: 'match-zoom', title: 'Zoom match', engine: 'slider', rounds: 4,
          blurb: 'Tune the scale so your F matches the target size.',
          gen: (rng, level) => {
            const sv = () => rng.pick([0.5, 0.75, 1.25, 1.5, 2, 2.5]);
            if (level === 1) {
              const s = sv();
              return {
                prompt: 'Match the size. (Zoom is around the centre.)',
                sub: 'Remember: bigger number = smaller F.',
                params: [{ name: 's', label: 's', min: 0.5, max: 3, step: 0.05, target: s }],
                build: (vals) => fSpec('vec2 p = uv - 0.5;\np *= uS;\np += 0.5;\ncol = drawF(p);', { uS: vals.s }),
                code: (vals) => `p *= ${f(vals.s, 2)};`,
                explain: `<p>The target used <code>s = ${n(s)}</code>, so the F is <b>${n(1 / s, 2)}×</b> its normal size (1 / s).</p>`,
              };
            }
            let sx = sv(), sy = sv();
            while (sx === sy) sy = sv();
            const params = [{ name: 'x', label: 's.x', min: 0.5, max: 3, step: 0.05, target: sx }, { name: 'y', label: 's.y', min: 0.5, max: 3, step: 0.05, target: sy }];
            const corner = level === 3 && rng.chance(0.5);
            return {
              prompt: corner ? 'Match the shape — this one scales around the <b>corner</b> (0,0)!' : 'Match the width and the height.',
              sub: 'Each axis has its own scale. Bigger = thinner on that axis.',
              params,
              build: (vals) => fSpec(corner ? 'vec2 p = uv * uS;\ncol = drawF(p);' : 'vec2 p = uv - 0.5;\np *= uS;\np += 0.5;\ncol = drawF(p);', { uS: [vals.x, vals.y] }),
              code: (vals) => (corner ? `vec2 p = uv * vec2(${f(vals.x, 2)}, ${f(vals.y, 2)});` : `p *= vec2(${f(vals.x, 2)}, ${f(vals.y, 2)});`),
              explain: `<p>Target: <code>vec2(${f(sx)}, ${f(sy)})</code> → the paper is ${n(1 / sx, 2)} wide and ${n(1 / sy, 2)} tall on screen.</p>`,
            };
          },
        },
        {
          id: 'zoom-pick', title: 'Bigger or smaller?', engine: 'mcq', rounds: 8,
          blurb: 'Read the scale code, pick the picture.',
          gen: (rng, level) => {
            const vals = level === 1 ? [0.5, 2] : [0.5, 0.75, 1.5, 2];
            const mk = (r) => {
              const uni = level === 1 || r.chance(0.5);
              const sx = r.pick(vals), sy = uni ? sx : r.pick(vals);
              const centre = level === 2 ? r.chance(0.7) : r.chance(0.5);
              return scaleCase(sx, sy, centre);
            };
            const ans = mk(rng);
            const opts = distinct(rng, ans, mk, 4, caseKey);
            return {
              prompt: 'Which picture does this code draw?',
              code: ans.code,
              options: opts.map((o) => ({ shader: caseSpec(o) })),
              explain: '<p>Size on screen = <b>1 / scale</b>: ×2 → half size, ×0.5 → double. Without <code>- 0.5 … + 0.5</code> the pivot is the bottom-left corner, so the F shrinks/grows from there.</p>',
            };
          },
        },
        {
          id: 'zoom-math', title: 'Zoom maths', engine: 'numeric', rounds: 6,
          blurb: 'Compute sizes, tile counts and where pixels look.',
          gen: (rng, level) => {
            const kind = rng.pick(level === 1 ? ['size', 'read'] : level === 2 ? ['size', 'read', 'tiles', 'appear'] : ['read', 'appear', 'centre', 'tiles']);
            if (kind === 'size') {
              const s = rng.pick([2, 4, 0.5, 0.25, 5]);
              return { prompt: `<code>vec2 p = uv * ${f(s)};</code><br>How wide is the paper on screen now? (normal = 1.0)`, answer: 1 / s, explain: `<p>Size on screen = 1 / s = 1 / ${n(s)} = <b>${n(1 / s)}</b>. ${s > 1 ? 'Multiplying by more than 1 zooms out.' : 'Multiplying by less than 1 zooms in.'}</p>` };
            }
            if (kind === 'tiles') {
              const a = rng.int(2, 5), b = rng.int(1, 4);
              return { prompt: `How many full copies of the F appear in total?`, code: `vec2 p = fract(uv * vec2(${f(a)}, ${f(b)}));\ncol = drawF(p);`, answer: a * b, tolerance: 0.01, explain: `<p>${a} across × ${b} up = <b>${a * b}</b> tiles.</p>` };
            }
            if (kind === 'read') {
              const s = rng.pick([2, 3, 0.5]), u = rng.step(0.1, 0.5, 0.1), w = rng.step(0.1, 0.5, 0.1);
              const ans = [r2(u * s), r2(w * s)];
              return { prompt: `Pixel at <b>uv = ${nv([u, w])}</b>. Which paper point p does it read?`, code: `vec2 p = uv * ${f(s)};`, answer: ans, wrap: 'vec2', explain: `<p>(${n(u)} × ${n(s)}, ${n(w)} × ${n(s)}) = <b>${nv(ans)}</b>.</p>` };
            }
            if (kind === 'appear') {
              const s = rng.pick([2, 4]), a = rng.step(0.2, 1, 0.2), b = rng.step(0.2, 1, 0.2);
              const ans = [r2(a / s), r2(b / s)];
              return { prompt: `A spot on the paper at <b>${nv([a, b])}</b>. Where on screen (uv) does it appear?`, code: `vec2 p = uv * ${f(s)};`, answer: ans, wrap: 'vec2', explain: `<p>We need <code>uv × ${n(s)} = spot</code>, so <code>uv = spot / ${n(s)}</code> = <b>${nv(ans)}</b>. Multiplying in code = dividing on screen.</p>` };
            }
            const s = rng.pick([2, 0.5]), u = rng.pick([0.25, 0.75, 1]), w = rng.pick([0, 0.25, 0.75]);
            const ans = [r2((u - 0.5) * s + 0.5), r2((w - 0.5) * s + 0.5)];
            return { prompt: `Pixel at <b>uv = ${nv([u, w])}</b>. Which paper point p does it read?`, code: `vec2 p = uv - 0.5;\np *= ${f(s)};\np += 0.5;`, answer: ans, wrap: 'vec2', explain: `<p>Step by step: (${n(u)}, ${n(w)}) − 0.5 = ${nv([u - 0.5, w - 0.5])}; × ${n(s)} = ${nv([(u - 0.5) * s, (w - 0.5) * s])}; + 0.5 = <b>${nv(ans)}</b>.</p>` };
          },
        },
        {
          id: 'zoom-tf', title: 'Zoom: true or false?', engine: 'mcq', rounds: 8,
          blurb: 'Quick checks on the backwards rules of scaling.',
          questions: [
            tf('<code>uv * 2.0</code> makes the picture twice as big.', false, 'Opposite! Each pixel covers twice as much paper → the picture is half size.'),
            tf('<code>uv * 0.5</code> zooms in (picture looks bigger).', true, 'Each pixel covers half as much paper → everything looks 2× bigger.'),
            tf('Without any offset, scaling happens around the bottom-left corner.', true, 'uv = (0,0) is the corner, and 0 × anything = 0, so it stays fixed.'),
            tf('To zoom around the centre you subtract 0.5, scale, then add 0.5.', true, 'Move the pivot to the origin, scale, move it back.'),
            tf('<code>p *= vec2(2.0, 1.0)</code> makes the F twice as wide.', false, 'x is multiplied by 2 → it gets half as wide (thinner). Height is unchanged.'),
            tf('<code>p.x *= -1.0</code> mirrors the picture left↔right around the pivot.', true, 'Negative scale = mirror.', 2),
            tf('<code>fract(uv * 3.0)</code> shows 9 copies of the texture.', true, '3 across × 3 up = 9.', 2),
            tf('The size on screen is 1 / scale.', true, 'That\'s the backwards rule in one formula.'),
            tf('Scaling by 1.0 changes nothing.', true, 'Multiplying by 1 leaves the coordinates as they are.'),
            tf('<code>(uv - 0.5) * 2.0 + 0.5</code> makes the F fill the screen twice over.', false, 'It shrinks the F to half size, centred.', 2),
            q('Shader Graph\'s "Tiling" value of 4 makes the texture look…', ['4× smaller, repeated 4 times', '4× bigger', 'move 4 units'], 'Tiling multiplies the UVs, which zooms out.', { level: 2 }),
            q('You want the F at 1.5× its size, centred. Which scale?', ['p *= 0.667;', 'p *= 1.5;', 'p *= -1.5;'], '1 / 1.5 ≈ 0.667. To look bigger, multiply by less than 1.', { level: 3 }),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'transforms.rotate',
      title: 'Spinning (rotate)',
      blurb: 'rot(a) turns coordinates — so the picture turns the other way. Pivots too.',
      lesson: [
        {
          title: 'rot(a) turns arrows',
          body: `<p><code>rot(a)</code> gives a <b>rotation matrix</b>. <code>rot(a) * v</code> turns the arrow <code>v</code> <b>anticlockwise</b> by angle <code>a</code> (in radians) around (0, 0).</p>
<p>Drag the angle and watch the yellow arrow turn into the orange one.</p>`,
          controls: [{ name: 'a', label: 'angle (degrees)', min: -180, max: 180, step: 5, value: 45 }],
          visual: (el, v) => {
            const P = vectorPlane(1.5, 280); P.clear();
            const a = v.a * DEG, base = [1, 0.4];
            const r = G.rot2(base, a);
            P.arrow(base, '#ffd479', 'v'); P.arrow(r, '#ff9f43', 'rot(a)*v');
            el.append(P.el, h('div.readout', { html: `v        = ${nv(base, 2)}\nrot(a)*v = ${nv(r, 2)}` }));
          },
          code: (v) => `vec2 r = rot(radians(${f(v.a)})) * v;\n// radians(deg) converts degrees → radians\n// rot(a) = mat2(cos(a), sin(a), -sin(a), cos(a))`,
          after: '<div class="tip">💡 GLSL angles are in <b>radians</b>: 180° = π ≈ 3.14. <code>radians(90.0)</code> converts for you. <code>rot()</code> is a helper in this app — in your own shaders you write it yourself (one line, see the cheatsheet).</div>',
        },
        {
          title: 'Rotate the uv',
          body: `<p>Now rotate the <b>coordinates</b>: <code>p = rot(a) * uv</code>. Two surprises:</p>
<ol><li>It spins around the <b>bottom-left corner</b> (the origin, again).</li><li>A positive angle turns the F <b>clockwise</b>!</li></ol>`,
          controls: [{ name: 'a', label: 'angle (degrees)', min: -90, max: 90, step: 5, value: 20 }],
          shader: (v) => fSpec('vec2 p = rot(uA) * uv;\ncol = drawF(p);', { uA: v.a * DEG }),
          code: (v) => `vec2 p = rot(radians(${f(v.a)})) * uv;\ncol = drawF(p);`,
        },
        {
          title: 'Why clockwise?',
          body: `<p>Same reason as before: we turn the <b>camera</b>, not the paper.</p>
<div class="analogy">🎥 Tilt your phone camera anticlockwise — the world on screen tilts <b>clockwise</b>.</div>
<p>So the rules are:</p>
<ul><li><code>rot(a)</code> on uv → picture turns <b>clockwise</b> by a</li><li><code>rot(-a)</code> on uv → picture turns <b>anticlockwise</b> by a</li></ul>`,
          controls: [{ name: 'a', label: 'a (degrees)', min: 0, max: 90, step: 5, value: 30 }],
          shaders: [
            { spec: (v) => fSpec('vec2 p = rot(uA) * (uv - 0.5) + 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: '<code>rot(a)</code> → clockwise' },
            { spec: (v) => fSpec('vec2 p = rot(-uA) * (uv - 0.5) + 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: '<code>rot(-a)</code> → anticlockwise' },
          ],
          quiz: { q: 'You want the F to lean <b>anticlockwise</b> by 30°. Which line?', options: ['p = rot(radians(-30.0)) * p;', 'p = rot(radians(30.0)) * p;', 'p = rot(30.0) * p;'], answer: 0, explain: 'The picture turns opposite to the coordinates, so use −30°. (And rot(30.0) would mean 30 radians!)' },
        },
        {
          title: 'Spin around the centre',
          body: `<p>Same trick as zooming. Rotation happens around (0, 0), so:</p>
<ol><li><code>p = uv - 0.5</code> — centre becomes the origin</li><li><code>p = rot(a) * p</code> — spin</li><li><code>p += 0.5</code> — move back</li></ol>
<div class="analogy">📌 <b>Analogy:</b> stick a pin through the paper and spin it. The pin is the <b>pivot</b>. Moving to the origin is "putting the pin in".</div>`,
          controls: [{ name: 'a', label: 'angle (degrees)', min: -180, max: 180, step: 5, value: 45 }],
          shader: (v) => fSpec('vec2 p = uv - 0.5;\np = rot(uA) * p;\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }),
          code: (v) => `vec2 p = uv - 0.5;             // pin in the centre\np = rot(radians(${f(v.a)})) * p;  // spin\np += 0.5;                      // pin out\ncol = drawF(p);`,
        },
        {
          title: 'Any pivot you like',
          body: `<p>The pivot can be any point: subtract it, rotate, add it back. Here the pivot is the pink dot — try putting it on the F's red ball.</p>`,
          controls: [
            { name: 'a', label: 'angle (degrees)', min: -180, max: 180, step: 5, value: 60 },
            { name: 'x', label: 'pivot.x', min: 0, max: 1, step: 0.05, value: 0.8 },
            { name: 'y', label: 'pivot.y', min: 0, max: 1, step: 0.05, value: 0.2 },
          ],
          shader: (v) => fSpec('vec2 p = uv - uPiv;\np = rot(uA) * p;\np += uPiv;\ncol = drawF(p);\ncol = mix(col, vec3(1.0, 0.3, 0.8), 1.0 - smoothstep(0.015, 0.025, length(uv - uPiv)));', { uA: v.a * DEG, uPiv: [v.x, v.y] }),
          code: (v) => `vec2 pivot = vec2(${f(v.x, 2)}, ${f(v.y, 2)});\nvec2 p = uv - pivot;\np = rot(radians(${f(v.a)})) * p;\np += pivot;\ncol = drawF(p);`,
          after: '<div class="note">The pivot is the one point that never moves. Recipe for ANY transform around a pivot: <b>subtract pivot → transform → add pivot</b>.</div>',
        },
      ],
      games: [
        {
          id: 'match-angle', title: 'Spin to win', engine: 'slider', rounds: 4,
          blurb: 'Rotate your F to match the target.',
          gen: (rng, level) => {
            const stp = level === 1 ? 45 : level === 2 ? 15 : 5;
            let a; do a = rng.step(-165, 165, stp); while (Math.abs(a) < 10);
            const params = [{ name: 'a', label: 'angle (degrees)', min: -180, max: 180, step: 5, target: a }];
            const pivotGame = level === 3 && rng.chance(0.5);
            let px = 0.5, py = 0.5;
            if (pivotGame) {
              px = rng.pick([0.25, 0.75]); py = rng.pick([0.25, 0.75]);
              params.push({ name: 'x', label: 'pivot.x', min: 0, max: 1, step: 0.05, target: px }, { name: 'y', label: 'pivot.y', min: 0, max: 1, step: 0.05, target: py });
            }
            return {
              prompt: pivotGame ? 'Match the angle <b>and</b> the pivot.' : 'Match the rotation (around the centre).',
              sub: 'Positive angle = clockwise on screen!',
              params,
              tolerance: 0.03,
              build: (vals) => fSpec('vec2 p = uv - uPiv;\np = rot(uA) * p;\np += uPiv;\ncol = drawF(p);', { uA: vals.a * DEG, uPiv: [vals.x ?? px, vals.y ?? py] }),
              code: (vals) => `p = rot(radians(${f(vals.a)})) * p;  // pivot ${nv([vals.x ?? px, vals.y ?? py], 2)}`,
              explain: `<p>Target: <b>${a}°</b> ${a > 0 ? '(positive → clockwise on screen)' : '(negative → anticlockwise on screen)'}${pivotGame ? `, pivot (${n(px)}, ${n(py)}). The pivot is the point that stays still.` : '.'}</p>`,
            };
          },
        },
        {
          id: 'spin-pick', title: 'Which way round?', engine: 'mcq', rounds: 8,
          blurb: 'Read the rotation code, pick the picture.',
          gen: (rng, level) => {
            const angles = level === 1 ? [90, -90, 180] : level === 2 ? [90, -90, 45, -45, 30, -30, 180] : [30, -30, 60, -60, 135, -135, 45, -45];
            const a = rng.pick(level === 1 ? [90, -90] : angles.filter((x) => x !== 180));
            const corner = level === 3 && Math.abs(a) <= 45 && rng.chance(0.5);
            const ans = rotCase(a, !corner);
            const pool = [rotCase(-a, !corner), Math.abs(a) <= 45 ? rotCase(a, corner) : rotCase(a + 90, true), rotCase(180, true), rotCase(0, true)];
            const opts = distinct(rng, ans, (r, i) => (i < pool.length ? pool[i] : rotCase(r.pick(angles), true)), 4, caseKey);
            return {
              prompt: 'Which picture does this code draw?',
              code: ans.code,
              options: opts.map((o) => ({ shader: caseSpec(o) })),
              explain: `<p><code>rot(a)</code> on the coordinates turns the picture <b>clockwise</b> by a (camera tilts one way, the world the other). ${ans.code.includes('- 0.5') ? 'The <code>- 0.5 … + 0.5</code> makes the centre the pivot.' : 'No <code>- 0.5</code> here, so it spins around the bottom-left corner.'}</p>`,
            };
          },
        },
        {
          id: 'rotate-point', title: 'Turn the point', engine: 'numeric', rounds: 6,
          blurb: 'Rotate points by 90° and 180° in your head.',
          gen: (rng, level) => {
            const a = rng.pick(level === 1 ? [90, 180] : level === 2 ? [90, -90, 180] : [90, -90, 180, 45]);
            const pts = level === 1 ? [[1, 0], [0, 1], [0.5, 0], [0, 0.5]] : [[0.5, 0.25], [1, 0.5], [-0.25, 0.5], [0.3, -0.4], [1, 1]];
            const centred = level >= 2 && rng.chance(0.5);
            if (!centred) {
              const p = rng.pick(pts);
              const ans = G.rot2(p, a * DEG).map(r2);
              return {
                prompt: `What is <code>rot(radians(${f(a)})) * ${v2(p[0], p[1])}</code>?`,
                sub: a === 45 ? 'cos 45° = sin 45° ≈ 0.707 — two decimals is fine.' : 'Sketch it: rot turns arrows anticlockwise.',
                answer: ans, wrap: 'vec2', tolerance: 0.011,
                visual: (el) => { const P = vectorPlane(1.5, 220); P.clear(); P.arrow(p, '#ffd479', 'v'); el.append(P.el); },
                explain: `<p>Rotating anticlockwise by ${a}°: ${a === 90 ? '(x, y) → (−y, x)' : a === -90 ? '(x, y) → (y, −x)' : a === 180 ? '(x, y) → (−x, −y)' : 'x\' = x·cos − y·sin, y\' = x·sin + y·cos'}. Answer: <b>${nv(ans, 2)}</b>.</p>`,
              };
            }
            const u = rng.pick([0.75, 1, 0.25, 0.5]), w = rng.pick([0.5, 0.75, 1, 0.25]);
            const d = [u - 0.5, w - 0.5], rd = G.rot2(d, a * DEG);
            const ans = [r2(rd[0] + 0.5), r2(rd[1] + 0.5)];
            return {
              prompt: `Pixel at <b>uv = ${nv([u, w])}</b>. Which paper point p does it read?`,
              code: `vec2 p = uv - 0.5;\np = rot(radians(${f(a)})) * p;\np += 0.5;`,
              sub: 'Do it step by step: subtract, rotate, add.',
              answer: ans, wrap: 'vec2',
              explain: `<p>uv − 0.5 = ${nv(d)} → rotated ${a}° = ${nv(rd.map(r2), 2)} → + 0.5 = <b>${nv(ans, 2)}</b>.</p>`,
            };
          },
        },
        {
          id: 'pivot-order', title: 'Pin it', engine: 'order', rounds: 4,
          blurb: 'Put the lines in order to rotate or scale around a pivot.',
          gen: (rng, level) => {
            const a = rng.pick([30, 45, 90, -60]);
            const pv = level === 1 ? [0.5, 0.5] : rng.pick([[0.25, 0.25], [0.75, 0.5], [0.2, 0.8]]);
            const pc = level === 1 ? '0.5' : v2(pv[0], pv[1]);
            const op = level === 3 && rng.chance(0.5) ? { code: 'p *= 2.0;', what: 'zoom out ×2' } : { code: `p = rot(radians(${f(a)})) * p;`, what: `rotate by ${a}°` };
            const items = [
              { code: `vec2 p = uv - ${pc};` },
              { code: op.code },
              { code: `p += ${pc};` },
              { code: 'col = drawF(p);' },
            ];
            if (level === 3) items.splice(3, 0, { code: 'p = fract(p);' });
            return {
              prompt: `Order the lines to <b>${op.what}</b> around the pivot <b>${level === 1 ? 'centre (0.5, 0.5)' : nv(pv)}</b>.`,
              sub: level === 3 ? 'Then tile the result.' : 'Pin in → transform → pin out → draw.',
              items,
              explain: '<p>Subtract the pivot first (pin goes in at the origin), then transform, then add the pivot back, and only then read the texture. ' + (level === 3 ? '<code>fract</code> tiles the finished coordinates, so it comes after the transform.' : '') + '</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'transforms.order',
      title: 'Order of operations',
      blurb: 'Rotate-then-scale ≠ scale-then-rotate. When order matters and how to predict it.',
      lesson: [
        {
          title: 'Lines run top to bottom',
          body: `<p>Each line changes <code>p</code>, and the next line works on the <b>result</b>. So swapping lines can change the picture.</p>
<p>Both shaders below squash x by 2 and rotate — just in a different order. Drag the angle.</p>`,
          controls: [{ name: 'a', label: 'angle (degrees)', min: 0, max: 90, step: 5, value: 45 }],
          shaders: [
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np *= vec2(2.0, 1.0);\np = rot(uA) * p;\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: 'scale, then rotate' },
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np = rot(uA) * p;\np *= vec2(2.0, 1.0);\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: 'rotate, then scale' },
          ],
          code: (v) => `// left                       // right\np *= vec2(2.0, 1.0);          p = rot(radians(${f(v.a)})) * p;\np = rot(radians(${f(v.a)})) * p;  p *= vec2(2.0, 1.0);`,
          after: '<p><b>Right:</b> a thin F, neatly tilted. <b>Left:</b> a tilted F that got squashed along the <i>screen\'s</i> x axis, so it looks skewed. Same ingredients, different result. (Why it\'s this way round comes in two slides.)</p>',
        },
        {
          title: 'When order does NOT matter',
          body: `<p>Some pairs give the same result in either order. They <b>commute</b>:</p>
<ul><li>two moves (translations)</li><li>two rotations (around the same pivot)</li><li><b>uniform</b> scale + rotation (same zoom in every direction, so turning first doesn't change anything)</li></ul>
<p>Uniform scale ×2 and rotate — try the slider: both pictures stay identical.</p>`,
          controls: [{ name: 'a', label: 'angle (degrees)', min: 0, max: 90, step: 5, value: 30 }],
          shaders: [
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np *= 1.5;\np = rot(uA) * p;\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: 'scale 1.5, then rotate' },
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np = rot(uA) * p;\np *= 1.5;\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: 'rotate, then scale 1.5' },
          ],
          after: '<div class="note">Order matters when one step <b>changes the meaning of directions or distances</b> for the next: translate + rotate, translate + scale, non-uniform scale + rotate.</div>',
        },
        {
          title: 'Move + rotate: spin or orbit?',
          body: `<p>Translation + rotation is the classic "order matters" pair. Drag the angle: one F <b>spins on the spot</b>, the other <b>orbits</b> around the centre like a planet around the sun.</p>
<p>Guess first: which code does which? Then read the labels.</p>`,
          controls: [{ name: 'a', label: 'angle (degrees)', min: -180, max: 180, step: 5, value: 60 }],
          shaders: [
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np = rot(uA) * p;\np -= vec2(0.25, 0.0);\np *= 2.0;\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: 'rotate line first → <b>orbits</b>' },
            { spec: (v) => fSpec('vec2 p = uv - 0.5;\np -= vec2(0.25, 0.0);\np = rot(uA) * p;\np *= 2.0;\np += 0.5;\ncol = drawF(p);', { uA: v.a * DEG }), label: 'move line first → <b>spins in place</b>' },
          ],
          code: (v) => `// left: orbits the centre\np = rot(radians(${f(v.a)})) * p;\np -= vec2(0.25, 0.0);\n\n// right: sits on the right, spinning\np -= vec2(0.25, 0.0);\np = rot(radians(${f(v.a)})) * p;`,
          after: '<p class="small dim">(Both also zoom out ×2 so the F fits.)</p><div class="note">Surprised? Reading top-down, you\'d expect the opposite. The picture does the steps in <b>reverse</b> order — next slide.</div>',

        },
        {
          title: 'Predicting the picture: read it backwards',
          body: `<p>Here's the honest truth about the "backwards" feeling. The code transforms the <b>camera</b>. The picture does the <b>inverse</b> — in the <b>reverse order</b>.</p>
<div class="analogy">🧦 <b>Socks and shoes:</b> you put on socks, then shoes. To undo it you take off shoes first, then socks. Undoing reverses the order.</div>
<p>So to predict what the <b>picture</b> does, read the transform lines <b>from the bottom up</b>, and flip each one (− becomes +, ×2 becomes ÷2, clockwise ↔ anticlockwise).</p>`,
          code: 'vec2 p = uv - 0.5;\np = rot(radians(90.0)) * p;  // ③ picture turns 90° clockwise around the centre\np -= vec2(0.25, 0.0);        // ② picture moves right 0.25\np *= 2.0;                    // ① picture shrinks to half size\np += 0.5;\n// read ① → ② → ③: small F, moved right, then swung\n// round the centre → it ends up BELOW the centre',
          shader: fSpec('vec2 p = uv - 0.5;\np = rot(radians(90.0)) * p;\np -= vec2(0.25, 0.0);\np *= 2.0;\np += 0.5;\ncol = drawF(p);'),
          after: '<div class="tip">💡 This is the same rule you know from matrices in engines: <code>M = A * B</code> applies B first. Don\'t worry if it takes a while to sink in — the games let you practise until it\'s automatic.</div>',
          quiz: { q: 'Which pair gives the <b>same</b> picture in either order?', options: ['rotate 30° and zoom ×2 (uniform)', 'move right and rotate 30°', 'scale vec2(2,1) and rotate 30°'], answer: 0, explain: 'A uniform zoom looks the same in every direction, so turning before or after makes no difference.' },
        },
      ],
      games: [
        {
          id: 'which-order', title: 'Which order?', engine: 'mcq', rounds: 6,
          blurb: 'Same steps, different order. Pick the code that made this picture.',
          gen: (rng, level) => {
            for (let tries = 0; tries < 40; tries++) {
              const a = rng.pick([45, 90, -90, 30]);
              const mids = level === 1
                ? [S.R(a), S.T(rng.pick([0.25, -0.25]), 0)]
                : level === 2
                  ? rng.pick([[S.R(a), S.T(0.25, 0)], [S.S2(2, 1), S.R(a)], [S.S(2), S.T(rng.pick([0.25, -0.25]), rng.pick([0, 0.25]))]])
                  : rng.pick([[S.R(a), S.T(0.25, 0), S.S2(1, 2)], [S.S2(2, 1), S.R(a), S.T(0, 0.25)]]);
              const perms = permutations(mids).map((m) => prog([S.C(), ...m, S.S(level === 1 ? 2 : 1.5), S.U()]));
              const uniq = []; const seen = new Set();
              for (const p of perms) { const k = mapKey(p.fn); if (!seen.has(k)) { seen.add(k); uniq.push(p); } }
              // extra distractors: same orders with the rotation flipped
              for (const m of permutations(mids.map((s) => (s.kind === 'R' ? S.R(-a) : s)))) {
                const p = prog([S.C(), ...m, S.S(level === 1 ? 2 : 1.5), S.U()]); const k = mapKey(p.fn);
                if (!seen.has(k)) { seen.add(k); uniq.push(p); }
              }
              if (uniq.length < 3) continue;
              const ans = uniq[0];
              const opts = [ans, ...rng.shuffle(uniq.slice(1)).slice(0, 3)];
              return {
                prompt: 'Which code draws this picture?',
                sub: 'Look closely at the order of the lines (and the sign of the angle).',
                shader: progSpec(ans),
                options: opts.map((o) => ({ code: o.steps.slice(1, -2).map((s) => s.code).join('\n') })),
                explain: '<p>Predict the picture by reading the steps <b>bottom-up</b> and flipping each (− → +, rotate → opposite way). Translate-then-rotate orbits around the centre; rotate-then-translate spins in place then slides.</p><p class="small dim">(All options also have <code>p -= 0.5</code> before, and a zoom-out plus <code>p += 0.5</code> after.)</p>',
              };
            }
            return { prompt: 'Which pair commutes (same picture in either order)?', options: ['two translations', 'translate + rotate', 'translate + scale'], explain: 'Moves just add up, in any order.' };
          },
        },
        {
          id: 'order-build', title: 'Build the transform', engine: 'order', rounds: 4,
          blurb: 'Put the code steps in the order that makes the target.',
          gen: (rng, level) => {
            for (let tries = 0; tries < 60; tries++) {
              const a = rng.pick([45, 90, -90, 30, -30]);
              const pv = rng.pick([[0.25, 0.25], [0.75, 0.25], [0.5, 0.75]]);
              const L1 = [[S.C(), S.R(a), S.U()], [S.C(), S.S(rng.pick([2, 0.5])), S.U()]];
              const L2 = [[S.T(pv[0], pv[1]), S.R(a), S.A(pv[0], pv[1])], [S.C(), S.S2(2, 1), S.R(a), S.U()], [S.C(), S.R(a), S.S2(1, 2), S.U()]];
              const L3 = [[S.C(), S.R(a), S.T(0.25, 0), S.S2(2, 1), S.U()], [S.C(), S.S2(1, 2), S.T(0, 0.25), S.R(a), S.U()], [S.T(pv[0], pv[1]), S.S2(1.5, 1), S.R(a), S.A(pv[0], pv[1])]];
              const steps = rng.pick(level === 1 ? L1 : level === 2 ? L2 : L3);
              const correct = mapKey(prog(steps).fn);
              // the order must be unique: no other permutation may draw the same picture
              const clash = permutations(steps.map((s, i) => i)).some((perm) => perm.some((x, i) => x !== i) && mapKey(prog(perm.map((i) => steps[i])).fn) === correct);
              if (clash) continue;
              return {
                prompt: 'Tap the lines in the order that draws the target.',
                sub: 'They go between <code>vec2 p = uv;</code> and <code>col = drawF(p);</code>',
                shader: progSpec(prog(steps)),
                items: steps.map((s) => ({ code: s.code })),
                explain: '<p>Pivot recipe: <b>move the pivot to the origin first</b>, transform, move back last. Between those, read bottom-up to predict the picture: the last step happens to the picture first.</p>',
              };
            }
            return { prompt: 'Order the pivot recipe:', items: ['subtract the pivot', 'rotate', 'add the pivot back'], explain: 'Pin in, spin, pin out.' };
          },
        },
        {
          id: 'commute-sort', title: 'Does order matter?', engine: 'buckets', rounds: 2,
          blurb: 'Sort pairs of steps: swap-safe or not?',
          gen: () => ({
            prompt: 'Swap these two steps. Does the picture change?',
            buckets: ['🔁 Same either way', '⚠️ Order matters'],
            count: 10,
            items: [
              { text: 'move right 0.2 + move up 0.1', bucket: 0, why: 'Moves just add up.' },
              { text: 'rotate 30° + rotate 45°', bucket: 0, why: '2D rotations around the same pivot just add their angles.' },
              { text: 'zoom ×2 (uniform) + rotate 30°', bucket: 0, why: 'Uniform zoom is the same in all directions.' },
              { text: 'zoom ×2 + zoom ×3', bucket: 0, why: '×2×3 = ×3×2.' },
              { text: 'scale vec2(2,1) + scale vec2(1,3)', bucket: 0, why: 'Each one only touches its own axis.' },
              { text: 'mirror x + mirror y', bucket: 0, why: 'Independent axes again.' },
              { text: 'move right + rotate 30°', bucket: 1, why: 'Move-then-rotate orbits around the pivot; rotate-then-move does not.' },
              { text: 'move right + zoom ×2', bucket: 1, why: 'Zooming after moving also scales the move distance.' },
              { text: 'scale vec2(2,1) + rotate 45°', bucket: 1, why: 'Non-uniform: the squash direction turns with the rotation or not.' },
              { text: 'mirror x + rotate 90°', bucket: 1, why: 'Mirroring flips the direction of the rotation.' },
              { text: 'move up + mirror y', bucket: 1, why: 'Mirroring after moving flips the move too.' },
              { text: 'subtract 0.5 + rotate', bucket: 1, why: 'That\'s exactly why pivot order matters!' },
            ],
          }),
        },
        {
          id: 'order-tf', title: 'Order: true or false?', engine: 'mcq', rounds: 8,
          blurb: 'Concept checks on combining transforms.',
          questions: [
            tf('Swapping two translation lines changes the picture.', false, 'Additions commute: −a−b = −b−a.'),
            tf('Rotate-then-scale and scale-then-rotate always look the same.', false, 'Only for a <b>uniform</b> scale. With vec2(2,1) they differ.'),
            tf('Translating then rotating makes the shape orbit around the pivot.', true, 'The shape is moved away from the pivot, then the whole space turns around it.'),
            tf('To predict the picture, you can read the transform lines from the bottom up.', true, 'The picture undergoes the inverse steps in reverse order.', 2),
            tf('Subtracting the pivot can go anywhere in the code.', false, 'It must come before the rotate/scale, and the add-back after.'),
            tf('Two rotations around the same pivot can be swapped.', true, 'In 2D, rotations add: 30° + 45° = 45° + 30°.'),
            tf('A mirror (p.x *= -1.0) and a rotation can always be swapped.', false, 'Mirroring reverses the direction of rotation, so order matters.', 3),
            tf('In matrix maths, A * B * p applies B first.', true, 'The matrix closest to p acts first.', 3),
            q('Which order spins the F around the centre?', ['p -= 0.5; rotate; p += 0.5;', 'rotate; p -= 0.5; p += 0.5;', 'p -= 0.5; p += 0.5; rotate;'], 'Pin in, spin, pin out. The other two rotate around the corner.'),
            q('"Socks then shoes" explains…', ['why the picture does the steps in reverse order', 'why rot() uses radians', 'why uv starts at 0'], 'Undoing (inverting) a sequence reverses its order.', { level: 2 }),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'transforms.matrix',
      title: 'Matrices: where the axes go',
      blurb: 'A mat2 is just two arrows: the new x axis and the new y axis.',
      lesson: [
        {
          title: 'A matrix = two arrows',
          body: `<p>A <code>mat2</code> holds 4 numbers. Forget rows and columns for a second — think of it as <b>two arrows</b>:</p>
<ul><li>the first two numbers: where the <b style="color:#ff7ab2">x axis arrow (1, 0)</b> goes</li><li>the last two numbers: where the <b style="color:#3ddc97">y axis arrow (0, 1)</b> goes</li></ul>
<p>Everything else follows the axes, like a drawing on a rubber grid. Play with the numbers:</p>`,
          controls: [
            { name: 'a', label: 'x axis → x', min: -2, max: 2, step: 0.25, value: 1.5 },
            { name: 'b', label: 'x axis → y', min: -2, max: 2, step: 0.25, value: 0.5 },
            { name: 'c', label: 'y axis → x', min: -2, max: 2, step: 0.25, value: 0 },
            { name: 'd', label: 'y axis → y', min: -2, max: 2, step: 0.25, value: 1 },
          ],
          visual: (el, v) => { const P = vectorPlane(2.5, 300); P.clear({ unitCircle: false }); drawSpace(P, [v.a, v.b, v.c, v.d], { ghost: true }); el.append(P.el); },
          code: (v) => `mat2 M = mat2(${f(v.a, 2)}, ${f(v.b, 2)},   // where x axis goes\n              ${f(v.c, 2)}, ${f(v.d, 2)});  // where y axis goes`,
          after: '<div class="note">GLSL fills a mat2 <b>column by column</b>. Column 0 = new x axis, column 1 = new y axis. That\'s the whole secret.</div>',
        },
        {
          title: 'Multiplying = following the axes',
          body: `<p><code>M * v</code> means: walk <b>v.x steps along the new x arrow</b>, then <b>v.y steps along the new y arrow</b>.</p>
<pre class="code">M * v = v.x * column0 + v.y * column1</pre>
<p>Move the sliders for <code>v</code> and watch the walk.</p>`,
          controls: [
            { name: 'x', label: 'v.x', min: -2, max: 2, step: 0.25, value: 1 },
            { name: 'y', label: 'v.y', min: -2, max: 2, step: 0.25, value: 1 },
          ],
          visual: (el, v) => {
            const M = [1, 0.5, -0.5, 1];
            const P = vectorPlane(3, 300); P.clear({ unitCircle: false });
            const c0 = [M[0], M[1]], c1 = [M[2], M[3]];
            const a = G.mul(c0, v.x), r = G.add(a, G.mul(c1, v.y));
            P.arrow(c0, 'rgba(255,122,178,.5)', 'col0'); P.arrow(c1, 'rgba(61,220,151,.5)', 'col1');
            P.arrow(a, '#ff7ab2', '', [0, 0], 2.5); P.arrow(G.mul(c1, v.y), '#3ddc97', '', a, 2.5);
            P.arrow(r, '#ffd479', 'M*v', [0, 0], 3.5);
            el.append(P.el, h('div.readout', { html: `M = mat2(1.0, 0.5, -0.5, 1.0)\nM*v = ${n(v.x)}×(1, 0.5) + ${n(v.y)}×(−0.5, 1)\n    = ${nv(r, 3)}` }));
          },
          quiz: { q: '<code>mat2(2.0, 0.0, 0.0, 3.0) * vec2(1.0, 1.0)</code> = ?', options: ['(2, 3)', '(5, 0)', '(2, 0)'], answer: 0, explain: '1 × (2, 0) + 1 × (0, 3) = (2, 3).' },
        },
        {
          title: 'Matrices you already know',
          body: `<p>Every transform from this topic (except moving) is a matrix:</p>
<ul><li><b>Identity</b> <code>mat2(1,0, 0,1)</code> — nothing changes (also written <code>mat2(1.0)</code>)</li>
<li><b>Scale</b> <code>mat2(sx,0, 0,sy)</code> — axes get longer/shorter</li>
<li><b>Mirror</b> <code>mat2(-1,0, 0,1)</code> — the x axis points left</li>
<li><b>Rotate</b> <code>mat2(cos a, sin a, −sin a, cos a)</code> — both axes turn. That's exactly <code>rot(a)</code>!</li>
<li><b>Shear</b> <code>mat2(1,0, k,1)</code> — the y axis leans over</li></ul>`,
          controls: [{ name: 'k', label: '0 identity · 1 scale · 2 mirror · 3 rotate 30° · 4 shear', min: 0, max: 4, step: 1, value: 3 }],
          visual: (el, v) => {
            const c = Math.cos(30 * DEG), s = Math.sin(30 * DEG);
            const M = [[1, 0, 0, 1], [1.5, 0, 0, 0.75], [-1, 0, 0, 1], [c, s, -s, c], [1, 0, 0.75, 1]][v.k];
            const P = vectorPlane(2, 300); P.clear({ unitCircle: false }); drawSpace(P, M, { ghost: true });
            el.append(P.el, h('div.readout', { html: matCode(M) }));
          },
        },
        {
          title: 'Matrices in a shader',
          body: `<p>In a shader we apply the matrix to the <b>coordinates</b>: <code>p = M * p</code>. And, as always, the picture does the <b>inverse</b>: a matrix that stretches the axes ×2 makes the picture <i>smaller</i>.</p>
<p>Shear example — the picture leans the <b>opposite</b> way of k:</p>`,
          controls: [{ name: 'k', label: 'shear k', min: -1, max: 1, step: 0.05, value: 0.5 }],
          shader: (v) => fSpec('vec2 p = uv - 0.5;\np = mat2(1.0, 0.0, uK, 1.0) * p;\np += 0.5;\ncol = drawF(p);', { uK: v.k }),
          code: (v) => `vec2 p = uv - 0.5;\np = mat2(1.0, 0.0, ${f(v.k, 2)}, 1.0) * p;\np += 0.5;\ncol = drawF(p);`,
          after: '<div class="tip">💡 In the vertex shader it\'s the other way: there you transform <b>positions</b> (the object itself), so the matrix moves the shape exactly as the arrows show. Model/view/projection matrices work like that.</div>',
        },
        {
          title: 'Combining matrices',
          body: `<p>Two matrices can be multiplied into one: <code>M = A * B</code>. Then <code>M * p = A * (B * p)</code> — <b>B acts first</b> (it's closest to p).</p>
<p>That's why game engines pre-multiply scale, rotation and more into a single matrix: one multiply per vertex instead of many.</p>
<div class="note">Rotation and scale fit in a mat2. Moving (translation) doesn't — for that engines use a mat3 (2D) or mat4 (3D) with an extra "1" component. That's why world matrices are 4×4.</div>`,
          code: 'mat2 A = rot(radians(90.0));\nmat2 B = mat2(2.0, 0.0, 0.0, 1.0);\nvec2 r = A * B * vec2(1.0, 0.0);\n// B first: (1,0) → (2,0); then A turns it: (0,2)',
          quiz: { q: 'In <code>A * B * v</code>, which matrix is applied to v first?', options: ['B', 'A', 'Both at once, order never matters'], answer: 0, explain: 'The one nearest to v. Matrix order matters just like line order does.' },
        },
      ],
      games: [
        {
          id: 'drag-axes', title: 'Where do the axes go?', engine: 'vector', rounds: 5,
          blurb: 'Read a mat2 and drag the x and y axis arrows to match.',
          gen: (rng, level) => {
            const it = rng.pick(matPool(level));
            const M = it.M.slice();
            let code = matCode(M);
            if (level === 3 && rng.chance(0.4)) {
              const r = rng.pick([{ c: 'rot(radians(90.0))', M: [0, 1, -1, 0] }, { c: 'rot(radians(180.0))', M: [-1, 0, 0, -1] }, { c: 'rot(radians(-90.0))', M: [0, -1, 1, 0] }, { c: 'mat2(2.0)', M: [2, 0, 0, 2] }, { c: 'mat2(0.5)', M: [0.5, 0, 0, 0.5] }]);
              code = r.c; M.splice(0, 4, ...r.M);
            }
            const tgt = [[M[0], M[1]], [M[2], M[3]]];
            return {
              prompt: `Drag the arrows to where this matrix sends the axes:`,
              code: `mat2 M = ${code};`,
              sub: 'Pink = where x axis (1,0) goes · Green = where y axis (0,1) goes',
              R: 2.5,
              drag: [{ v: [1, 0], color: '#ff7ab2', label: 'x→', snap: 0.25 }, { v: [0, 1], color: '#3ddc97', label: 'y→', snap: 0.25 }],
              readout: (vs) => `your matrix = mat2(${vs[0].map((x) => f(x, 2)).join(', ')}, ${vs[1].map((x) => f(x, 2)).join(', ')})`,
              check: (vs) => vs.reduce((s, vv, i) => s + (G.distance(vv, tgt[i]) < 0.13 ? 0.5 : 0), 0),
              answer: tgt,
              explain: `<p>Columns! The first two numbers ${nv(tgt[0])} are the new x axis, the last two ${nv(tgt[1])} the new y axis.${code.startsWith('rot') ? ' rot(a) = mat2(cos a, sin a, −sin a, cos a).' : code.startsWith('mat2(') && code.split(',').length === 1 ? ' mat2(k) with one number = k on the diagonal (a uniform scale).' : ''}</p>`,
            };
          },
        },
        {
          id: 'build-matrix', title: 'Build the matrix', engine: 'vector', rounds: 5,
          blurb: 'Make a matrix that does what is asked, by placing the axis arrows.',
          gen: (rng, level) => {
            const it = rng.pick(matPool(level));
            const M = it.M, tgt = [[M[0], M[1]], [M[2], M[3]]];
            return {
              prompt: `Build a matrix that makes the F <b>${it.name}</b>.`,
              sub: 'Put the pink arrow where (1,0) should land and the green one where (0,1) should land. (Here the matrix moves the shape directly, like in a vertex shader.)',
              R: 2.5,
              drag: [{ v: [1, 0], color: '#ff7ab2', label: 'x→', snap: 0.25 }, { v: [0, 1], color: '#3ddc97', label: 'y→', snap: 0.25 }],
              readout: (vs) => `mat2(${vs[0].map((x) => f(x, 2)).join(', ')}, ${vs[1].map((x) => f(x, 2)).join(', ')})`,
              check: (vs) => vs.reduce((s, vv, i) => s + (G.distance(vv, tgt[i]) < 0.13 ? 0.5 : 0), 0),
              answer: tgt,
              visual: (el) => { const P = vectorPlane(fitR(M), 220); P.clear({ unitCircle: false }); drawSpace(P, M, { ghost: true, axes: false }); el.append(h('div.small.dim.center', 'Goal (faint = original F):'), P.el); },
              explain: `<p>Answer: <code>${matCode(M)}</code>. Think about each axis on its own: where should the arrow (1, 0) end up? Where should (0, 1) end up?</p>`,
            };
          },
        },
        {
          id: 'mat-times-vec', title: 'Matrix × vector', engine: 'numeric', rounds: 6,
          blurb: 'Compute M * v with the "walk along the columns" trick.',
          gen: (rng, level) => {
            const it = rng.pick(matPool(level));
            const M = it.M;
            const vv = level === 1 ? rng.pick([[1, 0], [0, 1], [1, 1], [2, 0], [0, 2]]) : [rng.int(-2, 2) || 1, rng.int(-2, 2) || 2];
            const ans = matApply(M, vv).map(r2);
            return {
              prompt: `Compute <code>M * v</code>:`,
              code: `mat2 M = ${matCode(M)};\nvec2 v = vec2(${f(vv[0])}, ${f(vv[1])});`,
              answer: ans, wrap: 'vec2',
              explain: `<p>M * v = v.x × column0 + v.y × column1 = ${n(vv[0])} × ${nv([M[0], M[1]])} + ${n(vv[1])} × ${nv([M[2], M[3]])} = <b>${nv(ans)}</b>.</p>`,
            };
          },
        },
        {
          id: 'read-matrix', title: 'Read the grid', engine: 'mcq', rounds: 6,
          blurb: 'See the transformed grid and F, pick the mat2.',
          gen: (rng, level) => {
            const pool = matPool(level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, (r, i) => {
              if (i < 3) { // tempting wrong: rows instead of columns, or a sign flip
                const M = ans.M;
                const alt = [[M[0], M[2], M[1], M[3]], [-M[0], -M[1], M[2], M[3]], [M[0], M[1], -M[2], -M[3]]][i];
                return { M: alt };
              }
              return r.pick(pool);
            }, 4, (x) => JSON.stringify(x.M.map((y) => y + 0)));
            return {
              prompt: 'Which matrix made this? (Pink = new x axis, green = new y axis.)',
              visual: spaceVisual(ans.M, null, { ghost: true }),
              options: opts.map((o) => ({ code: matCode(o.M) })),
              explain: `<p>Read the pink arrow tip → first two numbers ${nv([ans.M[0], ans.M[1]])}, green arrow tip → last two ${nv([ans.M[2], ans.M[3]])}. A common trap is reading it row by row — GLSL fills columns.</p>`,
            };
          },
        },
      ],
    },
  ],
};
