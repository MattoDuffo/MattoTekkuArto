// Topic — Time & animation: uTime, oscillation, scrolling, phase, easing, flipbooks.
// Core idea: a shader has no memory, so every animation is "a picture as a function of time".
import { tf, q, distinct, f, n, G, shaderView } from './_kit.js';

const fr = (x) => x - Math.floor(x);
const r2 = (x) => +(+x).toFixed(3);

// ------------------------------------------------------------------ shared shader bits
const TDEFS = `
float ball(vec2 uv, vec2 c, float r){ return 1.0 - smoothstep(r - 0.012, r + 0.004, length(uv - c)); }
vec3 stage(vec2 uv){
  vec2 g = abs(fract(uv * 4.0 + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
  return vec3(0.07, 0.075, 0.1) + line * 0.06;
}`;
const T = (frag, uniforms) => ({ frag, defs: TDEFS, uniforms: uniforms || {} });
/** A ball moving left→right with x = 0.1 + 0.8 * value(t). `expr` uses float t. */
const ballX = (expr, tVar = 'uTime') => T(`float t = ${tVar};\nfloat v = ${expr};\ncol = stage(uv);\ncol = mix(col, vec3(0.3, 0.32, 0.4), step(abs(uv.y - 0.5), 0.004) * step(0.1, uv.x) * step(uv.x, 0.9));\ncol = mix(col, vec3(1.0, 0.83, 0.47), ball(uv, vec2(0.1 + 0.8 * v, 0.5), 0.07));`);
const graphT = (fns, xmax = 4, ymin = -1.2, ymax = 1.2) => ({ fns, opts: { xmin: 0, xmax, ymin, ymax } });

// Expressions of t used by the easing / curve games. fam = visual family (no two in one question).
const EXPR = [
  { code: 'fract(t)', fn: (t) => fr(t), lvl: 1, fam: 'saw' },
  { code: '1.0 - fract(t)', fn: (t) => 1 - fr(t), lvl: 1, fam: 'sawdown' },
  { code: 'fract(t * 2.0)', fn: (t) => fr(t * 2), lvl: 1, fam: 'saw2' },
  { code: 'step(0.5, fract(t))', fn: (t) => G.step(0.5, fr(t)), lvl: 1, fam: 'square' },
  { code: '0.5 + 0.5 * sin(t * TAU)', fn: (t) => 0.5 + 0.5 * Math.sin(t * G.TAU), lvl: 1, fam: 'sin' },
  { code: 'abs(fract(t) * 2.0 - 1.0)', fn: (t) => Math.abs(fr(t) * 2 - 1), lvl: 2, fam: 'vtri' },
  { code: '1.0 - abs(fract(t) * 2.0 - 1.0)', fn: (t) => 1 - Math.abs(fr(t) * 2 - 1), lvl: 2, fam: 'tri' },
  { code: 'smoothstep(0.0, 1.0, fract(t))', fn: (t) => G.smoothstep(0, 1, fr(t)), lvl: 2, fam: 'sawsmooth' },
  { code: 'pow(fract(t), 3.0)', fn: (t) => Math.pow(fr(t), 3), lvl: 2, fam: 'easein' },
  { code: 'exp(-fract(t) * 5.0)', fn: (t) => Math.exp(-fr(t) * 5), lvl: 2, fam: 'flash' },
  { code: 'fract(t * 0.5)', fn: (t) => fr(t * 0.5), lvl: 2, fam: 'sawslow' },
  { code: 'pow(fract(t), 0.3)', fn: (t) => Math.pow(fr(t), 0.3), lvl: 3, fam: 'easeout' },
  { code: '0.5 + 0.5 * cos(t * TAU)', fn: (t) => 0.5 + 0.5 * Math.cos(t * G.TAU), lvl: 3, fam: 'vsmooth' },
  { code: 'smoothstep(0.0, 1.0, abs(fract(t) * 2.0 - 1.0))', fn: (t) => G.smoothstep(0, 1, Math.abs(fr(t) * 2 - 1)), lvl: 3, fam: 'vsmooth' },
  { code: 'abs(sin(t * PI))', fn: (t) => Math.abs(Math.sin(t * Math.PI)), lvl: 3, fam: 'bounce' },
  { code: 'step(0.8, fract(t))', fn: (t) => G.step(0.8, fr(t)), lvl: 3, fam: 'blip' },
];
const exprGraph = (e) => ({ fns: [{ f: e.fn, color: '#ffd479' }], opts: { xmin: 0, xmax: 2, ymin: -0.1, ymax: 1.1, xstep: 0.5, ystep: 0.5 } });

// Flipbook helpers (4x4 sheet, frames numbered 1..16 reading left→right, top→bottom)
const FLIP = (fpsExpr) => ({
  frag: `float frame = mod(floor(uTime * ${fpsExpr}), 16.0);\nvec2 cell = vec2(mod(frame, 4.0), 3.0 - floor(frame / 4.0));\ncol = texture2D(uTex, (uv + cell) / 4.0).rgb;`,
  textures: { uTex: { name: 'flipbook', filter: 'linear', wrap: 'clamp' } },
});

