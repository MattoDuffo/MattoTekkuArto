// Topic — Tech-art effect recipes. The LAST topic: every earlier ingredient
// (uv, step/smoothstep/fract/pow/sin, mix, SDFs, patterns, time, vectors,
// fresnel, noise, textures, vertex displacement, blending) combined into the
// effects you actually ship. Each concept = one recipe, built up one ingredient
// per slide, then games that test the ingredients and the assembly.
import { tf, q, distinct, f, n, G } from './_kit.js';

// ---------------------------------------------------------------- shared bits
const CAM = { yaw: 0.5, pitch: 0.3, dist: 3.0 };
const VIEW = 'vec3 V = normalize(uCamPos - P);   // pixel → camera';

/** A "recipe card": list of steps, the current one highlighted, later ones faded. */
const recipe = (title, steps, active = -1) => `<div class="note"><b>🧪 Recipe: ${title}</b><ol style="margin:6px 0 0 0;padding-left:20px">${steps
  .map((s, i) => `<li style="${i === active ? 'font-weight:700;color:var(--accent2)' : active >= 0 && i > active ? 'opacity:.45' : ''}">${s}</li>`)
  .join('')}</ol></div>`;

/** Fill [[i]] blanks of a codefill template */
const fill = (tpl, vals) => tpl.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);

// ================================================================ DISSOLVE
const DIS_STEPS = ['<b>Noise</b> — a smooth random grey value per pixel', '<b>Threshold</b> — hide pixels whose noise is below the amount', '<b>Edge band</b> — find pixels just above the amount', '<b>Glow</b> — colour that band, keep the rest', '<b>Animate</b> — drive the amount over time'];
const DIS_FRAG = `float n = fbm(uv * uScale);
float keep = step(uAmount, n);
float edge = keep - step(uAmount + uWidth, n);
vec3 base = texture2D(uTex, uv).rgb;
col = mix(base, uGlow, edge);
alpha = keep;`;
const disSpec = (p) => ({
  frag: DIS_FRAG,
  uniforms: { uAmount: p.amount, uWidth: p.width, uScale: p.scale ?? 4, uGlow: p.glow || [1, 0.55, 0.1] },
  textures: { uTex: 'photo' }, blend: 'alpha',
});
const disCode = (p) => `float n = fbm(uv * ${f(p.scale ?? 4)});
float keep = step(${f(p.amount, 2)}, n);              // 1 = still visible
float edge = keep - step(${f(p.amount, 2)} + ${f(p.width, 2)}, n);  // thin band
vec3 base = texture2D(uTex, uv).rgb;
col = mix(base, vec3(1.0, 0.55, 0.1), edge);    // band → orange
alpha = keep;                                    // holes → transparent`;
// Animated, soft version (local variable shadows the uniform name on purpose)
const DIS_SOFT = `float amount = 0.5 + 0.42 * sin(uTime * uSpeed);
float n = fbm(uv * 4.0);
float keep = step(amount, n);
float edge = keep * (1.0 - smoothstep(amount, amount + uWidth, n));
vec3 base = texture2D(uTex, uv).rgb;
col = mix(base, vec3(1.0, 0.55, 0.1) * 1.6, edge);
alpha = keep;`;

