// Topic 2 — Coordinates & UVs: where am I on the image?
import { tf, q, distinct, BW, G, f, n, nv, shaderView, canvas2d } from './_kit.js';

// ---------------------------------------------------------------- helpers
const fmt2 = (x) => n(x, 2);
const pt = (p) => `(${fmt2(p[0])}, ${fmt2(p[1])})`;

// GLSL helper: anti-aliased grid lines every 1/n (needs fwidth, which the renderer enables)
const GRID_DEFS = `
float gridLine(vec2 p, float n){
  vec2 g = abs(fract(p * n + 0.5) - 0.5) / max(fwidth(p * n), vec2(0.0001));
  return 1.0 - min(min(g.x, g.y), 1.0);
}`;

/**
 * Draw a uv square on a 2D canvas.
 * box = {x, y, s} (pixels, top-left + size). opts: {grid, labels, axes, points:[{p:[u,v], color, label}], dim}
 */
function drawUV(ctx, box, opts = {}) {
  const { x, y, s } = box;
  const X = (u) => x + u * s, Y = (v) => y + (1 - v) * s;
  ctx.fillStyle = opts.bg || '#171a24'; ctx.fillRect(x, y, s, s);
  const g = opts.grid ?? 4;
  if (g) {
    for (let i = 0; i <= g; i++) {
      const t = i / g;
      ctx.strokeStyle = i === 0 || i === g ? '#5a6078' : (i * 2 === g ? '#3c4258' : '#272b3a');
      ctx.lineWidth = i * 2 === g ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(X(t), Y(0)); ctx.lineTo(X(t), Y(1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), Y(t)); ctx.lineTo(X(1), Y(t)); ctx.stroke();
    }
  }
  if (opts.labels) {
    ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#8a90a8';
    const L = opts.labelStep || (g ? 1 / g : 0.5);
    for (let t = 0; t <= 1 + 1e-9; t += L) {
      const s2 = n(t, 2).replace(/^0\./, '.');
      if (t > 0.001) ctx.fillText(s2, X(t) - (t > 0.99 ? 14 : 6), Y(0) - 4);
      if (t > 0.001) ctx.fillText(s2, X(0) + 3, Y(t) + (t > 0.99 ? 11 : 4));
    }
    ctx.fillText('0', X(0) + 3, Y(0) - 4);
  }
  if (opts.axes !== false) {
    ctx.fillStyle = '#ff7a7a'; ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillText('x →', X(1) - 30, Y(0) - 16);
    ctx.fillStyle = '#7aff9a';
    ctx.fillText('y ↑', X(0) + 18, Y(1) + 14);
  }
  for (const p of opts.points || []) {
    const px = X(p.p[0]), py = Y(p.p[1]);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(px, py, (p.r || 6) + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.color || '#ffd479'; ctx.beginPath(); ctx.arc(px, py, p.r || 6, 0, Math.PI * 2); ctx.fill();
    if (p.label) {
      ctx.font = 'bold 12px ui-monospace, Menlo, monospace'; ctx.fillStyle = p.color || '#ffd479';
      const tx = p.p[0] > 0.6 ? px - 8 - ctx.measureText(p.label).width : px + 9;
      ctx.fillText(p.label, tx, p.p[1] > 0.85 ? py + 18 : py - 8);
    }
  }
}

/** A canvas element with a uv square (with margin) */
function uvDiagram(el, opts) {
  const c = canvas2d(300, 300);
  c.ctx.fillStyle = '#0e0f15'; c.ctx.fillRect(0, 0, 300, 300);
  drawUV(c.ctx, { x: 30, y: 10, s: 260 }, { labels: true, ...opts });
  if (opts.corners) {
    const ctx = c.ctx; ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#e8eaf2';
    ctx.fillText('(0,0)', 2, 292); ctx.fillText('(1,0)', 258, 292);
    ctx.fillText('(0,1)', 2, 22); ctx.fillText('(1,1)', 258, 22);
  }
  el.append(c.el);
}

/** Points in a cell interior (never near a cell border), rounded to 2 decimals */
function pointInCell(rng, cx, cy, W, H) {
  const u = +((cx + rng.float(0.25, 0.75)) / W).toFixed(2);
  const v = +((cy + rng.float(0.25, 0.75)) / H).toFixed(2);
  return [u, v];
}

// ------------------------------------------------------------- uv-colour maps
const MAPS = [
  { code: 'col = vec3(uv, 0.0);', f: (u, v) => [u, v, 0], lvl: 1 },
  { code: 'col = vec3(uv.x, 0.0, uv.y);', f: (u, v) => [u, 0, v], lvl: 1 },
  { code: 'col = vec3(0.0, uv.x, uv.y);', f: (u, v) => [0, u, v], lvl: 2 },
  { code: 'col = vec3(uv.y, uv.x, 0.0);', f: (u, v) => [v, u, 0], lvl: 2 },
  { code: 'col = vec3(1.0 - uv.x, uv.y, 0.0);', f: (u, v) => [1 - u, v, 0], lvl: 2 },
  { code: 'col = vec3(uv, 1.0);', f: (u, v) => [u, v, 1], lvl: 2 },
  { code: 'col = vec3(uv.x, uv.y, 1.0 - uv.x);', f: (u, v) => [u, v, 1 - u], lvl: 3 },
  { code: 'col = vec3(1.0 - uv.y, 0.0, uv.x);', f: (u, v) => [1 - v, 0, u], lvl: 3 },
];
const CORNERS = [
  { name: 'bottom-left', p: [0, 0] }, { name: 'bottom-right', p: [1, 0] },
  { name: 'top-left', p: [0, 1] }, { name: 'top-right', p: [1, 1] },
];
const EDGE_MIDS = [
  { name: 'centre', p: [0.5, 0.5] }, { name: 'middle of the top edge', p: [0.5, 1] },
  { name: 'middle of the left edge', p: [0, 0.5] }, { name: 'middle of the right edge', p: [1, 0.5] },
  { name: 'middle of the bottom edge', p: [0.5, 0] },
];

// Named colours for the uv-colour paint game
const NAMED = [
  { c: [0, 0, 0], label: 'K' }, { c: [1, 0, 0], label: 'R' }, { c: [0, 1, 0], label: 'G' }, { c: [0, 0, 1], label: 'B' },
  { c: [1, 1, 0], label: 'Y' }, { c: [0, 1, 1], label: 'C' }, { c: [1, 0, 1], label: 'M' }, { c: [1, 1, 1], label: 'W' },
];
const keyC = (c) => c.join(',');

// ---------------------------------------------------------------- pixel rules
function pixelRule(rng, level) {
  const L1 = [
    () => { const t = rng.pick([2, 3, 4]); return { code: `if (gl_FragCoord.x < ${f(t)}) col = vec3(1.0);`, solve: (x) => +(x + 0.5 < t), note: `Pixel columns 0…${t - 1} have centres 0.5 … ${t - 0.5}, all below ${t}.` }; },
    () => { const t = rng.pick([1, 2, 3]); return { code: `if (gl_FragCoord.y > ${f(t)}) col = vec3(1.0);`, solve: (x, y) => +(y + 0.5 > t), note: `Rows whose centre y (0.5, 1.5, 2.5, 3.5) is above ${t} are white.` }; },
    () => ({ code: 'vec2 st = gl_FragCoord.xy / uRes;\nif (st.x > 0.5) col = vec3(1.0);', solve: (x) => +((x + 0.5) / 6 > 0.5), note: 'st is just uv computed by hand: right half of the screen is white.' }),
  ];
  const L2 = [
    () => ({ code: 'if (mod(gl_FragCoord.x, 2.0) < 1.0) col = vec3(1.0);', solve: (x) => +(((x + 0.5) % 2) < 1), note: 'Centres 0.5, 2.5, 4.5 give mod 0.5 (< 1) → white. 1.5, 3.5, 5.5 give 1.5 → black. Every other column!' }),
    () => { const a = rng.pick([2, 3, 4]), b = rng.pick([1, 2, 3]); return { code: `if (gl_FragCoord.x > ${f(a)} && gl_FragCoord.y < ${f(b)})\n  col = vec3(1.0);`, solve: (x, y) => +(x + 0.5 > a && y + 0.5 < b) }; },
    () => ({ code: 'vec2 st = gl_FragCoord.xy / uRes;\nif (st.x < 0.25 || st.y > 0.75) col = vec3(1.0);', solve: (x, y) => +((x + 0.5) / 6 < 0.25 || (y + 0.5) / 4 > 0.75), note: 'st.x < 0.25 → x centre < 1.5 (column 0). st.y > 0.75 → y centre > 3 (top row).' }),
  ];
  const L3 = [
    () => ({ code: 'float c = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);\ncol = vec3(c);', solve: (x, y) => (x + y) % 2, note: 'floor(gl_FragCoord) is the integer pixel index. Adding x and y and taking mod 2 → a checkerboard of single pixels.' }),
    () => ({ code: 'if (gl_FragCoord.x - gl_FragCoord.y > 1.5) col = vec3(1.0);', solve: (x, y) => +(x - y > 1.5), note: 'The 0.5s cancel out: it\'s just column − row > 1.5, i.e. column ≥ row + 2.' }),
    () => ({ code: 'vec2 st = gl_FragCoord.xy / uRes;\nif (length(st - 0.5) < 0.3) col = vec3(1.0);', solve: (x, y) => +(Math.hypot((x + 0.5) / 6 - 0.5, (y + 0.5) / 4 - 0.5) < 0.3), note: 'Careful: st is NOT aspect-corrected here, so 0.3 of the width is more pixels than 0.3 of the height.' }),
  ];
  const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2, ...L2] : [...L2, ...L3, ...L3];
  return rng.pick(pool)();
}

// -------------------------------------------------- simulated non-square screen
// Draws a "screen" of the given aspect inside the square view. Inside it, s is
// the screen's own 0..1 uv. Used by aspect games (the slider engine is square).
function screenHalf(aspect) {
  return aspect >= 1 ? [0.48, 0.48 / aspect] : [0.48 * aspect, 0.48];
}
const SCREEN_FRAG = `
vec2 d = uv - 0.5;
if (abs(d.x) > uHalf.x || abs(d.y) > uHalf.y) {
  col = vec3(0.05);
} else {
  vec2 s = d / (2.0 * uHalf) + 0.5;   // this screen's own uv, 0..1
  vec2 p = s - 0.5;
  p.x *= uK;                           // the aspect fix being tested
  col = vec3(0.13, 0.17, 0.3) + 0.12 * gridLine(s, 4.0);
  col = mix(col, vec3(1.0, 0.8, 0.3), 1.0 - smoothstep(0.195, 0.205, length(p)));
}`;

