// Bottled liquids — a mini-series inside the "Tech-art effect recipes" topic.
// The fake liquid trick (wobbly potions, drinks in bottles, the bubble-tea bear…):
// no fluid simulation at all — a bottle-shaped mesh whose pixels ABOVE a moving
// plane are thrown away, whose inside faces pretend to be the liquid surface,
// and whose plane is tilted by a tiny spring simulation running in a script.
//
//   ① Fill line      — world height relative to the pivot, discard     (vertex + fragment)
//   ② Fake surface   — back faces painted as the top of the liquid      (fragment)
//   ③ Wobble         — tilt the plane, per-vertex vs per-pixel, ripples (vertex + fragment)
//   ④ Slosh physics  — the script side: velocity → spring → 2 numbers  (CPU)
//   ⑤ In Unreal      — material nodes + Blueprint                       (engine add-on)
//   ⑥ Polish         — glass shell, colour, foam, bubbles, boba, jiggle (vertex + fragment)
//
// Demo mesh: the built-in sphere, stretched in the vertex shader into a flask.
import { tf, q, distinct, f, n, h, canvas2d } from './_kit.js';
import { mat4, renderer } from '../core/renderer.js';
import { slider, shaderView } from '../core/ui.js';

// ================================================================ shared bits
const fill = (tpl, vals) => tpl.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Recipe card for the whole liquid series: all 6 parts, the current one highlighted. */
const SERIES = [
  '<b>Fill line</b> — keep pixels below a height, measured from the bottle\'s pivot',
  '<b>Fake surface</b> — paint the inside (back faces) as the liquid top',
  '<b>Wobble</b> — tilt that height into a sloped plane (+ ripples)',
  '<b>Slosh physics</b> — a script turns bottle motion into the tilt numbers',
  '<b>In Unreal</b> — the same thing with material nodes + Blueprint',
  '<b>Polish</b> — glass, colour, foam, bubbles, boba, jelly squash',
];
const series = (active = -1, title = 'Bottled liquid (the whole series)') => `<div class="note"><b>🧪 Recipe: ${title}</b><ol style="margin:6px 0 0 0;padding-left:20px">${SERIES
  .map((s, i) => `<li style="${i === active ? 'font-weight:700;color:var(--accent2)' : active >= 0 && i > active ? 'opacity:.45' : ''}">${s}</li>`)
  .join('')}</ol></div>`;
/** A local step list (same look as the other recipe cards). */
const steps = (title, list, active = -1) => `<div class="note"><b>🧪 ${title}</b><ol style="margin:6px 0 0 0;padding-left:20px">${list
  .map((s, i) => `<li style="${i === active ? 'font-weight:700;color:var(--accent2)' : active >= 0 && i > active ? 'opacity:.45' : ''}">${s}</li>`)
  .join('')}</ol></div>`;
/** Two-column "where does this run?" badge */
const stage = (s) => ({ v: '<span style="color:#6bdfff;font-weight:700">📐 VERTEX</span>', f: '<span style="color:#ff7ab2;font-weight:700">🎨 FRAGMENT</span>', c: '<span style="color:#ffd479;font-weight:700">🧠 SCRIPT (CPU)</span>' }[s]);

// ---- flask geometry ---------------------------------------------------------
// The sphere (radius 1) is stretched to 1.3 high → the liquid can range from
// relative height −1.3 (empty) to +1.3 (full).
const FH = 1.3;
const fillToH = (fr) => +(-FH + 2 * FH * fr).toFixed(3); // 0..1 → −1.3..1.3

const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
/** Model matrix: tilt (radians, around Z) then move by (x, lift). */
const modelOf = ({ tilt = 0, lift = 0, x = 0 } = {}) => mat4.mul(mat4.trans(x, lift, 0), rotZ(tilt));

const LCAM = { yaw: 0.5, pitch: 0.42, dist: 5.0 };
const FRONT_CAM = { yaw: 0, pitch: 0.32, dist: 6.4 };
const LIQ = { red: [0.95, 0.22, 0.32], green: [0.35, 0.9, 0.35], blue: [0.25, 0.55, 1], amber: [1, 0.62, 0.15], tea: [0.86, 0.66, 0.45] };

// Varyings shared by the liquid vertex and fragment shaders.
const VDEFS = `varying vec3 vRel;     // world position relative to the pivot
varying vec3 vObj;     // object-space position (for comparison demos)
varying float vAbove;  // height above the liquid surface (> 0 → discard)
varying vec2 vWob;     // surface slope (x, z)`;

// Plumbing: sphere → flask (+ optional jelly squash, keeps volume roughly constant).
// jelly: a time-looped bounce (squash that rings down) for the jelly demos.
const shape = (jelly) => `float sq = uSquash${jelly ? ' + uJelly * exp(-2.2 * mod(uTime, 3.0)) * sin(mod(uTime, 3.0) * 13.0)' : ''};
vec3 sc = vec3(1.0 - sq * 0.5, ${f(FH)} * (1.0 + sq), 1.0 - sq * 0.5);
pos *= sc; normal = normalize(normal / sc);`;

/** Liquid vertex shader. o = feature flags that change the code (keeps static views static). */
const liqVert = (o = {}) => `${shape(o.jelly)}
vObj = pos;
pos -= normal * uThick;                                   // sit inside the glass
vec3 worldPos = (uModel * vec4(pos, 1.0)).xyz;
vec3 pivot = (uModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;     // object origin in world space
vRel = worldPos - pivot;
vec3 hp = uSpace < 0.5 ? vObj : (uSpace < 1.5 ? worldPos : vRel);
vec2 wob = uWob;
${o.auto ? 'float tt = mod(uTime, uLoop);\nwob += uAuto * vec2(1.0, 0.35) * exp(-uDamp * tt) * sin(uFreq * tt);' : ''}
vWob = wob;
vAbove = hp.y - (uFill + wob.x * hp.x + wob.y * hp.z);
${o.ripV ? 'vAbove += uRip * sin(vRel.x * uRipF + vRel.z * uRipF * 0.5 - uTime * 4.0);' : ''}`;

/** Liquid fragment shader. */
const liqFrag = (o = {}) => `float above = vAbove;
${o.rip && !o.ripV ? 'above += uRip * sin(vRel.x * uRipF + vRel.z * uRipF * 0.5 - uTime * 4.0);' : ''}
if (above > 0.0) discard;
vec3 V = normalize(uCamPos - P);
vec3 L = normalize(vec3(0.5, 0.8, 0.4));
if (uFace > 1.5) {
  col = gl_FrontFacing ? vec3(0.95, 0.35, 0.35) : vec3(0.3, 0.55, 1.0);
  col *= 0.55 + 0.45 * max(dot(gl_FrontFacing ? N : -N, L), 0.0);
} else if (gl_FrontFacing || uFace < 0.5) {
  float hgt = clamp(vRel.y / ${f(2 * FH)} + 0.5, 0.0, 1.0);
  vec3 liq = mix(uDeep, uLiq, mix(1.0, hgt, uGrad));
  col = liq * (0.3 + 0.7 * max(dot(N, L), 0.0));
  col += uLiq * uRim * pow(1.0 - max(dot(N, V), 0.0), 3.0);
${o.bub ? `  float bb = voronoi(vec2(vRel.x * 0.88 + vRel.z * 0.48, vRel.y - uTime * 0.35) * 3.5);
  col += uBub * (1.0 - smoothstep(0.06, 0.13, bb)) * 0.6 * smoothstep(0.0, -0.12, above);` : ''}
${o.boba ? `  float pb = voronoi(vec2(vRel.x * 0.88 + vRel.z * 0.48, vRel.y) * 2.4 + vec2(0.3, 0.7));
  float pearl = (1.0 - smoothstep(0.3, 0.36, pb)) * (1.0 - smoothstep(-0.45, -0.1, vRel.y)) * uBoba;
  vec3 pc = vec3(0.07, 0.035, 0.03) + vec3(0.6, 0.5, 0.45) * (1.0 - smoothstep(0.03, 0.11, pb));
  col = mix(col, pc, pearl);` : ''}
} else {
  vec3 up = normalize(vec3(-vWob.x, 1.0, -vWob.y));       // the tilted surface's normal
  vec3 sn = uFlat > 0.5 ? up : N;
  col = uTop * (0.55 + 0.45 * max(dot(sn, L), 0.0));
}
${o.foam ? 'col = mix(col, uFoamCol, smoothstep(-uFoam, -uFoam * 0.5, above));' : ''}`;

const GLASS_FRAG = `vec3 V = normalize(uCamPos - P);
vec3 L = normalize(vec3(0.5, 0.8, 0.4));
float fr = pow(1.0 - abs(dot(N, V)), 2.5);
float sp = pow(max(dot(N, normalize(L + V)), 0.0), 90.0);
col = (vec3(0.7, 0.85, 1.0) * (0.05 + 0.7 * fr) + vec3(sp)) * uGlass;`;

/**
 * The liquid spec. p:
 *  fill (0..1) or h (relative height), wob [x,z], space 0 obj / 1 world / 2 world−pivot,
 *  face 0 = no fake surface, 1 = fake surface, 2 = debug front/back colours; flat (surface normal up)
 *  tilt, lift, x (model), thick, rip, ripV (ripple in vertex), auto (+damp, freq, loop),
 *  liq, deep, grad, top, rim, foam, bub, boba, squash, jelly, glass (0 = no glass pass), cull, cam
 */
const liqSpec = (p = {}) => {
  const o = { auto: !!p.auto, rip: !!p.rip, ripV: !!p.ripV, bub: !!p.bub, boba: !!p.boba, foam: !!p.foam, jelly: !!p.jelly };
  const liq = p.liq || LIQ.red;
  const u = {
    uFill: p.h ?? fillToH(p.fill ?? 0.55), uWob: p.wob || [0, 0], uSpace: p.space ?? 2, uFace: p.face ?? 1, uFlat: p.flat ?? 1,
    uThick: p.thick ?? 0.05, uRip: p.rip ?? 0, uRipF: p.ripF ?? 7,
    uAuto: p.auto ?? 0, uDamp: p.damp ?? 1.4, uFreq: p.freq ?? 9, uLoop: p.loop ?? 4,
    uLiq: liq, uDeep: p.deep || liq.map((c) => c * 0.35), uGrad: p.grad ?? 0.7, uTop: p.top || liq.map((c) => Math.min(1, c * 0.75 + 0.3)),
    uRim: p.rim ?? 0.5, uFoam: p.foam ?? 0, uFoamCol: p.foamCol || [1, 0.95, 0.88], uBub: p.bub ?? 0, uBoba: p.boba ?? 0, uSquash: p.squash ?? 0, uJelly: p.jelly ?? 0,
  };
  const glass = p.glass ?? 1;
  return {
    mesh: 'sphere', camera: p.cam || LCAM, vdefs: VDEFS, defs: VDEFS, vert: liqVert(o), frag: liqFrag(o), uniforms: u,
    model: (p.tilt || p.lift || p.x) ? modelOf(p) : undefined, cull: p.cull, bg: p.bg,
    passes: glass ? [{ vert: shape(o.jelly), frag: GLASS_FRAG, uniforms: { uSquash: u.uSquash, uJelly: u.uJelly, uGlass: glass }, blend: 'add', cull: true }] : [],
  };
};

// ================================================================ ① FILL LINE
const FILL_STEPS = [
  'Get this pixel\'s <b>height</b> (in the right space!)',
  'Compare it with the <b>fill height</b>',
  '<b>Above</b> the line → <code>discard</code> (throw the pixel away)',
  'Below the line → draw it in liquid colour',
];

const fillCode = (fr) => `// vertex shader 📐
vec3 worldPos = (uModel * vec4(pos, 1.0)).xyz;
vec3 pivot    = (uModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vRel = worldPos - pivot;      // varying → fragment

// fragment shader 🎨
float surface = ${f(fillToH(fr), 2)};          // fill ${Math.round(fr * 100)}% → height
if (vRel.y > surface) discard;
col = liquidColour * light;`;