const dissolve = {
  id: 'effects.dissolve',
  title: 'Dissolve / burn away',
  blurb: 'Noise + a threshold + a glowing band. The classic "burn away" effect.',
  lesson: [
    {
      title: 'Effects are recipes',
      body: `<p>Welcome to the last topic! Every flashy effect you see in games is built from <b>small ingredients you already know</b>: noise, <code>step</code>, <code>smoothstep</code>, <code>mix</code>, <code>fract</code>, fresnel, textures, time…</p>
<div class="analogy">🍳 <b>Analogy:</b> you've learned the ingredients (flour, eggs, sugar). A recipe is just <i>which</i> ingredients, in <i>which order</i>, in <i>what amounts</i>. A cake isn't magic — it's steps.</div>
<p>When you see an effect, ask four questions:</p>
<ul><li><b>Mask</b> — <i>where</i> does it show?</li><li><b>Motion</b> — how does it move? (usually <code>uTime</code>)</li><li><b>Colour</b> — what colour, from what?</li><li><b>Output</b> — how is it drawn? (opaque, alpha, additive…)</li></ul>
<p>Our first recipe: the <b>dissolve</b> (a.k.a. burn-away), used for dying enemies, teleports, burning paper.</p>`,
      shader: { ...disSpec({ amount: 0.5, width: 0.08 }), frag: DIS_SOFT, uniforms: { uSpeed: 0.9, uWidth: 0.08 } },
      after: recipe('Dissolve', DIS_STEPS),
    },
    {
      title: 'Ingredient 1: noise',
      body: `<p>First we need a value per pixel that is <b>random-looking but smooth</b>: noise. <code>fbm()</code> gives a grey value between about 0 and 1.</p>
<div class="analogy">⛰️ Think of the noise as a <b>landscape of hills</b>: bright = high ground, dark = valleys. Neighbouring pixels have similar heights, so the shapes are blobs, not static.</div>
<p>The <b>scale</b> zooms the landscape: bigger number = more, smaller blobs.</p>`,
      controls: [{ name: 's', label: 'noise scale', min: 1, max: 12, step: 0.5, value: 4 }],
      shader: (v) => ({ frag: 'float n = fbm(uv * uScale);\ncol = vec3(n);', uniforms: { uScale: v.s } }),
      code: (v) => `float n = fbm(uv * ${f(v.s, 1)});\ncol = vec3(n);   // just look at the noise`,
      after: recipe('Dissolve', DIS_STEPS, 0),
    },
    {
      title: 'Ingredient 2: the threshold',
      body: `<p>Now <b>flood the landscape</b>. The <b>amount</b> is the water level: every pixel whose noise is <i>below</i> the water disappears.</p>
<p><code>step(amount, n)</code> is 1 when <code>n ≥ amount</code> (above water → keep) and 0 otherwise (under water → hole). We use it as <b>alpha</b>.</p>
<p>Left: the noise with the "water" painted blue. Right: the photo with the holes cut out.</p>`,
      controls: [{ name: 'a', label: 'amount (water level)', min: 0, max: 1, step: 0.01, value: 0.45 }],
      shaders: [
        { spec: (v) => ({ frag: 'float n = fbm(uv * 4.0);\ncol = n < uAmount ? vec3(0.1, 0.25, 0.7) : vec3(n);', uniforms: { uAmount: v.a } }), caption: 'noise + water' },
        { spec: (v) => ({ frag: 'float n = fbm(uv * 4.0);\ncol = texture2D(uTex, uv).rgb;\nalpha = step(uAmount, n);', uniforms: { uAmount: v.a }, textures: { uTex: 'photo' }, blend: 'alpha' }), caption: 'photo, alpha = keep' },
      ],
      code: (v) => `float n = fbm(uv * 4.0);\nfloat keep = step(${f(v.a, 2)}, n);  // 1 above water, 0 below\ncol = texture2D(uTex, uv).rgb;\nalpha = keep;`,
      after: recipe('Dissolve', DIS_STEPS, 1),
      quiz: { q: 'Amount = 0.0. How much of the photo is visible?', options: ['All of it — no noise value is below 0', 'None of it', 'Exactly half'], answer: 0, explain: 'step(0.0, n) is 1 for every n ≥ 0. Raising the amount towards 1 floods more and more until nothing is left.' },
    },
    {
      title: 'Ingredient 3: the edge band',
      body: `<p>A burn needs a <b>glowing rim</b> around each hole. Where is that rim? On the <b>shoreline</b>: land that is <i>just</i> above the water.</p>
<p>"Just above" = between <code>amount</code> and <code>amount + width</code>. Two thresholds, subtracted:</p>
<pre class="code">step(a, n) - step(a + w, n)
// n below a       → 0 - 0 = 0
// n between       → 1 - 0 = 1  ← the band
// n above a + w   → 1 - 1 = 0</pre>
<p>The graph shows this as a function of the noise value n. The image shows the band in white.</p>`,
      controls: [
        { name: 'a', label: 'amount', min: 0.2, max: 0.8, step: 0.01, value: 0.45 },
        { name: 'w', label: 'width', min: 0.01, max: 0.25, step: 0.01, value: 0.06 },
      ],
      shader: (v) => ({ frag: 'float n = fbm(uv * 4.0);\nfloat edge = step(uAmount, n) - step(uAmount + uWidth, n);\ncol = vec3(edge);', uniforms: { uAmount: v.a, uWidth: v.w } }),
      graph: { fns: (v) => [{ f: (x) => G.step(v.a, x) - G.step(v.a + v.w, x), label: 'edge(n)' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.2 } },
      code: (v) => `float edge = step(${f(v.a, 2)}, n) - step(${f(v.a, 2)} + ${f(v.w, 2)}, n);\ncol = vec3(edge);`,
      after: recipe('Dissolve', DIS_STEPS, 2),
    },
    {
      title: 'Ingredient 4: glow colour',
      body: `<p>Now mix: <code>mix(base, glow, edge)</code>. Where <code>edge = 0</code> you see the photo, where <code>edge = 1</code> you see orange.</p>
<p>Because the band is computed from the <b>same noise</b> and the <b>same amount</b> as the holes, it always hugs the border of every hole. Move both sliders.</p>`,
      controls: [
        { name: 'a', label: 'amount', min: 0, max: 1, step: 0.01, value: 0.45 },
        { name: 'w', label: 'edge width', min: 0.01, max: 0.25, step: 0.01, value: 0.06 },
      ],
      shader: (v) => disSpec({ amount: v.a, width: v.w }),
      code: (v) => disCode({ amount: v.a, width: v.w }),
      after: recipe('Dissolve', DIS_STEPS, 3) + '<div class="tip">🎮 Unity Shader Graph: plug <code>keep</code> logic into <b>Alpha Clip Threshold</b>. Unreal: <b>Opacity Mask</b> (Masked blend mode) and the glow into <b>Emissive</b>. In raw HLSL/GLSL: <code>clip(n - amount)</code> / <code>if (n &lt; amount) discard;</code>.</div>',
    },
    {
      title: 'Soften & animate',
      body: `<p>Two finishing touches:</p>
<ul><li><b>Soft glow</b>: replace the hard band with <code>1.0 - smoothstep(amount, amount + width, n)</code>. It's brightest right at the hole and fades into the image.</li>
<li><b>Motion</b>: drive <code>amount</code> with time. Here a sine makes it burn and "un-burn" forever.</li></ul>
<p>Also, <code>× 1.6</code> pushes the glow above 1.0 — in a real engine that makes <b>bloom</b> pick it up.</p>`,
      controls: [
        { name: 'w', label: 'glow width', min: 0.02, max: 0.3, step: 0.01, value: 0.1 },
        { name: 's', label: 'speed', min: 0.2, max: 3, step: 0.1, value: 0.9 },
      ],
      shader: (v) => ({ frag: DIS_SOFT, uniforms: { uSpeed: v.s, uWidth: v.w }, textures: { uTex: 'photo' }, blend: 'alpha' }),
      code: (v) => `float amount = 0.5 + 0.42 * sin(uTime * ${f(v.s, 1)});\nfloat n = fbm(uv * 4.0);\nfloat keep = step(amount, n);\nfloat edge = keep * (1.0 - smoothstep(amount, amount + ${f(v.w, 2)}, n));\ncol = mix(base, vec3(1.0, 0.55, 0.1) * 1.6, edge);\nalpha = keep;`,
      after: recipe('Dissolve', DIS_STEPS, 4),
      quiz: { q: 'What happens if the edge band uses a <i>different</i> noise than the holes?', options: ['Glow appears in random places, not around the holes', 'Nothing changes', 'The holes get bigger'], answer: 0, explain: 'The band is "the shoreline of the same landscape". A different landscape has its shoreline somewhere else.' },
    },
  ],
  games: [
    {
      id: 'dis-tune', title: 'Match the burn', engine: 'slider', rounds: 4,
      blurb: 'Tune amount (and edge width) until your dissolve matches the target.',
      gen: (rng, level) => {
        const amount = rng.step(0.35, 0.65, 0.05);
        const width = level === 1 ? 0.08 : rng.step(0.04, 0.18, 0.02);
        const scale = level === 3 ? rng.pick([3, 4, 6, 8]) : 4;
        const params = [{ name: 'amount', label: 'amount (water level)', min: 0.2, max: 0.8, step: 0.01, target: amount }];
        if (level >= 2) params.push({ name: 'width', label: 'edge width', min: 0.02, max: 0.25, step: 0.01, target: width });
        if (level === 3) params.push({ name: 'scale', label: 'noise scale', min: 2, max: 10, step: 1, target: scale });
        return {
          prompt: level === 1 ? 'Set the <b>amount</b> so the same holes appear.' : 'Match the holes <b>and</b> the glowing rim.',
          sub: level === 1 ? 'More amount = higher water = bigger holes.' : 'Amount controls hole size, width controls the orange band, scale controls blob size.',
          params,
          build: (p) => disSpec({ amount: p.amount, width: p.width ?? width, scale: p.scale ?? scale }),
          code: (p) => disCode({ amount: p.amount, width: p.width ?? width, scale: p.scale ?? scale }),
          tolerance: 0.05,
          explain: '<p>Read the holes first (amount), then the thickness of the orange rim (width). The rim is the noise between <code>amount</code> and <code>amount + width</code>.</p>',
        };
      },
    },
    {
      id: 'dis-read', title: 'Code → burn', engine: 'mcq', rounds: 8,
      blurb: 'Read the numbers in the code and pick the matching dissolve.',
      gen: (rng, level) => {
        const mk = () => {
          if (level === 1) return { amount: rng.pick([0.25, 0.4, 0.55, 0.7]), width: 0.06, scale: 4 };
          if (level === 2) return { amount: rng.pick([0.35, 0.5, 0.65]), width: rng.pick([0.03, 0.16]), scale: 4 };
          return { amount: rng.pick([0.4, 0.55]), width: rng.pick([0.03, 0.14]), scale: rng.pick([3, 8]) };
        };
        const opts = distinct(rng, mk(), mk, 4);
        const a = opts[0];
        return {
          prompt: 'Which image does this dissolve code produce?',
          code: disCode(a),
          options: opts.map((o) => ({ shader: disSpec(o) })),
          explain: `<p>amount <b>${n(a.amount)}</b> sets the hole size (higher = more flooded). width <b>${n(a.width)}</b> sets the orange rim thickness${level === 3 ? `, scale <b>${a.scale}</b> sets the blob size (bigger = smaller blobs)` : ''}.</p>`,
        };
      },
    },
    {
      id: 'dis-fill', title: 'Finish the dissolve', engine: 'codefill', rounds: 4,
      blurb: 'Fill the key line of the recipe so it matches the target.',
      gen: (rng, level) => {
        const V = [
          { tpl: 'float n = fbm(uv * 4.0);\nfloat keep = [[0]](uAmount, n);\nfloat edge = keep - step(uAmount + uWidth, n);\nvec3 base = texture2D(uTex, uv).rgb;\ncol = mix(base, uGlow, edge);\nalpha = keep;', slots: [{ options: ['step', 'max', 'min', 'mod'], answer: 'step' }], why: '<code>step(amount, n)</code> is the threshold: 1 above the water level, 0 below.' },
          { tpl: 'float n = fbm(uv * 4.0);\nfloat keep = step(uAmount, n);\nfloat edge = keep - step(uAmount + [[0]], n);\nvec3 base = texture2D(uTex, uv).rgb;\ncol = mix(base, uGlow, edge);\nalpha = keep;', slots: [{ options: ['uWidth', 'uAmount', '0.0', 'n'], answer: 'uWidth' }], why: 'The band is between <code>amount</code> and <code>amount + width</code>. With <code>0.0</code> both steps are equal → no band at all.' },
          { tpl: 'float n = fbm(uv * 4.0);\nfloat keep = step(uAmount, n);\nfloat edge = keep - step(uAmount + uWidth, n);\nvec3 base = texture2D(uTex, uv).rgb;\ncol = mix(base, uGlow, [[0]]);\nalpha = [[1]];', slots: [{ options: ['edge', 'keep', 'n', '1.0'], answer: 'edge' }, { options: ['keep', 'edge', 'n', '1.0'], answer: 'keep' }], why: 'Colour switches to glow where <code>edge</code> is 1; visibility (alpha) is <code>keep</code>.', lvl: 2 },
          { tpl: 'float n = fbm(uv * 4.0);\nfloat keep = step(uAmount, n);\nfloat edge = keep * (1.0 - [[0]](uAmount, uAmount + uWidth, n));\nvec3 base = texture2D(uTex, uv).rgb;\ncol = mix(base, uGlow, edge);\nalpha = [[1]];', slots: [{ options: ['smoothstep', 'mix', 'clamp', 'step'], answer: 'smoothstep' }, { options: ['keep', 'edge', '1.0 - keep', 'n'], answer: 'keep' }], why: 'The soft glow: <code>smoothstep</code> fades from 0 at the hole border to 1 further in; <code>1.0 - …</code> flips it so the glow is brightest at the border.', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        const amount = rng.step(0.4, 0.6, 0.05);
        const uniforms = { uAmount: amount, uWidth: 0.1, uGlow: [1, 0.55, 0.1] };
        return {
          prompt: 'Complete the dissolve so it matches the target:',
          sub: `uAmount = ${n(amount)}, uWidth = 0.1. Wrong picks render live in "Yours".`,
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), uniforms, textures: { uTex: 'photo' }, blend: 'alpha' }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'dis-order', title: 'Write the recipe', engine: 'order', rounds: 3,
      blurb: 'Put the dissolve steps in the order the shader needs them.',
      gen: (rng, level) => {
        const V = [
          { items: ['Compute a noise value n for this pixel', 'Compare n with the amount → keep (0 or 1)', 'Find the band just above the amount → edge', 'Mix the base colour towards glow using edge'], explain: 'Each step needs the result of the one before: no n → no keep; the edge band is cut from keep; the mix needs edge.' },
          { items: [{ code: 'float n = fbm(uv * 4.0);' }, { code: 'float keep = step(uAmount, n);' }, { code: 'float edge = keep - step(uAmount + uWidth, n);' }, { code: 'col = mix(base, uGlow, edge);' }], explain: 'A variable must exist before it is used: n → keep → edge → col.' },
          { items: [{ code: 'float amount = fract(uTime * 0.2);' }, { code: 'float keep = step(amount, fbm(uv * 4.0));' }, { code: 'float edge = keep * (1.0 - smoothstep(amount, amount + 0.1, fbm(uv * 4.0)));' }, { code: 'col = mix(base, uGlow * 2.0, edge);' }], explain: 'Animate the amount first (everything else uses it), then the threshold, then the soft band (it multiplies by keep), then the colour (it uses edge).', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        return { prompt: 'Put the dissolve recipe in order:', items: vr.items, explain: vr.explain };
      },
    },
  ],
};

// ================================================================ HOLOGRAM
const HOLO_STEPS = ['<b>Additive</b> tint — light, not paint (black = see-through)', '<b>Scanlines</b> — <code>fract(P.y·k − time)</code> stripes scrolling', '<b>Fresnel rim</b> — glow where the surface turns away', '<b>Flicker</b> — random brightness steps over time'];
const HOLO_FRAG = `${VIEW}
float rim = pow(1.0 - saturate(dot(N, V)), uPow);
float lines = step(0.5, fract(P.y * uDensity - uTime * uSpeed));
float flick = 1.0 - uFlick * hash(vec2(floor(uTime * 12.0), 1.0));
col = uCol * (0.08 + rim * 1.3 + lines * uLines) * flick;`;
const holoSpec = (p = {}) => ({
  frag: HOLO_FRAG, mesh: p.mesh || 'sphere', blend: p.blend === undefined ? 'add' : p.blend, camera: CAM,
  uniforms: { uPow: p.pow ?? 2.5, uDensity: p.density ?? 18, uSpeed: p.speed ?? 0.6, uLines: p.lines ?? 0.35, uFlick: p.flick ?? 0.25, uCol: p.col || [0.25, 0.85, 1] },
});
const holoCode = (p = {}) => `vec3 V = normalize(uCamPos - P);
float rim = pow(1.0 - saturate(dot(N, V)), ${f(p.pow ?? 2.5, 1)});
float lines = step(0.5, fract(P.y * ${f(p.density ?? 18, 1)} - uTime * ${f(p.speed ?? 0.6, 1)}));
float flick = 1.0 - ${f(p.flick ?? 0.25, 2)} * hash(vec2(floor(uTime * 12.0), 1.0));
col = tint * (0.08 + rim * 1.3 + lines * ${f(p.lines ?? 0.35, 2)}) * flick;
// drawn with ADDITIVE blending`;
const HOLO_TINTS = [[0.25, 0.85, 1], [0.3, 1, 0.5], [1, 0.4, 0.8], [1, 0.7, 0.25]];

const hologram = {
  id: 'effects.hologram',
  title: 'Hologram',
  blurb: 'Additive tint, scrolling scanlines, a fresnel rim and a bit of flicker.',
  lesson: [
    {
      title: 'The hologram look',
      body: `<p>Sci-fi holograms are everywhere: mission briefings, ghosts, "preview" placements in building games. They all share the same four ingredients.</p>
<p>Look at the sphere: it's see-through, its <b>edges glow</b>, <b>horizontal lines</b> crawl up it, and it <b>flickers</b> like a bad signal.</p>`,
      shader: holoSpec(),
      after: recipe('Hologram', HOLO_STEPS),
    },
    {
      title: 'Additive: light, not paint',
      body: `<p>A hologram is <b>light</b>. Light doesn't cover what's behind it — it <b>adds</b> to it.</p>
<p>With <b>additive blending</b> the GPU does <code>screen = behind + ours</code>. So <b>black adds nothing</b> (invisible) and bright colours glow. No alpha needed!</p>
<p>Left: normal opaque drawing. Right: the same colour drawn additively — the checkerboard shows through.</p>`,
      controls: [{ name: 'k', label: 'brightness', min: 0, max: 1, step: 0.01, value: 0.4 }],
      shaders: [
        { spec: (v) => ({ frag: 'col = uCol * uK;', mesh: 'sphere', camera: CAM, blend: 'alpha', uniforms: { uCol: [0.25, 0.85, 1], uK: v.k } }), caption: 'opaque' },
        { spec: (v) => ({ frag: 'col = uCol * uK;', mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uCol: [0.25, 0.85, 1], uK: v.k } }), caption: 'additive' },
      ],
      code: (v) => `col = vec3(0.25, 0.85, 1.0) * ${f(v.k, 2)};\n// additive: screen = background + col`,
      after: recipe('Hologram', HOLO_STEPS, 0) + '<div class="tip">Unity: <code>Blend One One</code> (or Shader Graph Surface = Transparent, Blend = Additive). Unreal: Blend Mode = <b>Additive</b>.</div>',
      quiz: { q: 'In additive mode, what does a pixel with col = (0, 0, 0) look like?', options: ['Invisible — it adds zero light', 'Solid black', 'White'], answer: 0, explain: 'behind + 0 = behind. That\'s why additive effects don\'t need alpha: dark parts simply vanish.' },
    },
    {
      title: 'Scanlines with fract()',
      body: `<p><code>fract(x)</code> keeps only the part after the dot, so <code>fract(P.y * k)</code> is a <b>sawtooth</b>: it climbs 0→1, drops, climbs again — <b>k times per unit</b> of height.</p>
<p><code>step(0.5, …)</code> turns each tooth into "half off, half on" → stripes. Subtracting <code>uTime × speed</code> slides the teeth → the stripes crawl <b>upwards</b>.</p>
<p>We use <b>world height <code>P.y</code></b>, not uv, so the lines stay horizontal and evenly spaced on any mesh.</p>`,
      controls: [
        { name: 'k', label: 'density k', min: 4, max: 40, step: 1, value: 14 },
        { name: 's', label: 'speed', min: 0, max: 2, step: 0.1, value: 0.5 },
      ],
      shader: (v) => ({ frag: 'float lines = step(0.5, fract(P.y * uDensity - uTime * uSpeed));\ncol = vec3(0.25, 0.85, 1.0) * lines * 0.6;', mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uDensity: v.k, uSpeed: v.s } }),
      graph: { fns: (v) => [{ f: (x) => G.fract(x * v.k / 4), label: 'fract(y·k)', color: '#7c6cff' }, { f: (x) => G.step(0.5, G.fract(x * v.k / 4)) * 0.9, label: 'step(0.5, …)', color: '#4fc3f7' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.2 } },
      code: (v) => `float lines = step(0.5, fract(P.y * ${f(v.k, 1)} - uTime * ${f(v.s, 1)}));\ncol = tint * lines * 0.6;`,
      after: recipe('Hologram', HOLO_STEPS, 1) + '<p class="small dim">(The graph shows a quarter of a unit of height.)</p>',
    },
    {
      title: 'Fresnel rim',
      body: `<p>Remember fresnel? <code>V</code> points from the pixel to the camera, <code>N</code> is the surface normal.</p>
<ul><li>Centre of the sphere: N points at you → <code>dot(N, V) ≈ 1</code> → <code>1 − 1 = 0</code> → dark.</li>
<li>Silhouette: N is sideways → <code>dot ≈ 0</code> → <code>1 − 0 = 1</code> → bright.</li></ul>
<p><code>pow(…, p)</code> squeezes the glow towards the edge: higher p = thinner rim. Glowing edges are what make it read as "a shell of light".</p>`,
      controls: [{ name: 'p', label: 'power p', min: 0.5, max: 8, step: 0.1, value: 2.5 }],
      shader: (v) => ({ frag: `${VIEW}\nfloat rim = pow(1.0 - saturate(dot(N, V)), uPow);\ncol = vec3(0.25, 0.85, 1.0) * rim * 1.3;`, mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uPow: v.p } }),
      graph: { fns: (v) => [{ f: (x) => Math.pow(1 - x, v.p), label: 'rim = pow(1 − dot, p)' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 } },
      code: (v) => `vec3 V = normalize(uCamPos - P);\nfloat rim = pow(1.0 - saturate(dot(N, V)), ${f(v.p, 1)});\ncol = tint * rim * 1.3;`,
      after: recipe('Hologram', HOLO_STEPS, 2) + '<p class="small dim">Graph x-axis = dot(N, V): 0 at the silhouette, 1 facing you.</p>',
    },
    {
      title: 'Flicker',
      body: `<p>A real projector stutters. <code>floor(uTime * 12.0)</code> is a number that changes <b>12 times per second</b> (0, 1, 2…). Feeding it to <code>hash()</code> gives a <b>new random value</b> each step.</p>
<p><code>1.0 − strength × random</code> dims the whole hologram by a random amount, 12 times a second. Subtle values (0.1–0.3) feel "alive"; big values feel broken.</p>`,
      controls: [{ name: 'k', label: 'flicker strength', min: 0, max: 1, step: 0.05, value: 0.3 }],
      shader: (v) => holoSpec({ flick: v.k }),
      code: (v) => `float flick = 1.0 - ${f(v.k, 2)} * hash(vec2(floor(uTime * 12.0), 1.0));\ncol = tint * (0.08 + rim * 1.3 + lines * 0.35) * flick;`,
      after: recipe('Hologram', HOLO_STEPS, 3),
    },
    {
      title: 'All together',
      body: `<p>Sum the light layers, multiply by flicker, draw additively. Try another mesh — the recipe doesn't care, because it only uses <code>N</code>, <code>V</code> and <code>P.y</code>.</p>`,
      controls: [
        { name: 'm', label: 'mesh (sphere / torus / cube)', min: 0, max: 2, step: 1, value: 1 },
        { name: 'k', label: 'line density', min: 4, max: 40, step: 1, value: 18 },
        { name: 'p', label: 'rim power', min: 0.5, max: 8, step: 0.1, value: 2.5 },
        { name: 'l', label: 'line brightness', min: 0, max: 1, step: 0.05, value: 0.35 },
      ],
      shader: (v) => holoSpec({ mesh: ['sphere', 'torus', 'cube'][v.m], density: v.k, pow: v.p, lines: v.l }),
      code: (v) => holoCode({ density: v.k, pow: v.p, lines: v.l }),
      quiz: { q: 'Why doesn\'t the hologram need an alpha value to be see-through?', options: ['Additive blending adds light; dark parts add nothing', 'Because fresnel sets alpha automatically', 'Because the lines are cut out with discard'], answer: 0, explain: 'Additive = behind + ours. The background always survives.' },
    },
  ],
  games: [
    {
      id: 'holo-missing', title: 'What\'s missing?', engine: 'mcq', rounds: 8,
      blurb: 'One ingredient was removed from the hologram. Spot which.',
      gen: (rng, level) => {
        const base = { mesh: rng.pick(level === 1 ? ['sphere'] : ['sphere', 'torus']), col: rng.pick(HOLO_TINTS), flick: 0 };
        const broken = [
          { name: 'Scanlines', p: { lines: 0 }, why: 'No stripes: the <code>lines</code> term was removed (×0).' },
          { name: 'Fresnel rim', p: { pow: 60 }, why: 'The edges don\'t glow: without the rim the hologram looks like a flat striped ball.' },
          { name: 'Additive blending', p: { blend: 'alpha' }, why: 'It\'s opaque: the checkerboard is hidden behind it. Additive would let the background through.' },
        ];
        if (level >= 2) broken.push({ name: 'The tint colour', p: { col: [1, 1, 1] }, why: 'Everything turned white/grey: the tint multiply was dropped.' });
        const b = rng.pick(broken);
        const others = broken.filter((x) => x !== b).map((x) => x.name);
        if (level < 2) others.push('The tint colour');
        const showRef = level < 3;
        return {
          prompt: showRef ? 'Left: the full hologram. Right: one ingredient is missing. Which?' : 'This hologram is missing ONE ingredient. Which?',
          shaders: showRef ? [{ spec: holoSpec(base), caption: 'complete' }, { spec: holoSpec({ ...base, ...b.p }), caption: 'broken' }] : undefined,
          shader: showRef ? undefined : holoSpec({ ...base, ...b.p }),
          options: [b.name, ...others.slice(0, 3)],
          explain: `<p>${b.why}</p><p>Checklist: stripes? glowing edges? see-through? tinted?</p>`,
        };
      },
    },
    {
      id: 'holo-sort', title: 'Which ingredient?', engine: 'buckets', rounds: 2,
      blurb: 'Sort code and descriptions into scanlines, rim or flicker.',
      gen: () => ({
        prompt: 'Which hologram ingredient is this?',
        buckets: ['〰️ Scanlines', '⭕ Fresnel rim', '⚡ Flicker'],
        count: 10,
        items: [
          { code: 'fract(P.y * 20.0 - uTime)', bucket: 0, why: 'fract of height = repeating stripes; − uTime scrolls them.' },
          { code: 'pow(1.0 - dot(N, V), 3.0)', bucket: 1, why: '1 − N·V is big where the surface turns away from the camera.' },
          { code: 'hash(vec2(floor(uTime * 12.0)))', bucket: 2, why: 'A new random value 12 times a second.' },
          { text: 'Brightest at the silhouette', bucket: 1 },
          { text: 'Horizontal bands crawling upwards', bucket: 0 },
          { text: 'The whole thing dims randomly for a split second', bucket: 2 },
          { code: 'step(0.5, fract(P.y * k))', bucket: 0, why: 'step turns the sawtooth into on/off stripes.' },
          { code: 'vec3 V = normalize(uCamPos - P);', bucket: 1, why: 'The view vector is needed for fresnel (N·V).' },
          { text: 'Uses floor() on time so the value jumps instead of sliding', bucket: 2 },
          { text: 'Depends on the angle between normal and view direction', bucket: 1 },
          { text: 'Changing k makes more, thinner lines', bucket: 0 },
          { code: '1.0 - 0.3 * hash(vec2(floor(uTime * 8.0), 1.0))', bucket: 2 },
        ],
      }),
    },
    {
      id: 'holo-tune', title: 'Tune the hologram', engine: 'slider', rounds: 4,
      blurb: 'Match scanline density, rim power and line brightness.',
      gen: (rng, level) => {
        const t = { density: rng.step(8, 32, 4), pow: rng.step(1, 5, 1), lines: rng.step(0.2, 0.6, 0.1) };
        const params = [{ name: 'density', label: 'line density', min: 4, max: 40, step: 1, target: t.density }];
        if (level >= 2) params.push({ name: 'pow', label: 'rim power', min: 0.5, max: 6, step: 0.1, target: t.pow });
        if (level === 3) params.push({ name: 'lines', label: 'line brightness', min: 0, max: 1, step: 0.05, target: t.lines });
        const mesh = level === 3 ? rng.pick(['sphere', 'torus']) : 'sphere';
        const full = (p) => ({ density: p.density, pow: p.pow ?? 2.5, lines: p.lines ?? 0.35, mesh, flick: 0, speed: 0.3 });
        return {
          prompt: 'Make your hologram match the target.',
          sub: 'Count the stripes first. Then compare how thick the glowing edge is.',
          params,
          build: (p) => holoSpec(full(p)),
          code: (p) => holoCode(full(p)),
          tolerance: 0.06,
          explain: '<p>Density = stripes per unit of height (sphere is 2 units tall). Higher rim power = thinner rim.</p>',
        };
      },
    },
    {
      id: 'holo-fill', title: 'Fill the hologram', engine: 'codefill', rounds: 4,
      blurb: 'Complete the scanline or fresnel line.',
      gen: (rng, level) => {
        const V = [
          { tpl: 'vec3 V = normalize(uCamPos - P);\nfloat rim = pow(1.0 - saturate(dot(N, V)), 2.5);\nfloat lines = step(0.5, [[0]](P.y * 18.0 - uTime * 0.6));\ncol = uCol * (0.08 + rim * 1.3 + lines * 0.35);', slots: [{ options: ['fract', 'floor', 'abs', 'sign'], answer: 'fract' }], why: '<code>fract</code> repeats 0→1 over and over, so step(0.5, …) gives repeating stripes. <code>floor</code> just counts up and never repeats.' },
          { tpl: 'vec3 V = normalize(uCamPos - P);\nfloat rim = pow(1.0 - saturate(dot([[0]], V)), 2.5);\nfloat lines = step(0.5, fract(P.y * 18.0 - uTime * 0.6));\ncol = uCol * (0.08 + rim * 1.3 + lines * 0.35);', slots: [{ options: ['N', 'P', 'uv.xyy', 'vec3(1.0)'], answer: 'N' }], why: 'Fresnel compares the <b>normal</b> with the view direction.' },
          { tpl: 'vec3 V = normalize(uCamPos - P);\nfloat rim = pow([[0]], 2.5);\nfloat lines = step(0.5, fract(P.y * 18.0 - uTime * 0.6));\ncol = uCol * (0.08 + rim * 1.3 + lines * [[1]]);', slots: [{ options: ['1.0 - saturate(dot(N, V))', 'saturate(dot(N, V))', '1.0', 'dot(N, N)'], answer: '1.0 - saturate(dot(N, V))' }, { options: ['0.35', '0.0', '3.5'], answer: '0.35' }], why: '<code>dot(N, V)</code> alone is bright in the centre (the opposite of a rim). <code>1 − dot</code> flips it to the edges.', lvl: 2 },
          { tpl: 'vec3 V = normalize(uCamPos - P);\nfloat rim = pow(1.0 - saturate(dot(N, V)), [[0]]);\nfloat lines = step(0.5, fract([[1]] * 18.0 - uTime * 0.6));\ncol = uCol * (0.08 + rim * 1.3 + lines * 0.35);', slots: [{ options: ['2.5', '0.3', '2'], answer: '2.5' }, { options: ['P.y', 'P.x', 'N.y', 'uCamPos.y'], answer: 'P.y' }], why: 'Horizontal lines need the <b>height</b> P.y. P.x would give vertical lines. And <code>2</code> is an int — a compile error in GLSL ES 1.0!', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        const col = rng.pick(HOLO_TINTS);
        return {
          prompt: 'Complete the hologram shader to match the target:',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uCol: col } }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
  ],
};

// ================================================================ LAVA / ENERGY
const LAVA_STEPS = ['<b>Layer A</b> — noise scrolling one way', '<b>Layer B</b> — noise at another scale, scrolling another way', '<b>Multiply</b> A × B — shapes now churn instead of sliding', '<b>Contrast</b> — smoothstep to sharpen', '<b>Gradient map</b> — grey value → colour from a palette texture'];
const LAVA_FRAG = `float a = fbm(uv * 3.0 + vec2(0.0, uTime * uSpeed));
float b = fbm(uv * 5.0 + vec2(uTime * uSpeed * 0.7, -uTime * uSpeed * 0.4));
float v = smoothstep(uLo, uHi, a * b * 2.0);
col = texture2D(uPal, vec2(v, 0.5)).rgb * uBoost;`;
const lavaSpec = (p = {}) => ({ frag: LAVA_FRAG, textures: { uPal: { name: 'palette', wrap: 'clamp' } }, uniforms: { uSpeed: p.speed ?? 0.12, uLo: p.lo ?? 0.3, uHi: p.hi ?? 0.85, uBoost: p.boost ?? 1 } });
const lavaCode = (p = {}) => `float a = fbm(uv * 3.0 + vec2(0.0, uTime * ${f(p.speed ?? 0.12, 2)}));
float b = fbm(uv * 5.0 + vec2(uTime * 0.08, -uTime * 0.05));
float v = smoothstep(${f(p.lo ?? 0.3, 2)}, ${f(p.hi ?? 0.85, 2)}, a * b * 2.0);
col = texture2D(uPal, vec2(v, 0.5)).rgb * ${f(p.boost ?? 1, 1)};`;

const lava = {
  id: 'effects.lava',
  title: 'Scrolling energy & lava',
  blurb: 'Two scrolling noise layers multiplied, sharpened, then gradient-mapped.',
  lesson: [
    {
      title: 'Living, churning surfaces',
      body: `<p>Lava rivers, magic portals, energy cores, plasma… they all look <b>alive</b>: shapes form, merge and dissolve while flowing.</p>
<p>The secret is surprisingly small: <b>two</b> scrolling noise layers <b>multiplied</b>, then coloured with a <b>gradient map</b>.</p>`,
      shader: lavaSpec({ boost: 1.1 }),
      after: recipe('Lava / energy', LAVA_STEPS),
    },
    {
      title: 'Layer A: scrolling noise',
      body: `<p>To move a pattern, <b>add time to the coordinates</b> before sampling: <code>fbm(uv * 3.0 + vec2(0.0, uTime * speed))</code>.</p>
<p>⚠️ Careful with direction: adding to <code>uv.y</code> makes each pixel read from <i>higher up</i>, so the pattern appears to move <b>down</b>. It's like moving the camera instead of the picture.</p>
<div class="tip">This is the <b>Panner</b> node in Unreal and <b>Tiling And Offset</b> (offset = time × speed) in Unity Shader Graph.</div>`,
      controls: [{ name: 's', label: 'speed', min: 0, max: 0.5, step: 0.01, value: 0.15 }],
      shader: (v) => ({ frag: 'float a = fbm(uv * 3.0 + vec2(0.0, uTime * uSpeed));\ncol = vec3(a);', uniforms: { uSpeed: v.s } }),
      code: (v) => `float a = fbm(uv * 3.0 + vec2(0.0, uTime * ${f(v.s, 2)}));\ncol = vec3(a);   // slides DOWN`,
      after: recipe('Lava / energy', LAVA_STEPS, 0),
      quiz: { q: 'You want the pattern to move UP. What do you write?', options: ['uv + vec2(0.0, -uTime)', 'uv + vec2(0.0, uTime)', 'uv * uTime'], answer: 0, explain: 'Subtracting time from uv.y makes each pixel read from lower down, so features travel upwards. (uv * uTime would zoom, not scroll.)' },
    },
    {
      title: 'Layer B & multiply',
      body: `<p>One layer looks like a <b>rigid sheet</b> sliding past — obviously a scrolling texture. Add a second layer at a <b>different scale</b>, moving in a <b>different direction</b>, and <b>multiply</b>.</p>
<div class="analogy">🪟 Two sheets of frosted glass with clear spots, sliding over each other. Light only gets through where <b>both</b> are clear. As they slide, those spots appear, merge and vanish — they <i>churn</i>.</div>
<p>Slide from "A only" to "A × B". The <code>× 2.0</code> brings the result back to about 0..1 (two ~0.5 values multiply to ~0.25).</p>`,
      controls: [{ name: 'm', label: 'A only → A × B', min: 0, max: 1, step: 0.01, value: 1 }],
      shader: (v) => ({ frag: 'float a = fbm(uv * 3.0 + vec2(0.0, uTime * 0.12));\nfloat b = fbm(uv * 5.0 + vec2(uTime * 0.084, -uTime * 0.048));\ncol = vec3(mix(a, a * b * 2.0, uMix));', uniforms: { uMix: v.m } }),
      code: (v) => `float a = fbm(uv * 3.0 + vec2(0.0, uTime * 0.12));\nfloat b = fbm(uv * 5.0 + vec2(uTime * 0.08, -uTime * 0.05));\ncol = vec3(mix(a, a * b * 2.0, ${f(v.m, 2)}));`,
      after: recipe('Lava / energy', LAVA_STEPS, 2),
    },
    {
      title: 'Contrast with smoothstep',
      body: `<p>The result is a soft, foggy grey. Real lava has <b>dark crust</b> and <b>bright cracks</b>. <code>smoothstep(lo, hi, x)</code> remaps: everything below <code>lo</code> → 0, above <code>hi</code> → 1, smooth in between.</p>
<p>Closer lo and hi = harsher contrast. Move lo up to grow the dark crust.</p>`,
      controls: [
        { name: "lo", label: "lo", min: 0, max: 0.6, step: 0.01, value: 0.3 },
        { name: "hi", label: "hi", min: 0.4, max: 1, step: 0.01, value: 0.85 },
      ],
      shader: (v) => ({ frag: 'float a = fbm(uv * 3.0 + vec2(0.0, uTime * 0.12));\nfloat b = fbm(uv * 5.0 + vec2(uTime * 0.084, -uTime * 0.048));\ncol = vec3(smoothstep(uLo, uHi, a * b * 2.0));', uniforms: { uLo: v.lo, uHi: v.hi } }),
      graph: { fns: (v) => [{ f: (x) => G.smoothstep(v.lo, v.hi, x), label: 'smoothstep(lo, hi, x)' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 } },
      code: (v) => `float v = smoothstep(${f(v.lo, 2)}, ${f(v.hi, 2)}, a * b * 2.0);\ncol = vec3(v);`,
      after: recipe('Lava / energy', LAVA_STEPS, 3),
    },
    {
      title: 'Gradient map: grey → colour',
      body: `<p>Last step: use the grey value <code>v</code> as the <b>x coordinate</b> into a palette texture: <code>texture2D(uPal, vec2(v, 0.5))</code>.</p>
<p>v = 0 picks the left colour (dark purple), v = 1 picks the right (white). The palette is a <b>lookup table</b>: artists can repaint the look without touching the shader — swap the palette and lava becomes ice or poison.</p>
<p>The boost (× > 1) makes the hot parts glow (bloom in an engine).</p>`,
      controls: [{ name: 'b', label: 'boost', min: 0.5, max: 2, step: 0.05, value: 1.1 }],
      shaders: [
        { spec: { frag: 'col = texture2D(uPal, vec2(uv.x, 0.5)).rgb;', textures: { uPal: { name: 'palette', wrap: 'clamp' } } }, caption: 'palette (x = 0 → 1)' },
        { spec: (v) => lavaSpec({ boost: v.b }), caption: 'gradient-mapped' },
      ],
      code: (v) => lavaCode({ boost: v.b }),
      after: recipe('Lava / energy', LAVA_STEPS, 4) + '<div class="tip">Unity: <b>Sample Gradient</b> node or a ramp texture. Unreal: a <b>Curve Atlas</b> or a 1-pixel-tall texture sampled with the value as U.</div>',
    },
  ],
  games: [
    {
      id: 'lava-ramp', title: 'Gradient-map reader', engine: 'mcq', rounds: 8,
      blurb: 'Read how the value is fed into the palette and pick the result.',
      gen: (rng, level) => {
        const MAPS = [
          { c: 'vec2(v, 0.5)', why: 'Straight lookup: dark → purple, bright → white.' },
          { c: 'vec2(1.0 - v, 0.5)', why: '1 − v flips the palette: bright parts get the dark end.' },
          { c: 'vec2(v * 0.5, 0.5)', why: 'v × 0.5 only reaches the left half of the palette: purple → pink, never yellow or white.' },
          { c: 'vec2(step(0.5, v), 0.5)', why: 'step gives only 0 or 1 → only the two end colours, hard edge.' },
          { c: 'vec2(0.5 + v * 0.5, 0.5)', why: 'Only the right half: pink → orange → white. No dark purple.' },
          { c: 'vec2(v * v, 0.5)', why: 'v² stays small longer → more of the image is dark; only the brightest spots reach yellow/white.', lvl: 3 },
        ].filter((m) => (m.lvl || 1) <= level);
        const opts = rng.pickN(MAPS, 4);
        const onGradient = level === 1;
        const val = onGradient ? 'float v = uv.x;' : 'float a = fbm(uv * 3.0 + vec2(0.0, uTime * 0.1));\nfloat b = fbm(uv * 5.0 + vec2(uTime * 0.07, -uTime * 0.04));\nfloat v = smoothstep(0.25, 0.75, a * b * 2.0);';
        const spec = (m) => ({ frag: `${val}\ncol = texture2D(uPal, ${m.c}).rgb;`, textures: { uPal: { name: 'palette', wrap: 'clamp' } } });
        return {
          prompt: onGradient ? 'Here <code>v</code> is just <code>uv.x</code> (a left→right ramp). Which image?' : 'Which image does this lava code produce?',
          code: `${val}\ncol = texture2D(uPal, ${opts[0].c}).rgb;`,
          options: opts.map((m) => ({ shader: spec(m) })),
          explain: `<p>${opts[0].why}</p><p>Palette left→right: dark purple, purple, pink, orange, yellow, white.</p>`,
        };
      },
    },
    {
      id: 'lava-tune', title: 'Crust & cracks', engine: 'slider', rounds: 4,
      blurb: 'Tune the smoothstep contrast until your lava matches.',
      gen: (rng, level) => {
        const lo = rng.step(0.1, 0.45, 0.05);
        const hi = level === 1 ? lo + 0.4 : +(lo + rng.step(0.15, 0.45, 0.05)).toFixed(2);
        const params = level === 1
          ? [{ name: 'lo', label: 'lo (hi = lo + 0.4)', min: 0, max: 0.55, step: 0.01, target: lo }]
          : [{ name: 'lo', label: 'lo', min: 0, max: 0.55, step: 0.01, target: lo }, { name: 'hi', label: 'hi', min: 0.3, max: 1, step: 0.01, target: hi }];
        if (level === 3) params.push({ name: 'boost', label: 'boost', min: 0.5, max: 2, step: 0.05, target: rng.step(0.7, 1.6, 0.1) });
        const P = (p) => ({ lo: p.lo, hi: p.hi ?? p.lo + 0.4, boost: p.boost ?? 1, speed: 0.12 });
        return {
          prompt: 'Match the amount of dark crust and bright lava.',
          sub: 'lo: everything darker than this becomes crust. hi: everything brighter becomes white-hot.',
          params,
          build: (p) => lavaSpec(P(p)),
          code: (p) => lavaCode(P(p)),
          tolerance: 0.05,
          explain: '<p>Raising <b>lo</b> grows the crust. Lowering <b>hi</b> grows the white-hot parts. lo and hi close together = hard contrast.</p>',
        };
      },
    },
    {
      id: 'lava-roles', title: 'Mask, motion or colour?', engine: 'buckets', rounds: 2,
      blurb: 'Every recipe line has a job. Sort them by role.',
      gen: () => ({
        prompt: 'What is this line\'s job in the recipe?',
        sub: 'Shape = which pixels/how much. Motion = makes it move. Colour = what colour it gets.',
        buckets: ['🔲 Shape', '🏃 Motion', '🎨 Colour'],
        count: 10,
        items: [
          { code: 'uv + vec2(0.0, uTime * 0.1)', bucket: 1, why: 'Adding time to coordinates = scrolling.' },
          { code: 'smoothstep(0.3, 0.7, v)', bucket: 0, why: 'Contrast: decides how much of the image is dark vs bright.' },
          { code: 'texture2D(uPal, vec2(v, 0.5))', bucket: 2, why: 'Gradient map: grey value → colour.' },
          { code: 'a * b', bucket: 0, why: 'Combines two masks into a new shape.' },
          { code: 'mix(uShadow, uLit, band)', bucket: 2 },
          { code: 'step(uAmount, n)', bucket: 0, why: 'A threshold cuts the shape.' },
          { code: 'fract(uTime * 0.5)', bucket: 1, why: 'A repeating 0→1 timer.' },
          { code: 'sin(uTime * 3.0)', bucket: 1 },
          { code: 'vec3(h, h * h, h * h * h)', bucket: 2, why: 'A colour ramp: red rises first, then green, then blue.' },
          { code: '1.0 - abs(uv.x - 0.5) * 2.0', bucket: 0, why: 'A mask that is 1 in the middle and 0 at the sides.' },
          { code: 'col *= vec3(0.3, 0.9, 1.0)', bucket: 2 },
          { code: 'pos.x += sin(uTime + phase) * 0.1', bucket: 1, why: 'Vertex motion over time.' },
          { code: 'sdCircle(p, 0.3)', bucket: 0 },
        ],
      }),
    },
    {
      id: 'lava-order', title: 'Cook the lava', engine: 'order', rounds: 3,
      blurb: 'Order the lava recipe.',
      gen: (rng) => rng.pick([
        { prompt: 'Order the lava recipe:', items: ['Sample noise layer A, scrolling one way', 'Multiply it by a second noise layer scrolling sideways', 'Sharpen the result with smoothstep', 'Use that value as x in the palette texture', 'Multiply the colour by a boost for glow'], explain: 'Shape first (layers, multiply, contrast), then colour (palette), then the final boost.' },
        { prompt: 'Order the lines so the shader compiles:', items: [{ code: 'float a = fbm(uv * 3.0 + vec2(0.0, uTime * 0.1));' }, { code: 'float m = a * fbm(uv * 5.0 - vec2(uTime * 0.08, 0.0));' }, { code: 'float v = smoothstep(0.25, 0.75, m * 2.0);' }, { code: 'col = texture2D(uPal, vec2(v, 0.5)).rgb;' }, { code: 'col *= 1.5;' }], explain: 'a → m → v → col → boost. Each line uses the previous result.' },
      ]),
    },
  ],
};

// ================================================================ FIRE
const FIRE_STEPS = ['<b>Shape mask</b> — bright at the bottom-centre, fading up and to the sides', '<b>Rising noise</b> — subtract time in y so it moves up', '<b>Erode</b> — mask minus noise: the edges get eaten into tongues', '<b>Colour ramp</b> — heat → black, red, orange, yellow, white', '<b>Additive</b> — fire is light'];
const FIRE_FRAG = `float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * uSpeed));
float side = saturate(1.0 - abs(uv.x - 0.5) * uWide);
float mask = side * pow(saturate(1.0 - uv.y), uPow);
float heat = saturate((mask - n * uErode) * 2.0);
col = vec3(heat, heat * heat, heat * heat * heat) * 1.3;`;
const fireSpec = (p = {}) => ({ frag: FIRE_FRAG, blend: 'add', uniforms: { uSpeed: p.speed ?? 1.2, uWide: p.wide ?? 2.2, uPow: p.pow ?? 0.7, uErode: p.erode ?? 1 } });
const fireCode = (p = {}) => `float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * ${f(p.speed ?? 1.2, 1)}));
float side = saturate(1.0 - abs(uv.x - 0.5) * ${f(p.wide ?? 2.2, 1)});
float mask = side * pow(saturate(1.0 - uv.y), ${f(p.pow ?? 0.7, 2)});
float heat = saturate((mask - n * ${f(p.erode ?? 1, 2)}) * 2.0);
col = vec3(heat, heat * heat, heat * heat * heat) * 1.3;
// drawn with ADDITIVE blending`;
const RAMPS = [
  { c: 'vec3(h, h * h, h * h * h)', name: 'fire: black → red → orange → yellow → white' },
  { c: 'vec3(h * h * h, h * h, h)', name: 'ice / magic: black → blue → cyan → white' },
  { c: 'vec3(h * h, h, h * h * h)', name: 'toxic: black → green → lime → white' },
  { c: 'vec3(h, h * h * h, h)', name: 'arcane: black → magenta → pink → white' },
  { c: 'vec3(h)', name: 'plain grey: black → white' },
  { c: 'vec3(h, h, h * h * h)', name: 'yellow-ish: black → olive → yellow → white', lvl: 2 },
  { c: 'vec3(h * h, h * h, h)', name: 'pale blue: black → navy → lavender → white', lvl: 3 },
  { c: 'vec3(1.0 - h, h * h, h)', name: 'starts RED at h = 0 (1 − h) and ends cyan', lvl: 3 },
];

const fire = {
  id: 'effects.fire',
  title: 'Fire & flames',
  blurb: 'A shape mask eaten by rising noise, coloured with a heat ramp, drawn additively.',
  lesson: [
    {
      title: 'A flame from scratch',
      body: `<p>Stylised fire (torches, campfires, rocket exhaust) is often just <b>one quad</b> with a shader. No particles, no simulation.</p>
<p>The idea: a soft <b>shape</b> (where fire can be), <b>noise rising</b> through it, the noise <b>eating away</b> the edges, and a <b>colour ramp</b> that turns "heat" into colour.</p>`,
      shader: fireSpec(),
      after: recipe('Fire', FIRE_STEPS),
    },
    {
      title: 'Ingredient 1: the shape mask',
      body: `<p>Two simple gradients multiplied:</p>
<ul><li><code>side</code>: 1 in the middle, 0 at the sides — <code>1 − |uv.x − 0.5| × wide</code></li>
<li>height: 1 at the bottom, 0 at the top — <code>1 − uv.y</code>, with <code>pow</code> to control how fast it fades</li></ul>
<p>Multiplying masks = "both must be true". It's a rough teardrop: the space fire is <i>allowed</i> to fill.</p>`,
      controls: [
        { name: 'w', label: 'wide (bigger = narrower)', min: 1, max: 5, step: 0.1, value: 2.2 },
        { name: 'p', label: 'height power', min: 0.2, max: 3, step: 0.05, value: 0.7 },
      ],
      shader: (v) => ({ frag: 'float side = saturate(1.0 - abs(uv.x - 0.5) * uWide);\nfloat mask = side * pow(saturate(1.0 - uv.y), uPow);\ncol = vec3(mask);', uniforms: { uWide: v.w, uPow: v.p } }),
      code: (v) => `float side = saturate(1.0 - abs(uv.x - 0.5) * ${f(v.w, 1)});\nfloat mask = side * pow(saturate(1.0 - uv.y), ${f(v.p, 2)});\ncol = vec3(mask);`,
      after: recipe('Fire', FIRE_STEPS, 0),
    },
    {
      title: 'Ingredient 2: rising noise',
      body: `<p>Flames rise. So we scroll noise <b>upwards</b>: <code>uv.y * 3.0 − uTime * speed</code>. (Minus = each pixel reads from lower down = features travel up, see the lava lesson.)</p>
<p>The noise is <b>stretched</b>: x × 4 but y × only 3, so blobs are taller than wide — like licks of flame.</p>`,
      controls: [{ name: 's', label: 'rise speed', min: 0, max: 3, step: 0.1, value: 1.2 }],
      shader: (v) => ({ frag: 'float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * uSpeed));\ncol = vec3(n);', uniforms: { uSpeed: v.s } }),
      code: (v) => `float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * ${f(v.s, 1)}));\ncol = vec3(n);`,
      after: recipe('Fire', FIRE_STEPS, 1),
    },
    {
      title: 'Ingredient 3: erode the mask',
      body: `<p>Now <b>subtract</b> the noise from the mask: <code>mask − n × erode</code>.</p>
<p>In the hot core the mask is ~1, so it survives. Near the edges the mask is small, so any bright noise pushes it below 0 → gone. The edge breaks into <b>tongues</b> that rise with the noise.</p>
<p><code>× 2.0</code> then <code>saturate</code> = more contrast (a harder, more "cartoon" edge).</p>`,
      controls: [{ name: 'e', label: 'erode', min: 0, max: 1.5, step: 0.05, value: 1 }],
      shader: (v) => ({ frag: 'float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * 1.2));\nfloat side = saturate(1.0 - abs(uv.x - 0.5) * 2.2);\nfloat mask = side * pow(saturate(1.0 - uv.y), 0.7);\nfloat heat = saturate((mask - n * uErode) * 2.0);\ncol = vec3(heat);', uniforms: { uErode: v.e } }),
      code: (v) => `float heat = saturate((mask - n * ${f(v.e, 2)}) * 2.0);\ncol = vec3(heat);`,
      after: recipe('Fire', FIRE_STEPS, 2),
      quiz: { q: 'Erode = 0. What does the "fire" look like?', options: ['Just the smooth teardrop mask, no tongues', 'Nothing at all', 'Pure noise'], answer: 0, explain: 'mask − n × 0 = mask. The noise only matters once it is subtracted.' },
    },
    {
      title: 'Ingredient 4: the heat ramp',
      body: `<p>Turn heat (0..1) into colour with three curves: <code>vec3(h, h², h³)</code>.</p>
<p>Because squaring a number below 1 makes it smaller, <b>red rises first</b>, green later, blue last:</p>
<ul><li>h = 0.3 → (0.3, 0.09, 0.03) dark red</li><li>h = 0.7 → (0.7, 0.49, 0.34) orange</li><li>h = 1 → (1, 1, 1) white-hot</li></ul>
<p>That's exactly how real hot things glow: red → orange → yellow → white. The graph shows each channel.</p>`,
      shaders: [
        { spec: { frag: 'float h = uv.x;\ncol = vec3(h, h * h, h * h * h) * 1.3;' }, caption: 'ramp, h = uv.x' },
        { spec: fireSpec(), caption: 'on the flame' },
      ],
      graph: { fns: [{ f: (x) => x, label: 'red = h', color: '#ff5c6c' }, { f: (x) => x * x, label: 'green = h²', color: '#3ddc97' }, { f: (x) => x * x * x, label: 'blue = h³', color: '#4fc3f7' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
      code: 'col = vec3(heat, heat * heat, heat * heat * heat) * 1.3;',
      after: recipe('Fire', FIRE_STEPS, 3),
    },
    {
      title: 'Ingredient 5: additive',
      body: `<p>Fire <b>emits light</b>, so it's drawn <b>additively</b>: the black parts of the quad vanish, the flame brightens whatever is behind it, and overlapping flames get brighter — never darker.</p>
<p>Bonus: additive doesn't care about draw order, so many overlapping flames need no sorting.</p>
<p>Play with all the knobs:</p>`,
      controls: [
        { name: 'p', label: 'height power', min: 0.2, max: 2, step: 0.05, value: 0.7 },
        { name: 'e', label: 'erode', min: 0, max: 1.5, step: 0.05, value: 1 },
        { name: 's', label: 'rise speed', min: 0, max: 3, step: 0.1, value: 1.2 },
      ],
      shaders: [
        { spec: (v) => ({ ...fireSpec({ pow: v.p, erode: v.e, speed: v.s }), blend: 'alpha' }), caption: 'opaque' },
        { spec: (v) => fireSpec({ pow: v.p, erode: v.e, speed: v.s }), caption: 'additive' },
      ],
      code: (v) => fireCode({ pow: v.p, erode: v.e, speed: v.s }),
      after: recipe('Fire', FIRE_STEPS, 4),
    },
  ],
  games: [
    {
      id: 'fire-ramp', title: 'Read the ramp', engine: 'mcq', rounds: 8,
      blurb: 'Which colours does this ramp formula make?',
      gen: (rng, level) => {
        const pool = RAMPS.filter((r) => (r.lvl || 1) <= level);
        const opts = rng.pickN(pool, 4);
        const asFlame = level === 3 && rng.chance(0.5);
        const spec = (r) => asFlame
          ? { ...fireSpec(), frag: FIRE_FRAG.replace('vec3(heat, heat * heat, heat * heat * heat)', r.c.replace(/h/g, 'heat')).replace('* 1.3;', ';') }
          : { frag: `float h = uv.x;\ncol = ${r.c};` };
        return {
          prompt: asFlame ? 'Which flame uses this colour ramp?' : 'Which strip does this ramp make? (h goes 0 → 1, left → right)',
          code: `col = ${opts[0].c};`,
          options: opts.map((r) => ({ shader: spec(r) })),
          explain: `<p>${opts[0].name}.</p><p>Trick: the channel with plain <code>h</code> rises first, so it's the first colour you see out of the black. <code>h·h·h</code> rises last.</p>`,
        };
      },
    },
    {
      id: 'fire-fill', title: 'Light the fire', engine: 'codefill', rounds: 4,
      blurb: 'Complete the key line: direction, mask or ramp.',
      gen: (rng, level) => {
        const BASE = 'float n = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * 1.2));\nfloat side = saturate(1.0 - abs(uv.x - 0.5) * 2.2);\nfloat mask = side * pow(saturate(1.0 - uv.y), 0.7);\nfloat heat = saturate((mask - n * 1.0) * 2.0);\ncol = vec3(heat, heat * heat, heat * heat * heat) * 1.3;';
        const V = [
          { tpl: BASE.replace('uv.y * 3.0 - uTime', 'uv.y * 3.0 [[0]] uTime'), slots: [{ options: ['-', '+', '*'], answer: '-' }], why: '<b>Minus</b> time = features move <b>up</b>. Plus would make the flames fall.' },
          { tpl: BASE.replace('pow(saturate(1.0 - uv.y), 0.7)', 'pow(saturate([[0]]), 0.7)'), slots: [{ options: ['1.0 - uv.y', 'uv.y', '1.0', 'uv.x'], answer: '1.0 - uv.y' }], why: 'The fire is strongest at the <b>bottom</b>, so the mask is 1 − uv.y (1 at the bottom, 0 at the top).' },
          { tpl: BASE.replace('mask - n * 1.0', 'mask [[0]] n * 1.0'), slots: [{ options: ['-', '+', '*'], answer: '-' }], why: 'Subtracting noise <b>erodes</b> the mask into tongues. Adding would just make a bigger blurry blob.', lvl: 2 },
          { tpl: BASE.replace('vec3(heat, heat * heat, heat * heat * heat)', 'vec3([[0]], [[1]], heat * heat * heat)'), slots: [{ options: ['heat', 'heat * heat', 'heat * heat * heat'], answer: 'heat' }, { options: ['heat * heat', 'heat', 'heat * heat * heat'], answer: 'heat * heat' }], why: 'Red = heat (rises first), green = heat² (second), blue = heat³ (last).', lvl: 2 },
          { tpl: BASE.replace('float side = saturate(1.0 - abs(uv.x - 0.5) * 2.2);', 'float side = saturate(1.0 - [[0]](uv.x - 0.5) * 2.4);').replace('vec2(uv.x * 4.0, uv.y * 3.0', 'vec2(uv.x * 4.0, [[1]] * 3.0'), slots: [{ options: ['abs', 'sign', 'fract', 'floor'], answer: 'abs' }, { options: ['uv.y', 'uv.x', '1.0'], answer: 'uv.y' }], why: '<code>abs(uv.x − 0.5)</code> is the distance from the centre line (0 in the middle, 0.5 at the sides). The noise must scroll along <b>uv.y</b> (with − uTime) so it rises.', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        return {
          prompt: 'Complete the fire shader to match the target:',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), blend: 'add' }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'fire-tune', title: 'Shape the flame', engine: 'slider', rounds: 4,
      blurb: 'Match flame height, width and erosion.',
      gen: (rng, level) => {
        const t = { pow: rng.step(0.4, 1.6, 0.2), erode: rng.step(0.5, 1.3, 0.1), wide: rng.step(1.6, 3.6, 0.4) };
        const params = [{ name: 'pow', label: 'height power', min: 0.2, max: 2, step: 0.05, target: t.pow }];
        if (level >= 2) params.push({ name: 'erode', label: 'erode', min: 0, max: 1.5, step: 0.05, target: t.erode });
        if (level === 3) params.push({ name: 'wide', label: 'wide (bigger = narrower)', min: 1, max: 5, step: 0.1, target: t.wide });
        const P = (p) => ({ pow: p.pow, erode: p.erode ?? 1, wide: p.wide ?? 2.2, speed: 0.6 });
        return {
          prompt: 'Make your flame match the target.',
          sub: 'Height power: small = tall flame. Erode: more = more broken edges.',
          params,
          build: (p) => fireSpec(P(p)),
          code: (p) => fireCode(P(p)),
          tolerance: 0.06,
          explain: '<p><code>pow(1 − uv.y, p)</code>: with p < 1 the curve stays high for longer → tall flame. p > 1 fades fast → short flame. Erode subtracts more noise → thinner, more broken tongues.</p>',
        };
      },
    },
    {
      id: 'fire-blend', title: 'Which blend mode?', engine: 'buckets', rounds: 2,
      blurb: 'Additive, alpha or multiply? Sort the effects.',
      gen: () => ({
        prompt: 'Which blend mode suits this effect best?',
        sub: 'Additive = adds light. Alpha = covers what\'s behind. Multiply = darkens/tints what\'s behind.',
        buckets: ['➕ Additive', '🅰️ Alpha', '✖️ Multiply'],
        count: 10,
        items: [
          { text: 'Fire', bucket: 0, why: 'Emits light — black parts must vanish.' },
          { text: 'Thick black smoke', bucket: 1, why: 'Smoke blocks light; additive can\'t make anything darker.' },
          { text: 'Hologram', bucket: 0 },
          { text: 'Magic sparks', bucket: 0 },
          { text: 'Dissolving enemy (solid pixels + holes)', bucket: 1, why: 'Solid surface with cut-out holes = alpha (or alpha clip).' },
          { text: 'Leaves on a tree card', bucket: 1 },
          { text: 'A fake blob shadow under a character', bucket: 2, why: 'Darkens what\'s underneath without hiding its detail.' },
          { text: 'Laser beam', bucket: 0 },
          { text: 'Dirt / grime decal tinting a wall', bucket: 2 },
          { text: 'Force field shield', bucket: 0 },
          { text: 'A UI panel with a solid background', bucket: 1 },
          { text: 'Stained glass tinting the light behind it', bucket: 2, why: 'Glass filters: background × glass colour.' },
          { text: 'Muzzle flash', bucket: 0 },
        ],
      }),
    },
  ],
};

// ================================================================ SHIELD
const HEX_DEFS = `// distance to the nearest hexagon border: 0 on the border, 0.5 in the middle
float hexEdge(vec2 p){
  vec2 r = vec2(1.0, 1.7320508);
  vec2 hr = r * 0.5;
  vec2 a = mod(p, r) - hr;
  vec2 b = mod(p - hr, r) - hr;
  vec2 g = abs(dot(a, a) < dot(b, b) ? a : b);
  return 0.5 - max(dot(g, normalize(r)), g.x);
}`;
const SHIELD_STEPS = ['<b>Fresnel rim</b> — the shell glows at its edges', '<b>Hex pattern</b> — thin lines from a hexagon distance function', '<b>Pulse</b> — a travelling band that lights up the hexes', '<b>Additive</b> — it\'s energy: add it on top'];
const SHIELD_FRAG = `${VIEW}
float rim = pow(1.0 - saturate(dot(N, V)), uPow);
float hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0) * uHexScale));
float pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), uSharp);
col = uCol * (rim * 1.3 + hex * (uHex + pulse * 0.9));`;
const shieldSpec = (p = {}) => ({
  frag: p.frag || SHIELD_FRAG, defs: HEX_DEFS, mesh: 'sphere', camera: CAM, blend: p.blend === undefined ? 'add' : p.blend,
  uniforms: { uPow: p.pow ?? 3, uHexScale: p.hexScale ?? 1, uSharp: p.sharp ?? 8, uHex: p.hex ?? 0.12, uCol: p.col || [0.3, 0.6, 1] },
});
const shieldCode = (p = {}) => `vec3 V = normalize(uCamPos - P);
float rim = pow(1.0 - saturate(dot(N, V)), ${f(p.pow ?? 3, 1)});
float hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0) * ${f(p.hexScale ?? 1, 2)}));
float pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), ${f(p.sharp ?? 8, 1)});
col = tint * (rim * 1.3 + hex * (${f(p.hex ?? 0.12, 2)} + pulse * 0.9));`;
const SHIELD_TINTS = [[0.3, 0.6, 1], [0.3, 1, 0.6], [1, 0.45, 0.2], [0.8, 0.4, 1]];

const shield = {
  id: 'effects.shield',
  title: 'Force field / shield',
  blurb: 'Fresnel rim + hexagon lines + a travelling pulse, drawn additively.',
  lesson: [
    {
      title: 'The energy shield',
      body: `<p>Bubble shields, force fields, barrier domes: a <b>glowing shell</b> with a <b>tech pattern</b> and <b>energy pulses</b> rolling across it.</p>
<p>You know every ingredient already — fresnel from lighting, SDF-style lines from shapes, <code>sin</code> + <code>pow</code> from shaping, additive from blending.</p>`,
      shader: shieldSpec(),
      after: recipe('Shield', SHIELD_STEPS),
    },
    {
      title: 'Fresnel: the shell',
      body: `<p>Why do edges of a bubble look brighter? At the silhouette your eye looks through the shell at a <b>grazing angle</b> — through <i>more</i> shield material. Fresnel fakes exactly that.</p>
<pre class="code">rim = pow(1.0 - dot(N, V), p)
// centre: dot = 1   → rim = 0
// edge:   dot = 0   → rim = 1
// halfway dot = 0.5 → rim = 0.5^p</pre>`,
      controls: [{ name: 'p', label: 'power p', min: 0.5, max: 8, step: 0.1, value: 3 }],
      shader: (v) => ({ frag: `${VIEW}\nfloat rim = pow(1.0 - saturate(dot(N, V)), uPow);\ncol = vec3(0.3, 0.6, 1.0) * rim * 1.3;`, mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uPow: v.p } }),
      code: (v) => `float rim = pow(1.0 - saturate(dot(N, V)), ${f(v.p, 1)});\n// at dot = 0.5: rim = ${n(Math.pow(0.5, v.p), 3)}`,
      after: recipe('Shield', SHIELD_STEPS, 0),
    },
    {
      title: 'Hexagon lines',
      body: `<p><code>hexEdge(p)</code> works like an SDF: it returns the <b>distance to the nearest hexagon border</b> — 0 on a border, 0.5 at a cell centre.</p>
<p>Then the usual line trick: <code>1 − smoothstep(0, width, d)</code> is 1 near the border and 0 further in. (Shown flat here first.)</p>`,
      controls: [
        { name: 's', label: 'cells across', min: 2, max: 16, step: 1, value: 6 },
        { name: 'w', label: 'line width', min: 0.01, max: 0.2, step: 0.01, value: 0.05 },
      ],
      shader: (v) => ({ frag: 'float d = hexEdge(uv * uScale);\ncol = vec3(0.3, 0.6, 1.0) * (1.0 - smoothstep(0.0, uW, d));', defs: HEX_DEFS, uniforms: { uScale: v.s, uW: v.w } }),
      code: (v) => `float d = hexEdge(uv * ${f(v.s, 1)});   // 0 on borders\nfloat hex = 1.0 - smoothstep(0.0, ${f(v.w, 2)}, d);\ncol = tint * hex;`,
      after: recipe('Shield', SHIELD_STEPS, 1) + '<p class="small dim">How hexEdge works: hexagons tile like two offset rectangular grids. Find your position in both grids, keep the closer centre, measure the hexagon distance from it. You can treat it as a black box: "distance to the hex border".</p>',
    },
    {
      title: 'The pulse',
      body: `<p>A wave of energy should roll over the shield. <code>sin(P.y × 4 − uTime × 3)</code> is a wave travelling up the sphere; <code>0.5 + 0.5 ×</code> moves it into 0..1.</p>
<p>A sine is too wide and soft. <code>pow(…, sharp)</code> keeps only values near 1: high powers squeeze each crest into a <b>thin bright band</b>. (Graph: the band vs height.)</p>`,
      controls: [{ name: 'k', label: 'sharpness (power)', min: 1, max: 40, step: 1, value: 8 }],
      shader: (v) => ({ frag: 'float pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), uSharp);\ncol = vec3(0.3, 0.6, 1.0) * pulse;', mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uSharp: v.k } }),
      graph: { fns: (v) => [{ f: (x) => 0.5 + 0.5 * Math.sin(x * 4), label: '0.5 + 0.5·sin', color: '#6c7289' }, { f: (x) => Math.pow(0.5 + 0.5 * Math.sin(x * 4), v.k), label: 'pow(…, sharp)' }], opts: { xmin: -1, xmax: 1, ymin: -0.1, ymax: 1.1 } },
      code: (v) => `float pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), ${f(v.k, 1)});`,
      after: recipe('Shield', SHIELD_STEPS, 2),
    },
    {
      title: 'Assemble',
      body: `<p>The hex lines are always a little visible (base), and <b>light up</b> where the pulse passes: <code>hex × (base + pulse)</code>. Add the rim, tint, draw additively.</p>`,
      controls: [
        { name: 'p', label: 'rim power', min: 0.5, max: 8, step: 0.1, value: 3 },
        { name: 'h', label: 'hex base brightness', min: 0, max: 0.5, step: 0.01, value: 0.12 },
        { name: 'k', label: 'pulse sharpness', min: 1, max: 40, step: 1, value: 8 },
      ],
      shader: (v) => shieldSpec({ pow: v.p, hex: v.h, sharp: v.k }),
      code: (v) => shieldCode({ pow: v.p, hex: v.h, sharp: v.k }),
      after: recipe('Shield', SHIELD_STEPS, 3) + '<div class="tip">Real shields also glow where they <b>cut into the ground or walls</b>: compare the scene depth behind the pixel with the pixel\'s own depth; when they are close, add glow. Unreal: <b>DepthFade</b>. Unity: <b>Scene Depth</b> node minus fragment depth.</div>',
      quiz: { q: 'You want the pulse bands to be thinner. What do you change?', options: ['Increase the pow sharpness', 'Increase the rim power', 'Decrease uTime'], answer: 0, explain: 'A higher power keeps only the very top of each sine crest.' },
    },
  ],
  games: [
    {
      id: 'shield-fresnel', title: 'Fresnel calculator', engine: 'numeric', rounds: 5,
      blurb: 'Compute the rim value for a given angle.',
      gen: (rng, level) => {
        if (level === 3) {
          const Ns = [[[0.6, 0, 0.8], 0.8], [[0, 0.6, 0.8], 0.8], [[0.8, 0, 0.6], 0.6], [[0, 0, 1], 1], [[1, 0, 0], 0], [[0.6, 0.8, 0], 0]];
          const [N, d] = rng.pick(Ns);
          const p = rng.pick([1, 2]);
          const ans = +Math.pow(1 - d, p).toFixed(4);
          return {
            prompt: `View direction V = (0, 0, 1). Normal N = ${'(' + N.join(', ') + ')'}. What is <code>pow(1.0 − dot(N, V), ${f(p)})</code>?`,
            sub: 'dot(N, V) = N.x·V.x + N.y·V.y + N.z·V.z',
            answer: ans,
            explain: `<p>dot(N, V) = ${n(d)} → 1 − ${n(d)} = ${n(1 - d)} → ^${p} = <b>${n(ans)}</b>.</p><p>${d > 0.7 ? 'Facing the camera → little rim.' : 'Turned away → strong rim.'}</p>`,
          };
        }
        const pairs = level === 1 ? [[1, 1], [0, 1], [0.5, 1], [0.8, 1], [0.3, 1], [0.9, 1]] : [[0.5, 2], [0.8, 2], [0.7, 2], [0.9, 2], [0.1, 2], [0.2, 2], [0, 3], [1, 3], [0.5, 1]];
        const [d, p] = rng.pick(pairs);
        const ans = +Math.pow(1 - d, p).toFixed(4);
        return {
          prompt: `At this pixel <code>dot(N, V) = ${n(d)}</code>. What is the rim value?`,
          code: `float rim = pow(1.0 - dot(N, V), ${f(p)});`,
          answer: ans,
          explain: `<p>1 − ${n(d)} = ${n(1 - d)}${p > 1 ? `, then to the power ${p} = <b>${n(ans)}</b>` : ` → <b>${n(ans)}</b>`}.</p><p>dot = 1 means facing the camera (centre, no rim); dot = 0 means the silhouette (full rim).</p>`,
        };
      },
    },
    {
      id: 'shield-doctor', title: 'Shield doctor', engine: 'mcq', rounds: 6,
      blurb: 'The shield looks wrong. Which line caused it?',
      gen: (rng, level) => {
        const RIM_OK = 'float rim = pow(1.0 - saturate(dot(N, V)), 3.0);';
        const HEX_OK = 'float hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0)));';
        const PULSE_OK = 'float pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), 8.0);';
        const mk = (rim, hex, pulse) => `${VIEW}\n${rim}\n${hex}\n${pulse}\ncol = uCol * (rim * 1.3 + hex * (0.12 + pulse * 0.9));`;
        const BUGS = [
          { line: 'float rim = pow(saturate(dot(N, V)), 3.0);', frag: mk('float rim = pow(saturate(dot(N, V)), 3.0);', HEX_OK, PULSE_OK), why: 'Without <code>1.0 −</code> the glow is in the <b>centre</b> and the edges are dark — inverted fresnel.' },
          { line: 'float rim = pow(1.0 - saturate(dot(N, V)), 0.2);', frag: mk('float rim = pow(1.0 - saturate(dot(N, V)), 0.2);', HEX_OK, PULSE_OK), why: 'A power below 1 pushes everything towards 1 → the whole ball glows, no distinct rim.' },
          { line: 'float hex = smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0)));', frag: mk(RIM_OK, 'float hex = smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0)));', PULSE_OK), why: 'Missing <code>1.0 −</code>: the cell <b>interiors</b> light up instead of the thin borders.' },
          { line: 'float pulse = 0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0);', frag: mk(RIM_OK, HEX_OK, 'float pulse = 0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0);'), why: 'No <code>pow</code>: the pulse is a wide soft wave lighting most hexes, not thin bands.' },
        ];
        if (level >= 2) BUGS.push({ line: 'float hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(4.0, 2.0)));', frag: mk(RIM_OK, 'float hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(4.0, 2.0)));', PULSE_OK), why: 'The uv scale is far too small → only a few giant hexagons.' });
        const opts = rng.pickN(BUGS, 4);
        const col = rng.pick(SHIELD_TINTS);
        const ref = level < 3;
        return {
          prompt: ref ? 'Left: healthy shield. Right: one line was changed. Which change?' : 'This shield has ONE broken line. Which one?',
          shaders: ref ? [{ spec: shieldSpec({ col }), caption: 'healthy' }, { spec: shieldSpec({ col, frag: opts[0].frag }), caption: 'broken' }] : undefined,
          shader: ref ? undefined : shieldSpec({ col, frag: opts[0].frag }),
          options: opts.map((b) => ({ code: b.line })),
          explain: `<p>${opts[0].why}</p>`,
        };
      },
    },
    {
      id: 'shield-fill', title: 'Build the shield', engine: 'codefill', rounds: 4,
      blurb: 'Complete the rim, hex or pulse line.',
      gen: (rng, level) => {
        const T = `${VIEW}\nfloat rim = pow(1.0 - saturate(dot([[0]], V)), [[1]]);\nfloat hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0)));\nfloat pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), 8.0);\ncol = uCol * (rim * 1.3 + hex * (0.12 + pulse * 0.9));`;
        const T2 = `${VIEW}\nfloat rim = pow(1.0 - saturate(dot(N, V)), 3.0);\nfloat hex = [[0]] - smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0)));\nfloat pulse = [[1]](0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), 8.0);\ncol = uCol * (rim * 1.3 + hex * (0.12 + pulse * 0.9));`;
        const T3 = `${VIEW}\nfloat rim = pow(1.0 - saturate(dot(N, V)), 3.0);\nfloat hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * vec2(24.0, 12.0)));\nfloat pulse = pow(0.5 + 0.5 * sin(P.y * 4.0 - uTime * 3.0), 8.0);\ncol = uCol * ([[0]] * 1.3 + hex * ([[1]] + pulse * 0.9));`;
        const V = [
          { tpl: T, slots: [{ options: ['N', 'P', 'V', 'uCamPos'], answer: 'N' }, { options: ['3.0', '3', '0.3'], answer: '3.0' }], why: 'Fresnel = normal vs view. And <code>3</code> without the dot is an int → compile error.' },
          { tpl: T2, slots: [{ options: ['1.0', '0.0', '0.5'], answer: '1.0' }, { options: ['pow', 'max', 'mod'], answer: 'pow' }], why: '<code>1 − smoothstep</code> flips "far from border" into "on the border". <code>pow</code> sharpens the sine into thin bands.', lvl: 2 },
          { tpl: T3, slots: [{ options: ['rim', 'hex', 'pulse'], answer: 'rim' }, { options: ['0.12', '1.0', '0.0'], answer: '0.12' }], why: 'Rim adds the glowing edges; 0.12 keeps the hex lines faintly visible between pulses (0.0 hides them, 1.0 makes them all bright).', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        const col = rng.pick(SHIELD_TINTS);
        return {
          prompt: 'Complete the shield to match the target:',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), defs: HEX_DEFS, mesh: 'sphere', camera: CAM, blend: 'add', uniforms: { uCol: col } }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'shield-tune', title: 'Tune the shield', engine: 'slider', rounds: 4,
      blurb: 'Match rim power, hex size and pulse sharpness.',
      gen: (rng, level) => {
        const t = { pow: rng.step(1, 6, 1), hexScale: rng.step(0.5, 1.5, 0.25), sharp: rng.step(2, 30, 4) };
        const params = [{ name: 'pow', label: 'rim power', min: 0.5, max: 8, step: 0.1, target: t.pow }];
        if (level >= 2) params.push({ name: 'hexScale', label: 'hex density', min: 0.25, max: 2, step: 0.05, target: t.hexScale });
        if (level === 3) params.push({ name: 'sharp', label: 'pulse sharpness', min: 1, max: 40, step: 1, target: t.sharp });
        const P = (p) => ({ pow: p.pow, hexScale: p.hexScale ?? 1, sharp: p.sharp ?? 8 });
        return {
          prompt: 'Make your shield match the target.',
          sub: 'Rim power: higher = thinner glowing edge.',
          params,
          build: (p) => shieldSpec(P(p)),
          code: (p) => shieldCode(P(p)),
          tolerance: 0.06,
          explain: '<p>Compare the width of the bright edge (rim power), count the hexagons (density), and the thickness of the moving bands (sharpness).</p>',
        };
      },
    },
  ],
};

// ================================================================ TOON
const TOON_DEFS = `vec3 ballN(vec2 uv){ vec2 p = (uv * 2.0 - 1.0) * 1.25; return vec3(p, sqrt(max(0.0, 1.0 - dot(p, p)))); }
float ballR(vec2 uv){ return length((uv * 2.0 - 1.0) * 1.25); }`;
const TOON_SHADOW = 'vec3(0.16, 0.12, 0.35)', TOON_LIT = 'vec3(1.0, 0.62, 0.4)';
/** Full toon frag; band line + optional rim/outline chosen by params (as literal code). */
const toonFrag = (bandLine, { rim = true, out = 0.08, ramp = false } = {}) => `vec3 Nn = ballN(uv);          // fake sphere normal
float r = ballR(uv);           // distance from centre (1 = silhouette)
vec3 L = normalize(vec3(cos(uAng), sin(uAng), 0.8));
float ndl = max(dot(Nn, L), 0.0);
${bandLine}
vec3 c = ${ramp ? 'texture2D(uRamp, vec2(band, 0.5)).rgb' : `mix(${TOON_SHADOW}, ${TOON_LIT}, band)`};
${rim ? 'c += step(0.75, 1.0 - Nn.z) * step(0.3, ndl) * 0.4;   // rim light' : ''}
float hull = step(r, 1.0 + ${f(out, 2)});   // bigger black copy behind
col = mix(vec3(0.85, 0.85, 0.8), vec3(0.05), hull);
col = mix(col, c, step(r, 1.0));`;
const TOON_FRAG_U = `vec3 Nn = ballN(uv);
float r = ballR(uv);
vec3 L = normalize(vec3(cos(uAng), sin(uAng), 0.8));
float ndl = max(dot(Nn, L), 0.0);
float band = min(floor(ndl * uBands) / (uBands - 1.0), 1.0);
vec3 c = mix(${TOON_SHADOW}, ${TOON_LIT}, band);
c += step(uRimT, 1.0 - Nn.z) * step(0.3, ndl) * 0.4;
float hull = step(r, 1.0 + uOut);
col = mix(vec3(0.85, 0.85, 0.8), vec3(0.05), hull);
col = mix(col, c, step(r, 1.0));`;
const toonSpec = (p = {}) => ({ frag: TOON_FRAG_U, defs: TOON_DEFS, uniforms: { uAng: p.ang ?? 2.2, uBands: p.bands ?? 3, uRimT: p.rim === false ? 2 : 0.75, uOut: p.out ?? 0.08 } });
const toonCode = (p = {}) => `float ndl = max(dot(N, L), 0.0);   // light angle ${n(p.ang ?? 2.2, 2)} rad
float band = min(floor(ndl * ${f(p.bands ?? 3)}) / ${f((p.bands ?? 3) - 1)}, 1.0);
vec3 c = mix(shadowCol, litCol, band);
c += step(0.75, 1.0 - dot(N, V)) * step(0.3, ndl) * 0.4;  // rim
// outline: hull ${n(p.out ?? 0.08)} bigger, drawn black behind`;
const TOON_STEPS = ['<b>Lambert</b> — <code>N·L</code> as usual', '<b>Quantise</b> — <code>floor()</code> the light into a few flat bands', '<b>Colours</b> — mix shadow/lit colours (or a ramp texture)', '<b>Rim light</b> — a hard bright edge on the lit side', '<b>Outline</b> — the inverted hull: a bigger black copy behind'];

const toon = {
  id: 'effects.toon',
  title: 'Toon shading & outlines',
  blurb: 'Lighting in flat bands, a hard rim, and the inverted-hull outline.',
  lesson: [
    {
      title: 'Cartoon lighting',
      body: `<p>Toon (cel) shading is what makes games look like an animated film: light in <b>flat bands</b> instead of smooth gradients, crisp highlights, and <b>ink outlines</b>.</p>
<p>It starts with the same lighting you know (<code>N·L</code>) and just <i>reshapes</i> it with shaping functions.</p>
<p class="small dim">To keep it cheap we fake a sphere on a flat square (like the <code>sphereNormal</code> helper), so we can also fake the outline.</p>`,
      shader: toonSpec(),
      after: recipe('Toon', TOON_STEPS),
    },
    {
      title: 'Start smooth: N·L',
      body: `<p>Plain Lambert: <code>ndl = max(dot(N, L), 0.0)</code>. 1 where the surface faces the light, fading to 0 at 90°.</p>
<p>Move the light around. This smooth gradient is what we're about to <b>chop into steps</b>.</p>`,
      controls: [{ name: 'a', label: 'light angle', min: 0, max: 6.28, step: 0.01, value: 2.2 }],
      shader: (v) => ({ frag: 'vec3 Nn = ballN(uv);\nfloat r = ballR(uv);\nvec3 L = normalize(vec3(cos(uAng), sin(uAng), 0.8));\nfloat ndl = max(dot(Nn, L), 0.0);\ncol = mix(vec3(0.85, 0.85, 0.8), vec3(ndl), step(r, 1.0));', defs: TOON_DEFS, uniforms: { uAng: v.a } }),
      code: (v) => `vec3 L = normalize(vec3(cos(${f(v.a, 2)}), sin(${f(v.a, 2)}), 0.8));\nfloat ndl = max(dot(N, L), 0.0);\ncol = vec3(ndl);`,
      after: recipe('Toon', TOON_STEPS, 0),
    },
    {
      title: 'Bands with floor()',
      body: `<p><code>floor(ndl × k)</code> turns the smooth 0..1 into whole numbers 0, 1, …, k−1 (and k only at exactly 1). Dividing by <code>k − 1</code> brings them back to 0..1.</p>
<pre class="code">k = 3:  ndl 0.00–0.33 → 0   (shadow)
        ndl 0.33–0.66 → 0.5 (mid)
        ndl 0.66–1.00 → 1   (lit)</pre>
<p>The graph is the <b>staircase</b> that replaces the smooth ramp.</p>`,
      controls: [
        { name: 'k', label: 'bands k', min: 2, max: 6, step: 1, value: 3 },
        { name: 'a', label: 'light angle', min: 0, max: 6.28, step: 0.01, value: 2.2 },
      ],
      shader: (v) => ({ frag: 'vec3 Nn = ballN(uv);\nfloat r = ballR(uv);\nvec3 L = normalize(vec3(cos(uAng), sin(uAng), 0.8));\nfloat ndl = max(dot(Nn, L), 0.0);\nfloat band = min(floor(ndl * uBands) / (uBands - 1.0), 1.0);\ncol = mix(vec3(0.85, 0.85, 0.8), vec3(band), step(r, 1.0));', defs: TOON_DEFS, uniforms: { uAng: v.a, uBands: v.k } }),
      graph: { fns: (v) => [{ f: (x) => x, label: 'ndl', color: '#6c7289' }, { f: (x) => Math.min(Math.floor(x * v.k) / (v.k - 1), 1), label: 'band' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.1 } },
      code: (v) => `float band = min(floor(ndl * ${f(v.k)}) / ${f(v.k - 1)}, 1.0);\ncol = vec3(band);`,
      after: recipe('Toon', TOON_STEPS, 1),
      quiz: { q: 'k = 3 and ndl = 0.7. What is band?', options: ['0.5', '1.0', '0.7'], answer: 1, explain: 'floor(0.7 × 3) = floor(2.1) = 2. 2 / (3 − 1) = 1.0 → fully lit band.' },
    },
    {
      title: 'Colours, not greys',
      body: `<p>Bands of grey look like a printer test. Use <code>band</code> to <b>mix two artist colours</b>: a cool shadow and a warm light — <code>mix(shadowCol, litCol, band)</code>.</p>
<p>Alternative (right): a <b>ramp texture</b>. Use <code>ndl</code> as the x coordinate into a strip the artist painted with hard colour bands. Same idea as the lava gradient map!</p>`,
      controls: [{ name: 'a', label: 'light angle', min: 0, max: 6.28, step: 0.01, value: 2.2 }],
      shaders: [
        { spec: (v) => ({ ...toonSpec({ ang: v.a, rim: false, out: 0 }) }), caption: 'mix(shadow, lit, band)' },
        { spec: (v) => ({ frag: toonFrag('float band = ndl;   // the ramp does the banding', { rim: false, out: 0, ramp: true }), defs: TOON_DEFS, textures: { uRamp: { name: 'toonramp', filter: 'nearest', wrap: 'clamp' } }, uniforms: { uAng: v.a } }), caption: 'ramp texture' },
      ],
      code: 'vec3 c = mix(vec3(0.16, 0.12, 0.35), vec3(1.0, 0.62, 0.4), band);\n// or:  vec3 c = texture2D(uRamp, vec2(ndl, 0.5)).rgb;',
      after: recipe('Toon', TOON_STEPS, 2) + '<div class="tip">Shadow colours are usually <b>not</b> black: a saturated, cooler hue looks far more "illustrated". Genshin/Zelda-style toon shaders are mostly about choosing these ramps.</div>',
    },
    {
      title: 'Rim light',
      body: `<p>A toon rim is a <b>hard</b> fresnel: <code>step(t, 1.0 − dot(N, V))</code> is 1 only near the silhouette. Multiplying by <code>step(0.3, ndl)</code> keeps it on the <b>lit side</b> only, like a back-light catching the edge.</p>
<p>(On our fake sphere the view direction is (0, 0, 1), so <code>dot(N, V)</code> is just <code>N.z</code>.)</p>`,
      controls: [{ name: 't', label: 'rim threshold t', min: 0.4, max: 1, step: 0.01, value: 0.75 }],
      shader: (v) => ({ frag: TOON_FRAG_U, defs: TOON_DEFS, uniforms: { uAng: 2.2, uBands: 3, uRimT: v.t, uOut: 0 } }),
      code: (v) => `c += step(${f(v.t, 2)}, 1.0 - dot(N, V)) * step(0.3, ndl) * 0.4;`,
      after: recipe('Toon', TOON_STEPS, 3),
    },
    {
      title: 'Outline: the inverted hull',
      body: `<p>The classic game outline: draw the mesh <b>a second time</b>, slightly <b>bigger</b>, in flat black, <i>behind</i> the character.</p>
<ol><li><b>Vertex shader</b>: push every vertex out along its normal: <code>pos += normal * width;</code></li>
<li><b>Cull front faces</b> (instead of back faces): you only see the <i>inside</i> of this inflated shell. Where the character is, the character covers it; only the rim that sticks out around the silhouette remains.</li>
<li><b>Fragment shader</b>: output black.</li></ol>
<p>Here we fake the bigger copy in 2D. Move the width:</p>`,
      controls: [{ name: 'w', label: 'outline width', min: 0, max: 0.2, step: 0.005, value: 0.08 }],
      shader: (v) => toonSpec({ out: v.w }),
      code: (v) => `// outline pass (2nd draw of the same mesh)\n// vertex:\npos += normal * ${f(v.w, 3)};\n// render state: Cull Front\n// fragment:\ncol = vec3(0.0);`,
      after: recipe('Toon', TOON_STEPS, 4) + '<div class="tip">Unity: a second <code>Pass { Cull Front … }</code> in the shader. Other options: a <b>post-process</b> outline that finds edges in the depth/normal buffers (great for whole scenes), or a cheap fresnel-based outline (uneven thickness).</div>',
      quiz: { q: 'Why cull the FRONT faces of the hull?', options: ['Otherwise the black hull would cover the whole character', 'Front faces are slower to draw', 'To make the outline thicker'], answer: 0, explain: 'The hull is bigger, so its front faces are in front of the character. Culling them leaves only the back faces, which are behind the character and only peek out at the silhouette.' },
    },
  ],
  games: [
    {
      id: 'toon-band', title: 'Be the GPU: bands', engine: 'numeric', rounds: 5,
      blurb: 'Compute the band value from ndl and the number of bands.',
      gen: (rng, level) => {
        const k = level === 1 ? 2 : level === 2 ? rng.pick([3, 4]) : rng.pick([3, 4, 5]);
        let ndl;
        do { ndl = rng.step(0.05, 0.98, 0.01); } while (Math.abs(ndl * k - Math.round(ndl * k)) < 0.08);
        const fl = Math.floor(ndl * k);
        const ans = Math.min(fl / (k - 1), 1);
        return {
          prompt: `<code>ndl = ${n(ndl)}</code>. What is <code>band</code>?`,
          code: `float band = min(floor(ndl * ${f(k)}) / ${f(k - 1)}, 1.0);`,
          sub: 'Two decimals are enough (e.g. 0.33).',
          answer: +ans.toFixed(4),
          explain: `<p>${n(ndl)} × ${k} = ${n(ndl * k)} → floor = ${fl} → ${fl} / ${k - 1} = <b>${n(ans, 2)}</b>.</p><p>With ${k} bands the possible values are ${Array.from({ length: k }, (_, i) => n(i / (k - 1), 2)).join(', ')}.</p>`,
        };
      },
    },
    {
      id: 'toon-which', title: 'Image → shading code', engine: 'mcq', rounds: 8,
      blurb: 'Look at the shading and pick the band line that made it.',
      gen: (rng, level) => {
        const LINES = [
          'float band = ndl;',
          'float band = min(floor(ndl * 3.0) / 2.0, 1.0);',
          'float band = min(floor(ndl * 5.0) / 4.0, 1.0);',
          'float band = step(0.25, ndl);',
          'float band = min(floor(ndl * 4.0) / 3.0, 1.0);',
          'float band = min(floor(ndl * 2.0) / 1.0, 1.0);',
        ];
        const pool = level === 1 ? [LINES[0], LINES[1], LINES[2], LINES[3]] : LINES;
        let opts = rng.pickN(pool, 4);
        const ang = rng.pick([0.8, 2.2, 3.9, 5.2]);
        const extra = level === 3 ? { rim: rng.chance(), out: rng.pick([0, 0.06, 0.12]) } : { rim: false, out: 0.06 };
        return {
          prompt: 'Which band line made this shading?',
          sub: level === 1 ? 'Count the flat bands. A smooth gradient means no banding at all.' : 'Count the bands and look at where the shadow edge sits.',
          shader: { frag: toonFrag(opts[0], extra), defs: TOON_DEFS, uniforms: { uAng: ang } },
          options: opts.map((l) => ({ code: l })),
          explain: '<p><code>floor(ndl·k)/(k−1)</code> gives k bands. <code>step(t, ndl)</code> gives 2 tones with the edge where ndl = t (small t = mostly lit). Plain <code>ndl</code> = smooth, no bands.</p>',
        };
      },
    },
    {
      id: 'toon-tune', title: 'Match the toon', engine: 'slider', rounds: 4,
      blurb: 'Match the number of bands, the light direction and the outline.',
      gen: (rng, level) => {
        const t = { bands: rng.int(2, 6), ang: rng.step(0.3, 6, 0.3), out: rng.step(0.02, 0.16, 0.02) };
        const params = [{ name: 'bands', label: 'bands k', min: 2, max: 6, step: 1, target: t.bands }];
        if (level >= 2) params.push({ name: 'ang', label: 'light angle', min: 0, max: 6.28, step: 0.01, target: t.ang });
        if (level === 3) params.push({ name: 'out', label: 'outline width', min: 0, max: 0.2, step: 0.005, target: t.out });
        const P = (p) => ({ bands: p.bands, ang: p.ang ?? 2.2, out: p.out ?? 0.08 });
        return {
          prompt: 'Make your toon ball match the target.',
          sub: 'Count the bands of colour. Then find where the light comes from.',
          params,
          build: (p) => toonSpec(P(p)),
          code: (p) => toonCode(P(p)),
          tolerance: 0.04,
          explain: '<p>k bands → k flat tones. The brightest band points towards the light.</p>',
        };
      },
    },
    {
      id: 'toon-order', title: 'Order the toon passes', engine: 'order', rounds: 3,
      blurb: 'Put the toon shader and the inverted-hull outline in order.',
      gen: (rng) => rng.pick([
        { prompt: 'Order the inverted-hull outline technique:', items: ['Draw the character with toon shading (normal pass)', 'Draw the same mesh a second time (outline pass)', 'Vertex shader: push each vertex out along its normal', 'Rasterise with FRONT faces culled', 'Fragment shader: output flat black'], explain: 'Inside a pass the GPU always goes vertex shader → rasterise (where culling happens) → fragment shader.' },
        { prompt: 'Order the toon shading lines:', items: [{ code: 'float ndl = max(dot(N, L), 0.0);' }, { code: 'float band = floor(ndl * 3.0) / 2.0;' }, { code: 'vec3 c = mix(uShadow, uLit, band);' }, { code: 'c += step(0.75, 1.0 - dot(N, V)) * 0.4;' }, { code: 'col = c;' }], explain: 'Light → quantise → colour → add rim → output.' },
      ]),
    },
  ],
};

// ================================================================ WATER
const WATER_STEPS = ['<b>Depth colour</b> — shallow turquoise → deep blue', '<b>UV distortion</b> — wobble coordinates with scrolling noise', '<b>Scrolling normals</b> — two wave layers → sparkles', '<b>Foam</b> — noise threshold near the shore'];
// Two scrolling height layers; the normal is the slope of their sum.
// (In an engine you'd scroll a water normal-map texture twice instead.)
const WATER_DEFS = `float layerA(vec2 p){ return vnoise(p * 12.0 + vec2(uTime * 0.6, 0.0)); }
float layerB(vec2 p){ return vnoise(p * 17.0 - vec2(0.0, uTime * 0.7)); }
float waves(vec2 p, float two){ return layerA(p) + layerB(p) * two; }
vec3 waveNormal(vec2 p, float two){
  float e = 0.004;
  float h = waves(p, two);
  float dx = waves(p + vec2(e, 0.0), two) - h;
  float dy = waves(p + vec2(0.0, e), two) - h;
  return normalize(vec3(-dx, -dy, e * 25.0));   // slope → tilted normal
}`;
const WATER_FRAG = `vec2 off = (vec2(vnoise(uv * 8.0 + uTime * 0.6), vnoise(uv * 8.0 - uTime * 0.5 + 4.0)) - 0.5) * uStr;
vec2 wuv = uv + off;
float d = length(wuv - 0.5) * 2.0 + (vnoise(wuv * 5.0) - 0.5) * 0.3;
float depth = saturate((d - 0.4) / uRange);
vec3 water = mix(vec3(0.25, 0.85, 0.8), vec3(0.02, 0.12, 0.38), depth);
vec3 wn = waveNormal(uv, 1.0);
float spec = pow(saturate(dot(wn, normalize(vec3(0.4, 0.5, 1.0)))), 40.0);
float foam = step(vnoise(uv * 40.0 + uTime * 0.4), 1.0 - depth / uFoam);
vec3 c = saturate(water + spec * uSpec + foam);
col = d < 0.4 ? vec3(0.9, 0.8, 0.55) : c;`;
const waterSpec = (p = {}) => ({ frag: WATER_FRAG, defs: WATER_DEFS, uniforms: { uStr: p.str ?? 0.04, uRange: p.range ?? 0.5, uFoam: p.foam ?? 0.2, uSpec: p.spec ?? 0.8 } });
const waterCode = (p = {}) => `vec2 off = (noise2(uv * 8.0 + time) - 0.5) * ${f(p.str ?? 0.04, 3)};   // distortion
float d = distanceFromIsland(uv + off);
float depth = saturate((d - 0.4) / ${f(p.range ?? 0.5, 2)});
vec3 water = mix(shallowCol, deepCol, depth);
vec3 wn = waveNormal(uv);   // slope of two scrolling layers
float spec = pow(saturate(dot(wn, L)), 40.0);
float foam = step(vnoise(uv * 40.0 + uTime * 0.4), 1.0 - depth / ${f(p.foam ?? 0.2, 2)});
col = water + spec * ${f(p.spec ?? 0.8, 1)} + foam;`;
const DEPTH_ONLY = `float d = length(uv - 0.5) * 2.0 + (vnoise(uv * 5.0) - 0.5) * 0.3;
float depth = saturate((d - 0.4) / uRange);
vec3 water = mix(vec3(0.25, 0.85, 0.8), vec3(0.02, 0.12, 0.38), depth);`;

const water = {
  id: 'effects.water',
  title: 'Water surface',
  blurb: 'Depth colour, UV distortion, scrolling normals and shoreline foam.',
  lesson: [
    {
      title: 'A stylised lagoon',
      body: `<p>Water is a <b>stack of four layers</b>, each simple on its own. Here: a top-down lagoon around a sandy island.</p>
<p>Look for: <b>colour</b> that gets darker with depth, <b>wobble</b> on the shoreline, little <b>sparkles</b> moving across, and <b>foam</b> hugging the beach.</p>`,
      shader: waterSpec(),
      after: recipe('Water', WATER_STEPS),
    },
    {
      title: 'Layer 1: depth colour',
      body: `<p>Light gets absorbed as it travels through water, so <b>deep = dark blue</b> and <b>shallow = bright turquoise</b> (you see the sand through it).</p>
<p>So we need a "depth" value 0..1 and a <code>mix</code>. In a real engine, depth = <i>scene depth behind the water − depth of the water surface</i>. Here we fake it with the distance from the island (+ a little noise so the coast isn't a perfect circle).</p>
<p><b>range</b> = how far from the shore the water becomes fully deep.</p>`,
      controls: [{ name: 'r', label: 'range', min: 0.05, max: 1, step: 0.01, value: 0.5 }],
      shader: (v) => ({ frag: `${DEPTH_ONLY}\ncol = d < 0.4 ? vec3(0.9, 0.8, 0.55) : water;`, uniforms: { uRange: v.r } }),
      code: (v) => `float depth = saturate((d - 0.4) / ${f(v.r, 2)});\nvec3 water = mix(shallowCol, deepCol, depth);`,
      after: recipe('Water', WATER_STEPS, 0) + '<div class="tip">Unreal: <b>SceneDepth − PixelDepth</b> (or DepthFade). Unity URP: <b>Scene Depth</b> node (Eye) minus the fragment\'s eye depth. Needs the depth texture enabled.</div>',
    },
    {
      title: 'Layer 2: UV distortion',
      body: `<p>Looking through moving water, the world behind it <b>wobbles</b>. We fake that by adding a small, moving <b>offset</b> to the coordinates before sampling.</p>
<p>Two noise values (one for x, one for y) scroll with time. <code>− 0.5</code> centres them so the offset goes both ways (−0.5..0.5) instead of always pushing up-right. Times <b>strength</b> keeps it tiny.</p>
<p>Shown on a photo so you can see the bending:</p>`,
      controls: [{ name: 's', label: 'strength', min: 0, max: 0.15, step: 0.005, value: 0.04 }],
      shader: (v) => ({ frag: 'vec2 off = (vec2(vnoise(uv * 8.0 + uTime * 0.6), vnoise(uv * 8.0 - uTime * 0.5 + 4.0)) - 0.5) * uStr;\ncol = texture2D(uTex, uv + off).rgb;', textures: { uTex: 'photo' }, uniforms: { uStr: v.s } }),
      code: (v) => `vec2 off = (vec2(vnoise(uv * 8.0 + uTime * 0.6),\n                vnoise(uv * 8.0 - uTime * 0.5 + 4.0)) - 0.5) * ${f(v.s, 3)};\ncol = texture2D(uTex, uv + off).rgb;`,
      after: recipe('Water', WATER_STEPS, 1),
      quiz: { q: 'What happens without the "− 0.5"?', options: ['The whole image shifts up-right, plus wobble', 'Nothing changes', 'The wobble stops'], answer: 0, explain: 'vnoise is 0..1, so the offset would always be positive: every pixel gets pushed the same general direction.' },
    },
    {
      title: 'Layer 3: scrolling normals',
      body: `<p>Small waves are mostly about <b>light</b>: their tilted surfaces catch the sun → sparkles. We need a <b>normal</b> per pixel and then light it.</p>
<p>In an engine you'd sample a water <b>normal-map texture</b> (decode <code>× 2 − 1</code>). Here we build the same thing from noise: a height field, and its <b>slope</b> = how much the normal tilts.</p>
<p>One scrolling layer looks like a sliding sticker. <b>Two layers</b> at different scales, scrolling different ways, added and normalised → the bumps interfere and the pattern never repeats exactly. (Same trick as the lava!)</p>`,
      controls: [{ name: 't', label: 'second layer (0 = off, 1 = on)', min: 0, max: 1, step: 1, value: 1 }],
      shader: (v) => ({ defs: WATER_DEFS, frag: 'vec3 wn = waveNormal(uv, uTwo);\nfloat spec = pow(saturate(dot(wn, normalize(vec3(0.4, 0.5, 1.0)))), 40.0);\nfloat diff = saturate(dot(wn, normalize(vec3(0.4, 0.5, 1.0))));\ncol = vec3(0.02, 0.12, 0.38) * (0.6 + 0.6 * diff) + spec;', uniforms: { uTwo: v.t } }),
      code: (v) => `float layerA(vec2 p) { return vnoise(p * 12.0 + vec2(uTime * 0.6, 0.0)); }\nfloat layerB(vec2 p) { return vnoise(p * 17.0 - vec2(0.0, uTime * 0.7)); }\n// height = ${v.t ? 'layerA + layerB' : 'layerA only'}\nvec3 wn = normal from the slope of the height;\nfloat spec = pow(saturate(dot(wn, L)), 40.0);\ncol = deepCol * (0.6 + 0.6 * diffuse) + spec;`,
      after: recipe('Water', WATER_STEPS, 2) + '<p class="small dim">Engine version: <code>vec3 n1 = texture2D(uNrm, uv * 3.0 + t * dirA).rgb * 2.0 - 1.0;</code> and the same with another scale/direction for n2, then <code>normalize(n1 + n2)</code>.</p>',
    },
    {
      title: 'Layer 4: shoreline foam',
      body: `<p>Foam collects where water is <b>shallow</b>. It's the <b>dissolve trick</b> again: compare noise with a threshold — but the threshold <b>depends on depth</b>.</p>
<pre class="code">threshold = 1.0 - depth / foamWidth
// at the shore (depth 0):  1.0 → almost all noise passes → solid foam
// further out:  smaller → only the darkest noise passes → foam breaks up
// beyond foamWidth: negative → no foam</pre>`,
      controls: [{ name: 'w', label: 'foam width', min: 0.01, max: 0.4, step: 0.01, value: 0.2 }],
      shader: (v) => ({ frag: `${DEPTH_ONLY}\nfloat foam = step(vnoise(uv * 40.0 + uTime * 0.4), 1.0 - depth / uFoam);\ncol = d < 0.4 ? vec3(0.9, 0.8, 0.55) : saturate(water + foam);`, uniforms: { uRange: 0.5, uFoam: v.w } }),
      code: (v) => `float foam = step(vnoise(uv * 40.0 + uTime * 0.4), 1.0 - depth / ${f(v.w, 2)});\ncol = water + foam;`,
      after: recipe('Water', WATER_STEPS, 3),
    },
    {
      title: 'All four layers',
      body: `<p>Distortion is applied to the coordinates <b>before</b> depth is computed, so the shoreline wobbles. Then colour + sparkles + foam.</p>
<p>Each slider controls exactly one layer — that's the beauty of building effects as layers: easy to tune, easy to debug (turn one off and see).</p>`,
      controls: [
        { name: 'r', label: 'depth range', min: 0.05, max: 1, step: 0.01, value: 0.5 },
        { name: 's', label: 'distortion', min: 0, max: 0.12, step: 0.005, value: 0.04 },
        { name: 'p', label: 'sparkle', min: 0, max: 2, step: 0.05, value: 0.8 },
        { name: 'w', label: 'foam width', min: 0.01, max: 0.4, step: 0.01, value: 0.2 },
      ],
      shader: (v) => waterSpec({ range: v.r, str: v.s, spec: v.p, foam: v.w }),
      code: (v) => waterCode({ range: v.r, str: v.s, spec: v.p, foam: v.w }),
    },
  ],
  games: [
    {
      id: 'water-layers', title: 'Which water layer?', engine: 'buckets', rounds: 2,
      blurb: 'Sort code and descriptions into the four water layers.',
      gen: () => ({
        prompt: 'Which water layer is this?',
        buckets: ['🎨 Depth colour', '〰️ Distortion', '✨ Normals', '🫧 Foam'],
        count: 10,
        items: [
          { code: 'mix(shallowCol, deepCol, depth)', bucket: 0 },
          { code: 'texture2D(uTex, uv + off)', bucket: 1, why: 'Sampling with an offset = bending what you see.' },
          { code: 'texture2D(uNrm, uv * 3.0 + t).rgb * 2.0 - 1.0', bucket: 2, why: 'Decoding a normal map: 0..1 → −1..1.' },
          { code: 'step(noise, 1.0 - depth / 0.12)', bucket: 3, why: 'Noise vs a depth-dependent threshold.' },
          { text: 'Water gets darker further from the beach', bucket: 0 },
          { text: 'The sand under the water wobbles', bucket: 1 },
          { text: 'Little highlights glinting in the sun', bucket: 2 },
          { text: 'White bits that break up away from the shore', bucket: 3 },
          { code: '(vec2(vnoise(p), vnoise(p + 4.0)) - 0.5) * 0.04', bucket: 1, why: 'A small centred offset vector.' },
          { code: 'pow(saturate(dot(wn, L)), 40.0)', bucket: 2, why: 'Specular from the wave normals.' },
          { text: 'Needs scene depth − surface depth in a real engine', bucket: 0, why: 'Depth colour (foam usually uses it too, but the colour gradient is the direct use).' },
          { code: 'normalize(n1 + n2)', bucket: 2, why: 'Combining two scrolling normal layers.' },
        ],
      }),
    },
    {
      id: 'water-tune', title: 'Match the lagoon', engine: 'slider', rounds: 4,
      blurb: 'Tune depth range, foam width and distortion.',
      gen: (rng, level) => {
        const t = { range: rng.step(0.15, 0.9, 0.05), foam: rng.step(0.04, 0.3, 0.02), str: rng.step(0, 0.08, 0.02) };
        const params = [{ name: 'range', label: 'depth range', min: 0.05, max: 1, step: 0.01, target: t.range }];
        if (level >= 2) params.push({ name: 'foam', label: 'foam width', min: 0.01, max: 0.4, step: 0.01, target: t.foam });
        if (level === 3) params.push({ name: 'str', label: 'distortion', min: 0, max: 0.12, step: 0.005, target: t.str });
        const P = (p) => ({ range: p.range, foam: p.foam ?? 0.2, str: p.str ?? 0.03 });
        return {
          prompt: 'Make your lagoon match the target.',
          sub: 'Range: how quickly turquoise turns to deep blue. Foam: how far the white reaches.',
          params,
          build: (p) => waterSpec(P(p)),
          code: (p) => waterCode(P(p)),
          tolerance: 0.06,
          explain: '<p>Small range = the water gets deep right at the beach. Foam width is measured in the same depth units, so foam and colour are linked: a big range spreads the shallow zone — and the foam with it.</p>',
        };
      },
    },
    {
      id: 'water-fill', title: 'Fill the water', engine: 'codefill', rounds: 4,
      blurb: 'Complete the depth colour, distortion or foam line.',
      gen: (rng, level) => {
        const V = [
          { tpl: `${DEPTH_ONLY.replace('mix(vec3(0.25, 0.85, 0.8), vec3(0.02, 0.12, 0.38), depth)', 'mix([[0]], [[1]], depth)')}\ncol = d < 0.4 ? vec3(0.9, 0.8, 0.55) : water;`, slots: [{ options: ['uShallow', 'uDeep', 'uSand'], answer: 'uShallow' }, { options: ['uDeep', 'uShallow', 'uSand'], answer: 'uDeep' }], why: 'mix(a, b, t) gives a at t = 0 (shore, shallow) and b at t = 1 (deep).' },
          { tpl: 'vec2 off = (vec2(vnoise(uv * 8.0 + uTime * 0.6), vnoise(uv * 8.0 - uTime * 0.5 + 4.0)) - [[0]]) * 0.05;\ncol = texture2D(uTex, uv + [[1]]).rgb;', slots: [{ options: ['0.5', '1.0', '0.0'], answer: '0.5' }, { options: ['off', 'off * 0.0', 'uv'], answer: 'off' }], why: '−0.5 centres the noise so the offset wobbles both ways; then add the offset to uv before sampling.', tex: true },
          { tpl: `${DEPTH_ONLY}\nfloat foam = step(vnoise(uv * 40.0 + uTime * 0.4), 1.0 - [[0]] / 0.15);\ncol = d < 0.4 ? vec3(0.9, 0.8, 0.55) : saturate(water + [[1]]);`, slots: [{ options: ['depth', 'd', 'uv.x', '1.0'], answer: 'depth' }, { options: ['foam', 'depth', '1.0 - foam'], answer: 'foam' }], why: 'Foam threshold shrinks with <b>depth</b> (0 at the shore). Then add the foam on top of the water colour.', lvl: 2 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        const uniforms = { uRange: 0.5, uShallow: [0.25, 0.85, 0.8], uDeep: [0.02, 0.12, 0.38], uSand: [0.9, 0.8, 0.55] };
        return {
          prompt: 'Complete the water shader to match the target:',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), uniforms, textures: vr.tex ? { uTex: 'photo' } : undefined }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'effect-doctor', title: 'Effect doctor', engine: 'mcq', rounds: 8,
      blurb: 'Symptom → cause. Debug water and other effects.',
      questions: [
        q('Your water texture slides as one rigid sheet and looks fake. Best fix?', ['Add a second layer at another scale, scrolling another direction', 'Scroll it faster', 'Make the texture bigger'], 'Two layers interfering = shapes that change over time instead of a sliding sticker.'),
        q('The distortion shifts the whole image up-right instead of wobbling.', ['The noise offset isn\'t centred: subtract 0.5', 'The strength is too small', 'The normal map is upside down'], 'vnoise is 0..1. (n − 0.5) is −0.5..0.5 → both directions.'),
        q('Foam covers the entire lake, not just the shore.', ['The foam threshold doesn\'t fall off with depth (foam width too big)', 'The noise scale is too small', 'Additive blending is on'], 'Foam must depend on depth: 1 − depth / width becomes negative away from shore.'),
        q('The water is the same colour everywhere.', ['The depth value isn\'t used in the mix (or is constant)', 'The normal map is missing', 'uTime is zero'], 'Depth colour = mix(shallow, deep, depth). Constant depth → constant colour.'),
        q('Your dissolve glow appears in random spots, not around the holes.', ['The edge band uses a different noise than the holes', 'The glow colour is too bright', 'Alpha is 1'], 'Holes and band must come from the same noise and the same amount.'),
        q('Your fire moves DOWN.', ['The time term has the wrong sign: use uv.y − uTime', 'The colour ramp is reversed', 'The mask is upside down'], 'Subtracting time from y = features travel upwards.'),
        q('The hologram hides the background behind it completely.', ['It\'s drawn opaque; switch to additive blending', 'The rim power is too high', 'The scanlines are too dense'], 'Additive adds light on top. Opaque/alpha 1 covers.'),
        q('The shield glows in the centre, dark at the edges.', ['The fresnel is missing the "1.0 −"', 'The power is too high', 'The hex pattern is inverted'], 'dot(N, V) is 1 in the centre; 1 − dot is 1 at the edges.'),
        q('Thick black smoke drawn additively looks invisible.', ['Additive can\'t darken — use alpha blending', 'Increase the smoke\'s brightness', 'Use more particles'], 'Adding black = adding nothing.'),
        q('Lava looks flat and foggy, no crust or bright cracks.', ['Add contrast: smoothstep(lo, hi, v) before the palette', 'Scroll the noise faster', 'Use additive blending'], 'smoothstep pushes darks to 0 and brights to 1.'),
        q('Your toon shading has bands but still looks soft and blurry.', ['You\'re mixing with ndl instead of the floored band value', 'The light is too bright', 'The outline is too thin'], 'Use band = floor(ndl·k)/(k−1) in the mix, not ndl.', { level: 2 }),
        q('The toon outline (inverted hull) covers the whole character in black.', ['Back faces are being culled instead of front faces', 'The hull is pushed out too little', 'The fragment shader outputs white'], 'Cull FRONT on the hull pass so only the peeking back faces remain.', { level: 2 }),
        q('Two-phase flowmap water visibly "pulses" in brightness every cycle.', ['Normal for a 50/50 blend; hide it with a noise offset on the phase', 'The flowmap isn\'t decoded', 'The speed is negative'], 'At the crossover both layers are mixed 50/50 and contrast drops briefly. Offsetting the phase per pixel with noise spreads it out.', { level: 3 }),
      ],
    },
  ],
};

// ================================================================ FLOWMAP
const FLOW_STEPS = ['<b>Read the flowmap</b> — RG = direction, decode × 2 − 1', '<b>Push uv along the flow</b> — over time…', '<b>Reset with fract()</b> — so it never smears too far', '<b>Two phases, half a cycle apart</b> — cross-fade to hide each reset'];
const FLOW_FRAG = `vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0;
float ph0 = fract(uTime * uSpeed);
float ph1 = fract(uTime * uSpeed + 0.5);
vec3 a = texture2D(uTex, uv - flow * ph0 * uStr).rgb;
vec3 b = texture2D(uTex, uv - flow * ph1 * uStr).rgb;
float w = abs(1.0 - 2.0 * ph0);   // weight of b: 1 when a resets
col = mix(a, b, w);`;
const flowSpec = (p = {}) => ({ frag: FLOW_FRAG, textures: { uFlow: 'flowmap', uTex: p.tex || 'noise' }, uniforms: { uSpeed: p.speed ?? 0.4, uStr: p.str ?? 0.25 } });
const flowCode = (p = {}) => `vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0;
float ph0 = fract(uTime * ${f(p.speed ?? 0.4, 2)});
float ph1 = fract(uTime * ${f(p.speed ?? 0.4, 2)} + 0.5);
vec3 a = texture2D(uTex, uv - flow * ph0 * ${f(p.str ?? 0.25, 2)}).rgb;
vec3 b = texture2D(uTex, uv - flow * ph1 * ${f(p.str ?? 0.25, 2)}).rgb;
float w = abs(1.0 - 2.0 * ph0);
col = mix(a, b, w);`;
/** Draw the flowmap's arrows (same formula as the built-in texture). */
function flowArrows(el) {
  const S = 220, c = document.createElement('canvas');
  c.width = c.height = S; c.style.width = c.style.height = S + 'px'; c.style.display = 'block'; c.style.margin = '8px auto';
  const g = c.getContext('2d');
  g.fillStyle = '#0e0f15'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#4fc3f7'; g.fillStyle = '#4fc3f7'; g.lineWidth = 2;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const u = (i + 0.5) / 7 - 0.5, vv = (j + 0.5) / 7 - 0.5;
    let dx = -vv, dy = u; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const x = (i + 0.5) / 7 * S, y = S - (j + 0.5) / 7 * S, L = 11;
    const x1 = x + dx * L, y1 = y - dy * L;
    g.beginPath(); g.moveTo(x - dx * L, y + dy * L); g.lineTo(x1, y1); g.stroke();
    g.beginPath(); g.arc(x1, y1, 3, 0, Math.PI * 2); g.fill();
  }
  el.append(c);
}

const flowmap = {
  id: 'effects.flowmap',
  title: 'Flowmaps',
  blurb: 'Make a texture flow along painted directions without smearing — the two-phase trick.',
  lesson: [
    {
      title: 'A texture of directions',
      body: `<p>Rivers bend around rocks, lava swirls into a drain, clouds rotate around a storm eye. To make a texture <b>flow along a path</b>, artists paint a <b>flowmap</b>: a texture whose colour <i>is</i> a direction.</p>
<ul><li><b>R</b> = how much to move in x, <b>G</b> = how much in y</li><li>0.5 means "no motion", so decode with <code>× 2.0 − 1.0</code> → −1..1</li></ul>
<p>Left: the raw flowmap (a swirl). Below: the directions it encodes.</p>`,
      shaders: [
        { spec: { frag: 'col = vec3(texture2D(uFlow, uv).rg, 0.0);', textures: { uFlow: 'flowmap' } }, caption: 'raw RG' },
        { spec: flowSpec({ tex: 'noise' }), caption: 'the final effect' },
      ],
      visual: (el) => flowArrows(el),
      code: 'vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0; // -1..1 direction',
      after: recipe('Flowmap', FLOW_STEPS, 0) + '<div class="tip">Flowmaps are painted with tools like Flowmap Painter or generated in Houdini. The two-phase technique below was popularised by Valve (Portal 2 / Left 4 Dead 2 water).</div>',
    },
    {
      title: 'Naive idea: push uv along the flow',
      body: `<p>To move the texture along <code>flow</code>, sample it at <code>uv − flow × t</code> (minus, because moving the coordinates one way moves the picture the other way).</p>
<p>Drag <b>t</b> (think of it as time). At first it looks great… but every pixel moves a different way, so the texture <b>stretches more and more</b> until it's mush. Time keeps growing forever, so this always breaks.</p>`,
      controls: [{ name: 't', label: 't (time)', min: 0, max: 3, step: 0.01, value: 0.3 }],
      shader: (v) => ({ frag: 'vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0;\ncol = texture2D(uTex, uv - flow * uT * 0.25).rgb;', textures: { uFlow: 'flowmap', uTex: 'uvgrid' }, uniforms: { uT: v.t } }),
      code: (v) => `col = texture2D(uTex, uv - flow * ${f(v.t, 2)} * 0.25).rgb;`,
      after: recipe('Flowmap', FLOW_STEPS, 1),
    },
    {
      title: 'Reset with fract()',
      body: `<p>Fix the smearing: never push further than one short cycle. <code>phase = fract(uTime × speed)</code> runs 0 → 1 then <b>jumps back to 0</b>.</p>
<p>No more mush — but watch: every time the phase resets, the texture visibly <b>pops</b> back to its start. Ugly.</p>`,
      controls: [{ name: 's', label: 'speed', min: 0.1, max: 1.5, step: 0.05, value: 0.5 }],
      shader: (v) => ({ frag: 'vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0;\nfloat ph = fract(uTime * uSpeed);\ncol = texture2D(uTex, uv - flow * ph * 0.25).rgb;', textures: { uFlow: 'flowmap', uTex: 'uvgrid' }, uniforms: { uSpeed: v.s } }),
      graph: { fns: [{ f: (x) => G.fract(x), label: 'phase = fract(t)' }], opts: { xmin: 0, xmax: 3, ymin: -0.1, ymax: 1.1 } },
      code: (v) => `float ph = fract(uTime * ${f(v.s, 2)});   // 0→1, jump, 0→1…\ncol = texture2D(uTex, uv - flow * ph * 0.25).rgb;`,
      after: recipe('Flowmap', FLOW_STEPS, 2),
    },
    {
      title: 'Two phases: hide the pop',
      body: `<p>The trick: run <b>two copies</b>, A and B, half a cycle apart (<code>+ 0.5</code>). Blend between them so that <b>whichever one is resetting has weight 0</b>.</p>
<p><code>w = abs(1 − 2 × ph0)</code> is a triangle: 1 when A resets (ph0 = 0), 0 halfway (ph0 = 0.5 — exactly when B resets). So we always look at the copy that is mid-flow.</p>
<div class="analogy">🎞️ Like two relay runners: one runs while the other jogs back to the start out of sight, then they swap.</div>`,
      shaders: [
        { spec: { frag: 'vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0;\ncol = texture2D(uTex, uv - flow * fract(uTime * 0.4) * 0.25).rgb;', textures: { uFlow: 'flowmap', uTex: 'uvgrid' } }, caption: 'A alone (pops)' },
        { spec: flowSpec({ tex: 'uvgrid' }), caption: 'A/B blended' },
      ],
      graph: { fns: [{ f: (x) => G.fract(x), label: 'ph0', color: '#7c6cff', dash: [4, 3] }, { f: (x) => G.fract(x + 0.5), label: 'ph1', color: '#ff6fa8', dash: [4, 3] }, { f: (x) => Math.abs(1 - 2 * G.fract(x)), label: 'w (weight of B)', color: '#3ddc97' }], opts: { xmin: 0, xmax: 2, ymin: -0.1, ymax: 1.1 } },
      code: 'float ph0 = fract(uTime * 0.4);\nfloat ph1 = fract(uTime * 0.4 + 0.5);\nfloat w = abs(1.0 - 2.0 * ph0);  // 1 when ph0 resets, 0 when ph1 resets\ncol = mix(a, b, w);',
      after: recipe('Flowmap', FLOW_STEPS, 3),
      quiz: { q: 'At the moment ph0 jumps from 1 back to 0, what is w and which layer do we see?', options: ['w = 1 → we only see B', 'w = 0 → we only see A', 'w = 0.5 → half of each'], answer: 0, explain: 'w = |1 − 2·0| = 1. mix(a, b, 1) = b. A\'s jump is invisible.' },
    },
    {
      title: 'The finished flow',
      body: `<p>With a noisy texture the result reads as liquid swirling around the centre — and it can run forever without smearing or popping.</p>
<p><b>Strength</b> = how far each cycle travels. Too much and you see stretching within a cycle; too little and it barely moves. <b>Speed</b> = cycles per second.</p>`,
      controls: [
        { name: 's', label: 'speed', min: 0.05, max: 1.5, step: 0.05, value: 0.4 },
        { name: 'k', label: 'strength', min: 0, max: 0.6, step: 0.01, value: 0.25 },
        { name: 't', label: 'texture (noise / uv grid)', min: 0, max: 1, step: 1, value: 0 },
      ],
      shader: (v) => flowSpec({ speed: v.s, str: v.k, tex: v.t ? 'uvgrid' : 'noise' }),
      code: (v) => flowCode({ speed: v.s, str: v.k }),
      after: '<div class="tip">You may notice a faint pulse in contrast at the cross-over (50/50 mix). Real shaders add a little noise to the phase per pixel so the pulse is spread out.</div>',
    },
  ],
  games: [
    {
      id: 'flow-phase', title: 'Phase calculator', engine: 'numeric', rounds: 5,
      blurb: 'Compute the phases and blend weight like the GPU would.',
      gen: (rng, level) => {
        const s = rng.pick([0.5, 1, 2]);
        let t, ph0;
        do { t = rng.step(0.1, 9.9, 0.1); ph0 = +G.fract(+(t * s).toFixed(4)).toFixed(4); } while (ph0 === 0);
        const ph1 = +G.fract(ph0 + 0.5).toFixed(4);
        const w = +Math.abs(1 - 2 * ph0).toFixed(4);
        const ask = level === 1 ? 'ph0' : level === 2 ? rng.pick(['ph0', 'ph1']) : rng.pick(['ph1', 'w']);
        const ans = { ph0, ph1, w }[ask];
        return {
          prompt: `<code>uTime = ${n(t)}</code>. What is <code>${ask}</code>?`,
          code: `float ph0 = fract(uTime * ${f(s)});\nfloat ph1 = fract(uTime * ${f(s)} + 0.5);\nfloat w   = abs(1.0 - 2.0 * ph0);`,
          answer: ans,
          explain: `<p>uTime × ${n(s)} = ${n(t * s)} → ph0 = fract = <b>${n(ph0)}</b>. ph1 = fract(${n(t * s)} + 0.5) = <b>${n(ph1)}</b>. w = |1 − 2 × ${n(ph0)}| = <b>${n(w)}</b>.</p><p>${w > 0.5 ? 'w is high → we mostly see layer B.' : 'w is low → we mostly see layer A.'}</p>`,
        };
      },
    },
    {
      id: 'flow-problem', title: 'Smear, pop or smooth?', engine: 'mcq', rounds: 6,
      blurb: 'Predict what each flowmap version looks like over time.',
      questions: [
        q('What goes wrong with this code after a few seconds?', ['The texture smears into mush', 'It pops back every cycle', 'Nothing — it\'s the correct version'], 'uTime grows forever, so the offset grows forever and the texture stretches without limit.', { code: 'col = texture2D(uTex, uv - flow * uTime * 0.2).rgb;' }),
        q('What goes wrong with this code?', ['It visibly pops back every cycle', 'The texture smears into mush', 'Nothing — it\'s the correct version'], 'fract resets the offset → no smearing, but the reset is visible.', { code: 'float ph = fract(uTime * 0.5);\ncol = texture2D(uTex, uv - flow * ph * 0.2).rgb;' }),
        q('What does this code look like?', ['Smooth endless flow', 'It pops back every cycle', 'The texture smears into mush'], 'Two phases half a cycle apart; the weight hides each reset.', { code: 'float ph0 = fract(uTime * 0.5);\nfloat ph1 = fract(uTime * 0.5 + 0.5);\nfloat w = abs(1.0 - 2.0 * ph0);\ncol = mix(texA(ph0), texB(ph1), w);' }),
        q('Someone forgot to decode the flowmap (no "× 2 − 1"). What happens?', ['Everything drifts towards +x +y as well as along the flow', 'Nothing changes', 'The texture stops moving'], 'Raw values are 0..1, so "no motion" (0.5) becomes a push of 0.5 up-right.', { code: 'vec2 flow = texture2D(uFlow, uv).rg;' }),
        q('Bug: the blend weight uses the WRONG phase. What do you see?', ['The pops are visible again (we look at the layer that resets)', 'Smearing', 'A black screen'], 'With w = |1 − 2·ph1| the weight of B is 1 exactly when B resets. The trick only works if the resetting layer gets weight 0.', { code: 'float w = abs(1.0 - 2.0 * ph1);\ncol = mix(a, b, w);', level: 2 }),
        q('Why is ph1 offset by exactly 0.5?', ['So the two layers reset at opposite times, never together', 'To make it twice as fast', 'Because flowmaps are stored 0..0.5'], 'Half a cycle apart → when one resets, the other is right in the middle of its run.'),
        q('What does the "strength" multiplier control?', ['How far the texture travels in one cycle', 'How many cycles per second', 'The colour of the flow'], 'Offset = flow × phase × strength. Speed is the multiplier on uTime.'),
        q('You increase the cycle speed a lot. What becomes noticeable?', ['A fast pulsing as layers swap many times per second', 'The texture smears into mush', 'The flow reverses direction'], 'Every cycle has a 50/50 crossover; at high speed it flickers.', { level: 2 }),
        tf('A flowmap pixel of (0.5, 0.5) means "don\'t move".', true, 'Decoded: 0.5 × 2 − 1 = 0 in both directions.'),
        tf('A flowmap pixel of (1.0, 0.5) means "move left".', false, 'R = 1 → x = +1 → move right (towards +x). G = 0.5 → no vertical motion.'),
        tf('Sampling at uv − flow × t moves the picture along +flow.', true, 'The pixel looks "upstream", so what it shows came from behind → the picture travels downstream along +flow.', 2),
      ],
    },
    {
      id: 'flow-fill', title: 'Fix the flow', engine: 'codefill', rounds: 4,
      blurb: 'Fill in the decode, the phase offset or the weight.',
      gen: (rng, level) => {
        const V = [
          { tpl: FLOW_FRAG.replace('.rg * 2.0 - 1.0', '.rg * [[0]] - [[1]]'), slots: [{ options: ['2.0', '1.0', '0.5'], answer: '2.0' }, { options: ['1.0', '0.5', '0.0'], answer: '1.0' }], why: 'Decode 0..1 → −1..1: × 2 − 1. (× 1 − 0.5 gives −0.5..0.5: same directions, half speed.)' },
          { tpl: FLOW_FRAG.replace('uTime * uSpeed + 0.5', 'uTime * uSpeed + [[0]]'), slots: [{ options: ['0.5', '0.0', '1.0'], answer: '0.5' }], why: 'Half a cycle apart. 0.0 or 1.0 would make B identical to A, so both reset together → the pop is back.' },
          { tpl: FLOW_FRAG.replace('abs(1.0 - 2.0 * ph0)', 'abs(1.0 - 2.0 * [[0]])').replace('col = mix(a, b, w);', 'col = mix(a, b, [[1]]);'), slots: [{ options: ['ph0', 'ph1', 'uTime'], answer: 'ph0' }, { options: ['w', '0.5', '1.0 - w'], answer: 'w' }], why: 'B must be fully visible when <b>A</b> resets, so the weight of B is computed from ph0.', lvl: 2 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        return {
          prompt: 'Complete the flowmap shader to match the target:',
          sub: 'Watch over time: popping or wrong speed means a wrong token.',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), textures: { uFlow: 'flowmap', uTex: 'uvgrid' }, uniforms: { uSpeed: 0.4, uStr: 0.25 } }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'flow-order', title: 'Flowmap recipe', engine: 'order', rounds: 3,
      blurb: 'Order the steps of the two-phase flowmap.',
      gen: (rng) => rng.pick([
        { prompt: 'Order the flowmap recipe:', items: ['Sample the flowmap and decode it (× 2 − 1)', 'Compute ph0 = fract(time × speed) and ph1 = ph0 + half a cycle', 'Sample the texture twice, offset by flow × ph0 and flow × ph1', 'Compute the weight from ph0', 'Mix the two samples with the weight'], explain: 'Direction → phases → two samples → weight → blend.' },
        { prompt: 'Order the lines so the shader compiles:', items: [{ code: 'vec2 flow = texture2D(uFlow, uv).rg * 2.0 - 1.0;' }, { code: 'float ph0 = fract(uTime * 0.4);' }, { code: 'vec3 a = texture2D(uTex, uv - flow * ph0 * 0.25).rgb;' }, { code: 'col = mix(a, b, abs(1.0 - 2.0 * ph0));' }], explain: 'flow and ph0 must exist before sampling a; the mix comes last. (b is computed the same way as a.)' },
      ]),
    },
  ],
};

// ================================================================ WIND
// The plane mesh (64×64 grid) is rebuilt in the vertex shader into a row of 8 grass blades.
const GRASS_BUILD = `float id = floor(uv.x * 8.0);                 // which blade (0..7)
float h = uv.y;                                 // height along the blade: 0 root, 1 tip
float lu = fract(uv.x * 8.0) * 8.0 / 7.0;       // across the blade 0..1
float tall = 1.2 + 0.4 * hash(vec2(id, 3.0));
pos = vec3((id + 0.5) / 8.0 * 2.0 - 1.0 + (lu - 0.5) * 0.16 * (1.0 - h * 0.85), h * tall - 0.8, 0.0);`;
const GRASS_FRAG = `if (fract(uv.x * 8.0) > 0.876) discard;   // gap between blades
float id = floor(uv.x * 8.0);
col = mix(vec3(0.06, 0.25, 0.05), vec3(0.45, 0.85, 0.25) * (0.85 + 0.3 * hash(vec2(id, 1.0))), uv.y);`;
const WIND_VERT = `${GRASS_BUILD}
float phase = hash(vec2(id, 7.0)) * TAU * uRand;
float bend = mix(1.0, pow(max(h, 0.0001), uExp), uMask);
pos.x += (sin(uTime * uSpeed + phase) * uAmp + sin(uTime * 1.3 - pos.x * 2.0) * uGust) * bend;`;
const GRASS_CAM = { yaw: 0, pitch: 0.05, dist: 2.7 };
const SKY = [0.55, 0.72, 0.9];
const windSpec = (p = {}) => ({
  vert: WIND_VERT, frag: GRASS_FRAG, mesh: 'plane', camera: GRASS_CAM, bg: SKY,
  uniforms: { uAmp: p.amp ?? 0.15, uSpeed: p.speed ?? 2, uExp: p.exp ?? 2, uRand: p.rand ?? 1, uGust: p.gust ?? 0, uMask: p.mask === false ? 0 : 1 },
});
const windCode = (p = {}) => `// vertex shader (id = which blade, h = 0 at root → 1 at tip)
float phase = hash(vec2(id, 7.0)) * TAU * ${f(p.rand ?? 1, 2)};
float bend = ${p.mask === false ? '1.0;            // no mask: every vertex moves the same' : `pow(h, ${f(p.exp ?? 2, 2)});`}
pos.x += (sin(uTime * ${f(p.speed ?? 2, 1)} + phase) * ${f(p.amp ?? 0.15, 2)}
        + sin(uTime * 1.3 - pos.x * 2.0) * ${f(p.gust ?? 0, 2)}) * bend;`;
const WIND_STEPS = ['<b>Sine over time</b> — sway back and forth', '<b>Height mask</b> — roots stay put, tips move most', '<b>Per-object phase</b> — every blade out of sync', '<b>Gust wave</b> — a slow wave travelling across the field'];

const wind = {
  id: 'effects.wind',
  title: 'Wind sway (vertex)',
  blurb: 'Move vertices with a sine, masked by height, offset per plant.',
  lesson: [
    {
      title: 'Grass that moves',
      body: `<p>Every open-world game has fields of grass and trees moving in the wind. Nobody animates them by hand — a <b>vertex shader</b> moves the vertices every frame.</p>
<p>This one is different from the others: we change <b>where</b> vertices are (<code>pos</code>), not what colour pixels are. Everything is still a formula of position + time.</p>`,
      shader: windSpec({ gust: 0.06 }),
      after: recipe('Wind sway', WIND_STEPS) + '<p class="small dim">(The demo mesh is a flat grid rebuilt into 8 blades in the vertex shader — that plumbing is hidden; the code shown is the wind part.)</p>',
    },
    {
      title: 'Step 1: a sine over time',
      body: `<p>Sway = back and forth = <code>sin(uTime × speed) × amplitude</code>, added to <code>pos.x</code>.</p>
<p>But look at the roots: the <b>whole blade slides</b> sideways, as if the grass were skating on ice. Every vertex moves by the same amount.</p>`,
      controls: [
        { name: 'a', label: 'amplitude', min: 0, max: 0.4, step: 0.01, value: 0.15 },
        { name: 's', label: 'speed', min: 0, max: 6, step: 0.1, value: 2 },
      ],
      shader: (v) => windSpec({ amp: v.a, speed: v.s, mask: false, rand: 0 }),
      code: (v) => `pos.x += sin(uTime * ${f(v.s, 1)}) * ${f(v.a, 2)};   // roots move too!`,
      after: recipe('Wind sway', WIND_STEPS, 0),
    },
    {
      title: 'Step 2: the height mask',
      body: `<p>Multiply the motion by the <b>height</b> <code>h</code> (0 at the root, 1 at the tip): roots × 0 = stay put, tips × 1 = full sway.</p>
<p><code>pow(h, e)</code> shapes the bend: e = 1 is a straight tilt (a stiff stick), e = 2–3 keeps the lower part straighter and bends the top more, like a real stem.</p>
<div class="tip">In real assets this mask is often painted into <b>vertex colours</b> (e.g. red = how much it may move) or derived from UVs, so trunks stay stiff and leaves flutter.</div>`,
      controls: [{ name: 'e', label: 'mask exponent e', min: 0.5, max: 4, step: 0.1, value: 2 }],
      shader: (v) => windSpec({ exp: v.e, rand: 0, amp: 0.2 }),
      graph: { fns: (v) => [{ f: (x) => Math.pow(x, v.e), label: 'bend = pow(h, e)' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
      code: (v) => `float bend = pow(h, ${f(v.e, 1)});\npos.x += sin(uTime * 2.0) * 0.2 * bend;`,
      after: recipe('Wind sway', WIND_STEPS, 1),
    },
    {
      title: 'Step 3: per-object phase',
      body: `<p>Now all blades move in perfect sync — like a dancing robot army. Real plants never do.</p>
<p>Give each blade its own <b>phase</b> (a time offset inside the sine): <code>hash(id) × TAU</code> — a random angle between 0 and a full circle, different per blade but <b>constant</b> for that blade.</p>
<p>Slide the randomness from 0 (in sync) to 1 (fully random).</p>`,
      controls: [{ name: 'r', label: 'phase randomness', min: 0, max: 1, step: 0.01, value: 1 }],
      shader: (v) => windSpec({ rand: v.r, amp: 0.2 }),
      code: (v) => `float phase = hash(vec2(id, 7.0)) * TAU * ${f(v.r, 2)};\npos.x += sin(uTime * 2.0 + phase) * 0.2 * pow(h, 2.0);`,
      after: recipe('Wind sway', WIND_STEPS, 2) + '<div class="tip">In an engine the "id" is usually the object\'s world position (hashed), a random value baked per instance, or Pivot Painter data in Unreal.</div>',
      quiz: { q: 'Why hash the blade id instead of using hash(pos)?', options: ['Every vertex of one blade must get the SAME phase, or the blade tears apart', 'hash(pos) doesn\'t compile', 'It is faster'], answer: 0, explain: 'Each vertex has a different pos. Different phases on one blade → vertices sway out of sync → the mesh distorts.' },
    },
    {
      title: 'Step 4: a gust wave',
      body: `<p>Wind comes in <b>gusts</b> that sweep across a field. Use the <b>position</b> inside a second, slower sine: <code>sin(uTime × 1.3 − pos.x × 2.0)</code>.</p>
<p>Because the phase depends on x, neighbouring blades are almost in step and far ones are not → a <b>wave</b> travels across the field (towards +x, because of the minus).</p>`,
      controls: [
        { name: 'g', label: 'gust strength', min: 0, max: 0.3, step: 0.01, value: 0.12 },
        { name: 'a', label: 'sway amplitude', min: 0, max: 0.3, step: 0.01, value: 0.06 },
      ],
      shader: (v) => windSpec({ gust: v.g, amp: v.a }),
      code: (v) => windCode({ gust: v.g, amp: v.a }),
      after: recipe('Wind sway', WIND_STEPS, 3),
    },
  ],
  games: [
    {
      id: 'wind-fill', title: 'Fix the wind', engine: 'codefill', rounds: 4,
      blurb: 'Complete the sway line: phase and height mask.',
      gen: (rng, level) => {
        const V = [
          { tpl: 'float phase = hash(vec2(id, 7.0)) * TAU;\npos.x += sin(uTime * 2.0 + phase) * 0.2 * [[0]];', slots: [{ options: ['h * h', '1.0', '1.0 - h'], answer: 'h * h' }], why: 'The mask must be 0 at the root (h = 0). <code>1.0</code> slides the whole blade; <code>1.0 − h</code> moves the roots and pins the tips!' },
          { tpl: 'float phase = hash(vec2(id, 7.0)) * TAU;\npos.x += sin(uTime * 2.0 + [[0]]) * 0.2 * h * h;', slots: [{ options: ['phase', '0.0', 'h'], answer: 'phase' }], why: 'Without the per-blade phase all blades move in sync.' },
          { tpl: 'float phase = hash(vec2([[0]], 7.0)) * TAU;\npos.x += sin(uTime * 2.0 + phase) * 0.2 * [[1]];', slots: [{ options: ['id', 'h', 'uTime'], answer: 'id' }, { options: ['h * h', 'h * h * 0.0', '1.0'], answer: 'h * h' }], why: 'Phase from the blade <b>id</b> (same for all its vertices). hash(h) would give each height a different phase → wobbly blades.', lvl: 2 },
          { tpl: 'float phase = hash(vec2(id, 7.0)) * TAU;\npos.x += (sin(uTime * 2.0 + phase) * 0.06 + sin(uTime * 1.3 - [[0]] * 2.0) * 0.12) * [[1]];', slots: [{ options: ['pos.x', 'h', 'phase'], answer: 'pos.x' }, { options: ['h * h', '1.0', 'h * 0.0'], answer: 'h * h' }], why: 'A gust is a wave across <b>space</b>: put the position into the sine.', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        return {
          prompt: 'Complete the wind vertex code to match the target:',
          sub: '<code>id</code> = which blade, <code>h</code> = 0 at the root → 1 at the tip.',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ vert: GRASS_BUILD + '\n' + fill(vr.tpl, vals), frag: GRASS_FRAG, mesh: 'plane', camera: GRASS_CAM, bg: SKY }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'wind-fix', title: 'Wind doctor', engine: 'mcq', rounds: 6,
      blurb: 'The vegetation moves wrong. What\'s the fix?',
      questions: [
        q('The whole bush slides sideways, roots included.', ['Multiply the offset by a height mask (0 at the root)', 'Lower the speed', 'Add a per-object phase'], 'Roots need zero movement: offset × h (or a painted vertex-colour mask).'),
        q('A field of 1000 grass clumps all sway in perfect sync.', ['Add a random per-object phase inside the sine', 'Increase the amplitude', 'Use pow(h, 3.0)'], 'Phase = hash(object id or position) × TAU.'),
        q('Each blade bends like a stiff stick from the root.', ['Use pow(h, 2.0) or higher instead of h', 'Use 1.0 − h', 'Make the sine faster'], 'A higher exponent keeps the lower stem straight and bends the top.'),
        q('Blades twist and tear apart while swaying.', ['The phase is different per vertex — compute it per object instead', 'The amplitude is too small', 'The normal is wrong'], 'All vertices of one object must share the same phase.'),
        q('The tips stay still and the roots wave around.', ['The mask is inverted (1 − h); use h', 'The sine is negative', 'The phase is too big'], 'h is 0 at the root and 1 at the tip.'),
        q('There\'s no feeling of gusts sweeping across the meadow.', ['Add a slow sine that depends on world position', 'Increase the per-object randomness', 'Use a bigger texture'], 'Position inside the sine = a travelling wave.', { level: 2 }),
        q('Your swaying tree casts a static, non-moving shadow.', ['The shadow pass doesn\'t use the same vertex displacement', 'The fragment shader is wrong', 'Additive blending is on'], 'Shadows are rendered in a separate pass; it must run the same vertex wind code.', { level: 3 }),
        tf('Wind sway is usually done in the vertex shader.', true, 'It moves geometry — that\'s the vertex shader\'s job, and it\'s cheap (once per vertex, not per pixel).'),
        tf('With pos.x += sin(uTime) * 0.1 * h, the root (h = 0) moves 0.1 units.', false, 'h = 0 → 0.1 × 0 = 0. The root stays put.'),
        tf('A per-object phase should be the same for every vertex of that object.', true, 'Otherwise the object deforms instead of swaying as a whole.'),
      ],
    },
    {
      id: 'wind-stage', title: 'Vertex or fragment?', engine: 'buckets', rounds: 2,
      blurb: 'Which shader stage does this part of an effect?',
      gen: () => ({
        prompt: 'Which shader stage does this job?',
        sub: 'Vertex = moves geometry (once per vertex). Fragment = colours pixels (once per pixel).',
        buckets: ['📐 Vertex', '🎨 Fragment'],
        count: 10,
        items: [
          { text: 'Grass swaying in the wind', bucket: 0 },
          { text: 'Dissolve threshold cutting holes', bucket: 1, why: 'Per-pixel noise vs amount → alpha.' },
          { text: 'Pushing the outline hull out along normals', bucket: 0, why: 'Moves vertices.' },
          { text: 'Hologram scanlines', bucket: 1 },
          { text: 'Ocean waves that actually lift the mesh', bucket: 0 },
          { text: 'Foam along the shoreline', bucket: 1 },
          { text: 'Fresnel rim glow', bucket: 1 },
          { text: 'A flag rippling (mesh bends)', bucket: 0 },
          { text: 'Gradient-mapping lava colours', bucket: 1 },
          { code: 'pos += normal * 0.03;', bucket: 0 },
          { code: 'col = mix(base, glow, edge);', bucket: 1 },
          { code: 'pos.x += sin(uTime + phase) * h;', bucket: 0 },
          { code: 'alpha = step(uAmount, n);', bucket: 1 },
          { text: 'Triplanar texture blending', bucket: 1, why: 'Three texture samples blended per pixel.' },
        ],
      }),
    },
    {
      id: 'wind-tune', title: 'Match the breeze', engine: 'slider', rounds: 4,
      blurb: 'Match sway amplitude, bend exponent and phase randomness.',
      gen: (rng, level) => {
        const t = { amp: rng.step(0.05, 0.3, 0.05), exp: rng.step(0.5, 3.5, 0.5), rand: rng.step(0, 1, 0.25) };
        const params = [{ name: 'amp', label: 'amplitude', min: 0, max: 0.4, step: 0.01, target: t.amp }];
        if (level >= 2) params.push({ name: 'exp', label: 'mask exponent', min: 0.5, max: 4, step: 0.1, target: t.exp });
        if (level === 3) params.push({ name: 'rand', label: 'phase randomness', min: 0, max: 1, step: 0.05, target: t.rand });
        const P = (p) => ({ amp: p.amp, exp: p.exp ?? 2, rand: p.rand ?? 1, speed: 1.5 });
        return {
          prompt: 'Make your grass sway like the target.',
          sub: 'Both run on the same clock — compare the tips side by side.',
          params,
          build: (p) => windSpec(P(p)),
          code: (p) => windCode(P(p)),
          tolerance: 0.06,
          explain: '<p>Amplitude = how far the tips travel. Exponent = how curved the blade is (high = straight bottom, bent top). Randomness = how out of sync the blades are.</p>',
        };
      },
    },
  ],
};

// ================================================================ TRIPLANAR
const TRI_FRAG = `vec3 w = pow(abs(N), vec3(uSharp));
w /= w.x + w.y + w.z;                 // weights sum to 1
vec3 tx = texture2D(uTex, P.zy * uTile).rgb;   // projected along X
vec3 ty = texture2D(uTex, P.xz * uTile).rgb;   // projected along Y (from above)
vec3 tz = texture2D(uTex, P.xy * uTile).rgb;   // projected along Z
vec3 c = tx * w.x + ty * w.y + tz * w.z;
col = c * (0.45 + 0.6 * max(dot(N, normalize(vec3(0.5, 0.8, 0.4))), 0.0));`;
const MESHES = ['sphere', 'torus', 'cube'];
const triSpec = (p = {}) => ({ frag: TRI_FRAG, mesh: p.mesh || 'sphere', camera: CAM, textures: { uTex: p.tex || 'brick' }, uniforms: { uSharp: p.sharp ?? 4, uTile: p.tile ?? 1 } });
const triCode = (p = {}) => `vec3 w = pow(abs(N), vec3(${f(p.sharp ?? 4, 1)}));
w /= w.x + w.y + w.z;
vec3 tx = texture2D(uTex, P.zy * ${f(p.tile ?? 1, 2)}).rgb;
vec3 ty = texture2D(uTex, P.xz * ${f(p.tile ?? 1, 2)}).rgb;
vec3 tz = texture2D(uTex, P.xy * ${f(p.tile ?? 1, 2)}).rgb;
col = tx * w.x + ty * w.y + tz * w.z;`;
const LIT = 'col *= 0.45 + 0.6 * max(dot(N, normalize(vec3(0.5, 0.8, 0.4))), 0.0);';
const TRI_STEPS = ['<b>Project</b> the texture from X, Y and Z using world position', '<b>Weights</b> from the normal: <code>abs(N)</code>, normalised to sum 1', '<b>Sharpen</b> the blend with <code>pow</code>', '<b>Blend</b> the three samples'];

const triplanar = {
  id: 'effects.triplanar',
  title: 'Triplanar mapping',
  blurb: 'Texture anything without UVs: three projections blended by the normal.',
  lesson: [
    {
      title: 'When UVs fail',
      body: `<p>UVs are hand-made. On procedural rocks, cliffs, terrain or sculpted meshes there are often <b>no good UVs</b>: textures stretch, pinch at poles or show seams.</p>
<p>Left: a sphere with ordinary UVs — look at the pinching at the top and the stretched rows. Right: the same sphere <b>triplanar-mapped</b>: evenly sized bricks everywhere, no UVs used at all.</p>`,
      shaders: [
        { spec: { frag: `col = texture2D(uTex, uv * vec2(4.0, 2.0)).rgb;\n${LIT}`, mesh: 'sphere', camera: { ...CAM, pitch: 0.9 }, textures: { uTex: 'brick' } }, caption: 'mesh UVs' },
        { spec: { ...triSpec(), camera: { ...CAM, pitch: 0.9 } }, caption: 'triplanar' },
      ],
      after: recipe('Triplanar', TRI_STEPS),
    },
    {
      title: 'Step 1: project from one side',
      body: `<p>Forget UVs; use the <b>world position</b> as texture coordinates. Picking two of its components = shining the texture from a <b>projector</b> along the third axis:</p>
<ul><li><code>P.xz</code> → projected from <b>above</b> (along Y)</li><li><code>P.zy</code> → along X (from the side)</li><li><code>P.xy</code> → along Z (from the front)</li></ul>
<p>Faces looking at the projector look perfect. Faces parallel to it get <b>long streaks</b> — the texture is smeared along them.</p>`,
      controls: [{ name: 'a', label: 'axis: X / Y / Z', min: 0, max: 2, step: 1, value: 1 }, { name: 'm', label: 'mesh: sphere / torus / cube', min: 0, max: 2, step: 1, value: 0 }],
      shader: (v) => ({ frag: `vec2 puv = uAxis < 0.5 ? P.zy : (uAxis < 1.5 ? P.xz : P.xy);\ncol = texture2D(uTex, puv).rgb;\n${LIT}`, mesh: MESHES[v.m], camera: CAM, textures: { uTex: 'brick' }, uniforms: { uAxis: v.a } }),
      code: (v) => `col = texture2D(uTex, P.${['zy', 'xz', 'xy'][v.a]}).rgb;   // projected along ${'XYZ'[v.a]}`,
      after: recipe('Triplanar', TRI_STEPS, 0),
    },
    {
      title: 'Step 2: weights from the normal',
      body: `<p>Use all three projections and let the <b>normal</b> decide which one each pixel uses. A surface facing up (N ≈ (0, 1, 0)) should use the top projection; one facing sideways, a side one.</p>
<p><code>abs(N)</code>: we don't care if it faces +X or −X — both use the X projection. Then divide by the sum so the three weights <b>add up to 1</b> (no brightening or darkening).</p>
<p>Here the weights are shown as colour: <span style="color:#ff5c6c">red = X</span>, <span style="color:#3ddc97">green = Y</span>, <span style="color:#4fc3f7">blue = Z</span>.</p>`,
      controls: [{ name: 'm', label: 'mesh: sphere / torus / cube', min: 0, max: 2, step: 1, value: 0 }],
      shader: (v) => ({ frag: 'vec3 w = abs(N);\nw /= w.x + w.y + w.z;\ncol = w;', mesh: MESHES[v.m], camera: CAM }),
      code: 'vec3 w = abs(N);\nw /= w.x + w.y + w.z;   // e.g. N = (0.6, 0.8, 0) → w = (0.43, 0.57, 0)\ncol = w;',
      after: recipe('Triplanar', TRI_STEPS, 1),
      quiz: { q: 'N = (0, −1, 0) (facing straight down). Which weight is 1?', options: ['w.x', 'w.y', 'w.z'], answer: 1, explain: 'abs(−1) = 1 in y, so w = (0, 1, 0): the Y (top/bottom) projection.' },
    },
    {
      title: 'Step 3: sharpen the blend',
      body: `<p>With plain <code>abs(N)</code>, wide areas mix two or three projections → blurry, "doubled" texture. Raising the weights to a <b>power</b> before normalising makes the biggest one win faster → narrow, cleaner transition zones.</p>
<p>Turn the sharpness up and down and watch the diagonal zones.</p>`,
      controls: [{ name: 'k', label: 'sharpness (power)', min: 1, max: 16, step: 0.5, value: 4 }, { name: 'v', label: 'show weights / texture', min: 0, max: 1, step: 1, value: 0 }],
      shader: (v) => (v.v ? triSpec({ sharp: v.k }) : { frag: 'vec3 w = pow(abs(N), vec3(uSharp));\nw /= w.x + w.y + w.z;\ncol = w;', mesh: 'sphere', camera: CAM, uniforms: { uSharp: v.k } }),
      code: (v) => `vec3 w = pow(abs(N), vec3(${f(v.k, 1)}));\nw /= w.x + w.y + w.z;`,
      after: recipe('Triplanar', TRI_STEPS, 2),
    },
    {
      title: 'Step 4: blend the three samples',
      body: `<p>Sample the texture three times — once per projection — and add them up weighted. Works on <b>any</b> mesh, no UVs.</p>
<div class="note">Costs: <b>3 texture samples instead of 1</b> (triple for each texture: albedo, normal…). And because it uses world position, a <b>moving</b> object would "swim" through its texture — use object-space position for things that move.</div>`,
      controls: [
        { name: 'm', label: 'mesh: sphere / torus / cube', min: 0, max: 2, step: 1, value: 1 },
        { name: 'k', label: 'sharpness', min: 1, max: 16, step: 0.5, value: 4 },
        { name: 't', label: 'tiling', min: 0.5, max: 3, step: 0.1, value: 1 },
      ],
      shader: (v) => triSpec({ mesh: MESHES[v.m], sharp: v.k, tile: v.t }),
      code: (v) => triCode({ sharp: v.k, tile: v.t }),
      after: recipe('Triplanar', TRI_STEPS, 3) + '<div class="tip">Unity Shader Graph: <b>Triplanar</b> node (has a Blend input = our sharpness). Unreal: <b>WorldAlignedTexture</b> material function.</div>',
    },
  ],
  games: [
    {
      id: 'tri-weights', title: 'Weight calculator', engine: 'numeric', rounds: 5,
      blurb: 'Compute the triplanar weights from a normal.',
      gen: (rng, level) => {
        const NS = level === 1
          ? [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, -1], [0.6, 0.8, 0], [0, 0.6, 0.8], [-0.8, 0, 0.6], [0.8, -0.6, 0]]
          : [[0.6, 0.8, 0], [0, -0.6, 0.8], [-0.8, 0, 0.6], [0.48, 0.6, 0.64], [0.36, -0.48, 0.8], [0, 0.8, -0.6]];
        const N = rng.pick(NS);
        const k = level === 3 ? 2 : 1;
        const a = N.map((x) => Math.pow(Math.abs(x), k));
        const s = a[0] + a[1] + a[2];
        const w = a.map((x) => +(x / s).toFixed(4));
        const single = level === 1;
        const comp = rng.int(0, 2);
        return {
          prompt: single ? `N = (${N.join(', ')}). What is <code>w.${'xyz'[comp]}</code>?` : `N = (${N.join(', ')}). Compute the weights <code>w</code>.`,
          code: `vec3 w = ${k === 1 ? 'abs(N)' : 'pow(abs(N), vec3(2.0))'};\nw /= w.x + w.y + w.z;`,
          sub: 'Two decimals are enough.',
          answer: single ? w[comp] : w,
          labels: single ? undefined : ['x', 'y', 'z'],
          wrap: single ? undefined : 'vec3',
          explain: `<p>${k === 1 ? 'abs(N)' : 'abs(N)²'} = (${a.map((x) => n(x)).join(', ')}), sum = ${n(s)} → w = (${w.map((x) => n(x, 2)).join(', ')}).</p>${k === 2 ? '<p>Neat: for a unit normal the squares already sum to 1, so with power 2 the weights are just N².</p>' : ''}`,
        };
      },
    },
    {
      id: 'tri-plane', title: 'Which projection?', engine: 'mcq', rounds: 8,
      blurb: 'Given a normal, which projection dominates?',
      gen: (rng, level) => {
        const axes = [{ c: 'P.zy', a: 'X', i: 0 }, { c: 'P.xz', a: 'Y', i: 1 }, { c: 'P.xy', a: 'Z', i: 2 }];
        const ax = rng.pick(axes);
        let N;
        if (level === 1) { N = [0, 0, 0]; N[ax.i] = rng.sign(); }
        else {
          const big = rng.pick(level === 2 ? [0.9, 0.8] : [0.7, 0.65]);
          N = [0, 0, 0]; N[ax.i] = big * rng.sign();
          const rest = Math.sqrt(1 - big * big);
          const o = [0, 1, 2].filter((x) => x !== ax.i);
          const split = level === 2 ? 1 : 0.62;
          N[o[0]] = +(rest * Math.sqrt(split) * rng.sign()).toFixed(2); N[o[1]] = +(rest * Math.sqrt(1 - split) * rng.sign()).toFixed(2);
        }
        const Ns = N.map((x) => n(x, 2)).join(', ');
        const desc = { X: 'side (along X)', Y: 'top/bottom (along Y)', Z: 'front/back (along Z)' };
        return {
          prompt: `A pixel has normal <code>N = (${Ns})</code>. Which texture lookup gets the biggest weight?`,
          options: [...[ax, ...axes.filter((x) => x !== ax)].map((x) => ({ code: `texture2D(uTex, ${x.c})${level === 1 ? `  // ${x.a}` : ''}` })), { code: `texture2D(uTex, uv)${level === 1 ? '  // mesh UVs' : ''}` }],
          sub: level === 1 ? undefined : 'Each projection uses the two axes it does NOT look along.',
          explain: `<p>The biggest |component| of N is <b>${ax.a}</b> (|${n(N[ax.i], 2)}|) → the projection ${desc[ax.a]} uses <code>${ax.c}</code> — the two <i>other</i> axes.</p><p>The sign doesn't matter thanks to abs(): +${ax.a} and −${ax.a} faces both use it.</p>`,
        };
      },
    },
    {
      id: 'tri-fill', title: 'Fill the triplanar', engine: 'codefill', rounds: 4,
      blurb: 'Complete the weights or the projections.',
      gen: (rng, level) => {
        const BASE = `vec3 w = pow(abs(N), vec3(4.0));\nw /= w.x + w.y + w.z;\nvec3 tx = texture2D(uTex, P.zy).rgb;\nvec3 ty = texture2D(uTex, P.xz).rgb;\nvec3 tz = texture2D(uTex, P.xy).rgb;\ncol = tx * w.x + ty * w.y + tz * w.z;\n${LIT}`;
        const V = [
          { tpl: BASE.replace('pow(abs(N)', 'pow([[0]](N)'), slots: [{ options: ['abs', 'normalize', 'sign', 'fract'], answer: 'abs' }], why: '<code>abs</code> makes −X faces use the X projection too. Without it negative weights appear (dark/odd patches).' },
          { tpl: BASE.replace('vec3 ty = texture2D(uTex, P.xz).rgb;', 'vec3 ty = texture2D(uTex, [[0]]).rgb;'), slots: [{ options: ['P.xz', 'P.xy', 'P.zy', 'P.yy'], answer: 'P.xz' }], why: 'The Y (top) projection uses the two <i>other</i> axes: x and z.' },
          { tpl: BASE.replace('w /= w.x + w.y + w.z;', 'w /= [[0]];').replace('col = tx * w.x + ty * w.y + tz * w.z;', 'col = tx * [[1]] + ty * w.y + tz * w.z;'), slots: [{ options: ['w.x + w.y + w.z', 'length(w)', '3.0'], answer: 'w.x + w.y + w.z' }, { options: ['w.x', 'w.y', 'w.z'], answer: 'w.x' }], why: 'Divide by the <b>sum</b> so the weights add to 1 (length() gives a different total → brightness changes). The X projection (P.zy) is weighted by w.x.', lvl: 2 },
          { tpl: BASE.replace('vec3 tx = texture2D(uTex, P.zy).rgb;', 'vec3 tx = texture2D(uTex, [[0]]).rgb;').replace('vec3 tz = texture2D(uTex, P.xy).rgb;', 'vec3 tz = texture2D(uTex, [[1]]).rgb;'), slots: [{ options: ['P.zy', 'P.xy', 'P.xz'], answer: 'P.zy' }, { options: ['P.xy', 'P.zy', 'P.xz'], answer: 'P.xy' }], why: 'Each projection drops its own axis: X → (z, y), Z → (x, y).', lvl: 3 },
        ].filter((x) => (x.lvl || 1) <= level);
        const vr = rng.pick(V);
        const mesh = rng.pick(['sphere', 'torus']);
        return {
          prompt: 'Complete the triplanar shader to match the target:',
          template: vr.tpl, slots: vr.slots,
          build: (vals) => ({ frag: fill(vr.tpl, vals), mesh, camera: CAM, textures: { uTex: 'uvgrid' } }),
          explain: `<p>${vr.why}</p>`,
        };
      },
    },
    {
      id: 'tri-tune', title: 'Match the rock', engine: 'slider', rounds: 4,
      blurb: 'Match the triplanar tiling and blend sharpness.',
      gen: (rng, level) => {
        const t = { tile: rng.step(0.6, 2.4, 0.2), sharp: rng.pick([1, 2, 4, 8, 16]) };
        const params = [{ name: 'tile', label: 'tiling', min: 0.5, max: 3, step: 0.05, target: t.tile }];
        if (level >= 2) params.push({ name: 'sharp', label: 'sharpness', min: 1, max: 16, step: 0.5, target: t.sharp });
        const mesh = level === 3 ? rng.pick(['sphere', 'torus']) : 'sphere';
        const P = (p) => ({ tile: p.tile, sharp: p.sharp ?? 4, mesh, tex: level === 1 ? 'uvgrid' : 'brick' });
        return {
          prompt: 'Make your triplanar mapping match the target.',
          sub: 'Tiling: count the repeats. Sharpness: look at the diagonal zones where projections overlap.',
          params,
          build: (p) => triSpec(P(p)),
          code: (p) => triCode(P(p)),
          tolerance: 0.05,
          explain: '<p>Tiling multiplies the world position → more repeats. Low sharpness = wide, blurry double-image zones; high = crisp seams between projections.</p>',
        };
      },
    },
  ],
};

// ================================================================ TOPIC
export default {
  id: 'effects',
  title: 'Tech-art effect recipes',
  icon: '🧪',
  blurb: 'Everything combined: dissolve, hologram, lava, fire, shields, toon, water, flowmaps, wind, triplanar.',
  cheatsheet: `
<p>Read any effect as <b>Mask</b> (where?) → <b>Motion</b> (how does it move?) → <b>Colour</b> (what colour?) → <b>Output</b> (opaque / alpha / additive?).</p>
<ul>
<li><b>Dissolve</b>: <code>keep = step(amount, noise)</code>, <code>edge = keep − step(amount + w, noise)</code>, <code>col = mix(base, glow, edge)</code>, <code>alpha = keep</code>.</li>
<li><b>Hologram</b>: <code>step(0.5, fract(P.y·k − t))</code> + <code>pow(1 − N·V, p)</code> rim, × flicker <code>hash(floor(t·12))</code>, <b>additive</b>.</li>
<li><b>Lava / energy</b>: two noise layers scrolling different ways, <b>multiplied</b>, <code>smoothstep</code> contrast, palette lookup <code>texture2D(pal, vec2(v, 0.5))</code>.</li>
<li><b>Fire</b>: mask (centre × bottom) <b>minus</b> noise scrolling up (<code>uv.y − t</code>), ramp <code>vec3(h, h², h³)</code>, additive.</li>
<li><b>Shield</b>: fresnel rim + hex lines <code>1 − smoothstep(0, w, hexEdge)</code> × pulse <code>pow(sin…, k)</code>, additive.</li>
<li><b>Toon</b>: <code>floor(N·L · k)/(k−1)</code> → mix(shadow, lit); hard rim <code>step(t, 1 − N·V)</code>; outline = inverted hull (push along normal, cull front, black).</li>
<li><b>Water</b>: depth → mix(shallow, deep); uv + centred noise offset; two scrolling normal layers; foam = <code>step(noise, 1 − depth / width)</code>.</li>
<li><b>Flowmap</b>: <code>flow = tex.rg·2 − 1</code>; two phases <code>fract(t)</code>, <code>fract(t + 0.5)</code>; weight <code>|1 − 2·ph0|</code>.</li>
<li><b>Wind</b> (vertex): <code>pos.x += sin(t·speed + phase) · amp · pow(h, e)</code>, phase = hash(object id) · TAU.</li>
<li><b>Triplanar</b>: <code>w = pow(abs(N), k); w /= sum</code>; samples at <code>P.zy, P.xz, P.xy</code>.</li>
</ul>
<pre class="code">// moving a pattern: uv + offset moves it the OPPOSITE way
fbm(uv + vec2(0.0, -uTime))   // pattern moves UP</pre>`,
  concepts: [dissolve, hologram, lava, fire, shield, toon, water, flowmap, wind, triplanar],
};
