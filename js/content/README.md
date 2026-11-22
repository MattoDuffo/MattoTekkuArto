# Content authoring guide

All learning content lives in `js/content/<topic>.js`. Each file **default-exports one topic**.
`js/content/index.js` lists the files in learning-path order. `foundations.js` is the reference
example — read it first, copy its style.

## Who this is for (tone & pedagogy)

The learner is a tech artist who understands vector maths reasonably but **needs concepts broken
down more than usual**, with more explanation and more time on first contact. So:

* **Small steps.** One idea per slide. 3–6 slides per concept. Short paragraphs.
* **Show, then tell.** Almost every slide should have a live shader, graph or visual, ideally with
  a slider so the learner can *feel* the effect. Show the code next to it, with numbers updating
  live (`code: (v) => ...`).
* **Analogies** (`<div class="analogy">`) for first contact, **notes** (`<div class="note">`)
  for key takeaways, **tips** (`<div class="tip">`) for tech-art/engine context (Unity Shader Graph,
  Unreal material nodes, HLSL names like `lerp`, `frac`, `saturate`).
* **Games give feedback that teaches.** Every `explain` should say *why*, not just the answer.
* Prefer **several games about the same concept from different angles** (read code → pick image,
  look at image → pick code, tune a slider, compute a number, tap a spot, be the GPU…).
* **Difficulty levels 1–3**: generators receive `level`. Level 1 = gentle, very distinct options,
  round numbers. Level 3 = subtle differences, combined concepts.
* **Endless content**: prefer procedural `gen(rng, level)` over fixed question banks, so the
  learner can practise for hours without repeats. Fixed `questions: [...]` banks are fine for
  conceptual true/false etc. (aim for 10+ questions per bank).
* Sessions should take **2–5 minutes**: mcq ≈ 8 rounds, slider/order/paint ≈ 3–4 rounds.

## Topic shape

```js
import { tf, q, distinct, BW, GRAY3, C, f, v, n, nv, G } from './_kit.js';

export default {
  id: 'coords',                // unique, short
  title: 'Coordinates & UVs',
  icon: '📐',
  blurb: 'one line',
  cheatsheet: `<p>html summary, may contain <pre class="code">glsl</pre></p>`,
  concepts: [
    {
      id: 'coords.uv',          // MUST be "<topicId>.<name>", globally unique
      title: 'What is UV?',
      blurb: 'one line',
      lesson: [ /* slides */ ],
      games: [ /* 2–5 games */ ],
    },
  ],
};
```

## Shader specs

Everything visual is a **spec** object rendered by the shared WebGL1 renderer (GLSL ES 1.00):

```js
{
  frag: 'col = vec3(uv.x);',  // fragment BODY. Available: vec2 uv (0..1, origin bottom-left),
                              // vec3 col (output, starts black), float alpha (starts 1),
                              // vec3 N (normal), vec3 P (world pos) for 3D meshes.
  defs: 'float f(float x){ return x*x; }',  // optional top-level helper functions
  vert: 'pos.y += 0.2*sin(pos.x*6.0+uTime);', // optional vertex body; edit vec3 pos, normal, vec2 uv
  mesh: 'quad' | 'sphere' | 'plane' | 'cube' | 'torus',  // default quad (full square, 2D)
  uniforms: { uK: 0.5, uCol: [1, 0, 0] },  // auto-declared: number→float, [a,b]→vec2, [a,b,c]→vec3 …
  textures: { uTex: 'photo' },               // or { uTex: { name:'checker', filter:'nearest'|'linear'|'mipmap', wrap:'repeat'|'clamp'|'mirror' } }
  camera: { yaw: 0.6, pitch: 0.45, dist: 3.2, spin: 0.5 }, // 3D meshes only
  blend: 'alpha' | 'add' | 'multiply' | 'premult',  // draws over a checkerboard so alpha is visible
  bg: [r, g, b],  wire: true,  cull: true,
}
```