const fillConcept = {
  id: 'effects.liquid-fill',
  title: 'Bottled liquid ①: the fill line',
  blurb: 'Fake liquid in a bottle: throw away every pixel above a height measured from the bottle\'s pivot.',
  lesson: [
    {
      title: 'Liquid in a bottle is a magic trick',
      body: `<p>Think of the sloshing potion bottles in <b>Half-Life: Alyx</b>, or the <b>bubble-tea bear</b> in <b>Teamfight Tactics</b> with its drink wobbling inside. It looks like real fluid.</p>
<p>It isn't. Effects like these are usually built with one cheap, well-known trick, and <b>no fluid simulation at all</b>. (We can't see those games' exact shaders, but the ingredients below are the standard recipe.)</p>
<div class="analogy">🎩 <b>The trick in one sentence:</b> take a bottle-shaped mesh, and in the shader <b>erase every pixel above a line</b>. Then tilt that line when the bottle moves. Your brain fills in the rest.</div>
<p>This mini-series builds it one small step at a time, covering <b>both</b> shader stages (vertex 📐 and fragment 🎨) and the small script 🧠 that makes it slosh.</p>`,
      shader: liqSpec({ fill: 0.55, auto: 0.45, rip: 0.03 }),
      after: series(),
    },
    {
      title: 'The plan: one question per pixel',
      body: `<p>For every pixel of the bottle, the fragment shader asks a single question:</p>
<div class="note">❓ <b>"Am I above the liquid line?"</b><br>Yes → throw me away. No → draw me in liquid colour.</div>
<p>Before we throw anything away, let's <b>see the decision</b>. Below, pixels that would be kept are pink and pixels that would be thrown away are grey. Drag the fill level.</p>`,
      controls: [{ name: 'fr', label: 'fill level', min: 0, max: 1, step: 0.01, value: 0.5 }],
      shader: (v) => ({
        mesh: 'sphere', camera: LCAM, vdefs: VDEFS, defs: VDEFS, vert: liqVert(), uniforms: { ...liqSpec().uniforms, uFill: fillToH(v.fr) },
        frag: `vec3 L = normalize(vec3(0.5, 0.8, 0.4));
float light = 0.35 + 0.65 * max(dot(N, L), 0.0);
col = (vAbove > 0.0 ? vec3(0.45) : vec3(0.95, 0.3, 0.4)) * light;
col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, 0.025, abs(vAbove)));   // the line itself`,
      }),
      code: (v) => `float surface = ${f(fillToH(v.fr), 2)};   // the line
bool above = height > surface;
col = above ? grey : pink;      // just looking, for now`,
      after: steps('Fill line', FILL_STEPS, 1),
    },
    {
      title: 'Throwing pixels away: discard',
      body: `<p><code>discard</code> is a special fragment-shader command: <b>"forget this pixel, draw nothing here"</b>. No colour and no depth are written. It's as if the mesh had a hole there.</p>
<p>So the whole "liquid" really is <b>one line</b>:</p>
<pre class="code">if (height > surface) discard;</pre>
<p>Drag the fill. A faint glass shell is drawn around it so you can still see the bottle (we build the glass in part ⑥).</p>`,
      controls: [{ name: 'fr', label: 'fill level', min: 0, max: 1, step: 0.01, value: 0.55 }],
      shader: (v) => liqSpec({ fill: v.fr, face: 0, cull: true }),
      code: (v) => `float surface = ${f(fillToH(v.fr), 2)};
if (height > surface) discard;   // ✂ above the line: gone
col = liquidColour * light;      // below: liquid`,
      after: steps('Fill line', FILL_STEPS, 2) + `<div class="tip">Engine names for the same idea: <b>Alpha Clip</b> / <b>Alpha Clip Threshold</b> (Unity Shader Graph), <b>Opacity Mask</b> with Blend Mode <b>Masked</b> (Unreal), <code>clip(x)</code> in HLSL (discards when x &lt; 0).</div>
<p class="small dim">Notice that the bottle now looks like a <b>cut-open, hollow shell</b> with no top surface. Part ② fixes that.</p>`,
      quiz: { q: 'What does <code>discard</code> do?', options: ['Skips this pixel completely: nothing is drawn there', 'Paints the pixel black', 'Makes the pixel 50% transparent'], answer: 0, explain: 'Discard = no colour, no depth. The pixel behind shows through, as if the mesh had a hole.' },
    },
    {
      title: 'Which "height"? Tilt the bottle',
      body: `<p>"Height" sounds obvious, but there are several to choose from. The first idea is the vertex position as stored in the mesh, which is <b>object space</b>.</p>
<p>Tilt the bottle. On the left (object space), the "liquid" <b>tilts with the bottle</b>, like a painted stripe glued to the glass. Real liquid stays <b>level with the ground</b> (right: <b>world space</b>).</p>
<div class="analogy">🍷 Object space asks "how high am I <i>on the bottle</i>?" World space asks "how high am I <i>in the room</i>?" Gravity only cares about the room.</div>`,
      controls: [{ name: 't', label: 'bottle tilt (radians)', min: -0.9, max: 0.9, step: 0.01, value: 0.55 }],
      shaders: [
        { spec: (v) => liqSpec({ fill: 0.55, space: 0, tilt: v.t }), label: '<code>objectPos.y</code> ❌', caption: 'tilts with the bottle' },
        { spec: (v) => liqSpec({ fill: 0.55, space: 2, tilt: v.t }), label: 'world space ✅', caption: 'stays level' },
      ],
      code: `// ❌ object space: the mesh's own coordinates
float height = pos.y;
// ✅ world space: after the model matrix (position + rotation + scale)
vec3 worldPos = (uModel * vec4(pos, 1.0)).xyz;`,
      after: steps('Fill line', FILL_STEPS, 0),
    },
    {
      title: 'Move the bottle: measure from the pivot',
      body: `<p>Plain world height has a new problem. Lift the bottle and the liquid <b>stays at the same height in the room</b>, so it drains out (left). Put the bottle on a high shelf and it's empty!</p>
<p>The fix: measure height <b>relative to the bottle's pivot</b> (its origin, the point it rotates around), but along the <b>world's</b> axes:</p>
<pre class="code">vec3 rel = worldPos - pivotWorldPos;</pre>
<p>Now <code>rel.y</code> means "how far above the bottle's centre, measured straight up in the room". It moves with the bottle and ignores its rotation. This is exactly what we want.</p>`,
      controls: [
        { name: 'l', label: 'lift the bottle', min: -0.6, max: 0.6, step: 0.01, value: 0.45 },
        { name: 't', label: 'tilt', min: -0.9, max: 0.9, step: 0.01, value: 0.3 },
      ],
      shaders: [
        { spec: (v) => liqSpec({ h: 0.15, space: 1, lift: v.l, tilt: v.t }), label: '<code>worldPos.y</code> ❌', caption: 'drains when lifted' },
        { spec: (v) => liqSpec({ h: 0.15, space: 2, lift: v.l, tilt: v.t }), label: '<code>worldPos − pivot</code> ✅', caption: 'travels with the bottle' },
      ],
      code: (v) => `vec3 worldPos = (uModel * vec4(pos, 1.0)).xyz;
vec3 pivot    = (uModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;  // = (0, ${f(v.l, 2)}, 0)
vec3 rel = worldPos - pivot;
if (rel.y > 0.15) discard;`,
      after: `<div class="tip">Why does <code>uModel × (0,0,0,1)</code> give the pivot? The point (0,0,0) in object space <i>is</i> the object's origin; the model matrix moves it to where the object stands in the world. (It's just the matrix's last column.)<br><b>Unity</b>: Shader Graph <i>Position (World)</i> − <i>Object › Position</i>. <b>Unreal</b>: <i>Absolute World Position</i> − <i>Object Position</i>, and remember Unreal is <b>Z-up</b>!</div>`,
      quiz: { q: 'A bottle\'s pivot is at world y = 3.0. A pixel of it is at world y = 3.4. What is <code>rel.y</code>?', options: ['0.4', '3.4', '6.4'], answer: 0, explain: 'rel = world − pivot = 3.4 − 3.0 = 0.4: the pixel is 0.4 units above the bottle\'s centre.' },
    },
    {
      title: 'Why the vertex shader does the position part',
      body: `<p>The relative position is computed in the <b>vertex shader</b> ${stage('v')}, then handed to the fragment shader ${stage('f')} as a <b>varying</b>:</p>
<ul><li>The vertex shader is where the mesh position and the <b>model matrix</b> live anyway. This is the "where is this point in the world?" stage.</li>
<li>It runs <b>once per vertex</b> (hundreds of times), not once per pixel (hundreds of thousands).</li>
<li>Positions are <b>linear</b>: the GPU blends (interpolates) them across each triangle <b>perfectly</b>, so every pixel still gets its exact position.</li></ul>
<div class="analogy">📦 The vertex shader writes a label on every corner of a triangle ("I'm 0.4 above the pivot"). The GPU then smoothly blends the labels across the triangle's surface, so each pixel receives its own in-between value for free.</div>`,
      code: `// ---- vertex shader 📐 (once per vertex)
varying vec3 vRel;
void main() {
  vec3 worldPos = (uModel * vec4(position, 1.0)).xyz;
  vec3 pivot    = (uModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vRel = worldPos - pivot;                // send it down
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}

// ---- fragment shader 🎨 (once per pixel)
varying vec3 vRel;                        // arrives interpolated
void main() {
  if (vRel.y > uFill) discard;
  gl_FragColor = vec4(liquidColour, 1.0);
}`,
      after: steps('Fill line', FILL_STEPS),
    },
    {
      title: 'Fill amount: from 0–1 to a height',
      body: `<p>Artists want a friendly <b>fill = 0…1</b> slider (empty → full), but the shader needs a <b>height</b>. Remap it with <code>mix</code>:</p>
<pre class="code">float surface = mix(bottom, top, uFill01);</pre>
<p>Our flask goes from −1.3 (bottom) to +1.3 (top) around its pivot, so 0.5 → 0.0 (half full, right through the pivot).</p>
<p>The graph shows the remap; the dot is the current slider value.</p>`,
      controls: [{ name: 'fr', label: 'fill (0–1)', min: 0, max: 1, step: 0.01, value: 0.7 }],
      shader: (v) => liqSpec({ fill: v.fr }),
      graph: { fns: () => [{ f: (x) => -FH + 2 * FH * x, label: 'surface = mix(−1.3, 1.3, fill)' }], opts: (v) => ({ xmin: 0, xmax: 1, ymin: -1.5, ymax: 1.5, points: [{ x: v.fr, y: fillToH(v.fr), label: f(fillToH(v.fr), 2) }] }) },
      code: (v) => `float surface = mix(-1.3, 1.3, ${f(v.fr, 2)});   // = ${f(fillToH(v.fr), 2)}
if (vRel.y > surface) discard;`,
      after: `<div class="tip">With a <b>tilted</b> or oddly-shaped bottle, "50%" is no longer exactly half the volume. Games almost always accept this (players can't measure it). If you need it, the script can correct the height from the bottle's bounds as it rotates.</div>` + series(0),
    },
  ],
  games: [
    {
      id: 'fill-gpu', title: 'Be the GPU: keep or discard', engine: 'paint', rounds: 4,
      blurb: 'A slice through a bottle: paint which pixels survive the fill line.',
      gen: (rng, level) => {
        const W = level === 1 ? 5 : 6;
        const cent = Array.from({ length: W }, (_, i) => (i + 0.5) / W);
        for (let tries = 0; tries < 300; tries++) {
          const py = level === 1 ? 0.5 : rng.pick([0.3, 0.4, 0.6, 0.7]);
          const F = level === 3 ? rng.step(-0.3, 0.3, 0.05) : rng.pick([-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]);
          const s = level === 3 ? rng.pick([-0.5, -0.3, 0.3, 0.5]) : 0;
          const surf = (u) => py + F + s * (u - 0.5);
          // avoid lines landing on a cell centre, and keep both colours present
          let ok = true, keep = 0;
          for (const u of cent) for (const vv of cent) { if (Math.abs(vv - surf(u)) < (level === 3 ? 0.02 : 0.03)) ok = false; if (vv < surf(u)) keep++; }
          if (!ok || keep === 0 || keep === W * W) continue;
          const code = `// this slice of the bottle: world position = uv
vec2 pivot = vec2(0.5, ${f(py, 1)});
vec2 rel = uv - pivot;
float surface = ${f(F, 2)}${s ? ` + ${f(s, 1)} * rel.x` : ''};
if (rel.y > surface) discard;     // ✂
col = liquid;`;
          return {
            prompt: 'Paint the pixels that survive (liquid) and those discarded (✂):',
            code, w: W, h: W,
            palette: [{ color: [0.18, 0.19, 0.24], label: '✂' }, { color: [0.95, 0.3, 0.4], label: 'liquid' }],
            solve: (u, vv) => (vv - py < F + s * (u - 0.5) ? 1 : 0),
            showUV: level < 3,
            explain: `<p>rel.y = uv.y − ${f(py, 1)}. A pixel survives when rel.y ≤ surface, i.e. when uv.y < ${f(py, 1)} + ${f(F, 2)}${s ? ` + ${f(s, 1)}·(uv.x − 0.5)` : ''}${s ? '' : ` = ${f(py + F, 2)}`}.</p>${level > 1 ? '<p>Moving the pivot moves the whole liquid with it — that\'s why we subtract it.</p>' : ''}${s ? '<p>The slope makes the line tilt — that\'s the wobble from part ③.</p>' : ''}`,
          };
        }
        return null;
      },
    },
    {
      id: 'fill-space', title: 'Which space?', engine: 'mcq', rounds: 6,
      blurb: 'Object, world or world − pivot? Read the bottle.',
      gen: (rng, level) => {
        const SP = [
          { code: 'float height = objectPos.y;', name: 'object space', why: 'Object space ignores the model matrix: the liquid line is glued to the bottle and tilts with it.' },
          { code: 'float height = worldPos.y;', name: 'world space', why: 'Absolute world height: the line is level, but it stays at a fixed height in the room, so lifting the bottle drains it (lowering it overfills it).' },
          { code: 'float height = worldPos.y - pivot.y;', name: 'world − pivot', why: 'World axes (so it stays level) measured from the bottle\'s centre (so it travels with the bottle). The correct one.' },
        ];
        const tilt = rng.pick([-0.7, -0.5, 0.5, 0.7]);
        const lift = rng.pick([-0.55, 0.55]);
        const i = rng.int(0, 2);
        const spec = (k) => liqSpec({ h: 0.1, space: k, tilt, lift, glass: 1 });
        const scen = `The bottle is <b>tilted</b> and <b>${lift > 0 ? 'lifted up' : 'moved down'}</b>. The artist set the surface to sit just above the bottle's centre.`;
        if (level === 1 || rng.chance(0.5)) {
          return {
            prompt: `${scen} Which line produced this?`,
            shader: spec(i),
            options: [SP[i], ...SP.filter((_, k) => k !== i)].map((s) => ({ code: s.code })),
            explain: `<p>This is <b>${SP[i].name}</b>. ${SP[i].why}</p>`,
          };
        }
        return {
          prompt: `${scen} Which picture does this code give?`,
          code: SP[i].code,
          options: [i, ...[0, 1, 2].filter((k) => k !== i)].map((k) => ({ shader: spec(k) })),
          grid: true,
          explain: `<p>${SP[i].why}</p>`,
        };
      },
    },
    {
      id: 'fill-numbers', title: 'Fill-line maths', engine: 'numeric', rounds: 5,
      blurb: 'Relative heights, remapping the fill, and "how far above the line?".',
      gen: (rng, level) => {
        const kind = rng.pick(level === 1 ? ['rel', 'rel', 'remap'] : level === 2 ? ['rel', 'remap', 'above'] : ['remap', 'above', 'rel2']);
        if (kind === 'rel') {
          const P = rng.step(-2, 4, 0.5), d = rng.step(-0.8, 0.8, 0.1) || 0.3;
          return { prompt: `The bottle's pivot is at world <b>y = ${n(P, 1)}</b>. A pixel is at world <b>y = ${n(P + d, 1)}</b>. What is <code>rel.y</code>?`, code: 'vec3 rel = worldPos - pivot;', answer: +d.toFixed(2), explain: `<p>${n(P + d, 1)} − ${n(P, 1)} = <b>${n(d, 1)}</b>. ${d > 0 ? 'Above' : 'Below'} the bottle's centre.</p>` };
        }
        if (kind === 'remap') {
          const b = -rng.step(0.5, 1.5, 0.5), t = rng.step(0.5, 1.5, 0.5), fr = rng.pick([0.25, 0.5, 0.75, 0.2, 0.8]);
          const ans = +(b + (t - b) * fr).toFixed(2);
          return { prompt: `Fill = <b>${n(fr, 2)}</b>. The bottle's liquid range is bottom ${n(b, 1)} → top ${n(t, 1)} (relative to its pivot). What is <code>surface</code>?`, code: `float surface = mix(${f(b, 1)}, ${f(t, 1)}, ${f(fr, 2)});`, answer: ans, explain: `<p>mix(a, b, t) = a + (b − a)·t = ${n(b, 1)} + ${n(t - b, 1)} × ${n(fr, 2)} = <b>${n(ans, 2)}</b>.</p>` };
        }
        if (kind === 'above') {
          const y = rng.step(-1, 1, 0.1), s = rng.step(-0.8, 0.8, 0.1);
          const ans = +(y - s).toFixed(2);
          return { prompt: `A pixel has <code>rel.y = ${n(y, 1)}</code>, the surface is at <b>${n(s, 1)}</b>. What is <code>above</code>? (Positive → discarded.)`, code: 'float above = rel.y - surface;\nif (above > 0.0) discard;', answer: ans, explain: `<p>${n(y, 1)} − ${n(s, 1)} = <b>${n(ans, 2)}</b> → ${ans > 0 ? 'positive: <b>discarded</b> ✂' : ans < 0 ? 'negative: <b>kept</b> (liquid)' : 'exactly on the line: kept (only > 0 discards)'}.</p>` };
        }
        const P = rng.step(1, 5, 0.5), fr = rng.pick([0.25, 0.5, 0.75]);
        const surf = +(-1 + 2 * fr).toFixed(2), ans = +(P + surf).toFixed(2);
        return { prompt: `Pivot at world y = <b>${n(P, 1)}</b>, liquid range −1 → +1 around it, fill = <b>${n(fr, 2)}</b>. At what <b>world</b> height is the liquid surface?`, answer: ans, explain: `<p>surface (relative) = mix(−1, 1, ${n(fr, 2)}) = ${n(surf, 2)}. World height = pivot + relative = ${n(P, 1)} + ${n(surf, 2)} = <b>${n(ans, 2)}</b>.</p>` };
      },
    },
    {
      id: 'fill-tune', title: 'Pour to the line', engine: 'slider', rounds: 4,
      blurb: 'Match the fill level (and the bottle\'s tilt).',
      gen: (rng, level) => {
        const t = { fr: rng.step(0.25, 0.8, 0.05), tilt: rng.step(-0.7, 0.7, 0.1) };
        const params = [{ name: 'fr', label: 'fill (0–1)', min: 0, max: 1, step: 0.01, target: t.fr }];
        if (level >= 2) params.push({ name: 'tilt', label: 'bottle tilt', min: -0.9, max: 0.9, step: 0.01, target: t.tilt });
        const liq = rng.pick([LIQ.red, LIQ.green, LIQ.blue, LIQ.amber]);
        const P = (p) => ({ fill: p.fr, tilt: level >= 2 ? p.tilt : (level === 1 ? 0 : t.tilt), liq });
        return {
          prompt: level >= 2 ? 'Match the fill and the bottle\'s tilt.' : 'Match the fill level.',
          sub: level >= 2 ? 'Tilt: look at the glass. The liquid stays level whatever the tilt — use the glass outline.' : 'Compare where the surface meets the glass.',
          params,
          build: (p) => liqSpec(P(p)),
          code: (p) => `float surface = mix(-1.3, 1.3, ${f(p.fr, 2)});\nif (vRel.y > surface) discard;${level >= 2 ? `\n// model matrix: rotate ${f(p.tilt, 2)} rad` : ''}`,
          tolerance: 0.05,
          explain: '<p>The fill moves the surface up/down. The tilt rotates the <b>bottle</b> (the glass), but the liquid stays level because we measure height in world space.</p>',
        };
      },
    },
    {
      id: 'fill-doctor', title: 'Liquid doctor ①', engine: 'mcq', rounds: 7,
      blurb: 'The fill line misbehaves. Diagnose it.',
      questions: [
        q('Tilt the bottle and the liquid tilts with it, like a painted stripe.', ['The height comes from object space — use world space', 'The fill is too high', 'Discard is missing'], 'Object space ignores rotation. World space (after the model matrix) keeps the surface level with the ground.'),
        q('Pick the bottle up and the liquid drains out; put it down and it overflows.', ['Subtract the pivot\'s world position from the world position', 'Use object space', 'Lower the fill value'], 'Absolute world height is a fixed level in the room. World − pivot travels with the bottle.'),
        q('The bottle is full of liquid at the TOP and empty at the bottom.', ['The comparison is flipped: discard when height > surface', 'The pivot is wrong', 'The colour is wrong'], 'Keep the pixels BELOW the line: if (rel.y > surface) discard;'),
        q('Nothing is cut at all, the bottle is completely full whatever the fill.', ['The surface value is above the top of the bottle (check the remap range)', 'Use object space', 'The camera is too far'], 'If surface > the highest point of the mesh, no pixel is ever above it.'),
        q('In Unreal, the liquid line runs vertically down the side of the bottle.', ['Unreal is Z-up: compare the Z (B) component, not Y (G)', 'Use object space', 'Use a bigger fill'], 'In Unreal the up axis is Z. Masking G (Y) measures a horizontal direction.', { level: 2 }),
        q('Every bottle in the level shares the same liquid height in the world.', ['They use absolute world height: subtract each bottle\'s own pivot', 'They share a material', 'Discard is too slow'], 'Each object\'s pivot is different, so world − pivot gives each bottle its own level.', { level: 2 }),
        q('Scaling the bottle 2× doubles how far the liquid sits from the centre.', ['Expected: world units scale too. Divide by the object scale (or remap from bounds) if fill must stay in %', 'Use object space', 'Use a smaller fill'], 'rel is in world units. A bigger bottle has bigger heights; remap from its real top/bottom.', { level: 3 }),
        tf('<code>discard</code> writes black into the pixel.', false, 'It writes nothing at all — no colour, no depth. Whatever is behind shows through.'),
        tf('The world position of the pivot is <code>uModel × vec4(0, 0, 0, 1)</code>.', true, 'Object origin (0,0,0) moved into the world by the model matrix.'),
        tf('Computing <code>worldPos − pivot</code> per vertex and interpolating gives exactly the same result as per pixel.', true, 'Positions are linear across a triangle, so interpolation is exact.', 2),
        tf('With world − pivot, rotating the bottle makes the liquid rotate too.', false, 'The subtraction only removes the bottle\'s position. The axes are still world axes, so the surface stays level.', 2),
      ],
    },
  ],
};

// ================================================================ ② FAKE SURFACE
const SURF_STEPS = [
  'After discarding, the bottle is a <b>hollow</b>, cut-open shell',
  'Turn <b>off back-face culling</b> so the inside of the far wall is drawn',
  'Use <code>gl_FrontFacing</code>: front faces = the liquid\'s side',
  'Back faces = <b>the fake surface</b>: flat colour, normal pointing up',
];

