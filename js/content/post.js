// Topic — Post-processing: full-screen passes that treat the frame as a texture.
import { tf, q, distinct, f, h, shaderView } from './_kit.js';

const r2 = (x) => Math.round(x * 100) / 100;
const n3 = (x) => +(+x).toFixed(3) + '';
const fade = (t) => t * t * (3 - 2 * t);
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** codefill: preview starts with a WRONG token so the answer isn't given away */
const noPeek = (slots) => slots.map((sl) => ({ ...sl, placeholder: sl.options.find((o) => o !== sl.answer) }));

// "The frame" = the photo texture.
const FRAME = { uScene: 'photo' };
const SCENE = 'vec3 scene(vec2 p){ return texture2D(uScene, p).rgb; }';
const post = (frag, uniforms = {}, extra = {}) => ({ defs: SCENE + (extra.defs || ''), frag, uniforms, textures: { ...FRAME, ...(extra.textures || {}) } });

// 3x3 kernel written as rows top→bottom (like on paper) → mat3 uniform (column-major, [x][y] with y up)
const kmat = (rows) => { const m = []; for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) m.push(rows[2 - y][x]); return m; };
const KERNEL_DEFS = `
vec3 conv(vec2 p, mat3 k, float d){
  vec3 s = vec3(0.0);
  for (int x = 0; x < 3; x++) for (int y = 0; y < 3; y++){
    vec2 o = vec2(float(x) - 1.0, float(y) - 1.0) * d;
    s += k[x][y] * texture2D(uScene, p + o).rgb;
  }
  return s;
}`;
const fmtK = (rows, scale) => {
  const w = Math.max(...rows.flat().map((x) => String(x).length));
  const lines = rows.map((r) => '[ ' + r.map((x) => String(x).padStart(w)).join('  ') + ' ]');
  return lines.join('\n') + (scale ? `   × ${scale}` : '');
};
const KERNELS = {
  identity: { name: 'Identity (no change)', rows: [[0, 0, 0], [0, 1, 0], [0, 0, 0]] },
  box: { name: 'Box blur', rows: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], scale: '1/9', k: 1 / 9 },
  gauss: { name: 'Gaussian-style blur', rows: [[1, 2, 1], [2, 4, 2], [1, 2, 1]], scale: '1/16', k: 1 / 16 },
  sharpen: { name: 'Sharpen', rows: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] },
  laplace: { name: 'Edge detect (all directions)', rows: [[0, 1, 0], [1, -4, 1], [0, 1, 0]] },
  sobelx: { name: 'Edge detect (vertical edges, Sobel X)', rows: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]] },
  sobely: { name: 'Edge detect (horizontal edges, Sobel Y)', rows: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]] },
  bright: { name: 'Brighten ×2', rows: [[0, 0, 0], [0, 2, 0], [0, 0, 0]] },
  shift: { name: 'Shift (copy the left neighbour)', rows: [[0, 0, 0], [1, 0, 0], [0, 0, 0]] },
};
const kspec = (key, d = 0.006) => {
  const K = KERNELS[key];
  const rows = K.rows.map((r) => r.map((x) => x * (K.k || 1)));
  const edge = /laplace|sobel/.test(key);
  return post(edge ? 'col = abs(conv(uv, uK, uD)) * 2.0;' : 'col = conv(uv, uK, uD);', { uK: kmat(rows), uD: d }, { defs: KERNEL_DEFS });
};

// Colour adjustments shared by several games
const GRADE = `
vec3 grade(vec3 c, float b, float k, float s, vec3 t){
  c *= b;                                  // brightness (exposure-style)
  c = (c - 0.5) * k + 0.5;                 // contrast around mid-grey
  c = mix(vec3(luma(c)), c, s);            // saturation
  c *= t;                                  // tint
  return clamp(c, 0.0, 1.0);
}`;
const gradeSpec = (b, k, s, t = [1, 1, 1]) => post('col = grade(scene(uv), uB, uK, uS, uT);', { uB: b, uK: k, uS: s, uT: t }, { defs: GRADE });

// Bright-pass + 5x5 blur (25 samples) for bloom demos
const BLOOM = `
vec3 bright(vec2 p, float t){ return max(scene(p) - t, 0.0); }
vec3 bloomBlur(vec2 p, float t, float r){
  vec3 s = vec3(0.0);
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++){
    s += bright(p + vec2(float(x), float(y)) * r, t);
  }
  return s / 25.0;
}`;

