// Topic — The rendering pipeline: how a draw call becomes pixels.
import { tf, q, distinct, f, n, h, canvas2d, css } from './_kit.js';

// ====================================================================== helpers
// 2D triangle maths in any coordinate system with y pointing UP.
const edgeF = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
/** barycentric weights of p for triangle ABC: [wA, wB, wC] (sum 1, all >= 0 inside) */
const baryW = (A, B, C, p) => { const ar = edgeF(A, B, C); return [edgeF(B, C, p) / ar, edgeF(C, A, p) / ar, edgeF(A, B, p) / ar]; };
const inTri = (A, B, C, p) => baryW(A, B, C, p).every((w) => w >= 0);
const segDist = (p, a, b) => {
  const pa = [p[0] - a[0], p[1] - a[1]], ba = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1])));
  return Math.hypot(pa[0] - ba[0] * t, pa[1] - ba[1] * t);
};
const triDist = (A, B, C, p) => Math.min(segDist(p, A, B), segDist(p, B, C), segDist(p, C, A));
const mixC = (cs, w) => [0, 1, 2].map((k) => cs[0][k] * w[0] + cs[1][k] * w[1] + cs[2][k] * w[2]);
const RGB = [[1, 0.2, 0.2], [0.2, 1, 0.3], [0.25, 0.4, 1]];

/** Fill a canvas2d with a barycentric-interpolated triangle (coords in css px, y DOWN). */
function triImage(c, A, B, C, cols, bg = [0.055, 0.06, 0.08]) {
  const dpr = c.el.width / c.w;
  const W = c.el.width, H = c.el.height;
  const img = c.ctx.createImageData(W, H);
  // convert to y-up for edge function consistency (sign does not matter, we normalise)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = [(x + 0.5) / dpr, (y + 0.5) / dpr];
    const w = baryW(A, B, C, p);
    const inside = w[0] >= 0 && w[1] >= 0 && w[2] >= 0;
    const col = inside ? mixC(cols, w) : bg;
    const i = (y * W + x) * 4;
    img.data[i] = col[0] * 255; img.data[i + 1] = col[1] * 255; img.data[i + 2] = col[2] * 255; img.data[i + 3] = 255;
  }
  c.ctx.putImageData(img, 0, 0);
}

/** Draw a pixel grid with an (exact) triangle on top. Grid units, y UP, W×H cells. */
function drawRaster(ctx, size, W, Hc, tri, opts = {}) {
  const s = size / W;
  const P = (p) => [p[0] * s, (Hc - p[1]) * s];
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, size, Hc * s);
  for (let y = 0; y < Hc; y++) for (let x = 0; x < W; x++) {
    const fill = opts.cellFill && opts.cellFill(x, y);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x * s + 1, (Hc - 1 - y) * s + 1, s - 2, s - 2); }
  }
  ctx.strokeStyle = '#2a2e3c'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * s, 0); ctx.lineTo(x * s, Hc * s); ctx.stroke(); }
  for (let y = 0; y <= Hc; y++) { ctx.beginPath(); ctx.moveTo(0, y * s); ctx.lineTo(size, y * s); ctx.stroke(); }
  if (tri) {
    const [a, b, c] = tri.map(P);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath();
    if (opts.triFill) { ctx.fillStyle = opts.triFill; ctx.fill(); }
    ctx.strokeStyle = opts.triStroke || '#ffd479'; ctx.lineWidth = 2; ctx.stroke();
    if (opts.vertexDots) for (const v of [a, b, c]) { ctx.fillStyle = '#ffd479'; ctx.beginPath(); ctx.arc(v[0], v[1], 4, 0, 7); ctx.fill(); }
  }
  if (opts.centres) for (let y = 0; y < Hc; y++) for (let x = 0; x < W; x++) {
    const cc = opts.centreColor ? opts.centreColor(x, y) : '#9aa0b4';
    ctx.fillStyle = cc; ctx.beginPath(); ctx.arc((x + 0.5) * s, (Hc - 0.5 - y) * s, Math.max(2, s * 0.07), 0, 7); ctx.fill();
  }
}

/** Random triangle on a W×W grid with no pixel centre close to its border (so answers are unambiguous). */
function rasterTri(rng, level) {
  const W = [5, 7, 8][level - 1];
  const minArea = W * W * [0.22, 0.14, 0.07][level - 1];
  for (let tries = 0; tries < 400; tries++) {
    const r = () => +rng.float(0.15, W - 0.15).toFixed(1);
    let tri = [[r(), r()], [r(), r()], [r(), r()]];
    const ar = edgeF(...tri) / 2;
    if (Math.abs(ar) < minArea || Math.abs(ar) > W * W * 0.42) continue;
    if (ar < 0) tri = [tri[0], tri[2], tri[1]];
    let ok = true; const cov = new Set();
    for (let y = 0; y < W && ok; y++) for (let x = 0; x < W; x++) {
      const p = [x + 0.5, y + 0.5];
      if (triDist(...tri, p) < 0.13) { ok = false; break; }
      if (inTri(...tri, p)) cov.add(x + ',' + y);
    }
    if (!ok || cov.size < 3) continue;
    return { W, tri, cov };
  }
  return { W: 5, tri: [[0.3, 0.4], [4.6, 1.2], [1.6, 4.7]], cov: (() => { const s = new Set(); for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (inTri([0.3, 0.4], [4.6, 1.2], [1.6, 4.7], [x + 0.5, y + 0.5])) s.add(x + ',' + y); return s; })() };
}
/** Does the triangle overlap cell (x,y) at all? (dense sampling) */
function touches(tri, x, y) {
  for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) if (inTri(...tri, [x + i / 10, y + j / 10])) return true;
  return false;
}

/** Real GPU triangle: the quad's 4 vertices are moved so that one triangle remains. Vertex colours ride in `normal`. */
const GPU_TRI_VERT = `// pick a corner by the quad's uv: (0,0)->A, (1,0)->B, (0,1)/(1,1)->C
bool isB = uv.x > 0.5 && uv.y < 0.5;
bool isC = uv.y > 0.5;
pos = vec3(isB ? uB : (isC ? uC : uA), 0.0);
normal = isB ? uColB : (isC ? uColC : uColA); // vertex colour (smuggled in the normal)`;
const gpuTri = (A, B, C, cols = RGB, extra = '') => ({
  vert: GPU_TRI_VERT,
  frag: 'col = vNormal; // the GPU interpolated this for us' + extra,
  uniforms: { uA: A, uB: B, uC: C, uColA: cols[0], uColB: cols[1], uColC: cols[2] },
});

/** Analytic barycentric triangle on the quad (uv space). Used for tap/mcq games. */
const BARY_DEFS = 'float edgeFn(vec2 a, vec2 b, vec2 p){ return (b.x-a.x)*(p.y-a.y) - (b.y-a.y)*(p.x-a.x); }';
const baryShader = (A, B, C, cols, mark) => ({
  defs: BARY_DEFS,
  frag: `float ar = edgeFn(uA, uB, uC);
vec3 w = vec3(edgeFn(uB, uC, uv), edgeFn(uC, uA, uv), edgeFn(uA, uB, uv)) / ar;
if (min(w.x, min(w.y, w.z)) < 0.0) col = vec3(0.07, 0.075, 0.1);
else col = w.x * uCA + w.y * uCB + w.z * uCC;
${mark ? 'float r = abs(length(uv - uM) - 0.035);\ncol = mix(col, vec3(1.0), smoothstep(0.008, 0.003, r));\ncol = mix(col, vec3(0.0), smoothstep(0.004, 0.0, abs(r - 0.008)));' : ''}`,
  uniforms: { uA: A, uB: B, uC: C, uCA: cols[0], uCB: cols[1], uCC: cols[2], ...(mark ? { uM: mark } : {}) },
});

// ====================================================================== stages
const STAGES = [
  { name: 'CPU: draw call', prog: false, desc: 'The CPU gathers a mesh (vertex buffer), a material (shader + textures) and uniforms, then says <b>"draw!"</b>.' },
  { name: 'Vertex shader', prog: true, desc: 'Runs <b>once per vertex</b>. Moves each vertex from object space to the screen (clip space) and passes data (uv, colour, normal) along.' },
  { name: 'Primitive assembly', prog: false, desc: 'Groups vertices in threes to form <b>triangles</b> (using the index buffer). Clipping cuts away parts outside the view.' },
  { name: 'Rasterization', prog: false, desc: 'Finds which <b>pixels</b> each triangle covers (pixel centre inside?) and creates a <b>fragment</b> for each.' },
  { name: 'Fragment shader', prog: true, desc: 'Runs <b>once per fragment</b>. Gets interpolated varyings (uv…) and outputs a colour.' },
  { name: 'Depth test & blending', prog: false, desc: 'Keep the fragment only if it is <b>closer</b> than what is stored. Then write or <b>blend</b> it with the existing colour.' },
  { name: 'Framebuffer', prog: false, desc: 'The final image in memory. When the frame is done it is <b>shown on screen</b>.' },
];

function stageVisual(el, k) {
  const c = canvas2d(300, 180);
  const { ctx } = c;
  const S = 20, GW = 15, GH = 9; // 15×9 grid of 20px "pixels"
  const T = [[2.3, 1.2], [13.2, 2.6], [6.4, 8.3]]; // grid units, y up
  const P = (p) => [p[0] * S, (GH - p[1]) * S];
  const wallX = 4; // a grey wall covering x < 4, closer than the triangle
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 180);
  ctx.font = '12px ui-monospace, Menlo, monospace';
  const grid = () => {
    ctx.strokeStyle = '#22252f'; ctx.lineWidth = 1;
    for (let x = 0; x <= GW; x++) { ctx.beginPath(); ctx.moveTo(x * S, 0); ctx.lineTo(x * S, GH * S); ctx.stroke(); }
    for (let y = 0; y <= GH; y++) { ctx.beginPath(); ctx.moveTo(0, y * S); ctx.lineTo(300, y * S); ctx.stroke(); }
  };
  const outline = () => { const [a, b, cc] = T.map(P); ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...cc); ctx.closePath(); ctx.stroke(); };
  const dots = () => T.forEach((v, i) => { const p = P(v); ctx.fillStyle = css(RGB[i]); ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fill(); });
  const cells = (fn, cs = S) => {
    const n2 = S / cs;
    for (let y = 0; y < GH * n2; y++) for (let x = 0; x < GW * n2; x++) {
      const p = [(x + 0.5) / n2, (y + 0.5) / n2];
      const col = fn(p); if (!col) continue;
      ctx.fillStyle = col; ctx.fillRect(x * cs, (GH * n2 - 1 - y) * cs, cs, cs);
    }
  };
  const triCol = (p) => (inTri(...T, p) ? css(mixC(RGB, baryW(...T, p))) : null);
  if (k === 0) {
    ctx.fillStyle = '#ffd479'; ctx.fillText('draw( mesh, material )', 14, 26);
    ctx.fillStyle = '#c7b8ff';
    ['vertex 0: pos(-0.7,-0.8) red', 'vertex 1: pos( 0.8,-0.6) green', 'vertex 2: pos(-0.1, 0.9) blue', 'uniforms: uTime, uTint …', 'shader + textures'].forEach((s, i) => ctx.fillText(s, 14, 56 + i * 22));
  } else if (k === 1) {
    grid();
    const obj = [[1, 1], [5, 1.6], [2.6, 4.4]];
    T.forEach((v, i) => {
      const a = P(obj[i]), b = P(v);
      ctx.strokeStyle = '#6c7289'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#4a4f63'; ctx.beginPath(); ctx.arc(a[0], a[1], 4, 0, 7); ctx.fill();
    });
    dots();
    ctx.fillStyle = '#9aa0b4'; ctx.fillText('object space → screen', 170, 172);
  } else if (k === 2) { grid(); outline(); dots(); }
  else if (k === 3) { cells((p) => (inTri(...T, p) ? '#5b6078' : null)); grid(); outline(); }
  else if (k === 4) { cells(triCol); grid(); outline(); }
  else if (k === 5) {
    cells((p) => (p[0] < wallX ? '#8a8f9e' : triCol(p))); grid();
    ctx.fillStyle = '#fff'; ctx.fillText('wall is closer → those', 120, 160); ctx.fillText('triangle pixels are rejected', 120, 174);
  } else {
    cells((p) => (p[0] < wallX ? '#8a8f9e' : triCol(p)), 2);
  }
  const list = h('div', { style: { display: 'grid', gap: '3px', margin: '8px 0' } });
  STAGES.forEach((s, i) => list.append(h('div', {
    style: { padding: '5px 10px', borderRadius: '8px', fontSize: '14px', background: i === k ? '#7c6cff' : '#1d1f29', color: i === k ? '#fff' : i < k ? '#c9c2ff' : '#6c7289' },
    html: `${i + 1}. ${s.name}${s.prog ? ' <span title="you write this">✏️</span>' : ''}`,
  })));
  el.append(c.el, h('p', { html: `<b>${STAGES[k].name}.</b> ${STAGES[k].desc}` }), list);
}

