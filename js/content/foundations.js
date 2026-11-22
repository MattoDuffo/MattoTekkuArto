// Topic 1 — Foundations: what a shader actually is.
import { tf, q, distinct, BW, GRAY3, f } from './_kit.js';

// ---------------------------------------------------------------- shared pools
// Simple programs used for "code ↔ image" games. `lvl` = minimum level.
const SIMPLE = [
  { code: 'col = vec3(uv.x);', lvl: 1 },
  { code: 'col = vec3(uv.y);', lvl: 1 },
  { code: 'col = vec3(1.0 - uv.x);', lvl: 1 },
  { code: 'col = vec3(1.0 - uv.y);', lvl: 2 },
  { code: 'col = vec3(1.0, 0.0, 0.0);', lvl: 1 },
  { code: 'col = vec3(0.0, 0.0, 1.0);', lvl: 1 },
  { code: 'col = vec3(0.5);', lvl: 1 },
  { code: 'col = vec3(uv.x, 0.0, 0.0);', lvl: 1 },
  { code: 'col = vec3(0.0, uv.y, 0.0);', lvl: 1 },
  { code: 'col = vec3(uv.x, uv.y, 0.0);', lvl: 2 },
  { code: 'col = vec3(0.0, uv.x, uv.y);', lvl: 3 },
  { code: 'col = vec3(uv.y, 0.0, uv.x);', lvl: 3 },
  { code: 'if (uv.x > 0.5) col = vec3(1.0);', lvl: 1 },
  { code: 'if (uv.y > 0.5) col = vec3(1.0);', lvl: 1 },
  { code: 'if (uv.x < 0.5) col = vec3(1.0);', lvl: 2 },
  { code: 'if (uv.y < 0.5) col = vec3(1.0);', lvl: 2 },
  { code: 'if (uv.x > uv.y) col = vec3(1.0);', lvl: 2 },
  { code: 'if (uv.x < uv.y) col = vec3(1.0);', lvl: 3 },
  { code: 'col = vec3(uv.x * uv.y);', lvl: 3 },
  { code: 'if (uv.x > 0.5 && uv.y > 0.5) col = vec3(1.0);', lvl: 2 },
  { code: 'if (uv.x > 0.5 || uv.y > 0.5) col = vec3(1.0);', lvl: 3 },
  { code: 'if (uv.x + uv.y > 1.0) col = vec3(1.0);', lvl: 3 },
];

// Rules for "Be the GPU" (paint engine). Each returns a palette index 0/1(/2).
function paintRule(rng, level) {
  const T = [0.25, 0.5, 0.75];
  const L1 = [
    () => { const t = rng.pick(T); return { code: `if (uv.x > ${f(t)}) col = vec3(1.0);\nelse        col = vec3(0.0);`, solve: (u) => +(u > t) }; },
    () => { const t = rng.pick(T); return { code: `if (uv.y > ${f(t)}) col = vec3(1.0);\nelse        col = vec3(0.0);`, solve: (u, v) => +(v > t) }; },
    () => { const t = rng.pick(T); return { code: `if (uv.x < ${f(t)}) col = vec3(1.0);\nelse        col = vec3(0.0);`, solve: (u) => +(u < t) }; },
    () => { const t = rng.pick(T); return { code: `if (uv.y < ${f(t)}) col = vec3(1.0);\nelse        col = vec3(0.0);`, solve: (u, v) => +(v < t) }; },
  ];
  const L2 = [
    () => { const a = rng.pick(T), b = rng.pick(T); return { code: `if (uv.x > ${f(a)} && uv.y > ${f(b)})\n  col = vec3(1.0);`, solve: (u, v) => +(u > a && v > b) }; },
    () => { const a = rng.pick(T), b = rng.pick(T); return { code: `if (uv.x < ${f(a)} || uv.y > ${f(b)})\n  col = vec3(1.0);`, solve: (u, v) => +(u < a || v > b) }; },
    () => ({ code: 'if (uv.x > uv.y) col = vec3(1.0);', solve: (u, v) => +(u > v), note: 'Pixels exactly on the diagonal have uv.x == uv.y — "greater than" is false there, so they stay black.' }),
    () => { const t = rng.pick([0.25, 0.5]); return { code: `if (abs(uv.x - 0.5) < ${f(t)})\n  col = vec3(1.0);`, solve: (u) => +(Math.abs(u - 0.5) < t), note: 'abs(uv.x - 0.5) is "how far am I from the vertical centre line".' }; },
  ];
  const L3 = [
    () => ({ code: 'float d = length(uv - vec2(0.5));\nif (d < 0.3) col = vec3(1.0);', solve: (u, v) => +(Math.hypot(u - 0.5, v - 0.5) < 0.3), note: 'length(uv - 0.5) is the distance from the centre. Pixels closer than 0.3 are inside a circle.' }),
    () => ({ code: 'col = vec3(floor(uv.x * 3.0) / 2.0);', solve: (u) => Math.floor(u * 3), palette: GRAY3, note: 'uv.x*3 goes 0..3, floor() gives 0, 1 or 2, divided by 2 → 0, 0.5, 1.' }),
    () => ({ code: 'if (uv.x + uv.y < 0.9) col = vec3(1.0);', solve: (u, v) => +(u + v < 0.9) }),
    () => ({ code: 'if (uv.x > 0.5) col = vec3(0.5);\nif (uv.y > 0.5) col = vec3(1.0);', solve: (u, v) => (v > 0.5 ? 2 : u > 0.5 ? 1 : 0), palette: GRAY3, note: 'Order matters: the second line runs AFTER the first and overwrites col for the top half.' }),
  ];
  const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2, ...L2] : [...L2, ...L3, ...L3];
  return rng.pick(pool)();
}

