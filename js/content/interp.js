// Topic — Interpolation & remapping: mix/lerp, inverse lerp, remap, gradients, gradient maps.
import { tf, q, f, v, n, G, css, canvas2d } from './_kit.js';

// ================================================================ helpers
const GR = { xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 };
const lvlPool = (arr, level) => arr.filter((x) => (x.lvl || 1) <= level);

/** Paint y = expr(x) as brightness and draw its curve on top (x = uv.x). */
const plotSpec = (expr, uniforms) => ({
  defs: `float plotF(float x){ return ${expr}; }`,
  frag: `float x = uv.x;\nfloat y = plotF(x);\ncol = vec3(clamp(y, 0.0, 1.0)) * 0.8;\n// distance to the curve, corrected for its slope\nfloat dy = (plotF(x + 0.003) - plotF(x - 0.003)) / 0.006;\nfloat d = abs(uv.y - y) / sqrt(1.0 + dy * dy);\ncol = mix(col, vec3(1.0, 0.45, 0.15), 1.0 - smoothstep(0.004, 0.011, d));`,
  uniforms,
});

const GRID = {
  frag: `vec2 g = abs(fract(uv * 4.0 + 0.5) - 0.5);\nfloat l = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y));\nvec2 g2 = abs(fract(uv * 20.0 + 0.5) - 0.5);\nfloat l2 = 1.0 - smoothstep(0.0, 0.05, min(g2.x, g2.y));\ncol = vec3(0.1, 0.11, 0.15) + l * 0.3 + l2 * 0.06;`,
};

/** A row of labelled colour swatches (for prompts) */
const swatches = (cols) => (el) => {
  el.style.cssText = 'display:flex;gap:12px;justify-content:center;margin:8px 0';
  cols.forEach(([c, label]) => {
    const d = document.createElement('div');
    d.style.cssText = 'width:84px;text-align:center;font-size:12px;color:var(--dim)';
    d.innerHTML = `<div style="height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:${css(c)}"></div>${label}`;
    el.append(d);
  });
};

/** Two rulers (input range on top, output range below) with a value mapped across. */
function rulers(el, { x, a, b, c, d, label = 'x' }) {
  const W = 320, H = 150;
  const cv = canvas2d(W, H);
  const ctx = cv.ctx;
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, W, H);
  const L = 30, R = W - 30, y1 = 45, y2 = 115;
  const t = (x - a) / (b - a);
  const px = L + (R - L) * t;
  const ruler = (y, lo, hi, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
    ctx.lineWidth = 1;
    for (let k = 0; k <= 10; k++) { const xx = L + ((R - L) * k) / 10; ctx.beginPath(); ctx.moveTo(xx, y - (k % 5 ? 4 : 8)); ctx.lineTo(xx, y + (k % 5 ? 4 : 8)); ctx.stroke(); }
    ctx.fillStyle = color; ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
    ctx.fillText(n(lo, 2), L, y + 22); ctx.fillText(n(hi, 2), R, y + 22); ctx.fillText(n((lo + hi) / 2, 2), (L + R) / 2, y + 22);
  };
  ruler(y1, a, b, '#6bdfff');
  ruler(y2, c, d, '#ff7ab2');
  ctx.strokeStyle = '#ffd479'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, y1); ctx.lineTo(px, y2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ffd479';
  [y1, y2].forEach((y) => { ctx.beginPath(); ctx.arc(px, y, 6, 0, Math.PI * 2); ctx.fill(); });
  ctx.font = 'bold 13px -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${label} = ${n(x, 2)}`, Math.min(R, Math.max(L, px)), y1 - 14);
  ctx.fillText(`→ ${n(c + (d - c) * t, 2)}`, Math.min(R, Math.max(L, px)), y2 + 38 > H ? y2 - 14 : y2 + 38);
  ctx.fillStyle = '#9aa0b4'; ctx.font = '11px -apple-system, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('input range', 4, 14); ctx.fillText(`t = ${n(t, 3)}`, W - 70, 14);
  el.append(cv.el);
}

/** Tap score along one axis */
const score1 = (targets, r = 0.04) => (u) => {
  const d = Math.min(...targets.map((t) => Math.abs(u - t)));
  return d <= r ? 1 : Math.max(0, 1 - (d - r) / (r * 3));
};

// colour pairs that stay distinguishable when mixed
const PAIRS = [
  [[1, 0, 0], [0, 0, 1], 'red', 'blue'],
  [[1, 1, 0], [0, 0, 1], 'yellow', 'blue'],
  [[0, 0, 0], [1, 1, 1], 'black', 'white'],
  [[1, 0.5, 0], [0, 0.8, 1], 'orange', 'sky'],
  [[0, 1, 0], [1, 0, 1], 'green', 'magenta'],
  [[0.1, 0.1, 0.4], [1, 0.9, 0.3], 'navy', 'gold'],
];
const A0 = [0.08, 0.12, 0.35], B0 = [1, 0.6, 0.2];

// palette texture stops (for reference in text)
const RAMP = (name = 'palette', u = 'uRamp') => ({ [u]: { name, wrap: 'clamp' } });

