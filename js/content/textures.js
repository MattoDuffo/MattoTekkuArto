// Topic — Textures & sampling: reading images in shaders.
import { tf, q, distinct, f, h } from './_kit.js';
import { textureCanvas } from '../core/textures.js';

const r2 = (x) => Math.round(x * 100) / 100;
const n3 = (x) => +(+x).toFixed(3) + '';
const tex = (name, filter = 'linear', wrap = 'repeat') => ({ name, filter, wrap });
/** codefill: preview starts with a WRONG token so the answer isn't given away */
const noPeek = (slots) => slots.map((sl) => ({ ...sl, placeholder: sl.options.find((o) => o !== sl.answer) }));
// 1D wrap functions (what the sampler does to a coordinate)
const WRAP = {
  repeat: (x) => x - Math.floor(x),
  clamp: (x) => Math.min(1, Math.max(0, x)),
  mirror: (x) => { const m = x - 2 * Math.floor(x / 2); return 1 - Math.abs(m - 1); },
};
// Flipbook helpers (4x4, frame 1 is top-left, reading left→right, top→bottom)
const frameOffset = (N, g = 4) => { const i = N - 1; return [(i % g) / g, 1 - (Math.floor(i / g) + 1) / g]; };

// A small pool of "uv tricks" for read-code / read-image games
const UV_TRICKS = [
  { e: 'uv', lvl: 1, say: 'unchanged' },
  { e: 'vec2(1.0 - uv.x, uv.y)', lvl: 1, say: 'mirrored left↔right' },
  { e: 'vec2(uv.x, 1.0 - uv.y)', lvl: 1, say: 'upside down' },
  { e: 'uv * 2.0', lvl: 1, say: '2×2 copies' },
  { e: 'uv * 0.5', lvl: 2, say: 'zoomed into the bottom-left quarter' },
  { e: 'uv * 0.5 + 0.5', lvl: 2, say: 'zoomed into the top-right quarter' },
  { e: 'uv.yx', lvl: 2, say: 'x and y swapped (flipped along the diagonal)' },
  { e: '1.0 - uv', lvl: 2, say: 'rotated 180°' },
  { e: 'vec2(uv.x * 2.0, uv.y)', lvl: 3, say: 'two squashed copies side by side' },
  { e: 'vec2(uv.x, 0.5)', lvl: 3, say: 'one row stretched upwards' },
  { e: 'vec2(uv.x, uv.y * 0.5)', lvl: 3, say: 'bottom half, stretched up' },
];
const trickSpec = (e) => ({ frag: `col = texture2D(uTex, ${e}).rgb;`, textures: { uTex: 'letterF' } });

