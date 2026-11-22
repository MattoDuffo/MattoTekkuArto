// Topic 3 — Colour as numbers: RGB, mixing light, colour maths, clamping, luminance, HSV.
import { tf, q, distinct, G, f, n, nv, v, h, css } from './_kit.js';

const swatch = (c, label) => h('div', h('div.swatch', { style: { background: css(c), height: '48px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.15)' } }), label ? h('div.small.dim.center', label) : null);

// ---------------------------------------------------------------- helpers
const keyC = (c) => c.map((x) => n(x, 3)).join(',');
const maxDiff = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
const vc = (c, d = 2) => v(c, d);           // "vec3(1.0, 0.5, 0.0)"
const clamp01 = (c) => G.clamp(c, 0, 1);
const round3 = (c) => c.map((x) => +x.toFixed(3));

/** Options for colour mcqs: correct first, then distractors at least minD apart from every other option. */
function colourOpts(rng, correct, makeWrong, minD = 0.2, count = 4) {
  const out = [correct];
  for (let t = 0; out.length < count && t < 300; t++) {
    const w = makeWrong(rng, t);
    if (!w) continue;
    if (out.every((o) => maxDiff(o, w) >= minD - 1e-9)) out.push(w);
  }
  return out;
}
const grid = (level) => (level === 1 ? [0, 1] : level === 2 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]);
const randCol = (rng, vals) => [rng.pick(vals), rng.pick(vals), rng.pick(vals)];

/** JS mirror of the prelude hsv2rgb */
const hsv2rgb = ([hh, s, val]) => [1, 2 / 3, 1 / 3].map((k) => {
  const p = Math.abs(G.fract(hh + k) * 6 - 3);
  return val * G.mix(1, G.clamp(p - 1, 0, 1), s);
});
const luma709 = (c) => G.dot(c, [0.2126, 0.7152, 0.0722]);

const HUE_NAMES = [
  { h: 0, name: 'red' }, { h: 1 / 12, name: 'orange' }, { h: 1 / 6, name: 'yellow' }, { h: 1 / 3, name: 'green' },
  { h: 1 / 2, name: 'cyan' }, { h: 2 / 3, name: 'blue' }, { h: 5 / 6, name: 'magenta' },
];

const RGB2HSV = `
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`;

// three overlapping "lamps" (additive Venn)
const VENN = `
float lampR = step(length(uv - vec2(0.38, 0.6)), 0.27);
float lampG = step(length(uv - vec2(0.62, 0.6)), 0.27);
float lampB = step(length(uv - vec2(0.5, 0.38)), 0.27);
col = vec3(lampR * uL.r, lampG * uL.g, lampB * uL.b);`;

// test picture for greyscale: R, G, B bars on top, photo below
const GREY_SRC = `
vec3 c = texture2D(uTex, uv).rgb;
if (uv.y > 0.62) c = uv.x < 0.333 ? vec3(1.0, 0.0, 0.0) : uv.x < 0.667 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
`;
const GREY_METHODS = [
  { code: 'col = vec3((c.r + c.g + c.b) / 3.0);', name: 'average', lvl: 1, why: 'Average: all three pure bars become the same grey (1/3).' },
  { code: 'col = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));', name: 'luma', lvl: 1, why: 'Luma: green bar bright, red medium, blue very dark — like our eyes see them.' },
  { code: 'col = vec3(c.r);', name: 'red only', lvl: 1, why: 'Only the red channel: the red bar is white, green and blue bars are black.' },
  { code: 'col = vec3(c.b);', name: 'blue only', lvl: 2, why: 'Only the blue channel: just the blue bar is white.' },
  { code: 'col = vec3(c.g);', name: 'green only', lvl: 2, why: 'Only the green channel: just the green bar is white.' },
  { code: 'col = vec3(max(c.r, max(c.g, c.b)));', name: 'max', lvl: 3, why: 'Max channel (the V of HSV): every pure bar becomes full white.' },
];

// colour operations applied to the photo
const OPS = [
  { code: 'col = c * vec3(1.0, 0.5, 0.5);', lvl: 1, why: 'Multiplying by (1, 0.5, 0.5) keeps red but halves green and blue → a red tint.' },
  { code: 'col = c * vec3(0.5, 0.6, 1.0);', lvl: 1, why: 'Multiplying keeps blue, cuts red → cold blue tint.' },
  { code: 'col = c + vec3(0.3);', lvl: 1, why: 'Adding lifts every pixel, even the blacks → washed out, foggy.' },
  { code: 'col = 1.0 - c;', lvl: 1, why: '1 − c flips every channel: a negative image.' },
  { code: 'col = c * 0.4;', lvl: 1, why: 'Multiplying by a number < 1 darkens, but black stays black and contrast ratios stay.' },
  { code: 'col = c * vec3(0.0, 1.0, 1.0);', lvl: 2, why: 'Red channel multiplied by 0 → red is removed entirely, image turns cyan-ish.' },
  { code: 'col = c * 2.0;', lvl: 2, why: '× 2 brightens; bright areas pass 1.0 and clip to white.' },
  { code: 'col = c - vec3(0.3);', lvl: 2, why: 'Subtracting pushes darks below 0 → they clip to pure black (crushed shadows).' },
  { code: 'col = c + vec3(0.35, 0.0, 0.0);', lvl: 3, why: 'Adding red only: like shining a red light on it — blacks become dark red.' },
  { code: 'col = vec3(1.0) - c * vec3(0.0, 1.0, 1.0);', lvl: 3, why: 'Red removed, then inverted: red channel becomes 1 everywhere.' },
];

/** small row of labelled swatches as a visual */
function swatchRow(el, items) {
  const row = h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: '8px', margin: '8px 0' } });
  items.forEach((it) => row.append(swatch(it.c, it.label)));
  el.append(row);
}