* Always available uniforms: `uTime` (seconds), `uRes` (pixels), `uMouse`, `uCamPos` (3D).
* **Prelude helpers** (don't redefine these names!): `PI, TAU, saturate(x), remap(x,a,b,c,d),
  hash(vec2)->float, hash2(vec2)->vec2, vnoise(vec2), gnoise(vec2), fbm(vec2), voronoi(vec2),
  rot(angle)->mat2, sdCircle(p,r), sdBox(p,halfSize), sdSegment(p,a,b),
  sphereNormal(uv)->vec4 (xyz normal of a fake sphere filling the square, w = inside mask),
  hsv2rgb(vec3), luma(vec3), checker(uv, n)->0/1`.
* Built-in textures: `checker, uvgrid, letterF, brick, photo, smiley, noise, gradient, toonramp,
  palette, flipbook (4x4 numbered frames), normalmap, packed (R circles, G stripes, B gradient),
  flowmap, particle (alpha), stripes`.
* **GLSL ES 1.00 gotchas**: floats need a dot (`1.0` not `1`), no implicit int→float, loops need
  constant bounds, no `texture()` (use `texture2D`), `mat3(mat4)` not allowed, `%` doesn't exist
  (use `mod`). Integer literals in function calls like `pow(x, 2)` are errors.
* If `frag` contains `void main(` it's used as a full shader body (you then must write
  `gl_FragColor` and use `vUv` yourself).
* Anything using `uTime` animates automatically.

## Lesson slides

```js
{
  title: 'Short title',
  body: `<p>html</p><div class="note">key point</div>`,
  controls: [{ name: 'k', label: 'k', min: 0, max: 1, step: 0.01, value: 0.5 }],
  shader: (v) => ({ frag: 'col = vec3(step(uK, uv.x));', uniforms: { uK: v.k } }), // or a static spec
  shaders: [{ spec: specOrFn, label: 'html', caption: 'short' }],  // side by side (2 per row)
  code: (v) => `col = vec3(step(${f(v.k)}, uv.x));`,             // or a static string
  graph: { fns: (v) => [{ f: (x) => G.step(v.k, x), label: 'step' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 } },
  visual: (el, v) => { /* any DOM / canvas, re-run on slider change */ },
  after: '<p>html under the demo</p>',
  quiz: { q: 'question', options: ['a', 'b', 'c'], answer: 0, explain: 'why' },
  size: 260, // optional shader size
}
```

Use `<pre class="code">…</pre>` inside html bodies for highlighted code. Use `f(x)` from the kit to
format GLSL float literals (`f(1) → "1.0"`), `v([1,0,0]) → "vec3(1.0, 0.0, 0.0)"`.

## Games

Every game: `{ id, title, engine, blurb, rounds?, gen(rng, level) | questions: [...] }`.
`gen` returns an **item**; a `questions` bank is an array of items (items may have `level`; only
items with `level <= current level` are used). `rng` has `float(a,b) int(a,b) pick(arr) pickN(arr,n)
shuffle(arr) chance(p) sign() step(min,max,step) weighted([{w,v}])`.

Common item media fields (all engines that show a prompt): `prompt` (html), `sub` (html),
`code` (glsl string), `shader` (spec), `shaders: [{spec, label}]`, `graph: {fns, opts}`,
`color: [r,g,b]`, `visual: (el) => {}`, `explain` (html or `(el) => {}`).

| engine | item fields | notes |
|---|---|---|
| `mcq` | `options: [{text}|{code}|{shader}|{color}|{graph}|'str']`, `answer` (index, default 0), `grid`, `noShuffle` | Options shuffled. Use `q(prompt, [correct, ...wrong], explain)` and `tf(statement, bool, explain, level)` from the kit, and `distinct(rng, correct, makeWrong, 4, keyFn)` to build unique distractors. |
| `slider` | `params: [{name,label,min,max,step,target}]`, `build(vals) → spec`, `code?(vals)`, `tolerance` (fraction of range, default 0.05), `compare: 'pixels'` | Target vs yours side by side. Use `compare:'pixels'` when several parameter combos give the same image. |
| `numeric` | `answer: number | number[]`, `tolerance` (abs, default 0.011), `labels`, `wrap: 'vec2'` | On-screen keypad (with minus). Keep answers to ≤ 2 decimals. |
| `order` | `items: ['first', ...] | [{code}]` (correct order) | Tap in sequence. |
| `paint` | `w, h, palette: [{color,label}], solve(u,v,x,y) → index, showUV` | "Be the GPU". Cell centres are at `(x+0.5)/w`. Avoid thresholds that land exactly on a cell centre. |
| `tap` | `shader` or `draw(ctx,w,h)`, `target: [u,v]` / `targets` / `score(u,v)`, `radius` (default 0.06), `reveal` | Tap the spot. |
| `codefill` | `template` with `[[0]] [[1]]` blanks, `slots: [{options, answer}]`, `build(vals) → spec`, `target?`, `exactOnly?`, `noTarget?` | Live preview. Any combo rendering the same image as the target counts as correct. Compile errors are shown on the preview (useful teaching!). |
| `buckets` | `buckets: ['A','B'(,'C')]`, `items: [{text|code|shader|color, bucket, why}]`, `count` | Rapid sorting, cards one by one. 10ish cards. |
| `vector` | `drag: [{v, color, label, unit, snap}]`, `fixed`, `derived(vecs)`, `readout(vecs) → html`, `check(vecs) → 0..1`, `answer`, `R` | Drag arrow tips on a 2D grid in [-R, R]. |
| `custom` | `play(ctx) → Promise<{score, explain}>` | Escape hatch: ctx has `el, rng, level, ui, d2, renderer`. Prefer standard engines. |

The JS mirror of GLSL in `G` (`G.step, G.smoothstep, G.mix, G.fract, G.dot, G.normalize, G.length,
G.reflect, G.clamp, G.hash …`) works component-wise on numbers or arrays, so generators can
compute correct answers with the same formulas the shader uses.

## Validate!

```
node tools/validate.mjs <topicId>     # compiles every shader, runs every generator at levels 1–3
node tools/shot.mjs <outDir> "#/lesson/coords.uv" "#/play/coords.uv/find-uv|click:Start ▶"
```

Fix everything the validator reports. Generators must never throw and must produce distinct options.