export default {
  id: 'post',
  title: 'Post-processing',
  icon: '🎬',
  blurb: 'Full-screen passes: colour grading, vignette, blur, edges, chromatic aberration and bloom.',
  cheatsheet: `
<p>A post pass draws one quad over the screen; the fragment shader runs <b>once per screen pixel</b> and reads the rendered frame as a texture.</p>
<pre class="code">vec3 c = texture2D(uScene, uv).rgb;          // this pixel of the frame
c *= exposure;                                // brightness
c = (c - 0.5) * contrast + 0.5;               // contrast around mid-grey
c = mix(vec3(luma(c)), c, saturation);        // 0 = grey, 1 = original
c *= 1.0 - smoothstep(r - soft, r, length(uv - 0.5)); // vignette</pre>
<ul>
<li><b>Blur</b>: weighted average of neighbours. Weights (the <b>kernel</b>) must <b>sum to 1</b> to keep brightness. N×N kernel = N² samples; separable blur = 2N.</li>
<li><b>Edges</b>: difference between neighbours. Edge kernels sum to <b>0</b> (flat areas → 0). Sobel = [-1 0 1; -2 0 2; -1 0 1].</li>
<li><b>Chromatic aberration</b>: sample R, G, B at slightly different uv.</li>
<li><b>Bloom</b>: bright pass → blur → add back on top.</li>
</ul>`,
  concepts: [
    // ================================================================== FULL-SCREEN PASSES
    {
      id: 'post.fullscreen',
      title: 'Full-screen passes',
      blurb: 'The finished frame becomes a texture; a shader re-paints every screen pixel.',
      lesson: [
        {
          title: 'The frame is a texture',
          body: `<p>Normally shaders colour the pixels of <b>objects</b>. Post-processing happens <b>after</b> the whole scene is drawn:</p>
<ol><li>The game renders the scene into a <b>texture</b> (a "render target") instead of the screen.</li>
<li>It draws <b>one rectangle covering the whole screen</b>.</li>
<li>That rectangle's fragment shader reads the scene texture at its uv and outputs a new colour.</li></ol>
<p>Here the photo plays the role of "the rendered frame".</p>
<div class="analogy">📸 <b>Analogy:</b> an Instagram filter. The photo is already taken; the filter just repaints each pixel based on the photo.</div>`,
          shader: post('col = scene(uv);'),
          code: 'uniform sampler2D uScene;      // the rendered frame\nvoid main() {\n  vec3 c = texture2D(uScene, vUv).rgb;\n  gl_FragColor = vec4(c, 1.0);  // unchanged = "identity pass"\n}',
        },
        {
          title: 'Your first effect',
          body: `<p>Everything a post shader does is: read <code>c</code>, change it, output it. Mix between the original and its <b>negative</b> (<code>1.0 - c</code>):</p>`,
          controls: [{ name: 'k', label: 'invert amount', min: 0, max: 1, step: 0.01, value: 0.5 }],
          shader: (v) => post('vec3 c = scene(uv);\ncol = mix(c, 1.0 - c, uK);', { uK: v.k }),
          code: (v) => `vec3 c = texture2D(uScene, uv).rgb;\ncol = mix(c, 1.0 - c, ${f(v.k, 2)});`,
          after: '<div class="note">At 0.5 every channel becomes exactly 0.5 — a flat grey. Can you see why? mix(c, 1−c, 0.5) = (c + 1 − c) / 2.</div>',
        },
        {
          title: 'Read anywhere in the frame',
          body: `<p>Unlike shading an object, a post shader can read <b>any</b> position of the frame — that's what makes blurs, distortions and mirrors possible.</p>
<p>Here the right half reads the <b>left</b> half, mirrored.</p>`,
          controls: [{ name: 'm', label: 'mirror line', min: 0.2, max: 0.8, step: 0.01, value: 0.5 }],
          shader: (v) => post('vec2 p = uv;\nif (p.x > uM) p.x = 2.0 * uM - p.x;\ncol = scene(p);', { uM: v.m }),
          code: (v) => `vec2 p = uv;\nif (p.x > ${f(v.m, 2)}) p.x = ${f(2 * v.m, 2)} - p.x; // reflect\ncol = texture2D(uScene, p).rgb;`,
        },
        {
          title: 'It runs for EVERY screen pixel',
          body: `<p>A post shader runs once per <b>screen pixel</b>, every frame — no matter what's in the scene. Each texture read inside it is multiplied by millions.</p>
<p>That's why games render heavy effects at <b>half or quarter resolution</b>.</p>`,
          controls: [
            { name: 's', label: 'texture reads per pixel', min: 1, max: 25, step: 1, value: 9 },
            { name: 'r', label: 'resolution scale', min: 0.25, max: 1, step: 0.25, value: 1 },
          ],
          code: (v) => { const px = 2532 * 1170 * v.r * v.r; return `// iPhone 12: 2532 × 1170 = 2.96 M pixels\npixels  = 2.96 M × ${v.r} × ${v.r} = ${(px / 1e6).toFixed(2)} M\nreads   = ${(px / 1e6).toFixed(2)} M × ${v.s} = ${(px * v.s / 1e6).toFixed(1)} M per frame\n× 60 fps = ${(px * v.s * 60 / 1e9).toFixed(2)} BILLION reads per second`; },
          after: '<div class="tip">💡 Half resolution = ¼ of the pixels (both width and height halve). Bloom and depth of field are usually computed at half or quarter res, then upscaled.</div>',
        },
        {
          title: 'Chains of passes',
          body: `<p>Real post stacks run <b>several passes</b>. Each pass's output texture is the next pass's input:</p>
<pre class="code">scene → bloom → depth of field → colour grading → tonemapping → vignette → UI on top</pre>
<p>Passes that need neighbours (blur) are separate passes; cheap per-pixel tweaks (contrast, tint, vignette) are often merged into one "uber" shader to save reads.</p>
<div class="tip">💡 Unity URP/HDRP: <b>Volume</b> with post-processing overrides. Unreal: <b>Post Process Volume</b>, plus custom <b>Post Process Materials</b> where <code>SceneTexture:PostProcessInput0</code> is exactly our <code>uScene</code>.</div>`,
          quiz: { q: 'A post shader with 9 texture reads, at full 1920×1080. Roughly how many reads per frame?', options: ['~18.7 million', '~2 million', '~9 thousand'], answer: 0, explain: '1920 × 1080 ≈ 2.07 M pixels × 9 ≈ 18.7 M reads — every frame.' },
        },
      ],
      games: [
        {
          id: 'post-code-image', title: 'Code → frame', engine: 'mcq', rounds: 8,
          blurb: 'Read a one-line post effect and pick the resulting frame.',
          gen: (rng, level) => {
            const pool = [
              { c: 'col = 1.0 - c;', lvl: 1 },
              { c: 'col = vec3(luma(c));', lvl: 1 },
              { c: 'col = c.bgr;', lvl: 1 },
              { c: 'col = c;', lvl: 1 },
              { c: 'col = c * c;', lvl: 2 },
              { c: 'col = vec3(c.r);', lvl: 2 },
              { c: 'col = vec3(step(0.5, luma(c)));', lvl: 2 },
              { c: 'col = texture2D(uScene, vec2(uv.x, 1.0 - uv.y)).rgb;', lvl: 2 },
              { c: 'col = floor(c * 3.0) / 3.0;', lvl: 3 },
              { c: 'col = sqrt(c);', lvl: 3 },
              { c: 'col = c.grb;', lvl: 3 },
              { c: 'col = vec3(c.b);', lvl: 3 },
            ].filter((x) => x.lvl <= level);
            const ans = rng.pick(pool.filter((x) => x.lvl >= Math.min(level, 2) - 1));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.c);
            return {
              prompt: 'Which frame does this post shader output?',
              code: `vec3 c = texture2D(uScene, uv).rgb;\n${ans.c}`,
              options: opts.map((o) => ({ shader: post(`vec3 c = scene(uv);\n${o.c}`) })),
              explain: '<p>Think per channel: <code>1.0 - c</code> = negative, <code>luma</code> = greyscale, <code>.bgr</code> swaps red and blue (orange sky → blue), <code>c * c</code> darkens mid-tones, <code>sqrt</code> brightens them, <code>floor(c * 3.0) / 3.0</code> posterizes into bands.</p>',
            };
          },
        },
        {
          id: 'post-cost', title: 'Count the cost', engine: 'numeric', rounds: 6,
          blurb: 'How many pixels and texture reads does a post pass cost?',
          gen: (rng, level) => {
            const res = rng.pick([[1920, 1080], [1280, 720], [2560, 1440]]);
            const px = res[0] * res[1];
            const kind = level === 1 ? 'px' : level === 2 ? rng.pick(['reads', 'half']) : rng.pick(['half', 'quarter', 'sep']);
            if (kind === 'px') return { prompt: `A post pass at <b>${res[0]}×${res[1]}</b>. How many times does the fragment shader run per frame, in <b>millions</b>?`, sub: 'Two decimals is fine.', answer: +(px / 1e6).toFixed(2), tolerance: 0.02, explain: `<p>${res[0]} × ${res[1]} = ${px.toLocaleString('en')} ≈ <b>${(px / 1e6).toFixed(2)} M</b> runs — one per screen pixel, every frame.</p>` };
            if (kind === 'reads') { const s = rng.pick([4, 9, 13]); return { prompt: `${res[0]}×${res[1]}, <b>${s}</b> texture reads per pixel. Reads per frame, in millions?`, answer: +(px * s / 1e6).toFixed(2), tolerance: 0.05, explain: `<p>${(px / 1e6).toFixed(3)} M × ${s} = <b>${(px * s / 1e6).toFixed(2)} M</b>.</p>` }; }
            if (kind === 'half') return { prompt: `You render the effect at <b>half resolution</b> (${res[0] / 2}×${res[1] / 2}) instead of ${res[0]}×${res[1]}. What fraction of the pixels is left?`, sub: 'Answer as a decimal.', answer: 0.25, explain: '<p>Both width and height halve → ½ × ½ = <b>0.25</b> of the pixels. That\'s why half-res effects are ~4× cheaper.</p>' };
            if (kind === 'quarter') return { prompt: `An effect costs 8 ms at full resolution. Roughly how many ms at <b>quarter resolution</b> (¼ width, ¼ height)?`, answer: 0.5, explain: '<p>¼ × ¼ = 1/16 of the pixels → 8 / 16 = <b>0.5 ms</b> (ignoring fixed overheads).</p>' };
            const N = rng.pick([5, 7, 9]);
            return { prompt: `A <b>${N}×${N}</b> blur kernel. How many texture reads per pixel if done in one 2D pass?`, answer: N * N, explain: `<p>${N} × ${N} = <b>${N * N}</b>. A separable blur (horizontal pass + vertical pass) needs only ${N} + ${N} = ${2 * N}.</p>` };
          },
        },
        {
          id: 'post-facts', title: 'Post: true or false?', engine: 'mcq', rounds: 8,
          blurb: 'Quick checks on how full-screen passes work.',
          questions: [
            tf('A post-processing shader runs once per screen pixel.', true, 'One full-screen quad → one fragment per pixel.'),
            tf('A post shader can read the colour of any pixel of the frame.', true, 'The frame is a texture, readable anywhere — that\'s how blurs work.'),
            tf('Post effects cost more when there are more objects in the scene.', false, 'Their cost depends on screen resolution and samples per pixel, not scene complexity.'),
            tf('A pass can read the texture it is currently writing to.', false, 'Not safely. Use two textures and alternate (ping-pong).', 2),
            tf('Rendering bloom at half resolution makes it about 4× cheaper.', true, '½ width × ½ height = ¼ of the pixels.', 2),
            tf('Colour grading usually needs to read neighbouring pixels.', false, 'It\'s per pixel: read one colour, change it.'),
            q('What is the input of a post-processing pass?', ['The rendered frame, as a texture', 'The meshes of the scene', 'The vertex positions', 'The CPU memory'], 'Render target → texture → post shader.'),
            q('In Unreal, the scene colour in a post process material comes from…', ['SceneTexture: PostProcessInput0', 'Vertex Color', 'Texture Coordinate only', 'World Position'], 'PostProcessInput0 = the frame so far.', { level: 2 }),
            q('Why merge contrast, tint and vignette into one shader?', ['Fewer passes = fewer full-screen reads and writes', 'GLSL requires it', 'To get more colours', 'They don\'t work separately'], 'Every pass reads and writes the whole screen; merging saves bandwidth.', { level: 2 }),
            q('Which needs a separate pass (can\'t be done per pixel from one read)?', ['Blur', 'Brightness', 'Tint', 'Invert'], 'Blur needs many neighbouring reads — often split into its own passes.'),
          ],
        },
      ],
    },
    // ================================================================== COLOUR ADJUSTMENTS
    {
      id: 'post.color',
      title: 'Colour adjustments',
      blurb: 'Brightness, contrast, saturation and tint — the maths of a colour grade.',
      lesson: [
        {
          title: 'Brightness: multiply or add',
          body: `<p><b>Multiply</b> (<code>c * b</code>, like camera exposure): dark stays dark, bright gets brighter. Black stays black.</p>
<p><b>Add</b> (<code>c + a</code>): lifts everything equally — black becomes grey, looks washed out.</p>
<p>The graph shows input brightness → output brightness.</p>`,
          controls: [
            { name: 'b', label: 'multiply b', min: 0, max: 2, step: 0.05, value: 1.3 },
            { name: 'a', label: 'add a', min: -0.5, max: 0.5, step: 0.05, value: 0 },
          ],
          shader: (v) => post('col = clamp(scene(uv) * uB + uA, 0.0, 1.0);', { uB: v.b, uA: v.a }),
          graph: { fns: (v) => [{ f: (x) => Math.min(1, Math.max(0, x * v.b + v.a)), label: 'out = in × b + a' }, { f: (x) => x, color: '#555', dash: [4, 4] }], opts: { xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05 } },
          code: (v) => `col = clamp(c * ${f(v.b, 2)} + ${f(v.a, 2)}, 0.0, 1.0);`,
        },
        {
          title: 'Contrast: stretch around 0.5',
          body: `<p>Contrast = how far apart darks and brights are. Move every value <b>away from</b> (or towards) mid-grey:</p>
<pre class="code">c = (c - 0.5) * k + 0.5;</pre>
<p>Why 0.5? Subtract it → mid-grey becomes 0, darks negative, brights positive. Multiply → they spread apart (k&gt;1) or squeeze together (k&lt;1). Add 0.5 back. Mid-grey itself never moves — it's the <b>pivot</b>.</p>`,
          controls: [{ name: 'k', label: 'contrast k', min: 0, max: 3, step: 0.05, value: 1.6 }],
          shader: (v) => post('col = clamp((scene(uv) - 0.5) * uK + 0.5, 0.0, 1.0);', { uK: v.k }),
          graph: { fns: (v) => [{ f: (x) => Math.min(1, Math.max(0, (x - 0.5) * v.k + 0.5)), label: `(in − 0.5) × ${v.k} + 0.5` }, { f: (x) => x, color: '#555', dash: [4, 4] }], opts: (v) => ({ xmin: 0, xmax: 1, ymin: -0.05, ymax: 1.05, points: [{ x: 0.5, y: 0.5, color: '#fff', label: 'pivot' }] }) },
          code: (v) => `col = (c - 0.5) * ${f(v.k, 2)} + 0.5;\n// 0.2 → ${n3((0.2 - 0.5) * v.k + 0.5)},  0.5 → 0.5,  0.8 → ${n3((0.8 - 0.5) * v.k + 0.5)}`,
          quiz: { q: 'Contrast k = 0. What does the image become?', options: ['Flat mid-grey', 'Black', 'Unchanged'], answer: 0, explain: '(c − 0.5) × 0 + 0.5 = 0.5 for every channel.' },
        },
        {
          title: 'Saturation: mix with grey',
          body: `<p>Saturation = how colourful. First find the pixel's grey version, its <b>luma</b> (perceived brightness — green counts most, blue least):</p>
<pre class="code">float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); // = luma(c)</pre>
<p>Then <code>mix(vec3(l), c, s)</code>: s = 0 → grey, s = 1 → original, s &gt; 1 → <b>extra</b> colourful (it extrapolates away from grey).</p>`,
          controls: [{ name: 's', label: 'saturation s', min: 0, max: 2.5, step: 0.05, value: 0.3 }],
          shader: (v) => post('vec3 c = scene(uv);\ncol = clamp(mix(vec3(luma(c)), c, uS), 0.0, 1.0);', { uS: v.s }),
          code: (v) => `float l = luma(c);\ncol = mix(vec3(l), c, ${f(v.s, 2)});`,
          after: '<div class="note">Why not just average (r+g+b)/3? Our eyes are much more sensitive to green. Pure blue at full strength looks darker than pure green — luma weights reflect that.</div>',
        },
        {
          title: 'Tint and colour filters',
          body: `<p>Multiply by a colour to <b>filter</b> the image, like coloured glass: <code>c * vec3(1.0, 0.9, 0.7)</code> keeps red, cuts some green and more blue → warm.</p>
<p>Multiplying can only darken channels (values ≤ 1). For a stronger "colour wash", mix towards a colour instead.</p>`,
          controls: [
            { name: 'r', label: 'tint.r', min: 0, max: 1, step: 0.05, value: 1 },
            { name: 'g', label: 'tint.g', min: 0, max: 1, step: 0.05, value: 0.85 },
            { name: 'b', label: 'tint.b', min: 0, max: 1, step: 0.05, value: 0.6 },
          ],
          shader: (v) => post('col = scene(uv) * uT;', { uT: [v.r, v.g, v.b] }),
          code: (v) => `col = c * vec3(${f(v.r, 2)}, ${f(v.g, 2)}, ${f(v.b, 2)});`,
        },
        {
          title: 'A full grade',
          body: `<p>Stack them: exposure → contrast → saturation → tint, then <code>clamp</code> into 0..1. Order matters a bit (contrast after a tint pivots differently), but this is a typical chain.</p>`,
          controls: [
            { name: 'b', label: 'brightness', min: 0.5, max: 1.5, step: 0.05, value: 1 },
            { name: 'k', label: 'contrast', min: 0.5, max: 2, step: 0.05, value: 1.2 },
            { name: 's', label: 'saturation', min: 0, max: 2, step: 0.05, value: 1.3 },
          ],
          shader: (v) => gradeSpec(v.b, v.k, v.s, [1, 0.95, 0.9]),
          code: (v) => `c *= ${f(v.b, 2)};                  // brightness\nc = (c - 0.5) * ${f(v.k, 2)} + 0.5;   // contrast\nc = mix(vec3(luma(c)), c, ${f(v.s, 2)}); // saturation\nc *= vec3(1.0, 0.95, 0.9);     // warm tint\ncol = clamp(c, 0.0, 1.0);`,
          after: '<div class="tip">💡 Unity <b>Color Adjustments</b>: Post Exposure, Contrast, Saturation, Color Filter — the same four. Unreal Post Process Volume: <b>Color Grading</b> (Saturation, Contrast, Gain, Offset…). Pros often bake the whole grade into a <b>LUT</b> texture: one lookup replaces all the maths.</div>',
        },
      ],
      games: [
        {
          id: 'match-grade', title: 'Match the grade', engine: 'slider', rounds: 4,
          blurb: 'Dial in brightness, contrast and saturation to match the target.',
          gen: (rng, level) => {
            const b = rng.step(0.6, 1.4, 0.1), k = rng.step(0.5, 2, 0.25), s = rng.step(0, 2, 0.25);
            const P = {
              b: { name: 'b', label: 'brightness', min: 0.5, max: 1.5, step: 0.05, target: b },
              k: { name: 'k', label: 'contrast', min: 0.25, max: 2.25, step: 0.05, target: k },
              s: { name: 's', label: 'saturation', min: 0, max: 2, step: 0.05, target: s },
            };
            const which = level === 1 ? [rng.pick(['b', 'k', 's'])] : level === 2 ? ['k', 's'] : ['b', 'k', 's'];
            return {
              prompt: level === 1 ? `Adjust the <b>${P[which[0]].label}</b> to match the target.` : 'Match the colour grade.',
              sub: 'Saturation: colourfulness. Contrast: how far darks and brights are apart. Brightness: overall level.',
              params: which.map((w) => P[w]),
              build: (p) => gradeSpec(p.b ?? 1, p.k ?? 1, p.s ?? 1),
              code: (p) => `c *= ${f(p.b ?? 1, 2)};\nc = (c - 0.5) * ${f(p.k ?? 1, 2)} + 0.5;\nc = mix(vec3(luma(c)), c, ${f(p.s ?? 1, 2)});`,
              compare: 'pixels',
              explain: '<p>Start with saturation (look at the sky colours), then contrast (how dark the mountains are vs how bright the sun is), then brightness.</p>',
            };
          },
        },
        {
          id: 'grade-math', title: 'Grade by numbers', engine: 'numeric', rounds: 6,
          blurb: 'Compute brightness, contrast and saturation by hand.',
          gen: (rng, level) => {
            const kind = level === 1 ? rng.pick(['bright', 'contrast']) : level === 2 ? rng.pick(['contrast', 'sat', 'add']) : rng.pick(['sat', 'chain', 'clamp']);
            if (kind === 'bright') { const c = rng.pick([0.2, 0.4, 0.5, 0.6]), b = rng.pick([0.5, 1.5, 2]); const a = Math.min(1, c * b); return { prompt: `A channel is <b>${c}</b>. After <code>c * ${f(b)}</code> and clamping to 0..1?`, answer: +a.toFixed(4), explain: `<p>${c} × ${b} = ${n3(c * b)}${c * b > 1 ? ' → clamped to <b>1</b>' : ` = <b>${n3(a)}</b>`}.</p>` }; }
            if (kind === 'add') { const c = rng.pick([0, 0.2, 0.5]), a = rng.pick([0.1, 0.2, 0.3]); return { prompt: `Pure black (0.0) and a channel at ${c}. After <code>c + ${f(a)}</code>, what is black now?`, answer: a, explain: `<p>0 + ${a} = <b>${a}</b>. Adding lifts black to grey — that's why "add" brightness looks washed out, while multiply keeps black at 0.</p>` }; }
            if (kind === 'contrast' || kind === 'clamp') {
              const c = rng.pick(kind === 'clamp' ? [0.1, 0.9, 0.2] : [0.3, 0.4, 0.6, 0.7, 0.8]);
              const k = rng.pick(kind === 'clamp' ? [2, 3] : [0.5, 1.5, 2]);
              const raw = (c - 0.5) * k + 0.5, ans = Math.min(1, Math.max(0, raw));
              return { prompt: `Contrast <b>k = ${k}</b> on a channel value <b>${c}</b>${kind === 'clamp' ? ', then clamped to 0..1' : ''}. Result?`, code: `c = (c - 0.5) * ${f(k)} + 0.5;`, answer: +ans.toFixed(4), explain: `<p>(${c} − 0.5) × ${k} + 0.5 = ${n3(c - 0.5)} × ${k} + 0.5 = ${raw !== ans ? `${n3(raw)} → clamped to <b>${n3(ans)}</b>` : `<b>${n3(ans)}</b>`}. ${k > 1 ? 'k > 1 pushed it away from 0.5 (more contrast).' : 'k < 1 pulled it towards 0.5 (less contrast).'}</p>` };
            }
            if (kind === 'sat') {
              const l = rng.pick([0.4, 0.5]), c = rng.pick([0.8, 0.2, 0.6]), s = rng.pick([0, 0.5, 1.5, 2]);
              const ans = l + (c - l) * s;
              return { prompt: `A pixel's luma is <b>${l}</b>, its red channel is <b>${c}</b>. Saturation <b>s = ${s}</b>. New red?`, code: `col = mix(vec3(luma(c)), c, ${f(s)});`, answer: +ans.toFixed(4), explain: `<p>mix(${l}, ${c}, ${s}) = ${l} + (${c} − ${l}) × ${s} = <b>${n3(ans)}</b>.${s > 1 ? ' s > 1 pushes the channel further away from grey: more colourful.' : s === 0 ? ' s = 0 → exactly the grey value.' : ''}</p>` };
            }
            const c = rng.pick([0.3, 0.6]), b = rng.pick([1.5, 2]), k = rng.pick([0.5, 2]);
            const c1 = c * b, raw = (c1 - 0.5) * k + 0.5;
            return { prompt: `Channel <b>${c}</b>. First brightness <code>× ${f(b)}</code>, then contrast <code>k = ${f(k)}</code>. Result (no clamping)?`, answer: +raw.toFixed(4), explain: `<p>${c} × ${b} = ${n3(c1)}; then (${n3(c1)} − 0.5) × ${k} + 0.5 = <b>${n3(raw)}</b>. (A real grade would clamp to 0..1 at the end.)</p>` };
          },
        },
        {
          id: 'which-adjust', title: 'Spot the adjustment', engine: 'mcq', rounds: 8,
          blurb: 'Compare before/after and name the colour adjustment.',
          gen: (rng, level) => {
            const all = [
              { name: 'More contrast', g: [1, 1.8, 1], lvl: 1 },
              { name: 'Less contrast', g: [1, 0.4, 1], lvl: 1 },
              { name: 'Desaturated', g: [1, 1, 0.15], lvl: 1 },
              { name: 'Brighter', g: [1.45, 1, 1], lvl: 1 },
              { name: 'Darker', g: [0.55, 1, 1], lvl: 1 },
              { name: 'Over-saturated', g: [1, 1, 2], lvl: 2 },
              { name: 'Blue tint', g: [1, 1, 1], t: [0.6, 0.8, 1], lvl: 2 },
              { name: 'Warm tint', g: [1, 1, 1], t: [1, 0.8, 0.55], lvl: 2 },
              { name: 'Slightly less saturated', g: [1, 1, 0.6], lvl: 3 },
              { name: 'Slightly more contrast', g: [1, 1.3, 1], lvl: 3 },
              { name: 'Slightly brighter', g: [1.2, 1, 1], lvl: 3 },
            ];
            const pool = all.filter((x) => x.lvl <= level);
            const ans = rng.pick(pool.filter((x) => x.lvl >= level - 1));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.name);
            return {
              prompt: 'What was done to the frame?',
              shaders: [{ spec: post('col = scene(uv);'), label: 'before' }, { spec: gradeSpec(ans.g[0], ans.g[1], ans.g[2], ans.t || [1, 1, 1]), label: 'after' }],
              options: opts.map((o) => o.name),
              grid: false,
              explain: '<p>Contrast: compare the dark mountains and the bright sun. Saturation: compare how orange the sky is. Brightness: everything moves together. Tint: whites (sun, clouds) take on a colour.</p>',
            };
          },
        },
        {
          id: 'grade-fill', title: 'Write the grade', engine: 'codefill', rounds: 4,
          blurb: 'Fill in the colour-adjustment formulas.',
          gen: (rng, level) => {
            const k = rng.pick(['0.5', '2.0']), s = rng.pick(['0.0', '0.5', '2.0']);
            const V = [
              { template: 'vec3 c = scene(uv);\ncol = (c - [[0]]) * ' + k + ' + [[1]];', slots: [{ options: ['0.5', '1.0', '0.0', '2.0'], answer: '0.5' }, { options: ['0.5', '1.0', '0.0', 'c'], answer: '0.5' }], lvl: 1 },
              { template: 'vec3 c = scene(uv);\ncol = mix(vec3([[0]]), c, ' + s + ');', slots: [{ options: ['luma(c)', 'c.r', '0.5', '1.0'], answer: 'luma(c)' }], lvl: 1 },
              { template: 'vec3 c = scene(uv);\ncol = mix(vec3(luma(c)), c, [[0]]);', slots: [{ options: ['0.0', '0.5', '1.0', '2.0'], answer: s }], lvl: 2 },
              { template: 'vec3 c = scene(uv);\ncol = (c - 0.5) * [[0]] + 0.5;', slots: [{ options: ['0.0', '0.5', '1.0', '2.0'], answer: k }], lvl: 2 },
              { template: 'vec3 c = scene(uv);\nc = (c - 0.5) * [[0]] + 0.5;\ncol = mix(vec3(luma(c)), c, [[1]]);', slots: [{ options: ['0.5', '1.0', '2.0'], answer: k }, { options: ['0.0', '0.5', '1.0', '2.0'], answer: s }], lvl: 3 },
              { template: 'vec3 c = scene(uv);\nc = mix(vec3([[0]]), c, ' + s + ');\ncol = (c - [[1]]) * ' + k + ' + 0.5;', slots: [{ options: ['luma(c)', 'c.g', '0.0'], answer: 'luma(c)' }, { options: ['0.5', '0.0', '1.0'], answer: '0.5' }], lvl: 3 },
            ];
            const vr = rng.pick(V.filter((x) => x.lvl === level));
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Complete the code so it matches the target frame:',
              template: vr.template, slots: noPeek(vr.slots),
              build: (vals) => post(fill(vals)),
              explain: '<p>Contrast pivots around <b>0.5</b>: <code>(c - 0.5) * k + 0.5</code>. Saturation mixes from the grey <b>luma</b> towards the colour: 0 = grey, 1 = original, 2 = boosted.</p>',
            };
          },
        },
      ],
    },
    // ================================================================== VIGNETTE
    {
      id: 'post.vignette',
      title: 'Vignette',
      blurb: 'Darken towards the edges using the distance from the centre.',
      lesson: [
        {
          title: 'Distance from the centre',
          body: `<p>A vignette darkens the corners, like an old lens — it pulls the eye to the middle. The key number is how far each pixel is from the centre:</p>
<pre class="code">float d = length(uv - 0.5);  // 0 in the middle, ~0.71 in the corners</pre>
<p>Here's d shown as brightness. Corners are √(0.5² + 0.5²) ≈ 0.71 away.</p>`,
          controls: [{ name: 'k', label: 'show d × k', min: 1, max: 2, step: 0.05, value: 1.4 }],
          shader: (v) => ({ frag: 'float d = length(uv - 0.5);\ncol = vec3(d * uK);', uniforms: { uK: v.k } }),
          code: (v) => `float d = length(uv - 0.5);\ncol = vec3(d * ${f(v.k, 2)});`,
        },
        {
          title: 'Turn distance into darkening',
          body: `<p>We want a multiplier: <b>1</b> (keep) near the centre, falling to <b>0</b> (black) towards the edges. <code>smoothstep</code> does that with a soft edge:</p>
<pre class="code">float v = 1.0 - smoothstep(r - soft, r, d);
col = c * v;</pre>
<p>r = where it reaches black, soft = how wide the fade is.</p>`,
          controls: [
            { name: 'r', label: 'radius r', min: 0.3, max: 1, step: 0.01, value: 0.75 },
            { name: 's', label: 'softness', min: 0.05, max: 0.6, step: 0.01, value: 0.4 },
          ],
          shader: (v) => post('float d = length(uv - 0.5);\nfloat vig = 1.0 - smoothstep(uR - uS, uR, d);\ncol = scene(uv) * vig;', { uR: v.r, uS: v.s }),
          graph: { fns: (v) => [{ f: (d) => 1 - (d <= v.r - v.s ? 0 : d >= v.r ? 1 : fade((d - (v.r - v.s)) / v.s)), label: 'multiplier v(d)' }], opts: { xmin: 0, xmax: 0.75, ymin: -0.05, ymax: 1.05 } },
          code: (v) => `float vig = 1.0 - smoothstep(${f(v.r - v.s, 2)}, ${f(v.r, 2)}, d);\ncol = c * vig;`,
        },
        {
          title: 'Strength',
          body: `<p>Real vignettes rarely go fully black. Blend the multiplier towards 1 with a <b>strength</b>:</p>
<pre class="code">col = c * mix(1.0, vig, strength);</pre>`,
          controls: [{ name: 'k', label: 'strength', min: 0, max: 1, step: 0.05, value: 0.6 }],
          shader: (v) => post('float d = length(uv - 0.5);\nfloat vig = 1.0 - smoothstep(0.3, 0.75, d);\ncol = scene(uv) * mix(1.0, vig, uK);', { uK: v.k }),
          code: (v) => `float vig = 1.0 - smoothstep(0.3, 0.75, d);\ncol = c * mix(1.0, vig, ${f(v.k, 2)}); // corners keep ${Math.round((1 - v.k) * 100)}%`,
        },
        {
          title: 'Wide screens: fix the aspect',
          body: `<p>uv is 0..1 on both axes even when the screen is wide. On a 16:9 screen, <code>length(uv - 0.5)</code> gives an <b>oval</b> stretched sideways. Multiply x by the aspect ratio first to get a true circle:</p>
<pre class="code">vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);</pre>
<p>Our previews are square, so here we fake a wide screen by squashing.</p>`,
          controls: [{ name: 'a', label: 'aspect correction', min: 0, max: 1, step: 1, value: 0 }],
          shader: (v) => ({ frag: 'vec2 suv = vec2(uv.x, (uv.y - 0.5) * 1.78 + 0.5); // pretend 16:9\nvec2 p = (suv - 0.5) * vec2(mix(1.0, 1.78, uA), 1.0);\nfloat vig = 1.0 - smoothstep(0.25, 0.5, length(p));\nfloat inside = step(abs(uv.y - 0.5), 0.281);\ncol = vec3(vig) * inside;', uniforms: { uA: v.a } }),
          code: (v) => v.a ? 'vec2 p = (uv - 0.5) * vec2(1.78, 1.0); // aspect-corrected\nfloat d = length(p);   // → round' : 'vec2 p = uv - 0.5;\nfloat d = length(p);   // → oval on a wide screen',
          after: '<div class="tip">💡 Unity Vignette: Intensity, Smoothness, Roundness (= aspect correction), Center. Unreal: Vignette Intensity in the Post Process Volume.</div>',
          quiz: { q: 'Which pixel gets the most darkening from <code>1.0 - smoothstep(0.3, 0.7, length(uv - 0.5))</code>?', options: ['A corner, uv (1, 1)', 'The centre, uv (0.5, 0.5)', 'The middle of the top edge, uv (0.5, 1)'], answer: 0, explain: 'The corner is farthest from the centre (0.71) → multiplier 0. The top-middle is 0.5 away → partly dark.' },
        },
      ],
      games: [
        {
          id: 'match-vignette', title: 'Match the vignette', engine: 'slider', rounds: 4,
          blurb: 'Set radius, softness and strength to match.',
          gen: (rng, level) => {
            const r = rng.step(0.45, 0.85, 0.05), s = rng.step(0.1, 0.4, 0.05), k = rng.step(0.4, 1, 0.1);
            const params = [{ name: 'r', label: 'radius', min: 0.3, max: 1, step: 0.01, target: r }];
            if (level >= 2) params.push({ name: 's', label: 'softness', min: 0.05, max: 0.5, step: 0.01, target: s });
            if (level === 3) params.push({ name: 'k', label: 'strength', min: 0, max: 1, step: 0.05, target: k });
            const vals = (p) => [p.r, p.s ?? 0.25, p.k ?? 1];
            return {
              prompt: level === 1 ? 'Set the vignette radius.' : level === 2 ? 'Match radius and softness.' : 'Match radius, softness and strength.',
              params,
              build: (p) => { const [a, b, c] = vals(p); return post('float d = length(uv - 0.5);\nfloat vig = 1.0 - smoothstep(uR - uS, uR, d);\ncol = scene(uv) * mix(1.0, vig, uK);', { uR: a, uS: b, uK: c }); },
              code: (p) => { const [a, b, c] = vals(p); return `float vig = 1.0 - smoothstep(${f(a - b, 2)}, ${f(a, 2)}, d);\ncol = c * mix(1.0, vig, ${f(c, 2)});`; },
              compare: 'pixels',
              explain: '<p>Radius: where it gets darkest. Softness: how gradual the fade is. Strength: how dark the darkest part gets.</p>',
            };
          },
        },
        {
          id: 'vignette-math', title: 'Vignette by numbers', engine: 'numeric', rounds: 6,
          blurb: 'Compute d and the vignette multiplier for a pixel.',
          gen: (rng, level) => {
            const tri = rng.pick([[0.3, 0.4, 0.5], [0.15, 0.2, 0.25], [0.24, 0.32, 0.4], [0.18, 0.24, 0.3], [0.12, 0.16, 0.2], [0.36, 0.48, 0.6]]);
            const sw = rng.chance(0.5);
            const dx = (sw ? tri[1] : tri[0]) * rng.sign(), dy = (sw ? tri[0] : tri[1]) * rng.sign();
            const u = [r2(0.5 + dx), r2(0.5 + dy)], d = tri[2];
            if (level === 1) return { prompt: `Pixel at <b>uv = (${u[0]}, ${u[1]})</b>. What is <code>length(uv - 0.5)</code>?`, sub: 'Pythagoras: √(x² + y²).', answer: d, explain: `<p>uv − 0.5 = (${r2(dx)}, ${r2(dy)}). √(${r2(dx * dx * 10000) / 10000} + ${r2(dy * dy * 10000) / 10000}) = <b>${d}</b>. (A scaled 3-4-5 triangle!)</p>` };
            if (level === 2) {
              const k = rng.pick([1, 1.5]);
              const ans = Math.max(0, 1 - d * k);
              return { prompt: `Pixel at <b>uv = (${u[0]}, ${u[1]})</b>. What multiplier does it get?`, code: `float d = length(uv - 0.5);\nfloat vig = max(1.0 - d * ${f(k)}, 0.0);`, answer: +ans.toFixed(4), explain: `<p>d = ${d}. 1 − ${d} × ${k} = <b>${n3(ans)}</b>. The pixel keeps ${Math.round(ans * 100)}% of its brightness.</p>` };
            }
            // level 3: smoothstep with a known fraction
            const t = rng.pick([0, 0.25, 0.5, 0.75, 1]);
            const span = rng.pick([0.2, 0.4]);
            const a = r2(d - t * span), b = r2(a + span);
            const ans = 1 - fade(t);
            return { prompt: `Pixel at <b>uv = (${u[0]}, ${u[1]})</b>. Multiplier?`, code: `float d = length(uv - 0.5);\nfloat vig = 1.0 - smoothstep(${f(a, 2)}, ${f(b, 2)}, d);`, answer: +ans.toFixed(4), explain: `<p>d = ${d}. It is ${t * 100}% of the way from ${a} to ${b} → smoothstep = fade(${t}) = ${n3(fade(t))}. 1 − that = <b>${n3(ans)}</b>.</p>` };
          },
        },
        {
          id: 'tap-vignette', title: 'Find the half-dark ring', engine: 'tap', rounds: 5,
          blurb: 'Tap a pixel where the vignette multiplier has a given value.',
          gen: (rng, level) => {
            const target = level === 1 ? 0.5 : rng.pick([0.5, 0.25, 0.75]);
            const k = rng.pick([1.5, 2, 2.5]);
            const dT = (1 - target) / k; // 1 - d*k = target
            return {
              prompt: `Tap any pixel where <code>vig</code> = <b>${target}</b>.`,
              code: `float d = length(uv - 0.5);\nfloat vig = max(1.0 - d * ${f(k)}, 0.0);\ncol = c * vig;`,
              shader: level === 3 ? post(`float d = length(uv - 0.5);\ncol = scene(uv) * max(1.0 - d * ${f(k)}, 0.0);`) : { frag: `float d = length(uv - 0.5);\ncol = vec3(max(1.0 - d * ${f(k)}, 0.0));` },
              score: (u, v) => { const e = Math.abs(Math.hypot(u - 0.5, v - 0.5) - dT); return Math.max(0, Math.min(1, 1 - (e - 0.025) / 0.07)); },
              reveal: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [0.5 + dT * Math.cos(i * Math.PI / 4), 0.5 + dT * Math.sin(i * Math.PI / 4)]),
              explain: `<p>1 − d × ${k} = ${target} → d = ${n3(1 - target)} / ${k} = <b>${n3(dT)}</b>. Every pixel on a circle of radius ${n3(dT)} around the centre works.</p>`,
            };
          },
        },
      ],
    },
    // ================================================================== BLUR
    {
      id: 'post.blur',
      title: 'Blur & kernels',
      blurb: 'Average neighbouring pixels with a list of weights.',
      lesson: [
        {
          title: 'Blur = average your neighbours',
          body: `<p>To blur, each pixel reads the frame at <b>several nearby positions</b> and <b>averages</b> them. Sharp edges get smeared over the distance you sample.</p>
<p>Horizontal blur: N samples in a row, spaced apart. Try more samples and a wider spacing:</p>`,
          controls: [
            { name: 'n', label: 'samples N', min: 1, max: 9, step: 2, value: 5 },
            { name: 'd', label: 'spacing (uv)', min: 0.002, max: 0.03, step: 0.001, value: 0.01 },
          ],
          shader: (v) => post('vec3 s = vec3(0.0);\nfor (int i = 0; i < 9; i++){\n  if (float(i) >= uN) break;\n  float o = (float(i) - (uN - 1.0) * 0.5) * uD;\n  s += scene(uv + vec2(o, 0.0));\n}\ncol = s / uN;', { uN: v.n, uD: v.d }),
          code: (v) => { const h2 = (v.n - 1) / 2; return `vec3 s = vec3(0.0);\nfor (int i = 0; i < ${v.n}; i++) {\n  float o = (float(i) - ${f(h2)}) * ${f(v.d, 3)}; // ${-h2}…${h2} steps\n  s += texture2D(uScene, uv + vec2(o, 0.0)).rgb;\n}\ncol = s / ${f(v.n)};  // average`; },
          after: '<div class="analogy">🍹 Like stirring neighbouring drinks together: each glass becomes the average of itself and its neighbours. Sharp colour differences disappear.</div>',
        },
        {
          title: 'The kernel: a grid of weights',
          body: `<p>A 2D blur uses a grid of samples around the pixel, each with a <b>weight</b>. This grid of weights is the <b>kernel</b>.</p>
<ul><li><b>Box</b>: every sample counts the same (1/9 each).</li>
<li><b>Gaussian</b>: the centre counts most, corners least → smoother, rounder blur.</li></ul>`,
          controls: [
            { name: 'm', label: '0 identity · 1 box · 2 gaussian', min: 0, max: 2, step: 1, value: 1 },
            { name: 'd', label: 'sample spacing', min: 0.002, max: 0.03, step: 0.001, value: 0.012 },
          ],
          shader: (v) => kspec(['identity', 'box', 'gauss'][v.m], v.d),
          code: (v) => { const key = ['identity', 'box', 'gauss'][v.m]; return `// ${KERNELS[key].name}\n${fmtK(KERNELS[key].rows, KERNELS[key].scale)}\n\nfor each of the 9 offsets o:\n  sum += weight[o] * texture2D(uScene, uv + o * ${f(v.d, 3)}).rgb;`; },
        },
        {
          title: 'Weights must sum to 1',
          body: `<p>A blur should move brightness around, not create or destroy it. If the weights add up to more than 1, the image gets <b>brighter</b>; less than 1 → <b>darker</b>.</p>
<p>That's why the box kernel is ×1/9 (nine 1s / 9 = 1) and the Gaussian ×1/16 (1+2+1+2+4+2+1+2+1 = 16).</p>`,
          controls: [{ name: 's', label: 'weight per sample (×1/9)', min: 0.5, max: 1.6, step: 0.05, value: 1.3 }],
          shader: (v) => post('col = conv(uv, uK, 0.008);', { uK: kmat([[1, 1, 1], [1, 1, 1], [1, 1, 1]].map((r) => r.map((x) => x * v.s / 9))) }, { defs: KERNEL_DEFS }),
          code: (v) => `// each weight = ${f(v.s, 2)} / 9 = ${n3(v.s / 9)}\n// sum of 9 weights = ${f(v.s, 2)}  ${Math.abs(v.s - 1) < 0.001 ? '✓ brightness kept' : v.s > 1 ? '→ brighter!' : '→ darker!'}`,
          quiz: { q: 'A 1D kernel [0.25, ?, 0.25]. What must the centre weight be?', options: ['0.5', '0.25', '1.0'], answer: 0, explain: '0.25 + 0.5 + 0.25 = 1.' },
        },
        {
          title: 'More samples = more cost',
          body: `<p>A bigger, smoother blur needs a bigger kernel. An N×N kernel needs <b>N²</b> texture reads per pixel — it explodes quickly.</p>
<p>Trick: a Gaussian blur is <b>separable</b>. Blur horizontally in one pass, then vertically in a second pass: <b>N + N</b> reads instead of N×N. Same result!</p>`,
          controls: [{ name: 'r', label: 'blur radius (texels)', min: 1, max: 12, step: 1, value: 4 }],
          code: (v) => { const N = 2 * v.r + 1; return `N = 2 × ${v.r} + 1 = ${N}\none 2D pass:      ${N} × ${N} = ${N * N} reads per pixel\nseparable (2 pass): ${N} + ${N} = ${2 * N} reads per pixel\n→ ${(N * N / (2 * N)).toFixed(1)}× cheaper`; },
          after: '<div class="tip">💡 More tricks: blur a <b>downsampled</b> copy (½ or ¼ res), and place samples <b>between</b> two texels so linear filtering averages 2 texels in 1 read. Bloom and DoF use chains of small blurs on smaller and smaller textures.</div>',
        },
      ],
      games: [
        {
          id: 'kernel-math', title: 'Kernel maths', engine: 'numeric', rounds: 6,
          blurb: 'Missing weights, blurred values and sample counts.',
          gen: (rng, level) => {
            const kind = level === 1 ? rng.pick(['missing', 'avg']) : level === 2 ? rng.pick(['missing', 'weighted', 'norm']) : rng.pick(['weighted', 'norm', 'samples']);
            if (kind === 'missing') {
              const ks = [[0.25, null, 0.25], [0.1, 0.2, null, 0.2, 0.1], [0.2, null, 0.2], [null, 0.5, 0.25], [0.125, 0.25, null, 0.25, 0.125]];
              const k = rng.pick(ks);
              const miss = +(1 - k.filter((x) => x != null).reduce((a, b) => a + b, 0)).toFixed(4);
              return { prompt: 'This blur kernel must keep brightness. What is the missing weight?', code: `float w[${k.length}] = [${k.map((x) => (x == null ? '?' : x)).join(', ')}];`, answer: miss, explain: `<p>Weights must sum to 1: 1 − (${k.filter((x) => x != null).join(' + ')}) = <b>${n3(miss)}</b>.</p>` };
            }
            if (kind === 'avg') {
              const vals = [rng.pick([0, 0.3, 0.6]), rng.pick([0.3, 0.9, 0.6]), rng.pick([0, 0.3, 0.9])];
              const ans = (vals[0] + vals[1] + vals[2]) / 3;
              return { prompt: `A 3-sample box blur (weights ⅓ each). The three samples read <b>${vals.join(', ')}</b>. Result?`, answer: +ans.toFixed(4), explain: `<p>(${vals.join(' + ')}) / 3 = <b>${n3(ans)}</b>.</p>` };
            }
            if (kind === 'weighted') {
              const w = rng.pick([[0.25, 0.5, 0.25], [0.2, 0.6, 0.2]]);
              const vals = [rng.pick([0, 1]), rng.pick([0, 1, 0.5]), rng.pick([1, 0.5])];
              const ans = w[0] * vals[0] + w[1] * vals[1] + w[2] * vals[2];
              return { prompt: `Kernel <b>[${w.join(', ')}]</b>. Samples (left, centre, right) = <b>${vals.join(', ')}</b>. Blurred value?`, answer: +ans.toFixed(4), explain: `<p>${w.map((x, i) => `${x}×${vals[i]}`).join(' + ')} = <b>${n3(ans)}</b>.</p>` };
            }
            if (kind === 'norm') {
              const k = rng.pick([[1, 2, 1], [1, 4, 6, 4, 1], [1, 2, 1, 2, 4, 2, 1, 2, 1], [1, 3, 1]]);
              const sum = k.reduce((a, b) => a + b, 0);
              const c = k[Math.floor(k.length / 2)];
              return { prompt: `Integer kernel <b>[${k.join(', ')}]</b>${k.length === 9 ? ' (a 3×3 grid)' : ''}. After normalising (dividing by the sum), what is the <b>centre</b> weight?`, answer: +(c / sum).toFixed(4), explain: `<p>Sum = ${sum}. Centre ${c} / ${sum} = <b>${n3(c / sum)}</b>.</p>` };
            }
            const r = rng.int(2, 6), N = 2 * r + 1;
            const sep = rng.chance(0.5);
            return { prompt: `A blur of radius <b>${r}</b> texels (N = 2r + 1 = ${N} taps per axis). How many texture reads per pixel ${sep ? 'as a <b>separable</b> 2-pass blur' : 'in <b>one 2D pass</b>'}?`, answer: sep ? 2 * N : N * N, explain: `<p>${sep ? `${N} horizontal + ${N} vertical = <b>${2 * N}</b>` : `${N} × ${N} = <b>${N * N}</b>`}. (The other way: ${sep ? N * N : 2 * N}.)</p>` };
          },
        },
        {
          id: 'which-kernel', title: 'Name that kernel', engine: 'mcq', rounds: 8,
          blurb: 'Read a 3×3 kernel and say what it does.',
          gen: (rng, level) => {
            const keys = level === 1 ? ['identity', 'box', 'laplace', 'bright'] : level === 2 ? ['identity', 'box', 'gauss', 'laplace', 'bright', 'sharpen'] : Object.keys(KERNELS);
            const ans = rng.pick(keys);
            const opts = distinct(rng, ans, () => rng.pick(keys), 4);
            const K = KERNELS[ans];
            return {
              prompt: 'What does this kernel do?',
              sub: 'Top row = the pixels above, centre = this pixel.',
              code: fmtK(K.rows, K.scale),
              options: opts.map((o) => KERNELS[o].name),
              grid: false,
              explain: (el) => {
                el.append(h('p', { html: 'Check the <b>sum</b> first: 1 → keeps brightness (blur, sharpen, identity, shift); 0 → only differences survive (edges); 2 → brighter. Then the shape: all positive &amp; spread = blur; negative neighbours + big centre = sharpen; −1…+1 across = edges in one direction.' }));
                el.append(h('div.small.dim', `This kernel (${K.name}) applied to the frame:`));
                el.append(h('div.view-wrap', shaderView(kspec(ans), { size: 160 })));
              },
            };
          },
        },
        {
          id: 'kernel-sum', title: 'What does the sum do?', engine: 'buckets', rounds: 2,
          blurb: 'Sort kernels by their weight sum.',
          gen: (rng) => {
            const items = [];
            const pick = (arr) => rng.pick(arr);
            for (const a of rng.pickN([0.1, 0.2, 0.25, 0.3, 0.4], 3)) items.push({ code: `[${a}, ${r2(1 - 2 * a)}, ${a}]`, bucket: 0, why: `${a} + ${r2(1 - 2 * a)} + ${a} = 1.` });
            items.push({ code: '[0.2, 0.2, 0.2, 0.2, 0.2]', bucket: 0 });
            items.push({ code: '[-0.5, 2, -0.5]', bucket: 0, why: 'A sharpen kernel: −0.5 + 2 − 0.5 = 1.' });
            for (const a of rng.pickN([0.3, 0.4, 0.5, 0.6], 3)) { const b = pick([0.6, 0.8, 1]); items.push({ code: `[${a}, ${b}, ${a}]`, bucket: 1, why: `Sum = ${r2(2 * a + b)} ≠ 1 → ${2 * a + b > 1 ? 'brighter' : 'darker'}.` }); }
            items.push({ code: '[0.1, 0.2, 0.1]', bucket: 1, why: 'Sum 0.4 → much darker.' });
            for (const a of rng.pickN([0.5, 1, 2], 2)) items.push({ code: `[-${a}, 0, ${a}]`, bucket: 2, why: 'Sum 0: flat areas cancel → edge detector.' });
            items.push({ code: '[1, -2, 1]', bucket: 2, why: '1 − 2 + 1 = 0 → second-difference edge detector.' });
            return {
              prompt: 'What happens to a flat, evenly-coloured area?',
              sub: 'Add up the weights!',
              buckets: ['= 1: stays the same', '≠ 1: gets brighter/darker', '= 0: becomes black (edges only)'],
              items,
              count: 10,
              explain: '<p>On a flat area every sample has the same value v, so the result is v × (sum of weights). Sum 1 → v. Sum 0 → 0, except where neighbours differ: that\'s why edge kernels sum to zero.</p>',
            };
          },
        },
        {
          id: 'match-blur', title: 'Match the blur', engine: 'slider', rounds: 4,
          blurb: 'Tune the blur spacing (and direction) to match.',
          gen: (rng, level) => {
            const dx = rng.step(0.004, 0.024, 0.004), dy = rng.step(0, 0.024, 0.004);
            const params = level === 1 ? [{ name: 'd', label: 'spacing', min: 0, max: 0.03, step: 0.001, target: dx }]
              : [{ name: 'dx', label: 'spacing x', min: 0, max: 0.03, step: 0.001, target: dx }, { name: 'dy', label: 'spacing y', min: 0, max: 0.03, step: 0.001, target: dy }];
            if (level === 3) params.push({ name: 's', label: 'weight sum', min: 0.6, max: 1.4, step: 0.05, target: rng.step(0.7, 1.3, 0.1) });
            const vals = (p) => [p.dx ?? p.d, p.dy ?? p.d, p.s ?? 1];
            return {
              prompt: level === 1 ? 'How wide is the 3×3 box blur?' : level === 2 ? 'Match the horizontal and vertical blur widths.' : 'Match the blur widths — and the weight sum (brightness).',
              params,
              build: (p) => { const [a, b, s] = vals(p); return post('vec3 sum = vec3(0.0);\nfor (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)\n  sum += scene(uv + vec2(float(x) * uD.x, float(y) * uD.y));\ncol = sum * uS / 9.0;', { uD: [a, b], uS: s }); },
              code: (p) => { const [a, b, s] = vals(p); return `// 3×3 box blur, offsets × (${f(a, 3)}, ${f(b, 3)})\ncol = sum * ${f(s, 2)} / 9.0;`; },
              compare: 'pixels',
              explain: '<p>Spacing x smears horizontally (look at the mountain slopes), spacing y vertically (look at the horizon line). A weight sum above 1 brightens.</p>',
            };
          },
        },
      ],
    },
    // ================================================================== EDGES
    {
      id: 'post.edges',
      title: 'Edge detection',
      blurb: 'Edges are where neighbouring pixels differ.',
      lesson: [
        {
          title: 'Compare with the neighbours',
          body: `<p>An <b>edge</b> is a place where brightness changes suddenly. So: read the pixel on the <b>left</b> and on the <b>right</b>, and subtract. Flat area → difference ≈ 0 (black). Edge → big difference (bright).</p>`,
          controls: [
            { name: 'd', label: 'neighbour distance', min: 0.002, max: 0.03, step: 0.001, value: 0.006 },
            { name: 'g', label: 'gain', min: 1, max: 10, step: 0.5, value: 4 },
          ],
          shader: (v) => post('vec2 e = vec2(uD, 0.0);\nfloat dx = luma(scene(uv + e)) - luma(scene(uv - e));\ncol = vec3(abs(dx) * uG);', { uD: v.d, uG: v.g }),
          code: (v) => `vec2 e = vec2(${f(v.d, 3)}, 0.0);\nfloat dx = luma(scene(uv + e)) - luma(scene(uv - e));\ncol = vec3(abs(dx) * ${f(v.g, 1)});`,
          after: '<div class="note">Only comparing left/right finds <b>vertical</b> edges (the mountain sides). The flat horizon is invisible — its change is up/down!</div>',
        },
        {
          title: 'Both directions',
          body: `<p>Do the same vertically, then combine the two differences as a vector: <code>length(vec2(dx, dy))</code> — the <b>gradient</b> strength. (Yes, the same "how steep is it here" idea as in gradient noise.)</p>`,
          controls: [{ name: 'm', label: '0 dx only · 1 dy only · 2 both', min: 0, max: 2, step: 1, value: 2 }],
          shader: (v) => post('vec2 e = vec2(0.006, 0.0);\nfloat dx = luma(scene(uv + e.xy)) - luma(scene(uv - e.xy));\nfloat dy = luma(scene(uv + e.yx)) - luma(scene(uv - e.yx));\nfloat g = uM < 0.5 ? abs(dx) : uM < 1.5 ? abs(dy) : length(vec2(dx, dy));\ncol = vec3(g * 4.0);', { uM: v.m }),
          code: (v) => `float dx = luma(right) - luma(left);\nfloat dy = luma(up) - luma(down);\ncol = vec3(${['abs(dx)', 'abs(dy)', 'length(vec2(dx, dy))'][v.m]} * 4.0);`,
        },
        {
          title: 'Sobel: a smarter difference',
          body: `<p>Single-pixel differences are noisy. The <b>Sobel</b> kernel compares a whole column on the left with a column on the right (centre row counts double):</p>
<pre class="code">Gx: [-1  0  1]      Gy: [ 1  2  1]
    [-2  0  2]          [ 0  0  0]
    [-1  0  1]          [-1 -2 -1]</pre>
<p>Notice: each sums to <b>0</b> → flat areas give 0. Then threshold the strength to get clean lines.</p>`,
          controls: [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.01, value: 0.3 }],
          shader: (v) => post('float gx = 0.0; float gy = 0.0;\nfor (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){\n  float l = luma(scene(uv + vec2(float(x), float(y)) * 0.005));\n  float wx = float(x) * (y == 0 ? 2.0 : 1.0);\n  float wy = float(y) * (x == 0 ? 2.0 : 1.0);\n  gx += wx * l; gy += wy * l;\n}\nfloat g = length(vec2(gx, gy));\ncol = vec3(step(uT, g));', { uT: v.t }),
          code: (v) => `float g = length(vec2(gx, gy));   // Sobel strength\ncol = vec3(step(${f(v.t, 2)}, g));  // 1 = edge`,
          quiz: { q: 'Why do edge kernels sum to 0?', options: ['So that flat areas (all samples equal) give 0', 'So the image gets darker', 'To blur the edges'], answer: 0, explain: 'Equal samples × weights summing to 0 → 0. Only differences survive.' },
        },
        {
          title: 'Outlines',
          body: `<p>Use the edge mask to draw dark lines over the original → a toon / comic look.</p>`,
          controls: [{ name: 'k', label: 'outline strength', min: 0, max: 1, step: 0.05, value: 0.9 }],
          shader: (v) => post('vec2 e = vec2(0.005, 0.0);\nfloat dx = luma(scene(uv + e.xy)) - luma(scene(uv - e.xy));\nfloat dy = luma(scene(uv + e.yx)) - luma(scene(uv - e.yx));\nfloat edge = smoothstep(0.05, 0.15, length(vec2(dx, dy)));\ncol = mix(scene(uv), vec3(0.05), edge * uK);', { uK: v.k }),
          code: (v) => `float edge = smoothstep(0.05, 0.15, length(vec2(dx, dy)));\ncol = mix(c, vec3(0.05), edge * ${f(v.k, 2)});`,
          after: '<div class="tip">💡 In games, outlines usually detect edges in the <b>depth</b> and <b>normal</b> buffers instead of colour: you get clean silhouettes and creases, and no lines inside textures. Unreal: SceneDepth / WorldNormal in a post process material. Unity URP: a Renderer Feature with the depth-normals texture.</div>',
        },
      ],
      games: [
        {
          id: 'edge-math', title: 'Edge numbers', engine: 'numeric', rounds: 6,
          blurb: 'Compute differences and Sobel responses by hand.',
          gen: (rng, level) => {
            if (level === 1) {
              const l = rng.pick([0.1, 0.2, 0.5, 0.8]), r = rng.pick([0.2, 0.7, 0.9, 0.5]);
              return { prompt: `Left neighbour luma <b>${l}</b>, right neighbour <b>${r}</b>. Edge strength <code>abs(right - left)</code>?`, answer: +Math.abs(r - l).toFixed(4), explain: `<p>|${r} − ${l}| = <b>${n3(Math.abs(r - l))}</b>. ${Math.abs(r - l) < 0.15 ? 'Small: probably not an edge.' : 'Big jump → an edge.'}</p>` };
            }
            const grid = level === 2 ? (() => { const a = rng.pick([0, 0.2]), b = rng.pick([0.8, 1]); return [[a, a, b], [a, a, b], [a, a, b]]; })()
              : [[rng.pick([0, 0.2]), rng.pick([0.4, 0.6]), rng.pick([0.8, 1])], [rng.pick([0, 0.2]), 0.5, rng.pick([0.8, 1])], [rng.pick([0, 0.2]), rng.pick([0.4, 0.6]), rng.pick([0.6, 1])]];
            const G = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
            let gx = 0; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) gx += G[y][x] * grid[y][x];
            return {
              prompt: 'Apply the Sobel X kernel to this 3×3 patch of luma values. What is gx?',
              code: `patch:\n${grid.map((r) => '[ ' + r.map((x) => x.toFixed(1)).join('  ') + ' ]').join('\n')}\n\nSobel X:\n[ -1  0  1 ]\n[ -2  0  2 ]\n[ -1  0  1 ]`,
              answer: +gx.toFixed(4),
              explain: `<p>Right column × (1, 2, 1) minus left column × (1, 2, 1): (${grid[0][2]} + 2×${grid[1][2]} + ${grid[2][2]}) − (${grid[0][0]} + 2×${grid[1][0]} + ${grid[2][0]}) = <b>${n3(gx)}</b>. The middle column has weight 0, so it doesn't matter.</p>`,
            };
          },
        },
        {
          id: 'edge-image', title: 'Code → edges', engine: 'mcq', rounds: 8,
          blurb: 'Which image does this edge code produce?',
          gen: (rng, level) => {
            const pool = [
              { c: 'col = vec3(abs(dx) * 4.0);', lvl: 1 },
              { c: 'col = vec3(abs(dy) * 4.0);', lvl: 1 },
              { c: 'col = c;', lvl: 1 },
              { c: 'col = vec3(length(vec2(dx, dy)) * 4.0);', lvl: 2 },
              { c: 'col = mix(c, vec3(0.0), step(0.1, length(vec2(dx, dy))));', lvl: 2 },
              { c: 'col = vec3(1.0 - step(0.1, length(vec2(dx, dy))));', lvl: 2 },
              { c: 'col = vec3(dx * 4.0);', lvl: 3 },
              { c: 'col = vec3(0.5 + dy * 4.0);', lvl: 3 },
            ].filter((x) => x.lvl <= level);
            const ans = rng.pick(pool);
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.c);
            const pre = 'vec3 c = scene(uv);\nvec2 e = vec2(0.006, 0.0);\nfloat dx = luma(scene(uv + e.xy)) - luma(scene(uv - e.xy));\nfloat dy = luma(scene(uv + e.yx)) - luma(scene(uv - e.yx));\n';
            return {
              prompt: 'Which image does this produce?',
              code: `// dx = luma(right) − luma(left)\n// dy = luma(up) − luma(down)\n${ans.c}`,
              options: opts.map((o) => ({ shader: post(pre + o.c) })),
              explain: '<p><b>dx</b> catches vertical edges (mountain sides), <b>dy</b> horizontal ones (horizon, grass line). Without <code>abs</code>, negative differences are clamped to black — only one side of each edge shows.</p>',
            };
          },
        },
        {
          id: 'match-edges', title: 'Match the outlines', engine: 'slider', rounds: 4,
          blurb: 'Tune threshold and sample distance of an edge filter.',
          gen: (rng, level) => {
            const t = rng.step(0.05, 0.3, 0.05), d = rng.step(0.003, 0.015, 0.003);
            const params = [{ name: 't', label: 'threshold', min: 0.02, max: 0.4, step: 0.01, target: t }];
            if (level >= 2) params.push({ name: 'd', label: 'neighbour distance', min: 0.002, max: 0.02, step: 0.001, target: d });
            const vals = (p) => [p.t, p.d ?? 0.006, level === 3 ? 1 : 0];
            return {
              prompt: level === 1 ? 'Set the edge threshold.' : level === 2 ? 'Set threshold and neighbour distance (line thickness).' : 'Outlines over the image: match threshold and distance.',
              params,
              build: (p) => { const [a, b, o] = vals(p); return post('vec2 e = vec2(uD, 0.0);\nfloat dx = luma(scene(uv + e.xy)) - luma(scene(uv - e.xy));\nfloat dy = luma(scene(uv + e.yx)) - luma(scene(uv - e.yx));\nfloat edge = step(uT, length(vec2(dx, dy)));\ncol = mix(vec3(1.0 - edge), scene(uv) * (1.0 - edge), uO);', { uT: a, uD: b, uO: o }); },
              code: (p) => { const [a, b] = vals(p); return `vec2 e = vec2(${f(b, 3)}, 0.0);\nfloat edge = step(${f(a, 2)}, length(vec2(dx, dy)));`; },
              compare: 'pixels',
              explain: '<p>Lower threshold → more, weaker edges show up. A bigger neighbour distance → thicker lines (and edges found further away).</p>',
            };
          },
        },
      ],
    },
    // ================================================================== CHROMATIC ABERRATION & DISTORTION
    {
      id: 'post.chroma',
      title: 'Chromatic aberration & distortion',
      blurb: 'Sample R, G and B at different uv; bend the whole frame.',
      lesson: [
        {
          title: 'Split the channels',
          body: `<p>Cheap lenses bend red, green and blue light by slightly different amounts, so colours separate at edges. Fake it: read the frame <b>three times</b> at slightly different uv and take one channel from each.</p>`,
          controls: [{ name: 'a', label: 'offset', min: 0, max: 0.03, step: 0.001, value: 0.008 }],
          shader: (v) => post('vec2 o = vec2(uA, 0.0);\ncol.r = scene(uv + o).r;\ncol.g = scene(uv).g;\ncol.b = scene(uv - o).b;', { uA: v.a }),
          code: (v) => `vec2 o = vec2(${f(v.a, 3)}, 0.0);\ncol.r = texture2D(uScene, uv + o).r;\ncol.g = texture2D(uScene, uv).g;\ncol.b = texture2D(uScene, uv - o).b;`,
          after: '<div class="note">Where the image is flat, the three reads agree → no change. Only at edges do the channels disagree → coloured fringes.</div>',
        },
        {
          title: 'Stronger at the edges',
          body: `<p>Real lenses are sharp in the middle and fringe towards the borders. Make the offset point <b>away from the centre</b> and grow with distance:</p>
<pre class="code">vec2 o = (uv - 0.5) * amount;</pre>`,
          controls: [{ name: 'a', label: 'amount', min: 0, max: 0.1, step: 0.002, value: 0.04 }],
          shader: (v) => post('vec2 o = (uv - 0.5) * uA;\ncol = vec3(scene(uv + o).r, scene(uv).g, scene(uv - o).b);', { uA: v.a }),
          code: (v) => `vec2 o = (uv - 0.5) * ${f(v.a, 3)};  // 0 at the centre\ncol = vec3(scene(uv + o).r, scene(uv).g, scene(uv - o).b);`,
        },
        {
          title: 'Lens distortion',
          body: `<p>Bend the <b>whole</b> frame: push uv outwards or inwards depending on the distance from the centre squared.</p>
<pre class="code">vec2 p = uv - 0.5;
p *= 1.0 + k * dot(p, p);
vec2 q = p + 0.5;</pre>
<p>k &gt; 0: pixels near the border read from <i>further out</i>, so straight lines bend inwards → <b>pincushion</b>. k &lt; 0: they read from <i>closer in</i>, so the middle bulges → <b>barrel</b> (fish-eye).</p>`,
          controls: [{ name: 'k', label: 'k', min: -1.5, max: 1.5, step: 0.05, value: -0.8 }],
          shader: (v) => ({ defs: SCENE, frag: 'vec2 p = uv - 0.5;\np *= 1.0 + uK * dot(p, p);\ncol = scene(p + 0.5);', uniforms: { uK: v.k }, textures: { uScene: { name: 'uvgrid', wrap: 'clamp' } } }),
          code: (v) => `vec2 p = uv - 0.5;\np *= 1.0 + ${f(v.k, 2)} * dot(p, p);  // ${v.k < 0 ? 'barrel (bulge)' : v.k > 0 ? 'pincushion' : 'none'}\ncol = texture2D(uScene, p + 0.5).rgb;`,
          after: '<div class="tip">💡 Shown on a grid so the bending is obvious. VR headsets apply a barrel distortion to cancel the pincushion of their lenses!</div>',
        },
        {
          title: 'Glitches & ripples',
          body: `<p>Any uv trick from Textures works on the whole frame. A <b>glitch</b>: shift random horizontal bands sideways using a hash of the band id (noise topic!), changing a few times per second:</p>`,
          controls: [{ name: 'a', label: 'glitch amount', min: 0, max: 0.15, step: 0.005, value: 0.05 }],
          shader: (v) => post('float band = floor(uv.y * 24.0);\nfloat t = floor(uTime * 6.0);\nfloat r = hash(vec2(band, t));\nfloat shift = (r - 0.5) * uA * step(0.7, r);\nvec2 q = uv + vec2(shift, 0.0);\ncol = vec3(scene(q + vec2(uA * 0.1, 0.0)).r, scene(q).g, scene(q).b);', { uA: v.a }),
          code: (v) => `float band = floor(uv.y * 24.0);        // 24 bands\nfloat r = hash(vec2(band, floor(uTime * 6.0)));\nfloat shift = (r - 0.5) * ${f(v.a, 3)} * step(0.7, r); // ~30% of bands\nvec2 q = uv + vec2(shift, 0.0);`,
          quiz: { q: 'Chromatic aberration needs how many reads of the frame per pixel (simple version)?', options: ['3 — one per colour channel', '1', '9'], answer: 0, explain: 'R, G and B each come from a different uv → three reads.' },
        },
      ],
      games: [
        {
          id: 'which-effect', title: 'Which effect?', engine: 'mcq', rounds: 8,
          blurb: 'Name the post effect applied to the frame.',
          gen: (rng, level) => {
            const E = [
              { name: 'Chromatic aberration', frag: 'vec2 o = (uv - 0.5) * 0.06;\ncol = vec3(scene(uv + o).r, scene(uv).g, scene(uv - o).b);', lvl: 1 },
              { name: 'Barrel distortion', frag: 'vec2 p = uv - 0.5; p *= 1.0 - 1.2 * dot(p, p);\ncol = scene(p + 0.5);', lvl: 1 },
              { name: 'Vignette', frag: 'col = scene(uv) * (1.0 - smoothstep(0.3, 0.7, length(uv - 0.5)));', lvl: 1 },
              { name: 'Blur', frag: 'vec3 s = vec3(0.0);\nfor (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) s += scene(uv + vec2(float(x), float(y)) * 0.012);\ncol = s / 9.0;', lvl: 1 },
              { name: 'Edge detection', frag: 'vec2 e = vec2(0.006, 0.0);\nfloat dx = luma(scene(uv + e.xy)) - luma(scene(uv - e.xy));\nfloat dy = luma(scene(uv + e.yx)) - luma(scene(uv - e.yx));\ncol = vec3(length(vec2(dx, dy)) * 5.0);', lvl: 1 },
              { name: 'Wavy distortion', frag: 'col = scene(uv + vec2(0.02 * sin(uv.y * 40.0), 0.0));', lvl: 2 },
              { name: 'Desaturation', frag: 'vec3 c = scene(uv);\ncol = mix(vec3(luma(c)), c, 0.15);', lvl: 2 },
              { name: 'Glitch bands', frag: 'float b = floor(uv.y * 20.0); float r = hash(vec2(b, 3.0));\ncol = scene(uv + vec2((r - 0.5) * 0.15 * step(0.6, r), 0.0));', lvl: 2 },
              { name: 'Pincushion distortion', frag: 'vec2 p = uv - 0.5; p *= 1.0 + 1.2 * dot(p, p);\ncol = scene(p + 0.5);', lvl: 3 },
              { name: 'Posterize', frag: 'col = floor(scene(uv) * 4.0) / 4.0;', lvl: 3 },
              { name: 'Sharpen', frag: 'vec3 c = scene(uv) * 5.0;\nvec2 e = vec2(0.006, 0.0);\nc -= scene(uv + e.xy) + scene(uv - e.xy) + scene(uv + e.yx) + scene(uv - e.yx);\ncol = c;', lvl: 3 },
            ];
            const pool = E.filter((x) => x.lvl <= level);
            const ans = rng.pick(pool.filter((x) => x.lvl >= level - 1));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4, (x) => x.name);
            const tex = ans.name.includes('distortion') && rng.chance(0.5) ? 'uvgrid' : 'photo';
            return {
              prompt: 'Which post effect was applied?',
              shaders: [{ spec: { defs: SCENE, frag: 'col = scene(uv);', textures: { uScene: { name: tex, wrap: 'clamp' } } }, label: 'original' }, { spec: { defs: SCENE, frag: ans.frag, textures: { uScene: { name: tex, wrap: 'clamp' } } }, label: 'with effect' }],
              options: opts.map((o) => o.name),
              grid: false,
              explain: '<p>Colour fringes = chromatic aberration. Bulging = barrel, pinched corners = pincushion. Dark corners = vignette. Soft = blur, crisp halos = sharpen. Shifted stripes = glitch.</p>',
            };
          },
        },
        {
          id: 'match-chroma', title: 'Match the lens', engine: 'slider', rounds: 4,
          blurb: 'Tune aberration and lens distortion to match the target.',
          gen: (rng, level) => {
            const a = rng.step(0.01, 0.08, 0.01), k = rng.step(-1, 1, 0.25);
            const params = [{ name: 'a', label: 'aberration amount', min: 0, max: 0.1, step: 0.002, target: a }];
            if (level >= 2) params.push({ name: 'k', label: 'distortion k', min: -1.2, max: 1.2, step: 0.05, target: level === 2 ? (k === 0 ? -0.5 : k) : k });
            const vals = (p) => [p.a, p.k ?? 0];
            return {
              prompt: level === 1 ? 'How strong is the radial chromatic aberration?' : 'Match the aberration and the lens distortion (barrel −, pincushion +).',
              params,
              build: (p) => { const [x, y] = vals(p); return post('vec2 p = uv - 0.5;\np *= 1.0 + uK * dot(p, p);\nvec2 q = p + 0.5;\nvec2 o = (uv - 0.5) * uA;\ncol = vec3(scene(q + o).r, scene(q).g, scene(q - o).b);', { uA: x, uK: y }); },
              code: (p) => { const [x, y] = vals(p); return `p *= 1.0 + ${f(y, 2)} * dot(p, p);\nvec2 o = (uv - 0.5) * ${f(x, 3)};`; },
              compare: 'pixels',
              explain: '<p>Look at the fringes at the corners (aberration grows towards the edges) and whether the horizon bulges or pinches (distortion).</p>',
            };
          },
        },
        {
          id: 'chroma-math', title: 'Where does red read?', engine: 'numeric', rounds: 6,
          blurb: 'Compute the uv each channel samples.',
          gen: (rng, level) => {
            const u = [rng.pick([0.1, 0.2, 0.8, 0.9]), rng.pick([0.3, 0.5, 0.7])];
            const a = rng.pick([0.1, 0.05, 0.2]);
            if (level === 1) { const o = rng.pick([0.01, 0.02]); return { prompt: `Pixel <b>uv = (${u[0]}, ${u[1]})</b>. Where does the <b>blue</b> channel read?`, code: `vec2 o = vec2(${f(o, 2)}, 0.0);\ncol.b = texture2D(uScene, uv - o).b;`, answer: [+(u[0] - o).toFixed(4), u[1]], wrap: 'vec2', explain: `<p>uv − o = (${u[0]} − ${o}, ${u[1]}) = <b>(${n3(u[0] - o)}, ${u[1]})</b>.</p>` }; }
            const o = [(u[0] - 0.5) * a, (u[1] - 0.5) * a];
            if (level === 2) return { prompt: `Pixel <b>uv = (${u[0]}, ${u[1]})</b>. Where does <b>red</b> read?`, code: `vec2 o = (uv - 0.5) * ${f(a, 2)};\ncol.r = texture2D(uScene, uv + o).r;`, answer: [+(u[0] + o[0]).toFixed(4), +(u[1] + o[1]).toFixed(4)], wrap: 'vec2', explain: `<p>o = (${n3(u[0] - 0.5)}, ${n3(u[1] - 0.5)}) × ${a} = (${n3(o[0])}, ${n3(o[1])}). uv + o = <b>(${n3(u[0] + o[0])}, ${n3(u[1] + o[1])})</b> — pushed away from the centre.</p>` };
            const k = rng.pick([-1, 1, 2]);
            const p = [u[0] - 0.5, u[1] - 0.5], s = 1 + k * (p[0] * p[0] + p[1] * p[1]);
            const ans = [+(p[0] * s + 0.5).toFixed(4), +(p[1] * s + 0.5).toFixed(4)];
            return { prompt: `Lens distortion. Pixel <b>uv = (${u[0]}, ${u[1]})</b>. Which uv is read?`, code: `vec2 p = uv - 0.5;\np *= 1.0 + ${f(k)} * dot(p, p);\nvec2 q = p + 0.5;`, answer: ans, wrap: 'vec2', explain: `<p>p = (${n3(p[0])}, ${n3(p[1])}), dot(p,p) = ${n3(p[0] * p[0] + p[1] * p[1])}, scale = ${n3(s)}. q = p × ${n3(s)} + 0.5 = <b>(${n3(ans[0])}, ${n3(ans[1])})</b>.</p>` };
          },
        },
      ],
    },
    // ================================================================== BLOOM
    {
      id: 'post.bloom',
      title: 'Bloom',
      blurb: 'Bright parts glow: threshold, blur, add back.',
      lesson: [
        {
          title: 'Why bright things glow',
          body: `<p>In real cameras and eyes, very bright light <b>scatters</b> a little into the surrounding area: the sun, neon signs and explosions get a soft halo. Games fake it with <b>bloom</b>, in three steps:</p>
<ol><li><b>Bright pass</b>: keep only the brightest parts of the frame.</li>
<li><b>Blur</b> them a lot.</li>
<li><b>Add</b> the blurred glow back on top of the original.</li></ol>`,
          shaders: [{ spec: post('col = scene(uv);'), label: 'original' }, { spec: post('col = scene(uv) + bloomBlur(uv, 0.75, 0.02) * 4.0;', {}, { defs: BLOOM }), label: 'with bloom' }],
        },
        {
          title: 'Step 1: the bright pass',
          body: `<p>Subtract a <b>threshold</b> and clamp at 0: only what's brighter than the threshold survives, and it starts from zero (no hard cut-off edge).</p>
<pre class="code">vec3 b = max(c - threshold, 0.0);</pre>`,
          controls: [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.01, value: 0.75 }],
          shader: (v) => post('col = max(scene(uv) - uT, 0.0) / max(1.0 - uT, 0.05);', { uT: v.t }),
          code: (v) => `vec3 b = max(c - ${f(v.t, 2)}, 0.0);\n// (shown rescaled so it's visible)`,
          after: '<div class="note">In a real HDR renderer the sun might be 20.0, not 1.0 — so the threshold is often above 1 and only truly bright things bloom. Our 0..1 photo needs a lower one.</div>',
        },
        {
          title: 'Step 2: blur it',
          body: `<p>Blur the bright-pass result <b>a lot</b> — the glow should spread well beyond the bright object. Here: a 5×5 grid of samples (25 reads, already the limit for a phone!) with adjustable spacing.</p>`,
          controls: [{ name: 'r', label: 'blur spacing', min: 0.002, max: 0.04, step: 0.001, value: 0.02 }],
          shader: (v) => post('col = bloomBlur(uv, 0.75, uR) * 4.0;', { uR: v.r }, { defs: BLOOM }),
          code: (v) => `for (int y = -2; y <= 2; y++)\n  for (int x = -2; x <= 2; x++)\n    s += bright(uv + vec2(x, y) * ${f(v.r, 3)});\nglow = s / 25.0;`,
          after: '<div class="tip">💡 Engines don\'t do one giant blur. They <b>downsample</b> the bright pass several times (½, ¼, ⅛ …), blur each small level cheaply, then <b>upsample</b> and add them together. Wide glow, few samples.</div>',
        },
        {
          title: 'Step 3: add it back',
          body: `<p>Finally <b>add</b> the glow to the original frame, scaled by an <b>intensity</b>. Adding (not mixing) is right because glow is <i>extra light</i>.</p>`,
          controls: [
            { name: 't', label: 'threshold', min: 0.4, max: 0.95, step: 0.01, value: 0.75 },
            { name: 'k', label: 'intensity', min: 0, max: 8, step: 0.1, value: 3 },
          ],
          shader: (v) => post('col = scene(uv) + bloomBlur(uv, uT, 0.02) * uK;', { uT: v.t, uK: v.k }, { defs: BLOOM }),
          code: (v) => `vec3 glow = blur(max(c - ${f(v.t, 2)}, 0.0));\ncol = c + glow * ${f(v.k, 1)};`,
          after: '<div class="tip">💡 Unity Bloom: <b>Threshold</b>, <b>Intensity</b>, <b>Scatter</b> (spread). Unreal: Bloom Intensity, Threshold, and a "Convolution" mode for fancy lens shapes. Bloom happens <b>before</b> tonemapping, on HDR values.</div>',
          quiz: { q: 'Why is the glow added instead of mixed?', options: ['Glow is extra light on top of the scene', 'Mixing is slower', 'Adding makes it darker'], answer: 0, explain: 'Light adds up. Mixing would darken the original where the glow is dim.' },
        },
      ],
      games: [
        {
          id: 'bloom-order', title: 'Put it in order', engine: 'order', rounds: 3,
          blurb: 'Order the steps of bloom and of a post-processing chain.',
          questions: [
            { prompt: 'Order the steps of bloom:', items: ['Render the scene to a texture', 'Bright pass: keep only pixels above the threshold', 'Blur the bright pass', 'Add the blurred glow to the original'], explain: 'Isolate → spread → combine.' },
            { prompt: 'Order the engine-style bloom:', items: ['Bright pass at half resolution', 'Downsample to ¼, ⅛, 1/16 …', 'Blur each small level', 'Upsample and add the levels together', 'Add the result to the full-res frame'], explain: 'Small textures make wide blurs cheap.' },
            { prompt: 'Order a typical post stack:', items: ['Render the 3D scene (HDR)', 'Bloom', 'Tonemapping (HDR → 0..1)', 'Colour grading', 'Vignette', 'Draw the UI on top'], explain: 'Bloom works on HDR values, so before tonemapping. UI comes last so it isn\'t blurred or graded.', level: 2 },
            { prompt: 'Order the lines of a bloom shader:', items: [{ code: 'vec3 c = texture2D(uScene, uv).rgb;' }, { code: 'vec3 b = max(c - uThreshold, 0.0);' }, { code: 'vec3 glow = blur(b);' }, { code: 'col = c + glow * uIntensity;' }], explain: 'Read → bright pass → blur → add.' },
            { prompt: 'Order the steps of edge-detect outlines:', items: ['Read the neighbours\' luma (left, right, up, down)', 'Compute dx and dy differences', 'Edge strength = length(vec2(dx, dy))', 'Threshold it into a mask', 'Mix the original towards black where the mask is 1'], explain: 'Measure differences → strength → mask → apply.', level: 2 },
            { prompt: 'Order the steps of a separable Gaussian blur:', items: ['Render the input texture', 'Pass 1: blur horizontally into a temp texture', 'Pass 2: blur the temp texture vertically', 'Use the result'], explain: 'Two 1D passes = one 2D blur, much cheaper.', level: 3 },
          ],
        },
        {
          id: 'match-bloom', title: 'Match the bloom', engine: 'slider', rounds: 4,
          blurb: 'Set intensity, threshold and spread to match the glow.',
          gen: (rng, level) => {
            const k = rng.step(1, 6, 0.5), t = rng.step(0.55, 0.85, 0.05), r = rng.step(0.008, 0.032, 0.004);
            const params = [{ name: 'k', label: 'intensity', min: 0, max: 8, step: 0.1, target: k }];
            if (level >= 2) params.push({ name: 't', label: 'threshold', min: 0.5, max: 0.9, step: 0.01, target: t });
            if (level === 3) params.push({ name: 'r', label: 'spread', min: 0.004, max: 0.04, step: 0.001, target: r });
            const vals = (p) => [p.k, p.t ?? 0.75, p.r ?? 0.02];
            return {
              prompt: level === 1 ? 'How strong is the bloom?' : level === 2 ? 'Match intensity and threshold.' : 'Match intensity, threshold and spread.',
              sub: 'Threshold: which parts glow at all. Intensity: how strong. Spread: how far it reaches.',
              params,
              build: (p) => { const [a, b, c] = vals(p); return post('col = scene(uv) + bloomBlur(uv, uT, uR) * uK;', { uK: a, uT: b, uR: c }, { defs: BLOOM }); },
              code: (p) => { const [a, b, c] = vals(p); return `vec3 glow = blur(max(c - ${f(b, 2)}, 0.0), ${f(c, 3)});\ncol = c + glow * ${f(a, 1)};`; },
              compare: 'pixels',
              explain: '<p>With a high threshold only the sun glows; lower it and the bright sky starts glowing too. Spread widens the halo.</p>',
            };
          },
        },
        {
          id: 'bloom-math', title: 'Bloom numbers', engine: 'numeric', rounds: 6,
          blurb: 'Compute bright-pass values and the final added colour.',
          gen: (rng, level) => {
            const c = rng.pick([0.5, 0.7, 0.9, 1, 0.95]), t = rng.pick([0.6, 0.8]);
            const bp = Math.max(c - t, 0);
            if (level === 1) return { prompt: `A channel is <b>${c}</b>, threshold <b>${t}</b>. Bright-pass value?`, code: `vec3 b = max(c - ${f(t)}, 0.0);`, answer: +bp.toFixed(4), explain: `<p>max(${c} − ${t}, 0) = <b>${n3(bp)}</b>.${bp === 0 ? ' Below the threshold → no glow from this pixel.' : ''}</p>` };
            const g = rng.pick([0.05, 0.1, 0.2]), k = rng.pick([2, 3, 4]), base = rng.pick([0.3, 0.5, 0.6]);
            if (level === 2) return { prompt: `A pixel's original value is <b>${base}</b>. The blurred glow there is <b>${g}</b>. Intensity ${k}. Final value (no clamping)?`, code: `col = c + glow * ${f(k)};`, answer: +(base + g * k).toFixed(4), explain: `<p>${base} + ${g} × ${k} = <b>${n3(base + g * k)}</b>.</p>` };
            const vals = [rng.pick([0.9, 1]), rng.pick([0.5, 0.7]), rng.pick([0.85, 0.95])];
            const T = 0.8;
            const avg = vals.reduce((s, x) => s + Math.max(x - T, 0), 0) / 3;
            return { prompt: `Threshold ${T}. Three samples of a 3-tap box blur read <b>${vals.join(', ')}</b> from the frame. What is the blurred bright-pass value?`, code: `glow = (b(s1) + b(s2) + b(s3)) / 3.0;  // b(x) = max(x - 0.8, 0.0)`, answer: +avg.toFixed(4), explain: `<p>Bright pass: ${vals.map((x) => n3(Math.max(x - T, 0))).join(', ')}. Average = <b>${n3(avg)}</b>.</p>` };
          },
        },
        {
          id: 'bloom-facts', title: 'Bloom quiz', engine: 'mcq', rounds: 6,
          blurb: 'Concept checks on bloom.',
          questions: [
            q('What does the bright pass do?', ['Keeps only pixels brighter than a threshold', 'Makes the whole image brighter', 'Blurs the image', 'Adds a vignette'], 'It isolates what should glow.'),
            q('Why blur the bright pass?', ['So the glow spreads beyond the bright object', 'To remove noise from the scene', 'To make it cheaper', 'To detect edges'], 'The halo must reach outside the source.'),
            q('Lowering the bloom threshold makes…', ['More of the image glow', 'Less of the image glow', 'The glow wider', 'Nothing change'], 'More pixels pass the threshold.'),
            tf('Bloom is usually computed at full resolution with one huge blur.', false, 'Usually a chain of downsampled textures, each blurred cheaply.'),
            tf('Bloom works best on HDR values, before tonemapping.', true, 'Then "really bright" (> 1) can be told apart from "white-ish".', 2),
            tf('max(c - t, 0.0) avoids a hard cut-off edge around glowing areas.', true, 'Pixels just above the threshold contribute almost nothing, so the glow fades in smoothly.', 2),
            q('Bloom intensity 0 gives…', ['The original image', 'A black image', 'Only the glow', 'A blurred image'], 'c + glow × 0 = c.'),
            q('Which setting makes the halo reach further?', ['Scatter / spread (blur size)', 'Threshold', 'Intensity', 'Saturation'], 'Spread is the blur radius.'),
          ],
        },
      ],
    },
  ],
};
