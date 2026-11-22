// Topic — Vertex shaders: spaces, MVP, displacement, normals, vertex data, billboards.
import { tf, q, distinct, f, n, h, canvas2d, css } from './_kit.js';

// ====================================================================== helpers
// 4×4 column-major matrices (same layout as WebGL / the renderer)
const M4 = {
  mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
  T: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  S: (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
  RY: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  RZ: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
};
const TRS = (x, ry, s, rz = 0) => M4.mul(M4.T(x, 0, 0), M4.mul(M4.mul(M4.RY(ry), M4.RZ(rz)), M4.S(s)));
const showMat = (m) => [0, 1, 2, 3].map((r) => '| ' + [0, 1, 2, 3].map((c) => (m[c * 4 + r] >= 0 ? ' ' : '') + m[c * 4 + r].toFixed(2)).join('  ') + ' |').join('\n');

/** simple diffuse lighting body */
const LIT = (base, extra = '') => `vec3 L = normalize(vec3(0.6, 1.0, 0.45));\ncol = ${base} * (0.22 + 0.78 * max(dot(N, L), 0.0));${extra}`;
/** flat lighting from screen-space derivatives (works even when normals are stale) */
const FLAT = (base) => `vec3 Nf = normalize(cross(dFdx(P), dFdy(P)));\nif (dot(Nf, uCamPos - P) < 0.0) Nf = -Nf;\nvec3 L = normalize(vec3(0.6, 1.0, 0.45));\ncol = ${base} * (0.25 + 0.75 * max(dot(Nf, L), 0.0));`;
const GRID = 'float gl = max(step(0.94, fract(uv.x * 16.0)), step(0.94, fract(uv.y * 16.0)));';

// Wave on the plane mesh (with correct normals so the shape reads well)
const waveVert = (axis = 'x') => `pos.y += uA * sin(pos.${axis} * uF);
float slope = uA * uF * cos(pos.${axis} * uF);
normal = normalize(vec3(${axis === 'x' ? '-slope, 1.0, 0.0' : '0.0, 1.0, -slope'}));`;
const waveSpec = (A, F, axis = 'x', cam = {}) => ({
  mesh: 'plane', vert: waveVert(axis),
  frag: `${GRID}\n${LIT('mix(vec3(0.15, 0.45, 0.85), vec3(0.9), 0.35 * gl)')}`,
  uniforms: { uA: A, uF: F }, camera: { yaw: 0.35, pitch: 0.42, dist: 3.4, ...cam },
});

// ---- 2D "spaces" diagram
function spacesVisual(el, v) {
  const c = canvas2d(300, 260); const { ctx } = c;
  const X0 = -4, Y0 = -3, U = 300 / 9; // world units → px
  const P = (p) => [(p[0] - X0) * U, 260 - (p[1] - Y0) * U];
  const rot = (p, a) => [Math.cos(a) * p[0] - Math.sin(a) * p[1], Math.sin(a) * p[0] + Math.cos(a) * p[1]];
  const obj = { pos: [v.hx, 1], a: 0.5, s: 1.2 };
  const toWorld = (p) => { const r = rot([p[0] * obj.s, p[1] * obj.s], obj.a); return [r[0] + obj.pos[0], r[1] + obj.pos[1]]; };
  const cam = [-2.6, -1.8], phi = 0.55; // camera position and facing angle
  const fwd = [Math.cos(phi), Math.sin(phi)], right = [Math.sin(phi), -Math.cos(phi)];
  const local = [0.3, 1.2];
  const world = toWorld(local);
  const d = [world[0] - cam[0], world[1] - cam[1]];
  const view = [d[0] * right[0] + d[1] * right[1], d[0] * fwd[0] + d[1] * fwd[1]];
  const ndc = view[0] / view[1] / Math.tan(Math.PI / 6);
  const px = (ndc * 0.5 + 0.5) * 1000;
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 260);
  ctx.lineWidth = 1;
  for (let x = X0; x <= 5; x++) { ctx.strokeStyle = x === 0 ? '#3a3f55' : '#1c1f28'; ctx.beginPath(); ctx.moveTo(...P([x, Y0])); ctx.lineTo(...P([x, 5])); ctx.stroke(); }
  for (let y = Y0; y <= 5; y++) { ctx.strokeStyle = y === 0 ? '#3a3f55' : '#1c1f28'; ctx.beginPath(); ctx.moveTo(...P([X0, y])); ctx.lineTo(...P([5, y])); ctx.stroke(); }
  // frustum
  const fl = (a) => { const e = [cam[0] + 12 * Math.cos(a), cam[1] + 12 * Math.sin(a)]; ctx.beginPath(); ctx.moveTo(...P(cam)); ctx.lineTo(...P(e)); ctx.stroke(); };
  ctx.strokeStyle = 'rgba(107,223,255,0.35)'; ctx.setLineDash([4, 4]); fl(phi + Math.PI / 6); fl(phi - Math.PI / 6); ctx.setLineDash([]);
  // house
  const house = [[-0.5, 0], [0.5, 0], [0.5, 1], [0, 1.5], [-0.5, 1]].map(toWorld);
  ctx.fillStyle = '#3b3560'; ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 2;
  ctx.beginPath(); house.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.closePath(); ctx.fill(); ctx.stroke();
  const axes = (o, ax, ay, lab) => {
    const a = P(o), bx = P([o[0] + ax[0], o[1] + ax[1]]), by = P([o[0] + ay[0], o[1] + ay[1]]);
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...bx); ctx.stroke();
    ctx.strokeStyle = '#3ddc97'; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...by); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(lab, a[0] + 4, a[1] + 14);
  };
  if (v.s === 0) axes(obj.pos, rot([1, 0], obj.a), rot([0, 1], obj.a), 'object origin');
  if (v.s === 1) axes([0, 0], [1, 0], [0, 1], 'world origin');
  if (v.s === 2) axes(cam, right, fwd, 'camera');
  // camera icon
  const cp = P(cam); ctx.fillStyle = '#6bdfff'; ctx.beginPath(); ctx.arc(cp[0], cp[1], 6, 0, 7); ctx.fill();
  // point
  const wp = P(world); ctx.fillStyle = '#ffd479'; ctx.beginPath(); ctx.arc(wp[0], wp[1], 5, 0, 7); ctx.fill();
  ctx.font = '11px sans-serif'; ctx.fillText('chimney', wp[0] + 6, wp[1] - 4);
  el.append(c.el);
  if (v.s === 3) {
    const bar = canvas2d(300, 40); const b = bar.ctx;
    b.fillStyle = '#0e0f15'; b.fillRect(0, 0, 300, 40); b.fillStyle = '#272a37'; b.fillRect(10, 12, 280, 16);
    const x = 10 + Math.max(0, Math.min(1, px / 1000)) * 280; b.fillStyle = '#ffd479'; b.beginPath(); b.arc(x, 20, 6, 0, 7); b.fill();
    b.fillStyle = '#9aa0b4'; b.font = '10px sans-serif'; b.fillText('0 px', 10, 39); b.fillText('1000 px', 252, 39);
    el.append(h('div.small.dim.center', 'the camera\'s image (a 1000-pixel-wide line, seen from above)'), bar.el);
  }
  const rows = [
    ['Object', `(${local.map((x) => x.toFixed(2)).join(', ')})`, 'relative to the house\'s own pivot'],
    ['World', `(${world.map((x) => x.toFixed(2)).join(', ')})`, 'relative to the level origin'],
    ['View', `(x ${view[0].toFixed(2)}, ahead ${view[1].toFixed(2)})`, 'relative to the camera'],
    ['Screen', `${px.toFixed(0)} px`, 'where it lands in the image'],
  ];
  el.append(h('pre.code.wrap', { html: rows.map((r, i) => `<span style="${i === v.s ? 'color:#ffd479;font-weight:bold' : 'color:#6c7289'}">${r[0].padEnd(7)}${r[1]}\n        ${r[2]}</span>`).join('\n') }));
}

// ---- 2D projection side view
function projVisual(el, v) {
  const c = canvas2d(300, 200); const { ctx } = c;
  const Z = (z) => 20 + z * 33, Y = (y) => 100 - y * 40;
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 200);
  ctx.strokeStyle = '#3a3f55'; ctx.beginPath(); ctx.moveTo(Z(0), Y(0)); ctx.lineTo(300, Y(0)); ctx.stroke();
  ctx.strokeStyle = 'rgba(107,223,255,0.35)'; ctx.setLineDash([4, 4]);
  [1, -1].forEach((s) => { ctx.beginPath(); ctx.moveTo(Z(0), Y(0)); ctx.lineTo(Z(8.5), Y(s * 2.4)); ctx.stroke(); });
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Z(1), Y(-1)); ctx.lineTo(Z(1), Y(1)); ctx.stroke();
  ctx.fillStyle = '#c7b8ff'; ctx.font = '11px sans-serif'; ctx.fillText('screen (z = 1)', Z(1) + 4, Y(1.15));
  const yp = v.y / v.z;
  ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Z(0), Y(0)); ctx.lineTo(Z(v.z), Y(v.y)); ctx.stroke();
  ctx.fillStyle = '#ffd479'; ctx.beginPath(); ctx.arc(Z(v.z), Y(v.y), 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#3ddc97'; ctx.beginPath(); ctx.arc(Z(1), Y(yp), 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#6bdfff'; ctx.beginPath(); ctx.arc(Z(0), Y(0), 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText('eye', Z(0) - 8, Y(0) + 20);
  el.append(c.el, h('pre.code.wrap', { html: `point:     y = ${v.y.toFixed(2)}, distance z = ${v.z.toFixed(2)}\nclip.w   = ${v.z.toFixed(2)}   (the projection copies distance into w)\nscreen y = y / w = ${v.y.toFixed(2)} / ${v.z.toFixed(2)} = <b style="color:#3ddc97">${yp.toFixed(3)}</b>` }));
}

// ---- 2D "order matters" diagram (an F shape)
function orderVisual(el, v) {
  const c = canvas2d(300, 300); const { ctx } = c;
  const U = 300 / 8, P = (p) => [150 + p[0] * U, 150 - p[1] * U];
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 300);
  for (let i = -4; i <= 4; i++) { ctx.strokeStyle = i === 0 ? '#3a3f55' : '#1c1f28'; ctx.beginPath(); ctx.moveTo(...P([i, -4])); ctx.lineTo(...P([i, 4])); ctx.stroke(); ctx.beginPath(); ctx.moveTo(...P([-4, i])); ctx.lineTo(...P([4, i])); ctx.stroke(); }
  const F = [[0, 0], [0.3, 0], [0.3, 0.7], [0.7, 0.7], [0.7, 1], [0.3, 1], [0.3, 1.3], [0.9, 1.3], [0.9, 1.6], [0, 1.6]];
  const a = v.a * Math.PI / 180, t = [2.2, 0];
  const R = (p) => [Math.cos(a) * p[0] - Math.sin(a) * p[1], Math.sin(a) * p[0] + Math.cos(a) * p[1]];
  const Tr = (p) => [p[0] + t[0], p[1] + t[1]];
  const poly = (pts, fill, stroke) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); };
  poly(F, 'rgba(255,255,255,0.12)', '#6c7289');
  poly(F.map((p) => Tr(R(p))), 'rgba(61,220,151,0.35)', '#3ddc97');
  poly(F.map((p) => R(Tr(p))), 'rgba(255,122,178,0.35)', '#ff7ab2');
  el.append(c.el, h('pre.code.wrap', { html: `<span style="color:#3ddc97">T * R * p</span>  → rotate first (around the origin), then move\n<span style="color:#ff7ab2">R * T * p</span>  → move first, then rotate around the ORIGIN (swings away!)\ngrey = original shape` }));
}