export default {
  id: 'textures',
  title: 'Textures & sampling',
  icon: '🖼️',
  blurb: 'Reading images: uv → texel, tiling, wrap modes, filtering, distortion, packing and flipbooks.',
  cheatsheet: `
<pre class="code">vec4 c = texture2D(uTex, uv);       // sample: uv in → colour out (RGBA)
texture2D(uTex, uv * tiling + offset); // Tiling & Offset
texture2D(uTex, uv + 0.02 * sin(uv.y * 30.0 + uTime)); // distortion
vec4 m = texture2D(uMask, uv);  // packed masks: m.r, m.g, m.b, m.a
vec2 cell = uv / 4.0 + frameOffset;   // flipbook (4×4)</pre>
<ul>
<li><b>Texel</b> = one pixel of a texture. A 256² texture: texel = <code>floor(uv * 256.0)</code>.</li>
<li><b>Tiling</b> bigger → more, smaller copies. <b>Offset</b> +x → image slides <i>left</i>.</li>
<li><b>Wrap</b> (sampler setting, for uv outside 0..1): repeat = <code>fract</code>, clamp = <code>clamp(uv,0,1)</code>, mirror = ping-pong.</li>
<li><b>Filter</b>: nearest = blocky; linear = blend 4 texels; mipmaps = pre-shrunk copies that stop shimmering at a distance.</li>
<li><b>Channel packing</b>: 4 greyscale masks in R, G, B, A (e.g. ORM = Occlusion, Roughness, Metallic). Store as linear, not sRGB.</li>
<li><b>Flipbook</b> 4×4, frame i (0-based): <code>col = mod(i, 4)</code>, <code>row = floor(i / 4)</code>, offset = <code>(col, 3 - row) * 0.25</code>.</li>
</ul>`,
  concepts: [
    // ================================================================== SAMPLING
    {
      id: 'textures.sample',
      title: 'Sampling a texture',
      blurb: 'texture2D(tex, uv): give a position, get a colour back.',
      lesson: [
        {
          title: 'A texture is a lookup table',
          body: `<p>A texture is an image the shader can <b>ask questions</b>: "what colour is at position (u, v)?" Asking is called <b>sampling</b>:</p>
<pre class="code">vec4 c = texture2D(uTex, vec2(u, v));</pre>
<p>Move the sliders: the crosshair (left) shows where we ask, the right square shows the answer.</p>`,
          controls: [
            { name: 'u', label: 'u', min: 0, max: 1, step: 0.01, value: 0.7 },
            { name: 'v', label: 'v', min: 0, max: 1, step: 0.01, value: 0.55 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv).rgb;\nvec2 d = abs(uv - uP);\nfloat cross = (1.0 - step(0.006, min(d.x, d.y))) * step(max(d.x, d.y), 0.08);\ncol = mix(col, vec3(1.0), cross);', textures: { uTex: 'photo' }, uniforms: { uP: [v.u, v.v] } }), label: 'where we ask' },
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uP).rgb;', textures: { uTex: 'photo' }, uniforms: { uP: [v.u, v.v] } }), label: 'the answer' },
          ],
          code: (v) => `vec4 c = texture2D(uTex, vec2(${f(v.u, 2)}, ${f(v.v, 2)}));\ncol = c.rgb; // the same colour for EVERY pixel`,
          after: '<div class="tip">💡 Unity: <b>Sample Texture 2D</b> node. Unreal: <b>Texture Sample</b>. HLSL: <code>tex.Sample(sampler, uv)</code>. All the same idea.</div>',
        },
        {
          title: 'Using uv as the question',
          body: `<p>Normally each pixel asks about <b>its own</b> uv: <code>texture2D(uTex, uv)</code>. Pixel at the bottom-left asks for (0,0), pixel at the top-right asks for (1,1) — so the image appears once, filling the square.</p>
<p>uv (0,0) is the <b>bottom-left</b> of the image, (1,1) the <b>top-right</b>. That's GL convention; DirectX images start top-left (engines hide this for you).</p>`,
          shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'uvgrid' } },
          code: 'col = texture2D(uTex, uv).rgb;\n// uvgrid texture: red = u, green = v, lines every 1/8',
        },
        {
          title: 'uv → texel',
          body: `<p>A texture is a grid of pixels called <b>texels</b>. Our built-in textures are 256 × 256 texels.</p>
<p>uv is <b>resolution independent</b>: 0..1 no matter the size. The GPU converts: <code>texel = floor(uv * 256.0)</code>. Zoom in to see individual texels (grid lines = texel borders).</p>`,
          controls: [{ name: 'z', label: 'zoom window (uv size)', min: 0.03, max: 1, step: 0.01, value: 0.1 }],
          shader: (v) => ({ frag: 'vec2 q = uC + (uv - 0.5) * uZ;\ncol = texture2D(uTex, q).rgb;\nvec2 g = abs(fract(q * 256.0 + 0.5) - 0.5) / fwidth(q * 256.0);\ncol = mix(col, vec3(0.0), (1.0 - min(min(g.x, g.y), 1.0)) * step(uZ, 0.15) * 0.5);', textures: { uTex: tex('smiley', 'nearest') }, uniforms: { uC: [0.36, 0.6], uZ: v.z } }),
          code: (v) => `// window centred on uv (0.36, 0.60), ${n3(v.z)} wide\n// → about ${Math.round(v.z * 256)} texels across\n// centre texel = floor(vec2(0.36, 0.60) * 256.0) = (92, 153)`,
          quiz: { q: 'A 512×512 texture is sampled at uv = (0.5, 0.25). Which texel?', options: ['(256, 128)', '(128, 256)', '(0.5, 0.25)'], answer: 0, explain: '0.5 × 512 = 256, 0.25 × 512 = 128.' },
        },
        {
          title: 'You get a vec4 back',
          body: `<p><code>texture2D</code> returns a <b>vec4</b>: red, green, blue, alpha. Take what you need with swizzles: <code>.rgb</code>, <code>.r</code>, <code>.a</code>…</p>
<p>This photo has no transparency, so its alpha is 1 everywhere (white).</p>`,
          controls: [{ name: 'm', label: '0 .rgb · 1 .r · 2 .g · 3 .b · 4 .a', min: 0, max: 4, step: 1, value: 0 }],
          shader: (v) => ({ frag: 'vec4 c = texture2D(uTex, uv);\nif (uM < 0.5) col = c.rgb;\nelse if (uM < 1.5) col = vec3(c.r);\nelse if (uM < 2.5) col = vec3(c.g);\nelse if (uM < 3.5) col = vec3(c.b);\nelse col = vec3(c.a);', textures: { uTex: 'photo' }, uniforms: { uM: v.m } }),
          code: (v) => `vec4 c = texture2D(uTex, uv);\ncol = ${['c.rgb;', 'vec3(c.r);  // red channel as grey', 'vec3(c.g);  // green channel as grey', 'vec3(c.b);  // blue channel as grey', 'vec3(c.a);  // alpha as grey'][v.m]}`,
          after: '<div class="note">Note the sky in .b: bright (lots of blue). The sun in .r: bright. A single channel is just a greyscale image — keep that in mind for <b>channel packing</b>.</div>',
        },
        {
          title: 'Any vec2 will do',
          body: `<p>The texture doesn't care <b>where</b> the coordinates come from. Change the vec2 and you change what's read: flip, zoom, repeat, swap…</p>
<p>This is the foundation of everything in this topic.</p>`,
          controls: [{ name: 'm', label: 'trick', min: 0, max: 7, step: 1, value: 1 }],
          shader: (v) => trickSpec(UV_TRICKS[v.m].e),
          code: (v) => `col = texture2D(uTex, ${UV_TRICKS[v.m].e}).rgb;\n// → ${UV_TRICKS[v.m].say}`,
          quiz: { q: 'Which coordinates show the image upside down?', options: ['vec2(uv.x, 1.0 - uv.y)', 'vec2(1.0 - uv.x, uv.y)', 'uv * 2.0'], answer: 0, explain: 'The top pixel (uv.y = 1) now asks for v = 0 — the bottom of the image.' },
        },
      ],
      games: [
        {
          id: 'tap-texel', title: 'Where does it read?', engine: 'tap', rounds: 5,
          blurb: 'Tap the spot of the texture that a texture2D call reads.',
          gen: (rng, level) => {
            if (level === 1) {
              const a = rng.int(1, 7) / 8, b = rng.int(1, 7) / 8;
              return {
                prompt: `Tap where <code>texture2D(uTex, vec2(${a}, ${b}))</code> reads.`,
                sub: 'Grid lines every 0.125. (0,0) is bottom-left.',
                shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'uvgrid' } },
                target: [a, b], radius: 0.05,
                explain: `<p>u = ${a} → ${a * 8} lines from the left. v = ${b} → ${b * 8} lines up from the <b>bottom</b>.</p>`,
              };
            }
            if (level === 2) {
              const a = r2(rng.step(0.1, 0.9, 0.05)), b = r2(rng.step(0.1, 0.9, 0.05));
              return {
                prompt: `Tap where <code>texture2D(uTex, vec2(${f(a, 2)}, ${f(b, 2)}))</code> reads.`,
                sub: 'No grid this time — estimate!',
                shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: rng.pick(['letterF', 'photo', 'smiley']) } },
                target: [a, b], radius: 0.06,
                explain: `<p>${Math.round(a * 100)}% from the left, ${Math.round(b * 100)}% up from the bottom.</p>`,
              };
            }
            const s = rng.pick([0.5, 2]), o = [rng.pick([0, 0.25, 0.5]), rng.pick([0, 0.25])];
            const px = [rng.pick([0.2, 0.4, 0.6, 0.8]), rng.pick([0.2, 0.4, 0.6, 0.8])];
            let t = [px[0] * s + o[0], px[1] * s + o[1]];
            t = t.map((x) => x - Math.floor(x));
            return {
              prompt: `The screen pixel at <b>uv = (${px[0]}, ${px[1]})</b> runs this code. Tap the spot of the texture (shown below, untransformed) that it reads.`,
              code: `col = texture2D(uTex, uv * ${f(s)} + vec2(${f(o[0], 2)}, ${f(o[1], 2)})).rgb; // wrap: repeat`,
              shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'uvgrid' } },
              target: t, radius: 0.05,
              explain: `<p>(${px[0]}, ${px[1]}) × ${s} + (${o[0]}, ${o[1]}) = (${r2(px[0] * s + o[0])}, ${r2(px[1] * s + o[1])})${(px[0] * s + o[0] >= 1 || px[1] * s + o[1] >= 1) ? ` → repeat keeps the decimals → (${r2(t[0])}, ${r2(t[1])})` : ''}.</p>`,
            };
          },
        },
        {
          id: 'uv-tricks', title: 'uv tricks', engine: 'mcq', rounds: 8,
          blurb: 'Match texture coordinates and the image they produce — both directions.',
          gen: (rng, level) => {
            const pool = UV_TRICKS.filter((t) => t.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (t) => t.e);
            if (rng.chance(0.5)) {
              return {
                prompt: 'Which image does this produce?',
                code: `col = texture2D(uTex, ${ans.e}).rgb;`,
                options: opts.map((o) => ({ shader: trickSpec(o.e) })),
                explain: `<p><code>${ans.e}</code> → ${ans.say}. Tip: check which part of the F lands in the bottom-left corner (uv 0,0).</p>`,
              };
            }
            return {
              prompt: 'Which coordinates made this image? (original: yellow F, red dot bottom-right)',
              shader: trickSpec(ans.e),
              options: opts.map((o) => ({ code: `texture2D(uTex, ${o.e})` })),
              explain: `<p>It's <code>${ans.e}</code> → ${ans.say}.</p>`,
            };
          },
        },
        {
          id: 'texel-index', title: 'uv ↔ texel', engine: 'numeric', rounds: 6,
          blurb: 'Convert between uv and texel numbers.',
          gen: (rng, level) => {
            if (level < 3 || rng.chance(0.4)) {
              const size = level === 1 ? rng.pick([4, 8, 10]) : rng.pick([64, 256, 512, 1024]);
              // pick coordinates that are clearly inside a texel (never on a border)
              const pickUv = () => {
                for (let k = 0; k < 50; k++) {
                  const x = level === 1 ? +((rng.int(0, size - 1) + rng.pick([0.3, 0.5, 0.7])) / size).toFixed(3) : r2(rng.float(0.05, 0.95));
                  const fr = x * size - Math.floor(x * size);
                  if (fr > 0.15 && fr < 0.85) return x;
                }
                return (0.5 + Math.floor(size / 3)) / size;
              };
              const ui = pickUv(), vi = pickUv();
              const ans = [Math.floor(ui * size), Math.floor(vi * size)];
              return {
                prompt: `A <b>${size}×${size}</b> texture is sampled at <b>uv = (${ui}, ${vi})</b>. Which texel (x, y)?`,
                code: `vec2 texel = floor(uv * ${f(size)});`,
                answer: ans, wrap: 'vec2', labels: ['x', 'y'], tolerance: 0.01,
                explain: `<p>(${ui} × ${size}, ${vi} × ${size}) = (${r2(ui * size)}, ${r2(vi * size)}) → floor → <b>(${ans[0]}, ${ans[1]})</b>. Texel 0 is the first one, so a ${size}-wide texture has texels 0..${size - 1}.</p>`,
              };
            }
            const size = rng.pick([4, 8]);
            const tx = rng.int(0, size - 1), ty = rng.int(0, size - 1);
            const ans = [(tx + 0.5) / size, (ty + 0.5) / size];
            return {
              prompt: `In a <b>${size}×${size}</b> texture, what uv hits the <b>centre</b> of texel (${tx}, ${ty})?`,
              sub: 'Texel x covers uv from x/size to (x+1)/size.',
              answer: ans, wrap: 'vec2', labels: ['u', 'v'], tolerance: 0.011,
              explain: `<p>Centre = (texel + 0.5) / size = (${tx + 0.5}/${size}, ${ty + 0.5}/${size}) = <b>(${n3(ans[0])}, ${n3(ans[1])})</b>. Sampling exactly at texel centres gives the texel's pure colour even with linear filtering.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== TILING & OFFSET
    {
      id: 'textures.tiling',
      title: 'Tiling & offset',
      blurb: 'uv * tiling + offset — the maths behind the material Tiling/Offset fields.',
      lesson: [
        {
          title: 'Tiling = multiply',
          body: `<p><code>uv * 3.0</code> runs from 0 to 3. With a repeating texture, every whole number starts the image again → <b>3 copies</b> across.</p>
<p>So a <b>bigger</b> tiling number gives <b>more, smaller</b> copies. (A common mix-up: it feels like "×3 = bigger", but it's ×3 the coordinate range.)</p>`,
          controls: [
            { name: 'x', label: 'tiling.x', min: 0.5, max: 5, step: 0.5, value: 2 },
            { name: 'y', label: 'tiling.y', min: 0.5, max: 5, step: 0.5, value: 2 },
          ],
          shader: (v) => ({ frag: 'col = texture2D(uTex, uv * uT).rgb;', textures: { uTex: 'letterF' }, uniforms: { uT: [v.x, v.y] } }),
          code: (v) => `col = texture2D(uTex, uv * vec2(${f(v.x, 1)}, ${f(v.y, 1)})).rgb;\n// uv.x now runs 0 → ${v.x}: ${v.x} cop${v.x === 1 ? 'y' : 'ies'} across`,
          after: '<div class="analogy">🧱 Like wallpaper: "tile 3 times across the wall" means each roll is a third as wide.</div>',
        },
        {
          title: 'Offset = add (and it goes the "wrong" way)',
          body: `<p><code>uv + 0.25</code> makes every pixel read from <b>a bit further right</b> in the image. The pixel on the left edge now shows what used to be a quarter in.</p>
<p>Result: the picture appears to slide <b>left</b>. Positive offset moves the image in the <b>negative</b> direction.</p>`,
          controls: [
            { name: 'x', label: 'offset.x', min: -1, max: 1, step: 0.05, value: 0.25 },
            { name: 'y', label: 'offset.y', min: -1, max: 1, step: 0.05, value: 0 },
          ],
          shader: (v) => ({ frag: 'col = texture2D(uTex, uv + uO).rgb;', textures: { uTex: 'letterF' }, uniforms: { uO: [v.x, v.y] } }),
          code: (v) => `col = texture2D(uTex, uv + vec2(${f(v.x, 2)}, ${f(v.y, 2)})).rgb;\n// left-edge pixel reads u = ${n3(v.x)}`,
          quiz: { q: 'You add 0.1 to uv.y. The image moves…', options: ['Down', 'Up', 'Right'], answer: 0, explain: 'Each pixel reads from 0.1 higher in the image → the content appears 0.1 lower.' },
        },
        {
          title: 'Order matters',
          body: `<p>Unity's <b>Tiling And Offset</b> node and the material Tiling/Offset fields compute <code>uv * tiling + offset</code>. The offset is then in <b>tile</b> units: 0.5 = half a tile.</p>
<p>If you add first, <code>(uv + offset) * tiling</code>, the offset gets multiplied too: 0.5 × 3 = 1.5 tiles.</p>`,
          controls: [
            { name: 't', label: 'tiling', min: 1, max: 4, step: 1, value: 3 },
            { name: 'o', label: 'offset.x', min: 0, max: 1, step: 0.05, value: 0.5 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv * uT + vec2(uO, 0.0)).rgb;', textures: { uTex: 'letterF' }, uniforms: { uT: v.t, uO: v.o } }), label: 'uv * T + O' },
            { spec: (v) => ({ frag: 'col = texture2D(uTex, (uv + vec2(uO, 0.0)) * uT).rgb;', textures: { uTex: 'letterF' }, uniforms: { uT: v.t, uO: v.o } }), label: '(uv + O) * T' },
          ],
          code: (v) => `uv * ${f(v.t)} + ${f(v.o, 2)}     // shifts ${n3(v.o)} tiles\n(uv + ${f(v.o, 2)}) * ${f(v.t)}   // shifts ${n3(v.o * v.t)} tiles`,
        },
        {
          title: 'Scrolling: offset over time',
          body: `<p>Make the offset grow with time: <code>uv + uTime * speed</code>. The texture slides forever — conveyor belts, lava, waterfalls, clouds.</p>`,
          controls: [
            { name: 'x', label: 'speed.x', min: -1, max: 1, step: 0.05, value: 0.2 },
            { name: 'y', label: 'speed.y', min: -1, max: 1, step: 0.05, value: 0 },
          ],
          shader: (v) => ({ frag: 'col = texture2D(uTex, uv * 2.0 + uS * uTime).rgb;', textures: { uTex: 'brick' }, uniforms: { uS: [v.x, v.y] } }),
          code: (v) => `col = texture2D(uTex, uv * 2.0 + vec2(${f(v.x, 2)}, ${f(v.y, 2)}) * uTime).rgb;\n// positive speed.x → bricks move LEFT`,
          after: '<div class="tip">💡 Unreal: the <b>Panner</b> node does exactly <code>uv + time * speed</code>. Unity: Tiling And Offset with Time × speed plugged into Offset.</div>',
        },
        {
          title: 'Scaling around the centre',
          body: `<p>Multiplying scales around uv <b>(0,0)</b> — the bottom-left corner. To zoom around the centre, move the centre to 0 first, scale, then move back:</p>
<pre class="code">vec2 q = (uv - 0.5) * T + 0.5;</pre>
<p>Same trick as rotating/scaling shapes in the Transforms topic.</p>`,
          controls: [{ name: 't', label: 'T', min: 0.3, max: 3, step: 0.05, value: 0.5 }],
          shaders: [
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv * uT).rgb;', textures: { uTex: 'smiley' }, uniforms: { uT: v.t } }), label: 'uv * T' },
            { spec: (v) => ({ frag: 'col = texture2D(uTex, (uv - 0.5) * uT + 0.5).rgb;', textures: { uTex: 'smiley' }, uniforms: { uT: v.t } }), label: '(uv − 0.5) * T + 0.5' },
          ],
          quiz: { q: 'Which shows the middle of the image 2× zoomed in?', options: ['(uv - 0.5) * 0.5 + 0.5', '(uv - 0.5) * 2.0 + 0.5', 'uv * 0.5'], answer: 0, explain: 'Zoom IN = read a smaller range → multiply by 0.5. Centre it with −0.5 … +0.5. (uv * 0.5 zooms into the bottom-left corner.)' },
        },
      ],
      games: [
        {
          id: 'match-tiling', title: 'Tiling & offset matcher', engine: 'slider', rounds: 4,
          blurb: 'Set tiling and offset so your material matches the target.',
          gen: (rng, level) => {
            const tx = rng.int(1, 4), ty = level === 1 ? tx : rng.int(1, 4);
            const ox = level === 1 ? 0 : rng.step(0, 0.75, 0.25), oy = level === 3 ? rng.step(0, 0.75, 0.25) : 0;
            const params = level === 1 ? [{ name: 't', label: 'tiling', min: 1, max: 5, step: 1, target: tx }]
              : [{ name: 'tx', label: 'tiling.x', min: 1, max: 5, step: 1, target: tx }, { name: 'ty', label: 'tiling.y', min: 1, max: 5, step: 1, target: ty }, { name: 'ox', label: 'offset.x', min: 0, max: 1, step: 0.05, target: ox }];
            if (level === 3) params.push({ name: 'oy', label: 'offset.y', min: 0, max: 1, step: 0.05, target: oy });
            const vals = (p) => [p.tx ?? p.t, p.ty ?? p.t, p.ox ?? 0, p.oy ?? 0];
            return {
              prompt: level === 1 ? 'How many copies across? Set the tiling.' : 'Match tiling and offset.',
              sub: level === 1 ? '' : 'Offset is in tile units here (uv * T + O). An offset of 1.0 looks the same as 0.0!',
              params,
              build: (p) => { const [a, b, c, d] = vals(p); return { frag: 'col = texture2D(uTex, uv * uT + uO).rgb;', textures: { uTex: 'letterF' }, uniforms: { uT: [a, b], uO: [c, d] } }; },
              code: (p) => { const [a, b, c, d] = vals(p); return `col = texture2D(uTex, uv * vec2(${f(a)}, ${f(b)}) + vec2(${f(c, 2)}, ${f(d, 2)})).rgb;`; },
              compare: 'pixels',
              explain: '<p>Count copies along each edge for tiling. For offset, look at where the F starts: offset 0.25 moves every copy left by a quarter tile.</p>',
            };
          },
        },
        {
          id: 'tiling-uv', title: 'Which uv is read?', engine: 'numeric', rounds: 6,
          blurb: 'Compute uv * tiling + offset (and the wrapped result).',
          gen: (rng, level) => {
            const u = [rng.pick([0.1, 0.25, 0.5, 0.75]), rng.pick([0.2, 0.25, 0.5, 0.8])];
            const T = level === 1 ? [2, 2] : [rng.pick([2, 3, 4]), rng.pick([1, 2, 3])];
            const O = level === 1 ? [0, 0] : [rng.pick([0, 0.1, 0.25, 0.5]), rng.pick([0, 0.2, 0.5])];
            const raw = [u[0] * T[0] + O[0], u[1] * T[1] + O[1]];
            if (level === 3) {
              const w = raw.map((x) => +(x - Math.floor(x)).toFixed(4));
              return {
                prompt: `Pixel at <b>uv = (${u[0]}, ${u[1]})</b>. Wrap mode is repeat. Which point <i>inside</i> the texture (0..1) is read?`,
                code: `texture2D(uTex, uv * vec2(${f(T[0])}, ${f(T[1])}) + vec2(${f(O[0], 2)}, ${f(O[1], 2)}))`,
                answer: w, wrap: 'vec2',
                explain: `<p>uv × T + O = (${r2(raw[0])}, ${r2(raw[1])}). Repeat keeps only the part after the decimal point → <b>(${r2(w[0])}, ${r2(w[1])})</b>.</p>`,
              };
            }
            return {
              prompt: `Pixel at <b>uv = (${u[0]}, ${u[1]})</b>. What coordinates does it pass to texture2D?`,
              code: `texture2D(uTex, uv * vec2(${f(T[0])}, ${f(T[1])}) + vec2(${f(O[0], 2)}, ${f(O[1], 2)}))`,
              answer: raw.map((x) => +x.toFixed(4)), wrap: 'vec2',
              explain: `<p>(${u[0]} × ${T[0]} + ${O[0]}, ${u[1]} × ${T[1]} + ${O[1]}) = <b>(${r2(raw[0])}, ${r2(raw[1])})</b>. Multiply first, then add.</p>`,
            };
          },
        },
        {
          id: 'tiling-code', title: 'Image → tiling code', engine: 'mcq', rounds: 8,
          blurb: 'Pick the Tiling/Offset values that made the image.',
          gen: (rng, level) => {
            const mk = () => {
              const t = [rng.int(1, 4), level === 1 ? 0 : rng.int(1, 3)];
              if (level === 1) t[1] = t[0];
              const o = level === 1 ? [0, 0] : [rng.pick([0, 0.5]), level === 3 ? rng.pick([0, 0.5]) : 0];
              return { t, o };
            };
            const key = (x) => JSON.stringify(x);
            const ans = mk();
            const opts = distinct(rng, ans, mk, 4, key);
            const expr = (x) => x.o[0] || x.o[1] ? `uv * vec2(${f(x.t[0])}, ${f(x.t[1])}) + vec2(${f(x.o[0])}, ${f(x.o[1])})` : `uv * vec2(${f(x.t[0])}, ${f(x.t[1])})`;
            return {
              prompt: 'Which coordinates made this image?',
              shader: { frag: `col = texture2D(uTex, ${expr(ans)}).rgb;`, textures: { uTex: 'letterF' } },
              options: opts.map((o) => ({ code: expr(o) })),
              explain: '<p>Count F copies across (tiling.x) and up (tiling.y). An offset of 0.5 means each copy is cut in half at the edge.</p>',
            };
          },
        },
        {
          id: 'tiling-facts', title: 'Tiling: true or false?', engine: 'mcq', rounds: 6,
          blurb: 'Quick checks on tiling, offset and scrolling.',
          questions: [
            tf('Tiling 4 makes the texture appear 4× bigger.', false, 'It makes 4 copies across → each is 4× smaller.'),
            tf('Adding +0.2 to uv.x moves the image to the left.', true, 'Each pixel reads 0.2 further right → content shifts left.'),
            tf('uv * T + O: an offset of 0.5 shifts by half a tile, whatever T is.', true, 'Offset is added after the multiply, so it\'s in tile units.'),
            tf('Unreal\'s Panner node computes uv + time * speed.', true, 'Exactly — a scrolling offset.'),
            tf('uv * 2.0 scales the texture around the centre of the square.', false, 'It scales around (0,0), the bottom-left. Use (uv - 0.5) * 2.0 + 0.5 for the centre.'),
            tf('Tiling 0.5 shows only part of the texture, zoomed in.', true, 'uv only reaches 0.5 → you see the bottom-left quarter, stretched.', 2),
            tf('Tiling and offset need the texture to be re-imported.', false, 'They are just maths on uv in the shader — free to change at runtime.'),
            q('Which makes 3 copies across and 1 down?', ['uv * vec2(3.0, 1.0)', 'uv * vec2(1.0, 3.0)', 'uv + vec2(3.0, 1.0)', 'uv / vec2(3.0, 1.0)'], 'x tiling 3, y tiling 1.'),
            q('A texture should scroll upward at 0.1 uv per second. Offset?', ['vec2(0.0, -0.1) * uTime', 'vec2(0.0, 0.1) * uTime', 'vec2(0.1, 0.0) * uTime', 'vec2(0.0, 0.1)'], 'Image moves opposite to the offset, so subtract to move it up.', { level: 2 }),
            q('Material tiling (4, 4). How big is one copy, in uv?', ['0.25 × 0.25', '4 × 4', '1 × 1', '0.4 × 0.4'], '1 / 4 = 0.25 of the surface.', { level: 2 }),
          ],
        },
      ],
    },
    // ================================================================== WRAP MODES
    {
      id: 'textures.wrap',
      title: 'Wrap modes',
      blurb: 'What happens when uv goes outside 0..1: repeat, clamp or mirror.',
      lesson: [
        {
          title: 'Outside the image',
          body: `<p>When coordinates leave 0..1 — tiling, offsets, distortion — the GPU has to decide what's "out there". That rule is the texture's <b>wrap mode</b> (a sampler setting, not shader code).</p>
<p>Zoom out to see the three classic modes. The red square marks the original 0..1 area.</p>`,
          controls: [{ name: 'z', label: 'zoom out', min: 1, max: 4, step: 0.1, value: 2.5 }],
          shaders: ['repeat', 'clamp', 'mirror'].map((w) => ({
            spec: (v) => ({ frag: 'vec2 q = (uv - 0.5) * uZ + 0.5;\ncol = texture2D(uTex, q).rgb;\nvec2 e = abs(q - 0.5);\nfloat box = step(abs(max(e.x, e.y) - 0.5), 0.012 * uZ);\ncol = mix(col, vec3(1.0, 0.1, 0.2), box);', textures: { uTex: tex('letterF', 'linear', w) }, uniforms: { uZ: v.z } }),
            label: w,
          })),
          code: (v) => `vec2 q = (uv - 0.5) * ${f(v.z, 1)} + 0.5; // q runs ${n3(0.5 - v.z / 2)} → ${n3(0.5 + v.z / 2)}\ncol = texture2D(uTex, q).rgb;  // same code, 3 wrap settings`,
        },
        {
          title: 'The three rules as maths',
          body: `<p>Each mode is just a function applied to the coordinate before reading:</p>
<ul><li><b>Repeat</b>: <code>fract(x)</code> — sawtooth, starts over at each whole number.</li>
<li><b>Clamp</b>: <code>clamp(x, 0.0, 1.0)</code> — stops at the edge and stays there.</li>
<li><b>Mirror</b>: goes 0→1, then 1→0, then 0→1… — a ping-pong.</li></ul>
<p>The graph shows the coordinate you ask for (x axis) and the one actually read (y axis).</p>`,
          controls: [{ name: 'm', label: '0 repeat · 1 clamp · 2 mirror', min: 0, max: 2, step: 1, value: 0 }],
          graph: {
            fns: (v) => [{ f: WRAP[['repeat', 'clamp', 'mirror'][v.m]], label: ['repeat: fract(x)', 'clamp(x, 0, 1)', 'mirror'][v.m] }],
            opts: { xmin: -1, xmax: 3, ymin: -0.2, ymax: 1.2, xstep: 0.5 },
          },
          code: (v) => ['float r = fract(x);', 'float r = clamp(x, 0.0, 1.0);', 'float r = 1.0 - abs(mod(x, 2.0) - 1.0);'][v.m] + `\n// x = 1.25 → ${n3(WRAP[['repeat', 'clamp', 'mirror'][v.m]](1.25))}    x = -0.25 → ${n3(WRAP[['repeat', 'clamp', 'mirror'][v.m]](-0.25))}`,
        },
        {
          title: 'Clamp: stretched edges',
          body: `<p>With <b>clamp</b>, anything outside reads the <b>last row/column</b> of texels — you get long streaks.</p>
<p>Use it when the texture must <b>not</b> repeat: decals (a bullet hole shouldn't tile), UI images, colour lookup tables (LUTs), skybox faces, a single sprite.</p>
<div class="note">Bonus: with repeat + linear filtering, the top edge blends with the bottom edge (they're neighbours!). Clamp avoids that thin seam on non-tiling images.</div>`,
          controls: [{ name: 'o', label: 'offset', min: -0.5, max: 0.5, step: 0.01, value: 0.25 }],
          shaders: ['repeat', 'clamp'].map((w) => ({ spec: (v) => ({ frag: 'col = texture2D(uTex, uv + vec2(uO, uO * 0.6)).rgb;', textures: { uTex: tex('smiley', 'linear', w) }, uniforms: { uO: v.o } }), label: w })),
        },
        {
          title: 'Mirror: seamless by flipping',
          body: `<p><b>Mirror</b> flips every other copy. Neighbouring copies always meet at <b>matching</b> edges, so there's never a hard seam — even for a texture that wasn't made to tile.</p>
<p>The downside: obvious symmetry (a Rorschach / kaleidoscope look).</p>`,
          controls: [{ name: 't', label: 'tiling', min: 1, max: 4, step: 1, value: 2 }],
          shaders: ['repeat', 'mirror'].map((w) => ({ spec: (v) => ({ frag: 'col = texture2D(uTex, uv * uT).rgb;', textures: { uTex: tex('photo', 'linear', w) }, uniforms: { uT: v.t } }), label: w })),
          after: '<div class="tip">💡 Unity: texture import <b>Wrap Mode</b> (Repeat, Clamp, Mirror, Mirror Once), can differ per axis. Unreal: texture <b>X/Y-axis Tiling Method</b> (Wrap, Clamp, Mirror). In a shader you can fake any mode with the formulas from two slides ago.</div>',
          quiz: { q: 'You place a bullet-hole decal and see extra holes repeating around it. Fix?', options: ['Set the wrap mode to clamp', 'Set the wrap mode to mirror', 'Use nearest filtering'], answer: 0, explain: 'Clamp stops the texture from repeating outside 0..1.' },
        },
      ],
      games: [
        {
          id: 'which-wrap', title: 'Which wrap mode?', engine: 'mcq', rounds: 8,
          blurb: 'Look at the image and name the wrap mode.',
          gen: (rng, level) => {
            const w = rng.pick(['repeat', 'clamp', 'mirror']);
            const t = level === 1 ? 'letterF' : rng.pick(['letterF', 'smiley', 'photo', 'brick']);
            const z = level === 1 ? 3 : r2(rng.float(1.8, 3.2));
            const o = level === 3 ? [r2(rng.float(-0.6, 0.6)), r2(rng.float(-0.6, 0.6))] : [0, 0];
            return {
              prompt: 'The coordinates go outside 0..1. Which wrap mode is set?',
              code: `vec2 q = (uv - 0.5) * ${f(z, 2)} + 0.5${level === 3 ? ` + vec2(${f(o[0], 2)}, ${f(o[1], 2)})` : ''};\ncol = texture2D(uTex, q).rgb;`,
              shader: { frag: `vec2 q = (uv - 0.5) * ${f(z, 2)} + 0.5 + vec2(${f(o[0], 2)}, ${f(o[1], 2)});\ncol = texture2D(uTex, q).rgb;`, textures: { uTex: tex(t, 'linear', w) } },
              options: [{ repeat: 'Repeat', clamp: 'Clamp', mirror: 'Mirror' }[w], ...['Repeat', 'Clamp', 'Mirror'].filter((x) => x.toLowerCase() !== w)],
              grid: false,
              explain: '<p><b>Repeat</b>: identical copies side by side. <b>Clamp</b>: one copy, edges smeared outwards into streaks. <b>Mirror</b>: copies flipped so neighbours mirror each other.</p>',
            };
          },
        },
        {
          id: 'wrap-math', title: 'Wrap it by hand', engine: 'numeric', rounds: 6,
          blurb: 'Which coordinate is really read under repeat, clamp or mirror?',
          gen: (rng, level) => {
            const modes = level === 1 ? ['repeat', 'clamp'] : ['repeat', 'clamp', 'mirror'];
            const m = rng.pick(modes);
            const xs = level === 1 ? [1.25, 1.5, 2.75, -0.25, 1.2] : level === 2 ? [1.25, 1.75, 2.4, -0.25, -0.6, 3.1] : [2.25, 3.75, -1.25, -0.4, 4.6, 1.9];
            const x = rng.pick(xs);
            const ans = +WRAP[m](x).toFixed(4);
            const how = {
              repeat: `fract(${x}) = <b>${n3(ans)}</b> — keep what's after the decimal point${x < 0 ? ' (for negatives: ' + x + ' − floor(' + x + ') = ' + x + ' + ' + -Math.floor(x) + ')' : ''}.`,
              clamp: `clamp(${x}, 0, 1) = <b>${n3(ans)}</b> — anything past an edge sticks to that edge.`,
              mirror: `Mirror ping-pongs with period 2: 0→1 forward, 1→2 backward. ${x} → <b>${n3(ans)}</b>.`,
            }[m];
            return {
              prompt: `Wrap mode <b>${m}</b>. A shader asks for u = <b>${x}</b>. Which u (0..1) is actually read?`,
              answer: ans,
              explain: `<p>${how}</p>`,
            };
          },
        },
        {
          id: 'wrap-job', title: 'Pick the wrap mode', engine: 'buckets', rounds: 2,
          blurb: 'Choose the right wrap mode for each asset.',
          gen: () => ({
            prompt: 'Which wrap mode fits this asset?',
            buckets: ['🔁 Repeat', '📌 Clamp', '🪞 Mirror'],
            count: 10,
            items: [
              { text: 'Tiling brick wall', bucket: 0 },
              { text: 'Bullet-hole decal', bucket: 1, why: 'Must appear once — no copies around it.' },
              { text: 'Scrolling water normal map', bucket: 0 },
              { text: 'UI health bar image', bucket: 1 },
              { text: 'Colour-grading LUT', bucket: 1, why: 'A lookup table: reading past the ends must give the end values, not wrap round.' },
              { text: 'Grass ground texture', bucket: 0 },
              { text: 'Kaleidoscope effect', bucket: 2, why: 'Mirroring gives the symmetric look.' },
              { text: 'Non-tileable rock photo that must cover a big area without hard seams', bucket: 2, why: 'Mirrored copies meet at matching edges (but look symmetric).' },
              { text: 'Single sprite / character portrait', bucket: 1 },
              { text: 'Conveyor belt scrolling texture', bucket: 0 },
              { text: 'Skybox cube face', bucket: 1, why: 'Clamp avoids seams bleeding in from the opposite edge.' },
              { text: 'Fabric pattern on clothes', bucket: 0 },
              { text: 'Symmetric ornament from half an image', bucket: 2 },
            ],
          }),
        },
      ],
    },
    // ================================================================== FILTERING
    {
      id: 'textures.filter',
      title: 'Filtering & mipmaps',
      blurb: 'Nearest vs linear up close; mipmaps far away.',
      lesson: [
        {
          title: 'Between two texels',
          body: `<p>uv is continuous, texels are not. When a pixel asks for a spot <b>between</b> texel centres, what colour is it?</p>
<ul><li><b>Nearest</b> (point): take the closest texel → hard, pixelated blocks.</li>
<li><b>Linear</b> (bilinear): blend the 4 nearest texels → smooth, slightly blurry.</li></ul>
<p>Zoom in on the smiley's eye:</p>`,
          controls: [{ name: 'z', label: 'zoom window (uv size)', min: 0.02, max: 0.5, step: 0.01, value: 0.06 }],
          shaders: ['nearest', 'linear'].map((fl) => ({ spec: (v) => ({ frag: 'col = texture2D(uTex, vec2(0.36, 0.6) + (uv - 0.5) * uZ).rgb;', textures: { uTex: tex('smiley', fl) }, uniforms: { uZ: v.z } }), label: fl })),
          code: (v) => `// about ${Math.round(v.z * 256)} texels across this view\ncol = texture2D(uTex, vec2(0.36, 0.6) + (uv - 0.5) * ${f(v.z, 2)}).rgb;`,
        },
        {
          title: 'Linear = blend of neighbours',
          body: `<p>In 1D: texels sit at their centres. <b>Nearest</b> holds each value (a staircase). <b>Linear</b> draws straight lines between neighbouring centres.</p>
<p>Sound familiar? It's the same as <b>value noise</b> — random values on a grid, blended. (In 2D: 4 texels, blended along x then y.)</p>`,
          controls: [{ name: 'm', label: '0 nearest · 1 linear', min: 0, max: 1, step: 1, value: 1 }],
          graph: {
            fns: (v) => {
              const T = [0.2, 0.9, 0.4, 0.6, 0.1, 0.8, 0.5, 0.3];
              const at = (i) => T[Math.min(7, Math.max(0, i))];
              return [{ f: (x) => { if (!v.m) return at(Math.floor(x)); const p = x - 0.5, i = Math.floor(p), t = p - i; return at(i) + (at(i + 1) - at(i)) * t; }, label: v.m ? 'linear' : 'nearest' }];
            },
            opts: { xmin: 0, xmax: 8, ymin: -0.05, ymax: 1.05, xstep: 1, points: [0.2, 0.9, 0.4, 0.6, 0.1, 0.8, 0.5, 0.3].map((y, i) => ({ x: i + 0.5, y, color: '#ff7ab2', r: 4 })) },
          },
          after: '<div class="note">Exactly halfway between two texel centres, linear gives their <b>average</b>. A quarter of the way gives 75% of the near one + 25% of the far one.</div>',
        },
        {
          title: 'Far away: too many texels per pixel',
          body: `<p>Now the opposite problem. Squash a detailed texture into few pixels (far away, or high tiling). Each screen pixel covers <b>many texels</b>, but samples only one spot → it picks black or white almost at random. Result: <b>shimmering, moiré patterns</b> = <b>aliasing</b>.</p>
<p>Increase the tiling of these fine stripes:</p>`,
          controls: [{ name: 't', label: 'tiling', min: 0.5, max: 30, step: 0.5, value: 14 }],
          shaders: ['linear', 'mipmap'].map((fl) => ({ spec: (v) => ({ frag: 'col = texture2D(uTex, uv * uT).rgb;', textures: { uTex: tex('stripes', fl) }, uniforms: { uT: v.t } }), label: fl === 'mipmap' ? 'with mipmaps' : 'linear, no mipmaps' })),
          code: (v) => `// stripes texture: 32 black/white pairs\ncol = texture2D(uTex, uv * ${f(v.t, 1)}).rgb;\n// → ${Math.round(32 * v.t)} stripe pairs squeezed into a few hundred pixels`,
        },
        {
          title: 'Mipmaps: pre-shrunk copies',
          body: `<p>Fix: store smaller, pre-averaged versions of the texture: 256 → 128 → 64 → … → 1 texel. These are <b>mipmaps</b>.</p>
<p>The GPU measures how fast uv changes from one pixel to the next and picks the level where <b>1 texel ≈ 1 pixel</b>. Far away → small, already-blurred level → no shimmer.</p>
<div class="note">Cost: only +33% memory (¼ + 1/16 + … ≈ ⅓). Bonus: small mips are faster to read (better cache use).</div>`,
          visual: (el) => {
            const src = textureCanvas('photo');
            const row = h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '6px', justifyContent: 'center', margin: '8px 0' } });
            for (const s of [128, 64, 32, 16, 8, 4]) {
              const c = h('canvas'); c.width = c.height = s;
              const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, s, s);
              const shown = Math.max(12, s * 0.75);
              c.style.width = c.style.height = shown + 'px'; c.style.imageRendering = 'pixelated'; c.style.borderRadius = '3px';
              row.append(h('div', { style: { textAlign: 'center' } }, c, h('div.small.dim', String(s * 2))));
            }
            el.append(row, h('div.small.dim.center', 'mip levels of a 256² texture (256, 128, 64, …)'));
          },
        },
        {
          title: 'Mipmaps in 3D',
          body: `<p>The classic case: a tiled floor going into the distance. Far away, the stripes become noise without mipmaps. With mipmaps they fade smoothly to grey (the average).</p>
<p>(<b>Trilinear</b> = also blending between two mip levels. <b>Anisotropic</b> filtering = extra samples along the squashed direction, sharper floors at grazing angles.)</p>`,
          shaders: ['linear', 'mipmap'].map((fl) => ({ spec: { mesh: 'plane', frag: 'col = texture2D(uTex, uv * 16.0).rgb;', textures: { uTex: tex('checker', fl) }, camera: { yaw: 0.3, pitch: 0.14, dist: 1.25 } }, label: fl === 'mipmap' ? 'with mipmaps' : 'no mipmaps' })),
          after: '<div class="tip">💡 Pixel art, ID maps and lookup data → <b>nearest</b>, no mipmaps (you need exact texel values). Surfaces in 3D → <b>linear + mipmaps</b> (Unity "Trilinear", Unreal default). UI textures shown at 1:1 often skip mipmaps.</div>',
          quiz: { q: 'A far-away tiled floor shimmers when the camera moves. Most likely fix?', options: ['Enable mipmaps', 'Use nearest filtering', 'Increase tiling'], answer: 0, explain: 'Shimmer at a distance = minification aliasing. Mipmaps pre-average the texels.' },
        },
      ],
      games: [
        {
          id: 'which-filter', title: 'Which filter?', engine: 'mcq', rounds: 8,
          blurb: 'Nearest, linear or mipmapped? Read it from the image.',
          gen: (rng, level) => {
            const close = level === 1 || rng.chance(0.5);
            if (close) {
              const fl = rng.pick(['nearest', 'linear']);
              const t = rng.pick(['smiley', 'letterF', 'photo']);
              const c = [r2(rng.float(0.3, 0.7)), r2(rng.float(0.3, 0.7))];
              const z = level === 1 ? 0.06 : r2(rng.float(0.08, 0.2));
              return {
                prompt: 'This texture is magnified (zoomed in a lot). Which filter mode?',
                shader: { frag: `col = texture2D(uTex, vec2(${f(c[0], 2)}, ${f(c[1], 2)}) + (uv - 0.5) * ${f(z, 2)}).rgb;`, textures: { uTex: tex(t, fl) } },
                options: fl === 'nearest' ? ['Nearest', 'Linear'] : ['Linear', 'Nearest'],
                grid: true,
                explain: '<p><b>Nearest</b>: hard-edged square blocks (each texel is one flat colour). <b>Linear</b>: soft blurry gradients between texels.</p>',
              };
            }
            const T = r2(rng.float(10, 18));
            const t = rng.pick(['stripes', 'checker']);
            const spec = (fl) => ({ frag: `col = texture2D(uTex, uv * ${f(T, 2)}).rgb; // ${fl}`, textures: { uTex: tex(t, fl) } });
            return {
              prompt: 'The texture is minified (tiled down small). Which image uses <b>mipmaps</b>?',
              code: `col = texture2D(uTex, uv * ${f(T, 2)}).rgb;`,
              options: [{ shader: spec('mipmap') }, { shader: spec('linear') }],
              explain: '<p>Without mipmaps, each pixel samples one random spot of a tiny pattern → moiré / noisy aliasing. With mipmaps, it reads a pre-averaged level → smooth, mostly grey.</p>',
            };
          },
        },
        {
          id: 'bilinear-math', title: 'Bilinear by hand', engine: 'numeric', rounds: 6,
          blurb: 'Blend texels like the GPU does — and count mip levels.',
          gen: (rng, level) => {
            const kind = level === 1 ? 'lin1' : level === 2 ? rng.pick(['lin1', 'lin2', 'near']) : rng.pick(['lin2', 'mips', 'mipsize']);
            if (kind === 'near' || kind === 'lin1') {
              const a = rng.pick([0, 0.2, 0.4]), b = rng.pick([0.8, 1, 0.6]);
              const t = rng.pick([0.25, 0.5, 0.75]);
              const near = kind === 'near';
              const ans = near ? (t < 0.5 ? a : b) : a + (b - a) * t;
              if (near && t === 0.5) return { prompt: `Two neighbouring texels: <b>${a}</b> and <b>${b}</b>. With <b>linear</b> filtering, what's read exactly halfway between their centres?`, answer: (a + b) / 2, explain: `<p>Halfway = the average: (${a} + ${b}) / 2 = <b>${n3((a + b) / 2)}</b>.</p>` };
              return {
                prompt: `Two neighbouring texels: left <b>${a}</b>, right <b>${b}</b>. The sample point is <b>${t * 100}%</b> of the way from the left centre to the right centre. With <b>${near ? 'nearest' : 'linear'}</b> filtering, what value is read?`,
                answer: +ans.toFixed(4),
                explain: near ? `<p>Nearest picks the closer texel: ${t < 0.5 ? 'the left one' : 'the right one'} → <b>${ans}</b>.</p>` : `<p>mix(${a}, ${b}, ${t}) = ${a} + (${b} − ${a}) × ${t} = <b>${n3(ans)}</b>.</p>`,
              };
            }
            if (kind === 'lin2') {
              const c = [rng.pick([0, 0.2, 0.4]), rng.pick([0.4, 0.8, 1]), rng.pick([0, 0.6, 1]), rng.pick([0.2, 0.4, 0.8])];
              const tx = rng.pick([0.5, 0.25, 0.75]), ty = rng.pick([0.5, 0.25, 0.75]);
              const bottom = c[0] + (c[1] - c[0]) * tx, top = c[2] + (c[3] - c[2]) * tx;
              const ans = bottom + (top - bottom) * ty;
              return {
                prompt: `Four texels: bottom-left <b>${c[0]}</b>, bottom-right <b>${c[1]}</b>, top-left <b>${c[2]}</b>, top-right <b>${c[3]}</b>. Sample at fraction (${tx}, ${ty}) between their centres. Bilinear result?`,
                code: 'float bottom = mix(BL, BR, f.x);\nfloat top    = mix(TL, TR, f.x);\nfloat result = mix(bottom, top, f.y);',
                answer: +ans.toFixed(4),
                explain: `<p>bottom = ${n3(bottom)}, top = ${n3(top)}, result = mix(${n3(bottom)}, ${n3(top)}, ${ty}) = <b>${n3(ans)}</b>. Same as value noise, but with plain (linear) t.</p>`,
              };
            }
            if (kind === 'mips') {
              const s = rng.pick([64, 128, 256, 512, 1024]);
              const lv = Math.log2(s) + 1;
              return { prompt: `A <b>${s}×${s}</b> texture has a full mip chain down to 1×1. How many levels in total (including the original)?`, answer: lv, explain: `<p>${Array.from({ length: lv }, (_, i) => s >> i).join(', ')} → <b>${lv}</b> levels.</p>` };
            }
            const s = rng.pick([512, 1024, 2048]), L = rng.int(1, 4);
            return { prompt: `A <b>${s}×${s}</b> texture. How wide is mip level <b>${L}</b>? (level 0 = original)`, answer: s >> L, explain: `<p>Each level halves: ${s} / 2^${L} = <b>${s >> L}</b>.</p>` };
          },
        },
        {
          id: 'filter-job', title: 'Nearest or smooth?', engine: 'buckets', rounds: 2,
          blurb: 'Pick the filtering for each texture.',
          gen: () => ({
            prompt: 'Which filtering suits this texture?',
            buckets: ['🟥 Nearest, no mips', '🌫️ Linear + mipmaps'],
            count: 10,
            items: [
              { text: 'Pixel-art character sprite', bucket: 0 },
              { text: 'Grass albedo on a big terrain', bucket: 1 },
              { text: 'Object-ID map (each colour = an id)', bucket: 0, why: 'Blending two ids gives a meaningless third id.' },
              { text: 'Brick wall normal map', bucket: 1 },
              { text: 'Retro low-res game screen upscaled 4×', bucket: 0 },
              { text: 'Tiled floor going into the distance', bucket: 1, why: 'Distance → minification → needs mips.' },
              { text: 'Tile index map for a tilemap shader', bucket: 0, why: 'Indices must be read exactly.' },
              { text: 'Rock roughness mask', bucket: 1 },
              { text: 'Cloud texture on the sky', bucket: 1 },
              { text: 'Minecraft-style block textures', bucket: 0 },
              { text: 'Wood planks on a 3D table', bucket: 1 },
              { text: 'Data texture storing particle positions', bucket: 0, why: 'Data, not an image: you want exact values.' },
            ],
          }),
        },
      ],
    },
    // ================================================================== DISTORTION
    {
      id: 'textures.distort',
      title: 'UV distortion',
      blurb: 'Nudge the uv before sampling: wobbles, heat haze, water.',
      lesson: [
        {
          title: 'Bend the lookup',
          body: `<p>Same trick as domain warping: instead of reading at <code>uv</code>, read at <code>uv + offset</code>, where the offset is <b>different for each pixel</b>.</p>
<p>Here each row is pushed sideways by a sine wave of its height. Increase the amplitude:</p>`,
          controls: [{ name: 'a', label: 'amplitude', min: 0, max: 0.1, step: 0.002, value: 0.02 }],
          shader: (v) => ({ frag: 'vec2 q = uv;\nq.x += uA * sin(uv.y * 30.0);\ncol = texture2D(uTex, q).rgb;', textures: { uTex: 'checker' }, uniforms: { uA: v.a } }),
          code: (v) => `vec2 q = uv;\nq.x += ${f(v.a, 3)} * sin(uv.y * 30.0); // push sideways\ncol = texture2D(uTex, q).rgb;`,
          after: '<div class="note">The amplitude is in uv units: 0.01 = 1% of the texture width (≈ 2.5 texels of a 256² texture). Real effects usually use small values.</div>',
        },
        {
          title: 'Water wobble: add time',
          body: `<p>Put <code>uTime</code> inside the sine and the wave travels → an underwater / dream wobble. Frequency = how many waves; speed = how fast they move.</p>`,
          controls: [
            { name: 'a', label: 'amplitude', min: 0, max: 0.05, step: 0.001, value: 0.01 },
            { name: 'fr', label: 'frequency', min: 2, max: 60, step: 1, value: 20 },
            { name: 's', label: 'speed', min: 0, max: 6, step: 0.1, value: 2 },
          ],
          shader: (v) => ({ frag: 'vec2 q = uv;\nq.x += uA * sin(uv.y * uF + uTime * uS);\nq.y += uA * cos(uv.x * uF * 0.8 + uTime * uS);\ncol = texture2D(uTex, q).rgb;', textures: { uTex: 'photo' }, uniforms: { uA: v.a, uF: v.fr, uS: v.s } }),
          code: (v) => `q.x += ${f(v.a, 3)} * sin(uv.y * ${f(v.fr)} + uTime * ${f(v.s, 1)});\nq.y += ${f(v.a, 3)} * cos(uv.x * ${f(v.fr * 0.8, 1)} + uTime * ${f(v.s, 1)});`,
        },
        {
          title: 'Heat haze: noise offsets',
          body: `<p>Sine waves look regular. For <b>heat haze</b> or rippling glass, use <b>noise</b> as the offset — organic, not repetitive. Remember to centre it (<code>- 0.5</code>) so it pushes both ways.</p>
<p>Engines usually read a <b>noise texture</b> for this (cheaper than maths) and scroll it with time.</p>`,
          controls: [{ name: 'a', label: 'strength', min: 0, max: 0.06, step: 0.001, value: 0.015 }],
          shader: (v) => ({ frag: 'vec2 n = texture2D(uNoise, uv * 1.5 + vec2(0.0, -uTime * 0.15)).rg;\nvec2 q = uv + (n - 0.5) * uA * 2.0;\ncol = texture2D(uTex, q).rgb;', textures: { uTex: 'photo', uNoise: 'noise' }, uniforms: { uA: v.a } }),
          code: (v) => `// scroll a noise texture upward (hot air rises)\nvec2 n = texture2D(uNoise, uv * 1.5 + vec2(0.0, -uTime * 0.15)).rg;\nvec2 q = uv + (n - 0.5) * ${f(v.a * 2, 3)};\ncol = texture2D(uTex, q).rgb;`,
          after: '<div class="tip">💡 Unreal: <b>Panner</b> → noise Texture Sample → multiply by a small value → <b>Add</b> to TexCoord → main Texture Sample. In Unity Shader Graph the same chain with Tiling And Offset. For screen-space haze, the distorted texture is the <b>scene colour</b> (see Post-processing).</div>',
        },
        {
          title: 'Watch the edges',
          body: `<p>Distortion can push uv outside 0..1 near the borders. With <b>repeat</b>, the opposite edge leaks in. With <b>clamp</b>, edge texels stretch a little — usually much less noticeable.</p>`,
          controls: [{ name: 'a', label: 'amplitude', min: 0, max: 0.15, step: 0.005, value: 0.08 }],
          shaders: ['repeat', 'clamp'].map((w) => ({ spec: (v) => ({ frag: 'vec2 q = uv + uA * vec2(sin(uv.y * 12.0), cos(uv.x * 12.0));\ncol = texture2D(uTex, q).rgb;', textures: { uTex: tex('smiley', 'linear', w) }, uniforms: { uA: v.a } }), label: w })),
          quiz: { q: 'A distortion should make a texture wobble left/right only. Which line?', options: ['q.x += 0.02 * sin(uv.y * 20.0);', 'q.y += 0.02 * sin(uv.y * 20.0);', 'q += 0.02;'], answer: 0, explain: 'Changing q.x moves content sideways; making it depend on uv.y gives a different push per row → a wave.' },
        },
      ],
      games: [
        {
          id: 'match-wobble', title: 'Match the wobble', engine: 'slider', rounds: 4,
          blurb: 'Tune amplitude and frequency of a sine distortion.',
          gen: (rng, level) => {
            const a = rng.step(0.01, 0.06, 0.01), fr = rng.step(10, 40, 5), b = rng.step(0, 0.04, 0.01);
            const params = [{ name: 'a', label: 'amplitude (x push)', min: 0, max: 0.08, step: 0.002, target: a }];
            if (level >= 2) params.push({ name: 'fr', label: 'frequency', min: 5, max: 45, step: 1, target: fr });
            if (level === 3) params.push({ name: 'b', label: 'amplitude (y push)', min: 0, max: 0.06, step: 0.002, target: b });
            const vals = (p) => [p.a, p.fr ?? 25, p.b ?? 0];
            return {
              prompt: level === 1 ? 'How strong is the sideways wobble?' : level === 2 ? 'Match amplitude and frequency (count the waves).' : 'Match both pushes and the frequency.',
              params,
              build: (p) => { const [x, y, z] = vals(p); return { frag: 'vec2 q = uv;\nq.x += uA * sin(uv.y * uF);\nq.y += uB * sin(uv.x * uF);\ncol = texture2D(uTex, q).rgb;', textures: { uTex: 'checker' }, uniforms: { uA: x, uF: y, uB: z } }; },
              code: (p) => { const [x, y, z] = vals(p); return `q.x += ${f(x, 3)} * sin(uv.y * ${f(y)});\nq.y += ${f(z, 3)} * sin(uv.x * ${f(y)});`; },
              tolerance: 0.05,
              explain: '<p>Amplitude = how far the checker edges bend. Frequency = how many bends: sin(uv.y × F) completes F / 2π ≈ F / 6.3 waves from bottom to top.</p>',
            };
          },
        },
        {
          id: 'which-distort', title: 'Code → distortion', engine: 'mcq', rounds: 8,
          blurb: 'Pick the image a distortion line produces.',
          gen: (rng, level) => {
            const A = level === 3 ? rng.pick(['0.02', '0.05']) : '0.04';
            const pool = [
              { c: `q.x += ${A} * sin(uv.y * 30.0);`, lvl: 1 },
              { c: `q.y += ${A} * sin(uv.x * 30.0);`, lvl: 1 },
              { c: '// no distortion', lvl: 1 },
              { c: `q += (texture2D(uNoise, uv * 2.0).rg - 0.5) * ${A} * 3.0;`, lvl: 1 },
              { c: `q.x += ${A} * sin(uv.y * 10.0);`, lvl: 2 },
              { c: `q.x += ${A} * sin(uv.x * 30.0);`, lvl: 2 },
              { c: `q.y += ${A} * sin(uv.y * 30.0);`, lvl: 3 },
              { c: `q += ${A} * vec2(sin(uv.y * 30.0), sin(uv.x * 30.0));`, lvl: 3 },
            ].filter((x) => x.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.c);
            const spec = (c) => ({ frag: `vec2 q = uv;\n${c}\ncol = texture2D(uTex, q * 2.0).rgb;`, textures: { uTex: 'checker', uNoise: 'noise' } });
            return {
              prompt: 'Which image does this distortion make? (checker, tiled 2×)',
              code: `vec2 q = uv;\n${ans.c}\ncol = texture2D(uTex, q * 2.0).rgb;`,
              options: opts.map((o) => ({ shader: spec(o.c) })),
              explain: '<p>Which component changes = which direction lines bend (q.x → sideways, q.y → up/down). What the sine depends on = along which axis the wave travels. <code>sin(uv.x)</code> added to q.x just squashes/stretches columns — no wavy lines.</p>',
            };
          },
        },
        {
          id: 'distort-math', title: 'Where does it read?', engine: 'numeric', rounds: 6,
          blurb: 'Compute the distorted uv for one pixel.',
          gen: (rng, level) => {
            const F = level === 1 ? 1 : rng.pick([1, 2]);
            const table = F === 1 ? [[0, 0], [0.25, 1], [0.5, 0], [0.75, -1]] : [[0.125, 1], [0.25, 0], [0.375, -1], [0.625, 1], [0.875, -1]];
            const [y, s] = rng.pick(table);
            const A = rng.pick([0.02, 0.05, 0.1]);
            const x = rng.pick([0.3, 0.5, 0.6]);
            const ans = [+(x + A * s).toFixed(4), y];
            const t = level === 3 ? rng.pick([0, 0.25]) : 0;
            if (level === 3 && t) {
              // time shifts the phase by a quarter turn: sin(a + PI/2) = cos(a)
              const s2 = F === 1 ? { 0: 1, 0.25: 0, 0.5: -1, 0.75: 0 }[y] : { 0.125: 0, 0.25: -1, 0.375: 0, 0.625: 0, 0.875: 0 }[y];
              const ans2 = [+(x + A * s2).toFixed(4), y];
              return {
                prompt: `At <b>uTime = ${t}</b>, the pixel at <b>uv = (${x}, ${y})</b> reads which coordinates?`,
                code: `vec2 q = uv;\nq.x += ${f(A, 2)} * sin((uv.y * ${f(F)} + uTime) * TAU);`,
                answer: ans2, wrap: 'vec2',
                explain: `<p>Angle = (${y} × ${F} + ${t}) turns. sin of that = ${s2}. q.x = ${x} + ${A} × ${s2} = <b>${n3(ans2[0])}</b>; q.y unchanged.</p>`,
              };
            }
            return {
              prompt: `The pixel at <b>uv = (${x}, ${y})</b> reads which coordinates?`,
              sub: 'TAU = 2π, so sin(k * TAU) completes k full waves. sin(¼ turn) = 1, sin(½) = 0, sin(¾) = −1.',
              code: `vec2 q = uv;\nq.x += ${f(A, 2)} * sin(uv.y * ${f(F)} * TAU);`,
              answer: ans, wrap: 'vec2',
              explain: `<p>uv.y × ${F} = ${y * F} turns → sin = ${s}. q.x = ${x} + ${A} × ${s} = <b>${n3(ans[0])}</b>. q.y stays ${y}.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== CHANNEL PACKING
    {
      id: 'textures.packing',
      title: 'Channel packing',
      blurb: 'Four greyscale masks in one RGBA texture.',
      lesson: [
        {
          title: 'One texture, several masks',
          body: `<p>A greyscale mask only needs <b>one number</b> per texel. But a texture has <b>four</b> channels (R, G, B, A). So why not store a different mask in each?</p>
<p>This texture stores: <b>R</b> = circles, <b>G</b> = stripes, <b>B</b> = a vertical gradient. Look at it as RGB (a colourful mess) and channel by channel:</p>`,
          controls: [{ name: 'm', label: '0 RGB · 1 R · 2 G · 3 B', min: 0, max: 3, step: 1, value: 0 }],
          shader: (v) => ({ frag: 'vec4 m = texture2D(uMask, uv);\nif (uM < 0.5) col = m.rgb;\nelse if (uM < 1.5) col = vec3(m.r);\nelse if (uM < 2.5) col = vec3(m.g);\nelse col = vec3(m.b);', textures: { uMask: 'packed' }, uniforms: { uM: v.m } }),
          code: (v) => `vec4 m = texture2D(uMask, uv);\ncol = ${['m.rgb;   // all three at once: looks weird', 'vec3(m.r); // circles', 'vec3(m.g); // stripes', 'vec3(m.b); // gradient'][v.m]}`,
        },
        {
          title: 'Why tech artists pack',
          body: `<ul><li><b>Fewer texture reads</b>: one sample gives 4 masks instead of 4 samples.</li>
<li><b>Less memory</b> and fewer files: one RGBA instead of four greyscale textures (and fewer sampler slots — mobile GPUs have few).</li></ul>
<p>Classic packings:</p>
<ul><li>Unreal <b>ORM</b>: R = Ambient <b>O</b>cclusion, G = <b>R</b>oughness, B = <b>M</b>etallic.</li>
<li>Unity HDRP <b>Mask Map</b>: R = Metallic, G = AO, B = Detail mask, A = Smoothness.</li></ul>
<div class="note">Packed masks are <b>data</b>, not colour: import them as <b>linear</b> (turn off sRGB), or the values get bent by the gamma curve.</div>`,
          shader: { frag: 'vec4 m = texture2D(uMask, uv);\nvec2 c = floor(uv * 2.0);\nfloat k = c.x + c.y * 2.0;\nvec2 l = fract(uv * 2.0);\nvec4 m2 = texture2D(uMask, l);\nif (k < 0.5) col = vec3(m2.r) * vec3(1.0, 0.4, 0.4);\nelse if (k < 1.5) col = vec3(m2.g) * vec3(0.4, 1.0, 0.4);\nelse if (k < 2.5) col = m2.rgb;\nelse col = vec3(m2.b) * vec3(0.5, 0.6, 1.0);', textures: { uMask: 'packed' } },
          code: '// 1 texture = 3 masks  (top-left: all packed together)\n// bottom-left: R   bottom-right: G   top-right: B',
        },
        {
          title: 'Using the masks',
          body: `<p>Each channel drives something different. Here: <b>R</b> paints gold dots, <b>G</b> darkens stripes (like dirt), <b>B</b> fades in a blue tint towards the top.</p>
<p>All from a single <code>texture2D</code> call.</p>`,
          controls: [
            { name: 'r', label: 'gold (uses .r)', min: 0, max: 1, step: 0.05, value: 1 },
            { name: 'g', label: 'dirt (uses .g)', min: 0, max: 1, step: 0.05, value: 0.5 },
            { name: 'b', label: 'blue tint (uses .b)', min: 0, max: 1, step: 0.05, value: 0.6 },
          ],
          shader: (v) => ({ frag: 'vec4 m = texture2D(uMask, uv);\nvec3 c = vec3(0.55, 0.5, 0.45);\nc = mix(c, vec3(1.0, 0.78, 0.25), m.r * uR);\nc *= 1.0 - 0.7 * m.g * uG;\nc = mix(c, vec3(0.2, 0.4, 1.0), m.b * uB);\ncol = c;', textures: { uMask: 'packed' }, uniforms: { uR: v.r, uG: v.g, uB: v.b } }),
          code: (v) => `vec4 m = texture2D(uMask, uv);      // ONE read\nvec3 c = vec3(0.55, 0.5, 0.45);\nc = mix(c, gold, m.r * ${f(v.r, 2)});\nc *= 1.0 - 0.7 * m.g * ${f(v.g, 2)};\nc = mix(c, blue, m.b * ${f(v.b, 2)});`,
          after: '<div class="tip">💡 <code>.r .g .b .a</code> and <code>.x .y .z .w</code> are the same components with different names. <code>m.r == m.x</code>.</div>',
          quiz: { q: 'Your packed ORM texture has roughness in G. How do you read roughness?', options: ['texture2D(uORM, uv).g', 'texture2D(uORM, uv).r', 'texture2D(uORM, uv).rgb'], answer: 0, explain: 'O-R-M → R(ed)=Occlusion, G(reen)=Roughness, B(lue)=Metallic.' },
        },
        {
          title: 'Things that don\'t pack well',
          body: `<p>Packing works for <b>independent greyscale</b> data. It doesn't fit:</p>
<ul><li><b>Colour</b> (albedo, emissive colour): needs all 3 channels itself.</li>
<li><b>Normal maps</b>: need 2–3 channels (often just R and G, Z is rebuilt).</li>
<li>Masks needing <b>different resolutions</b> or different compression quality.</li></ul>
<p>And texture compression (BC/DXT, ASTC) can make channels <b>bleed</b> into each other a little — keep the most important mask in G (often stored at highest precision).</p>`,
        },
      ],
      games: [
        {
          id: 'which-channel', title: 'Which channel?', engine: 'mcq', rounds: 8,
          blurb: 'Match channel reads of the packed texture to images.',
          gen: (rng, level) => {
            const pool = [
              { c: 'vec3(m.r)', lvl: 1 }, { c: 'vec3(m.g)', lvl: 1 }, { c: 'vec3(m.b)', lvl: 1 },
              { c: 'vec3(1.0 - m.r)', lvl: 2 }, { c: 'vec3(1.0 - m.g)', lvl: 2 }, { c: 'vec3(1.0 - m.b)', lvl: 2 },
              { c: 'vec3(m.r * m.g)', lvl: 3 }, { c: 'vec3(m.r * m.b)', lvl: 3 }, { c: 'vec3(max(m.r, m.g))', lvl: 3 }, { c: 'vec3(m.g * m.b)', lvl: 3 },
            ].filter((x) => x.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), Math.min(4, pool.length), (x) => x.c);
            const spec = (c) => ({ frag: `vec4 m = texture2D(uMask, uv);\ncol = ${c};`, textures: { uMask: 'packed' } });
            const legend = 'Packed texture: R = circles, G = vertical stripes, B = bottom→top gradient.';
            if (rng.chance(0.5)) {
              return { prompt: 'Which image does this read produce?', sub: legend, code: `vec4 m = texture2D(uMask, uv);\ncol = ${ans.c};`, options: opts.map((o) => ({ shader: spec(o.c) })), explain: '<p>Each channel is its own greyscale image. <code>1.0 - x</code> inverts it; multiplying two masks keeps only where both are white (AND); max keeps where either is (OR).</p>' };
            }
            return { prompt: 'Which line made this image?', sub: legend, shader: spec(ans.c), options: opts.map((o) => ({ code: `col = ${o.c};` })), explain: '<p>Circles → R, stripes → G, gradient → B. Inverted = <code>1.0 - …</code>; combinations: × = both, max = either.</p>' };
          },
        },
        {
          id: 'use-mask', title: 'Wire up the mask', engine: 'codefill', rounds: 4,
          blurb: 'Pick the channel that drives each effect.',
          gen: (rng, level) => {
            const ch = ['r', 'g', 'b'];
            const [a, b, c] = rng.shuffle(ch.slice());
            const opts = ['r', 'g', 'b', 'a'];
            let template, slots;
            if (level === 1) {
              template = 'vec4 m = texture2D(uMask, uv);\ncol = mix(vec3(0.15, 0.1, 0.3), vec3(1.0, 0.75, 0.2), m.[[0]]);';
              slots = [{ options: [...opts, 'x'], answer: a }];
            } else if (level === 2) {
              template = 'vec4 m = texture2D(uMask, uv);\nvec3 c = mix(vec3(0.5), vec3(1.0, 0.75, 0.2), m.[[0]]);\nc *= 1.0 - 0.7 * m.[[1]];\ncol = c;';
              slots = [{ options: opts, answer: a }, { options: opts, answer: b }];
            } else {
              template = 'vec4 m = texture2D(uMask, uv);\nvec3 c = mix(vec3(0.5), vec3(1.0, 0.75, 0.2), m.[[0]]);\nc *= 1.0 - 0.7 * m.[[1]];\nc = mix(c, vec3(0.2, 0.4, 1.0), m.[[2]] * 0.8);\ncol = c;';
              slots = [{ options: opts, answer: a }, { options: opts, answer: b }, { options: opts, answer: c }];
            }
            const fill = (vals) => template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Pick the channels so your material matches the target:',
              sub: 'R = circles, G = vertical stripes, B = bottom→top gradient, A = 1 everywhere.',
              template, slots: noPeek(slots),
              build: (vals) => ({ frag: fill(vals), textures: { uMask: 'packed' } }),
              explain: '<p>Find each effect\'s <b>shape</b> in the target: gold where the circles are → .r; dark stripes → .g; blue towards the top → .b. (<code>.x</code> is just another name for <code>.r</code>.)</p>',
            };
          },
        },
        {
          id: 'pack-or-not', title: 'Pack it?', engine: 'buckets', rounds: 2,
          blurb: 'Can this map go in one channel of a packed texture?',
          gen: () => ({
            prompt: 'One channel enough (packable), or does it need several?',
            buckets: ['📦 1 channel — pack it', '🎨 Needs 2–3 channels'],
            count: 10,
            items: [
              { text: 'Roughness', bucket: 0 },
              { text: 'Metallic', bucket: 0 },
              { text: 'Ambient occlusion', bucket: 0 },
              { text: 'Albedo / base colour', bucket: 1, why: 'Colour needs R, G and B.' },
              { text: 'Normal map', bucket: 1, why: 'A direction: at least X and Y (2 channels).' },
              { text: 'Height / displacement', bucket: 0 },
              { text: 'Opacity mask', bucket: 0 },
              { text: 'Emissive colour', bucket: 1 },
              { text: 'Flow map (direction to scroll)', bucket: 1, why: 'A 2D direction → 2 channels (R, G).' },
              { text: 'Smoothness', bucket: 0 },
              { text: 'Dirt / grime mask', bucket: 0 },
              { text: 'Detail mask', bucket: 0 },
              { text: 'Tint colour per region', bucket: 1 },
            ],
          }),
        },
      ],
    },
    // ================================================================== FLIPBOOKS
    {
      id: 'textures.flipbook',
      title: 'Flipbooks & atlases',
      blurb: 'Many images in one texture: pick a cell with scale + offset.',
      lesson: [
        {
          title: 'Many pictures, one texture',
          body: `<p>An <b>atlas</b> packs many small images into one big texture. A <b>flipbook</b> (sprite sheet) is an atlas of animation frames — like a page of a comic.</p>
<p>This one is 4 × 4 = 16 frames, numbered 1 to 16, read left→right, top→bottom.</p>
<div class="analogy">📒 Like a flip book: show one drawing at a time, fast enough, and it moves. Fire, smoke and explosion particles do exactly this.</div>`,
          shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'flipbook' } },
        },
        {
          title: 'Show one cell: scale + offset',
          body: `<p>To show one frame, the pixel's uv (0..1) must map to one cell. Each cell is ¼ × ¼ of the texture, so:</p>
<pre class="code">vec2 q = uv * 0.25 + offset;  // offset = the cell's bottom-left corner</pre>
<p>That's just <b>tiling 0.25 + offset</b>! Pick a column and row (counted from the <b>bottom</b>, like uv).</p>`,
          controls: [
            { name: 'c', label: 'column (0 = left)', min: 0, max: 3, step: 1, value: 1 },
            { name: 'r', label: 'row from bottom (0 = bottom)', min: 0, max: 3, step: 1, value: 3 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv).rgb;\nvec2 c = floor(uv * 4.0);\nvec2 l = fract(uv * 4.0);\nfloat inC = step(abs(c.x - uC), 0.5) * step(abs(c.y - uR), 0.5);\nfloat e = step(min(min(l.x, l.y), min(1.0 - l.x, 1.0 - l.y)), 0.06);\ncol = mix(col * (0.4 + 0.6 * inC), vec3(1.0), e * inC);', textures: { uTex: 'flipbook' }, uniforms: { uC: v.c, uR: v.r } }), label: 'whole texture' },
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv * 0.25 + vec2(uC, uR) * 0.25).rgb;', textures: { uTex: 'flipbook' }, uniforms: { uC: v.c, uR: v.r } }), label: 'what the quad shows' },
          ],
          code: (v) => `vec2 offset = vec2(${v.c}.0, ${v.r}.0) * 0.25; // = (${n3(v.c * 0.25)}, ${n3(v.r * 0.25)})\nvec2 q = uv * 0.25 + offset;\n// → frame ${(3 - v.r) * 4 + v.c + 1}`,
          quiz: { q: 'Which offset shows frame 1 (top-left)?', options: ['(0.0, 0.75)', '(0.0, 0.0)', '(0.75, 0.0)'], answer: 0, explain: 'Left column → x = 0. Top row → y = 0.75, because uv.y counts from the bottom.' },
        },
        {
          title: 'Frame number → offset',
          body: `<p>Animation gives you a frame <b>index</b> i (0..15). Turn it into a column and row:</p>
<pre class="code">float col = mod(i, 4.0);        // 0,1,2,3,0,1,2,3,…
float row = floor(i / 4.0);     // 0,0,0,0,1,1,1,1,… (from the TOP)
vec2 offset = vec2(col, 3.0 - row) * 0.25;  // flip row: uv starts at the bottom</pre>
<p>Slide the index and follow the numbers.</p>`,
          controls: [{ name: 'i', label: 'frame index i', min: 0, max: 15, step: 1, value: 6 }],
          shader: (v) => ({ frag: 'float col_ = mod(uI, 4.0);\nfloat row = floor(uI / 4.0);\nvec2 off = vec2(col_, 3.0 - row) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + off).rgb;', textures: { uTex: 'flipbook' }, uniforms: { uI: v.i } }),
          code: (v) => { const c = v.i % 4, r = Math.floor(v.i / 4); return `i      = ${v.i}.0      (printed number ${v.i + 1})\ncol    = mod(${v.i}.0, 4.0)   = ${c}.0\nrow    = floor(${v.i}.0 / 4.0) = ${r}.0\noffset = vec2(${c}.0, 3.0 - ${r}.0) * 0.25 = (${n3(c * 0.25)}, ${n3((3 - r) * 0.25)})`; },
        },
        {
          title: 'Animate it',
          body: `<p>Frame index from time: <code>floor(mod(uTime * fps, 16.0))</code>. <code>floor</code> is important — without it you'd get offsets <i>between</i> frames (a sliding mess).</p>`,
          controls: [{ name: 'fps', label: 'frames per second', min: 1, max: 24, step: 1, value: 6 }],
          shader: (v) => ({ frag: 'float i = floor(mod(uTime * uF, 16.0));\nvec2 off = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + off).rgb;', textures: { uTex: 'flipbook' }, uniforms: { uF: v.fps } }),
          code: (v) => `float i = floor(mod(uTime * ${f(v.fps)}, 16.0)); // 0..15, ${v.fps} per second\nvec2 off = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + off).rgb;`,
          after: '<div class="tip">💡 Unity Shader Graph: <b>Flipbook</b> node (Width, Height, Tile; has an "Invert Y" option for exactly the row flip). Unreal: <b>SubUV</b> in Niagara / the <b>Flipbook</b> material function. Smooth playback: sample two frames and blend with <code>fract(uTime * fps)</code>. Watch for bleeding between cells with mipmaps — atlases need padding.</div>',
        },
      ],
      games: [
        {
          id: 'frame-offset', title: 'Frame → offset', engine: 'numeric', rounds: 6,
          blurb: 'Compute the uv offset of a frame in the sheet.',
          gen: (rng, level) => {
            if (level < 3) {
              const N = level === 1 ? rng.int(1, 4) + 4 * rng.pick([0, 3]) : rng.int(1, 16);
              const off = frameOffset(N);
              return {
                prompt: `4×4 flipbook (frame 1 top-left, reading like text). What offset shows <b>frame ${N}</b>?`,
                code: 'vec2 q = uv * 0.25 + offset;',
                shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'flipbook' } }, size: 170,
                answer: off, wrap: 'vec2',
                explain: `<p>Index i = ${N - 1}: column ${(N - 1) % 4}, row ${Math.floor((N - 1) / 4)} from the top. x = ${(N - 1) % 4} × 0.25 = ${off[0]}. y = (3 − ${Math.floor((N - 1) / 4)}) × 0.25 = ${off[1]} (rows count from the bottom in uv).</p>`,
              };
            }
            const g = rng.pick([2, 4, 8]);
            const i = rng.int(0, g * g - 1);
            const off = [(i % g) / g, 1 - (Math.floor(i / g) + 1) / g];
            return {
              prompt: `A <b>${g}×${g}</b> sheet, frames indexed from <b>0</b> at the top-left. Offset for index <b>i = ${i}</b>?`,
              code: `vec2 q = uv / ${f(g)} + offset;`,
              answer: off, wrap: 'vec2',
              explain: `<p>col = mod(${i}, ${g}) = ${i % g}, row = floor(${i} / ${g}) = ${Math.floor(i / g)}. offset = (${i % g} / ${g}, (${g - 1} − ${Math.floor(i / g)}) / ${g}) = <b>(${n3(off[0])}, ${n3(off[1])})</b>.</p>`,
            };
          },
        },
        {
          id: 'tap-frame', title: 'Which frame is shown?', engine: 'tap', rounds: 5,
          blurb: 'Read the offset code and tap the frame it displays.',
          gen: (rng, level) => {
            const i = rng.int(0, 15), c = i % 4, rTop = Math.floor(i / 4), rB = 3 - rTop;
            const code = level === 1 ? `col = texture2D(uTex, uv * 0.25 + vec2(${f(c * 0.25, 2)}, ${f(rB * 0.25, 2)})).rgb;`
              : level === 2 ? `float i = ${i}.0;\nvec2 off = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + off).rgb;`
                : (() => { const fps = rng.pick([4, 8, 10]); const t = +((i + 0.5) / fps).toFixed(3); const T = t + (rng.chance(0.5) ? 16 / fps : 0); return `// uTime = ${+T.toFixed(3)} s\nfloat i = floor(mod(uTime * ${f(fps)}, 16.0));\nvec2 off = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + off).rgb;`; })();
            return {
              prompt: 'Tap the frame this code displays:',
              code,
              shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'flipbook' } },
              score: (u, v) => (Math.floor(u * 4) === c && Math.floor(v * 4) === rB ? 1 : 0),
              target: [(c + 0.5) / 4, (rB + 0.5) / 4],
              explain: `<p>It's frame <b>${i + 1}</b> (index ${i}): column ${c}, ${rTop === 0 ? 'top row' : `row ${rTop} from the top`}. Offset = (${n3(c * 0.25)}, ${n3(rB * 0.25)}).${level === 3 ? ' uTime × fps → floor → mod 16 gives the index.' : ''}</p>`,
            };
          },
        },
        {
          id: 'match-frame', title: 'Find the frame', engine: 'slider', rounds: 4,
          blurb: 'Set the cell (or frame index) to show the target frame.',
          gen: (rng, level) => {
            const i = rng.int(0, 15), c = i % 4, rB = 3 - Math.floor(i / 4);
            if (level === 3) {
              return {
                prompt: 'Set the frame index i so the quad shows the target frame.',
                params: [{ name: 'i', label: 'frame index i', min: 0, max: 15, step: 1, target: i }],
                build: (p) => ({ frag: 'vec2 off = vec2(mod(uI, 4.0), 3.0 - floor(uI / 4.0)) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + off).rgb;', textures: { uTex: 'flipbook' }, uniforms: { uI: p.i } }),
                code: (p) => `float i = ${p.i}.0;\nvec2 off = vec2(mod(i, 4.0), 3.0 - floor(i / 4.0)) * 0.25;`,
                tolerance: 0.01,
                explain: `<p>The printed number is i + 1, so frame ${i + 1} needs i = <b>${i}</b>.</p>`,
              };
            }
            return {
              prompt: 'Set column and row so the quad shows the target frame.',
              sub: level === 1 ? 'Row counts from the BOTTOM (uv style): row 3 = the top row with frames 1–4.' : 'Row 0 is the bottom row.',
              params: [
                { name: 'c', label: 'column', min: 0, max: 3, step: 1, target: c },
                { name: 'r', label: 'row (from bottom)', min: 0, max: 3, step: 1, target: rB },
              ],
              build: (p) => ({ frag: 'col = texture2D(uTex, uv * 0.25 + uO * 0.25).rgb;', textures: { uTex: 'flipbook' }, uniforms: { uO: [p.c, p.r] } }),
              code: (p) => `vec2 offset = vec2(${p.c}.0, ${p.r}.0) * 0.25;\ncol = texture2D(uTex, uv * 0.25 + offset).rgb;`,
              tolerance: 0.01,
              explain: `<p>Frame ${i + 1}: column ${c}, row ${rB} from the bottom → offset (${n3(c * 0.25)}, ${n3(rB * 0.25)}).</p>`,
            };
          },
        },
        {
          id: 'atlas-facts', title: 'Atlas quiz', engine: 'mcq', rounds: 6,
          blurb: 'Concept checks on atlases and flipbooks.',
          questions: [
            q('In a 4×4 flipbook, how big is one frame in uv?', ['0.25 × 0.25', '4 × 4', '0.5 × 0.5', '1/16 × 1/16'], '1 / 4 along each axis.'),
            q('Why <code>3.0 - row</code> in the offset formula?', ['Frames are numbered from the top, but uv.y starts at the bottom', 'To make it animate backwards', 'Because there are 3 rows', 'GLSL indexes from 3'], 'Rows count down from the top; uv counts up from the bottom.'),
            q('What does <code>floor()</code> do in <code>floor(mod(uTime * fps, 16.0))</code>?', ['Snaps to whole frames so the offset jumps cell to cell', 'Makes the animation smoother', 'Loops the animation', 'Nothing important'], 'Without floor, the offset slides continuously between cells.'),
            q('What does <code>mod(…, 16.0)</code> do there?', ['Loops the animation back to frame 0 after 16 frames', 'Makes 16 copies', 'Picks the column', 'Slows it down'], 'mod wraps 0..∞ into 0..16.'),
            tf('An atlas lets many sprites share one texture and one draw call.', true, 'Fewer texture switches → better batching.'),
            tf('Mipmaps can make neighbouring atlas cells bleed into each other.', true, 'Small mips average across cell borders. Atlases need padding (gutter) between cells.', 2),
            tf('Frame index 5 in a 4×4 sheet is in the top row.', false, 'Indices 0–3 are the top row. 5 is in the second row (column 1).'),
            q('Offset (0.5, 0.25) in a 4×4 sheet shows which printed frame?', ['11', '7', '10', '6'], 'Column 2, row 1 from the bottom = row 2 from the top → index 2×4+2 = 10 → printed 11.', { level: 2 }),
            q('A smoke flipbook plays at 8 fps with 16 frames. How long is one loop?', ['2 seconds', '8 seconds', '0.5 seconds', '16 seconds'], '16 frames ÷ 8 per second = 2 s.', { level: 2 }),
            tf('Unity\'s Flipbook node has an "Invert Y" option because of the row-direction issue.', true, 'Exactly the 3 − row flip.', 3),
          ],
        },
      ],
    },
  ],
};
