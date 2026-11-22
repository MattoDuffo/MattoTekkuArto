// Topic — Vector maths for shaders: arrows vs points, length/normalize, dot, cross,
// reflect, projections. Heavy use of the drag-the-arrow (vector) engine.
import { tf, q, distinct, f, n, nv, G, vectorPlane, h } from './_kit.js';

const r2 = (x) => +(+x).toFixed(3);
const DEG = Math.PI / 180;
const ang = (v) => Math.atan2(v[1], v[0]);
const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const unitAt = (deg) => [Math.cos(deg * DEG), Math.sin(deg * DEG)];
const v2 = (p) => `vec2(${f(p[0])}, ${f(p[1])})`;
const v3 = (p) => `vec3(${f(p[0])}, ${f(p[1])}, ${f(p[2])})`;
/** score that falls off smoothly with an angle error (radians) */
const angScore = (err, perfect = 6 * DEG, zero = 30 * DEG) => (err <= perfect ? 1 : Math.max(0, 1 - (err - perfect) / (zero - perfect)));

/** Lesson visual helper: draw(P, v) on a fresh vector plane; may return readout html */
const plane = (R, draw, size = 280) => (el, v) => {
  const P = vectorPlane(R, size); P.clear();
  const ro = draw(P, v || {});
  el.append(P.el);
  if (ro) el.append(h('div.readout', { html: ro }));
};
/** Pseudo-3D drawing: project with a yaw/pitch camera onto a vector plane. */
const proj = (v, yaw, pitch = 0.45) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = c * v[0] + s * v[2], z = -s * v[0] + c * v[2];
  return [x, v[1] * Math.cos(pitch) - z * Math.sin(pitch)];
};
function draw3D(P, yaw, arrows) {
  const ax = [[[1.6, 0, 0], 'x'], [[0, 1.6, 0], 'y'], [[0, 0, 1.6], 'z']];
  ax.forEach(([a, l]) => P.arrow(proj(a, yaw), '#4a4f63', l, [0, 0], 1.5));
  arrows.forEach((a) => P.arrow(proj(a.v, yaw), a.color, a.label, [0, 0], a.w || 3));
}

