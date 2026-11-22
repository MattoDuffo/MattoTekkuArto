// Topic — Transparency & blending.
import { tf, q, distinct, f, n, h, canvas2d, css } from './_kit.js';

// ====================================================================== helpers
const sw = (c, size = 14) => `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:3px;vertical-align:-2px;border:1px solid #444;background:${css(c)}"></span>`;
const fmt3 = (c) => `(${c.map((x) => n(x, 2)).join(', ')})`;
const over = (dst, src, a) => dst.map((d, i) => src[i] * a + d * (1 - a));

/** Row of labelled swatches (visual for lessons / items) */
function swatchRow(el, list) {
  const row = h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'flex-end', margin: '10px 0', flexWrap: 'wrap' } });
  for (const [label, c, big] of list) {
    if (label === '→' || label === '+' || label === 'over') { row.append(h('div', { style: { fontSize: '20px', paddingBottom: '22px' } }, label)); continue; }
    row.append(h('div', { style: { textAlign: 'center' } },
      h('div', { style: { width: big ? '76px' : '58px', height: big ? '76px' : '58px', borderRadius: '10px', background: css(c), border: '1px solid #3a3f55', margin: '0 auto' } }),
      h('div.small.dim', { html: label })));
  }
  el.append(row);
}

// Bayer 4×4 threshold, same formula as the GLSL below (values k/16, k = 0..15)
const bayer2 = (x, y) => { x = Math.floor(x); y = Math.floor(y); const v = x / 2 + y * y * 0.75; return v - Math.floor(v); };
const bayer4 = (x, y) => bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);
const BAYER_GLSL = `float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }`;

// A soft disc "sprite" used by many demos
const DISC = 'float d = length(uv - 0.5);\nfloat m = smoothstep(0.42, 0.42 - uSoft, d);';

// Simulated scene for the sorting demo (everything computed in one shader so we can switch rules)
const SORT_FRAG = `vec3 c = mix(vec3(0.72), vec3(0.88), checker(uv, 8.0)); float z = 1.0;   // background
if (sdBox(uv - vec2(0.66, 0.3), vec2(0.13, 0.12)) < 0.0) { c = vec3(0.3, 0.8, 0.4); z = 0.5; } // opaque box
for (int i = 0; i < 2; i++) {
  bool drawB = (i == 0) == (uSort > 0.5);              // sorted → far pane B first
  vec2 ctr = drawB ? vec2(0.6, 0.56) : vec2(0.4, 0.44);
  float d = drawB ? 0.7 : 0.3;                          // B is far, A is near
  vec3 gc = drawB ? vec3(0.2, 0.4, 1.0) : vec3(1.0, 0.25, 0.2);
  if (sdBox(uv - ctr, vec2(0.25, 0.2)) < 0.0 && d < z) {
    c = mix(c, gc, 0.55);
    if (uZW > 0.5) z = d;                               // depth write?
  }
}
col = c;`;