export default {
  id: 'color',
  title: 'Colour as numbers',
  icon: '🎨',
  blurb: 'RGB, mixing light, colour maths, clamping, luminance and hue.',
  cheatsheet: `
<p>A colour = <code>vec3(red, green, blue)</code>, each <b>0..1</b> (not 0..255: divide by 255). Equal channels = grey.</p>
<p><b>Light adds</b>: R+G = yellow, R+B = magenta, G+B = cyan, R+G+B = white.</p>
<pre class="code">col = c * tint;        // multiply = filter / tint (darkens)
col = c + vec3(0.2);   // add = brighten / glow (lifts blacks)
col = c * 2.0;         // brightness
col = 1.0 - c;         // invert
col = clamp(c, 0.0, 1.0); // = saturate(c) in HLSL</pre>
<p>Maths is per channel: <code>(1, .5, .2) * (.5, 1, 0) = (.5, .5, 0)</code>. The screen clips everything to 0..1.</p>
<pre class="code">float avg  = (c.r + c.g + c.b) / 3.0;
float luma = dot(c, vec3(0.2126, 0.7152, 0.0722)); // perceived
col = mix(vec3(luma), c, saturation);</pre>
<p><b>HSV</b>: hue (0..1 around the wheel: 0 red, 1/6 yellow, 1/3 green, 1/2 cyan, 2/3 blue, 5/6 magenta), saturation, value. <code>hsv2rgb(vec3(fract(h + shift), s, v))</code> shifts hue.</p>`,
  concepts: [
    // ==================================================================
    {
      id: 'color.rgb',
      title: 'RGB channels',
      blurb: 'Three numbers from 0 to 1: how much red, green and blue light.',
      lesson: [
        {
          title: 'Three tiny lamps',
          body: `<p>Look very closely at a screen and every pixel is three tiny lamps: <b style="color:#ff6060">red</b>, <b style="color:#60ff60">green</b>, <b style="color:#6b8cff">blue</b>.</p>
<p>A colour in a shader is just <b>how bright each lamp is</b>: a <code>vec3</code> of three numbers, from <code>0.0</code> (off) to <code>1.0</code> (full).</p>
<div class="analogy">💡 Three dimmer switches. Every colour you've ever seen on a screen is some setting of these three dimmers.</div>`,
          controls: [
            { name: 'r', label: 'red lamp', min: 0, max: 1, step: 0.01, value: 1 },
            { name: 'g', label: 'green lamp', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 'b', label: 'blue lamp', min: 0, max: 1, step: 0.01, value: 0.1 },
          ],
          shader: (x) => ({ frag: `col = uC;
// show the three lamps as bars at the bottom
if (uv.y < 0.22) {
  float i = floor(uv.x * 3.0);
  float val = i < 0.5 ? uC.r : i < 1.5 ? uC.g : uC.b;
  vec3 lamp = i < 0.5 ? vec3(1.0, 0.0, 0.0) : i < 1.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  col = lamp * step(uv.y / 0.2, val) * 0.9 + 0.05;
}`, uniforms: { uC: [x.r, x.g, x.b] } }),
          code: (x) => `col = vec3(${f(x.r, 2)}, ${f(x.g, 2)}, ${f(x.b, 2)});\n//        red   green  blue`,
        },
        {
          title: '0..1, not 0..255',
          body: `<p>Photoshop and colour pickers usually show <b>0 to 255</b> (8-bit). Shaders use <b>0 to 1</b>. Same idea, different scale:</p>
<pre class="code">shader value = picker value / 255
128 / 255 ≈ 0.5    255 / 255 = 1.0    51 / 255 = 0.2</pre>
<p>Why 0..1? It makes maths natural: multiplying by 0.5 means "half as bright", multiplying two colours stays in range.</p>`,
          controls: [{ name: 'b', label: 'picker value (0..255)', min: 0, max: 255, step: 1, value: 204 }],
          shader: (x) => ({ frag: 'col = vec3(uK);', uniforms: { uK: x.b / 255 } }),
          code: (x) => `// ${x.b} / 255 = ${n(x.b / 255, 3)}\ncol = vec3(${f(x.b / 255, 3)});`,
          quiz: { q: 'A picker says R = 102. What is it in a shader?', options: ['0.4', '102.0', '0.102', '1.02'], answer: 0, explain: '102 / 255 = 0.4.' },
        },
        {
          title: 'An image is three greyscale images',
          body: `<p>Every image is really <b>three separate greyscale pictures</b> — one per lamp — shown on top of each other. These are the <b>channels</b>.</p>
<p>Below: the original, then only its red, green and blue channels (as grey). Bright = lots of that colour.</p>`,
          shaders: [
            { spec: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'photo' } }, label: 'original <code>c.rgb</code>' },
            { spec: { frag: 'col = vec3(texture2D(uTex, uv).r);', textures: { uTex: 'photo' } }, label: 'red channel <code>c.r</code>' },
            { spec: { frag: 'col = vec3(texture2D(uTex, uv).g);', textures: { uTex: 'photo' } }, label: 'green <code>c.g</code>' },
            { spec: { frag: 'col = vec3(texture2D(uTex, uv).b);', textures: { uTex: 'photo' } }, label: 'blue <code>c.b</code>' },
          ],
          after: '<div class="tip">Tech artists pack 3–4 greyscale masks into one texture this way ("channel packing"): e.g. roughness in R, metallic in G, AO in B.</div>',
        },
        {
          title: 'Greys are equal channels',
          body: `<p>When all three lamps have the <b>same</b> value, you get a grey. <code>vec3(0.5)</code> is short for <code>vec3(0.5, 0.5, 0.5)</code>.</p>
<p>Break the balance slightly and the grey gets a colour cast:</p>`,
          controls: [
            { name: 'g', label: 'grey level', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 't', label: 'extra blue', min: -0.3, max: 0.3, step: 0.01, value: 0 },
          ],
          shader: (x) => ({ frag: 'col = vec3(uG, uG, uG + uT);', uniforms: { uG: x.g, uT: x.t } }),
          code: (x) => `col = vec3(${f(x.g, 2)}, ${f(x.g, 2)}, ${f(x.g + x.t, 2)});\n// ${Math.abs(x.t) < 0.005 ? 'equal → neutral grey' : x.t > 0 ? 'more blue → cool grey' : 'less blue → warm grey'}`,
          quiz: { q: 'Which of these is a pure grey?', options: ['vec3(0.3, 0.3, 0.3)', 'vec3(0.3, 0.3, 0.0)', 'vec3(0.3, 0.0, 0.3)'], answer: 0, explain: 'All three channels equal → grey.' },
        },
        {
          title: 'col.r is the same as col.x',
          body: `<p>A colour is just a <code>vec3</code> — the same type as a 3D position. You can read its parts as <code>.r .g .b</code> or <code>.x .y .z</code>: they're the same slots.</p>
<pre class="code">vec3 c = vec3(1.0, 0.5, 0.2);
c.r  // 1.0   (same as c.x)
c.g  // 0.5   (same as c.y)
c.b  // 0.2   (same as c.z)</pre>
<div class="note">The GPU doesn't know it's a colour. It's three numbers. <i>You</i> decide what they mean.</div>`,
        },
      ],
      games: [
        {
          id: 'code-to-colour', title: 'Numbers → colour', engine: 'mcq', rounds: 8,
          blurb: 'Read the vec3 and pick the matching colour.',
          gen: (rng, level) => {
            const vals = grid(level);
            let c; do { c = randCol(rng, vals); } while (level > 1 && c[0] === c[1] && c[1] === c[2] && rng.chance(0.7));
            const minD = level === 3 ? 0.25 : 0.5;
            const opts = colourOpts(rng, c, (r, i) => (i % 3 === 0 ? [c[1], c[2], c[0]] : i % 3 === 1 ? [c[2], c[0], c[1]] : randCol(r, vals)), minD);
            return {
              prompt: 'Which colour is this?',
              code: `col = ${vc(c)};`,
              options: opts.map((o) => ({ color: o })),
              explain: `<p>Red ${n(c[0])}, green ${n(c[1])}, blue ${n(c[2])}. ${c[0] === c[1] && c[1] === c[2] ? 'Equal channels → grey.' : 'Start from the biggest channel(s), then see what the others add.'}</p>`,
            };
          },
        },
        {
          id: 'colour-to-code', title: 'Colour → numbers', engine: 'mcq', rounds: 8,
          blurb: 'Look at the colour and pick its vec3.',
          gen: (rng, level) => {
            const vals = grid(level);
            const c = randCol(rng, vals);
            const minD = level === 3 ? 0.25 : 0.5;
            const opts = colourOpts(rng, c, (r, i) => (i % 2 === 0 ? [c[2], c[1], c[0]] : randCol(r, vals)), minD);
            return {
              prompt: 'Which vec3 makes this colour?',
              color: c,
              options: opts.map((o) => ({ code: vc(o) })),
              explain: `<p>It's <code>${vc(c)}</code>. Useful anchors: yellow = (1,1,0), cyan = (0,1,1), magenta = (1,0,1), orange ≈ (1,0.5,0).</p>`,
            };
          },
        },
        {
          id: 'bytes', title: '0..255 ↔ 0..1', engine: 'numeric', rounds: 6,
          blurb: 'Convert colour-picker values into shader values and back.',
          gen: (rng, level) => {
            const pairs = [[0, 0], [51, 0.2], [102, 0.4], [153, 0.6], [204, 0.8], [255, 1], [128, 0.5], [64, 0.25], [191, 0.75]];
            const [b, x] = rng.pick(pairs);
            const back = level >= 2 && rng.chance(0.4);
            if (level === 3 && rng.chance(0.5)) {
              const c = [rng.pick(pairs), rng.pick(pairs), rng.pick(pairs)];
              return { prompt: `A colour picker shows <b>RGB(${c.map((p) => p[0]).join(', ')})</b>. Type it as a shader colour:`, answer: c.map((p) => +(p[0] / 255).toFixed(3)), wrap: 'vec3', tolerance: 0.011, explain: `<p>Divide each by 255: ${c.map((p) => `${p[0]}/255 ≈ ${n(p[0] / 255, 2)}`).join(', ')}.</p>` };
            }
            if (back) return { prompt: `A shader uses <code>${f(x)}</code>. What is it on a 0..255 picker?`, answer: b, tolerance: 1, explain: `<p>${n(x)} × 255 = ${n(x * 255, 1)} ≈ <b>${b}</b>.</p>` };
            return { prompt: `A colour picker shows <b>${b}</b>. What is that in a shader (0..1)?`, answer: +(b / 255).toFixed(3), tolerance: 0.011, explain: `<p>${b} / 255 ≈ <b>${n(b / 255, 2)}</b>.</p>` };
          },
        },
        {
          id: 'match-rgb', title: 'Match the colour', engine: 'slider', rounds: 4,
          blurb: 'Set the three lamps to match the target colour.',
          gen: (rng, level) => {
            const vals = level === 1 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
            const t = randCol(rng, vals);
            if (t.every((x) => x === t[0])) t[rng.int(0, 2)] = t[0] > 0.5 ? 0.25 : 0.75;
            return {
              prompt: 'Set red, green and blue to match the target.',
              sub: level === 1 ? 'Each channel is 0, 0.5 or 1.' : 'Each channel is a multiple of 0.25. Which lamp is strongest?',
              params: ['r', 'g', 'b'].map((k, i) => ({ name: k, label: ['red', 'green', 'blue'][i], min: 0, max: 1, step: 0.05, target: t[i] })),
              build: (p) => ({ frag: 'col = uC;', uniforms: { uC: [p.r, p.g, p.b] } }),
              code: (p) => `col = vec3(${f(p.r, 2)}, ${f(p.g, 2)}, ${f(p.b, 2)});`,
              tolerance: 0.07,
              explain: `<p>Target was <code>${vc(t)}</code>. Tip: first find which lamps are on at all, then fine-tune their strength.</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'color.mix',
      title: 'Mixing light',
      blurb: 'Screens ADD light: red + green = yellow. Not like paint!',
      lesson: [
        {
          title: 'Light adds up',
          body: `<p>Three lamps shining on a dark wall. Where they overlap, the light <b>adds</b>.</p>
<p>Turn the lamps up and down and watch the overlaps:</p>`,
          controls: [
            { name: 'r', label: 'red lamp', min: 0, max: 1, step: 0.01, value: 1 },
            { name: 'g', label: 'green lamp', min: 0, max: 1, step: 0.01, value: 1 },
            { name: 'b', label: 'blue lamp', min: 0, max: 1, step: 0.01, value: 1 },
          ],
          shader: (x) => ({ frag: VENN, uniforms: { uL: [x.r, x.g, x.b] } }),
          code: (x) => `vec3 red   = vec3(${f(x.r, 2)}, 0.0, 0.0);\nvec3 green = vec3(0.0, ${f(x.g, 2)}, 0.0);\nvec3 blue  = vec3(0.0, 0.0, ${f(x.b, 2)});\n// centre: red + green + blue = vec3(${n(x.r, 2)}, ${n(x.g, 2)}, ${n(x.b, 2)})`,
        },
        {
          title: 'The secondary colours',
          body: `<p>Adding two full lamps gives the three <b>secondary</b> colours:</p>
<ul><li>red + green = <b style="color:#ffff60">yellow</b> <code>(1, 1, 0)</code></li>
<li>green + blue = <b style="color:#60ffff">cyan</b> <code>(0, 1, 1)</code></li>
<li>red + blue = <b style="color:#ff60ff">magenta</b> <code>(1, 0, 1)</code></li>
<li>all three = <b>white</b> <code>(1, 1, 1)</code></li></ul>`,
          visual: (el) => swatchRow(el, [{ c: [1, 1, 0], label: 'R+G' }, { c: [0, 1, 1], label: 'G+B' }, { c: [1, 0, 1], label: 'R+B' }, { c: [1, 1, 1], label: 'R+G+B' }]),
          quiz: { q: 'What do you get from <code>vec3(0,1,0) + vec3(0,0,1)</code>?', options: ['Cyan', 'Yellow', 'Brown', 'Magenta'], answer: 0, explain: 'Green light + blue light = cyan (0, 1, 1).' },
        },
        {
          title: 'Not like paint!',
          body: `<p>In paint, red + green makes a muddy <b>brown</b>. That's because paint <b>absorbs</b> light: each pigment removes some colours, so mixing removes more (that's <i>subtractive</i> mixing).</p>
<p>Screens <b>emit</b> light, so mixing adds more light: red + green = bright <b>yellow</b> (<i>additive</i> mixing).</p>
<div class="analogy">🎨 Paint = stacking sunglasses (each one blocks more). 🔦 Light = adding torches (each one adds more).</div>`,
          visual: (el) => swatchRow(el, [{ c: [1, 0, 0], label: 'red' }, { c: [0, 1, 0], label: '+ green' }, { c: [1, 1, 0], label: '= light' }, { c: [0.42, 0.3, 0.12], label: '≠ paint' }]),
        },
        {
          title: 'Shades in between',
          body: `<p>Lamps don't have to be fully on. Red at full + green at half = <b>orange</b>. Slide green from 0 to 1 and you walk from red, through orange, to yellow.</p>`,
          controls: [{ name: 'g', label: 'green amount', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (x) => ({ frag: 'col = vec3(1.0, uG, 0.0);\nif (uv.y < 0.2) col = vec3(1.0, uv.x, 0.0) * step(0.006, abs(uv.x - uG));', uniforms: { uG: x.g } }),
          code: (x) => `col = vec3(1.0, ${f(x.g, 2)}, 0.0);\n// ${x.g < 0.15 ? 'red' : x.g < 0.35 ? 'red-orange' : x.g < 0.65 ? 'orange' : x.g < 0.85 ? 'golden' : 'yellow'}`,
          after: '<div class="note">Strip at the bottom: all the in-between colours from red to yellow. The black tick marks your current value.</div>',
        },
      ],
      games: [
        {
          id: 'light-sum', title: 'Add the lights', engine: 'mcq', rounds: 8,
          blurb: 'Two coloured lights are added. Which colour comes out?',
          gen: (rng, level) => {
            const P = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            let a, b;
            if (level === 1) { [a, b] = rng.pickN(P, 2); }
            else {
              const half = (c) => c.map((x) => x * 0.5);
              do {
                a = rng.pick(level === 2 ? P : [...P, [1, 1, 0], [0, 1, 1], [1, 0, 1], half(P[0]), [0.5, 0.5, 0]]);
                b = rng.pick([...P, ...P.map(half), ...(level === 3 ? [[0, 0.5, 0.5], [0.5, 0, 0.5]] : [])]);
              } while (G.add(a, b).some((x) => x > 1) || keyC(a) === keyC(b));
            }
            const sum = G.add(a, b);
            const paint = [Math.min(a[0], b[0]) * 0.5 + 0.35, 0.28, 0.1];
            const avg = G.mul(sum, 0.5);
            const opts = colourOpts(rng, sum, (r, i) => [paint, avg, a, b, [1, 1, 1], G.sub([1, 1, 1], sum)][i % 6], 0.2);
            return {
              prompt: 'What colour does this add up to?',
              code: `col = ${vc(a)}\n    + ${vc(b)};`,
              options: opts.map((o) => ({ color: o })),
              explain: `<p>Add channel by channel: <code>${vc(sum)}</code>. Light only ever gets <b>brighter</b> when you add — never muddy like paint.</p>`,
            };
          },
        },
        {
          id: 'name-lamps', title: 'Which lamps are on?', engine: 'numeric', rounds: 6,
          blurb: 'Look at the colour and type the three lamp values.',
          gen: (rng, level) => {
            const vals = level === 1 ? [0, 1] : [0, 0.5, 1];
            let c; do { c = randCol(rng, vals); } while (level > 1 && !c.includes(0.5) && rng.chance(0.6));
            return {
              prompt: 'Type the red, green and blue values of this colour:',
              sub: level === 1 ? 'Each lamp is either off (0) or full (1).' : 'Each lamp is 0, 0.5 or 1.',
              color: c,
              answer: c, wrap: 'vec3', labels: ['r', 'g', 'b'], tolerance: 0.011,
              explain: `<p>It's <code>${vc(c)}</code>. ${c.includes(0.5) ? 'A half-strength lamp gives darker or in-between shades (orange, olive, purple, teal…).' : 'Only full lamps: black, red, green, blue, yellow, cyan, magenta or white.'}</p>`,
            };
          },
        },
        {
          id: 'venn-match', title: 'Tune the lamps', engine: 'slider', rounds: 4,
          blurb: 'Three overlapping lamps. Match their brightness to the target.',
          gen: (rng, level) => {
            const vals = level === 1 ? [0, 1] : level === 2 ? [0, 0.5, 1] : [0.25, 0.5, 0.75, 1];
            let t; do { t = randCol(rng, vals); } while (t.every((x) => x === 0));
            return {
              prompt: 'Set the lamps so the picture matches — overlaps included.',
              sub: 'Look at the overlaps: they show what adds up.',
              params: ['r', 'g', 'b'].map((k, i) => ({ name: k, label: ['red lamp', 'green lamp', 'blue lamp'][i], min: 0, max: 1, step: 0.05, target: t[i] })),
              build: (p) => ({ frag: VENN, uniforms: { uL: [p.r, p.g, p.b] } }),
              code: (p) => `// centre = vec3(${n(p.r, 2)}, ${n(p.g, 2)}, ${n(p.b, 2)})`,
              tolerance: 0.07,
              explain: `<p>Target lamps: ${nv(t)}. Each circle shows one lamp alone; overlaps are sums.</p>`,
            };
          },
        },
        {
          id: 'light-facts', title: 'Light or paint?', engine: 'mcq', rounds: 7,
          blurb: 'True/false about additive colour.',
          questions: [
            tf('On a screen, red light + green light looks yellow.', true, 'Additive mixing: (1,0,0) + (0,1,0) = (1,1,0).'),
            tf('Adding two colours on screen can make the result darker.', false, 'Adding light only adds brightness (values ≥ 0 never decrease a sum).'),
            tf('<code>vec3(1.0)</code> is white.', true, 'All three lamps full on.'),
            tf('<code>vec3(0.0, 0.0, 0.0)</code> is white.', false, 'All lamps off = black.'),
            q('Which colour is <code>vec3(1.0, 0.0, 1.0)</code>?', ['Magenta', 'Purple-blue', 'Pink-white', 'Brown'], 'Red + blue lights = magenta.'),
            q('Which colour is <code>vec3(0.0, 1.0, 1.0)</code>?', ['Cyan', 'Teal-green', 'Blue', 'White'], 'Green + blue = cyan.'),
            q('Red + green + blue light at full strength =', ['White', 'Black', 'Brown', 'Grey'], 'All three lamps full = white.'),
            q('Which mixing does a printer use?', ['Subtractive (inks absorb light)', 'Additive (inks emit light)', 'Neither'], 'Inks remove light, like paint. That\'s why printers use cyan, magenta, yellow (CMY).', { level: 2 }),
            q('How do you make orange with light?', [{ code: 'vec3(1.0, 0.5, 0.0)' }, { code: 'vec3(1.0, 0.0, 0.5)' }, { code: 'vec3(0.5, 1.0, 0.0)' }, { code: 'vec3(0.5, 0.5, 0.5)' }], 'Full red + half green = orange (between red and yellow).', { level: 2 }),
            q('What is <code>vec3(0.5, 0.0, 0.5)</code>?', ['Dark purple', 'Bright magenta', 'Grey', 'Dark green'], 'Half red + half blue = magenta at half brightness → purple.', { level: 2 }),
            tf('<code>vec3(0.5, 0.5, 0.0)</code> is a darker yellow (olive).', true, 'Same ratio as yellow, half the light.', 2),
            tf('Yellow light + blue light = white.', true, '(1,1,0) + (0,0,1) = (1,1,1). Complementary colours add up to white.', 3),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'color.ops',
      title: 'Colour maths',
      blurb: 'Multiply to tint, add to brighten, 1 − c to invert.',
      lesson: [
        {
          title: 'Multiply = a coloured filter',
          body: `<p>Multiplying a colour by another colour works <b>channel by channel</b>. It's like holding coloured glass in front of the image: each channel can only get <b>darker</b> (or stay the same).</p>
<div class="analogy">🕶️ A red glass filter lets red through (×1) and blocks some green and blue (×0.3).</div>`,
          controls: [
            { name: 'r', label: 'tint red', min: 0, max: 1, step: 0.01, value: 1 },
            { name: 'g', label: 'tint green', min: 0, max: 1, step: 0.01, value: 0.7 },
            { name: 'b', label: 'tint blue', min: 0, max: 1, step: 0.01, value: 0.4 },
          ],
          shader: (x) => ({ frag: 'vec3 c = texture2D(uTex, uv).rgb;\ncol = c * uT;', uniforms: { uT: [x.r, x.g, x.b] }, textures: { uTex: 'photo' } }),
          code: (x) => `vec3 c = texture2D(uTex, uv).rgb;\ncol = c * vec3(${f(x.r, 2)}, ${f(x.g, 2)}, ${f(x.b, 2)});\n// = vec3(c.r * ${n(x.r, 2)}, c.g * ${n(x.g, 2)}, c.b * ${n(x.b, 2)})`,
          after: '<div class="note">× white <code>vec3(1.0)</code> changes nothing. × black <code>vec3(0.0)</code> kills everything. That\'s why "tint colour" defaults to white in materials.</div>',
        },
        {
          title: 'Add = more light',
          body: `<p>Adding puts <b>extra light</b> on top. It brightens everything — even the blacks, which turn grey (washed-out, foggy look).</p>
<p>Great for glows, emissive, rim light. Not great for "make it brighter" (multiply is usually better for that).</p>`,
          controls: [{ name: 'k', label: 'amount added', min: 0, max: 0.6, step: 0.01, value: 0.25 }],
          shader: (x) => ({ frag: 'vec3 c = texture2D(uTex, uv).rgb;\ncol = uv.x < 0.5 ? c : c + vec3(uK);', uniforms: { uK: x.k }, textures: { uTex: 'photo' } }),
          code: (x) => `col = c + vec3(${f(x.k, 2)});  // right half\n// a black pixel (0,0,0) becomes (${n(x.k, 2)}, ${n(x.k, 2)}, ${n(x.k, 2)})`,
        },
        {
          title: 'Brightness: multiply by a number',
          body: `<p><code>c * 2.0</code> doubles every channel; <code>c * 0.5</code> halves it. Black stays black, so the picture keeps its contrast — unlike adding.</p>`,
          controls: [{ name: 'k', label: 'multiplier', min: 0, max: 3, step: 0.05, value: 1.5 }],
          shader: (x) => ({ frag: 'vec3 c = texture2D(uTex, uv).rgb;\ncol = uv.x < 0.5 ? c : c * uK;', uniforms: { uK: x.k }, textures: { uTex: 'photo' } }),
          code: (x) => `col = c * ${f(x.k, 2)};  // right half\n// (0.4, 0.2, 0.1) → (${nv(G.mul([0.4, 0.2, 0.1], x.k), 2).slice(1, -1)})`,
          after: '<div class="note">Above 1, bright parts go past 1.0 and clip to white. More on that in "Out of range".</div>',
        },
        {
          title: 'Invert: 1 − c',
          body: `<p><code>1.0 - c</code> flips each channel: 0 ↔ 1, 0.2 ↔ 0.8. Black ↔ white, red ↔ cyan, blue ↔ yellow.</p>
<p>Also used on masks all the time: <code>1.0 - mask</code> = "everything except the mask". Unreal calls it <b>OneMinus</b>.</p>`,
          controls: [{ name: 't', label: 'blend to inverted', min: 0, max: 1, step: 0.01, value: 1 }],
          shader: (x) => ({ frag: 'vec3 c = texture2D(uTex, uv).rgb;\ncol = mix(c, 1.0 - c, uT);', uniforms: { uT: x.t }, textures: { uTex: 'photo' } }),
          code: (x) => `col = mix(c, 1.0 - c, ${f(x.t, 2)});\n// red (1,0,0) → 1 - red = (0,1,1) cyan`,
        },
        {
          title: 'Per channel, every time',
          body: `<p>All of this is just ordinary maths done <b>three times</b>, once per channel:</p>
<pre class="code">vec3(1.0, 0.5, 0.2) * vec3(0.5, 1.0, 0.0)
 = vec3(1.0*0.5, 0.5*1.0, 0.2*0.0)
 = vec3(0.5,     0.5,     0.0)</pre>
<p>Try it: change the second colour and follow the numbers.</p>`,
          controls: [
            { name: 'r', label: 'b.r', min: 0, max: 1, step: 0.1, value: 0.5 },
            { name: 'g', label: 'b.g', min: 0, max: 1, step: 0.1, value: 1 },
            { name: 'b', label: 'b.b', min: 0, max: 1, step: 0.1, value: 0 },
          ],
          shaders: [
            { spec: { frag: 'col = vec3(1.0, 0.5, 0.2);' }, label: 'a = (1, 0.5, 0.2)' },
            { spec: (x) => ({ frag: 'col = vec3(1.0, 0.5, 0.2) * uB;', uniforms: { uB: [x.r, x.g, x.b] } }), label: 'a * b' },
          ],
          code: (x) => { const r = G.mul([1, 0.5, 0.2], [x.r, x.g, x.b]); return `vec3 a = vec3(1.0, 0.5, 0.2);\nvec3 b = vec3(${f(x.r, 1)}, ${f(x.g, 1)}, ${f(x.b, 1)});\na * b = vec3(${n(r[0], 2)}, ${n(r[1], 2)}, ${n(r[2], 2)})`; },
          quiz: { q: '<code>vec3(0.8, 0.4, 1.0) * 0.5</code> = ?', options: ['(0.4, 0.2, 0.5)', '(1.3, 0.9, 1.5)', '(0.8, 0.4, 0.5)'], answer: 0, explain: 'A single number multiplies every channel.' },
        },
      ],
      games: [
        {
          id: 'op-calc', title: 'Colour calculator', engine: 'numeric', rounds: 6,
          blurb: 'Work out the result of colour maths, channel by channel.',
          gen: (rng, level) => {
            const vals = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1];
            const A = randCol(rng, vals), B = randCol(rng, [0, 0.5, 1]);
            const kinds = level === 1 ? ['scalar', 'invert', 'mulMask'] : level === 2 ? ['mul', 'add', 'invert', 'scalar'] : ['mixed', 'invertMul', 'avg', 'mul'];
            const k = rng.pick(kinds);
            let code, res, ex;
            if (k === 'scalar') { const s = rng.pick([0.5, 2]); const a = s === 2 ? randCol(rng, [0, 0.1, 0.2, 0.3, 0.4, 0.5]) : A; code = `${vc(a, 1)} * ${f(s)}`; res = G.mul(a, s); ex = `Every channel × ${s}.`; }
            else if (k === 'invert') { code = `1.0 - ${vc(A, 1)}`; res = G.sub(1, A); ex = 'Each channel: 1 − value.'; }
            else if (k === 'mulMask') { const m = randCol(rng, [0, 1]); code = `${vc(A, 1)} * ${vc(m, 0)}`; res = G.mul(A, m); ex = '× 1 keeps a channel, × 0 removes it.'; }
            else if (k === 'mul') { code = `${vc(A, 1)} * ${vc(B, 1)}`; res = G.mul(A, B); ex = 'Multiply matching channels: r×r, g×g, b×b.'; }
            else if (k === 'add') { const a = randCol(rng, [0, 0.2, 0.4, 0.5]); const b = randCol(rng, [0, 0.1, 0.3, 0.5]); code = `${vc(a, 1)} + ${vc(b, 1)}`; res = G.add(a, b); ex = 'Add matching channels.'; }
            else if (k === 'mixed') { const a = randCol(rng, [0.2, 0.4, 0.6, 0.8]); const s = 0.5; const b = randCol(rng, [0, 0.1, 0.2]); code = `${vc(a, 1)} * ${f(s)} + ${vc(b, 1)}`; res = G.add(G.mul(a, s), b); ex = 'Multiply first, then add (normal maths order).'; }
            else if (k === 'invertMul') { const m = randCol(rng, [0, 0.5, 1]); code = `(1.0 - ${vc(A, 1)}) * ${vc(m, 1)}`; res = G.mul(G.sub(1, A), m); ex = 'Bracket first (invert), then multiply per channel.'; }
            else { const a = randCol(rng, [0, 0.2, 0.4, 0.6, 0.8, 1]); const b = randCol(rng, [0, 0.2, 0.4, 0.6, 0.8, 1]); code = `(${vc(a, 1)} + ${vc(b, 1)}) * 0.5`; res = G.mul(G.add(a, b), 0.5); ex = 'Adding then halving = the average of the two colours (a 50/50 mix).'; }
            res = round3(res);
            return { prompt: 'What is the result?', code, answer: res, wrap: 'vec3', labels: ['r', 'g', 'b'], explain: `<p>${ex} Result: <code>${vc(res)}</code>.</p>` };
          },
        },
        {
          id: 'which-op', title: 'Which operation?', engine: 'mcq', rounds: 6,
          blurb: 'Compare before/after and pick the line of code that did it.',
          gen: (rng, level) => {
            const pool = OPS.filter((o) => o.lvl <= level + (level === 3 ? 0 : 1));
            const ans = rng.pick(pool.filter((o) => o.lvl <= level));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.code);
            return {
              prompt: 'Which line turned the left image into the right one?',
              sub: '<code>c</code> is the original texture colour.',
              shaders: [
                { spec: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'photo' } }, label: 'before' },
                { spec: { frag: 'vec3 c = texture2D(uTex, uv).rgb;\n' + ans.code, textures: { uTex: 'photo' } }, label: 'after' },
              ],
              options: opts.map((o) => ({ code: o.code })),
              explain: `<p>${ans.why}</p><p>Clues: are the blacks still black? (→ multiply) Lifted? (→ add) Crushed? (→ subtract) Flipped? (→ invert)</p>`,
            };
          },
        },
        {
          id: 'tint-photo', title: 'Tint the photo', engine: 'slider', rounds: 4,
          blurb: 'Find the tint colour that was multiplied onto the photo.',
          gen: (rng, level) => {
            const vals = level === 1 ? [0.5, 1] : [0.25, 0.5, 0.75, 1];
            let t; do { t = randCol(rng, vals); } while (t.every((x) => x === 1));
            const add = level === 3 ? rng.pick([0, 0.1, 0.2]) : 0;
            return {
              prompt: `Set the tint so your image matches the target.${add ? ' (A little light is also added.)' : ''}`,
              sub: 'Look at the white/bright parts: they show the tint colour most clearly (white × tint = tint).',
              params: ['r', 'g', 'b'].map((k, i) => ({ name: k, label: `tint.${k}`, min: 0, max: 1, step: 0.05, target: t[i] })),
              build: (p) => ({ frag: `vec3 c = texture2D(uTex, uv).rgb;\ncol = c * uT + ${f(add)};`, uniforms: { uT: [p.r, p.g, p.b] }, textures: { uTex: 'photo' } }),
              code: (p) => `col = c * vec3(${f(p.r, 2)}, ${f(p.g, 2)}, ${f(p.b, 2)})${add ? ' + ' + f(add) : ''};`,
              tolerance: 0.07,
              explain: `<p>Target tint: <code>${vc(t)}</code>. Multiplying by a channel value &lt; 1 removes some of that colour from everything.</p>`,
            };
          },
        },
        {
          id: 'op-fill', title: 'Fill in the operation', engine: 'codefill', rounds: 5,
          blurb: 'Pick the operator and value that produce the target image.',
          gen: (rng, level) => {
            const opsL = level === 1 ? ['*', '+'] : ['*', '+', '-'];
            const valsL = ['vec3(1.0, 0.5, 0.5)', 'vec3(0.3)', '0.5', 'vec3(0.0, 1.0, 1.0)', ...(level >= 2 ? ['2.0'] : [])];
            let op, val;
            do { op = rng.pick(opsL); val = rng.pick(valsL); } while ((op === '-' && (val === '2.0' || val === 'vec3(1.0, 0.5, 0.5)')) || (op === '+' && val === '2.0'));
            return {
              prompt: 'Complete the line so "Yours" matches the target:',
              template: 'vec3 c = texture2D(uTex, uv).rgb;\ncol = c [[0]] [[1]];',
              slots: [{ options: ['*', '+', '-'], answer: op }, { options: valsL, answer: val }],
              build: (vals) => ({ frag: `vec3 c = texture2D(uTex, uv).rgb;\ncol = c ${vals[0]} ${vals[1]};`, textures: { uTex: 'photo' } }),
              explain: '<p>* tints or scales (blacks stay black), + lifts everything (blacks turn grey), − pushes everything down (darks clip to black).</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'color.range',
      title: 'Out of range & clamping',
      blurb: 'What happens to values above 1 or below 0 — and how to control it.',
      lesson: [
        {
          title: 'The screen only shows 0..1',
          body: `<p>Inside the shader a float can be anything: 2.5, −3, 100. But a normal screen pixel can only show <b>0 to 1</b> per channel.</p>
<p>So when the colour is written out, values are <b>clipped</b>: above 1 → 1, below 0 → 0.</p>
<p>Here the gradient is <code>uv.x * k</code>. Raise k: everything past 1.0 just becomes flat white.</p>`,
          controls: [{ name: 'k', label: 'k', min: 1, max: 4, step: 0.1, value: 2 }],
          shader: (x) => ({ frag: 'float g = uv.x * uK;\ncol = vec3(g);\nif (uv.y < 0.15) col = vec3(step(1.0, g), 0.0, 0.0) * 0.8;', uniforms: { uK: x.k } }),
          code: (x) => `col = vec3(uv.x * ${f(x.k, 1)});\n// uv.x > ${n(1 / x.k, 2)} → value > 1 → shown as 1 (white)\n// red strip at the bottom marks the clipped part`,
          graph: { fns: (x) => [{ f: (t) => t * x.k, label: 'value', color: '#6bdfff', dash: [4, 4] }, { f: (t) => Math.min(1, t * x.k), label: 'shown on screen', color: '#ffd479' }], opts: { xmin: 0, xmax: 1, ymin: -0.1, ymax: 2.2 } },
        },
        {
          title: 'Negative values show as black',
          body: `<p>Same on the other side: anything below 0 is shown as 0 (black). You can't have "darker than black" on screen.</p>
<p>Here <code>col = vec3(uv.x - k)</code>: the left part goes negative and is all equally black — even though the numbers are different (−0.1, −0.3…).</p>`,
          controls: [{ name: 'k', label: 'k subtracted', min: 0, max: 0.8, step: 0.05, value: 0.4 }],
          shader: (x) => ({ frag: 'float g = uv.x - uK;\ncol = vec3(g);\nif (uv.y < 0.15) col = vec3(0.0, 0.0, step(g, 0.0)) * 0.8;', uniforms: { uK: x.k } }),
          code: (x) => `col = vec3(uv.x - ${f(x.k, 2)});\n// uv.x < ${n(x.k, 2)} → negative → black (blue strip marks it)`,
          after: '<div class="note">Negative numbers are still <b>useful</b> inside the shader (directions, offsets, signed distances). They only get clipped when they become a colour on screen.</div>',
        },
        {
          title: 'Clipping can change the hue!',
          body: `<p>Orange is <code>(1.0, 0.5, 0.0)</code>. Make it "3× brighter":</p>
<pre class="code">(1.0, 0.5, 0.0) * 3.0 = (3.0, 1.5, 0.0)
on screen → (1.0, 1.0, 0.0)  = YELLOW!</pre>
<p>Each channel is clipped separately, so the <b>ratio</b> between channels breaks and the colour shifts. This is why over-bright fire turns yellow-white.</p>`,
          controls: [{ name: 'k', label: 'brightness ×', min: 0.5, max: 4, step: 0.1, value: 1 }],
          shader: (x) => ({ frag: 'col = vec3(1.0, 0.5, 0.0) * uK;', uniforms: { uK: x.k } }),
          code: (x) => { const r = G.mul([1, 0.5, 0], x.k); return `col = vec3(1.0, 0.5, 0.0) * ${f(x.k, 1)};\n// value: (${n(r[0], 2)}, ${n(r[1], 2)}, 0)\n// shown: (${n(Math.min(1, r[0]), 2)}, ${n(Math.min(1, r[1]), 2)}, 0)`; },
          after: '<div class="tip">HDR rendering keeps values above 1 in float buffers, then a <b>tone mapper</b> squeezes them back into 0..1 gracefully. That\'s how bloom knows what\'s "really bright".</div>',
        },
        {
          title: 'clamp and saturate',
          body: `<p>You can clip on purpose, anywhere in your maths:</p>
<pre class="code">clamp(x, 0.0, 1.0)   // GLSL
saturate(x)          // HLSL / Unreal / Unity – same thing</pre>
<p>Use it to keep masks and blend factors in 0..1, so <code>mix()</code> and multiplies behave. Drag the limits:</p>`,
          controls: [
            { name: 'lo', label: 'min', min: -0.5, max: 0.5, step: 0.05, value: 0 },
            { name: 'hi', label: 'max', min: 0.5, max: 1.5, step: 0.05, value: 1 },
          ],
          graph: { fns: (x) => [{ f: (t) => t, color: '#4a4f63', dash: [4, 4], label: 'x' }, { f: (t) => G.clamp(t, x.lo, x.hi), label: 'clamp(x, min, max)', color: '#ffd479' }], opts: { xmin: -1, xmax: 2, ymin: -1, ymax: 2 } },
          code: (x) => `y = clamp(x, ${f(x.lo, 2)}, ${f(x.hi, 2)});\n// below ${n(x.lo, 2)} → ${n(x.lo, 2)},  above ${n(x.hi, 2)} → ${n(x.hi, 2)}`,
          after: '<div class="tip">GLSL has no built-in <code>saturate</code> (this app adds one for convenience). On many GPUs saturate is <b>free</b> — it\'s a flag on the previous instruction.</div>',
        },
        {
          title: 'Where it bites',
          body: `<ul>
<li><b>Lighting</b>: <code>dot(N, L)</code> is negative on the dark side. Without <code>max(…, 0.0)</code> it would <i>subtract</i> light when added to other lights.</li>
<li><b>Masks</b>: <code>uv.x * 2.0</code> as a mix factor goes to 2 → <code>mix(a, b, 2.0)</code> overshoots past b!</li>
<li><b>Subtracting</b> colours can go negative and crush shadows.</li></ul>
<div class="note">Rule of thumb: if a value is meant to be a 0..1 amount, <b>saturate it</b>.</div>`,
          quiz: { q: 'What does <code>mix(0.0, 1.0, 2.0)</code> return?', options: ['2.0 (it overshoots)', '1.0', '0.5'], answer: 0, explain: 'mix(a, b, t) = a + (b − a)·t = 0 + 1·2 = 2. mix does not clamp t for you.' },
        },
      ],
      games: [
        {
          id: 'what-shows', title: 'What does the screen show?', engine: 'numeric', rounds: 6,
          blurb: 'Compute the colour, then clip each channel to 0..1.',
          gen: (rng, level) => {
            let code, raw, ex;
            if (level === 1) {
              raw = [0, 0, 0].map(() => rng.pick([-0.5, -0.2, 0, 0.3, 0.5, 0.8, 1, 1.2, 1.5, 2]));
              code = `col = ${vc(raw, 1)};`; ex = 'Nothing to compute — just clip: below 0 → 0, above 1 → 1.';
            } else if (level === 2) {
              const a = randCol(rng, [0.2, 0.4, 0.5, 0.6, 0.8]);
              const kind = rng.pick(['mul', 'add', 'sub']);
              if (kind === 'mul') { const k = rng.pick([2, 3]); raw = G.mul(a, k); code = `col = ${vc(a, 1)} * ${f(k)};`; }
              else if (kind === 'add') { const b = rng.pick([0.3, 0.5]); raw = G.add(a, b); code = `col = ${vc(a, 1)} + ${f(b)};`; }
              else { const b = rng.pick([0.3, 0.5]); raw = G.sub(a, b); code = `col = ${vc(a, 1)} - ${f(b)};`; }
              ex = `Raw value: ${nv(round3(raw))}. Then clip each channel.`;
            } else {
              let a; do { a = randCol(rng, [0.2, 0.4, 0.6, 0.8]); } while (Math.max(...a) < 0.6);
              const k = rng.pick([2, 3]);
              if (rng.chance()) { raw = G.mul(G.clamp(G.mul(a, k), 0, 1), 0.5); code = `col = saturate(${vc(a, 1)} * ${f(k)}) * 0.5;`; ex = `saturate first clips ${nv(round3(G.mul(a, k)))} → ${nv(round3(G.clamp(G.mul(a, k), 0, 1)))}, THEN × 0.5. Clipping in the middle loses information!`; }
              else { const k2 = rng.pick([3, 4]); raw = G.mul(G.mul(a, k2), 0.5); code = `col = ${vc(a, 1)} * ${f(k2)} * 0.5;`; ex = `No clipping in the middle: × ${k2} × 0.5 = × ${n(k2 * 0.5)}. Raw: ${nv(round3(raw))}, then clip for the screen.`; }
            }
            const ans = round3(clamp01(raw));
            return { prompt: 'What colour actually appears on screen?', code, answer: ans, wrap: 'vec3', labels: ['r', 'g', 'b'], explain: `<p>${ex} On screen: <code>${vc(ans)}</code>.</p>` };
          },
        },
        {
          id: 'clip-colour', title: 'Over-exposed colours', engine: 'mcq', rounds: 7,
          blurb: 'Predict the colour after brightening/darkening and clipping.',
          gen: (rng, level) => {
            const bases = [[1, 0.5, 0], [1, 0.4, 0.6], [0.3, 0.6, 1], [0.5, 0.2, 1], [0.2, 0.5, 0.4], [1, 0.25, 0.25]];
            const c = rng.pick(bases);
            const ops = level === 1 ? ['mul'] : level === 2 ? ['mul', 'add'] : ['mul', 'add', 'sub'];
            const op = rng.pick(ops);
            let raw, code;
            if (op === 'mul') { const k = rng.pick([2, 3, 4]); raw = G.mul(c, k); code = `col = ${vc(c, 2)} * ${f(k)};`; }
            else if (op === 'add') { const k = rng.pick([0.5, 0.6]); raw = G.add(c, k); code = `col = ${vc(c, 2)} + ${f(k)};`; }
            else { const k = rng.pick([0.4, 0.5]); raw = G.sub(c, k); code = `col = ${vc(c, 2)} - ${f(k)};`; }
            const ans = clamp01(raw);
            const mx = Math.max(...raw);
            const naive = op === 'sub' ? G.mul(c, 0.5) : G.mul(raw, 1 / Math.max(mx, 1));
            const opts = colourOpts(rng, ans, (r, i) => [naive, c, [1, 1, 1], [0, 0, 0], G.mul(c, 0.5), clamp01(G.mul(c, 1.5))][i % 6], 0.2);
            return {
              prompt: 'What colour appears on screen?',
              code,
              shaders: [{ spec: { frag: `col = ${vc(c, 2)};` }, label: 'starting colour' }],
              options: opts.map((o) => ({ color: o })),
              explain: `<p>Raw result: ${nv(round3(raw))}. Each channel is clipped <b>separately</b> → ${nv(round3(ans))}. The ratio between the channels changes, so the hue can shift.</p>`,
            };
          },
        },
        {
          id: 'clamp-sort', title: 'Clipped or not?', engine: 'buckets', rounds: 2,
          blurb: 'Is the value shown as is, or clipped to 0 or 1?',
          gen: (rng, level) => {
            const items = [];
            const seen = new Set();
            const vals = level === 1 ? [0.2, 0.5, 0.8, 1.5, 2, 0.3] : [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.5, 2];
            for (let t = 0; items.length < 10 && t < 400; t++) {
              const a = rng.pick(vals), b = rng.pick(vals);
              const op = rng.pick(level === 1 ? ['+', '-', '*'] : ['+', '-', '*', '1-', 'sat']);
              let code, r;
              if (op === '+') { code = `${f(a)} + ${f(b)}`; r = a + b; }
              else if (op === '-') { code = `${f(a)} - ${f(b)}`; r = a - b; }
              else if (op === '*') { code = `${f(a)} * ${f(b)}`; r = a * b; }
              else if (op === '1-') { code = `1.0 - ${f(a)} * ${f(b)}`; r = 1 - a * b; }
              else { code = `saturate(${f(a)} + ${f(b)})`; r = Math.min(1, a + b); }
              r = +r.toFixed(4);
              if (Math.abs(r) < 1e-6 || Math.abs(r - 1) < 1e-6 || seen.has(code)) continue;
              seen.add(code);
              items.push({ code: `col = vec3(${code});`, bucket: r < 0 ? 0 : r > 1 ? 2 : 1, why: `= ${n(r)}` });
            }
            return {
              prompt: 'What does the screen do with this value?',
              sub: 'Work out the number, then decide.',
              buckets: ['→ 0 (black)', 'shown as is', '→ 1 (white)'],
              items,
              explain: '<p>Anything below 0 shows as 0, above 1 as 1. <code>saturate</code> clips <i>before</i> it reaches the screen, so the result is always in range.</p>',
            };
          },
        },
        {
          id: 'range-facts', title: 'Range rules', engine: 'mcq', rounds: 7,
          blurb: 'Concept check on clamping, saturate and HDR.',
          questions: [
            tf('Inside a shader, a float variable can hold 5.0.', true, 'Floats can be any value. Only the final colour written to a normal (8-bit) screen is clipped to 0..1.'),
            tf('<code>col = vec3(-1.0)</code> and <code>col = vec3(0.0)</code> look the same on screen.', true, 'Both clip to black.'),
            tf('<code>saturate(x)</code> is HLSL for <code>clamp(x, 0.0, 1.0)</code>.', true, 'Same function, different name. Unreal and Unity have Saturate nodes too.'),
            tf('Multiplying a colour by 3 always keeps its hue.', false, 'Only until a channel passes 1.0 — then clipping changes the ratios (orange → yellow).'),
            q('<code>clamp(1.7, 0.0, 1.0)</code> = ?', ['1.0', '0.7', '1.7', '0.0'], 'Above the max → the max.'),
            q('<code>clamp(-0.3, 0.0, 1.0)</code> = ?', ['0.0', '0.3', '-0.3', '1.0'], 'Below the min → the min.'),
            q('Why use <code>max(dot(N, L), 0.0)</code> in lighting?', ['The dark side gives negative values that would subtract light', 'To make it faster', 'dot() can\'t return 0'], 'Negative "light" added to other lights would darken them.', { level: 2 }),
            q('<code>mix(a, b, t)</code> with t = 1.5 gives…', ['A value past b (overshoot)', 'Exactly b', 'An error'], 'mix doesn\'t clamp t. saturate(t) first if it can leave 0..1.', { level: 2 }),
            q('What is an HDR render target for?', ['Storing colours above 1.0 (for bloom, tone mapping)', 'Making textures smaller', 'Storing negative uv'], 'Float targets keep the "really bright" information instead of clipping.', { level: 2 }),
            q('Which is cheaper on most GPUs?', [{ code: 'saturate(x)' }, { code: 'clamp(x, 0.1, 0.9)' }], 'saturate (0..1) is often a free modifier on the previous instruction.', { level: 3 }),
            tf('<code>saturate(a * 2.0) * 0.5</code> always equals <code>a</code>.', false, 'Only if a ≤ 0.5. For a = 0.8: saturate(1.6) = 1 → 0.5, not 0.8. Clamping loses information.', 3),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'color.grey',
      title: 'Greyscale & luminance',
      blurb: 'Turning colour into brightness — and why green counts most.',
      lesson: [
        {
          title: 'Grey = one number',
          body: `<p>To make an image greyscale, squash the 3 channels into <b>one brightness number</b>, then put it in all three: <code>vec3(b)</code>.</p>
<p>The obvious way: the <b>average</b>.</p>
<pre class="code">float b = (c.r + c.g + c.b) / 3.0;
col = vec3(b);</pre>`,
          shaders: [
            { spec: { frag: GREY_SRC + 'col = c;', textures: { uTex: 'photo' } }, label: 'original' },
            { spec: { frag: GREY_SRC + 'col = vec3((c.r + c.g + c.b) / 3.0);', textures: { uTex: 'photo' } }, label: 'average' },
          ],
          after: '<p>Look at the top bars: red, green and blue all became the <b>same</b> grey. But do they look equally bright to you in colour? Not really…</p>',
        },
        {
          title: 'Our eyes aren\'t fair',
          body: `<p>Human eyes are <b>much</b> more sensitive to green than to blue. Pure green looks bright; pure blue looks dark — even though both are "one lamp at full".</p>
<p>So a better greyscale gives each channel a <b>weight</b>: lots of green, some red, a little blue. This is called <b>luminance</b> (or luma):</p>
<pre class="code">luma = 0.2126*r + 0.7152*g + 0.0722*b</pre>
<div class="note">The weights add up to 1.0, so white (1,1,1) still gives 1.</div>`,
          shaders: [
            { spec: { frag: GREY_SRC + 'col = vec3((c.r + c.g + c.b) / 3.0);', textures: { uTex: 'photo' } }, label: 'average' },
            { spec: { frag: GREY_SRC + 'col = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));', textures: { uTex: 'photo' } }, label: 'luma' },
          ],
        },
        {
          title: 'A weighted sum = dot()',
          body: `<p>"Multiply each channel by a weight and add them up" is exactly what <code>dot()</code> does. That's why you see:</p>
<pre class="code">float l = dot(c, vec3(0.2126, 0.7152, 0.0722));</pre>
<p>Move the colour sliders and follow the numbers:</p>`,
          controls: [
            { name: 'r', label: 'r', min: 0, max: 1, step: 0.05, value: 0.2 },
            { name: 'g', label: 'g', min: 0, max: 1, step: 0.05, value: 0.8 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.05, value: 0.4 },
          ],
          shader: (x) => ({ frag: 'col = uv.x < 0.5 ? uC : vec3(luma(uC));', uniforms: { uC: [x.r, x.g, x.b] } }),
          code: (x) => `dot(vec3(${n(x.r, 2)}, ${n(x.g, 2)}, ${n(x.b, 2)}), vec3(0.2126, 0.7152, 0.0722))\n= ${n(x.r, 2)}×0.2126 + ${n(x.g, 2)}×0.7152 + ${n(x.b, 2)}×0.0722\n= ${n(0.2126 * x.r, 3)} + ${n(0.7152 * x.g, 3)} + ${n(0.0722 * x.b, 3)}\n= ${n(luma709([x.r, x.g, x.b]), 3)}`,
          after: '<div class="tip">You\'ll also meet older weights <code>(0.299, 0.587, 0.114)</code> (Rec.601) — same idea. Games often round them to <code>(0.3, 0.6, 0.1)</code>.</div>',
        },
        {
          title: 'Desaturate partly',
          body: `<p>Usually you don't want <i>fully</i> grey. Blend between the grey and the original with <code>mix</code>:</p>
<pre class="code">float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
col = mix(vec3(l), c, saturation); // 0 = grey, 1 = original</pre>
<p>Values above 1 make it <b>more</b> colourful than the original!</p>`,
          controls: [{ name: 's', label: 'saturation', min: 0, max: 2, step: 0.05, value: 0.4 }],
          shader: (x) => ({ frag: 'vec3 c = texture2D(uTex, uv).rgb;\nfloat l = luma(c);\ncol = mix(vec3(l), c, uS);', uniforms: { uS: x.s }, textures: { uTex: 'photo' } }),
          code: (x) => `col = mix(vec3(l), c, ${f(x.s, 2)});`,
          after: '<div class="tip">Unreal: <b>Desaturation</b> node (with luminance factors input). Unity Shader Graph: <b>Saturation</b> node.</div>',
        },
      ],
      games: [
        {
          id: 'luma-calc', title: 'Brightness calculator', engine: 'numeric', rounds: 6,
          blurb: 'Compute averages, weighted luma and desaturated colours.',
          gen: (rng, level) => {
            const vals = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
            const kind = level === 1 ? 'avg' : level === 2 ? rng.pick(['avg', 'luma', 'luma']) : rng.pick(['luma', 'desat']);
            if (kind === 'avg') {
              let c; do { c = randCol(rng, vals); } while (Math.round(G.dot(c, [10, 10, 10])) % 3 !== 0);
              const a = (c[0] + c[1] + c[2]) / 3;
              return { prompt: 'What is the <b>average</b> brightness?', code: `vec3 c = ${vc(c, 1)};\nfloat b = (c.r + c.g + c.b) / 3.0;`, answer: +a.toFixed(3), explain: `<p>(${c.map((x) => n(x)).join(' + ')}) / 3 = ${n(c[0] + c[1] + c[2])} / 3 = <b>${n(a)}</b>.</p>` };
            }
            if (kind === 'luma') {
              const c = randCol(rng, vals);
              const l = G.dot(c, [0.3, 0.6, 0.1]);
              return { prompt: 'Compute the luma (simplified weights):', code: `vec3 c = ${vc(c, 1)};\nfloat l = dot(c, vec3(0.3, 0.6, 0.1));`, answer: +l.toFixed(3), explain: `<p>${n(c[0])}×0.3 + ${n(c[1])}×0.6 + ${n(c[2])}×0.1 = ${n(c[0] * 0.3)} + ${n(c[1] * 0.6)} + ${n(c[2] * 0.1)} = <b>${n(l)}</b>.</p>` };
            }
            const c = randCol(rng, [0, 0.2, 0.4, 0.6, 0.8, 1]);
            const l = +G.dot(c, [0.3, 0.6, 0.1]).toFixed(3);
            const res = round3(G.mix([l, l, l], c, 0.5));
            return { prompt: `The luma is <code>${f(l)}</code>. What is the half-desaturated colour?`, code: `vec3 c = ${vc(c, 1)};\ncol = mix(vec3(${f(l)}), c, 0.5);`, answer: res, wrap: 'vec3', labels: ['r', 'g', 'b'], explain: `<p>Halfway between grey ${n(l)} and each channel: (${n(l)} + channel) / 2 → <code>${vc(res)}</code>.</p>` };
          },
        },
        {
          id: 'brightest', title: 'Which looks brightest?', engine: 'mcq', rounds: 7,
          blurb: 'Pick the colour with the highest (or lowest) luminance.',
          gen: (rng, level) => {
            const pool = level === 1 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5], [0.5, 0, 0.5]]
              : [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [0.5, 0.5, 0.5], [0, 0.5, 0], [0.8, 0.2, 0.9], [0.3, 0.3, 1], [1, 0.5, 0], [0.4, 0.4, 0.4]];
            const darkest = level >= 2 && rng.chance(0.4);
            let picks = null;
            for (let t = 0; t < 100 && !picks; t++) {
              const cand = rng.pickN(pool, 4);
              const ls = cand.map(luma709).sort((a, b) => a - b);
              if (ls.every((x, i) => i === 0 || x - ls[i - 1] >= 0.06)) picks = cand;
            }
            if (!picks) picks = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0.5, 0.5, 0.5]];
            picks.sort((a, b) => (darkest ? luma709(a) - luma709(b) : luma709(b) - luma709(a)));
            return {
              prompt: `Which colour has the <b>${darkest ? 'lowest' : 'highest'}</b> luminance?`,
              sub: 'luma = 0.21·r + 0.72·g + 0.07·b',
              options: picks.map((c) => ({ color: c, text: `<span class="mono small">${nv(c)}</span>` })),
              explain: `<p>Lumas: ${picks.map((c) => `${nv(c)} → ${n(luma709(c), 2)}`).join(', ')}. Green carries most of the brightness; blue almost none.</p>`,
            };
          },
        },
        {
          id: 'grey-method', title: 'Which greyscale?', engine: 'mcq', rounds: 6,
          blurb: 'Different ways to make grey. Identify the one used.',
          gen: (rng, level) => {
            const pool = GREY_METHODS.filter((m) => m.lvl <= level + 1);
            const ans = rng.pick(GREY_METHODS.filter((m) => m.lvl <= level));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.code);
            return {
              prompt: 'Which line made the right image from the left one?',
              sub: 'Use the red / green / blue bars at the top as a test!',
              shaders: [
                { spec: { frag: GREY_SRC + 'col = c;', textures: { uTex: 'photo' } }, label: 'source <code>c</code>' },
                { spec: { frag: GREY_SRC + ans.code, textures: { uTex: 'photo' } }, label: 'result' },
              ],
              options: opts.map((o) => ({ code: o.code })),
              explain: `<p>${ans.why}</p>`,
            };
          },
        },
        {
          id: 'grey-fill', title: 'Build a desaturate', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the greyscale / desaturate code.',
          gen: (rng, level) => {
            if (level === 1 || rng.chance(0.4)) {
              return {
                prompt: 'Make the target greyscale image:',
                sub: 'Wrong types show a compile error — read it!',
                template: 'vec3 c = texture2D(uTex, uv).rgb;\nfloat l = [[0]](c, vec3(0.2126, 0.7152, 0.0722));\ncol = [[1]];',
                slots: [{ options: ['dot', 'cross', 'max', 'mix'], answer: 'dot' }, { options: ['vec3(l)', 'l', 'c', 'vec3(c.r)'], answer: 'vec3(l)' }],
                build: (vals) => ({ frag: `vec3 c = texture2D(uTex, uv).rgb;\nfloat l = ${vals[0]}(c, vec3(0.2126, 0.7152, 0.0722));\ncol = ${vals[1]};`, textures: { uTex: 'photo' } }),
                explain: '<p><code>dot</code> gives one float (the weighted sum). <code>cross</code> and <code>max</code> give a vec3, so they can\'t go into a float. Then <code>vec3(l)</code> copies the grey into r, g and b.</p>',
              };
            }
            const s = rng.pick(['0.0', '0.5', '1.0', 'uv.x']);
            return {
              prompt: 'Pick the saturation that matches the target:',
              template: 'vec3 c = texture2D(uTex, uv).rgb;\nfloat l = dot(c, vec3(0.2126, 0.7152, 0.0722));\ncol = mix(vec3(l), c, [[0]]);',
              slots: [{ options: ['0.0', '0.5', '1.0', 'uv.x'], answer: s }],
              build: (vals) => ({ frag: `vec3 c = texture2D(uTex, uv).rgb;\nfloat l = dot(c, vec3(0.2126, 0.7152, 0.0722));\ncol = mix(vec3(l), c, ${vals[0]});`, textures: { uTex: 'photo' } }),
              explain: '<p>mix(grey, colour, t): t = 0 → grey, t = 1 → original, 0.5 → halfway. <code>uv.x</code> varies it across the image (grey on the left, full colour on the right).</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'color.hsv',
      title: 'Hue & HSV',
      blurb: 'Think in hue, saturation and brightness instead of R, G, B.',
      lesson: [
        {
          title: 'RGB is hard to think in',
          body: `<p>"Make this a bit more purple" or "same colour but less vivid" is awkward with three lamps. Artists think in:</p>
<ul><li><b>Hue</b> — which colour on the wheel (red, orange, yellow…)</li><li><b>Saturation</b> — how vivid (0 = grey, 1 = pure)</li><li><b>Value</b> — how bright (0 = black)</li></ul>
<p>That's <b>HSV</b>. The helper <code>hsv2rgb()</code> converts it back to RGB for the screen.</p>`,
          controls: [
            { name: 'h', label: 'hue', min: 0, max: 1, step: 0.01, value: 0.08 },
            { name: 's', label: 'saturation', min: 0, max: 1, step: 0.01, value: 1 },
            { name: 'v', label: 'value', min: 0, max: 1, step: 0.01, value: 1 },
          ],
          shader: (x) => ({ frag: 'col = hsv2rgb(uC);\nif (uv.y < 0.14) col = hsv2rgb(vec3(uv.x, 1.0, 1.0)) * step(0.008, abs(uv.x - uC.x));', uniforms: { uC: [x.h, x.s, x.v] } }),
          code: (x) => `col = hsv2rgb(vec3(${f(x.h, 2)}, ${f(x.s, 2)}, ${f(x.v, 2)}));\n// → rgb ${nv(hsv2rgb([x.h, x.s, x.v]), 2)}`,
        },
        {
          title: 'Hue is a circle',
          body: `<p>Hue goes from 0 to 1 <b>around a circle</b> — and 1 is back to red:</p>
<ul><li>0 → red, 1/6 ≈ 0.17 → yellow, 1/3 ≈ 0.33 → green</li><li>0.5 → cyan, 2/3 ≈ 0.67 → blue, 5/6 ≈ 0.83 → magenta, 1 → red again</li></ul>
<p>The wheel below shows hue as the angle. Many tools use <b>degrees</b> instead: 0°…360° (hue × 360).</p>`,
          shader: { frag: 'vec2 p = uv - 0.5;\nfloat a = atan(p.y, p.x) / TAU;\nfloat r = length(p);\ncol = hsv2rgb(vec3(fract(a), clamp(r * 2.5, 0.0, 1.0), 1.0)) * step(r, 0.45);' },
          code: 'float hue = atan(p.y, p.x) / TAU;       // angle → 0..1\ncol = hsv2rgb(vec3(fract(hue), r * 2.5, 1.0)); // centre = white',
          quiz: { q: 'What colour is hue 0.5?', options: ['Cyan', 'Green', 'Blue', 'Red'], answer: 0, explain: 'Half way round the wheel from red is cyan — its opposite (complementary) colour.' },
        },
        {
          title: 'Hue shifting',
          body: `<p>Add to the hue and wrap with <code>fract()</code>, and every colour rotates around the wheel together:</p>
<pre class="code">vec3 hsv = rgb2hsv(c);
hsv.x = fract(hsv.x + shift);
col = hsv2rgb(hsv);</pre>
<p><code>fract</code> keeps hue in 0..1 (0.9 + 0.2 = 1.1 → 0.1).</p>`,
          controls: [{ name: 'k', label: 'hue shift', min: 0, max: 1, step: 0.01, value: 0.3 }],
          shader: (x) => ({ defs: RGB2HSV, frag: 'vec3 c = texture2D(uTex, uv).rgb;\nvec3 hsv = rgb2hsv(c);\nhsv.x = fract(hsv.x + uK);\ncol = hsv2rgb(hsv);', uniforms: { uK: x.k }, textures: { uTex: 'photo' } }),
          code: (x) => `hsv.x = fract(hsv.x + ${f(x.k, 2)});\n// a red pixel (hue 0) becomes hue ${n(x.k, 2)}`,
          after: '<div class="tip">Unreal: <b>HueShift</b> node. Unity Shader Graph: <b>Hue</b> node (degrees or normalized). Great for colour variations of one texture (enemies, team colours, foliage).</div>',
        },
        {
          title: 'Saturation and value',
          body: `<p>For one hue, the square below shows <b>saturation</b> left → right and <b>value</b> bottom → top — just like a colour picker.</p>
<ul><li>Left edge (s = 0): greys</li><li>Bottom (v = 0): black</li><li>Top-right: the pure hue</li></ul>`,
          controls: [{ name: 'h', label: 'hue', min: 0, max: 1, step: 0.01, value: 0.6 }],
          shader: (x) => ({ frag: 'col = hsv2rgb(vec3(uH, uv.x, uv.y));', uniforms: { uH: x.h } }),
          code: (x) => `col = hsv2rgb(vec3(${f(x.h, 2)}, uv.x, uv.y));\n//              hue    sat    value`,
          quiz: { q: 'What does <code>hsv2rgb(vec3(0.3, 0.0, 1.0))</code> give?', options: ['White', 'Green', 'Black', 'Grey-green'], answer: 0, explain: 'Saturation 0 → no colour at all; value 1 → full brightness → white. Hue doesn\'t matter.' },
        },
        {
          title: 'Rainbows for free',
          body: `<p>Feed something that changes into the hue and you get a rainbow. Here: <code>uv.x</code> plus time.</p>`,
          shader: { frag: 'col = hsv2rgb(vec3(fract(uv.x + uTime * 0.1), 0.8, 1.0));' },
          code: 'col = hsv2rgb(vec3(fract(uv.x + uTime * 0.1), 0.8, 1.0));',
        },
      ],
      games: [
        {
          id: 'hue-pick', title: 'Name that hue', engine: 'mcq', rounds: 8,
          blurb: 'Pick the colour that hsv2rgb returns.',
          gen: (rng, level) => {
            const K = [0, 1, 2, 3, 4, 5];
            let hsv, code, ex;
            if (level === 1) { const k = rng.pick(K); hsv = [k / 6, 1, 1]; code = `col = hsv2rgb(vec3(${f(k / 6, 3)}, 1.0, 1.0));`; ex = `hue ${n(k / 6, 2)} = ${k}/6 of the way round the wheel.`; }
            else if (level === 2) { const k = rng.pick(K); hsv = [k / 6, rng.pick([1, 0.5, 0]), rng.pick([1, 0.5])]; code = `col = hsv2rgb(vec3(${f(k / 6, 3)}, ${f(hsv[1])}, ${f(hsv[2])}));`; ex = `hue ${n(k / 6, 2)}, saturation ${n(hsv[1])} (${hsv[1] === 0 ? 'grey' : hsv[1] < 1 ? 'pastel/washed' : 'vivid'}), value ${n(hsv[2])} (${hsv[2] < 1 ? 'darker' : 'full'}).`; }
            else { const k = rng.pick(K), d = rng.pick([0.25, 0.5, 0.75, 1 / 3]); const h0 = G.fract(k / 6 - d + 1); hsv = [G.fract(h0 + d), 1, 1]; code = `float h = fract(${f(h0, 3)} + ${f(d, 3)});\ncol = hsv2rgb(vec3(h, 1.0, 1.0));`; ex = `${n(h0, 3)} + ${n(d, 3)} = ${n(h0 + d, 3)} → fract → ${n(hsv[0], 3)}.`; }
            const ans = hsv2rgb(hsv);
            const opts = colourOpts(rng, ans, (r) => hsv2rgb([r.pick(K) / 6, level === 2 ? r.pick([1, 0.5]) : 1, level === 2 ? r.pick([1, 0.5]) : 1]), 0.35);
            return { prompt: 'Which colour is this?', code, options: opts.map((c) => ({ color: c })), explain: `<p>${ex} → rgb ${nv(round3(ans), 2)}.</p><p>Wheel: 0 red, ⅙ yellow, ⅓ green, ½ cyan, ⅔ blue, ⅚ magenta.</p>` };
          },
        },
        {
          id: 'hsv-match', title: 'HSV matcher', engine: 'slider', rounds: 4,
          blurb: 'Match the colour using hue (and saturation, value) sliders.',
          gen: (rng, level) => {
            const t = [rng.step(0.1, 0.9, 0.05), level >= 2 ? rng.step(0.4, 1, 0.1) : 1, level === 3 ? rng.step(0.4, 1, 0.1) : 1];
            const params = [{ name: 'h', label: 'hue', min: 0, max: 1, step: 0.01, target: t[0] }];
            if (level >= 2) params.push({ name: 's', label: 'saturation', min: 0, max: 1, step: 0.05, target: t[1] });
            if (level === 3) params.push({ name: 'v', label: 'value', min: 0, max: 1, step: 0.05, target: t[2] });
            const g = (p) => [p.h, p.s ?? 1, p.v ?? 1];
            return {
              prompt: 'Match the target colour.',
              sub: 'The rainbow strip shows where each hue lives.',
              params,
              build: (p) => ({ frag: 'col = hsv2rgb(uC);\nif (uv.y < 0.14) col = hsv2rgb(vec3(uv.x, 1.0, 1.0));', uniforms: { uC: g(p) } }),
              code: (p) => `col = hsv2rgb(vec3(${f(p.h, 2)}, ${f(p.s ?? 1, 2)}, ${f(p.v ?? 1, 2)}));`,
              tolerance: 0.04,
              explain: `<p>Target: hsv(${n(t[0], 2)}, ${n(t[1], 2)}, ${n(t[2], 2)}). Find the hue first (which colour family), then saturation (vivid vs greyish), then value (bright vs dark).</p>`,
            };
          },
        },
        {
          id: 'hue-calc', title: 'Hue numbers', engine: 'numeric', rounds: 6,
          blurb: 'Hue values, hue shifts with fract(), and degrees.',
          gen: (rng, level) => {
            const kind = level === 1 ? 'name' : level === 2 ? rng.pick(['name', 'shift']) : rng.pick(['shift', 'deg', 'opp']);
            if (kind === 'name') {
              const hn = rng.pick(HUE_NAMES.filter((x) => x.h > 0 && (level > 1 || x.name !== 'orange')));
              return { prompt: `What hue (0..1) is <b>${hn.name}</b>?`, sub: 'Two decimals is fine.', answer: +hn.h.toFixed(3), tolerance: 0.011, explain: `<p>${hn.name} = ${hn.h === 0 ? '0 (or 1)' : n(hn.h, 3)}. Wheel: 0 red, ⅙ yellow, ⅓ green, ½ cyan, ⅔ blue, ⅚ magenta.</p>` };
            }
            if (kind === 'shift') {
              const a = rng.pick([0.1, 0.3, 0.6, 0.7, 0.8, 0.9]), d = rng.pick([0.2, 0.3, 0.4, 0.5]);
              return { prompt: 'What is h?', code: `float h = fract(${f(a)} + ${f(d)});`, answer: +G.fract(a + d).toFixed(3), explain: `<p>${n(a)} + ${n(d)} = ${n(a + d)}${a + d >= 1 ? ' → past 1, so fract wraps it' : ''} → <b>${n(G.fract(a + d))}</b>.</p>` };
            }
            if (kind === 'deg') {
              const hh = rng.pick([0.25, 0.5, 0.75, 1 / 3, 1 / 6, 0.1]);
              return { prompt: `Hue <code>${f(hh, 3)}</code> in a 0..1 shader is how many <b>degrees</b> in Photoshop / Unity?`, answer: Math.round(hh * 360), tolerance: 1.5, explain: `<p>${n(hh, 3)} × 360 = <b>${Math.round(hh * 360)}°</b>.</p>` };
            }
            const hn = rng.pick(HUE_NAMES.filter((x) => x.name !== 'cyan'));
            return { prompt: `What hue is the <b>opposite</b> (complement) of ${hn.name} (hue ${n(hn.h, 3)})?`, code: 'float opposite = fract(h + 0.5);', answer: +G.fract(hn.h + 0.5).toFixed(3), tolerance: 0.011, explain: `<p>fract(${n(hn.h, 3)} + 0.5) = <b>${n(G.fract(hn.h + 0.5), 3)}</b>. Opposite colours are half a turn apart.</p>` };
          },
        },
      ],
    },
  ],
};