export default {
  id: 'foundations',
  title: 'Foundations: What is a shader?',
  icon: '🌱',
  blurb: 'GPUs, pixels, and the "one tiny program per pixel" mindset.',
  cheatsheet: `
<p><b>Shader</b> = a small program that the GPU runs <i>many times in parallel</i>.</p>
<ul>
<li><b>Vertex shader</b>: runs once per vertex → decides <i>where</i> things go on screen.</li>
<li><b>Fragment (pixel) shader</b>: runs once per pixel → decides <i>what colour</i> it is.</li>
</ul>
<p>Every pixel runs the <b>same code</b>, only its <b>inputs</b> differ (its position <code>uv</code>, …). Pixels can't see each other's results and don't remember the last frame.</p>
<p><b>Uniform</b>: same value for all pixels (time, colour picked in the material). <b>Varying</b>: differs per pixel (uv, normal). <b>Texture</b>: an image you can sample anywhere.</p>
<pre class="code">precision highp float;
uniform float uTime;   // same for every pixel
varying vec2 vUv;      // different for every pixel
void main() {
  vec3 col = vec3(vUv.x);
  gl_FragColor = vec4(col, 1.0); // RGBA output
}</pre>
<p>In this app you only write the <b>body</b>: set <code>col</code> using <code>uv</code>.</p>`,
  concepts: [
    // ------------------------------------------------------------------
    {
      id: 'found.gpu',
      title: 'CPU vs GPU',
      blurb: 'Why graphics needs thousands of tiny workers instead of one fast one.',
      lesson: [
        {
          title: 'So many pixels',
          body: `<p>An iPhone 12 screen has about <b>3 million pixels</b>. A game redraws them <b>60 times per second</b>.</p>
<p>That's <b>180 million</b> colour calculations every second — just for one layer of the image.</p>
<div class="note">The CPU (your phone's main processor) is like a genius who does a few tasks extremely fast, one after another. Even a genius can't do 180 million things a second on their own.</div>`,
        },
        {
          title: 'The GPU: an army of simple workers',
          body: `<p>The <b>GPU</b> (graphics processor) has <b>thousands of small cores</b>. Each one is simpler and slower than a CPU core, but they all work <b>at the same time</b>.</p>
<div class="analogy">🍔 <b>Analogy:</b> the CPU is a master chef cooking one fancy dish at a time. The GPU is a stadium full of line cooks, each making <i>one burger</i> from the <i>same recipe</i>, all at once.</div>
<p>Graphics is perfect for the GPU: every pixel needs the same <i>kind</i> of calculation.</p>`,
        },
        {
          title: 'A shader is the recipe',
          body: `<p>A <b>shader</b> is a small program — the <i>recipe</i> handed to every worker.</p>
<p>You write it <b>once</b>. The GPU runs it <b>once per pixel</b> (a <i>fragment shader</i>) or <b>once per vertex</b> (a <i>vertex shader</i>).</p>
<p>Below: a shader that says "be orange". Every pixel runs it, so the whole square is orange.</p>`,
          shader: { frag: 'col = vec3(1.0, 0.5, 0.1);' },
          code: 'col = vec3(1.0, 0.5, 0.1); // red, green, blue',
        },
        {
          title: 'Same recipe, different seat',
          body: `<p>If every pixel ran the <i>exact</i> same recipe with the <i>exact</i> same ingredients, every pixel would be the same colour. Boring!</p>
<p>The trick: each pixel gets one <b>personal ingredient</b> — its own <b>position</b> on the image, called <code>uv</code>. <code>uv.x</code> is 0 on the left edge and 1 on the right.</p>
<p>Drag the slider to blend between "same colour everywhere" and "use the position".</p>`,
          controls: [{ name: 'k', label: 'how much position is used', min: 0, max: 1, step: 0.01, value: 1 }],
          shader: (v) => ({ frag: 'col = vec3(mix(0.5, uv.x, uK));', uniforms: { uK: v.k } }),
          code: (v) => `col = vec3(mix(0.5, uv.x, ${f(v.k, 2)}));\n// at 0: every pixel = 0.5 (flat grey)\n// at 1: every pixel = its own uv.x (gradient)`,
          quiz: { q: 'Why does the gradient appear even though every pixel runs the same code?', options: ['Each pixel has a different uv (position) input', 'The GPU randomly changes the code per pixel', 'The CPU paints the gradient afterwards'], answer: 0, explain: 'Same code + different input = different output. That idea is the heart of shaders.' },
        },
      ],
      games: [
        {
          id: 'gpu-facts', title: 'GPU: fact or myth?', engine: 'mcq', rounds: 8,
          blurb: 'Quick true/false about what GPUs and shaders are.',
          questions: [
            tf('A fragment shader runs once for every pixel it covers.', true, 'Yes — the GPU launches one copy per pixel (strictly: per <i>fragment</i>, a candidate pixel).'),
            tf('A GPU core is generally faster than a CPU core at a single task.', false, 'No — individual GPU cores are simpler and slower. The GPU wins by having thousands working in parallel.'),
            tf('You have to write a separate shader for each pixel.', false, 'You write <b>one</b> shader. The GPU runs that same program for every pixel.'),
            tf('A vertex shader decides where a vertex ends up on screen.', true, 'Right. Vertex shaders position geometry; fragment shaders colour pixels.'),
            tf('A fragment shader decides the colour of a pixel.', true, 'Exactly — its job is to output one colour (RGBA).'),
            tf('Shaders run on the CPU and the result is sent to the GPU.', false, 'Shaders run <b>on the GPU</b>. The CPU only sends data and says "draw".'),
            tf('Every copy of a fragment shader gets the same position input.', false, 'Each copy gets its <b>own</b> position (uv). That\'s why outputs differ.'),
            tf('GPUs are good at doing the same calculation on lots of data at once.', true, 'That\'s exactly what they\'re built for (called SIMD / SIMT).'),
            tf('A game at 60 fps on a 1080p screen computes ~124 million pixel colours per second.', true, '1920 × 1080 ≈ 2.07M pixels × 60 ≈ 124M. And often several times more with overdraw and post effects!', 2),
            tf('In Unreal, a Material graph is turned into shader code behind the scenes.', true, 'Yes — material graphs and Shader Graph generate HLSL shader code for you. Understanding shaders helps you understand nodes.', 2),
            tf('A shader is a kind of texture.', false, 'No — a texture is an image (data). A shader is a program. Shaders can <i>read</i> textures.'),
            tf('The vertex shader runs before the fragment shader.', true, 'Vertices are positioned first, then the triangle is filled with pixels, then each pixel is coloured.', 2),
            q('Roughly how many pixels does an iPhone 12 screen have?', ['~3 million', '~30 thousand', '~300 million', '~3 thousand'], '2532 × 1170 ≈ 2.96 million pixels.'),
            q('Which shader decides the final colour of each pixel?', ['Fragment shader', 'Vertex shader', 'Texture shader', 'CPU shader'], 'The fragment (a.k.a. pixel) shader.'),
          ],
        },
        {
          id: 'cpu-or-gpu', title: 'CPU job or GPU job?', engine: 'buckets', rounds: 2,
          blurb: 'Sort tasks: does this suit one smart worker (CPU) or an army of simple ones (GPU)?',
          gen: (rng) => ({
            prompt: 'Who should do this job?',
            sub: 'GPU = same simple work for lots of items at once. CPU = complex, step-by-step decisions.',
            buckets: ['🧠 CPU', '🎨 GPU'],
            count: 10,
            items: [
              { text: 'Colour 3 million pixels with the same formula', bucket: 1 },
              { text: 'Decide what an enemy AI does next', bucket: 0, why: 'One complex decision with lots of branching — CPU.' },
              { text: 'Move 100,000 grass blades in the wind', bucket: 1, why: 'Same small calculation for every blade — GPU (vertex shader).' },
              { text: 'Load a save file from disk', bucket: 0 },
              { text: 'Blur every pixel of the screen', bucket: 1 },
              { text: 'Run the dialogue tree of a quest', bucket: 0 },
              { text: 'Apply colour grading to the whole frame', bucket: 1 },
              { text: 'Read the gamepad buttons', bucket: 0 },
              { text: 'Transform 50,000 vertices of a character', bucket: 1 },
              { text: 'Calculate lighting for each pixel of a wall', bucket: 1 },
              { text: 'Decide which level to load next', bucket: 0 },
              { text: 'Send network packets to other players', bucket: 0 },
              { text: 'Tint every pixel of a sprite red when hit', bucket: 1 },
              { text: 'Animate 10,000 particles with the same rule', bucket: 1, why: 'Many identical simple updates — classic GPU work.' },
            ],
          }),
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: 'found.fragment',
      title: 'What colour is THIS pixel?',
      blurb: 'A fragment shader answers one question, for one pixel at a time.',
      lesson: [
        {
          title: 'The only question',
          body: `<p>A fragment shader answers exactly one question:</p>
<div class="note" style="font-size:18px"><b>"What colour should <u>this</u> pixel be?"</b></div>
<p>In this app you write the answer by setting <code>col</code> — a colour made of three numbers: <b>red, green, blue</b>, each from <code>0.0</code> (none) to <code>1.0</code> (full).</p>
<p>Move the sliders and watch the code change.</p>`,
          controls: [
            { name: 'r', label: 'red', min: 0, max: 1, step: 0.01, value: 0.2 },
            { name: 'g', label: 'green', min: 0, max: 1, step: 0.01, value: 0.6 },
            { name: 'b', label: 'blue', min: 0, max: 1, step: 0.01, value: 1 },
          ],
          shader: (v) => ({ frag: 'col = uC;', uniforms: { uC: [v.r, v.g, v.b] } }),
          code: (v) => `col = vec3(${f(v.r, 2)}, ${f(v.g, 2)}, ${f(v.b, 2)});`,
        },
        {
          title: 'Using the position',
          body: `<p>Every pixel knows where it is: <code>uv</code>. It has two parts:</p>
<ul><li><code>uv.x</code>: 0.0 at the <b>left</b> edge → 1.0 at the <b>right</b> edge</li>
<li><code>uv.y</code>: 0.0 at the <b>bottom</b> → 1.0 at the <b>top</b></li></ul>
<p>If we use <code>uv.x</code> as the brightness, pixels on the left get 0 (black) and pixels on the right get 1 (white).</p>`,
          shader: { frag: 'col = vec3(uv.x);' },
          code: 'col = vec3(uv.x); // vec3(x) means (x, x, x) → grey level x',
          after: '<div class="tip">💡 <code>vec3(0.3)</code> is shorthand for <code>vec3(0.3, 0.3, 0.3)</code>: equal red, green and blue = a grey.</div>',
        },
        {
          title: 'Making a decision',
          body: `<p>Each pixel can make its own decision with <code>if</code>. Here: "if I'm right of the line, I'm white".</p>
<p>Drag the threshold. Every pixel re-runs the same test with its own <code>uv.x</code>.</p>`,
          controls: [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (v) => ({ frag: 'if (uv.x > uT) col = vec3(1.0);', uniforms: { uT: v.t } }),
          code: (v) => `if (uv.x > ${f(v.t, 2)}) col = vec3(1.0);\n// pixels that fail the test keep col = vec3(0.0) (black)`,
          quiz: { q: 'A pixel at uv = (0.3, 0.9). Threshold is 0.5. What colour is it?', options: ['Black — 0.3 is not > 0.5', 'White — 0.9 is > 0.5', 'Grey'], answer: 0, explain: 'The test only looks at uv.x (0.3). uv.y doesn\'t matter here.' },
        },
        {
          title: 'You are the GPU',
          body: `<p>In the next game <b>you</b> play the GPU. You'll get a tiny image (a grid of big pixels) and a piece of shader code.</p>
<p>For each pixel: look at its <code>uv</code> (printed in the corner), run the code in your head, and paint the result.</p>
<div class="analogy">🎓 This is exactly what the GPU does — just millions of times, and all at once.</div>`,
          shader: { frag: 'vec2 g = floor(uv * 6.0);\nfloat on = step(0.5, uv.x);\ncol = vec3(on) * 0.85 + 0.1 * mod(g.x + g.y, 2.0);' },
        },
      ],
      games: [
        {
          id: 'be-gpu', title: 'Be the GPU', engine: 'paint', rounds: 4,
          blurb: 'Run the shader in your head for every pixel and paint the result.',
          gen: (rng, level) => {
            const r = paintRule(rng, level);
            const W = level === 1 ? 4 : 6;
            return {
              prompt: 'Paint what this shader outputs:',
              code: r.code,
              w: W, h: W,
              palette: r.palette || BW,
              solve: r.solve,
              showUV: level < 3,
              explain: (r.note ? `<p>${r.note}</p>` : '') + '<p>Each pixel looked only at <b>its own</b> uv. That\'s the whole trick.</p>',
            };
          },
        },
        {
          id: 'code-to-image', title: 'Code → Image', engine: 'mcq', rounds: 8,
          blurb: 'Read a tiny shader and pick the picture it draws.',
          gen: (rng, level) => {
            const pool = SIMPLE.filter((s) => s.lvl <= level + 1);
            const ans = rng.pick(pool.filter((s) => s.lvl <= level) .length ? pool.filter((s) => s.lvl <= level) : pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.code);
            return {
              prompt: 'Which image does this code produce?',
              code: ans.code,
              options: opts.map((o) => ({ shader: { frag: o.code } })),
              explain: '<p>Remember: <code>uv.x</code> grows left→right, <code>uv.y</code> grows bottom→top. Pixels where nothing sets <code>col</code> stay black.</p>',
            };
          },
        },
        {
          id: 'image-to-code', title: 'Image → Code', engine: 'mcq', rounds: 8,
          blurb: 'Look at the picture and pick the code that made it.',
          gen: (rng, level) => {
            const pool = SIMPLE.filter((s) => s.lvl <= level + 1);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.code);
            return {
              prompt: 'Which code made this image?',
              shader: { frag: ans.code },
              options: opts.map((o) => ({ code: o.code })),
              explain: '<p>Tip: check the corners. Bottom-left is uv (0,0), top-right is (1,1). Plug those into the code.</p>',
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: 'found.parallel',
      title: 'Every pixel is on its own',
      blurb: 'Pixels can\'t talk to each other or remember the past.',
      lesson: [
        {
          title: 'No peeking at the neighbours',
          body: `<p>All the pixel programs run <b>at the same time</b>. So a pixel <b>can't ask</b> "what colour did the pixel on my left choose?" — that pixel is being computed right now too.</p>
<div class="analogy">📝 <b>Analogy:</b> an exam hall. Everyone gets the same question sheet but a different seat number. No one may look at anyone else's paper. Your answer can only depend on the sheet and your seat number.</div>`,
        },
        {
          title: 'Everything comes from inputs',
          body: `<p>So what <i>can</i> a pixel use? Only its <b>inputs</b>:</p>
<ul>
<li><b>Its position</b> (<code>uv</code>)</li>
<li><b>Shared values</b> set before drawing (time, colours, light direction …) — called <b>uniforms</b></li>
<li><b>Textures</b> — images it can read at <i>any</i> position</li>
</ul>
<p>Want a blur? You don't read neighbour <i>pixels' outputs</i>; you read the <i>texture</i> a few times at nearby positions.</p>`,
          shader: { frag: 'vec3 a = texture2D(uTex, uv).rgb;\nvec3 b = texture2D(uTex, uv + vec2(0.03, 0.0)).rgb;\ncol = mix(a, b, step(0.5, uv.y));', textures: { uTex: 'photo' } },
          code: '// top half: read the texture slightly to the right\nvec3 a = texture2D(uTex, uv).rgb;\nvec3 b = texture2D(uTex, uv + vec2(0.03, 0.0)).rgb;\ncol = mix(a, b, step(0.5, uv.y));',
        },
        {
          title: 'No memory of the last frame',
          body: `<p>A shader doesn't remember anything. Each frame starts fresh.</p>
<p>So how do things animate? The CPU passes the current <b>time</b> as a uniform (<code>uTime</code>). The colour is computed <i>from</i> time — not from the previous frame.</p>`,
          shader: { frag: 'col = vec3(0.5 + 0.5 * sin(uTime * 2.0 + uv.x * 6.0), 0.3, 0.6);' },
          code: 'col = vec3(0.5 + 0.5 * sin(uTime * 2.0 + uv.x * 6.0), 0.3, 0.6);',
          after: '<div class="tip">Effects that DO need memory (trails, fluid sims) render into a texture and read it back next frame — a technique called <b>feedback</b> or <b>ping-pong buffers</b>.</div>',
        },
        {
          title: 'No order',
          body: `<p>There's also no "first pixel" and "last pixel". You can't say "do the top row first". The GPU picks the order, and you must write code that works in <i>any</i> order.</p>
<p>That's why shader code is <b>a formula</b>, not a series of drawing commands like "draw a circle here".</p>`,
          quiz: { q: 'You want a pixel to be red if the pixel to its left is red. What\'s the problem?', options: ['It cannot read another pixel\'s output — they run at the same time', 'Red is not allowed in shaders', 'It works fine'], answer: 0, explain: 'You\'d have to re-compute the neighbour\'s colour yourself (same formula, neighbour\'s position), or read from a texture.' },
        },
      ],
      games: [
        {
          id: 'possible', title: 'Possible in one pass?', engine: 'buckets', rounds: 2,
          blurb: 'Can a single fragment shader do this on its own?',
          gen: () => ({
            prompt: 'Can one fragment shader do this, by itself, in one pass?',
            buckets: ['✅ Yes', '🚫 No'],
            count: 10,
            items: [
              { text: 'Colour a pixel based on its uv', bucket: 0 },
              { text: 'Read the colour the pixel on the left just output', bucket: 1, why: 'Neighbours run at the same time; outputs aren\'t visible.' },
              { text: 'Sample a texture at uv + a small offset', bucket: 0, why: 'Textures can be read anywhere — that\'s how blurs work.' },
              { text: 'Count how many pixels on screen are red', bucket: 1, why: 'Needs to combine all pixels (a reduction). Requires extra passes or compute shaders.' },
              { text: 'Change brightness over time using uTime', bucket: 0 },
              { text: 'Remember its own colour from last frame', bucket: 1, why: 'No memory. You\'d need to render to a texture and read it back (feedback).' },
              { text: 'Use a colour picked by the artist in the material', bucket: 0, why: 'That\'s a uniform — shared input.' },
              { text: 'Force pixel #5 to finish before pixel #6', bucket: 1, why: 'There\'s no order you can rely on.' },
              { text: 'Compute the colour its left neighbour WOULD get, using the same formula', bucket: 0, why: 'Allowed: just evaluate the formula at the neighbour\'s position yourself.' },
              { text: 'Draw a circle using the distance to the centre', bucket: 0 },
              { text: 'Write to a different pixel\'s location', bucket: 1, why: 'A fragment shader only writes its own pixel.' },
              { text: 'Pick a random-looking value from its uv', bucket: 0, why: 'Hash functions turn position into pseudo-random numbers.' },
            ],
          }),
        },
        {
          id: 'parallel-quiz', title: 'Parallel thinking', engine: 'mcq', rounds: 6,
          blurb: 'Concept questions about how pixels run independently.',
          questions: [
            q('Every pixel runs the same code. What makes their colours different?', ['Their inputs, e.g. position uv', 'Random GPU noise', 'The order they run in'], 'Same code, different inputs.'),
            q('How does a shader animate if it has no memory?', ['It receives the current time as a uniform and computes from that', 'It stores the last colour in a variable', 'The CPU redraws pixels one by one'], 'uTime goes in, a different colour comes out each frame.'),
            q('Which of these is a valid way to blur an image in a fragment shader?', ['Sample the input texture several times around uv and average', 'Average the outputs of neighbouring pixels', 'Ask the CPU for neighbour colours mid-draw'], 'Reading the texture at offsets is the standard method.'),
            q('Which value would be a <b>uniform</b>?', ['The time in seconds', 'The pixel\'s uv', 'The pixel\'s colour output'], 'Uniform = same for every pixel during a draw call.'),
            tf('Shader code should give the right result no matter which order pixels are processed in.', true, 'Exactly — you can\'t control or rely on the order.'),
            tf('A fragment shader can write to any pixel it wants.', false, 'It only produces the colour of its own pixel.'),
            q('Why is shader code written like a formula?', ['Each pixel must compute its result independently from its inputs', 'Because GLSL has no if statements', 'To make it shorter'], 'Formula: inputs → output. No drawing commands, no neighbours.'),
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: 'found.inputs',
      title: 'Uniforms, varyings & textures',
      blurb: 'The three kinds of ingredients a shader receives.',
      lesson: [
        {
          title: 'Uniform: same for everyone',
          body: `<p>A <b>uniform</b> is a value the CPU sets <b>before</b> drawing. It's the <b>same</b> for every pixel (and vertex) of that draw.</p>
<div class="analogy">📢 Like an announcement over the stadium loudspeaker: "Everyone, use <i>this</i> colour!"</div>
<p>Examples: time, the tint colour of a material, the sun direction, the camera position.</p>
<p>Here <code>uTint</code> is a uniform. The sliders play the role of the CPU.</p>`,
          controls: [
            { name: 'r', label: 'uTint.r', min: 0, max: 1, step: 0.01, value: 1 },
            { name: 'g', label: 'uTint.g', min: 0, max: 1, step: 0.01, value: 0.4 },
            { name: 'b', label: 'uTint.b', min: 0, max: 1, step: 0.01, value: 0.2 },
          ],
          shader: (v) => ({ frag: 'col = uTint * uv.y;', uniforms: { uTint: [v.r, v.g, v.b] } }),
          code: (v) => `uniform vec3 uTint; // = (${f(v.r, 2)}, ${f(v.g, 2)}, ${f(v.b, 2)}) for ALL pixels\n\ncol = uTint * uv.y; // uv.y differs per pixel`,
        },
        {
          title: 'Varying: different for each pixel',
          body: `<p>A <b>varying</b> is a value that is <b>different for each pixel</b>. <code>uv</code> is the classic example.</p>
<p>Where does it come from? The <b>vertices</b> of the shape carry values (like uv at each corner), and the GPU <b>smoothly blends</b> them across the surface for each pixel. (We'll dig into that blending in the Pipeline topic.)</p>
<div class="analogy">🎟️ Like each cook's personal order ticket — everyone's is different.</div>`,
          shader: { frag: 'col = vec3(uv, 0.0);' },
          code: 'varying vec2 vUv; // blended from the corners\n// corners: (0,0) black, (1,0) red, (0,1) green, (1,1) yellow\ncol = vec3(uv, 0.0);',
        },
        {
          title: 'Texture: a picture to look things up in',
          body: `<p>A <b>texture</b> is an image the shader can <b>read at any position</b>. You give it coordinates, it gives back a colour.</p>
<p>Unity calls this "Sample Texture 2D", Unreal calls it "Texture Sample". In GLSL it's <code>texture2D(tex, coords)</code>.</p>`,
          controls: [{ name: 's', label: 'zoom (uv × s)', min: 0.5, max: 4, step: 0.1, value: 1 }],
          shader: (v) => ({ frag: 'col = texture2D(uTex, uv * uS).rgb;', textures: { uTex: 'letterF' }, uniforms: { uS: v.s } }),
          code: (v) => `col = texture2D(uTex, uv * ${f(v.s, 1)}).rgb;`,
          quiz: { q: 'The light direction of the sun, the same for the whole object, is best passed as a…', options: ['Uniform', 'Varying', 'Texture'], answer: 0, explain: 'Same value for every pixel of the draw → uniform.' },
        },
      ],
      games: [
        {
          id: 'uniform-or-varying', title: 'Uniform or varying?', engine: 'buckets', rounds: 2,
          blurb: 'Is this value the same for every pixel, or different per pixel?',
          gen: () => ({
            prompt: 'Same for every pixel (uniform) or different per pixel (varying)?',
            buckets: ['📢 Uniform', '🎟️ Varying'],
            count: 10,
            items: [
              { text: 'Time in seconds', bucket: 0 },
              { text: 'The pixel\'s uv coordinate', bucket: 1 },
              { text: 'The sun\'s direction', bucket: 0 },
              { text: 'The surface normal at this pixel', bucket: 1, why: 'Normals are stored on vertices and blended across the triangle.' },
              { text: 'The material\'s tint colour', bucket: 0 },
              { text: 'The world position of this pixel', bucket: 1 },
              { text: 'The camera position', bucket: 0 },
              { text: 'The screen resolution', bucket: 0 },
              { text: 'Vertex colour painted on the mesh', bucket: 1, why: 'Painted per vertex, blended per pixel.' },
              { text: 'The "dissolve amount" slider of an effect', bucket: 0 },
              { text: 'Fog density setting', bucket: 0 },
              { text: 'Depth (distance to camera) of this pixel', bucket: 1 },
            ],
          }),
        },
        {
          id: 'tint-match', title: 'Tint matcher', engine: 'slider', rounds: 4,
          blurb: 'You are the CPU: set the uniform colour so the shader output matches the target.',
          gen: (rng, level) => {
            const pick = () => rng.step(0, 1, level === 1 ? 0.5 : 0.25);
            const t = [pick(), pick(), pick()];
            if (t[0] + t[1] + t[2] === 0) t[rng.int(0, 2)] = 1;
            const frag = level === 1 ? 'col = uC;' : level === 2 ? 'col = uC * uv.x;' : 'col = mix(vec3(1.0), uC, uv.y);';
            const codeLine = level === 1 ? 'col = uC;' : level === 2 ? 'col = uC * uv.x; // fades in from the left' : 'col = mix(vec3(1.0), uC, uv.y); // white → uC, bottom → top';
            return {
              prompt: 'Set the uniform <code>uC</code> to match the target.',
              sub: level === 1 ? 'Each channel is 0, 0.5 or 1.' : 'Each channel is a multiple of 0.25. Look at the brightest area.',
              params: [
                { name: 'r', label: 'uC.r (red)', min: 0, max: 1, step: 0.05, target: t[0] },
                { name: 'g', label: 'uC.g (green)', min: 0, max: 1, step: 0.05, target: t[1] },
                { name: 'b', label: 'uC.b (blue)', min: 0, max: 1, step: 0.05, target: t[2] },
              ],
              build: (p) => ({ frag, uniforms: { uC: [p.r, p.g, p.b] } }),
              code: (p) => `uniform vec3 uC; // (${f(p.r, 2)}, ${f(p.g, 2)}, ${f(p.b, 2)})\n${codeLine}`,
              tolerance: 0.06,
              explain: '<p>Mixing light: red + green = yellow, red + blue = magenta, green + blue = cyan, all three = white.</p>',
            };
          },
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: 'found.anatomy',
      title: 'Anatomy of a shader',
      blurb: 'The lines every fragment shader has, and what this app hides for you.',
      lesson: [
        {
          title: 'A complete fragment shader',
          body: `<p>Here's a full, real GLSL fragment shader. Don't panic — it's mostly boilerplate.</p>
<pre class="code">precision highp float;     // 1. how precise floats are
uniform float uTime;       // 2. inputs shared by all pixels
varying vec2 vUv;          // 3. per-pixel input from the vertex shader

void main() {              // 4. runs once per pixel
  vec3 col = vec3(vUv.x);  // 5. your actual logic
  gl_FragColor = vec4(col, 1.0); // 6. output RGBA
}</pre>
<ol><li><b>precision</b>: required header in WebGL.</li><li><b>uniforms</b>: values from the CPU.</li><li><b>varyings</b>: values from the vertex shader.</li><li><b>main()</b>: the entry point.</li><li>Your <b>logic</b>.</li><li><b>gl_FragColor</b>: the output — red, green, blue, alpha.</li></ol>`,
        },
        {
          title: 'What you write in this app',
          body: `<p>To keep things focused, this app writes the boilerplate for you. You only write the <b>body</b> (part 5):</p>
<pre class="code">// already available to you:
vec2 uv;      // 0..1 position
vec3 col;     // output colour (starts black)
float alpha;  // output alpha (starts 1.0)
float uTime;  // seconds
// after your code the app does:
// gl_FragColor = vec4(col, alpha);</pre>
<div class="tip">Unity HLSL looks very similar: <code>float4 frag(v2f i) : SV_Target { return float4(col, 1); }</code>. Unreal's material graph hides even more — the "Base Color" pin is basically <code>col</code>.</div>`,
        },
        {
          title: 'Strict about types',
          body: `<p>GLSL is <b>picky</b>:</p>
<ul>
<li>Every statement ends with <code>;</code></li>
<li>Floats need a dot: write <code>1.0</code>, not <code>1</code> (in WebGL 1, <code>float x = 1;</code> is an error!)</li>
<li>Sizes must match: <code>gl_FragColor</code> is a <code>vec4</code>, so you can't assign a <code>vec3</code> to it directly.</li>
</ul>
<p>Most "my shader is black / pink" moments are one of these.</p>`,
          quiz: { q: 'Which line is valid GLSL (WebGL 1)?', options: ['float a = 0.5;', 'float a = 1;', 'vec4 c = vec3(1.0);'], answer: 0, explain: '<code>1</code> is an int, and vec3 can\'t become a vec4 without adding the 4th component.' },
        },
      ],
      games: [
        {
          id: 'assemble', title: 'Assemble the shader', engine: 'order', rounds: 3,
          blurb: 'Put the lines of a fragment shader in the right order.',
          questions: [
            {
              prompt: 'Order these lines into a working fragment shader:',
              items: [{ code: 'precision highp float;' }, { code: 'uniform float uTime;' }, { code: 'varying vec2 vUv;' }, { code: 'void main() {' }, { code: '  vec3 col = vec3(vUv.x);' }, { code: '  gl_FragColor = vec4(col, 1.0);' }, { code: '}' }],
              explain: 'Header (precision) → declarations (uniforms, varyings) → main() → logic → output.',
            },
            {
              prompt: 'Order the body so it compiles and makes a red gradient:',
              items: [{ code: 'float r = uv.x;' }, { code: 'vec3 c = vec3(r, 0.0, 0.0);' }, { code: 'gl_FragColor = vec4(c, 1.0);' }],
              explain: 'A variable must be declared before it\'s used, and the output is written last.',
            },
            {
              prompt: 'Put these in order (top of file → bottom):',
              items: [{ code: 'precision mediump float;' }, { code: 'uniform vec3 uTint;' }, { code: 'varying vec2 vUv;' }, { code: 'void main() {' }, { code: '  vec3 col = uTint * vUv.y;' }, { code: '  gl_FragColor = vec4(col, 1.0);' }, { code: '}' }],
              explain: 'Same structure every time: precision, inputs, main, logic, output.',
            },
            {
              prompt: 'Order the steps of what happens each frame:',
              items: ['CPU sets uniforms (like uTime)', 'CPU issues a draw call', 'GPU runs the vertex shader per vertex', 'GPU fills triangles with pixels', 'GPU runs the fragment shader per pixel', 'Colour lands on screen'],
              explain: 'The CPU prepares and says "draw", the GPU does vertices → pixels → colours.',
            },
          ],
        },
        {
          id: 'spot-bug', title: 'Spot the bug', engine: 'mcq', rounds: 6,
          blurb: 'Which line would make the shader fail to compile?',
          questions: [
            q('Which line has an error?', [{ code: 'float b = 1;' }, { code: 'float a = 0.5;' }, { code: 'vec3 c = vec3(a);' }, { code: 'col = c * b;' }], '<code>1</code> is an <b>int</b>. In WebGL 1 GLSL, ints don\'t auto-convert to float. Write <code>1.0</code>.'),
            q('Which line has an error?', [{ code: 'gl_FragColor = vec3(1.0);' }, { code: 'vec3 c = vec3(1.0);' }, { code: 'float x = uv.x;' }, { code: 'col = vec3(x);' }], '<code>gl_FragColor</code> is a <b>vec4</b> (RGBA). Use <code>vec4(1.0)</code> or <code>vec4(c, 1.0)</code>.'),
            q('Which line has an error?', [{ code: 'col = vec3(uv.x)' }, { code: 'float k = 2.0;' }, { code: 'vec2 p = uv * k;' }, { code: 'col.r = p.x;' }], 'Missing semicolon at the end.'),
            q('Which line has an error?', [{ code: 'col = vec3(brightness);' }, { code: 'float bright = uv.x;' }, { code: 'col = vec3(bright);' }, { code: 'col *= 0.5;' }], '<code>brightness</code> was never declared (the variable is called <code>bright</code>).'),
            q('Which line has an error?', [{ code: 'vec2 p = vec3(uv, 1.0);' }, { code: 'vec3 p3 = vec3(uv, 1.0);' }, { code: 'vec2 q = uv;' }, { code: 'col = p3;' }], 'A vec3 can\'t be stored in a vec2.'),
            q('Which line has an error?', [{ code: 'float d = length(uv - 0.5) * 2;' }, { code: 'float d = length(uv - 0.5) * 2.0;' }, { code: 'float e = d * d;' }, { code: 'col = vec3(1.0 - e);' }], '<code>* 2</code> multiplies a float by an int → error in GLSL ES 1.0. Use <code>2.0</code>.', { level: 2 }),
            q('This shader compiles but the screen is black. Why?', [{ code: 'vec3 col2 = vec3(1.0, 0.5, 0.0);\n// col is never set' }, { code: 'col = vec3(1.0, 0.5, 0.0);' }, { code: 'col = vec3(uv.x);' }], 'The colour was put in a new variable <code>col2</code>, but the output <code>col</code> stayed black.', { level: 2 }),
          ],
        },
        {
          id: 'finish-output', title: 'Finish the output', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the final line that writes the pixel colour.',
          gen: (rng) => {
            const variants = [
              { template: 'vec3 c = vec3(uv.x, 0.2, 0.6);\ngl_FragColor = [[0]](c, [[1]]);', slots: [{ options: ['vec4', 'vec3', 'vec2', 'float'], answer: 'vec4' }, { options: ['1.0', 'c', 'uv', '1'], answer: '1.0' }] },
              { template: 'float g = uv.y;\ngl_FragColor = vec4([[0]], 1.0);', slots: [{ options: ['vec3(g)', 'g', 'vec2(g)', 'vec4(g)'], answer: 'vec3(g)' }] },
              { template: 'vec2 p = uv;\ngl_FragColor = vec4(p, [[0]], [[1]]);', slots: [{ options: ['0.0', 'p', 'uv', '0'], answer: '0.0' }, { options: ['1.0', '1', 'p.x', 'vec2(1.0)'], answer: '1.0' }] },
              { template: 'float r = uv.x;\nfloat b = [[0]];\ngl_FragColor = vec4(r, 0.0, b, [[1]]);', slots: [{ options: ['1.0 - r', '1 - r', 'vec2(r)', 'uv'], answer: '1.0 - r' }, { options: ['1.0', 'r, b', 'vec2(1.0)', '1'], answer: '1.0' }] },
            ];
            const vr = rng.pick(variants);
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Complete the output line so it compiles and matches the target:',
              sub: 'Wrong types show a compile error in "Yours" — read it, it\'s useful!',
              template: vr.template,
              slots: vr.slots,
              build: (vals) => ({ frag: 'void main(){\n  vec2 uv = vUv;\n' + fill(vals) + '\n}' }),
              explain: '<p>gl_FragColor needs exactly 4 floats: red, green, blue, alpha. <code>vec4(c, 1.0)</code> = 3 from c + 1 alpha.</p>',
            };
          },
        },
      ],
    },
  ],
};