export default {
  id: 'time',
  title: 'Time & animation',
  icon: '⏱️',
  blurb: 'uTime, loops, waves, scrolling, easing and flipbooks — making shaders move.',
  cheatsheet: `
<p><b>uTime</b> = seconds since start (same for every pixel). A shader has no memory: every frame is a picture computed <b>from uv and time</b>.</p>
<ul>
<li><b>Loop:</b> <code>fract(uTime * speed)</code> goes 0→1 every <b>1 / speed</b> seconds.</li>
<li><b>Oscillate:</b> <code>sin(uTime * speed)</code> goes −1..1, period <b>2π / speed</b>. For 0..1: <code>0.5 + 0.5 * sin(…)</code>. For a period of P seconds: <code>sin(uTime * TAU / P)</code>.</li>
<li><b>Scroll:</b> <code>uv - uTime * velocity</code> moves the texture <b>along</b> velocity (with <code>+</code> it goes the other way).</li>
<li><b>Phase:</b> <code>sin(uTime + phase)</code>. Phase from position → travelling wave: <code>sin(uv.x * k - uTime)</code> moves right. Random phase per cell: <code>hash(id) * TAU</code>.</li>
<li><b>Ping-pong:</b> <code>abs(fract(t) * 2.0 - 1.0)</code> goes 1→0→1. <b>Ease:</b> <code>smoothstep(0.0, 1.0, x)</code>, <code>pow(x, k)</code>. <b>Flash:</b> <code>exp(-fract(t) * k)</code>.</li>
<li><b>Flipbook:</b> <code>frame = mod(floor(uTime * fps), frames)</code>; loop length = frames / fps seconds.</li>
</ul>
<p>Engines: Unity <code>_Time.y</code> / Time node, Unreal <b>Time</b> node, <b>Panner</b> = scrolling, <b>Flipbook</b> node.</p>`,
  concepts: [
    // ==================================================================
    {
      id: 'time.utime',
      title: 'uTime: the clock',
      blurb: 'Seconds since start, the same for every pixel. Loop it with fract().',
      lesson: [
        {
          title: 'A clock every pixel can read',
          body: `<p>Shaders can't remember the last frame. So how do things move? The app hands every pixel the same number each frame: <code>uTime</code>, the <b>seconds since start</b> (0.0, 0.016, 0.033, … 1.0, … 125.7, …).</p>
<p>Here the slider stands in for <code>uTime</code>. Watch what happens if we use it directly as brightness:</p>`,
          controls: [{ name: 't', label: 'uTime (seconds)', min: 0, max: 5, step: 0.1, value: 0.4 }],
          shader: (v) => ({ frag: 'col = vec3(uT);', uniforms: { uT: v.t } }),
          code: (v) => `col = vec3(uTime);   // = vec3(${f(v.t, 1)})${v.t > 1 ? '  → above 1.0, clipped to white' : ''}`,
          after: '<div class="note">Raw <code>uTime</code> grows forever. After one second it\'s already "too bright" and just stays white. We need to <b>shape</b> time before using it.</div>',
        },
        {
          title: 'fract(uTime): a loop',
          body: `<p><code>fract()</code> keeps only the part after the decimal point: 3.7 → 0.7. So <code>fract(uTime)</code> climbs 0 → 1, snaps back to 0, climbs again… <b>every second</b>.</p>
<p>That's a <b>loop</b>. Here it fills a progress bar (this one runs on the real clock):</p>`,
          shader: { frag: 'float t = fract(uTime);\ncol = vec3(0.1) + vec3(0.3, 0.6, 1.0) * step(uv.x, t) * step(abs(uv.y - 0.5), 0.15);' },
          graph: graphT([{ f: (t) => fr(t), label: 'fract(t)' }], 4, -0.1, 1.1),
          code: 'float t = fract(uTime);   // 0 → 1, 0 → 1, …\ncol = vec3(step(uv.x, t));  // bar fills up every second',
        },
        {
          title: 'A frame = a function of time',
          body: `<p>Here's the mind shift: an animation is just a <b>picture that depends on t</b>. The shader doesn't "move" the ball — each frame it computes where the ball <i>is</i> at that time.</p>
<p>Scrub time by hand on the right. Same code, you're just choosing the t.</p>`,
          controls: [{ name: 't', label: 't (scrub)', min: 0, max: 3, step: 0.01, value: 0.3 }],
          shaders: [
            { spec: ballX('fract(t)'), label: 'live: t = uTime' },
            { spec: (v) => ({ ...ballX('fract(t)', 'uT'), uniforms: { uT: v.t } }), label: 'scrubbed: t = slider' },
          ],
          code: (v) => `float t = uTime;            // scrub: ${f(v.t, 2)}\nfloat x = fract(t);         // = ${f(fr(v.t), 2)}\n// ball drawn at x`,
          after: '<div class="analogy">🎞️ <b>Analogy:</b> a flip-book where you can open <i>any</i> page instantly, because each page is described by a formula of the page number. No page depends on the previous one.</div>',
        },
        {
          title: 'Loop speed and loop length',
          body: `<p>Multiply time before <code>fract</code> to change the loop speed:</p>
<ul><li><code>fract(uTime * 2.0)</code> → loops <b>twice</b> per second (every 0.5 s)</li><li><code>fract(uTime * 0.5)</code> → loops every <b>2</b> seconds</li><li><code>fract(uTime / N)</code> → loops every <b>N</b> seconds</li></ul>
<div class="note">Loop length = <b>1 / speed</b> seconds.</div>`,
          controls: [{ name: 's', label: 'speed', min: 0.25, max: 3, step: 0.25, value: 0.5 }],
          shader: (v) => ({ ...ballX('fract(t * uS)'), uniforms: { uS: v.s } }),
          code: (v) => `float x = fract(uTime * ${f(v.s, 2)});\n// loops every ${n(1 / v.s, 2)} s`,
          quiz: { q: 'You want a loop that lasts 4 seconds. Which code?', options: ['fract(uTime * 4.0)', 'fract(uTime * 0.25)', 'fract(uTime) * 4.0'], answer: 1, explain: 'Loop length = 1 / speed. 1 / 0.25 = 4 seconds. (×4 would loop 4 times per second.)' },
        },
        {
          title: 'Seconds, not frames',
          body: `<p>Because <code>uTime</code> is in <b>seconds</b>, the animation runs at the same speed at 30 fps or 120 fps — a slow phone just shows fewer in-between frames.</p>
<div class="tip">💡 Same thing in engines: Unity <code>_Time.y</code> (or the <b>Time</b> node in Shader Graph), Unreal's <b>Time</b> material node. Both are seconds. Unity also gives <code>_Time.x</code> = t/20 and <code>_Time.w</code> = t×3 as shortcuts.</div>
<div class="tip">💡 Floats lose precision as numbers get big. After hours of play <code>uTime</code> can be huge and animations get jittery. Engines often wrap time, and you can keep it small with <code>fract</code> or <code>mod</code> early.</div>`,
          quiz: { q: 'A game drops from 60 fps to 30 fps. A shader pulse using uTime…', options: ['runs at half speed', 'keeps the same speed, just choppier', 'stops'], answer: 1, explain: 'uTime is wall-clock seconds. Fewer frames are drawn, but each one is computed for the correct time.' },
        },
      ],
      games: [
        {
          id: 'loop-match', title: 'Catch the loop', engine: 'slider', rounds: 4,
          blurb: 'Match the loop speed of the moving ball.',
          gen: (rng, level) => {
            const k = rng.pick(level === 1 ? [0.5, 1, 2] : [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5]);
            const params = [{ name: 'k', label: 'speed', min: 0.25, max: 3, step: 0.25, target: k }];
            const off = level === 3 ? rng.pick([0.25, 0.5, 0.75]) : 0;
            if (level === 3) params.push({ name: 'o', label: 'offset', min: 0, max: 0.75, step: 0.25, target: off });
            return {
              prompt: 'Make your ball move exactly like the target.',
              sub: level === 3 ? 'Speed first, then shift the start with the offset until they move together.' : 'When the speed is right, both balls move in lockstep.',
              params,
              build: (vals) => ({ ...ballX('fract(t * uK + uO)'), uniforms: { uK: vals.k, uO: vals.o ?? 0 } }),
              code: (vals) => `float x = fract(uTime * ${f(vals.k, 2)}${level === 3 ? ` + ${f(vals.o ?? 0, 2)}` : ''});  // loop: ${n(1 / vals.k, 2)} s`,
              explain: `<p>Target: <code>fract(uTime * ${f(k)}${off ? ' + ' + f(off) : ''})</code> — one trip every <b>${n(1 / k, 2)} s</b>.${off ? ' The offset shifts where in the loop it starts, without changing speed.' : ''}</p>`,
            };
          },
        },
        {
          id: 'fract-time', title: 'What does it read?', engine: 'numeric', rounds: 6,
          blurb: 'Compute fract() of time at a given moment.',
          gen: (rng, level) => {
            const t = rng.step(1, 9, level === 1 ? 0.1 : 0.05);
            const k = level === 1 ? 1 : rng.pick(level === 2 ? [2, 0.5] : [2, 0.5, 3, 0.25, 1.5]);
            const ans = r2(fr(t * k));
            const code = k === 1 ? 'float x = fract(uTime);' : `float x = fract(uTime * ${f(k)});`;
            return {
              prompt: `<code>uTime = ${n(t)}</code>. What is x?`,
              code, answer: ans,
              explain: `<p>${k === 1 ? '' : `uTime × ${n(k)} = ${n(t * k)}. `}fract keeps the part after the point → <b>${n(ans)}</b>.</p>`,
            };
          },
        },
        {
          id: 'loop-length', title: 'How long is the loop?', engine: 'numeric', rounds: 6,
          blurb: 'Loop length in seconds from the code — and back.',
          gen: (rng, level) => {
            const kind = level === 1 ? 'len' : rng.pick(level === 2 ? ['len', 'len', 'div'] : ['len', 'div', 'speed', 'count']);
            if (kind === 'len') {
              const k = rng.pick([2, 4, 0.5, 0.25, 0.2, 5, 0.1]);
              return { prompt: 'How many seconds does one loop take?', code: `float x = fract(uTime * ${f(k)});`, answer: r2(1 / k), explain: `<p>Loop length = 1 / speed = 1 / ${n(k)} = <b>${n(1 / k)} s</b>.</p>` };
            }
            if (kind === 'div') {
              const N = rng.pick([2, 3, 5, 8, 10]);
              return { prompt: 'How many seconds does one loop take?', code: `float x = fract(uTime / ${f(N)});`, answer: N, explain: `<p>Dividing by ${N} = multiplying by 1/${N}, so the loop lasts <b>${N} s</b>.</p>` };
            }
            if (kind === 'speed') {
              const L = rng.pick([2, 4, 5, 0.5, 0.25]);
              return { prompt: `You need a loop that lasts <b>${n(L)} s</b>. What speed goes in <code>fract(uTime * speed)</code>?`, answer: r2(1 / L), explain: `<p>speed = 1 / length = 1 / ${n(L)} = <b>${n(1 / L)}</b>.</p>` };
            }
            const k = rng.pick([2, 3, 0.5]), secs = rng.pick([4, 6, 10]);
            return { prompt: `How many times does the loop restart in ${secs} seconds?`, code: `float x = fract(uTime * ${f(k)});`, answer: k * secs, explain: `<p>${n(k)} loops per second × ${secs} s = <b>${k * secs}</b>.</p>` };
          },
        },
        {
          id: 'time-tf', title: 'Clock facts', engine: 'mcq', rounds: 8,
          blurb: 'True or false about uTime and loops.',
          questions: [
            tf('uTime has the same value for every pixel in a frame.', true, 'It\'s a uniform: one value shared by the whole draw.'),
            tf('A shader can remember where the ball was last frame.', false, 'No memory! The position is recomputed from uTime every frame.'),
            tf('<code>fract(uTime)</code> loops once per second.', true, 'It goes 0→1 and snaps back every whole second.'),
            tf('<code>fract(uTime * 2.0)</code> loops every 2 seconds.', false, 'Speed 2 → twice per second → every 0.5 s.'),
            tf('<code>fract(uTime / 3.0)</code> loops every 3 seconds.', true, 'Dividing by 3 slows it down 3×.'),
            tf('uTime is measured in frames.', false, 'Seconds — that makes animation frame-rate independent.'),
            tf('Using <code>col = vec3(uTime)</code> gives a nice looping fade.', false, 'It just goes white after 1 s and stays white. Shape time first (fract, sin…).'),
            tf('<code>fract(uTime + 0.5)</code> loops at the same speed as <code>fract(uTime)</code>, just shifted.', true, 'Adding shifts the timing (phase), multiplying changes speed.', 2),
            tf('At uTime = 7.25, <code>fract(uTime)</code> = 0.25.', true, '7.25 → keep the part after the point.', 2),
            tf('Huge uTime values can cause jittery animation because of float precision.', true, 'Floats have fewer digits left for the fraction as the number grows.', 3),
            q('Unity Shader Graph\'s equivalent of uTime is…', ['the Time node (_Time.y)', 'the UV node', 'the Position node'], 'Time node / _Time.y = seconds.'),
            q('Which makes a 0..1 loop that takes 5 seconds?', ['fract(uTime / 5.0)', 'fract(uTime * 5.0)', 'fract(uTime) / 5.0'], 'Divide time by the loop length.', { level: 2 }),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'time.osc',
      title: 'Oscillation with sin',
      blurb: 'Smooth back-and-forth motion. Speed, amplitude and period.',
      lesson: [
        {
          title: 'sin(): the wave machine',
          body: `<p><code>sin(t)</code> glides smoothly between <b>−1 and 1</b> forever. Perfect for anything that pulses, bobs or breathes.</p>
<p>Colours want 0..1, so we remap: <code>0.5 + 0.5 * sin(t)</code> goes 0..1.</p>`,
          shader: { frag: 'float b = 0.5 + 0.5 * sin(uTime * 2.0);\ncol = vec3(b, 0.4 * b, 0.6);' },
          graph: graphT([{ f: (t) => Math.sin(t), label: 'sin(t)' }, { f: (t) => 0.5 + 0.5 * Math.sin(t), label: '0.5 + 0.5*sin(t)', dash: [5, 4] }], 12.6),
          code: 'float b = 0.5 + 0.5 * sin(uTime * 2.0);  // 0..1, smooth\ncol = vec3(b, 0.4 * b, 0.6);',
          after: '<div class="note">sin repeats every <b>2π ≈ 6.28</b> units. Look at the graph: one full up-and-down takes 6.28 on the t axis.</div>',
        },
        {
          title: 'Speed',
          body: `<p>Multiply time inside: <code>sin(uTime * speed)</code>. Bigger speed = faster wobble. One full cycle (the <b>period</b>) now takes:</p>
<pre class="code">period = 2π / speed   (seconds)</pre>`,
          controls: [{ name: 'k', label: 'speed', min: 0.5, max: 8, step: 0.5, value: 3 }],
          shader: (v) => T('float y = 0.5 + 0.3 * sin(uTime * uK);\ncol = stage(uv);\ncol = mix(col, vec3(1.0, 0.83, 0.47), ball(uv, vec2(0.5, y), 0.08));', { uK: v.k }),
          graph: { fns: (v) => [{ f: (t) => Math.sin(t * v.k), label: `sin(t*${n(v.k)})` }], opts: { xmin: 0, xmax: 4, ymin: -1.2, ymax: 1.2 } },
          code: (v) => `float y = 0.5 + 0.3 * sin(uTime * ${f(v.k)});\n// period = 6.283 / ${n(v.k)} = ${n(G.TAU / v.k, 2)} s`,
        },
        {
          title: 'Amplitude and centre',
          body: `<p>The full recipe for a bobbing value:</p>
<pre class="code">value = centre + amplitude * sin(uTime * speed)</pre>
<ul><li><b>centre</b>: where it rests</li><li><b>amplitude</b>: how far it swings each way</li><li><b>speed</b>: how fast</li></ul>`,
          controls: [
            { name: 'c', label: 'centre', min: 0.2, max: 0.8, step: 0.05, value: 0.5 },
            { name: 'a', label: 'amplitude', min: 0, max: 0.4, step: 0.05, value: 0.2 },
          ],
          shader: (v) => T('float y = uC + uA * sin(uTime * 3.0);\ncol = stage(uv);\ncol = mix(col, vec3(0.4, 0.8, 1.0), step(abs(uv.y - uC), 0.003));\ncol = mix(col, vec3(1.0, 0.83, 0.47), ball(uv, vec2(0.5, y), 0.07));', { uC: v.c, uA: v.a }),
          code: (v) => `float y = ${f(v.c, 2)} + ${f(v.a, 2)} * sin(uTime * 3.0);\n// swings between ${n(v.c - v.a, 2)} and ${n(v.c + v.a, 2)}`,
        },
        {
          title: 'Speed (time) vs frequency (space)',
          body: `<p>Two numbers that people often mix up:</p>
<ul><li><b>Spatial frequency</b> — multiply <code>uv</code>: <code>sin(uv.x * freq)</code> → how many <b>stripes</b> fit on screen</li>
<li><b>Speed</b> — multiply <code>uTime</code>: <code>sin(uTime * speed)</code> → how fast it <b>changes</b></li></ul>
<p>Left uses only frequency (still). Right uses only speed (the whole square pulses).</p>`,
          controls: [
            { name: 'fq', label: 'frequency (space)', min: 2, max: 40, step: 1, value: 12 },
            { name: 'sp', label: 'speed (time)', min: 0.5, max: 8, step: 0.5, value: 2 },
          ],
          shaders: [
            { spec: (v) => ({ frag: 'col = vec3(0.5 + 0.5 * sin(uv.x * uF));', uniforms: { uF: v.fq } }), label: '<code>sin(uv.x * freq)</code>' },
            { spec: (v) => ({ frag: 'col = vec3(0.5 + 0.5 * sin(uTime * uS));', uniforms: { uS: v.sp } }), label: '<code>sin(uTime * speed)</code>' },
          ],
          code: (v) => `sin(uv.x * ${f(v.fq)})     // ${n(v.fq / G.TAU, 1)} stripes across\nsin(uTime * ${f(v.sp)})   // ${n(v.sp / G.TAU, 2)} pulses per second`,
          after: '<div class="tip">💡 In physics, "frequency" in time = cycles per second (Hz) = <code>speed / 2π</code>. In shader code people say "frequency" for the uv multiplier and "speed" for the time multiplier. Combine both in the next lesson to get moving waves!</div>',
        },
        {
          title: 'Choosing a period',
          body: `<p>Artists think in seconds: "pulse every 2 seconds". Turn that into a speed:</p>
<pre class="code">speed = 2π / period  →  sin(uTime * TAU / 2.0)</pre>
<p><code>TAU</code> (= 2π ≈ 6.283) is handy: <code>sin(uTime * TAU)</code> has a period of exactly <b>1 second</b>.</p>`,
          controls: [{ name: 'p', label: 'period (seconds)', min: 0.5, max: 4, step: 0.5, value: 2 }],
          shader: (v) => ({ frag: 'float b = 0.5 + 0.5 * sin(uTime * TAU / uP);\ncol = vec3(0.2, 0.5, 1.0) * b;', uniforms: { uP: v.p } }),
          code: (v) => `float b = 0.5 + 0.5 * sin(uTime * TAU / ${f(v.p, 1)});\n// speed = ${n(G.TAU / v.p, 2)}, one pulse every ${n(v.p)} s`,
          quiz: { q: 'What is the period of <code>sin(uTime * PI)</code>?', options: ['π seconds', '1 second', '2 seconds'], answer: 2, explain: 'period = 2π / speed = 2π / π = 2 seconds.' },
        },
      ],
      games: [
        {
          id: 'match-bob', title: 'Bob in sync', engine: 'slider', rounds: 4,
          blurb: 'Match the speed (and swing) of the bobbing ball.',
          gen: (rng, level) => {
            const k = rng.pick(level === 1 ? [1, 2, 4, 6] : [1, 1.5, 2, 3, 4, 5, 6]);
            const a = level === 1 ? 0.25 : rng.pick([0.1, 0.15, 0.2, 0.3, 0.35]);
            const params = [{ name: 'k', label: 'speed', min: 0.5, max: 7, step: 0.5, target: k }];
            if (level > 1) params.push({ name: 'a', label: 'amplitude', min: 0.05, max: 0.4, step: 0.05, target: a });
            return {
              prompt: 'Make your ball bob exactly like the target.',
              sub: level === 1 ? 'Only speed. Count bounces, or watch them lock together.' : 'Speed = how fast; amplitude = how far.',
              params,
              tolerance: 0.04,
              build: (vals) => T('float y = 0.5 + uA * sin(uTime * uK);\ncol = stage(uv);\ncol = mix(col, vec3(1.0, 0.83, 0.47), ball(uv, vec2(0.5, y), 0.07));', { uK: vals.k, uA: vals.a ?? a }),
              code: (vals) => `float y = 0.5 + ${f(vals.a ?? a, 2)} * sin(uTime * ${f(vals.k)});\n// period ${n(G.TAU / vals.k, 2)} s`,
              explain: `<p>Target: speed <b>${n(k)}</b> (period ${n(G.TAU / k, 2)} s), amplitude <b>${n(a)}</b>.</p>`,
            };
          },
        },
        {
          id: 'sin-value', title: 'Read the wave', engine: 'numeric', rounds: 6,
          blurb: 'Compute a sin-based value at a given time.',
          gen: (rng, level) => {
            // choose speed and time so the angle is a multiple of π/2 (clean values)
            const sp = rng.pick([{ c: 'PI', v: Math.PI }, { c: 'PI * 0.5', v: Math.PI / 2 }, { c: 'TAU', v: G.TAU }]);
            const isQuarter = (tt) => { const qq = (sp.v * tt) / (Math.PI / 2); return Math.abs(qq - Math.round(qq)) < 1e-6; };
            const t = rng.pick([0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3].filter(isQuarter));
            const ang = sp.v * t;
            const s = Math.round(Math.sin(ang));
            const form = level === 1 ? 'remap' : rng.pick(level === 2 ? ['remap', 'raw'] : ['raw', 'remap', 'abs', 'amp']);
            const exprs = {
              remap: { code: `float b = 0.5 + 0.5 * sin(uTime * ${sp.c});`, val: 0.5 + 0.5 * s },
              raw: { code: `float b = sin(uTime * ${sp.c});`, val: s },
              abs: { code: `float b = abs(sin(uTime * ${sp.c}));`, val: Math.abs(s) },
              amp: { code: `float b = 0.5 + 0.3 * sin(uTime * ${sp.c});`, val: 0.5 + 0.3 * s },
            };
            const e = exprs[form];
            const quarter = Math.round(ang / (Math.PI / 2));
            return {
              prompt: `At <code>uTime = ${n(t)}</code>, what is b?`,
              sub: 'sin(0) = 0, sin(π/2) = 1, sin(π) = 0, sin(3π/2) = −1',
              code: e.code, answer: r2(e.val),
              graph: level === 1 ? graphT([{ f: (x) => Math.sin(x * sp.v), label: `sin(t * ${sp.c})` }], 3) : undefined,
              explain: `<p>Angle = ${n(t)} × ${sp.c} = ${quarter === 0 ? '0' : quarter + ' × π/2'} → sin = <b>${s}</b>. Then b = ${n(e.val)}.</p>`,
            };
          },
        },
        {
          id: 'period', title: 'Period detective', engine: 'numeric', rounds: 6,
          blurb: 'Seconds per cycle from the code, or the speed for a wanted period.',
          gen: (rng, level) => {
            if (level === 3 && rng.chance(0.5)) {
              const P = rng.pick([1, 2, 4, 0.5, 3]);
              return { prompt: `You want <code>sin(uTime * speed)</code> to repeat every <b>${n(P)} s</b>. What speed?`, sub: 'Two decimals is fine.', answer: r2(G.TAU / P), explain: `<p>speed = 2π / period = 6.283 / ${n(P)} = <b>${n(G.TAU / P, 2)}</b>.</p>` };
            }
            const sp = rng.pick(level === 1 ? [{ c: 'TAU', v: G.TAU }, { c: 'PI', v: Math.PI }, { c: 'TAU * 2.0', v: G.TAU * 2 }] : [{ c: 'TAU', v: G.TAU }, { c: 'PI', v: Math.PI }, { c: 'TAU * 2.0', v: G.TAU * 2 }, { c: 'TAU / 4.0', v: G.TAU / 4 }, { c: '1.0', v: 1 }, { c: '2.0', v: 2 }, { c: 'PI * 0.5', v: Math.PI / 2 }]);
            return {
              prompt: 'How many seconds is one full cycle?',
              code: `float b = sin(uTime * ${sp.c});`,
              sub: sp.c.includes('PI') || sp.c.includes('TAU') ? 'TAU = 2π' : 'Two decimals is fine.',
              answer: r2(G.TAU / sp.v),
              explain: `<p>period = 2π / speed = 2π / ${sp.c} = <b>${n(G.TAU / sp.v, 2)} s</b>.</p>`,
            };
          },
        },
        {
          id: 'wave-graph', title: 'Code → curve', engine: 'mcq', rounds: 8,
          blurb: 'Pick the graph of the value over time.',
          gen: (rng, level) => {
            const mk = (r) => {
              const k = r.pick(level === 1 ? [1, 2, 3, 4] : [1, 2, 3, 4, 6]);
              const a = level === 1 ? 1 : r.pick([1, 0.5]);
              const c = level === 3 ? r.pick([0, 0.5]) : 0;
              const fn = level === 3 && r.chance(0.3) ? 'cos' : 'sin';
              const code = `${c ? f(c) + ' + ' : ''}${a !== 1 ? f(a) + ' * ' : ''}${fn}(uTime * ${f(k)})`;
              return { code, k, a, c, fn, f: (t) => c + a * Math[fn](t * k) };
            };
            const ans = mk(rng);
            const opts = distinct(rng, ans, (r, i) => {
              if (i === 0) { const k2 = ans.k === 1 ? 4 : ans.k / 2; return { ...ans, k: k2, code: 'x' + k2, f: (t) => ans.c + ans.a * Math[ans.fn](t * k2) }; }
              return mk(r);
            }, 4, (o) => [o.k, o.a, o.c, o.fn].join());
            return {
              prompt: 'Which graph shows this value over 4 seconds?',
              code: `float y = ${ans.code};`,
              options: opts.map((o) => ({ id: [o.k, o.a, o.c, o.fn].join(), graph: graphT([{ f: o.f, color: '#ffd479' }], 4, -1.2, 1.6) })),
              explain: `<p>Speed ${n(ans.k)} → period 2π/${n(ans.k)} ≈ <b>${n(G.TAU / ans.k, 2)} s</b>, so ≈ ${n(4 / (G.TAU / ans.k), 1)} cycles in 4 s.${ans.a !== 1 ? ` Amplitude ${n(ans.a)} → swings ±${n(ans.a)}.` : ''}${ans.c ? ` Centre ${n(ans.c)}.` : ''}${ans.fn === 'cos' ? ' cos starts at the top (1) instead of the middle.' : ''}</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'time.scroll',
      title: 'Scrolling UVs',
      blurb: 'uv + uTime × speed: conveyor belts, rivers, clouds.',
      lesson: [
        {
          title: 'Translate… over time',
          body: `<p>You already know <code>uv - offset</code> moves a picture by <code>+offset</code>. Make the offset grow with time and the picture <b>slides continuously</b>:</p>
<pre class="code">vec2 p = uv - vec2(uTime * speed, 0.0);</pre>
<p>Because the texture <b>repeats</b>, it never runs out — a conveyor belt.</p>`,
          controls: [{ name: 's', label: 'speed', min: -1, max: 1, step: 0.05, value: 0.25 }],
          shader: (v) => ({ frag: 'vec2 p = uv - vec2(uTime * uS, 0.0);\ncol = texture2D(uTex, p).rgb;', textures: { uTex: { name: 'letterF', wrap: 'repeat' } }, uniforms: { uS: v.s } }),
          code: (v) => `vec2 p = uv - vec2(uTime * ${f(v.s, 2)}, 0.0);\ncol = texture2D(uTex, p).rgb;\n// moves ${v.s > 0 ? 'RIGHT' : v.s < 0 ? 'LEFT' : 'nowhere'}`,
          after: '<div class="note">Same backwards rule as translation: <b>minus</b> → moves along +speed. <b>plus</b> → moves the other way.</div>',
        },
        {
          title: 'Direction is a vec2',
          body: `<p>Use a <code>vec2</code> velocity to scroll in any direction. With <code>uv - uTime * vel</code> the picture moves <b>along</b> vel — the arrow points where it goes.</p>`,
          controls: [
            { name: 'x', label: 'velocity.x', min: -0.5, max: 0.5, step: 0.05, value: 0.2 },
            { name: 'y', label: 'velocity.y', min: -0.5, max: 0.5, step: 0.05, value: 0.1 },
          ],
          shader: (v) => ({ frag: 'vec2 p = uv - uTime * uV;\ncol = texture2D(uTex, p * 2.0).rgb;', textures: { uTex: { name: 'checker', wrap: 'repeat' } }, uniforms: { uV: [v.x, v.y] } }),
          code: (v) => `vec2 vel = vec2(${f(v.x, 2)}, ${f(v.y, 2)});\nvec2 p = uv - uTime * vel;\ncol = texture2D(uTex, p * 2.0).rgb;`,
        },
        {
          title: 'Speed = uv units per second',
          body: `<p>Speed 0.25 means the texture moves <b>0.25 of the square per second</b>. So it takes 1 / 0.25 = <b>4 seconds</b> to slide one full tile.</p>
<p>Distance after t seconds = <b>t × speed</b>.</p>`,
          shader: { frag: 'vec2 p = uv - vec2(uTime * 0.25, 0.0);\ncol = texture2D(uTex, p).rgb;\ncol = mix(col, vec3(1.0), step(abs(uv.x - 0.5), 0.004));', textures: { uTex: { name: 'letterF', wrap: 'repeat' } } },
          code: 'vec2 p = uv - vec2(uTime * 0.25, 0.0);\n// after 1 s: moved 0.25   after 4 s: one full tile',
          quiz: { q: 'A river texture scrolls with <code>uTime * 0.1</code>. How long until it has moved one full tile?', options: ['0.1 s', '1 s', '10 s'], answer: 2, explain: '1 / 0.1 = 10 seconds.' },
        },
        {
          title: 'Layers at different speeds',
          body: `<p>Stack two scrolling layers with <b>different speeds</b> (and sizes) and you get depth: clouds, fog, magic energy. This is how lots of VFX are built!</p>`,
          controls: [
            { name: 'a', label: 'layer 1 speed', min: 0, max: 0.4, step: 0.02, value: 0.06 },
            { name: 'b', label: 'layer 2 speed', min: 0, max: 0.4, step: 0.02, value: 0.18 },
          ],
          shader: (v) => ({ frag: 'float n1 = fbm(uv * 3.0 - vec2(uTime * uA, 0.0));\nfloat n2 = fbm(uv * 6.0 - vec2(uTime * uB, uTime * 0.05));\ncol = mix(vec3(0.1, 0.2, 0.45), vec3(0.95), smoothstep(0.45, 0.8, n1 * 0.6 + n2 * 0.5));', uniforms: { uA: v.a, uB: v.b } }),
          code: (v) => `float n1 = fbm(uv * 3.0 - vec2(uTime * ${f(v.a, 2)}, 0.0)); // big, slow\nfloat n2 = fbm(uv * 6.0 - vec2(uTime * ${f(v.b, 2)}, uTime * 0.05)); // small, fast\ncol = mix(sky, white, smoothstep(0.45, 0.8, n1 * 0.6 + n2 * 0.5));`,
          after: '<div class="tip">💡 Unreal\'s <b>Panner</b> node and Shader Graph\'s Tiling And Offset + Time do exactly this. Panner\'s "Speed X/Y" = your velocity (it uses +, so check which way it goes!).</div>',
        },
      ],
      games: [
        {
          id: 'scroll-dir', title: 'Which way?', engine: 'mcq', rounds: 8,
          blurb: 'Read the scroll code, say which way the texture moves.',
          gen: (rng, level) => {
            const dirs = level === 1
              ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
              : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
            const d = rng.pick(dirs);
            const plus = level === 1 ? false : level === 2 ? rng.chance(0.4) : rng.chance(0.5);
            const s = rng.pick([0.1, 0.2, 0.3]);
            const vel = [d[0] * s, d[1] * s];
            const code = `vec2 p = uv ${plus ? '+' : '-'} uTime * vec2(${f(vel[0])}, ${f(vel[1])});\ncol = texture2D(uTex, p).rgb;`;
            const mv = plus ? [-d[0], -d[1]] : d;
            const name = (m) => ({ '1,0': '➡️ right', '-1,0': '⬅️ left', '0,1': '⬆️ up', '0,-1': '⬇️ down', '1,1': '↗️ up-right', '-1,1': '↖️ up-left', '1,-1': '↘️ down-right', '-1,-1': '↙️ down-left' })[m.join()];
            const ans = name(mv);
            const opts = distinct(rng, ans, (r, i) => (i === 0 ? name([-mv[0], -mv[1]]) : name(r.pick(dirs))), 4);
            const spec = { frag: code, textures: { uTex: { name: 'letterF', wrap: 'repeat' } } };
            return {
              prompt: 'Which way does the texture move on screen?',
              code,
              options: opts,
              explain: (el) => {
                el.innerHTML = `<p>${plus ? '<b>Plus</b> → the picture moves <b>against</b> the vector.' : '<b>Minus</b> → the picture moves <b>along</b> the vector.'} Here: <b>${ans}</b>.</p>`;
                el.append(shaderView(spec, { size: 140 }));
              },
            };
          },
        },
        {
          id: 'match-scroll', title: 'Lock the conveyor', engine: 'slider', rounds: 3,
          blurb: 'Match the scroll velocity until both textures move together.',
          gen: (rng, level) => {
            const vx = rng.pick([-0.3, -0.2, -0.1, 0.1, 0.2, 0.3]);
            const vy = level === 1 ? 0 : rng.pick([-0.2, -0.1, 0, 0.1, 0.2]);
            const params = [{ name: 'x', label: 'velocity.x', min: -0.4, max: 0.4, step: 0.05, target: vx }];
            if (level > 1) params.push({ name: 'y', label: 'velocity.y', min: -0.4, max: 0.4, step: 0.05, target: vy });
            const tex = level === 3 ? 'brick' : 'letterF';
            return {
              prompt: 'Match the scrolling. When it\'s right, both pictures move identically.',
              sub: 'Code uses <code>uv - uTime * vel</code>, so the picture moves along vel.',
              params,
              tolerance: 0.04,
              build: (vals) => ({ frag: 'vec2 p = uv - uTime * uV;\ncol = texture2D(uTex, p).rgb;', textures: { uTex: { name: tex, wrap: 'repeat' } }, uniforms: { uV: [vals.x, vals.y ?? 0] } }),
              code: (vals) => `vec2 p = uv - uTime * vec2(${f(vals.x, 2)}, ${f(vals.y ?? 0, 2)});`,
              explain: `<p>Target velocity: <b>(${n(vx)}, ${n(vy)})</b>. Positive x → right, positive y → up.</p>`,
            };
          },
        },
        {
          id: 'scroll-code', title: 'Spot the panner', engine: 'mcq', rounds: 6,
          blurb: 'Watch the scrolling texture, pick the code that made it.',
          gen: (rng, level) => {
            const dirs = [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.2, 0.2], [-0.2, 0.2]];
            const mk = (r) => {
              const d = r.pick(level === 1 ? dirs.slice(0, 4) : dirs);
              const plus = level === 3 && r.chance(0.5);
              return { d, plus, code: `uv ${plus ? '+' : '-'} uTime * vec2(${f(d[0])}, ${f(d[1])})`, move: plus ? [-d[0], -d[1]] : d };
            };
            const ans = mk(rng);
            const opts = distinct(rng, ans, mk, 4, (o) => o.move.join());
            return {
              prompt: 'Which code makes this movement?',
              shader: { frag: `vec2 p = ${ans.code};\ncol = texture2D(uTex, p).rgb;`, textures: { uTex: { name: 'letterF', wrap: 'repeat' } } },
              options: opts.map((o) => ({ code: `vec2 p = ${o.code};` })),
              explain: `<p>The F moves along <b>(${n(ans.move[0])}, ${n(ans.move[1])})</b> per second. With <code>uv - uTime * vel</code>, vel is that movement; with <code>+</code> it's the negative.</p>`,
            };
          },
        },
        {
          id: 'scroll-math', title: 'Conveyor maths', engine: 'numeric', rounds: 6,
          blurb: 'Distances and times for scrolling textures.',
          gen: (rng, level) => {
            const s = rng.pick([0.1, 0.2, 0.25, 0.5, 0.05]);
            const kind = rng.pick(level === 1 ? ['tile', 'dist'] : ['tile', 'dist', 'speed']);
            const code = `vec2 p = uv - vec2(uTime * ${f(s)}, 0.0);`;
            if (kind === 'tile') return { prompt: 'How many seconds until the texture has moved one full tile?', code, answer: r2(1 / s), explain: `<p>1 / ${n(s)} = <b>${n(1 / s)} s</b>.</p>` };
            if (kind === 'dist') {
              const t = rng.pick([2, 3, 4, 6]);
              return { prompt: `How far (in uv units) has it moved after ${t} seconds?`, code, answer: r2(s * t), explain: `<p>distance = speed × time = ${n(s)} × ${t} = <b>${n(s * t)}</b>.</p>` };
            }
            const L = rng.pick([2, 4, 5, 8, 10]);
            return { prompt: `An artist wants the texture to move one full tile every <b>${L} s</b>. What speed?`, answer: r2(1 / L), explain: `<p>speed = 1 / ${L} = <b>${n(1 / L)}</b> uv per second.</p>` };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'time.phase',
      title: 'Phase offsets & waves',
      blurb: 'Same clock, different start times: travelling waves and out-of-sync twinkles.',
      lesson: [
        {
          title: 'Same clock, different start',
          body: `<p>Add a number <i>inside</i> the sin: <code>sin(uTime + phase)</code>. Same speed, but it's <b>ahead</b> in the cycle by <code>phase</code>. That's a <b>phase offset</b>.</p>
<p>Each ball below gets phase = <code>index × step</code>. Drag the step.</p>`,
          controls: [{ name: 'p', label: 'phase step (radians)', min: 0, max: 3.14, step: 0.05, value: 0.8 }],
          shader: (v) => T('col = stage(uv);\nfor (int i = 0; i < 5; i++) {\n  float fi = float(i);\n  float y = 0.5 + 0.3 * sin(uTime * 2.0 - fi * uP);\n  col = mix(col, vec3(1.0, 0.83 - fi * 0.12, 0.47 + fi * 0.1), ball(uv, vec2(0.1 + fi * 0.2, y), 0.06));\n}', { uP: v.p }),
          code: (v) => `// ball i (0..4):\nfloat y = 0.5 + 0.3 * sin(uTime * 2.0 - float(i) * ${f(v.p, 2)});`,
          after: '<div class="note">Phase 0 → all in sync. Small steps → a smooth wave rolls along the row. Phase 2π (6.28) → back in sync, because sin repeats.</div>',
        },
        {
          title: 'Phase from position = travelling wave',
          body: `<p>Now let the <b>position</b> be the phase: <code>sin(uv.x * k - uTime)</code>. Every column of pixels is a little behind its left neighbour → a <b>wave that travels</b>.</p>
<p><code>k</code> controls how many waves fit (spatial frequency).</p>`,
          controls: [{ name: 'k', label: 'k (waves across)', min: 2, max: 40, step: 1, value: 15 }],
          shader: (v) => ({ frag: 'float w = 0.5 + 0.5 * sin(uv.x * uK - uTime * 3.0);\ncol = mix(vec3(0.05, 0.1, 0.3), vec3(0.4, 0.8, 1.0), w);', uniforms: { uK: v.k } }),
          code: (v) => `float w = 0.5 + 0.5 * sin(uv.x * ${f(v.k)} - uTime * 3.0);`,
        },
        {
          title: 'Which way does it travel?',
          body: `<p>Follow one crest (bright line). A crest is where the inside of the sin stays the same value:</p>
<pre class="code">uv.x * k - uTime = constant
→ uv.x = (constant + uTime) / k</pre>
<p>As uTime grows, uv.x grows → the crest moves <b>right</b>.</p>
<ul><li><code>sin(uv.x * k - uTime)</code> → moves <b>right</b> (towards +x)</li><li><code>sin(uv.x * k + uTime)</code> → moves <b>left</b></li></ul>`,
          shaders: [
            { spec: { frag: 'col = vec3(0.5 + 0.5 * sin(uv.x * 12.0 - uTime * 3.0));' }, label: '<code>uv.x*12 - uTime*3</code> → right' },
            { spec: { frag: 'col = vec3(0.5 + 0.5 * sin(uv.x * 12.0 + uTime * 3.0));' }, label: '<code>uv.x*12 + uTime*3</code> → left' },
          ],
          after: '<div class="tip">💡 Wave speed = time speed / k (here 3 / 12 = 0.25 uv per second). Use <code>uv.y</code> for vertical waves and <code>length(uv - 0.5)</code> for ripples going out in rings.</div>',
          quiz: { q: '<code>sin(length(uv - 0.5) * 30.0 - uTime * 4.0)</code> makes rings that…', options: ['move outwards', 'move inwards', 'stand still'], answer: 0, explain: 'Same rule with distance instead of x: minus time → the crest moves towards larger distance → outwards.' },
        },
        {
          title: 'Random phase per object',
          body: `<p>Want 100 lights that twinkle <b>out of sync</b>? Give each cell its own random phase with a hash of its cell id:</p>
<pre class="code">vec2 id = floor(uv * 6.0);          // which cell
float ph = hash(id) * TAU;          // random 0..2π
float b = 0.5 + 0.5 * sin(uTime * 3.0 + ph);</pre>
<p>Drag the slider from "all in sync" to "fully random".</p>`,
          controls: [{ name: 'r', label: 'randomness', min: 0, max: 1, step: 0.05, value: 1 }],
          shader: (v) => ({ frag: 'vec2 id = floor(uv * 6.0);\nvec2 cuv = fract(uv * 6.0) - 0.5;\nfloat ph = hash(id) * TAU * uR;\nfloat b = 0.5 + 0.5 * sin(uTime * 3.0 + ph);\ncol = vec3(1.0, 0.85, 0.4) * b * (1.0 - smoothstep(0.2, 0.35, length(cuv)));', uniforms: { uR: v.r } }),
          code: (v) => `float ph = hash(id) * TAU * ${f(v.r, 2)};\nfloat b = 0.5 + 0.5 * sin(uTime * 3.0 + ph);`,
          after: '<div class="tip">💡 In engines, per-instance random values (particle ID, object position, vertex colour) are the usual phase source, so copies of the same material don\'t blink together.</div>',
        },
      ],
      games: [
        {
          id: 'wave-dir', title: 'Wave direction', engine: 'mcq', rounds: 8,
          blurb: 'Read the wave formula, say which way it travels.',
          gen: (rng, level) => {
            const axes = level === 1
              ? [{ e: 'uv.x', d: [1, 0] }, { e: 'uv.y', d: [0, 1] }]
              : level === 2
                ? [{ e: 'uv.x', d: [1, 0] }, { e: 'uv.y', d: [0, 1] }, { e: '-uv.x', d: [-1, 0] }]
                : [{ e: 'uv.x', d: [1, 0] }, { e: 'uv.y', d: [0, 1] }, { e: '(uv.x + uv.y)', d: [1, 1] }, { e: '(uv.x - uv.y)', d: [1, -1] }, { e: 'length(uv - 0.5)', d: 'out' }];
            const ax = rng.pick(axes);
            const minus = rng.chance(0.5);
            const k = rng.pick([10, 15, 20]);
            const code = `float w = sin(${ax.e} * ${f(k)} ${minus ? '-' : '+'} uTime * 3.0);`;
            const names = { '1,0': '➡️ right', '-1,0': '⬅️ left', '0,1': '⬆️ up', '0,-1': '⬇️ down', '1,1': '↗️ up-right', '-1,-1': '↙️ down-left', '1,-1': '↘️ down-right', '-1,1': '↖️ up-left', out: '⭕ rings outwards', in: '🎯 rings inwards' };
            let mv;
            if (ax.d === 'out') mv = minus ? 'out' : 'in';
            else mv = (minus ? ax.d : ax.d.map((x) => -x)).join();
            const ans = names[mv];
            const pool = Object.values(names).filter((x) => (ax.d === 'out' ? true : !x.includes('rings')));
            const opp = ax.d === 'out' ? names[mv === 'out' ? 'in' : 'out'] : names[mv.split(',').map((x) => -x).join()];
            const opts = distinct(rng, ans, (r, i) => (i === 0 ? opp : r.pick(pool)), 4);
            return {
              prompt: 'Which way does this wave travel?',
              code,
              options: opts,
              explain: (el) => {
                el.innerHTML = `<p>Follow a crest: the inside stays constant. With <b>${minus ? 'minus' : 'plus'}</b> uTime, the crest moves towards ${minus ? 'larger' : 'smaller'} <code>${ax.e}</code> → <b>${ans}</b>.</p>`;
                el.append(shaderView({ frag: code + '\ncol = vec3(0.5 + 0.5 * w);' }, { size: 140 }));
              },
            };
          },
        },
        {
          id: 'match-phase', title: 'Make the wave', engine: 'slider', rounds: 4,
          blurb: 'Tune the phase step between neighbouring balls.',
          gen: (rng, level) => {
            const choices = level === 1 ? [0.25, 0.5, 1, 1.5] : [-1.5, -1, -0.5, -0.25, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
            const p = rng.pick(choices);
            const min = level === 1 ? 0 : -1.5;
            return {
              prompt: 'Match the wave rolling through the row of balls.',
              sub: level === 1 ? 'Phase step = how far behind each ball is from its left neighbour.' : 'Negative step → the wave rolls the other way.',
              params: [{ name: 'p', label: 'phase step', min, max: 1.5, step: 0.25, target: p }],
              build: (vals) => T('col = stage(uv);\nfor (int i = 0; i < 6; i++) {\n  float fi = float(i);\n  float y = 0.5 + 0.3 * sin(uTime * 2.0 - fi * uP);\n  col = mix(col, vec3(1.0, 0.83, 0.47), ball(uv, vec2(0.083 + fi * 0.167, y), 0.06));\n}', { uP: vals.p }),
              code: (vals) => `float y = 0.5 + 0.3 * sin(uTime * 2.0 - float(i) * ${f(vals.p, 2)});`,
              explain: `<p>Target step: <b>${n(p)}</b>. ${p > 0 ? 'Each ball lags its left neighbour → the wave travels right.' : 'Each ball is ahead of its left neighbour → the wave travels left.'}</p>`,
            };
          },
        },
        {
          id: 'phase-sort', title: 'Sync, wave or twinkle?', engine: 'buckets', rounds: 2,
          blurb: 'Sort animation code by how the pixels move together.',
          gen: () => ({
            prompt: 'How do the pixels animate relative to each other?',
            buckets: ['🟰 All in sync', '🌊 Travelling wave', '✨ Random twinkle'],
            count: 10,
            items: [
              { code: 'sin(uTime * 3.0)', bucket: 0 },
              { code: 'sin(uTime * 3.0 + 1.57)', bucket: 0, why: 'A constant phase shifts everyone equally — still in sync.' },
              { code: 'fract(uTime)', bucket: 0 },
              { code: 'abs(sin(uTime * 2.0))', bucket: 0 },
              { code: 'sin(uTime * 3.0 + uv.x * 8.0)', bucket: 1 },
              { code: 'fract(uTime - uv.y)', bucket: 1, why: 'Phase depends smoothly on position → a wave.' },
              { code: 'sin(length(uv - 0.5) * 20.0 - uTime)', bucket: 1, why: 'Rings moving outwards.' },
              { code: 'sin(uTime - uv.x * 5.0 - uv.y * 5.0)', bucket: 1 },
              { code: 'sin(uTime * 3.0 + hash(floor(uv * 8.0)) * TAU)', bucket: 2 },
              { code: 'fract(uTime * 0.5 + hash(id))', bucket: 2 },
              { code: 'sin(uTime * (1.0 + hash(id)))', bucket: 2, why: 'Random speed per cell — they drift apart.' },
              { code: 'step(0.9, fract(uTime + hash(id)))', bucket: 2 },
            ],
          }),
        },
      ],
    },
    // ==================================================================
    {
      id: 'time.ease',
      title: 'Easing & pulses',
      blurb: 'Make motion feel alive: ease in/out, ping-pong, flashes and heartbeats.',
      lesson: [
        {
          title: 'Linear looks robotic',
          body: `<p><code>fract(t)</code> moves at a constant speed, then teleports back. Real things <b>speed up and slow down</b>.</p>
<p><code>smoothstep(0.0, 1.0, x)</code> reshapes 0..1 into an S-curve: slow start, fast middle, slow end. That's <b>ease in-out</b>.</p>`,
          shaders: [
            { spec: ballX('fract(t * 0.5)'), label: 'linear: <code>fract(t)</code>' },
            { spec: ballX('smoothstep(0.0, 1.0, fract(t * 0.5))'), label: 'eased: <code>smoothstep(0,1, fract(t))</code>' },
          ],
          graph: { fns: [{ f: (x) => x, label: 'linear' }, { f: (x) => G.smoothstep(0, 1, x), label: 'smoothstep' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
        },
        {
          title: 'Ping-pong, step by step',
          body: `<p>To go there <b>and back</b>, we turn the sawtooth into a triangle. Move the slider to build it one step at a time:</p>`,
          controls: [{ name: 's', label: 'step', min: 0, max: 3, step: 1, value: 0 }],
          graph: {
            fns: (v) => [{ f: [(t) => fr(t), (t) => fr(t) * 2, (t) => fr(t) * 2 - 1, (t) => Math.abs(fr(t) * 2 - 1)][v.s], label: ['fract(t)', 'fract(t) * 2', 'fract(t) * 2 - 1', 'abs(fract(t) * 2 - 1)'][v.s] }],
            opts: { xmin: 0, xmax: 3, ymin: -1.2, ymax: 2.2 },
          },
          code: (v) => ['// 0 → 1, jump back\nfract(t)', '// 0 → 2, jump back\nfract(t) * 2.0', '// −1 → 1: now centred on zero\nfract(t) * 2.0 - 1.0', '// abs folds the negative half up:\n// 1 → 0 → 1  =  ping-pong!\nabs(fract(t) * 2.0 - 1.0)'][v.s],
          shader: ballX('abs(fract(t * 0.5) * 2.0 - 1.0)'),
          after: '<div class="note"><code>abs(fract(t) * 2.0 - 1.0)</code> is a classic. <code>1.0 - </code> that starts at 0 instead of 1.</div>',
        },
        {
          title: 'pow(): ease in or ease out',
          body: `<p><code>pow(x, k)</code> bends a 0..1 line but keeps 0 and 1 in place:</p>
<ul><li><b>k > 1</b>: starts slow, ends fast — <b>ease in</b> (like a falling object)</li><li><b>k &lt; 1</b>: starts fast, ends slow — <b>ease out</b> (like braking)</li></ul>`,
          controls: [{ name: 'k', label: 'k', min: 0.2, max: 5, step: 0.1, value: 3 }],
          shader: (v) => ({ ...ballX('pow(fract(t * 0.5), uK)'), uniforms: { uK: v.k } }),
          graph: { fns: (v) => [{ f: (x) => Math.pow(x, v.k), label: `pow(x, ${n(v.k)})` }, { f: (x) => x, color: '#4a4f63' }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          code: (v) => `float x = pow(fract(uTime * 0.5), ${f(v.k, 1)});  // ${v.k > 1.05 ? 'ease in' : v.k < 0.95 ? 'ease out' : 'linear'}`,
        },
        {
          title: 'Flashes and heartbeats',
          body: `<p>Pulses are short bright moments. Two favourites:</p>
<ul><li><b>Flash + fade</b> (hit flash, muzzle light): <code>exp(-fract(t) * k)</code> — jumps to 1, then decays. Bigger k = shorter flash.</li>
<li><b>Heartbeat</b>: <code>pow(0.5 + 0.5 * sin(t), k)</code> — sharpening a sine with a big power makes short peaks.</li></ul>`,
          controls: [{ name: 'k', label: 'sharpness k', min: 1, max: 20, step: 1, value: 6 }],
          shaders: [
            { spec: (v) => ({ frag: 'float b = exp(-fract(uTime) * uK);\ncol = vec3(1.0, 0.6, 0.2) * b;', uniforms: { uK: v.k } }), label: 'flash: <code>exp(-fract(t)*k)</code>' },
            { spec: (v) => ({ frag: 'float b = pow(0.5 + 0.5 * sin(uTime * 4.0), uK);\nfloat d = length(uv - 0.5);\ncol = vec3(1.0, 0.2, 0.35) * (1.0 - smoothstep(0.2 + 0.08 * b, 0.22 + 0.08 * b, d));', uniforms: { uK: v.k } }), label: 'heartbeat: <code>pow(…, k)</code>' },
          ],
          graph: { fns: (v) => [{ f: (t) => Math.exp(-fr(t) * v.k), label: 'flash' }, { f: (t) => Math.pow(0.5 + 0.5 * Math.sin(t * 4), v.k), label: 'heartbeat' }], opts: { xmin: 0, xmax: 3, ymin: -0.05, ymax: 1.1 } },
        },
        {
          title: 'Mix and match',
          body: `<p>Shaping functions chain like Lego: <b>loop</b> (fract) → <b>fold</b> (ping-pong) → <b>ease</b> (smoothstep). Result: a smooth back-and-forth that rests at each end.</p>`,
          shader: ballX('smoothstep(0.0, 1.0, abs(fract(t * 0.4) * 2.0 - 1.0))'),
          code: 'float t = fract(uTime * 0.4);        // loop every 2.5 s\nt = abs(t * 2.0 - 1.0);               // there and back\nt = smoothstep(0.0, 1.0, t);          // ease at the ends\n// x position = mix(0.1, 0.9, t)',
          quiz: { q: 'Which line makes a value go 1 → 0 → 1 once per second?', options: ['fract(uTime)', 'abs(fract(uTime) * 2.0 - 1.0)', 'sin(uTime)'], answer: 1, explain: 'That\'s the ping-pong triangle. fract only goes up; sin has a 6.28 s period and goes negative.' },
        },
      ],
      games: [
        {
          id: 'curve-pick', title: 'Code → curve', engine: 'mcq', rounds: 8,
          blurb: 'Read the timing expression, pick its graph.',
          gen: (rng, level) => {
            const pool = EXPR.filter((e) => e.lvl <= level);
            const ans = rng.pick(pool.filter((e) => e.lvl >= level - 1));
            const opts = distinct(rng, ans, (r) => r.pick(EXPR.filter((e) => e.lvl <= level + 1)), 4, (e) => e.fam);
            return {
              prompt: 'Which graph shows this value over 2 seconds?',
              code: `float t = uTime;\nfloat x = ${ans.code};`,
              shader: level < 3 ? ballX(ans.code) : undefined,
              shaderCaption: 'x as a moving ball',
              options: opts.map((e) => ({ id: e.code, graph: exprGraph(e) })),
              explain: `<p>Break it down from the inside out: start with <code>fract(t)</code> (0→1 every second), then apply each outer function to that shape.</p>`,
            };
          },
        },
        {
          id: 'graph-code', title: 'Curve → code', engine: 'mcq', rounds: 8,
          blurb: 'Look at the timing curve, pick the expression.',
          gen: (rng, level) => {
            const pool = EXPR.filter((e) => e.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, (r) => r.pick(pool.length >= 4 ? pool : EXPR), 4, (e) => e.fam);
            return {
              prompt: 'Which expression draws this curve (t = uTime)?',
              graph: exprGraph(ans),
              options: opts.map((e) => ({ code: e.code })),
              explain: `<p>Answer: <code>${ans.code}</code>. Check t = 0, 0.5 and 1 on the graph and plug them in.</p>`,
            };
          },
        },
        {
          id: 'ease-num', title: 'Evaluate the easing', engine: 'numeric', rounds: 6,
          blurb: 'Plug a time into ping-pong, pow and smoothstep.',
          gen: (rng, level) => {
            const t = rng.pick([0.25, 0.5, 0.75, 1.25, 1.5, 2.25, 2.75]);
            const forms = [
              { code: 'abs(fract(t) * 2.0 - 1.0)', fn: (x) => Math.abs(fr(x) * 2 - 1), lvl: 1, how: (x) => `fract = ${n(fr(x))}; ×2 = ${n(fr(x) * 2)}; −1 = ${n(fr(x) * 2 - 1)}; abs → ` },
              { code: 'pow(fract(t), 2.0)', fn: (x) => fr(x) ** 2, lvl: 1, how: (x) => `fract = ${n(fr(x))}; squared → ` },
              { code: '1.0 - abs(fract(t) * 2.0 - 1.0)', fn: (x) => 1 - Math.abs(fr(x) * 2 - 1), lvl: 2, how: (x) => `ping-pong = ${n(Math.abs(fr(x) * 2 - 1))}; 1 − that → ` },
              { code: 'smoothstep(0.0, 1.0, fract(t))', fn: (x) => G.smoothstep(0, 1, fr(x)), lvl: 2, how: (x) => `fract = ${n(fr(x))}; smoothstep = x²(3 − 2x) → ` },
              { code: 'pow(fract(t), 3.0)', fn: (x) => fr(x) ** 3, lvl: 3, how: (x) => `fract = ${n(fr(x))}; cubed → ` },
              { code: 'step(0.5, fract(t))', fn: (x) => G.step(0.5, fr(x)), lvl: 2, how: (x) => `fract = ${n(fr(x))}; is it ≥ 0.5? → ` },
              { code: 'fract(t * 2.0)', fn: (x) => fr(x * 2), lvl: 1, how: (x) => `t × 2 = ${n(x * 2)}; fract → ` },
            ].filter((e) => e.lvl <= level);
            const e = rng.pick(forms);
            const ans = r2(e.fn(t));
            return {
              prompt: `<code>t = ${n(t)}</code>. What is x?`,
              code: `float x = ${e.code};`,
              answer: ans,
              sub: 'Up to 3 decimals if needed.',
              tolerance: 0.006,
              explain: `<p>${e.how(t)}<b>${n(ans)}</b>.</p>`,
            };
          },
        },
        {
          id: 'match-ease', title: 'Feel the ease', engine: 'slider', rounds: 4,
          blurb: 'Match the pow() easing curve and motion.',
          gen: (rng, level) => {
            const k = rng.pick(level === 1 ? [0.5, 2, 3] : [0.3, 0.5, 0.7, 1.5, 2, 2.5, 3, 4]);
            return {
              prompt: 'Match the easing: same curve, same motion.',
              sub: 'Grey diagonal = linear (k = 1). k > 1 → ease in (slow start). k < 1 → ease out (slow end).',
              params: [{ name: 'k', label: 'k in pow(x, k)', min: 0.2, max: 4.2, step: 0.1, target: k }],
              tolerance: 0.04,
              build: (vals) => T('float x = fract(uTime * 0.5);\nfloat y = pow(x, uK);\nfloat c = pow(uv.x, uK);\ncol = stage(uv);\ncol = mix(col, vec3(0.35), 1.0 - smoothstep(0.0, 0.006, abs(uv.y - uv.x)));\ncol = mix(col, vec3(0.4, 0.8, 1.0), 1.0 - smoothstep(0.0, 0.012, abs(uv.y - c)));\ncol = mix(col, vec3(1.0, 0.83, 0.47), ball(uv, vec2(x, y), 0.045));', { uK: vals.k }),
              code: (vals) => `float y = pow(fract(uTime * 0.5), ${f(vals.k, 1)});`,
              explain: `<p>Target k = <b>${n(k)}</b> → ${k > 1 ? 'ease in: the ball crawls at first, then rushes.' : 'ease out: the ball rushes, then slows down.'}</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'time.flipbook',
      title: 'Flipbook timing',
      blurb: 'Pick the right frame from a sprite sheet at the right time.',
      lesson: [
        {
          title: 'A sheet full of frames',
          body: `<p>A <b>flipbook</b> (sprite sheet) packs animation frames into one texture. Ours is a 4×4 grid: <b>16 frames</b>, numbered 1–16, read left→right, top→bottom — like reading a book.</p>
<p>In code we count from <b>0</b>: frame 0 is the top-left "1", frame 15 is the bottom-right "16".</p>`,
          shader: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'flipbook' } },
        },
        {
          title: 'Which frame is it now?',
          body: `<p>At <code>fps</code> frames per second, the frame number is the time counted in frames, rounded down, wrapped to 16:</p>
<pre class="code">float frame = mod(floor(uTime * fps), 16.0);</pre>
<ul><li><code>uTime * fps</code>: how many frames have passed (e.g. 2.7 s × 8 = 21.6)</li><li><code>floor</code>: whole frames only → 21</li><li><code>mod(…, 16)</code>: loop back after 16 → frame 5</li></ul>`,
          controls: [{ name: 'fps', label: 'fps', min: 1, max: 24, step: 1, value: 4 }],
          shader: (v) => ({ ...FLIP('uFps'), uniforms: { uFps: v.fps } }),
          code: (v) => `float frame = mod(floor(uTime * ${f(v.fps)}), 16.0);\n// one loop = 16 / ${v.fps} = ${n(16 / v.fps, 2)} s`,
        },
        {
          title: 'Frame → place on the sheet',
          body: `<p>Now find that frame's square on the sheet:</p>
<ul><li>column = <code>mod(frame, 4.0)</code> (0..3, left→right)</li><li>row = <code>floor(frame / 4.0)</code> (0..3, <b>top→bottom</b>)</li></ul>
<p>uv.y goes <b>up</b>, so the top row is at cell y = 3: we use <code>3.0 - row</code>. Then squeeze uv into that cell: <code>(uv + cell) / 4.0</code>.</p>`,
          controls: [{ name: 'fr', label: 'frame', min: 0, max: 15, step: 1, value: 6 }],
          shaders: [
            { spec: (v) => ({ frag: 'vec2 cell = vec2(mod(uF, 4.0), 3.0 - floor(uF / 4.0));\ncol = texture2D(uTex, (uv + cell) / 4.0).rgb;', textures: { uTex: { name: 'flipbook', wrap: 'clamp' } }, uniforms: { uF: v.fr } }), label: 'the chosen frame' },
            { spec: (v) => ({ frag: 'col = texture2D(uTex, uv).rgb;\nvec2 cell = vec2(mod(uF, 4.0), 3.0 - floor(uF / 4.0));\nvec2 c = floor(uv * 4.0);\nfloat on = 1.0 - step(0.5, length(c - cell));\nvec2 e = abs(fract(uv * 4.0) - 0.5);\ncol = mix(col * 0.35, col, on);\ncol = mix(col, vec3(1.0), on * step(0.44, max(e.x, e.y)));', textures: { uTex: 'flipbook' }, uniforms: { uF: v.fr } }), label: 'where it is on the sheet' },
          ],
          code: (v) => `float frame = ${f(v.fr)};\nvec2 cell = vec2(mod(frame, 4.0), 3.0 - floor(frame / 4.0));\n//          = vec2(${f(v.fr % 4)}, ${f(3 - Math.floor(v.fr / 4))})\ncol = texture2D(uTex, (uv + cell) / 4.0).rgb;`,
        },
        {
          title: 'Loop timing',
          body: `<p>How long does one full loop take? <b>frames / fps</b>. 16 frames at 8 fps = <b>2 seconds</b>.</p>
<p>You'll also see this form, which gives the same frame:</p>
<pre class="code">float frame = floor(fract(uTime * fps / 16.0) * 16.0);</pre>
<p><code>fract(uTime * fps / 16.0)</code> is "how far through the loop" (0..1), times 16 → which frame.</p>`,
          quiz: { q: 'A 16-frame explosion should last exactly 0.5 s. What fps?', options: ['8', '32', '16'], answer: 1, explain: 'fps = frames / duration = 16 / 0.5 = 32.' },
        },
        {
          title: 'Out-of-sync copies',
          body: `<p>Nine torches with the same flipbook look fake if they flicker in lockstep. Add a random time offset per copy — exactly the phase trick from before:</p>
<pre class="code">float t = uTime + hash(id) * 10.0;
float frame = mod(floor(t * 6.0), 16.0);</pre>`,
          controls: [{ name: 'r', label: 'random offset', min: 0, max: 1, step: 1, value: 1 }],
          shader: (v) => ({ frag: 'vec2 id = floor(uv * 3.0);\nvec2 luv = fract(uv * 3.0);\nfloat t = uTime + hash(id) * 10.0 * uR;\nfloat frame = mod(floor(t * 6.0), 16.0);\nvec2 cell = vec2(mod(frame, 4.0), 3.0 - floor(frame / 4.0));\ncol = texture2D(uTex, (luv + cell) / 4.0).rgb;', textures: { uTex: { name: 'flipbook', wrap: 'clamp' } }, uniforms: { uR: v.r } }),
          after: '<div class="tip">💡 Unreal and Shader Graph both have a <b>Flipbook</b> node that does exactly this maths (and Unity particles have Texture Sheet Animation with a "random start frame" option).</div>',
        },
      ],
      games: [
        {
          id: 'frame-num', title: 'Which frame?', engine: 'numeric', rounds: 6,
          blurb: 'Compute the flipbook frame index at a given time.',
          gen: (rng, level) => {
            const frames = level === 3 ? rng.pick([16, 8]) : 16;
            const fps = rng.pick(level === 1 ? [2, 4, 10] : [4, 6, 8, 12, 24]);
            const t = level === 1 ? rng.pick([0.5, 1, 1.5, 2.25, 3]) : rng.step(0.5, 6, 0.25);
            const raw = t * fps, fl = Math.floor(raw + 1e-9), ans = fl % frames;
            const alt = level === 3 && rng.chance(0.5);
            const code = alt ? `float frame = floor(fract(uTime * ${f(fps)} / ${f(frames)}) * ${f(frames)});` : `float frame = mod(floor(uTime * ${f(fps)}), ${f(frames)});`;
            // avoid t*fps landing exactly on an integer edge at level 3? it's fine: floor is clear
            return {
              prompt: `<code>uTime = ${n(t)}</code>. Which frame index (0-based)?`,
              code, answer: ans, tolerance: 0.01,
              explain: `<p>${n(t)} × ${fps} = ${n(raw)} → floor = ${fl} → wrap at ${frames}: <b>${ans}</b>${frames === 16 ? ` (the tile showing "${ans + 1}")` : ''}.</p>`,
            };
          },
        },
        {
          id: 'flip-timing', title: 'Flipbook timing', engine: 'numeric', rounds: 6,
          blurb: 'Loop lengths, fps and cell positions.',
          gen: (rng, level) => {
            const kind = rng.pick(level === 1 ? ['len', 'col'] : level === 2 ? ['len', 'fps', 'col', 'row'] : ['fps', 'row', 'cell', 'len']);
            if (kind === 'len') {
              const frames = rng.pick([16, 8, 32]), fps = rng.pick([4, 8, 16]);
              return { prompt: `A ${frames}-frame flipbook plays at ${fps} fps. How many seconds is one loop?`, answer: r2(frames / fps), explain: `<p>frames / fps = ${frames} / ${fps} = <b>${n(frames / fps)} s</b>.</p>` };
            }
            if (kind === 'fps') {
              const frames = rng.pick([16, 8, 32]), d = rng.pick([0.5, 1, 2, 4]);
              return { prompt: `A ${frames}-frame effect must last <b>${n(d)} s</b>. What fps?`, answer: r2(frames / d), explain: `<p>fps = frames / duration = ${frames} / ${n(d)} = <b>${n(frames / d)}</b>.</p>` };
            }
            const fr2 = rng.int(0, 15);
            if (kind === 'col') return { prompt: `On a 4×4 sheet, which <b>column</b> (0–3, left→right) holds frame ${fr2}?`, code: 'float column = mod(frame, 4.0);', answer: fr2 % 4, tolerance: 0.01, explain: `<p>${fr2} mod 4 = <b>${fr2 % 4}</b>.</p>` };
            if (kind === 'row') return { prompt: `On a 4×4 sheet, which <b>row</b> (0–3, top→bottom) holds frame ${fr2}?`, code: 'float row = floor(frame / 4.0);', answer: Math.floor(fr2 / 4), tolerance: 0.01, explain: `<p>floor(${fr2} / 4) = <b>${Math.floor(fr2 / 4)}</b>.</p>` };
            const cell = [fr2 % 4, 3 - Math.floor(fr2 / 4)];
            return { prompt: `What is <code>cell</code> for frame ${fr2}?`, code: 'vec2 cell = vec2(mod(frame, 4.0), 3.0 - floor(frame / 4.0));', answer: cell, wrap: 'vec2', tolerance: 0.01, explain: `<p>column = ${fr2} mod 4 = ${cell[0]}; row = floor(${fr2}/4) = ${Math.floor(fr2 / 4)} → y = 3 − ${Math.floor(fr2 / 4)} = ${cell[1]}. <b>(${cell[0]}, ${cell[1]})</b>.</p>` };
          },
        },
        {
          id: 'flip-order', title: 'Build the flipbook', engine: 'order', rounds: 4,
          blurb: 'Put the flipbook lines in the right order.',
          gen: (rng, level) => {
            const fps = rng.pick([6, 8, 12]);
            const all = [
              { code: `float t = uTime * ${f(fps)};` },
              { code: 'float frame = mod(floor(t), 16.0);' },
              { code: 'vec2 cell = vec2(mod(frame, 4.0), 3.0 - floor(frame / 4.0));' },
              { code: 'vec2 sheetUV = (uv + cell) / 4.0;' },
              { code: 'col = texture2D(uTex, sheetUV).rgb;' },
            ];
            const items = level === 1 ? all.slice(2) : level === 2 ? all.slice(1) : all;
            return {
              prompt: 'Tap the lines in the order they must run.',
              sub: 'Each line needs a variable the one before it made.',
              items,
              explain: '<p>time → frame number → cell on the sheet → uv inside that cell → read the texture. Follow the variables: each line uses the one made just before it.</p>',
            };
          },
        },
        {
          id: 'match-fps', title: 'Match the frame rate', engine: 'slider', rounds: 3,
          blurb: 'Tune fps until your flipbook plays in sync with the target.',
          gen: (rng, level) => {
            const fps = rng.pick(level === 1 ? [2, 4, 8] : [2, 3, 4, 5, 6, 8, 10, 12]);
            return {
              prompt: 'Match the playback speed. When right, both show the same number.',
              sub: 'Count how many numbers pass per second.',
              params: [{ name: 'fps', label: 'fps', min: 1, max: 14, step: 1, target: fps }],
              tolerance: 0.02,
              build: (vals) => ({ ...FLIP('uFps'), uniforms: { uFps: vals.fps } }),
              code: (vals) => `float frame = mod(floor(uTime * ${f(vals.fps)}), 16.0);  // loop ${n(16 / vals.fps, 2)} s`,
              explain: `<p>Target: <b>${fps} fps</b> → a 16-frame loop every ${n(16 / fps, 2)} s.</p>`,
            };
          },
        },
      ],
    },
  ],
};