export default {
  id: 'coords',
  title: 'Coordinates & UVs',
  icon: '📐',
  blurb: 'Where is this pixel? uv space, remapping, aspect ratio and pixel coordinates.',
  cheatsheet: `
<p><b>uv</b> = the pixel's position as a fraction: <code>uv.x</code> 0 (left) → 1 (right), <code>uv.y</code> 0 (bottom) → 1 (top). Origin <b>bottom-left</b>.</p>
<p><b>UV as colour</b>: <code>col = vec3(uv, 0.0)</code> → black (0,0), red (1,0), green (0,1), yellow (1,1).</p>
<pre class="code">vec2 p = uv - 0.5;        // -0.5..0.5, centre = (0,0)
vec2 p = uv * 2.0 - 1.0;  // -1..1, centre = (0,0)
float r = remap(x, a, b, c, d); // a..b → c..d</pre>
<p><b>Aspect ratio</b>: uv squashes on non-square screens. Fix by making x and y use the same unit:</p>
<pre class="code">float aspect = uRes.x / uRes.y;
vec2 p = uv - 0.5;   // centre FIRST
p.x *= aspect;       // then fix</pre>
<p><b>Pixels</b>: <code>gl_FragCoord.xy</code> is the pixel centre in pixels (bottom-left pixel = (0.5, 0.5)). <code>uv = gl_FragCoord.xy / uRes</code>.</p>
<pre class="code">// centred + aspect-correct in one line (y goes -1..1)
vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;</pre>
<p>Engines: HLSL/DirectX textures often have <b>v pointing down</b> (origin top-left). ShaderToy: <code>fragCoord / iResolution.xy</code>.</p>`,
  concepts: [
    // ==================================================================
    {
      id: 'coords.uv',
      title: 'UV space basics',
      blurb: 'Every pixel has an address from 0 to 1. Learn to read it.',
      lesson: [
        {
          title: 'An address for every pixel',
          body: `<p>Every pixel the shader runs on gets a personal <b>address</b> called <code>uv</code>. It has two numbers:</p>
<ul><li><code>uv.x</code> — how far <b>across</b> (left → right)</li><li><code>uv.y</code> — how far <b>up</b> (bottom → top)</li></ul>
<div class="analogy">🗺️ <b>Analogy:</b> like a map grid reference or a chessboard square ("e4"). Two numbers are enough to say exactly where you are on a flat sheet.</div>
<p>The image below is a test texture painted with its own grid, so you can see the address space.</p>`,
          shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'uvgrid' } },
        },
        {
          title: 'Bottom-left is (0, 0)',
          body: `<p>The two numbers always go from <b>0 to 1</b>:</p>
<ul><li>Bottom-left corner: <code>(0, 0)</code></li><li>Bottom-right: <code>(1, 0)</code></li><li>Top-left: <code>(0, 1)</code></li><li>Top-right: <code>(1, 1)</code></li></ul>
<div class="note"><b>x goes right, y goes up</b> — like the graphs from maths class. Not like Photoshop or web pages, where y goes <i>down</i>!</div>`,
          visual: (el) => uvDiagram(el, { corners: true, grid: 4, points: [{ p: [0, 0], color: '#fff' }, { p: [1, 0], color: '#ff7a7a' }, { p: [0, 1], color: '#7aff9a' }, { p: [1, 1], color: '#ffd479' }] }),
          after: '<div class="tip">💡 DirectX / Unreal / Unity textures often put the uv origin at the <b>top</b>-left (v points down). If a texture looks upside-down when porting, that\'s why: use <code>1.0 - uv.y</code>.</div>',
        },
        {
          title: 'Move the dot',
          body: `<p>Drag the sliders. The yellow dot sits at the uv you choose. The lines show how far across (<span style="color:#ff7a7a">x</span>) and how far up (<span style="color:#7aff9a">y</span>) it is.</p>
<p>Watch the code: those two numbers <b>are</b> the position.</p>`,
          controls: [
            { name: 'u', label: 'uv.x (across)', min: 0, max: 1, step: 0.01, value: 0.3 },
            { name: 'v', label: 'uv.y (up)', min: 0, max: 1, step: 0.01, value: 0.7 },
          ],
          shader: (v) => ({
            defs: GRID_DEFS,
            frag: `col = vec3(0.1) + 0.15 * gridLine(uv, 10.0) + 0.2 * gridLine(uv, 2.0);
// lines from the axes to the dot
float lx = step(abs(uv.y - uP.y), 0.004) * step(uv.x, uP.x);
float ly = step(abs(uv.x - uP.x), 0.004) * step(uv.y, uP.y);
col = mix(col, vec3(1.0, 0.45, 0.45), lx);
col = mix(col, vec3(0.45, 1.0, 0.6), ly);
col = mix(col, vec3(1.0, 0.83, 0.47), step(length(uv - uP), 0.03));`,
            uniforms: { uP: [v.u, v.v] },
          }),
          code: (v) => `vec2 pos = vec2(${f(v.u, 2)}, ${f(v.v, 2)});\n// ${Math.round(v.u * 100)}% of the way across,\n// ${Math.round(v.v * 100)}% of the way up`,
          quiz: { q: 'A pixel at uv (0.9, 0.1) is near which corner?', options: ['Bottom-right', 'Top-right', 'Bottom-left', 'Top-left'], answer: 0, explain: 'x = 0.9 → far right. y = 0.1 → near the bottom.' },
        },
        {
          title: 'Fractions, not pixels',
          body: `<p>uv is a <b>fraction</b> of the image, not a pixel count. A small image and a huge image both go from 0 to 1.</p>
<p>Both squares below have a dot at <code>uv = (0.75, 0.5)</code> — "three-quarters across, halfway up" — even though one has 4× as many pixels.</p>
<div class="analogy">🍕 Like saying "half the pizza" instead of "4 slices": it works for any pizza size.</div>`,
          visual: (el) => {
            const spec = { defs: GRID_DEFS, frag: 'col = vec3(0.12) + 0.2 * gridLine(uv, 4.0);\ncol = mix(col, vec3(1.0, 0.83, 0.47), step(length(uv - vec2(0.75, 0.5)), 0.06));' };
            const row = document.createElement('div');
            Object.assign(row.style, { display: 'flex', gap: '14px', alignItems: 'flex-end', justifyContent: 'center' });
            row.append(shaderView(spec, { size: 90, caption: 'small' }), shaderView(spec, { size: 180, caption: 'big' }));
            el.append(row);
          },
          after: '<div class="note">Because uv is resolution-independent, the same shader looks the same on a phone and on a 4K TV.</div>',
        },
        {
          title: 'x and y, one at a time',
          body: `<p>You can use each part on its own. As brightness:</p>
<ul><li>Left: <code>vec3(uv.x)</code> — dark on the left, bright on the right.</li><li>Right: <code>vec3(uv.y)</code> — dark at the bottom, bright at the top.</li></ul>
<p>A pixel's brightness here literally <i>shows</i> its coordinate. Midway = 0.5 = mid-grey.</p>`,
          shaders: [
            { spec: { frag: 'col = vec3(uv.x);' }, label: '<code>vec3(uv.x)</code>' },
            { spec: { frag: 'col = vec3(uv.y);' }, label: '<code>vec3(uv.y)</code>' },
          ],
          quiz: { q: 'In <code>col = vec3(uv.y)</code>, which edge is white?', options: ['Top', 'Bottom', 'Left', 'Right'], answer: 0, explain: 'uv.y = 1 at the top → white. 0 at the bottom → black.' },
        },
      ],
      games: [
        {
          id: 'find-uv', title: 'Find the uv', engine: 'tap', rounds: 6,
          blurb: 'Tap the spot with the given uv coordinate.',
          gen: (rng, level) => {
            const stepV = level === 1 ? 0.25 : 0.1;
            let p;
            do { p = [rng.step(0, 1, stepV), rng.step(0, 1, stepV)]; } while ((level > 1 && (p[0] === 0 || p[0] === 1 || p[1] === 0 || p[1] === 1)));
            const grid = level === 1 ? 4 : level === 2 ? 10 : 2;
            return {
              prompt: `Tap the spot where <code>uv = ${pt(p)}</code>`,
              sub: level === 3 ? 'Only the middle lines are drawn this time. Estimate!' : 'x = across from the left, y = up from the bottom.',
              draw: (ctx, w, h) => drawUV(ctx, { x: 0, y: 0, s: w }, { grid, labels: level < 3, labelStep: level === 2 ? 0.2 : undefined }),
              target: p,
              radius: level === 3 ? 0.07 : 0.05,
              explain: `<p>uv ${pt(p)} = ${Math.round(p[0] * 100)}% of the way <b>right</b> from the left edge, ${Math.round(p[1] * 100)}% of the way <b>up</b> from the bottom edge.</p>`,
            };
          },
        },
        {
          id: 'read-uv', title: 'Read the uv', engine: 'numeric', rounds: 6,
          blurb: 'A dot is marked. Type its uv coordinate.',
          gen: (rng, level) => {
            const stepV = level === 1 ? 0.25 : level === 2 ? 0.1 : 0.05;
            const p = [rng.step(0, 1, stepV), rng.step(0, 1, stepV)];
            const grid = level === 1 ? 4 : 10;
            return {
              prompt: 'What is the <code>uv</code> of the yellow dot?',
              sub: level === 3 ? 'Grid lines every 0.1 — the dot may sit between them.' : `Grid lines every ${n(1 / grid)}.`,
              visual: (el) => uvDiagram(el, { grid, points: [{ p, color: '#ffd479', r: 7 }], labelStep: grid === 10 ? 0.2 : 0.25 }),
              answer: p, wrap: 'vec2', labels: ['x', 'y'],
              tolerance: level === 3 ? 0.026 : 0.011,
              explain: `<p>Count across from the <b>left</b> for x (${fmt2(p[0])}), then up from the <b>bottom</b> for y (${fmt2(p[1])}).</p>`,
            };
          },
        },
        {
          id: 'corner-quiz', title: 'Corners & directions', engine: 'mcq', rounds: 8,
          blurb: 'Quick questions about where uv values sit on the square.',
          gen: (rng, level) => {
            const kinds = level === 1 ? ['corner', 'near'] : level === 2 ? ['corner', 'near', 'higher', 'move'] : ['near', 'higher', 'move', 'righter'];
            const k = rng.pick(kinds);
            const vs = (p) => `vec2(${f(p[0], 2)}, ${f(p[1], 2)})`;
            if (k === 'corner') {
              const c = rng.pick(CORNERS);
              return q(`Which uv is the <b>${c.name}</b> corner?`, [vs(c.p), ...CORNERS.filter((x) => x !== c).map((x) => vs(x.p))].map((code) => ({ code })),
                `<p>x: 0 = left, 1 = right. y: 0 = bottom, 1 = top. So ${c.name} = <code>${vs(c.p)}</code>.</p>`);
            }
            if (k === 'near') {
              const c = rng.pick(CORNERS);
              const p = c.p.map((x) => +(x === 1 ? rng.step(0.75, 0.95, 0.05) : rng.step(0.05, 0.25, 0.05)).toFixed(2));
              return q(`A pixel has <code>uv = ${pt(p)}</code>. Which corner is it closest to?`, [c.name, ...CORNERS.filter((x) => x !== c).map((x) => x.name)],
                `<p>x = ${fmt2(p[0])} is ${p[0] > 0.5 ? 'near the right (1)' : 'near the left (0)'}; y = ${fmt2(p[1])} is ${p[1] > 0.5 ? 'near the top (1)' : 'near the bottom (0)'}.</p>`);
            }
            if (k === 'higher' || k === 'righter') {
              const axis = k === 'higher' ? 1 : 0;
              const ys = rng.pickN([0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95], 4);
              const pts = ys.map((y) => { const o = rng.step(0.05, 0.95, 0.05); return axis ? [o, y] : [y, o]; });
              const best = pts.reduce((a, b) => (b[axis] > a[axis] ? b : a));
              const others = pts.filter((p) => p !== best);
              return q(`Which pixel is ${axis ? '<b>highest up</b>' : '<b>furthest right</b>'} on the screen?`, [best, ...others].map((p) => ({ code: vs(p) })),
                `<p>Only <b>${axis ? 'y' : 'x'}</b> (the ${axis ? 'second' : 'first'} number) matters for ${axis ? 'height' : 'left/right'}. Largest ${axis ? 'y' : 'x'} = ${fmt2(best[axis])}.</p>`);
            }
            // move
            const p = [rng.step(0.3, 0.6, 0.1), rng.step(0.3, 0.6, 0.1)].map((x) => +x.toFixed(2));
            const d = rng.pick([0.1, 0.2, 0.3]);
            const dir = rng.pick([{ t: 'right', v: [d, 0] }, { t: 'up', v: [0, d] }, { t: 'left', v: [-d, 0] }, { t: 'down', v: [0, -d] }]);
            const mk = (vv) => [+(p[0] + vv[0]).toFixed(2), +(p[1] + vv[1]).toFixed(2)];
            const ans = mk(dir.v);
            const opts = distinct(rng, ans, (r) => mk(r.pick([[d, 0], [0, d], [-d, 0], [0, -d], [d, d]])), 4, (x) => x.join());
            return q(`A dot at <code>uv = ${pt(p)}</code> moves <b>${dir.t}</b> by ${n(d)}. Where is it now?`, opts.map((o) => ({ code: vs(o) })),
              `<p>Left/right changes <b>x</b>, up/down changes <b>y</b>. ${dir.t} → ${dir.v[0] ? 'x' : 'y'} ${dir.v[0] + dir.v[1] > 0 ? '+' : '−'} ${n(d)}.</p>`);
          },
        },
        {
          id: 'which-pixel', title: 'Which pixel has this uv?', engine: 'paint', rounds: 4,
          blurb: 'A tiny screen of big pixels: paint the pixel(s) containing the given uv points.',
          gen: (rng, level) => {
            const W = level === 1 ? 4 : level === 2 ? 5 : 8, H = W;
            const count = level === 1 ? 1 : level === 2 ? 2 : 3;
            const cells = [];
            while (cells.length < count) {
              const c = [rng.int(0, W - 1), rng.int(0, H - 1)];
              if (!cells.some((d) => d[0] === c[0] && d[1] === c[1])) cells.push(c);
            }
            const pts = cells.map((c) => pointInCell(rng, c[0], c[1], W, H));
            return {
              prompt: `Paint white the pixel${count > 1 ? 's' : ''} that contain${count > 1 ? '' : 's'}: ${pts.map((p) => `<code>${pt(p)}</code>`).join(', ')}`,
              sub: `The screen is ${W}×${H} pixels, so each pixel is ${n(1 / W)} wide. Bottom-left is (0,0).`,
              w: W, h: H, palette: BW,
              solve: (u, v, x, y) => +cells.some((c) => c[0] === x && c[1] === y),
              explain: `<p>Pixel column = floor(uv.x × ${W}), row from the bottom = floor(uv.y × ${H}). E.g. ${pt(pts[0])} → column ${cells[0][0]}, row ${cells[0][1]} (counting from 0).</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'coords.uvcolor',
      title: 'UV as colour',
      blurb: 'Put uv into red and green: the classic debug picture.',
      lesson: [
        {
          title: 'Numbers become light',
          body: `<p>A colour is 3 numbers (red, green, blue), each 0..1. A uv is 2 numbers, each 0..1. So we can just <b>pour uv into a colour</b>!</p>
<p>Switch the channels on and off:</p>
<ul><li><b>red = uv.x</b>: red grows to the right</li><li><b>green = uv.y</b>: green grows upwards</li></ul>`,
          controls: [
            { name: 'r', label: 'use uv.x as red (0 = off, 1 = on)', min: 0, max: 1, step: 1, value: 1 },
            { name: 'g', label: 'use uv.y as green (0 = off, 1 = on)', min: 0, max: 1, step: 1, value: 0 },
          ],
          shader: (v) => ({ frag: 'col = vec3(uv.x * uR, uv.y * uG, 0.0);', uniforms: { uR: v.r, uG: v.g } }),
          code: (v) => `col = vec3(${v.r ? 'uv.x' : '0.0'}, ${v.g ? 'uv.y' : '0.0'}, 0.0);`,
        },
        {
          title: 'The four corners',
          body: `<p>With both on — <code>col = vec3(uv, 0.0)</code> — each corner gets a famous colour:</p>
<ul><li>(0,0) → <code>vec3(0,0,0)</code> <b>black</b></li><li>(1,0) → <code>vec3(1,0,0)</code> <b style="color:#ff6060">red</b></li><li>(0,1) → <code>vec3(0,1,0)</code> <b style="color:#60ff60">green</b></li><li>(1,1) → <code>vec3(1,1,0)</code> <b style="color:#ffff60">yellow</b></li></ul>
<div class="note">Why yellow? Screens add <i>light</i>: full red light + full green light looks yellow to our eyes.</div>`,
          shader: { frag: 'col = vec3(uv, 0.0);' },
          code: 'col = vec3(uv, 0.0); // vec3(uv.x, uv.y, 0.0)',
          quiz: { q: 'In <code>vec3(uv, 0.0)</code>, what colour is the middle of the top edge, uv (0.5, 1)?', options: ['Yellow-green (0.5, 1, 0)', 'Red (1, 0, 0)', 'Grey (0.5, 0.5, 0.5)'], answer: 0, explain: 'red = 0.5, green = 1, blue = 0: a lime/yellow-green.' },
        },
        {
          title: 'Read a colour → find the position',
          body: `<p>The left square is the uv picture. The right square shows the <b>single colour</b> at the dot.</p>
<p>Move the dot and watch: the colour's red number <i>is</i> uv.x, the green number <i>is</i> uv.y.</p>`,
          controls: [
            { name: 'u', label: 'uv.x', min: 0, max: 1, step: 0.01, value: 0.7 },
            { name: 'v', label: 'uv.y', min: 0, max: 1, step: 0.01, value: 0.3 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'col = vec3(uv, 0.0);\nfloat d = length(uv - uP);\ncol = mix(col, vec3(1.0), step(abs(d - 0.04), 0.008));', uniforms: { uP: [v.u, v.v] } }), label: 'the uv picture' },
            { spec: (v) => ({ frag: 'col = vec3(uP, 0.0);', uniforms: { uP: [v.u, v.v] } }), label: 'colour at the dot' },
          ],
          code: (v) => `// colour at the dot:\nvec3(${f(v.u, 2)}, ${f(v.v, 2)}, 0.0)\n//   red ↑ = uv.x   green ↑ = uv.y`,
        },
        {
          title: 'Debugging with uv colours',
          body: `<p>Tech artists use this picture all the time to <b>see</b> UVs. Plug UV into the base colour and you instantly see how the texture coordinates lie on a mesh.</p>
<p>On this sphere: red increases around it, green from bottom to top. The sharp line where red jumps from 1 back to 0 is the <b>UV seam</b>.</p>`,
          shader: { mesh: 'sphere', frag: 'col = vec3(uv, 0.0);', camera: { yaw: 0.4, pitch: 0.3, dist: 3.0, spin: 0.4 } },
          after: '<div class="tip">In Unreal: TexCoord node → Base Color. In Unity Shader Graph: UV node → Base Color. Same picture!</div>',
        },
        {
          title: 'Adding blue',
          body: `<p>The third channel (blue) is free. Fill it with a constant and every corner shifts: black becomes blue, yellow becomes white.</p>`,
          controls: [{ name: 'b', label: 'blue', min: 0, max: 1, step: 0.01, value: 1 }],
          shader: (v) => ({ frag: 'col = vec3(uv, uB);', uniforms: { uB: v.b } }),
          code: (v) => `col = vec3(uv, ${f(v.b, 2)});\n// (0,0) → vec3(0, 0, ${n(v.b, 2)})   (1,1) → vec3(1, 1, ${n(v.b, 2)})`,
          quiz: { q: 'With <code>col = vec3(uv, 1.0)</code>, what colour is the top-right corner?', options: ['White', 'Yellow', 'Blue', 'Black'], answer: 0, explain: '(1, 1, 1) = all three lights full on = white.' },
        },
      ],
      games: [
        {
          id: 'corner-colour', title: 'Which colour is here?', engine: 'mcq', rounds: 8,
          blurb: 'Read the code and pick the colour at a given spot.',
          gen: (rng, level) => {
            const pool = MAPS.filter((m) => m.lvl <= level);
            const m = rng.pick(pool);
            const spots = level === 3 ? [...CORNERS, ...EDGE_MIDS] : CORNERS;
            const sp = rng.pick(spots);
            const others = rng.shuffle(spots.filter((s) => s !== sp));
            const ans = m.f(...sp.p);
            const opts = distinct(rng, ans, (r, i) => m.f(...others[i % others.length].p), 4, keyC);
            return {
              prompt: `What colour is the <b>${sp.name}</b> (uv ${pt(sp.p)})?`,
              code: m.code,
              options: opts.map((c) => ({ color: c })),
              explain: `<p>Plug in uv = ${pt(sp.p)}: the colour is <code>vec3${nv(ans)}</code> (red, green, blue).</p>`,
            };
          },
        },
        {
          id: 'find-colour', title: 'Find the colour', engine: 'tap', rounds: 6,
          blurb: 'Tap where this exact colour appears in the uv picture.',
          gen: (rng, level) => {
            const m = level === 1 ? MAPS[0] : rng.pick(MAPS.filter((x) => x.lvl <= Math.min(level, 2)));
            const stepV = level === 1 ? 0.25 : 0.1;
            const p = [rng.step(0.1, 0.9, stepV), rng.step(0.1, 0.9, stepV)].map((x) => +Math.max(0.1, Math.min(0.9, x)).toFixed(2));
            if (level === 1) { p[0] = rng.pick([0.25, 0.5, 0.75]); p[1] = rng.pick([0.25, 0.5, 0.75]); }
            const c = m.f(...p);
            return {
              prompt: `Tap where the colour is <code>vec3${nv(c, 2)}</code>`,
              sub: level === 1 ? 'Red = uv.x, green = uv.y.' : `Code: <code>${m.code}</code>`,
              color: c,
              shader: { frag: m.code },
              target: p,
              radius: 0.08,
              explain: `<p>Work backwards from the code: <code>${m.code}</code> → uv = ${pt(p)}.</p>`,
            };
          },
        },
        {
          id: 'image-to-map', title: 'Picture → code', engine: 'mcq', rounds: 6,
          blurb: 'Which uv-to-colour code painted this picture?',
          gen: (rng, level) => {
            const pool = MAPS.filter((m) => m.lvl <= level + 1);
            const ans = rng.pick(pool.filter((m) => m.lvl <= level));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.code);
            return {
              prompt: 'Which code made this picture?',
              shader: { frag: ans.code },
              options: opts.map((o) => ({ code: o.code })),
              explain: '<p>Check two corners: bottom-left is uv (0,0) and top-right is (1,1). Plug them into each option and compare with the picture.</p>',
            };
          },
        },
        {
          id: 'paint-uv-colours', title: 'Be the GPU: colour edition', engine: 'paint', rounds: 4,
          blurb: 'Each channel gets its own test. Paint the resulting colours.',
          gen: (rng, level) => {
            const T = [0.25, 0.5, 0.75];
            const ch = () => { const t = rng.pick(level === 1 ? [0.5] : T); const ax = rng.pick(['x', 'y']); return { t, ax, s: `step(${f(t)}, uv.${ax})`, fn: (u, v) => +((ax === 'x' ? u : v) >= t) }; };
            let rule;
            if (level < 3) {
              const a = ch(); let b; do { b = ch(); } while (b.ax === a.ax);
              const slots = rng.pick([[0, 1], [0, 2], [1, 2]]);
              const parts = ['0.0', '0.0', '0.0']; parts[slots[0]] = a.s; parts[slots[1]] = b.s;
              rule = { code: `col = vec3(${parts.join(',\n           ')});`, fn: (u, v) => { const c = [0, 0, 0]; c[slots[0]] = a.fn(u, v); c[slots[1]] = b.fn(u, v); return c; } };
            } else {
              const a = ch(), b = ch(), c2 = ch();
              rule = { code: `col = vec3(${a.s},\n           ${b.s},\n           ${c2.s});`, fn: (u, v) => [a.fn(u, v), b.fn(u, v), c2.fn(u, v)] };
            }
            const W = 4;
            const used = new Set();
            for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) used.add(keyC(rule.fn((x + 0.5) / W, (y + 0.5) / W)));
            used.add('0,0,0');
            const pal = NAMED.filter((c) => used.has(keyC(c.c)));
            if (pal.length < 3) pal.push(NAMED.find((c) => !used.has(keyC(c.c)) && c.label !== 'K'));
            const palette = pal.map((c) => ({ color: c.c, label: c.label }));
            return {
              prompt: 'Paint what this shader outputs:',
              sub: '<code>step(t, x)</code> is 1 when x ≥ t, else 0. Each line is one channel: red, green, blue.',
              code: rule.code,
              w: W, h: W, palette, showUV: level < 3,
              solve: (u, v) => palette.findIndex((p) => keyC(p.color) === keyC(rule.fn(u, v))),
              explain: '<p>Work channel by channel: decide red (0/1), green (0/1), blue (0/1), then mix the lights. R+G = yellow, R+B = magenta, G+B = cyan, all = white.</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'coords.center',
      title: 'Centering & remapping',
      blurb: 'Move the origin to the middle and stretch ranges: uv - 0.5, uv * 2 - 1.',
      lesson: [
        {
          title: 'Why move the origin?',
          body: `<p>Lots of effects are about the <b>centre</b>: circles, vignettes, rotation, symmetry. But in uv space the centre is the awkward <code>(0.5, 0.5)</code>.</p>
<p>Subtract it! <code>p = uv - 0.5</code> puts <code>(0, 0)</code> in the middle. Drag the offset and watch the white cross (where p = 0) move.</p>`,
          controls: [{ name: 'o', label: 'offset subtracted', min: 0, max: 1, step: 0.05, value: 0.5 }],
          shader: (v) => ({
            frag: `vec2 p = uv - uO;
col = vec3(p, 0.0);                       // negative → shows as black
float axis = step(abs(p.x), 0.006) + step(abs(p.y), 0.006);
col = mix(col, vec3(1.0), min(axis, 1.0));`,
            uniforms: { uO: v.o },
          }),
          code: (v) => `vec2 p = uv - ${f(v.o, 2)};\n// p goes from ${n(-v.o, 2)} to ${n(1 - v.o, 2)}\ncol = vec3(p, 0.0);`,
          after: '<div class="note">Notice the bottom-left quarter is black: p is <b>negative</b> there, and negative colours show as black. The numbers are still there — the screen just can\'t show them.</div>',
        },
        {
          title: 'Scale, then shift',
          body: `<p>Two moves change any range: <b>multiply</b> stretches it, <b>add</b> slides it.</p>
<p>The top line is uv (0..1). The bottom line shows where each uv value lands after <code>uv * s + o</code>.</p>
<div class="analogy">📏 Like a rubber ruler: multiplying stretches the rubber, adding slides the whole ruler along the table.</div>`,
          controls: [
            { name: 's', label: 'scale s', min: 0.5, max: 3, step: 0.25, value: 2 },
            { name: 'o', label: 'offset o', min: -1.5, max: 0.5, step: 0.25, value: -1 },
          ],
          visual: (el, v) => {
            const c = canvas2d(320, 150), ctx = c.ctx;
            const L = 20, R = 300, lo = -2, hi = 3.5;
            const X1 = (u) => L + u * (R - L) * 0.5 + (R - L) * 0.25;       // top line: 0..1 in the middle half
            const X2 = (x) => L + ((x - lo) / (hi - lo)) * (R - L);
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 320, 150);
            ctx.strokeStyle = '#5a6078'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(X1(0), 30); ctx.lineTo(X1(1), 30); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(L, 115); ctx.lineTo(R, 115); ctx.stroke();
            ctx.font = '11px ui-monospace, Menlo, monospace';
            ctx.fillStyle = '#8a90a8'; ctx.fillText('uv', 4, 34); ctx.fillText('p', 6, 119);
            for (let x = Math.ceil(lo); x <= hi; x++) { ctx.fillStyle = '#5a6078'; ctx.fillRect(X2(x) - 0.5, 110, 1, 10); ctx.fillText(String(x), X2(x) - 3, 136); }
            const cols = ['#ff7a7a', '#ffb36b', '#ffd479', '#9be37a', '#6bdfff'];
            [0, 0.25, 0.5, 0.75, 1].forEach((u, i) => {
              const p = u * v.s + v.o;
              ctx.strokeStyle = cols[i]; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(X1(u), 30); ctx.lineTo(X2(p), 115); ctx.stroke();
              ctx.fillStyle = cols[i];
              ctx.beginPath(); ctx.arc(X1(u), 30, 4, 0, 7); ctx.fill();
              ctx.beginPath(); ctx.arc(X2(p), 115, 4, 0, 7); ctx.fill();
              if (u === 0 || u === 1 || u === 0.5) { ctx.fillText(n(u), X1(u) - 6, 18); ctx.fillText(n(p, 2), X2(p) - 8, 103 - (i % 2) * 0); }
            });
            el.append(c.el);
          },
          code: (v) => `p = uv * ${f(v.s, 2)} + (${f(v.o, 2)});\n// 0   → ${n(v.o, 2)}\n// 0.5 → ${n(0.5 * v.s + v.o, 2)}\n// 1   → ${n(v.s + v.o, 2)}`,
          after: '<div class="note">Try s = 2, o = −1: you get the famous <b>−1 to 1</b> range with 0 in the middle.</div>',
        },
        {
          title: 'The two classics',
          body: `<p>You'll see these two lines in almost every shader:</p>
<pre class="code">vec2 p = uv - 0.5;        // range -0.5 .. 0.5
vec2 p = uv * 2.0 - 1.0;  // range -1.0 .. 1.0</pre>
<p>Both put (0,0) in the centre. The second is also <b>twice as big</b>, so the edges are at exactly ±1 — handy because "1" is a nice round radius.</p>
<p>Below: <code>length(p)</code> (distance from the centre) with p = uv·2−1. It's 0 in the middle and exactly 1 at the middle of each edge.</p>`,
          controls: [{ name: 'r', label: 'circle radius', min: 0.1, max: 1.4, step: 0.05, value: 1 }],
          shader: (v) => ({ frag: 'vec2 p = uv * 2.0 - 1.0;\nfloat d = length(p);\ncol = vec3(d * 0.6);\ncol = mix(col, vec3(1.0, 0.8, 0.3), step(abs(d - uR), 0.012));', uniforms: { uR: v.r } }),
          code: (v) => `vec2 p = uv * 2.0 - 1.0;\nfloat d = length(p);  // 0 at centre, 1 at edge middles\n// yellow ring where d == ${f(v.r, 2)}`,
          quiz: { q: 'With <code>p = uv * 2.0 - 1.0</code>, what is p at the top-right corner?', options: ['(1, 1)', '(2, 2)', '(0.5, 0.5)', '(-1, -1)'], answer: 0, explain: 'uv (1,1) × 2 = (2,2), minus 1 = (1,1).' },
        },
        {
          title: 'Order matters',
          body: `<p><code>(uv - 0.5) * 2.0</code> and <code>uv * 2.0 - 1.0</code> are the <b>same</b> (multiply out the brackets: 2·uv − 1).</p>
<p>But <code>uv * 2.0 - 0.5</code> is different: it goes −0.5 .. 1.5, so the centre is no longer at 0.</p>
<div class="note">Rule of thumb: <b>subtract the centre first, then scale.</b> Then the centre stays put while everything stretches around it.</div>`,
          quiz: { q: 'What range does <code>uv * 4.0 - 2.0</code> cover?', options: ['-2 .. 2', '-2 .. 4', '0 .. 4', '-0.5 .. 0.5'], answer: 0, explain: '0×4−2 = −2 and 1×4−2 = 2.' },
        },
        {
          title: 'The general recipe: remap',
          body: `<p>"Take a value in range <b>a..b</b> and move it to range <b>c..d</b>" is so common it has a name: <b>remap</b>.</p>
<pre class="code">remap(x, a, b, c, d) = c + (x - a) * (d - c) / (b - a)</pre>
<p>In words: how far along a..b is x (0..1)? Then go that far along c..d. Below: remapping uv.x from 0..1 to c..d.</p>`,
          controls: [
            { name: 'c', label: 'new min c', min: -1, max: 1, step: 0.1, value: -1 },
            { name: 'd', label: 'new max d', min: -1, max: 2, step: 0.1, value: 1 },
          ],
          graph: {
            fns: (v) => [{ f: (x) => G.mix(v.c, v.d, x), label: 'remap(x, 0, 1, c, d)' }, { f: (x) => x, color: '#4a4f63', dash: [4, 4] }],
            opts: { xmin: 0, xmax: 1, ymin: -1.2, ymax: 2.2 },
          },
          code: (v) => `float y = remap(uv.x, 0.0, 1.0, ${f(v.c, 2)}, ${f(v.d, 2)});\n// 0 → ${n(v.c, 2)},  0.5 → ${n((v.c + v.d) / 2, 2)},  1 → ${n(v.d, 2)}`,
          after: '<div class="tip">Unity Shader Graph has a <b>Remap</b> node. Unreal has <b>ConstantBiasScale</b> (add, then multiply) and a RemapValueRange function. <code>uv * 2 - 1</code> is a remap from 0..1 to −1..1.</div>',
        },
      ],
      games: [
        {
          id: 'remap-calc', title: 'Remap calculator', engine: 'numeric', rounds: 6,
          blurb: 'Plug a uv value into a remap formula.',
          gen: (rng, level) => {
            const kinds = level === 1 ? ['minus', 'm11'] : level === 2 ? ['minus', 'm11', 'scale', 'inverse'] : ['scale', 'inverse', 'remap', 'vec'];
            const k = rng.pick(kinds);
            const x = rng.pick(level === 1 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.1, 0.2, 0.25, 0.3, 0.4, 0.6, 0.7, 0.75, 0.8, 0.9, 1]);
            if (k === 'minus') return { prompt: `<code>uv.x = ${n(x)}</code>. What is <code>p</code>?`, code: 'float p = uv.x - 0.5;', answer: +(x - 0.5).toFixed(3), explain: `<p>${n(x)} − 0.5 = <b>${n(x - 0.5)}</b>. Values left of the centre become negative.</p>` };
            if (k === 'm11') return { prompt: `<code>uv.x = ${n(x)}</code>. What is <code>p</code>?`, code: 'float p = uv.x * 2.0 - 1.0;', answer: +(x * 2 - 1).toFixed(3), explain: `<p>${n(x)} × 2 = ${n(x * 2)}, minus 1 = <b>${n(x * 2 - 1)}</b>. (0 → −1, 0.5 → 0, 1 → 1.)</p>` };
            if (k === 'scale') {
              const s = rng.pick([3, 4, 10]), o = rng.pick([0.5, 1, 2]);
              const form = rng.chance() ? { code: `float p = (uv.x - 0.5) * ${f(s)};`, v: (x - 0.5) * s, ex: `(${n(x)} − 0.5) × ${s}` } : { code: `float p = uv.x * ${f(s)} - ${f(o)};`, v: x * s - o, ex: `${n(x)} × ${s} − ${n(o)}` };
              return { prompt: `<code>uv.x = ${n(x)}</code>. What is <code>p</code>?`, code: form.code, answer: +form.v.toFixed(3), explain: `<p>${form.ex} = <b>${n(form.v)}</b>. Brackets first, then multiply.</p>` };
            }
            if (k === 'inverse') {
              const p = rng.pick([-1, -0.5, 0, 0.5, 1, -0.8, 0.2, 0.6]);
              return { prompt: `<code>p = uv.x * 2.0 - 1.0</code> and you got <code>p = ${n(p)}</code>. What was <code>uv.x</code>?`, sub: 'Undo the steps in reverse: add 1, then divide by 2.', answer: +((p + 1) / 2).toFixed(3), explain: `<p>(${n(p)} + 1) / 2 = <b>${n((p + 1) / 2)}</b>. To undo a remap, do the opposite operations in the opposite order.</p>` };
            }
            if (k === 'remap') {
              const [c, d] = rng.pick([[10, 20], [-1, 1], [2, 4], [0, 100], [1, 0]]);
              const v = G.mix(c, d, x);
              return { prompt: `<code>uv.x = ${n(x)}</code>. What is <code>y</code>?`, code: `float y = remap(uv.x, 0.0, 1.0, ${f(c)}, ${f(d)});`, answer: +v.toFixed(3), explain: `<p>uv.x is ${Math.round(x * 100)}% of the way from 0 to 1, so y is ${Math.round(x * 100)}% of the way from ${c} to ${d}: <b>${n(v)}</b>.${d < c ? ' (c > d flips the direction!)' : ''}</p>`, tolerance: Math.abs(d - c) > 50 ? 0.5 : 0.011 };
            }
            const p2 = [x, rng.pick([0, 0.25, 0.5, 0.75, 1])];
            const r = G.sub(G.mul(p2, 2), 1);
            return { prompt: `<code>uv = ${pt(p2)}</code>. What is <code>p</code>?`, code: 'vec2 p = uv * 2.0 - 1.0;', answer: r.map((z) => +z.toFixed(3)), wrap: 'vec2', explain: `<p>Each component separately: x → ${n(p2[0])}·2−1 = ${n(r[0])}, y → ${n(p2[1])}·2−1 = ${n(r[1])}.</p>` };
          },
        },
        {
          id: 'range-quiz', title: 'What range?', engine: 'mcq', rounds: 8,
          blurb: 'uv goes 0..1. What range comes out of the formula?',
          gen: (rng, level) => {
            const s = rng.pick(level === 1 ? [2, 1] : [2, 3, 4, 0.5, 10]);
            const o = rng.pick(level === 1 ? [-1, -0.5, 0] : [-1, -0.5, -2, 1, 0.5, -0.25]);
            const form = level === 3 && rng.chance() ? 'bracket' : 'plain';
            const lo = form === 'bracket' ? (0 + o) * s : o, hi = form === 'bracket' ? (1 + o) * s : s + o;
            const code = form === 'bracket' ? `p = (uv.x ${o < 0 ? '-' : '+'} ${f(Math.abs(o))}) * ${f(s)};` : `p = uv.x * ${f(s)} ${o < 0 ? '-' : '+'} ${f(Math.abs(o))};`;
            if (s === 1 && o === 0) return q('What range does <code>p = uv.x;</code> cover?', ['0 .. 1', '-1 .. 1', '-0.5 .. 0.5', '0 .. 2'], 'Nothing changed: uv is 0..1.');
            const rs = (a, b) => `${n(a)} .. ${n(b)}`;
            const ans = rs(lo, hi);
            const wrongs = [rs(o, o + 1), rs(0, s), rs(o * s, s + o * s), rs(lo - 1, hi - 1), rs(-hi, -lo), rs(0, s + o), rs(lo / 2, hi / 2)];
            const opts = distinct(rng, ans, (r, i) => wrongs[i % wrongs.length], 4);
            return {
              prompt: 'uv.x goes from 0 to 1. What range does <code>p</code> cover?',
              code,
              options: opts,
              explain: `<p>Plug in the two ends: uv.x = 0 → <b>${n(lo)}</b>, uv.x = 1 → <b>${n(hi)}</b>.${form === 'bracket' ? ' Do the bracket first, then multiply.' : ' Multiply first, then add.'}</p>`,
            };
          },
        },
        {
          id: 'tap-centred', title: 'Tap in centred space', engine: 'tap', rounds: 6,
          blurb: 'The origin moved to the middle. Tap the point p = (a, b).',
          gen: (rng, level) => {
            const big = level === 3;
            const vals = big ? [-1.5, -1, -0.5, 0.5, 1, 1.5] : level === 1 ? [-1, -0.5, 0, 0.5, 1] : [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75];
            let p; do { p = [rng.pick(vals), rng.pick(vals)]; } while (p[0] === 0 && p[1] === 0);
            const code = big ? 'vec2 p = (uv - 0.5) * 4.0;  // -2 .. 2' : 'vec2 p = uv * 2.0 - 1.0;   // -1 .. 1';
            const uvT = big ? [p[0] / 4 + 0.5, p[1] / 4 + 0.5] : [(p[0] + 1) / 2, (p[1] + 1) / 2];
            const R = big ? 2 : 1;
            return {
              prompt: `Tap the point where <code>p = ${pt(p)}</code>`,
              code,
              sub: level === 1 ? 'The labels show p, not uv.' : level === 2 ? 'Only the axes are labelled now.' : 'This time p goes from −2 to 2.',
              draw: (ctx, w, h) => {
                drawUV(ctx, { x: 0, y: 0, s: w }, { grid: big ? 8 : 4, axes: false });
                ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
                ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#c7b8ff';
                ctx.fillText('0', w / 2 + 4, h / 2 + 14);
                if (level === 1) {
                  [-1, -0.5, 0.5, 1].forEach((t) => { const x = (t / R + 1) / 2 * w; ctx.fillText(n(t), Math.min(w - 22, Math.max(2, x - 8)), h / 2 + 14); const y = (1 - (t / R + 1) / 2) * h; ctx.fillText(n(t), w / 2 + 4, Math.min(h - 4, Math.max(12, y + 4))); });
                } else {
                  ctx.fillText(`p.x=${R}`, w - 44, h / 2 - 6); ctx.fillText(`p.y=${R}`, w / 2 + 4, 12);
                }
              },
              target: uvT,
              radius: 0.05,
              explain: `<p>The centre is p = (0,0). ${big ? 'Each half of the square is 2 units' : 'Each half of the square is 1 unit'}, so ${pt(p)} is ${p[0] > 0 ? 'right' : 'left'} of centre and ${p[1] > 0 ? 'above' : 'below'} it. In uv that's ${pt(uvT)}.</p>`,
            };
          },
        },
        {
          id: 'move-circle', title: 'Move the circle', engine: 'slider', rounds: 4,
          blurb: 'Tune the offset (and scale) in p = uv * s - o to match the target circle.',
          gen: (rng, level) => {
            const frag = `vec2 p = uv * uS - uO;
col = vec3(0.1) + 0.12 * gridLine(uv, 4.0);
col = mix(col, vec3(1.0, 0.8, 0.3), step(length(p), 0.25));`;
            if (level < 3) {
              const t = [rng.step(0.25, 0.75, level === 1 ? 0.25 : 0.05), rng.step(0.25, 0.75, level === 1 ? 0.25 : 0.05)];
              return {
                prompt: 'Set the offset so the circle matches the target.',
                sub: 'The circle is drawn where length(p) < 0.25, i.e. around p = (0,0). Where is p zero?',
                params: [
                  { name: 'ox', label: 'o.x', min: 0, max: 1, step: 0.05, target: t[0] },
                  { name: 'oy', label: 'o.y', min: 0, max: 1, step: 0.05, target: t[1] },
                ],
                build: (p) => ({ defs: GRID_DEFS, frag, uniforms: { uS: 1, uO: [p.ox, p.oy] } }),
                code: (p) => `vec2 p = uv - vec2(${f(p.ox, 2)}, ${f(p.oy, 2)});\n// p = (0,0) where uv = (${n(p.ox, 2)}, ${n(p.oy, 2)})`,
                explain: '<p>Subtracting o moves the origin <b>to</b> o: <code>uv - o</code> is zero exactly where uv = o. So the circle centre = the offset.</p>',
              };
            }
            const s = rng.pick([1, 1.5, 2]), c = rng.step(0.25, 0.75, 0.25);
            return {
              prompt: 'Set scale and offset to match the target circle.',
              sub: 'Scale changes the size (bigger s → smaller circle!), and the centre is where uv·s = o.',
              params: [
                { name: 's', label: 'scale s', min: 0.5, max: 2.5, step: 0.05, target: s },
                { name: 'o', label: 'offset o', min: 0, max: 2, step: 0.05, target: +(c * s).toFixed(2) },
              ],
              build: (p) => ({ defs: GRID_DEFS, frag, uniforms: { uS: p.s, uO: [p.o, p.o] } }),
              code: (p) => `vec2 p = uv * ${f(p.s, 2)} - ${f(p.o, 2)};\n// centre where uv = ${n(p.o / p.s, 2)}, radius in uv = ${n(0.25 / p.s, 2)}`,
              explain: '<p>Scaling uv by s zooms the space: the radius 0.25 in p is only 0.25/s in uv. The centre sits where uv·s − o = 0 → uv = o/s.</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'coords.aspect',
      title: 'Aspect ratio',
      blurb: 'Why circles turn into ovals on wide screens, and the one-line fix.',
      lesson: [
        {
          title: 'Screens aren\'t square',
          body: `<p>uv is always 0..1 in <b>both</b> directions — even when the screen is wider than it is tall.</p>
<p>So on a wide screen, "0.1 across" is <b>more pixels</b> than "0.1 up". Everything drawn in uv gets <b>stretched sideways</b>.</p>
<p>Same code below, on a square and on a 2:1 screen:</p>`,
          visual: (el) => {
            const spec = { defs: GRID_DEFS, frag: 'col = vec3(0.13, 0.17, 0.3) + 0.12 * gridLine(uv, 4.0);\ncol = mix(col, vec3(1.0, 0.8, 0.3), step(length(uv - 0.5), 0.3));' };
            const wrap = document.createElement('div');
            Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' });
            wrap.append(shaderView(spec, { size: 150, caption: 'square' }), shaderView(spec, { size: 300, height: 150, caption: '2:1 screen' }));
            el.append(wrap);
          },
          code: 'col = mix(col, yellow, step(length(uv - 0.5), 0.3));\n// a "circle" of radius 0.3 … in uv units',
        },
        {
          title: 'A rubber sheet',
          body: `<div class="analogy">🧻 <b>Analogy:</b> uv is drawn on a square rubber sheet. To cover a wide screen, the sheet gets <b>stretched</b> sideways — and everything drawn on it stretches too.</div>
<p>Drag the screen shape. The circle is drawn in plain uv, so it always fills the same <i>fraction</i> of the screen, and goes oval.</p>`,
          controls: [{ name: 'a', label: 'screen width ÷ height (aspect)', min: 0.5, max: 2.5, step: 0.05, value: 2 }],
          visual: (el, v) => {
            const W = v.a >= 1 ? 300 : Math.round(300 * v.a), H = v.a >= 1 ? Math.round(300 / v.a) : 300;
            const spec = { defs: GRID_DEFS, frag: 'col = vec3(0.13, 0.17, 0.3) + 0.12 * gridLine(uv, 4.0);\ncol = mix(col, vec3(1.0, 0.8, 0.3), step(length(uv - 0.5), 0.3));' };
            const d = document.createElement('div'); d.style.textAlign = 'center';
            d.append(shaderView(spec, { size: W, height: H }));
            el.append(d);
          },
          code: (v) => `// screen ${Math.round(v.a * 600)} × 600 px\nfloat aspect = uRes.x / uRes.y; // = ${n(v.a, 2)}\n// no fix yet → oval`,
        },
        {
          title: 'The fix: p.x *= aspect',
          body: `<p>We want x and y measured in the <b>same unit</b>. Pick the height as the unit. A wide screen is <code>aspect</code> heights wide, so multiply x by the aspect:</p>
<pre class="code">float aspect = uRes.x / uRes.y;
vec2 p = uv - 0.5;   // centre first
p.x *= aspect;       // now 1 unit of x = 1 unit of y in pixels</pre>
<p>Turn the fix on and drag the screen shape. The circle stays round!</p>`,
          controls: [
            { name: 'a', label: 'aspect', min: 0.5, max: 2.5, step: 0.05, value: 2 },
            { name: 'fix', label: 'fix (0 = off, 1 = on)', min: 0, max: 1, step: 1, value: 1 },
          ],
          visual: (el, v) => {
            const W = v.a >= 1 ? 300 : Math.round(300 * v.a), H = v.a >= 1 ? Math.round(300 / v.a) : 300;
            const spec = { defs: GRID_DEFS, uniforms: { uFix: v.fix }, frag: 'vec2 p = uv - 0.5;\np.x *= mix(1.0, uRes.x / uRes.y, uFix);\ncol = vec3(0.13, 0.17, 0.3) + 0.12 * gridLine(uv, 4.0);\ncol = mix(col, vec3(1.0, 0.8, 0.3), step(length(p), 0.3));' };
            const d = document.createElement('div'); d.style.textAlign = 'center';
            d.append(shaderView(spec, { size: W, height: H }));
            el.append(d);
          },
          code: (v) => `float aspect = uRes.x / uRes.y; // ${n(v.a, 2)}\nvec2 p = uv - 0.5;\n${v.fix ? '' : '// '}p.x *= aspect;   ${v.fix ? '// p.x now goes ' + n(-v.a / 2, 2) + ' .. ' + n(v.a / 2, 2) : '// fix is OFF'}\nfloat circle = step(length(p), 0.3);`,
        },
        {
          title: 'Why centre first?',
          body: `<p>Multiplying stretches everything <b>away from 0</b>. If 0 is at the left edge (plain uv), the stretch pushes the circle off to the right.</p>
<p>Compare (2:1 screen):</p>
<ul><li>Left: <code>uv.x *= aspect</code> then centre at 0.5 → circle is round but <b>off-centre</b>.</li><li>Right: centre first, then <code>p.x *= aspect</code> → round <b>and</b> centred.</li></ul>`,
          visual: (el) => {
            const base = 'col = vec3(0.13, 0.17, 0.3) + 0.12 * gridLine(uv, 4.0);\ncol = mix(col, vec3(1.0, 0.8, 0.3), step(length(p), 0.3));';
            const a = { defs: GRID_DEFS, frag: 'vec2 p = uv;\np.x *= uRes.x / uRes.y;\np -= 0.5;\n' + base };
            const b = { defs: GRID_DEFS, frag: 'vec2 p = uv - 0.5;\np.x *= uRes.x / uRes.y;\n' + base };
            const wrap = document.createElement('div');
            Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' });
            wrap.append(shaderView(a, { size: 300, height: 150, caption: 'scale, then centre ✗' }), shaderView(b, { size: 300, height: 150, caption: 'centre, then scale ✓' }));
            el.append(wrap);
          },
          quiz: { q: 'On an 800×400 screen, after <code>p = uv - 0.5; p.x *= aspect;</code> what is p.x at the right edge?', options: ['1.0', '0.5', '2.0', '0.25'], answer: 0, explain: 'aspect = 2. At the right edge uv.x − 0.5 = 0.5, × 2 = 1.0.' },
        },
        {
          title: 'Other ways to write it',
          body: `<p>You'll meet several versions. They all make x and y use the same unit:</p>
<pre class="code">p.x *= uRes.x / uRes.y;      // unit = screen height
p.y *= uRes.y / uRes.x;      // unit = screen width
p = (uv - 0.5) * uRes / uRes.y;   // vector version
p = (2.0*gl_FragCoord.xy - uRes) / uRes.y; // ShaderToy classic</pre>
<div class="tip">Do you need this on a mesh? Usually <b>no</b>: a model's UVs are laid out by the artist to match the surface. Aspect fixes matter for <b>full-screen effects</b> and UI quads that aren't square.</div>`,
        },
      ],
      games: [
        {
          id: 'fix-aspect', title: 'Fix the aspect ratio', engine: 'slider', rounds: 4,
          blurb: 'Set the multiplier on p.x so the circle on this screen becomes round.',
          gen: (rng, level) => {
            const pool = level === 1 ? [[2, 800, 400], [1.5, 900, 600]] : level === 2 ? [[2, 800, 400], [1.5, 900, 600], [0.5, 400, 800], [0.75, 600, 800]] : [[1.25, 1000, 800], [1.75, 1400, 800], [0.6, 600, 1000], [2.5, 1000, 400], [0.75, 900, 1200]];
            const [a, W, H] = rng.pick(pool);
            return {
              prompt: `This screen is <b>${W} × ${H}</b> pixels. Set <code>k</code> so the circle is round.`,
              sub: level === 3 ? 'Work it out first, then check by eye.' : 'Hint: k = screen width ÷ screen height.',
              params: [{ name: 'k', label: 'p.x *= k', min: 0.25, max: 3, step: 0.05, target: a }],
              build: (p) => ({ defs: GRID_DEFS, frag: SCREEN_FRAG, uniforms: { uHalf: screenHalf(a), uK: p.k } }),
              code: (p) => `vec2 p = uv - 0.5;\np.x *= ${f(p.k, 2)};  // aspect = ${W} / ${H} = ?\nfloat circle = step(length(p), 0.2);`,
              explain: `<p>aspect = ${W} / ${H} = <b>${n(a)}</b>. ${a < 1 ? 'A tall screen has aspect < 1: x is <i>shrunk</i>, because the screen is narrower than it is tall.' : 'A wide screen has aspect > 1: x is stretched to match y.'}</p>`,
            };
          },
        },
        {
          id: 'aspect-calc', title: 'Aspect maths', engine: 'numeric', rounds: 6,
          blurb: 'Compute aspect ratios and aspect-corrected coordinates.',
          gen: (rng, level) => {
            const R = rng.pick([[800, 400], [1200, 600], [900, 600], [1000, 500], [600, 800], [1600, 800], [1920, 1080]]);
            const a = R[0] / R[1];
            const kinds = level === 1 ? ['aspect'] : level === 2 ? ['aspect', 'edge'] : ['edge', 'point', 'radius'];
            const k = rng.pick(kinds);
            if (k === 'aspect' || (R[0] === 1920 && k !== 'aspect')) return { prompt: `The screen is <b>${R[0]} × ${R[1]}</b>. What is <code>aspect</code>?`, code: 'float aspect = uRes.x / uRes.y;', answer: +a.toFixed(2), tolerance: 0.011, explain: `<p>${R[0]} ÷ ${R[1]} = <b>${n(a, 2)}</b>. ${a > 1 ? 'Wider than tall → greater than 1.' : 'Taller than wide → less than 1.'}</p>` };
            if (k === 'edge') return { prompt: `Screen <b>${R[0]} × ${R[1]}</b>. What is <code>p.x</code> at the <b>right edge</b> (uv.x = 1)?`, code: 'vec2 p = uv - 0.5;\np.x *= uRes.x / uRes.y;', answer: +(0.5 * a).toFixed(3), explain: `<p>aspect = ${n(a, 2)}. (1 − 0.5) × ${n(a, 2)} = <b>${n(0.5 * a)}</b>. After the fix, x reaches further than y (which still ends at 0.5) on a wide screen.</p>` };
            if (k === 'point') {
              const [R0, R1] = rng.pick([[800, 400], [1200, 600], [1200, 400]]);
              R[0] = R0; R[1] = R1;
              const a2 = R0 / R1;
              const u = rng.pick([0, 0.25, 0.75, 1]), vv = rng.pick([0, 0.25, 0.75, 1]);
              const ans = [(u - 0.5) * a2, vv - 0.5];
              return { prompt: `Screen <b>${R[0]} × ${R[1]}</b>, uv = ${pt([u, vv])}. What is <code>p</code>?`, code: 'vec2 p = uv - 0.5;\np.x *= uRes.x / uRes.y;', answer: ans.map((z) => +z.toFixed(3)), wrap: 'vec2', explain: `<p>Centre first: ${pt([u - 0.5, vv - 0.5])}. Then only x is multiplied by ${n(a2, 2)} → <b>${nv(ans)}</b>.</p>` };
            }
            return { prompt: `Screen <b>${R[0]} × ${R[1]}</b>. A round circle of radius 0.25 (aspect-corrected p) is how many <b>pixels</b> wide (diameter)?`, code: 'vec2 p = uv - 0.5;\np.x *= uRes.x / uRes.y;\nfloat c = step(length(p), 0.25);', answer: 0.5 * R[1], tolerance: 1, explain: `<p>After the fix, 1 unit = the screen <b>height</b> = ${R[1]} px. Diameter 0.5 → 0.5 × ${R[1]} = <b>${0.5 * R[1]} px</b>, in both directions.</p>` };
          },
        },
        {
          id: 'aspect-quiz', title: 'Aspect ratio quiz', engine: 'mcq', rounds: 7,
          blurb: 'Concepts and code for keeping things round.',
          questions: [
            q('On a 1600×800 screen, a circle drawn with <code>length(uv - 0.5) &lt; 0.3</code> looks…', ['Twice as wide as it is tall', 'Perfectly round', 'Twice as tall as it is wide', 'Invisible'], 'uv stretches to fill the screen: 0.3 of the width is 480 px, 0.3 of the height only 240 px.'),
            q('Which line fixes the aspect ratio (after centring)?', [{ code: 'p.x *= uRes.x / uRes.y;' }, { code: 'p.x *= uRes.y / uRes.x;' }, { code: 'p.y *= uRes.x / uRes.y;' }, { code: 'p *= uRes.x / uRes.y;' }], 'Multiply x by width/height so x is measured in "heights". Multiplying BOTH changes nothing about the shape.'),
            q('What is the aspect of a 1080×1920 (portrait phone) screen?', ['0.5625', '1.78', '1.0', '1920'], '1080 / 1920 = 0.5625 — taller than wide → less than 1.'),
            tf('<code>p *= aspect</code> (both x and y) fixes the stretching.', false, 'Scaling both by the same amount only zooms. The <i>ratio</i> between x and y is what must change.'),
            tf('You should centre (<code>uv - 0.5</code>) before multiplying x by the aspect.', true, 'Otherwise the stretch happens around the left edge and your centre slides to the right.'),
            tf('On a square screen, the aspect fix changes nothing.', true, 'aspect = 1, and multiplying by 1 does nothing.'),
            tf('After <code>p.x *= aspect</code> on a wide screen, p.x still goes from −0.5 to 0.5.', false, 'It goes from −aspect/2 to +aspect/2, e.g. −1..1 on a 2:1 screen. Only y stays −0.5..0.5.', 2),
            q('Why don\'t mesh materials usually need an aspect fix?', ['The artist laid out the UVs to match the surface proportions', 'GPUs fix it automatically', 'Meshes are always square', 'uv is in pixels on meshes'], 'UV unwrapping already keeps texels roughly square. Aspect fixes are for screen-space effects and non-square quads.', { level: 2 }),
            q('<code>vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;</code> — what range does p.y cover?', ['-1 .. 1', '0 .. 1', '-0.5 .. 0.5', '0 .. uRes.y'], 'At the bottom: (0 − H)/H = −1. At the top: (2H − H)/H = 1. And x is automatically aspect-correct.', { level: 3 }),
            q('A 2:1 screen, aspect fixed. Which point is at the top-right corner?', [{ code: 'p = vec2(1.0, 0.5)' }, { code: 'p = vec2(0.5, 0.5)' }, { code: 'p = vec2(1.0, 1.0)' }, { code: 'p = vec2(2.0, 1.0)' }], 'Centred: (0.5, 0.5). Then x × 2 → (1.0, 0.5).', { level: 2 }),
            q('Another valid fix is…', [{ code: 'p.y /= uRes.x / uRes.y;' }, { code: 'p.y *= uRes.x / uRes.y;' }, { code: 'p.x /= uRes.x / uRes.y;' }, { code: 'p += uRes.x / uRes.y;' }], 'Dividing y by the aspect also makes both axes use the same unit (here: the screen width).', { level: 3 }),
          ],
        },
        {
          id: 'tap-aspect', title: 'Tap on a wide screen', engine: 'tap', rounds: 5,
          blurb: 'Aspect-corrected coordinates: find the point p on a non-square screen.',
          gen: (rng, level) => {
            const a = level === 3 ? rng.pick([1.5, 2]) : 2;
            const [hx, hy] = screenHalf(a);
            const xs = a === 2 ? [-0.75, -0.5, 0.5, 0.75, 0.25, -0.25] : [-0.5, -0.25, 0.25, 0.5];
            const ys = [-0.25, 0.25, 0];
            let p; do { p = [rng.pick(xs), rng.pick(ys)]; } while (p[1] === 0 && level === 1);
            const s = [p[0] / a + 0.5, p[1] + 0.5];
            const target = [0.5 + (s[0] - 0.5) * 2 * hx, 0.5 + (s[1] - 0.5) * 2 * hy];
            return {
              prompt: `This screen is ${a}:1. Tap where <code>p = ${pt(p)}</code>`,
              code: `vec2 p = uv - 0.5;\np.x *= ${f(a)};  // aspect`,
              sub: level === 1 ? 'Grid lines are every 0.25 in p. The purple cross is p = (0,0).' : 'The purple cross is p = (0,0). Grid lines every 0.25 in p.',
              draw: (ctx, w, h) => {
                ctx.fillStyle = '#0b0c10'; ctx.fillRect(0, 0, w, h);
                const X0 = (0.5 - hx) * w, Y0 = (0.5 - hy) * h, SW = 2 * hx * w, SH = 2 * hy * h;
                ctx.fillStyle = '#171a24'; ctx.fillRect(X0, Y0, SW, SH);
                const unit = SH; // 1 unit of p = screen height
                ctx.strokeStyle = '#2c3142'; ctx.lineWidth = 1;
                for (let k = -8; k <= 8; k++) {
                  const gx = w / 2 + k * 0.25 * unit, gy = h / 2 + k * 0.25 * unit;
                  if (gx >= X0 - 0.5 && gx <= X0 + SW + 0.5) { ctx.beginPath(); ctx.moveTo(gx, Y0); ctx.lineTo(gx, Y0 + SH); ctx.stroke(); }
                  if (gy >= Y0 - 0.5 && gy <= Y0 + SH + 0.5) { ctx.beginPath(); ctx.moveTo(X0, gy); ctx.lineTo(X0 + SW, gy); ctx.stroke(); }
                }
                ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(w / 2, Y0); ctx.lineTo(w / 2, Y0 + SH); ctx.moveTo(X0, h / 2); ctx.lineTo(X0 + SW, h / 2); ctx.stroke();
                ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#c7b8ff';
                if (level < 3) {
                  ctx.fillText(`x=${n(a / 2)}`, X0 + SW - 42, h / 2 - 5); ctx.fillText(`x=${n(-a / 2)}`, X0 + 3, h / 2 - 5);
                  ctx.fillText('y=0.5', w / 2 + 4, Y0 + 12); ctx.fillText('y=-0.5', w / 2 + 4, Y0 + SH - 4);
                }
              },
              target,
              radius: 0.04,
              explain: `<p>After the fix, x runs from ${n(-a / 2)} to ${n(a / 2)} while y runs −0.5..0.5, and both use the same size unit (the screen height). So the grid squares are truly square.</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'coords.pixels',
      title: 'Pixels vs normalized',
      blurb: 'gl_FragCoord counts pixels; dividing by the resolution gives uv.',
      lesson: [
        {
          title: 'Counting in pixels',
          body: `<p>Besides uv, every fragment shader gets <code>gl_FragCoord.xy</code>: the pixel's position in <b>pixels</b>, counted from the bottom-left.</p>
<p>Careful: it's the pixel's <b>centre</b>. The bottom-left pixel is at <code>(0.5, 0.5)</code>, the next one to the right at <code>(1.5, 0.5)</code>.</p>
<p>Pick a pixel on this tiny 8 × 5 screen:</p>`,
          controls: [
            { name: 'x', label: 'pixel column', min: 0, max: 7, step: 1, value: 2 },
            { name: 'y', label: 'pixel row', min: 0, max: 4, step: 1, value: 1 },
          ],
          visual: (el, v) => {
            const c = canvas2d(320, 210), ctx = c.ctx, S = 36, X0 = 16, Y0 = 10;
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 320, 210);
            for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) {
              const px = X0 + x * S, py = Y0 + (4 - y) * S;
              const on = x === v.x && y === v.y;
              ctx.fillStyle = on ? '#ffd479' : ((x + y) % 2 ? '#1d2130' : '#242939');
              ctx.fillRect(px, py, S - 1, S - 1);
              if (on) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(px + S / 2, py + S / 2, 3, 0, 7); ctx.fill(); }
            }
            ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#8a90a8';
            for (let x = 0; x < 8; x++) ctx.fillText(String(x), X0 + x * S + S / 2 - 3, Y0 + 5 * S + 14);
            for (let y = 0; y < 5; y++) ctx.fillText(String(y), 4, Y0 + (4 - y) * S + S / 2 + 4);
            el.append(c.el);
          },
          code: (v) => `// uRes = vec2(8.0, 5.0)\ngl_FragCoord.xy = (${n(v.x + 0.5)}, ${n(v.y + 0.5)})  // centre of pixel ${v.x},${v.y}\nuv = gl_FragCoord.xy / uRes\n   = (${n((v.x + 0.5) / 8)}, ${n((v.y + 0.5) / 5)})`,
        },
        {
          title: 'Divide by the resolution',
          body: `<p>To turn pixels into a 0..1 fraction, divide by the screen size <code>uRes</code> (in pixels):</p>
<pre class="code">vec2 uv = gl_FragCoord.xy / uRes;</pre>
<p>This is <b>exactly</b> how uv is made for full-screen effects. Below, the divisor is a slider. Too small and almost everything is above 1 (white/yellow). When it equals the canvas size (a few hundred pixels) you get the normal uv picture.</p>`,
          controls: [{ name: 'd', label: 'divide by (pixels)', min: 1, max: 600, step: 1, value: 40 }],
          shader: (v) => ({ frag: 'col = vec3(gl_FragCoord.xy / uD, 0.0);', uniforms: { uD: v.d } }),
          code: (v) => `col = vec3(gl_FragCoord.xy / ${f(v.d)}, 0.0);\n// pixels further than ${v.d} px from the edge → value > 1 → full red/green`,
          after: '<div class="note">uv = "pixel position ÷ screen size". Pixels are the raw count; uv is the percentage.</div>',
        },
        {
          title: 'Why bother normalizing?',
          body: `<p>Imagine drawing a circle of radius <b>100 pixels</b>. On a phone it's big; on a 4K TV it's tiny.</p>
<p>A circle of radius <b>0.3 (uv)</b> covers the same <i>fraction</i> of every screen.</p>
<div class="analogy">🧁 Like a recipe written in <b>cups</b> ("1 part sugar, 2 parts flour") instead of grams — it scales to any batch size.</div>
<p>Rule: use <b>uv</b> for things that should scale with the screen; use <b>pixels</b> for things that must stay a fixed size (1-pixel outlines, pixel-art blocks, dithering).</p>`,
        },
        {
          title: 'When pixels are what you want',
          body: `<p>Here's a checkerboard with squares of a fixed size in <b>pixels</b>. It stays the same pixel size whatever the canvas size — perfect for crisp, retro or dither patterns.</p>`,
          controls: [{ name: 's', label: 'square size (px)', min: 2, max: 40, step: 1, value: 16 }],
          shader: (v) => ({ frag: 'vec2 cell = floor(gl_FragCoord.xy / uS);\ncol = vec3(mod(cell.x + cell.y, 2.0));', uniforms: { uS: v.s } }),
          code: (v) => `vec2 cell = floor(gl_FragCoord.xy / ${f(v.s)}); // which ${v.s}px square?\ncol = vec3(mod(cell.x + cell.y, 2.0));`,
          after: '<div class="tip">One pixel in uv units is <code>1.0 / uRes</code> — the size of a "texel step" used for blurs and outlines.</div>',
        },
        {
          title: 'In other tools',
          body: `<ul>
<li><b>ShaderToy</b>: <code>vec2 uv = fragCoord / iResolution.xy;</code></li>
<li><b>Unity</b>: <code>_ScreenParams.xy</code> is the resolution; Shader Graph's <b>Screen Position</b> node gives 0..1 screen uv.</li>
<li><b>Unreal</b>: <b>ScreenPosition</b> (ViewportUV) node and <b>ViewSize</b> for pixels.</li>
<li><b>HLSL</b>: <code>SV_Position</code> is the equivalent of <code>gl_FragCoord</code> (origin top-left in DirectX!).</li></ul>
<p>The centred, aspect-correct one-liner you'll see everywhere:</p>`,
          shader: { frag: 'vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y; // -1..1 in y\ncol = vec3(0.5 + 0.5 * p, 0.5) * step(length(p), 0.8);' },
          code: 'vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;\n// centre = (0,0), y from -1 to 1, x aspect-correct',
        },
      ],
      games: [
        {
          id: 'pixel-to-uv', title: 'Pixels → uv', engine: 'numeric', rounds: 6,
          blurb: 'Divide gl_FragCoord by the resolution.',
          gen: (rng, level) => {
            const R = rng.pick(level === 1 ? [[800, 400], [1000, 500], [400, 400]] : [[800, 600], [1920, 1080], [1000, 800], [1280, 720]]);
            const stepV = level === 1 ? 0.25 : 0.05;
            const u = [rng.step(0, 1, stepV), rng.step(0, 1, stepV)];
            const fc = [u[0] * R[0], u[1] * R[1]].map((z) => Math.round(z));
            const ans = [fc[0] / R[0], fc[1] / R[1]];
            if (level === 3 && rng.chance(0.5)) {
              const R2 = rng.pick([[800, 400], [1000, 500], [600, 400]]);
              const fc2 = [rng.pick([0, 0.25, 0.5, 0.75, 1]) * R2[0], rng.pick([0, 0.25, 0.75, 1]) * R2[1]];
              const p = [(2 * fc2[0] - R2[0]) / R2[1], (2 * fc2[1] - R2[1]) / R2[1]];
              return { prompt: `Screen <b>${R2[0]} × ${R2[1]}</b>, <code>gl_FragCoord.xy = (${fc2[0]}, ${fc2[1]})</code>. What is <code>p</code>?`, code: 'vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;', answer: p.map((z) => +z.toFixed(3)), wrap: 'vec2', explain: `<p>x: (2·${fc2[0]} − ${R2[0]}) / ${R2[1]} = ${n(p[0])}. y: (2·${fc2[1]} − ${R2[1]}) / ${R2[1]} = ${n(p[1])}. Both divided by the <b>height</b> — that's the aspect fix built in.</p>` };
            }
            return {
              prompt: `Screen is <b>${R[0]} × ${R[1]}</b>. <code>gl_FragCoord.xy = (${fc[0]}, ${fc[1]})</code>. What is <code>uv</code>?`,
              code: 'vec2 uv = gl_FragCoord.xy / uRes;',
              answer: ans.map((z) => +z.toFixed(3)), wrap: 'vec2', tolerance: 0.011,
              explain: `<p>${fc[0]} ÷ ${R[0]} = ${n(ans[0], 3)}, ${fc[1]} ÷ ${R[1]} = ${n(ans[1], 3)}. Each axis is divided by <b>its own</b> size.</p>`,
            };
          },
        },
        {
          id: 'uv-to-pixel', title: 'uv → pixels', engine: 'numeric', rounds: 6,
          blurb: 'Go backwards: which pixel is at this uv?',
          gen: (rng, level) => {
            const R = rng.pick(level === 1 ? [[800, 400], [1000, 1000], [400, 200]] : [[1920, 1080], [1280, 720], [800, 600], [2532, 1170]]);
            const stepV = level === 1 ? 0.25 : level === 2 ? 0.1 : 0.05;
            const u = [rng.step(0, 1, stepV), rng.step(0, 1, stepV)];
            const ans = [u[0] * R[0], u[1] * R[1]].map((z) => +z.toFixed(1));
            if (level >= 2 && rng.chance(0.3)) {
              return { prompt: `Screen is <b>${R[0]} × ${R[1]}</b>. How wide is <b>one pixel</b> in uv units (x)?`, sub: 'Answer with up to 4 decimals.', code: 'vec2 texel = 1.0 / uRes;', answer: +(1 / R[0]).toFixed(4), tolerance: 0.00006, explain: `<p>1 ÷ ${R[0]} ≈ <b>${(1 / R[0]).toFixed(4)}</b>. This is the step used to read the neighbouring pixel in blurs and outlines.</p>` };
            }
            return {
              prompt: `Screen is <b>${R[0]} × ${R[1]}</b>. At <code>uv = ${pt(u)}</code>, what is <code>gl_FragCoord.xy</code> (in pixels)?`,
              code: 'gl_FragCoord.xy = uv * uRes;',
              answer: ans, wrap: 'vec2', tolerance: 1,
              explain: `<p>Multiply each part by its size: ${n(u[0])} × ${R[0]} = ${n(ans[0])}, ${n(u[1])} × ${R[1]} = ${n(ans[1])}. (±1 px is fine.)</p>`,
            };
          },
        },
        {
          id: 'pixel-gpu', title: 'Be the GPU: pixel edition', engine: 'paint', rounds: 4,
          blurb: 'A 6×4 screen. Run code that uses gl_FragCoord in your head.',
          gen: (rng, level) => {
            const r = pixelRule(rng, level);
            return {
              prompt: 'Paint what this outputs on a 6 × 4 pixel screen:',
              sub: '<code>uRes = (6.0, 4.0)</code>. Pixel centres: bottom-left = (0.5, 0.5), top-right = (5.5, 3.5).',
              code: r.code,
              w: 6, h: 4, palette: BW,
              solve: (u, v, x, y) => r.solve(x, y),
              explain: (r.note ? `<p>${r.note}</p>` : '') + '<p>gl_FragCoord is in <b>pixels</b>: column + 0.5, row + 0.5.</p>',
            };
          },
        },
        {
          id: 'pixels-or-uv', title: 'Pixels or uv?', engine: 'buckets', rounds: 2,
          blurb: 'Should this effect be measured in pixels or in normalized uv?',
          gen: () => ({
            prompt: 'Measure this in fixed pixels, or as a fraction of the screen?',
            sub: 'Pixels = same pixel size on every screen. uv = same proportion on every screen.',
            buckets: ['📏 Pixels', '📐 uv (0..1)'],
            count: 10,
            items: [
              { text: 'A 1-pixel-wide outline that must stay razor thin', bucket: 0 },
              { text: 'A circle covering 30% of the screen width', bucket: 1 },
              { text: 'A vignette that looks the same on phone and TV', bucket: 1 },
              { text: 'Pixel-art blocks of exactly 4×4 screen pixels', bucket: 0 },
              { text: 'A left-to-right gradient across the screen', bucket: 1 },
              { text: 'Dither pattern repeating every 2 pixels', bucket: 0, why: 'Dithering is about individual pixels.' },
              { text: 'A logo in the exact centre', bucket: 1 },
              { text: 'CRT scanlines every 3 pixels', bucket: 0 },
              { text: 'Placing a sun at 80% of the sky\'s height', bucket: 1 },
              { text: 'Reading the neighbouring pixel for a blur', bucket: 0, why: 'One pixel step = 1.0 / uRes.' },
              { text: 'Sampling a full-screen texture', bucket: 1, why: 'Textures are always read with 0..1 coordinates.' },
              { text: 'A crosshair that\'s always 9 pixels across', bucket: 0 },
            ],
          }),
        },
      ],
    },
  ],
};