export default {
  id: 'vectors',
  title: 'Vector maths for shaders',
  icon: '➡️',
  blurb: 'Arrows, lengths, dot, cross and reflect — the maths behind lighting and effects.',
  cheatsheet: `
<p>A <code>vec2</code>/<code>vec3</code> is either a <b>point</b> (a position) or an <b>arrow</b> (a direction + length). <b>B − A</b> = the arrow from A to B.</p>
<ul>
<li><code>length(v)</code> = √(x² + y²) — how long. <code>distance(a, b)</code> = <code>length(b - a)</code>.</li>
<li><code>normalize(v)</code> = <code>v / length(v)</code> — same direction, length 1 (a <b>unit</b> vector). Directions for lighting must be unit length.</li>
<li><code>dot(a, b)</code> = a.x·b.x + a.y·b.y (+ a.z·b.z). For unit vectors = <b>cos(angle)</b>: 1 same way, 0 perpendicular, −1 opposite. <code>dot(v, unitDir)</code> = how far v reaches along dir (projection).</li>
<li><code>cross(a, b)</code> (3D only) = a vector perpendicular to both. Right-hand rule: <code>cross(x, y) = z</code>, <code>cross(y, x) = -z</code>. Length = |a||b|·sin(angle).</li>
<li><code>reflect(I, N)</code> = <code>I - 2.0 * dot(N, I) * N</code> (N must be unit). I points <b>into</b> the surface.</li>
<li>Directional gradient: <code>dot(uv - 0.5, dir)</code> grows along dir. Diffuse light: <code>max(dot(N, L), 0.0)</code>.</li>
</ul>`,
  concepts: [
    // ==================================================================
    {
      id: 'vectors.arrows',
      title: 'Arrows & points',
      blurb: 'The same vec2 can be a place or a direction. B − A gives the arrow from A to B.',
      lesson: [
        {
          title: 'Two meanings of a vec2',
          body: `<p>A <code>vec2(1.0, 0.5)</code> is just two numbers. We use it in two ways:</p>
<ul><li>as a <b>point</b>: a place ("the pixel at uv (0.3, 0.7)", "the light is at (1, 2)")</li>
<li>as an <b>arrow</b> (vector): a direction plus a length ("move 1 right and 0.5 up", "the light shines this way")</li></ul>
<div class="analogy">🗺️ <b>Analogy:</b> a point is an <b>address</b>. An arrow is <b>directions</b> ("walk 3 blocks east"). Directions work from any starting address.</div>
<p>Below, the same arrow drawn from three different starting points — it's the same vector each time.</p>`,
          controls: [
            { name: 'x', label: 'arrow.x', min: -1, max: 1, step: 0.25, value: 0.75 },
            { name: 'y', label: 'arrow.y', min: -1, max: 1, step: 0.25, value: 0.5 },
          ],
          visual: plane(2, (P, v) => {
            [[-1.5, -1], [0, 0], [-0.5, 1]].forEach((s, i) => { P.dot(s, '#9aa0b4', 4); P.arrow([v.x, v.y], ['#ffd479', '#ff9f43', '#ff7ab2'][i], i === 1 ? 'v' : '', s); });
            return `v = ${v2([v.x, v.y])}  (same arrow, three starts)`;
          }),
        },
        {
          title: 'B − A: the arrow from A to B',
          body: `<p>Subtracting two points gives the arrow that goes <b>from the first to the second</b>:</p>
<pre class="code">vec2 d = B - A;   // "how do I get from A to B?"</pre>
<p>Rule to remember: <b>tip minus tail</b> (destination minus start).</p>`,
          controls: [
            { name: 'ax', label: 'A.x', min: -1.5, max: 1.5, step: 0.25, value: -1 },
            { name: 'ay', label: 'A.y', min: -1.5, max: 1.5, step: 0.25, value: -0.5 },
            { name: 'bx', label: 'B.x', min: -1.5, max: 1.5, step: 0.25, value: 1 },
            { name: 'by', label: 'B.y', min: -1.5, max: 1.5, step: 0.25, value: 0.75 },
          ],
          visual: plane(2, (P, v) => {
            const A = [v.ax, v.ay], B = [v.bx, v.by], d = G.sub(B, A);
            P.dot(A, '#6bdfff', 6); P.dot(B, '#ff7ab2', 6);
            P.arrow(d, '#ffd479', 'B − A', A);
            P.arrow(d, 'rgba(255,212,121,0.45)', 'same arrow from 0', [0, 0], 2);
            return `A = ${nv(A)}   B = ${nv(B)}\nB − A = ${nv(d)}`;
          }),
          quiz: { q: 'A = (1, 1), B = (3, 2). What is the arrow from A to B?', options: ['(−2, −1)', '(2, 1)', '(4, 3)'], answer: 1, explain: 'B − A = (3 − 1, 2 − 1) = (2, 1). Tip minus tail.' },
        },
        {
          title: 'Adding = walking',
          body: `<p><b>point + arrow = new point</b>: start at A, walk along d, arrive at A + d.</p>
<p><b>arrow + arrow = combined arrow</b>: walk a, then walk b. Put them tip-to-tail.</p>`,
          controls: [
            { name: 'bx', label: 'b.x', min: -1.5, max: 1.5, step: 0.25, value: -0.5 },
            { name: 'by', label: 'b.y', min: -1.5, max: 1.5, step: 0.25, value: 1 },
          ],
          visual: plane(2, (P, v) => {
            const a = [1, 0.25], b = [v.bx, v.by], s = G.add(a, b);
            P.arrow(a, '#6bdfff', 'a'); P.arrow(b, '#ff7ab2', 'b', a); P.arrow(s, '#ffd479', 'a + b', [0, 0], 3.5);
            return `a + b = ${nv(a)} + ${nv(b)} = ${nv(s)}`;
          }),
          after: '<div class="tip">💡 Scaling an arrow: <code>2.0 * v</code> is twice as long, <code>-v</code> points the opposite way, <code>0.5 * v</code> half as long. Same direction (or exactly opposite).</div>',
        },
        {
          title: 'In a shader: uv − centre',
          body: `<p>Every pixel can compute the arrow <b>from the centre to itself</b>: <code>d = uv - 0.5</code>.</p>
<p>Below, <code>d.x</code> is shown in red and <code>d.y</code> in green (negative parts are black). The pink arrow is d for the pixel you pick with the sliders.</p>
<p>This arrow is the start of almost every radial effect: circles (its length), spirals and rays (its angle), ripples…</p>`,
          controls: [
            { name: 'x', label: 'pixel uv.x', min: 0, max: 1, step: 0.05, value: 0.8 },
            { name: 'y', label: 'pixel uv.y', min: 0, max: 1, step: 0.05, value: 0.3 },
          ],
          shader: (v) => ({ frag: 'vec2 d = uv - 0.5;\ncol = vec3(max(d * 2.0, 0.0), 0.0);\nfloat s = sdSegment(uv, vec2(0.5), uP);\ncol = mix(col, vec3(1.0, 0.48, 0.7), 1.0 - smoothstep(0.004, 0.009, s));\ncol = mix(col, vec3(1.0), 1.0 - smoothstep(0.012, 0.02, length(uv - uP)));', uniforms: { uP: [v.x, v.y] } }),
          code: (v) => `vec2 d = uv - 0.5;\n// at uv ${nv([v.x, v.y])}: d = ${nv([v.x - 0.5, v.y - 0.5])}`,
        },
      ],
      games: [
        {
          id: 'drag-diff', title: 'Arrow from A to B', engine: 'vector', rounds: 5,
          blurb: 'Drag the arrow that takes you from A to B.',
          gen: (rng, level) => {
            const st = level === 3 ? 0.25 : 0.5;
            let A, B, d;
            do { A = [rng.step(-1.5, 1.5, st), rng.step(-1.5, 1.5, st)]; B = [rng.step(-1.5, 1.5, st), rng.step(-1.5, 1.5, st)]; d = G.sub(B, A); }
            while (G.length(d) < 0.7 || Math.abs(d[0]) > 2 || Math.abs(d[1]) > 2);
            return {
              prompt: `Drag the yellow arrow (from the origin) so it equals <b>B − A</b>.`,
              sub: level === 1 ? 'The orange copy shows your arrow starting at A — make it land on B.' : `A = ${nv(A)}, B = ${nv(B)}`,
              fixed: [{ v: A, color: '#6bdfff', label: 'A' }, { v: B, color: '#ff7ab2', label: 'B' }],
              drag: [{ v: [0.5, 0], label: 'd', snap: st }],
              derived: level < 3 ? (vs) => [{ v: vs[0], from: A, color: 'rgba(255,159,67,0.8)' }] : undefined,
              readout: (vs) => `d = ${nv(vs[0])}`,
              check: (vs) => { const e = G.distance(vs[0], d); return e < 0.1 ? 1 : Math.max(0, 1 - e); },
              answer: [d],
              explain: `<p>B − A = (${n(B[0])} − ${n(A[0])}, ${n(B[1])} − ${n(A[1])}) = <b>${nv(d)}</b>. Tip minus tail: destination minus start.</p>`,
            };
          },
        },
        {
          id: 'drag-sum', title: 'Tip to tail', engine: 'vector', rounds: 5,
          blurb: 'Drag the result of adding (or subtracting) two arrows.',
          gen: (rng, level) => {
            const pick = () => [rng.step(-1.5, 1.5, 0.5), rng.step(-1.5, 1.5, 0.5)];
            let a, b, res, op;
            do {
              a = pick(); b = pick();
              op = level === 3 ? rng.pick(['+', '-', '2a']) : level === 2 ? rng.pick(['+', '-']) : '+';
              res = op === '+' ? G.add(a, b) : op === '-' ? G.sub(a, b) : G.add(G.mul(a, 2), b);
            } while (G.length(a) < 0.5 || G.length(b) < 0.5 || G.length(res) < 0.5 || Math.max(...res.map(Math.abs)) > 2);
            const label = op === '+' ? 'a + b' : op === '-' ? 'a − b' : '2a + b';
            return {
              prompt: `Drag the yellow arrow to <b>${label}</b>.`,
              sub: op === '-' ? 'a − b = a + (−b): walk a, then walk b backwards.' : 'Put the arrows tip-to-tail.',
              fixed: [{ v: a, color: '#6bdfff', label: 'a' }, { v: b, color: '#ff7ab2', label: 'b' }],
              drag: [{ v: [0, 0.5], label: label, snap: 0.25 }],
              readout: (vs) => `yours = ${nv(vs[0])}`,
              check: (vs) => { const e = G.distance(vs[0], res); return e < 0.1 ? 1 : Math.max(0, 1 - e); },
              answer: [res],
              explain: `<p>${label} = <b>${nv(res)}</b>. Component by component: x and y are added (or subtracted) separately.</p>`,
            };
          },
        },
        {
          id: 'sub-points', title: 'Point maths', engine: 'numeric', rounds: 6,
          blurb: 'Compute arrows between points and from the centre.',
          gen: (rng, level) => {
            const kind = rng.pick(level === 1 ? ['ba', 'centre'] : ['ba', 'centre', 'walk', 'mid']);
            if (kind === 'centre') {
              const u = [rng.step(0, 1, 0.1), rng.step(0, 1, 0.1)];
              const ans = G.sub(u, 0.5).map(r2);
              return { prompt: `A pixel at <b>uv = ${nv(u)}</b>. What is <code>d</code>?`, code: 'vec2 d = uv - 0.5;', answer: ans, wrap: 'vec2', explain: `<p>${nv(u)} − (0.5, 0.5) = <b>${nv(ans)}</b>: the arrow from the centre to the pixel.</p>` };
            }
            const A = [rng.int(-3, 3), rng.int(-3, 3)], B = [rng.int(-3, 3), rng.int(-3, 3)];
            if (kind === 'ba') { const ans = G.sub(B, A); return { prompt: `A = ${nv(A)}, B = ${nv(B)}. What is the arrow from <b>A to B</b>?`, answer: ans, wrap: 'vec2', explain: `<p>B − A = <b>${nv(ans)}</b> (tip minus tail).</p>` }; }
            if (kind === 'walk') { const d = [rng.int(-2, 2), rng.int(-2, 2)]; const ans = G.add(A, d); return { prompt: `Start at A = ${nv(A)} and walk along d = ${nv(d)}. Where do you end up?`, answer: ans, wrap: 'vec2', explain: `<p>A + d = <b>${nv(ans)}</b>.</p>` }; }
            const ans = G.mul(G.add(A, B), 0.5).map(r2);
            return { prompt: `A = ${nv(A)}, B = ${nv(B)}. What is the midpoint <code>mix(A, B, 0.5)</code>?`, answer: ans, wrap: 'vec2', explain: `<p>A + 0.5 × (B − A) = (A + B) / 2 = <b>${nv(ans)}</b>.</p>` };
          },
        },
        {
          id: 'point-or-arrow', title: 'Point or arrow?', engine: 'buckets', rounds: 2,
          blurb: 'Sort shader values: is it a position or a direction?',
          gen: () => ({
            prompt: 'Is this a point (a place) or an arrow (a direction)?',
            buckets: ['📍 Point', '➡️ Arrow / direction'],
            count: 10,
            items: [
              { text: 'the pixel\'s uv', bucket: 0 },
              { text: 'the camera position', bucket: 0 },
              { text: 'a surface normal N', bucket: 1, why: 'A normal says which way the surface faces.' },
              { text: 'the light direction L', bucket: 1 },
              { text: 'the centre of a circle', bucket: 0 },
              { text: 'wind velocity', bucket: 1 },
              { text: '<code>uv - 0.5</code>', bucket: 1, why: 'Point minus point = arrow (from the centre to the pixel).' },
              { text: 'world position P of a fragment', bucket: 0 },
              { text: '<code>normalize(camPos - P)</code> (view vector)', bucket: 1 },
              { text: 'a scroll speed <code>vec2(0.1, 0.0)</code>', bucket: 1 },
              { text: 'the spawn location of a particle', bucket: 0 },
              { text: 'the tangent T of a mesh', bucket: 1 },
            ],
          }),
        },
      ],
    },
    // ==================================================================
    {
      id: 'vectors.length',
      title: 'Length & normalize',
      blurb: 'How long an arrow is, and how to make it exactly 1 long.',
      lesson: [
        {
          title: 'Length = Pythagoras',
          body: `<p>An arrow (x, y) is the long side of a right triangle with sides x and y. So:</p>
<pre class="code">length(v) = sqrt(v.x * v.x + v.y * v.y)</pre>
<p>(In 3D just add <code>+ v.z * v.z</code>.) Drag the sliders — try (0.6, 0.8) or (1.2, 0.5).</p>`,
          controls: [
            { name: 'x', label: 'v.x', min: -1.5, max: 1.5, step: 0.1, value: 1.2 },
            { name: 'y', label: 'v.y', min: -1.5, max: 1.5, step: 0.1, value: 0.5 },
          ],
          visual: plane(2, (P, v) => {
            const p = [v.x, v.y];
            P.arrow([v.x, 0], '#6bdfff', 'x', [0, 0], 2); P.arrow([0, v.y], '#ff7ab2', 'y', [v.x, 0], 2);
            P.arrow(p, '#ffd479', 'v', [0, 0], 3.5);
            return `length = sqrt(${n(v.x)}² + ${n(v.y)}²)\n       = sqrt(${n(v.x * v.x, 2)} + ${n(v.y * v.y, 2)}) = ${n(G.length(p), 3)}`;
          }),
        },
        {
          title: 'Unit vectors',
          body: `<p>A vector with length exactly <b>1</b> is a <b>unit vector</b>. Its tip lies on the dashed circle of radius 1.</p>
<p><code>normalize(v)</code> keeps the direction and sets the length to 1: it divides by the length.</p>
<pre class="code">normalize(v) = v / length(v)</pre>`,
          controls: [
            { name: 'x', label: 'v.x', min: -1.8, max: 1.8, step: 0.1, value: 1.6 },
            { name: 'y', label: 'v.y', min: -1.8, max: 1.8, step: 0.1, value: 1.2 },
          ],
          visual: plane(2, (P, v) => {
            const p = [v.x, v.y], u = G.normalize(p);
            P.arrow(p, 'rgba(255,212,121,0.55)', 'v', [0, 0], 2.5); P.arrow(u, '#3ddc97', 'normalize(v)', [0, 0], 3.5);
            return `length(v) = ${n(G.length(p), 3)}\nnormalize(v) = ${nv(p)} / ${n(G.length(p), 3)} = ${nv(u, 3)}`;
          }),
          after: '<div class="note">Direction = "which way". Length = "how much". normalize() throws away the "how much".</div>',
        },
        {
          title: 'Why lighting needs unit vectors',
          body: `<p>Lighting uses <code>dot(N, L)</code> to ask "how much does this surface face the light?" (next concept). That only gives a sensible 0..1 answer if <b>N and L are both length 1</b>.</p>
<p>Below, the light vector is <i>not</i> normalized and the slider scales its length. Left: wrong (brightness changes with length). Right: <code>normalize(L)</code> — always correct.</p>`,
          controls: [{ name: 'k', label: 'length of L', min: 0.3, max: 3, step: 0.1, value: 2 }],
          shaders: [
            { spec: (v) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 L = vec3(0.6, 0.5, 0.62) * uK;\ncol = vec3(max(dot(s.xyz, L), 0.0)) * s.w;', uniforms: { uK: v.k } }), label: 'raw L ❌' },
            { spec: (v) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(0.6, 0.5, 0.62) * uK);\ncol = vec3(max(dot(s.xyz, L), 0.0)) * s.w;', uniforms: { uK: v.k } }), label: 'normalize(L) ✅' },
          ],
          code: (v) => `vec3 L = vec3(0.6, 0.5, 0.62) * ${f(v.k, 1)};  // length ≈ ${n(v.k, 2)}\nfloat diffuse = max(dot(N, normalize(L)), 0.0);`,
          after: '<div class="tip">💡 Normals coming from the vertex shader get <b>interpolated</b> across the triangle, which makes them slightly shorter than 1. That\'s why fragment shaders call <code>normalize(vNormal)</code> again.</div>',
        },
        {
          title: 'length() in shaders = distance',
          body: `<p><code>length(uv - centre)</code> is the distance from the centre to the pixel. You already used it for circles! And <code>distance(a, b)</code> is just <code>length(b - a)</code>.</p>`,
          controls: [{ name: 'r', label: 'radius', min: 0.05, max: 0.5, step: 0.01, value: 0.3 }],
          shader: (v) => ({ frag: 'float d = length(uv - 0.5);\ncol = vec3(fract(d * 10.0) * 0.3);\ncol = mix(col, vec3(1.0, 0.83, 0.47), step(d, uR));', uniforms: { uR: v.r } }),
          code: (v) => `float d = length(uv - 0.5);    // distance to centre\nif (d < ${f(v.r, 2)}) col = yellow;   // inside the circle`,
          quiz: { q: 'What is <code>length(vec2(0.3, 0.4))</code>?', options: ['0.7', '0.5', '0.25'], answer: 1, explain: 'sqrt(0.09 + 0.16) = sqrt(0.25) = 0.5. (A 3-4-5 triangle, scaled down.)' },
        },
      ],
      games: [
        {
          id: 'make-unit', title: 'Make it length 1', engine: 'vector', rounds: 5,
          blurb: 'Drag an arrow with an exact length in a given direction.',
          gen: (rng, level) => {
            const deg = rng.pick([0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 270, 300, 315]);
            const dir = unitAt(deg);
            if (level === 3 && rng.chance(0.5)) {
              const x = rng.pick([0.6, 0.8, -0.6, -0.8]);
              const y = Math.sqrt(1 - x * x);
              return {
                prompt: `Make a <b>unit</b> vector with <b>x = ${n(x)}</b> that points <b>up</b> (y > 0).`,
                sub: 'Use Pythagoras: x² + y² = 1.',
                drag: [{ v: [0, -1], snap: 0.05 }],
                readout: (vs) => `v = ${nv(vs[0], 2)}   length = ${n(G.length(vs[0]), 2)}`,
                check: (vs) => { const e = G.distance(vs[0], [x, y]); return e < 0.06 ? 1 : Math.max(0, 1 - e * 3); },
                answer: [[x, y]],
                explain: `<p>y = √(1 − ${n(x)}²) = √${n(1 - x * x)} = <b>${n(y)}</b>. So v = (${n(x)}, ${n(y)}).</p>`,
              };
            }
            const L = level === 1 ? 1 : rng.pick([1, 0.5, 1.5]);
            return {
              prompt: `Drag the yellow arrow: same direction as the grey one, length <b>${n(L)}</b>.`,
              sub: L === 1 ? 'Length 1 = tip on the dashed circle.' : 'Watch the length readout.',
              fixed: [{ v: G.mul(dir, 1.9), color: 'rgba(154,160,180,0.6)', label: 'direction' }],
              drag: [{ v: [0.3, -0.3], snap: 0.02 }],
              readout: (vs) => `length = ${n(G.length(vs[0]), 2)}   angle error = ${n(angDiff(ang(vs[0]), deg * DEG) / DEG, 0)}°`,
              check: (vs) => { const l = G.length(vs[0]); return Math.min(angScore(angDiff(ang(vs[0]), deg * DEG)), Math.abs(l - L) < 0.06 ? 1 : Math.max(0, 1 - (Math.abs(l - L) - 0.06) * 4)); },
              answer: [G.mul(dir, L)],
              explain: `<p>Target: ${n(L)} × ${nv(dir, 2)} = <b>${nv(G.mul(dir, L), 2)}</b>. ${L === 1 ? 'That\'s exactly normalize() of the grey arrow.' : `That's normalize(grey) × ${n(L)}.`}</p>`,
            };
          },
        },
        {
          id: 'length-num', title: 'How long?', engine: 'numeric', rounds: 6,
          blurb: 'Compute lengths and distances.',
          gen: (rng, level) => {
            const pools = {
              1: [[3, 0], [0, -2], [3, 4], [0.6, 0.8], [-4, 3], [0, 0.5], [6, 8]],
              2: [[0.3, 0.4], [1.2, 0.5], [-0.5, 1.2], [0.8, -0.6], [5, 12], [-8, 6], [1.5, 2]],
              3: [[1, 1], [1, 2], [2, 2, 1], [1, 2, 2], [0.5, 0.5], [3, 4, 12], [-1, 1, 1]],
            };
            const vv = rng.pick(pools[level]);
            const asDist = level > 1 && vv.length === 2 && rng.chance(0.4);
            const ans = r2(G.length(vv));
            if (asDist) {
              const a = [rng.int(-2, 2), rng.int(-2, 2)], b = G.add(a, vv);
              return { prompt: `What is <code>distance(a, b)</code>?`, code: `vec2 a = ${v2(a)};\nvec2 b = ${v2(b)};`, answer: ans, explain: `<p>b − a = ${nv(vv)} → length = √(${vv.map((x) => n(x * x, 3)).join(' + ')}) = <b>${n(ans, 2)}</b>.</p>` };
            }
            return {
              prompt: `What is <code>length(${vv.length === 2 ? v2(vv) : v3(vv)})</code>?`,
              sub: Number.isInteger(ans * 100) ? '' : 'Two decimals is fine.',
              answer: ans,
              explain: `<p>√(${vv.map((x) => n(x * x, 3)).join(' + ')}) = √${n(G.dot(vv, vv), 3)} = <b>${n(ans, 2)}</b>.</p>`,
            };
          },
        },
        {
          id: 'normalize-num', title: 'Normalize it', engine: 'numeric', rounds: 6,
          blurb: 'Divide by the length: compute unit vectors.',
          gen: (rng, level) => {
            const pools = {
              1: [[3, 4], [0, -5], [2, 0], [0, 0.5], [-6, 8], [-3, 0]],
              2: [[6, 8], [-3, 4], [5, 12], [0.3, -0.4], [8, -6], [12, 5]],
              3: [[1, 1], [-1, 1], [2, 2], [1, -1], [3, 3], [0.5, -0.5]],
            };
            const vv = rng.pick(pools[level]);
            const L = G.length(vv), ans = G.normalize(vv).map(r2);
            return {
              prompt: `What is <code>normalize(${v2(vv)})</code>?`,
              sub: level === 3 ? '1/√2 ≈ 0.707 — two decimals is fine.' : '',
              answer: ans, wrap: 'vec2',
              explain: `<p>length = ${n(L, 3)}. Divide both parts: (${n(vv[0])} / ${n(L, 3)}, ${n(vv[1])} / ${n(L, 3)}) = <b>${nv(ans, 2)}</b>.</p>`,
            };
          },
        },
        {
          id: 'len-tf', title: 'Length facts', engine: 'mcq', rounds: 8,
          blurb: 'True or false about length and normalize.',
          questions: [
            tf('<code>normalize(v)</code> changes the direction of v.', false, 'It only changes the length (to 1). Direction stays.'),
            tf('A unit vector has length 1.', true, 'That\'s the definition.'),
            tf('<code>length(vec2(3.0, 4.0))</code> is 7.', false, '√(9 + 16) = 5. Lengths don\'t simply add.'),
            tf('<code>distance(a, b)</code> equals <code>length(b - a)</code>.', true, 'The distance between two points = the length of the arrow between them.'),
            tf('<code>normalize(vec2(0.0))</code> is a safe thing to do.', false, 'Zero has no direction: dividing by length 0 gives NaN. Guard against zero vectors!', 2),
            tf('<code>normalize(2.0 * v)</code> = <code>normalize(v)</code>.', true, 'Scaling changes the length, not the direction, and normalize resets the length anyway.', 2),
            tf('Interpolated normals in the fragment shader are always exactly length 1.', false, 'Blending between unit vectors makes them shorter. Re-normalize!', 2),
            tf('<code>length(v)</code> can be negative.', false, 'A square root of a sum of squares is never negative.'),
            tf('<code>dot(v, v)</code> = length(v)².', true, 'x·x + y·y — that\'s the length squared. Handy: comparing squared lengths avoids a sqrt.', 3),
            tf('A light direction of length 2 makes N·L lighting twice as bright.', true, 'That\'s exactly the bug normalize() prevents.', 2),
            q('Which is a unit vector?', ['(0.6, 0.8)', '(1, 1)', '(0.5, 0.5)'], '0.36 + 0.64 = 1 → length 1. (1,1) has length 1.41, (0.5,0.5) 0.71.'),
            q('Why normalize the light direction before lighting?', ['So the result only depends on the angle', 'To make the light brighter', 'GLSL requires it to compile'], 'With unit vectors, dot = cos(angle) — pure "facing-ness".', { level: 2 }),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'vectors.dot',
      title: 'Dot product',
      blurb: 'One number that says how much two arrows point the same way.',
      lesson: [
        {
          title: 'Multiply and add',
          body: `<p>The recipe is simple: multiply matching parts, add them up.</p>
<pre class="code">dot(a, b) = a.x * b.x + a.y * b.y</pre>
<p>The result is a single number (not a vector). But what does it <i>mean</i>? Turn b around and watch the number:</p>`,
          controls: [{ name: 'a', label: 'angle of b (degrees)', min: 0, max: 360, step: 5, value: 40 }],
          visual: plane(1.6, (P, v) => {
            const a = [1.2, 0], b = unitAt(v.a);
            P.arrow(a, '#6bdfff', 'a'); P.arrow(b, '#ffd479', 'b');
            const d = G.dot(a, b);
            return `dot(a, b) = ${n(a[0])}×${n(b[0], 2)} + ${n(a[1])}×${n(b[1], 2)} = ${n(d, 2)}  ${d > 0.02 ? '(+) roughly same way' : d < -0.02 ? '(−) roughly opposite' : '(0) perpendicular'}`;
          }),
        },
        {
          title: 'How aligned are they?',
          body: `<p>For two <b>unit</b> vectors, the dot product is the <b>cosine of the angle</b> between them:</p>
<ul><li><b>1</b> → pointing the same way (0°)</li><li><b>0</b> → perpendicular (90°)</li><li><b>−1</b> → opposite (180°)</li></ul>
<p>In between it changes smoothly. 60° apart → 0.5.</p>`,
          controls: [{ name: 'a', label: 'angle between (degrees)', min: 0, max: 180, step: 5, value: 60 }],
          visual: plane(1.4, (P, v) => {
            const a = [1, 0], b = unitAt(v.a);
            P.arrow(a, '#6bdfff', 'a'); P.arrow(b, '#ffd479', 'b');
            return `dot(a, b) = cos(${v.a}°) = ${n(Math.cos(v.a * DEG), 3)}`;
          }),
          graph: { fns: [{ f: (x) => Math.cos(x * DEG), label: 'dot = cos(angle)' }], opts: { xmin: 0, xmax: 180, ymin: -1.1, ymax: 1.1, xstep: 30, ystep: 0.5 } },
          after: '<div class="analogy">🔦 <b>Analogy:</b> how much of a push in direction a helps you move in direction b. Push the same way: all of it (1). Sideways: none (0). Backwards: it works against you (−1).</div>',
        },
        {
          title: 'Projection: the shadow of an arrow',
          body: `<p>If <code>d</code> is a <b>unit</b> vector, <code>dot(v, d)</code> is how far <code>v</code> reaches <b>along d</b> — the length of v's shadow on d's line, with the sun straight above.</p>
<p>Negative means the shadow falls behind.</p>`,
          controls: [
            { name: 'x', label: 'v.x', min: -1.5, max: 1.5, step: 0.1, value: 1.2 },
            { name: 'y', label: 'v.y', min: -1.5, max: 1.5, step: 0.1, value: 1 },
            { name: 'a', label: 'angle of d', min: 0, max: 180, step: 5, value: 20 },
          ],
          visual: plane(2, (P, v) => {
            const vv = [v.x, v.y], d = unitAt(v.a), k = G.dot(vv, d), pr = G.mul(d, k);
            P.arrow(G.mul(d, 1.9), 'rgba(154,160,180,0.35)', '', [0, 0], 1); P.arrow(G.mul(d, -1.9), 'rgba(154,160,180,0.35)', '', [0, 0], 1);
            P.arrow(d, '#3ddc97', 'd'); P.arrow(vv, '#ffd479', 'v');
            P.arrow(G.sub(pr, vv), 'rgba(255,255,255,0.35)', '', vv, 1);
            P.arrow(pr, '#ff9f43', 'shadow', [0, 0], 4);
            return `dot(v, d) = ${n(k, 2)}   (shadow length along d)`;
          }),
        },
        {
          title: 'Lighting is a dot product',
          body: `<p>The most famous dot product in graphics: <b>diffuse (Lambert) lighting</b>.</p>
<pre class="code">float diffuse = max(dot(N, L), 0.0);</pre>
<p>N = the surface normal (which way the surface faces), L = the direction <b>towards</b> the light, both unit length. Facing the light → 1 (bright). Side-on → 0. Facing away → negative, clamped to 0 (dark).</p>`,
          controls: [{ name: 'a', label: 'light angle (degrees)', min: -180, max: 180, step: 5, value: 40 }],
          shader: (v) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(cos(uA), sin(uA), 0.6));\nfloat d = max(dot(s.xyz, L), 0.0);\ncol = mix(vec3(0.05), vec3(1.0, 0.85, 0.6) * d, s.w);', uniforms: { uA: v.a * DEG } }),
          code: (v) => `vec3 L = normalize(vec3(cos(${f(v.a * DEG, 2)}), sin(${f(v.a * DEG, 2)}), 0.6));\nfloat diffuse = max(dot(N, L), 0.0);`,
          quiz: { q: 'A surface faces exactly away from the light. <code>dot(N, L)</code> = ?', options: ['1', '0', '−1'], answer: 2, explain: 'Opposite directions → −1. That\'s why we clamp with max(…, 0.0).' },
        },
        {
          title: 'The sign tells front or back',
          body: `<p>Often you don't need the exact number, only the <b>sign</b>:</p>
<ul><li><code>dot(toEnemy, forward) > 0</code> → the enemy is in front of me</li><li><code>dot(N, V) &lt; 0</code> → we're looking at the back of the surface</li><li><code>1.0 - dot(N, V)</code> → bright at the edges of a sphere: <b>fresnel / rim light</b></li></ul>`,
          shader: { frag: 'vec4 s = sphereNormal(uv);\nfloat rim = 1.0 - max(dot(s.xyz, vec3(0.0, 0.0, 1.0)), 0.0);\ncol = mix(vec3(0.03), vec3(0.2, 0.7, 1.0) * pow(rim, 2.0) * 1.5, s.w);' },
          code: 'float rim = 1.0 - max(dot(N, V), 0.0);  // V = towards the camera\ncol = rimColour * pow(rim, 2.0);',
        },
      ],
      games: [
        {
          id: 'drag-perp', title: 'Make it zero', engine: 'vector', rounds: 5,
          blurb: 'Drag b until dot(a, b) = 0 (perpendicular).',
          gen: (rng, level) => {
            const deg = level === 1 ? rng.pick([0, 90, 180, 270]) : rng.step(0, 345, 15);
            const a = G.mul(unitAt(deg), level === 3 ? rng.pick([0.8, 1.2, 1.5]) : 1.2);
            return {
              prompt: 'Drag b so that <b>dot(a, b) = 0</b>.',
              sub: level === 1 ? 'Keep b at least 0.5 long.' : 'Watch the live readout. (b must be at least 0.5 long.)',
              fixed: [{ v: a, color: '#6bdfff', label: 'a' }],
              drag: [{ v: G.mul(unitAt(deg + 30), 1), label: 'b', snap: 0.02 }],
              readout: (vs) => `dot(a, b) = ${n(a[0], 2)}×${n(vs[0][0], 2)} + ${n(a[1], 2)}×${n(vs[0][1], 2)} = ${n(G.dot(a, vs[0]), 2)}`,
              check: (vs) => { const l = G.length(vs[0]); if (l < 0.5) return 0; const c = Math.abs(G.dot(G.normalize(a), vs[0]) / l); return c < 0.07 ? 1 : Math.max(0, 1 - (c - 0.07) * 3); },
              answer: [G.mul(G.normalize([-a[1], a[0]]), 1), G.mul(G.normalize([a[1], -a[0]]), 1)],
              explain: `<p>dot = 0 means <b>perpendicular</b> (90°). Two answers: ${nv(G.normalize([-a[1], a[0]]), 2)} or the opposite. Trick: (x, y) → (−y, x) is always perpendicular.</p>`,
            };
          },
        },
        {
          id: 'drag-dot', title: 'Dial a dot', engine: 'vector', rounds: 5,
          blurb: 'Turn a unit vector until the dot product hits the target.',
          gen: (rng, level) => {
            const target = rng.pick(level === 1 ? [1, 0, -1] : level === 2 ? [1, 0.5, 0, -0.5, -1] : [0.5, -0.5, 0.71, -0.71, 0.87, 0]);
            const deg = rng.step(0, 330, 30);
            const a = unitAt(deg);
            const angle = Math.acos(target) / DEG;
            return {
              prompt: `Both are unit vectors. Turn b so that <b>dot(a, b) = ${n(target)}</b>.`,
              sub: level === 1 ? '1 = same way, 0 = perpendicular, −1 = opposite.' : 'dot of unit vectors = cos(angle between).',
              unitCircle: true,
              fixed: [{ v: a, color: '#6bdfff', label: 'a' }],
              drag: [{ v: unitAt(deg + 100), label: 'b', unit: true }],
              readout: (vs) => `dot(a, b) = ${n(G.dot(a, vs[0]), 2)}   angle = ${n(angDiff(ang(a), ang(vs[0])) / DEG, 0)}°`,
              check: (vs) => { const e = Math.abs(G.dot(a, vs[0]) - target); return e < 0.05 ? 1 : Math.max(0, 1 - (e - 0.05) * 4); },
              answer: [unitAt(deg + angle), unitAt(deg - angle)],
              explain: `<p>cos(angle) = ${n(target)} → angle = <b>${n(angle, 0)}°</b> either side of a.${target === 0.5 ? ' (cos 60° = 0.5)' : ''}</p>`,
            };
          },
        },
        {
          id: 'dot-num', title: 'Compute the dot', engine: 'numeric', rounds: 6,
          blurb: 'Multiply matching parts and add.',
          gen: (rng, level) => {
            const dim = level === 3 && rng.chance(0.5) ? 3 : 2;
            const rv = () => Array.from({ length: dim }, () => (level === 1 ? rng.int(-3, 3) : rng.pick([-2, -1, -0.5, 0, 0.5, 1, 2, 3])));
            const a = rv(), b = rv();
            const ans = r2(G.dot(a, b));
            const fmt = (x) => (dim === 2 ? v2(x) : v3(x));
            return {
              prompt: 'What is <code>dot(a, b)</code>?',
              code: `${dim === 2 ? 'vec2' : 'vec3'} a = ${fmt(a)};\n${dim === 2 ? 'vec2' : 'vec3'} b = ${fmt(b)};`,
              answer: ans,
              explain: `<p>${a.map((x, i) => `${n(x)}×${n(b[i])}`).join(' + ')} = ${a.map((x, i) => n(x * b[i])).join(' + ')} = <b>${n(ans)}</b>. ${ans > 0 ? 'Positive → roughly the same direction.' : ans < 0 ? 'Negative → roughly opposite.' : 'Zero → perpendicular!'}</p>`,
            };
          },
        },
        {
          id: 'dot-sign', title: 'Plus, zero or minus?', engine: 'mcq', rounds: 8,
          blurb: 'Glance at two arrows, say the sign of their dot product.',
          gen: (rng, level) => {
            const base = rng.step(0, 345, 15);
            const gap = rng.pick(level === 1 ? [30, 60, 90, 120, 150] : level === 2 ? [20, 60, 90, 120, 160] : [70, 80, 90, 100, 110, 45, 135]);
            const la = rng.pick([1.2, 1.6]), lb = rng.pick([0.9, 1.3, 1.6]);
            const a = G.mul(unitAt(base), la), b = G.mul(unitAt(base + gap * rng.sign()), lb);
            const d = G.dot(a, b);
            const ans = Math.abs(d) < 1e-6 ? 1 : d > 0 ? 0 : 2;
            return {
              prompt: 'What is the sign of <code>dot(a, b)</code>?',
              sub: 'The lengths don\'t matter for the sign — only the angle.',
              visual: plane(1.8, (P) => { P.arrow(a, '#6bdfff', 'a'); P.arrow(b, '#ffd479', 'b'); }, 240),
              options: ['➕ positive (angle < 90°)', '0️⃣ zero (exactly 90°)', '➖ negative (angle > 90°)'],
              answer: ans, noShuffle: true, grid: false,
              explain: `<p>The angle between them is <b>${gap}°</b> → ${ans === 0 ? 'less than 90° → positive' : ans === 1 ? 'exactly 90° → zero' : 'more than 90° → negative'}. (Exact value: ${n(d, 2)}.)</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'vectors.cross',
      title: 'Cross product (3D)',
      blurb: 'Two arrows in, one arrow out — perpendicular to both.',
      lesson: [
        {
          title: 'Perpendicular to both',
          body: `<p><code>cross(a, b)</code> only exists in <b>3D</b>. It gives a new vector that is <b>perpendicular to both</b> a and b — sticking straight out of the plane they span.</p>
<p>Here a points along x and b turns in the x-y floor. The cross product (pink) points along <b>z</b>. Rotate the view to see it in 3D.</p>`,
          controls: [
            { name: 't', label: 'angle of b from a (degrees)', min: 0, max: 360, step: 5, value: 90 },
            { name: 'yaw', label: 'rotate view', min: -1.5, max: 1.5, step: 0.05, value: -0.6 },
          ],
          visual: plane(2, (P, v) => {
            const a = [1.2, 0, 0], b = [Math.cos(v.t * DEG), Math.sin(v.t * DEG), 0], c = G.cross(a, b);
            draw3D(P, v.yaw, [{ v: a, color: '#6bdfff', label: 'a' }, { v: b, color: '#ffd479', label: 'b' }, { v: c, color: '#ff7ab2', label: 'a×b', w: 4 }]);
            return `a = (1.2, 0, 0)   b = ${nv(b, 2)}\ncross(a, b) = ${nv(c, 2)}`;
          }),
        },
        {
          title: 'Right-hand rule (order matters!)',
          body: `<p>Which of the two perpendicular directions? Use your <b>right hand</b>: point your fingers along <b>a</b>, curl them towards <b>b</b> — your thumb points along <code>cross(a, b)</code>.</p>
<ul><li><code>cross(x, y) = z</code></li><li><code>cross(y, z) = x</code></li><li><code>cross(z, x) = y</code></li></ul>
<p>Swap the order and it flips: <code>cross(b, a) = -cross(a, b)</code>.</p>
<div class="tip">💡 Unity uses a left-handed world, Unreal a left-handed one with z up; the <i>formula</i> is the same everywhere, only how the axes are drawn changes. If a normal comes out backwards, swap the cross order.</div>`,
          code: 'cross(vec3(1,0,0), vec3(0,1,0)) == vec3(0,0,1)   // x × y = z\ncross(vec3(0,1,0), vec3(1,0,0)) == vec3(0,0,-1)  // y × x = −z',
          quiz: { q: '<code>cross(vec3(0,0,1), vec3(1,0,0))</code> = ?', options: ['(0, −1, 0)', '(0, 1, 0)', '(1, 0, 0)'], answer: 1, explain: 'z × x = y (the cycle x→y→z→x). Going forward around the cycle is positive.' },
        },
        {
          title: 'Its length = how "open" they are',
          body: `<p>The length of the cross product = |a| × |b| × sin(angle). So:</p>
<ul><li>perpendicular (90°) → biggest</li><li>parallel (0° or 180°) → <b>zero</b> (no unique perpendicular!)</li></ul>
<p>It's also the <b>area</b> of the parallelogram the two arrows make. Half of it = the triangle's area.</p>`,
          controls: [{ name: 't', label: 'angle between (degrees)', min: 0, max: 180, step: 5, value: 45 }],
          visual: plane(2, (P, v) => {
            const a = [1.2, 0, 0], b = [Math.cos(v.t * DEG), Math.sin(v.t * DEG), 0], c = G.cross(a, b);
            draw3D(P, -0.6, [{ v: a, color: '#6bdfff', label: 'a' }, { v: b, color: '#ffd479', label: 'b' }, { v: c, color: '#ff7ab2', label: 'a×b', w: 4 }]);
            return `|a×b| = 1.2 × 1 × sin(${v.t}°) = ${n(G.length(c), 3)}`;
          }),
        },
        {
          title: 'What it\'s used for',
          body: `<ul><li><b>Face normals</b>: a triangle with corners A, B, C has normal <code>normalize(cross(B - A, C - A))</code>.</li>
<li><b>Tangent space</b>: the bitangent is <code>cross(N, T)</code> — you get the third axis from the other two (normal mapping!).</li>
<li><b>Camera basis</b>: right = <code>cross(forward, up)</code>.</li></ul>
<div class="note">dot gives a <b>number</b> (how aligned). cross gives a <b>vector</b> (perpendicular). Different jobs!</div>`,
          code: 'vec3 e1 = B - A;\nvec3 e2 = C - A;\nvec3 faceN = normalize(cross(e1, e2));',
        },
      ],
      games: [
        {
          id: 'cross-axes', title: 'Axis cross', engine: 'mcq', rounds: 8,
          blurb: 'Cross products of axis directions with the right-hand rule.',
          gen: (rng, level) => {
            const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
            const names = ['x', 'y', 'z'];
            const sgn = () => (level === 3 && rng.chance(0.4) ? -1 : 1);
            let A = rng.pick(names), B = rng.pick(names.filter((x) => x !== A));
            if (level >= 2 && rng.chance(0.15)) B = A;
            const sa = sgn(), sb = sgn();
            const a = G.mul(AX[A], sa), b = G.mul(AX[B], sb), c = G.cross(a, b);
            const nm = (v) => { if (G.length(v) < 1e-9) return 'vec3(0.0)'; const i = v.findIndex((x) => Math.abs(x) > 0.5); return (v[i] < 0 ? '-' : '+') + names[i]; };
            const lab = (s, k) => (s < 0 ? '-' : '') + k;
            const ans = nm(c);
            const all = ['+x', '-x', '+y', '-y', '+z', '-z', 'vec3(0.0)'];
            const opts = distinct(rng, ans, (r, i) => (i === 0 && ans !== 'vec3(0.0)' ? (ans[0] === '+' ? '-' : '+') + ans[1] : r.pick(all)), 4);
            return {
              prompt: `<code>cross(${lab(sa, A)}, ${lab(sb, B)})</code> points along…`,
              sub: 'x → y → z → x: forward around the cycle = positive.',
              options: opts,
              explain: `<p>${A === B ? 'Parallel vectors → the cross product is zero.' : `Cycle x→y→z→x: ${A}×${B} = ${nm(G.cross(AX[A], AX[B]))}${sa * sb < 0 ? ', and one negative input flips it' : ''}. Answer: <b>${ans}</b>.`}</p>`,
            };
          },
        },
        {
          id: 'cross-num', title: 'Compute the cross', engine: 'numeric', rounds: 5,
          blurb: 'Work out cross(a, b) component by component.',
          gen: (rng, level) => {
            const rv = () => [0, 1, 2].map(() => rng.int(level === 1 ? 0 : -2, level === 1 ? 2 : 2));
            let a, b, c;
            do {
              if (level === 1) { const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; a = G.mul(rng.pick(AX), rng.int(1, 3)); b = rv(); }
              else { a = rv(); b = rv(); }
              c = G.cross(a, b);
            } while (G.length(c) < 0.5);
            return {
              prompt: 'Compute <code>cross(a, b)</code>:',
              sub: 'x = a.y·b.z − a.z·b.y,  y = a.z·b.x − a.x·b.z,  z = a.x·b.y − a.y·b.x',
              code: `vec3 a = ${v3(a)};\nvec3 b = ${v3(b)};`,
              answer: c.map((x) => x + 0), wrap: 'vec3', labels: ['x', 'y', 'z'], tolerance: 0.01,
              explain: `<p>x = ${n(a[1])}·${n(b[2])} − ${n(a[2])}·${n(b[1])} = ${n(c[0])}<br>y = ${n(a[2])}·${n(b[0])} − ${n(a[0])}·${n(b[2])} = ${n(c[1])}<br>z = ${n(a[0])}·${n(b[1])} − ${n(a[1])}·${n(b[0])} = ${n(c[2])}<br>→ <b>${nv(c)}</b>. Check: dot(result, a) = ${n(G.dot(c, a))} and dot(result, b) = ${n(G.dot(c, b))} — perpendicular to both ✔️</p>`,
            };
          },
        },
        {
          id: 'dot-or-cross', title: 'Dot or cross?', engine: 'buckets', rounds: 2,
          blurb: 'Which product does the job?',
          gen: () => ({
            prompt: 'Which one do you need?',
            buckets: ['• dot (a number)', '× cross (a vector)'],
            count: 10,
            items: [
              { text: 'How much a surface faces the light', bucket: 0 },
              { text: 'A face normal from two triangle edges', bucket: 1 },
              { text: 'Is the enemy in front of or behind me?', bucket: 0, why: 'Only the sign matters → dot.' },
              { text: 'The bitangent from the normal and tangent', bucket: 1 },
              { text: 'The angle between two directions', bucket: 0, why: 'acos(dot(a, b)) for unit vectors.' },
              { text: 'A "right" vector from forward and up', bucket: 1 },
              { text: 'Fresnel / rim light strength', bucket: 0 },
              { text: 'How far a point lies along a direction', bucket: 0, why: 'Projection = dot with a unit direction.' },
              { text: 'The area of a triangle', bucket: 1, why: 'Half the length of the cross product.' },
              { text: 'A vector perpendicular to two others', bucket: 1 },
              { text: 'Checking if two directions are perpendicular', bucket: 0, why: 'dot = 0.' },
              { text: 'Specular highlight: reflect · view alignment', bucket: 0 },
            ],
          }),
        },
        {
          id: 'cross-tf', title: 'Cross facts', engine: 'mcq', rounds: 8,
          blurb: 'True or false about the cross product.',
          questions: [
            tf('cross(a, b) is perpendicular to both a and b.', true, 'That\'s its whole point.'),
            tf('cross(a, b) = cross(b, a).', false, 'Swapping flips the direction: cross(b, a) = −cross(a, b).'),
            tf('The cross product of two parallel vectors is zero.', true, 'sin(0°) = 0 — there\'s no single perpendicular direction.'),
            tf('cross() returns a single number.', false, 'It returns a vec3. dot() returns a number.'),
            tf('GLSL has cross() for vec2.', false, 'cross is only defined for vec3. (In 2D people use a.x*b.y − a.y*b.x as a "2D cross" number.)', 2),
            tf('cross(x, y) = z.', true, 'Right-hand rule: fingers along x, curl to y, thumb along z.'),
            tf('The length of cross(a, b) is biggest when a and b are perpendicular.', true, '|a||b|sin(90°) = |a||b|.', 2),
            tf('Even if a and b are unit vectors, cross(a, b) might not be unit length.', true, 'Its length is sin(angle) — only 1 when they\'re perpendicular. Normalize it if you need a direction.', 3),
            tf('A triangle normal can be computed as cross(B − A, C − A).', true, 'Two edges span the triangle; their cross is perpendicular to it.', 2),
            tf('If a face normal points the wrong way, swapping the cross order fixes it.', true, 'cross(b, a) = −cross(a, b).', 2),
            q('cross(y, x) = ?', ['−z', 'z', 'x'], 'Backwards around the cycle → negative.'),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'vectors.reflect',
      title: 'Reflect',
      blurb: 'Bounce a direction off a surface: reflect(I, N).',
      lesson: [
        {
          title: 'Bouncing a ball',
          body: `<p>A ball hits a surface and bounces. Its new direction is the <b>reflection</b> of the old one:</p>
<ul><li><b>I</b> — the incoming direction (pointing <b>into</b> the surface)</li><li><b>N</b> — the surface normal (unit length, pointing out)</li><li><b>R</b> = <code>reflect(I, N)</code> — the bounce</li></ul>
<p>Angle in = angle out, like a mirror or a pool ball.</p>`,
          controls: [
            { name: 'i', label: 'incoming angle (degrees)', min: -80, max: 80, step: 5, value: 35 },
            { name: 'nrm', label: 'surface tilt (degrees)', min: -40, max: 40, step: 5, value: 0 },
          ],
          visual: plane(1.6, (P, v) => {
            const N = unitAt(90 + v.nrm), Tn = unitAt(v.nrm);
            const I = G.normalize(G.sub(G.mul(Tn, Math.sin(v.i * DEG)), G.mul(N, Math.cos(v.i * DEG))));
            const R = G.reflect(I, N);
            P.arrow(G.mul(Tn, 1.6), '#4a4f63', '', [0, 0], 2); P.arrow(G.mul(Tn, -1.6), '#4a4f63', 'surface', [0, 0], 2);
            P.arrow(N, '#3ddc97', 'N'); P.arrow(I, '#6bdfff', 'I', G.mul(I, -1)); P.arrow(R, '#ff9f43', 'R', [0, 0], 3.5);
            return `I = ${nv(I, 2)}   N = ${nv(N, 2)}\nR = reflect(I, N) = ${nv(R, 2)}`;
          }),
        },
        {
          title: 'The formula, piece by piece',
          body: `<pre class="code">R = I - 2.0 * dot(N, I) * N</pre>
<ol><li><code>dot(N, I)</code>: how much of I goes <b>into</b> the surface (negative, because I points against N).</li>
<li><code>dot(N, I) * N</code>: that "into the wall" part as an arrow.</li>
<li>Subtract it <b>twice</b>: once cancels the into-the-wall motion, the second time sends it back out. The sideways part is untouched.</li></ol>
<div class="analogy">🎱 A pool ball: hitting the cushion flips the part of its motion that goes into the cushion. The part along the cushion keeps going.</div>`,
          controls: [{ name: 's', label: 'show step', min: 0, max: 2, step: 1, value: 2 }],
          visual: plane(1.6, (P, v) => {
            const N = [0, 1], I = G.normalize([1, -0.8]);
            const into = G.mul(N, G.dot(N, I));
            P.arrow([1.6, 0], '#4a4f63', '', [0, 0], 2); P.arrow([-1.6, 0], '#4a4f63', '', [0, 0], 2);
            P.arrow(N, '#3ddc97', 'N'); P.arrow(I, '#6bdfff', 'I', G.mul(I, -1));
            P.arrow(I, 'rgba(107,223,255,0.5)', 'I', [0, 0], 2);
            if (v.s >= 1) P.arrow(G.mul(into, -1), '#ff7ab2', '−dot(N,I)·N', I, 2.5);
            if (v.s >= 2) { P.arrow(G.mul(into, -1), '#ff7ab2', '', G.sub(I, into), 2.5); P.arrow(G.reflect(I, N), '#ff9f43', 'R', [0, 0], 3.5); }
            return ['dot(N, I) = ' + n(G.dot(N, I), 2) + '  (negative: I goes into the floor)', 'I − dot(N,I)·N = ' + nv(G.sub(I, into), 2) + '  (only the sideways part left)', 'I − 2·dot(N,I)·N = ' + nv(G.reflect(I, N), 2) + '  = R'][v.s];
          }),
          after: '<div class="tip">💡 N must be <b>unit length</b>, or the "into the wall" part is measured wrong. HLSL\'s <code>reflect</code> works the same way.</div>',
        },
        {
          title: 'Easy cases',
          body: `<p>With an axis-aligned surface the formula collapses to "flip one component":</p>
<ul><li>Floor, N = (0, 1): <code>reflect((x, y), N) = (x, −y)</code></li><li>Wall, N = (1, 0): <code>reflect((x, y), N) = (−x, y)</code></li></ul>
<p>Head-on (I = −N): it comes straight back, <code>R = N</code>.</p>`,
          quiz: { q: 'reflect(vec2(2.0, -1.0), vec2(0.0, 1.0)) = ?', options: ['(−2, −1)', '(2, 1)', '(−2, 1)'], answer: 1, explain: 'Floor normal → flip y: (2, −1) becomes (2, 1).' },
        },
        {
          title: 'In shaders: shiny things',
          body: `<p>Reflect the <b>view direction</b> about the normal and you know where a mirror-like surface "looks". Use it to read a sky colour or an environment map — instant chrome. The same R is used for specular highlights.</p>`,
          controls: [{ name: 'h', label: 'horizon height', min: -0.5, max: 0.5, step: 0.05, value: 0 }],
          shader: (v) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 V = vec3(0.0, 0.0, -1.0);   // looking into the screen\nvec3 R = reflect(V, s.xyz);\nvec3 sky = mix(vec3(0.35, 0.25, 0.15), vec3(0.3, 0.6, 1.0), smoothstep(uH - 0.05, uH + 0.05, R.y));\nsky += vec3(1.0) * pow(max(dot(R, normalize(vec3(0.5, 0.6, 0.6))), 0.0), 40.0);\ncol = mix(vec3(0.05), sky, s.w);', uniforms: { uH: v.h } }),
          code: 'vec3 R = reflect(V, N);              // V = camera → surface\nvec3 env = skyColour(R);             // look up the world in that direction\nfloat spec = pow(max(dot(R, L), 0.0), 40.0);  // highlight',
        },
      ],
      games: [
        {
          id: 'drag-reflect', title: 'Bounce it', engine: 'vector', rounds: 5,
          blurb: 'Drag the reflected direction R.',
          gen: (rng, level) => {
            const nDeg = level === 1 ? rng.pick([90, 0, 180, 270]) : level === 2 ? rng.pick([90, 45, 135, 0]) : rng.step(30, 150, 15);
            const N = unitAt(nDeg);
            let I;
            do { I = unitAt(nDeg + 180 + rng.pick([-60, -45, -30, 30, 45, 60, 20, -20])); } while (G.dot(I, N) > -0.2);
            const R = G.reflect(I, N);
            return {
              prompt: 'I comes in and bounces off the surface. Drag <b>R</b>.',
              sub: 'Angle in = angle out, measured from N.',
              R: 1.6, unitCircle: true,
              fixed: [{ v: G.mul(unitAt(nDeg + 90), 1.6), color: '#4a4f63' }, { v: G.mul(unitAt(nDeg - 90), 1.6), color: '#4a4f63', label: 'surface' }, { v: N, color: '#3ddc97', label: 'N' }, { v: I, color: '#6bdfff', label: 'I', from: G.mul(I, -1) }],
              drag: [{ v: unitAt(nDeg + 200), label: 'R', unit: true }],
              check: (vs) => angScore(angDiff(ang(vs[0]), ang(R))),
              answer: [R],
              explain: `<p>R = I − 2·dot(N, I)·N = <b>${nv(R, 2)}</b>. The part of I along the surface stays; the part into the surface flips.</p>`,
            };
          },
        },
        {
          id: 'reflect-num', title: 'Reflect by hand', engine: 'numeric', rounds: 6,
          blurb: 'Compute reflect(I, N) for simple surfaces.',
          gen: (rng, level) => {
            const Ns = level === 1 ? [[0, 1], [1, 0], [0, -1], [-1, 0]] : level === 2 ? [[0, 1], [1, 0], [-1, 0], [0, -1]] : [[0.6, 0.8], [0.8, 0.6], [-0.6, 0.8], [0, 1], [-0.8, 0.6]];
            const Is = level === 1 ? [[1, -1], [2, -1], [-1, -2], [1, 1], [-3, 1], [2, 3]] : [[1, -1], [0, -1], [-1, -2], [2, -1], [1, -2], [-2, 1], [1, 0], [-1, 0], [0, 1]];
            let N, I;
            do { N = rng.pick(Ns); I = rng.pick(Is); } while (G.dot(N, I) >= 0);
            const d = G.dot(N, I), ans = G.reflect(I, N).map(r2);
            return {
              prompt: 'What is <code>reflect(I, N)</code>?',
              code: `vec2 I = ${v2(I)};\nvec2 N = ${v2(N)};`,
              sub: level < 3 ? 'Axis-aligned normal → flip one component.' : 'R = I − 2·dot(N, I)·N',
              answer: ans, wrap: 'vec2',
              explain: `<p>dot(N, I) = ${n(d)}. R = ${nv(I)} − 2×(${n(d)})×${nv(N)} = ${nv(I)} + ${nv(G.mul(N, -2 * d).map(r2))} = <b>${nv(ans)}</b>.</p>`,
            };
          },
        },
        {
          id: 'reflect-pick', title: 'Spot the bounce', engine: 'mcq', rounds: 6,
          blurb: 'Which orange arrow is the real reflection?',
          gen: (rng, level) => {
            const nDeg = level === 1 ? rng.pick([90, 0]) : rng.step(30, 150, 15);
            const N = unitAt(nDeg);
            const I = unitAt(nDeg + 180 + rng.pick([-50, -35, 35, 50]));
            const R = G.reflect(I, N);
            const cands = [R, G.mul(I, -1), I, G.mul(R, -1), G.reflect(R, unitAt(nDeg + 90))];
            const opts = distinct(rng, R, (r, i) => cands[(i % 4) + 1], 4, (x) => x.map((y) => y.toFixed(2)).join());
            const draw = (c) => (el) => { const P = vectorPlane(1.4, 150); P.clear({ unitCircle: false }); P.arrow(G.mul(unitAt(nDeg + 90), 1.4), '#4a4f63', '', [0, 0], 2); P.arrow(G.mul(unitAt(nDeg - 90), 1.4), '#4a4f63', '', [0, 0], 2); P.arrow(N, '#3ddc97', 'N', [0, 0], 2); P.arrow(I, '#6bdfff', 'I', G.mul(I, -1), 2.5); P.arrow(c, '#ff9f43', '', [0, 0], 3.5); el.append(P.el); };
            return {
              prompt: 'Which orange arrow is <code>reflect(I, N)</code>?',
              sub: 'Blue I arrives at the centre. Green = N.',
              options: opts.map((o) => ({ visual: draw(o), id: o.map((y) => y.toFixed(2)).join() })),
              grid: true,
              explain: '<p>The reflection leaves on the <b>same side</b> as N, at the same angle to N as I came in, continuing in the same sideways direction. Going straight back (−I) or straight through (I) are the classic wrong guesses.</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'vectors.project',
      title: 'Projections & directional gradients',
      blurb: 'dot(uv, dir) turns any direction into a gradient — the key to wipes, stripes and splits.',
      lesson: [
        {
          title: 'A gradient in any direction',
          body: `<p><code>uv.x</code> is a gradient along x. But what about a gradient at 30°? Use the projection: <code>dot(uv, dir)</code> = "how far is this pixel along dir?".</p>
<p><code>uv.x</code> is actually just <code>dot(uv, vec2(1, 0))</code>!</p>`,
          controls: [{ name: 'a', label: 'direction angle (degrees)', min: 0, max: 360, step: 5, value: 30 }],
          shader: (v) => ({ frag: 'vec2 dir = vec2(cos(uA), sin(uA));\nfloat g = dot(uv - 0.5, dir) + 0.5;\ncol = vec3(g);\nfloat s = sdSegment(uv, vec2(0.5), vec2(0.5) + dir * 0.3);\ncol = mix(col, vec3(1.0, 0.3, 0.5), 1.0 - smoothstep(0.006, 0.012, s));', uniforms: { uA: v.a * DEG } }),
          code: (v) => `vec2 dir = vec2(${f(Math.cos(v.a * DEG), 2)}, ${f(Math.sin(v.a * DEG), 2)});  // ${v.a}°\nfloat g = dot(uv - 0.5, dir) + 0.5;\ncol = vec3(g);   // brighter along dir (pink)`,
          after: '<div class="note">The gradient always gets brighter in the direction the arrow points. We subtract 0.5 so it\'s centred, then add 0.5 back so the middle is grey.</div>',
        },
        {
          title: 'Splits and wipes',
          body: `<p>Put the projection through <code>step</code> and you get a hard edge at <b>any angle</b> — a <b>line</b>. Move the threshold to slide it: a screen wipe!</p>`,
          controls: [
            { name: 'a', label: 'angle (degrees)', min: 0, max: 360, step: 5, value: 120 },
            { name: 't', label: 'threshold (wipe)', min: -0.6, max: 0.6, step: 0.02, value: 0.1 },
          ],
          shader: (v) => ({ frag: 'vec2 dir = vec2(cos(uA), sin(uA));\nfloat d = dot(uv - 0.5, dir);\ncol = mix(vec3(0.15, 0.2, 0.4), vec3(1.0, 0.75, 0.3), step(uT, d));', uniforms: { uA: v.a * DEG, uT: v.t } }),
          code: (v) => `float d = dot(uv - 0.5, dir);\ncol = mix(blue, orange, step(${f(v.t, 2)}, d));`,
          after: '<div class="tip">💡 This is how many transitions and "dissolve along a direction" effects work. In 3D, <code>dot(worldPos, dir)</code> gives a world-space gradient (e.g. a height fade with dir = up).</div>',
        },
        {
          title: 'Stripes at any angle',
          body: `<p>Feed the projection into a repeating function and you get stripes perpendicular to <code>dir</code>:</p>
<pre class="code">float s = fract(dot(uv, dir) * count);</pre>`,
          controls: [
            { name: 'a', label: 'angle (degrees)', min: 0, max: 180, step: 5, value: 45 },
            { name: 'c', label: 'count', min: 2, max: 20, step: 1, value: 8 },
          ],
          shader: (v) => ({ frag: 'vec2 dir = vec2(cos(uA), sin(uA));\nfloat s = step(0.5, fract(dot(uv, dir) * uC));\ncol = mix(vec3(0.1), vec3(0.4, 0.8, 1.0), s);', uniforms: { uA: v.a * DEG, uC: v.c } }),
          code: (v) => `vec2 dir = vec2(cos(radians(${f(v.a)})), sin(radians(${f(v.a)})));\nfloat s = step(0.5, fract(dot(uv, dir) * ${f(v.c)}));`,
        },
        {
          title: 'Projecting a point onto a line',
          body: `<p><code>dot(p, d)</code> (d unit) is a <b>distance</b> along d. Multiply it back by d to get the actual <b>closest point</b> on the line:</p>
<pre class="code">vec2 onLine = dot(p, d) * d;</pre>
<p>And <code>p - onLine</code> is the part sticking out — its length is the distance from p to the line. (That's exactly how <code>sdSegment</code> works inside!)</p>`,
          controls: [
            { name: 'x', label: 'p.x', min: -1.5, max: 1.5, step: 0.1, value: 0.4 },
            { name: 'y', label: 'p.y', min: -1.5, max: 1.5, step: 0.1, value: 1.2 },
          ],
          visual: plane(2, (P, v) => {
            const d = G.normalize([2, 1]), p = [v.x, v.y], k = G.dot(p, d), on = G.mul(d, k);
            P.arrow(G.mul(d, 2.2), '#4a4f63', 'line', [0, 0], 1.5); P.arrow(G.mul(d, -2.2), '#4a4f63', '', [0, 0], 1.5);
            P.arrow(d, '#3ddc97', 'd'); P.dot(p, '#ffd479', 6); P.dot(on, '#ff9f43', 6);
            P.arrow(G.sub(p, on), 'rgba(255,255,255,0.5)', '', on, 1.5);
            return `dot(p, d) = ${n(k, 2)}\nonLine = ${nv(on, 2)}\ndistance to line = ${n(G.distance(p, on), 2)}`;
          }),
        },
      ],
      games: [
        {
          id: 'drag-grad', title: 'Point uphill', engine: 'vector', rounds: 5,
          blurb: 'Drag the arrow in the direction the gradient gets brighter.',
          gen: (rng, level) => {
            const deg = level === 1 ? rng.pick([0, 90, 180, 270]) : rng.step(0, 345, level === 2 ? 45 : 15);
            const d = unitAt(deg);
            return {
              prompt: 'This is <code>dot(uv - 0.5, dir)</code>. Drag <b>dir</b>.',
              sub: 'dir points where it gets brighter.',
              shader: { frag: `float g = dot(uv - 0.5, ${v2(d.map(r2))}) + 0.5;\ncol = vec3(g);` },
              unitCircle: true, R: 1.4,
              drag: [{ v: unitAt(deg + 150), label: 'dir', unit: true }],
              readout: (vs) => `dir = ${v2(vs[0].map((x) => +x.toFixed(2)))}`,
              check: (vs) => angScore(angDiff(ang(vs[0]), deg * DEG), 8 * DEG, 40 * DEG),
              answer: [d],
              explain: `<p>dir = <b>${nv(d, 2)}</b> (${deg}°). The gradient is darkest on the opposite side and brightest where dir points.</p>`,
            };
          },
        },
        {
          id: 'grad-pick', title: 'Gradient → picture', engine: 'mcq', rounds: 8,
          blurb: 'Read the direction in the code, pick the gradient.',
          gen: (rng, level) => {
            const dirs = level === 1 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
            const step = level === 3 && rng.chance(0.5);
            const mk = (d) => ({ d, code: step ? `float g = step(0.0, dot(uv - 0.5, ${v2(d)}));\ncol = vec3(g);` : `float g = dot(uv - 0.5, ${v2(d)}) + 0.5;\ncol = vec3(g);` });
            const ans = mk(rng.pick(dirs));
            const opts = distinct(rng, ans, (r, i) => (i === 0 ? mk(ans.d.map((x) => -x + 0)) : mk(r.pick(dirs))), 4, (o) => o.d.join());
            return {
              prompt: 'Which picture does this code draw?',
              code: ans.code,
              options: opts.map((o) => ({ shader: { frag: o.code } })),
              explain: `<p>The value grows along <code>${v2(ans.d)}</code>, so that side is white. ${step ? 'step(0.0, …) cuts it into two halves along a line through the centre.' : ''}</p>`,
            };
          },
        },
        {
          id: 'proj-num', title: 'How far along?', engine: 'numeric', rounds: 6,
          blurb: 'Compute projections with dot.',
          gen: (rng, level) => {
            const ds = level === 1 ? [[1, 0], [0, 1], [-1, 0], [0, -1]] : [[0.6, 0.8], [0.8, 0.6], [0, 1], [-0.6, 0.8], [1, 0]];
            const d = rng.pick(ds);
            const p = [rng.step(-1, 1, level === 1 ? 0.5 : 0.25), rng.step(-1, 1, level === 1 ? 0.5 : 0.25)];
            const k = r2(G.dot(p, d));
            if (level === 3 && rng.chance(0.5)) {
              const on = G.mul(d, k).map(r2);
              return { prompt: 'Where is the closest point on the line through 0 along d?', code: `vec2 p = ${v2(p)};\nvec2 d = ${v2(d)};   // unit\nvec2 onLine = dot(p, d) * d;`, answer: on, wrap: 'vec2', explain: `<p>dot(p, d) = ${n(k)} → ${n(k)} × ${nv(d)} = <b>${nv(on)}</b>.</p>` };
            }
            return {
              prompt: 'How far along d is the point p?',
              code: `vec2 p = ${v2(p)};\nvec2 d = ${v2(d)};   // unit length\nfloat along = dot(p, d);`,
              answer: k,
              explain: `<p>${n(p[0])}×${n(d[0])} + ${n(p[1])}×${n(d[1])} = <b>${n(k)}</b>. ${k < 0 ? 'Negative: p is behind the start, opposite to d.' : ''}</p>`,
            };
          },
        },
        {
          id: 'match-dir', title: 'Stripe angle', engine: 'slider', rounds: 4,
          blurb: 'Match the direction of the sawtooth stripes.',
          gen: (rng, level) => {
            const a = rng.step(20, 340, level === 1 ? 45 : level === 2 ? 15 : 5);
            const c = level === 3 ? rng.pick([4, 6, 8]) : 5;
            const params = [{ name: 'a', label: 'angle (degrees)', min: 0, max: 360, step: 5, target: a }];
            return {
              prompt: 'Match the stripes: each ramp gets brighter along dir.',
              sub: 'Angle 0° = right, 90° = up.',
              params, tolerance: 0.025,
              build: (vals) => ({ frag: `vec2 dir = vec2(cos(uA), sin(uA));\nfloat s = fract(dot(uv, dir) * ${f(c)});\ncol = vec3(s) * vec3(0.5, 0.85, 1.0);`, uniforms: { uA: vals.a * DEG } }),
              code: (vals) => `vec2 dir = vec2(${f(Math.cos(vals.a * DEG), 2)}, ${f(Math.sin(vals.a * DEG), 2)});  // ${vals.a}°\nfloat s = fract(dot(uv, dir) * ${f(c)});`,
              explain: `<p>Target: <b>${a}°</b>, dir = ${nv(unitAt(a), 2)}. The stripes run perpendicular to dir, and each ramp brightens towards dir.</p>`,
            };
          },
        },
      ],
    },
  ],
};
