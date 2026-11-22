// Topic — Lighting: normals, diffuse, ambient, specular, rim, toon, multiple lights, normal maps.
import { tf, q, distinct, f, v, n, nv, G, h, canvas2d, vectorPlane, arrow, css } from './_kit.js';

// ================================================================ shared helpers
const rad = (d) => (d * Math.PI) / 180;
const r3 = (x) => +(+x).toFixed(3);
/** Light direction from an angle on screen (0 = from the right, 90 = from the top) and a "toward you" z. */
const ldir = (deg, z = 0.6) => G.normalize([Math.cos(rad(deg)), Math.sin(rad(deg)), z]).map(r3);
const DIRN = ['the right', 'the top-right', 'the top', 'the top-left', 'the left', 'the bottom-left', 'the bottom', 'the bottom-right'];
const dirName = (deg) => DIRN[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const GREY = [0.9, 0.9, 0.9];
const ORANGE = [1.0, 0.55, 0.25];
const BGC = 'vec3(0.08, 0.085, 0.11)';

/**
 * A "fake sphere" drawn on a flat square: N comes from sphereNormal(uv), the viewer looks
 * straight at it so V = (0,0,1). Pixels outside the circle get the background colour.
 */
const sph = (body, extra = {}) => ({
  frag: `vec4 sphM = sphereNormal(uv);\nN = sphM.xyz;\nvec3 V = vec3(0.0, 0.0, 1.0);\n${body}\ncol = mix(${BGC}, col, sphM.w);`,
  ...extra,
});
/** A real 3D mesh. Camera looks from the front (+z) and slightly above, so screen-right ≈ +x, up ≈ +y. */
const mesh3d = (body, mesh = 'sphere', extra = {}) => {
  const { camera, ...rest } = extra;
  return { mesh, frag: `vec3 V = normalize(uCamPos - P);\n${body}`, ...rest, camera: { yaw: 0, pitch: 0.35, dist: mesh === 'torus' ? 3.0 : 3.2, ...(camera || {}) } };
};

const LAMB = 'float d = max(dot(N, uL), 0.0);\ncol = uAlb * d;';
const HALF = 'float d = dot(N, uL) * 0.5 + 0.5;\ncol = uAlb * d;';
const lambert = (L, alb = GREY) => sph(LAMB, { uniforms: { uL: L, uAlb: alb } });
const lcode = (L) => `vec3 L = normalize(${v(L, 2)}); // points TOWARD the light`;

/** JS mirror of the fake sphere: normal at uv, or null outside the circle */
const sphN = (u, w) => {
  const x = u * 2 - 1, y = w * 2 - 1, r2 = x * x + y * y;
  return r2 > 1 ? null : [x, y, Math.sqrt(1 - r2)];
};
/** uv where the fake sphere's normal equals n (needs n.z >= 0) */
const uvOf = (nrm) => [r3(nrm[0] * 0.5 + 0.5), r3(nrm[1] * 0.5 + 0.5)];

function hsv(hh, s, vv) {
  const k = (m) => (m + hh * 6) % 6;
  const ch = (m) => vv - vv * s * Math.max(0, Math.min(k(m), 4 - k(m), 1));
  return [ch(5), ch(3), ch(1)].map(r3);
}

/** row of labelled colour swatches for prompts */
const swatchRow = (items) => (el) => {
  const row = h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'flex-end', margin: '8px 0' } });
  items.forEach(([label, c]) => {
    if (c === '×' || c === '+' || c === '=') { row.append(h('div', { style: { fontSize: '22px', paddingBottom: '22px' } }, c)); return; }
    row.append(h('div', { style: { textAlign: 'center' } },
      h('div', { style: { width: '62px', height: '46px', borderRadius: '8px', background: css(c), border: '1px solid #333' } }),
      h('div.small.dim', { html: label })));
  });
  el.append(row);
};

/** codefill: make the "Yours" preview start from a wrong-but-compiling option, not the answer */
const ph = (slots) => slots.map((sl) => ({ ...sl, placeholder: sl.options.find((o) => o !== sl.answer && !/^-?\d+$/.test(o)) }));

// Unit vectors with "nice" decimals (3-4-5 style) for mental maths.
const NICE2 = [[1, 0], [0, 1], [0.6, 0.8], [0.8, 0.6], [-0.6, 0.8], [-0.8, 0.6], [0.6, -0.8], [0.8, -0.6], [-1, 0], [0, -1]];
const NICE3 = [[0, 0.6, 0.8], [0.6, 0, 0.8], [0.8, 0, 0.6], [0, 0.8, 0.6], [0.36, 0.48, 0.8], [0.48, 0.6, 0.64], [0.64, 0.48, 0.6], [0.48, 0.64, 0.6], [0.6, 0.48, 0.64], [0, 0, 1], [0, 1, 0], [1, 0, 0]];
const signed = (rng, a, p = 0.35) => a.map((x) => (x !== 0 && rng.chance(p) ? -x : x));

// Lighting models used in "which model is this?" games (all lit from the same L).
const MODELS = {
  lambert: { name: 'Lambert diffuse', body: 'float d = max(dot(N, uL), 0.0);\ncol = uAlb * d;' },
  half: { name: 'Half-Lambert', body: 'float d = dot(N, uL) * 0.5 + 0.5;\ncol = uAlb * d;' },
  blinn: { name: 'Diffuse + Blinn-Phong specular', body: 'float d = max(dot(N, uL), 0.0);\nvec3 H = normalize(uL + V);\nfloat s = pow(max(dot(N, H), 0.0), 48.0);\ncol = uAlb * d + vec3(s);' },
  rim: { name: 'Fresnel / rim only', body: 'float r = pow(1.0 - max(dot(N, V), 0.0), 3.0);\ncol = vec3(0.3, 0.7, 1.0) * r;' },
  toon: { name: 'Toon (2 bands)', body: 'float d = max(dot(N, uL), 0.0);\ncol = uAlb * mix(0.25, 1.0, step(0.4, d));' },
  hemi: { name: 'Hemisphere ambient', body: 'col = uAlb * mix(vec3(0.35, 0.22, 0.12), vec3(0.45, 0.7, 1.0), N.y * 0.5 + 0.5);' },
  normals: { name: 'Normals as colour', body: 'col = N * 0.5 + 0.5;' },
  unlit: { name: 'Unlit (no lighting)', body: 'col = uAlb;' },
};
const modelSpec = (k, L, alb = GREY) => sph(MODELS[k].body, { uniforms: { uL: L, uAlb: alb } });

// ---------------------------------------------------------------- small canvases for lessons
function curveNormals(el, vals) {
  const c = canvas2d(300, 190);
  const { ctx } = c;
  const fy = (x) => 0.25 * Math.sin(x * 2.2) + 0.12 * Math.sin(x * 5.1 + 1);
  const dfy = (x) => 0.25 * 2.2 * Math.cos(x * 2.2) + 0.12 * 5.1 * Math.cos(x * 5.1 + 1);
  const X = (x) => 20 + (x / 3) * 260, Y = (y) => 130 - y * 120;
  ctx.fillStyle = '#2a2d3a';
  ctx.beginPath(); ctx.moveTo(X(0), 190);
  for (let i = 0; i <= 100; i++) { const x = (i / 100) * 3; ctx.lineTo(X(x), Y(fy(x))); }
  ctx.lineTo(X(3), 190); ctx.fill();
  ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const x = (i / 100) * 3; i ? ctx.lineTo(X(x), Y(fy(x))) : ctx.moveTo(X(x), Y(fy(x))); }
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const x = 0.15 + (i / 8) * 2.7;
    const nn = G.normalize([-dfy(x), 1]);
    arrow(ctx, X(x), Y(fy(x)), X(x) + nn[0] * 30, Y(fy(x)) - nn[1] * 30, '#4a6080', 2, 7);
  }
  const x = vals.p * 3;
  const nn = G.normalize([-dfy(x), 1]);
  arrow(ctx, X(x), Y(fy(x)), X(x) + nn[0] * 55, Y(fy(x)) - nn[1] * 55, '#ffd479', 3.5, 11);
  ctx.fillStyle = '#ffd479'; ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.fillText(`N = (${nn[0].toFixed(2)}, ${nn[1].toFixed(2)})`, 12, 18);
  el.append(c.el);
}

function beamVisual(el, vals) {
  const c = canvas2d(300, 200);
  const { ctx } = c;
  const th = rad(vals.a);
  ctx.fillStyle = '#2a2d3a'; ctx.fillRect(0, 160, 300, 40);
  ctx.strokeStyle = '#c7b8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 160); ctx.lineTo(300, 160); ctx.stroke();
  const w = 50; // beam width
  const foot = w / Math.max(0.05, Math.cos(th));
  const cx = 150;
  const dx = Math.sin(th), dy = Math.cos(th);
  ctx.fillStyle = 'rgba(255,212,121,0.18)'; ctx.beginPath();
  ctx.moveTo(cx - foot / 2, 160); ctx.lineTo(cx + foot / 2, 160);
  ctx.lineTo(cx + foot / 2 + dx * 220, 160 - dy * 220); ctx.lineTo(cx - foot / 2 + dx * 220, 160 - dy * 220); ctx.fill();
  for (let k = 0; k < 5; k++) {
    const x0 = cx - foot / 2 + (k / 4) * foot;
    arrow(ctx, x0 + dx * 150, 160 - dy * 150, x0, 160, '#ffd479', 2, 8);
  }
  ctx.fillStyle = '#ff7ab2'; ctx.fillRect(cx - foot / 2, 158, foot, 5);
  arrow(ctx, cx, 160, cx, 95, '#6bdfff', 2.5, 9);
  ctx.fillStyle = '#6bdfff'; ctx.font = 'bold 13px -apple-system, sans-serif'; ctx.fillText('N', cx + 5, 100);
  const cs = Math.cos(th);
  ctx.fillStyle = '#fff'; ctx.font = '13px -apple-system, sans-serif';
  ctx.fillText(`angle to normal θ = ${vals.a}°`, 10, 18);
  ctx.fillText(`lit patch is ${(1 / Math.max(cs, 0.05)).toFixed(2)}× wider`, 10, 36);
  ctx.fillStyle = '#ffd479';
  ctx.fillText(`→ brightness = cos θ = ${cs.toFixed(2)}`, 10, 54);
  el.append(c.el);
}

function reflectDiagram(el, vals, mode) {
  const P = vectorPlane(1.4, 300);
  P.clear({ unitCircle: true });
  const Nn = [0, 1];
  const L = [Math.cos(rad(vals.l)), Math.sin(rad(vals.l))];
  const V = [Math.cos(rad(vals.v)), Math.sin(rad(vals.v))];
  P.arrow([-1.3, 0], '#555', '', [0.65, 0], 2); P.arrow([1.3, 0], '#555', '', [-0.65, 0], 2);
  P.arrow(Nn, '#6bdfff', 'N');
  P.arrow(L, '#ffd479', 'L');
  P.arrow(V, '#3ddc97', 'V');
  let txt;
  if (mode === 'phong') {
    const R = G.reflect([-L[0], -L[1]], Nn);
    P.arrow(R, '#ff7ab2', 'R');
    const rv = Math.max(0, G.dot(R, V));
    txt = `R = reflect(-L, N)<br>dot(R, V) = <b>${rv.toFixed(2)}</b> → pow(…, 16) = <b>${Math.pow(rv, 16).toFixed(3)}</b>`;
  } else {
    const H = G.normalize(G.add(L, V));
    P.arrow(H, '#ff9f43', 'H');
    const nh = Math.max(0, G.dot(Nn, H));
    txt = `H = normalize(L + V)<br>dot(N, H) = <b>${nh.toFixed(2)}</b> → pow(…, 64) = <b>${Math.pow(nh, 64).toFixed(3)}</b>`;
  }
  el.append(P.el, h('div.readout', { html: txt }));
}

// ---------------------------------------------------------------- generators reused by games
function ndotlItem(rng, level) {
  let N, L;
  if (level === 1) { N = signed(rng, rng.pick(NICE2)); L = signed(rng, rng.pick(NICE2)); N = [...N, 0]; L = [...L, 0]; }
  else { N = signed(rng, rng.pick(NICE3), level === 2 ? 0.2 : 0.4); L = signed(rng, rng.pick(NICE3), level === 2 ? 0.2 : 0.4); }
  const d = G.dot(N, L);
  const alb = level === 3 && rng.chance(0.5) ? rng.pick([0.5, 0.8]) : null;
  const ans = r3((alb ?? 1) * Math.max(0, d));
  const terms = N.map((x, i) => `${n(x)}×${n(L[i])}`).join(' + ');
  return {
    prompt: alb ? 'What brightness does this pixel get?' : 'What does <code>max(dot(N, L), 0.0)</code> give?',
    sub: 'Both vectors are already normalized. 2 decimals is enough.',
    code: `vec3 N = ${v(N, 2)};\nvec3 L = ${v(L, 2)};\n` + (alb ? `float albedo = ${f(alb)};\nfloat b = albedo * max(dot(N, L), 0.0);` : 'float d = max(dot(N, L), 0.0);'),
    answer: ans,
    explain: `<p>dot = ${terms} = <b>${n(d)}</b>.</p>` + (d < 0 ? '<p>It\'s negative: the surface faces <b>away</b> from the light, so <code>max(…, 0.0)</code> clamps it to 0.</p>' : '') + (alb ? `<p>Then × albedo ${n(alb)} → <b>${n(ans)}</b>.</p>` : ''),
  };
}