/** 2D cross-section diagram: why a back face below the line looks like the surface. */
const crossSection = (el, v) => {
  const W = 330, H = 260;
  const c = canvas2d(W, H); el.append(c.el);
  const { ctx } = c;
  const S = 88, cx = 140, cy = 150; // world → px
  const X = (x) => cx + x * S, Y = (y) => cy - y * S;
  const fy = v.f;
  // liquid + glass
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, S, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(255,111,168,0.22)'; ctx.fillRect(0, Y(fy), W, H);
  ctx.restore();
  ctx.strokeStyle = '#9aa0b4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, S, 0, Math.PI * 2); ctx.stroke();
  const half = Math.sqrt(Math.max(0, 1 - fy * fy));
  ctx.strokeStyle = '#ff6fa8'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(X(-half), Y(fy)); ctx.lineTo(X(half), Y(fy)); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#ff6fa8'; ctx.fillText('fill line', 6, Y(fy) + 4);
  ctx.fillStyle = '#9aa0b4'; ctx.fillText('bottle (side view)', 6, 16);
  // eye + ray
  const E = [1.75, 1.3];
  const T = [v.a, fy - 0.35];
  let d = [T[0] - E[0], T[1] - E[1]]; const L = Math.hypot(d[0], d[1]); d = [d[0] / L, d[1] / L];
  const b = E[0] * d[0] + E[1] * d[1], cc = E[0] * E[0] + E[1] * E[1] - 1, disc = b * b - cc;
  ctx.font = '22px sans-serif'; ctx.fillText('👁', X(E[0]) - 11, Y(E[1]) + 8);
  const legend = h('div.small', { style: { margin: '8px 2px 0', lineHeight: '1.5' } });
  el.append(legend);
  if (disc <= 0) { legend.innerHTML = 'This ray misses the bottle.'; return; }
  const t0 = -b - Math.sqrt(disc), t1 = -b + Math.sqrt(disc);
  const A = [E[0] + d[0] * t0, E[1] + d[1] * t0], B = [E[0] + d[0] * t1, E[1] + d[1] * t1];
  const aAbove = A[1] > fy;
  const end = aAbove ? B : A;
  ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(E[0]), Y(E[1])); ctx.lineTo(X(end[0]), Y(end[1])); ctx.stroke();
  if (aAbove) { ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,212,121,.35)'; ctx.beginPath(); ctx.moveTo(X(end[0]), Y(end[1])); ctx.lineTo(X(end[0] + d[0] * 0.4), Y(end[1] + d[1] * 0.4)); ctx.stroke(); ctx.setLineDash([]); }
  const mark = (p, col, num, ring = false) => {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), ring ? 7 : 6, 0, Math.PI * 2); ring ? ctx.stroke() : ctx.fill();
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = col; ctx.fillText(num, X(p[0]) + 9, Y(p[1]) - 7);
  };
  const li = (col, num, txt) => `<div><b style="color:${col}">${num}</b> ${txt}</div>`;
  if (aAbove) {
    mark(A, '#ff5c6c', '1');
    if (B[1] <= fy) {
      const ts = (fy - E[1]) / d[1]; const Sp = [E[0] + d[0] * ts, E[1] + d[1] * ts];
      mark(B, '#6bdfff', '2'); mark(Sp, '#3ddc97', '3', true);
      legend.innerHTML = li('#ff5c6c', '1', '<b>Front</b> face, <b>above</b> the line → discarded, the ray passes through.')
        + li('#6bdfff', '2', '<b>Back</b> face, <b>below</b> the line → drawn. This is the pixel you see.')
        + li('#3ddc97', '3', 'Where the <b>real</b> surface would be. It\'s on the same ray → the same pixel on screen. So paint ② the surface colour!');
    } else {
      mark(B, '#9aa0b4', '2');
      legend.innerHTML = li('#ff5c6c', '1', 'Front face above the line → discarded.') + li('#9aa0b4', '2', 'Back face, but <b>also above</b> the line → discarded. This ray only crosses the empty part: you see straight through.');
    }
  } else {
    mark(A, '#ff6fa8', '1');
    legend.innerHTML = li('#ff6fa8', '1', 'The ray hits the <b>outside</b> of the bottle <b>below</b> the line: a front face, drawn as the liquid\'s side.');
  }
};

const frontBackCode = `if (vAbove > 0.0) discard;
if (gl_FrontFacing) {
  col = liquidColour * light;        // the side of the liquid
} else {
  col = surfaceColour;               // the fake top!
}`;