// ====================================================================== topic
export default {
  id: 'vertex',
  title: 'Vertex shaders',
  icon: '📐',
  blurb: 'Coordinate spaces, the MVP matrix, and moving vertices for waves, wind and billboards.',
  cheatsheet: `
<p><b>Spaces</b>: object (as modelled) → <b>×Model</b> → world (the level) → <b>×View</b> → view (camera at origin) → <b>×Projection</b> → clip → <b>÷w</b> → NDC (−1..1) → viewport → screen pixels.</p>
<pre class="code">gl_Position = uProj * uView * uModel * vec4(pos, 1.0);
// read right to left: model first, projection last</pre>
<p><b>Displacement</b> (in this app's vertex body):</p>
<pre class="code">pos.y += amp * sin(pos.x * freq + uTime);  // wave
pos += normal * amount;                    // inflate
pos.x += sway * weight;                    // wind, weight 0 at root → 1 at tip</pre>
<p><b>Normals don't update themselves</b>: after displacing, recompute them (derivative of your formula, neighbour samples, or <code>cross(dFdx(P), dFdy(P))</code> per pixel).</p>
<p><b>Vertex data</b> (colours, extra uv sets) = cheap per-vertex masks: wind weights, blend masks, AO.</p>
<p><b>Billboard</b>: build the quad from the camera's right/up vectors: <code>pos = right*c.x + up*c.y</code>.</p>`,
  concepts: [
    // ------------------------------------------------------------------ 1
    {
      id: 'vertex.spaces',
      title: 'Coordinate spaces',
      blurb: 'The same point has different coordinates depending on "relative to what?".',
      lesson: [
        {
          title: 'One point, many addresses',
          body: `<p>"Where is the chimney?" depends on who you ask:</p>
<ul>
<li>The <b>modeller</b>: "1.2 m above the house's pivot" — <b>object space</b>.</li>
<li>The <b>level designer</b>: "at (2.8, 2.5) in the level" — <b>world space</b>.</li>
<li>The <b>camera</b>: "4 m ahead, a bit to the right" — <b>view space</b>.</li>
<li>The <b>screen</b>: "at pixel 620" — <b>screen space</b>.</li>
</ul>
<div class="analogy">🏠 <b>Analogy:</b> "second door on the left from my front door" vs a GPS coordinate vs "just ahead of you" vs "top-left of the photo". Same place, four descriptions.</div>
<p>A vertex shader's main job is to <b>convert</b> each vertex from object space all the way to the screen.</p>`,
        },
        {
          title: 'See the four spaces',
          body: '<p>Top-down view of a level: a house, a camera (blue dot) and its field of view. Step through the spaces, then move the house and watch which numbers change.</p>',
          controls: [
            { name: 's', label: 'space', min: 0, max: 3, step: 1, value: 0, fmt: (x) => ['object', 'world', 'view', 'screen'][x] },
            { name: 'hx', label: 'house position x', min: 0.5, max: 3.5, step: 0.05, value: 2 },
          ],
          visual: spacesVisual,
          after: '<div class="note">Moving the house changes its <b>world</b>, <b>view</b> and <b>screen</b> coordinates, but the <b>object-space</b> coordinates never change: the chimney is always at the same spot <i>on the house</i>.</div>',
        },
        {
          title: 'Object vs world on a real mesh',
          body: `<p>Left: a checker pattern computed from <b>uv</b> (object-attached). Right: a checker computed from the <b>world position</b> <code>P</code>.</p>
<p>Move and turn the cube. The left pattern rides along with the object. The right pattern stays fixed in the world and the cube "swims" through it.</p>`,
          controls: [
            { name: 'x', label: 'move x', min: -0.8, max: 0.8, step: 0.01, value: 0 },
            { name: 'r', label: 'turn', min: 0, max: 3.14, step: 0.01, value: 0.4 },
          ],
          shaders: [
            { spec: (v) => ({ mesh: 'cube', model: TRS(v.x, v.r, 1), frag: LIT('mix(vec3(0.95, 0.6, 0.25), vec3(0.25), checker(uv, 4.0))'), camera: { dist: 3.6, yaw: 0.5 } }), label: 'object space: <code>checker(uv)</code>' },
            { spec: (v) => ({ mesh: 'cube', model: TRS(v.x, v.r, 1), frag: 'float k = mod(floor(P.x * 3.0) + floor(P.y * 3.0) + floor(P.z * 3.0), 2.0);\n' + LIT('mix(vec3(0.3, 0.7, 1.0), vec3(0.25), k)'), camera: { dist: 3.6, yaw: 0.5 } }), label: 'world space: checker of <code>P</code>' },
          ],
          after: '<div class="tip">World-space patterns are great for things that should line up across many objects (triplanar rock, world-aligned moss, puddles). Object-space is for things that belong to the object (decals, logos, wear).</div>',
        },
        {
          title: 'World space: "up" is the level\'s up',
          body: `<p>Snow should settle on whatever faces the <b>sky</b>, no matter how the rock is rotated. So we test the <b>world-space</b> normal: <code>N.y</code>.</p>
<p>Tip the sphere over: the stripes (object-attached) tilt, but the snow stays on top.</p>`,
          controls: [{ name: 'r', label: 'tip over', min: -1.5, max: 1.5, step: 0.01, value: 0.7 }],
          shader: (v) => ({ mesh: 'sphere', model: TRS(0, 0, 1, v.r), frag: 'vec3 rock = mix(vec3(0.45, 0.35, 0.3), vec3(0.25, 0.2, 0.18), step(0.5, fract(uv.y * 8.0)));\nfloat snow = smoothstep(0.45, 0.6, N.y); // world-space up\n' + LIT('mix(rock, vec3(0.95), snow)') }),
          code: 'float snow = smoothstep(0.45, 0.6, N.y); // N is in WORLD space\ncol = mix(rock, white, snow);',
        },
        {
          title: 'View, clip and screen',
          body: `<p>The last three spaces are about the <b>camera</b>:</p>
<ul>
<li><b>View space</b>: the camera sits at (0,0,0) looking down −Z. Distance from camera = how far "ahead" a point is. Used for fog, depth, sorting.</li>
<li><b>Clip space</b>: after the projection matrix. A 4D vector (x, y, z, <b>w</b>). This is what <code>gl_Position</code> must contain.</li>
<li><b>NDC</b> (normalized device coordinates): clip ÷ w. Everything visible is inside −1..1.</li>
<li><b>Screen space</b>: NDC stretched to pixels (that's <code>gl_FragCoord</code> in a fragment shader).</li>
</ul>
<div class="tip">Unity: <code>TransformObjectToWorld</code>, <code>TransformWorldToView</code>, <code>TransformObjectToHClip</code> (H = homogeneous clip). Unreal's material editor has a <i>Transform Position</i> node with the same space names.</div>`,
          quiz: { q: 'You want a texture that stays glued to a character while it runs around. Which space should the coordinates come from?', options: ['Object space (or uv)', 'World space', 'Screen space'], answer: 0, explain: 'Object-space values move with the object. World-space ones stay put while the object moves through them.' },
        },
      ],
      games: [
        {
          id: 'which-space', title: 'Which space?', engine: 'buckets', rounds: 2,
          blurb: 'Pick the coordinate space that fits each job.',
          gen: () => ({
            prompt: 'Which space fits this best?',
            buckets: ['🧸 Object', '🌍 World', '🎥 View', '🖥️ Screen'],
            count: 10,
            items: [
              { text: 'Vertex positions as exported from Blender', bucket: 0 },
              { text: 'The pivot point at a character\'s feet', bucket: 0 },
              { text: 'A pattern that must stick to a spinning prop', bucket: 0 },
              { text: 'Snow on the upward-facing sides, however the rock is rotated', bucket: 1 },
              { text: 'Wind that blows the same way across the whole forest', bucket: 1 },
              { text: 'A seamless brick texture across many separate walls', bucket: 1, why: 'World-aligned (triplanar) mapping lines up across objects.' },
              { text: 'Coordinates where the camera sits at (0,0,0)', bucket: 2 },
              { text: 'Fog that gets thicker the further a point is in front of the camera', bucket: 2 },
              { text: 'Sorting transparent objects by distance in front of the camera', bucket: 2 },
              { text: 'A vignette that darkens the corners of the image', bucket: 3 },
              { text: 'Where the player tapped on the display', bucket: 3 },
              { text: 'A dither pattern based on gl_FragCoord', bucket: 3, why: 'gl_FragCoord is in pixels.' },
              { text: 'The sun direction for the whole level', bucket: 1 },
            ],
          }),
        },
        {
          id: 'space-order', title: 'From model to monitor', engine: 'order', rounds: 3,
          blurb: 'Order the spaces and transforms a vertex goes through.',
          gen: (rng, level) => {
            const V = [
              { lvl: 1, prompt: 'Order the spaces a vertex passes through:', items: ['Object space', 'World space', 'View space', 'Clip space', 'Screen space'], explain: 'Object → world (model matrix) → view (view matrix) → clip (projection) → screen (divide + viewport).' },
              { lvl: 2, prompt: 'Order the steps from modelled vertex to pixel:', items: ['Object-space position (from the mesh)', '× Model matrix → world space', '× View matrix → view space', '× Projection matrix → clip space', '÷ w → NDC (−1..1)', 'Viewport transform → pixels'], explain: 'The vertex shader does the three matrix multiplies; the GPU then divides by w and maps to pixels.' },
              { lvl: 2, prompt: 'In <code>gl_Position = uProj * uView * uModel * vec4(pos, 1.0);</code> — which matrix is applied to the vertex first?', items: [{ code: 'uModel' }, { code: 'uView' }, { code: 'uProj' }], explain: 'Matrices apply right to left: the one closest to the vector acts first.' },
              { lvl: 3, prompt: 'A typical model matrix is <code>M = T * R * S</code>. In which order are the operations applied to a vertex?', items: ['Scale', 'Rotate', 'Translate'], explain: 'Right to left: scale around the pivot, rotate around the pivot, then move to the world position. Translating first would make rotation swing the object around the world origin.' },
              { lvl: 3, prompt: 'Order these, from the space where the camera is NOT special to the one measured in pixels:', items: ['World space', 'View space', 'Clip space', 'NDC', 'Screen space'], explain: 'World → view → clip → NDC → screen.' },
            ];
            const pool = V.filter((x) => x.lvl <= level);
            const pick = rng.pick(level === 3 ? pool.filter((x) => x.lvl >= 2) : pool);
            return { prompt: pick.prompt, items: pick.items, explain: pick.explain };
          },
        },
        {
          id: 'which-matrix', title: 'Which matrix?', engine: 'mcq', rounds: 7,
          blurb: 'Name the transform that takes you from one space to another.',
          gen: (rng, level) => {
            const P = [
              ['object', 'world', 'The model matrix', 'It places the object in the level: its position, rotation and scale.'],
              ['world', 'view', 'The view matrix', 'It moves the whole world so the camera ends up at the origin, looking down −Z.'],
              ['view', 'clip', 'The projection matrix', 'It applies the camera\'s field of view and sets up w for the perspective divide.'],
              ['object', 'clip', 'Projection × View × Model (the MVP)', 'All three combined. That\'s what most vertex shaders multiply by.'],
              ['clip', 'NDC', 'Dividing by w (perspective divide)', 'Not a matrix: the GPU divides x, y, z by w automatically.'],
              ['NDC', 'screen pixels', 'The viewport transform', 'Maps −1..1 to 0..width and 0..height. Done by the GPU.'],
            ];
            if (level >= 2) P.push(['world', 'object', 'The inverse of the model matrix', 'Undo the model matrix to get back to the object\'s own coordinates (e.g. to put a world-space hit point onto the mesh).']);
            if (level >= 3) P.push(['view', 'world', 'The inverse of the view matrix (the camera\'s own transform)', 'The view matrix is the inverse of the camera\'s world transform.']);
            const [a, b, ans, why] = rng.pick(P);
            const opts = distinct(rng, ans, () => rng.pick(P)[2], 4);
            return q(`Which transform takes a point from <b>${a}</b> space to <b>${b}</b> space?`, opts, why);
          },
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'vertex.mvp',
      title: 'The MVP matrix',
      blurb: 'Model, view, projection: three machines in a row, and why their order matters.',
      lesson: [
        {
          title: 'The model matrix',
          body: `<p>A <b>matrix</b> is a machine: put a point in, get a transformed point out. The <b>model matrix</b> moves, rotates and scales an object from its own space into the world.</p>
<p>Move the sliders: the cube moves, and the numbers in the matrix change. The last column is the <b>position</b>; the top-left 3×3 holds <b>rotation and scale</b>.</p>`,
          controls: [
            { name: 'x', label: 'translate x', min: -1, max: 1, step: 0.01, value: 0.4 },
            { name: 'r', label: 'rotate y (rad)', min: 0, max: 3.14, step: 0.01, value: 0.5 },
            { name: 's', label: 'scale', min: 0.4, max: 1.4, step: 0.01, value: 0.8 },
          ],
          shader: (v) => ({ mesh: 'cube', model: TRS(v.x, v.r, v.s), frag: LIT('mix(vec3(1.0, 0.6, 0.3), vec3(0.3, 0.6, 1.0), uv.x)'), camera: { dist: 3.7, yaw: 0.4 } }),
          code: (v) => `// Model = Translate × Rotate × Scale\n${showMat(TRS(v.x, v.r, v.s))}\nworld = Model * vec4(pos, 1.0);`,
        },
        {
          title: 'The view matrix',
          body: `<p>The GPU has no "camera object". Instead, the <b>view matrix</b> moves the <b>whole world</b> so the camera ends up at the origin looking down −Z.</p>
<div class="analogy">🚂 <b>Analogy:</b> sitting in a train, you can't tell if your train moves right or the station moves left. Moving the camera right = moving the world left. The view matrix is the camera's transform, <b>inverted</b>.</div>
<p>Orbit the camera: the cube's model matrix doesn't change at all, only the view matrix does.</p>`,
          controls: [{ name: 'y', label: 'camera orbit', min: -3.14, max: 3.14, step: 0.01, value: 0.6 }],
          shader: (v) => ({ mesh: 'cube', frag: LIT('mix(vec3(1.0, 0.6, 0.3), vec3(0.3, 0.6, 1.0), uv.x)'), camera: { yaw: v.y, dist: 3.4 } }),
          code: (v) => `model matrix: unchanged (identity)\ncamera yaw = ${v.y.toFixed(2)} rad\nview = inverse(cameraTransform)  // world spins by ${(-v.y).toFixed(2)}`,
        },
        {
          title: 'Projection & the perspective divide',
          body: `<p>Far things look smaller. The <b>projection matrix</b> doesn't shrink them directly — it copies each point's <b>distance</b> into the 4th component, <b>w</b>. Then the GPU divides by it: <code>screen = clip.xy / clip.w</code>.</p>
<p>Push the point further away (z): the same height y lands closer to the centre of the screen.</p>`,
          controls: [
            { name: 'y', label: 'point height y', min: -2, max: 2, step: 0.05, value: 1.5 },
            { name: 'z', label: 'distance z', min: 1, max: 8, step: 0.05, value: 3 },
          ],
          visual: projVisual,
          after: '<div class="note">That\'s why <code>gl_Position</code> is a <b>vec4</b>: the w component carries the distance so the GPU can do the divide <i>after</i> clipping. It\'s also why the 4th coordinate of a position is 1.0: it lets a 4×4 matrix add a translation.</div>',
        },
        {
          title: 'Order matters',
          body: `<p>Matrix multiplication is <b>not commutative</b>: <code>A * B ≠ B * A</code>. With a vertex on the right, matrices act <b>right to left</b>.</p>
<p>Green: rotate, then translate (<code>T * R * p</code>). Pink: translate, then rotate (<code>R * T * p</code>) — rotation always spins around the <b>origin</b>, so the moved shape swings around in a big arc.</p>`,
          controls: [{ name: 'a', label: 'rotation (degrees)', min: 0, max: 180, step: 1, value: 60 }],
          visual: orderVisual,
          after: '<div class="tip">That\'s why <code>uProj * uView * uModel * pos</code> is written in that order: model first (closest to the vector), projection last.</div>',
        },
        {
          title: 'The one line every vertex shader has',
          body: `<pre class="code">gl_Position = uProj * uView * uModel * vec4(pos, 1.0);</pre>
<ul>
<li><code>vec4(pos, <b>1.0</b>)</code>: w = 1 means "a point" so translation applies.</li>
<li>Normals use <code>vec4(normal, <b>0.0</b>)</code>: w = 0 means "a direction", so moving the object doesn't change where its normals point.</li>
<li>Engines usually pre-multiply <b>MVP</b> on the CPU once per object (one matrix instead of three per vertex).</li>
</ul>
<div class="tip">Unity: <code>TransformObjectToHClip(v.positionOS)</code> (URP) or <code>UnityObjectToClipPos(v.vertex)</code> (built-in). In this app, you edit <code>pos</code> in object space and the line above runs after your code.</div>`,
          quiz: { q: 'Why is a direction (like a normal) multiplied with w = 0?', options: ['So the translation part of the matrix is ignored', 'So the GPU skips it', 'To make it unit length'], answer: 0, explain: 'The translation sits in the 4th column, which is multiplied by w. w = 0 → no translation, only rotation/scale.' },
        },
      ],
      games: [
        {
          id: 'persp-divide', title: 'Do the divide', engine: 'numeric', rounds: 5,
          blurb: 'Turn clip-space coordinates into NDC (and pixels).',
          gen: (rng, level) => {
            if (level < 3 || rng.chance(0.4)) {
              const w = level === 1 ? rng.pick([2, 4, 5]) : rng.pick([2, 2.5, 4, 5, 8]);
              const nx = rng.pick([-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]), ny = rng.pick([-0.5, -0.25, 0.25, 0.5, 1]);
              const x = nx * w, y = ny * w, z = +(w * 0.8).toFixed(2);
              return {
                prompt: `A vertex shader outputs <code>gl_Position = vec4(${f(x, 3)}, ${f(y, 3)}, ${f(z, 3)}, ${f(w, 3)})</code>. What are the NDC x and y after the perspective divide?`,
                wrap: 'vec2', answer: [nx, ny],
                explain: `<p>Divide by w = ${n(w)}: x = ${n(x)} / ${n(w)} = <b>${n(nx)}</b>, y = ${n(y)} / ${n(w)} = <b>${n(ny)}</b>.</p><p>Bigger w (further away) → numbers closer to 0 → closer to the screen centre.</p>`,
              };
            }
            const W = rng.pick([800, 1000, 1200]), H = rng.pick([400, 600, 800]);
            const nx = rng.pick([-1, -0.5, 0, 0.5, 1]), ny = rng.pick([-1, -0.5, 0, 0.5, 1]);
            const px = (nx * 0.5 + 0.5) * W, py = (ny * 0.5 + 0.5) * H;
            return {
              prompt: `A point has NDC (${n(nx)}, ${n(ny)}). The screen is ${W}×${H} pixels. Which pixel does it land on? (measured from the bottom-left corner)`,
              sub: 'pixel = (ndc × 0.5 + 0.5) × size',
              wrap: 'vec2', answer: [px, py], tolerance: 1,
              explain: `<p>x: (${n(nx)} × 0.5 + 0.5) × ${W} = <b>${n(px)}</b>. y: (${n(ny)} × 0.5 + 0.5) × ${H} = <b>${n(py)}</b>.</p><p>NDC −1 is the left/bottom edge, +1 the right/top edge.</p>`,
            };
          },
        },
        {
          id: 'model-point', title: 'Transform a point', engine: 'numeric', rounds: 5,
          blurb: 'Apply a model matrix by hand (in 2D).',
          gen: (rng, level) => {
            const p = [rng.int(-2, 2), rng.int(1, 3)];
            const s = rng.pick([1, 2, 3]);
            const t = [rng.int(-3, 3), rng.int(-2, 2)];
            const rot90 = (q2) => [-q2[1], q2[0]];
            if (level === 1) {
              const r = [p[0] * s + t[0], p[1] * s + t[1]];
              return { prompt: `Object-space point p = (${p.join(', ')}). The model matrix <b>scales by ${s}</b>, then <b>moves by (${t.join(', ')})</b>. Where is p in world space?`, wrap: 'vec2', answer: r, tolerance: 0.01, explain: `<p>Scale: (${p.map((x) => x * s).join(', ')}). Move: (${r.join(', ')}).</p><p><code>world = T * S * p</code> — the scale happens around the object\'s own pivot, then the translation.</p>` };
            }
            if (level === 2 || rng.chance(0.5)) {
              const r1 = rot90([p[0] * s, p[1] * s]); const r = [r1[0] + t[0], r1[1] + t[1]];
              return { prompt: `p = (${p.join(', ')}). Model matrix = <code>T * R * S</code>: scale by ${s}, <b>rotate 90° counter-clockwise</b>, then move by (${t.join(', ')}). World position?`, sub: 'Rotating (x, y) by 90° CCW gives (−y, x).', wrap: 'vec2', answer: r, tolerance: 0.01, explain: `<p>Scale → (${p.map((x) => x * s).join(', ')}). Rotate → (${r1.join(', ')}). Move → <b>(${r.join(', ')})</b>.</p>` };
            }
            const pt = [p[0] + t[0], p[1] + t[1]]; const r = rot90(pt);
            return { prompt: `p = (${p.join(', ')}). This time the matrix is <code>R * T</code>: <b>first move</b> by (${t.join(', ')}), <b>then rotate 90° CCW around the origin</b>. Result?`, sub: 'Rotating (x, y) by 90° CCW gives (−y, x).', wrap: 'vec2', answer: r, tolerance: 0.01, explain: `<p>Move → (${pt.join(', ')}). Rotate around the origin → <b>(${r.join(', ')})</b>.</p><p>Compare with rotating first: you'd get a different point. Order matters!</p>` };
          },
        },
        {
          id: 'mvp-quiz', title: 'MVP check', engine: 'mcq', rounds: 7,
          blurb: 'Concept questions about matrices in the vertex shader.',
          questions: [
            q('Which line correctly computes the clip position?', [{ code: 'gl_Position = uProj * uView * uModel * vec4(pos, 1.0);' }, { code: 'gl_Position = uModel * uView * uProj * vec4(pos, 1.0);' }, { code: 'gl_Position = uProj * uView * uModel * vec4(pos, 0.0);' }, { code: 'gl_Position = vec4(pos, 1.0) * uModel;' }], 'Model first (rightmost), projection last, and w = 1.0 for a point.'),
            q('What does the perspective divide do?', ['Divides x, y, z by w so far things get closer to the centre', 'Divides the screen into tiles', 'Splits the mesh into triangles'], 'Distance ends up in w; dividing by it creates perspective.'),
            tf('The view matrix moves the world so the camera sits at the origin.', true, 'There\'s no camera object on the GPU — the world is moved instead.'),
            tf('T * R * p and R * T * p always give the same result.', false, 'Matrix multiplication is not commutative.'),
            tf('Normals should be transformed with w = 0.', true, 'They are directions: translation must not affect them.'),
            q('In clip space, what does w usually hold for a perspective camera?', ['The distance in front of the camera', 'The alpha', 'Always 1.0'], 'The projection matrix copies depth (−z in view space) into w.', { level: 2 }),
            q('After the divide, visible points have NDC x and y in…', ['−1 to 1', '0 to 1', '0 to screen width'], 'NDC is a −1..1 cube; the viewport maps it to pixels.'),
            tf('An orthographic camera (no perspective) keeps w = 1, so distance doesn\'t change size.', true, 'Typical for 2D games, UI and isometric views.', 2),
            q('Why do engines often send one combined MVP matrix?', ['It\'s computed once per object on the CPU instead of 3 multiplies per vertex', 'GLSL can\'t multiply 3 matrices', 'It\'s more precise'], 'Move work up the pipeline: per object is cheaper than per vertex.', { level: 2 }),
            q('Which part of a 4×4 model matrix holds the position?', ['The last column (x, y, z of the 4th column)', 'The diagonal', 'The first row'], 'Multiplied by w = 1, it adds the translation.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'vertex.displace',
      title: 'Vertex displacement',
      blurb: 'Move vertices with maths: waves, inflation and noise terrain.',
      lesson: [
        {
          title: 'Moving vertices',
          body: `<p>Before the vertex shader projects a vertex, you can <b>change its position</b>. Everything after (rasterization, colours) simply follows the new shape.</p>
<p>This plane has 65×65 vertices, all at y = 0. Let's lift each one by its own amount: a <b>sine wave</b> based on its x position.</p>`,
          controls: [
            { name: 'a', label: 'amplitude', min: 0, max: 0.4, step: 0.01, value: 0.15 },
            { name: 'f', label: 'frequency', min: 1, max: 12, step: 0.1, value: 5 },
          ],
          shader: (v) => ({ ...waveSpec(v.a, v.f), vert: waveVert('x').replace('pos.x * uF', 'pos.x * uF + uTime * 1.5').replace('cos(pos.x * uF)', 'cos(pos.x * uF + uTime * 1.5)') }),
          code: (v) => `// vertex shader body (runs per vertex)\npos.y += ${f(v.a, 2)} * sin(pos.x * ${f(v.f, 1)} + uTime * 1.5);`,
          after: '<div class="note"><b>Amplitude</b> = how high the waves are. <b>Frequency</b> = how many waves fit across. Adding <code>uTime</code> makes them travel.</div>',
        },
        {
          title: 'You can only move what exists',
          body: `<p>Displacement moves <b>vertices</b>, nothing in between. If the wave is more detailed than the mesh, you get a jagged, low-poly shape.</p>
<p>Turn on the wireframe and crank the frequency: each little line segment is a triangle edge. The pixels in between are just interpolated.</p>`,
          controls: [
            { name: 'f', label: 'frequency', min: 1, max: 40, step: 0.5, value: 8 },
            { name: 'w', label: 'wireframe (0/1)', min: 0, max: 1, step: 1, value: 1 },
          ],
          shader: (v) => ({ ...waveSpec(0.15, v.f), wire: v.w > 0.5 }),
          code: (v) => `pos.y += 0.15 * sin(pos.x * ${f(v.f, 1)});\n// plane: 64 segments across → ${(64 / (v.f * 2 / (2 * Math.PI))).toFixed(1)} segments per wave`,
          after: '<div class="tip">Rule of thumb: you need several vertices per wave. For finer detail use more geometry (or tessellation), or fake it per pixel with a normal map.</div>',
        },
        {
          title: 'Push along the normal',
          body: `<p>"Up" isn't always y. To push a surface <b>outward</b>, move each vertex along its own <b>normal</b>:</p>
<pre class="code">pos += normal * amount;</pre>
<p>On a sphere, that inflates or deflates it. Add a sine and you get ripples that follow the surface.</p>`,
          controls: [
            { name: 'a', label: 'amount', min: -0.3, max: 0.3, step: 0.01, value: 0.08 },
            { name: 'k', label: 'ripple frequency', min: 0, max: 20, step: 0.5, value: 10 },
          ],
          shader: (v) => ({ mesh: 'sphere', vert: 'pos += normal * uA * (uK > 0.0 ? sin(pos.y * uK + uTime * 2.0) : 1.0);', frag: FLAT('vec3(0.95, 0.55, 0.35)'), uniforms: { uA: v.a, uK: v.k } }),
          code: (v) => v.k > 0 ? `pos += normal * ${f(v.a, 2)} * sin(pos.y * ${f(v.k, 1)} + uTime * 2.0);` : `pos += normal * ${f(v.a, 2)};`,
        },
        {
          title: 'Noise terrain',
          body: `<p>Swap the sine for <b>noise</b> and a flat plane becomes hills. The same <code>fbm()</code> you used for textures works in the vertex shader too.</p>
<p>The colour comes from the height (<code>P.y</code>) in the fragment shader.</p>`,
          controls: [
            { name: 'h', label: 'height', min: 0, max: 0.8, step: 0.01, value: 0.45 },
            { name: 's', label: 'noise scale', min: 0.5, max: 4, step: 0.1, value: 1.6 },
          ],
          shader: (v) => ({ mesh: 'plane', vert: 'pos.y += uH * (fbm(pos.xz * uS + 3.0) - 0.5);', frag: 'float t = saturate(P.y * 1.6 + 0.5);\ncol = mix(vec3(0.1, 0.3, 0.6), vec3(0.35, 0.65, 0.3), smoothstep(0.35, 0.45, t));\ncol = mix(col, vec3(0.95), smoothstep(0.7, 0.8, t));\n' + FLAT('col'), uniforms: { uH: v.h, uS: v.s }, camera: { pitch: 0.55, dist: 3.4 } }),
          code: (v) => `// vertex shader\npos.y += ${f(v.h, 2)} * (fbm(pos.xz * ${f(v.s, 1)} + 3.0) - 0.5);\n// fragment shader: colour from height\nfloat t = P.y * 1.6 + 0.5;  // water → grass → snow`,
          quiz: { q: 'Why does the terrain colour line up with the hills?', options: ['The fragment shader reads P, the world position after displacement', 'The texture was painted to match', 'The CPU sorts the colours'], answer: 0, explain: 'P (vWorld) is computed from the displaced position and interpolated to each pixel.' },
        },
      ],
      games: [
        {
          id: 'match-wave', title: 'Match the wave', engine: 'slider', rounds: 4,
          blurb: 'Tune amplitude and frequency until your plane matches the target.',
          gen: (rng, level) => {
            const A = rng.step(0.05, 0.3, 0.05), F = level === 1 ? 5 : rng.step(2, 10, 1);
            const axis = level === 3 ? rng.pick(['x', 'z']) : 'x';
            const params = [{ name: 'a', label: 'amplitude', min: 0, max: 0.35, step: 0.01, target: A }];
            if (level >= 2) params.push({ name: 'f', label: 'frequency', min: 1, max: 12, step: 0.5, target: F });
            return {
              prompt: 'Match the wave on the target plane.',
              sub: level === 1 ? 'Only the height (amplitude) differs.' : 'Count the crests to find the frequency first, then match the height.',
              params,
              build: (p) => waveSpec(p.a, p.f ?? F, axis),
              code: (p) => `pos.y += ${f(p.a, 2)} * sin(pos.${axis} * ${f(p.f ?? F, 1)});`,
              tolerance: 0.06,
              explain: `<p>Target: <code>pos.y += ${f(A, 2)} * sin(pos.${axis} * ${f(F, 1)});</code></p><p>The plane spans 2 units, so a frequency of ${n(F)} gives ${n(F * 2 / (2 * Math.PI), 2)} full waves across it (one wave per 2π/frequency).</p>`,
            };
          },
        },
        {
          id: 'code-to-mesh', title: 'Code → shape', engine: 'mcq', rounds: 6,
          blurb: 'Read a vertex body and pick the resulting mesh.',
          gen: (rng, level) => {
            const pool = [
              { lvl: 1, code: 'pos.y += 0.25 * sin(pos.x * 4.0);', mesh: 'plane' },
              { lvl: 1, code: 'pos.y += 0.25 * sin(pos.z * 4.0);', mesh: 'plane' },
              { lvl: 1, code: 'pos.y += 0.5 * (1.0 - length(pos.xz));', mesh: 'plane' },
              { lvl: 1, code: 'pos.y += 0.3 * pos.x;', mesh: 'plane' },
              { lvl: 2, code: 'pos.y += 0.25 * sin(pos.x * 10.0);', mesh: 'plane' },
              { lvl: 2, code: 'pos.y += 0.3 * pos.x * pos.z;', mesh: 'plane' },
              { lvl: 2, code: 'pos.y += 0.15 * sin(length(pos.xz) * 12.0);', mesh: 'plane' },
              { lvl: 3, code: 'pos.y -= 0.5 * (1.0 - length(pos.xz));', mesh: 'plane' },
              { lvl: 3, code: 'pos.y += 0.3 * abs(pos.x);', mesh: 'plane' },
              { lvl: 3, code: 'pos.y += 0.2 * step(0.0, pos.x);', mesh: 'plane' },
            ];
            const avail = pool.filter((x) => x.lvl <= level);
            const ans = rng.pick(avail);
            const opts = distinct(rng, ans, () => rng.pick(avail), 4, (x) => x.code);
            const spec = (o, i) => ({ mesh: o.mesh, vert: o.code, frag: FLAT(`mix(vec3(0.3, 0.6, 1.0), vec3(1.0), 0.3 * max(step(0.92, fract(uv.x * 8.0)), step(0.92, fract(uv.y * 8.0))))`), camera: { yaw: 0.35, pitch: 0.45, dist: 3.5 }, uniforms: { uOpt: i } });
            return {
              prompt: 'Which plane does this vertex code produce?',
              sub: 'The plane is flat (y = 0) from x, z = −1 to 1 before your code. +x points to the right, +z towards you.',
              code: ans.code,
              options: opts.map((o, i) => ({ shader: spec(o, i) })),
              explain: '<p>Plug in a few positions: the centre (0, 0), the left edge x = −1 and right edge x = 1. What height does each get?</p>',
            };
          },
        },
        {
          id: 'fill-vertex', title: 'Write the displacement', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the vertex body so the mesh matches the target.',
          gen: (rng, level) => {
            const V = [
              () => { const ax = rng.pick(['x', 'z']); const a = rng.pick(['0.1', '0.25']); return { template: 'pos.[[0]] += [[1]] * sin(pos.[[2]] * 6.0);', slots: [{ options: ['y', 'x', 'z'], answer: 'y' }, { options: ['0.1', '0.25', 'normal'], answer: a }, { options: ['x', 'z', 'y'], answer: ax }], mesh: 'plane', explain: 'Waves go <b>up</b> (pos.y), the height is the amplitude, and the axis inside sin() decides which direction the waves run. <code>normal</code> is a vec3 and can\'t be added to the float pos.y — a compile error.' }; },
              () => { const a = rng.pick(['0.2', '-0.3']); return { template: 'pos += [[0]] * [[1]];', slots: [{ options: ['normal', 'uv', 'vec3(0.0, 1.0, 0.0)'], answer: 'normal' }, { options: ['0.2', '-0.3', '2.0'], answer: a }], mesh: 'sphere', explain: 'Along the normal = outwards on a sphere, so it grows (or shrinks with a negative amount). Moving every vertex up by the same amount would just shift the sphere. <code>uv</code> is a vec2 — type error.' }; },
              () => { const k = rng.pick(['8.0', '16.0']); return { template: 'pos += normal * [[0]] * sin(pos.y * [[1]]);', slots: [{ options: ['0.1', '0.4', '1.0'], answer: '0.1' }, { options: ['8.0', '16.0', '2.0'], answer: k }], mesh: 'sphere', explain: 'The first number is the ripple height, the second how many ripples fit from bottom to top.' }; },
              () => { const s = rng.pick(['0.5', '-0.5']); return { template: 'pos.y += [[0]] * (1.0 - length(pos.[[1]]));', slots: [{ options: ['0.5', '-0.5', '2.0'], answer: s }, { options: ['xz', 'xy', 'x'], answer: 'xz' }], mesh: 'plane', explain: '<code>length(pos.xz)</code> = horizontal distance from the centre. 1 − distance is highest in the middle: a hill (or a pit with a negative amount). <code>pos.xy</code> would use y (which is 0) instead of z.' }; },
            ];
            const pool = level === 1 ? [V[0], V[1]] : V;
            const vr = rng.pick(pool)();
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Complete the vertex body so the mesh matches the target:',
              template: vr.template, slots: vr.slots,
              build: (vals) => ({ mesh: vr.mesh, vert: fill(vals), frag: FLAT('mix(vec3(1.0, 0.6, 0.3), vec3(0.3, 0.6, 1.0), uv.x)'), camera: { yaw: 0.35, pitch: 0.45, dist: 3.5 } }),
              explain: `<p>${vr.explain}</p>`,
            };
          },
        },
        {
          id: 'displace-numbers', title: 'Where does it go?', engine: 'numeric', rounds: 5,
          blurb: 'Compute a displaced vertex position by hand.',
          gen: (rng, level) => {
            const kind = level === 1 ? 0 : rng.int(0, 2);
            if (kind === 0) {
              const A = rng.pick([0.1, 0.2, 0.25, 0.5]);
              const opts = [[0, 0, '0'], [0.5, 1, 'PI/2'], [1, 0, 'PI'], [1.5, -1, '3PI/2']];
              const [x, s, txt] = rng.pick(opts);
              return { prompt: `<code>pos.y += ${f(A)} * sin(pos.x * PI);</code><br>A vertex starts at x = ${n(x)}, y = 0. What is its new y?`, sub: `pos.x × PI = ${txt}`, answer: A * s, explain: `<p>sin(${txt}) = ${s}, so y = ${n(A)} × ${s} = <b>${n(A * s)}</b>.</p>` };
            }
            if (kind === 1) {
              const nrm = rng.pick([[1, 0, 0], [0, 1, 0], [0, 0, -1], [-1, 0, 0]]);
              const p = nrm.map((x) => x * rng.pick([1, 0.5]));
              const a = rng.pick([0.2, 0.5, -0.25]);
              const r = p.map((x, i) => x + nrm[i] * a);
              return { prompt: `<code>pos += normal * ${f(a)};</code><br>pos = (${p.map((x) => n(x)).join(', ')}), normal = (${nrm.join(', ')}). New pos?`, labels: ['x', 'y', 'z'], answer: r, explain: `<p>normal × ${n(a)} = (${nrm.map((x) => n(x * a)).join(', ')}). Add it: <b>(${r.map((x) => n(x)).join(', ')})</b>.</p>` };
            }
            const hx = rng.pick([0, 0.5, 1]), hz = rng.pick([0, 0.5]);
            const H = rng.pick([0.4, 0.6, 1]);
            const d = Math.hypot(hx, hz);
            if (d > 1) return { prompt: `<code>pos.y += ${f(H)} * (1.0 - length(pos.xz));</code><br>Vertex at x = 0, z = 0. New y?`, answer: H, explain: `<p>length = 0, so y = ${n(H)} × 1 = <b>${n(H)}</b>. The centre is the top of the hill.</p>` };
            return { prompt: `<code>pos.y += ${f(H)} * (1.0 - length(pos.xz));</code><br>Vertex at x = ${n(hx)}, z = ${n(hz)}. New y? (2 decimals)`, answer: H * (1 - d), tolerance: 0.011, explain: `<p>length((${n(hx)}, ${n(hz)})) = ${d.toFixed(3)}. y = ${n(H)} × (1 − ${d.toFixed(3)}) = <b>${(H * (1 - d)).toFixed(3)}</b>.</p>` };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      id: 'vertex.normals',
      title: 'Displacement & normals',
      blurb: 'Moving vertices doesn\'t turn their normals — and lighting notices.',
      lesson: [
        {
          title: 'The shape moved, the light didn\'t notice',
          body: `<p>Left: we displace the plane into a wave but leave <code>normal</code> untouched. Every normal still points straight up (0, 1, 0), so the lighting is <b>flat</b>, as if the surface were still a table top.</p>
<p>Right: the same wave with normals recomputed. Now the slopes catch the light.</p>`,
          controls: [{ name: 'a', label: 'amplitude', min: 0, max: 0.35, step: 0.01, value: 0.2 }],
          shaders: [
            { spec: (v) => ({ mesh: 'plane', vert: 'pos.y += uA * sin(pos.x * 5.0);', frag: LIT('vec3(0.3, 0.65, 1.0)'), uniforms: { uA: v.a }, camera: { yaw: 0.0, pitch: 0.5, dist: 3.3 } }), label: '❌ normals not updated' },
            { spec: (v) => ({ mesh: 'plane', vert: 'pos.y += uA * sin(pos.x * 5.0);\nnormal = normalize(vec3(-uA * 5.0 * cos(pos.x * 5.0), 1.0, 0.0));', frag: LIT('vec3(0.3, 0.65, 1.0)'), uniforms: { uA: v.a }, camera: { yaw: 0.0, pitch: 0.5, dist: 3.3 } }), label: '✅ normals recomputed' },
          ],
        },
        {
          title: 'Why it happens',
          body: `<p>A vertex is just a bundle of numbers: position, normal, uv… The vertex shader only changes the numbers you <b>tell</b> it to change. Changing <code>pos</code> doesn't magically update <code>normal</code>.</p>
<div class="analogy">🛋️ <b>Analogy:</b> you rearrange the furniture but the little arrows painted on the floor saying "sofa faces this way" stay where they were. Anyone reading the arrows gets it wrong.</div>
<div class="tip">Same in engines: Unreal's <i>World Position Offset</i> and Unity Shader Graph's vertex <i>Position</i> output don't recompute normals for you. You must output a corrected normal too (or accept the wrong shading).</div>`,
        },
        {
          title: 'Fix 1: use the slope',
          body: `<p>If you know the formula, you know its <b>slope</b> (derivative). For a wave <code>y = A·sin(F·x)</code>:</p>
<pre class="code">slope = A * F * cos(F * x);          // dy/dx
normal = normalize(vec3(-slope, 1.0, 0.0));</pre>
<p>Why <code>-slope</code>? A surface rising to the right faces up and to the <b>left</b>. Move the point along the curve: the green arrow is the normal.</p>`,
          controls: [{ name: 'x', label: 'x', min: -1, max: 1, step: 0.01, value: 0.1 }],
          visual: (el, v) => {
            const A = 0.3, F = 5;
            const c = canvas2d(300, 200); const { ctx } = c;
            const X = (x) => 150 + x * 130, Y = (y) => 110 - y * 130;
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 300, 200);
            ctx.strokeStyle = '#6bdfff'; ctx.lineWidth = 2.5; ctx.beginPath();
            for (let i = 0; i <= 200; i++) { const x = -1.1 + i * 0.011; const y = A * Math.sin(F * x); i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }
            ctx.stroke();
            const y = A * Math.sin(F * v.x), s = A * F * Math.cos(F * v.x);
            const l = Math.hypot(s, 1), nx = -s / l, ny = 1 / l;
            ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(v.x - 0.25), Y(y - 0.25 * s)); ctx.lineTo(X(v.x + 0.25), Y(y + 0.25 * s)); ctx.stroke();
            ctx.strokeStyle = '#3ddc97'; ctx.fillStyle = '#3ddc97'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(v.x), Y(y)); ctx.lineTo(X(v.x + nx * 0.4), Y(y + ny * 0.4)); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(v.x), Y(y), 5, 0, 7); ctx.fill();
            el.append(c.el, h('pre.code.wrap', { html: `slope  = 0.3 * 5.0 * cos(5.0 * ${v.x.toFixed(2)}) = ${s.toFixed(2)}\nnormal = normalize(vec3(${(-s).toFixed(2)}, 1.0, 0.0)) = (${nx.toFixed(2)}, ${ny.toFixed(2)}, 0.0)` }));
          },
          after: '<div class="note">Yellow = the tangent (the slope). The normal is perpendicular to it: (−slope, 1) is always perpendicular to (1, slope).</div>',
        },
        {
          title: 'Fix 2: ask the neighbours',
          body: `<p>For noise there's no easy formula for the slope. Instead, <b>sample the height a tiny step away</b> in x and z, build two tangent vectors and take their <b>cross product</b>:</p>
<pre class="code">float h0 = hgt(pos.xz);
float hx = hgt(pos.xz + vec2(e, 0.0));
float hz = hgt(pos.xz + vec2(0.0, e));
normal = normalize(cross(vec3(0.0, hz - h0, e),
                         vec3(e,   hx - h0, 0.0)));</pre>
<p>It costs 2 extra noise evaluations per vertex, but works for <i>any</i> displacement.</p>`,
          shaders: [
            { spec: { mesh: 'plane', vdefs: 'float hgt(vec2 p){ return 0.5 * fbm(p * 1.6 + 3.0); }', vert: 'pos.y += hgt(pos.xz) - 0.25;', frag: LIT('vec3(0.55, 0.75, 0.4)'), camera: { pitch: 0.55, dist: 3.4 } }, label: '❌ old normals' },
            { spec: { mesh: 'plane', vdefs: 'float hgt(vec2 p){ return 0.5 * fbm(p * 1.6 + 3.0); }', vert: 'float e = 0.02;\nfloat h0 = hgt(pos.xz);\nfloat hx = hgt(pos.xz + vec2(e, 0.0));\nfloat hz = hgt(pos.xz + vec2(0.0, e));\npos.y += h0 - 0.25;\nnormal = normalize(cross(vec3(0.0, hz - h0, e), vec3(e, hx - h0, 0.0)));', frag: LIT('vec3(0.55, 0.75, 0.4)'), camera: { pitch: 0.55, dist: 3.4 } }, label: '✅ neighbour samples' },
          ],
        },
        {
          title: 'Fix 3: flat normals per pixel',
          body: `<p>A shortcut in the <b>fragment</b> shader: <code>dFdx(P)</code> and <code>dFdy(P)</code> tell you how the world position changes to the next pixel. Their cross product is the true surface normal of the triangle you're on.</p>
<pre class="code">vec3 Nf = normalize(cross(dFdx(P), dFdy(P)));</pre>
<p>It's always correct, but <b>faceted</b> (one normal per triangle) — perfect for a low-poly style, less so for smooth water.</p>`,
          shader: { mesh: 'sphere', vert: 'pos += normal * 0.12 * sin(pos.y * 9.0 + uTime);', frag: FLAT('vec3(0.95, 0.6, 0.35)'), camera: { spin: 0.3 } },
          quiz: { q: 'You displace a mesh with noise and the lighting looks flat. What\'s the most likely cause?', options: ['The normals were not recomputed after displacement', 'The light is too bright', 'The mesh has too many vertices'], answer: 0, explain: 'The lighting reads the old, undisplaced normals.' },
        },
      ],
      games: [
        {
          id: 'spot-correct', title: 'Which one is lit correctly?', engine: 'mcq', rounds: 6,
          blurb: 'Find the displaced plane whose normals were fixed.',
          gen: (rng, level) => {
            const A = rng.pick([0.15, 0.2, 0.25]), F = rng.pick([4, 5, 6]);
            const vert = (mode) => `pos.y += ${f(A)} * sin(pos.x * ${f(F)});` + (mode === 'fix' ? `\nnormal = normalize(vec3(-${f(A * F)} * cos(pos.x * ${f(F)}), 1.0, 0.0));` : mode === 'flip' ? `\nnormal = normalize(vec3(${f(A * F)} * cos(pos.x * ${f(F)}), 1.0, 0.0));` : mode === 'side' ? '\nnormal = vec3(1.0, 0.0, 0.0);' : '');
            const modes = level === 1 ? ['fix', 'none'] : level === 2 ? ['fix', 'none', 'side'] : ['fix', 'none', 'flip', 'side'];
            const spec = (m) => ({ mesh: 'plane', vert: vert(m), frag: 'vec3 L = normalize(vec3(1.0, 0.8, 0.0));\ncol = vec3(0.35, 0.7, 1.0) * (0.12 + 0.88 * max(dot(N, L), 0.0));', camera: { yaw: 0, pitch: 0.45, dist: 3.3 }, uniforms: { uMode: modes.indexOf(m) } });
            return {
              prompt: 'All of these planes have the same wave. The light comes from the <b>right</b> (+x) and above. Which one has <b>correct</b> normals?',
              sub: 'Slopes facing right should be bright, slopes facing left darker.',
              options: modes.map((m) => ({ shader: spec(m) })),
              explain: `<p>Correct normal: <code>normalize(vec3(-slope, 1, 0))</code> with slope = ${n(A)}·${n(F)}·cos(${n(F)}x).</p><ul><li>Not updated → evenly lit, looks flat.</li>${level >= 2 ? '<li>Constant sideways normal → the whole plane gets the same light.</li>' : ''}${level >= 3 ? '<li>Wrong sign → the left-facing slopes are lit instead of the right-facing ones.</li>' : ''}</ul>`,
            };
          },
        },
        {
          id: 'fix-normal', title: 'Fix the normal', engine: 'codefill', rounds: 4,
          blurb: 'Write the corrected normal for a displaced wave.',
          gen: (rng) => {
            const ax = rng.pick(['x', 'z']);
            const A = rng.pick(['0.2', '0.15']), F = rng.pick(['5.0', '4.0']);
            const good = `-${A} * ${F} * cos(pos.${ax} * ${F})`;
            const template = ax === 'x'
              ? `pos.y += ${A} * sin(pos.x * ${F});\nnormal = normalize(vec3([[0]], 1.0, 0.0));`
              : `pos.y += ${A} * sin(pos.z * ${F});\nnormal = normalize(vec3(0.0, 1.0, [[0]]));`;
            return {
              prompt: 'Fill in the missing component so the lighting matches the target:',
              template,
              slots: [{ options: [good, `${A} * ${F} * cos(pos.${ax} * ${F})`, '0.0', `${A} * sin(pos.${ax} * ${F})`], answer: good }],
              build: (vals) => ({ mesh: 'plane', vert: template.replace('[[0]]', vals[0]), frag: 'vec3 L = normalize(vec3(0.8, 0.9, 0.6));\ncol = vec3(0.35, 0.7, 1.0) * (0.12 + 0.88 * max(dot(N, L), 0.0));', camera: { yaw: 0.35, pitch: 0.45, dist: 3.3 } }),
              explain: `<p>The slope of A·sin(F·${ax}) is A·F·cos(F·${ax}). The normal tilts <b>against</b> the slope, so it's the negative. <code>0.0</code> leaves the old flat normal; <code>sin</code> is the height, not the slope.</p>`,
            };
          },
        },
        {
          id: 'slope-calc', title: 'Compute the slope', engine: 'numeric', rounds: 5,
          blurb: 'Derivatives by hand, for normals.',
          gen: (rng, level) => {
            const A = rng.pick([0.1, 0.2, 0.25, 0.5]), F = rng.pick([2, 4, 5, 10]);
            if (level === 1) return { prompt: `<code>pos.y += ${f(A)} * sin(pos.x * ${f(F)});</code><br>The slope is <code>${f(A)} * ${f(F)} * cos(pos.x * ${f(F)})</code>. What is the slope at x = 0?`, answer: A * F, explain: `<p>cos(0) = 1, so slope = ${n(A)} × ${n(F)} = <b>${n(A * F)}</b>. Steepest point of the wave.</p>` };
            const [x, c, txt] = rng.pick([[0, 1, '0'], [0.5, 0, 'PI/2'], [1, -1, 'PI']]);
            const slope = A * Math.PI * c;
            if (level === 2) return { prompt: `<code>pos.y += ${f(A)} * sin(pos.x * PI);</code><br>slope = ${f(A)} · PI · cos(pos.x · PI). What is the slope at x = ${n(x)}? (PI ≈ 3.14)`, answer: slope, tolerance: 0.02, explain: `<p>x·PI = ${txt}, cos = ${c}. slope = ${n(A)} × 3.14 × ${c} = <b>${slope.toFixed(2)}</b>.${c === 0 ? ' Zero slope: the top of the crest is flat, so the normal points straight up.' : ''}</p>` };
            return { prompt: `<code>pos.y += ${f(A)} * sin(pos.x * PI);</code><br>The un-normalised normal is <code>vec3(-slope, 1.0, 0.0)</code>. What is its <b>x component</b> at x = ${n(x)}? (PI ≈ 3.14)`, answer: -slope, tolerance: 0.02, explain: `<p>slope = ${n(A)} × 3.14 × cos(${txt}) = ${slope.toFixed(2)}, so x = −slope = <b>${(-slope).toFixed(2)}</b>.</p>` };
          },
        },
        {
          id: 'normals-quiz', title: 'Normal sense', engine: 'mcq', rounds: 6,
          blurb: 'True/false about displacement and normals.',
          questions: [
            tf('Changing pos in the vertex shader automatically updates the normal.', false, 'You must compute a new normal yourself.'),
            tf('cross(dFdx(P), dFdy(P)) gives a faceted (per-triangle) normal.', true, 'It measures the actual triangle surface between pixels.'),
            tf('For y = A·sin(F·x), the normal is normalize(vec3(-A·F·cos(F·x), 1, 0)).', true, 'Perpendicular to the tangent (1, slope).', 2),
            q('Cheapest way to get normals for a noise displacement in the vertex shader?', ['Sample the height at two nearby points and use a cross product', 'Re-import the mesh', 'Use the uv as the normal'], 'Finite differences: 2 extra samples, works for anything.'),
            q('Lighting on a displaced ocean looks flat. The silhouette shows waves. Cause?', ['Stale normals', 'Missing texture', 'Wrong blend mode'], 'Shape changed, normals didn\'t.'),
            tf('Normals must be re-normalized after interpolation in the fragment shader.', true, 'Interpolated unit vectors get shorter between vertices.', 2),
            tf('A normal map can add lighting detail without moving any vertices.', true, 'It changes normals per pixel only — no displacement.'),
            q('Where does the minus in vec3(−slope, 1, 0) come from?', ['A surface rising to the right faces up-left', 'GLSL requires negative x', 'It flips the texture'], 'The normal is perpendicular to the tangent (1, slope).'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      id: 'vertex.data',
      title: 'Vertex colour & data',
      blurb: 'Extra numbers painted on vertices: masks for wind, blending and more.',
      lesson: [
        {
          title: 'Vertices carry more than position',
          body: `<p>Each vertex can store extra data alongside its position and normal:</p>
<ul>
<li><b>Vertex colour</b> (RGBA): 4 free numbers per vertex, painted by artists in Blender/Maya/Houdini.</li>
<li><b>Extra UV sets</b> (uv1, uv2…): lightmap coordinates, or just more numbers.</li>
</ul>
<p>Despite the name, vertex "colour" is rarely shown as colour. It's used as <b>masks</b>: "how much should this vertex sway?", "how much moss here?", "how occluded is this corner?".</p>
<div class="analogy">🏷️ <b>Analogy:</b> sticky notes on each corner of the mesh. The shader reads the note and acts on it.</div>`,
        },
        {
          title: 'A painted mask',
          body: `<p>Here a moss mask was "painted" per vertex (1 = moss, 0 = rock), and the fragment shader blends two materials with it.</p>
<p>Because the mask lives on vertices, it's <b>interpolated</b> across each triangle: the border is soft and follows the triangle grid (see the wireframe). It can't be sharper than the mesh.</p>`,
          shaders: [
            { spec: { mesh: 'sphere', vert: '// the "painted" vertex mask (stand-in for a vertex colour)\nfloat m = step(0.0, pos.y + 0.35 * sin(pos.x * 4.0) * cos(pos.z * 3.0));\nuv.x = m; // hand it to the fragment shader', frag: LIT('mix(vec3(0.5, 0.45, 0.42), vec3(0.3, 0.6, 0.2), uv.x)'), camera: { spin: 0.3 } }, label: 'rock / moss blend from the mask' },
            { spec: { mesh: 'sphere', wire: true, vert: 'float m = step(0.0, pos.y + 0.35 * sin(pos.x * 4.0) * cos(pos.z * 3.0));\nuv.x = m;', frag: 'col = mix(vec3(0.4), vec3(0.4, 1.0, 0.3), uv.x);', camera: { spin: 0.3 } }, label: 'the mask on the vertices' },
          ],
          after: '<div class="note">Vertex data = <b>low frequency</b> (smooth, large-scale) information, almost free. For crisp detail, use a texture instead.</div>',
        },
        {
          title: 'Wind weights',
          body: `<p>The classic use: <b>wind</b>. If you move every vertex of a grass blade by the same amount, the whole blade slides — roots and all!</p>
<p>A <b>weight</b> per vertex fixes it: 0 at the root (don't move), 1 at the tip (move fully). Often stored in vertex colour red, or computed from height.</p>
<p>Toggle the mask and watch the root.</p>`,
          controls: [
            { name: 'a', label: 'wind strength', min: 0, max: 0.6, step: 0.01, value: 0.35 },
            { name: 'm', label: 'use weight mask (0/1)', min: 0, max: 1, step: 1, value: 1 },
          ],
          shader: (v) => ({
            mesh: 'plane',
            vert: `float hgt = uv.y;                     // 0 at root, 1 at tip
float wid = 0.22 * (1.0 - hgt * 0.85);  // blade gets thinner
pos = vec3((uv.x - 0.5) * 2.0 * wid, hgt * 1.8 - 0.9, 0.0);
float weight = mix(1.0, hgt * hgt, uM);  // the wind mask
pos.x += uAmt * weight * sin(uTime * 2.0);
normal = vec3(0.0, 0.0, 1.0);`,
            frag: 'col = mix(vec3(0.1, 0.35, 0.1), vec3(0.55, 0.9, 0.35), uv.y);\nif (P.y < -0.88) col = vec3(0.45, 0.3, 0.2);',
            uniforms: { uAmt: v.a, uM: v.m }, camera: { yaw: 0, pitch: 0.05, dist: 2.6 }, bg: [0.12, 0.14, 0.2],
          }),
          code: (v) => v.m ? `float weight = hgt * hgt;   // 0 at root, 1 at tip\npos.x += ${f(v.a, 2)} * weight * sin(uTime * 2.0);` : `float weight = 1.0;         // no mask: everything moves!\npos.x += ${f(v.a, 2)} * weight * sin(uTime * 2.0);`,
          after: '<div class="tip">Trees often use several channels: R = main trunk bend, G = branch flutter phase, B = leaf edge flutter. SpeedTree and Unreal\'s <i>SimpleGrassWind</i> / <i>PivotPainter</i> work this way.</div>',
        },
        {
          title: 'Why weight = height²?',
          body: `<p>A real stem bends more and more towards the top. Squaring the height gives a curve that stays near 0 at the bottom and rises quickly near the tip.</p>`,
          graph: { fns: [{ f: (x) => x, label: 'weight = h' }, { f: (x) => x * x, label: 'weight = h²' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          after: '<p>With <code>h</code> the blade bends like a stiff stick; with <code>h²</code> it curves like a real stem.</p>',
          quiz: { q: 'A vertex at the root has weight 0. Wind strength is 0.4. How far does it move?', options: ['0', '0.4', '0.2'], answer: 0, explain: '0.4 × 0 = 0: the root stays planted.' },
        },
      ],
      games: [
        {
          id: 'vertex-or-texture', title: 'Vertex data or texture?', engine: 'buckets', rounds: 2,
          blurb: 'Smooth, large-scale info fits on vertices. Fine detail needs a texture.',
          gen: () => ({
            prompt: 'Where would you store this?',
            sub: 'Vertex data = smooth, one value per corner, nearly free. Texture = any detail, costs memory and a sample.',
            buckets: ['🔺 Vertex data', '🖼️ Texture'],
            count: 10,
            items: [
              { text: 'How much each part of a tree sways in the wind', bucket: 0 },
              { text: 'A shop logo painted on a wall', bucket: 1, why: 'Needs sharp detail much finer than the mesh.' },
              { text: 'Which areas of a big rock get moss (large patches)', bucket: 0 },
              { text: 'Fine scratches on a metal sword', bucket: 1 },
              { text: 'Darkening deep inside the corners of a room (large-scale AO)', bucket: 0, why: 'Large, smooth falloff — classic baked vertex AO.' },
              { text: 'Freckles on a face', bucket: 1 },
              { text: 'Grass blade: 0 at the root, 1 at the tip', bucket: 0 },
              { text: 'Text on a book cover', bucket: 1 },
              { text: 'Blend between two terrain layers on a dense terrain mesh', bucket: 0 },
              { text: 'Wood grain pattern', bucket: 1 },
              { text: 'A per-leaf random phase so leaves flutter out of sync', bucket: 0, why: 'One value per leaf card — perfect for vertex colour.' },
              { text: 'A detailed normal map of bricks', bucket: 1 },
            ],
          }),
        },
        {
          id: 'sway-calc', title: 'How far does it sway?', engine: 'numeric', rounds: 5,
          blurb: 'Compute wind offsets from vertex weights.',
          gen: (rng, level) => {
            const amp = rng.pick([0.2, 0.4, 0.5, 0.8]);
            if (level === 1) {
              const w = rng.pick([0, 0.25, 0.5, 1]);
              return { prompt: `<code>pos.x += ${f(amp)} * vertexColor.r;</code><br>This vertex has vertexColor.r = ${n(w)}. How far does it move in x?`, answer: amp * w, explain: `<p>${n(amp)} × ${n(w)} = <b>${n(amp * w)}</b>.</p>` };
            }
            if (level === 2 || rng.chance(0.5)) {
              const hh = rng.pick([0.5, 0.25, 1, 0.75]);
              return { prompt: `<code>float weight = hgt * hgt;<br>pos.x += ${f(amp)} * weight;</code><br>The vertex is at hgt = ${n(hh)}. How far does it move? (2 decimals)`, answer: amp * hh * hh, explain: `<p>weight = ${n(hh)}² = ${n(hh * hh)}. Offset = ${n(amp)} × ${n(hh * hh)} = <b>${n(amp * hh * hh)}</b>.</p>` };
            }
            const w1 = rng.pick([0, 0.2, 0.4]), w2 = rng.pick([0.6, 0.8, 1]);
            const wm = (w1 + w2) / 2;
            return { prompt: `Two vertices have wind weights ${n(w1)} and ${n(w2)}. A pixel lies exactly halfway between them on the edge. <code>offset = ${f(amp)} * weight</code> is computed in the vertex shader. What offset does that pixel's surface point effectively get?`, sub: 'The positions are moved per vertex; the surface between them is a straight interpolation.', answer: amp * wm, explain: `<p>Each vertex moves: ${n(amp * w1)} and ${n(amp * w2)}. Halfway between: (${n(amp * w1)} + ${n(amp * w2)}) / 2 = <b>${n(amp * wm)}</b>.</p>` };
          },
        },
        {
          id: 'data-quiz', title: 'Data detective', engine: 'mcq', rounds: 6,
          blurb: 'Concept questions on vertex colours and masks.',
          questions: [
            q('Vertex colour is mostly used as…', ['Masks and weights for shaders', 'The final colour of the object', 'A replacement for textures'], 'Wind weights, blend masks, AO, random phases…'),
            tf('A vertex-colour mask can be sharper than the triangles of the mesh.', false, 'It\'s interpolated across triangles, so detail is limited by the vertex density.'),
            tf('Vertex data is almost free: it\'s already read for every vertex.', true, 'Just a few more bytes per vertex.'),
            q('Grass roots slide around in the wind. Fix?', ['Multiply the sway by a weight that is 0 at the root', 'Lower the wind speed', 'Use a bigger texture'], 'A height/vertex-colour mask pins the root.'),
            q('Why use weight = height² rather than height?', ['It bends more near the tip, like a real stem', 'It is cheaper', 'It avoids negative values'], 'Curved bending looks natural.', { level: 2 }),
            tf('An artist can paint vertex colours in Blender.', true, 'Vertex Paint mode.'),
            q('Leaves all flutter in sync and look fake. Which vertex data helps?', ['A random phase value per leaf', 'A brighter vertex colour', 'More UV sets for the bark'], 'Add the phase inside sin(): sin(time + phase).', { level: 2 }),
            tf('Extra UV channels can store any numbers, not only texture coordinates.', true, 'They\'re just per-vertex floats.', 2),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      id: 'vertex.billboard',
      title: 'Billboards & vertex tricks',
      blurb: 'Quads that always face you, twists, morphs and squash.',
      lesson: [
        {
          title: 'Billboards: always face the camera',
          body: `<p>Particles, distant trees, grass cards and light glows are often just a <b>flat quad</b> with a picture. From the side, a flat quad disappears into a thin line.</p>
<p>A <b>billboard</b> rebuilds the quad every frame from the camera's <b>right</b> and <b>up</b> directions, so it always faces you.</p>
<p>Orbit the camera with billboarding off, then on.</p>`,
          controls: [
            { name: 'y', label: 'camera orbit', min: -1.5, max: 1.5, step: 0.01, value: 1.2 },
            { name: 'b', label: 'billboard (0/1)', min: 0, max: 1, step: 1, value: 0 },
          ],
          shader: (v) => ({
            mesh: 'plane',
            vert: `vec2 c = (uv - 0.5) * 1.6;               // corner offset of this vertex
vec3 toCam = normalize(uCamPos);            // object sits at the origin
vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
vec3 up    = cross(toCam, right);
vec3 card  = vec3(c.x, c.y, 0.0);           // a plain card facing +z
pos = mix(card, right * c.x + up * c.y, uOn);`,
            frag: 'vec2 p = uv - 0.5;\nif (length(p) > 0.48) discard;\ncol = vec3(1.0, 0.82, 0.25);\nif (length(p - vec2(-0.15, 0.1)) < 0.06 || length(p - vec2(0.15, 0.1)) < 0.06) col = vec3(0.1);\nif (abs(length(p - vec2(0.0, 0.02)) - 0.24) < 0.03 && p.y < -0.05) col = vec3(0.1);',
            uniforms: { uOn: v.b }, camera: { yaw: v.y, pitch: 0.25, dist: 3.4 },
          }),
          code: (v) => `vec3 right = normalize(cross(vec3(0,1,0), toCam));\nvec3 up    = cross(toCam, right);\npos = ${v.b ? 'right * c.x + up * c.y;   // billboard ON' : 'vec3(c.x, c.y, 0.0);      // billboard OFF'}`,
        },
        {
          title: 'Spherical vs cylindrical',
          body: `<ul>
<li><b>Spherical</b> billboard: faces the camera completely, even when you look from above. Good for particles, glows, smoke puffs.</li>
<li><b>Cylindrical</b> (axis-aligned): only turns around the <b>vertical</b> axis, so it stays upright. Good for trees and grass seen from a distance (a tree tilting back when you look down looks wrong).</li>
</ul>
<pre class="code">// cylindrical: keep "up" as world up
vec3 up = vec3(0.0, 1.0, 0.0);
vec3 right = normalize(cross(up, toCam));</pre>
<div class="tip">Unity's particle system calls these <i>Billboard</i> and <i>Vertical Billboard</i>. Impostors go further: they swap between pre-rendered views of a mesh depending on the angle.</div>`,
          quiz: { q: 'Distant trees should stay upright when the camera looks down at them. Which billboard?', options: ['Cylindrical (rotate around Y only)', 'Spherical', 'No billboard'], answer: 0, explain: 'Cylindrical keeps the trunk vertical.' },
        },
        {
          title: 'Twist',
          body: `<p>Rotate each vertex around the Y axis by an angle that <b>grows with height</b>: the bottom stays still, the top turns most. That's a twist.</p>
<pre class="code">pos.xz = rot(pos.y * amount) * pos.xz;</pre>
<p>The stripes are painted with uv, so they show how the surface turned.</p>`,
          controls: [{ name: 't', label: 'twist amount', min: -3, max: 3, step: 0.05, value: 1.2 }],
          shader: (v) => ({ mesh: 'sphere', vert: 'pos.xz = rot(pos.y * uT) * pos.xz;', frag: FLAT('mix(vec3(0.95, 0.4, 0.4), vec3(0.95), step(0.5, fract(uv.x * 8.0)))'), uniforms: { uT: v.t }, camera: { pitch: 0.3 } }),
          code: (v) => `pos.xz = rot(pos.y * ${f(v.t, 2)}) * pos.xz;  // y = −1 turns ${(-v.t).toFixed(2)} rad, y = 1 turns ${v.t.toFixed(2)} rad`,
        },
        {
          title: 'Morph & squash',
          body: `<p><b>Morph</b>: blend each vertex between two shapes with <code>mix()</code>. Projecting a sphere's vertices onto a cube gives a sphere→cube morph.</p>
<p><b>Squash & stretch</b>: scale y up and x/z down (keeping the volume roughly the same) — the bouncing-ball animation principle, done in the vertex shader.</p>`,
          controls: [
            { name: 'm', label: 'sphere → cube', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 's', label: 'stretch', min: 0.6, max: 1.6, step: 0.01, value: 1 },
          ],
          shader: (v) => ({ mesh: 'sphere', vert: 'vec3 cube = pos / max(abs(pos.x), max(abs(pos.y), abs(pos.z))) * 0.8;\npos = mix(pos, cube, uM);\npos *= vec3(1.0 / sqrt(uS), uS, 1.0 / sqrt(uS));', frag: FLAT('vec3(0.4, 0.75, 1.0)'), uniforms: { uM: v.m, uS: v.s } }),
          code: (v) => `vec3 cube = pos / max(abs(pos.x), max(abs(pos.y), abs(pos.z))) * 0.8;\npos = mix(pos, cube, ${f(v.m, 2)});\npos *= vec3(1.0 / sqrt(${f(v.s, 2)}), ${f(v.s, 2)}, 1.0 / sqrt(${f(v.s, 2)}));`,
          after: '<div class="tip">Taken to the extreme: <b>vertex animation textures</b> (VAT) store a whole simulation (cloth, destruction) as positions in a texture that the vertex shader reads every frame.</div>',
        },
      ],
      games: [
        {
          id: 'match-twist', title: 'Match the deformation', engine: 'slider', rounds: 4,
          blurb: 'Tune twist (and more) to match the target shape.',
          gen: (rng, level) => {
            const T = rng.step(-2.5, 2.5, 0.5) || 1.5;
            const S = level >= 2 ? rng.pick([0.7, 0.8, 1.25, 1.4]) : 1;
            const Mo = level === 3 ? rng.pick([0.3, 0.6, 1]) : 0;
            const params = [{ name: 't', label: 'twist', min: -3, max: 3, step: 0.05, target: T }];
            if (level >= 2) params.push({ name: 's', label: 'stretch', min: 0.6, max: 1.6, step: 0.01, target: S });
            if (level === 3) params.push({ name: 'm', label: 'sphere → cube', min: 0, max: 1, step: 0.01, target: Mo });
            const build = (p) => ({ mesh: 'sphere', vert: 'vec3 cube = pos / max(abs(pos.x), max(abs(pos.y), abs(pos.z))) * 0.8;\npos = mix(pos, cube, uM);\npos *= vec3(1.0 / sqrt(uS), uS, 1.0 / sqrt(uS));\npos.xz = rot(pos.y * uT) * pos.xz;', frag: FLAT('mix(vec3(0.95, 0.4, 0.4), vec3(0.95), step(0.5, fract(uv.x * 8.0)))'), uniforms: { uT: p.t, uS: p.s ?? 1, uM: p.m ?? 0 }, camera: { pitch: 0.3 } });
            return {
              prompt: 'Match the target shape.',
              sub: level === 1 ? 'Watch which way the stripes lean, and how much.' : 'Start with the overall shape (stretch/morph), then the twist.',
              params, build,
              code: (p) => `pos = mix(pos, cube, ${f(p.m ?? 0, 2)});\npos *= vec3(1.0 / sqrt(${f(p.s ?? 1, 2)}), ${f(p.s ?? 1, 2)}, 1.0 / sqrt(${f(p.s ?? 1, 2)}));\npos.xz = rot(pos.y * ${f(p.t, 2)}) * pos.xz;`,
              tolerance: 0.06,
              explain: `<p>Target: twist ${n(T)}${level >= 2 ? `, stretch ${n(S)}` : ''}${level === 3 ? `, morph ${n(Mo)}` : ''}.</p><p>A positive twist turns the top one way and the bottom the other; the stripes lean accordingly.</p>`,
            };
          },
        },
        {
          id: 'fill-billboard', title: 'Build the trick', engine: 'codefill', rounds: 4,
          blurb: 'Complete vertex tricks: billboards, twists and pulses.',
          gen: (rng) => {
            const V = [
              {
                template: 'vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));\nvec3 up = cross(toCam, right);\npos = [[0]] * c.x + [[1]] * c.y;',
                slots: [{ options: ['right', 'up', 'toCam'], answer: 'right' }, { options: ['up', 'right', 'toCam'], answer: 'up' }],
                build: (vals) => ({ mesh: 'plane', vert: `vec2 c = (uv - 0.5) * 1.6;\nvec3 toCam = normalize(uCamPos);\nvec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));\nvec3 up = cross(toCam, right);\npos = ${vals[0]} * c.x + ${vals[1]} * c.y;`, frag: 'vec2 p = uv - 0.5;\nif (length(p) > 0.48) discard;\ncol = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.4, 0.2), p.x + 0.5);', camera: { yaw: 1.1, pitch: 0.25, dist: 3.4 } }),
                explain: 'The quad\'s x offset goes along the camera\'s <b>right</b>, its y offset along the camera\'s <b>up</b>. Using toCam would stretch it towards you (edge-on).',
              },
              {
                template: 'pos.xz = rot(pos.[[0]] * [[1]]) * pos.xz;',
                slots: [{ options: ['y', 'x', 'z'], answer: 'y' }, { options: ['1.5', '-1.5', '0.0'], answer: rng.pick(['1.5', '-1.5']) }],
                build: (vals) => ({ mesh: 'sphere', vert: `pos.xz = rot(pos.${vals[0]} * ${vals[1]}) * pos.xz;`, frag: FLAT('mix(vec3(0.95, 0.4, 0.4), vec3(0.95), step(0.5, fract(uv.x * 8.0)))'), camera: { pitch: 0.3 } }),
                explain: 'A twist around Y uses the <b>height</b> (pos.y) to decide the angle; the sign decides the direction.',
              },
              {
                template: 'pos *= 1.0 + [[0]] * sin([[1]]);',
                slots: [{ options: ['0.3', '3.0', '-1.0'], answer: '0.3' }, { options: ['uTime * 4.0', 'pos.y * 4.0', 'uv.x'], answer: rng.pick(['uTime * 4.0', 'pos.y * 4.0']) }],
                build: (vals) => ({ mesh: 'sphere', vert: `pos *= 1.0 + ${vals[0]} * sin(${vals[1]});`, frag: FLAT('vec3(0.5, 0.8, 0.4)'), camera: { pitch: 0.3 } }),
                explain: '<code>sin(uTime·k)</code> makes the whole mesh pulse over time (same scale for all vertices); <code>sin(pos.y·k)</code> makes the scale depend on height — bulges. In the target picture, check: is the shape still a sphere?',
              },
            ];
            const vr = rng.pick(V);
            return { prompt: 'Complete the vertex code so it matches the target:', template: vr.template, slots: vr.slots, build: vr.build, explain: `<p>${vr.explain}</p>` };
          },
        },
        {
          id: 'tricks-quiz', title: 'Trick questions', engine: 'mcq', rounds: 7,
          blurb: 'Concept check on billboards and vertex tricks.',
          questions: [
            q('A billboard quad is built from which two camera vectors?', ['Right and up', 'Forward and up', 'Position and forward'], 'Offsets along right/up keep the quad in a plane facing the camera.'),
            q('Which billboard keeps distant trees upright when you look down?', ['Cylindrical (Y-axis only)', 'Spherical', 'Screen-aligned'], 'It only rotates around world up.'),
            tf('A flat quad without billboarding becomes a thin line when viewed edge-on.', true, 'That\'s why billboards exist.'),
            q('pos.xz = rot(pos.y * k) * pos.xz; does what?', ['Twists the mesh around Y, more with height', 'Scales the mesh', 'Moves it up'], 'The angle depends on pos.y.'),
            q('mix(pos, cubePos, t) with t = 0.5 gives…', ['A shape halfway between sphere and cube', 'A cube', 'A sphere at half size'], 'Per-vertex lerp of positions = morph.'),
            tf('Vertex tricks change the shape, so normals may need fixing afterwards.', true, 'Same issue as displacement.'),
            q('What are vertex animation textures (VAT)?', ['Textures storing baked vertex positions per frame', 'Textures that animate uv', 'A type of normal map'], 'The vertex shader reads the stored positions each frame.', { level: 2 }),
            tf('Billboarding is usually done in the fragment shader.', false, 'It moves the corners → vertex shader.'),
            q('To make a mesh pulse, which is enough?', ['pos *= 1.0 + 0.2 * sin(uTime);', 'col *= sin(uTime);', 'uv *= sin(uTime);'], 'Scaling the position over time.'),
          ],
        },
      ],
    },
  ],
};