function terminatorRing(L) {
  let a = G.cross(L, [0, 0, 1]);
  if (G.length(a) < 1e-3) a = [1, 0, 0];
  a = G.normalize(a);
  const b = G.normalize(G.cross(L, a));
  const pts = [];
  for (let t = 0; t < 360; t += 5) {
    const N = G.add(G.mul(a, Math.cos(rad(t))), G.mul(b, Math.sin(rad(t))));
    if (N[2] > 0.25) pts.push(uvOf(N));
  }
  if (!pts.length) return [[0.5, 0.5]];
  return [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
}

// ================================================================ topic
export default {
  id: 'lighting',
  title: 'Lighting',
  icon: '💡',
  blurb: 'Normals, diffuse, specular, rim, toon and normal maps — how shaders fake light.',
  cheatsheet: `
<p><b>Vectors</b> (all normalized): <code>N</code> surface normal, <code>L</code> toward the light, <code>V</code> toward the camera.</p>
<pre class="code">vec3 N = normalize(vNormal);
vec3 V = normalize(uCamPos - P);
// visualise normals
col = N * 0.5 + 0.5;
// Lambert diffuse
float d = max(dot(N, L), 0.0);
// Half-Lambert (soft, no black side)
float hl = dot(N, L) * 0.5 + 0.5;
// hemisphere ambient
vec3 amb = mix(ground, sky, N.y * 0.5 + 0.5);
// Phong / Blinn-Phong specular
vec3 R = reflect(-L, N);
float ph = pow(max(dot(R, V), 0.0), shininess);
vec3 H = normalize(L + V);
float bp = pow(max(dot(N, H), 0.0), shininess);
// Fresnel / rim
float rim = pow(1.0 - max(dot(N, V), 0.0), power);
// toon
float t = floor(d * 3.0) / 3.0;   // or step(0.5, d), or a ramp texture
// combine
col = albedo * (amb + lightCol * d) + lightCol * bp + rimCol * rim;
// normal map (tangent space)
vec3 nt = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
N = normalize(T * nt.x + B * nt.y + N * nt.z);</pre>
<p>Diffuse doesn't care where the camera is; specular and Fresnel do. Colour textures are sRGB, normal maps are linear data.</p>`,
  concepts: [
    // ================================================================== 1. NORMALS
    {
      id: 'lighting.normals',
      title: 'Normals: which way is the surface facing?',
      blurb: 'The arrow that every lighting formula starts from.',
      lesson: [
        {
          title: 'A normal is a "facing" arrow',
          body: `<p>Before we can light anything, each pixel must know <b>which way its bit of surface is facing</b>.</p>
<p>That direction is called the <b>normal</b>, written <code>N</code>: an arrow of length 1 sticking <b>straight out</b> of the surface (at 90° to it).</p>
<div class="analogy">🦔 <b>Analogy:</b> think of a hedgehog. Every spine points straight out of the skin right where it grows. The spines <i>are</i> the normals.</div>
<p>Slide along the hill. The yellow arrow is the normal at that point — watch its numbers change as the slope changes.</p>`,
          controls: [{ name: 'p', label: 'position on the surface', min: 0.03, max: 0.97, step: 0.01, value: 0.3 }],
          visual: curveNormals,
          after: '<div class="note">Flat ground → N = (0, 1): straight up. Steep slope → N leans sideways. The normal only describes <b>direction</b>, so its length is always 1.</div>',
        },
        {
          title: 'Seeing normals as colour',
          body: `<p>A normal has three numbers <code>(x, y, z)</code>, and so does a colour <code>(r, g, b)</code>. So we can just <b>show the normal as a colour</b>!</p>
<p>One snag: normal components go from <b>-1 to 1</b>, but colours only show 0 to 1 (negative = black). So we squash the range:</p>
<pre class="code">col = N * 0.5 + 0.5;  // -1 → 0,   0 → 0.5,   1 → 1</pre>
<p>Use the slider to look at one channel at a time (as grey).</p>`,
          controls: [{ name: 'ch', label: 'show: 0 = all, 1 = x(red), 2 = y(green), 3 = z(blue)', min: 0, max: 3, step: 1, value: 0 }],
          shader: (vv) => sph('vec3 c = N * 0.5 + 0.5;\nif (uCh > 0.5) c = vec3(uCh < 1.5 ? c.r : uCh < 2.5 ? c.g : c.b);\ncol = c;', { uniforms: { uCh: vv.ch } }),
          code: (vv) => ['col = N * 0.5 + 0.5;            // all three', 'col = vec3(N.x * 0.5 + 0.5);   // x: right = bright, left = dark', 'col = vec3(N.y * 0.5 + 0.5);   // y: top = bright, bottom = dark', 'col = vec3(N.z * 0.5 + 0.5);   // z: facing you = bright, edge = mid grey'][vv.ch],
          after: '<div class="note"><b>Reddish = faces right (+x), greenish = faces up (+y), bluish = faces you (+z).</b> This "normal colour" view is the #1 debugging tool for lighting.</div>',
        },
        {
          title: 'A fake sphere from uv',
          body: `<p>We don't even need 3D geometry to get a sphere's normals. For a ball seen from the front:</p>
<ol><li><code>p = uv * 2.0 - 1.0</code> — centre the square, so p goes -1..1. That's the normal's <b>x and y</b>.</li>
<li>The normal has length 1, so <code>z = sqrt(1 - x² - y²)</code> — big in the middle (facing you), 0 at the rim.</li></ol>
<p>The app has this built in as <code>sphereNormal(uv)</code> (xyz = normal, w = 1 inside the circle). Step through it:</p>`,
          controls: [{ name: 'st', label: 'step', min: 1, max: 3, step: 1, value: 1 }],
          shader: (vv) => ({ frag: `vec2 p = uv * 2.0 - 1.0;\nfloat r2 = dot(p, p);\nfloat z = sqrt(max(0.0, 1.0 - r2));\nif (uSt < 1.5) col = vec3(p * 0.5 + 0.5, 0.0);\nelse if (uSt < 2.5) col = vec3(z);\nelse col = vec3(p, z) * 0.5 + 0.5;\ncol *= step(r2, 1.0);`, uniforms: { uSt: vv.st } }),
          code: (vv) => ['vec2 p = uv * 2.0 - 1.0;   // x,y of the normal\ncol = vec3(p * 0.5 + 0.5, 0.0);', 'float z = sqrt(1.0 - dot(p, p)); // how much it faces you\ncol = vec3(z);', 'vec3 N = vec3(p, z);   // = sphereNormal(uv).xyz\ncol = N * 0.5 + 0.5;'][vv.st - 1],
          after: '<div class="tip">💡 Handy fact for later games: on this fake sphere, the spot whose normal is <code>N</code> sits at <code>uv = N.xy * 0.5 + 0.5</code>.</div>',
        },
        {
          title: 'Real meshes',
          body: `<p>On a real 3D model, normals are <b>stored on each vertex</b> by the modelling tool, then blended across every triangle so each pixel gets its own.</p>
<p>In the fragment shader you always <code>normalize()</code> it again, because blending two unit vectors gives one that's slightly too short.</p>
<p>Same <code>N * 0.5 + 0.5</code> colouring on a sphere, a torus and a cube (they rotate):</p>`,
          shaders: [
            { spec: mesh3d('col = N * 0.5 + 0.5;', 'sphere', { camera: { spin: 0.5 } }), caption: 'sphere' },
            { spec: mesh3d('col = N * 0.5 + 0.5;', 'torus', { camera: { spin: 0.5 } }), caption: 'torus' },
            { spec: mesh3d('col = N * 0.5 + 0.5;', 'cube', { camera: { spin: 0.5 } }), caption: 'cube: flat faces → flat colours' },
          ],
          code: 'vec3 N = normalize(vNormal); // re-normalize after interpolation\ncol = N * 0.5 + 0.5;',
          quiz: { q: 'A cube face looks perfectly flat light-green in the normal view. Which way does it face?', options: ['Up (+y)', 'Right (+x)', 'Toward the camera (+z)'], answer: 0, explain: 'Light green ≈ (0.5, 1, 0.5) → N = (0, 1, 0): straight up.' },
        },
      ],
      games: [
        {
          id: 'normal-colour', title: 'Normal → colour', engine: 'mcq', rounds: 8,
          blurb: 'Which colour does N * 0.5 + 0.5 give for this normal?',
          gen: (rng, level) => {
            const L1 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]];
            const L2 = [[0.6, 0.8, 0], [0, 0.6, 0.8], [0.8, 0, 0.6], [-0.6, 0, 0.8], [0, -0.8, 0.6], [-0.8, 0.6, 0]];
            const L3 = [[0.36, 0.48, 0.8], [-0.48, 0.6, 0.64], [0.64, -0.48, 0.6], [-0.6, -0.48, 0.64], [0, 0, -1]];
            const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2] : [...L2, ...L3];
            const N = rng.pick(pool);
            const enc = (x) => G.add(G.mul(x, 0.5), 0.5).map(r3);
            const raw = N.map((x) => Math.max(0, x));
            const opts = distinct(rng, enc(N), (r, i) => (i === 0 && level > 1 ? raw : enc(r.pick([...L1, ...L2, ...L3]))), 4, (c) => c.map((x) => x.toFixed(2)).join());
            return {
              prompt: `Which colour does <code>N * 0.5 + 0.5</code> show for this normal?`,
              code: `vec3 N = ${v(N, 2)};\ncol = N * 0.5 + 0.5;`,
              options: opts.map((c) => ({ color: c })),
              explain: `<p>Each component: x·0.5+0.5. So ${nv(N)} → <b>${nv(enc(N))}</b>.</p><p>Remember: red = x (right), green = y (up), blue = z (toward you). -1 becomes 0, 0 becomes 0.5.</p>`,
            };
          },
        },
        {
          id: 'find-facing', title: 'Find the facing', engine: 'tap', rounds: 6,
          blurb: 'Tap the spot on the sphere whose normal points this way.',
          gen: (rng, level) => {
            const pool = [[0, 0, 1], [0.6, 0, 0.8], [-0.6, 0, 0.8], [0, 0.6, 0.8], [0, -0.6, 0.8], [0.8, 0, 0.6], [-0.8, 0, 0.6], [0, 0.8, 0.6], [0, -0.8, 0.6],
              [0.48, 0.6, 0.64], [-0.48, 0.6, 0.64], [0.6, -0.48, 0.64], [-0.36, -0.48, 0.8], [0.64, 0.48, 0.6]];
            const N = rng.pick(level === 1 ? pool.slice(0, 9) : pool);
            const shader = level < 3 ? sph('col = N * 0.5 + 0.5;') : lambert(ldir(rng.pick([45, 135, 90]), 0.8));
            return {
              prompt: `Tap where the normal is <code>N = ${nv(N)}</code>.`,
              sub: level < 3 ? 'The sphere shows N * 0.5 + 0.5 as colour.' : 'Plain lit sphere now — use the geometry: uv = N.xy * 0.5 + 0.5.',
              shader,
              target: uvOf(N),
              radius: 0.07,
              explain: `<p>On the fake sphere, <code>N.xy = uv * 2 - 1</code>, so the spot is at <code>uv = N.xy * 0.5 + 0.5</code> = <b>${nv(uvOf(N))}</b>.</p><p>z = ${n(N[2])} tells you how much it faces you: 1 = dead centre, 0 = on the outline.</p>`,
            };
          },
        },
        {
          id: 'decode-normal', title: 'Colour → normal', engine: 'numeric', rounds: 5,
          blurb: 'Read a normal back from its debug colour: N = col * 2 - 1.',
          gen: (rng, level) => {
            if (level === 1) {
              const c = rng.pick([0, 0.25, 0.5, 0.75, 1, 0.9, 0.1, 0.8, 0.2]);
              const ch = rng.int(0, 2);
              const nm = ['red', 'green', 'blue'][ch], ax = 'xyz'[ch];
              return {
                prompt: `A pixel in the normal view has <b>${nm} = ${n(c)}</b>. What is <code>N.${ax}</code>?`,
                sub: 'Undo the squash: N = col * 2 - 1.',
                code: `col = N * 0.5 + 0.5;  // how it was made\nN.${ax} = ${f(c)} * 2.0 - 1.0;  // = ?`,
                answer: r3(c * 2 - 1),
                explain: `<p>${n(c)} × 2 − 1 = <b>${n(c * 2 - 1)}</b>. The inverse of "×0.5 + 0.5" is "×2 − 1".</p>`,
              };
            }
            const N = signed(rng, rng.pick(NICE3), 0.4);
            if (N[2] < 0 && level === 2) N[2] = -N[2];
            const c = N.map((x) => r3(x * 0.5 + 0.5));
            return {
              prompt: 'This colour came from <code>N * 0.5 + 0.5</code>. What was the normal?',
              sub: 'Type x, y and z (tap "next" to move between fields).',
              color: c,
              code: `col = ${v(c)};`,
              answer: N, labels: ['x', 'y', 'z'], wrap: 'vec3',
              explain: `<p>col × 2 − 1 per channel: ${nv(c)} → <b>${nv(N)}</b>.</p>${N[2] < 0 ? '<p>Blue below 0.5 means z is negative: that bit faces <b>away</b> from you.</p>' : ''}`,
            };
          },
        },
        {
          id: 'normal-facts', title: 'Normal facts', engine: 'mcq', rounds: 8,
          blurb: 'Quick concept checks about normals.',
          questions: [
            tf('A normal is an arrow pointing straight out of the surface.', true, 'Yes — perpendicular (90°) to the surface, pointing outward.'),
            tf('A normal used for lighting should have length 1.', true, 'Lighting uses dot products, which only give a clean cosine if both vectors are unit length.'),
            tf('Normal components are always between 0 and 1.', false, 'They go from -1 to 1. That\'s why we use N * 0.5 + 0.5 to display them.'),
            tf('In the normal view, a pixel facing straight up looks green-ish.', true, 'N = (0,1,0) → colour (0.5, 1, 0.5).'),
            tf('A flat floor has the same normal everywhere.', true, 'Every point faces the same way → one constant normal.'),
            tf('You should normalize() the normal in the fragment shader even if the vertex normals were unit length.', true, 'Blending (interpolating) unit vectors across a triangle shortens them a bit.', 2),
            tf('The fake sphere\'s normal at the centre of the circle is (0, 0, 1).', true, 'The centre faces you directly: x = y = 0, z = 1.'),
            tf('A bluish-purple normal-view pixel faces mostly toward the camera.', true, 'Blue = z. (0.5, 0.5, 1) is the classic "facing you" colour — the colour of a flat normal map.', 2),
            q('What does <code>N * 0.5 + 0.5</code> do?', ['Squashes -1..1 into 0..1 so it can be shown as colour', 'Makes the normal half as long', 'Lights the surface from the front'], 'It\'s just a range remap for display.'),
            q('In the normal view, which channel tells you "facing right vs left"?', ['Red (x)', 'Green (y)', 'Blue (z)'], 'x is right/left, shown in red.'),
            q('Why do cube faces look like flat blocks of colour in the normal view?', ['Each face has one single normal direction', 'Cubes have no normals', 'The texture is flat'], 'Flat face = one direction = one colour.'),
            q('On the fake sphere, where is the normal (1, 0, 0)?', ['On the right edge of the circle', 'In the centre', 'At the top edge'], 'uv = N.xy * 0.5 + 0.5 = (1, 0.5): the right edge.', { level: 2 }),
          ],
        },
      ],
    },
    // ================================================================== 2. LAMBERT
    {
      id: 'lighting.lambert',
      title: 'Lambert diffuse: N · L',
      blurb: 'Why surfaces facing the light are bright — the core of all lighting.',
      lesson: [
        {
          title: 'Light hitting at an angle spreads out',
          body: `<p>Shine a torch straight down on a table: a small, <b>bright</b> spot. Tilt the torch: the same light covers a <b>longer</b> patch, so each bit gets <b>less</b> light.</p>
<div class="analogy">☀️ <b>Analogy:</b> that's why noon is hot and evening is cool. Same sun, but in the evening its light is smeared over more ground.</div>
<p>Drag the angle between the light and the surface's normal:</p>`,
          controls: [{ name: 'a', label: 'angle θ between light and normal (°)', min: 0, max: 85, step: 1, value: 30 }],
          visual: beamVisual,
          after: '<div class="note">The brightness falls off exactly like <b>cos θ</b>. This is <b>Lambert\'s cosine law</b>, from 1760!</div>',
        },
        {
          title: 'The dot product IS the cosine',
          body: `<p>From vector maths: for two <b>unit</b> vectors, <code>dot(N, L) = cos θ</code>. So the whole law is one line:</p>
<pre class="code">float d = dot(N, L);</pre>
<p><code>L</code> is the direction <b>from the surface toward the light</b> (not where the light is shining to — a classic mix-up!).</p>`,
          controls: [{ name: 'a', label: 'θ (°)', min: 0, max: 180, step: 1, value: 45 }],
          graph: { fns: () => [{ f: (x) => Math.cos(rad(x)), label: 'dot(N,L) = cos θ' }], opts: (vv) => ({ xmin: 0, xmax: 180, ymin: -1.1, ymax: 1.1, xstep: 45, ystep: 0.5, points: [{ x: vv.a, y: Math.cos(rad(vv.a)), label: Math.cos(rad(vv.a)).toFixed(2) }] }) },
          code: (vv) => `// θ = ${vv.a}°\nfloat d = dot(N, L); // = ${Math.cos(rad(vv.a)).toFixed(3)}\n// 0° → 1 (facing the light)\n// 90° → 0 (light just grazes it)\n// >90° → negative (facing away)`,
        },
        {
          title: 'Light a sphere',
          body: `<p>Now every pixel of our fake sphere computes <code>dot(N, L)</code> with its own normal. Move the light around.</p>
<p>Here <b>negative</b> values are drawn in <span style="color:#ff6b6b">red</span> so you can see them — those pixels face away from the light.</p>`,
          controls: [
            { name: 'a', label: 'light angle (° around, 0 = right)', min: 0, max: 360, step: 5, value: 45 },
            { name: 'z', label: 'light toward you (z)', min: -1, max: 1, step: 0.05, value: 0.5 },
          ],
          shader: (vv) => sph('float d = dot(N, uL);\ncol = d > 0.0 ? vec3(d) : vec3(-d, 0.0, 0.0);', { uniforms: { uL: ldir(vv.a, vv.z) } }),
          code: (vv) => `${lcode(ldir(vv.a, vv.z))}\nfloat d = dot(N, L);\n// white = lit, red = NEGATIVE (facing away)`,
          after: '<div class="note">The line where white meets red is where <code>dot(N, L) = 0</code>. Artists call it the <b>terminator</b> — the edge between day and night on the Moon.</div>',
        },
        {
          title: 'Why max(…, 0.0)?',
          body: `<p>Negative light doesn't exist. But if you leave negative numbers in, they <b>subtract</b> from any other light you add later!</p>
<p>Both spheres below add a little base light (0.25). Left forgot the <code>max</code>: its back side is pitch black because -0.8 + 0.25 is still negative. Right clamps first, so the back keeps its 0.25.</p>`,
          controls: [{ name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 30 }],
          shaders: [
            { spec: (vv) => sph('float d = dot(N, uL);\ncol = vec3(d + 0.25);', { uniforms: { uL: ldir(vv.a, 0.3) } }), label: '<code>dot + 0.25</code> ❌' },
            { spec: (vv) => sph('float d = max(dot(N, uL), 0.0);\ncol = vec3(d + 0.25);', { uniforms: { uL: ldir(vv.a, 0.3) } }), label: '<code>max(dot, 0) + 0.25</code> ✅' },
          ],
          code: 'float d = max(dot(N, L), 0.0);   // HLSL: saturate(dot(N, L))',
          after: '<div class="tip">💡 In HLSL you\'ll often see <code>saturate(dot(N, L))</code> — clamp to 0..1. Unreal\'s material editor does this lighting for you; in Shader Graph custom lighting you\'d write it with a Dot Product + Saturate node.</div>',
        },
        {
          title: 'Albedo: the surface colour',
          body: `<p>The diffuse term only says <i>how much</i> light arrives. The surface's own colour (<b>albedo</b>, a.k.a. base colour) decides which part of that light bounces back:</p>
<pre class="code">col = albedo * max(dot(N, L), 0.0);</pre>
<p>Multiply! White albedo returns everything; a red surface returns only red.</p>`,
          controls: [
            { name: 'hu', label: 'albedo hue', min: 0, max: 1, step: 0.01, value: 0.07 },
            { name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 60 },
          ],
          shader: (vv) => lambert(ldir(vv.a, 0.6), hsv(vv.hu, 0.7, 0.95)),
          code: (vv) => `vec3 albedo = ${v(hsv(vv.hu, 0.7, 0.95), 2)};\n${lcode(ldir(vv.a, 0.6))}\nfloat d = max(dot(N, L), 0.0);\ncol = albedo * d;`,
        },
        {
          title: 'Same formula on a real mesh',
          body: `<p>Nothing changes for real 3D models: per pixel, take the interpolated normal, dot it with the light direction, clamp, multiply by albedo.</p>
<p>The torus spins, but the light is fixed in the world — notice the lit side stays on the same side of the <i>screen</i>.</p>`,
          controls: [{ name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 45 }],
          shader: (vv) => mesh3d(LAMB, 'torus', { uniforms: { uL: ldir(vv.a, 0.6), uAlb: ORANGE }, camera: { spin: 0.4 } }),
          code: (vv) => `vec3 N = normalize(vNormal);\n${lcode(ldir(vv.a, 0.6))}\ncol = albedo * max(dot(N, L), 0.0);`,
          quiz: { q: 'You move the camera around a Lambert-lit statue. What happens to the shading on the statue?', options: ['Nothing — diffuse doesn\'t depend on the camera', 'The bright part follows the camera', 'It gets darker'], answer: 0, explain: 'Lambert only uses N and L. The viewer V is not in the formula at all.' },
        },
      ],
      games: [
        {
          id: 'match-light', title: 'Aim the light', engine: 'slider', rounds: 4,
          blurb: 'Move the light until your sphere is lit like the target.',
          gen: (rng, level) => {
            const a = level === 1 ? rng.pick([0, 45, 90, 135, 180, 225, 270, 315]) : rng.step(0, 345, 15);
            const z = level === 1 ? 0.5 : rng.step(0, 1, 0.25);
            const params = [{ name: 'a', label: 'light angle (°)', min: 0, max: 345, step: 15, target: a }];
            if (level > 1) params.push({ name: 'z', label: 'light toward you (z)', min: 0, max: 1, step: 0.05, target: z });
            return {
              prompt: 'Aim the light so your sphere matches the target.',
              sub: level === 1 ? 'Angle: 0° = from the right, 90° = from the top.' : 'Bigger z = light more in front → lit patch moves to the centre and the dark side shrinks.',
              params,
              build: (p) => lambert(ldir(p.a, p.z ?? 0.5)),
              code: (p) => `${lcode(ldir(p.a, p.z ?? 0.5))}\ncol = vec3(max(dot(N, L), 0.0));`,
              compare: 'pixels',
              explain: `<p>Target: light from ${dirName(a)} (${a}°)${level > 1 ? `, z = ${n(z)}` : ''}. The brightest point is where N points straight at the light; the dark side faces away from it.</p>`,
            };
          },
        },
        {
          id: 'brightest', title: 'Find the hot spot', engine: 'tap', rounds: 6,
          blurb: 'Where does N · L reach 1?',
          gen: (rng, level) => {
            const a = level === 1 ? rng.pick([0, 45, 90, 135, 180, 225, 270, 315]) : rng.step(0, 345, 15);
            const z = level === 1 ? rng.pick([0.6, 1]) : rng.step(0.3, 1.5, 0.1);
            const L = ldir(a, z);
            const show = level === 3 ? sph('col = vec3(0.6);') : lambert(L);
            return {
              prompt: level === 3 ? 'The light direction is below. Tap where this sphere would be <b>brightest</b>.' : 'Tap the <b>brightest</b> point of the sphere.',
              sub: level === 3 ? 'No shading shown — work it out! Brightest where N = L.' : 'Think: where does the normal point exactly at the light?',
              code: lcode(L),
              shader: show,
              target: uvOf(L),
              radius: 0.07,
              explain: `<p>dot(N, L) = 1 where <b>N = L</b>. On the fake sphere that's at uv = L.xy * 0.5 + 0.5 = <b>${nv(uvOf(L))}</b>.</p>`,
            };
          },
        },
        {
          id: 'terminator', title: 'Day / night line', engine: 'tap', rounds: 5,
          blurb: 'Tap a point on the terminator, where N · L = 0.',
          gen: (rng, level) => {
            const a = rng.step(0, 345, level === 1 ? 45 : 15);
            const z = level === 1 ? rng.pick([0, 0.3]) : rng.step(-0.4, 0.4, 0.1);
            const L = ldir(a, z);
            const half = level > 1;
            return {
              prompt: 'Tap a point where <code>dot(N, L) = 0</code> (the terminator).',
              sub: half ? 'This sphere uses Half-Lambert: dot * 0.5 + 0.5. So where is dot = 0?' : 'Plain Lambert lighting.',
              code: lcode(L),
              shader: half ? sph(HALF, { uniforms: { uL: L, uAlb: GREY } }) : lambert(L),
              score: (u, w) => {
                const N = sphN(u, w);
                if (!N || N[2] < 0.12) return 0;
                const d = Math.abs(G.dot(N, L));
                return d < 0.1 ? 1 : Math.max(0, 1 - (d - 0.1) / 0.25);
              },
              reveal: terminatorRing(L),
              explain: half
                ? '<p>Half-Lambert maps dot = -1 → 0, dot = 0 → <b>0.5</b>, dot = 1 → 1. So the terminator is the <b>middle-grey</b> ring, not the dark edge.</p>'
                : '<p>With Lambert the terminator is exactly where the lit part fades into black: N is at 90° to L there.</p>',
            };
          },
        },
        {
          id: 'ndotl-calc', title: 'Compute N · L', engine: 'numeric', rounds: 5,
          blurb: 'Be the GPU: work out the diffuse brightness by hand.',
          gen: ndotlItem,
        },
        {
          id: 'drag-light', title: 'Drag the light', engine: 'vector', rounds: 5,
          blurb: 'Drag L (a side view) to light the surface exactly as asked.',
          gen: (rng, level) => {
            const ang = rng.step(30, 150, 30);
            const A = [Math.cos(rad(ang)), Math.sin(rad(ang))].map(r3);
            const fmt = (x) => x.toFixed(2);
            if (level < 3) {
              const t = level === 1 ? rng.pick([1, 0.5, 0]) : rng.pick([0.87, 0.71, 0.5, 0.25, 0]);
              const startA = ang + 180;
              return {
                prompt: `Drag the light direction <b>L</b> so this surface gets <code>dot(N, L) = ${n(t)}</code>.`,
                sub: 'Side view. N is the blue normal. L is a unit vector.',
                R: 1.4,
                fixed: [{ v: A, color: '#6bdfff', label: 'N' }],
                drag: [{ v: [Math.cos(rad(startA)), Math.sin(rad(startA))], color: '#ffd479', label: 'L', unit: true }],
                readout: (vs) => `dot(N, L) = <b>${fmt(G.dot(vs[0], A))}</b> &nbsp; → lit: <b>${fmt(Math.max(0, G.dot(vs[0], A)))}</b>`,
                check: (vs) => { const e = Math.abs(G.dot(vs[0], A) - t); return e <= 0.05 ? 1 : Math.max(0, 1 - (e - 0.05) / 0.2); },
                answer: t === 1 ? [A] : [G.rot2(A, Math.acos(t))],
                explain: `<p>dot = cos(angle between N and L). ${n(t)} = cos ${Math.round((Math.acos(t) * 180) / Math.PI)}°, so L must be ${Math.round((Math.acos(t) * 180) / Math.PI)}° away from N (either side works).</p>`,
              };
            }
            const gap = rng.pick([90, 120, 150]) * rng.sign();
            const B = G.rot2(A, rad(gap)).map(r3);
            return {
              prompt: 'Two surfaces, A and B. Drag <b>L</b> so A gets <b>at least 0.5</b> but B stays <b>completely dark</b>.',
              sub: 'Dark means max(dot(N, L), 0) = 0.',
              R: 1.4,
              fixed: [{ v: A, color: '#6bdfff', label: 'A' }, { v: B, color: '#c7b8ff', label: 'B' }],
              drag: [{ v: [0, -1], color: '#ffd479', label: 'L', unit: true }],
              readout: (vs) => `A: <b>${fmt(Math.max(0, G.dot(vs[0], A)))}</b> &nbsp; B: <b>${fmt(Math.max(0, G.dot(vs[0], B)))}</b>`,
              check: (vs) => { const a = G.dot(vs[0], A) >= 0.48, b = G.dot(vs[0], B) <= 0.02; return a && b ? 1 : a || b ? 0.4 : 0; },
              answer: [G.rot2(A, -Math.sign(gap) * rad(30))],
              explain: '<p>A needs L within 60° of it (cos 60° = 0.5). B needs L at 90° or more from it. Swing L from A, away from B.</p>',
            };
          },
        },
        {
          id: 'lambert-fill', title: 'Write Lambert', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the missing pieces of the diffuse formula.',
          gen: (rng, level) => {
            const a = rng.step(0, 315, 45);
            const L = ldir(a, 0.6);
            const pre = `vec3 L = ${v(L, 2)};\n`;
            const variants = [
              { template: 'float d = [[0]](dot(N, L), 0.0);\ncol = vec3(d);', slots: [{ options: ['max', 'min', 'pow', 'step'], answer: 'max' }], explain: '<code>max(x, 0.0)</code> removes negative values. <code>min</code> would keep only the negatives (all black).' },
              { template: 'float d = max(dot([[0]], [[1]]), 0.0);\ncol = vec3(d);', slots: [{ options: ['N', 'V', 'uv', 'P'], answer: 'N' }, { options: ['L', 'V', 'N', 'col'], answer: 'L' }], explain: 'Diffuse compares the surface normal with the light direction. Order doesn\'t matter: dot(L, N) = dot(N, L).' },
              { template: 'float d = max(dot(N, L), 0.0);\ncol = [[0]] * d;', slots: [{ options: ['uAlb', 'L', 'N', 'vec3(1.0)'], answer: 'uAlb' }], uniforms: { uAlb: ORANGE }, explain: 'The surface colour (albedo) multiplies the amount of light.' },
              { template: 'vec3 Ld = normalize(vec3([[0]], [[1]], 0.6));\ncol = vec3(max(dot(N, Ld), 0.0));', slots: null, explain: 'L points toward the light: +x = right, +y = up.' },
            ];
            const vr = rng.pick(level === 1 ? variants.slice(0, 3) : variants);
            let slots = vr.slots, template = vr.template, prompt = 'Complete the Lambert shader so it matches the target.', build;
            if (!slots) {
              const ax = rng.pick([[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]);
              slots = [{ options: ['1.0', '-1.0', '0.0'], answer: f(ax[0]) }, { options: ['1.0', '-1.0', '0.0'], answer: f(ax[1]) }];
              prompt = 'Point the light so your sphere matches the target.';
              build = (vals) => sph(template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]));
            } else {
              build = (vals) => sph(pre + template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]), { uniforms: vr.uniforms || {} });
            }
            return {
              prompt, sub: slots.length > 1 ? '' : 'N is the sphere\'s normal, L the light direction.',
              template: (vr.slots ? pre : '') + template, slots: ph(slots), build: (vals) => build(vals),
              explain: `<p>${vr.explain}</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 3. HALF-LAMBERT / WRAP
    {
      id: 'lighting.wrap',
      title: 'Half-Lambert & wrap lighting',
      blurb: 'Soften the harsh dark side with a simple remap.',
      lesson: [
        {
          title: 'Lambert is harsh',
          body: `<p>With pure Lambert, half the object is <b>pitch black</b>. Real objects are rarely like that: light bounces off walls and floors and sneaks round the back.</p>
<p>Artists often want softer, friendlier shading — especially on characters, skin and foliage.</p>
<div class="analogy">🎨 Think of a painter's "form shadow": the shadow side still has some value and colour, it isn't a black hole.</div>`,
          shaders: [
            { spec: lambert(ldir(20, 0.3), ORANGE), label: 'Lambert' },
            { spec: sph(HALF, { uniforms: { uL: ldir(20, 0.3), uAlb: ORANGE } }), label: 'Half-Lambert' },
          ],
        },
        {
          title: 'The trick: remap instead of clamp',
          body: `<p>Lambert throws away everything below 0. <b>Half-Lambert</b> (invented by Valve for Half-Life) instead <b>squashes</b> the whole -1..1 range into 0..1 — exactly like we did for normals:</p>
<pre class="code">float d = dot(N, L) * 0.5 + 0.5;</pre>
<p>Facing the light → 1. At 90° → 0.5. Facing directly away → 0. The darkness now creeps smoothly all the way round.</p>`,
          graph: { fns: [{ f: (x) => Math.max(0, x), label: 'max(x, 0)  Lambert' }, { f: (x) => x * 0.5 + 0.5, label: 'x*0.5+0.5  Half-Lambert' }], opts: { xmin: -1, xmax: 1, ymin: -0.1, ymax: 1.1, xstep: 0.5 } },
          after: '<p class="small dim">x-axis: dot(N, L). y-axis: brightness.</p>',
        },
        {
          title: 'Wrap lighting: a dial between the two',
          body: `<p>A more general version lets you choose how far the light "wraps" around:</p>
<pre class="code">float d = max((dot(N, L) + w) / (1.0 + w), 0.0);</pre>
<p><code>w = 0</code> is plain Lambert. <code>w = 1</code> is Half-Lambert. Slide and compare:</p>`,
          controls: [
            { name: 'w', label: 'wrap w', min: 0, max: 1, step: 0.05, value: 0.5 },
            { name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 20 },
          ],
          shader: (vv) => sph('float d = max((dot(N, uL) + uW) / (1.0 + uW), 0.0);\ncol = uAlb * d;', { uniforms: { uL: ldir(vv.a, 0.3), uW: vv.w, uAlb: ORANGE } }),
          graph: { fns: (vv) => [{ f: (x) => Math.max(0, x), label: 'Lambert', color: '#555', dash: [4, 4] }, { f: (x) => Math.max(0, (x + vv.w) / (1 + vv.w)), label: 'wrap' }], opts: { xmin: -1, xmax: 1, ymin: -0.1, ymax: 1.1, xstep: 0.5 } },
          code: (vv) => `float w = ${f(vv.w, 2)};\nfloat d = max((dot(N, L) + w) / (1.0 + w), 0.0);\n// dark side starts at dot = ${n(-vv.w, 2)}`,
        },
        {
          title: 'Valve\'s squared version',
          body: `<p>Half-Lambert can look a bit flat and washed-out. Valve squared it to bring back contrast while keeping the soft wrap:</p>
<pre class="code">float hl = dot(N, L) * 0.5 + 0.5;
float d = hl * hl;   // pow(hl, 2.0)</pre>`,
          shaders: [
            { spec: sph(HALF, { uniforms: { uL: ldir(20, 0.3), uAlb: GREY } }), label: 'hl' },
            { spec: sph('float hl = dot(N, uL) * 0.5 + 0.5;\ncol = uAlb * hl * hl;', { uniforms: { uL: ldir(20, 0.3), uAlb: GREY } }), label: 'hl * hl' },
          ],
          after: '<div class="tip">💡 Wrap lighting is a cheap fake for light scattering inside skin, wax or leaves (subsurface scattering). In Unity URP / Unreal you\'d do it in a custom lighting function; many stylised games use it on everything.</div>',
          quiz: { q: 'With Half-Lambert, what brightness does a point at exactly 90° to the light get?', options: ['0.5', '0', '1'], answer: 0, explain: 'dot = 0 → 0 * 0.5 + 0.5 = 0.5.' },
        },
      ],
      games: [
        {
          id: 'wrap-calc', title: 'Wrap it up', engine: 'numeric', rounds: 5,
          blurb: 'Compute Lambert, Half-Lambert and wrap values by hand.',
          gen: (rng, level) => {
            if (level === 1) {
              const d = rng.pick([-1, -0.6, -0.5, -0.2, 0, 0.4, 0.5, 0.8, 1]);
              return {
                prompt: `<code>dot(N, L) = ${n(d)}</code>. What does Half-Lambert give?`,
                code: `float d = ${f(d)} * 0.5 + 0.5;`,
                answer: r3(d * 0.5 + 0.5),
                explain: `<p>${n(d)} × 0.5 + 0.5 = <b>${n(d * 0.5 + 0.5)}</b>.${d < 0 ? ' Lambert would have given 0 here — this point would be black.' : ''}</p>`,
              };
            }
            if (level === 2) {
              const d = rng.pick([-0.8, -0.4, -0.2, 0.2, 0.6, 0.4]);
              return {
                prompt: `<code>dot(N, L) = ${n(d)}</code>. What do Lambert and Half-Lambert give?`,
                code: `float lambert = max(${f(d)}, 0.0);\nfloat half   = ${f(d)} * 0.5 + 0.5;`,
                answer: [r3(Math.max(0, d)), r3(d * 0.5 + 0.5)], labels: ['Lambert', 'Half-Lambert'],
                explain: `<p>Lambert: max(${n(d)}, 0) = <b>${n(Math.max(0, d))}</b>. Half-Lambert: <b>${n(d * 0.5 + 0.5)}</b>.</p>`,
              };
            }
            const w = rng.pick([0.25, 0.5, 1]);
            const d = rng.pick([-0.5, -0.2, 0, 0.25, 0.5, 1]);
            const ans = r3(Math.max(0, (d + w) / (1 + w)));
            return {
              prompt: `Wrap lighting with <code>w = ${n(w)}</code> and <code>dot(N, L) = ${n(d)}</code>. Result?`,
              code: `float d = max((${f(d)} + ${f(w)}) / (1.0 + ${f(w)}), 0.0);`,
              answer: ans,
              explain: `<p>(${n(d)} + ${n(w)}) / ${n(1 + w)} = <b>${n(ans)}</b>${(d + w) < 0 ? ' → clamped to 0' : ''}.</p>`,
            };
          },
        },
        {
          id: 'which-diffuse', title: 'Which diffuse?', engine: 'mcq', rounds: 8,
          blurb: 'Match spheres and diffuse formulas.',
          gen: (rng, level) => {
            const L = ldir(rng.step(0, 345, 15), 0.3);
            const pool = [
              { code: 'float d = max(dot(N, L), 0.0);', body: 'float d = max(dot(N, uL), 0.0);', lvl: 1 },
              { code: 'float d = dot(N, L) * 0.5 + 0.5;', body: 'float d = dot(N, uL) * 0.5 + 0.5;', lvl: 1 },
              { code: 'float d = 1.0;', body: 'float d = 1.0;', lvl: 1 },
              { code: 'float d = 1.0 - max(dot(N, L), 0.0);', body: 'float d = 1.0 - max(dot(N, uL), 0.0);', lvl: 1 },
              { code: 'float hl = dot(N, L) * 0.5 + 0.5;\nfloat d = hl * hl;', body: 'float hl = dot(N, uL) * 0.5 + 0.5;\nfloat d = hl * hl;', lvl: 2 },
              { code: 'float d = max((dot(N, L) + 0.5) / 1.5, 0.0);', body: 'float d = max((dot(N, uL) + 0.5) / 1.5, 0.0);', lvl: 2 },
              { code: 'float d = abs(dot(N, L));', body: 'float d = abs(dot(N, uL));', lvl: 3 },
            ].filter((p) => p.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), Math.min(4, pool.length), (x) => x.code);
            const spec = (p) => sph(p.body + '\ncol = uAlb * d;', { uniforms: { uL: L, uAlb: GREY } });
            const ex = '<p>Clues: a <b>black</b> back side → Lambert (max). Smooth fade all the way round → Half-Lambert. Squared = darker, more contrast. A flat disc = no lighting.</p>';
            if (rng.chance(0.5)) return { prompt: 'Which code lit this sphere?', shader: spec(ans), options: opts.map((o) => ({ code: o.code })), explain: ex };
            return { prompt: 'Which sphere does this code make?', code: ans.code + '\ncol = albedo * d;', options: opts.map((o) => ({ shader: spec(o) })), explain: ex };
          },
        },
        {
          id: 'wrap-match', title: 'Dial the wrap', engine: 'slider', rounds: 4,
          blurb: 'Find the wrap amount (and light angle) of the target.',
          gen: (rng, level) => {
            const w = rng.step(0, 1, level === 1 ? 0.5 : 0.25);
            const a = level === 1 ? 0 : rng.step(0, 315, 45);
            const params = [{ name: 'w', label: 'wrap w', min: 0, max: 1, step: 0.05, target: w }];
            if (level > 1) params.push({ name: 'a', label: 'light angle (°)', min: 0, max: 345, step: 15, target: a });
            return {
              prompt: 'Match the target\'s wrap amount.',
              sub: 'Look at how far the light creeps onto the dark side.',
              params,
              build: (p) => sph('float d = max((dot(N, uL) + uW) / (1.0 + uW), 0.0);\ncol = uAlb * d;', { uniforms: { uL: ldir(p.a ?? 0, 0.2), uW: p.w, uAlb: ORANGE } }),
              code: (p) => `float w = ${f(p.w, 2)};\nfloat d = max((dot(N, L) + w) / (1.0 + w), 0.0);`,
              compare: 'pixels',
              explain: `<p>Target w = ${n(w)}${w === 0 ? ' (plain Lambert: a hard black half)' : w === 1 ? ' (Half-Lambert: only the very back is black)' : ''}.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 4. AMBIENT & HEMISPHERE
    {
      id: 'lighting.ambient',
      title: 'Ambient & hemisphere light',
      blurb: 'Fill in the shadows with light from "everywhere".',
      lesson: [
        {
          title: 'A constant base light',
          body: `<p>The simplest fix for black shadows: add a little light that comes from <b>everywhere</b> — <b>ambient</b> light.</p>
<pre class="code">col = albedo * (ambient + diffuse);</pre>
<p>It stands in for all the light bouncing around the room. Slide it up:</p>`,
          controls: [{ name: 'am', label: 'ambient', min: 0, max: 0.6, step: 0.01, value: 0.15 }],
          shader: (vv) => sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * (uAm + d);', { uniforms: { uL: ldir(30, 0.4), uAlb: ORANGE, uAm: vv.am } }),
          code: (vv) => `float d = max(dot(N, L), 0.0);\nfloat ambient = ${f(vv.am, 2)};\ncol = albedo * (ambient + d);`,
        },
        {
          title: 'Ambient alone is flat',
          body: `<p>A constant doesn't depend on <code>N</code>, so it's the <b>same on every pixel</b>. On its own it gives a flat cut-out disc — no sense of shape at all.</p>
<p>That's why scenes lit by only flat ambient look "dead" in the shadows.</p>`,
          shaders: [
            { spec: sph('col = uAlb * 0.4;', { uniforms: { uAlb: ORANGE } }), label: 'ambient only' },
            { spec: sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * (0.25 + d);', { uniforms: { uL: ldir(30, 0.4), uAlb: ORANGE } }), label: 'ambient + diffuse' },
          ],
        },
        {
          title: 'Hemisphere light: sky above, ground below',
          body: `<p>Outdoors, light from above is <b>bluish</b> (the sky) and light from below is <b>warm and dim</b> (bounced off the ground). We can fake this using <code>N.y</code> — how much the normal points up:</p>
<pre class="code">float t = N.y * 0.5 + 0.5;  // 0 = facing down, 1 = facing up
vec3 amb = mix(groundCol, skyCol, t);</pre>
<p>Now the "ambient" has shape: tops catch the sky, bellies catch the ground.</p>`,
          controls: [
            { name: 'sk', label: 'sky strength', min: 0, max: 1.5, step: 0.05, value: 1 },
            { name: 'gr', label: 'ground strength', min: 0, max: 1.5, step: 0.05, value: 1 },
          ],
          shader: (vv) => sph('float t = N.y * 0.5 + 0.5;\nvec3 amb = mix(uGround, uSky, t);\ncol = uAlb * amb;', { uniforms: { uAlb: GREY, uSky: G.mul([0.45, 0.7, 1.0], vv.sk).map(r3), uGround: G.mul([0.4, 0.25, 0.12], vv.gr).map(r3) } }),
          code: (vv) => `vec3 skyCol    = ${v(G.mul([0.45, 0.7, 1.0], vv.sk), 2)};\nvec3 groundCol = ${v(G.mul([0.4, 0.25, 0.12], vv.gr), 2)};\nfloat t = N.y * 0.5 + 0.5;\ncol = albedo * mix(groundCol, skyCol, t);`,
        },
        {
          title: 'Put it together: sky + sun',
          body: `<p>A cheap but good-looking outdoor setup: hemisphere ambient for the shadows <b>plus</b> one warm sun for the lit side.</p>
<pre class="code">vec3 amb = mix(groundCol, skyCol, N.y * 0.5 + 0.5);
float d  = max(dot(N, L), 0.0);
col = albedo * (amb * 0.6 + sunCol * d);</pre>`,
          controls: [{ name: 'a', label: 'sun angle (°)', min: 0, max: 360, step: 5, value: 40 }],
          shader: (vv) => mesh3d('vec3 amb = mix(vec3(0.4, 0.25, 0.12), vec3(0.45, 0.7, 1.0), N.y * 0.5 + 0.5);\nfloat d = max(dot(N, uL), 0.0);\ncol = uAlb * (amb * 0.6 + vec3(1.0, 0.9, 0.7) * d);', 'torus', { uniforms: { uL: ldir(vv.a, 0.5), uAlb: GREY }, camera: { spin: 0.4 } }),
          after: '<div class="tip">💡 Unity\'s Lighting window has <b>Environment Lighting → Source: Gradient</b> (sky / equator / ground colours) — that\'s this exact idea. Unreal\'s <b>Sky Light</b> and Unity\'s skybox ambient go further and capture light from every direction (stored as <i>spherical harmonics</i>).</div>',
          quiz: { q: 'With hemisphere lighting, which part of a character gets the most sky colour?', options: ['The top of the head and shoulders', 'The soles of the feet', 'Every part equally'], answer: 0, explain: 'Normals pointing up (N.y ≈ 1) get t ≈ 1 → sky colour.' },
        },
      ],
      games: [
        {
          id: 'ambient-match', title: 'Fill the shadows', engine: 'slider', rounds: 4,
          blurb: 'Match the ambient / sky / ground amounts of the target.',
          gen: (rng, level) => {
            if (level < 3) {
              const am = rng.step(0, 0.5, level === 1 ? 0.25 : 0.1);
              const a = level === 1 ? 30 : rng.step(0, 315, 45);
              const params = [{ name: 'am', label: 'ambient', min: 0, max: 0.5, step: 0.02, target: am }];
              if (level > 1) params.push({ name: 'a', label: 'light angle (°)', min: 0, max: 345, step: 15, target: a });
              return {
                prompt: 'Match the target: how much ambient light' + (level > 1 ? ' and from where does the sun come?' : '?'),
                sub: 'Hint: look at the shadow side — that\'s pure ambient.',
                params,
                build: (p) => sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * (uAm + d);', { uniforms: { uL: ldir(p.a ?? 30, 0.4), uAlb: ORANGE, uAm: p.am } }),
                code: (p) => `col = albedo * (${f(p.am, 2)} + max(dot(N, L), 0.0));`,
                compare: 'pixels',
                explain: `<p>Target ambient = ${n(am)}. The shadow side shows ambient × albedo; the lit side gets ambient + diffuse.</p>`,
              };
            }
            const sk = rng.step(0.25, 1.25, 0.25), gr = rng.step(0, 1, 0.25);
            return {
              prompt: 'Match the hemisphere light: sky and ground strength.',
              sub: 'Top of the sphere = sky, bottom = ground.',
              params: [
                { name: 'sk', label: 'sky strength', min: 0, max: 1.5, step: 0.05, target: sk },
                { name: 'gr', label: 'ground strength', min: 0, max: 1.5, step: 0.05, target: gr },
              ],
              build: (p) => sph('col = uAlb * mix(uGround, uSky, N.y * 0.5 + 0.5);', { uniforms: { uAlb: GREY, uSky: G.mul([0.45, 0.7, 1.0], p.sk).map(r3), uGround: G.mul([0.4, 0.25, 0.12], p.gr).map(r3) } }),
              code: (p) => `vec3 sky    = vec3(0.45, 0.7, 1.0) * ${f(p.sk, 2)};\nvec3 ground = vec3(0.4, 0.25, 0.12) * ${f(p.gr, 2)};\ncol = albedo * mix(ground, sky, N.y * 0.5 + 0.5);`,
              tolerance: 0.07,
              explain: `<p>Target: sky ${n(sk)}, ground ${n(gr)}.</p>`,
            };
          },
        },
        {
          id: 'hemi-calc', title: 'Sky or ground?', engine: 'numeric', rounds: 5,
          blurb: 'Compute the hemisphere blend for a normal.',
          gen: (rng, level) => {
            const ny = rng.pick([1, 0.8, 0.6, 0.5, 0, -0.2, -0.6, -1, 0.4]);
            const t = r3(ny * 0.5 + 0.5);
            if (level === 1) {
              return {
                prompt: `The normal has <code>N.y = ${n(ny)}</code>. What is the blend factor <code>t</code>?`,
                code: `float t = N.y * 0.5 + 0.5;\nvec3 amb = mix(groundCol, skyCol, t);`,
                answer: t,
                explain: `<p>${n(ny)} × 0.5 + 0.5 = <b>${n(t)}</b>. ${t > 0.5 ? 'More sky than ground.' : t < 0.5 ? 'More ground than sky.' : 'Exactly half and half — the "equator".'}</p>`,
              };
            }
            const g = rng.pick([0, 0.2, 0.4]), s = rng.pick([1, 0.8, 0.6]);
            if (level === 2) {
              const ans = r3(G.mix(g, s, t));
              return {
                prompt: `Grey sky ${n(s)}, grey ground ${n(g)}, <code>N.y = ${n(ny)}</code>. How bright is the ambient?`,
                code: `float t = N.y * 0.5 + 0.5;  // N.y = ${f(ny)}\nfloat amb = mix(${f(g)}, ${f(s)}, t);`,
                answer: ans,
                explain: `<p>t = ${n(t)}. mix(${n(g)}, ${n(s)}, ${n(t)}) = ${n(g)} + (${n(s)} − ${n(g)}) × ${n(t)} = <b>${n(ans)}</b>.</p>`,
              };
            }
            const sky = [0.4, 0.6, 1.0], gnd = [0.6, 0.4, 0.2];
            const ans = G.mix(gnd, sky, t).map(r3);
            return {
              prompt: `<code>N.y = ${n(ny)}</code>. What ambient colour does the hemisphere give?`,
              code: `vec3 sky    = ${v(sky)};\nvec3 ground = ${v(gnd)};\nvec3 amb = mix(ground, sky, N.y * 0.5 + 0.5);`,
              answer: ans, labels: ['r', 'g', 'b'], wrap: 'vec3',
              explain: `<p>t = ${n(t)}, then mix per channel: <b>${nv(ans)}</b>.</p>`,
            };
          },
        },
        {
          id: 'hemi-pick', title: 'Spot the hemisphere', engine: 'mcq', rounds: 6,
          blurb: 'Which sphere is lit by blue sky from above and warm ground from below?',
          gen: (rng, level) => {
            const sky = [0.45, 0.7, 1.0], gnd = [0.55, 0.32, 0.12];
            const pool = [
              { k: 'ok', body: 'col = mix(uG, uS, N.y * 0.5 + 0.5);' },
              { k: 'flip', body: 'col = mix(uS, uG, N.y * 0.5 + 0.5);' },
              { k: 'x', body: 'col = mix(uG, uS, N.x * 0.5 + 0.5);' },
              { k: 'flat', body: 'col = mix(uG, uS, 0.5);' },
              { k: 'z', body: 'col = mix(uG, uS, N.z);' },
            ];
            const spec = (p) => sph(p.body, { uniforms: { uS: sky, uG: gnd } });
            const ans = pool[0];
            const opts = level === 1 ? [ans, pool[1], pool[3]] : [ans, ...rng.pickN(pool.slice(1), 3)];
            if (level === 3) {
              return {
                prompt: 'Which line produces this image?',
                sub: 'uS = sky colour (blue), uG = ground colour (brown).',
                shader: spec(ans),
                options: [{ code: 'mix(uG, uS, N.y * 0.5 + 0.5)' }, { code: 'mix(uS, uG, N.y * 0.5 + 0.5)' }, { code: 'mix(uG, uS, N.x * 0.5 + 0.5)' }, { code: 'mix(uG, uS, N.z)' }],
                explain: '<p>Blue on top means t → 1 at the top: <code>mix(ground, sky, N.y*0.5+0.5)</code>. mix(a, b, 1) = b.</p>',
              };
            }
            return {
              prompt: 'Sky is <b>blue</b>, ground is <b>brown</b>. Which sphere shows correct hemisphere lighting?',
              options: opts.map((o) => ({ shader: spec(o) })),
              explain: '<p>Upward-facing normals (top) should get the sky, downward-facing (bottom) the ground, with a smooth blend by <code>N.y</code>.</p>',
            };
          },
        },
      ],
    },
    // ================================================================== 5. SPECULAR
    {
      id: 'lighting.specular',
      title: 'Specular: Phong & Blinn-Phong',
      blurb: 'Shiny highlights that depend on where you look from.',
      lesson: [
        {
          title: 'A highlight is a blurry mirror image',
          body: `<p>Shiny things (plastic, wet stone, a car) show a bright spot: a <b>reflection of the light source</b>. Unlike diffuse, it <b>moves when you move</b>.</p>
<p>Orbit the camera around this sphere. The light is fixed. Watch: the soft diffuse shading stays put on the ball, the white highlight slides.</p>`,
          controls: [{ name: 'yaw', label: 'camera orbit', min: -1.2, max: 1.2, step: 0.02, value: 0 }],
          shader: (vv) => mesh3d('float d = max(dot(N, uL), 0.0);\nvec3 H = normalize(uL + V);\nfloat s = pow(max(dot(N, H), 0.0), 64.0);\ncol = uAlb * (0.08 + d) + vec3(s);', 'sphere', { uniforms: { uL: ldir(60, 0.6), uAlb: [0.8, 0.15, 0.15] }, camera: { yaw: vv.yaw, pitch: 0.2 } }),
          after: '<div class="note">So specular needs one more vector: <b>V</b>, the direction from the surface <b>toward the camera</b>: <code>V = normalize(uCamPos - P)</code>.</div>',
        },
        {
          title: 'Phong: reflect the light, compare with the eye',
          body: `<p><b>Phong</b> reflects the incoming light about the normal, like a mirror, then asks: "is that reflected ray heading into my eye?"</p>
<pre class="code">vec3 R = reflect(-L, N);       // -L: the light travels TOWARD the surface
float s = pow(max(dot(R, V), 0.0), shininess);</pre>
<p>Side view below. Move the light and the eye. The highlight is strong only when <b>R</b> (pink) lines up with <b>V</b> (green).</p>`,
          controls: [
            { name: 'l', label: 'light angle (°)', min: 10, max: 170, step: 1, value: 50 },
            { name: 'v', label: 'eye angle (°)', min: 10, max: 170, step: 1, value: 120 },
          ],
          visual: (el, vv) => reflectDiagram(el, vv, 'phong'),
        },
        {
          title: 'Shininess: the size of the highlight',
          body: `<p>Why the <code>pow</code>? <code>dot(R, V)</code> alone falls off slowly → a huge, blurry blob. Raising it to a big power makes it drop to 0 quickly except right at the centre.</p>
<p><b>Bigger exponent = smaller, sharper highlight = shinier surface.</b></p>`,
          controls: [{ name: 'p', label: 'shininess (exponent)', min: 1, max: 128, step: 1, value: 16 }],
          shader: (vv) => sph('float d = max(dot(N, uL), 0.0);\nvec3 R = reflect(-uL, N);\nfloat s = pow(max(dot(R, V), 0.0), uP);\ncol = uAlb * (0.05 + d) + vec3(s);', { uniforms: { uL: ldir(45, 0.8), uAlb: [0.2, 0.35, 0.8], uP: vv.p } }),
          graph: { fns: (vv) => [{ f: (x) => Math.pow(Math.max(0, x), vv.p), label: `pow(x, ${vv.p})` }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          code: (vv) => `vec3 R = reflect(-L, N);\nfloat s = pow(max(dot(R, V), 0.0), ${f(vv.p)});\ncol = albedo * d + vec3(s);`,
          after: '<div class="tip">💡 pow(x, k) on a 0..1 value is THE shaping trick for "make a bump narrower" — you\'ll see it again for rim light.</div>',
        },
        {
          title: 'Blinn-Phong: the half vector',
          body: `<p><b>Blinn-Phong</b> is the version games used for decades. Instead of reflecting, it takes the direction exactly <b>halfway</b> between L and V:</p>
<pre class="code">vec3 H = normalize(L + V);
float s = pow(max(dot(N, H), 0.0), shininess);</pre>
<p>If the surface normal lines up with <b>H</b> (orange), the surface is angled exactly right to bounce light from L into V. Same idea, cheaper maths, and it behaves better at grazing angles.</p>`,
          controls: [
            { name: 'l', label: 'light angle (°)', min: 10, max: 170, step: 1, value: 50 },
            { name: 'v', label: 'eye angle (°)', min: 10, max: 170, step: 1, value: 120 },
          ],
          visual: (el, vv) => reflectDiagram(el, vv, 'blinn'),
        },
        {
          title: 'Phong vs Blinn-Phong',
          body: `<p>With the <b>same exponent</b>, Blinn-Phong's highlight is <b>bigger</b> — because the angle between N and H is about half the angle between R and V. Rule of thumb: Blinn needs <b>~4× the exponent</b> for a similar look.</p>`,
          controls: [{ name: 'p', label: 'shininess', min: 2, max: 128, step: 1, value: 20 }],
          shaders: [
            { spec: (vv) => sph('vec3 R = reflect(-uL, N);\nfloat s = pow(max(dot(R, V), 0.0), uP);\ncol = vec3(0.15) * max(dot(N, uL), 0.0) + vec3(s);', { uniforms: { uL: ldir(45, 0.8), uP: vv.p } }), label: 'Phong' },
            { spec: (vv) => sph('vec3 H = normalize(uL + V);\nfloat s = pow(max(dot(N, H), 0.0), uP);\ncol = vec3(0.15) * max(dot(N, uL), 0.0) + vec3(s);', { uniforms: { uL: ldir(45, 0.8), uP: vv.p } }), label: 'Blinn-Phong' },
          ],
          code: (vv) => `// Phong\nfloat s1 = pow(max(dot(reflect(-L, N), V), 0.0), ${f(vv.p)});\n// Blinn-Phong\nfloat s2 = pow(max(dot(N, normalize(L + V)), 0.0), ${f(vv.p)});`,
        },
        {
          title: 'Adding specular to diffuse',
          body: `<p>The full classic model: diffuse (tinted by albedo) <b>plus</b> specular (usually tinted only by the light colour — on plastic the highlight is white, not the plastic's colour).</p>
<pre class="code">vec3 diffuse  = albedo * max(dot(N, L), 0.0);
vec3 specular = specCol * pow(max(dot(N, H), 0.0), shininess);
col = diffuse + specular;</pre>`,
          controls: [
            { name: 'ks', label: 'specular strength', min: 0, max: 1.5, step: 0.05, value: 1 },
            { name: 'p', label: 'shininess', min: 2, max: 200, step: 1, value: 60 },
          ],
          shader: (vv) => mesh3d('float d = max(dot(N, uL), 0.0);\nvec3 H = normalize(uL + V);\nfloat s = pow(max(dot(N, H), 0.0), uP) * uKs;\ncol = uAlb * (0.06 + d) + vec3(s);', 'torus', { uniforms: { uL: ldir(50, 0.8), uAlb: [0.1, 0.55, 0.35], uKs: vv.ks, uP: vv.p }, camera: { spin: 0.4 } }),
          code: (vv) => `vec3 H = normalize(L + V);\nfloat s = pow(max(dot(N, H), 0.0), ${f(vv.p)}) * ${f(vv.ks, 2)};\ncol = albedo * d + vec3(s);`,
          after: '<div class="tip">💡 Modern PBR (Unreal, Unity URP/HDRP) uses a fancier specular (GGX) controlled by <b>Roughness</b> instead of an exponent — but it\'s the same idea: low roughness ≈ high shininess ≈ tight highlight.</div>',
          quiz: { q: 'You make a surface shinier (higher exponent). What happens to the highlight?', options: ['Smaller and sharper', 'Bigger and blurrier', 'It changes colour'], answer: 0, explain: 'pow with a bigger exponent shrinks everything except values very close to 1.' },
        },
      ],
      games: [
        {
          id: 'shine-match', title: 'Match the shine', engine: 'slider', rounds: 4,
          blurb: 'Tune the shininess exponent (and light) to match the highlight.',
          gen: (rng, level) => {
            const pT = rng.pick(level === 1 ? [2, 4, 6] : [2, 3, 4, 5, 6, 7]);
            const a = level === 3 ? rng.step(0, 315, 45) : 45;
            const params = [{ name: 'p', label: 'shininess = 2^p', min: 1, max: 7, step: 0.25, target: pT, fmt: (x) => String(Math.round(2 ** x)) }];
            if (level === 3) params.push({ name: 'a', label: 'light angle (°)', min: 0, max: 345, step: 15, target: a });
            return {
              prompt: 'Match the size of the highlight.',
              sub: 'The slider shows the exponent (it moves in doubling steps).',
              params,
              build: (p) => sph('float d = max(dot(N, uL), 0.0);\nvec3 H = normalize(uL + V);\nfloat s = pow(max(dot(N, H), 0.0), uP);\ncol = uAlb * (0.05 + d) + vec3(s);', { uniforms: { uL: ldir(p.a ?? 45, 0.8), uAlb: [0.2, 0.35, 0.8], uP: r3(2 ** p.p) } }),
              code: (p) => `vec3 H = normalize(L + V);\nfloat s = pow(max(dot(N, H), 0.0), ${f(Math.round(2 ** p.p))});`,
              tolerance: 0.06,
              explain: `<p>Target exponent: <b>${2 ** pT}</b>. Doubling the exponent shrinks the highlight a little — that's why shininess sliders often feel "logarithmic".</p>`,
            };
          },
        },
        {
          id: 'highlight-tap', title: 'Predict the highlight', engine: 'tap', rounds: 6,
          blurb: 'You see the diffuse shading — tap where the Blinn-Phong highlight will be.',
          gen: (rng, level) => {
            const a = rng.step(0, 345, level === 1 ? 45 : 15);
            const z = level === 1 ? rng.pick([0.5, 1]) : rng.step(0, 1.5, 0.25);
            const L = ldir(a, z);
            const H = G.normalize(G.add(L, [0, 0, 1])).map(r3);
            return {
              prompt: 'The camera looks straight at this sphere (V = (0, 0, 1)). Tap where the <b>specular highlight</b> would appear.',
              sub: 'Only diffuse is drawn. The highlight sits where N = H = normalize(L + V).',
              code: lcode(L) + '\nvec3 V = vec3(0.0, 0.0, 1.0);',
              shader: lambert(L),
              target: uvOf(H),
              radius: 0.07,
              explain: `<p>H = normalize(L + V) = ${nv(H, 2)} → uv = H.xy * 0.5 + 0.5 = <b>${nv(uvOf(H), 2)}</b>.</p><p>Notice it's <b>between</b> the brightest diffuse spot (where N = L) and the centre (where N = V). The highlight "leans" toward the viewer.</p>`,
            };
          },
        },
        {
          id: 'diff-or-spec', title: 'Diffuse or specular?', engine: 'buckets', rounds: 2,
          blurb: 'Sort properties: do they belong to diffuse or specular light?',
          gen: () => ({
            prompt: 'Is this a property of <b>diffuse</b> or <b>specular</b> lighting?',
            buckets: ['🟠 Diffuse', '✨ Specular'],
            count: 10,
            items: [
              { text: 'Moves when the camera moves', bucket: 1, why: 'Specular depends on V, the view direction.' },
              { text: 'Stays put when you walk around the object', bucket: 0, why: 'Diffuse only uses N and L.' },
              { text: 'Needs the view vector V', bucket: 1 },
              { text: 'Only needs N and L', bucket: 0 },
              { text: 'Uses reflect(-L, N) or a half vector', bucket: 1 },
              { text: 'Its size is set by a shininess exponent', bucket: 1 },
              { text: 'Normally multiplied by the albedo (base colour)', bucket: 0 },
              { text: 'White on red plastic, not red', bucket: 1, why: 'Dielectric highlights reflect the light colour, not the surface colour.' },
              { code: 'max(dot(N, L), 0.0)', bucket: 0 },
              { code: 'pow(max(dot(N, H), 0.0), 32.0)', bucket: 1 },
              { text: 'Matte chalk is almost only this', bucket: 0 },
              { text: 'Strong on wet or polished surfaces', bucket: 1 },
              { text: 'Half-Lambert is a variant of it', bucket: 0 },
              { text: 'A blurry mirror image of the light', bucket: 1 },
              { text: 'Light scattered equally in all directions', bucket: 0, why: 'That\'s the definition of an ideal diffuse (Lambertian) surface.' },
            ],
          }),
        },
        {
          id: 'spec-fill', title: 'Write the highlight', engine: 'codefill', rounds: 4,
          blurb: 'Complete Phong and Blinn-Phong code.',
          gen: (rng, level) => {
            const L = ldir(rng.step(0, 315, 45), 0.8);
            const pre = `vec3 L = ${v(L, 2)};\nfloat d = max(dot(N, L), 0.0);\n`;
            const post = '\ncol = vec3(0.2, 0.3, 0.7) * d + vec3(s);';
            const exp = rng.pick(['2.0', '8.0', '64.0']);
            const variants = [
              { template: 'vec3 H = normalize([[0]]);\nfloat s = pow(max(dot(N, H), 0.0), 32.0);', slots: [{ options: ['L + V', 'L - V', 'N + V', 'L * V'], answer: 'L + V' }], explain: 'The half vector is halfway between L and V: normalize(L + V).' },
              { template: 'vec3 R = reflect([[0]], N);\nfloat s = pow(max(dot(R, V), 0.0), 32.0);', slots: [{ options: ['-L', 'L', 'V', 'N'], answer: '-L' }], explain: 'reflect() wants the <b>incoming</b> direction. L points toward the light, so the light travels along -L.' },
              { template: `vec3 H = normalize(L + V);\nfloat s = pow(max(dot(N, H), 0.0), [[0]]);`, slots: [{ options: ['2.0', '8.0', '64.0', '2'], answer: exp }], explain: 'Bigger exponent = smaller highlight. And <code>2</code> without ".0" is an int → compile error!' },
              { template: 'vec3 H = normalize(L + V);\nfloat s = [[0]](max(dot([[1]], H), 0.0), 32.0);', slots: [{ options: ['pow', 'max', 'mix', 'step'], answer: 'pow' }, { options: ['N', 'L', 'V', 'H'], answer: 'N' }], explain: 'Blinn-Phong compares the normal with H, then sharpens with pow.' },
            ];
            const vr = rng.pick(level === 1 ? variants.slice(0, 3) : variants);
            return {
              prompt: 'Complete the specular code so it matches the target.',
              sub: 'V = (0, 0, 1): the camera looks straight at the sphere.',
              template: pre + vr.template + post,
              slots: ph(vr.slots),
              build: (vals) => sph((pre + vr.template + post).replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i])),
              explain: `<p>${vr.explain}</p>`,
            };
          },
        },
        {
          id: 'spec-quiz', title: 'Highlight quiz', engine: 'mcq', rounds: 8,
          blurb: 'Concept questions about specular light.',
          questions: [
            q('What does V stand for in specular formulas?', ['Direction from the surface toward the camera', 'The vertex position', 'The velocity of the light'], 'V = normalize(uCamPos - P).'),
            q('In Phong, what is R?', ['The light direction mirrored about the normal', 'The surface roughness', 'The red channel'], 'R = reflect(-L, N).'),
            q('In Blinn-Phong, what is H?', ['The vector halfway between L and V', 'The height of the surface', 'The highlight colour'], 'H = normalize(L + V).'),
            q('Why is the shininess exponent applied with pow()?', ['To make the highlight fall off faster so it\'s smaller', 'To make it coloured', 'To keep it positive'], 'Values below 1 shrink toward 0 when raised to a high power.'),
            q('Same exponent: whose highlight is larger?', ['Blinn-Phong', 'Phong', 'They\'re identical'], 'The N·H angle is about half the R·V angle, so Blinn-Phong spreads more. Use ~4× the exponent to match.', { level: 2 }),
            q('Why do we need max(…, 0.0) before pow()?', ['pow of a negative number is undefined in GLSL', 'To make it brighter', 'pow only works on vectors'], 'pow(x, y) with x < 0 gives undefined results — often NaN/black pixels.', { level: 2 }),
            tf('Specular highlights move when the camera moves.', true, 'They depend on V.'),
            tf('A rougher surface should use a larger shininess exponent.', false, 'Rough = blurry, wide highlight = SMALL exponent.'),
            tf('On coloured plastic, the highlight is usually white (the light\'s colour).', true, 'Non-metals reflect light without tinting it. Metals tint their reflections.', 2),
            tf('Blinn-Phong needs the reflect() function.', false, 'That\'s Phong. Blinn-Phong uses the half vector instead.'),
            tf('If L and V point the same way, the Blinn-Phong highlight is where N points at the camera.', true, 'H = normalize(L + V) = V, so the highlight is where N = V.', 3),
            q('Which surface needs the highest shininess?', ['A polished chrome ball', 'A tennis ball', 'A brick wall'], 'Polished = mirror-like = tiny, sharp highlight.'),
          ],
        },
      ],
    },
    // ================================================================== 6. FRESNEL / RIM
    {
      id: 'lighting.fresnel',
      title: 'Fresnel & rim light',
      blurb: 'Edges glow: 1 − N · V.',
      lesson: [
        {
          title: 'Edges reflect more',
          body: `<p>Stand by a lake. Look <b>straight down</b>: you see through the water to the stones. Look toward the <b>far shore</b> (a grazing angle): the water becomes a mirror of the sky.</p>
<p>Almost every material does this: <b>surfaces seen edge-on reflect more</b>. It's called the <b>Fresnel effect</b> (say "freh-nel").</p>
<div class="analogy">📱 Tilt your phone screen away from you — at a steep angle it suddenly mirrors the room.</div>`,
        },
        {
          title: 'Facing ratio: N · V',
          body: `<p>How "edge-on" is a pixel? Compare its normal with the view direction:</p>
<pre class="code">float facing = max(dot(N, V), 0.0);</pre>
<p>Centre of the sphere: N points at you → <b>1</b>. Silhouette: N is sideways → <b>0</b>.</p>`,
          shaders: [
            { spec: sph('col = vec3(max(dot(N, V), 0.0));'), label: 'dot(N, V)' },
            { spec: sph('col = vec3(1.0 - max(dot(N, V), 0.0));'), label: '1 − dot(N, V)' },
          ],
          after: '<p>Flip it with <code>1.0 - …</code> and the <b>edges</b> become bright: that\'s our rim/Fresnel mask.</p>',
        },
        {
          title: 'Sharpen it with pow',
          body: `<p>Plain <code>1 − N·V</code> is a wide, soft glow. Same trick as specular: raise to a power to push it out to the <b>very edge</b>.</p>`,
          controls: [{ name: 'p', label: 'power', min: 0.5, max: 8, step: 0.1, value: 3 }],
          shader: (vv) => sph('float rim = pow(1.0 - max(dot(N, V), 0.0), uP);\ncol = vec3(rim);', { uniforms: { uP: vv.p } }),
          graph: { fns: (vv) => [{ f: (x) => Math.pow(1 - x, vv.p), label: `pow(1 - NdotV, ${vv.p.toFixed(1)})` }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          code: (vv) => `float rim = pow(1.0 - max(dot(N, V), 0.0), ${f(vv.p, 1)});\ncol = vec3(rim);`,
          after: '<p class="small dim">Graph x-axis: N·V (1 = centre, 0 = edge).</p>',
        },
        {
          title: 'Rim light on a lit object',
          body: `<p>Add a coloured rim on top of normal lighting. It makes characters <b>pop</b> from dark backgrounds — a staple of stylised games and "hit flash" / selection effects.</p>
<pre class="code">float rim = pow(1.0 - max(dot(N, V), 0.0), power);
col = albedo * d + rimCol * rim * strength;</pre>`,
          controls: [
            { name: 'p', label: 'power', min: 0.5, max: 8, step: 0.1, value: 3 },
            { name: 'k', label: 'strength', min: 0, max: 2, step: 0.05, value: 1 },
          ],
          shader: (vv) => mesh3d('float d = max(dot(N, uL), 0.0);\nfloat rim = pow(1.0 - max(dot(N, V), 0.0), uP);\ncol = uAlb * (0.1 + d) + vec3(0.3, 0.7, 1.0) * rim * uK;', 'torus', { uniforms: { uL: ldir(60, 0.7), uAlb: [0.7, 0.4, 0.3], uP: vv.p, uK: vv.k }, camera: { spin: 0.4 } }),
          code: (vv) => `float rim = pow(1.0 - max(dot(N, V), 0.0), ${f(vv.p, 1)});\ncol = albedo * d + vec3(0.3, 0.7, 1.0) * rim * ${f(vv.k, 2)};`,
          after: '<div class="tip">💡 Shader Graph: <b>Fresnel Effect</b> node (Power input) is exactly <code>pow(1 - saturate(dot(N, V)), power)</code>. Unreal: the <b>Fresnel</b> node (Exponent input).</div>',
        },
        {
          title: 'Physically: Schlick\'s Fresnel',
          body: `<p>Real renderers use <b>Schlick's approximation</b> to scale reflections:</p>
<pre class="code">float F = F0 + (1.0 - F0) * pow(1.0 - dot(N, V), 5.0);</pre>
<p><code>F0</code> = how reflective it is head-on: about <b>0.04</b> for plastic, water, skin, but 0.5–1.0 for metals. Even "dull" stuff reflects nearly 100% at the very edge.</p>`,
          controls: [{ name: 'f0', label: 'F0 (head-on reflectivity)', min: 0, max: 1, step: 0.01, value: 0.04 }],
          shader: (vv) => sph('float F = uF0 + (1.0 - uF0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);\ncol = vec3(F);', { uniforms: { uF0: vv.f0 } }),
          code: (vv) => `float F0 = ${f(vv.f0, 2)};\nfloat F = F0 + (1.0 - F0) * pow(1.0 - dot(N, V), 5.0);`,
          quiz: { q: 'Rim light uses V. So when the camera orbits the object, the rim…', options: ['Stays on the silhouette as seen by the camera', 'Stays fixed on the same part of the mesh', 'Disappears'], answer: 0, explain: 'The rim is wherever N is sideways relative to YOU — always the current silhouette.' },
        },
      ],
      games: [
        {
          id: 'rim-match', title: 'Match the rim', engine: 'slider', rounds: 4,
          blurb: 'Find the rim power (and strength).',
          gen: (rng, level) => {
            const p = rng.step(1, 6, level === 1 ? 2.5 : 0.5);
            const k = level === 1 ? 1 : rng.step(0.5, 2, 0.5);
            const params = [{ name: 'p', label: 'power', min: 0.5, max: 8, step: 0.1, target: p }];
            if (level > 1) params.push({ name: 'k', label: 'strength', min: 0, max: 2, step: 0.05, target: k });
            const lit = level === 3;
            return {
              prompt: 'Match the rim glow.',
              sub: 'Power = how thin the rim is. Strength = how bright.',
              params,
              build: (pp) => sph(`float rim = pow(1.0 - max(dot(N, V), 0.0), uP);\n${lit ? 'col = vec3(0.7, 0.4, 0.3) * (0.1 + max(dot(N, uL), 0.0));\n' : ''}col += vec3(0.3, 0.7, 1.0) * rim * uK;`, { uniforms: { uP: pp.p, uK: pp.k ?? 1, uL: ldir(60, 0.7) } }),
              code: (pp) => `float rim = pow(1.0 - max(dot(N, V), 0.0), ${f(pp.p, 1)});\ncol ${lit ? '+' : ''}= rimCol * rim * ${f(pp.k ?? 1, 2)};`,
              compare: 'pixels',
              explain: `<p>Target: power ${n(p)}${level > 1 ? `, strength ${n(k)}` : ''}. Low power = glow spreads toward the centre; high power = thin line at the edge.</p>`,
            };
          },
        },
        {
          id: 'rim-calc', title: 'Compute the rim', engine: 'numeric', rounds: 5,
          blurb: 'Work out 1 − N·V and its power by hand.',
          gen: (rng, level) => {
            if (level === 3) {
              const N = rng.pick([[0, 0.6, 0.8], [0.6, 0, 0.8], [0.8, 0, 0.6], [0, 0.8, 0.6], [0.48, 0.6, 0.64]]);
              const p = rng.pick([1, 2]);
              const nd = N[2];
              const ans = r3(Math.pow(1 - nd, p));
              return {
                prompt: 'The camera looks along z. What is the rim value?',
                code: `vec3 N = ${v(N, 2)};\nvec3 V = vec3(0.0, 0.0, 1.0);\nfloat rim = pow(1.0 - max(dot(N, V), 0.0), ${f(p)});`,
                answer: ans,
                explain: `<p>dot(N, V) = N.z = ${n(nd)}. 1 − ${n(nd)} = ${n(1 - nd)}${p > 1 ? `, squared = <b>${n(ans)}</b>` : ` → <b>${n(ans)}</b>`}.</p>`,
              };
            }
            const nd = rng.pick([0, 0.2, 0.5, 0.6, 0.8, 1, 0.9]);
            const p = level === 1 ? 1 : rng.pick([2, 3]);
            const ans = r3(Math.pow(1 - nd, p));
            return {
              prompt: `<code>dot(N, V) = ${n(nd)}</code>. What is the rim value?`,
              code: `float rim = pow(1.0 - ${f(nd)}, ${f(p)});`,
              answer: ans,
              explain: `<p>1 − ${n(nd)} = ${n(1 - nd)}${p > 1 ? `, to the power ${p} = <b>${n(ans)}</b>` : ''}.${nd === 1 ? ' Facing the camera directly → no rim at all.' : nd === 0 ? ' Exactly edge-on → full rim.' : ''}</p>`,
            };
          },
        },
        {
          id: 'fresnel-which', title: 'Which rim?', engine: 'mcq', rounds: 8,
          blurb: 'Match facing-ratio images to code.',
          gen: (rng, level) => {
            const pool = [
              { code: 'col = vec3(max(dot(N, V), 0.0));', lvl: 1 },
              { code: 'col = vec3(1.0 - max(dot(N, V), 0.0));', lvl: 1 },
              { code: 'col = vec3(pow(1.0 - max(dot(N, V), 0.0), 4.0));', lvl: 1 },
              { code: 'col = vec3(max(dot(N, vec3(0.0, 1.0, 0.0)), 0.0));', lvl: 1 },
              { code: 'col = vec3(pow(max(dot(N, V), 0.0), 4.0));', lvl: 2 },
              { code: 'col = vec3(step(0.5, 1.0 - max(dot(N, V), 0.0)));', lvl: 2 },
              { code: 'col = vec3(pow(1.0 - max(dot(N, V), 0.0), 0.5));', lvl: 3 },
              { code: 'col = vec3(step(0.8, 1.0 - max(dot(N, V), 0.0)));', lvl: 3 },
            ].filter((p) => p.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.code);
            const ex = '<p>dot(N, V) is bright in the <b>centre</b>; 1 − dot is bright at the <b>edge</b>. A bigger pow pushes the bright part toward where the value is 1 (centre or edge) and thins it.</p>';
            if (rng.chance(0.5)) return { prompt: 'Which code made this image?', sub: 'V = toward the camera.', shader: sph(ans.code), options: opts.map((o) => ({ code: o.code })), explain: ex };
            return { prompt: 'Which image does this code make?', code: ans.code, options: opts.map((o) => ({ shader: sph(o.code) })), explain: ex };
          },
        },
        {
          id: 'fresnel-facts', title: 'Fresnel facts', engine: 'mcq', rounds: 6,
          blurb: 'Quick checks on rim and Fresnel.',
          questions: [
            tf('Surfaces viewed at a grazing angle reflect more light.', true, 'That\'s the Fresnel effect.'),
            tf('1 − dot(N, V) is brightest in the middle of a sphere.', false, 'In the middle N·V = 1, so 1 − 1 = 0. It\'s brightest at the edge.'),
            tf('Raising the rim power makes the rim thinner.', true, 'pow pushes values below 1 toward 0, so only the very edge survives.'),
            tf('Rim lighting depends on where the light is.', false, 'A plain rim uses only N and V. (You can multiply it by N·L if you want a rim only on the lit side.)'),
            tf('Even plastic reflects almost 100% at extreme grazing angles.', true, 'Schlick: F → 1 as N·V → 0, whatever F0 is.', 2),
            tf('F0 for most non-metals is about 0.04.', true, 'About 4% reflectance head-on. Metals are much higher.', 2),
            q('Which vectors does a rim light need?', ['N and V', 'N and L', 'L and V'], 'Rim = how much the surface faces away from the viewer.'),
            q('Unity Shader Graph node for rim light?', ['Fresnel Effect', 'Normal Blend', 'Reflection Probe'], 'Fresnel Effect: pow(1 − saturate(dot(N, V)), Power).'),
            q('Where does a rim light appear when the camera orbits?', ['Always on the current silhouette', 'On a fixed side of the mesh', 'Only on top'], 'It\'s view-dependent.'),
            q('Which use is NOT a typical rim/Fresnel use?', ['Making the lit side brighter', 'Selection outlines / hit flashes', 'Making shields or force fields glow at the edges'], 'Lighting the lit side is diffuse\'s job.'),
          ],
        },
      ],
    },
    // ================================================================== 7. TOON
    {
      id: 'lighting.toon',
      title: 'Toon / cel shading',
      blurb: 'Turn smooth shading into flat cartoon bands.',
      lesson: [
        {
          title: 'Cartoon light has bands',
          body: `<p>In anime and cartoons, light isn't a smooth gradient: it's a few <b>flat</b> tones — lit, shadow, maybe a highlight. That's <b>toon</b> or <b>cel shading</b> (after the celluloid sheets animators painted on).</p>
<p>The trick: take the smooth Lambert value <code>d</code> and <b>quantize</b> it into steps, with the shaping functions you already know.</p>`,
          shaders: [
            { spec: lambert(ldir(40, 0.5), ORANGE), label: 'smooth Lambert' },
            { spec: sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * mix(0.3, 1.0, step(0.3, d));', { uniforms: { uL: ldir(40, 0.5), uAlb: ORANGE } }), label: 'toon: 2 tones' },
          ],
        },
        {
          title: 'Two tones with step',
          body: `<p><code>step(edge, d)</code> is 0 below the edge and 1 above. Then pick a shadow tone and a lit tone with <code>mix</code>:</p>`,
          controls: [{ name: 't', label: 'edge (threshold)', min: 0, max: 1, step: 0.01, value: 0.3 }],
          shader: (vv) => sph('float d = max(dot(N, uL), 0.0);\nfloat t = step(uT, d);\ncol = uAlb * mix(0.3, 1.0, t);', { uniforms: { uL: ldir(40, 0.5), uAlb: ORANGE, uT: vv.t } }),
          code: (vv) => `float d = max(dot(N, L), 0.0);\nfloat t = step(${f(vv.t, 2)}, d);   // 0 = shadow, 1 = lit\ncol = albedo * mix(0.3, 1.0, t);`,
          after: '<div class="note">A low edge = mostly lit, the shadow is a thin crescent. A high edge = mostly shadow, a small lit patch.</div>',
        },
        {
          title: 'Many bands with floor',
          body: `<p>For more bands, scale up, chop off the fraction with <code>floor</code>, scale back down:</p>
<pre class="code">float t = floor(d * bands) / bands;</pre>
<p>With 3 bands: d in 0–0.33 → 0, 0.33–0.66 → 0.33, 0.66–1 → 0.66.</p>`,
          controls: [{ name: 'b', label: 'bands', min: 1, max: 8, step: 1, value: 3 }],
          shader: (vv) => sph('float d = max(dot(N, uL), 0.0);\nfloat t = floor(d * uB) / uB;\ncol = uAlb * mix(0.2, 1.0, t);', { uniforms: { uL: ldir(40, 0.5), uAlb: ORANGE, uB: vv.b } }),
          graph: { fns: (vv) => [{ f: (x) => x, color: '#555', dash: [4, 4] }, { f: (x) => Math.floor(x * vv.b) / vv.b, label: 'floor(d*bands)/bands' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          code: (vv) => `float t = floor(d * ${f(vv.b)}) / ${f(vv.b)};\ncol = albedo * mix(0.2, 1.0, t);`,
        },
        {
          title: 'Soften the edge with smoothstep',
          body: `<p>A pure step edge is aliased (jaggy) and very hard. Many games use a tiny <code>smoothstep</code> instead, so the band edge is crisp but clean:</p>`,
          controls: [{ name: 'w', label: 'edge softness', min: 0.0, max: 0.3, step: 0.005, value: 0.03 }],
          shader: (vv) => sph('float d = max(dot(N, uL), 0.0);\nfloat t = smoothstep(0.3 - uW, 0.3 + uW + 0.0001, d);\ncol = uAlb * mix(0.3, 1.0, t);', { uniforms: { uL: ldir(40, 0.5), uAlb: ORANGE, uW: vv.w } }),
          code: (vv) => `float t = smoothstep(${f(0.3 - vv.w, 3)}, ${f(0.3 + vv.w, 3)}, d);\ncol = albedo * mix(0.3, 1.0, t);`,
        },
        {
          title: 'Ramp textures: let the artist paint it',
          body: `<p>Instead of coding the bands, look them up in a small <b>ramp texture</b>: use the lighting value as the <b>u coordinate</b>.</p>
<pre class="code">float d = dot(N, L) * 0.5 + 0.5;       // half-Lambert: 0..1 all round
col = texture2D(uRamp, vec2(d, 0.5)).rgb;</pre>
<p>Dark side reads the left of the ramp, lit side the right. Artists can paint colours, band widths, even a coloured shadow, without touching code.</p>`,
          controls: [{ name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 40 }],
          shaders: [
            { spec: { frag: 'col = texture2D(uRamp, uv).rgb;', textures: { uRamp: { name: 'toonramp', wrap: 'clamp' } } }, label: 'the ramp (u = 0 → 1)' },
            { spec: (vv) => sph('float d = dot(N, uL) * 0.5 + 0.5;\ncol = texture2D(uRamp, vec2(d, 0.5)).rgb;', { uniforms: { uL: ldir(vv.a, 0.4) }, textures: { uRamp: { name: 'toonramp', wrap: 'clamp' } } }), label: 'sphere using it' },
          ],
          after: '<div class="tip">💡 Set the ramp texture to <b>Clamp</b> wrap mode! With Repeat, d = 1.0 wraps around to the dark left edge and you get a black speck in the brightest spot. Genshin-style shaders, Guilty Gear and Unity Toon Shader all use ramps (often several, picked by a material ID).</div>',
          quiz: { q: 'You want the toon shadow to be purple instead of grey. Easiest fix?', options: ['Paint the left part of the ramp texture purple', 'Change the normal', 'Raise the step threshold'], answer: 0, explain: 'The dark side reads the left part of the ramp, so its colour is whatever you paint there.' },
        },
      ],
      games: [
        {
          id: 'count-bands', title: 'Count the bands', engine: 'numeric', rounds: 5,
          blurb: 'How many tones does this toon shader produce?',
          gen: (rng, level) => {
            const b = rng.int(2, level === 1 ? 4 : 6);
            const showImg = level < 3;
            return {
              prompt: showImg ? 'How many different tones does this sphere have (count the dark one too)?' : 'How many different tones will this code produce on a sphere?',
              sub: showImg ? 'Then check the code below.' : 'd goes from 0 to 1 over the sphere. (Ignore the single brightest pixel.)',
              shader: showImg ? sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * mix(0.15, 1.0, floor(d * uB) / uB);', { uniforms: { uL: ldir(rng.step(0, 315, 45), 0.6), uAlb: ORANGE, uB: b } }) : undefined,
              code: level === 1 ? undefined : `float d = max(dot(N, L), 0.0);\nfloat t = floor(d * ${f(b)}) / ${f(b)};`,
              answer: b,
              explain: `<p>floor(d × ${b}) gives the whole numbers 0…${b - 1} (and ${b} only when d is exactly 1). That's <b>${b}</b> tones. The dark back side (d = 0) shares the first tone.</p>`,
            };
          },
        },
        {
          id: 'toon-match', title: 'Match the cel look', engine: 'slider', rounds: 4,
          blurb: 'Set the toon threshold / band count to match the target.',
          gen: (rng, level) => {
            const a = rng.step(0, 315, 45);
            if (level === 1) {
              const t = rng.step(0.1, 0.9, 0.2);
              return {
                prompt: 'Match the target\'s shadow edge.',
                sub: 'step(edge, d): bigger edge = more of the sphere in shadow.',
                params: [{ name: 't', label: 'edge', min: 0, max: 1, step: 0.02, target: t }],
                build: (p) => sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * mix(0.3, 1.0, step(uT, d));', { uniforms: { uL: ldir(a, 0.5), uAlb: ORANGE, uT: p.t } }),
                code: (p) => `col = albedo * mix(0.3, 1.0, step(${f(p.t, 2)}, d));`,
                explain: `<p>Target edge = ${n(t)}.</p>`,
              };
            }
            const b = rng.int(2, 6);
            const lo = level === 3 ? rng.step(0, 0.5, 0.25) : 0.2;
            const params = [{ name: 'b', label: 'bands', min: 1, max: 8, step: 1, target: b }];
            if (level === 3) params.push({ name: 'lo', label: 'shadow brightness', min: 0, max: 0.6, step: 0.05, target: lo });
            return {
              prompt: 'Match the number of bands' + (level === 3 ? ' and the darkest tone.' : '.'),
              params,
              build: (p) => sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * mix(uLo, 1.0, floor(d * uB) / uB);', { uniforms: { uL: ldir(a, 0.5), uAlb: ORANGE, uB: p.b, uLo: p.lo ?? 0.2 } }),
              code: (p) => `float t = floor(d * ${f(p.b)}) / ${f(p.b)};\ncol = albedo * mix(${f(p.lo ?? 0.2, 2)}, 1.0, t);`,
              compare: 'pixels',
              explain: `<p>Target: ${b} bands${level === 3 ? `, shadow ${n(lo)}` : ''}.</p>`,
            };
          },
        },
        {
          id: 'toon-fill', title: 'Code the cel shader', engine: 'codefill', rounds: 4,
          blurb: 'Fill in step, floor and ramp lookups.',
          gen: (rng, level) => {
            const L = ldir(rng.step(0, 315, 45), 0.5);
            const pre = `vec3 L = ${v(L, 2)};\nfloat d = max(dot(N, L), 0.0);\n`;
            const variants = [
              { template: 'float t = [[0]](0.5, d);\ncol = vec3(0.3) + vec3(0.7) * t;', slots: [{ options: ['step', 'max', 'min', 'pow'], answer: 'step' }], explain: 'step(0.5, d) is exactly 0 or 1 → two flat tones.' },
              { template: 'float t = [[0]](d * 3.0) / 3.0;\ncol = vec3(t);', slots: [{ options: ['floor', 'fract', 'abs', 'sqrt'], answer: 'floor' }], explain: 'floor chops off the fraction → stair steps. fract would keep ONLY the fraction (a sawtooth).' },
              { template: 'float t = floor(d * [[0]]) / [[1]];\ncol = vec3(t);', slots: [{ options: ['4.0', '2.0', '8.0', '4'], answer: '4.0' }, { options: ['4.0', '2.0', '8.0', '4'], answer: '4.0' }], explain: 'Multiply and divide by the same band count. And <code>4</code> without ".0" won\'t compile.' },
              { template: 'float hl = dot(N, L) * 0.5 + 0.5;\ncol = texture2D(uRamp, vec2([[0]], 0.5)).rgb;', slots: [{ options: ['hl', '1.0 - hl', 'uv.x', '0.5'], answer: 'hl' }], tex: true, explain: 'The lighting value is the u coordinate of the ramp: dark side reads the left, lit side the right.' },
            ];
            const vr = rng.pick(level === 1 ? variants.slice(0, 2) : variants);
            return {
              prompt: 'Complete the toon shader so it matches the target.',
              template: pre + vr.template,
              slots: ph(vr.slots),
              build: (vals) => sph((pre + vr.template).replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]), vr.tex ? { textures: { uRamp: { name: 'toonramp', wrap: 'clamp' } } } : {}),
              explain: `<p>${vr.explain}</p>`,
            };
          },
        },
        {
          id: 'name-model', title: 'Name that lighting', engine: 'mcq', rounds: 8,
          blurb: 'Review: which lighting model made this sphere?',
          gen: (rng, level) => {
            const keys = level === 1 ? ['lambert', 'normals', 'unlit', 'toon', 'rim'] : Object.keys(MODELS);
            const k = rng.pick(keys);
            const L = ldir(rng.step(0, 345, 15), 0.5);
            const opts = distinct(rng, k, () => rng.pick(keys), 4, (x) => x);
            return {
              prompt: 'Which lighting model made this sphere?',
              shader: modelSpec(k, L, k === 'blinn' ? [0.8, 0.2, 0.2] : ORANGE),
              options: opts.map((o) => MODELS[o].name),
              explain: `<p><b>${MODELS[k].name}</b>:</p><pre class="code">${MODELS[k].body.replace(/uL/g, 'L').replace(/uAlb/g, 'albedo')}</pre>`,
            };
          },
        },
      ],
    },
    // ================================================================== 8. COMBINING LIGHTS
    {
      id: 'lighting.multi',
      title: 'Combining lights & colour',
      blurb: 'Lights add up; light colour multiplies surface colour.',
      lesson: [
        {
          title: 'Lights add',
          body: `<p>Two torches on the same wall: where both hit, it's brighter. Light is energy, and energy <b>adds</b>. So for several lights we compute each one and <b>sum</b> them:</p>
<pre class="code">float d1 = max(dot(N, L1), 0.0);
float d2 = max(dot(N, L2), 0.0);
col = albedo * (d1 * k1 + d2 * k2);</pre>`,
          controls: [
            { name: 'k1', label: 'key light (right) intensity', min: 0, max: 1.5, step: 0.05, value: 1 },
            { name: 'k2', label: 'fill light (left) intensity', min: 0, max: 1.5, step: 0.05, value: 0.4 },
          ],
          shader: (vv) => sph('float d1 = max(dot(N, uL1), 0.0);\nfloat d2 = max(dot(N, uL2), 0.0);\ncol = uAlb * (d1 * uK1 + d2 * uK2);', { uniforms: { uL1: ldir(20, 0.6), uL2: ldir(180, 0.4), uK1: vv.k1, uK2: vv.k2, uAlb: GREY } }),
          code: (vv) => `col = albedo * (d1 * ${f(vv.k1, 2)} + d2 * ${f(vv.k2, 2)});`,
          after: '<div class="tip">💡 Photographers call this <b>key</b> (main) + <b>fill</b> (softer, opposite side) + <b>rim/back</b> light. The same three-point lighting works for shaders.</div>',
        },
        {
          title: 'Light colour multiplies the surface colour',
          body: `<p>A light has a colour too. The surface <b>filters</b> it: each channel is multiplied.</p>
<pre class="code">col = albedo * lightCol * d;   // (r*r, g*g, b*b)</pre>
<div class="analogy">🔴 <b>Analogy:</b> red paint is red because it <b>absorbs</b> green and blue and only bounces red. Under pure blue light there's no red to bounce → it looks <b>black</b>!</div>
<p>Try a red ball under a blue light:</p>`,
          controls: [
            { name: 'ha', label: 'albedo hue', min: 0, max: 1, step: 0.01, value: 0 },
            { name: 'hl', label: 'light hue', min: 0, max: 1, step: 0.01, value: 0.66 },
            { name: 's', label: 'light saturation', min: 0, max: 1, step: 0.01, value: 1 },
          ],
          shader: (vv) => sph('float d = max(dot(N, uL), 0.0);\ncol = uAlb * uLc * d;', { uniforms: { uL: ldir(40, 0.7), uAlb: hsv(vv.ha, 0.9, 1), uLc: hsv(vv.hl, vv.s, 1) } }),
          visual: (el, vv) => swatchRow([['albedo', hsv(vv.ha, 0.9, 1)], ['', '×'], ['light', hsv(vv.hl, vv.s, 1)], ['', '='], ['lit result', G.mul(hsv(vv.ha, 0.9, 1), hsv(vv.hl, vv.s, 1))]])(el),
          code: (vv) => `vec3 albedo   = ${v(hsv(vv.ha, 0.9, 1), 2)};\nvec3 lightCol = ${v(hsv(vv.hl, vv.s, 1), 2)};\ncol = albedo * lightCol * d;  // = ${v(G.mul(hsv(vv.ha, 0.9, 1), hsv(vv.hl, vv.s, 1)), 2)} at d = 1`,
        },
        {
          title: 'Coloured lights from different sides',
          body: `<p>Warm key from one side, cool fill from the other — the classic cinematic look. Each light: its own direction, colour and intensity, summed.</p>
<pre class="code">vec3 light = warm * max(dot(N, L1), 0.0)
           + cool * max(dot(N, L2), 0.0);
col = albedo * light;</pre>`,
          controls: [{ name: 'a', label: 'rotate both lights (°)', min: 0, max: 360, step: 5, value: 0 }],
          shader: (vv) => mesh3d('vec3 light = vec3(1.0, 0.6, 0.3) * max(dot(N, uL1), 0.0) + vec3(0.2, 0.4, 1.0) * max(dot(N, uL2), 0.0);\ncol = uAlb * light;', 'torus', { uniforms: { uL1: ldir(30 + vv.a, 0.5), uL2: ldir(190 + vv.a, 0.3), uAlb: GREY } }),
        },
        {
          title: 'The full recipe',
          body: `<p>Everything from this topic, in one place:</p>
<pre class="code">vec3 N = normalize(vNormal);
vec3 V = normalize(uCamPos - P);
vec3 H = normalize(L + V);
vec3 amb  = mix(ground, sky, N.y * 0.5 + 0.5);
float d   = max(dot(N, L), 0.0);
float s   = pow(max(dot(N, H), 0.0), 64.0);
float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
col = albedo * (amb + lightCol * d)   // diffuse: tinted by albedo
    + lightCol * s                    // specular: NOT tinted
    + rimCol * rim;                   // rim: extra flair</pre>`,
          shader: mesh3d('vec3 Lw = uL;\nvec3 H = normalize(Lw + V);\nvec3 amb = mix(vec3(0.12, 0.08, 0.05), vec3(0.15, 0.22, 0.35), N.y * 0.5 + 0.5);\nfloat d = max(dot(N, Lw), 0.0);\nfloat s = pow(max(dot(N, H), 0.0), 64.0);\nfloat rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);\ncol = uAlb * (amb + vec3(1.0, 0.95, 0.85) * d) + vec3(1.0, 0.95, 0.85) * s + vec3(0.3, 0.6, 1.0) * rim * 0.6;', 'torus', { uniforms: { uL: ldir(50, 0.7), uAlb: [0.8, 0.3, 0.2] }, camera: { spin: 0.4 } }),
          after: '<div class="note">Notice: sums can go <b>above 1.0</b> (two bright lights on a white wall = 2.0). The screen clips that to white. Handling this properly is HDR & tonemapping — see the colour-space topic.</div>',
          quiz: { q: 'A pure green surface (0, 1, 0) is lit by a pure red light (1, 0, 0). What colour is it?', options: ['Black', 'Yellow', 'Green'], answer: 0, explain: '(0,1,0) × (1,0,0) = (0, 0, 0). There\'s no green in the light to bounce.' },
        },
      ],
      games: [
        {
          id: 'colour-mult', title: 'Light × surface', engine: 'mcq', rounds: 8,
          blurb: 'Predict the colour of a lit surface.',
          gen: (rng, level) => {
            const P1 = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]];
            const P2 = [[1, 0.5, 0], [0.5, 0.5, 1], [1, 1, 0.5], [0.5, 1, 0.5], [1, 0.5, 0.5], [0.5, 0.5, 0.5]];
            const pool = level === 1 ? P1 : [...P1, ...P2];
            const A = rng.pick(pool), Lc = rng.pick(pool);
            const key = (c) => c.map((x) => Math.round(Math.min(1, x) * 4)).join();
            if (level === 3) {
              const L2c = rng.pick(P1);
              const res = G.min(G.mul(A, G.add(Lc, L2c)), 1);
              const opts = distinct(rng, res, (r, i) => [G.mul(A, Lc), G.mul(A, L2c), G.min(G.add(Lc, L2c), 1), G.min(G.add(A, Lc), 1), r.pick(pool)][i % 5], 4, key);
              return {
                prompt: 'Two lights shine on this surface (both with N·L = 1). What colour do you see? (Values above 1 clip to 1.)',
                visual: swatchRow([['albedo', A], ['', '×'], ['light 1', Lc], ['', '+'], ['light 2', L2c]]),
                code: `col = albedo * (light1 + light2);\n// ${v(A, 1)} * (${v(Lc, 1)} + ${v(L2c, 1)})`,
                options: opts.map((c) => ({ color: c })),
                explain: `<p>Add the lights first: ${nv(G.add(Lc, L2c))}. Multiply by albedo: ${nv(G.mul(A, G.add(Lc, L2c)))} → clipped <b>${nv(res)}</b>.</p>`,
              };
            }
            const res = G.mul(A, Lc);
            const opts = distinct(rng, res, (r, i) => [G.min(G.add(A, Lc), 1), A, Lc, G.mix(A, Lc, 0.5), r.pick(pool)][i % 5], 4, key);
            return {
              prompt: 'This light shines on this surface (N·L = 1). What colour do you see?',
              visual: swatchRow([['albedo', A], ['', '×'], ['light colour', Lc]]),
              code: `col = albedo * lightCol;\n// ${v(A, 1)} * ${v(Lc, 1)}`,
              options: opts.map((c) => ({ color: c })),
              explain: `<p>Multiply channel by channel: ${nv(A)} × ${nv(Lc)} = <b>${nv(res)}</b>. A channel survives only if <b>both</b> the light and the surface have it.</p>`,
            };
          },
        },
        {
          id: 'light-sum', title: 'Add up the light', engine: 'numeric', rounds: 5,
          blurb: 'Compute a pixel\'s red channel with ambient and several lights.',
          gen: (rng, level) => {
            const alb = rng.pick([0.5, 0.8, 1]);
            const d1 = rng.pick([1, 0.5, 0.8, 0.6]);
            const l1 = rng.pick([1, 0.5, 2]);
            if (level === 1) {
              const ans = r3(alb * l1 * d1);
              return {
                prompt: 'What is the red channel of this pixel?',
                code: `float albedoR = ${f(alb)};\nfloat lightR  = ${f(l1)};\nfloat d = ${f(d1)};  // N·L\ncol.r = albedoR * lightR * d;`,
                answer: ans,
                explain: `<p>${n(alb)} × ${n(l1)} × ${n(d1)} = <b>${n(ans)}</b>.</p>`,
              };
            }
            const amb = rng.pick([0.1, 0.2]);
            const d2 = rng.pick([0, 0.5, 0.3]);
            const l2 = level === 3 ? rng.pick([0.5, 1]) : 0;
            const ans = r3(alb * (amb + l1 * d1 + l2 * d2));
            return {
              prompt: 'What is the red channel of this pixel?',
              sub: level === 3 ? 'Two lights plus ambient. Inside the brackets first!' : 'Ambient plus one light.',
              code: `float albedoR = ${f(alb)};\nfloat amb = ${f(amb)};\nfloat light1 = ${f(l1)} * ${f(d1)};  // colour.r * N·L\n` + (level === 3 ? `float light2 = ${f(l2)} * ${f(d2)};\ncol.r = albedoR * (amb + light1 + light2);` : 'col.r = albedoR * (amb + light1);'),
              answer: ans,
              explain: `<p>Brackets: ${n(amb)} + ${n(l1 * d1)}${level === 3 ? ` + ${n(l2 * d2)}` : ''} = ${n(amb + l1 * d1 + l2 * d2)}. × albedo ${n(alb)} = <b>${n(ans)}</b>.${ans > 1 ? ' (Above 1: the screen would clip it to white unless we tonemap.)' : ''}</p>`,
            };
          },
        },
        {
          id: 'two-lights', title: 'Balance two lights', engine: 'slider', rounds: 4,
          blurb: 'Set the warm key and cool fill intensities to match.',
          gen: (rng, level) => {
            const k1 = rng.step(0.5, 1.5, level === 1 ? 0.5 : 0.25), k2 = rng.step(0, 1, level === 1 ? 0.5 : 0.25);
            const a = level === 3 ? rng.step(0, 315, 45) : 30;
            const params = [
              { name: 'k1', label: 'warm key intensity', min: 0, max: 1.5, step: 0.05, target: k1 },
              { name: 'k2', label: 'cool fill intensity', min: 0, max: 1.5, step: 0.05, target: k2 },
            ];
            if (level === 3) params.push({ name: 'a', label: 'key angle (°)', min: 0, max: 345, step: 15, target: a });
            return {
              prompt: 'Match the target: warm key light + cool fill light.',
              sub: level === 3 ? 'The fill always comes from the opposite side of the key.' : 'Key from the top-right, fill from the left.',
              params,
              build: (p) => sph('vec3 light = vec3(1.0, 0.6, 0.3) * max(dot(N, uL1), 0.0) * uK1 + vec3(0.2, 0.4, 1.0) * max(dot(N, uL2), 0.0) * uK2;\ncol = uAlb * light;', { uniforms: { uL1: ldir(p.a ?? 30, 0.5), uL2: ldir((p.a ?? 30) + 165, 0.3), uK1: p.k1, uK2: p.k2, uAlb: GREY } }),
              code: (p) => `vec3 light = warm * d1 * ${f(p.k1, 2)}\n           + cool * d2 * ${f(p.k2, 2)};\ncol = albedo * light;`,
              compare: 'pixels',
              explain: `<p>Target: key ${n(k1)}, fill ${n(k2)}. The two lights add; where both reach, the colours mix toward white-ish.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 9. NORMAL MAPS
    {
      id: 'lighting.normalmap',
      title: 'Normal maps',
      blurb: 'Fake bumpy detail by changing the normal per pixel.',
      lesson: [
        {
          title: 'Detail without geometry',
          body: `<p>Lighting only looks at the <b>normal</b>. So if we <b>change the normal per pixel</b>, the lighting reacts as if the surface had bumps — even though the mesh is still perfectly flat!</p>
<p>A <b>normal map</b> is a texture that stores a normal for every pixel. Both squares below are the same flat quad:</p>`,
          controls: [{ name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 45 }],
          shaders: [
            { spec: (vv) => ({ frag: 'vec3 Nn = vec3(0.0, 0.0, 1.0);\ncol = vec3(max(dot(Nn, uL), 0.0)) * 0.9;', uniforms: { uL: ldir(vv.a, 0.6) } }), label: 'flat normal' },
            { spec: (vv) => ({ frag: 'vec3 Nn = normalize(texture2D(uNm, uv).xyz * 2.0 - 1.0);\ncol = vec3(max(dot(Nn, uL), 0.0)) * 0.9;', uniforms: { uL: ldir(vv.a, 0.6) }, textures: { uNm: 'normalmap' } }), label: 'normal-mapped' },
          ],
          after: '<div class="analogy">🪙 Like an embossed coin pressed into paper and lit from the side: you see the shape, but the paper is still flat. Look at the edge of a normal-mapped wall in a game — it\'s straight.</div>',
        },
        {
          title: 'What a normal map looks like',
          body: `<p>Here is the raw texture. It stores normals with the same <code>N * 0.5 + 0.5</code> trick from the first lesson:</p>
<ul><li><b>Flat areas</b>: normal (0, 0, 1) → colour <b>(0.5, 0.5, 1)</b> = that famous lavender blue.</li>
<li>Bump's <b>right</b> side tilts +x → more red. <b>Top</b> side tilts +y → more green.</li></ul>`,
          shader: { frag: 'col = texture2D(uNm, uv).rgb;', textures: { uNm: 'normalmap' } },
          code: 'col = texture2D(uNormalMap, uv).rgb; // raw: 0..1 colours',
        },
        {
          title: 'Unpack: × 2 − 1',
          body: `<p>Before using it, undo the encoding: <code>n = tex * 2.0 - 1.0</code> turns 0..1 back into -1..1.</p>
<p>Step through: raw → unpacked x → unpacked y. In the unpacked views, <span style="color:#ff7a7a">red = positive</span>, <span style="color:#7aa8ff">blue = negative</span>.</p>`,
          controls: [{ name: 'st', label: 'view: 0 raw, 1 n.x, 2 n.y', min: 0, max: 2, step: 1, value: 1 }],
          shader: (vv) => ({ frag: 'vec3 t = texture2D(uNm, uv).rgb;\nvec3 nn = t * 2.0 - 1.0;\nfloat c = uSt < 1.5 ? nn.x : nn.y;\ncol = uSt < 0.5 ? t : (c > 0.0 ? vec3(1.0, 0.45, 0.45) * c : vec3(0.45, 0.65, 1.0) * -c);', uniforms: { uSt: vv.st }, textures: { uNm: 'normalmap' } }),
          code: (vv) => ['col = texture2D(uNormalMap, uv).rgb;', 'vec3 n = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;\n// n.x: + on right sides of bumps, − on left sides', 'vec3 n = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;\n// n.y: + on top sides of bumps, − on bottom sides'][vv.st],
          after: '<div class="tip">💡 Unity\'s <code>UnpackNormal()</code> and Unreal\'s normal map sampler do this for you (plus handling compressed formats where z is rebuilt from x and y).</div>',
        },
        {
          title: 'Light the unpacked normals',
          body: `<p>Now just use the unpacked normal in Lambert. Move the light: the bumps get lit on the side facing it.</p>`,
          controls: [
            { name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 45 },
            { name: 'k', label: 'bump strength', min: 0, max: 2, step: 0.05, value: 1 },
          ],
          shader: (vv) => ({ frag: 'vec3 nn = texture2D(uNm, uv).xyz * 2.0 - 1.0;\nnn.xy *= uK;\nnn = normalize(nn);\nfloat d = max(dot(nn, uL), 0.0);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + d);', uniforms: { uL: ldir(vv.a, 0.6), uK: vv.k }, textures: { uNm: 'normalmap' } }),
          code: (vv) => `vec3 n = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;\nn.xy *= ${f(vv.k, 2)};      // strength: tilt more / less\nn = normalize(n);\n${lcode(ldir(vv.a, 0.6))}\ncol = albedo * (0.1 + max(dot(n, L), 0.0));`,
        },
        {
          title: 'Tangent space: "up" is the surface',
          body: `<p>The map's blue (z) means "straight out of <b>this</b> surface", whatever way the surface faces. Red (x) means "along the texture's u direction", green (y) "along v". That's <b>tangent space</b>.</p>
<p>On a curved mesh, each pixel has its own little frame: <b>T</b> (tangent, along u), <b>B</b> (bitangent, along v) and <b>N</b>. We rotate the map's normal into the world with them:</p>
<pre class="code">vec3 n = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
N = normalize(T * n.x + B * n.y + N * n.z);</pre>`,
          controls: [{ name: 'k', label: 'bump strength', min: 0, max: 2, step: 0.05, value: 1 }],
          shader: (vv) => mesh3d('vec3 T = normalize(vec3(P.z, 0.0, -P.x) + vec3(0.0, 0.0, 0.0001));\nvec3 B = cross(N, T);\nvec3 nn = texture2D(uNm, uv * vec2(4.0, 2.0)).xyz * 2.0 - 1.0;\nnn.xy *= uK;\nvec3 Nm = normalize(T * nn.x + B * nn.y + N * nn.z);\nfloat d = max(dot(Nm, uL), 0.0);\ncol = vec3(0.85, 0.75, 0.6) * (0.08 + d);', 'sphere', { uniforms: { uL: ldir(40, 0.8), uK: vv.k }, textures: { uNm: 'normalmap' }, camera: { spin: 0.0 } }),
          code: (vv) => `vec3 n = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;\nn.xy *= ${f(vv.k, 2)};\nvec3 Nm = normalize(T * n.x + B * n.y + N * n.z);\ncol = albedo * max(dot(Nm, L), 0.0);`,
          after: '<p class="small dim">Engines store the tangent on each vertex (computed when you import the mesh), so you get T for free.</p>',
        },
        {
          title: 'Gotchas every tech artist hits',
          body: `<ul>
<li><b>Not sRGB!</b> A normal map is <i>data</i>, not a colour. Import it as linear (Unity: Texture Type "Normal map"; Unreal: Compression "Normalmap", sRGB off). Otherwise 0.5 gets turned into ~0.22 and every normal tilts.</li>
<li><b>Green up or down?</b> OpenGL-style maps (Unity, Blender) have +y = up; DirectX-style (Unreal) have green flipped. Wrong convention = bumps look like dents when lit from above. Fix: <code>n.y = -n.y</code> (Unreal: "Flip Green Channel").</li>
<li><b>Re-normalize</b> after unpacking and after blending normal maps.</li>
</ul>`,
          shaders: [
            { spec: { frag: 'vec3 nn = normalize(texture2D(uNm, uv).xyz * 2.0 - 1.0);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + max(dot(nn, uL), 0.0));', uniforms: { uL: ldir(90, 0.6) }, textures: { uNm: 'normalmap' } }, label: 'correct (light from top)' },
            { spec: { frag: 'vec3 nn = texture2D(uNm, uv).xyz * 2.0 - 1.0;\nnn.y = -nn.y;\nnn = normalize(nn);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + max(dot(nn, uL), 0.0));', uniforms: { uL: ldir(90, 0.6) }, textures: { uNm: 'normalmap' } }, label: 'green flipped: dents!' },
          ],
          quiz: { q: 'Your normal-mapped wall looks lit from below even though the sun is above. Most likely cause?', options: ['The green channel uses the other convention', 'The albedo texture is wrong', 'The mesh has no uv'], answer: 0, explain: 'Flipping y swaps "up-facing" and "down-facing" slopes. Flip the green channel.' },
        },
      ],
      games: [
        {
          id: 'unpack', title: 'Unpack the normal', engine: 'numeric', rounds: 5,
          blurb: 'Convert between normal-map colours and normals.',
          gen: (rng, level) => {
            if (level === 1) {
              const c = rng.pick([0.5, 1, 0, 0.75, 0.25, 0.9, 0.6, 0.4]);
              return {
                prompt: `A normal map texel has <b>red = ${n(c)}</b>. What is <code>n.x</code> after unpacking?`,
                code: `vec3 n = tex * 2.0 - 1.0;\n// n.x = ${f(c)} * 2.0 - 1.0`,
                answer: r3(c * 2 - 1),
                explain: `<p>${n(c)} × 2 − 1 = <b>${n(c * 2 - 1)}</b>.${c === 0.5 ? ' 0.5 means "no tilt" in x.' : ''}</p>`,
              };
            }
            const N = signed(rng, rng.pick([[0, 0, 1], [0.6, 0, 0.8], [0, 0.6, 0.8], [0.36, 0.48, 0.8], [0.48, 0.6, 0.64], [0.8, 0, 0.6]]), 0.5);
            N[2] = Math.abs(N[2]);
            const c = N.map((x) => r3(x * 0.5 + 0.5));
            if (level === 2) {
              return {
                prompt: 'Unpack this normal-map colour into a normal.',
                color: c,
                code: `vec3 tex = ${v(c)};\nvec3 n = tex * 2.0 - 1.0;`,
                answer: N, labels: ['x', 'y', 'z'], wrap: 'vec3',
                explain: `<p>Each channel × 2 − 1: <b>${nv(N)}</b>. ${N[0] > 0 ? 'Tilts right' : N[0] < 0 ? 'Tilts left' : 'No x tilt'}, ${N[1] > 0 ? 'tilts up' : N[1] < 0 ? 'tilts down' : 'no y tilt'}.</p>`,
              };
            }
            return {
              prompt: 'You want to paint this tangent-space normal into a normal map. Which colour do you store?',
              code: `vec3 n = ${v(N, 2)};\nvec3 tex = n * 0.5 + 0.5;  // = ?`,
              answer: c, labels: ['r', 'g', 'b'], wrap: 'vec3',
              explain: `<p>Encode with × 0.5 + 0.5: <b>${nv(c)}</b>.</p>`,
            };
          },
        },
        {
          id: 'nm-light', title: 'Read the bumps', engine: 'slider', rounds: 4,
          blurb: 'Find the light direction from how the bumps are lit.',
          gen: (rng, level) => {
            const a = level === 1 ? rng.pick([0, 90, 180, 270]) : rng.step(0, 315, 45);
            const params = [{ name: 'a', label: 'light angle (°)', min: 0, max: 345, step: 15, target: a }];
            if (level === 3) params.push({ name: 'k', label: 'bump strength', min: 0.2, max: 2, step: 0.1, target: rng.step(0.5, 1.5, 0.5) });
            return {
              prompt: 'The bumps are domes sticking out. Match the light direction' + (level === 3 ? ' and the bump strength.' : '.'),
              sub: 'Each dome is bright on the side that faces the light.',
              params,
              build: (p) => ({ frag: 'vec3 nn = texture2D(uNm, uv).xyz * 2.0 - 1.0;\nnn.xy *= uK;\nnn = normalize(nn);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + max(dot(nn, uL), 0.0));', uniforms: { uL: ldir(p.a, 0.5), uK: p.k ?? 1 }, textures: { uNm: 'normalmap' } }),
              code: (p) => `${lcode(ldir(p.a, 0.5))}\nn.xy *= ${f(p.k ?? 1, 1)};\ncol = albedo * (0.1 + max(dot(n, L), 0.0));`,
              compare: 'pixels',
              explain: `<p>Target: light from ${dirName(a)} (${a}°). Lit sides of each dome face the light, shadowed sides face away.</p>`,
            };
          },
        },
        {
          id: 'nm-which', title: 'Decoded right?', engine: 'mcq', rounds: 6,
          blurb: 'Which normal-map shader is correct?',
          gen: (rng, level) => {
            const a = rng.step(0, 315, 45);
            const L = ldir(a, 0.6);
            const pool = [
              { k: 'ok', body: 'vec3 nn = texture2D(uNm, uv).xyz * 2.0 - 1.0;', code: 'vec3 n = tex.xyz * 2.0 - 1.0;', why: 'correct' },
              { k: 'raw', body: 'vec3 nn = texture2D(uNm, uv).xyz;', code: 'vec3 n = tex.xyz;', why: 'forgot to unpack: every normal leans toward +x +y' },
              { k: 'flipy', body: 'vec3 nn = texture2D(uNm, uv).xyz * 2.0 - 1.0;\nnn.y = -nn.y;', code: 'vec3 n = tex.xyz * 2.0 - 1.0;\nn.y = -n.y;', why: 'green flipped: lit from the mirrored side (looks like dents)' },
              { k: 'flat', body: 'vec3 nn = vec3(0.0, 0.0, 1.0);', code: 'vec3 n = vec3(0.0, 0.0, 1.0);', why: 'ignores the map: no bumps' },
              { k: 'srgb', body: 'vec3 nn = pow(texture2D(uNm, uv).xyz, vec3(2.2)) * 2.0 - 1.0;', code: 'vec3 n = pow(tex.xyz, vec3(2.2)) * 2.0 - 1.0;', why: 'treated as sRGB: everything tilts toward −x −y and darkens' },
            ];
            const spec = (p) => ({ frag: `${p.body}\nnn = normalize(nn);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + max(dot(nn, uL), 0.0));`, uniforms: { uL: L }, textures: { uNm: 'normalmap' } });
            const wrong = level === 1 ? [pool[1], pool[3]] : rng.pickN(pool.slice(1), 3);
            const opts = [pool[0], ...wrong];
            if (level === 3 && rng.chance(0.5)) {
              const w = rng.pick(pool.slice(1));
              return {
                prompt: `Light from ${dirName(a)}. This normal map looks wrong. Which line caused it?`,
                shader: spec(w),
                options: [w, ...pool.slice(1).filter((p) => p !== w)].slice(0, 4).map((p) => ({ code: p.code })),
                explain: `<p>It was <code>${w.code.replace(/\n/g, ' ')}</code> — ${w.why}.</p>`,
              };
            }
            return {
              prompt: `The light comes from <b>${dirName(a)}</b>, the bumps are domes. Which square decodes the normal map correctly?`,
              options: opts.map((o) => ({ shader: spec(o) })),
              explain: '<p>Correct: unpack with ×2 − 1, then each dome is bright on the side facing the light. ' + wrong.map((w) => `<br>• ${w.why}`).join('') + '</p>',
            };
          },
        },
        {
          id: 'nm-facts', title: 'Normal map facts', engine: 'mcq', rounds: 8,
          blurb: 'Concept checks: tangent space, sRGB, conventions.',
          questions: [
            tf('A normal map changes the silhouette of a mesh.', false, 'It only changes lighting. The outline stays as flat as the real geometry.'),
            tf('A flat area in a tangent-space normal map is (0.5, 0.5, 1) — light blue.', true, 'Normal (0,0,1) encoded with ×0.5+0.5.'),
            tf('Normal maps should be imported as sRGB colour textures.', false, 'They are data. sRGB decoding would bend all the normals.'),
            tf('Tangent-space normal maps can be reused on different meshes and still work.', true, 'Because they\'re relative to the surface (T, B, N), not to the world.', 2),
            tf('After unpacking a normal map it\'s good practice to normalize().', true, 'Compression and filtering shorten the vectors a bit.'),
            tf('Unity and Unreal use the same green-channel convention.', false, 'Unity is OpenGL-style (Y+), Unreal is DirectX-style (Y−).', 2),
            q('What does <code>tex * 2.0 - 1.0</code> do?', ['Converts 0..1 colours back into -1..1 vectors', 'Makes the texture brighter', 'Converts sRGB to linear'], 'It\'s the inverse of ×0.5 + 0.5.'),
            q('In tangent space, what does the blue (z) channel mean?', ['Straight out of the surface', 'Toward the world\'s sky', 'Toward the camera'], 'z is along the surface normal N.'),
            q('Which vectors rotate a tangent-space normal into world space?', ['Tangent, bitangent and normal (TBN)', 'Light and view', 'uv and position'], 'N_world = T*n.x + B*n.y + N*n.z.', { level: 2 }),
            q('Bumps look like dents when lit from above. Fix?', ['Flip the green channel', 'Flip the blue channel', 'Make the texture sRGB'], 'The y convention is wrong.'),
            q('Why use a normal map instead of more triangles?', ['Much cheaper: one texture lookup instead of millions of vertices', 'Normal maps change the shape more accurately', 'Triangles can\'t be lit'], 'Detail for the price of a texture sample.'),
          ],
        },
      ],
    },
  ],
};
