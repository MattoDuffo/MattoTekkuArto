// Topic — Colour spaces, gamma & HDR: why 0.5 isn't half as bright, sRGB vs linear, HDR and tonemapping.
import { tf, q, distinct, f, v, n, nv, G, h, css } from './_kit.js';

// ================================================================ helpers
const r3 = (x) => +(+x).toFixed(3);
const enc = (x) => Math.pow(Math.max(0, x), 1 / 2.2); // linear → sRGB (approx.)
const dec = (x) => Math.pow(Math.max(0, x), 2.2); //     sRGB → linear (approx.)
const ENC = (e) => `pow(${e}, vec3(1.0 / 2.2))`;

/** row of labelled colour swatches */
const swatchRow = (items) => (el) => {
  const row = h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'flex-end', margin: '8px 0', flexWrap: 'wrap' } });
  items.forEach(([label, c]) => {
    if (typeof c === 'string') { row.append(h('div', { style: { textAlign: 'center', maxWidth: '150px' }, html: (label ? `<div class="small dim">${label}</div>` : '') + `<div style="font-size:22px">${c}</div>` })); return; }
    row.append(h('div', { style: { textAlign: 'center' } },
      h('div', { style: { width: '64px', height: '46px', borderRadius: '8px', background: css(c), border: '1px solid #333' } }),
      h('div.small.dim', { html: label })));
  });
  el.append(row);
};

/** a small 0..1 ruler at the bottom of a gradient so learners can read positions */
const RULER = `if (uv.y < 0.07) {
  float tk = step(abs(fract(uv.x * 10.0 + 0.5) - 0.5), 0.05);
  float big = step(abs(uv.x - 0.5), 0.004);
  col = mix(vec3(0.12), vec3(1.0, 0.45, 0.45), max(tk, big));
}`;

// A little HDR "photo": warm sky, a blazing sun and a sunlit ball. Values go from ~0.05 up to 30.
const SCENE = `vec3 hdrScene(vec2 uv) {
  vec3 c = mix(vec3(1.0, 0.75, 0.5), vec3(0.15, 0.3, 0.9), smoothstep(0.25, 1.0, uv.y));
  if (uv.y < 0.25) c = vec3(0.2, 0.24, 0.12);
  vec2 sp = vec2(0.78, 0.8);
  float ds = length(uv - sp);
  c += vec3(3.0, 2.2, 1.4) * exp(-ds * 10.0);
  if (ds < 0.06) c = vec3(30.0, 25.0, 18.0);
  vec2 p = (uv - vec2(0.36, 0.42)) / 0.22;
  float r2 = dot(p, p);
  if (r2 < 1.0) {
    vec3 nn = vec3(p, sqrt(1.0 - r2));
    float d = max(dot(nn, normalize(vec3(0.6, 0.55, 0.5))), 0.0);
    vec3 amb = mix(vec3(0.05, 0.04, 0.03), vec3(0.08, 0.12, 0.2), nn.y * 0.5 + 0.5);
    c = vec3(0.8, 0.35, 0.2) * (vec3(4.0, 3.4, 2.6) * d + amb);
  }
  return c;
}
vec3 tmReinhard(vec3 x) { return x / (1.0 + x); }
vec3 tmACES(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }`;

/** mode: 0 = clip, 1 = Reinhard, 2 = ACES. ev = exposure in stops. Always gamma-encodes at the end. */
const scene = (mode, ev = 0) => ({
  defs: SCENE,
  frag: `vec3 hdr = hdrScene(uv) * exp2(uEv);\nvec3 c = ${['clamp(hdr, 0.0, 1.0)', 'tmReinhard(hdr)', 'tmACES(hdr)'][mode]};\ncol = ${ENC('c')};`,
  uniforms: { uEv: ev },
});
const TM_NAME = ['clip (no tonemap)', 'Reinhard', 'ACES (filmic)'];
const TM_CODE = ['clamp(hdr, 0.0, 1.0)', 'hdr / (1.0 + hdr)', 'aces(hdr)'];

// GLSL ACES fit (Narkowicz) mirrored in JS for graphs
const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));