const surfConcept = {
  id: 'effects.liquid-surface',
  title: 'Bottled liquid ②: the fake surface',
  blurb: 'There is no top on the mesh, so paint the inside of the back wall as the liquid surface.',
  lesson: [
    {
      title: 'The hole problem',
      body: `<p>After part ① we have a cut-open shell. Look into it from above: there's <b>no top surface</b>, because the mesh is only the outer skin of the bottle and we just deleted its upper part.</p>
<p>Left: normal rendering (back faces <b>culled</b>) → you see right through the hole. Right: culling turned <b>off</b> → you see the <b>inside</b> of the far wall, lit like the outside. That's a bit closer, but it looks like a bowl.</p>`,
      shaders: [
        { spec: liqSpec({ fill: 0.55, face: 0, cull: true }), label: 'cull back faces', caption: 'hollow' },
        { spec: liqSpec({ fill: 0.55, face: 0 }), label: 'cull off', caption: 'inside visible' },
      ],
      after: steps('Fake surface', SURF_STEPS, 0) + '<p>We can\'t easily add a real lid that moves with the liquid… but we don\'t need to. We\'ll <b>disguise</b> the inside of the back wall.</p>',
    },
    {
      title: 'Front faces and back faces',
      body: `<p>Every triangle has a <b>front</b> and a <b>back</b>, decided by the order of its corners on screen (its <i>winding</i>). On a closed mesh like our bottle:</p>
<ul><li><b>Front faces</b> = the outside skin, facing you.</li>
<li><b>Back faces</b> = the inside of the far wall, facing away from you.</li></ul>
<p>GPUs normally <b>cull</b> (skip) back faces, because on a closed object they're always hidden behind the front. But once we cut a hole, they become visible.</p>
<div class="analogy">🏮 A paper lantern: the outside is printed with a pattern (front), the inside is plain paper (back). Tear the top off and you can see the plain inside.</div>
<p>Here front = <b style="color:#ff7a7a">red</b>, back = <b style="color:#6b9bff">blue</b>. Drag the fill: all the blue you see is the inside wall, visible through the cut.</p>`,
      controls: [{ name: 'fr', label: 'fill', min: 0.1, max: 0.95, step: 0.01, value: 0.55 }],
      shader: (v) => liqSpec({ fill: v.fr, face: 2, glass: 0 }),
      code: 'col = gl_FrontFacing ? red : blue;   // built-in bool in GLSL',
      after: `<div class="tip"><code>gl_FrontFacing</code> (GLSL) = <code>SV_IsFrontFace</code> (HLSL) = <b>Is Front Face</b> node (Unity Shader Graph) = <b>TwoSidedSign</b> node (Unreal: +1 front, −1 back). Turning culling off: <b>Render Face: Both</b> (Unity) / <b>Two Sided</b> ✓ (Unreal) / <code>Cull Off</code> (ShaderLab).</div>` + steps('Fake surface', SURF_STEPS, 1),
    },
    {
      title: 'Why the inside wall can fake the surface',
      body: `<p>This is the heart of the trick, so let's look at it from the side. Follow the yellow ray from your eye into the bottle:</p>
<ol><li>It first hits the <b>front</b> wall. That part is above the line, so it's <b>discarded</b> and the ray passes straight through.</li>
<li>It then hits the <b>back</b> wall from the inside, <b>below</b> the line. That pixel survives, and it's a <b>back face</b>.</li>
<li>The green circle is where the <b>real</b> surface would have been hit. It's on the same ray, so it lands on the <b>same pixel</b> on screen!</li></ol>
<p>Drag the view direction and the fill. Every back-face pixel you can see is a pixel where the real surface would be. So: <b>paint the back faces the colour of the surface</b>.</p>`,
      controls: [
        { name: 'a', label: 'where you look', min: -0.9, max: 0.6, step: 0.01, value: -0.35 },
        { name: 'f', label: 'fill line height', min: -0.6, max: 0.7, step: 0.01, value: 0.15 },
      ],
      visual: crossSection,
      after: '<div class="note">🔑 You never see the inside wall and the real surface at different pixels. From above, the opening is exactly "filled" by back-wall pixels below the line. The eye can\'t tell that the surface is painted on the back wall.</div>',
    },
    {
      title: 'Paint the back faces as the surface',
      body: `<p>In code it's one <code>if</code>: front faces keep the normal liquid shading, back faces get the <b>surface colour</b>.</p>
<p>Use the toggle to compare: 0 = back faces shaded like walls (a bowl), 1 = back faces painted as the surface.</p>`,
      controls: [
        { name: 's', label: 'fake surface (0 off / 1 on)', min: 0, max: 1, step: 1, value: 1 },
        { name: 'fr', label: 'fill', min: 0.15, max: 0.9, step: 0.01, value: 0.55 },
      ],
      shader: (v) => liqSpec({ fill: v.fr, face: v.s ? 1 : 0 }),
      code: frontBackCode,
      after: steps('Fake surface', SURF_STEPS, 2) + '<div class="tip">Make the top a little <b>lighter</b> than the sides: in real liquids you see the top lit by the sky. A lighter top also sells the "surface" read instantly.</div>',
    },
    {
      title: 'Give the surface its own normal',
      body: `<p>Lighting needs a <b>normal</b> (which way the surface faces). The back-face pixels still carry the <b>wall's</b> normal, pointing outward and away from you, so lighting them makes the "surface" look curved like a bowl (left).</p>
<p>A liquid surface is flat and points <b>up</b>. So for back faces, light with <code>vec3(0, 1, 0)</code> (right). When the liquid tilts in part ③, we'll tilt this normal too.</p>`,
      controls: [{ name: 'fr', label: 'fill', min: 0.2, max: 0.9, step: 0.01, value: 0.6 }],
      shaders: [
        { spec: (v) => liqSpec({ fill: v.fr, flat: 0 }), label: 'wall normal <code>N</code> ❌', caption: 'looks like a bowl' },
        { spec: (v) => liqSpec({ fill: v.fr, flat: 1 }), label: 'up normal ✅', caption: 'flat surface' },
      ],
      code: `} else {
  vec3 surfN = vec3(0.0, 1.0, 0.0);   // flat liquid points up
  col = surfaceColour * (0.55 + 0.45 * max(dot(surfN, L), 0.0));
}`,
      after: steps('Fake surface', SURF_STEPS, 3),
    },
    {
      title: 'Limits of the trick',
      body: `<p>It's a cheat, so it has edges. Know them so you can hide them:</p>
<ul>
<li><b>Looking from below</b> the surface, you'd expect to see its underside. The trick shows nothing there (the back faces above the line are discarded too). Drag the camera below the line.</li>
<li><b>Objects inside</b> (a straw, ice cubes) don't cut the surface correctly, because the "surface" is really on the far wall. Usually you hide this with foam or by keeping props near the edges.</li>
<li><b>No refraction / thickness</b>: the glass and liquid are surface tricks. Fine for gameplay props and stylised art.</li>
<li><b>Concave bottles</b> (a bottle with a dent, a donut) can show several back-face layers. Simple convex shapes work best.</li></ul>`,
      controls: [{ name: 'p', label: 'camera height (pitch)', min: -0.6, max: 0.9, step: 0.01, value: -0.25 }],
      shader: (v) => liqSpec({ fill: 0.55, cam: { ...LCAM, pitch: v.p } }),
      after: '<div class="tip">These limits are why the trick shines on <b>props seen from above</b> (bottles, potions, jars, a drink held by a character). For an aquarium or a pool you\'d use real geometry for the surface.</div>' + series(1),
      quiz: { q: 'Why does a back-face pixel below the line look like the liquid surface?', options: ['The real surface would be hit by the same view ray, so it would appear at the same pixel', 'Back faces are always flat', 'The GPU adds a lid automatically'], answer: 0, explain: 'The eye ray crosses the (discarded) front wall, then would cross the surface, then hits the back wall. Same ray → same pixel, so colouring the back wall as surface is indistinguishable.' },
    },
  ],
  games: [
    {
      id: 'surf-tap', title: 'Tap the face', engine: 'tap', rounds: 5,
      blurb: 'Find the fake surface (a back face) or the liquid side (a front face).',
      gen: (rng, level) => {
        const fr = rng.step(0.4, 0.75, 0.05);
        const wob = level === 3 ? [rng.pick([-0.35, 0.35]), 0] : [0, 0];
        const tilt = level >= 2 ? rng.pick([-0.4, 0.4]) : 0;
        const cam = { ...LCAM, yaw: rng.pick([0.3, 0.5, 0.8]) };
        const base = { fill: fr, wob, tilt, cam };
        const shader = liqSpec({ ...base, liq: rng.pick([LIQ.red, LIQ.green, LIQ.amber]) });
        const mask = liqSpec({ ...base, face: 2, glass: 0 });
        const wantBack = rng.chance(0.6);
        const isWanted = (c) => (wantBack ? c[2] > 0.5 && c[0] < 0.5 : c[0] > 0.45 && c[2] < 0.4);
        // find a representative pixel for the answer marker
        const S = 32, px = renderer().pixels(mask, S) || [];
        let best = null, sx = 0, sy = 0, cnt = 0;
        const hits = [];
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; if (isWanted([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255])) { hits.push([x, y]); sx += x; sy += y; cnt++; } }
        if (cnt) { const mx = sx / cnt, my = sy / cnt; let bd = 1e9; for (const [x, y] of hits) { const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = [(x + 0.5) / S, (y + 0.5) / S]; } } }
        return {
          prompt: wantBack ? 'Tap the <b>fake liquid surface</b> (a back face):' : 'Tap the <b>side of the liquid</b> (a front face):',
          sub: level >= 2 ? 'The bottle is tilted — the liquid stays level.' : undefined,
          shader,
          score: (u, vv) => (isWanted(renderer().sample(mask, u, vv)) ? 1 : 0),
          reveal: best ? [best] : [[0.5, 0.5]],
          explain: wantBack
            ? '<p>The flat, lighter ellipse is the inside of the far wall (back faces) below the line, painted as the surface.</p>'
            : '<p>The lower, shaded, rounded part is the outside skin (front faces) below the line.</p>',
        };
      },
    },
    {
      id: 'surf-sort', title: 'Front, back or gone?', engine: 'buckets', rounds: 2,
      blurb: 'Sort what you see in the bottle by what the GPU drew.',
      gen: () => ({
        prompt: 'Which kind of pixel is it?',
        sub: 'Front face below the line · back face below the line · anything above the line.',
        buckets: ['🔴 Front (liquid side)', '🔵 Back (fake surface)', '✂ Discarded'],
        count: 9,
        items: [
          { text: 'The curved, shaded side of the liquid facing you', bucket: 0 },
          { text: 'The flat top of the liquid, seen from above', bucket: 1, why: 'It\'s the inside of the far wall, below the line.' },
          { text: 'The empty upper half of the bottle (you see the background)', bucket: 2 },
          { text: 'The outside of the bottle near its bottom', bucket: 0 },
          { text: 'The inside of the far wall, above the fill line', bucket: 2, why: 'Back faces above the line are discarded too.' },
          { text: 'The part of the bottle\'s outer skin above the line', bucket: 2 },
          { text: 'Pixels where <code>gl_FrontFacing</code> is false and <code>vAbove</code> &lt; 0', bucket: 1 },
          { text: 'Pixels where <code>vAbove</code> &gt; 0', bucket: 2 },
          { text: 'Pixels where <code>gl_FrontFacing</code> is true and <code>vAbove</code> &lt; 0', bucket: 0 },
          { text: 'The light ellipse that slides when the liquid sloshes', bucket: 1 },
        ],
      }),
    },
    {
      id: 'surf-fill', title: 'Finish the surface', engine: 'codefill', rounds: 4,
      blurb: 'Complete the discard test, the front/back branch, or the surface normal.',
      gen: (rng, level) => {
        const TPL = `if (vAbove [[0]] 0.0) discard;
vec3 L = normalize(vec3(0.5, 0.8, 0.4));
if ([[1]]) {
  col = vec3(0.95, 0.25, 0.35) * (0.3 + 0.7 * max(dot(N, L), 0.0));
} else {
  vec3 sn = [[2]];
  col = vec3(1.0, 0.6, 0.65) * (0.55 + 0.45 * max(dot(sn, L), 0.0));
}`;
        const A = ['>', 'gl_FrontFacing', 'vec3(0.0, 1.0, 0.0)'];
        const V = [
          { blanks: [1], opts: [['gl_FrontFacing', '!gl_FrontFacing', 'true']], why: 'Front faces (the outside skin) are the liquid\'s side; back faces become the surface. <code>!gl_FrontFacing</code> swaps them; <code>true</code> never draws a surface.' },
          { blanks: [0], opts: [['>', '<']], why: 'Throw away pixels <b>above</b> the line: <code>vAbove > 0.0</code>. With <code>&lt;</code> you keep the empty part and delete the liquid.' },
          { blanks: [2], opts: [['vec3(0.0, 1.0, 0.0)', 'N', '-N']], why: 'The surface is flat and faces up. <code>N</code> is the wall\'s normal → the top looks curved like a bowl.', lvl: 2 },
          { blanks: [0, 1], opts: [['>', '<'], ['gl_FrontFacing', '!gl_FrontFacing']], why: 'Discard above the line; front faces = side, back faces = surface.', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        let k = 0;
        const tpl = TPL.replace(/\[\[(\d)\]\]/g, (_, i) => (vr.blanks.includes(+i) ? `[[${k++}]]` : A[+i]));
        const fr = rng.step(0.45, 0.7, 0.05);
        const base = liqSpec({ fill: fr });
        return {
          prompt: 'Complete the liquid fragment shader to match the target:',
          sub: '<code>vAbove</code> = how far above the liquid line this pixel is.',
          template: tpl,
          slots: vr.blanks.map((b, i) => ({ options: vr.opts[i], answer: A[b] })),
          build: (vals) => ({ ...base, frag: fill(tpl, vals) }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'surf-doctor', title: 'Liquid doctor ②', engine: 'mcq', rounds: 7,
      blurb: 'The surface is missing or looks wrong. Why?',
      questions: [
        q('Looking into the bottle from above, you can see straight through it: there\'s no liquid top.', ['Back faces are culled — render both sides (Cull Off / Two Sided)', 'The fill is too low', 'The glass is too thick'], 'The fake surface lives on back faces. If they\'re culled they never reach the fragment shader.'),
        q('The top of the liquid looks like the inside of a bowl (curved shading).', ['Back faces are lit with the wall normal — use an up-facing normal', 'Use object space', 'Discard is flipped'], 'The surface is flat: light it with (0, 1, 0) (or the tilted plane\'s normal).'),
        q('The side of the liquid is flat surface-coloured and the top is shaded.', ['The front/back branches are swapped', 'The fill is wrong', 'The normals are inverted in the mesh export'], 'gl_FrontFacing → side shading; else → surface colour.'),
        q('From below the fill line, the bottle\'s upper part looks empty even though there should be a surface above you.', ['Expected limit of the trick: back faces above the line are discarded', 'Turn on culling', 'Use world space'], 'The fake surface is only visible from above. Hide it with camera angles, or use real geometry when players can look from below.', { level: 2 }),
        q('A straw in the drink seems to stop at the far wall instead of entering the liquid.', ['Expected limit: the surface is painted on the far wall, so depth is wrong — hide with foam/opaque liquid', 'Use additive blending', 'Increase the fill'], 'The "surface" pixels have the far wall\'s depth, not the surface\'s.', { level: 2 }),
        q('A bottle with a deep dent shows two stacked surfaces.', ['Concave mesh: more than one back-face layer is visible — use a convex inner mesh', 'The fill is too high', 'Flip the normals'], 'The trick assumes one front + one back layer. A separate simplified convex liquid mesh fixes it.', { level: 3 }),
        tf('Back faces are the triangles whose winding appears clockwise/reversed on screen — on a closed mesh, the inside of the far wall.', true, 'The GPU decides front/back from the winding order after projection.'),
        tf('The fake surface needs an extra mesh for the lid.', false, 'No extra mesh: the inside of the existing back wall is re-coloured.'),
        tf('In Unreal, the TwoSidedSign node is +1 on front faces and −1 on back faces.', true, 'Use it to blend between the side colour and the surface colour.', 2),
        tf('<code>gl_FrontFacing</code> is available in the vertex shader.', false, 'Front/back is only known after the triangle is projected and rasterised, so it\'s a fragment shader input.', 2),
      ],
    },
  ],
};


// ================================================================ ③ WOBBLE (shader side)
const WOB_STEPS = [
  'Turn the flat line into a <b>sloped plane</b>: <code>fill + wob.x·x + wob.y·z</code>',
  'Tilt the fake surface\'s <b>normal</b> to match',
  'Compute the (linear) plane in the <b>vertex</b> shader, pass it as a varying',
  'Add <b>ripples</b> per pixel (non-linear → fragment shader)',
  'Drive <code>wob</code> from outside (part ④)',
];
const WOB_VERT_CODE = `// vertex shader 📐
vRel = worldPos - pivot;
float surface = uFill + uWobble.x * vRel.x + uWobble.y * vRel.z;
vAbove = vRel.y - surface;        // varying: + above, − below

// fragment shader 🎨
if (vAbove > 0.0) discard;`;
/** Per-pixel version of the same plane (for the comparison slide). */
const perPixel = (spec) => ({ ...spec, frag: spec.frag.replace('float above = vAbove;', 'float above = vRel.y - (uFill + uWob.x * vRel.x + uWob.y * vRel.z);') });

const wobConcept = {
  id: 'effects.liquid-wobble',
  title: 'Bottled liquid ③: wobble in the shader',
  blurb: 'Tilt the liquid line into a sloped plane, split the work between vertex and fragment, add ripples.',
  lesson: [
    {
      title: 'Sloshing = a tilted surface',
      body: `<p>When you jerk a glass sideways, the liquid <b>piles up on one side</b> and drops on the other, then rocks back and forth until it settles.</p>
<p>For our shader, a slosh is simply a <b>tilted surface</b>: the line becomes a <b>sloped plane</b>. Two numbers describe the slope:</p>
<ul><li><code>wob.x</code>: how much the surface rises per unit you move along <b>x</b> (left ↔ right)</li>
<li><code>wob.y</code>: the same along <b>z</b> (front ↔ back)</li></ul>
<div class="analogy">🍽️ A tray of water: tip it and one edge rises while the opposite edge sinks. The middle (our pivot) stays at the same height.</div>`,
      controls: [
        { name: 'x', label: 'wob.x (slope along x)', min: -0.8, max: 0.8, step: 0.01, value: 0.4 },
        { name: 'z', label: 'wob.y (slope along z)', min: -0.8, max: 0.8, step: 0.01, value: 0 },
      ],
      shader: (v) => liqSpec({ fill: 0.55, wob: [v.x, v.z], liq: LIQ.blue }),
      code: (v) => `float surface = uFill + ${f(v.x, 2)} * vRel.x + ${f(v.z, 2)} * vRel.z;
if (vRel.y > surface) discard;`,
      after: steps('Wobble', WOB_STEPS, 0),
    },
    {
      title: 'The maths of a slope, from the side',
      body: `<p>Look at the bottle from the side (only x matters here). The surface height at position x is:</p>
<pre class="code">surface(x) = fill + slope × x</pre>
<ul><li>At the pivot (x = 0): surface = <b>fill</b>. The middle never moves.</li>
<li>Right side (x = +1): fill + slope</li>
<li>Left side (x = −1): fill − slope</li></ul>
<p>That's the equation of a straight line, y = b + m·x, which you may remember from school. Add a z term and you get a plane.</p>`,
      controls: [
        { name: 'fl', label: 'fill (height at the pivot)', min: -0.8, max: 0.8, step: 0.01, value: 0.1 },
        { name: 's', label: 'slope', min: -0.8, max: 0.8, step: 0.01, value: 0.35 },
      ],
      graph: {
        fns: (v) => [{ f: (x) => v.fl + v.s * x, label: 'surface(x)' }, { f: (x) => Math.sqrt(Math.max(0, 1 - x * x)) * FH, label: 'bottle', color: '#9aa0b4' }, { f: (x) => -Math.sqrt(Math.max(0, 1 - x * x)) * FH, color: '#9aa0b4' }],
        opts: (v) => ({ xmin: -1.2, xmax: 1.2, ymin: -1.4, ymax: 1.4, points: [{ x: 0, y: v.fl, label: 'pivot' }, { x: 1, y: v.fl + v.s, label: f(v.fl + v.s, 2) }, { x: -1, y: v.fl - v.s, label: f(v.fl - v.s, 2) }] }),
      },
      code: (v) => `surface(-1) = ${f(v.fl, 2)} - ${f(v.s, 2)} = ${f(v.fl - v.s, 2)}
surface( 0) = ${f(v.fl, 2)}
surface(+1) = ${f(v.fl, 2)} + ${f(v.s, 2)} = ${f(v.fl + v.s, 2)}`,
      quiz: { q: 'fill = 0.2, slope = 0.5. What is the surface height at x = −1?', options: ['−0.3', '0.7', '0.2'], answer: 0, explain: '0.2 + 0.5 × (−1) = −0.3: the left side drops.' },
    },
    {
      title: 'Tilt the surface\'s normal too',
      body: `<p>In part ② the fake surface used the normal (0, 1, 0), "straight up". Once the surface is sloped, its normal must <b>lean</b> with it, or the lighting won't match the shape.</p>
<p>A surface that rises by <code>wob.x</code> for every step in x has the normal:</p>
<pre class="code">vec3 surfN = normalize(vec3(-wob.x, 1.0, -wob.y));</pre>
<p>Read it like this: start from "up" (0, 1, 0), then lean it <b>away</b> from the side that rises (that's the minus sign). <code>normalize</code> makes it length 1 again.</p>`,
      controls: [{ name: 'x', label: 'wob.x', min: -0.8, max: 0.8, step: 0.01, value: 0.5 }],
      shaders: [
        { spec: (v) => ({ ...liqSpec({ fill: 0.55, wob: [v.x, 0], liq: LIQ.blue }), frag: liqFrag().replace('vec3 up = normalize(vec3(-vWob.x, 1.0, -vWob.y));', 'vec3 up = vec3(0.0, 1.0, 0.0);') }), label: 'normal stays (0, 1, 0)', caption: 'flat shading' },
        { spec: (v) => liqSpec({ fill: 0.55, wob: [v.x, 0], liq: LIQ.blue }), label: 'leaning normal ✅', caption: 'light follows the slope' },
      ],
      after: steps('Wobble', WOB_STEPS, 1) + '<p class="small dim">The difference is subtle on a small, light-coloured surface, but on big bottles and stylised toon liquids the brightness change while sloshing really sells it.</p>',
    },
    {
      title: 'Do the plane in the vertex shader',
      body: `<p>The plane is <b>linear</b>: it only adds and multiplies positions by constants. Linear values interpolate across a triangle <b>perfectly</b>, so we can compute "how far above the surface am I?" in the <b>vertex shader</b> ${stage('v')} and pass that single number down as a varying.</p>
<p>The fragment shader ${stage('f')} is left with just <code>if (vAbove > 0.0) discard;</code>.</p>
<p>Left: computed per pixel. Right: per vertex. <b>Identical</b>, but the right one did the work ~1000× fewer times.</p>`,
      controls: [{ name: 'x', label: 'wob.x', min: -0.8, max: 0.8, step: 0.01, value: 0.45 }],
      shaders: [
        { spec: (v) => perPixel(liqSpec({ fill: 0.55, wob: [v.x, 0.2], liq: LIQ.green })), label: 'per pixel', caption: 'fragment does the plane' },
        { spec: (v) => liqSpec({ fill: 0.55, wob: [v.x, 0.2], liq: LIQ.green }), label: 'per vertex', caption: 'vertex does the plane' },
      ],
      code: WOB_VERT_CODE,
      after: steps('Wobble', WOB_STEPS, 2) + `<div class="note">📏 <b>Rule of thumb:</b> a value made only of <b>+ − and × by constants</b> of positions (a plane, a gradient, a distance along an axis) can move to the vertex shader. Anything <b>curvy</b> (sin, noise, pow, a texture lookup, length…) must stay per pixel, unless the mesh is very dense.</div>
<div class="tip">Unreal: plug the value into a <b>VertexInterpolator</b> node and the math before it runs per vertex. Unity Shader Graph: <b>Custom Interpolators</b> on the vertex block.</div>`,
      quiz: { q: 'Why is it safe to compute the tilted plane per vertex?', options: ['It\'s linear, so interpolating between vertices gives the exact per-pixel value', 'Vertex shaders are more precise', 'Because discard only works in the vertex shader'], answer: 0, explain: 'The GPU interpolates varyings linearly. A linear function interpolated linearly is exact.' },
    },
    {
      title: 'Ripples belong in the fragment shader',
      body: `<p>Real liquid also <b>ripples</b>. Add a small travelling sine wave to the height:</p>
<pre class="code">above += amp * sin(vRel.x * freq - uTime * 4.0);</pre>
<p>A sine is <b>curvy</b> (non-linear). Computed per vertex (left), the GPU can only draw <b>straight segments between vertices</b>, so the wave edge becomes jagged, especially at high frequency. Computed per pixel (right), it's smooth.</p>
<p>Raise the frequency and compare.</p>`,
      controls: [
        { name: 'fq', label: 'ripple frequency', min: 2, max: 40, step: 0.5, value: 28 },
        { name: 'a', label: 'ripple amplitude', min: 0, max: 0.08, step: 0.002, value: 0.04 },
      ],
      shaders: [
        { spec: (v) => liqSpec({ fill: 0.55, rip: v.a, ripF: v.fq, ripV: true, liq: LIQ.green, wob: [0.2, 0] }), label: 'sine per vertex ❌', caption: 'jagged edge' },
        { spec: (v) => liqSpec({ fill: 0.55, rip: v.a, ripF: v.fq, liq: LIQ.green, wob: [0.2, 0] }), label: 'sine per pixel ✅', caption: 'smooth wave' },
      ],
      code: (v) => `// vertex 📐: the linear plane
vAbove = vRel.y - surface;
// fragment 🎨: the curvy part
float above = vAbove + ${f(v.a, 3)} * sin(vRel.x * ${f(v.fq, 1)} - uTime * 4.0);
if (above > 0.0) discard;`,
      after: steps('Wobble', WOB_STEPS, 3) + '<div class="tip">Scale the ripple amplitude by how much the liquid is moving (e.g. <code>length(wob)</code>), so it ripples while sloshing and goes calm when still.</div>',
    },
    {
      title: 'Who moves the numbers?',
      body: `<p>The shader now accepts <code>uWobble</code>, but something has to <b>change it over time</b>. The quickest fake, all inside the shader, is a <b>decaying sine</b>: a wobble that rocks back and forth and fades out.</p>
<pre class="code">wob.x = amount * exp(-damping * t) * sin(speed * t);</pre>
<ul><li><code>sin(speed·t)</code>: rocks back and forth</li><li><code>exp(−damping·t)</code>: shrinks from 1 towards 0, so it fades</li></ul>
<p>Here <code>t</code> restarts every 4 s, as if someone bumped the bottle.</p>`,
      controls: [
        { name: 'fq', label: 'speed', min: 3, max: 20, step: 0.1, value: 9 },
        { name: 'd', label: 'damping', min: 0.2, max: 4, step: 0.05, value: 1.4 },
      ],
      shader: (v) => liqSpec({ fill: 0.55, auto: 0.5, freq: v.fq, damp: v.d, rip: 0.02, liq: LIQ.blue }),
      graph: { fns: (v) => [{ f: (t) => 0.5 * Math.exp(-v.d * t) * Math.sin(v.fq * t), label: 'wob.x over time' }, { f: (t) => 0.5 * Math.exp(-v.d * t), label: 'envelope', color: '#9aa0b4', dash: [4, 4] }], opts: { xmin: 0, xmax: 4, ymin: -0.55, ymax: 0.55 } },
      after: steps('Wobble', WOB_STEPS, 4) + '<p>That\'s fine for a looping idle, but it ignores how the bottle actually moves. To react to the <b>player</b> shaking the bottle, a tiny script has to watch the bottle and feed the numbers in. That\'s part ④.</p>' + series(2),
    },
  ],
  games: [
    {
      id: 'wob-tune', title: 'Match the slosh', engine: 'slider', rounds: 4,
      blurb: 'Match the surface slope (and fill).',
      gen: (rng, level) => {
        const t = { x: rng.step(-0.6, 0.6, 0.1) || 0.3, z: rng.step(-0.6, 0.6, 0.1), fr: rng.step(0.3, 0.75, 0.05) };
        const params = [{ name: 'x', label: 'wob.x', min: -0.8, max: 0.8, step: 0.01, target: t.x }];
        if (level >= 2) params.push({ name: 'z', label: 'wob.y (z slope)', min: -0.8, max: 0.8, step: 0.01, target: t.z });
        if (level === 3) params.push({ name: 'fr', label: 'fill', min: 0, max: 1, step: 0.01, target: t.fr });
        const P = (p) => ({ wob: [p.x, level >= 2 ? p.z : 0], fill: level === 3 ? p.fr : 0.55, cam: FRONT_CAM, liq: LIQ.blue });
        return {
          prompt: 'Make your liquid slosh like the target.',
          sub: level >= 2 ? 'x tilts left/right. z tilts towards/away from you (watch the shape of the top ellipse).' : 'Which side is higher, and by how much?',
          params,
          build: (p) => liqSpec(P(p)),
          code: (p) => `float surface = ${f(fillToH(P(p).fill), 2)} + ${f(p.x, 2)} * vRel.x + ${f(P(p).wob[1], 2)} * vRel.z;`,
          tolerance: 0.05,
          explain: '<p>A positive x slope raises the right side (+x) and lowers the left. A z slope tilts the surface towards/away from the camera, which changes how much of the top you see.</p>',
        };
      },
    },
    {
      id: 'wob-height', title: 'Above or below?', engine: 'numeric', rounds: 5,
      blurb: 'Compute the surface height at a point, and how far above it a pixel is.',
      gen: (rng, level) => {
        const F = rng.step(-0.4, 0.4, 0.1), wx = rng.step(-0.6, 0.6, 0.1) || 0.4, wz = level >= 2 ? rng.step(-0.5, 0.5, 0.1) : 0;
        const x = rng.pick([-1, -0.5, 0.5, 1]), z = level >= 2 ? rng.pick([-1, -0.5, 0.5, 1]) : 0;
        const surf = +(F + wx * x + wz * z).toFixed(2);
        const code = `float surface = ${f(F, 1)} + ${f(wx, 1)} * vRel.x${level >= 2 ? ` + ${f(wz, 1)} * vRel.z` : ''};`;
        if (level < 3 || rng.chance(0.4)) {
          return { prompt: `What is <code>surface</code> at <code>vRel = (${n(x, 1)}, ?, ${n(z, 1)})</code>?`, code, answer: surf, explain: `<p>${n(F, 1)} + ${n(wx, 1)} × ${n(x, 1)}${level >= 2 ? ` + ${n(wz, 1)} × ${n(z, 1)}` : ''} = <b>${n(surf, 2)}</b>.</p>` };
        }
        const y = rng.step(-0.8, 0.8, 0.1);
        const ans = +(y - surf).toFixed(2);
        return { prompt: `A pixel has <code>vRel = (${n(x, 1)}, ${n(y, 1)}, ${n(z, 1)})</code>. What is <code>vAbove</code> = vRel.y − surface?`, code, answer: ans, explain: `<p>surface = ${n(surf, 2)} → vAbove = ${n(y, 1)} − ${n(surf, 2)} = <b>${n(ans, 2)}</b> → ${ans > 0 ? 'discarded ✂' : 'kept (liquid)'}.</p>` };
      },
    },
    {
      id: 'wob-stage', title: 'Per vertex or per pixel?', engine: 'buckets', rounds: 2,
      blurb: 'Can this part of the liquid run in the vertex shader?',
      gen: () => ({
        prompt: 'Where should this be computed?',
        sub: 'Linear in position → vertex is fine (cheaper). Curvy / needs the pixel → fragment.',
        buckets: ['📐 Vertex OK', '🎨 Must be per pixel'],
        count: 10,
        items: [
          { code: 'vRel = worldPos - pivot;', bucket: 0, why: 'Linear: interpolates exactly.' },
          { code: 'vAbove = vRel.y - (uFill + uWob.x * vRel.x);', bucket: 0, why: 'A plane: linear.' },
          { code: 'above += 0.03 * sin(vRel.x * 20.0 - uTime);', bucket: 1, why: 'A sine is curvy: per vertex it turns into jagged straight segments.' },
          { code: 'if (above > 0.0) discard;', bucket: 1, why: 'discard only exists in the fragment shader.' },
          { code: 'col = gl_FrontFacing ? side : top;', bucket: 1, why: 'Front/back is only known per pixel, after rasterisation.' },
          { code: 'pos -= normal * uThickness;', bucket: 0, why: 'Moving vertices is the vertex shader\'s job.' },
          { code: 'float bubbles = voronoi(vec2(x, y - uTime));', bucket: 1, why: 'Noise/patterns have detail smaller than triangles.' },
          { code: 'pos.y *= 1.0 + uSquash;', bucket: 0, why: 'Squashing the mesh = moving vertices.' },
          { code: 'float rim = pow(1.0 - dot(N, V), 3.0);', bucket: 1, why: 'pow is curvy; a rim needs per-pixel smoothness.' },
          { code: 'vec3 pivot = (uModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;', bucket: 0, why: 'Same for every vertex; uses the model matrix.' },
          { text: 'A gradient from the bottom of the bottle to the top (linear in height)', bucket: 0 },
          { text: 'Foam band with a smoothstep edge', bucket: 1, why: 'smoothstep is curvy and the band is thinner than a triangle.' },
        ],
      }),
    },
    {
      id: 'wob-read', title: 'Code → slosh', engine: 'mcq', rounds: 6,
      blurb: 'Read the plane equation, pick the bottle.',
      gen: (rng, level) => {
        const vals = level === 1 ? [-0.5, 0, 0.5] : [-0.5, -0.25, 0, 0.25, 0.5];
        const mk = () => [rng.pick(vals), level >= 2 ? rng.pick(vals) : 0];
        const key = (w) => w.join();
        let ans = mk(); while (ans[0] === 0 && ans[1] === 0) ans = mk();
        const opts = distinct(rng, ans, mk, level === 1 ? 3 : 4, key);
        const codeOf = (w) => `float surface = 0.0${w[0] ? ` + ${f(w[0], 2)} * vRel.x` : ''}${w[1] ? ` + ${f(w[1], 2)} * vRel.z` : ''};`;
        return {
          prompt: 'Which bottle does this code give?',
          sub: 'Camera: x points right, z points towards you.',
          code: codeOf(ans),
          options: opts.map((w) => ({ shader: liqSpec({ h: 0, wob: w, cam: FRONT_CAM, liq: LIQ.amber }) })),
          grid: true,
          explain: `<p>${ans[0] > 0 ? 'Positive x slope → the <b>right</b> side is higher.' : ans[0] < 0 ? 'Negative x slope → the <b>left</b> side is higher.' : 'No x term → level left-to-right.'}${level >= 2 ? (ans[1] > 0 ? ' Positive z slope → the side <b>nearest you</b> is higher (you see less of the top).' : ans[1] < 0 ? ' Negative z slope → the <b>far</b> side is higher (the top faces you more).' : ' No z term → level front-to-back.') : ''}</p>`,
        };
      },
    },
  ],
};

// ================================================================ ④ SLOSH PHYSICS (script side)
const PHYS_STEPS = [
  'Measure the bottle\'s <b>velocity</b> and <b>acceleration</b> from its positions',
  'Run a tiny <b>spring</b>: pulled back to level, slowed by damping, kicked by acceleration',
  'Clamp it so it never goes crazy',
  'Send the result to the material as <code>WobbleX</code> / <code>WobbleZ</code>',
];
const LOOP_CODE = `// ── ONCE, when the bottle spawns ──
tilt    = (0, 0)   // slope sent to the shader
tiltVel = (0, 0)   // how fast the slope changes
lastPos = bottle.position
lastVel = (0, 0, 0)

// ── EVERY FRAME ──
// ① never simulate a huge step
dt = min(frameDeltaTime, 1/30)

// ② how fast is the bottle moving?
vel = (bottle.position - lastPos) / dt
// ③ how fast is that speed changing?
acc = (vel - lastVel) / dt
lastPos = bottle.position
lastVel = vel

// ④ the spring: three pushes on the tilt
force = - stiffness * tilt     // back to level
        - damping * tiltVel    // calm down
        - kick * acc.xz        // bottle's jerk

// ⑤ push changes speed, speed changes tilt
tiltVel += force * dt
tilt    += tiltVel * dt

// ⑥ safety net
tilt = clamp(tilt, -maxTilt, maxTilt)

// ⑦ hand the two numbers to the shader
material.setFloat("WobbleX", tilt.x)
material.setFloat("WobbleZ", tilt.y)`;

/** Simulate the loop (semi-implicit Euler) for one kick, for graphs. */
const simKick = (k, c, T = 3, dt = 1 / 60, v0 = 4) => {
  let x = 0, v = v0; const out = [];
  for (let t = 0; t <= T + dt; t += dt) { out.push(x); v += (-k * x - c * v) * dt; x += v * dt; }
  return out;
};

/** "Shaders have no memory" diagram */
const flowDiagram = `<div style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
<div style="border:1px solid var(--line);background:var(--bg3);border-radius:10px;padding:8px 10px">${stage('c')} <span class="small dim">— runs once per frame, for the whole bottle. <b>Remembers</b> last frame.</span><div class="small" style="margin-top:4px">"The bottle moved 0.2 m to the right since last frame… the liquid should lag behind."</div></div>
<div style="text-align:center;color:var(--accent2);font-weight:700">↓ 2 numbers: WobbleX, WobbleZ (material parameters / uniforms) ↓</div>
<div style="border:1px solid var(--line);background:var(--bg3);border-radius:10px;padding:8px 10px">${stage('v')} + ${stage('f')} <span class="small dim">— runs for every vertex / pixel, <b>forgets everything</b> after each frame.</span><div class="small" style="margin-top:4px">"Here's my slope, I'll cut the liquid with it."</div></div></div>`;

const SHAKE_CAM = { yaw: 0, pitch: 0.28, dist: 6.6 };

/** The interactive shake demo: drag the bottle, a live spring sloshes the liquid. */
const shakeDemo = (el) => {
  const st = { k: 90, c: 3, kick: 0.6, x: 0, tx: 0, px: 0, pv: 0, tilt: 0, tv: 0, lean: 0, hist: [] };
  const spec = () => liqSpec({ fill: 0.5, wob: [st.tilt, 0], x: st.x, tilt: st.lean, cam: SHAKE_CAM, liq: LIQ.amber });
  const view = shaderView(spec(), { size: 300 });
  const cv = view.canvas;
  cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
  const toX = (ev) => { const r = cv.getBoundingClientRect(); return clamp(((ev.clientX - r.left) / r.width - 0.5) * 5.5, -1.5, 1.5); };
  let drag = false;
  cv.addEventListener('pointerdown', (e) => { drag = true; try { cv.setPointerCapture(e.pointerId); } catch { /* ok */ } st.tx = toX(e); });
  cv.addEventListener('pointermove', (e) => { if (drag) st.tx = toX(e); });
  const up = () => { drag = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  const g = canvas2d(300, 70);
  const read = h('div.readout', { style: { fontFamily: 'var(--mono)' } });
  const kickBtn = (dir, label) => h('button.btn', { style: { flex: '1' }, onclick: () => { st.tx = clamp(st.tx + dir * 1.2, -1.5, 1.5); if (Math.abs(st.tx - st.x) < 0.3) st.tx = -dir * 1.5; } }, label);
  const sl = (name, label, min, max, step) => slider({ name, label, min, max, step, value: st[name] }, (v) => { st[name] = v; });
  el.append(
    h('div.view-wrap', view),
    h('div.small.dim.center', { style: { margin: '4px 0 8px' } }, '👆 Drag the bottle left and right (or use the buttons).'),
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } }, kickBtn(-1, '◀ jerk left'), kickBtn(1, 'jerk right ▶')),
    read, g.el,
    sl('k', 'stiffness (how fast it rocks)', 20, 250, 1),
    sl('c', 'damping (how fast it calms down)', 0, 12, 0.1),
    sl('kick', 'kick (how much motion sloshes it)', 0, 1.5, 0.01),
  );
  const drawGraph = () => {
    const { ctx } = g; const W = 300, H = 70;
    ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#343848'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2; ctx.beginPath();
    st.hist.forEach((v, i) => { const x = (i / 179) * W, y = H / 2 - (v / 0.9) * (H / 2 - 4); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#9aa0b4'; ctx.font = '10px sans-serif'; ctx.fillText('WobbleX over the last 3 s', 6, 12);
  };
  let last = performance.now(), seen = false;
  const tick = (now) => {
    if (!el.isConnected) { if (seen) return; } else seen = true;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30); last = now;
    if (dt > 0) {
      st.x += (st.tx - st.x) * (1 - Math.exp(-dt * 16));          // the "hand" follows the finger smoothly
      const vel = (st.x - st.px) / dt, acc = (vel - st.pv) / dt;   // ② ③
      st.px = st.x; st.pv = vel;
      const force = -st.k * st.tilt - st.c * st.tv - st.kick * acc; // ④
      st.tv += force * dt; st.tilt = clamp(st.tilt + st.tv * dt, -0.9, 0.9); // ⑤ ⑥
      st.lean += (clamp(-vel * 0.06, -0.35, 0.35) - st.lean) * (1 - Math.exp(-dt * 8)); // bottle leans a bit (looks nicer)
      st.hist.push(st.tilt); if (st.hist.length > 180) st.hist.shift();
    }
    view.update(spec());
    read.textContent = `bottle x = ${st.x.toFixed(2)}   WobbleX = ${st.tilt >= 0 ? ' ' : ''}${st.tilt.toFixed(3)}`;
    drawGraph();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const physConcept = {
  id: 'effects.liquid-physics',
  title: 'Bottled liquid ④: slosh physics (script)',
  blurb: 'A tiny spring simulation on the CPU turns the bottle\'s motion into the two wobble numbers.',
  lesson: [
    {
      title: 'Shaders have no memory',
      body: `<p>To slosh <b>realistically</b>, the liquid must react to how the bottle <b>has been moving</b>: jerk it right and the liquid lags behind, then swings back.</p>
<p>A shader can't do that. Every frame, every vertex and pixel runs from scratch and <b>forgets everything</b> afterwards. It has no idea where the bottle was a moment ago.</p>
<div class="analogy">🐟 The shader is a goldfish: brilliant at its job, but it has no memory of the last frame. The script is the friend with a notebook who writes down where the bottle was and tells the goldfish what to do.</div>
<p>So the slosh is split in two:</p>${flowDiagram}`,
      after: steps('Slosh physics', PHYS_STEPS) + '<div class="note">Only <b>two numbers per bottle per frame</b> cross from CPU to GPU. That\'s why this effect is so cheap: hundreds of bottles are no problem.</div>',
    },
    {
      title: 'The liquid is a spring',
      body: `<p>The tilt of a sloshing surface behaves like a <b>weight on a spring</b> (or a pendulum). Three things push on it:</p>
<ol><li><b>Stiffness</b>: gravity wants the surface level, so the tilt is always pulled back towards 0. Stiffer means faster rocking.</li>
<li><b>Damping</b>: friction. It steals a bit of motion every frame, so the rocking dies out. No damping means it sloshes forever.</li>
<li><b>Kick</b>: when the bottle <b>accelerates</b>, the liquid lags behind (inertia) and piles up on the trailing side.</li></ol>
<div class="analogy">🛝 A kid on a swing: the chains pull them back to the middle (stiffness), air and friction slow them down (damping), and a push (kick) starts it all.</div>
<p>The graph shows the tilt after <b>one kick</b>, simulated with the exact loop from the next slide.</p>`,
      controls: [
        { name: 'k', label: 'stiffness', min: 20, max: 250, step: 1, value: 90 },
        { name: 'c', label: 'damping', min: 0, max: 12, step: 0.1, value: 3 },
      ],
      graph: { fns: (v) => { const s = simKick(v.k, v.c); return [{ f: (t) => s[Math.min(s.length - 1, Math.round(t * 60))], label: 'tilt after a kick' }]; }, opts: { xmin: 0, xmax: 3, ymin: -0.9, ymax: 0.9 } },
      after: steps('Slosh physics', PHYS_STEPS, 1) + '<p class="small dim">Try damping 0 (never stops), damping 12 (gloopy, like honey), stiffness 250 (fast, small bottle) vs 20 (slow, big tank).</p>',
    },
    {
      title: 'Velocity and acceleration, from positions',
      body: `<p>The script only knows <b>where the bottle is</b> each frame. Two subtractions give the rest:</p>
<pre class="code">velocity     = (position − lastPosition) / dt
acceleration = (velocity − lastVelocity) / dt</pre>
<p>(<code>dt</code> = seconds since the last frame, e.g. 1/60.)</p>
<p>Example at 10 frames per second (dt = 0.1 s), the bottle's x position: <b>0.0 → 0.0 → 0.1 → 0.3</b></p>
<ul><li>velocities: (0.0−0.0)/0.1 = <b>0</b>, (0.1−0.0)/0.1 = <b>1</b>, (0.3−0.1)/0.1 = <b>2</b> m/s</li>
<li>accelerations: (1−0)/0.1 = <b>10</b>, (2−1)/0.1 = <b>10</b> m/s²</li></ul>
<p>Why <b>acceleration</b> and not velocity? Carry a full glass smoothly at constant speed and nothing sloshes. It's the <b>start</b>, <b>stop</b> and <b>change of direction</b> that sloshes.</p>`,
      after: steps('Slosh physics', PHYS_STEPS, 0) + '<div class="tip">If the bottle is a physics object, the engine already knows its velocity (Unity <code>Rigidbody.velocity</code>, Unreal <code>Get Physics Linear Velocity</code>), so you only need the second subtraction.</div>',
      quiz: { q: 'At dt = 0.5 s, velocity goes from 2 m/s to 3 m/s. Acceleration?', options: ['2 m/s²', '0.5 m/s²', '1 m/s²'], answer: 0, explain: '(3 − 2) / 0.5 = 2 m/s².' },
    },
    {
      title: 'The update loop, line by line',
      body: `<p>Here's the whole script. It's engine-agnostic pseudo-code that fits in Unity's <code>Update()</code>, Unreal's <code>Tick</code>, Godot's <code>_process</code>…</p>`,
      code: LOOP_CODE,
      after: `<ol class="small">
<li><b>Clamp dt</b>: if the game hitches (one 0.5 s frame), a big step would fling the spring around. Never simulate more than ~1/30 s at once.</li>
<li><b>Velocity</b> from the position change.</li>
<li><b>Acceleration</b> from the velocity change.</li>
<li><b>Force</b>: the three pushes from the previous slide. <code>acc.xz</code> = only the horizontal part (in Unreal: <code>acc.xy</code>, because Z is up). Vertical bumps don't tilt a surface.</li>
<li><b>Integrate</b>: force changes the speed, speed changes the tilt. Updating the speed first ("semi-implicit Euler") keeps springs stable.</li>
<li><b>Clamp</b>: a safety net so the surface can never flip.</li>
<li><b>Send</b> the two numbers to the material.</li></ol>
<div class="note">The minus in <code>− kick × acc</code> makes the liquid <b>lag behind</b>: accelerate to the right and the slope goes negative, so the <b>left</b> side rises.</div>` + steps('Slosh physics', PHYS_STEPS, 3),
    },
    {
      title: '🍹 Shake it!',
      body: `<p>This is the loop from the previous slide, running live: <b>${stage('c')}</b> on the page, and the result sent to the liquid shader every frame.</p>
<p>Drag the bottle. Notice that a <b>steady</b> drag barely sloshes; the <b>start and stop</b> do. Play with the sliders: no damping, huge stiffness, zero kick…</p>`,
      visual: shakeDemo,
      after: '<p class="small dim">The bottle also leans a little with its speed (just a visual touch). The liquid stays level anyway, because the shader measures height in world space (part ①).</p>',
    },
    {
      title: 'The popular shortcut',
      body: `<p>Many tutorials use an even simpler script: no spring, just the <b>decaying sine</b> from part ③, re-energised by movement:</p>
<pre class="code">// every frame
wobbleAmount += length(velocity) * strength * dt   // movement adds energy
wobbleAmount  = lerp(wobbleAmount, 0, recovery * dt) // fades out
wobbleX = wobbleAmount * sin(time * speed)
wobbleZ = wobbleAmount * sin(time * speed + 1.57)   // a quarter-turn later</pre>
<table class="small" style="width:100%;border-collapse:collapse;margin-top:8px">
<tr><th style="text-align:left"></th><th style="text-align:left">Decaying sine</th><th style="text-align:left">Spring</th></tr>
<tr><td>Code</td><td>✅ tiny</td><td>✅ small</td></tr>
<tr><td>Direction</td><td>❌ rocks the same way whatever the push</td><td>✅ piles up opposite the push</td></tr>
<tr><td>Settling</td><td>❌ keeps its rhythm, just smaller</td><td>✅ swings back naturally</td></tr>
<tr><td>Good for</td><td>idle wobble, far-away props</td><td>hand-held / hero props</td></tr></table>`,
      after: '<div class="tip">You can mix them: spring for the main slosh, plus a tiny sine for an idle "breathing" wobble.</div>',
    },
    {
      title: 'Making it robust',
      body: `<p>Production details that save you from bug reports:</p>
<ul>
<li><b>Teleports</b>: when the bottle respawns or is teleported, reset <code>lastPos</code> (and <code>lastVel</code>). Otherwise one gigantic "velocity" sends the liquid flying.</li>
<li><b>Rotation</b> sloshes too: add a bit of the bottle's <b>angular velocity</b> to the kick (spin a glass and the liquid swirls).</li>
<li><b>Sleep</b>: when tilt and tiltVel are both tiny, stop updating (and stop sending parameters) until the bottle moves again.</li>
<li><b>Many bottles</b>: send the numbers as <b>per-instance data</b> (Unity <code>MaterialPropertyBlock</code>, Unreal <b>Custom Primitive Data</b>) instead of creating a material per bottle.</li>
<li><b>Frame rate</b>: the dt clamp stops explosions; for perfect consistency, run the spring at a fixed step (e.g. in FixedUpdate).</li>
<li><b>Units</b>: Unreal works in centimetres, so its accelerations are ×100 → use a ~100× smaller kick.</li></ul>`,
      after: series(3),
    },
  ],
  games: [
    {
      id: 'phys-order', title: 'Write the update loop', engine: 'order', rounds: 3,
      blurb: 'Put the slosh script\'s steps in order.',
      gen: (rng, level) => rng.pick([
        { prompt: 'Order one frame of the slosh script:', items: ['Clamp dt to a safe maximum', 'velocity = (position − lastPosition) / dt', 'acceleration = (velocity − lastVelocity) / dt', 'force = −stiffness·tilt − damping·tiltVel − kick·acc', 'tiltVel += force · dt', 'tilt += tiltVel · dt', 'Send tilt to the material'], explain: 'Each line needs the one before it: dt → velocity → acceleration → force → speed → tilt → material.' },
        { prompt: 'Order the lines so the spring works:', items: [{ code: 'acc = (vel - lastVel) / dt;' }, { code: 'force = -k * tilt - c * tiltVel - kick * acc.x;' }, { code: 'tiltVel += force * dt;' }, { code: 'tilt += tiltVel * dt;' }, { code: 'material.SetFloat("WobbleX", tilt);' }], explain: 'Acceleration feeds the force, the force changes the speed, the speed changes the tilt, then the tilt is sent.' },
        ...(level >= 2 ? [{ prompt: 'Order the whole effect, from player action to pixel:', items: ['The player moves the bottle', 'The script measures its acceleration', 'The spring updates the tilt', 'The tilt is sent as a material parameter', 'The vertex shader computes vAbove with the sloped plane', 'The fragment shader discards pixels above the surface'], explain: 'CPU first (measure → simulate → send), then GPU (vertex → fragment).' }] : []),
      ]),
    },
    {
      id: 'phys-math', title: 'Run the script by hand', engine: 'numeric', rounds: 5,
      blurb: 'Velocity, acceleration and one spring step.',
      gen: (rng, level) => {
        const kind = rng.pick(level === 1 ? ['vel', 'acc'] : level === 2 ? ['vel', 'acc', 'force'] : ['acc', 'force', 'step']);
        const dt = rng.pick([0.1, 0.5, 0.25]);
        if (kind === 'vel') {
          const p0 = rng.step(-1, 1, 0.1), d = rng.step(-0.5, 0.5, 0.05) || 0.2; const ans = +(d / dt).toFixed(2);
          return { prompt: `dt = ${n(dt, 2)} s. Last position x = ${n(p0, 2)}, now x = ${n(p0 + d, 2)}. Velocity?`, code: 'vel = (pos - lastPos) / dt;', answer: ans, explain: `<p>(${n(p0 + d, 2)} − ${n(p0, 2)}) / ${n(dt, 2)} = ${n(d, 2)} / ${n(dt, 2)} = <b>${n(ans, 2)}</b> m/s.</p>` };
        }
        if (kind === 'acc') {
          const v0 = rng.step(-3, 3, 0.5), v1 = rng.step(-3, 3, 0.5); const ans = +((v1 - v0) / dt).toFixed(2);
          return { prompt: `dt = ${n(dt, 2)} s. Last velocity = ${n(v0, 1)}, now = ${n(v1, 1)}. Acceleration?`, code: 'acc = (vel - lastVel) / dt;', answer: ans, explain: `<p>(${n(v1, 1)} − ${n(v0, 1)}) / ${n(dt, 2)} = <b>${n(ans, 2)}</b>.${v0 === v1 ? ' Constant speed → no acceleration → no slosh!' : ''}</p>` };
        }
        if (kind === 'force') {
          const k = rng.pick([50, 100]), c = rng.pick([2, 4]), kick = rng.pick([0.1, 0.5]);
          const t = rng.step(-0.3, 0.3, 0.1), tv = rng.step(-1, 1, 0.5), a = rng.pick([-10, -4, 0, 4, 10]);
          const ans = +(-k * t - c * tv - kick * a).toFixed(2);
          return { prompt: `stiffness = ${k}, damping = ${c}, kick = ${n(kick, 1)}. tilt = ${n(t, 1)}, tiltVel = ${n(tv, 1)}, acc = ${a}. Force?`, code: 'force = -stiffness * tilt - damping * tiltVel - kick * acc;', answer: ans, explain: `<p>−${k}×${n(t, 1)} − ${c}×${n(tv, 1)} − ${n(kick, 1)}×${a} = ${n(-k * t, 1)} + ${n(-c * tv, 1)} + ${n(-kick * a, 1)} = <b>${n(ans, 2)}</b>.</p>` };
        }
        const t = rng.step(-0.2, 0.2, 0.1), tv = rng.step(-1, 1, 0.5), F = rng.pick([-20, -10, 10, 20]); const d2 = 0.1;
        const tv2 = tv + F * d2, ans = +(t + tv2 * d2).toFixed(2);
        return { prompt: `dt = 0.1. tilt = ${n(t, 1)}, tiltVel = ${n(tv, 1)}, force = ${F}. What is the new <b>tilt</b>? (Update tiltVel first!)`, code: 'tiltVel += force * dt;\ntilt    += tiltVel * dt;', answer: ans, explain: `<p>tiltVel = ${n(tv, 1)} + ${F}×0.1 = ${n(tv2, 1)}. tilt = ${n(t, 1)} + ${n(tv2, 1)}×0.1 = <b>${n(ans, 2)}</b>.</p>` };
      },
    },
    {
      id: 'phys-tune', title: 'Match the slosh curve', engine: 'slider', rounds: 4,
      blurb: 'Tune stiffness and damping to match how the liquid settles.',
      gen: (rng, level) => {
        const t = { k: rng.step(30, 200, 10), c: rng.step(0.5, 7, 0.5) };
        const params = [{ name: 'k', label: 'stiffness', min: 20, max: 220, step: 1, target: t.k }];
        if (level >= 2) params.push({ name: 'c', label: 'damping', min: 0.2, max: 8, step: 0.1, target: t.c });
        const P = (p) => ({ k: p.k, c: level >= 2 ? p.c : 2.5 });
        const build = (p) => ({
          frag: `float t = uv.x * 3.0;                         // 3 seconds across
float wd = sqrt(max(uK - uC * uC * 0.25, 0.01));
float y = 4.0 * exp(-0.5 * uC * t) * sin(wd * t) / wd;   // tilt after one kick
float e = uv.y - 0.5 - y * 0.55;
float w = fwidth(e);
col = vec3(0.055, 0.06, 0.085);
col = mix(col, vec3(0.2, 0.21, 0.27), 1.0 - smoothstep(0.0, 0.004, abs(uv.y - 0.5)));
col = mix(col, vec3(0.2, 0.21, 0.27), (1.0 - smoothstep(0.0, 0.006, abs(fract(t) - 0.0))) * 0.8);
col = mix(col, vec3(1.0, 0.83, 0.47), 1.0 - smoothstep(w, w * 2.5, abs(e)));`,
          uniforms: { uK: P(p).k, uC: P(p).c },
        });
        return {
          prompt: 'Tune the spring so its response matches the target.',
          sub: 'The curve = the tilt during 3 s after one kick. Stiffness → how many wiggles. Damping → how fast they shrink.',
          params,
          build,
          code: (p) => `force = -${f(P(p).k, 0)} * tilt - ${f(P(p).c, 1)} * tiltVel - kick * acc;`,
          tolerance: 0.05,
          explain: '<p>Count the wiggles in the first second to set stiffness (more wiggles = stiffer), then match how quickly they shrink with damping.</p>',
        };
      },
    },
    {
      id: 'phys-doctor', title: 'Slosh doctor', engine: 'mcq', rounds: 7,
      blurb: 'The slosh behaves strangely. What\'s the fix?',
      questions: [
        q('The liquid keeps sloshing forever after a single bump.', ['Damping is 0 — add damping', 'Stiffness is too low', 'The kick is too small'], 'Damping removes energy every frame; without it a spring never settles.'),
        q('Push the bottle right and the liquid piles up on the RIGHT side.', ['The kick has the wrong sign: force must be −kick × acc', 'Damping is too high', 'Use object space'], 'Inertia: liquid lags behind, so it piles up on the trailing (left) side.'),
        q('Carrying the bottle at a steady speed makes the liquid stay permanently tilted.', ['The kick uses velocity instead of acceleration', 'Stiffness is too high', 'dt is clamped'], 'Constant speed = zero acceleration = level liquid. Use the change of velocity.'),
        q('After a frame-rate hitch, the liquid flips upside down.', ['Clamp dt (and the tilt) so one long frame can\'t explode the spring', 'Lower the fill', 'Use a decaying sine'], 'A huge dt makes the explicit step overshoot. Clamp both.'),
        q('When the player respawns, every bottle they carry violently sloshes.', ['Reset lastPosition/lastVelocity on teleport', 'Increase damping', 'Disable the shader'], 'The teleport distance looks like a huge velocity for one frame.', { level: 2 }),
        q('The liquid rocks very slowly, like a huge tank, but it\'s a tiny potion.', ['Increase stiffness', 'Increase damping', 'Increase the kick'], 'Stiffness sets how fast it oscillates: small containers = stiffer.', { level: 2 }),
        q('In Unreal the slosh is absurdly strong even with the same numbers as the Unity version.', ['Unreal uses centimetres: accelerations are 100× bigger, so shrink the kick', 'Unreal is Y-up', 'Unreal has no Tick'], 'Same physics, different units.', { level: 2 }),
        q('Spinning the bottle on the spot doesn\'t slosh at all.', ['Expected with position-only input — add angular velocity to the kick', 'Damping is too low', 'The fill is too high'], 'The pivot doesn\'t move when spinning in place, so position-based acceleration is 0.', { level: 3 }),
        tf('The wobble spring runs once per pixel in the fragment shader.', false, 'It runs once per frame per bottle in a script on the CPU. The shader only receives the result.'),
        tf('A shader can\'t compute the bottle\'s acceleration on its own because it has no memory of previous frames.', true, 'Each frame starts from scratch — history lives in the script.'),
        tf('In the semi-implicit Euler step, the velocity is updated before the position.', true, 'tiltVel += force·dt first, then tilt += tiltVel·dt. It\'s more stable for springs.', 2),
        tf('Moving the bottle at a constant speed should slosh the liquid continuously.', false, 'Only acceleration (speeding up, slowing down, turning) sloshes.', 2),
      ],
    },
    {
      id: 'phys-who', title: 'Script or shader?', engine: 'buckets', rounds: 2,
      blurb: 'Which side of the CPU/GPU split does this job?',
      gen: () => ({
        prompt: 'Who does this job?',
        sub: 'Script = once per frame per bottle, has memory. Shader = per vertex/pixel, no memory.',
        buckets: ['🧠 Script (CPU)', '🖥️ Shader (GPU)'],
        count: 10,
        items: [
          { text: 'Remember where the bottle was last frame', bucket: 0 },
          { text: 'Compute the bottle\'s acceleration', bucket: 0 },
          { text: 'Update the spring (tilt, tiltVel)', bucket: 0 },
          { text: 'Clamp dt after a hitch', bucket: 0 },
          { text: 'Set the WobbleX material parameter', bucket: 0 },
          { text: 'Compute each vertex\'s height above the sloped surface', bucket: 1 },
          { text: 'Discard pixels above the surface', bucket: 1 },
          { text: 'Paint back faces as the liquid top', bucket: 1 },
          { text: 'Animate ripples with uTime', bucket: 1, why: 'A pattern per pixel — no memory needed, just time.' },
          { text: 'Reset the simulation when the bottle teleports', bucket: 0 },
          { text: 'Shrink the liquid inside the glass along its normals', bucket: 1, why: 'Vertex shader.' },
          { text: 'Decide that bottles far away stop simulating', bucket: 0 },
        ],
      }),
    },
  ],
};

// ================================================================ ⑤ IN UNREAL (add-on)
/** A material node box. kind: 'node' | 'param' | 'pin' */
const nd = (name, kind = 'node', sub = '') => {
  const st = {
    node: 'border:1px solid var(--line);background:var(--bg3)',
    param: 'border:1px solid #7c6cff;background:rgba(124,108,255,.15)',
    pin: 'border:1px solid #3ddc97;background:rgba(61,220,151,.12)',
  }[kind];
  return `<span style="display:inline-block;${st};border-radius:8px;padding:3px 8px;margin:2px 0;font-size:13px;line-height:1.3;vertical-align:middle"><b>${name}</b>${sub ? `<br><span class="small dim">${sub}</span>` : ''}</span>`;
};
const AR = ' <span style="color:var(--accent2);font-weight:700">→</span> ';
const chain = (...parts) => `<div style="margin:8px 0;line-height:2.2">${parts.join(AR)}</div>`;
const legend = `<p class="small dim">${nd('Node')} built-in node · ${nd('Param', 'param')} parameter you create · ${nd('Pin', 'pin')} material output pin</p>`;
const table = (rows, head) => `<table class="small" style="width:100%;border-collapse:collapse;margin:8px 0">${head ? `<tr>${head.map((x) => `<th style="text-align:left;border-bottom:1px solid var(--line);padding:4px">${x}</th>`).join('')}</tr>` : ''}${rows.map((r) => `<tr>${r.map((x) => `<td style="border-bottom:1px solid var(--line);padding:4px;vertical-align:top">${x}</td>`).join('')}</tr>`).join('')}</table>`;

// GLSL idea → Unreal equivalent (used by slides AND the matching game)
const UE_MAP = [
  { g: 'worldPos (world position)', u: 'Absolute World Position', why: 'The world position of the vertex/pixel, in centimetres.' },
  { g: 'pivot (object origin in the world)', u: 'Object Position', why: 'Where the object sits in the world.' },
  { g: 'rel.y — the UP component', u: 'Component Mask (B)', why: 'Unreal is Z-up: B is the Z channel.' },
  { g: 'uniform float uFill', u: 'Scalar Parameter "Fill"', why: 'A number artists and Blueprints can change.' },
  { g: 'discard', u: 'Opacity Mask + Blend Mode: Masked', why: 'Masked mode clips pixels whose mask is below the clip value.' },
  { g: 'gl_FrontFacing', u: 'TwoSidedSign', why: '+1 on front faces, −1 on back faces.' },
  { g: 'Cull Off (draw back faces)', u: 'Two Sided ✓ (material Details)', why: 'Without it the back faces — our fake surface — are never drawn.' },
  { g: 'varying computed in the vertex shader', u: 'VertexInterpolator', why: 'Everything plugged into it runs per vertex and is interpolated to pixels.' },
  { g: 'pos += offset (move vertices)', u: 'World Position Offset pin', why: 'The vertex-shader output: an offset added to each vertex.' },
  { g: 'normal (per-vertex)', u: 'VertexNormalWS', why: 'The vertex normal in world space.' },
  { g: 'mix(a, b, t)', u: 'Lerp', why: 'Same function, HLSL/Unreal name.' },
  { g: 'material.setFloat("WobbleX", v) from script', u: 'Set Scalar Parameter Value (Dynamic Material Instance)', why: 'The Blueprint node that changes a parameter at runtime.' },
  { g: 'per-instance value without new materials', u: 'Set Custom Primitive Data Float', why: 'Stores the value on the component; the parameter reads it with "Use Custom Primitive Data".' },
  { g: 'pow(1 − N·V, k) rim', u: 'Fresnel', why: 'Built-in rim term (Exponent input).' },
];

const BP_TICK = `Event Tick (Delta Seconds)
 │
 ├─ dt  = Min(Delta Seconds, 0.033)
 ├─ Loc = Liquid ▸ Get World Location
 ├─ Vel = (Loc − LastLoc) / dt              ← Vector − Vector, Vector / Float
 ├─ Acc = (Vel − LastVel) / dt
 ├─ Set LastLoc = Loc ; Set LastVel = Vel
 │
 ├─ ForceX = −Stiffness·TiltX − Damping·TiltVelX − Kick·Acc.X
 ├─ ForceY = −Stiffness·TiltY − Damping·TiltVelY − Kick·Acc.Y   (Y, not Z!)
 ├─ TiltVelX += ForceX·dt ;  TiltX = Clamp(TiltX + TiltVelX·dt, −MaxTilt, MaxTilt)
 ├─ TiltVelY += ForceY·dt ;  TiltY = Clamp(TiltY + TiltVelY·dt, −MaxTilt, MaxTilt)
 │
 ├─ LiquidMID ▸ Set Scalar Parameter Value ("WobbleX", TiltX)
 └─ LiquidMID ▸ Set Scalar Parameter Value ("WobbleY", TiltY)`;

const ueConcept = {
  id: 'effects.liquid-unreal',
  title: 'Bottled liquid ⑤: building it in Unreal',
  blurb: 'The same recipe as Unreal material nodes and a Blueprint: Masked, Two Sided, TwoSidedSign, VertexInterpolator, a Tick graph.',
  lesson: [
    {
      title: 'The plan in Unreal',
      body: `<p>Everything from parts ①–④ maps one-to-one onto Unreal Engine. Two pieces:</p>
<ul><li><b>A material</b> (the shader): fill line, fake surface, wobble plane.</li>
<li><b>A Blueprint</b> (the script): measures the bottle and sets the wobble parameters every Tick.</li></ul>
<div class="note">⚠️ Two Unreal habits to remember all along:<br>• <b>Z is up</b> (not Y). Heights use the <b>Z / B</b> channel, and the slosh uses X and <b>Y</b>.<br>• Units are <b>centimetres</b>: positions are ~100× bigger than in metres.</div>
<p>Here's the translation table we'll use (shader idea → Unreal):</p>${table(UE_MAP.slice(0, 10).map((r) => [`<code>${r.g}</code>`, `<b>${r.u}</b>`]), ['Shader idea', 'Unreal'])}`,
      after: steps('In Unreal', ['Material settings', 'Relative height nodes', 'Fill + wobble plane → Opacity Mask', 'Vertex side: VertexInterpolator & World Position Offset', 'Fake surface with TwoSidedSign', 'Blueprint: dynamic material + Tick', 'Glass on a second mesh']),
    },
    {
      title: 'Step 1: material settings',
      body: `<p>Create a material <b>M_Liquid</b>. In its <b>Details</b> panel:</p>
${table([
    ['<b>Material Domain</b>', 'Surface', 'a normal mesh material'],
    ['<b>Blend Mode</b>', '<b>Masked</b>', 'unlocks the <b>Opacity Mask</b> pin, which is our <code>discard</code>. Masked renders like opaque: cheap, sorts correctly, casts shadows.'],
    ['<b>Two Sided</b>', '✓ <b>on</b>', 'draws back faces = the fake surface (part ②)'],
    ['<b>Shading Model</b>', 'Default Lit (or Unlit)', 'Unlit + Emissive is great for a stylised, TFT-like drink'],
    ['<b>Opacity Mask Clip Value</b>', '0.3333 (default)', 'pixels whose mask is below this are clipped; our mask is 0 or 1, so any value in between works'],
  ], ['Setting', 'Value', 'Why'])}`,
      after: '<div class="tip">Why not <b>Translucent</b>? Translucent materials don\'t write depth and sort per object. The liquid should be solid and sorted correctly, so it\'s Masked. Only the <b>glass</b> is translucent (step 7).</div>',
    },
    {
      title: 'Step 2: height relative to the bottle',
      body: `<p>Same as part ①: world position minus the object's position, then keep the <b>up</b> component. In Unreal that's <b>Z = the B channel</b>.</p>${legend}
${chain(nd('Absolute World Position'), nd('Subtract', 'node', 'A − B'), '<b>Rel</b> <span class="small dim">(vector, cm)</span>')}
<p class="small" style="margin-top:-4px">…with ${nd('Object Position')} plugged into the Subtract's <b>B</b> pin.</p>
${chain('<b>Rel</b>', nd('Component Mask', 'node', 'R only'), '<b>Rel.X</b>')}
${chain('<b>Rel</b>', nd('Component Mask', 'node', 'G only'), '<b>Rel.Y</b>')}
${chain('<b>Rel</b>', nd('Component Mask', 'node', 'B only'), '<b>Rel.Z</b> <span class="small dim">= height ⬆</span>')}`,
      code: `// the same thing in shader code (cm)
float3 rel = AbsoluteWorldPosition - ObjectPosition;
// Z is up in Unreal!
float height = rel.z;`,
      after: '<div class="tip">Tidy graphs: put this in a <b>Named Reroute</b> called "Rel", or collapse the whole liquid setup into a <b>Material Function</b> (MF_LiquidMask) you can reuse on every bottle.</div>',
    },
    {
      title: 'Step 3: fill + wobble → Opacity Mask',
      body: `<p>Create three <b>Scalar Parameters</b>: ${nd('Fill', 'param', 'cm above the pivot')} ${nd('WobbleX', 'param')} ${nd('WobbleY', 'param')}. Then build the plane from part ③:</p>
${chain(nd('Rel.X'), nd('Multiply', 'node', '× WobbleX'))}
${chain(nd('Rel.Y'), nd('Multiply', 'node', '× WobbleY'))}
${chain('both + ' + nd('Fill', 'param'), nd('Add', 'node', '(two Adds)'), '<b>Surface</b>')}
${chain(nd('Rel.Z'), nd('Subtract', 'node', '− Surface'), '<b>Above</b>')}
<p>Finally turn "above" into a 0/1 mask with an <b>If</b> node: A = Above, B = 0.</p>
${chain('<b>Above</b>', nd('If', 'node', 'A&gt;B → 0 · A==B → 1 · A&lt;B → 1'), nd('Opacity Mask', 'pin'))}`,
      code: `// the same graph as code
float surface = Fill + rel.x * WobbleX + rel.y * WobbleY;
float above   = rel.z - surface;
OpacityMask   = above > 0 ? 0 : 1;     // the If node = our discard`,
      after: '<div class="tip">Artist-friendly fill: make the parameter <b>Fill01</b> (0–1) and remap it with ' + nd('Lerp') + ' between the bottle\'s bottom and top heights (e.g. ± half of the <b>Object Bounds</b> height), as in part ①.</div>',
    },
    {
      title: 'Step 4: the vertex side',
      body: `<p>Unreal hides the vertex shader, but you control it in two places:</p>
<p><b>a) VertexInterpolator: compute the plane per vertex.</b> Plug <b>Above</b> into a ${nd('VertexInterpolator')} node's <b>VS</b> input and use its <b>PS</b> output for the If node. Everything <i>before</i> the interpolator now runs per vertex, exactly like <code>vAbove</code> in part ③ (it's linear, so the result is identical). Keep curvy things like ripples <i>after</i> it, per pixel.</p>
${chain('<b>Above</b>', nd('VertexInterpolator', 'node', 'VS in · PS out'), nd('Add', 'node', '+ ripple (per pixel)'), nd('If'), nd('Opacity Mask', 'pin'))}
<p><b>b) World Position Offset: move vertices.</b> Push the liquid <b>inwards</b> so it sits inside the glass (part ⑥), or squash it like jelly:</p>
${chain(nd('VertexNormalWS'), nd('Multiply', 'node', '× −Thickness'), nd('World Position Offset', 'pin'))}`,
      code: `// roughly what Unreal generates:
// ── vertex 📐 (per vertex)
Interp0 = rel.z - surface;
WPO = VertexNormalWS * -Thickness;
// ── pixel 🎨 (interpolated + detail)
float above = Interp0 + ripple;`,
      after: '<div class="tip">World Position Offset is an <b>offset</b> (added to the vertex position), not a new position. The Absolute World Position seen by the pixel shader already includes it.</div>',
    },
    {
      title: 'Step 5: the fake surface',
      body: `<p>${nd('TwoSidedSign')} is <b>+1</b> on front faces and <b>−1</b> on back faces. Remap it to 0/1 and use it to pick a colour:</p>
${chain(nd('TwoSidedSign'), nd('Multiply', 'node', '× 0.5'), nd('Add', 'node', '+ 0.5'), '<b>IsFront</b> <span class="small dim">(1 front, 0 back)</span>')}
${chain(nd('SurfaceColor', 'param'), nd('Lerp', 'node', 'A = surface · B = liquid · Alpha = IsFront'), nd('Base Color', 'pin'))}
<p><b>Surface normal:</b> uncheck <b>Tangent Space Normal</b> in the material Details so the Normal pin takes a <b>world-space</b> vector. Then Lerp between the tilted "up" vector and the mesh normal:</p>
${chain(nd('(−WobbleX, −WobbleY, 1)', 'node', 'Append + Normalize'), nd('Lerp', 'node', 'B = VertexNormalWS · Alpha = IsFront'), nd('Normal', 'pin'))}`,
      after: '<div class="tip">Two-sided materials flip normals on back faces for lighting. If the surface lights the wrong way round in your setup, multiply its normal by TwoSidedSign. For stylised drinks, the simplest robust option is to put the surface colour in <b>Emissive</b> (or go Unlit) and skip lighting it.</div>',
    },
    {
      title: 'Step 6: Blueprint — a material you can change',
      body: `<p>Make an Actor Blueprint <b>BP_Bottle</b> with a Static Mesh component <b>Liquid</b> (material M_Liquid). Parameters on the material asset are shared by every bottle, so each bottle needs <b>its own</b> copy to change at runtime:</p>
<p><b>Event BeginPlay</b>:</p>
<pre class="code">Create Dynamic Material Instance
   Target: Liquid   Element Index: 0   Source: M_Liquid
   → Promote to variable  LiquidMID
Set LastLoc = Liquid ▸ Get World Location
Set LastVel = (0, 0, 0)</pre>
<p><b>Variables</b> (Float unless noted): TiltX, TiltY, TiltVelX, TiltVelY, LastLoc (Vector), LastVel (Vector), and <b>Instance Editable</b> tuning values Stiffness (~90), Damping (~3), Kick (~0.006, since cm!), MaxTilt (~0.6).</p>`,
      after: `<div class="tip"><b>Many bottles?</b> Skip dynamic instances: in the material, select the WobbleX parameter and tick <b>Use Custom Primitive Data</b> (index 0; WobbleY → index 1). In the Blueprint, call <b>Set Custom Primitive Data Float</b> on the Liquid component instead. The value lives on the component, all bottles share one material, and they still batch nicely.</div>`,
    },
    {
      title: 'Step 7: Blueprint — the Tick graph',
      body: `<p>This is the loop from part ④, as Blueprint nodes. Each line is a small group of nodes (math nodes, Get/Set variable):</p>`,
      code: BP_TICK,
      after: `<ul class="small">
<li>The kick uses <b>Acc.X and Acc.Y</b> (horizontal in Unreal). Acc.Z is up and down, which doesn't tilt a surface.</li>
<li>If the bottle <b>simulates physics</b>, replace the position maths with <b>Get Physics Linear Velocity</b>.</li>
<li>For a bottle held in a VR hand (Half-Life: Alyx style), the component's world location already follows the hand, so nothing changes.</li>
<li>When it settles (tilt and tilt velocity both tiny), you can <b>Set Actor Tick Enabled</b> false until it moves again.</li></ul>
<div class="tip"><b>Glass:</b> add a second Static Mesh component <b>Glass</b> with the same mesh and a <b>Translucent</b> material (Opacity ≈ ${nd('Fresnel')} × 0.6 + 0.05, plus a bright specular). Shrink the liquid with World Position Offset (step 4) so it never pokes through. Translucency draws after Masked, so the glass lands on top.</div>` + series(4),
    },
  ],
  games: [
    {
      id: 'ue-node', title: 'Shader idea → Unreal', engine: 'mcq', rounds: 8,
      blurb: 'Translate between shader code and Unreal nodes/settings.',
      gen: (rng, level) => {
        const pool = level === 1 ? UE_MAP.slice(0, 10) : UE_MAP;
        const ans = rng.pick(pool);
        const toUE = level === 1 || rng.chance(0.6);
        const opts = distinct(rng, ans, () => rng.pick(UE_MAP), 4, (x) => x.u);
        return toUE
          ? { prompt: `In Unreal, what does <code>${ans.g}</code> become?`, options: opts.map((x) => x.u), explain: `<p><b>${ans.u}</b>: ${ans.why}</p>` }
          : { prompt: `Which shader idea is the Unreal <b>${ans.u}</b>?`, options: opts.map((x) => ({ code: x.g })), explain: `<p>${ans.why}</p>` };
      },
    },
    {
      id: 'ue-where', title: 'Where does it go?', engine: 'buckets', rounds: 2,
      blurb: 'Material graph, material settings, or Blueprint?',
      gen: () => ({
        prompt: 'Where do you set this up in Unreal?',
        buckets: ['🎨 Material graph', '⚙️ Material Details', '🧠 Blueprint'],
        count: 10,
        items: [
          { text: 'Absolute World Position − Object Position', bucket: 0 },
          { text: 'Blend Mode: Masked', bucket: 1 },
          { text: 'Two Sided ✓', bucket: 1 },
          { text: 'Create Dynamic Material Instance', bucket: 2 },
          { text: 'TwoSidedSign → Lerp → Base Color', bucket: 0 },
          { text: 'Set Scalar Parameter Value "WobbleX"', bucket: 2 },
          { text: 'If node → Opacity Mask', bucket: 0 },
          { text: 'Tangent Space Normal unchecked', bucket: 1 },
          { text: '(Loc − LastLoc) / dt', bucket: 2 },
          { text: 'VertexInterpolator', bucket: 0 },
          { text: 'Clamp the tilt to MaxTilt', bucket: 2 },
          { text: 'VertexNormalWS × −Thickness → World Position Offset', bucket: 0 },
          { text: 'Opacity Mask Clip Value', bucket: 1 },
          { text: 'Set Custom Primitive Data Float', bucket: 2 },
        ],
      }),
    },
    {
      id: 'ue-order', title: 'Wire it up', engine: 'order', rounds: 3,
      blurb: 'Order the material nodes or the Blueprint steps.',
      gen: (rng, level) => rng.pick([
        { prompt: 'Order the material node chain, from position to output:', items: ['Absolute World Position − Object Position', 'Component Mask (B) → height', 'Subtract the surface (Fill + Rel.X·WobbleX + Rel.Y·WobbleY)', 'If (above > 0 → 0, else 1)', 'Opacity Mask pin'], explain: 'Relative position → height → above the surface → 0/1 mask → output.' },
        { prompt: 'Order the Blueprint setup:', items: ['Event BeginPlay', 'Create Dynamic Material Instance on the Liquid component', 'Promote it to a variable (LiquidMID)', 'Event Tick: measure velocity & acceleration', 'Update the spring', 'Set Scalar Parameter Value on LiquidMID'], explain: 'Create the per-bottle material once, then update it every Tick.' },
        ...(level >= 2 ? [{ prompt: 'Order the Tick graph:', items: ['dt = Min(Delta Seconds, 0.033)', 'Vel = (Loc − LastLoc) / dt', 'Acc = (Vel − LastVel) / dt', 'Force = −Stiffness·Tilt − Damping·TiltVel − Kick·Acc', 'TiltVel += Force·dt, then Tilt += TiltVel·dt', 'Set Scalar Parameter Value (WobbleX / WobbleY)'], explain: 'Same order as the engine-agnostic loop in part ④.' }] : []),
      ]),
    },
    {
      id: 'ue-doctor', title: 'Unreal liquid doctor', engine: 'mcq', rounds: 7,
      blurb: 'Common Unreal mistakes with the liquid material.',
      questions: [
        q('The Opacity Mask pin is greyed out.', ['Set Blend Mode to Masked', 'Enable Two Sided', 'Use a Dynamic Material Instance'], 'Opacity Mask only exists in Masked (and Opacity in Translucent).'),
        q('You can see through the liquid from above: there\'s no top surface.', ['Tick Two Sided in the material', 'Use Translucent', 'Raise the clip value'], 'The fake surface is made of back faces.'),
        q('The liquid line runs vertically down the side of the bottle.', ['You masked G (Y). Unreal is Z-up: mask B', 'Use Object Position twice', 'Turn off Two Sided'], 'Height = Z = the B channel.'),
        q('Setting WobbleX in the Blueprint changes every bottle in the level at once.', ['Each bottle needs its own Dynamic Material Instance (or Custom Primitive Data)', 'Use Event BeginPlay instead of Tick', 'Uncheck Two Sided'], 'Changing the base material/asset parameter affects every user of it.'),
        q('Set Scalar Parameter Value is called but nothing changes.', ['The parameter name doesn\'t match exactly, or the MID was never assigned to the mesh', 'The Tick is too fast', 'Opacity Mask Clip Value is wrong'], 'Create Dynamic Material Instance with a Target assigns it; names must match the material parameter.'),
        q('With the same numbers as a Unity tutorial, the liquid slosh is insanely strong.', ['Unreal works in cm: scale the kick down ~100×', 'Use Translucent', 'Remove the damping'], 'Accelerations measured in cm/s² are 100× bigger.', { level: 2 }),
        q('Ripples added BEFORE the VertexInterpolator look jagged.', ['Move curvy maths after the interpolator (per pixel)', 'Increase the clip value', 'Use World Position Offset'], 'Only linear maths survives per-vertex interpolation unchanged.', { level: 2 }),
        q('The glass hides parts of the liquid at random (flickering).', ['Liquid and glass are at the same depth: shrink the liquid with World Position Offset', 'Make the glass Masked', 'Disable Tick'], 'Same depth = z-fighting. Push the liquid in along its normal.', { level: 3 }),
        tf('In Unreal, the TwoSidedSign node is −1 on back faces.', true, '+1 front, −1 back.'),
        tf('Masked materials are sorted like translucent ones and don\'t write depth.', false, 'Masked behaves like opaque: it writes depth and sorts correctly. That\'s why the liquid uses it.'),
        tf('Custom Primitive Data lets many bottles share one material while each has its own wobble values.', true, 'The values are stored on each component.', 2),
      ],
    },
  ],
};

// ================================================================ ⑥ POLISH
const POL_STEPS = [
  '<b>Glass shell</b>: same mesh drawn again, fresnel + highlight. The liquid is pushed <b>in</b> along its normals 📐',
  '<b>Colour</b>: darker at the bottom, brighter rim 🎨',
  '<b>Foam line</b>: a band just under the surface 🎨',
  '<b>Bubbles</b>: dots rising in world space 🎨',
  '<b>Boba pearls</b>: dark blobs settled at the bottom 🎨',
  '<b>Jelly squash</b>: the container bounces 📐 (spring from the script)',
];
const FULL_VERT = `// ===== LIQUID — vertex shader 📐 =====
uniform mat4  uModel, uView, uProj;
uniform float uFill;        // surface height above the pivot
uniform vec2  uWobble;      // surface slope (x, z) — from the script
uniform float uThickness;   // glass thickness
uniform float uSquash;      // jelly bounce — from the script
attribute vec3 position, normal;
varying vec3  vRel;         // world position relative to the pivot
varying float vAbove;       // height above the surface
varying vec3  vNormal, vWorld;

void main() {
  // jelly squash & stretch (keeps volume roughly the same)
  vec3 s = vec3(1.0 - uSquash * 0.5, 1.0 + uSquash, 1.0 - uSquash * 0.5);
  vec3 p = position * s;
  vec3 n = normalize(normal / s);
  p -= n * uThickness;                               // sit inside the glass
  vec3 worldPos = (uModel * vec4(p, 1.0)).xyz;
  vec3 pivot    = (uModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vRel = worldPos - pivot;                           // part ①
  float surface = uFill + uWobble.x * vRel.x + uWobble.y * vRel.z;   // part ③
  vAbove  = vRel.y - surface;                        // linear → per vertex
  vWorld  = worldPos;
  vNormal = (uModel * vec4(n, 0.0)).xyz;
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}`;
const FULL_FRAG = `// ===== LIQUID — fragment shader 🎨 =====
void main() {
  float above = vAbove + uRipple * sin(vRel.x * 7.0 - uTime * 4.0);  // ripples (per pixel)
  if (above > 0.0) discard;                                    // part ①
  vec3 N = normalize(vNormal), V = normalize(uCamPos - vWorld);
  vec3 col;
  if (gl_FrontFacing) {                                        // part ② — the side
    float h = clamp(vRel.y / uHeight + 0.5, 0.0, 1.0);
    col  = mix(uDeepColour, uLiquidColour, h) * (0.3 + 0.7 * max(dot(N, L), 0.0));
    col += uLiquidColour * uRim * pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float b = voronoi(vec2(dot(vRel.xz, uCamRight), vRel.y - uTime * 0.35) * 3.5);
    col += (1.0 - smoothstep(0.06, 0.13, b)) * 0.6;           // bubbles
  } else {                                                     // part ② — the fake top
    vec3 surfN = normalize(vec3(-uWobble.x, 1.0, -uWobble.y)); // part ③
    col = uSurfaceColour * (0.55 + 0.45 * max(dot(surfN, L), 0.0));
  }
  col = mix(col, uFoamColour, smoothstep(-uFoam, -uFoam * 0.5, above));   // foam line
  gl_FragColor = vec4(col, 1.0);
}

// ===== GLASS — second draw of the same mesh (additive, back faces culled) =====
float fr = pow(1.0 - abs(dot(N, V)), 2.5);
float spec = pow(max(dot(N, normalize(L + V)), 0.0), 90.0);
gl_FragColor = vec4(vec3(0.7, 0.85, 1.0) * (0.05 + 0.7 * fr) + spec, 1.0);`;

const BOBA = { liq: LIQ.tea, deep: [0.7, 0.5, 0.35], grad: 0.5, top: [0.98, 0.86, 0.7], foamCol: [1, 0.97, 0.9] };

const polConcept = {
  id: 'effects.liquid-polish',
  title: 'Bottled liquid ⑥: polish — glass, foam, bubbles & boba',
  blurb: 'Turn the cut-open shell into a tasty drink: glass pass, colour gradient, foam line, bubbles, pearls and a jelly bounce.',
  lesson: [
    {
      title: 'From working to delicious',
      body: `<p>The mechanics are done: fill line, fake surface, wobble, physics. What separates a tech demo from the bubble-tea bear is <b>polish</b>: a handful of small, cheap layers.</p>
<p>Toggle the layers below to see how much each one adds. We'll then build them one at a time.</p>`,
      controls: [{ name: 'p', label: 'polish (0 = bare → 1 = full)', min: 0, max: 1, step: 1, value: 1 }],
      shader: (v) => (v.p ? liqSpec({ fill: 0.6, auto: 0.35, rip: 0.02, foam: 0.12, bub: 1, boba: 1, ...BOBA, jelly: 0.12 }) : liqSpec({ fill: 0.6, auto: 0.35, glass: 0, grad: 0, rim: 0, ...BOBA })),
      after: steps('Polish', POL_STEPS),
    },
    {
      title: 'The glass: a second draw',
      body: `<p>Glass is mostly <b>reflections</b>: bright at grazing angles (fresnel) plus a sharp highlight, and nearly invisible face-on. We draw the <b>same mesh a second time</b> with a glass shader, <b>additive</b> (light added on top), back faces culled.</p>
<p>One problem: liquid and glass would sit at <b>exactly the same depth</b>, so the GPU can't decide which is in front and they flicker (z-fighting). The fix is in the <b>vertex shader</b> ${stage('v')}: push the liquid <b>inwards</b> along its normals by the glass thickness.</p>
<pre class="code">pos -= normal * uThickness;   // liquid vertex shader</pre>
<p>Drag the thickness to 0 and watch the speckles.</p>`,
      controls: [{ name: 't', label: 'glass thickness', min: 0, max: 0.15, step: 0.005, value: 0.05 }],
      shader: (v) => liqSpec({ fill: 0.55, thick: v.t, liq: LIQ.green }),
      code: `// glass fragment shader (2nd pass, additive)
float fr   = pow(1.0 - abs(dot(N, V)), 2.5);         // rim
float spec = pow(max(dot(N, normalize(L + V)), 0.0), 90.0);
col = vec3(0.7, 0.85, 1.0) * (0.05 + 0.7 * fr) + spec;`,
      after: steps('Polish', POL_STEPS, 0) + '<div class="tip">In engines the glass is usually a <b>second mesh component</b> with a translucent/additive material, and the liquid uses a slightly smaller mesh or a vertex push like above. Pushing along normals in the vertex shader (Unreal: World Position Offset) means you only need one mesh asset.</div>',
    },
    {
      title: 'Colour: depth gradient + rim',
      body: `<p>Flat colour looks like plastic. Two cheap tricks:</p>
<ul><li><b>Depth gradient</b>: darker towards the bottom, as if light gets absorbed: <code>mix(deep, liquid, height01)</code>.</li>
<li><b>Rim</b>: a brighter edge (fresnel), as if light scatters through the thin liquid near the silhouette: <code>pow(1 − N·V, 3)</code>.</li></ul>`,
      controls: [
        { name: 'g', label: 'depth gradient', min: 0, max: 1, step: 0.01, value: 0.8 },
        { name: 'r', label: 'rim', min: 0, max: 1.5, step: 0.01, value: 0.7 },
      ],
      shader: (v) => liqSpec({ fill: 0.65, grad: v.g, rim: v.r, liq: LIQ.blue }),
      code: (v) => `float h = clamp(vRel.y / 2.6 + 0.5, 0.0, 1.0);        // 0 bottom → 1 top
vec3 c = mix(uDeep, uLiquid, mix(1.0, h, ${f(v.g, 2)}));
col  = c * light;
col += uLiquid * ${f(v.r, 2)} * pow(1.0 - max(dot(N, V), 0.0), 3.0);`,
      after: steps('Polish', POL_STEPS, 1) + '<div class="tip">Note that the gradient uses <code>vRel</code> (world-relative), so the dark part stays at the <b>bottom</b> even when the bottle tilts, just like real settled colour.</div>',
    },
    {
      title: 'Foam / meniscus line',
      body: `<p>Real liquids have a <b>light line</b> where they meet the glass (the meniscus), and drinks have foam. We already know how far below the surface each pixel is: <code>above</code> (negative under the surface). A thin band near 0 is the foam:</p>
<pre class="code">float foam = smoothstep(-width, -width * 0.5, above);
col = mix(col, foamColour, foam);</pre>
<p>It shows on <b>both</b> faces: on the side (a ring around the glass) and on the far edge of the fake surface, so it frames the whole top.</p>`,
      controls: [{ name: 'w', label: 'foam width', min: 0, max: 0.3, step: 0.005, value: 0.12 }],
      shader: (v) => liqSpec({ fill: 0.6, foam: v.w, auto: 0.3, ...BOBA }),
      graph: { fns: (v) => [{ f: (x) => G_smooth(-v.w, -v.w * 0.5, x), label: 'foam amount vs above' }], opts: { xmin: -0.4, xmax: 0.02, ymin: -0.1, ymax: 1.1 } },
      after: steps('Polish', POL_STEPS, 2) + '<div class="tip">This is also the best place to <b>hide the trick\'s seams</b>: a straw or an ice cube that doesn\'t intersect the fake surface correctly disappears under a nice foam ring.</div>',
    },
    {
      title: 'Bubbles rising',
      body: `<p>Fizzy drinks: draw small dots with <code>voronoi</code> (distance to the nearest random point; small = near a dot), and make them <b>rise</b> by subtracting time from the height coordinate (pattern moves up, as in the fire recipe).</p>
<p>Because the coordinates come from <code>vRel</code> (world-relative), the bubbles rise <b>straight up in the world</b>, even when the bottle is tilted.</p>`,
      controls: [{ name: 't', label: 'bottle tilt', min: -0.8, max: 0.8, step: 0.01, value: 0.5 }],
      shader: (v) => liqSpec({ fill: 0.7, bub: 1, tilt: v.t, liq: LIQ.amber, foam: 0.06 }),
      code: `float b = voronoi(vec2(dot(vRel.xz, camRight), vRel.y - uTime * 0.35) * 3.5);
col += (1.0 - smoothstep(0.06, 0.13, b)) * 0.6;   // small bright dots`,
      after: steps('Polish', POL_STEPS, 3) + '<div class="tip">Bubbles here are painted on the <b>side</b> faces (front faces), so they look like bubbles clinging to and rising along the glass. That\'s exactly where you see them in a real glass.</div>',
    },
    {
      title: 'Bubble tea: the pearls',
      body: `<p>The bubble-tea look: milky tea, a cream-coloured top, and dark <b>tapioca pearls</b> sitting at the bottom.</p>
<p>Same voronoi trick with bigger cells and a sharper edge (round blobs), masked to the <b>bottom</b> of the liquid with <code>vRel.y</code>. A light spot in each pearl's centre makes them glossy.</p>`,
      controls: [{ name: 'fr', label: 'fill', min: 0.2, max: 0.95, step: 0.01, value: 0.75 }],
      shader: (v) => liqSpec({ fill: v.fr, boba: 1, foam: 0.1, auto: 0.3, ...BOBA }),
      code: `float pb = voronoi(vec2(dot(vRel.xz, camRight), vRel.y) * 2.4);
// round blobs…
float pearl = 1.0 - smoothstep(0.3, 0.36, pb);
// …only near the bottom
pearl *= 1.0 - smoothstep(-0.45, -0.1, vRel.y);
// almost black, with a glossy centre spot
vec3 pearlCol = vec3(0.07, 0.035, 0.03)
              + 0.55 * (1.0 - smoothstep(0.03, 0.11, pb));
col = mix(col, pearlCol, pearl);`,
      after: steps('Polish', POL_STEPS, 4) + '<div class="tip">Want pearls that actually tumble? Use small real meshes (or particles) inside, driven by the same wobble numbers. Keep them under the foam line so the fake-surface depth problem stays hidden.</div>',
    },
    {
      title: 'Jelly squash (vertex)',
      body: `<p>A cute container (a bear, a slime, a potion with personality) should <b>bounce</b> when it lands or gets shaken. That's another <b>vertex shader</b> ${stage('v')} job: stretch it up and squeeze it sideways (or the opposite), keeping roughly the same volume:</p>
<pre class="code">vec3 s = vec3(1.0 - squash * 0.5, 1.0 + squash, 1.0 - squash * 0.5);
pos *= s;
normal = normalize(normal / s);   // keep lighting correct</pre>
<p><code>squash</code> comes from <b>a second spring in the script</b> ${stage('c')}, kicked by <b>vertical</b> acceleration (landing, jumping), exactly like the wobble spring. Here it's faked with a decaying sine on a loop.</p>`,
      controls: [{ name: 'j', label: 'bounce strength', min: 0, max: 0.3, step: 0.01, value: 0.15 }],
      shader: (v) => liqSpec({ fill: 0.6, jelly: v.j, boba: 1, foam: 0.1, ...BOBA }),
      after: steps('Polish', POL_STEPS, 5) + '<div class="tip">Why <code>normal / s</code>? When you stretch a shape, its normals must be squashed the <i>opposite</i> way to stay perpendicular to the surface (it\'s the inverse-transpose rule, simplified for a pure scale).</div>',
      quiz: { q: 'squash = 0.2. How tall (y scale) and how wide (x scale) is the container?', options: ['1.2 tall, 0.9 wide', '0.8 tall, 1.1 wide', '1.2 tall, 1.2 wide'], answer: 0, explain: 'y: 1 + 0.2 = 1.2. x: 1 − 0.2 × 0.5 = 0.9. Taller and thinner, roughly the same volume.' },
    },
    {
      title: 'All together',
      body: `<p>The full recipe, everything from parts ①–⑥. Below are the complete vertex and fragment shaders, written as you'd write them in a real engine (shown as plain GLSL).</p>`,
      controls: [
        { name: 'fr', label: 'fill', min: 0.2, max: 0.95, step: 0.01, value: 0.7 },
        { name: 'k', label: 'drink: 0 bubble tea · 1 potion · 2 soda', min: 0, max: 2, step: 1, value: 0 },
      ],
      shader: (v) => liqSpec([
        { fill: v.fr, auto: 0.35, rip: 0.02, foam: 0.1, boba: 1, jelly: 0.1, ...BOBA },
        { fill: v.fr, auto: 0.45, rip: 0.025, foam: 0.05, rim: 0.9, liq: [0.75, 0.3, 1], deep: [0.25, 0.05, 0.45] },
        { fill: v.fr, auto: 0.3, rip: 0.02, foam: 0.07, bub: 1, liq: LIQ.amber },
      ][v.k]),
      code: FULL_VERT + '\n\n' + FULL_FRAG,
      after: steps('Polish', POL_STEPS) + series(5, 'Bottled liquid — complete ✅'),
    },
  ],
  games: [
    {
      id: 'pol-missing', title: 'What\'s missing?', engine: 'mcq', rounds: 6,
      blurb: 'One polish layer was removed. Which one?',
      gen: (rng, level) => {
        const full = { fill: 0.65, foam: 0.12, bub: 1, boba: 1, grad: 0.7, rim: 0.6, ...BOBA, liq: BOBA.liq };
        const L = [
          { name: 'Glass shell', off: { glass: 0 }, why: 'No fresnel rim or highlight around the empty part: the top half of the bottle is invisible.' },
          { name: 'Foam line', off: { foam: 0 }, why: 'No light ring where the liquid meets the glass.' },
          { name: 'Bubbles', off: { bub: 0 }, why: 'No small bright dots on the side.' },
          { name: 'Boba pearls', off: { boba: 0 }, why: 'No dark blobs at the bottom.' },
          { name: 'Fake surface', off: { face: 0 }, why: 'The top looks like the inside of a bowl: back faces are shaded like walls.', lvl: 2 },
          { name: 'Depth gradient', off: { grad: 0 }, why: 'The liquid is the same brightness at the top and bottom.', lvl: 2 },
          { name: 'Glass thickness push', off: { thick: 0 }, why: 'Liquid and glass at the same depth: speckled z-fighting.', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const ans = rng.pick(L);
        const opts = distinct(rng, ans, () => rng.pick(L), Math.min(4, L.length), (x) => x.name);
        return {
          prompt: 'Left: the full drink. Right: one layer is missing. Which?',
          shaders: [{ spec: liqSpec(full), label: 'full' }, { spec: liqSpec({ ...full, ...ans.off }), label: 'missing one' }],
          options: opts.map((x) => x.name),
          explain: `<p><b>${ans.name}</b>: ${ans.why}</p>`,
        };
      },
    },
    {
      id: 'pol-tune', title: 'Match the drink', engine: 'slider', rounds: 4,
      blurb: 'Match foam width, depth gradient and rim.',
      gen: (rng, level) => {
        const t = { w: rng.step(0.04, 0.24, 0.02), g: rng.step(0, 1, 0.1), r: rng.step(0, 1.2, 0.1) };
        const params = [{ name: 'w', label: 'foam width', min: 0, max: 0.3, step: 0.005, target: t.w }];
        if (level >= 2) params.push({ name: 'g', label: 'depth gradient', min: 0, max: 1, step: 0.01, target: t.g });
        if (level === 3) params.push({ name: 'r', label: 'rim', min: 0, max: 1.5, step: 0.01, target: t.r });
        const liq = rng.pick([LIQ.blue, LIQ.red, LIQ.green]);
        const P = (p) => ({ fill: 0.6, foam: p.w, grad: level >= 2 ? p.g : 0.7, rim: level === 3 ? p.r : 0.5, liq });
        return {
          prompt: 'Make your drink look like the target.',
          sub: 'Foam: the light band. Gradient: dark bottom. Rim: bright silhouette.',
          params,
          build: (p) => liqSpec(P(p)),
          code: (p) => `foam = smoothstep(-${f(p.w, 3)}, -${f(p.w / 2, 3)}, above);${level >= 2 ? `\nc = mix(deep, liquid, mix(1.0, h, ${f(P(p).grad, 2)}));` : ''}${level === 3 ? `\ncol += liquid * ${f(P(p).rim, 2)} * pow(1.0 - dot(N, V), 3.0);` : ''}`,
          tolerance: 0.06,
          explain: '<p>Foam width = thickness of the light band at the surface. Gradient = how much darker the bottom gets. Rim = how bright the edges are.</p>',
        };
      },
    },
    {
      id: 'pol-fill', title: 'Fix the polish', engine: 'codefill', rounds: 4,
      blurb: 'Complete the foam band, the bubble direction or the pearl mask.',
      gen: (rng, level) => {
        const V = [
          {
            tpl: 'col = mix(col, uFoamCol, smoothstep(-uFoam, -uFoam * 0.5, [[0]]));',
            slots: [{ options: ['above', '-above', 'vRel.y'], answer: 'above' }],
            why: 'The foam is a band just <b>below</b> the surface, where <code>above</code> is a small negative number. <code>vRel.y</code> would put the band at the pivot height, not at the surface.',
            spec: (frag) => liqSpec({ fill: 0.6, foam: 0.14, liq: LIQ.blue }), at: 'col = mix(col, uFoamCol, smoothstep(-uFoam, -uFoam * 0.5, above));',
          },
          {
            tpl: '  float bb = voronoi(vec2(vRel.x * 0.88 + vRel.z * 0.48, vRel.y [[0]] uTime * 0.35) * 3.5);',
            slots: [{ options: ['-', '+'], answer: '-' }],
            why: 'Subtracting time from the coordinate moves the pattern <b>up</b> (bubbles rise). Adding makes them sink.',
            spec: () => liqSpec({ fill: 0.7, bub: 1, liq: LIQ.amber }), at: '  float bb = voronoi(vec2(vRel.x * 0.88 + vRel.z * 0.48, vRel.y - uTime * 0.35) * 3.5);',
          },
          {
            tpl: '  float pearl = (1.0 - smoothstep(0.3, 0.36, pb)) * (1.0 - smoothstep(-0.45, -0.1, [[0]])) * uBoba;',
            slots: [{ options: ['vRel.y', 'vAbove', 'vObj.y'], answer: 'vRel.y' }],
            why: 'Pearls settle at the bottom <b>in the world</b>: use the world-relative height. <code>vAbove</code> keeps them just under the surface instead.',
            spec: () => liqSpec({ fill: 0.75, boba: 1, ...BOBA, tilt: 0.5 }), at: '  float pearl = (1.0 - smoothstep(0.3, 0.36, pb)) * (1.0 - smoothstep(-0.45, -0.1, vRel.y)) * uBoba;', lvl: 2,
          },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        const base = vr.spec();
        if (!base.frag.includes(vr.at)) throw new Error('pol-fill template anchor missing');
        return {
          prompt: 'Complete the line so the drink matches the target:',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ ...base, frag: base.frag.replace(vr.at, fill(vr.tpl, vals)) }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'pol-order', title: 'Build the whole drink', engine: 'order', rounds: 3,
      blurb: 'Order the full liquid effect.',
      gen: (rng, level) => rng.pick([
        { prompt: 'Order the liquid fragment shader:', items: ['Add ripples to vAbove', 'Discard if above > 0', 'Front face? → side colour, gradient, rim, bubbles', 'Back face? → flat surface colour with the tilted normal', 'Mix in the foam band near the surface'], explain: 'You must know whether the pixel survives before shading it; foam goes last because it covers both faces.' },
        { prompt: 'Order the liquid vertex shader:', items: ['Squash/stretch the vertex (jelly)', 'Push it in along the normal (glass thickness)', 'Transform to world: worldPos and pivot', 'vRel = worldPos − pivot', 'vAbove = vRel.y − (fill + wob.x·x + wob.y·z)'], explain: 'Shape the mesh first (object space), then go to world, then measure against the surface plane.' },
        ...(level >= 2 ? [{ prompt: 'Order one frame of the whole effect:', items: ['Script: measure the bottle\'s motion', 'Script: update wobble + squash springs', 'Script: send them to the material', 'Liquid pass: vertex → fragment (discard, faces, foam)', 'Glass pass: same mesh, additive fresnel'], explain: 'CPU → GPU; the glass is drawn after the liquid so it adds on top.' }] : []),
      ]),
    },
  ],
};

// smoothstep in JS (for the foam graph)
function G_smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// ================================================================ EXPORT
export const LIQUID_CONCEPTS = [fillConcept, surfConcept, wobConcept, physConcept, ueConcept, polConcept];