// ====================================================================== topic
export default {
  id: 'blending',
  title: 'Transparency & blending',
  icon: '🪟',
  blurb: 'Alpha, blend equations, additive and multiply, sorting, cutouts and dithered fades.',
  cheatsheet: `
<p><b>Alpha</b> = opacity / coverage. It does nothing until blending (or alpha test) uses it.</p>
<p><b>Alpha blend</b>: <code>result = src·a + dst·(1−a)</code> = <code>mix(dst, src, a)</code> — Unity <code>Blend SrcAlpha OneMinusSrcAlpha</code>.</p>
<ul>
<li><b>Additive</b> <code>dst + src·a</code>: only brightens. Fire, glow, sparks. Order-independent.</li>
<li><b>Multiply</b> <code>dst · src</code>: only darkens. Shadows, tint, dirt. White = no change.</li>
<li><b>Premultiplied</b> <code>src + dst·(1−a)</code> with colour already ×a: clean edges, can mix "over" and additive.</li>
</ul>
<p><b>Sorting</b>: opaque first, then transparent <b>back to front</b>, usually with <b>ZWrite Off</b>. Sorting is per object, so intersecting transparents can glitch.</p>
<p><b>Alpha test</b>: <code>if (alpha &lt; 0.5) discard;</code> → hard edges, writes depth, no sorting. Foliage, fences, dissolve.</p>
<p><b>Dithering</b>: discard a pattern of pixels (<code>alpha &lt;= bayer4(gl_FragCoord.xy)</code>) to fake transparency without sorting.</p>`,
  concepts: [
    // ------------------------------------------------------------------ 1
    {
      id: 'blending.alpha',
      title: 'The alpha channel',
      blurb: 'The fourth number: how much of this pixel does the surface cover?',
      lesson: [
        {
          title: 'The fourth number',
          body: `<p>A fragment shader can output <b>four</b> numbers: red, green, blue and <b>alpha</b> — a <code>vec4</code>. In this app you set <code>alpha</code> next to <code>col</code>.</p>
<p>Alpha means <b>opacity</b>: 1 = solid, 0 = invisible, 0.5 = half see-through. The grey checkerboard is what's "behind".</p>`,
          controls: [{ name: 'a', label: 'alpha', min: 0, max: 1, step: 0.01, value: 0.6 }],
          shader: (v) => ({ frag: 'float inside = step(length(uv - 0.5), 0.35);\ncol = vec3(1.0, 0.35, 0.2);\nalpha = uA * inside;', uniforms: { uA: v.a }, blend: 'alpha' }),
          code: (v) => `col = vec3(1.0, 0.35, 0.2);\nalpha = ${f(v.a, 2)} * inside; // outside the disc: 0 → invisible\n// gl_FragColor = vec4(col, alpha);`,
        },
        {
          title: 'Alpha does nothing on its own',
          body: `<p>Surprise: alpha is just a number. The GPU only uses it if <b>blending is switched on</b> for the material. Without blending, the colour simply overwrites what's behind and alpha is ignored.</p>
<p>Same shader twice, left with blending off, right with it on:</p>`,
          shaders: [
            { spec: { frag: 'float inside = step(length(uv - 0.5), 0.35);\ncol = vec3(1.0, 0.35, 0.2) * inside;\nalpha = 0.5 * inside;' }, label: 'blending <b>off</b>: alpha ignored' },
            { spec: { frag: 'float inside = step(length(uv - 0.5), 0.35);\ncol = vec3(1.0, 0.35, 0.2) * inside;\nalpha = 0.5 * inside;', blend: 'alpha' }, label: 'blending <b>on</b>' },
          ],
          after: '<div class="tip">In Unity that\'s the <i>Surface Type: Transparent</i> switch (or <code>Blend</code> lines in ShaderLab); in Unreal the material\'s <i>Blend Mode: Translucent</i>. Output alpha in an opaque material and nothing happens.</div>',
        },
        {
          title: 'Coverage: soft edges',
          body: `<p>Alpha often means <b>coverage</b>: how much of this pixel the shape actually covers. A smoke puff is dense in the middle and thin at the edge, so alpha fades out smoothly.</p>
<p>Make the edge softer: alpha now comes from a <code>smoothstep</code> of the distance.</p>`,
          controls: [{ name: 's', label: 'edge softness', min: 0.005, max: 0.4, step: 0.005, value: 0.2 }],
          shader: (v) => ({ frag: DISC + '\ncol = vec3(0.95);\nalpha = m;', uniforms: { uSoft: v.s }, blend: 'alpha' }),
          code: (v) => `float d = length(uv - 0.5);\nalpha = smoothstep(0.42, ${f(0.42 - v.s, 3)}, d); // 1 inside → 0 at the edge`,
          after: '<div class="note">Particles, hair cards, anti-aliased UI and decals all rely on smooth alpha edges.</div>',
          quiz: { q: 'A fragment outputs vec4(1.0, 0.0, 0.0, 0.0) with alpha blending on. What do you see?', options: ['Nothing — alpha 0 is fully transparent', 'Bright red', 'Black'], answer: 0, explain: 'With alpha = 0, the colour gets weight 0 and the background stays unchanged.' },
        },
      ],
      games: [
        {
          id: 'match-alpha', title: 'Match the opacity', engine: 'slider', rounds: 4,
          blurb: 'Set alpha (and more) so your sprite matches the target.',
          gen: (rng, level) => {
            const A = rng.step(0.2, 1, level === 1 ? 0.2 : 0.1);
            const S = level >= 2 ? rng.step(0.02, 0.35, 0.03) : 0.01;
            const H = level === 3 ? rng.step(0, 0.9, 0.1) : 0.05;
            const params = [{ name: 'a', label: 'alpha', min: 0, max: 1, step: 0.01, target: A }];
            if (level >= 2) params.push({ name: 's', label: 'edge softness', min: 0.01, max: 0.4, step: 0.01, target: S });
            if (level === 3) params.push({ name: 'h', label: 'hue', min: 0, max: 1, step: 0.01, target: H });
            return {
              prompt: 'Match the target sprite.',
              sub: 'Compare how much of the checkerboard shows through the middle.',
              params,
              build: (p) => ({ frag: DISC + '\ncol = hsv2rgb(vec3(uH, 0.75, 1.0));\nalpha = uA * m;', uniforms: { uA: p.a, uSoft: p.s ?? 0.01, uH: p.h ?? 0.05 }, blend: 'alpha' }),
              code: (p) => `col = hsv2rgb(vec3(${f(p.h ?? 0.05, 2)}, 0.75, 1.0));\nalpha = ${f(p.a, 2)} * smoothstep(0.42, ${f(0.42 - (p.s ?? 0.01), 2)}, d);`,
              tolerance: 0.06,
              explain: `<p>Target alpha: <b>${n(A)}</b>${level >= 2 ? `, softness ${n(S)}` : ''}${level === 3 ? `, hue ${n(H)}` : ''}.</p><p>Tip: at alpha 0.5 the checker squares are exactly half as visible as outside the disc.</p>`,
            };
          },
        },
        {
          id: 'which-alpha', title: 'Spot the alpha', engine: 'mcq', rounds: 6,
          blurb: 'Pick the image with the requested alpha.',
          gen: (rng, level) => {
            const pool = level === 1 ? [0, 0.5, 1, 0.15, 0.85] : [0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1];
            const picks = rng.pickN(pool, level === 1 ? 3 : 4);
            const ans = picks[0];
            return {
              prompt: `Which sprite was drawn with <code>alpha = ${f(ans, 2)}</code>?`,
              sub: level === 1 ? '' : 'Look at how strongly the checkerboard shows through.',
              options: picks.map((a) => ({ shader: { frag: 'float inside = step(length(uv - 0.5), 0.38);\ncol = vec3(0.3, 0.55, 1.0);\nalpha = uA * inside;', uniforms: { uA: a }, blend: 'alpha' } })),
              explain: `<p>Alpha ${n(ans)} keeps ${Math.round(ans * 100)}% of the sprite's colour and ${Math.round((1 - ans) * 100)}% of the background.</p>`,
            };
          },
        },
        {
          id: 'alpha-facts', title: 'Alpha facts', engine: 'mcq', rounds: 6,
          blurb: 'True or false about alpha.',
          questions: [
            tf('Alpha = 1 means fully opaque.', true, 'All of the source colour, none of the background.'),
            tf('Outputting alpha in an opaque material makes it see-through.', false, 'Blending must be enabled; otherwise alpha is ignored.'),
            tf('gl_FragColor is a vec4: red, green, blue, alpha.', true, 'The 4th component is alpha.'),
            tf('Alpha can represent how much of a pixel a shape covers.', true, 'That\'s "coverage" — used for soft and anti-aliased edges.'),
            tf('An alpha of 0.5 always makes a colour half as bright.', false, 'It blends 50/50 with what\'s behind. Over white it gets lighter, over black darker.', 2),
            q('Where does the colour "behind" a transparent pixel come from?', ['The framebuffer: whatever was drawn there before', 'The texture', 'The vertex colour'], 'Blending mixes with the colour already stored in the framebuffer (dst).'),
            q('A smoke particle should fade out at its edges. Which output does that?', ['alpha = smoothstep(edge, inner, dist)', 'col = vec3(0.0) at the edge', 'discard at the edge'], 'A smooth alpha falloff.'),
            tf('A PNG with a transparent background stores alpha per pixel.', true, 'That\'s the A in RGBA textures.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'blending.equation',
      title: 'The blend equation',
      blurb: 'src·a + dst·(1−a): it\'s just mix() — done by the GPU.',
      lesson: [
        {
          title: 'Source and destination',
          body: `<p>Two colours meet at every transparent pixel:</p>
<ul><li><b>src</b> (source): the new colour your fragment shader outputs, with its alpha <b>a</b>.</li>
<li><b>dst</b> (destination): the colour already in the framebuffer behind it.</li></ul>
<p>Standard alpha blending computes:</p>
<pre class="code">result = src * a + dst * (1.0 - a);</pre>
<div class="note">Look familiar? It's exactly <code>mix(dst, src, a)</code>. Alpha is the mix factor.</div>`,
          controls: [{ name: 'a', label: 'alpha (a)', min: 0, max: 1, step: 0.05, value: 0.5 }],
          visual: (el, v) => {
            const src = [1, 0.8, 0.2], dst = [0.2, 0.3, 0.9];
            const r = over(dst, src, v.a);
            swatchRow(el, [['dst (behind)', dst], ['over'], [`src, a = ${n(v.a)}`, src], ['→'], ['result', r, true]]);
            el.append(h('pre.code.wrap', { html: ['r', 'g', 'b'].map((ch, i) => `${ch}: ${n(src[i])}×${n(v.a)} + ${n(dst[i])}×${n(1 - v.a)} = <b>${n(r[i], 3)}</b>`).join('\n') }));
          },
        },
        {
          title: 'Stacking layers',
          body: `<p>Each draw updates the framebuffer, and the <b>next</b> transparent layer blends over that result. Let's stack two layers over a white background, one step at a time.</p>`,
          controls: [
            { name: 'a1', label: 'red layer alpha', min: 0, max: 1, step: 0.05, value: 0.5 },
            { name: 'a2', label: 'blue layer alpha', min: 0, max: 1, step: 0.05, value: 0.5 },
          ],
          visual: (el, v) => {
            const bg = [1, 1, 1], L1 = [1, 0.1, 0.1], L2 = [0.1, 0.2, 1];
            const s1 = over(bg, L1, v.a1), s2 = over(s1, L2, v.a2);
            swatchRow(el, [['start', bg], ['→'], ['after red', s1], ['→'], ['after blue', s2, true]]);
            el.append(h('pre.code.wrap', { html: `dst = (1, 1, 1)                       // white\ndst = mix(dst, red,  ${n(v.a1)}) = ${fmt3(s1)}\ndst = mix(dst, blue, ${n(v.a2)}) = ${fmt3(s2)}` }));
          },
          after: '<div class="note">The last layer drawn gets the "final say": its alpha decides how much of everything before it survives.</div>',
        },
        {
          title: 'Order matters',
          body: `<p>Same two layers, same alphas, opposite order. The results differ, because each step is a <code>mix</code> towards the newest colour.</p>`,
          visual: (el) => {
            const bg = [1, 1, 1], R = [1, 0.1, 0.1], B = [0.1, 0.2, 1];
            const rb = over(over(bg, R, 0.5), B, 0.5), br = over(over(bg, B, 0.5), R, 0.5);
            swatchRow(el, [['red, then blue', rb, true], ['blue, then red', br, true]]);
            el.append(h('pre.code.wrap', { html: `red then blue: ${fmt3(rb)}  → bluish\nblue then red: ${fmt3(br)}  → reddish` }));
          },
          after: '<p>That\'s why transparent objects must be drawn in the right order — the subject of a later concept.</p><div class="tip">On the GPU this is a fixed-function <b>blend state</b>: <code>glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)</code>, Unity <code>Blend SrcAlpha OneMinusSrcAlpha</code>. You choose the two factors; you don\'t write the code.</div>',
          quiz: { q: 'src = 1.0, dst = 0.0, alpha = 0.25. Result?', options: ['0.25', '0.75', '1.0'], answer: 0, explain: '1.0 × 0.25 + 0.0 × 0.75 = 0.25.' },
        },
      ],
      games: [
        {
          id: 'blend-by-hand', title: 'Blend by hand', engine: 'numeric', rounds: 5,
          blurb: 'Compute src·a + dst·(1−a) yourself.',
          gen: (rng, level) => {
            const V = [0, 0.2, 0.4, 0.6, 0.8, 1], A = [0.25, 0.5, 0.75];
            if (level === 1) {
              const s = rng.pick(V), d = rng.pick(V.filter((x) => x !== s)), a = rng.pick(A);
              return { prompt: `One channel: src = ${n(s)}, dst = ${n(d)}, alpha = ${n(a)}. What is the blended value?`, sub: 'result = src × a + dst × (1 − a)', answer: s * a + d * (1 - a), explain: `<p>${n(s)} × ${n(a)} + ${n(d)} × ${n(1 - a)} = ${n(s * a)} + ${n(d * (1 - a))} = <b>${n(s * a + d * (1 - a))}</b>.</p>` };
            }
            if (level === 2 || rng.chance(0.4)) {
              const s = [rng.pick(V), rng.pick(V), rng.pick(V)], d = [rng.pick(V), rng.pick(V), rng.pick(V)], a = rng.pick(A);
              const r = over(d, s, a);
              return { prompt: `src = ${fmt3(s)} ${sw(s)}, alpha = ${n(a)}<br>dst = ${fmt3(d)} ${sw(d)}<br>What colour lands in the framebuffer?`, labels: ['r', 'g', 'b'], answer: r, explain: `<p>Per channel: ${['r', 'g', 'b'].map((ch, i) => `${ch} = ${n(s[i])}×${n(a)} + ${n(d[i])}×${n(1 - a)} = ${n(r[i])}`).join('; ')}.</p>` };
            }
            const d = rng.pick(V), s1 = rng.pick(V), s2 = rng.pick(V), a1 = rng.pick([0.5, 0.25]), a2 = 0.5;
            const m1 = s1 * a1 + d * (1 - a1), m2 = s2 * a2 + m1 * (1 - a2);
            return { prompt: `Background (dst) = ${n(d)}. First a layer with value ${n(s1)} and alpha ${n(a1)} is drawn, then a layer with value ${n(s2)} and alpha ${n(a2)}. Final value?`, sub: 'Blend twice: the result of the first becomes dst for the second.', answer: m2, explain: `<p>Step 1: ${n(s1)}×${n(a1)} + ${n(d)}×${n(1 - a1)} = ${n(m1)}.<br>Step 2: ${n(s2)}×${n(a2)} + ${n(m1)}×${n(1 - a2)} = <b>${n(m2)}</b>.</p>` };
          },
        },
        {
          id: 'pick-blend', title: 'Predict the blend', engine: 'mcq', rounds: 7,
          blurb: 'Pick the colour that comes out of the blend.',
          gen: (rng, level) => {
            const P = [[1, 0, 0], [0, 0, 1], [1, 1, 0], [1, 1, 1], [0, 0, 0], [0, 1, 0], [1, 0.5, 0], [0, 1, 1]];
            const src = rng.pick(P), dst = rng.pick(P.filter((c) => c !== src));
            const a = rng.pick(level === 1 ? [0.5] : [0.25, 0.5, 0.75]);
            const correct = over(dst, src, a);
            const cands = [over(dst, src, 1 - a), src, dst, src.map((x, i) => Math.min(1, x + dst[i])), src.map((x, i) => x * dst[i]), over(dst, src, 0.5)];
            const key = (c) => c.map((x) => Math.round(x * 8)).join();
            const opts = distinct(rng, correct, (r, i) => cands[i % cands.length], 4, key);
            return {
              prompt: `<b>src</b> ${sw(src, 18)} with alpha <b>${n(a)}</b> is blended over <b>dst</b> ${sw(dst, 18)}. Which colour results?`,
              options: opts.map((c) => ({ color: c })),
              explain: `<p>mix(dst, src, ${n(a)}) = ${fmt3(correct)} ${sw(correct)}.</p><p>Alpha ${n(a)} means ${Math.round(a * 100)}% src and ${Math.round((1 - a) * 100)}% dst.</p>`,
            };
          },
        },
        {
          id: 'equation-facts', title: 'Equation check', engine: 'mcq', rounds: 6,
          blurb: 'Concept questions on the blend equation.',
          questions: [
            q('The alpha blend equation is the same as…', ['mix(dst, src, a)', 'mix(src, dst, a)', 'src * dst'], 'a = 0 gives dst, a = 1 gives src.'),
            q('In blending, "dst" is…', ['The colour already in the framebuffer', 'The texture', 'The next object to draw'], 'Destination = where the result is written.'),
            tf('Swapping the drawing order of two transparent layers can change the result.', true, 'Each blend is a mix towards the newest colour.'),
            tf('A layer with alpha 1 completely hides what\'s behind it.', true, 'src × 1 + dst × 0.'),
            q('Unity\'s "Blend SrcAlpha OneMinusSrcAlpha" means…', ['result = src·a + dst·(1−a)', 'result = src + dst', 'result = src · dst'], 'Standard alpha blending.', { level: 2 }),
            tf('The blend equation runs inside your fragment shader code.', false, 'It\'s fixed-function hardware after the shader. You only choose the factors.', 2),
            q('White (1) at alpha 0.5 over black (0) gives…', ['0.5', '1', '0.25'], '1×0.5 + 0×0.5.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'blending.modes',
      title: 'Blend modes',
      blurb: 'Alpha, additive, multiply, premultiplied — and when to use each.',
      lesson: [
        {
          title: 'Additive: light adds up',
          body: `<p><b>Additive</b> blending just adds: <code>result = dst + src·a</code>.</p>
<ul><li>It can only make things <b>brighter</b>.</li><li><b>Black adds nothing</b>, so black areas of the sprite are invisible — no alpha needed!</li></ul>
<p>Perfect for things that <b>emit light</b>: fire, sparks, glows, lasers, magic.</p>`,
          controls: [{ name: 'k', label: 'intensity', min: 0, max: 2, step: 0.05, value: 1 }],
          shader: (v) => ({ frag: 'vec2 p = uv - vec2(0.5, 0.3);\nfloat flame = fbm(vec2(p.x * 4.0, p.y * 3.0 - uTime * 2.0));\nfloat shape = smoothstep(0.35, 0.0, length(p * vec2(1.6, 0.7))) * flame * 1.8;\ncol = uK * vec3(1.0, 0.45, 0.1) * shape + uK * vec3(1.0, 0.9, 0.5) * pow(shape, 3.0);\nalpha = 1.0;', uniforms: { uK: v.k }, blend: 'add' }),
          code: (v) => `// Blend One One (additive)\ncol = ${f(v.k, 2)} * flameColour * shape; // black = no change`,
          after: '<div class="note">Overlapping additive particles get brighter where they stack, like real light. And because <code>a + b = b + a</code>, additive blending <b>doesn\'t care about draw order</b>.</div>',
        },
        {
          title: 'Multiply: only darker',
          body: `<p><b>Multiply</b>: <code>result = dst · src</code>.</p>
<ul><li>It can only make things <b>darker</b> (colours are ≤ 1).</li><li><b>White multiplies by 1 = no change</b>, so the sprite's white areas are invisible.</li></ul>
<p>Use it for blob shadows, dirt, stains, tinted glass.</p>`,
          controls: [{ name: 'k', label: 'shadow darkness', min: 0, max: 1, step: 0.05, value: 0.7 }],
          shader: (v) => ({ frag: 'float d = length((uv - 0.5) * vec2(1.0, 1.8));\nfloat sh = smoothstep(0.4, 0.05, d) * uK;\ncol = vec3(1.0 - sh); // white = no change', uniforms: { uK: v.k }, blend: 'multiply' }),
          code: (v) => `// Blend DstColor Zero (multiply)\ncol = vec3(1.0 - shadow * ${f(v.k, 2)}); // white outside → invisible`,
        },
        {
          title: 'Same sprite, three modes',
          body: '<p>One orange soft disc, drawn over the same checkerboard with each mode. Learn to recognise them:</p>',
          shaders: [
            { spec: { frag: 'float m = smoothstep(0.42, 0.15, length(uv - 0.5));\ncol = vec3(1.0, 0.55, 0.15);\nalpha = m;', blend: 'alpha' }, label: '<b>Alpha</b>: covers the background' },
            { spec: { frag: 'float m = smoothstep(0.42, 0.15, length(uv - 0.5));\ncol = vec3(1.0, 0.55, 0.15) * m;\nalpha = 1.0;', blend: 'add' }, label: '<b>Additive</b>: background shows through, brighter' },
            { spec: { frag: 'float m = smoothstep(0.42, 0.15, length(uv - 0.5));\ncol = mix(vec3(1.0), vec3(1.0, 0.55, 0.15), m);', blend: 'multiply' }, label: '<b>Multiply</b>: background shows through, darker/tinted' },
            { spec: { frag: 'float m = smoothstep(0.42, 0.15, length(uv - 0.5));\ncol = vec3(1.0, 0.55, 0.15) * m;  // premultiplied\nalpha = m;', blend: 'premult' }, label: '<b>Premultiplied</b>: same look as alpha here' },
          ],
        },
        {
          title: 'Premultiplied alpha',
          body: `<p>In <b>premultiplied</b> alpha the colour is stored <b>already multiplied by alpha</b>, and the blend is <code>result = src + dst·(1−a)</code> (Unity <code>Blend One OneMinusSrcAlpha</code>).</p>
<p>Two big advantages:</p>
<ul><li><b>Clean edges</b>: texture filtering and mipmaps don't create dark or light fringes around sprites.</li>
<li><b>One mode does both</b>: keep the colour but lower alpha → it turns <b>additive</b>. Fire that is solid at the base and glowy at the tips, in one particle!</li></ul>
<p>Slide from "normal over" to "fully additive" without changing blend mode:</p>`,
          controls: [{ name: 'k', label: 'additive-ness', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (v) => ({ frag: 'float m = smoothstep(0.42, 0.1, length(uv - 0.5));\ncol = vec3(0.3, 0.7, 1.0) * m;   // colour × alpha\nalpha = m * (1.0 - uK);          // less alpha = more additive', uniforms: { uK: v.k }, blend: 'premult' }),
          code: (v) => `col   = colour * m;           // premultiplied\nalpha = m * ${f(1 - v.k, 2)};          // ${v.k > 0.95 ? 'alpha 0 → pure additive' : v.k < 0.05 ? 'normal "over"' : 'part over, part additive'}`,
          quiz: { q: 'A shadow decal should darken the floor and leave its white areas invisible. Which mode?', options: ['Multiply', 'Additive', 'Alpha blend with white'], answer: 0, explain: 'Multiply by white = no change; by grey = darker.' },
        },
      ],
      games: [
        {
          id: 'mode-for-effect', title: 'Pick the blend mode', engine: 'buckets', rounds: 2,
          blurb: 'Which blend mode suits each effect?',
          gen: () => ({
            prompt: 'Which blend mode fits best?',
            buckets: ['🪟 Alpha blend', '✨ Additive', '🌑 Multiply'],
            count: 10,
            items: [
              { text: 'Fire and embers', bucket: 1 },
              { text: 'A soft blob shadow under a character', bucket: 2 },
              { text: 'Thick grey smoke that hides what\'s behind', bucket: 0, why: 'Smoke blocks light: it needs to cover, not add.' },
              { text: 'A glowing laser beam', bucket: 1 },
              { text: 'Mud splatter decal darkening a wall', bucket: 2 },
              { text: 'A UI panel fading in', bucket: 0 },
              { text: 'Magic sparkles', bucket: 1 },
              { text: 'Stained-glass window tinting the scene', bucket: 2, why: 'Glass filters (multiplies) the light behind it.' },
              { text: 'A ghost that is 50% see-through', bucket: 0 },
              { text: 'Lens flare', bucket: 1 },
              { text: 'Ambient-occlusion decal in a corner', bucket: 2 },
              { text: 'Dust clouds kicked up by a car', bucket: 0 },
              { text: 'Muzzle flash', bucket: 1 },
            ],
          }),
        },
        {
          id: 'name-mode', title: 'Name that mode', engine: 'mcq', rounds: 6,
          blurb: 'Look at the sprite over the checkerboard: which blend mode was used?',
          gen: (rng, level) => {
            const hue = rng.float(0, 1);
            const sat = level === 1 ? 0.8 : rng.float(0.3, 0.8);
            const mode = rng.pick(['alpha', 'add', 'multiply']);
            const shapes = ['smoothstep(0.42, 0.2, length(uv - 0.5))', 'smoothstep(0.08, 0.0, sdBox(uv - 0.5, vec2(0.28)))', 'smoothstep(0.4, 0.1, length((uv - 0.5) * vec2(1.0, 1.7)))'];
            const shape = rng.pick(shapes);
            const c = `hsv2rgb(vec3(${f(hue, 3)}, ${f(sat, 2)}, 1.0))`;
            const frag = mode === 'alpha' ? `float m = ${shape};\ncol = ${c};\nalpha = m;` : mode === 'add' ? `float m = ${shape};\ncol = ${c} * m * 0.6; // additive: checker stays visible` : `float m = ${shape};\ncol = mix(vec3(1.0), ${c}, m);`;
            const names = { alpha: 'Alpha blend', add: 'Additive', multiply: 'Multiply' };
            const order = [mode, ...['alpha', 'add', 'multiply'].filter((m) => m !== mode)];
            return {
              prompt: 'This sprite was drawn over the grey checkerboard. Which blend mode?',
              sub: 'Clues: can you see the checker through it? Is it brighter or darker than the background?',
              shader: { frag, blend: mode },
              options: order.map((m) => names[m]),
              explain: '<p><b>Alpha</b>: the middle hides the checker completely. <b>Additive</b>: checker still visible, everything brighter. <b>Multiply</b>: checker still visible, everything darker or tinted.</p>',
            };
          },
        },
        {
          id: 'mode-math', title: 'Blend mode maths', engine: 'numeric', rounds: 5,
          blurb: 'Compute additive and multiply results by hand.',
          gen: (rng, level) => {
            const V = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8];
            const d = rng.pick(V), s = rng.pick(V);
            const mode = level === 1 ? rng.pick(['add', 'mul']) : rng.pick(['add', 'mul', 'addA', 'clamp']);
            if (mode === 'add') return { prompt: `<b>Additive</b> (Blend One One). dst = ${n(d)}, src = ${n(s)}. Result?`, answer: Math.min(1, d + s), explain: `<p>${n(d)} + ${n(s)} = <b>${n(Math.min(1, d + s))}</b>. Additive only ever brightens.</p>` };
            if (mode === 'mul') return { prompt: `<b>Multiply</b>. dst = ${n(d)}, src = ${n(s)}. Result?`, answer: d * s, explain: `<p>${n(d)} × ${n(s)} = <b>${n(d * s)}</b>. Multiply only ever darkens (both are ≤ 1).</p>` };
            if (mode === 'addA') { const a = rng.pick([0.25, 0.5]); return { prompt: `<b>Additive with alpha</b> (Blend SrcAlpha One): result = dst + src·a.<br>dst = ${n(d)}, src = ${n(s)}, a = ${n(a)}. Result?`, answer: d + s * a, explain: `<p>${n(d)} + ${n(s)} × ${n(a)} = <b>${n(d + s * a)}</b>.</p>` }; }
            const d2 = rng.pick([0.6, 0.7, 0.8]), s2 = rng.pick([0.5, 0.6, 0.7]);
            return { prompt: `<b>Additive</b>: dst = ${n(d2)}, src = ${n(s2)}. The framebuffer stores 0..1 (8-bit). What value is stored?`, answer: 1, explain: `<p>${n(d2)} + ${n(s2)} = ${n(d2 + s2)}, but an 8-bit framebuffer clamps to <b>1</b>. That's why stacked additive particles "burn out" to white (HDR buffers can keep values above 1).</p>` };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ 4
    {
      id: 'blending.sorting',
      title: 'Sorting & transparency problems',
      blurb: 'Why transparent things must be drawn last, back to front, without writing depth.',
      lesson: [
        {
          title: 'Blending needs what\'s behind',
          body: `<p>Blending mixes with the colour <b>already in the framebuffer</b>. So when a glass pane is drawn, everything behind it must <b>already be there</b>. If the wall behind is drawn later, the glass blended with an empty background and the result is wrong.</p>
<p>That gives the standard frame order:</p>
<ol><li>Draw all <b>opaque</b> objects (any order, depth test sorts it out).</li><li>Then draw <b>transparent</b> objects, sorted <b>back to front</b> (far first).</li></ol>
<div class="analogy">🎨 <b>Analogy:</b> painting with watercolour glazes. You paint the background first, then each see-through layer on top, from the furthest to the nearest. You can't glaze over a wall you haven't painted yet.</div>`,
        },
        {
          title: 'Try the rules',
          body: `<p>Two glass panes: <span style="color:#ff7a7a">red A</span> is <b>near</b>, <span style="color:#7fa0ff">blue B</span> is <b>far</b>. A green opaque box sits between them in depth. Look at the area where the panes overlap.</p>
<p>The correct look: you see blue <i>through</i> red, so the overlap is red-tinted purple.</p>`,
          controls: [
            { name: 's', label: 'sorted back-to-front (0/1)', min: 0, max: 1, step: 1, value: 1 },
            { name: 'z', label: 'glass writes depth (0/1)', min: 0, max: 1, step: 1, value: 0 },
          ],
          shader: (v) => ({ frag: SORT_FRAG, uniforms: { uSort: v.s, uZW: v.z } }),
          code: (v) => {
            const msg = v.s ? (v.z ? '✅ looks right here (sorted). But depth writes still break self-overlapping or intersecting glass.' : '✅ correct: far B first, then A blends over it') : (v.z ? '❌ A drawn first wrote its depth → B (behind) is rejected in the overlap: it vanishes!' : '❌ B blended last → blue looks like it\'s IN FRONT of red');
            return `draw order: opaque box, then ${v.s ? 'B (far), A (near)' : 'A (near), B (far)'}\nZWrite ${v.z ? 'On' : 'Off'}\n${msg}`;
          },
          after: '<div class="note">Notice the green box is handled correctly in every case: it\'s opaque, drawn first, and the depth <b>test</b> (still on) hides pane B behind it.</div>',
        },
        {
          title: 'Why "ZWrite Off"',
          body: `<p>Transparent objects usually <b>test</b> depth (so they hide behind walls) but <b>don't write</b> depth.</p>
<p>If a glass pane wrote its depth, anything drawn after it <i>behind</i> it would fail the depth test and disappear — even though you should see it through the glass.</p>
<div class="tip">Unity: <code>ZWrite Off</code> + <code>Queue = Transparent</code> (render queue 3000, drawn after opaque 2000). Unreal: translucent materials don't write depth by default; <i>Translucency Sort Priority</i> lets you nudge the order.</div>`,
        },
        {
          title: 'Sorting is per object',
          body: `<p>Engines sort transparent objects by their <b>centre's distance</b> to the camera — one number per object. That breaks when:</p>
<ul><li>Two transparent objects <b>intersect</b> (each is partly in front of the other).</li><li>A big object (a long water plane) has its centre behind a small one that's actually further away.</li><li>One mesh overlaps <b>itself</b> (hair, a glass bottle): its triangles are drawn in mesh order.</li></ul>
<p>The result: <b>popping</b> as the camera moves and the sort order flips.</p>
<div class="note">Escapes: use <b>additive</b> (order-independent), <b>alpha test/dither</b> (no sorting needed), split meshes, or order-independent transparency (OIT) techniques on high-end hardware.</div>`,
          quiz: { q: 'Why do transparent objects usually NOT write depth?', options: ['Objects behind them drawn later would be wrongly hidden', 'Depth writes are slow', 'They have no depth'], answer: 0, explain: 'You must still see what\'s behind the glass.' },
        },
      ],
      games: [
        {
          id: 'draw-order', title: 'Set the draw order', engine: 'order', rounds: 4,
          blurb: 'Order a frame\'s objects the way a renderer should.',
          gen: (rng, level) => {
            const OP = ['🧱 Wall', '🪨 Rock', '🚪 Door', '🛢️ Barrel', '🌳 Tree trunk', '🚗 Car body'];
            const TR = ['🪟 Window', '💨 Smoke', '🫧 Bubble', '🔥 Fire glow', '🧊 Ice block', '🌫️ Fog sheet'];
            const nO = level === 1 ? 0 : level === 2 ? 2 : 3, nT = level === 1 ? 3 : level === 2 ? 2 : 3;
            const dists = rng.pickN([2, 3, 5, 7, 9, 12, 15, 20, 25, 30], nO + nT);
            const ops = rng.pickN(OP, nO).map((nm, i) => ({ nm, d: dists[i], t: 'opaque' }));
            const trs = rng.pickN(TR, nT).map((nm, i) => ({ nm, d: dists[nO + i], t: 'transparent' }));
            const ordered = [...ops.sort((a, b) => a.d - b.d), ...trs.sort((a, b) => b.d - a.d)];
            return {
              prompt: level === 1 ? 'Order these <b>transparent</b> objects for drawing:' : 'Order the draw calls for this frame:',
              sub: level === 1 ? 'Rule: transparent objects are drawn back to front (far first).' : 'Rule: opaque first, front to back (near first, so early-z skips hidden pixels). Then transparent, back to front.',
              items: ordered.map((o) => `${o.nm} <span class="dim">(${o.t}, ${o.d} m)</span>`),
              explain: `<p>${level > 1 ? 'Opaque: near → far, to let the depth test reject hidden pixels before shading. ' : ''}Transparent: far → near, so each layer blends over everything behind it.</p>`,
            };
          },
        },
        {
          id: 'glass-colour', title: 'Right order, wrong order', engine: 'mcq', rounds: 6,
          blurb: 'Predict the colour of two overlapping glass panes.',
          gen: (rng, level) => {
            const P = [[1, 0.2, 0.2], [0.2, 0.4, 1], [1, 0.9, 0.2], [0.2, 0.9, 0.3]];
            const [A, B] = rng.pickN(P, 2);
            const bg = [1, 1, 1];
            const a = rng.pick(level === 1 ? [0.5] : [0.5, 0.6, 0.75]);
            const right = over(over(bg, B, a), A, a), wrong = over(over(bg, A, a), B, a);
            const askWrong = level > 1 && rng.chance(0.5);
            const correct = askWrong ? wrong : right;
            const key = (c) => c.map((x) => Math.round(x * 10)).join();
            const opts = distinct(rng, correct, (r, i) => [askWrong ? right : wrong, over(bg, A, a), over(bg, B, a), A.map((x, k) => x * B[k])][i % 4], 4, key);
            return {
              prompt: `Over a white background: glass <b>A</b> ${sw(A, 18)} is <b>near</b>, glass <b>B</b> ${sw(B, 18)} is <b>far</b>. Both have alpha ${n(a)}. What colour is the overlap when drawn <b>${askWrong ? 'in the WRONG order (A first, then B)' : 'correctly'}</b>?`,
              options: opts.map((c) => ({ color: c })),
              explain: `<p>Correct (B then A): ${fmt3(right)} ${sw(right)} — the near pane A tints last.<br>Wrong (A then B): ${fmt3(wrong)} ${sw(wrong)} — B looks like it's in front.</p>`,
            };
          },
        },
        {
          id: 'sorting-facts', title: 'Sorting sense', engine: 'mcq', rounds: 7,
          blurb: 'Concept questions on transparency sorting.',
          questions: [
            q('In which order are transparent objects normally drawn?', ['Back to front', 'Front to back', 'Any order'], 'Far first, so near layers blend over far ones.'),
            q('When are transparent objects drawn relative to opaque ones?', ['After all opaque objects', 'Before opaque objects', 'Mixed in randomly'], 'Opaque first so the background is ready for blending.'),
            tf('Additive particles look the same in any draw order.', true, 'Addition is commutative.'),
            tf('Opaque objects need to be sorted back to front to look correct.', false, 'The depth test makes any order correct for opaque. Front to back is only a speed optimisation.'),
            tf('Two intersecting transparent objects can always be sorted correctly per object.', false, 'Each is partly in front of the other — one number per object can\'t express that.', 2),
            q('Transparent glass writes depth. A smoke puff behind it is drawn afterwards. What happens?', ['The smoke is hidden behind the glass where they overlap', 'It looks correct', 'The glass disappears'], 'Smoke fails the depth test against the glass\'s depth.', { level: 2 }),
            q('A transparent object flickers in front/behind another as the camera moves. Likely cause?', ['Per-object sorting flips as their centre distances swap', 'Z-fighting in the depth buffer', 'Texture mipmaps'], 'Classic sort popping.', { level: 2 }),
            q('Which technique avoids sorting entirely for foliage?', ['Alpha test (cutout)', 'Alpha blending', 'Premultiplied alpha'], 'Cutout writes depth like opaque geometry.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------ 5
    {
      id: 'blending.cutout',
      title: 'Alpha test & cutout',
      blurb: 'discard: all or nothing — no sorting needed.',
      lesson: [
        {
          title: 'All or nothing',
          body: `<p>Instead of blending, a shader can simply <b>throw a pixel away</b>:</p>
<pre class="code">if (alpha < 0.5) discard;</pre>
<p>Every pixel is either <b>fully drawn</b> or <b>not drawn at all</b>. No mixing, so no need for what's behind, so <b>no sorting</b> — and the kept pixels write depth like any opaque surface.</p>
<p>Drag the cutoff on this leaf. Then switch between cutout and blending.</p>`,
          controls: [
            { name: 't', label: 'cutoff', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 'b', label: 'mode (0 = cutout, 1 = blend)', min: 0, max: 1, step: 1, value: 0 },
          ],
          shader: (v) => ({
            frag: `vec2 p = (uv - 0.5) * vec2(1.6, 1.0);
p = rot(0.6) * p;
float leaf = 1.0 - length(vec2(p.x * 1.9, p.y)) * 2.2;          // leaf shape
leaf += 0.25 * (fbm(uv * 9.0) - 0.5);                          // ragged edge
float a = saturate(leaf * 2.0);
col = mix(vec3(0.2, 0.45, 0.12), vec3(0.45, 0.75, 0.2), uv.y) * (0.8 + 0.4 * step(abs(p.x), 0.012));
if (uB < 0.5) { if (a < uT) discard; alpha = 1.0; } else { alpha = a; }`,
            uniforms: { uT: v.t, uB: v.b }, blend: 'alpha',
          }),
          code: (v) => v.b ? 'alpha = a;           // soft edges, but needs sorting' : `if (a < ${f(v.t, 2)}) discard;  // hard edge, no sorting`,
        },
        {
          title: 'Hard edges',
          body: `<p>The price of cutout: edges are <b>hard</b> and can shimmer (aliasing), because each pixel is in or out.</p>
<ul><li><b>Alpha-to-coverage</b> (with MSAA) turns alpha into a sample mask: smoother edges, still no sorting.</li>
<li><b>TAA</b> (temporal anti-aliasing) blurs the stair steps over a few frames.</li>
<li>Mipmapped alpha shrinks at distance (leaves get thinner) — tools can rescale alpha per mip to keep coverage.</li></ul>
<div class="tip">Unity: <i>Alpha Clipping</i> checkbox + threshold (queue AlphaTest, 2450). Unreal: <i>Blend Mode: Masked</i> + <i>Opacity Mask Clip Value</i>.</div>`,
        },
        {
          title: 'The dissolve effect',
          body: `<p>The most famous cutout effect: <b>dissolve</b>. Compare a noise value with a threshold and discard below it. Add a thin glowing band just above the threshold for the burning edge.</p>`,
          controls: [
            { name: 't', label: 'dissolve amount', min: 0, max: 1, step: 0.01, value: 0.45 },
            { name: 'e', label: 'edge width', min: 0, max: 0.15, step: 0.005, value: 0.05 },
          ],
          shader: (v) => ({ mesh: 'sphere', frag: 'float nz = fbm(uv * vec2(8.0, 4.0));\nif (nz < uT) discard;\nfloat edge = 1.0 - smoothstep(0.0, uE, nz - uT);\nvec3 L = normalize(vec3(0.6, 1.0, 0.45));\ncol = vec3(0.4, 0.6, 0.9) * (0.25 + 0.75 * max(dot(N, L), 0.0));\ncol = mix(col, vec3(1.0, 0.5, 0.1) * 2.0, edge * step(0.001, uE));', uniforms: { uT: v.t, uE: v.e }, camera: { spin: 0.3 } }),
          code: (v) => `float nz = fbm(uv * vec2(8.0, 4.0));\nif (nz < ${f(v.t, 2)}) discard;                       // gone\nfloat edge = 1.0 - smoothstep(0.0, ${f(v.e, 3)}, nz - ${f(v.t, 2)}); // glow band\ncol = mix(col, fireColour, edge);`,
          after: '<div class="note">Notice you can see the inside of the sphere through the holes: discarded pixels let the back faces show — and they\'re depth-sorted correctly for free.</div>',
        },
        {
          title: 'A note on cost',
          body: `<p>On many mobile GPUs (tile-based), <code>discard</code> can switch off "early depth" optimisations for that object: the GPU can't know which pixels survive until the shader runs.</p>
<p>So: use cutout where you need it (foliage, fences, dissolves), but don't make every material "masked" just in case.</p>`,
          quiz: { q: 'Leaves on a tree overlap in every direction and sorting them is impossible. Best approach?', options: ['Alpha test (cutout)', 'Alpha blend with ZWrite On', 'Additive'], answer: 0, explain: 'Cutout needs no sorting: kept pixels write depth like opaque geometry.' },
        },
      ],
      games: [
        {
          id: 'cutout-or-blend', title: 'Cutout or blend?', engine: 'buckets', rounds: 2,
          blurb: 'Hard-edged and unsortable → cutout. Soft and see-through → blend.',
          gen: () => ({
            prompt: 'Alpha test (cutout) or alpha blend?',
            buckets: ['✂️ Cutout (discard)', '🪟 Blend'],
            count: 10,
            items: [
              { text: 'Tree leaves on a card', bucket: 0 },
              { text: 'A chain-link fence', bucket: 0 },
              { text: 'A glass window', bucket: 1, why: 'Glass is partly see-through everywhere — needs real blending.' },
              { text: 'Smoke puffs', bucket: 1 },
              { text: 'Grass blades in a big field', bucket: 0 },
              { text: 'A burning dissolve effect', bucket: 0 },
              { text: 'A holographic shield, 40% see-through', bucket: 1 },
              { text: 'A UI window fading in', bucket: 1 },
              { text: 'A torn flag with holes', bucket: 0 },
              { text: 'A soap bubble', bucket: 1 },
              { text: 'Railings on a balcony', bucket: 0 },
              { text: 'Water surface', bucket: 1 },
            ],
          }),
        },
        {
          id: 'be-alpha-test', title: 'Be the alpha test', engine: 'paint', rounds: 4,
          blurb: 'Run the discard in your head: which pixels survive?',
          gen: (rng, level) => {
            const F = [
              { lvl: 1, code: 'uv.x', fn: (u) => u },
              { lvl: 1, code: 'uv.y', fn: (u, v) => v },
              { lvl: 1, code: '1.0 - uv.x', fn: (u) => 1 - u },
              { lvl: 2, code: 'uv.x * uv.y', fn: (u, v) => u * v },
              { lvl: 2, code: '1.0 - length(uv - 0.5) * 2.0', fn: (u, v) => 1 - Math.hypot(u - 0.5, v - 0.5) * 2 },
              { lvl: 2, code: '(uv.x + uv.y) * 0.5', fn: (u, v) => (u + v) * 0.5 },
              { lvl: 3, code: 'abs(uv.x - 0.5) * 2.0', fn: (u) => Math.abs(u - 0.5) * 2 },
              { lvl: 3, code: 'max(uv.x, uv.y)', fn: (u, v) => Math.max(u, v) },
              { lvl: 3, code: 'uv.y - uv.x + 0.5', fn: (u, v) => v - u + 0.5 },
            ];
            const W = level === 1 ? 4 : level === 2 ? 5 : 6;
            for (let t = 0; t < 60; t++) {
              const fn = rng.pick(F.filter((x) => x.lvl <= level));
              const th = rng.pick([0.25, 0.3, 0.4, 0.5, 0.6, 0.7]);
              let ok = true, kept = 0;
              for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const a = fn.fn((x + 0.5) / W, (y + 0.5) / W); if (Math.abs(a - th) < 0.02) ok = false; if (a >= th) kept++; }
              if (!ok || kept === 0 || kept === W * W) continue;
              return {
                prompt: 'Which pixels survive this alpha test?',
                code: `float a = ${fn.code};\nif (a < ${f(th, 2)}) discard;\ncol = vec3(0.3, 0.8, 0.4);`,
                w: W, h: W,
                palette: [{ color: [0.22, 0.23, 0.28], label: '✕' }, { color: [0.3, 0.8, 0.4], label: '✓' }],
                solve: (u, v) => (fn.fn(u, v) < th ? 0 : 1),
                showUV: level < 3,
                explain: `<p>Each pixel computes its own <code>a</code> from uv. If it's below ${n(th)}, the pixel is thrown away (✕) and the background stays. Otherwise it's drawn fully (✓) — no in-between.</p>`,
              };
            }
            return { prompt: 'Which pixels survive?', code: 'if (uv.x < 0.5) discard;', w: 4, h: 4, palette: [{ color: [0.22, 0.23, 0.28], label: '✕' }, { color: [0.3, 0.8, 0.4], label: '✓' }], solve: (u) => (u < 0.5 ? 0 : 1), showUV: true, explain: '' };
          },
        },
        {
          id: 'match-dissolve', title: 'Match the dissolve', engine: 'slider', rounds: 4,
          blurb: 'Tune the dissolve threshold (and edge) to match the target.',
          gen: (rng, level) => {
            const T = rng.step(0.25, 0.65, 0.05), E = level >= 2 ? rng.step(0.02, 0.12, 0.02) : 0.04, S = level === 3 ? rng.pick([3, 5, 8]) : 5;
            const params = [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.01, target: T }];
            if (level >= 2) params.push({ name: 'e', label: 'edge width', min: 0, max: 0.15, step: 0.005, target: E });
            if (level === 3) params.push({ name: 's', label: 'noise scale', min: 2, max: 10, step: 0.5, target: S });
            return {
              prompt: 'Match the dissolve.',
              sub: level === 1 ? 'More threshold = more of the image is eaten away.' : 'Find the amount first, then the width of the orange edge.',
              params,
              build: (p) => ({ frag: 'float nz = fbm(uv * uS);\nif (nz < uT) discard;\nfloat edge = 1.0 - smoothstep(0.0, uE, nz - uT);\ncol = texture2D(uTex, uv).rgb;\ncol = mix(col, vec3(1.0, 0.5, 0.1), edge * step(0.001, uE));', uniforms: { uT: p.t, uE: p.e ?? E, uS: p.s ?? S }, textures: { uTex: 'photo' }, bg: [0.08, 0.085, 0.11] }),
              code: (p) => `float nz = fbm(uv * ${f(p.s ?? S, 1)});\nif (nz < ${f(p.t, 2)}) discard;\nfloat edge = 1.0 - smoothstep(0.0, ${f(p.e ?? E, 3)}, nz - ${f(p.t, 2)});`,
              tolerance: 0.05,
              explain: `<p>Target: threshold ${n(T)}${level >= 2 ? `, edge ${n(E)}` : ''}${level === 3 ? `, scale ${n(S)}` : ''}.</p><p>fbm values sit mostly around 0.3–0.7, so the dissolve happens quickly in that range.</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ 6
    {
      id: 'blending.dither',
      title: 'Dithering & fades',
      blurb: 'Fake transparency by drawing only some of the pixels.',
      lesson: [
        {
          title: 'Screen-door transparency',
          body: `<p>Imagine looking through a fly screen: the wires block some of the view, the holes let the rest through. From far away it looks like a semi-transparent grey veil.</p>
<p><b>Dithered (screen-door) transparency</b> does the same with pixels: to be 50% transparent, <b>discard half the pixels</b> in a fine pattern. It's just an alpha test with a different threshold per pixel — so it needs <b>no sorting</b> and writes depth.</p>
<p>Fade the sphere. Increase the pattern size to see the trick.</p>`,
          controls: [
            { name: 'a', label: 'opacity', min: 0, max: 1, step: 0.01, value: 0.5 },
            { name: 'p', label: 'pattern pixel size', min: 1, max: 8, step: 1, value: 3 },
          ],
          shader: (v) => ({ mesh: 'sphere', defs: BAYER_GLSL, frag: 'if (uA <= bayer4(gl_FragCoord.xy / uPx)) discard;\nvec3 L = normalize(vec3(0.6, 1.0, 0.45));\ncol = vec3(1.0, 0.6, 0.3) * (0.25 + 0.75 * max(dot(N, L), 0.0));', uniforms: { uA: v.a, uPx: v.p }, bg: [0.2, 0.3, 0.45] }),
          code: (v) => `if (${f(v.a, 2)} <= bayer4(gl_FragCoord.xy / ${f(v.p, 1)})) discard;\n// ≈ ${Math.round(Math.min(16, Math.ceil(v.a * 16 - 1e-9)) / 16 * 100)}% of pixels drawn`,
        },
        {
          title: 'The Bayer matrix',
          body: `<p>Which pixels go first? An <b>ordered dither</b> uses a small tiled grid of thresholds, the <b>Bayer matrix</b>. Each pixel of a 4×4 block gets a different threshold <code>k/16</code>, arranged so that kept pixels are spread out evenly at every opacity.</p>
<p>Rule: draw the pixel if <code>alpha &gt; k/16</code>. Slide the opacity and watch cells switch on in a nicely scattered order.</p>`,
          controls: [{ name: 'a', label: 'alpha × 16', min: 0, max: 16, step: 1, value: 6 }],
          visual: (el, v) => {
            const c = canvas2d(240, 240); const { ctx } = c;
            ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 240, 240);
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
              const k = Math.round(bayer4(x, y) * 16);
              const on = v.a > k;
              const px = x * 60, py = (3 - y) * 60;
              ctx.fillStyle = on ? '#ff9f43' : '#272a37'; ctx.fillRect(px + 2, py + 2, 56, 56);
              ctx.fillStyle = on ? '#1d1f29' : '#9aa0b4'; ctx.font = 'bold 20px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(String(k), px + 30, py + 37);
            }
            ctx.textAlign = 'start';
            el.append(c.el, h('p.center', { html: `alpha = ${v.a}/16 = ${n(v.a / 16, 3)} → <b>${v.a}</b> of 16 pixels drawn` }));
          },
          code: `float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\nfloat bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }\n\nif (alpha <= bayer4(gl_FragCoord.xy)) discard;`,
        },
        {
          title: 'Where it\'s used',
          body: `<ul>
<li><b>LOD cross-fades</b>: the old and new mesh dither in and out over a few frames instead of popping (Unity <i>LOD Cross Fade</i>, Unreal <i>Dithered LOD Transition</i>).</li>
<li><b>Camera fades</b>: a character or foliage between the camera and the player dithers out so you can see through it.</li>
<li><b>Hair and soft foliage</b> on renderers that don't want sorting.</li>
</ul>
<div class="note">Combined with <b>TAA</b> (which averages several frames with a slightly shifted pattern), the dither pattern blurs into smooth transparency. Without TAA it looks like a fine grid.</div>`,
        },
        {
          title: 'Dithering against banding',
          body: `<p>Dithering is also used for colour. An 8-bit screen has only 256 levels per channel; a slow gradient (sky, fog, vignette) shows visible <b>bands</b>.</p>
<p>Adding a tiny dither offset <b>before</b> rounding breaks the hard band edges into fine noise that the eye averages back into a smooth gradient.</p>`,
          controls: [
            { name: 'l', label: 'levels', min: 2, max: 32, step: 1, value: 8 },
            { name: 'd', label: 'dither (0/1)', min: 0, max: 1, step: 1, value: 0 },
          ],
          shader: (v) => ({ defs: BAYER_GLSL, frag: 'float g = uv.x * 0.8 + 0.1;\nfloat off = mix(0.5, bayer4(gl_FragCoord.xy), uD);\ncol = vec3(floor(g * uL + off) / uL) * vec3(0.7, 0.85, 1.0);', uniforms: { uL: v.l, uD: v.d } }),
          code: (v) => `// quantise to ${v.l} levels\ncol = floor(g * ${f(v.l, 1)} + ${v.d ? 'bayer4(gl_FragCoord.xy)' : '0.5'}) / ${f(v.l, 1)};`,
          quiz: { q: 'Why does dithered transparency not need sorting?', options: ['Each pixel is either fully drawn (writing depth) or discarded — no blending', 'The GPU sorts it automatically', 'It only works on opaque objects behind it'], answer: 0, explain: 'It\'s an alpha test with a per-pixel threshold.' },
        },
      ],
      games: [
        {
          id: 'be-the-dither', title: 'Be the dither', engine: 'paint', rounds: 4,
          blurb: 'Apply the Bayer thresholds: which pixels of the 4×4 block are drawn?',
          gen: (rng, level) => {
            const m = level === 1 ? rng.pick([4, 8, 12]) : rng.int(2, 14);
            const K = (x, y) => Math.round(bayer4(x, y) * 16);
            const table = (el) => {
              const c = canvas2d(160, 160); const { ctx } = c;
              ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, 160, 160);
              for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.strokeStyle = '#3a3f55'; ctx.strokeRect(x * 40 + 1, (3 - y) * 40 + 1, 38, 38); ctx.fillStyle = '#c9cde0'; ctx.font = 'bold 16px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(String(K(x, y)), x * 40 + 20, (3 - y) * 40 + 26); }
              el.append(h('div.small.dim.center', 'threshold k for each pixel (same layout as the grid below)'), c.el);
            };
            return {
              prompt: `Alpha = ${m}/16. Draw a pixel only if <b>alpha × 16 &gt; k</b>. Paint the drawn pixels.`,
              visual: table,
              w: 4, h: 4,
              palette: [{ color: [0.22, 0.23, 0.28], label: '✕' }, { color: [1, 0.62, 0.26], label: '✓' }],
              solve: (u, v, x, y) => (m > K(x, y) ? 1 : 0),
              explain: `<p>Cells with k from 0 to ${m - 1} are drawn: exactly <b>${m}</b> of 16 = ${n(m / 16 * 100, 1)}% coverage. The Bayer order spreads them out so the block looks like an even veil.</p>`,
            };
          },
        },
        {
          id: 'dither-count', title: 'Count the coverage', engine: 'numeric', rounds: 5,
          blurb: 'How many pixels does a dither pattern keep?',
          gen: (rng, level) => {
            if (level === 1) { const m = rng.pick([4, 8, 12, 2, 14]); return { prompt: `A 4×4 Bayer dither keeps a pixel when alpha × 16 &gt; k (k = 0…15). How many of the 16 pixels are drawn at alpha = ${n(m / 16, 4)}?`, answer: m, explain: `<p>alpha × 16 = ${m}, so thresholds 0…${m - 1} pass: <b>${m}</b> pixels.</p>` }; }
            if (level === 2 || rng.chance(0.5)) {
              const a = rng.pick([0.25, 0.5, 0.75]); const W = rng.pick([100, 200, 400]), H = rng.pick([100, 50, 200]);
              return { prompt: `An object covering ${W}×${H} pixels is dithered at alpha = ${n(a)}. About how many pixels are actually drawn?`, answer: W * H * a, tolerance: 1, explain: `<p>${W}×${H} = ${W * H} pixels × ${n(a)} = <b>${W * H * a}</b>. (The fragment shader still <i>runs</i> for all ${W * H} — dithering discards after shading starts, so it doesn't save shading cost.)</p>` };
            }
            const levels = rng.pick([4, 8, 16, 32]);
            return { prompt: `A gradient is quantised to ${levels} levels and shows bands. How many distinct brightness values can appear (without dither)?`, answer: levels, explain: `<p><code>floor(g * ${levels}.0) / ${levels}.0</code> gives ${levels} steps (${levels + 1} if g can reach exactly 1). Dithering doesn't add levels — it mixes neighbouring levels in a pattern so the eye sees in-between values.</p>` };
          },
        },
        {
          id: 'dither-facts', title: 'Dither facts', engine: 'mcq', rounds: 6,
          blurb: 'True/false about dithering.',
          questions: [
            tf('Dithered transparency discards some pixels in a pattern.', true, 'Screen-door: a per-pixel threshold.'),
            tf('Dithered objects must be sorted back to front.', false, 'They don\'t blend, so no sorting.'),
            tf('TAA helps dithered transparency look smooth.', true, 'It averages the pattern over frames.'),
            tf('A 4×4 Bayer matrix contains the thresholds 0/16 … 15/16, each once.', true, 'That\'s why it can express 17 coverage levels evenly.', 2),
            q('LOD cross-fades often use…', ['Dithering between the two LOD meshes', 'Additive blending', 'Multiply blending'], 'No sorting issues and both meshes write depth.'),
            q('Banding in a sky gradient is reduced by…', ['Adding a small dither before quantising', 'Lowering the resolution', 'Using multiply blending'], 'Dither breaks up hard band edges.'),
            tf('Dithering saves fragment shader work because pixels are discarded.', false, 'The shader runs, then discards. Coverage drops, cost doesn\'t.', 2),
            q('Why use an ordered (Bayer) pattern instead of random noise?', ['It spreads kept pixels evenly and stays stable', 'It\'s required by the GPU', 'It\'s more transparent'], 'Random noise clumps and flickers; Bayer is evenly spread.', { level: 2 }),
          ],
        },
      ],
    },
  ],
};