export default {
  id: 'interp',
  title: 'Interpolation & remapping',
  icon: '🔁',
  blurb: 'mix/lerp, inverse lerp, remap, gradients and gradient maps: moving between values.',
  cheatsheet: `
<pre class="code">// lerp: t 0→a, 1→b
mix(a, b, t) = a + (b - a) * t
// inverse lerp: where is x? → t
invLerp(a, b, x) = (x - a) / (b - a)
// remap a..b → c..d
remap(x, a, b, c, d)
  = mix(c, d, invLerp(a, b, x))
x * 0.5 + 0.5   // -1..1 → 0..1
x * 2.0 - 1.0   // 0..1 → -1..1</pre>
<ul>
<li>t outside 0..1 <b>extrapolates</b> (goes past a or b). Use <code>saturate(t)</code> if that's not wanted.</li>
<li>Every gradient = "compute a t per pixel, then mix". Linear: <code>dot(uv - 0.5, dir) + 0.5</code>. Radial: <code>length(uv - c) / r</code>.</li>
<li>Gradient map / ramp: <code>texture2D(uRamp, vec2(t, 0.5))</code> turns a grey value into a colour.</li>
<li>smoothstep = inverse lerp + clamp + S-curve.</li>
</ul>
<p>HLSL/nodes: <code>lerp</code>, Lerp (A, B, Alpha), Remap, InverseLerp, Sample Gradient, Curve Atlas.</p>`,
  concepts: [
    // ------------------------------------------------------------------ mix
    {
      id: 'interp.mix',
      title: 'mix / lerp',
      blurb: 'Blend two values (or colours) by an amount t.',
      lesson: [
        {
          title: 'Walking from a to b',
          body: `<p><code>mix(a, b, t)</code> gives you a value <b>part of the way</b> from <code>a</code> to <code>b</code>. <code>t</code> says how far: 0 = at a, 1 = at b, 0.5 = halfway.</p>
<div class="analogy">🚶 <b>Analogy:</b> walking from home (a) to the shop (b). t is the fraction of the trip you've done. t = 0.25: a quarter of the way there.</div>
<p>The graph shows mix(a, b, t) for every t — always a <b>straight line</b> from a to b.</p>`,
          controls: [
            { name: 'a', label: 'a', min: 0, max: 1, step: 0.01, value: 0.2 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.01, value: 0.9 },
            { name: 't', label: 't', min: 0, max: 1, step: 0.01, value: 0.25 },
          ],
          graph: {
            fns: (p) => [{ f: (t) => G.mix(p.a, p.b, t), label: 'mix(a, b, t)' }],
            opts: (p) => ({ ...GR, points: [{ x: p.t, y: G.mix(p.a, p.b, p.t), label: n(G.mix(p.a, p.b, p.t), 3) }, { x: 0, y: p.a, color: '#6bdfff', label: 'a' }, { x: 1, y: p.b, color: '#ff7ab2' }], vlines: [{ x: p.t, color: '#6c7289', label: 't' }] }),
          },
          code: (p) => `mix(${f(p.a, 2)}, ${f(p.b, 2)}, ${f(p.t, 2)}) = ${n(G.mix(p.a, p.b, p.t), 3)}`,
        },
        {
          title: 'The formula',
          body: `<p>Two equivalent ways to write it:</p>
<pre class="code">mix(a, b, t) = a + (b - a) * t
             = a * (1.0 - t) + b * t</pre>
<p>The first: "start at a, add t of the distance to b". The second: "take (1 − t) parts of a and t parts of b" — like mixing paint: t = 0.25 is 75% a + 25% b.</p>`,
          controls: [{ name: 't', label: 't', min: 0, max: 1, step: 0.01, value: 0.25 }],
          code: (p) => `float a = 2.0, b = 6.0;\n\n// start + t × distance\na + (b - a) * t = 2 + 4 × ${n(p.t, 2)} = ${n(2 + 4 * p.t, 3)}\n\n// weighted average\na * (1 - t) + b * t = 2 × ${n(1 - p.t, 2)} + 6 × ${n(p.t, 2)} = ${n(2 * (1 - p.t) + 6 * p.t, 3)}`,
        },
        {
          title: 'Mixing colours',
          body: `<p>mix works on <b>vectors</b> too, one channel at a time. So it blends colours:</p>
<pre class="code">mix(red, blue, 0.25) = (0.75, 0.0, 0.25)</pre>
<p>Top: the mixed colour. Bottom: the whole journey from red to blue, with your t marked.</p>`,
          controls: [{ name: 't', label: 't', min: 0, max: 1, step: 0.01, value: 0.25 }],
          shader: (p) => ({ frag: 'vec3 A = vec3(1.0, 0.0, 0.0);\nvec3 B = vec3(0.0, 0.0, 1.0);\ncol = mix(A, B, uT);\nif (uv.y < 0.25) {\n  col = mix(A, B, uv.x);\n  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.004, 0.009, abs(uv.x - uT)));\n}', uniforms: { uT: p.t } }),
          code: (p) => `col = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), ${f(p.t, 2)});\n// = vec3(${n(1 - p.t, 2)}, 0.0, ${n(p.t, 2)})`,
        },
        {
          title: 't can come from anywhere',
          body: `<p>The power move: <b>t is just a number per pixel</b>. Feed in any mask or gradient and mix picks the colour:</p>
<ul><li><code>uv.x</code> → a gradient</li><li><code>step(…)</code> → a hard switch between two colours</li><li><code>smoothstep(…)</code> of a distance → a soft circle in colour B on colour A</li></ul>
<div class="note">mix with a 0/1 mask is an <b>if without if</b>: <code>mix(A, B, mask)</code> = "A where the mask is 0, B where it's 1".</div>`,
          controls: [{ name: 'k', label: 't source #', min: 0, max: 3, step: 1, value: 0 }],
          shader: (p) => ({ frag: `vec3 A = vec3(0.08, 0.12, 0.35);\nvec3 B = vec3(1.0, 0.6, 0.2);\nfloat t = ${['uv.x', 'step(0.5, uv.x)', '1.0 - smoothstep(0.25, 0.3, length(uv - 0.5))', '0.5 + 0.5 * sin(uv.y * TAU * 3.0)'][Math.round(p.k)]};\ncol = mix(A, B, t);` }),
          code: (p) => `float t = ${['uv.x;                 // gradient', 'step(0.5, uv.x);      // hard switch', '1.0 - smoothstep(0.25, 0.3, length(uv - 0.5)); // soft circle', '0.5 + 0.5 * sin(uv.y * TAU * 3.0); // waves'][Math.round(p.k)]}\ncol = mix(A, B, t);`,
        },
        {
          title: 't outside 0..1',
          body: `<p>Nothing stops t from being 1.5 or −0.5. mix then <b>extrapolates</b>: it keeps going along the same line, past b or before a.</p>
<p>Sometimes that's useful (overshoot, boosting saturation). Often it's a bug: colours go below 0 or above 1. If in doubt, <code>mix(a, b, saturate(t))</code>.</p>`,
          controls: [{ name: 't', label: 't', min: -0.5, max: 1.5, step: 0.01, value: 1.3 }],
          graph: { fns: [{ f: (t) => G.mix(0.3, 0.7, t), label: 'mix(0.3, 0.7, t)' }], opts: (p) => ({ xmin: -0.5, xmax: 1.5, ymin: 0, ymax: 1.1, points: [{ x: p.t, y: G.mix(0.3, 0.7, p.t), label: n(G.mix(0.3, 0.7, p.t), 2) }], vlines: [{ x: 0, color: '#3ddc97' }, { x: 1, color: '#3ddc97' }] }) },
          code: (p) => `mix(0.3, 0.7, ${f(p.t, 2)}) = ${n(G.mix(0.3, 0.7, p.t), 3)}${p.t > 1 ? '  // past b!' : p.t < 0 ? '  // before a!' : ''}`,
          after: '<div class="tip">HLSL calls it <code>lerp</code> (linear interpolation). Unreal: <b>Lerp</b> node with A, B, Alpha. Shader Graph: <b>Lerp</b> with A, B, T. All the same maths.</div>',
          quiz: { q: 'What is <code>mix(2.0, 4.0, 0.25)</code>?', options: ['2.5', '3.0', '0.5', '2.25'], answer: 0, explain: 'Start at 2, add a quarter of the distance (2): 2 + 0.5 = 2.5.' },
        },
      ],
      games: [
        {
          id: 'mix-eval', title: 'Compute mix', engine: 'numeric', rounds: 6,
          blurb: 'Where do you land between a and b?',
          gen: (rng, level) => {
            if (level === 2 && rng.chance(0.5)) {
              const [A, B, an, bn] = rng.pick(PAIRS.filter((p) => p[2] !== 'black' && [...p[0], ...p[1]].every((c) => c === 0 || c === 1)));
              const t = rng.pick([0.25, 0.5, 0.75]);
              const ans = G.mix(A, B, t).map((x) => +x.toFixed(4));
              return {
                prompt: `What is <code>mix(${v(A)}, ${v(B)}, ${f(t)})</code>?`,
                sub: 'mix works on each channel separately.',
                visual: swatches([[A, an], [ans, '?'], [B, bn]].map(([c, l]) => [l === '?' ? [0.2, 0.2, 0.2] : c, l])),
                answer: ans, wrap: 'vec3', labels: ['r', 'g', 'b'],
                explain: `<p>Per channel: a + (b − a) × ${n(t)}.<br>r: ${n(A[0])} → ${n(B[0])} gives ${n(ans[0])}<br>g: ${n(A[1])} → ${n(B[1])} gives ${n(ans[1])}<br>b: ${n(A[2])} → ${n(B[2])} gives ${n(ans[2])}</p>`,
              };
            }
            let a, b, t;
            if (level === 1) { a = rng.int(0, 5) * 2; b = a + rng.int(1, 5) * 2; t = rng.pick([0, 0.25, 0.5, 0.75, 1]); if (rng.chance(0.3)) [a, b] = [b, a]; }
            else if (level === 2) { a = rng.step(0, 0.5, 0.1); b = +(a + rng.step(0.2, 0.5, 0.1)).toFixed(2); t = rng.pick([0.25, 0.5, 0.75]); }
            else { a = rng.int(0, 4); b = a + rng.pick([2, 4]); t = rng.pick([-0.5, 1.5, 2, -0.25, 1.25]); }
            const ans = +G.mix(a, b, t).toFixed(4);
            return {
              prompt: `What is <code>mix(${f(a)}, ${f(b)}, ${f(t)})</code>?`,
              sub: level === 3 ? 't is outside 0..1 — keep going along the line!' : undefined,
              answer: ans,
              explain: `<p>a + (b − a) × t = ${n(a)} + (${n(b - a)}) × ${n(t)} = <b>${n(ans)}</b>.</p>${t > 1 || t < 0 ? `<p>t = ${n(t)} is ${t > 1 ? 'past b' : 'before a'}, so the result lands outside the a..b range.</p>` : ''}`,
            };
          },
        },
        {
          id: 'mix-color', title: 'Which colour?', engine: 'mcq', rounds: 8,
          blurb: 'Predict the colour mix() gives.',
          gen: (rng, level) => {
            const [A, B, an, bn] = rng.pick(PAIRS);
            const T = level === 1 ? [0, 0.25, 0.5, 0.75, 1] : [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];
            const t = rng.pick(level === 1 ? [0.25, 0.5, 0.75] : T);
            const others = rng.shuffle(T.filter((x) => Math.abs(x - t) >= (level === 3 ? 0.15 : 0.24)));
            const ts = [t, ...others.slice(0, 3)];
            return {
              prompt: `<code>mix(${an}, ${bn}, ${f(t)})</code> — which colour?`,
              sub: level === 1 ? 'Small t = close to the first colour.' : undefined,
              visual: swatches([[A, `${an} (t = 0)`], [B, `${bn} (t = 1)`]]),
              options: ts.map((x) => ({ color: G.mix(A, B, x) })),
              explain: `<p>t = ${n(t)} → ${n(Math.round((1 - t) * 100))}% ${an} + ${n(Math.round(t * 100))}% ${bn}. Swapping the arguments would give the mirror colour (t → 1 − t).</p>`,
            };
          },
        },
        {
          id: 'mix-tune', title: 'Find t', engine: 'slider', rounds: 4,
          blurb: 'Slide t until your blended colour matches.',
          gen: (rng, level) => {
            const [A, B, an, bn] = rng.pick(PAIRS);
            const strip = level < 3;
            const tt = rng.step(0.1, 0.9, level === 1 ? 0.25 : 0.05);
            return {
              prompt: `Set <b>t</b> so <code>mix(${an}, ${bn}, t)</code> matches the target.`,
              sub: strip ? 'The strip at the bottom shows the whole range from t = 0 to 1.' : 'No helper strip this time — judge the blend by eye.',
              params: [{ name: 't', label: 't', min: 0, max: 1, step: 0.01, target: tt }],
              build: (p) => ({ frag: `col = mix(uA, uB, uT);${strip ? '\nif (uv.y < 0.18) col = mix(uA, uB, uv.x);' : ''}`, uniforms: { uA: A, uB: B, uT: p.t } }),
              code: (p) => `col = mix(${v(A, 2)}, ${v(B, 2)}, ${f(p.t, 2)});\n// = ${v(G.mix(A, B, p.t), 2)}`,
              explain: `<p>t = ${n(tt)}: the target sits ${n(Math.round(tt * 100))}% of the way from ${an} to ${bn}. Each channel moves the same fraction of its own distance.</p>`,
            };
          },
        },
        {
          id: 'mix-fill', title: 'Wire up the mix', engine: 'codefill', rounds: 4,
          blurb: 'Choose a, b and t to recreate the target.',
          gen: (rng, level) => {
            const [A, B, an, bn] = rng.pick(PAIRS);
            const T = [
              { e: 'uv.x', lvl: 1 }, { e: 'uv.y', lvl: 1 }, { e: '1.0 - uv.x', lvl: 1 },
              { e: 'step(0.5, uv.x)', lvl: 2 }, { e: 'step(0.5, uv.y)', lvl: 2 },
              { e: 'smoothstep(0.2, 0.3, length(uv - 0.5))', lvl: 3 }, { e: '0.5 + 0.5 * sin(uv.x * TAU * 2.0)', lvl: 3 },
            ];
            const pool = lvlPool(T, level).map((x) => x.e);
            const te = rng.pick(pool);
            const tOpts = rng.shuffle(pool.filter((x) => x !== te)).slice(0, 3);
            const Av = v(A, 1), Bv = v(B, 1);
            const tmpl = level === 1 ? `vec3 A = ${Av}; // ${an}\nvec3 B = ${Bv}; // ${bn}\ncol = mix(A, B, [[0]]);` : `vec3 A = ${Av}; // ${an}\nvec3 B = ${Bv}; // ${bn}\ncol = mix([[0]], [[1]], [[2]]);`;
            const slots = level === 1
              ? [{ options: [...tOpts.slice(0, 1), te, ...tOpts.slice(1)], answer: te }]
              : [{ options: ['B', 'A'], answer: 'A' }, { options: ['A', 'B'], answer: 'B' }, { options: [...tOpts.slice(0, 1), te, ...tOpts.slice(1)], answer: te }];
            const fill = (vals) => tmpl.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Fill the blanks so "Yours" matches the target.',
              sub: level > 1 ? 'Careful: mix(B, A, t) is the same as mix(A, B, 1 − t).' : `t = 0 gives ${an}, t = 1 gives ${bn}.`,
              template: tmpl, slots,
              build: (vals) => ({ frag: fill(vals) }),
              explain: `<p>Where the target shows ${an}, t must be 0; where it shows ${bn}, t must be 1. That pattern is <code>${te}</code>.</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ inverse lerp
    {
      id: 'interp.invlerp',
      title: 'Inverse lerp',
      blurb: 'The question in reverse: where is x between a and b?',
      lesson: [
        {
          title: 'The question in reverse',
          body: `<p><b>mix</b> answers: "I'm t of the way from a to b — what value am I at?"</p>
<p><b>Inverse lerp</b> answers the opposite: "I'm at value x — <b>how far</b> (t) between a and b is that?"</p>
<div class="analogy">📥 <b>Analogy:</b> a download bar. The file is 200 MB, you have 50 MB. How full is the bar? 50 / 200 = 0.25. That's an inverse lerp from 0 to 200.</div>`,
          controls: [{ name: 'x', label: 'x', min: 20, max: 120, step: 1, value: 45 }],
          visual: (el, p) => rulers(el, { x: p.x, a: 20, b: 120, c: 0, d: 1 }),
          code: (p) => `// health bar: empty at 20, full at 120\nfloat t = (${f(p.x)} - 20.0) / (120.0 - 20.0); // = ${n((p.x - 20) / 100, 3)}`,
        },
        {
          title: 'The formula',
          body: `<pre class="code">t = (x - a) / (b - a)</pre>
<ul><li><code>x - a</code>: how far past the start you are</li><li><code>b - a</code>: how long the whole trip is</li><li>divide: what <b>fraction</b> of the trip that is</li></ul>
<p>At x = a you get 0, at x = b you get 1. Drag the ends and x to see the line.</p>`,
          controls: [
            { name: 'a', label: 'a', min: 0, max: 1, step: 0.01, value: 0.2 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.01, value: 0.7 },
            { name: 'x', label: 'x', min: 0, max: 1, step: 0.01, value: 0.45 },
          ],
          graph: {
            fns: (p) => [{ f: (x) => (x - p.a) / (p.b - p.a || 1e-6), label: 't = (x − a)/(b − a)' }],
            opts: (p) => ({ xmin: 0, xmax: 1, ymin: -0.5, ymax: 1.5, hlines: [{ y: 0, color: '#3ddc97' }, { y: 1, color: '#3ddc97' }], vlines: [{ x: p.a, color: '#6bdfff', label: 'a' }, { x: p.b, color: '#ff7ab2', label: 'b' }], points: [{ x: p.x, y: (p.x - p.a) / (p.b - p.a || 1e-6), label: 't=' + n((p.x - p.a) / (p.b - p.a || 1e-6), 2) }] }),
          },
          code: (p) => `t = (${f(p.x, 2)} - ${f(p.a, 2)}) / (${f(p.b, 2)} - ${f(p.a, 2)})\n  = ${n(p.x - p.a, 2)} / ${n(p.b - p.a, 2)} = ${n((p.x - p.a) / (p.b - p.a || 1e-6), 3)}`,
        },
        {
          title: 'In a shader: a ramp anywhere',
          body: `<p>Use <code>uv.x</code> as x and you get a ramp that is black at a and white at b — exactly where you want it.</p>
<p>Outside a..b it keeps going (below 0, above 1). Add <code>saturate</code> to stop it: that's often called <b>linearstep</b>.</p>`,
          controls: [
            { name: 'a', label: 'a', min: 0, max: 1, step: 0.01, value: 0.3 },
            { name: 'b', label: 'b', min: 0, max: 1, step: 0.01, value: 0.6 },
          ],
          shader: (p) => plotSpec('(x - uA) / (uB - uA)', { uA: p.a, uB: p.b }),
          code: (p) => `float t = (uv.x - ${f(p.a, 2)}) / (${f(p.b, 2)} - ${f(p.a, 2)});\ncol = vec3(saturate(t));`,
        },
        {
          title: 'smoothstep is an inverse lerp!',
          body: `<p>Look back at smoothstep's first line:</p>
<pre class="code">t = (x - e0) / (e1 - e0);
t = clamp(t, 0.0, 1.0);</pre>
<p>That's a saturated inverse lerp. smoothstep then only adds the S-curve. So:</p>
<ul><li>want a <b>linear</b> fade between two values → inverse lerp + saturate</li><li>want a <b>soft-eased</b> fade → smoothstep</li></ul>`,
          graph: { fns: [{ f: (x) => G.saturate((x - 0.2) / 0.6), label: 'saturate(invLerp)', color: '#6bdfff' }, { f: (x) => G.smoothstep(0.2, 0.8, x), label: 'smoothstep' }], opts: GR },
        },
        {
          title: 'Real use: fading by distance',
          body: `<p>"Start fading at distance <b>near</b>, be fully gone at <b>far</b>." That's an inverse lerp on a distance. Fog, LOD fades, soft particles, proximity glows all work this way.</p>`,
          controls: [
            { name: 'a', label: 'near', min: 0, max: 0.7, step: 0.01, value: 0.15 },
            { name: 'b', label: 'far', min: 0, max: 0.7, step: 0.01, value: 0.45 },
          ],
          shader: (p) => ({ frag: 'float d = length(uv - 0.5);\nfloat t = saturate((d - uA) / (uB - uA));\ncol = mix(vec3(1.0, 0.6, 0.2), vec3(0.08, 0.12, 0.35), t);', uniforms: { uA: p.a, uB: p.b } }),
          code: (p) => `float d = length(uv - 0.5);\nfloat t = saturate((d - ${f(p.a, 2)}) / (${f(p.b, 2)} - ${f(p.a, 2)}));\ncol = mix(orange, navy, t); // orange near, navy far`,
          quiz: { q: 'a = 10, b = 30, x = 25. What is the inverse lerp t?', options: ['0.75', '0.25', '0.83', '2.5'], answer: 0, explain: '(25 − 10) / (30 − 10) = 15 / 20 = 0.75.' },
        },
      ],
      games: [
        {
          id: 'inv-eval', title: 'Compute t', engine: 'numeric', rounds: 6,
          blurb: 'How far between a and b is x?',
          gen: (rng, level) => {
            let a, b, x;
            const t = level === 1 ? rng.pick([0, 0.25, 0.5, 0.75, 1]) : level === 2 ? rng.pick([0.1, 0.2, 0.25, 0.4, 0.6, 0.75, 0.8]) : rng.pick([-0.5, -0.25, 1.25, 1.5, 0.25, 0.75]);
            if (level === 1) { a = 0; b = rng.pick([4, 8, 10, 20, 100]); }
            else { a = rng.pick([10, 20, 40, 50]); b = a + rng.pick([20, 40, 100]); }
            if (level === 3 && rng.chance(0.4)) [a, b] = [b, a];
            x = +(a + (b - a) * t).toFixed(4);
            return {
              prompt: `a = ${n(a)}, b = ${n(b)}, x = ${n(x)}<br>What is <code>t = (x - a) / (b - a)</code>?`,
              sub: level === 3 ? 'x may be outside a..b, and a can be bigger than b!' : undefined,
              answer: t,
              explain: `<p>(${n(x)} − ${n(a)}) / (${n(b)} − ${n(a)}) = ${n(x - a)} / ${n(b - a)} = <b>${n(t)}</b>.</p>${t < 0 || t > 1 ? '<p>t outside 0..1 means x is outside the a..b range.</p>' : ''}${a > b ? '<p>When a &gt; b the range runs backwards — still the same formula.</p>' : ''}`,
            };
          },
        },
        {
          id: 'inv-tap', title: 'Place it on the ruler', engine: 'tap', rounds: 6,
          blurb: 'The ruler runs from a to b. Tap where x is.',
          gen: (rng, level) => {
            const a = level === 1 ? 0 : rng.pick([10, 20, 50, -1, 100]);
            const span = level === 1 ? rng.pick([1, 10, 100]) : rng.pick([10, 20, 40, 50, 2]);
            const rev = level === 3 && rng.chance(0.5);
            const lo = a, hi = a + span;
            const L = rev ? hi : lo, R = rev ? lo : hi;
            const t = level === 1 ? rng.pick([0.2, 0.25, 0.75, 0.8]) : rng.step(0.1, 0.9, 0.05);
            const x = +(L + (R - L) * t).toFixed(3);
            return {
              prompt: `The ruler goes from <b>${n(L)}</b> (left) to <b>${n(R)}</b> (right). Tap where <b>${n(x)}</b> is.`,
              sub: 'That position IS the inverse lerp t (0 = left edge, 1 = right edge).',
              draw: (ctx, w, h) => {
                ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, w, h);
                const grd = ctx.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#16203f'); grd.addColorStop(1, '#ff9a33');
                ctx.fillStyle = grd; ctx.fillRect(0, h * 0.38, w, h * 0.24);
                ctx.strokeStyle = '#cfd3e3'; ctx.lineWidth = 1;
                for (let k = 0; k <= 20; k++) { const xx = (k / 20) * w; const big = k % 5 === 0; ctx.beginPath(); ctx.moveTo(xx, h * 0.62); ctx.lineTo(xx, h * 0.62 + (big ? 16 : 8)); ctx.stroke(); }
                ctx.fillStyle = '#fff'; ctx.font = 'bold 16px -apple-system, sans-serif';
                ctx.textAlign = 'left'; ctx.fillText(n(L), 4, h * 0.33);
                ctx.textAlign = 'right'; ctx.fillText(n(R), w - 4, h * 0.33);
                if (level === 1) { ctx.textAlign = 'center'; ctx.font = '13px -apple-system, sans-serif'; ctx.fillStyle = '#9aa0b4'; ctx.fillText(n((L + R) / 2), w / 2, h * 0.33); }
              },
              score: score1([t], 0.035),
              reveal: [[t, 0.5]],
              explain: `<p>t = (${n(x)} − ${n(L)}) / (${n(R)} − ${n(L)}) = <b>${n(t, 3)}</b> → ${n(Math.round(t * 100))}% of the way across.</p>`,
            };
          },
        },
        {
          id: 'inv-image', title: 'Which ramp code?', engine: 'mcq', rounds: 8,
          blurb: 'See a ramp, pick the inverse-lerp code that makes it.',
          gen: (rng, level) => {
            const S = level === 1 ? 0.2 : 0.1;
            const a = rng.step(0.1, 0.5, S), b = +(a + rng.step(0.2, 0.4, S)).toFixed(2);
            const w = +(b - a).toFixed(2);
            const ok = `saturate((uv.x - ${f(a)}) / ${f(w)})`;
            const wrong = [
              `saturate((uv.x - ${f(b)}) / ${f(w)})`,
              `saturate((${f(b)} - uv.x) / ${f(w)})`,
              `saturate((uv.x - ${f(a)}) / ${f(b)})`,
              `saturate(uv.x / ${f(w)})`,
              Math.abs(w * 2 - b) > 1e-6 ? `saturate((uv.x - ${f(a)}) / ${f(Math.min(0.9, w * 2))})` : `saturate((uv.x - ${f(a)}) / ${f(w / 2)})`,
            ].filter((e) => e !== ok);
            const opts = [ok, ...rng.shuffle([...new Set(wrong)]).slice(0, 3)];
            return {
              prompt: `This ramp is black until <b>${n(a)}</b> and white from <b>${n(b)}</b>. Which code makes it?`,
              shader: plotSpec(ok.replace(/uv\.x/g, 'x')),
              options: opts.map((e) => ({ code: e })),
              explain: `<p>Inverse lerp from a = ${n(a)} to b = ${n(b)}: subtract a (so the ramp starts at a), divide by b − a = ${n(w)} (so it reaches 1 at b). Dividing by b instead of (b − a) is the classic mistake.</p>`,
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ remap
    {
      id: 'interp.remap',
      title: 'Remapping ranges',
      blurb: 'Inverse lerp, then lerp: move a value from one range to another.',
      lesson: [
        {
          title: 'Two rulers',
          body: `<p>Remapping = moving a value from one <b>range</b> to another, keeping its relative position.</p>
<div class="analogy">🌡️ <b>Analogy:</b> a thermometer with °C on one side and °F on the other. Same mercury height, two different numbers. Remap converts between the two scales.</div>
<p>Below: the blue ruler is −1..1 (like a sin wave), the pink one 0..1 (like a colour).</p>`,
          controls: [{ name: 'x', label: 'x', min: -1, max: 1, step: 0.01, value: 0.4 }],
          visual: (el, p) => rulers(el, { x: p.x, a: -1, b: 1, c: 0, d: 1 }),
          code: (p) => `// -1..1 → 0..1\nfloat y = ${f(p.x, 2)} * 0.5 + 0.5; // = ${n(p.x * 0.5 + 0.5, 3)}`,
        },
        {
          title: 'Remap = inverse lerp, then lerp',
          body: `<p>Two steps you already know:</p>
<pre class="code">// 1. where in the input range?
float t = (x - inMin) / (inMax - inMin);
// 2. same spot in the output range
float y = mix(outMin, outMax, t);</pre>
<p>This app (like many shader libraries) has <code>remap(x, inMin, inMax, outMin, outMax)</code> built in.</p>`,
          controls: [
            { name: 'x', label: 'x', min: 0, max: 100, step: 1, value: 30 },
            { name: 'c', label: 'outMin', min: -1, max: 1, step: 0.05, value: 0.2 },
            { name: 'd', label: 'outMax', min: -1, max: 1, step: 0.05, value: 0.8 },
          ],
          visual: (el, p) => rulers(el, { x: p.x, a: 0, b: 100, c: p.c, d: p.d }),
          code: (p) => `float t = (${f(p.x)} - 0.0) / (100.0 - 0.0);  // ${n(p.x / 100, 3)}\nfloat y = mix(${f(p.c, 2)}, ${f(p.d, 2)}, t);   // ${n(G.mix(p.c, p.d, p.x / 100), 3)}`,
          after: '<div class="tip">Unity Shader Graph: <b>Remap</b> node (In Min Max, Out Min Max). Unreal: <b>RemapValueRange</b>, or Inverse Lerp + Lerp. Houdini: <code>fit()</code>.</div>',
        },
        {
          title: 'The two you\'ll use every day',
          body: `<p>Memorise these shortcuts — they're remaps with the maths already simplified:</p>
<pre class="code">// -1..1 → 0..1 (sin, normals → colour)
x * 0.5 + 0.5
// 0..1 → -1..1 (uv → centred coords)
x * 2.0 - 1.0</pre>
<p>Left: a sphere's normals (−1..1) shown raw — negative parts are black. Right: remapped with ×0.5+0.5 — now every direction has a colour. That's what a normal map looks like!</p>`,
          shaders: [
            { spec: { frag: 'vec4 s = sphereNormal(uv);\ncol = s.xyz * s.w;' }, label: 'raw normal' },
            { spec: { frag: 'vec4 s = sphereNormal(uv);\ncol = (s.xyz * 0.5 + 0.5) * s.w;' }, label: 'normal * 0.5 + 0.5' },
          ],
          code: 'vec3 n = sphereNormal(uv).xyz;   // -1..1 per axis\ncol = n * 0.5 + 0.5;             // 0..1 → visible colour',
        },
        {
          title: 'Centred coordinates',
          body: `<p>The other direction: <code>uv * 2.0 - 1.0</code> turns 0..1 into −1..1, so the <b>centre is (0, 0)</b>. Circles, rotations and symmetry are much easier around the origin.</p>
<p>Drag the scale to see how the range changes. With 2 and 1 the centre lands at 0 and the edges at ±1.</p>`,
          controls: [
            { name: 's', label: 'scale', min: 0.5, max: 3, step: 0.05, value: 2 },
            { name: 'o', label: 'offset', min: 0, max: 2, step: 0.05, value: 1 },
          ],
          shader: (p) => ({ frag: 'vec2 q = uv * uS - uO;\ncol = vec3(saturate(q), 0.0) + 0.6 * vec3(1.0 - smoothstep(0.0, 0.02, abs(length(q) - 0.5)));\ncol += 0.4 * vec3(1.0 - smoothstep(0.0, 0.01, min(abs(q.x), abs(q.y))));', uniforms: { uS: p.s, uO: p.o } }),
          code: (p) => `vec2 p = uv * ${f(p.s, 2)} - ${f(p.o, 2)}; // ${n(-p.o, 2)} .. ${n(p.s - p.o, 2)}\n// white ring: length(p) = 0.5   white cross: p = 0`,
        },
        {
          title: 'General remap in a shader',
          body: `<p>Any range to any range. Here <code>uv.x</code> (0..1) is remapped from an input range you choose to 0..1. Narrow input range = steeper ramp (more contrast). Swap the ends = reversed.</p>`,
          controls: [
            { name: 'a', label: 'inMin', min: 0, max: 1, step: 0.01, value: 0.25 },
            { name: 'b', label: 'inMax', min: 0, max: 1, step: 0.01, value: 0.75 },
          ],
          shader: (p) => plotSpec('remap(x, uA, uB, 0.0, 1.0)', { uA: p.a, uB: p.b }),
          code: (p) => `col = vec3(remap(uv.x, ${f(p.a, 2)}, ${f(p.b, 2)}, 0.0, 1.0));`,
          quiz: { q: 'Remap 5 from the range 0..10 to the range 100..200.', options: ['150', '105', '50', '500'], answer: 0, explain: 't = 5 / 10 = 0.5. Halfway from 100 to 200 = 150.' },
        },
      ],
      games: [
        {
          id: 'remap-eval', title: 'Compute remaps', engine: 'numeric', rounds: 6,
          blurb: 'Convert values between ranges.',
          gen: (rng, level) => {
            const kinds = [
              () => { const x = rng.pick([-1, -0.5, 0, 0.5, 1, -0.2, 0.6]); return { e: `${f(x)} * 0.5 + 0.5`, txt: `Remap ${n(x)} from −1..1 to 0..1`, ans: x * 0.5 + 0.5, why: `${n(x)} × 0.5 + 0.5 = ${n(x * 0.5 + 0.5)}.` }; },
              () => { const x = rng.pick([0, 0.25, 0.5, 0.75, 1, 0.1, 0.9]); return { e: `${f(x)} * 2.0 - 1.0`, txt: `Remap ${n(x)} from 0..1 to −1..1`, ans: +(x * 2 - 1).toFixed(4), why: `${n(x)} × 2 − 1 = ${n(x * 2 - 1)}.` }; },
              () => { const a = rng.pick([0, 10, 20]), w = rng.pick([10, 20, 40]), c = rng.pick([0, 100, 1]), dw = rng.pick([1, 10, 100]); const t = rng.pick([0.25, 0.5, 0.75]); const x = a + w * t; return { txt: `Remap ${n(x)} from ${n(a)}..${n(a + w)} to ${n(c)}..${n(c + dw)}`, ans: c + dw * t, why: `t = (${n(x)} − ${n(a)}) / ${n(w)} = ${n(t)}. Then ${n(c)} + ${n(dw)} × ${n(t)} = ${n(c + dw * t)}.`, lvl: 2 }; },
              () => { const t = rng.pick([0.25, 0.5, 0.75]); const x = t; return { txt: `Remap ${n(x)} from 0..1 to 1..0 (reversed)`, ans: 1 - t, why: `Reversed output = 1 − x = ${n(1 - t)}.`, lvl: 2 }; },
              () => { const a = rng.pick([0.2, 0.25, 0.4]), b = +(a + rng.pick([0.2, 0.4])).toFixed(2); const t = rng.pick([0.25, 0.5, 0.75, 1.5, -0.5]); const x = +(a + (b - a) * t).toFixed(3); return { e: `remap(${f(x)}, ${f(a)}, ${f(b)}, -1.0, 1.0)`, ans: +(-1 + 2 * t).toFixed(4), why: `t = (${n(x)} − ${n(a)}) / ${n(b - a)} = ${n(t)}. mix(−1, 1, ${n(t)}) = ${n(-1 + 2 * t)}.${t < 0 || t > 1 ? ' (No clamp — it extrapolates.)' : ''}`, lvl: 3 }; },
              () => { const s = rng.pick([-1, -0.5, 0.5, 1]); return { e: `0.2 + 0.6 * (${f(s)} * 0.5 + 0.5)`, txt: `sin gives ${n(s)}. Remap to 0..1, then to 0.2..0.8`, ans: +(0.2 + 0.6 * (s * 0.5 + 0.5)).toFixed(4), why: `${n(s)} → ${n(s * 0.5 + 0.5)} (in 0..1) → 0.2 + 0.6 × ${n(s * 0.5 + 0.5)} = ${n(0.2 + 0.6 * (s * 0.5 + 0.5))}.`, lvl: 3 }; },
            ];
            const lv = [1, 1, 2, 2, 3, 3];
            const k = rng.pick(kinds.filter((_, i) => lv[i] <= level))();
            return {
              prompt: k.txt ? `${k.txt}.${k.e ? `<br><code>${k.e}</code>` : ''}` : `What is <code>${k.e}</code>?`,
              answer: +k.ans.toFixed(4),
              explain: `<p>${k.why}</p><p>Recipe: inverse lerp (where in the input range?) then lerp (same spot in the output range).</p>`,
            };
          },
        },
        {
          id: 'remap-pick', title: 'Which shortcut?', engine: 'mcq', rounds: 8,
          blurb: 'Pick the expression that maps one range onto another.',
          questions: [
            q('Map <b>−1..1 → 0..1</b>', [{ code: 'x * 0.5 + 0.5' }, { code: 'x * 2.0 - 1.0' }, { code: '(x + 1.0) * 2.0' }, { code: 'x * 0.5 - 0.5' }], 'Halve the size (−0.5..0.5), then shift up by 0.5.'),
            q('Map <b>0..1 → −1..1</b>', [{ code: 'x * 2.0 - 1.0' }, { code: 'x * 0.5 + 0.5' }, { code: '(x - 1.0) * 2.0' }, { code: 'x * 2.0 + 1.0' }], 'Double the size (0..2), then shift down by 1.'),
            q('Map <b>0..1 → 1..0</b> (reverse)', [{ code: '1.0 - x' }, { code: 'x - 1.0' }, { code: '-x' }, { code: '1.0 / x' }], 'At x = 0 → 1, at x = 1 → 0.'),
            q('Map <b>0..1 → 0.2..0.8</b>', [{ code: '0.2 + x * 0.6' }, { code: '0.2 + x * 0.8' }, { code: 'x * 0.6' }, { code: '0.8 - x * 0.6' }], 'Width of the output range = 0.8 − 0.2 = 0.6. Start at 0.2 and add x × 0.6.'),
            q('Map <b>0..1 → −0.5..0.5</b>', [{ code: 'x - 0.5' }, { code: 'x * 0.5' }, { code: 'x + 0.5' }, { code: 'x * 2.0 - 0.5' }], 'Same width (1), just shift down by 0.5.'),
            q('Map <b>0.25..0.75 → 0..1</b>', [{ code: '(x - 0.25) * 2.0' }, { code: 'x * 2.0 - 0.25' }, { code: '(x - 0.25) * 0.5' }, { code: '(x - 0.75) * 2.0' }], 'Subtract the start (0.25), divide by the width (0.5) = multiply by 2.', { level: 2 }),
            q('Map <b>0..255 → 0..1</b> (8-bit colour)', [{ code: 'x / 255.0' }, { code: 'x * 255.0' }, { code: 'x - 255.0' }, { code: '255.0 / x' }], 'Divide by the top of the input range.'),
            q('Map <b>−1..1 → 0.5..1</b> (a soft "half-lambert"-style lift)', [{ code: 'x * 0.25 + 0.75' }, { code: 'x * 0.5 + 0.5' }, { code: 'x * 0.5 + 1.0' }, { code: 'x * 0.25 + 0.5' }], 'Output width 0.5 over input width 2 → scale 0.25. Centre 0 must land at 0.75.', { level: 3 }),
            q('Map <b>0..1 → 2..4</b>', [{ code: '2.0 + x * 2.0' }, { code: 'x * 4.0' }, { code: '2.0 + x * 4.0' }, { code: 'x * 2.0' }], 'Start at 2, width 2.', { level: 2 }),
            q('Map <b>−1..1 → 1..0</b> (reversed and squeezed)', [{ code: '0.5 - x * 0.5' }, { code: 'x * 0.5 + 0.5' }, { code: '1.0 - x' }, { code: '-x * 0.5' }], 'At −1 → 1, at 1 → 0: scale −0.5, centre 0.5.', { level: 3 }),
            q('Which equals <code>remap(x, a, b, c, d)</code>?', [{ code: 'mix(c, d, (x - a) / (b - a))' }, { code: 'mix(a, b, (x - c) / (d - c))' }, { code: 'mix(c, d, x)' }, { code: '(x - a) / (d - c)' }], 'Inverse lerp in the input range a..b, then lerp into c..d.', { level: 2 }),
            tf('<code>x * 0.5 + 0.5</code> and <code>(x + 1.0) * 0.5</code> give the same result.', true, 'Expand: (x + 1) × 0.5 = 0.5x + 0.5.', 2),
          ],
        },
        {
          id: 'remap-order', title: 'Remap step by step', engine: 'order', rounds: 3,
          blurb: 'Put the steps of a remap in the right order.',
          questions: [
            { prompt: 'Remap x from inMin..inMax to outMin..outMax. Order the steps:', items: ['Subtract inMin from x', 'Divide by (inMax − inMin) → t', 'Multiply t by (outMax − outMin)', 'Add outMin'], explain: 'First find t (inverse lerp: subtract, divide), then place t in the new range (lerp: scale, add).' },
            { prompt: 'Order the lines to draw a circle in centred coordinates:', items: [{ code: 'vec2 p = uv * 2.0 - 1.0;' }, { code: 'float d = length(p);' }, { code: 'float m = 1.0 - step(0.5, d);' }, { code: 'col = vec3(m);' }], explain: 'Remap uv to −1..1, measure distance from the origin, shape it into a mask, output.' },
            { prompt: 'Order the lines to show a sine wave as brightness:', items: [{ code: 'float s = sin(uv.x * TAU * 3.0);' }, { code: 'float b = s * 0.5 + 0.5;' }, { code: 'col = vec3(b);' }], explain: 'sin is −1..1 → remap to 0..1 → display.' },
            { prompt: 'Order the steps of "-1..1 → 0..1":', items: ['Start with x in −1..1', 'Multiply by 0.5 → −0.5..0.5', 'Add 0.5 → 0..1'], explain: 'Scale first, then shift. (Shifting first would need different numbers: (x + 1) × 0.5.)' },
            { prompt: 'Order the lines to colour a sphere by its normal:', items: [{ code: 'vec4 s = sphereNormal(uv);' }, { code: 'vec3 n = s.xyz;' }, { code: 'col = n * 0.5 + 0.5;' }, { code: 'col *= s.w;' }], explain: 'Get the normal, remap −1..1 → 0..1 for display, mask outside the sphere.' },
          ],
        },
        {
          id: 'remap-fill', title: 'Fix the range', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the remap numbers so the picture matches.',
          gen: (rng, level) => {
            const variants = [
              { t: 'vec2 p = uv * [[0]] - [[1]];\ncol = vec3(1.0 - step(0.5, length(p)));', s: [['2.0', ['1.0', '0.5', '4.0']], ['1.0', ['0.5', '2.0', '0.0']]], why: 'uv × 2 − 1 puts (0,0) in the middle and the edges at ±1. A radius-0.5 circle then fills half the width.' },
              { t: 'float s = sin(uv.x * TAU * 3.0);\ncol = vec3(s * [[0]] + [[1]]);', s: [['0.5', ['2.0', '1.0', '0.25']], ['0.5', ['0.0', '1.0', '-1.0']]], why: 'sin is −1..1; × 0.5 + 0.5 squeezes it into 0..1, so the dark parts are no longer clipped.' },
              { t: 'vec4 s = sphereNormal(uv);\ncol = (s.xyz * [[0]] + [[1]]) * s.w;', s: [['0.5', ['1.0', '2.0', '-0.5']], ['0.5', ['0.0', '1.0', '-1.0']]], why: 'Normals are −1..1 per axis; × 0.5 + 0.5 gives the classic normal-map colours.', lvl: 2 },
              { t: 'float t = (uv.x - [[0]]) / [[1]];\ncol = vec3(saturate(t));', s: [['0.25', ['0.5', '0.0', '0.75']], ['0.5', ['0.25', '1.0', '0.75']]], why: 'Ramp from 0.25 to 0.75: subtract the start, divide by the width (0.5).', lvl: 2 },
              { t: 'col = vec3(remap(uv.y, [[0]], [[1]], 0.0, 1.0));', s: [['1.0', ['0.0', '0.5', '0.25']], ['0.0', ['1.0', '0.5', '0.75']]], why: 'Input range 1 → 0 (reversed) means the top maps to 0 (black) and the bottom to 1 (white).', lvl: 3 },
              { t: 'float s = sin(uv.x * TAU * 2.0);\ncol = vec3(remap(s, -1.0, 1.0, [[0]], [[1]]));', s: [['0.25', ['0.0', '0.5', '1.0']], ['0.75', ['1.0', '0.5', '0.25']]], why: 'The wave only goes from dark grey 0.25 to light grey 0.75: that is the output range.', lvl: 3 },
            ];
            const vr = rng.pick(lvlPool(variants, level));
            const slots = vr.s.map(([ans, wrong]) => ({ options: [wrong[0], ans, ...wrong.slice(1)], answer: ans }));
            const fill = (vals) => vr.t.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return { prompt: 'Fill the blanks so "Yours" matches the target.', template: vr.t, slots, build: (vals) => ({ frag: fill(vals) }), explain: `<p>${vr.why}</p>` };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ gradients
    {
      id: 'interp.gradients',
      title: 'Gradients',
      blurb: 'Linear, radial and multi-stop: compute a t per pixel, then mix.',
      lesson: [
        {
          title: 'Every gradient is a t',
          body: `<p>All gradients follow one recipe:</p>
<ol><li>Compute a number <b>t</b> for this pixel (0..1)</li><li><code>col = mix(colorA, colorB, t)</code></li></ol>
<p>The colours are the easy part. The <b>shape</b> of the gradient lives entirely in how you compute t. Pick a colour pair below — the t stays the same.</p>`,
          controls: [{ name: 'k', label: 'colour pair #', min: 0, max: PAIRS.length - 1, step: 1, value: 3 }],
          shaders: [
            { spec: { frag: 'col = vec3(uv.x);' }, label: 't = uv.x' },
            { spec: (p) => ({ frag: 'col = mix(uA, uB, uv.x);', uniforms: { uA: PAIRS[Math.round(p.k)][0], uB: PAIRS[Math.round(p.k)][1] } }), label: 'mix(A, B, t)' },
          ],
          code: (p) => `float t = uv.x;\ncol = mix(${v(PAIRS[Math.round(p.k)][0], 1)}, ${v(PAIRS[Math.round(p.k)][1], 1)}, t);`,
        },
        {
          title: 'Linear gradient in any direction',
          body: `<p>For a gradient along a direction <code>dir</code> (a unit vector), use the <b>dot product</b>:</p>
<pre class="code">float t = dot(uv - 0.5, dir) + 0.5;</pre>
<p><code>dot(p, dir)</code> measures <b>how far p has travelled along dir</b>. Measuring from the centre (uv − 0.5) and adding 0.5 keeps the middle at 0.5. Turn the angle.</p>
<div class="note">Along a diagonal the corners reach beyond 0..1 (they're 0.707 from the centre) — fine, they just clip.</div>`,
          controls: [{ name: 'a', label: 'angle (°)', min: 0, max: 360, step: 1, value: 30 }],
          shader: (p) => ({ frag: 'vec2 dir = vec2(cos(radians(uA)), sin(radians(uA)));\nfloat t = dot(uv - 0.5, dir) + 0.5;\ncol = mix(vec3(0.08, 0.12, 0.35), vec3(1.0, 0.6, 0.2), t);\nvec2 q = uv - 0.5;\nfloat along = dot(q, dir);\nfloat arrow = (1.0 - smoothstep(0.004, 0.01, abs(q.x * dir.y - q.y * dir.x))) * step(0.0, along) * step(along, 0.35);\ncol = mix(col, vec3(1.0), arrow);', uniforms: { uA: p.a } }),
          code: (p) => { const r = (p.a * Math.PI) / 180; return `vec2 dir = vec2(${f(Math.cos(r), 2)}, ${f(Math.sin(r), 2)}); // ${n(p.a)}°\nfloat t = dot(uv - 0.5, dir) + 0.5;\ncol = mix(navy, orange, t); // white line = dir`; },
        },
        {
          title: 'Radial gradient: distance',
          body: `<p>For a round gradient, t is the <b>distance</b> from a centre, divided by the radius:</p>
<pre class="code">float t = length(uv - center) / radius;</pre>
<p>t = 0 at the centre, 1 at the radius, more beyond (saturate it). Move the centre and radius.</p>`,
          controls: [
            { name: 'x', label: 'center.x', min: 0, max: 1, step: 0.01, value: 0.4 },
            { name: 'y', label: 'center.y', min: 0, max: 1, step: 0.01, value: 0.6 },
            { name: 'r', label: 'radius', min: 0.1, max: 1, step: 0.01, value: 0.5 },
          ],
          shader: (p) => ({ frag: 'float t = saturate(length(uv - vec2(uX, uY)) / uR);\ncol = mix(vec3(1.0, 0.9, 0.5), vec3(0.15, 0.05, 0.25), t);', uniforms: { uX: p.x, uY: p.y, uR: p.r } }),
          code: (p) => `float t = length(uv - vec2(${f(p.x, 2)}, ${f(p.y, 2)})) / ${f(p.r, 2)};\ncol = mix(yellow, purple, saturate(t));`,
        },
        {
          title: 'Shape the t',
          body: `<p>Everything from the shaping topic plugs in <b>between</b> "compute t" and "mix". Bend t with pow or smoothstep to move where the colour change happens — without touching the colours.</p>`,
          controls: [{ name: 'p', label: 'pow exponent', min: 0.2, max: 5, step: 0.05, value: 2.5 }],
          shaders: [
            { spec: { frag: 'float t = uv.x;\ncol = mix(vec3(0.08, 0.12, 0.35), vec3(1.0, 0.6, 0.2), t);' }, label: 'linear t' },
            { spec: (p) => ({ frag: 'float t = pow(uv.x, uP);\ncol = mix(vec3(0.08, 0.12, 0.35), vec3(1.0, 0.6, 0.2), t);', uniforms: { uP: p.p } }), label: 'pow(t, p)' },
          ],
          graph: { fns: (p) => [{ f: (x) => x, color: '#6c7289', dash: [4, 4] }, { f: (x) => Math.pow(x, p.p), label: 'shaped t' }], opts: GR },
          code: (p) => `float t = uv.x;\nt = pow(t, ${f(p.p, 2)});   // shape it\ncol = mix(navy, orange, t);`,
        },
        {
          title: 'More than two colours',
          body: `<p>Three colours = two mixes chained. Each mix only works on <b>its part</b> of the t range:</p>
<pre class="code">vec3 c = mix(A, B, smoothstep(0.0, m, t));
c      = mix(c, C, smoothstep(m, 1.0, t));</pre>
<p>Below <code>m</code> you go A → B, above it B → C. Move the middle stop. (smoothstep gives soft joins; with saturate-inverse-lerp the joins are linear.)</p>`,
          controls: [{ name: 'm', label: 'middle stop m', min: 0.05, max: 0.95, step: 0.01, value: 0.5 }],
          shader: (p) => ({ frag: 'float t = uv.x;\nvec3 A = vec3(0.1, 0.1, 0.4);\nvec3 B = vec3(0.9, 0.2, 0.4);\nvec3 C = vec3(1.0, 0.9, 0.4);\nvec3 c = mix(A, B, smoothstep(0.0, uM, t));\nc = mix(c, C, smoothstep(uM, 1.0, t));\ncol = c;', uniforms: { uM: p.m } }),
          graph: { fns: (p) => [{ f: (x) => G.smoothstep(0, p.m, x), label: 'A→B weight' }, { f: (x) => G.smoothstep(p.m, 1, x), label: 'B→C weight' }], opts: GR },
          code: (p) => `vec3 c = mix(A, B, smoothstep(0.0, ${f(p.m, 2)}, t));\nc      = mix(c, C, smoothstep(${f(p.m, 2)}, 1.0, t));`,
          quiz: { q: 'You want a gradient that runs from the bottom-left corner to the top-right. Which t?', options: ['dot(uv - 0.5, vec2(0.707, 0.707)) + 0.5', 'length(uv - 0.5)', 'uv.x * uv.y'], answer: 0, explain: 'A diagonal direction (both components 0.707 = normalised (1,1)) with the dot product gives a straight diagonal ramp.' },
        },
      ],
      games: [
        {
          id: 'grad-image', title: 'Gradient code → picture', engine: 'mcq', rounds: 8,
          blurb: 'Read how t is computed, pick the gradient.',
          gen: (rng, level) => {
            const [A, B] = rng.pick(PAIRS);
            const pool = [
              { e: 'uv.x', js: (x) => x }, { e: 'uv.y', js: (x, y) => y }, { e: '1.0 - uv.x', js: (x) => 1 - x }, { e: '1.0 - uv.y', js: (x, y) => 1 - y },
              { e: 'dot(uv - 0.5, vec2(0.707, 0.707)) + 0.5', js: (x, y) => (x - 0.5) * 0.707 + (y - 0.5) * 0.707 + 0.5, lvl: 2 },
              { e: 'dot(uv - 0.5, vec2(-0.707, 0.707)) + 0.5', js: (x, y) => -(x - 0.5) * 0.707 + (y - 0.5) * 0.707 + 0.5, lvl: 2 },
              { e: 'saturate(length(uv - 0.5) * 2.0)', js: (x, y) => G.saturate(Math.hypot(x - 0.5, y - 0.5) * 2), lvl: 2 },
              { e: '1.0 - saturate(length(uv - 0.5) * 2.0)', js: (x, y) => 1 - G.saturate(Math.hypot(x - 0.5, y - 0.5) * 2), lvl: 2 },
              { e: 'saturate(length(uv))', js: (x, y) => G.saturate(Math.hypot(x, y)), lvl: 3 },
              { e: 'smoothstep(0.4, 0.6, uv.x)', js: (x) => G.smoothstep(0.4, 0.6, x), lvl: 3 },
              { e: 'dot(uv - 0.5, vec2(0.0, -1.0)) + 0.5', js: (x, y) => 0.5 - (y - 0.5), lvl: 3 },
              { e: 'saturate(length(uv - vec2(1.0, 0.0)))', js: (x, y) => G.saturate(Math.hypot(x - 1, y)), lvl: 3 },
            ].filter((o) => (o.lvl || 1) <= level);
            const ans = rng.pick(pool);
            const out = [ans];
            for (let k = 0; out.length < 4 && k < 200; k++) {
              const w = rng.pick(pool);
              let dist = 1;
              for (const o of out) {
                let m = 0;
                for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { const x = (i + 0.5) / 9, y = (j + 0.5) / 9; m = Math.max(m, Math.abs(G.saturate(o.js(x, y)) - G.saturate(w.js(x, y)))); }
                dist = Math.min(dist, m);
              }
              if (dist > 0.3) out.push(w);
            }
            const spec = (e) => ({ frag: `float t = ${e};\ncol = mix(uA, uB, t);`, uniforms: { uA: A, uB: B } });
            return {
              prompt: 'Which picture does this make?',
              code: `float t = ${ans.e};\ncol = mix(${v(A, 1)}, ${v(B, 1)}, t);`,
              options: out.map((o) => ({ shader: spec(o.e) })),
              explain: `<p>Where t = 0 you see the first colour, where t = 1 the second. <code>${ans.e}</code>: ${/length/.test(ans.e) ? 'distance → round rings around the centre point.' : /dot/.test(ans.e) ? 'dot with a direction → straight ramp along that direction.' : 'a plain uv ramp.'}</p>`,
            };
          },
        },
        {
          id: 'grad-tune', title: 'Aim the gradient', engine: 'slider', rounds: 4,
          blurb: 'Set direction (or centre and radius) to match the target.',
          gen: (rng, level) => {
            if (level < 3) {
              const ang = level === 1 ? rng.pick([45, 90, 135, 180, 225, 270, 315]) : rng.step(15, 345, 15);
              return {
                prompt: 'Turn the direction angle to match the target gradient.',
                sub: '0° = towards the right, 90° = up. t grows in the direction of dir (navy → orange).',
                params: [{ name: 'a', label: 'angle (°)', min: 0, max: 360, step: 1, target: ang }],
                build: (p) => ({ frag: 'vec2 dir = vec2(cos(radians(uA)), sin(radians(uA)));\nfloat t = dot(uv - 0.5, dir) + 0.5;\ncol = mix(vec3(0.08, 0.12, 0.35), vec3(1.0, 0.6, 0.2), t);', uniforms: { uA: p.a } }),
                code: (p) => { const r = (p.a * Math.PI) / 180; return `vec2 dir = vec2(${f(Math.cos(r), 2)}, ${f(Math.sin(r), 2)}); // ${n(p.a)}°\nfloat t = dot(uv - 0.5, dir) + 0.5;`; },
                tolerance: 0.03,
                explain: `<p>The target pointed at ${ang}° → dir = (${n(Math.cos((ang * Math.PI) / 180), 2)}, ${n(Math.sin((ang * Math.PI) / 180), 2)}). The orange end is where dir points.</p>`,
              };
            }
            const cx = rng.step(0.2, 0.8, 0.05), cy = rng.step(0.2, 0.8, 0.05), r = rng.step(0.3, 0.8, 0.05);
            return {
              prompt: 'Match the radial gradient: centre and radius.',
              sub: 'Brightest point = centre. Where it reaches full purple = radius.',
              params: [{ name: 'x', label: 'center.x', min: 0, max: 1, step: 0.01, target: cx }, { name: 'y', label: 'center.y', min: 0, max: 1, step: 0.01, target: cy }, { name: 'r', label: 'radius', min: 0.1, max: 1, step: 0.01, target: r }],
              build: (p) => ({ frag: 'float t = saturate(length(uv - vec2(uX, uY)) / uR);\ncol = mix(vec3(1.0, 0.9, 0.5), vec3(0.15, 0.05, 0.25), t);', uniforms: { uX: p.x, uY: p.y, uR: p.r } }),
              code: (p) => `float t = length(uv - vec2(${f(p.x, 2)}, ${f(p.y, 2)})) / ${f(p.r, 2)};`,
              explain: `<p>Centre (${n(cx)}, ${n(cy)}), radius ${n(r)}.</p>`,
            };
          },
        },
        {
          id: 'grad-tap', title: 'Where is t = 0.5?', engine: 'tap', rounds: 6,
          blurb: 'Compute where a gradient reaches a value. Tap it.',
          gen: (rng, level) => {
            const radial = level < 3 || rng.chance(0.5);
            if (radial) {
              const cx = rng.pick([0.25, 0.5, 0.75]), cy = rng.pick([0.25, 0.5, 0.75]);
              const r = rng.pick([0.4, 0.6, 0.8]);
              const tv = level === 1 ? 0.5 : rng.pick([0.25, 0.5, 0.75]);
              const R = r * tv;
              const pts = [];
              for (let k = 0; k < 12; k++) { const a = (k / 12) * G.TAU; const p = [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; if (p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.02 && p[1] < 0.98) pts.push(p); }
              return {
                prompt: `<code>float t = length(uv - vec2(${f(cx)}, ${f(cy)})) / ${f(r)};</code><br>Tap any spot where <b>t = ${n(tv)}</b>.`,
                sub: level === 1 ? 'The gradient is shown faintly behind the grid.' : 'Grid lines every 0.25. t = distance / radius.',
                shader: level === 1 ? { frag: `${GRID.frag}\nfloat t = saturate(length(uv - vec2(${f(cx)}, ${f(cy)})) / ${f(r)});\ncol += mix(vec3(0.45, 0.4, 0.15), vec3(0.0), t);` } : GRID,
                score: (u, w) => { const d = Math.abs(Math.hypot(u - cx, w - cy) - R); return d <= 0.04 ? 1 : Math.max(0, 1 - (d - 0.04) / 0.12); },
                reveal: pts.length ? pts : [[cx, cy]],
                explain: `<p>t = ${n(tv)} means distance = ${n(tv)} × ${n(r)} = <b>${n(R, 3)}</b>: a ring of that radius around (${n(cx)}, ${n(cy)}). Any point on the ring counts.</p>`,
              };
            }
            const dirs = [[[1, 0], 'vec2(1.0, 0.0)'], [[-1, 0], 'vec2(-1.0, 0.0)'], [[0, 1], 'vec2(0.0, 1.0)'], [[0, -1], 'vec2(0.0, -1.0)']];
            const [d, ds] = rng.pick(dirs);
            const tv = rng.pick([0.25, 0.75, 0.9, 0.1]);
            const pos = 0.5 + (tv - 0.5) * (d[0] + d[1]);
            const horiz = d[0] !== 0;
            return {
              prompt: `<code>float t = dot(uv - 0.5, ${ds}) + 0.5;</code><br>Tap where <b>t = ${n(tv)}</b>.`,
              sub: 'Grid lines every 0.25.',
              shader: GRID,
              score: (u, w) => score1([pos], 0.04)(horiz ? u : w),
              reveal: [horiz ? [pos, 0.5] : [0.5, pos]],
              explain: `<p>dir = ${ds} — t grows ${d[0] > 0 ? 'to the right' : d[0] < 0 ? 'to the left' : d[1] > 0 ? 'upward' : 'downward'}. t = ${n(tv)} is ${n(Math.abs(tv - 0.5))} from the middle, in ${tv > 0.5 ? 'the direction of dir' : 'the opposite direction'} → ${horiz ? 'uv.x' : 'uv.y'} = <b>${n(pos)}</b>.</p>`,
            };
          },
        },
        {
          id: 'grad-fill', title: 'Build the gradient', engine: 'codefill', rounds: 4,
          blurb: 'Pick the t and stops to recreate a gradient.',
          gen: (rng, level) => {
            const T = ['uv.x', 'uv.y', '1.0 - uv.y', 'length(uv - 0.5) * 2.0'];
            const te = rng.pick(T);
            const variants = [
              { t: `float t = [[0]];\ncol = mix(vec3(0.08, 0.12, 0.35), vec3(1.0, 0.6, 0.2), t);`, s: [[te, T.filter((x) => x !== te)]], why: `The navy end is where t = 0, the orange end where t = 1. Here that pattern is <code>${te}</code>.` },
              { t: 'float t = length(uv - [[0]]) * [[1]];\ncol = mix(vec3(1.0, 0.9, 0.5), vec3(0.15, 0.05, 0.25), saturate(t));', s: [['vec2(0.0)', ['vec2(0.5)', 'vec2(1.0)', 'uv']], ['1.0', ['2.0', '0.5', '4.0']]], why: 'The bright centre is the bottom-left corner (0,0). It reaches full purple at distance 1 → multiply by 1.', lvl: 2 },
              { t: 'float t = dot(uv - 0.5, [[0]]) + 0.5;\ncol = mix(vec3(0.08, 0.12, 0.35), vec3(1.0, 0.6, 0.2), t);', s: [['vec2(0.0, -1.0)', ['vec2(0.0, 1.0)', 'vec2(1.0, 0.0)', 'vec2(-1.0, 0.0)']]], why: 'Orange at the bottom → t grows downward → dir = (0, −1).', lvl: 2 },
              { t: 'float t = uv.x;\nvec3 c = mix(vec3(0.1, 0.1, 0.4), vec3(0.9, 0.2, 0.4), smoothstep([[0]], [[1]], t));\nc = mix(c, vec3(1.0, 0.9, 0.4), smoothstep([[2]], 1.0, t));\ncol = c;', s: [['0.0', ['0.5', '1.0', '0.25']], ['0.3', ['0.0', '1.0', '0.7']], ['0.3', ['0.0', '0.7', '1.0']]], why: 'The pink middle colour peaks at x = 0.3: the first mix must finish at 0.3 and the second start there.', lvl: 3 },
            ];
            const vr = rng.pick(lvlPool(variants, level));
            const slots = vr.s.map(([ans, wrong]) => ({ options: [wrong[0], ans, ...wrong.slice(1)], answer: ans }));
            const fill = (vals) => vr.t.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return { prompt: 'Fill the blanks so "Yours" matches the target.', template: vr.t, slots, build: (vals) => ({ frag: fill(vals) }), explain: `<p>${vr.why}</p>` };
          },
        },
      ],
    },
    // ------------------------------------------------------------------ ramps
    {
      id: 'interp.ramps',
      title: 'Gradient maps & ramps',
      blurb: 'Use a value as a lookup position into a colour strip.',
      lesson: [
        {
          title: 'A value as a position',
          body: `<p>mix can only blend <b>two</b> colours. What if you want fire: black → purple → red → orange → yellow → white?</p>
<p>Paint those colours into a strip image — a <b>ramp</b> — and use your t as the <b>x position</b> to read from it:</p>
<pre class="code">col = texture2D(uRamp, vec2(t, 0.5)).rgb;</pre>
<p>Top: the ramp texture. Bottom: a radial t looked up in that ramp.</p>`,
          shaders: [
            { spec: { frag: 'col = texture2D(uRamp, uv).rgb;', textures: RAMP() }, label: 'the ramp (t → colour)' },
            { spec: { frag: 'float t = 1.0 - saturate(length(uv - 0.5) * 2.0);\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;', textures: RAMP() }, label: 'radial t, looked up' },
          ],
          code: 'float t = 1.0 - saturate(length(uv - 0.5) * 2.0); // 1 centre, 0 edge\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;           // look up colour at x = t',
          after: '<div class="analogy">🎨 <b>Analogy:</b> paint-by-numbers. The grey value is the number; the ramp is the legend that says which colour each number gets.</div>',
        },
        {
          title: 'Grey in, colour out',
          body: `<p>Any greyscale value works: a noise, a mask, a height, a lighting term. This is called a <b>gradient map</b> (Photoshop has the same adjustment).</p>
<p>Same noise, different ramps:</p>`,
          controls: [{ name: 'k', label: 'ramp #', min: 0, max: 2, step: 1, value: 0 }],
          shaders: [
            { spec: { frag: 'col = vec3(fbm(uv * 4.0));' }, label: 'grey noise (t)' },
            { spec: (p) => ({ frag: 'float t = fbm(uv * 4.0);\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;', textures: RAMP(['palette', 'toonramp', 'gradient'][Math.round(p.k)]) }), label: 'gradient-mapped' },
          ],
          code: (p) => `float t = fbm(uv * 4.0);\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb; // ramp: ${['palette (fire)', 'toonramp (3 bands)', 'gradient (black→white)'][Math.round(p.k)]}`,
          after: '<div class="tip">💡 Artists love ramps: change the look by editing an image, no code. Unreal: <b>Curve Atlas</b> / texture lookups; Shader Graph: <b>Sample Gradient</b> node; VFX Graph / Niagara: colour-over-life curves are ramps too.</div>',
        },
        {
          title: 'Remap t before the lookup',
          body: `<p>Scale and offset t to choose <b>which part</b> of the ramp you use:</p>
<pre class="code">t = saturate(t * contrast + offset);</pre>
<p>Higher contrast = more of the ramp squeezed in; offset slides toward the hot or cold end. Animating offset makes "heating up" or dissolve-burn effects.</p>
<div class="note">Use <b>clamp</b> wrap on ramp textures (or saturate t). With repeat wrap, t = 1.0 can bleed the left edge's colour into the right.</div>`,
          controls: [
            { name: 's', label: 'contrast', min: 0.2, max: 3, step: 0.05, value: 1.5 },
            { name: 'o', label: 'offset', min: -1, max: 1, step: 0.01, value: -0.2 },
          ],
          shader: (p) => ({ frag: 'float t = fbm(uv * 4.0);\nt = saturate(t * uS + uO);\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;', textures: RAMP(), uniforms: { uS: p.s, uO: p.o } }),
          code: (p) => `float t = fbm(uv * 4.0);\nt = saturate(t * ${f(p.s, 2)} + ${f(p.o, 2)});\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;`,
        },
        {
          title: 'Toon shading = lighting through a ramp',
          body: `<p>Classic cel shading: compute simple lighting <code>dot(N, L)</code> (−1..1), remap to 0..1, then look it up in a ramp with a few <b>hard bands</b>. The bands become the toon shadows.</p>`,
          controls: [{ name: 'a', label: 'light angle', min: -3.14, max: 3.14, step: 0.01, value: 0.6 }],
          shaders: [
            { spec: (p) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(cos(uA), sin(uA), 0.8));\nfloat t = dot(s.xyz, L) * 0.5 + 0.5;\ncol = vec3(t) * s.w;', uniforms: { uA: p.a } }), label: 't = N·L × 0.5 + 0.5' },
            { spec: (p) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(cos(uA), sin(uA), 0.8));\nfloat t = dot(s.xyz, L) * 0.5 + 0.5;\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb * s.w;', textures: RAMP('toonramp'), uniforms: { uA: p.a } }), label: 'through the toon ramp' },
          ],
          code: 'vec3 N = sphereNormal(uv).xyz;\nfloat t = dot(N, L) * 0.5 + 0.5;            // -1..1 → 0..1\ncol = texture2D(uToonRamp, vec2(t, 0.5)).rgb; // 3 hard bands',
        },
        {
          title: 'Ramps in pure code',
          body: `<p>No texture? Chain mixes (previous concept) or posterize t first for hard bands:</p>
<pre class="code">// 0, 0.5 or 1:
float bands = floor(t * 3.0) / 2.0;
col = mix(shadow, light, bands);</pre>
<p>Textures win when artists need to tweak colours freely; code wins when you need just two or three colours and want zero texture reads.</p>`,
          controls: [{ name: 'n', label: 'bands', min: 2, max: 8, step: 1, value: 3 }],
          shader: (p) => ({ frag: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(0.5, 0.6, 0.7));\nfloat t = saturate(dot(s.xyz, L) * 0.5 + 0.5);\nfloat b = floor(t * uN * 0.999) / (uN - 1.0);\ncol = mix(vec3(0.15, 0.1, 0.35), vec3(1.0, 0.85, 0.7), b) * s.w;', uniforms: { uN: p.n } }),
          code: (p) => `float t = dot(N, L) * 0.5 + 0.5;\nfloat b = floor(t * ${f(p.n)}) / ${f(p.n - 1)};\ncol = mix(shadow, light, b);`,
          quiz: { q: 'In <code>texture2D(uRamp, vec2(t, 0.5))</code>, why is the y coordinate just 0.5?', options: ['The ramp is the same from top to bottom, so any y gives the same colour', 'y must always be 0.5 in GLSL', 'It makes the colour 50% brighter'], answer: 0, explain: 'A ramp only varies along x. 0.5 is a safe middle row; any value 0..1 would do.' },
        },
      ],
      games: [
        {
          id: 'ramp-image', title: 'Map it!', engine: 'mcq', rounds: 8,
          blurb: 'Given a grey t and a ramp, pick the result.',
          gen: (rng, level) => {
            const srcs = [
              { e: 'uv.x', lvl: 1 }, { e: 'uv.y', lvl: 1 },
              { e: '1.0 - saturate(length(uv - 0.5) * 2.0)', lvl: 1 },
              { e: 'fbm(uv * 4.0)', lvl: 2 }, { e: '0.5 + 0.5 * sin(uv.x * TAU * 2.0)', lvl: 2 },
              { e: 'saturate(length(uv - 0.5) * 2.0)', lvl: 3 },
            ];
            const src = rng.pick(lvlPool(srcs, level)).e;
            const ramp = rng.pick(['palette', 'toonramp']);
            const other = ramp === 'palette' ? 'toonramp' : 'palette';
            const mk = (t, alt) => ({ frag: `float t = ${src};\ncol = texture2D(${alt ? 'uRamp2' : 'uRamp'}, vec2(${t}, 0.5)).rgb;`, textures: alt ? RAMP(other, 'uRamp2') : RAMP(ramp) });
            const right = mk('t');
            const wrongs = [mk('1.0 - t'), mk('t', true), mk('t * 0.4'), mk('0.6 + t * 0.4')];
            return {
              prompt: 'The grey <b>t</b> is looked up in the ramp. Which is the result?',
              shaders: [
                { spec: { frag: `col = vec3(${src});` }, label: 't' },
                { spec: { frag: 'col = texture2D(uRamp, uv).rgb;', textures: RAMP(ramp) }, label: 'ramp (left = 0, right = 1)' },
              ],
              code: `float t = ${src};\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;`,
              options: [right, ...rng.shuffle(wrongs).slice(0, 3)].map((s) => ({ shader: s })),
              explain: '<p>Dark parts of t (≈0) take the colour at the ramp\'s <b>left</b> end, bright parts (≈1) take the <b>right</b> end. Wrong answers used a reversed t (1 − t), a different ramp, or only a slice of the ramp.</p>',
            };
          },
        },
        {
          id: 'ramp-tune', title: 'Slide along the ramp', engine: 'slider', rounds: 4,
          blurb: 'Tune contrast and offset of t before the lookup.',
          gen: (rng, level) => {
            const s = level === 1 ? 1 : rng.step(0.5, 2.5, 0.25);
            const o = rng.step(-0.5, 0.5, 0.1);
            const params = [{ name: 'o', label: 'offset', min: -1, max: 1, step: 0.01, target: o }];
            if (level > 1) params.unshift({ name: 's', label: 'contrast', min: 0.2, max: 3, step: 0.05, target: s });
            const src = level === 3 ? 'fbm(uv * 4.0)' : 'uv.x';
            return {
              prompt: level === 1 ? 'Slide the <b>offset</b> until your colours match.' : 'Match <b>contrast</b> and <b>offset</b>.',
              sub: 'Offset moves toward the hot (+) or cold (−) end. Contrast stretches.',
              params,
              build: (p) => ({ frag: `float t = ${src};\nt = saturate(t * uS + uO);\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;`, textures: RAMP(), uniforms: { uS: p.s ?? s, uO: p.o } }),
              code: (p) => `float t = ${src};\nt = saturate(t * ${f(p.s ?? s, 2)} + ${f(p.o, 2)});\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;`,
              compare: 'pixels',
              explain: `<p>Target: contrast ${n(s)}, offset ${n(o)}. Everything that ends up below 0 or above 1 after the remap gets clamped to the ramp's end colours.</p>`,
            };
          },
        },
        {
          id: 'ramp-fill', title: 'Wire the lookup', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the lookup coordinates.',
          gen: (rng, level) => {
            const T = ['uv.x', '1.0 - uv.x', 'uv.y', '1.0 - uv.y'];
            const te = rng.pick(T);
            const variants = [
              { t: `float t = [[0]];\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb;`, s: [[te, T.filter((x) => x !== te)]], why: `The ramp's dark end (t = 0) is where the target is dark: that's <code>${te}</code>.` },
              { t: 'col = texture2D(uRamp, vec2([[0]], [[1]])).rgb;', s: [['uv.y', ['0.5', 'uv.x', '1.0 - uv.y']], ['0.5', ['uv.y', '0.0', 'uv.x']]], why: 'The colour changes bottom → top, so x of the lookup must be uv.y. The second coordinate doesn\'t matter for a ramp (it\'s the same in every row) — any choice that matches counts.', lvl: 2 },
              { t: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(0.5, 0.6, 0.6));\nfloat t = dot(s.xyz, L) * [[0]] + [[1]];\ncol = texture2D(uRamp, vec2(t, 0.5)).rgb * s.w;', s: [['0.5', ['1.0', '2.0', '-0.5']], ['0.5', ['0.0', '1.0', '-1.0']]], why: 'dot(N, L) is −1..1; the ramp needs 0..1 → × 0.5 + 0.5. Without it, the whole dark half of the sphere would be squashed into the first band.', lvl: 3, toon: true },
            ];
            const vr = rng.pick(lvlPool(variants, level));
            const slots = vr.s.map(([ans, wrong]) => ({ options: [wrong[0], ans, ...wrong.slice(1)], answer: ans }));
            const fill = (vals) => vr.t.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            const tex = RAMP(vr.toon ? 'toonramp' : 'palette');
            return { prompt: 'Fill the blanks so "Yours" matches the target.', template: vr.t, slots, build: (vals) => ({ frag: fill(vals), textures: tex }), explain: `<p>${vr.why}</p>` };
          },
        },
        {
          id: 'ramp-facts', title: 'Ramps: true or false?', engine: 'mcq', rounds: 8,
          blurb: 'Concept check on gradient maps and lookups.',
          questions: [
            tf('A gradient map turns a single grey value into a colour by looking it up in a strip.', true, 'Grey value = x position in the ramp texture.'),
            tf('With a ramp texture you can only blend two colours.', false, 'A ramp can contain as many colours as you paint into it — that\'s its advantage over a single mix.'),
            tf('In <code>texture2D(ramp, vec2(t, 0.5))</code>, t = 0 reads the left end of the ramp.', true, 'Texture x = 0 is the left edge.'),
            tf('Using the lighting term N·L as t through a 3-band ramp gives toon shading.', true, 'The hard bands in the ramp become the hard light/shadow steps.'),
            tf('dot(N, L) can be used directly as a ramp coordinate without remapping.', false, 'It runs −1..1. Remap with × 0.5 + 0.5 (or saturate it) first.', 2),
            tf('Ramp textures should use repeat wrapping so t = 1.0 reads the right end.', false, 'Repeat wrapping can blend the left edge in at t ≈ 1. Use clamp (or saturate t).', 2),
            tf('Changing the ramp texture changes the look without changing the shader code.', true, 'That\'s why artists like them.'),
            tf('Adding an offset to t before the lookup slides which colours appear.', true, 'Offset moves the whole picture toward one end of the ramp.'),
            tf('A fire effect can be made from a grey noise and a black→red→yellow→white ramp.', true, 'Classic VFX trick: grey noise through a fire ramp.'),
            tf('In HLSL, the ramp lookup would be a lerp between two colours.', false, 'It\'s a texture sample (e.g. <code>tex.Sample(sampler, float2(t, 0.5))</code>). lerp only blends two values.', 2),
            q('What does <code>floor(t * 3.0) / 2.0</code> do when used as the t of a mix?', ['Posterizes t into 3 hard steps — a code-only toon ramp', 'Makes t smoother', 'Reverses t'], 'floor quantizes t into 0, 0.5, 1.', { level: 2 }),
            q('Your gradient-mapped noise looks too "washed out" — mostly middle colours. What helps?', ['Increase contrast: t * 2.0 - 0.5 (then saturate)', 'Lower the texture resolution', 'Use uv.y instead of t'], 'Stretching t pushes more pixels toward the ramp\'s ends.', { level: 3 }),
          ],
        },
      ],
    },
  ],
};