// ====================================================================== depth helpers
const COLS = { red: [0.95, 0.3, 0.3], green: [0.3, 0.85, 0.4], blue: [0.3, 0.5, 1], yellow: [1, 0.85, 0.2], purple: [0.7, 0.4, 1], orange: [1, 0.6, 0.2] };
const CNAMES = Object.keys(COLS);
const sw = (c) => `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;background:${css(c)}"></span>`;

// ====================================================================== topic
export default {
  id: 'pipeline',
  title: 'The rendering pipeline',
  icon: '🏭',
  blurb: 'The assembly line that turns a draw call into pixels: vertices → triangles → fragments → screen.',
  cheatsheet: `
<p><b>The pipeline</b> (per draw call):</p>
<ol>
<li><b>CPU draw call</b>: mesh + material + uniforms → "draw!"</li>
<li><b>Vertex shader</b> ✏️ once per vertex → clip-space position + varyings</li>
<li><b>Primitive assembly</b> (+ clipping): vertices → triangles</li>
<li><b>Rasterization</b>: which pixel <i>centres</i> are inside each triangle → fragments</li>
<li><b>Fragment shader</b> ✏️ once per fragment → colour (and alpha)</li>
<li><b>Depth test & blending</b>: keep if closer; write or blend</li>
<li><b>Framebuffer</b> → screen</li>
</ol>
<p><b>Interpolation</b>: each varying at a pixel = <code>wA·A + wB·B + wC·C</code>, the barycentric weights (≥ 0, sum to 1). That's why uv is smooth.</p>
<p><b>Depth test</b>: <code>if (zNew &lt; zStored) { write colour; zStored = zNew; }</code>. Opaque objects can be drawn in any order. Z-fighting = two surfaces too close for the depth precision.</p>
<p><b>Draw calls</b> cost CPU time each. Batch / instance objects that share a mesh + material.</p>`,
  concepts: [
    // ------------------------------------------------------------------ 1
    {
      id: 'pipeline.stages',
      title: 'The assembly line',
      blurb: 'The stages between "draw this" and a finished pixel.',
      lesson: [
        {
          title: 'A factory for pictures',
          body: `<p>So far you have written fragment shaders: "what colour is this pixel?". But where do the pixels come from? Who decided that a sphere covers <i>these</i> pixels and not others?</p>
<p>The answer is the <b>rendering pipeline</b>: a fixed sequence of stages the GPU runs every time something is drawn.</p>
<div class="analogy">🏭 <b>Analogy:</b> a car factory. Raw parts come in at one end, each station does one job, and a finished car rolls out at the other end. Some stations you can <b>reprogram</b> (the shaders ✏️), others are <b>fixed machines</b> you can only configure.</div>`,
        },
        {
          title: 'Walk down the line',
          body: '<p>Drag the slider to walk one triangle through all seven stations. Watch what the data looks like at each step.</p>',
          controls: [{ name: 's', label: 'stage', min: 0, max: 6, step: 1, value: 0, fmt: (x) => `${x + 1} / 7` }],
          visual: (el, v) => stageVisual(el, v.s),
          after: '<div class="note">Only two stations are code you write: the <b>vertex shader</b> and the <b>fragment shader</b> (✏️). Everything else is done by fixed hardware.</div>',
        },
        {
          title: 'Data shrinks, then explodes',
          body: `<p>Notice how the <b>amount of work</b> changes along the line:</p>
<ul>
<li>A triangle has only <b>3 vertices</b> → the vertex shader runs 3 times.</li>
<li>That same triangle may cover <b>thousands of pixels</b> → the fragment shader runs thousands of times.</li>
</ul>
<p>The rasterizer is the "multiplier" in the middle: it turns a handful of vertices into a flood of fragments.</p>
<div class="note">A <b>fragment</b> is a "candidate pixel": the data for one pixel of one triangle. It only becomes a real pixel if it survives the depth test.</div>`,
        },
        {
          title: 'Fixed but configurable',
          body: `<p>The fixed stages can't run your code, but they have <b>settings</b>, the same switches you see in a material's options:</p>
<ul>
<li><b>Culling</b>: skip triangles facing away from the camera (backface culling).</li>
<li><b>Depth test</b>: on/off, "less" / "less-equal", depth write on/off.</li>
<li><b>Blending</b>: opaque, alpha, additive, multiply…</li>
</ul>
<div class="tip">In Unity ShaderLab these are lines like <code>Cull Back</code>, <code>ZWrite Off</code>, <code>ZTest LEqual</code>, <code>Blend SrcAlpha OneMinusSrcAlpha</code>. In Unreal they are the material's <i>Blend Mode</i>, <i>Two Sided</i>, and <i>Disable Depth Test</i> options.</div>`,
          quiz: { q: 'Which two stages run code that you write?', options: ['Vertex shader and fragment shader', 'Rasterization and blending', 'Draw call and framebuffer'], answer: 0, explain: 'Those are the programmable stages. The rest is fixed-function hardware with settings.' },
        },
      ],
      games: [
        {
          id: 'stage-order', title: 'Build the assembly line', engine: 'order', rounds: 4,
          blurb: 'Put the pipeline stages in the right order.',
          gen: (rng, level) => {
            const full = STAGES.map((s) => s.name);
            const L3 = [
              { items: ['CPU: draw call', 'Vertex shader', 'Primitive assembly', 'Clipping', 'Perspective divide & viewport', 'Rasterization', 'Fragment shader', 'Depth test', 'Blending', 'Framebuffer'], prompt: 'The detailed pipeline — order all ten steps:', explain: 'Clipping and the perspective divide happen right after triangles are assembled, before rasterization. Depth test happens before blending: only surviving fragments are blended.' },
              { items: ['Interpolate varyings (uv, normal…)', 'Run the fragment shader', 'Depth test', 'Blend with the colour already there', 'Write to the framebuffer'], prompt: 'The life of one fragment — order it:', explain: 'The fragment receives interpolated data, computes its colour, then the fixed stages decide whether and how it lands.' },
              { items: ['Read attributes from the vertex buffer', 'Vertex shader multiplies by the MVP matrix', 'Output gl_Position and varyings', 'Assemble triangles', 'Perspective divide (x/w, y/w)', 'Viewport transform to pixel coordinates'], prompt: 'The life of one vertex — order it:', explain: 'The vertex shader outputs clip space. The divide by w and the mapping to pixels are done by fixed hardware afterwards.' },
            ];
            if (level === 3) { const v = rng.pick(L3); return { prompt: v.prompt, items: v.items, explain: v.explain }; }
            const k = level === 1 ? 4 : 6;
            const keep = new Set([1, 4]);
            const others = rng.shuffle([0, 2, 3, 5, 6]).slice(0, k - 2);
            others.forEach((i) => keep.add(i));
            const items = full.filter((_, i) => keep.has(i));
            return {
              prompt: 'Order these stages from first to last:',
              sub: level === 1 ? 'Hint: vertices are handled before pixels.' : '',
              items,
              explain: '<p>CPU draw call → vertex shader → primitive assembly → rasterization → fragment shader → depth test & blending → framebuffer.</p><p>Memory trick: <b>where</b> first (vertices), then <b>which pixels</b>, then <b>what colour</b>, then <b>keep it?</b></p>',
            };
          },
        },
        {
          id: 'prog-or-fixed', title: 'Programmable or fixed?', engine: 'buckets', rounds: 2,
          blurb: 'Is this something you write code for, or a fixed hardware step you only configure?',
          gen: () => ({
            prompt: 'Do you write shader code for this, or is it fixed hardware?',
            buckets: ['✏️ Your code', '⚙️ Fixed (settings only)'],
            count: 10,
            items: [
              { text: 'Moving vertices to make a flag wave', bucket: 0, why: 'Vertex shader.' },
              { text: 'Deciding which pixels a triangle covers', bucket: 1, why: 'Rasterization is fixed hardware.' },
              { text: 'Choosing a pixel\'s colour from a texture', bucket: 0, why: 'Fragment shader.' },
              { text: 'Throwing away fragments hidden behind closer ones', bucket: 1, why: 'The depth test. You only switch it on/off or pick the comparison.' },
              { text: 'Mixing a transparent pixel with the colour behind it', bucket: 1, why: 'Blending is fixed-function; you pick the blend mode.' },
              { text: 'Blending vertex values across the triangle (interpolation)', bucket: 1, why: 'The rasterizer interpolates varyings for you.' },
              { text: 'Grouping vertices into triangles', bucket: 1, why: 'Primitive assembly, using the index buffer.' },
              { text: 'Computing lighting per pixel', bucket: 0, why: 'Fragment shader.' },
              { text: 'Cutting off triangle parts outside the screen', bucket: 1, why: 'Clipping is automatic.' },
              { text: 'Transforming vertices with the MVP matrix', bucket: 0, why: 'You write that line in the vertex shader.' },
              { text: 'Skipping triangles that face away (backface culling)', bucket: 1, why: 'A setting: Cull Back / Front / Off.' },
              { text: 'Making a dissolve effect with discard', bucket: 0, why: 'discard is a fragment shader instruction.' },
              { text: 'Dividing by w (perspective divide)', bucket: 1, why: 'Done automatically after the vertex shader.' },
            ],
          }),
        },
        {
          id: 'stage-quiz', title: 'Which station?', engine: 'mcq', rounds: 8,
          blurb: 'Name the stage that does the job, or what comes next.',
          gen: (rng, level) => {
            if (rng.chance(0.4)) {
              const i = rng.int(0, STAGES.length - 2);
              const before = rng.chance(0.5) && i > 0;
              const ask = before ? i : i;
              const correct = before ? STAGES[i - 1].name : STAGES[i + 1].name;
              const opts = distinct(rng, correct, () => rng.pick(STAGES).name, 4).filter((x, k) => k === 0 || x !== STAGES[ask].name);
              while (opts.length < 3) opts.push(rng.pick(STAGES.filter((s) => !opts.includes(s.name) && s.name !== STAGES[ask].name)).name);
              return q(`Which stage comes directly <b>${before ? 'before' : 'after'}</b> "${STAGES[ask].name}"?`, opts, `<p>Order: ${STAGES.map((s) => s.name).join(' → ')}.</p>`);
            }
            const bank = [
              ['Which stage decides which pixels a triangle covers?', 'Rasterization', 'It tests each pixel centre against the triangle edges.'],
              ['Which stage runs once for every corner of every triangle?', 'Vertex shader', 'One invocation per vertex.'],
              ['Which stage runs once per covered pixel?', 'Fragment shader', 'Per fragment = per covered pixel (per triangle).'],
              ['Where is a semi-transparent pixel mixed with the colour behind it?', 'Depth test & blending', 'Blending happens after the fragment shader, using the colour already in the framebuffer.'],
              ['Which stage turns vertices into triangles?', 'Primitive assembly', 'It reads the index buffer in groups of three.'],
              ['Where does the image live while the frame is being drawn?', 'Framebuffer', 'A block of GPU memory: colour (and depth) per pixel.'],
              ['Which stage hands the GPU a mesh, material and uniforms?', 'CPU: draw call', 'The CPU prepares everything and issues the draw call.'],
              ['A pixel of a wall is hidden behind a crate. Which stage throws it away?', 'Depth test & blending', 'The depth test compares its depth with what\'s stored and rejects it.'],
              ['Which stage could make a flag wave by moving its vertices?', 'Vertex shader', 'Moving geometry = vertex shader.'],
              ['Which stage could tint a texture red?', 'Fragment shader', 'Per-pixel colour = fragment shader.'],
            ];
            const [p, a, e] = rng.pick(bank);
            const opts = distinct(rng, a, () => rng.pick(STAGES).name, 4);
            return q(p, opts, e);
          },
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'pipeline.jobs',
      title: 'Vertex vs fragment: who does what?',
      blurb: '"Where is it?" versus "what colour is it?" — and how often each one runs.',
      lesson: [
        {
          title: 'Two programs, two questions',
          body: `<p>Every material is really <b>two</b> shaders working as a team:</p>
<ul>
<li>The <b>vertex shader</b> answers: <i>"<b>Where</b> on screen does this corner go?"</i></li>
<li>The <b>fragment shader</b> answers: <i>"What <b>colour</b> is this pixel?"</i></li>
</ul>
<div class="analogy">🎨 <b>Analogy:</b> a connect-the-dots colouring book. The vertex shader places the <b>dots</b>. The rasterizer draws the lines between them. The fragment shader <b>colours in</b> every little square inside.</div>`,
          shaders: [
            { spec: { mesh: 'sphere', wire: true, frag: 'col = vec3(0.6, 0.8, 1.0);', camera: { spin: 0.4 } }, label: 'vertex shader: <b>where</b> the corners go' },
            { spec: { mesh: 'sphere', frag: 'vec3 L = normalize(vec3(1.0, 1.0, 0.6));\ncol = vec3(1.0, 0.55, 0.3) * (0.15 + max(dot(N, L), 0.0));', camera: { spin: 0.4 } }, label: 'fragment shader: <b>what colour</b> each pixel is' },
          ],
        },
        {
          title: 'What each one sees',
          body: `<p>Both run in parallel and see only their own little piece:</p>
<ul>
<li>The <b>vertex shader</b> sees <b>one vertex</b>: its attributes (position, normal, uv, colour) plus uniforms. It does not know which pixels it will touch.</li>
<li>The <b>fragment shader</b> sees <b>one fragment</b>: the varyings interpolated for that pixel plus uniforms and textures. It can't move itself to another pixel.</li>
</ul>
<pre class="code">// vertex shader: once per vertex
attribute vec3 aPos; attribute vec2 aUv;
varying vec2 vUv;              // ← handed to the fragment shader
void main() {
  vUv = aUv;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
// fragment shader: once per pixel
varying vec2 vUv;              // ← arrives interpolated
void main() { gl_FragColor = texture2D(uTex, vUv); }</pre>
<div class="note">The <b>varying</b> is the hand-off: the vertex shader writes it per vertex, the fragment shader reads a blended value per pixel.</div>`,
        },
        {
          title: 'How often does each one run?',
          body: `<p>The sphere mesh below has <b>1,617 vertices</b>. That count never changes. But the number of <b>pixels</b> it covers depends on how big it is on screen.</p>
<p>Move it closer and watch the fragment count explode (estimated for an iPhone-width screen of 1170 pixels).</p>`,
          controls: [{ name: 'd', label: 'camera distance', min: 1.6, max: 8, step: 0.1, value: 3.2 }],
          shader: (v) => ({ mesh: 'sphere', frag: 'vec3 L = normalize(vec3(1.0, 1.0, 0.6));\ncol = vec3(0.4, 0.7, 1.0) * (0.15 + max(dot(N, L), 0.0));', camera: { dist: v.d } }),
          code: (v) => {
            const rN = 1 / Math.sqrt(v.d * v.d - 1) / Math.tan(0.4); // projected radius in NDC
            const rPx = Math.min(rN, 1.6) * 585;
            const px = Math.round(Math.PI * rPx * rPx);
            return `vertex shader runs:   1,617 times (always)\nfragment shader runs: ≈ ${px.toLocaleString('en-US')} times\nratio: ≈ ${Math.round(px / 1617)} pixels per vertex`;
          },
          after: '<div class="note">For most objects, the <b>fragment shader runs far more often</b>. That\'s why heavy maths is usually cheaper per vertex than per pixel (see the Performance topic).</div>',
        },
        {
          title: 'Choosing the right home for code',
          body: `<p>A quick way to decide where a piece of code belongs:</p>
<ul>
<li>Does it <b>change the shape or position</b> of the object? → <b>vertex shader</b> (waves, wind, skinning, billboards).</li>
<li>Does it decide <b>colour, texture or per-pixel detail</b>? → <b>fragment shader</b> (texturing, normal maps, dissolve, lighting detail).</li>
<li>Is it the <b>same for the whole object</b>? → compute it once on the <b>CPU</b> and pass a uniform.</li>
</ul>
<div class="tip">In Unreal, <i>World Position Offset</i> is the vertex shader's job; <i>Base Color</i>, <i>Roughness</i>, <i>Normal</i> are fragment work. In Shader Graph the "Vertex" block and "Fragment" block are literally separated.</div>`,
          quiz: { q: 'You want grass blades to bend in the wind. Which shader?', options: ['Vertex shader — it moves geometry', 'Fragment shader — it colours pixels', 'Neither, it must be done on the CPU'], answer: 0, explain: 'Bending = moving vertices. The fragment shader can\'t change where a pixel is.' },
        },
      ],
      games: [
        {
          id: 'vert-or-frag', title: 'Vertex or fragment?', engine: 'buckets', rounds: 2,
          blurb: 'Sort jobs into the shader that should do them.',
          gen: () => ({
            prompt: 'Which shader does this job?',
            sub: 'Vertex = where (shape, position). Fragment = what colour (per pixel).',
            buckets: ['📐 Vertex', '🎨 Fragment'],
            count: 10,
            items: [
              { text: 'Make a flag wave', bucket: 0 },
              { text: 'Sample the albedo texture', bucket: 1 },
              { text: 'Bend a character\'s arm with bones (skinning)', bucket: 0, why: 'Skinning moves vertices.' },
              { text: 'Apply a normal map', bucket: 1, why: 'Normal maps add per-pixel detail.' },
              { text: 'Turn a particle quad to face the camera', bucket: 0, why: 'Billboarding positions the corners.' },
              { text: 'Dissolve an object with noise + discard', bucket: 1, why: 'discard kills individual pixels.' },
              { text: 'Inflate a mesh along its normals', bucket: 0 },
              { text: 'Draw a sharp specular highlight', bucket: 1, why: 'Sharp details need per-pixel evaluation.' },
              { text: 'Project positions with the MVP matrix', bucket: 0 },
              { text: 'Tint the colour by a rim/fresnel term', bucket: 1 },
              { text: 'Make ocean waves move the surface up and down', bucket: 0 },
              { text: 'Draw a procedural checker pattern', bucket: 1 },
              { text: 'Sway tree leaves using a vertex-colour mask', bucket: 0, why: 'The mask is per vertex, the motion is geometry.' },
              { text: 'Output alpha for a soft particle edge', bucket: 1 },
            ],
          }),
        },
        {
          id: 'count-runs', title: 'Count the invocations', engine: 'numeric', rounds: 5,
          blurb: 'How many times does each shader run?',
          gen: (rng, level) => {
            const meshes = [{ n: 'a quad', v: 4 }, { n: 'a cube (24 vertices: 4 per face)', v: 24 }, { n: 'a triangle', v: 3 }, { n: 'a 10×10-vertex grid', v: 100 }];
            const m = rng.pick(meshes);
            const w = rng.pick(level === 1 ? [10, 20, 100] : [40, 50, 120, 200, 300]);
            const hh = rng.pick(level === 1 ? [10, 20, 30] : [25, 30, 60, 80, 100]);
            const askVert = rng.chance(0.35);
            if (level === 3 && rng.chance(0.5)) {
              const k = rng.int(2, 4);
              return {
                prompt: `${k} identical opaque quads, each covering ${w}×${hh} pixels, are drawn <b>exactly on top of each other</b>, back to front. How many times does the fragment shader run in total?`,
                sub: 'Drawn back to front, every layer passes the depth test (each is closer than the one before).',
                answer: k * w * hh,
                explain: `<p>Each layer is closer than the previous one, so each one is shaded: ${k} × ${w} × ${hh} = <b>${k * w * hh}</b>. Only ${w * hh} pixels are visible at the end — the rest is wasted work called <b>overdraw</b>. Drawing front to back would let the depth test reject the hidden layers early.</p>`,
              };
            }
            if (askVert) {
              return {
                prompt: `You draw ${m.n}. It covers ${w}×${hh} pixels on screen. How many times does the <b>vertex shader</b> run?`,
                answer: m.v,
                explain: `<p>The vertex shader runs once per vertex: <b>${m.v}</b>. The screen size doesn't matter to it at all.</p>`,
              };
            }
            return {
              prompt: `You draw ${m.n}. It covers a ${w}×${hh} pixel area on screen (nothing else there). How many times does the <b>fragment shader</b> run?`,
              answer: w * hh,
              explain: `<p>Once per covered pixel: ${w} × ${hh} = <b>${w * hh}</b>. The number of vertices (${m.v}) doesn't matter here — that's the vertex shader's count.</p>`,
            };
          },
        },
        {
          id: 'jobs-quiz', title: 'Team roles', engine: 'mcq', rounds: 7,
          blurb: 'Concept questions about the vertex/fragment partnership.',
          questions: [
            q('What does the vertex shader <b>must</b> output?', ['A clip-space position (gl_Position)', 'A pixel colour', 'A texture'], 'gl_Position is required. Varyings (uv, normal…) are optional extras.'),
            q('How does the fragment shader get the uv?', ['Through a varying, interpolated from the vertices', 'It reads the vertex buffer directly', 'From the CPU every pixel'], 'The vertex shader writes vUv per vertex; the rasterizer blends it per pixel.'),
            tf('A fragment shader can change the position of its pixel.', false, 'Its position is fixed by the rasterizer. It can only colour it (or discard it).'),
            tf('A vertex shader knows the final colour of the pixels around it.', false, 'Vertices are processed before any pixel exists.'),
            tf('For a big object on screen, the fragment shader usually runs many more times than the vertex shader.', true, 'Thousands of pixels vs a few thousand vertices — often 100× more.'),
            tf('A tiny far-away object with 50,000 vertices covering 20 pixels runs the vertex shader more often.', true, '50,000 vertex runs vs ~20 fragment runs. That\'s why LODs (simpler far meshes) exist.', 2),
            q('Where should "move the vertex up by sin(time)" go?', ['Vertex shader', 'Fragment shader', 'Blending settings'], 'Changing positions = vertex shader.'),
            q('Where should "multiply the colour by a texture" go?', ['Fragment shader', 'Vertex shader', 'Primitive assembly'], 'Texturing is per pixel.'),
            q('What is a <b>varying</b>?', ['A value written per vertex and read (interpolated) per pixel', 'A value that is the same for every pixel', 'A texture'], 'Uniform = same for all. Varying = vertex → pixel hand-off.'),
            tf('The vertex shader runs again for every pixel of the triangle.', false, 'It runs once per vertex. Its outputs are interpolated for the pixels.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'pipeline.raster',
      title: 'Rasterization: which pixels?',
      blurb: 'Turning a perfect mathematical triangle into a staircase of pixels.',
      lesson: [
        {
          title: 'Perfect shape, square pixels',
          body: `<p>After the vertex shader, a triangle is just <b>three exact points</b> on the screen. But the screen is a grid of square pixels. Which squares should light up?</p>
<p>The <b>rasterizer</b> answers that for every pixel with a simple yes/no question.</p>
<div class="analogy">🧵 <b>Analogy:</b> cross-stitch. You have a smooth drawing, but the cloth is a grid. You must decide for each little square: stitch it or not?</div>
<p>Drag the resolution: more pixels = a closer match to the real shape.</p>`,
          controls: [{ name: 'n', label: 'pixels per side', min: 4, max: 24, step: 1, value: 8 }],
          visual: (el, v) => {
            const c = canvas2d(300, 300); const N = v.n;
            const T = [[0.08 * N, 0.1 * N], [0.92 * N, 0.33 * N], [0.38 * N, 0.92 * N]];
            drawRaster(c.ctx, 300, N, N, T, { cellFill: (x, y) => (inTri(...T, [x + 0.5, y + 0.5]) ? '#5b6078' : null) });
            el.append(c.el);
          },
        },
        {
          title: 'The rule: is the pixel CENTRE inside?',
          body: `<p>The rasterizer does <b>not</b> ask "does the triangle touch this pixel?". It asks: <b>"is this pixel's centre inside the triangle?"</b></p>
<p>Green dots = centres inside → a fragment is created → the fragment shader runs. Grey dots = skipped, even if the triangle covers a big part of that square!</p>
<p>Slide the top vertex sideways and watch pixels pop on and off as the edge crosses their centres.</p>`,
          controls: [{ name: 'x', label: 'top vertex x', min: 0.5, max: 7.5, step: 0.05, value: 3.2 }],
          visual: (el, v) => {
            const c = canvas2d(300, 300); const N = 8;
            const T = [[0.6, 0.7], [7.4, 2.2], [v.x, 7.4]];
            let k = 0;
            drawRaster(c.ctx, 300, N, N, T, {
              cellFill: (x, y) => (inTri(...T, [x + 0.5, y + 0.5]) ? '#3a4a40' : null),
              centres: true, centreColor: (x, y) => (inTri(...T, [x + 0.5, y + 0.5]) ? (k++, '#3ddc97') : '#4a4f63'),
            });
            el.append(c.el, h('p.center', { html: `<b>${k}</b> of 64 pixels get a fragment` }));
          },
          after: '<div class="note">Why centres? It gives a clear, consistent rule: two triangles sharing an edge never both claim a pixel, and never leave a gap between them.</div>',
        },
        {
          title: 'How the GPU tests "inside"',
          body: `<p>For each edge, the GPU computes an <b>edge function</b>: a 2D cross product that tells you which <b>side</b> of the edge a point is on (positive = left side, negative = right side).</p>
<p>Walk around the triangle counter-clockwise. A point is inside if it's on the <b>left of all three edges</b>.</p>`,
          controls: [
            { name: 'px', label: 'point x', min: 0, max: 1, step: 0.01, value: 0.45 },
            { name: 'py', label: 'point y', min: 0, max: 1, step: 0.01, value: 0.4 },
          ],
          visual: (el, v) => {
            const c = canvas2d(300, 240); const { ctx } = c;
            const A = [0.1, 0.12], B = [0.9, 0.3], C = [0.4, 0.92], p = [v.px, v.py];
            const X = (q2) => [q2[0] * 300, 240 - q2[1] * 240];
            const e = [edgeF(A, B, p), edgeF(B, C, p), edgeF(C, A, p)];
            const cols = ['#ff7ab2', '#6bdfff', '#ffd479'];
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 240);
            [[A, B], [B, C], [C, A]].forEach(([a, b], i) => { ctx.strokeStyle = cols[i]; ctx.lineWidth = e[i] >= 0 ? 3 : 1.5; ctx.setLineDash(e[i] >= 0 ? [] : [5, 4]); ctx.beginPath(); ctx.moveTo(...X(a)); ctx.lineTo(...X(b)); ctx.stroke(); });
            ctx.setLineDash([]);
            ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff';
            [['A', A], ['B', B], ['C', C]].forEach(([l, q2]) => { const [x, y] = X(q2); ctx.fillText(l, x + 6, y - 4); });
            const inside = e.every((x) => x >= 0);
            const [px, py] = X(p); ctx.fillStyle = inside ? '#3ddc97' : '#ff5c6c'; ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
            el.append(c.el);
            el.append(h('pre.code.wrap', { html: `edge(A→B, P) = <span style="color:${cols[0]}">${e[0].toFixed(3)}</span> ${e[0] >= 0 ? '✅' : '❌'}\nedge(B→C, P) = <span style="color:${cols[1]}">${e[1].toFixed(3)}</span> ${e[1] >= 0 ? '✅' : '❌'}\nedge(C→A, P) = <span style="color:${cols[2]}">${e[2].toFixed(3)}</span> ${e[2] >= 0 ? '✅' : '❌'}\ninside = ${inside}` }));
          },
          code: 'float edge(vec2 a, vec2 b, vec2 p) {\n  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);\n}\nbool inside = edge(A,B,P) >= 0.0 && edge(B,C,P) >= 0.0 && edge(C,A,P) >= 0.0;',
          after: '<div class="tip">Hardware evaluates this for blocks of pixels at once, and it\'s cheap: the edge value changes by a constant amount per pixel step, so it\'s just additions.</div>',
        },
        {
          title: 'Jaggies and anti-aliasing',
          body: `<p>One yes/no per pixel gives hard staircase edges ("jaggies"). <b>MSAA</b> (multi-sample anti-aliasing) tests <b>several sample points</b> per pixel and records <i>how many</i> are inside. The edge pixel gets a partial blend.</p>
<p>Toggle 4× MSAA: edge pixels now have in-between shades.</p>`,
          controls: [{ name: 'm', label: 'MSAA (0 = off, 1 = 4 samples)', min: 0, max: 1, step: 1, value: 0 }],
          visual: (el, v) => {
            const c = canvas2d(300, 300); const N = 10;
            const T = [[0.7, 0.9], [9.3, 3.1], [3.6, 9.4]];
            const S = v.m ? [[0.375, 0.125], [0.875, 0.375], [0.125, 0.625], [0.625, 0.875]] : [[0.5, 0.5]];
            drawRaster(c.ctx, 300, N, N, null, {
              cellFill: (x, y) => { const k = S.filter((s) => inTri(...T, [x + s[0], y + s[1]])).length / S.length; return k ? css([0.35 + 0.6 * k, 0.4 + 0.5 * k, 0.5 + 0.45 * k].map((c2, i) => [0.055, 0.06, 0.08][i] * (1 - k) + c2 * k)) : null; },
            });
            const s = 30; const ctx = c.ctx;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const sp of S) {
              ctx.fillStyle = inTri(...T, [x + sp[0], y + sp[1]]) ? '#3ddc97' : '#3a3f55';
              ctx.beginPath(); ctx.arc((x + sp[0]) * s, 300 - (y + sp[1]) * s, 2, 0, 7); ctx.fill();
            }
            el.append(c.el);
          },
          after: '<div class="note">With MSAA the fragment shader still usually runs <b>once per pixel</b>; only the coverage test is done per sample. That keeps it affordable.</div>',
          quiz: { q: 'A triangle covers 40% of a pixel\'s square, but not its centre. Without MSAA, is a fragment created?', options: ['No — only the centre counts', 'Yes — it touches the pixel', 'Yes, at 40% brightness'], answer: 0, explain: 'The rasterizer only tests the centre (one sample) when there is no multisampling.' },
        },
      ],
      games: [
        {
          id: 'rasterize-it', title: 'Be the rasterizer', engine: 'custom', rounds: 4,
          blurb: 'Tap every pixel whose centre is inside the triangle.',
          gen: (rng, level) => ({ ...rasterTri(rng, level), level }),
          play: ({ el, item, ui }) => new Promise((resolve) => {
            const { W, tri, cov } = item;
            el.append(ui.h('div.prompt', { html: 'Rasterize it! Tap every pixel whose <b>centre</b> is inside the triangle.<span class="sub">The dot in each square is its centre. Tap again to un-select.</span>' }));
            const size = 300; const c = canvas2d(size, size); const sel = new Set();
            let done = false;
            const draw = () => drawRaster(c.ctx, size, W, W, tri, {
              cellFill: (x, y) => {
                const k = x + ',' + y;
                if (!done) return sel.has(k) ? '#7c6cff' : null;
                if (sel.has(k) && cov.has(k)) return '#2f8a63';
                if (sel.has(k)) return '#a8384a';
                if (cov.has(k)) return '#806a2c';
                return null;
              },
              centres: true, centreColor: (x, y) => (done ? (cov.has(x + ',' + y) ? '#3ddc97' : '#4a4f63') : '#c9cde0'),
            });
            draw();
            c.el.style.touchAction = 'none';
            c.el.addEventListener('pointerdown', (ev) => {
              if (done) return;
              const r = c.el.getBoundingClientRect();
              const x = Math.floor(((ev.clientX - r.left) / r.width) * W), y = Math.floor((1 - (ev.clientY - r.top) / r.height) * W);
              if (x < 0 || y < 0 || x >= W || y >= W) return;
              const k = x + ',' + y; if (sel.has(k)) sel.delete(k); else sel.add(k); draw();
            });
            const btn = ui.h('button.btn.block', { style: { marginTop: '12px' } }, 'Rasterize ▶');
            el.append(c.el, btn);
            btn.onclick = () => {
              done = true; btn.disabled = true; draw();
              let right = 0;
              for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const k = x + ',' + y; if (sel.has(k) === cov.has(k)) right++; }
              const sc = right / (W * W);
              resolve({
                score: sc >= 0.999 ? 1 : sc * sc,
                answerText: `<p>${right}/${W * W} pixels right. Green = correctly picked, red = centre is outside, gold = missed.</p>`,
                explain: '<p>Only the <b>centre</b> matters. A square can be mostly covered and still be skipped, or barely covered and still be drawn, if the edge passes just past its centre.</p>',
              });
            };
          }),
        },
        {
          id: 'count-covered', title: 'Count the fragments', engine: 'numeric', rounds: 5,
          blurb: 'How many fragments will this triangle produce?',
          gen: (rng, level) => {
            const { W, tri, cov } = rasterTri(rng, level);
            return {
              prompt: 'How many fragments does the rasterizer create for this triangle?',
              sub: 'Count the pixel centres (dots) inside the yellow outline.',
              visual: (el) => { const c = canvas2d(260, 260); drawRaster(c.ctx, 260, W, W, tri, { centres: true, centreColor: () => '#c9cde0' }); el.append(c.el); },
              answer: cov.size,
              tolerance: 0.1,
              explain: (el) => {
                const c = canvas2d(200, 200);
                drawRaster(c.ctx, 200, W, W, tri, { cellFill: (x, y) => (cov.has(x + ',' + y) ? '#2f8a63' : null), centres: true, centreColor: (x, y) => (cov.has(x + ',' + y) ? '#3ddc97' : '#4a4f63') });
                el.append(c.el, h('p', { html: `<b>${cov.size}</b> centres are inside → ${cov.size} fragments → the fragment shader runs ${cov.size} times for this triangle.` }));
              },
            };
          },
        },
        {
          id: 'touched-not-drawn', title: 'Touched but skipped', engine: 'tap', rounds: 5,
          blurb: 'Find a pixel the triangle overlaps that still gets no fragment.',
          gen: (rng, level) => {
            for (let t = 0; t < 50; t++) {
              const { W, tri, cov } = rasterTri(rng, level);
              const odd = [];
              for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (!cov.has(x + ',' + y) && touches(tri, x, y)) odd.push([x, y]);
              if (!odd.length) continue;
              return {
                prompt: 'Tap a pixel that the triangle <b>overlaps</b>, but that gets <b>no fragment</b>.',
                sub: 'The triangle covers part of the square, but misses its centre dot.',
                draw: (ctx, w) => drawRaster(ctx, w, W, W, tri, { triFill: 'rgba(255,212,121,0.18)', centres: true, centreColor: () => '#c9cde0' }),
                score: (u, v) => { const x = Math.floor(u * W), y = Math.floor(v * W); return odd.some((o) => o[0] === x && o[1] === y) ? 1 : 0; },
                reveal: odd.slice(0, 8).map(([x, y]) => [(x + 0.5) / W, (y + 0.5) / W]),
                explain: `<p>There are <b>${odd.length}</b> such pixels here. The triangle paints over part of their square, yet the rasterizer skips them because their centre is outside. Without anti-aliasing, a triangle\'s outline is decided only by pixel centres.</p>`,
              };
            }
            return { prompt: 'Tap the centre of the image', draw: (ctx, w) => drawRaster(ctx, w, 4, 4, null, {}), target: [0.5, 0.5], explain: '' };
          },
        },
        {
          id: 'raster-quiz', title: 'Raster facts', engine: 'mcq', rounds: 7,
          blurb: 'True/false about rasterization.',
          questions: [
            tf('The rasterizer creates a fragment when the pixel\'s centre is inside the triangle.', true, 'That\'s the standard rule (without MSAA).'),
            tf('If a triangle touches any part of a pixel, the pixel is always drawn.', false, 'Only the centre (sample point) counts.'),
            tf('Two triangles sharing an edge can both create a fragment for the same pixel.', false, 'The "top-left rule" breaks ties so a shared-edge pixel belongs to exactly one triangle: no gaps, no double drawing.', 2),
            tf('Rasterization is programmable: you write it in GLSL.', false, 'It is fixed-function hardware.'),
            tf('A very thin triangle may produce zero fragments.', true, 'If it misses every pixel centre, nothing is drawn. Thin far-away geometry "sparkles" for this reason.', 2),
            tf('With 4× MSAA, the fragment shader usually still runs once per pixel.', true, 'Coverage is tested per sample; shading is usually done once per pixel.', 2),
            tf('Higher screen resolution = more pixel centres to test = more fragments.', true, 'Fragment count scales with resolution.'),
            q('Why are triangle edges jagged without anti-aliasing?', ['Each pixel is either fully in or fully out', 'The vertex shader rounds positions', 'Textures are low resolution'], 'One yes/no answer per pixel gives a staircase.'),
            q('What is an edge function?', ['A test of which side of an edge a point lies on', 'A function that blurs edges', 'The outline of a mesh in Blender'], 'Sign of a 2D cross product → left or right of the edge.'),
            q('A point gets edge values (+0.2, +0.1, −0.05). Is it inside?', ['No — one edge says it is outside', 'Yes — two of three are positive', 'Yes — the sum is positive'], 'All three must be ≥ 0.', { level: 2 }),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      id: 'pipeline.interp',
      title: 'Interpolation & barycentric coordinates',
      blurb: 'How values on three corners become a smooth value at every pixel.',
      lesson: [
        {
          title: 'Values live on corners',
          body: `<p>Vertices carry data: position, uv, normal, colour. But the fragment shader runs for pixels <i>between</i> the vertices. What value should those get?</p>
<p>The GPU <b>blends</b> the three corner values smoothly. Below is a <b>real GPU triangle</b>: the corners are red, green and blue — the GPU filled in everything else.</p>`,
          controls: [{ name: 'x', label: 'top vertex x', min: -0.9, max: 0.9, step: 0.01, value: 0 }],
          shader: (v) => gpuTri([-0.85, -0.8], [0.85, -0.65], [v.x, 0.85]),
          code: (v) => `// 3 vertices, each with a colour:\nA = (-0.85, -0.80)  colour (1.0, 0.2, 0.2)\nB = ( 0.85, -0.65)  colour (0.2, 1.0, 0.3)\nC = (${f(v.x, 2)},  0.85)  colour (0.25, 0.4, 1.0)\n// fragment shader:\ncol = vColor; // already blended per pixel!`,
          after: '<div class="note">You never wrote a blending formula. The hardware between the two shaders did it. That blending is called <b>interpolation</b>.</div>',
        },
        {
          title: 'Along one edge: just mix()',
          body: `<p>Start simple: a point on the edge from A (red) to B (green). Its colour is exactly the <code>mix()</code> you know:</p>
<pre class="code">colour = mix(colourA, colourB, t); // t = how far from A to B</pre>
<p>Halfway (t = 0.5) you get half red + half green.</p>`,
          controls: [{ name: 't', label: 't (A → B)', min: 0, max: 1, step: 0.01, value: 0.5 }],
          visual: (el, v) => {
            const c = canvas2d(300, 90); const { ctx } = c;
            const A = [1, 0.2, 0.2], B = [0.2, 1, 0.3];
            const g = ctx.createLinearGradient(20, 0, 280, 0); g.addColorStop(0, css(A)); g.addColorStop(1, css(B));
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 90);
            ctx.fillStyle = g; ctx.fillRect(20, 30, 260, 18);
            const x = 20 + v.t * 260; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, 56); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('A', 12, 76); ctx.fillText('B', 276, 76);
            const m = A.map((a, i) => a * (1 - v.t) + B[i] * v.t);
            el.append(c.el, h('pre.code.wrap', { html: `mix(A, B, ${n(v.t, 2)})\n= A × ${n(1 - v.t, 2)} + B × ${n(v.t, 2)}\n= (${m.map((x2) => x2.toFixed(2)).join(', ')})  <span style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;background:${css(m)}"></span>` }));
          },
        },
        {
          title: 'Inside: three weights',
          body: `<p>Inside the triangle, every point is a mix of <b>all three</b> corners:</p>
<pre class="code">value = wA·A + wB·B + wC·C
// with wA + wB + wC = 1</pre>
<p>The three numbers <b>(wA, wB, wC)</b> are the point's <b>barycentric coordinates</b>. Near A, wA is big. At the very centre all three are ⅓.</p>
<div class="analogy">🧲 <b>Analogy:</b> three magnets at the corners, each pulling the colour towards its own. The closer you are to a magnet, the stronger its pull.</div>
<p>Move the point around. Notice: with RGB corners, the colour <i>is</i> the weights!</p>`,
          controls: [
            { name: 'px', label: 'point x', min: 0, max: 1, step: 0.01, value: 0.45 },
            { name: 'py', label: 'point y', min: 0, max: 1, step: 0.01, value: 0.35 },
          ],
          visual: (el, v) => {
            const c = canvas2d(300, 250);
            const A = [20, 225], B = [285, 190], C = [120, 15];
            const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            triImage(c, A, B, C, cols);
            const p = [v.px * 300, (1 - v.py) * 250];
            const w = baryW(A, B, C, p); const inside = w.every((x) => x >= 0);
            const ctx = c.ctx; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 7); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
            [['A', A], ['B', B], ['C', C]].forEach(([l, q2]) => ctx.fillText(l, q2[0] + (l === 'B' ? -18 : 6), q2[1] + (l === 'C' ? 8 : -6)));
            const mixed = mixC(cols, w);
            el.append(c.el, h('pre.code.wrap', { html: `wA = ${w[0].toFixed(2)}   wB = ${w[1].toFixed(2)}   wC = ${w[2].toFixed(2)}\nsum = ${(w[0] + w[1] + w[2]).toFixed(2)}\n${inside ? `colour = ${w[0].toFixed(2)}·red + ${w[1].toFixed(2)}·green + ${w[2].toFixed(2)}·blue <span style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;background:${css(mixed)}"></span>` : '<span style="color:#ff5c6c">a weight is negative → OUTSIDE → no fragment!</span>'}` }));
          },
          after: '<div class="note">🔗 Link to rasterization: "all three weights ≥ 0" is <b>exactly</b> the inside test. The edge functions from the last concept <i>are</i> the (unnormalised) barycentric weights.</div>',
        },
        {
          title: 'Weights are areas',
          body: `<p>Where do the weights come from? Split the triangle into three small triangles using the point P. The weight of a corner is the area of the small triangle <b>opposite</b> it, divided by the total area.</p>
<p>Move P towards A: the triangle opposite A grows, so wA grows.</p>`,
          controls: [
            { name: 'px', label: 'point x', min: 0.15, max: 0.85, step: 0.01, value: 0.42 },
            { name: 'py', label: 'point y', min: 0.15, max: 0.6, step: 0.01, value: 0.35 },
          ],
          visual: (el, v) => {
            const c = canvas2d(300, 250); const { ctx } = c;
            const A = [20, 225], B = [285, 190], C = [120, 15];
            const p = [v.px * 300, (1 - v.py) * 250];
            const w = baryW(A, B, C, p);
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 250);
            const tri = (a, b, c2, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#0e0f15'; ctx.lineWidth = 2; ctx.stroke(); };
            if (w.every((x) => x >= 0)) {
              tri(p, B, C, 'rgba(255,90,90,0.75)'); tri(p, C, A, 'rgba(90,230,110,0.75)'); tri(p, A, B, 'rgba(90,130,255,0.75)');
            }
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 7); ctx.fill();
            ctx.font = 'bold 13px sans-serif';
            [['A', A], ['B', B], ['C', C], ['P', p]].forEach(([l, q2]) => ctx.fillText(l, q2[0] + (l === 'B' ? -18 : 6), q2[1] + (l === 'C' ? 8 : -6)));
            el.append(c.el, h('pre.code.wrap', { html: `<span style="color:#ff7a7a">wA = area(P,B,C) / area(A,B,C) = ${w[0].toFixed(2)}</span>\n<span style="color:#6fe58a">wB = area(P,C,A) / area(A,B,C) = ${w[1].toFixed(2)}</span>\n<span style="color:#7fa0ff">wC = area(P,A,B) / area(A,B,C) = ${w[2].toFixed(2)}</span>` }));
          },
        },
        {
          title: 'Why uv is smooth',
          body: `<p>Now you know where <code>uv</code> comes from! A quad has 4 vertices with uv (0,0), (1,0), (0,1), (1,1). Every pixel gets its uv by <b>barycentric interpolation</b> of its triangle's corners.</p>
<p>A quad is <b>two triangles</b>. Here the top-right corner is white and the other three are black. Look at the left image: you can see the <b>diagonal</b> where the two triangles meet, because each triangle blends only its own 3 corners.</p>`,
          shaders: [
            { spec: { vert: 'normal = vec3(uv.x * uv.y); // corner (1,1) white, others black', frag: 'col = vNormal;' }, label: 'GPU: 2 triangles<br>(see the diagonal crease)' },
            { spec: { frag: 'col = vec3(uv.x * uv.y);' }, label: 'per-pixel uv.x·uv.y<br>(smooth, no crease)' },
          ],
          after: `<div class="note">For uv itself the two triangles agree perfectly (uv is linear), so uv looks seamless. Non-linear things like <code>uv.x*uv.y</code> must be computed <b>per pixel</b> to be smooth.</div>
<div class="tip">On a 3D mesh the GPU also corrects for perspective ("perspective-correct interpolation"), so textures don't swim on surfaces that recede into the distance.</div>`,
          quiz: { q: 'A pixel has barycentric weights (0.5, 0.5, 0). Where is it?', options: ['Halfway along the edge between A and B', 'At the centre of the triangle', 'At vertex C'], answer: 0, explain: 'wC = 0 means C has no pull: the point sits on edge AB, halfway.' },
        },
      ],
      games: [
        {
          id: 'blend-values', title: 'Interpolate by hand', engine: 'numeric', rounds: 5,
          blurb: 'Compute the value a pixel receives from its three vertices.',
          gen: (rng, level) => {
            const vals = () => [rng.step(0, 1, 0.1), rng.step(0, 1, 0.1), rng.step(0, 1, 0.1)];
            if (level === 1) {
              const a = rng.step(0, 1, 0.2), b = rng.step(0, 1, 0.2); const t = rng.pick([0.5, 0.25, 0.75]);
              if (a === b) return { prompt: `Vertex A has wA = ${n(1 - t)} and vertex B has wB = ${n(t)}. What must wC be?`, answer: 0, explain: '<p>The weights always add up to 1: 1 − ' + n(1 - t) + ' − ' + n(t) + ' = <b>0</b>. The point lies on edge AB.</p>' };
              return {
                prompt: `A point lies on the edge from A to B, at t = ${n(t)} of the way from A.<br>A's brightness = ${n(a)}, B's brightness = ${n(b)}. What brightness does the pixel get?`,
                sub: 'Same as mix(A, B, t).',
                answer: a * (1 - t) + b * t,
                explain: `<p>mix(${n(a)}, ${n(b)}, ${n(t)}) = ${n(a)} × ${n(1 - t)} + ${n(b)} × ${n(t)} = <b>${n(a * (1 - t) + b * t)}</b>.</p>`,
              };
            }
            const W = rng.pick([[0.5, 0.25, 0.25], [0.25, 0.5, 0.25], [0.25, 0.25, 0.5], [0.6, 0.2, 0.2], [0.2, 0.3, 0.5], [0.1, 0.4, 0.5], [0.5, 0.5, 0], [0.7, 0.1, 0.2]]);
            const V = vals();
            const ans = W[0] * V[0] + W[1] * V[1] + W[2] * V[2];
            if (level === 3 && rng.chance(0.5)) {
              return {
                prompt: `A pixel's weights: wA = ${n(W[0])}, wB = ${n(W[1])}, wC = <b>?</b><br>The vertices carry uv.x = A: ${n(V[0])}, B: ${n(V[1])}, C: ${n(V[2])}.<br>What uv.x does the pixel receive?`,
                sub: 'First work out the missing weight.',
                answer: ans,
                explain: `<p>wC = 1 − ${n(W[0])} − ${n(W[1])} = ${n(W[2])}.<br>uv.x = ${n(W[0])}×${n(V[0])} + ${n(W[1])}×${n(V[1])} + ${n(W[2])}×${n(V[2])} = <b>${n(ans)}</b>.</p>`,
              };
            }
            return {
              prompt: `A pixel has barycentric weights (wA, wB, wC) = (${W.map((x) => n(x)).join(', ')}).<br>The vertices carry a value: A = ${n(V[0])}, B = ${n(V[1])}, C = ${n(V[2])}. What value does the fragment shader receive?`,
              answer: ans,
              explain: `<p>${n(W[0])}×${n(V[0])} + ${n(W[1])}×${n(V[1])} + ${n(W[2])}×${n(V[2])} = <b>${n(ans)}</b>.</p><p>Each vertex contributes its value times its weight.</p>`,
            };
          },
        },
        {
          id: 'find-colour', title: 'Find the colour', engine: 'tap', rounds: 6,
          blurb: 'Tap where the interpolated colour matches the description.',
          gen: (rng, level) => {
            const A = [rng.float(0.05, 0.25), rng.float(0.05, 0.25)], B = [rng.float(0.75, 0.95), rng.float(0.1, 0.35)], C = [rng.float(0.3, 0.7), rng.float(0.8, 0.95)];
            const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            const L1 = [
              { w: [1, 0, 0], t: 'the <b>purest red</b>' }, { w: [0, 1, 0], t: 'the <b>purest green</b>' }, { w: [0, 0, 1], t: 'the <b>purest blue</b>' },
              { w: [0.5, 0.5, 0], t: 'exactly <b>half red, half green</b> (no blue)' }, { w: [0, 0.5, 0.5], t: 'exactly <b>half green, half blue</b> (no red)' }, { w: [0.5, 0, 0.5], t: 'exactly <b>half red, half blue</b> (no green)' },
            ];
            const L2 = [{ w: [1 / 3, 1 / 3, 1 / 3], t: 'all three colours are <b>equal</b>' }, { w: [0.5, 0.25, 0.25], t: 'the colour is (0.5, 0.25, 0.25)' }, { w: [0.25, 0.5, 0.25], t: 'the colour is (0.25, 0.5, 0.25)' }, { w: [0.25, 0.25, 0.5], t: 'the colour is (0.25, 0.25, 0.5)' }];
            const L3 = [{ w: [0.75, 0.25, 0], t: 'the colour is (0.75, 0.25, 0)' }, { w: [0, 0.25, 0.75], t: 'the colour is (0, 0.25, 0.75)' }, { w: [0.6, 0.2, 0.2], t: 'the colour is (0.6, 0.2, 0.2)' }, { w: [0.2, 0.2, 0.6], t: 'the colour is (0.2, 0.2, 0.6)' }];
            const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2, ...L2] : [...L2, ...L3, ...L3];
            const g = rng.pick(pool);
            const target = [0, 1].map((k) => A[k] * g.w[0] + B[k] * g.w[1] + C[k] * g.w[2]);
            return {
              prompt: `Tap where ${g.t}.`,
              sub: 'Corners: A = red (1,0,0), B = green (0,1,0), C = blue (0,0,1).',
              shader: baryShader(A, B, C, cols),
              target, radius: level === 1 ? 0.06 : 0.05,
              explain: `<p>With pure red/green/blue corners, the colour at a point <b>equals</b> its weights (wA, wB, wC). You wanted weights (${g.w.map((x) => n(x, 2)).join(', ')}) — ${g.w.filter((x) => x > 0).length === 1 ? 'that\'s a vertex itself' : g.w.includes(0) ? 'one weight is 0, so the point lies on an edge' : 'all weights positive, so it\'s inside'}.</p>`,
            };
          },
        },
        {
          id: 'pick-colour', title: 'Predict the pixel', engine: 'mcq', rounds: 8,
          blurb: 'What colour does the GPU give the marked pixel?',
          gen: (rng, level) => {
            const A = [0.08, 0.1], B = [0.92, 0.2], C = [0.45, 0.92];
            const palettes = level < 3 ? [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]] : [[[1, 1, 0], [0, 1, 1], [1, 0, 1]], [[1, 1, 1], [0, 0, 0], [1, 0, 0]], [[1, 0.5, 0], [0, 0, 1], [1, 1, 1]]];
            const cols = rng.pick(palettes);
            const WS = level === 1 ? [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]] : [[0.5, 0.25, 0.25], [0.25, 0.5, 0.25], [0.25, 0.25, 0.5], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
            const w = rng.pick(WS);
            const P = [0, 1].map((k) => A[k] * w[0] + B[k] * w[1] + C[k] * w[2]);
            const correct = mixC(cols, w);
            const key = (c) => c.map((x) => Math.round(x * 4)).join();
            const opts = distinct(rng, correct, () => mixC(cols, rng.pick([...WS, [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.8, 0.1, 0.1], [0.1, 0.1, 0.8]])), 4, key);
            return {
              prompt: 'Which colour will the GPU give the pixel inside the white ring?',
              sub: `Its barycentric weights are (wA, wB, wC) = (${w.map((x) => n(x, 2)).join(', ')}).`,
              shader: { ...baryShader(A, B, C, cols, P), frag: baryShader(A, B, C, cols, P).frag.replace('col = w.x * uCA + w.y * uCB + w.z * uCC;', 'col = (w.x > 0.93 ? uCA : w.y > 0.93 ? uCB : w.z > 0.93 ? uCC : vec3(0.22, 0.24, 0.3));') },
              options: opts.map((c) => ({ color: c })),
              explain: `<p>Only the corners are coloured in the picture. The pixel = ${w.map((x) => n(x, 2)).join('·A + ').replace(/·A \+ ([^·]*)$/, '·B + $1')}·C ≈ (${correct.map((x) => x.toFixed(2)).join(', ')}).</p><p>Multiply each corner colour by its weight and add them up.</p>`,
            };
          },
        },
        {
          id: 'interp-quiz', title: 'Interpolation facts', engine: 'mcq', rounds: 7,
          blurb: 'Concept check on varyings and barycentric weights.',
          questions: [
            tf('Barycentric weights always add up to 1.', true, 'They describe "how much of each corner", so they sum to 1.'),
            tf('A point with a negative barycentric weight is outside the triangle.', true, 'That\'s the inside test again.'),
            q('Weights (1, 0, 0) means the point is…', ['Exactly at vertex A', 'On edge BC', 'At the centre'], 'All the pull comes from A.'),
            q('Weights (⅓, ⅓, ⅓) means the point is…', ['At the centre (centroid)', 'At vertex A', 'Outside the triangle'], 'Equal pull from all corners.'),
            q('Why does uv change smoothly across a surface?', ['The rasterizer interpolates each vertex\'s uv for every pixel', 'Textures are blurred', 'The fragment shader computes uv from the camera'], 'uv is a varying.'),
            tf('Interpolation happens inside the fragment shader code you write.', false, 'It\'s done by fixed hardware before your fragment shader runs.'),
            tf('A quad drawn as two triangles can show a diagonal crease when corner values are not linear.', true, 'Each triangle interpolates only its own three corners.', 2),
            q('Vertex A has value 0, vertex B has value 1. A point halfway along AB receives…', ['0.5', '0', '1'], 'mix(0, 1, 0.5) = 0.5.'),
            tf('Normals are interpolated too, which is why you should normalize(N) again in the fragment shader.', true, 'Blending unit vectors gives slightly shorter vectors. Re-normalizing fixes lighting.', 2),
            q('If all three vertices have the same colour, the triangle is…', ['That colour everywhere', 'A gradient', 'Black in the middle'], 'Blending identical values gives the same value.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      id: 'pipeline.depth',
      title: 'Depth buffer & z-test',
      blurb: 'How the GPU knows which surface is in front — per pixel.',
      lesson: [
        {
          title: 'Who is in front?',
          body: `<p>Objects overlap on screen. For each pixel, the <b>closest</b> surface should win. But objects are drawn one after another, in whatever order the CPU sends them.</p>
<p>The trick: next to the colour image, the GPU keeps a second image — the <b>depth buffer</b> (z-buffer) — that stores, for each pixel, <b>how far away</b> the surface currently drawn there is.</p>
<div class="analogy">🎟️ <b>Analogy:</b> each pixel holds a ticket saying "closest thing so far: 4.2 m". A new fragment arrives: if it's closer, it takes the pixel and writes its own distance on the ticket. If not, it's turned away.</div>`,
          controls: [
            { name: 'a', label: 'red card depth', min: 0.1, max: 0.9, step: 0.01, value: 0.3 },
            { name: 'b', label: 'blue card depth', min: 0.1, max: 0.9, step: 0.01, value: 0.6 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'float zA = sdBox(uv - vec2(0.38, 0.42), vec2(0.25, 0.22)) < 0.0 ? uA : 1.0;\nfloat zB = sdBox(uv - vec2(0.62, 0.58), vec2(0.25, 0.22)) < 0.0 ? uB : 1.0;\ncol = vec3(0.1);\nif (zA < 1.0 || zB < 1.0) col = zA < zB ? vec3(0.95, 0.3, 0.3) : vec3(0.3, 0.5, 1.0);', uniforms: { uA: v.a, uB: v.b } }), label: 'colour buffer' },
            { spec: (v) => ({ frag: 'float zA = sdBox(uv - vec2(0.38, 0.42), vec2(0.25, 0.22)) < 0.0 ? uA : 1.0;\nfloat zB = sdBox(uv - vec2(0.62, 0.58), vec2(0.25, 0.22)) < 0.0 ? uB : 1.0;\ncol = vec3(min(zA, zB));', uniforms: { uA: v.a, uB: v.b } }), label: 'depth buffer<br>(dark = near, white = far)' },
          ],
        },
        {
          title: 'The z-test, step by step',
          body: `<p>At the start of a frame the depth buffer is cleared to <b>1.0</b> (= as far as possible). Then for every fragment:</p>
<pre class="code">if (fragDepth < depthBuffer[pixel]) {   // closer?
  colorBuffer[pixel] = fragColor;        // win the pixel
  depthBuffer[pixel] = fragDepth;        // update the ticket
} // else: discarded, nothing changes</pre>
<p>Example for one pixel, fragments arriving in this order:</p>
<ul>
<li>stored 1.0 → <span style="color:#7fa0ff">blue</span> at 0.6 arrives: 0.6 &lt; 1.0 ✅ → stored 0.6</li>
<li><span style="color:#ff7a7a">red</span> at 0.3 arrives: 0.3 &lt; 0.6 ✅ → stored 0.3</li>
<li><span style="color:#6fe58a">green</span> at 0.8 arrives: 0.8 &lt; 0.3 ❌ → rejected</li>
</ul>
<p>Final: <b>red</b>, depth 0.3. The closest one, regardless of order.</p>
<div class="tip">This comparison is the "ZTest" setting: <code>Less</code>, <code>LEqual</code> (Unity's default), <code>Greater</code>, <code>Always</code>… Writing the new depth is "ZWrite On/Off".</div>`,
        },
        {
          title: 'Order doesn\'t matter (for opaque)',
          body: `<p>Thanks to the z-test, <b>opaque</b> objects can be drawn in <b>any order</b> and the result is the same. Without it, the last one drawn simply paints over everything ("painter's algorithm").</p>
<p>Try both switches. With the z-test on, swapping the order changes nothing.</p>`,
          controls: [
            { name: 'z', label: 'z-test (0 = off, 1 = on)', min: 0, max: 1, step: 1, value: 1 },
            { name: 'o', label: 'draw order (0 = red first, 1 = blue first)', min: 0, max: 1, step: 1, value: 0 },
          ],
          shader: (v) => ({
            frag: `bool inA = sdCircle(uv - vec2(0.4, 0.45), 0.28) < 0.0; // red ball, depth 0.3 (near)
bool inB = sdBox(uv - vec2(0.62, 0.55), vec2(0.27, 0.25)) < 0.0; // blue box, depth 0.6 (far)
vec3 c = vec3(0.1); float z = 1.0;
for (int i = 0; i < 2; i++) {
  bool drawA = (i == 0) == (uO < 0.5);
  bool hit = drawA ? inA : inB; float d = drawA ? 0.3 : 0.6;
  vec3 fc = drawA ? vec3(0.95, 0.3, 0.3) : vec3(0.3, 0.5, 1.0);
  if (hit && (uZ < 0.5 || d < z)) { c = fc; z = d; }
}
col = c;`, uniforms: { uZ: v.z, uO: v.o },
          }),
          code: (v) => `// red ball is NEARER (0.3), blue box is further (0.6)\ndraw ${v.o ? 'blue' : 'red'} first, then ${v.o ? 'red' : 'blue'}\nz-test ${v.z ? 'ON: closest wins → red in front' : `OFF: last drawn wins → ${v.o ? 'red' : 'blue'} on top`}`,
          after: '<div class="note">This only works for <b>opaque</b> surfaces. Transparent ones need the colour behind them already drawn, so order matters again (see the Blending topic).</div>',
        },
        {
          title: 'Depth on a real mesh',
          body: `<p>The renderer in this app turns the depth test on for 3D meshes. That's why the torus looks right even though its triangles are drawn in a fixed, arbitrary order: the inner ring behind is rejected wherever the front part is closer.</p>
<p>Right: a visualisation of the distance to the camera (dark = near).</p>`,
          shaders: [
            { spec: { mesh: 'torus', frag: 'vec3 L = normalize(vec3(1.0, 1.0, 0.5));\ncol = vec3(1.0, 0.75, 0.3) * (0.15 + max(dot(N, L), 0.0));', camera: { spin: 0.5, pitch: 0.6 } }, label: 'colour' },
            { spec: { mesh: 'torus', frag: 'float d = length(P - uCamPos);\ncol = vec3(saturate((d - 2.2) / 2.0));', camera: { spin: 0.5, pitch: 0.6 } }, label: 'depth (distance)' },
          ],
        },
        {
          title: 'Z-fighting',
          body: `<p>Depth is stored with limited precision (e.g. 24 bits), so two surfaces that are <b>almost at the same depth</b> can't be told apart. Some pixels pick one, some the other, and it flickers as the camera moves: <b>z-fighting</b>.</p>
<p>Slide the separation between the red and blue planes down towards 0.</p>`,
          controls: [{ name: 's', label: 'separation', min: 0, max: 0.04, step: 0.001, value: 0.006 }],
          shader: (v) => ({
            frag: `float dA = 0.5 + 0.25 * (uv.x - 0.5) + 0.05 * sin(uv.y * 9.0);  // red plane
float dB = dA + uS + 0.004 * sin(uv.x * 40.0 + uv.y * 25.0);          // blue plane, slightly behind
float steps = 128.0;                      // pretend the depth buffer has few levels
float qA = floor(dA * steps), qB = floor(dB * steps);
bool aWins = qA < qB || (qA == qB && hash(floor(uv * 60.0) + floor(uTime * 6.0)) > 0.5);
col = aWins ? vec3(0.95, 0.3, 0.3) : vec3(0.3, 0.5, 1.0);`, uniforms: { uS: v.s },
          }),
          code: (v) => `separation = ${f(v.s, 3)}  (one depth step = ${f(1 / 128, 4)})\n${v.s > 1 / 128 + 0.004 ? '→ always distinguishable: red wins cleanly' : '→ same depth step for many pixels: they fight!'}`,
          after: `<div class="tip"><b>Fixes:</b> move one surface away a bit, use a depth <b>offset/bias</b> (Unity <code>Offset -1, -1</code>, used for decals), or push the camera's <b>near plane</b> further out — depth precision is spent mostly close to the near plane.</div>`,
          quiz: { q: 'A decal is placed exactly on a wall and flickers. Why?', options: ['Both surfaces have the same depth, so the z-test can\'t decide', 'The decal texture is too small', 'The fragment shader is too slow'], answer: 0, explain: 'Classic z-fighting. Decals use a depth bias to always win.' },
        },
      ],
      games: [
        {
          id: 'z-test-run', title: 'Run the z-test', engine: 'mcq', rounds: 7,
          blurb: 'Fragments arrive one by one. What ends up in the pixel?',
          gen: (rng, level) => {
            const k = level === 1 ? 2 : level === 2 ? rng.int(3, 4) : rng.int(4, 5);
            const names = rng.pickN(CNAMES, k);
            const depths = rng.pickN([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], k);
            const frags = names.map((nm, i) => ({ nm, d: depths[i] }));
            let stored = 1, win = null; const steps = [];
            for (const fr of frags) {
              if (fr.d < stored) { steps.push(`${sw(COLS[fr.nm])} ${fr.nm} at ${n(fr.d)} &lt; ${n(stored)} ✅ → stored ${n(fr.d)}`); stored = fr.d; win = fr.nm; }
              else steps.push(`${sw(COLS[fr.nm])} ${fr.nm} at ${n(fr.d)} ≥ ${n(stored)} ❌ rejected`);
            }
            const list = frags.map((fr, i) => `${i + 1}. ${sw(COLS[fr.nm])} <b>${fr.nm}</b>, depth ${n(fr.d)}`).join('<br>');
            const askDepth = level >= 2 && rng.chance(0.3);
            const askCount = level === 3 && !askDepth && rng.chance(0.4);
            const explain = `<p>Depth buffer starts at 1.0.</p><p>${steps.join('<br>')}</p><p>Final: <b>${win}</b> with depth ${n(stored)}.</p>`;
            if (askCount) {
              const cnt = steps.filter((s) => s.includes('✅')).length;
              const opts = distinct(rng, String(cnt), () => String(rng.int(1, k)), Math.min(4, k), (x) => x);
              return q(`Fragments arrive at one pixel in this order (depth buffer cleared to 1.0, test "less"):<br>${list}<br>How many of them <b>pass</b> the depth test and write their colour?`, opts, explain + '<p>Each pass overwrites the previous colour — all of those were wasted work except the last (that\'s overdraw).</p>');
            }
            if (askDepth) {
              const opts = distinct(rng, n(stored), () => n(rng.pick([...depths, 1])), 4, (x) => x);
              return q(`Fragments arrive at one pixel in this order (depth buffer cleared to 1.0, test "less"):<br>${list}<br>What value is in the <b>depth buffer</b> at the end?`, opts, explain);
            }
            const opts = distinct(rng, win, () => rng.pick(names.length >= 4 ? names : CNAMES), Math.min(4, Math.max(3, k)), (x) => x);
            return q(`Fragments arrive at one pixel in this order (depth buffer cleared to 1.0, test "less"):<br>${list}<br>What <b>colour</b> is the pixel at the end?`, opts, explain, { grid: true });
          },
        },
        {
          id: 'nearest-tap', title: 'Read the depth buffer', engine: 'tap', rounds: 6,
          blurb: 'Look at a depth image and tap the surface closest to the camera.',
          gen: (rng, level) => {
            const k = level === 1 ? 2 : 3;
            // distinct depths, one disc each
            const dset = rng.pickN(level === 1 ? [0.2, 0.5, 0.8] : [0.25, 0.35, 0.45, 0.55, 0.65, 0.75], k);
            const shapes = dset.map((d) => ({ c: [0.5, 0.5], r: rng.float(0.15, 0.22), d, tilt: level === 3 ? rng.float(-0.4, 0.4) : 0 }));
            // place shapes so they overlap but don't sit exactly on top of each other
            const ang0 = rng.float(0, 6.28);
            shapes.forEach((s, i) => { const a = ang0 + (i * 6.28) / k; s.c = [0.5 + 0.17 * Math.cos(a), 0.5 + 0.17 * Math.sin(a)]; });
            const depthAt = (u, v) => {
              let z = 1;
              for (const s of shapes) if (Math.hypot(u - s.c[0], v - s.c[1]) < s.r) z = Math.min(z, s.d + s.tilt * (u - s.c[0]));
              return z;
            };
            const best = shapes.reduce((a, b) => (a.d < b.d ? a : b));
            let zmin = 1, arg = best.c;
            for (let y = 0; y <= 60; y++) for (let x = 0; x <= 60; x++) { const z = depthAt(x / 60, y / 60); if (z < zmin) { zmin = z; arg = [x / 60, y / 60]; } }
            const glsl = shapes.map((s, i) => `if (length(uv - ${'vec2(' + f(s.c[0]) + ', ' + f(s.c[1]) + ')'}) < ${f(s.r)}) z = min(z, ${f(s.d)} + ${f(s.tilt)} * (uv.x - ${f(s.c[0])}));`).join('\n');
            return {
              prompt: 'This is a <b>depth buffer</b> (dark = near, white = far). Tap the surface <b>closest to the camera</b>.',
              sub: level === 3 ? 'The discs are tilted: their depth changes from left to right. Find the darkest spot.' : 'Each disc is a flat card at its own depth.',
              shader: { frag: `float z = 1.0;\n${glsl}\ncol = vec3(z);` },
              score: (u, v) => {
                const err = depthAt(u, v) - zmin;
                return level === 3 ? (err < 0.04 ? 1 : err < 0.1 ? 0.5 : 0) : (Math.abs(z - best.d) < 1e-6 ? 1 : 0);
              },
              reveal: [level === 3 ? arg : best.c],
              explain: `<p>The darkest value is the smallest depth: <b>${n(level === 3 ? zmin : best.d)}</b>. A disc in front stays complete; discs behind it are cut where it overlaps them — the z-test rejected those fragments.</p>`,
            };
          },
        },
        {
          id: 'depth-quiz', title: 'Depth facts', engine: 'mcq', rounds: 7,
          blurb: 'True/false about depth buffers, z-fighting and draw order.',
          questions: [
            tf('With the depth test on, opaque objects can be drawn in any order.', true, 'The closest fragment always wins.'),
            tf('The depth buffer stores one depth value per pixel.', true, 'Like a greyscale image next to the colour image.'),
            tf('Z-fighting happens when two surfaces are almost at the same depth.', true, 'The depth buffer can\'t tell them apart reliably.'),
            tf('Making the camera near plane very small (like 0.0001) improves depth precision.', false, 'The opposite: most precision is spent near the near plane. A tiny near plane wastes it and causes z-fighting far away.', 2),
            tf('At the start of a frame the depth buffer is usually cleared to the farthest value.', true, 'So the first surface drawn anywhere always passes.'),
            tf('A fragment rejected by the depth test still overwrites the colour.', false, 'Rejected = nothing is written.'),
            q('What does "ZWrite Off" do?', ['The object is tested against depth but does not store its own depth', 'The object ignores the depth test entirely', 'The object is not drawn'], 'Typical for transparent objects: they shouldn\'t hide what\'s drawn after them.', { level: 2 }),
            q('Why draw opaque objects roughly front to back?', ['Hidden pixels get rejected before shading (early-z), saving work', 'Otherwise the image is wrong', 'It makes the depth buffer smaller'], 'The image is correct either way; front to back just avoids shading pixels that will be hidden.', { level: 2 }),
            q('How do decals usually avoid z-fighting with the wall?', ['A small depth offset/bias', 'Disabling the depth buffer for the whole scene', 'Making the texture bigger'], 'Offset pulls the decal slightly towards the camera in depth.'),
            tf('The depth test is done per pixel, not per object.', true, 'That\'s why intersecting objects are handled correctly.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      id: 'pipeline.drawcalls',
      title: 'Draw calls & batching',
      blurb: 'Every "draw this" costs CPU time. How to ask less often.',
      lesson: [
        {
          title: 'A draw call is an order',
          body: `<p>A <b>draw call</b> is the CPU telling the GPU: <i>"draw this mesh, with this material, using these uniforms"</i>.</p>
<p>Before each call the CPU (and driver) must <b>set things up</b>: bind the shader, the textures, the vertex buffers, upload uniforms, validate states. That setup costs time even if the mesh is tiny.</p>
<div class="analogy">🍽️ <b>Analogy:</b> ordering at a restaurant. Ordering 20 dishes one at a time — calling the waiter back 20 times — takes far longer than handing over one list for the whole table, even though the kitchen cooks the same food.</div>`,
        },
        {
          title: 'Thousands of small orders',
          body: `<p>A forest of 3,000 trees drawn one by one = 3,000 draw calls. Each might cost the CPU only a few microseconds… but they add up and can blow your frame budget (16.7 ms at 60 fps) before the GPU even gets busy.</p>
<p>Play with the numbers (rough mobile-ish estimate of <b>20 µs per call</b>).</p>`,
          controls: [
            { name: 'o', label: 'objects', min: 100, max: 5000, step: 100, value: 2000 },
            { name: 'i', label: 'instancing (0 = off, 1 = on)', min: 0, max: 1, step: 1, value: 0 },
          ],
          visual: (el, v) => {
            const calls = v.i ? Math.ceil(v.o / 500) : v.o;
            const ms = calls * 0.02;
            const c = canvas2d(300, 90); const { ctx } = c;
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 90);
            const X = (t) => 10 + (t / 100) * 280;
            ctx.fillStyle = ms > 16.7 ? '#ff5c6c' : ms > 8 ? '#ffc857' : '#3ddc97';
            ctx.fillRect(X(0), 30, X(Math.min(100, ms)) - X(0), 24);
            ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(16.7), 20); ctx.lineTo(X(16.7), 64); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText('16.7 ms (60 fps)', X(16.7) + 4, 16); ctx.fillText('0', 6, 80); ctx.fillText('100 ms', 255, 80);
            el.append(c.el, h('pre.code.wrap', { html: `draw calls: ${calls}${v.i ? '  (instanced, ~500 per call)' : ''}\nCPU time:   ≈ ${ms.toFixed(1)} ms per frame` }));
          },
          after: '<div class="note">The GPU might draw all those trees easily. The <b>CPU</b> becomes the bottleneck just from <i>asking</i>. That\'s called being <b>CPU-bound</b> (or draw-call bound).</div>',
        },
        {
          title: 'Batching & instancing',
          body: `<p>Ways to send fewer, bigger orders:</p>
<ul>
<li><b>Static batching</b>: merge many non-moving meshes that share a material into one big mesh → one call.</li>
<li><b>GPU instancing</b>: one mesh, one material, drawn N times in <b>one call</b>. Each copy reads its own position/colour from a per-instance buffer (<code>gl_InstanceID</code> / <code>SV_InstanceID</code>).</li>
<li><b>Dynamic batching</b> (Unity): small moving meshes merged on the CPU each frame.</li>
</ul>
<div class="note">The common requirement: <b>same material</b> (same shader + same textures). A different material = a different state = a new draw call.</div>`,
        },
        {
          title: 'Materials split batches',
          body: `<p>A mesh with <b>2 materials</b> (e.g. bark + leaves) is really 2 sub-meshes = <b>2 draw calls</b>.</p>
<p>So artists reduce calls by:</p>
<ul>
<li><b>Texture atlases</b>: put several textures in one image so different objects can share one material.</li>
<li>Fewer material slots per mesh.</li>
<li>Using <b>material instances / property blocks</b> (vary colours via uniforms or per-instance data instead of new materials).</li>
</ul>
<div class="tip">Profilers show this: Unity's <i>Frame Debugger</i> and the "Batches / SetPass calls" stat; Unreal's <code>stat RHI</code> / "Mesh draw calls"; RenderDoc and Xcode's GPU capture list every call.</div>`,
          quiz: { q: '50 identical rocks share one mesh and one material. With GPU instancing, about how many draw calls?', options: ['1', '50', '100'], answer: 0, explain: 'One call draws all copies; each instance reads its own transform.' },
        },
      ],
      games: [
        {
          id: 'count-calls', title: 'Count the draw calls', engine: 'numeric', rounds: 5,
          blurb: 'Work out how many draw calls a scene needs.',
          gen: (rng, level) => {
            const kinds = [
              { n: 'trees', mats: 2, matText: '2 materials: bark + leaves' },
              { n: 'rocks', mats: 1, matText: '1 material' },
              { n: 'lamps', mats: 2, matText: '2 materials: metal + glass' },
              { n: 'crates', mats: 1, matText: '1 material' },
              { n: 'houses', mats: 3, matText: '3 materials: walls, roof, windows' },
              { n: 'barrels', mats: 1, matText: '1 material' },
            ];
            const k = level === 1 ? 2 : 3;
            const pick = rng.pickN(kinds, k).map((x) => ({ ...x, c: rng.pick(level === 1 ? [2, 3, 4, 5] : [5, 10, 12, 20, 25, 40]) }));
            const scene = pick.map((x) => `• ${x.c} ${x.n} (same mesh, ${x.matText})`).join('<br>');
            const noBatch = pick.reduce((s, x) => s + x.c * x.mats, 0);
            const inst = pick.reduce((s, x) => s + x.mats, 0);
            const mode = level === 1 ? 0 : level === 2 ? rng.int(0, 1) : rng.int(0, 2);
            const work = pick.map((x) => `${x.c}×${x.mats}`).join(' + ');
            if (mode === 0) return { prompt: `<b>No batching.</b> Each object draws each of its materials with a separate call.<br>${scene}<br>How many draw calls?`, answer: noBatch, explain: `<p>Objects × materials: ${work} = <b>${noBatch}</b>.</p><p>Every material slot is its own sub-mesh = its own call.</p>` };
            if (mode === 1) return { prompt: `<b>GPU instancing on.</b> All copies of the same mesh + material are drawn in ONE call.<br>${scene}<br>How many draw calls?`, answer: inst, explain: `<p>One call per (mesh type, material) pair: ${pick.map((x) => x.mats).join(' + ')} = <b>${inst}</b>.</p><p>The number of copies no longer matters — only how many different mesh/material combos there are.</p>` };
            return { prompt: `${scene}<br>How many draw calls does turning <b>instancing</b> on <b>save</b>, compared to no batching at all?`, answer: noBatch - inst, explain: `<p>Without batching: ${work} = ${noBatch}. With instancing: ${inst}. Saved: <b>${noBatch - inst}</b>.</p>` };
          },
        },
        {
          id: 'fewer-calls', title: 'Does it cut draw calls?', engine: 'buckets', rounds: 2,
          blurb: 'Which changes reduce the number of draw calls?',
          gen: () => ({
            prompt: 'Does this change reduce the number of draw calls?',
            buckets: ['✅ Fewer calls', '➖ No effect on calls'],
            count: 10,
            items: [
              { text: 'Enable GPU instancing for 500 identical bushes', bucket: 0 },
              { text: 'Merge static props sharing a material (static batching)', bucket: 0 },
              { text: 'Put 4 textures into one atlas so 4 props share a material', bucket: 0, why: 'Same material → they can be batched.' },
              { text: 'Make the fragment shader shorter', bucket: 1, why: 'Cheaper per pixel, but the same number of calls.' },
              { text: 'Lower the screen resolution', bucket: 1, why: 'Fewer pixels, same calls.' },
              { text: 'Reduce a mesh from 3 material slots to 1', bucket: 0, why: 'Each slot was a separate call.' },
              { text: 'Use lower-poly meshes (fewer triangles)', bucket: 1, why: 'Less vertex work, same number of calls.' },
              { text: 'Don\'t draw objects hidden behind walls (occlusion culling)', bucket: 0, why: 'Objects not drawn = calls not made.' },
              { text: 'Compress the textures', bucket: 1, why: 'Saves memory/bandwidth, not calls.' },
              { text: 'Give each of 100 crates its own unique material', bucket: 1, why: 'That actually prevents batching — more calls, not fewer!' },
              { text: 'Skip objects outside the camera view (frustum culling)', bucket: 0 },
              { text: 'Use a cheaper blend mode', bucket: 1 },
            ],
          }),
        },
        {
          id: 'calls-quiz', title: 'Batching basics', engine: 'mcq', rounds: 6,
          blurb: 'Concept questions on draw calls.',
          questions: [
            q('What is a draw call?', ['A CPU command telling the GPU to draw a mesh with a material', 'One run of the fragment shader', 'A texture lookup'], 'One "please draw this" request.'),
            q('Why are many draw calls slow?', ['Each one has CPU/driver setup overhead', 'Each one adds pixels', 'Each one recompiles the shader'], 'State setup per call adds up on the CPU.'),
            q('Which objects can usually be batched or instanced together?', ['Ones that share the same material', 'Ones with the same number of triangles', 'Ones with the same name'], 'Same shader + textures + states.'),
            tf('A mesh with 3 materials costs 3 draw calls.', true, 'Each material slot is drawn separately.'),
            tf('GPU instancing draws many copies of a mesh in one call.', true, 'Per-instance data gives each copy its own transform/colour.'),
            tf('Reducing draw calls mainly saves CPU time.', true, 'The GPU workload (pixels, vertices) is about the same.'),
            tf('A texture atlas can help reduce draw calls.', true, 'Different objects can then share one material.', 2),
            q('Your game is CPU-bound with 4,000 draw calls. Best first step?', ['Batch/instance objects that share materials', 'Lower the screen resolution', 'Shorten the fragment shader'], 'The bottleneck is the number of calls, not pixels.', { level: 2 }),
            tf('Changing a uniform colour per object via a property block can keep objects batchable.', true, 'Unity MaterialPropertyBlock / per-instance properties avoid creating new materials.', 3),
          ],
        },
      ],
    },
  ],
};