// ================================================================ topic
export default {
  id: 'colorspace',
  title: 'Colour spaces, gamma & HDR',
  icon: '🌈',
  blurb: 'Why 0.5 isn\'t half as bright, sRGB vs linear textures, HDR and tonemapping.',
  cheatsheet: `
<p><b>sRGB / gamma</b>: screens and colour textures store values <i>encoded</i> ≈ <code>pow(linear, 1/2.2)</code>. sRGB 0.5 is only ≈ <b>22%</b> of white's light.</p>
<p><b>Linear workflow</b>: decode inputs → do all lighting & blending in linear → encode at the very end.</p>
<pre class="code">vec3 lin  = pow(srgb, vec3(2.2));       // decode (GPU does it for sRGB textures)
vec3 srgb = pow(lin, vec3(1.0 / 2.2));  // encode (GPU does it for sRGB render targets)</pre>
<p><b>sRGB textures</b>: albedo, UI, photos, colour ramps. <b>Linear (sRGB off)</b>: normal maps, roughness, metallic, masks, height, flow maps, noise used as data.</p>
<p><b>HDR</b>: light values above 1.0 are normal. Store them in float buffers. Clipping each channel at 1 shifts hues toward white/yellow.</p>
<pre class="code">vec3 c = hdr * exp2(exposureStops);   // exposure
c = c / (1.0 + c);                    // Reinhard tonemap (1 → 0.5, never reaches 1)
// or ACES: (x*(2.51x+0.03)) / (x*(2.43x+0.59)+0.14)
col = pow(c, vec3(1.0 / 2.2));        // encode for the screen</pre>
<p>Order: <b>HDR lighting → exposure → (bloom) → tonemap → gamma encode → screen</b>.</p>`,
  concepts: [
    // ================================================================== 1. GAMMA
    {
      id: 'colorspace.gamma',
      title: 'Why gamma exists',
      blurb: 'Your eyes are not linear — and 8 bits are precious.',
      lesson: [
        {
          title: 'Twice the light ≠ twice as bright',
          body: `<p>Your eyes are <b>very sensitive to changes in dark tones</b> and much less sensitive in bright ones. Going from 1 candle to 2 is a huge jump; going from 100 candles to 101 you'd never notice.</p>
<p>Both gradients below go from black to white:</p>
<ul><li><b>Top:</b> the <i>physical light</i> increases evenly. It looks like it gets bright almost immediately, then barely changes.</li>
<li><b>Bottom:</b> evenly spaced <i>for your eyes</i>. This is what the numbers 0 → 1 in a colour picker give you.</li></ul>`,
          shader: { frag: `if (uv.y > 0.5) col = ${ENC('vec3(uv.x)')};\nelse col = vec3(uv.x);\nif (abs(uv.y - 0.5) < 0.006) col = vec3(0.08);` },
          size: 260,
          after: '<div class="note">So there are two different ways to talk about brightness: <b>linear</b> (how much light energy, what physics uses) and <b>perceptual / gamma-encoded</b> (how bright it looks, what screens and colour pickers use).</div>',
        },
        {
          title: 'Only 256 steps to spend',
          body: `<p>A normal image stores each channel in <b>8 bits = 256 levels</b>. Where should those levels go?</p>
<p>If we store <b>linear light</b> evenly, most levels are wasted on bright tones (where you can't tell them apart) and the darks get only a few → visible <b>banding</b>.</p>
<p>Reduce the number of levels and compare (both rows should look like the same smooth ramp):</p>`,
          controls: [{ name: 'lv', label: 'levels stored', min: 4, max: 64, step: 1, value: 16 }],
          shader: (vv) => ({ frag: `float target = uv.x; // the ramp we want to see\nif (uv.y > 0.5) {\n  float lin = pow(target, 2.2);            // store LINEAR light\n  lin = floor(lin * uLv + 0.5) / uLv;     // quantize\n  col = vec3(pow(lin, 1.0 / 2.2));\n} else {\n  col = vec3(floor(target * uLv + 0.5) / uLv); // store ENCODED value\n}\nif (abs(uv.y - 0.5) < 0.006) col = vec3(0.08);`, uniforms: { uLv: vv.lv } }),
          size: 260,
          code: (vv) => `// top:    stored as linear, ${vv.lv} levels → chunky darks\n// bottom: stored gamma-encoded, ${vv.lv} levels → even steps`,
          after: '<div class="note">Gamma encoding spends more of the precious levels on darks, where your eyes need them. That\'s the real reason it exists. (Historically CRT screens also happened to have a similar curve.)</div>',
        },
        {
          title: 'The sRGB curve',
          body: `<p>The standard encoding is called <b>sRGB</b>. It's very close to a simple power curve with <b>γ (gamma) ≈ 2.2</b>:</p>
<pre class="code">float encoded = pow(linear, 1.0 / 2.2); // linear → sRGB
float linear  = pow(encoded, 2.2);      // sRGB → linear</pre>
<p>Slide a linear light amount and see what number gets stored:</p>`,
          controls: [{ name: 'x', label: 'linear light', min: 0, max: 1, step: 0.01, value: 0.5 }],
          graph: { fns: [{ f: (x) => enc(x), label: 'encode: pow(x, 1/2.2)' }, { f: (x) => dec(x), label: 'decode: pow(x, 2.2)' }, { f: (x) => x, color: '#444', dash: [4, 4] }], opts: (vv) => ({ xmin: 0, xmax: 1, ymin: -0.02, ymax: 1.02, points: [{ x: vv.x, y: enc(vv.x), label: enc(vv.x).toFixed(2) }] }) },
          visual: (el, vv) => swatchRow([[`linear ${vv.x.toFixed(2)}<br>stored ${enc(vv.x).toFixed(2)}`, [enc(vv.x), enc(vv.x), enc(vv.x)]]])(el),
          code: (vv) => `float lin = ${f(vv.x, 2)};\nfloat srgb = pow(lin, 1.0 / 2.2); // = ${enc(vv.x).toFixed(3)}`,
          after: '<div class="tip">💡 Handy mental shortcut: pretend γ = 2. Then encode = <code>sqrt</code>, decode = square. sRGB 0.5 → 0.25 linear (true value: 0.22).</div>',
        },
        {
          title: 'Who speaks which language?',
          body: `<p><b>Encoded (sRGB):</b> your monitor, colour pickers, hex codes like #808080, PNGs/JPGs of colour art, photos.</p>
<p><b>Linear:</b> light physics — lighting, adding lights, blending, blurring, fog.</p>
<p>So a correct shader works like a translator:</p>
<pre class="code">// 1. decode inputs (colour textures, picked colours)
vec3 albedo = pow(texSrgb, vec3(2.2));
// 2. all the maths in linear
vec3 lit = albedo * lightCol * max(dot(N, L), 0.0);
// 3. encode for the screen
col = pow(lit, vec3(1.0 / 2.2));</pre>
<div class="note">Good news: GPUs can do step 1 (sRGB textures) and step 3 (sRGB render targets) in hardware, for free. You mostly need to <b>tick the right boxes</b> — next lessons.</div>`,
          quiz: { q: 'A pixel stores sRGB value 0.5. Roughly how much of white\'s light does the screen emit?', options: ['About 22%', 'Exactly 50%', 'About 73%'], answer: 0, explain: 'pow(0.5, 2.2) ≈ 0.22. "Middle grey" on screen is far less than half the light.' },
        },
      ],
      games: [
        {
          id: 'gamma-calc', title: 'Encode / decode', engine: 'numeric', rounds: 5,
          blurb: 'Convert between linear and sRGB (use the γ ≈ 2 shortcut).',
          gen: (rng, level) => {
            const pairs = [[0.25, 0.5], [0.04, 0.2], [0.09, 0.3], [0.16, 0.4], [0.36, 0.6], [0.49, 0.7], [0.64, 0.8], [0.81, 0.9]];
            if (level === 1) {
              const [lin, s] = rng.pick(pairs);
              if (rng.chance(0.5)) {
                return {
                  prompt: `Encode linear light <b>${n(lin)}</b> for the screen. Stored sRGB value?`,
                  sub: 'Shortcut: pretend γ = 2, so encoding = square root.',
                  code: `float srgb = pow(${f(lin)}, 1.0 / 2.0); // ≈ sqrt`,
                  answer: s,
                  explain: `<p>sqrt(${n(lin)}) = <b>${n(s)}</b>. (With the real γ 2.2: ${enc(lin).toFixed(3)}.) Small linear values get <b>big</b> stored numbers — darks get more precision.</p>`,
                };
              }
              return {
                prompt: `A colour texture stores sRGB <b>${n(s)}</b>. What linear value does it decode to?`,
                sub: 'Shortcut: pretend γ = 2, so decoding = squaring.',
                code: `float lin = pow(${f(s)}, 2.0); // ≈ square`,
                answer: lin,
                explain: `<p>${n(s)}² = <b>${n(lin)}</b>. (Real γ 2.2: ${dec(s).toFixed(3)}.)</p>`,
              };
            }
            if (level === 2) {
              const [a, b] = rng.pick([[1, 0.5], [0.8, 0.4], [0.6, 0.3], [0.9, 0.3], [0.6, 0.2], [0.8, 0.2], [0.9, 0.6], [1, 0.25]]);
              const ratio = r3((a / b) ** 2);
              return {
                prompt: `Two pixels: sRGB <b>${n(a)}</b> and sRGB <b>${n(b)}</b>. How many times more <b>light</b> does the first emit?`,
                sub: 'Use γ ≈ 2: decode both (square), then divide.',
                code: `float la = pow(${f(a)}, 2.0);\nfloat lb = pow(${f(b)}, 2.0);\nfloat ratio = la / lb;`,
                answer: ratio,
                explain: `<p>${n(a)}² / ${n(b)}² = ${n(a * a)} / ${n(b * b)} = <b>${n(ratio)}×</b>. The numbers differ by ${n(a / b)}×, but the light differs by ${n(ratio)}×!</p>`,
              };
            }
            const [a, b] = rng.pick([[0, 1], [1, 0], [0.1, 0.7], [0.7, 0.1], [0.6, 0.8], [0.8, 0.6]]);
            const ans = r3(Math.sqrt((a * a + b * b) / 2));
            return {
              prompt: `Blend sRGB <b>${n(a)}</b> and <b>${n(b)}</b> 50/50 <b>correctly</b> (in linear). What sRGB value goes to the screen?`,
              sub: 'γ ≈ 2: square both, average, square-root. 2 decimals.',
              code: `float la = pow(${f(a)}, 2.0);\nfloat lb = pow(${f(b)}, 2.0);\nfloat lin = (la + lb) * 0.5;\nfloat srgb = sqrt(lin);`,
              answer: ans,
              tolerance: 0.015,
              explain: `<p>(${n(a * a)} + ${n(b * b)}) / 2 = ${n((a * a + b * b) / 2)} → sqrt = <b>${n(ans)}</b>. The naive average would be ${n((a + b) / 2)} — too dark.</p>`,
            };
          },
        },
        {
          id: 'gamma-tap', title: 'Where is half the light?', engine: 'tap', rounds: 5,
          blurb: 'Tap the spot on a gradient that matches a light level.',
          gen: (rng, level) => {
            const mode = level === 1 ? 0 : level === 2 ? 1 : rng.int(0, 1);
            if (mode === 0) {
              const fr = rng.pick([0.25, 0.5, 0.1, 0.04]);
              const t = r3(enc(fr));
              return {
                prompt: `This gradient's <b>stored values</b> go 0 → 1 evenly (the red ruler marks 0.1 steps). Tap where the screen emits <b>${Math.round(fr * 100)}%</b> of white's light.`,
                sub: 'Light = pow(value, 2.2). So which value gives that much light?',
                shader: { frag: `col = vec3(uv.x);\n${RULER}` },
                score: (u) => { const e = Math.abs(u - t); return e <= 0.05 ? 1 : Math.max(0, 1 - (e - 0.05) / 0.15); },
                reveal: [[t, 0.5]],
                explain: `<p>value = pow(${n(fr)}, 1/2.2) ≈ <b>${n(t, 2)}</b>. (γ≈2 shortcut: sqrt(${n(fr)}) = ${n(Math.sqrt(fr), 2)}.) ${fr === 0.5 ? 'Half the light sits way past the middle!' : ''}</p>`,
              };
            }
            const s = rng.pick([0.5, 0.7, 0.3]);
            const t = r3(dec(s));
            return {
              prompt: `This gradient's <b>light</b> increases evenly 0 → 1 (it\'s displayed with pow(x, 1/2.2)). Tap where the stored sRGB value is <b>${n(s)}</b>.`,
              sub: 'Stored value = pow(light, 1/2.2). Which light amount gives that?',
              shader: { frag: `col = ${ENC('vec3(uv.x)')};\n${RULER}` },
              score: (u) => { const e = Math.abs(u - t); return e <= 0.05 ? 1 : Math.max(0, 1 - (e - 0.05) / 0.15); },
              reveal: [[t, 0.5]],
              explain: `<p>light = pow(${n(s)}, 2.2) ≈ <b>${n(t, 2)}</b> (γ≈2: ${n(s * s, 2)}). In linear light, "middle grey" ${n(s)} is far to the left.</p>`,
            };
          },
        },
        {
          id: 'gamma-facts', title: 'Gamma facts', engine: 'mcq', rounds: 8,
          blurb: 'Quick checks on why gamma exists.',
          questions: [
            tf('Human eyes notice brightness changes in dark tones more than in bright tones.', true, 'That\'s why gamma encoding spends more levels on darks.'),
            tf('Gamma encoding exists mainly to make images look more colourful.', false, 'It exists to spend the limited bits where our eyes need precision (darks).'),
            tf('sRGB value 0.5 emits about half the light of 1.0.', false, 'pow(0.5, 2.2) ≈ 0.22 — about a fifth.'),
            tf('Encoding linear → sRGB is roughly pow(x, 1/2.2).', true, 'And decoding is pow(x, 2.2).'),
            tf('Storing linear light in 8 bits causes banding in dark areas.', true, 'Too few levels are left for the darks.'),
            tf('The hex colour #808080 is "linear 50% grey".', false, '#808080 = 128/255 ≈ 0.5 in sRGB, which is ≈ 0.22 linear.', 2),
            tf('Real sRGB has a tiny straight-line section near black, but pow 2.2 is a close approximation.', true, 'The exact sRGB curve is piecewise; pow 2.2 is the common shortcut.', 2),
            q('What does a colour picker\'s 0..1 value usually represent?', ['A gamma-encoded (sRGB) value', 'Linear light energy', 'A percentage of the light'], 'Colour pickers and hex codes are sRGB.'),
            q('Which space is right for adding two lights together?', ['Linear', 'sRGB / gamma', 'It doesn\'t matter'], 'Light energy adds linearly.'),
            q('Why is 1.0 / 2.2 used in pow when writing to the screen?', ['To encode linear results into sRGB for the display', 'To brighten the image for style', 'To convert to HDR'], 'Encode at the end of the pipeline.'),
            q('An 8-bit channel has how many levels?', ['256', '100', '1024'], '2⁸ = 256.'),
          ],
        },
      ],
    },
    // ================================================================== 2. LINEAR MATHS
    {
      id: 'colorspace.linear',
      title: 'Linear vs gamma maths',
      blurb: 'Blending and lighting must happen in linear space.',
      lesson: [
        {
          title: 'The middle-grey trap',
          body: `<p>Slide the sRGB value and watch how much <b>actual light</b> it is (with γ 2.2):</p>`,
          controls: [{ name: 's', label: 'sRGB value', min: 0, max: 1, step: 0.01, value: 0.5 }],
          visual: (el, vv) => {
            const lin = dec(vv.s);
            swatchRow([[`sRGB ${vv.s.toFixed(2)}`, [vv.s, vv.s, vv.s]]])(el);
            const bar = h('div', { style: { margin: '8px 16px', height: '22px', borderRadius: '6px', background: '#22252f', position: 'relative', overflow: 'hidden' } },
              h('div', { style: { width: `${lin * 100}%`, height: '100%', background: '#ffd479' } }));
            el.append(h('div.small.center', { html: `actual light: <b>${(lin * 100).toFixed(1)}%</b> of white` }), bar);
          },
          code: (vv) => `float lin = pow(${f(vv.s, 2)}, 2.2); // = ${dec(vv.s).toFixed(3)}`,
          after: '<div class="note">sRGB <b>0.5 ≈ 0.218 linear</b> (22% light). And 50% light ≈ sRGB <b>0.73</b>. A photographer\'s "18% grey card" is about sRGB 0.46.</div>',
        },
        {
          title: 'Blending in the wrong space',
          body: `<p><code>mix(red, green, t)</code> on sRGB numbers gives a <b>dark, muddy</b> middle. Physically, half red light + half green light is a <b>bright yellow</b>.</p>
<p>Top: naive mix of sRGB values. Bottom: decode → mix → encode.</p>`,
          controls: [
            { name: 'h1', label: 'colour A', min: 0, max: 1, step: 0.01, value: 0 },
            { name: 'h2', label: 'colour B', min: 0, max: 1, step: 0.01, value: 0.33 },
          ],
          shader: (vv) => ({ frag: `vec3 a = hsv2rgb(vec3(uH1, 1.0, 1.0));\nvec3 b = hsv2rgb(vec3(uH2, 1.0, 1.0));\nif (uv.y > 0.5) col = mix(a, b, uv.x);\nelse col = ${ENC('mix(pow(a, vec3(2.2)), pow(b, vec3(2.2)), uv.x)')};\nif (abs(uv.y - 0.5) < 0.006) col = vec3(0.08);`, uniforms: { uH1: vv.h1, uH2: vv.h2 } }),
          size: 260,
          code: '// top (wrong):\ncol = mix(a, b, uv.x);\n// bottom (right):\nvec3 lin = mix(pow(a, vec3(2.2)), pow(b, vec3(2.2)), uv.x);\ncol = pow(lin, vec3(1.0 / 2.2));',
          after: '<div class="tip">💡 Same problem in Photoshop: blurring or resizing in gamma space darkens edges between bright colours. Game engines in linear mode get it right automatically.</div>',
        },
        {
          title: 'Lighting in the wrong space',
          body: `<p>Lambert gives <i>linear</i> light amounts. If you send them to the screen <b>without encoding</b>, the screen treats them as sRGB and darkens them again — the falloff looks too harsh and contrasty. This "CG look" plagued games for years.</p>`,
          controls: [{ name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 30 }],
          shaders: [
            { spec: (vv) => ({ frag: `vec4 sm = sphereNormal(uv);\nvec3 L = normalize(vec3(cos(uA), sin(uA), 0.5));\nfloat d = max(dot(sm.xyz, L), 0.0);\ncol = vec3(0.8, 0.5, 0.3) * d;\ncol *= sm.w;`, uniforms: { uA: (vv.a * Math.PI) / 180 } }), label: '❌ no decode/encode' },
            { spec: (vv) => ({ frag: `vec4 sm = sphereNormal(uv);\nvec3 L = normalize(vec3(cos(uA), sin(uA), 0.5));\nfloat d = max(dot(sm.xyz, L), 0.0);\nvec3 alb = pow(vec3(0.8, 0.5, 0.3), vec3(2.2));\ncol = ${ENC('alb * d')};\ncol *= sm.w;`, uniforms: { uA: (vv.a * Math.PI) / 180 } }), label: '✅ linear + encode' },
          ],
          code: '// ✅ right\nvec3 albedo = pow(albedoSrgb, vec3(2.2)); // decode\nvec3 lit = albedo * max(dot(N, L), 0.0); // linear maths\ncol = pow(lit, vec3(1.0 / 2.2));          // encode',
          after: '<p>Notice the right sphere has the <b>same colour</b> where fully lit, but a softer, more natural roll into shadow.</p>',
        },
        {
          title: 'The linear workflow in engines',
          body: `<ul>
<li><b>Unity</b>: Project Settings → Player → <b>Color Space: Linear</b> (default for new projects). Unity then decodes sRGB textures and encodes the final image for you.</li>
<li><b>Unreal</b>: always works in linear; textures have an <b>sRGB</b> checkbox.</li>
<li><b>Shader Graph / Material editor</b>: colour properties are converted to linear for you. Your maths is already in linear!</li>
</ul>
<div class="note">The rule: <b>decode once on the way in, encode once on the way out</b>. Doing it twice (or zero times) is the classic bug — images look washed-out (encoded twice) or too dark and contrasty (never encoded).</div>`,
          quiz: { q: 'In a linear-space Unity project you add pow(col, 1/2.2) at the end of your shader. Result?', options: ['Washed out: the engine already encodes, so it\'s encoded twice', 'Perfect', 'Too dark'], answer: 0, explain: 'The sRGB render target encodes again. Double encoding lifts the darks → washed-out look.' },
        },
      ],
      games: [
        {
          id: 'blend-which', title: 'Which is linear?', engine: 'mcq', rounds: 6,
          blurb: 'Spot the blend or lighting done in linear space.',
          gen: (rng, level) => {
            const useSphere = level > 1 && rng.chance(0.4);
            if (useSphere) {
              const alb = rng.pick([[0.8, 0.5, 0.3], [0.3, 0.6, 0.9], [0.9, 0.9, 0.9], [0.5, 0.8, 0.4]]);
              const ang = rng.step(0, 3, 0.5);
              const base = `vec4 sm = sphereNormal(uv);\nvec3 L = normalize(vec3(cos(${f(ang)}), sin(${f(ang)}), 0.5));\nfloat d = max(dot(sm.xyz, L), 0.0);\n`;
              const ok = { shader: { frag: `${base}col = ${ENC(`pow(${v(alb)}, vec3(2.2)) * d`)};\ncol *= sm.w;` } };
              const bad = { shader: { frag: `${base}col = ${v(alb)} * d;\ncol *= sm.w;` } };
              return {
                prompt: 'Both spheres use the same albedo and light. Which one did the lighting in <b>linear</b> space and encoded at the end?',
                options: [ok, bad],
                explain: '<p>The linear one has a softer, wider falloff into shadow. Without encoding, the linear values get darkened again by the screen → harsh, contrasty terminator.</p>',
              };
            }
            const pairs = [[[1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 1, 0]], [[1, 0, 0], [0, 1, 1]], [[0, 1, 0], [1, 0, 1]], [[1, 0.5, 0], [0, 0.5, 1]]];
            const [a, b] = rng.pick(pairs);
            const ok = { shader: { frag: `col = ${ENC(`mix(pow(${v(a)}, vec3(2.2)), pow(${v(b)}, vec3(2.2)), uv.x)`)};` } };
            const bad = { shader: { frag: `col = mix(${v(a)}, ${v(b)}, uv.x);` } };
            const askLinear = level === 1 || rng.chance(0.5);
            return {
              prompt: askLinear ? 'Which gradient was blended <b>correctly</b> in linear space?' : 'Which gradient was blended <b>naively</b> on sRGB values?',
              options: askLinear ? [ok, bad] : [bad, ok],
              explain: '<p>Naive sRGB blends get a <b>dark, muddy band</b> in the middle. Blending light in linear keeps the middle bright, like real mixed light.</p>',
            };
          },
        },
        {
          id: 'blend-calc', title: 'Blend the light', engine: 'numeric', rounds: 5,
          blurb: 'Compute naive vs correct blends (γ ≈ 2 shortcut).',
          gen: (rng, level) => {
            if (level === 1) {
              const t = rng.pick([0.5, 0.3, 0.6, 0.8, 0.9, 0.4]);
              return {
                prompt: `Naive blend: <code>mix(0.0, 1.0, ${n(t)})</code> on sRGB values gives ${n(t)}. What fraction of white's <b>light</b> is that?`,
                sub: 'Use γ ≈ 2 (square it).',
                code: `float srgb = ${f(t)};\nfloat lin = pow(srgb, 2.0);`,
                answer: r3(t * t),
                explain: `<p>${n(t)}² = <b>${n(t * t)}</b>. You asked for ${Math.round(t * 100)}% but got ${Math.round(t * t * 100)}% of the light — naive blends are too dark.</p>`,
              };
            }
            if (level === 2) {
              const [lin, s] = rng.pick([[0.25, 0.5], [0.16, 0.4], [0.36, 0.6], [0.64, 0.8], [0.81, 0.9], [0.49, 0.7], [0.09, 0.3], [0.04, 0.2]]);
              return {
                prompt: `Blend black → white <b>correctly</b>: <code>t = ${n(lin)}</code> in linear. What sRGB value do you write to the screen?`,
                sub: 'mix(0, 1, t) in linear = t. Then encode (γ ≈ 2 → sqrt).',
                code: `float lin = mix(0.0, 1.0, ${f(lin)});\ncol = vec3(sqrt(lin));`,
                answer: s,
                explain: `<p>sqrt(${n(lin)}) = <b>${n(s)}</b>.</p>`,
              };
            }
            const [a, b, ans] = rng.pick([[0.1, 0.7, 0.5], [0.7, 0.1, 0.5], [0.6, 0.8, 0.707], [0.8, 0.6, 0.707], [0, 1, 0.707]]);
            return {
              prompt: `Average sRGB <b>${n(a)}</b> and <b>${n(b)}</b> in linear space. sRGB result?`,
              sub: 'Square both, average, square-root.',
              code: `float lin = (pow(${f(a)}, 2.0) + pow(${f(b)}, 2.0)) * 0.5;\nfloat srgb = sqrt(lin);`,
              answer: ans,
              tolerance: 0.015,
              explain: `<p>(${n(a * a)} + ${n(b * b)}) / 2 = ${n((a * a + b * b) / 2)} → sqrt ≈ <b>${n(ans)}</b>. Naive average: ${n((a + b) / 2)}.</p>`,
            };
          },
        },
        {
          id: 'linear-facts', title: 'Linear or not?', engine: 'mcq', rounds: 8,
          blurb: 'Concept checks on the linear workflow.',
          questions: [
            tf('Lighting calculations should be done on linear values.', true, 'Light energy adds and multiplies linearly.'),
            tf('Mixing red and green sRGB values 50/50 gives the physically correct yellow.', false, 'It gives a darker, muddy yellow. Decode first.'),
            tf('Unreal does lighting in linear space.', true, 'Always.'),
            tf('If you encode the final colour twice, the image looks washed-out.', true, 'The second encode lifts the darks again.'),
            tf('Shader Graph colour properties are already converted to linear for your maths (in a linear project).', true, 'The engine handles it.', 2),
            tf('sRGB 0.5 and linear 0.5 are the same brightness on screen.', false, 'Linear 0.5 must be encoded to ≈ 0.73 sRGB; it\'s much brighter than sRGB 0.5.'),
            q('Correct order in a shader?', ['Decode inputs → maths → encode output', 'Encode inputs → maths → decode output', 'Maths → decode → encode'], 'Translate in, work, translate out.'),
            q('A gradient between two bright colours has a dark band in the middle. Likely cause?', ['It was blended on sRGB values', 'It was blended in linear', 'The texture is HDR'], 'Gamma-space blending darkens midpoints.'),
            q('Without any encode at the end, a linear-lit sphere looks…', ['Too dark and harsh in the falloff', 'Washed out', 'Exactly right'], 'The display treats the linear numbers as sRGB and darkens them.'),
            q('Where do you switch Unity to the linear workflow?', ['Player Settings → Color Space', 'Texture import → Wrap mode', 'Camera → Clear flags'], 'Project Settings → Player → Other Settings → Color Space.', { level: 2 }),
            q('Linear 0.5 encoded to sRGB is about…', ['0.73', '0.22', '0.5'], 'pow(0.5, 1/2.2) ≈ 0.73.', { level: 2 }),
          ],
        },
      ],
    },
    // ================================================================== 3. sRGB vs LINEAR TEXTURES
    {
      id: 'colorspace.textures',
      title: 'sRGB vs linear textures',
      blurb: 'Colours are sRGB, data is linear — tick the right box.',
      lesson: [
        {
          title: 'Two kinds of textures',
          body: `<p><b>Colour textures</b> hold things you <i>see</i>: albedo, UI art, photos, painted colour ramps. They were made on a screen, so their numbers are <b>sRGB-encoded</b>.</p>
<p><b>Data textures</b> hold <i>numbers</i> that drive maths: normal maps, roughness, metallic, height, masks, flow maps, noise used for distortion. A 0.5 in a roughness map must mean <b>exactly 0.5</b> — they're <b>linear</b>.</p>
<div class="analogy">📒 A colour texture is a painting; a data texture is a spreadsheet saved as an image. You'd never "gamma-correct" a spreadsheet!</div>`,
        },
        {
          title: 'What the sRGB checkbox does',
          body: `<p>When a texture is flagged <b>sRGB</b>, the GPU <b>decodes</b> every sample before your shader sees it (≈ <code>pow(x, 2.2)</code>). Great for colours. Terrible for data.</p>
<p>Here a gradient <b>mask</b> drives a cut-off <code>step(threshold, mask)</code>. Top: imported linear (correct). Bottom: wrongly flagged sRGB.</p>`,
          controls: [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (vv) => ({ frag: `float m = uv.x;               // the mask value stored in the texture\nif (uv.y < 0.5) m = pow(m, 2.2); // sRGB flag ON by mistake\ncol = mix(vec3(0.15, 0.1, 0.3), vec3(1.0, 0.7, 0.3), step(uT, m));\nif (abs(uv.y - 0.5) < 0.006) col = vec3(0.08);\n${RULER}`, uniforms: { uT: vv.t } }),
          size: 260,
          code: (vv) => `float m = texture2D(uMask, uv).r;\ncol = step(${f(vv.t, 2)}, m) …\n// linear import: cut at x = ${vv.t.toFixed(2)}\n// sRGB by mistake: cut at x = ${enc(vv.t).toFixed(2)}`,
          after: '<div class="note">With the wrong flag, a threshold of 0.5 cuts at 0.73 — the effect "feels non-linear" and artists can\'t hit the values they painted.</div>',
        },
        {
          title: 'Normal maps flagged sRGB',
          body: `<p>Worst case: a normal map. A flat texel (0.5, 0.5, 1) decodes to about (0.22, 0.22, 1) → unpacks to (−0.56, −0.56, 1). <b>Every normal tilts</b> down-left, so lighting looks wrong everywhere.</p>`,
          controls: [{ name: 'a', label: 'light angle (°)', min: 0, max: 360, step: 5, value: 45 }],
          shaders: [
            { spec: (vv) => ({ frag: 'vec3 nn = normalize(texture2D(uNm, uv).xyz * 2.0 - 1.0);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + max(dot(nn, uL), 0.0));', uniforms: { uL: G.normalize([Math.cos((vv.a * Math.PI) / 180), Math.sin((vv.a * Math.PI) / 180), 0.6]) }, textures: { uNm: 'normalmap' } }), label: '✅ linear' },
            { spec: (vv) => ({ frag: 'vec3 nn = normalize(pow(texture2D(uNm, uv).xyz, vec3(2.2)) * 2.0 - 1.0);\ncol = vec3(0.85, 0.75, 0.6) * (0.1 + max(dot(nn, uL), 0.0));', uniforms: { uL: G.normalize([Math.cos((vv.a * Math.PI) / 180), Math.sin((vv.a * Math.PI) / 180), 0.6]) }, textures: { uNm: 'normalmap' } }), label: '❌ flagged sRGB' },
          ],
          after: '<p class="small">Turn the light to the top-right: the "sRGB" version goes dark because all its normals lean away, toward the bottom-left.</p>',
        },
        {
          title: 'Where the checkbox lives',
          body: `<ul>
<li><b>Unity</b>: texture Inspector → <b>sRGB (Color Texture)</b>. Untick for masks, roughness, metallic, packed maps. Setting Texture Type to <b>Normal map</b> handles normals automatically.</li>
<li><b>Unreal</b>: texture editor → <b>sRGB</b> checkbox. Compression Settings <b>Masks (no sRGB)</b> and <b>Normalmap</b> turn it off for you.</li>
<li><b>Channel-packed</b> textures (e.g. ORM: occlusion/roughness/metallic in R/G/B, Unity's Mask Map) are data → <b>linear</b>.</li>
</ul>
<div class="tip">💡 Rule of thumb: "Would an artist pick this from a colour picker?" Yes → sRGB. "Is it a number that drives maths?" → linear.</div>`,
          quiz: { q: 'You pack roughness into the G channel of a mask texture. sRGB on or off?', options: ['Off — it\'s data', 'On — it\'s an image', 'Doesn\'t matter'], answer: 0, explain: 'Packed data must be read as-is.' },
        },
      ],
      games: [
        {
          id: 'srgb-sort', title: 'sRGB or linear?', engine: 'buckets', rounds: 2,
          blurb: 'Sort textures by how they should be imported.',
          gen: () => ({
            prompt: 'How should this texture be imported?',
            sub: 'Colour you look at → sRGB. Numbers for maths → linear.',
            buckets: ['🎨 sRGB (colour)', '📊 Linear (data)'],
            count: 10,
            items: [
              { text: 'Albedo / base colour map', bucket: 0 },
              { text: 'Normal map', bucket: 1, why: 'Directions stored as numbers. sRGB decoding would bend them.' },
              { text: 'Roughness map', bucket: 1 },
              { text: 'Metallic map', bucket: 1 },
              { text: 'UI icon artwork', bucket: 0 },
              { text: 'Photo used as a billboard poster', bucket: 0 },
              { text: 'Height / displacement map', bucket: 1 },
              { text: 'Packed ORM mask (occlusion, roughness, metallic)', bucket: 1, why: 'Channel-packed data is always linear.' },
              { text: 'Flow map (uv offsets in R and G)', bucket: 1 },
              { text: 'Noise texture used to distort uv', bucket: 1 },
              { text: 'Dissolve mask (thresholded with step)', bucket: 1, why: 'The threshold maths needs the painted numbers unchanged.' },
              { text: 'Hand-painted diffuse for a stylised prop', bucket: 0 },
              { text: 'Colour ramp / gradient for toon shading', bucket: 0, why: 'It holds colours the artist picked and sees.' },
              { text: 'Emissive colour texture', bucket: 0 },
              { text: 'Signed distance field font atlas', bucket: 1, why: 'Distances are numbers, not colours.' },
            ],
          }),
        },
        {
          id: 'srgb-oops', title: 'What went wrong?', engine: 'mcq', rounds: 6,
          blurb: 'Diagnose colour-space bugs from symptoms.',
          questions: [
            q('A normal-mapped wall looks dim and lit from the wrong side, everywhere.', ['The normal map is flagged sRGB', 'The albedo is flagged sRGB', 'The light is too weak'], 'sRGB decoding pulls 0.5 down to ~0.22, tilting every normal.'),
            q('Your dissolve effect: at slider 0.5 only a small part has dissolved; it speeds up at the end.', ['The mask texture is flagged sRGB', 'The mask is too small', 'The shader uses step'], 'Decoded values are lower (pow 2.2), so the threshold crosses them late.'),
            q('A character\'s albedo looks pale and washed-out in a linear project.', ['The colour texture has sRGB unticked', 'The normal map is sRGB', 'The light is HDR'], 'Without decoding, the encoded numbers are treated as linear → too bright.'),
            q('Metal parts look shinier than in Substance Painter.', ['The roughness map is flagged sRGB', 'The albedo is linear', 'Too many lights'], 'Decoding makes roughness values lower → smoother → shinier.', { level: 2 }),
            q('What does the sRGB flag change when the shader samples a texture?', ['The GPU decodes the value to linear first', 'The texture gets compressed more', 'The texture is flipped'], 'It\'s a hardware sRGB → linear conversion per sample.'),
            q('Is sampling an sRGB texture slower?', ['No — the conversion is free in hardware', 'Yes, about 2×', 'Only on mobile'], 'GPUs do it in the texture unit.', { level: 2 }),
            q('Unreal compression setting that switches sRGB off for packed masks?', ['Masks (no sRGB)', 'Default (DXT1/5)', 'UserInterface2D'], 'Masks (no sRGB) is meant for channel-packed data.', { level: 2 }),
            q('Unity texture type that handles normal maps automatically?', ['Normal map', 'Sprite (2D and UI)', 'Default'], 'It disables sRGB and sets up unpacking.'),
            q('Why are colour textures stored sRGB in the first place?', ['8 bits look better in the darks when gamma-encoded', 'GPUs can\'t read linear textures', 'To save memory'], 'Same reason gamma exists at all.'),
            q('A toon ramp with colours the artist picked: sRGB or linear?', ['sRGB', 'Linear', 'Either, no difference'], 'It holds colours that are meant to be seen.', { level: 2 }),
          ],
        },
        {
          id: 'mask-calc', title: 'Decoded by mistake', engine: 'numeric', rounds: 5,
          blurb: 'Compute what the shader receives when the sRGB flag is wrong.',
          gen: (rng, level) => {
            if (level === 1) {
              const x = rng.pick([0.5, 0.4, 0.6, 0.8, 0.9, 0.3, 1]);
              return {
                prompt: `A mask texel stores <b>${n(x)}</b>, but the texture is flagged <b>sRGB</b>. What value does the shader get?`,
                sub: 'Use γ ≈ 2 (square it).',
                code: `float m = texture2D(uMask, uv).r; // decoded: pow(${f(x)}, 2.0)`,
                answer: r3(x * x),
                explain: `<p>${n(x)}² = <b>${n(x * x)}</b> (real γ 2.2: ${dec(x).toFixed(3)}). ${x === 1 ? 'Only 0 and 1 survive unchanged!' : 'Your painted value got darker.'}</p>`,
              };
            }
            if (level === 2) {
              const x = rng.pick([0.5, 0.7, 0.8, 0.6, 0.9]);
              const ans = r3(x * x * 2 - 1);
              return {
                prompt: `A normal map's red channel stores <b>${n(x)}</b>. It's wrongly flagged sRGB. What <code>n.x</code> do you get after unpacking?`,
                sub: 'Decode (γ ≈ 2: square), then × 2 − 1.',
                code: `float r = pow(${f(x)}, 2.0);\nfloat nx = r * 2.0 - 1.0;`,
                answer: ans,
                explain: `<p>${n(x)}² = ${n(x * x)} → × 2 − 1 = <b>${n(ans)}</b>. The correct value would be ${n(x * 2 - 1)}.</p>`,
              };
            }
            const x = rng.pick([0.5, 0.7, 0.8, 0.6, 0.9, 0.3]);
            return {
              prompt: `A normal-map channel stores <b>${n(x)}</b>. What does it unpack to <b>correctly</b> (linear) and <b>wrongly</b> (flagged sRGB)?`,
              sub: 'γ ≈ 2 shortcut. Unpack = × 2 − 1.',
              code: `float ok  = ${f(x)} * 2.0 - 1.0;\nfloat bad = pow(${f(x)}, 2.0) * 2.0 - 1.0;`,
              answer: [r3(x * 2 - 1), r3(x * x * 2 - 1)], labels: ['correct', 'wrong'],
              explain: `<p>Correct: ${n(x)} × 2 − 1 = <b>${n(x * 2 - 1)}</b>. Wrong: ${n(x * x)} × 2 − 1 = <b>${n(x * x * 2 - 1)}</b>.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== 4. HDR
    {
      id: 'colorspace.hdr',
      title: 'HDR: values above 1.0',
      blurb: 'Real light is way brighter than "white" — keep those numbers.',
      lesson: [
        {
          title: 'The real world is not 0..1',
          body: `<p>Real brightness spans a <b>gigantic</b> range. Very roughly (relative light levels):</p>
<ul><li>Moonlit night: <b>0.01</b></li><li>Indoor room: <b>1</b></li><li>Overcast day: <b>100</b></li><li>Direct sunlight: <b>1,000+</b></li><li>The sun's disc itself: <b>millions</b></li></ul>
<p>A screen can only show "black" to "its white". But nothing stops a shader from computing <code>5.0</code> or <code>30.0</code>. That's <b>HDR</b> (high dynamic range).</p>`,
        },
        {
          title: 'Strong light → values above 1',
          body: `<p>Turn up the light intensity. The maths is happy with big numbers — but the screen clips everything above 1.0 to white, so the lit side becomes a <b>flat white blob</b> with no shape.</p>`,
          controls: [{ name: 'k', label: 'light intensity', min: 0.5, max: 8, step: 0.1, value: 3 }],
          shader: (vv) => ({ frag: `vec4 sm = sphereNormal(uv);\nfloat d = max(dot(sm.xyz, normalize(vec3(0.6, 0.6, 0.5))), 0.0);\nvec3 lin = vec3(0.8, 0.45, 0.25) * d * uK;\ncol = ${ENC('clamp(lin, 0.0, 1.0)')} * sm.w;`, uniforms: { uK: vv.k } }),
          code: (vv) => `vec3 lin = albedo * d * ${f(vv.k, 1)};\n// brightest pixel: ${nv(G.mul([0.8, 0.45, 0.25], vv.k), 2)}\ncol = clamp(lin, 0.0, 1.0);  // what an 8-bit screen does`,
        },
        {
          title: 'Clipping shifts colours',
          body: `<p>Each channel clips <b>separately</b>. An orange light (1.0, 0.5, 0.2) at intensity 2 is (2.0, 1.0, 0.4) → clipped to (1.0, 1.0, 0.4): <b>yellow</b>! Push further and it turns white. That's why naive bright fire looks yellow-white and cheap.</p>`,
          controls: [{ name: 'k', label: 'intensity', min: 0.5, max: 6, step: 0.1, value: 2 }],
          shader: (vv) => ({ frag: `vec3 lin = vec3(1.0, 0.5, 0.2) * uv.x * uK;\ncol = ${ENC('clamp(lin, 0.0, 1.0)')};`, uniforms: { uK: vv.k } }),
          visual: (el, vv) => swatchRow([['real light (screen can\'t show it)<br>' + nv(G.mul([1, 0.5, 0.2], vv.k), 1), '→'], ['what you see<br>' + nv(G.min(G.mul([1, 0.5, 0.2], vv.k), 1), 2), G.min(G.mul([1, 0.5, 0.2], vv.k), 1).map(enc)]])(el),
          code: (vv) => `vec3 lin = vec3(1.0, 0.5, 0.2) * uv.x * ${f(vv.k, 1)};\ncol = clamp(lin, 0.0, 1.0);`,
          after: '<p class="small dim">The gradient goes from intensity 0 (left) to the slider value (right).</p>',
        },
        {
          title: 'Why keep the big numbers?',
          body: `<p>If we clamp early, information is <b>lost forever</b>. Keeping HDR values (in a <b>float render target</b> like RGBA16F) lets later steps use them:</p>
<ul><li><b>Exposure</b> can darken the image and recover detail in bright areas.</li>
<li><b>Bloom</b> knows what is <i>really</i> bright (only pixels above ~1 glow).</li>
<li><b>Tonemapping</b> can compress the range smoothly instead of clipping.</li></ul>
<p>Below: darken by exposure. Left clipped <i>first</i> (8-bit buffer). Right kept HDR.</p>`,
          controls: [{ name: 'ev', label: 'exposure (stops)', min: -4, max: 0, step: 0.25, value: -2 }],
          shaders: [
            { spec: (vv) => ({ defs: SCENE, frag: `vec3 c = clamp(hdrScene(uv), 0.0, 1.0) * exp2(uEv);\ncol = ${ENC('c')};`, uniforms: { uEv: vv.ev } }), label: 'clip, then darken' },
            { spec: (vv) => ({ defs: SCENE, frag: `vec3 c = clamp(hdrScene(uv) * exp2(uEv), 0.0, 1.0);\ncol = ${ENC('c')};`, uniforms: { uEv: vv.ev } }), label: 'HDR, darken, then clip' },
          ],
          after: '<div class="tip">💡 Unity URP: enable <b>HDR</b> on the pipeline asset; HDR colour pickers have an <b>Intensity</b> slider (in stops) for emissive. Unreal: multiply emissive colour by e.g. 10–50 to make it bloom.</div>',
          quiz: { q: 'Why does bloom need HDR values?', options: ['To tell "very bright" (e.g. 20) apart from plain white (1)', 'Because bloom only works on textures', 'It doesn\'t'], answer: 0, explain: 'After clipping, a white wall and the sun are both 1.0 — bloom couldn\'t tell which should glow.' },
        },
      ],
      games: [
        {
          id: 'clip-colour', title: 'What does the screen show?', engine: 'mcq', rounds: 8,
          blurb: 'Predict the colour after per-channel clipping.',
          gen: (rng, level) => {
            const bases = level === 1 ? [[1, 0.5, 0.25], [0.25, 0.5, 1], [0.5, 1, 0.25], [1, 0.25, 0.5]] : [[1, 0.5, 0.25], [0.25, 0.5, 1], [0.5, 1, 0.25], [1, 0.25, 0.5], [0.8, 0.4, 0.1], [0.2, 0.6, 0.8], [0.6, 0.3, 0.9]];
            const c = rng.pick(bases);
            const k = rng.pick(level === 1 ? [2] : level === 2 ? [1.5, 2, 3] : [1.5, 2, 2.5, 3, 4]);
            const hdr = G.mul(c, k).map(r3);
            const res = G.min(hdr, 1).map(r3);
            const key = (x) => x.map((y) => Math.round(y * 10)).join();
            const opts = distinct(rng, res, (r, i) => [c, [1, 1, 1], G.div(hdr, Math.max(...hdr)), G.min(G.mul(c, k * 2), 1), G.min(G.mul(c, k / 2), 1)][i % 5].map(r3), 4, key);
            return {
              prompt: `This light colour <code>${v(c, 2)}</code> is multiplied by <b>${n(k)}</b>. What does an 8-bit screen show after clipping?`,
              code: `vec3 hdr = ${v(c, 2)} * ${f(k)}; // = ${v(hdr, 2)}\ncol = clamp(hdr, 0.0, 1.0);`,
              options: opts.map((x) => ({ color: x.map(enc) })),
              explain: `<p>Clip each channel at 1: ${nv(hdr)} → <b>${nv(res)}</b>. Channels that hit 1 stop growing, so the hue drifts toward ${res.filter((x) => x >= 1).length >= 2 ? 'a brighter secondary colour or white' : 'its brightest channel'}.</p>`,
            };
          },
        },
        {
          id: 'clip-calc', title: 'Clip it', engine: 'numeric', rounds: 5,
          blurb: 'Compute clipped values and clipping points.',
          gen: (rng, level) => {
            if (level === 1) {
              const x = rng.pick([0.3, 0.5, 0.8, 0.25]), k = rng.pick([2, 3, 4]);
              const ans = r3(Math.min(1, x * k));
              return {
                prompt: `Red channel <b>${n(x)}</b> × intensity <b>${n(k)}</b>, then clipped. What does the screen get?`,
                code: `float r = clamp(${f(x)} * ${f(k)}, 0.0, 1.0);`,
                answer: ans,
                explain: `<p>${n(x)} × ${n(k)} = ${n(x * k)} → ${x * k > 1 ? 'clipped to <b>1</b>' : `<b>${n(ans)}</b> (no clipping)`}.</p>`,
              };
            }
            if (level === 2) {
              const c = rng.pick([[1, 0.5, 0.2], [0.4, 0.6, 0.2], [0.2, 0.3, 0.6], [0.8, 0.4, 0.1]]), k = rng.pick([2, 3, 1.5]);
              const ans = G.min(G.mul(c, k), 1).map(r3);
              return {
                prompt: 'What colour reaches the screen?',
                code: `vec3 hdr = ${v(c)} * ${f(k)};\ncol = clamp(hdr, 0.0, 1.0);`,
                answer: ans, labels: ['r', 'g', 'b'], wrap: 'vec3',
                explain: `<p>${nv(G.mul(c, k).map(r3))} → clip → <b>${nv(ans)}</b>.</p>`,
              };
            }
            const g = rng.pick([0.5, 0.25, 0.2, 0.8, 0.4]);
            const c = [1, g, 0.1];
            return {
              prompt: `Light colour <code>${v(c, 2)}</code>. At what intensity does the <b>green</b> channel start clipping?`,
              sub: 'Find k where g × k = 1.',
              code: `vec3 hdr = ${v(c, 2)} * k;`,
              answer: r3(1 / g),
              explain: `<p>${n(g)} × k = 1 → k = <b>${n(1 / g)}</b>. Red already clips at k = 1 — from there on, the colour shifts toward yellow.</p>`,
            };
          },
        },
        {
          id: 'hdr-intensity', title: 'How strong is the light?', engine: 'slider', rounds: 4,
          blurb: 'Judge a light\'s HDR intensity from the clipped image.',
          gen: (rng, level) => {
            const k = rng.pick(level === 1 ? [1, 3, 6] : [1, 1.5, 2, 3, 4, 6]);
            return {
              prompt: 'Match the light intensity (the screen clips at 1.0).',
              sub: 'Look at how big the flat clipped area is.',
              params: [{ name: 'k', label: 'light intensity', min: 0.5, max: 8, step: 0.1, target: k }],
              build: (p) => ({ frag: `vec4 sm = sphereNormal(uv);\nfloat d = max(dot(sm.xyz, normalize(vec3(0.6, 0.6, 0.5))), 0.0);\nvec3 lin = vec3(0.8, 0.45, 0.25) * d * uK;\ncol = ${ENC('clamp(lin, 0.0, 1.0)')} * sm.w;`, uniforms: { uK: p.k } }),
              code: (p) => `vec3 lin = albedo * d * ${f(p.k, 1)};\ncol = clamp(lin, 0.0, 1.0);`,
              compare: 'pixels',
              explain: `<p>Target intensity ${n(k)}. The red channel (0.8) clips once d × ${n(k)} × 0.8 > 1, i.e. where d > ${n(Math.min(1, 1 / (0.8 * k)), 2)}.</p>`,
            };
          },
        },
        {
          id: 'hdr-facts', title: 'HDR facts', engine: 'mcq', rounds: 8,
          blurb: 'Quick checks about high dynamic range.',
          questions: [
            tf('A shader may output values above 1.0 into a float render target.', true, 'That\'s exactly what HDR rendering does.'),
            tf('Clipping happens per channel, which can shift hue.', true, 'Orange × 2 → yellow, then white.'),
            tf('Once an 8-bit buffer has clipped a value, lowering the exposure brings back the detail.', false, 'The information is gone; everything above 1 became the same 1.0.'),
            tf('The sun in a physically based scene can be thousands of times brighter than a white wall in shade.', true, 'Real dynamic range is huge.', 2),
            tf('HDR means "the texture has more pixels".', false, 'It\'s about the range of values (brightness), not resolution.'),
            q('Typical HDR render target format?', ['RGBA16F (16-bit float)', 'RGBA8 (8-bit)', 'R8 (single channel)'], 'Half-floats store large values cheaply.', { level: 2 }),
            q('Which effect most needs HDR values?', ['Bloom', 'UV scrolling', 'Vertex wobble'], 'Bloom thresholds "really bright" pixels.'),
            q('An emissive material should glow and bloom. What do you do?', ['Multiply its colour by an intensity > 1', 'Set its alpha to 0', 'Make it sRGB'], 'HDR emissive (e.g. ×10) exceeds the bloom threshold.'),
            q('Why does very bright orange fire look yellow-white on screen?', ['Red and green channels clip at 1 while blue keeps growing', 'Fire is yellow', 'Bloom adds yellow'], 'Per-channel clipping pushes it toward white.'),
            q('Orange (1, 0.5, 0.2) × 2, clipped, is…', ['(1, 1, 0.4) — yellowish', '(1, 0.5, 0.2) — same orange', '(1, 1, 1) — white'], '(2, 1, 0.4) → clip → (1, 1, 0.4).', { level: 2 }),
          ],
        },
      ],
    },
    // ================================================================== 5. EXPOSURE & TONEMAPPING
    {
      id: 'colorspace.tonemap',
      title: 'Exposure & tonemapping',
      blurb: 'Squeeze HDR into the screen without ugly clipping.',
      lesson: [
        {
          title: 'Exposure: the camera\'s brightness knob',
          body: `<p>Like a camera, we first choose an <b>exposure</b>: multiply all the HDR light by a number. Photographers count in <b>stops</b>: +1 stop = ×2 light, −1 stop = ×0.5.</p>
<pre class="code">vec3 c = hdr * exp2(stops);</pre>
<p>But with plain clipping you can't win: expose for the shadows and the sky burns out; expose for the sky and the ball goes black.</p>`,
          controls: [{ name: 'ev', label: 'exposure (stops)', min: -4, max: 3, step: 0.25, value: 0 }],
          shader: (vv) => scene(0, vv.ev),
          size: 260,
          code: (vv) => `vec3 c = hdr * exp2(${f(vv.ev, 2)}); // × ${n(2 ** vv.ev, 3)}\nc = clamp(c, 0.0, 1.0);    // no tonemapping\ncol = pow(c, vec3(1.0 / 2.2));`,
        },
        {
          title: 'Tonemapping: roll off instead of chopping',
          body: `<p>A <b>tonemapper</b> is a curve that maps 0..∞ into 0..1 <b>smoothly</b>. The simplest is <b>Reinhard</b>:</p>
<pre class="code">c = c / (1.0 + c);</pre>
<p>Small values barely change (0.1 → 0.09). 1 → 0.5. 9 → 0.9. 99 → 0.99. It <b>never quite reaches 1</b>, so bright things keep some detail.</p>`,
          controls: [{ name: 'x', label: 'HDR input', min: 0, max: 10, step: 0.1, value: 1 }],
          graph: { fns: [{ f: (x) => Math.min(1, x), label: 'clip: min(x, 1)', color: '#ff7ab2' }, { f: (x) => x / (1 + x), label: 'Reinhard: x/(1+x)', color: '#ffd479' }], opts: (vv) => ({ xmin: 0, xmax: 10, ymin: -0.02, ymax: 1.05, xstep: 2, ystep: 0.25, points: [{ x: vv.x, y: vv.x / (1 + vv.x), label: (vv.x / (1 + vv.x)).toFixed(2) }] }) },
          code: (vv) => `float x = ${f(vv.x, 1)};\nfloat clipped  = min(x, 1.0);     // ${Math.min(1, vv.x).toFixed(3)}\nfloat reinhard = x / (1.0 + x);   // ${(vv.x / (1 + vv.x)).toFixed(3)}`,
        },
        {
          title: 'Clip vs Reinhard vs ACES',
          body: `<p>Same HDR scene, same exposure:</p>
<ul><li><b>Clip</b>: harsh, burnt-out sky and sun halo, hue shifts.</li>
<li><b>Reinhard</b>: everything fits, but looks a bit grey and flat.</li>
<li><b>ACES</b> (filmic): an S-curve like real film — rich contrast, highlights roll off gracefully. The default look in Unreal.</li></ul>`,
          controls: [{ name: 'ev', label: 'exposure (stops)', min: -3, max: 3, step: 0.25, value: 0 }],
          shaders: [
            { spec: (vv) => scene(0, vv.ev), label: 'clip' },
            { spec: (vv) => scene(1, vv.ev), label: 'Reinhard' },
            { spec: (vv) => scene(2, vv.ev), label: 'ACES' },
          ],
          graph: { fns: [{ f: (x) => Math.min(1, x), label: 'clip', color: '#ff7ab2' }, { f: (x) => x / (1 + x), label: 'Reinhard', color: '#ffd479' }, { f: aces, label: 'ACES', color: '#6bdfff' }], opts: { xmin: 0, xmax: 4, ymin: -0.02, ymax: 1.05, xstep: 1, ystep: 0.25 } },
        },
        {
          title: 'The order of operations',
          body: `<p>Every modern engine's frame ends the same way:</p>
<pre class="code">vec3 hdr = lighting();          // 1. linear HDR values
hdr *= exp2(exposure);          // 2. exposure
hdr += bloom;                   // 3. HDR effects (bloom...)
vec3 ldr = tonemap(hdr);        // 4. → 0..1
col = pow(ldr, vec3(1.0/2.2));  // 5. encode sRGB for the screen</pre>
<div class="tip">💡 <b>Unity URP/HDRP</b>: Volume → <b>Tonemapping</b> (Neutral or ACES), plus Exposure (HDRP) / Post Exposure in Color Adjustments. <b>Unreal</b>: the Filmic tonemapper is always on; <b>Exposure</b> (auto exposure / eye adaptation) lives in the Post Process Volume.</div>`,
          quiz: { q: 'Where does gamma encoding happen relative to tonemapping?', options: ['After tonemapping, as the very last step', 'Before exposure', 'Before lighting'], answer: 0, explain: 'Tonemapping works on linear HDR values and outputs linear 0..1; then encode for the screen.' },
        },
      ],
      games: [
        {
          id: 'reinhard-calc', title: 'Reinhard by hand', engine: 'numeric', rounds: 5,
          blurb: 'Compute exposure and Reinhard tonemapping.',
          gen: (rng, level) => {
            if (level === 1) {
              const x = rng.pick([1, 3, 4, 9, 0.25, 0, 19, 0.5]);
              const ans = r3(x / (1 + x));
              return {
                prompt: `Reinhard-tonemap the HDR value <b>${n(x)}</b>.`,
                code: `float c = ${f(x)} / (1.0 + ${f(x)});`,
                answer: ans,
                explain: `<p>${n(x)} / ${n(1 + x)} = <b>${n(ans)}</b>.</p>`,
              };
            }
            if (level === 2) {
              const [x, ev] = rng.pick([[0.5, 1], [2, -1], [1.5, 1], [0.25, 2], [1, 2], [4.5, 1], [8, -1], [0.75, 2], [12, -2]]);
              const e = x * 2 ** ev;
              const ans = r3(e / (1 + e));
              return {
                prompt: `HDR value <b>${n(x)}</b>, exposure <b>${ev > 0 ? '+' : ''}${ev} stop${Math.abs(ev) > 1 ? 's' : ''}</b>, then Reinhard. Result?`,
                code: `float c = ${f(x)} * exp2(${f(ev)}); // × ${n(2 ** ev)}\nc = c / (1.0 + c);`,
                answer: ans,
                explain: `<p>${n(x)} × ${n(2 ** ev)} = ${n(e)} → ${n(e)} / ${n(1 + e)} = <b>${n(ans)}</b>.</p>`,
              };
            }
            const [y, x] = rng.pick([[0.5, 1], [0.8, 4], [0.75, 3], [0.9, 9], [0.6, 1.5], [0.2, 0.25]]);
            return {
              prompt: `After Reinhard, a pixel is <b>${n(y)}</b>. What was the HDR input?`,
              sub: 'Solve y = x / (1 + x) → x = y / (1 − y).',
              code: `// ${f(y)} = x / (1.0 + x)\nfloat x = ${f(y)} / (1.0 - ${f(y)});`,
              answer: x,
              explain: `<p>${n(y)} / ${n(1 - y)} = <b>${n(x)}</b>. Note how fast the input grows near 1: 0.9 needs 9, 0.99 needs 99.</p>`,
            };
          },
        },
        {
          id: 'exposure-match', title: 'Set the exposure', engine: 'slider', rounds: 4,
          blurb: 'Match the target\'s exposure (in stops).',
          gen: (rng, level) => {
            const ev = level === 1 ? rng.pick([-2, 0, 2]) : rng.step(-2.5, 2.5, 0.5);
            const mode = level === 3 ? 2 : 1;
            return {
              prompt: `Match the exposure. Tonemapper: <b>${TM_NAME[mode]}</b>.`,
              sub: '+1 stop = twice the light.',
              params: [{ name: 'ev', label: 'exposure (stops)', min: -3, max: 3, step: 0.25, target: ev }],
              build: (p) => scene(mode, p.ev),
              code: (p) => `vec3 c = hdr * exp2(${f(p.ev, 2)});\nc = ${TM_CODE[mode].replace('hdr', 'c')};\ncol = pow(c, vec3(1.0 / 2.2));`,
              tolerance: 0.05,
              explain: `<p>Target: ${ev > 0 ? '+' : ''}${n(ev)} stops (× ${n(2 ** ev, 2)}). Judge the shadow side of the ball and the sky: the sun is always bright.</p>`,
            };
          },
        },
        {
          id: 'tonemap-which', title: 'Clipped or tonemapped?', engine: 'mcq', rounds: 6,
          blurb: 'Recognise clipping, Reinhard and ACES.',
          gen: (rng, level) => {
            const ev = rng.step(-1, 2, 0.5);
            if (level === 1) {
              const askClip = rng.chance(0.5);
              return {
                prompt: askClip ? 'Which image is simply <b>clipped</b> (no tonemapping)?' : 'Which image is <b>tonemapped</b>?',
                options: askClip ? [{ shader: scene(0, ev + 1) }, { shader: scene(1, ev + 1) }] : [{ shader: scene(1, ev + 1) }, { shader: scene(0, ev + 1) }],
                explain: '<p>Clipping: big flat white/yellow areas around the sun and on the lit ball, hues shifted. Tonemapped: the bright areas still show gradients.</p>',
              };
            }
            const k = level === 2 ? rng.int(0, 1) * 2 : rng.int(0, 2); // L2: clip or ACES
            const others = [0, 1, 2].filter((x) => x !== k);
            return {
              prompt: `Which image uses <b>${TM_NAME[k]}</b>?`,
              sub: level === 3 ? 'Hint: Reinhard = flat & greyish, ACES = contrasty S-curve, clip = burnt-out.' : 'All three show the same HDR scene and exposure.',
              options: [k, ...others].map((m) => ({ shader: scene(m, ev) })),
              explain: '<p><b>Clip</b>: flat, burnt highlights with hue shifts. <b>Reinhard</b>: nothing clips but contrast and saturation look washed. <b>ACES</b>: deeper shadows, punchy mid-tones, soft highlight roll-off.</p>',
            };
          },
        },
        {
          id: 'clip-tap', title: 'Find the 1.0', engine: 'tap', rounds: 5,
          blurb: 'Tap where an HDR gradient crosses 1.0.',
          gen: (rng, level) => {
            const k = rng.pick([2, 4, 5, 2.5, 8 / 3, 10 / 3]);
            const t = r3(1 / k);
            const reinhard = level > 1 && (level === 3 || rng.chance(0.5));
            return {
              prompt: reinhard
                ? `This gradient's HDR value goes from 0 (left) to <b>${n(k, 2)}</b> (right), shown with <b>Reinhard</b>. Tap where the HDR value is <b>1.0</b>.`
                : `This gradient's HDR value goes from 0 (left) to <b>${n(k, 2)}</b> (right), simply clipped. Tap where it <b>starts clipping</b>.`,
              sub: reinhard ? 'Where would Reinhard output 0.5? No visible edge — reason it out!' : 'The red ruler marks 0.1 steps of uv.x.',
              code: `float hdr = uv.x * ${f(k)};\ncol = vec3(${reinhard ? 'hdr / (1.0 + hdr)' : 'clamp(hdr, 0.0, 1.0)'});`,
              shader: { frag: `float hdr = uv.x * ${f(k)};\nvec3 c = vec3(1.0, 0.7, 0.4) * ${reinhard ? 'hdr / (1.0 + hdr)' : 'clamp(hdr, 0.0, 1.0)'};\ncol = ${ENC('c')};\n${RULER}` },
              score: (u) => { const e = Math.abs(u - t); return e <= 0.04 ? 1 : Math.max(0, 1 - (e - 0.04) / 0.15); },
              reveal: [[t, 0.5]],
              explain: `<p>uv.x × ${n(k, 2)} = 1 → uv.x = 1 / ${n(k, 2)} = <b>${n(t, 2)}</b>.${reinhard ? ' Reinhard outputs 0.5 there — no hard edge, the curve just keeps rolling off.' : ' Everything to the right is the same flat colour: detail lost.'}</p>`,
            };
          },
        },
        {
          id: 'post-order', title: 'End of the frame', engine: 'order', rounds: 3,
          blurb: 'Put the HDR → screen steps in order.',
          questions: [
            { prompt: 'Order the steps from lighting to screen:', items: ['Compute lighting in linear HDR', 'Multiply by exposure', 'Tonemap to 0..1', 'Encode to sRGB (pow 1/2.2)', 'Show on the display'], explain: 'Linear HDR → exposure → tonemap → encode → display.' },
            { prompt: 'Order these post-processing steps:', items: ['Render the scene into a float (HDR) buffer', 'Extract pixels brighter than 1 and blur them (bloom)', 'Add bloom back onto the HDR image', 'Apply the tonemapper', 'Write sRGB values to the 8-bit back buffer'], explain: 'Bloom must happen before tonemapping, while "brighter than 1" still means something.' },
            { prompt: 'A texture\'s journey through a linear pipeline:', items: ['Artist paints albedo (sRGB)', 'GPU decodes the sRGB texture to linear', 'Shader multiplies by light (linear)', 'Tonemap the HDR result', 'Encode to sRGB for the screen'], explain: 'Decode once on the way in, encode once on the way out.' },
            { prompt: 'Order the code lines:', items: [{ code: 'vec3 c = hdr * exp2(exposure);' }, { code: 'c = c / (1.0 + c);' }, { code: 'c = pow(c, vec3(1.0 / 2.2));' }, { code: 'gl_FragColor = vec4(c, 1.0);' }], explain: 'Exposure → Reinhard → encode → output.', level: 2 },
          ],
        },
      ],
    },
  ],
};
