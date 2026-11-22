// Topic 4 — GLSL language basics: types, constructors, swizzles, component-wise maths,
// built-in function signatures and the GLSL ↔ HLSL ↔ node-graph dictionary.
import { tf, q, distinct, G, f, n, nv, h } from './_kit.js';

// ---------------------------------------------------------------- helpers
// Variables assumed to exist in "does it compile?" style questions.
const CTX = 'float x; int i; bool b; vec2 p; vec3 c; vec4 t;';
const CTX_HTML = `Assume: <code>${CTX}</code>`;
const TYPES = ['float', 'int', 'bool', 'vec2', 'vec3', 'vec4'];
const vecName = (len) => (len === 1 ? 'float' : 'vec' + len);
const fmtVec = (arr) => (arr.length === 1 ? f(arr[0], 2) : `vec${arr.length}(${arr.map((x) => f(x, 2)).join(', ')})`);

/** Type-of-expression pool. lvl = minimum level. */
const EXPRS = [
  { e: 'p.x', t: 'float', lvl: 1, why: 'One component of a vector is a float.' },
  { e: 'c.rg', t: 'vec2', lvl: 1, why: 'Two letters → two components → vec2.' },
  { e: 't.rgb', t: 'vec3', lvl: 1, why: 'Three letters → vec3.' },
  { e: 'p * 2.0', t: 'vec2', lvl: 1, why: 'vec2 × float scales each component → still a vec2.' },
  { e: 'x * 2.0', t: 'float', lvl: 1, why: 'float × float = float.' },
  { e: 'c * x', t: 'vec3', lvl: 1, why: 'vec3 × float → vec3.' },
  { e: 'vec4(c, 1.0)', t: 'vec4', lvl: 1, why: 'The constructor name is the type.' },
  { e: 'x > 0.5', t: 'bool', lvl: 1, why: 'Comparisons give true/false → bool.' },
  { e: 'i + 1', t: 'int', lvl: 1, why: 'int + int = int (no dot in 1).' },
  { e: 'vec3(x)', t: 'vec3', lvl: 1, why: 'vec3(x) copies x into all three slots.' },
  { e: 'p.yx', t: 'vec2', lvl: 2, why: 'Reordered, but still 2 letters → vec2.' },
  { e: 'c.xxxx', t: 'vec4', lvl: 2, why: 'You can repeat letters: 4 letters → vec4.' },
  { e: 'float(i)', t: 'float', lvl: 2, why: 'float(...) converts to float.' },
  { e: 'dot(c, c)', t: 'float', lvl: 2, why: 'dot() always returns ONE number.' },
  { e: 'length(p)', t: 'float', lvl: 2, why: 'A length is one number.' },
  { e: 'texture2D(uTex, p)', t: 'vec4', lvl: 2, why: 'texture2D always returns RGBA → vec4.' },
  { e: 'normalize(c)', t: 'vec3', lvl: 2, why: 'normalize keeps the size: vec3 in, vec3 out.' },
  { e: 'mix(c, t.rgb, 0.5)', t: 'vec3', lvl: 2, why: 'mix of two vec3s is a vec3.' },
  { e: 'p.x + p.y', t: 'float', lvl: 2, why: 'float + float.' },
  { e: 't.a', t: 'float', lvl: 2, why: 'One component → float.' },
  { e: 'step(0.5, p)', t: 'vec2', lvl: 3, why: 'step works per component: a float edge with a vec2 x gives a vec2.' },
  { e: 'floor(x)', t: 'float', lvl: 3, why: 'Trap! floor() returns a float (2.0), not an int.' },
  { e: 'int(x)', t: 'int', lvl: 3, why: 'int(...) converts (and truncates).' },
  { e: 'c.r * p', t: 'vec2', lvl: 3, why: 'float × vec2 → vec2.' },
  { e: 'distance(p, vec2(0.5))', t: 'float', lvl: 3, why: 'A distance is one number.' },
  { e: 'cross(c, c)', t: 'vec3', lvl: 3, why: 'cross of two vec3s is a vec3 (a direction).' },
  { e: 'abs(p - 0.5)', t: 'vec2', lvl: 3, why: 'abs works per component.' },
  { e: 'max(c.r, c.g)', t: 'float', lvl: 3, why: 'max of two floats is a float.' },
  { e: 'c.x < c.y', t: 'bool', lvl: 3, why: 'A comparison of two floats → bool.' },
  { e: 'fract(p * 4.0)', t: 'vec2', lvl: 3, why: 'fract per component → vec2.' },
  { e: 'texture2D(uTex, p).g', t: 'float', lvl: 3, why: 'vec4 → .g picks one float.' },
];

/** "Does it compile?" pool (all verified against WebGL1 / GLSL ES 1.00) */
const COMPILES = [
  { code: 'float k = 0.5;', ok: 1 },
  { code: 'float k = 1;', ok: 0, why: '1 is an int; GLSL ES 1.00 never converts int → float for you.' },
  { code: 'float k = 1.0 / 2;', ok: 0, why: 'float / int — mixed types are not allowed. Write 2.0.' },
  { code: 'float k = .5;', ok: 1, why: '.5 is a valid float literal (but 0.5 reads better).' },
  { code: 'float k = 0.5f;', ok: 0, why: 'The f suffix is an HLSL/C habit; GLSL ES 1.00 rejects it.' },
  { code: 'float a = x + i;', ok: 0, why: 'float + int: convert first, float(i).' },
  { code: 'float a = x + float(i);', ok: 1 },
  { code: 'int n = 3.0;', ok: 0, why: 'A float literal can\'t go into an int.' },
  { code: 'int n = int(x);', ok: 1 },
  { code: 'int n = i * 2;', ok: 1, why: 'int × int is fine.' },
  { code: 'bool q = x;', ok: 0, why: 'No float → bool conversion. Compare: x > 0.0.' },
  { code: 'bool q = x > 0.2;', ok: 1 },
  { code: 'if (x) col = c;', ok: 0, why: 'if needs a bool, not a float.' },
  { code: 'float y = p;', ok: 0, why: 'A vec2 can\'t go into a float. Pick one: p.x.' },
  { code: 'float y = p.x;', ok: 1 },
  { code: 'vec3 v = c * 2;', ok: 0, why: 'vec3 × int — write 2.0.' },
  { code: 'vec3 v = c * 2.0;', ok: 1 },
  { code: 'float k = pow(x, 2);', ok: 0, why: 'pow needs float arguments: pow(x, 2.0).' },
  { code: 'float k = clamp(x, 0, 1);', ok: 0, why: 'clamp(float, int, int) doesn\'t exist. Use 0.0 and 1.0.' },
  { code: 'int k = floor(x);', ok: 0, why: 'floor returns a float. int(floor(x)) or int(x).' },
  { code: 'vec3 v = vec3(1, 0, 0);', ok: 1, why: 'Surprise: constructors DO convert ints. Still, write 1.0 for clarity.' },
  { code: 'float k = 2.0 * float(i);', ok: 1 },
];

const CTORS = [
  { code: 'vec3 v = vec3(0.5);', ok: 1, why: 'One float fills all slots.' },
  { code: 'vec3 v = vec3(p, 0.0);', ok: 1, why: '2 + 1 = 3 components.' },
  { code: 'vec3 v = vec3(x, p);', ok: 1, why: '1 + 2 = 3.' },
  { code: 'vec4 v = vec4(c, 1.0);', ok: 1, why: '3 + 1 = 4.' },
  { code: 'vec4 v = vec4(p, p);', ok: 1, why: '2 + 2 = 4.' },
  { code: 'vec4 v = vec4(p, 0.0, 1.0);', ok: 1, why: '2 + 1 + 1 = 4.' },
  { code: 'vec2 v = vec2(c);', ok: 1, why: 'A single bigger vector gets truncated: keeps c.x, c.y.' },
  { code: 'vec3 v = vec3(t);', ok: 1, why: 'Truncates the vec4: drops t.w.' },
  { code: 'vec3 v = vec3(p);', ok: 0, why: 'Only 2 components for 3 slots — not enough.' },
  { code: 'vec4 v = vec4(c);', ok: 0, why: '3 components for 4 slots — add the alpha: vec4(c, 1.0).' },
  { code: 'vec3 v = vec3(p, 0.0, 1.0);', ok: 0, why: '2 + 1 + 1 = 4: too many arguments for a vec3.' },
  { code: 'vec3 v = vec3(x, x);', ok: 0, why: '2 floats for 3 slots. Use vec3(x) or vec3(x, x, x).' },
  { code: 'vec2 v = vec2(1.0, 2.0, 3.0);', ok: 0, why: 'Too many arguments.' },
  { code: 'vec4 v = vec4(p.x, p.y, x);', ok: 0, why: 'Only 3 floats for a vec4.' },
  { code: 'vec3 v = vec3(c.xy, t.w);', ok: 1, why: '2 + 1 = 3.' },
  { code: 'vec4 v = vec4(c.xy, t.zw);', ok: 1, why: '2 + 2 = 4.' },
  { code: 'vec3 v = t;', ok: 0, why: 'No automatic truncation in assignments: write t.rgb or vec3(t).' },
  { code: 'vec2 v = c;', ok: 0, why: 'vec3 into vec2: use c.xy.' },
];

const SWIZ_COMPILE = [
  { code: 'float s = c.z;', ok: 1 },
  { code: 'float s = p.z;', ok: 0, why: 'A vec2 only has x and y.' },
  { code: 'float s = c.w;', ok: 0, why: 'A vec3 has no 4th component.' },
  { code: 'vec4 q = t.wzyx;', ok: 1, why: 'Any order is fine.' },
  { code: 'vec2 q = t.xg;', ok: 0, why: 'Can\'t mix name sets (xyzw with rgba).' },
  { code: 'vec3 q = c.stp;', ok: 1, why: 'stpq is a third name set (texture coords).' },
  { code: 'vec4 q = c.xxxx;', ok: 1, why: 'Repeats are fine when reading.' },
  { code: 'vec4 q = c.xyzxy;', ok: 0, why: 'Max 4 letters.' },
  { code: 'c.xx = vec2(1.0);', ok: 0, why: 'Can\'t write the same slot twice in one assignment.' },
  { code: 'c.xz = vec2(1.0);', ok: 1, why: 'Writes x and z, leaves y alone.' },
  { code: 'c.xy = 1.0;', ok: 0, why: 'Left side is a vec2, right side a float. Use vec2(1.0).' },
  { code: 'c.r = p;', ok: 0, why: 'One slot can\'t take a vec2.' },
  { code: 'p.yx = p;', ok: 1, why: 'Swaps x and y — a handy trick.' },
  { code: 'vec3 q = c.rgba;', ok: 0, why: 'c is a vec3: no alpha.' },
  { code: 'vec3 q = c.zyx.xxy;', ok: 1, why: 'Swizzles can be chained.' },
  { code: 'float q = t.q;', ok: 1, why: 'q = the 4th slot in the stpq set.' },
  { code: 'col.rg = uv;', ok: 1 },
];

const FN_COMPILE = [
  { code: 'float d = length(p);', ok: 1 },
  { code: 'vec2 d = length(p);', ok: 0, why: 'length returns a float.' },
  { code: 'float d = dot(c, c);', ok: 1 },
  { code: 'float d = dot(p, c);', ok: 0, why: 'dot needs two vectors of the SAME size.' },
  { code: 'vec3 n = normalize(c);', ok: 1 },
  { code: 'float n = normalize(c);', ok: 0, why: 'normalize returns a vector of the same size.' },
  { code: 'vec4 s = texture2D(uTex, p);', ok: 1 },
  { code: 'vec3 s = texture2D(uTex, p);', ok: 0, why: 'texture2D returns a vec4. Add .rgb.' },
  { code: 'vec3 s = texture2D(uTex, c);', ok: 0, why: 'A 2D texture needs vec2 coordinates.' },
  { code: 'vec3 m = mix(c, vec3(1.0), x);', ok: 1, why: 't may be a float even when a and b are vectors.' },
  { code: 'vec3 m = mix(c, 1.0, x);', ok: 0, why: 'a and b must be the same type (vec3 and vec3).' },
  { code: 'vec3 k = clamp(c, 0.0, 1.0);', ok: 1, why: 'min/max may be floats for a vector x.' },
  { code: 'vec2 s = step(0.5, p);', ok: 1, why: 'Float edge, vector x → per-component.' },
  { code: 'float s = step(p, 0.5);', ok: 0, why: 'The edge may be a float only when x is a float too (or edge is the vector).' },
  { code: 'vec3 m = max(c, 0.0);', ok: 1 },
  { code: 'float m = max(c, 0.0);', ok: 0, why: 'max(vec3, float) returns a vec3.' },
  { code: 'vec3 r = cross(c, c);', ok: 1 },
  { code: 'vec2 r = cross(p, p);', ok: 0, why: 'cross only exists for vec3.' },
  { code: 'float a = atan(p.y, p.x);', ok: 1, why: 'GLSL\'s two-argument atan (HLSL calls it atan2).' },
  { code: 'float a = atan2(p.y, p.x);', ok: 0, why: 'atan2 is HLSL. GLSL uses atan(y, x).' },
  { code: 'vec2 s = smoothstep(0.0, 1.0, p);', ok: 1 },
  { code: 'float q = mod(x, 2.0);', ok: 1 },
];

// GLSL ↔ HLSL ↔ nodes dictionary
const DICT = [
  { glsl: 'mix(a, b, t)', hlsl: 'lerp(a, b, t)', ue: 'Lerp (LinearInterpolate)', unity: 'Lerp' },
  { glsl: 'fract(x)', hlsl: 'frac(x)', ue: 'Frac', unity: 'Fraction' },
  { glsl: 'clamp(x, 0.0, 1.0)', hlsl: 'saturate(x)', ue: 'Saturate', unity: 'Saturate' },
  { glsl: 'texture2D(tex, uv)', hlsl: 'tex.Sample(samp, uv)', ue: 'TextureSample', unity: 'Sample Texture 2D' },
  { glsl: 'vec3', hlsl: 'float3', ue: 'Constant3Vector', unity: 'Vector 3' },
  { glsl: 'atan(y, x)', hlsl: 'atan2(y, x)', ue: 'Arctangent2', unity: 'Arctangent2' },
  { glsl: 'dFdx(v)', hlsl: 'ddx(v)', ue: 'DDX', unity: 'DDX' },
  { glsl: 'inversesqrt(x)', hlsl: 'rsqrt(x)', ue: '(1 / Sqrt)', unity: 'Reciprocal Square Root' },
  { glsl: '1.0 - x', hlsl: '1 - x', ue: 'OneMinus', unity: 'One Minus' },
  { glsl: 'mat3', hlsl: 'float3x3', ue: '(Transform node)', unity: 'Matrix 3x3' },
  { glsl: 'M * v', hlsl: 'mul(M, v)', ue: 'Transform', unity: 'Multiply (matrix)' },
  { glsl: 'vec4(c, 1.0)', hlsl: 'float4(c, 1)', ue: 'AppendVector', unity: 'Combine' },
  { glsl: 'c.rg', hlsl: 'c.rg', ue: 'ComponentMask', unity: 'Swizzle / Split' },
  { glsl: 'dot(a, b)', hlsl: 'dot(a, b)', ue: 'Dot', unity: 'Dot Product' },
  { glsl: 'pow(x, y)', hlsl: 'pow(x, y)', ue: 'Power', unity: 'Power' },
  { glsl: 'smoothstep(a, b, x)', hlsl: 'smoothstep(a, b, x)', ue: 'SmoothStep', unity: 'Smoothstep' },
  { glsl: 'gl_FragColor = …', hlsl: 'return …; // : SV_Target', ue: 'Base Color / Emissive pin', unity: 'Fragment output (Base Color)' },
];

/** Shuffle a bucket pool and convert to bucket items */
function compileCards(rng, pool, count = 10) {
  return rng.pickN(pool, Math.min(count, pool.length)).map((x) => ({ code: x.code, bucket: x.ok ? 0 : 1, why: x.why }));
}

/** a vector with distinct, easy component values */
function easyVec(rng, len, level) {
  const vals = level === 1 ? [0, 0.5, 1, 2] : [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2];
  return rng.pickN(vals, len);
}

const SETS = { xyzw: 'xyzw', rgba: 'rgba' };
function randSwizzle(rng, size, len, allowRepeat) {
  const set = rng.chance(0.5) ? SETS.xyzw : SETS.rgba;
  const letters = set.slice(0, size).split('');
  let s = '';
  const used = new Set();
  for (let i = 0; i < len; i++) {
    let l; do { l = rng.pick(letters); } while (!allowRepeat && used.has(l) && used.size < letters.length);
    used.add(l); s += l;
  }
  return s;
}
const swz = (vec, s) => s.split('').map((ch) => vec['xyzwrgba'.indexOf(ch) % 4]);

export default {
  id: 'glsl',
  title: 'GLSL language basics',
  icon: '🔤',
  blurb: 'Types, constructors, swizzles, vector maths, built-ins — and their HLSL/node names.',
  cheatsheet: `
<p><b>Types</b>: <code>float</code> (1.0), <code>int</code> (1), <code>bool</code>, <code>vec2/3/4</code>, <code>mat2/3/4</code>, <code>sampler2D</code>. In GLSL ES 1.00 <b>int never auto-converts to float</b>: write <code>2.0</code>, not <code>2</code>.</p>
<pre class="code">vec3(0.5)          // (0.5, 0.5, 0.5)
vec3(uv, 0.0)      // 2 + 1 = 3 components
vec4(col, 1.0)     // 3 + 1 = 4
c.rgb  c.xy  c.zyx  c.xxx   // swizzles (same set only)
col.rg = uv;               // write to some slots</pre>
<p><b>Maths is per component</b>: <code>a * b</code> multiplies slot by slot (NOT a dot product). <code>vec * float</code> scales all.</p>
<p><b>Built-ins</b>: <code>genType</code> = float or vecN, same in → same out. <code>length, distance, dot</code> → float. <code>texture2D</code> → vec4. Argument order: <code>step(edge, x)</code>, <code>mix(a, b, t)</code>, <code>clamp(x, lo, hi)</code>, <code>smoothstep(e0, e1, x)</code>.</p>
<p><b>HLSL</b>: vec3→float3, mix→lerp, fract→frac, clamp01→saturate, texture2D→tex.Sample / tex2D, atan(y,x)→atan2, dFdx→ddx, M*v→mul(M,v).</p>`,
  concepts: [
    // ==================================================================
    {
      id: 'glsl.types',
      title: 'Types & the 1.0 rule',
      blurb: 'float, int, bool, vec2/3/4 — and why 1 is not 1.0.',
      lesson: [
        {
          title: 'Every value has a type',
          body: `<p>In GLSL every variable has a <b>type</b> that says what kind of value it holds. You must say it when you create the variable:</p>
<pre class="code">float k = 0.5;          // one decimal number
int   n = 3;            // one whole number
bool  on = true;        // true or false
vec2  p = vec2(0.2, 0.7);       // 2 floats
vec3  c = vec3(1.0, 0.5, 0.0);  // 3 floats
vec4  t = vec4(c, 1.0);         // 4 floats</pre>
<div class="analogy">📦 <b>Analogy:</b> a type is the shape of a box. A <code>float</code> box holds one number; a <code>vec3</code> is a tray with 3 cups. You can't pour a 3-cup tray into a 1-cup box.</div>`,
        },
        {
          title: '1 is not 1.0',
          body: `<p>This is the #1 beginner error. In GLSL (WebGL 1 / GLSL ES 1.00):</p>
<ul><li><code>1</code> is an <b>int</b></li><li><code>1.0</code> (or <code>1.</code>) is a <b>float</b></li></ul>
<p>And the compiler <b>never converts between them for you</b>. So these all fail:</p>
<pre class="code">float k = 1;        // ✗ int into float
uv.x * 2            // ✗ float × int
pow(x, 2)           // ✗ pow(float, int) doesn't exist</pre>
<div class="note">Fix: always write the dot. <code>2.0</code>, <code>0.0</code>, <code>1.0</code>. If you really have an int variable, convert it: <code>float(i)</code>.</div>
<div class="tip">HLSL (Unity/Unreal) is relaxed and converts silently — so this habit bites people moving to GLSL. The <code>f</code> suffix (<code>0.5f</code>) is also <b>not</b> allowed in GLSL ES 1.00.</div>`,
          quiz: { q: 'Which line compiles?', options: ['float a = 2.0 * 3.0;', 'float a = 2.0 * 3;', 'float a = 6;'], answer: 0, explain: 'Only float × float. The others mix in an int.' },
        },
        {
          title: 'See the error yourself',
          body: `<p>The shader below works with <code>2.0</code>. Write <code>2</code> instead and WebGL refuses to compile it. This is the real error message you'd get:</p>`,
          shader: { frag: 'col = vec3(uv.x * 2.0 - 0.5);' },
          caption: 'with 2.0 ✓',
          code: '// try it in the Playground:\ncol = vec3(uv.x * 2 - 0.5);\n// ERROR: \'*\' : wrong operand types - no operation \'*\' exists\n//        that takes a left-hand operand of type \'float\'\n//        and a right operand of type \'const int\'',
          after: '<p>Read errors calmly: "wrong operand types … float … int" = you mixed a float and an int. Find the number without a dot.</p>',
        },
        {
          title: 'bool and comparisons',
          body: `<p>Comparisons (<code>&gt; &lt; == &gt;= &lt;=</code>) produce a <b>bool</b>. <code>if</code> needs a bool — not a number:</p>
<pre class="code">bool right = uv.x > 0.5;   // ✓
if (right) col = vec3(1.0);
if (uv.x) …               // ✗ a float is not a bool</pre>
<p>To use a bool as a number, convert it: <code>float(right)</code> gives 1.0 or 0.0. Shader people often skip the bool altogether and use <code>step()</code>, which returns 0.0/1.0 directly.</p>`,
          controls: [{ name: 't', label: 'threshold', min: 0, max: 1, step: 0.05, value: 0.5 }],
          shader: (x) => ({ frag: 'bool right = uv.x > uT;\ncol = vec3(float(right));', uniforms: { uT: x.t } }),
          code: (x) => `bool right = uv.x > ${f(x.t, 2)};\ncol = vec3(float(right)); // true → 1.0, false → 0.0`,
        },
        {
          title: 'Vectors are just bundles of floats',
          body: `<p><code>vec2</code>, <code>vec3</code>, <code>vec4</code> hold 2, 3 or 4 floats. The GPU doesn't care whether they mean a position, a colour or a direction — that's up to you.</p>
<ul><li><code>vec2</code>: uv, 2D positions, offsets</li><li><code>vec3</code>: RGB colours, 3D positions, normals</li><li><code>vec4</code>: RGBA colours, texture results</li></ul>
<p>Sizes must match: you can't add a <code>vec3</code> to a <code>vec2</code>. But a single <code>float</code> combines with any vector (it applies to every component).</p>`,
          quiz: { q: 'What type would you use for an RGBA colour?', options: ['vec4', 'vec3', 'float', 'int'], answer: 0, explain: '4 numbers: red, green, blue, alpha.' },
        },
      ],
      games: [
        {
          id: 'compiles', title: 'Does it compile?', engine: 'buckets', rounds: 2,
          blurb: 'Sort lines into "compiles" and "error" — mostly about int vs float.',
          gen: (rng) => ({
            prompt: 'Will this line compile in GLSL ES 1.00?',
            sub: CTX_HTML,
            buckets: ['✅ Compiles', '💥 Error'],
            items: compileCards(rng, COMPILES, 10),
            explain: '<p>Rule of thumb: every number that should be a float needs a dot, and both sides of + − × ÷ must be the same type (or one of them a single float with a vector).</p>',
          }),
        },
        {
          id: 'type-of', title: 'What type is it?', engine: 'mcq', rounds: 8,
          blurb: 'Look at an expression and name its type.',
          gen: (rng, level) => {
            const ex = rng.pick(EXPRS.filter((x) => x.lvl <= level && (level < 3 || x.lvl >= 2)));
            const others = rng.shuffle(TYPES.filter((t) => t !== ex.t)).slice(0, 3);
            return {
              prompt: 'What is the type of this expression?',
              sub: CTX_HTML,
              code: ex.e,
              options: [ex.t, ...others].map((t) => ({ code: t })),
              grid: true,
              explain: `<p><code>${ex.e}</code> is a <b>${ex.t}</b>. ${ex.why}</p>`,
            };
          },
        },
        {
          id: 'fix-literal', title: 'Fix the number', engine: 'codefill', rounds: 4,
          blurb: 'Choose the literal that compiles and matches the target.',
          gen: (rng) => {
            const variants = [
              { template: 'col = vec3(uv.x * [[0]]);', slots: [{ options: ['2.0', '2', '2f', '"2"'], answer: '2.0' }], body: (v) => `col = vec3(uv.x * ${v[0]});`, explain: '<code>2</code> is an int and <code>2f</code> isn\'t GLSL. <code>2.0</code> (or <code>2.</code>) is a float.' },
              { template: 'float k = [[0]];\ncol = vec3(step(k, uv.x));', slots: [{ options: ['0.5', '1/2', '0.5f', 'half'], answer: '0.5' }], body: (v) => `float k = ${v[0]};\ncol = vec3(step(k, uv.x));`, explain: '<code>1/2</code> is integer division of two ints (= 0, and still an int!). <code>0.5f</code> is HLSL-style. <code>half</code> is an HLSL type, not a value.' },
              { template: 'col = vec3(pow(uv.x, [[0]]));', slots: [{ options: ['3.0', '3', 'int(3)', 'vec2(3.0)'], answer: '3.0' }], body: (v) => `col = vec3(pow(uv.x, ${v[0]}));`, explain: 'pow(float, float) — both arguments must be floats of the same type as x.' },
              { template: 'int n = 4;\ncol = vec3(fract(uv.x * [[0]]));', slots: [{ options: ['float(n)', 'n', 'n.0', 'int(n)'], answer: 'float(n)' }], body: (v) => `int n = 4;\ncol = vec3(fract(uv.x * ${v[0]}));`, explain: 'An int variable must be converted: <code>float(n)</code>. <code>n.0</code> is not a thing.' },
              { template: 'if (uv.y > [[0]]) col = vec3(1.0);', slots: [{ options: ['0.25', '1/4', 'true', '0.25f'], answer: '0.25' }], body: (v) => `if (uv.y > ${v[0]}) col = vec3(1.0);`, explain: 'Compare a float with a float. <code>1/4</code> is int division and an int.' },
            ];
            const vr = rng.pick(variants);
            return {
              prompt: 'Pick the token that compiles and matches the target:',
              sub: 'Try a wrong one first and read the error in "Yours"!',
              template: vr.template, slots: vr.slots,
              build: (vals) => ({ frag: vr.body(vals) }),
              explain: `<p>${vr.explain}</p>`,
            };
          },
        },
        {
          id: 'type-facts', title: 'Type rules', engine: 'mcq', rounds: 7,
          blurb: 'True/false about GLSL types.',
          questions: [
            tf('In GLSL ES 1.00, <code>float a = 1;</code> compiles.', false, '1 is an int; no automatic conversion. Write 1.0.'),
            tf('<code>2.</code> is a valid float literal.', true, 'A trailing dot makes it a float. <code>.5</code> also works.'),
            tf('<code>floor(2.7)</code> returns the int 2.', false, 'floor returns a float: 2.0.'),
            tf('A <code>vec3</code> can be multiplied by a <code>float</code>.', true, 'The float scales every component.'),
            tf('A <code>vec3</code> can be added to a <code>vec2</code>.', false, 'Sizes must match.'),
            tf('<code>if (x)</code> works when x is a float.', false, 'if needs a bool. Use if (x > 0.0).'),
            tf('<code>float(i)</code> converts an int to a float.', true, 'Constructor-style conversion.'),
            tf('<code>0.5f</code> is valid GLSL ES 1.00.', false, 'The f suffix is C/HLSL. GLSL ES 1.00 rejects it.', 2),
            q('Which is a float?', [{ code: '3.0' }, { code: '3' }, { code: 'true' }, { code: 'vec2(3.0)' }], 'Floats have a dot.'),
            q('<code>1 / 2</code> in GLSL equals…', ['0 (int division)', '0.5', 'An error always'], 'int / int = int, rounded towards 0. Writing it into a float is then an error.', { level: 2 }),
            q('Why is HLSL code often "sloppier" about 1 vs 1.0?', ['HLSL converts ints to floats implicitly', 'HLSL has no ints', 'HLSL runs on the CPU'], 'HLSL allows implicit conversion; GLSL ES 1.00 doesn\'t.', { level: 2 }),
            tf('<code>vec3(1, 0, 0)</code> compiles.', true, 'Constructors are the exception: they convert their arguments. Still nicer to write 1.0.', 3),
          ],
        },
      ],
    },
    // ==================================================================
    {
      id: 'glsl.ctor',
      title: 'Constructors',
      blurb: 'Build vectors from pieces: vec3(0.5), vec3(uv, 0.0), vec4(col, 1.0).',
      lesson: [
        {
          title: 'Building a vector',
          body: `<p>A <b>constructor</b> builds a vector. It's the type name used like a function:</p>
<pre class="code">vec3 c = vec3(1.0, 0.5, 0.2); // one value per slot</pre>
<p>Move the sliders: each argument fills one slot, in order.</p>`,
          controls: [
            { name: 'a', label: '1st argument → .x / .r', min: 0, max: 1, step: 0.05, value: 1 },
            { name: 'b', label: '2nd argument → .y / .g', min: 0, max: 1, step: 0.05, value: 0.5 },
            { name: 'c', label: '3rd argument → .z / .b', min: 0, max: 1, step: 0.05, value: 0.2 },
          ],
          shader: (x) => ({ frag: 'col = uC;', uniforms: { uC: [x.a, x.b, x.c] } }),
          code: (x) => `vec3 c = vec3(${f(x.a, 2)}, ${f(x.b, 2)}, ${f(x.c, 2)});`,
        },
        {
          title: 'One value fills all',
          body: `<p>Give a constructor <b>one</b> float and it copies it into <b>every</b> slot:</p>
<pre class="code">vec3(0.5)  ==  vec3(0.5, 0.5, 0.5)   // grey
vec2(1.0)  ==  vec2(1.0, 1.0)</pre>
<p>That's why <code>col = vec3(uv.x)</code> makes a grey gradient: the same value goes to red, green and blue.</p>`,
          controls: [{ name: 'g', label: 'value', min: 0, max: 1, step: 0.05, value: 0.5 }],
          shader: (x) => ({ frag: 'col = vec3(uK);', uniforms: { uK: x.g } }),
          code: (x) => `col = vec3(${f(x.g, 2)}); // = vec3(${f(x.g, 2)}, ${f(x.g, 2)}, ${f(x.g, 2)})`,
        },
        {
          title: 'Mixing pieces: count the slots',
          body: `<p>You can pass vectors as arguments. Their components are poured in, in order. The only rule: <b>the total must be exactly right</b>.</p>
<pre class="code">vec3(uv, 0.0)      // 2 + 1 = 3 ✓  (uv.x, uv.y, 0.0)
vec3(0.0, uv)      // 1 + 2 = 3 ✓  (0.0, uv.x, uv.y)
vec4(col, 1.0)     // 3 + 1 = 4 ✓
vec4(uv, uv)       // 2 + 2 = 4 ✓
vec3(uv)           // 2     ✗ not enough
vec3(uv, 0.0, 1.0) // 4     ✗ too many</pre>
<div class="analogy">🧱 <b>Analogy:</b> LEGO. A vec3 is a 3-stud gap. Fill it with a 2-stud brick + a 1-stud brick, or three 1-studs. No gaps, no overhang.</div>`,
          shaders: [
            { spec: { frag: 'col = vec3(uv, 0.0);' }, label: '<code>vec3(uv, 0.0)</code>' },
            { spec: { frag: 'col = vec3(0.0, uv);' }, label: '<code>vec3(0.0, uv)</code>' },
          ],
          quiz: { q: 'Which constructor is valid?', options: ['vec4(uv, 0.0, 1.0)', 'vec4(uv, 1.0)', 'vec3(uv, uv)'], answer: 0, explain: '2 + 1 + 1 = 4. The others give 3 for a vec4 and 4 for a vec3.' },
        },
        {
          title: 'Adding alpha: vec4(col, 1.0)',
          body: `<p>The final output <code>gl_FragColor</code> is a <b>vec4</b> (RGBA). So the last line of a fragment shader is almost always:</p>
<pre class="code">gl_FragColor = vec4(col, 1.0);  // 3 colour + 1 alpha</pre>
<p>Going the other way — dropping components — use a swizzle (<code>t.rgb</code>) or a constructor with <b>one bigger vector</b>, which truncates: <code>vec3(t)</code> keeps x, y, z.</p>
<div class="tip">Unreal's <b>AppendVector</b> node and Unity's <b>Combine</b> node are constructors. Unreal's ComponentMask / Unity's Split go the other way.</div>`,
        },
      ],
      games: [
        {
          id: 'ctor-result', title: 'What\'s inside?', engine: 'numeric', rounds: 6,
          blurb: 'Work out the components a constructor produces.',
          gen: (rng, level) => {
            const a = rng.pick([0.2, 0.3, 0.4, 0.6, 0.7]);
            const p = rng.pickN([0.1, 0.25, 0.5, 0.75, 0.9], 2);
            const c = rng.pickN([0.1, 0.2, 0.4, 0.6, 0.8, 1], 3);
            const kinds = level === 1 ? [
              () => ({ code: `vec3 v = vec3(${f(a)});`, ans: [a, a, a], why: 'One float fills all three slots.' }),
              () => ({ code: `vec2 uv = ${fmtVec(p)};\nvec3 v = vec3(uv, 0.0);`, ans: [...p, 0], why: 'uv gives the first two slots, 0.0 the third.' }),
              () => ({ code: `vec3 col = ${fmtVec(c)};\nvec4 v = vec4(col, 1.0);`, ans: [...c, 1], why: 'col fills r, g, b; 1.0 is alpha.' }),
            ] : level === 2 ? [
              () => ({ code: `vec2 uv = ${fmtVec(p)};\nvec3 v = vec3(${f(a)}, uv);`, ans: [a, ...p], why: 'Arguments are poured in order: first the float, then uv.x, uv.y.' }),
              () => ({ code: `vec2 uv = ${fmtVec(p)};\nvec4 v = vec4(uv, uv);`, ans: [...p, ...p], why: '2 + 2 = 4: uv twice.' }),
              () => ({ code: `vec2 uv = ${fmtVec(p)};\nvec4 v = vec4(uv.y, 0.0, uv.x, 1.0);`, ans: [p[1], 0, p[0], 1], why: 'Each argument is one slot here, in the order written.' }),
              () => ({ code: `vec3 col = ${fmtVec(c)};\nvec2 v = vec2(col);`, ans: [c[0], c[1]], why: 'A single bigger vector is truncated: the first two components are kept.' }),
            ] : [
              () => ({ code: `vec3 col = ${fmtVec(c)};\nvec4 v = vec4(col.b, col.rg, ${f(a)});`, ans: [c[2], c[0], c[1], a], why: '1 (col.b) + 2 (col.rg) + 1 = 4.' }),
              () => ({ code: `vec2 uv = ${fmtVec(p)};\nvec3 v = vec3(uv.yx, uv.x);`, ans: [p[1], p[0], p[0]], why: 'uv.yx is (uv.y, uv.x), then uv.x again.' }),
              () => ({ code: `vec4 t = vec4(${c.map((x) => f(x)).join(', ')}, ${f(a)});\nvec3 v = vec3(t.a, t.rg);`, ans: [a, c[0], c[1]], why: 'alpha first, then red and green.' }),
              () => ({ code: `vec3 v = vec3(vec2(${f(a)}), ${f(p[0])});`, ans: [a, a, p[0]], why: 'vec2(a) is (a, a); then the last float.' }),
            ];
            const k = rng.pick(kinds)();
            return { prompt: 'What is <code>v</code>?', code: k.code, answer: k.ans, wrap: vecName(k.ans.length), explain: `<p>${k.why} → <code>${fmtVec(k.ans)}</code></p>` };
          },
        },
        {
          id: 'ctor-compiles', title: 'Count the slots', engine: 'buckets', rounds: 2,
          blurb: 'Valid constructor or not? Count the components.',
          gen: (rng) => ({
            prompt: 'Does this constructor compile?',
            sub: CTX_HTML,
            buckets: ['✅ Compiles', '💥 Error'],
            items: compileCards(rng, CTORS, 10),
            explain: '<p>Add up the components of the arguments: it must exactly match the vector size. Exception: a single bigger vector may be truncated (<code>vec2(c)</code>).</p>',
          }),
        },
        {
          id: 'ctor-fill', title: 'Build the colour', engine: 'codefill', rounds: 5,
          blurb: 'Fill a constructor so the picture matches the target.',
          gen: (rng, level) => {
            const variants = [
              { template: 'col = vec3([[0]], [[1]]);', opts: [['uv', '0.0', 'uv.x', '1.0'], ['0.0', '1.0', 'uv', 'uv.y']], targets: [['uv', '0.0'], ['uv', '1.0'], ['0.0', 'uv'], ['1.0', 'uv']] },
              { template: 'col = vec3([[0]]);', opts: [['uv.x', 'uv', 'vec2(uv.x)', 'uv.y']], targets: [['uv.x'], ['uv.y']] },
              { template: 'col = vec3(uv.y, [[0]]);', opts: [['uv', 'uv.x', '0.0', 'uv.yx']], targets: [['uv'], ['uv.yx']] },
              { template: 'vec4 c = vec4([[0]], [[1]]);\ncol = c.rgb;', opts: [['uv', 'uv.x', 'vec3(uv, 0.0)', '1.0'], ['0.5, 1.0', '1.0', 'uv', '0.0, 0.0']], targets: [['uv', '0.5, 1.0'], ['uv', 'uv'], ['vec3(uv, 0.0)', '1.0']] },
            ];
            const vr = rng.pick(level === 1 ? variants.slice(0, 2) : variants);
            const t = rng.pick(vr.targets);
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Fill the blanks so "Yours" matches the target:',
              sub: 'Wrong component counts show a compile error.',
              template: vr.template,
              slots: vr.opts.map((o, i) => ({ options: o, answer: t[i] })),
              build: (vals) => ({ frag: fill(vals) }),
              explain: '<p>Count components: vec3 needs exactly 3, vec4 exactly 4. Then check which colour channel each piece lands in (1st → red, 2nd → green, 3rd → blue).</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'glsl.swizzle',
      title: 'Swizzling',
      blurb: '.xy, .rgb, .zyx, .xxx — pick, reorder and repeat components.',
      lesson: [
        {
          title: 'Names for the slots',
          body: `<p>A vector's slots have names. There are <b>three sets</b> of names for the same slots:</p>
<pre class="code">slot:   0   1   2   3
xyzw:   x   y   z   w    // positions
rgba:   r   g   b   a    // colours
stpq:   s   t   p   q    // texture coords (rare)</pre>
<p><code>c.r</code> and <code>c.x</code> are the <b>same</b> number. Use whichever reads better.</p>
<div class="analogy">🪑 <b>Analogy:</b> a row of 4 seats. Each seat has a number (0–3) and two nametags (x/r, y/g, z/b, w/a).</div>`,
        },
        {
          title: 'Pick several at once',
          body: `<p>Write several letters to get a smaller (or equal) vector back. This is a <b>swizzle</b>:</p>
<pre class="code">vec4 t = vec4(0.1, 0.2, 0.3, 0.4);
t.xy    // vec2(0.1, 0.2)
t.rgb   // vec3(0.1, 0.2, 0.3)
t.a     // 0.4</pre>
<p>The number of letters = the size of the result. <code>texture2D(...).rgb</code> is a swizzle you'll write thousands of times.</p>`,
          quiz: { q: 'vec4 t = vec4(0.1, 0.2, 0.3, 0.4). What is <code>t.ba</code>?', options: ['vec2(0.3, 0.4)', 'vec2(0.1, 0.2)', '0.7'], answer: 0, explain: 'b = slot 2 (0.3), a = slot 3 (0.4).' },
        },
        {
          title: 'Reorder and repeat',
          body: `<p>Letters can come in <b>any order</b> and can <b>repeat</b>:</p>
<pre class="code">c.bgr   // reversed: (c.b, c.g, c.r)
c.rrr   // (c.r, c.r, c.r) → greyscale of red
uv.yx   // swapped</pre>
<p>Pick a swizzle for the photo below:</p>`,
          controls: [{ name: 's', label: '0 rgb · 1 bgr · 2 gbr · 3 rrr · 4 ggg · 5 brg', min: 0, max: 5, step: 1, value: 1 }],
          shader: (x) => ({ frag: `vec3 c = texture2D(uTex, uv).rgb;\ncol = c.${['rgb', 'bgr', 'gbr', 'rrr', 'ggg', 'brg'][x.s]};`, textures: { uTex: 'photo' } }),
          code: (x) => `vec3 c = texture2D(uTex, uv).rgb;\ncol = c.${['rgb', 'bgr', 'gbr', 'rrr', 'ggg', 'brg'][x.s]};\n// red   ← c.${['rgb', 'bgr', 'gbr', 'rrr', 'ggg', 'brg'][x.s][0]}\n// green ← c.${['rgb', 'bgr', 'gbr', 'rrr', 'ggg', 'brg'][x.s][1]}\n// blue  ← c.${['rgb', 'bgr', 'gbr', 'rrr', 'ggg', 'brg'][x.s][2]}`,
        },
        {
          title: 'Writing to a swizzle',
          body: `<p>You can also <b>assign</b> to some slots and leave the rest alone:</p>
<pre class="code">vec3 col = vec3(0.0);
col.rg = uv;      // red = uv.x, green = uv.y, blue untouched
col.b  = 1.0;     // now blue = 1</pre>
<p>When writing, each letter may appear <b>only once</b> (<code>col.rr = …</code> is an error — which value would win?).</p>`,
          shaders: [
            { spec: { frag: 'col.rg = uv;' }, label: '<code>col.rg = uv;</code>' },
            { spec: { frag: 'col.gb = uv;' }, label: '<code>col.gb = uv;</code>' },
          ],
        },
        {
          title: 'The rules',
          body: `<ul>
<li>Max <b>4</b> letters.</li>
<li>Only letters that exist: a <code>vec2</code> has no <code>.z</code>, a <code>vec3</code> has no <code>.w</code>/<code>.a</code>.</li>
<li><b>Don't mix sets</b>: <code>c.xg</code> is an error.</li>
<li>No repeats when <b>writing</b>.</li></ul>
<div class="tip">Unreal: <b>ComponentMask</b> (pick channels) and <b>AppendVector</b>. Unity Shader Graph: <b>Swizzle</b> node ("bgr"), <b>Split</b> and <b>Combine</b>. HLSL swizzles are identical to GLSL.</div>`,
          quiz: { q: 'Which is valid for <code>vec3 c</code>?', options: ['c.zzy', 'c.rgba', 'c.xg', 'c.w'], answer: 0, explain: 'Repeats are fine when reading. rgba/w need 4 components; xg mixes sets.' },
        },
      ],
      games: [
        {
          id: 'swizzle-calc', title: 'Swizzle calculator', engine: 'numeric', rounds: 6,
          blurb: 'Type the vector a swizzle produces.',
          gen: (rng, level) => {
            const size = level === 1 ? rng.pick([2, 3]) : rng.pick([3, 4]);
            const vec = easyVec(rng, size, level);
            const decl = `${vecName(size)} a = ${fmtVec(vec)};`;
            if (level === 3 && rng.chance(0.4)) {
              // write swizzle
              const len = 2;
              const tgt = randSwizzle(rng, 3, len, false);
              const src = rng.pickN([0.1, 0.5, 0.9, 1], 2);
              const res = [0, 0, 0];
              tgt.split('').forEach((ch, i) => { res['xyzwrgba'.indexOf(ch) % 4] = src[i]; });
              return { prompt: 'What is <code>v</code> after these lines?', code: `vec3 v = vec3(0.0);\nv.${tgt} = ${fmtVec(src)};`, answer: res, wrap: 'vec3', explain: `<p>The 1st value goes to <b>${tgt[0]}</b>, the 2nd to <b>${tgt[1]}</b>; the other slot stays 0 → <code>${fmtVec(res)}</code>.</p>` };
            }
            let s;
            if (level === 1) s = rng.pick(size === 2 ? ['x', 'y', 'yx', 'xy'] : ['x', 'z', 'xy', 'yz', 'b', 'rg', 'gb']);
            else if (level === 2) s = randSwizzle(rng, size, rng.pick([2, 3]), true);
            else s = randSwizzle(rng, size, rng.pick([3, 4]), true);
            let code = `${decl}\n? = a.${s};`, res = swz(vec, s);
            if (level === 3 && rng.chance(0.5)) {
              const s2 = randSwizzle(rng, s.length, 2, true);
              code = `${decl}\n? = a.${s}.${s2};`;
              res = swz(res, s2.replace(/[rgba]/g, (ch) => 'xyzw'['rgba'.indexOf(ch)]));
            }
            return {
              prompt: 'What does the swizzle give?',
              code,
              answer: res, wrap: res.length > 1 ? vecName(res.length) : undefined,
              explain: `<p>Slots: x/r = ${n(vec[0])}, y/g = ${n(vec[1])}${size > 2 ? `, z/b = ${n(vec[2])}` : ''}${size > 3 ? `, w/a = ${n(vec[3])}` : ''}. Read the letters left to right → <code>${fmtVec(res)}</code>.</p>`,
            };
          },
        },
        {
          id: 'swizzle-legal', title: 'Legal swizzle?', engine: 'buckets', rounds: 2,
          blurb: 'Valid or compile error? Sets, sizes and write rules.',
          gen: (rng) => ({
            prompt: 'Does this line compile?',
            sub: CTX_HTML,
            buckets: ['✅ Compiles', '💥 Error'],
            items: compileCards(rng, SWIZ_COMPILE, 10),
            explain: '<p>Check: letters exist for that size? Same name set? Max 4? No repeats on the left of = ? Sizes on both sides match?</p>',
          }),
        },
        {
          id: 'swizzle-photo', title: 'Channel swap', engine: 'mcq', rounds: 6,
          blurb: 'Which swizzle turned the photo into this?',
          gen: (rng, level) => {
            const pool = level === 1 ? ['rgb', 'bgr', 'rrr', 'ggg', 'bbb'] : ['rgb', 'bgr', 'rbg', 'grb', 'gbr', 'brg', 'rrr', 'ggg', 'bbb', 'rrg', 'bbr'];
            const ans = rng.pick(pool.filter((s) => s !== 'rgb'));
            const opts = distinct(rng, ans, () => rng.pick(pool), 4);
            return {
              prompt: 'Which line made the right image?',
              shaders: [
                { spec: { frag: 'col = texture2D(uTex, uv).rgb;', textures: { uTex: 'photo' } }, label: 'original c' },
                { spec: { frag: `vec3 c = texture2D(uTex, uv).rgb;\ncol = c.${ans};`, textures: { uTex: 'photo' } }, label: 'result' },
              ],
              options: opts.map((s) => ({ code: `col = c.${s};` })),
              explain: `<p><code>c.${ans}</code>: new red ← c.${ans[0]}, new green ← c.${ans[1]}, new blue ← c.${ans[2]}. Tip: the orange sky (lots of red) shows where the red channel went.</p>`,
            };
          },
        },
        {
          id: 'swizzle-fill', title: 'Swizzle it right', engine: 'codefill', rounds: 5,
          blurb: 'Pick the swizzle that reproduces the target.',
          gen: (rng, level) => {
            const variants = [
              { template: 'col = vec3(uv.[[0]], 0.0);', options: ['xy', 'yx', 'xx', 'yy'], body: (s) => `col = vec3(uv.${s}, 0.0);` },
              { template: 'col.[[0]] = uv;', options: ['rg', 'gb', 'rb', 'br', 'bg'], body: (s) => `col.${s} = uv;` },
              { template: 'vec3 c = texture2D(uTex, uv).rgb;\ncol = c.[[0]];', options: ['rgb', 'bgr', 'gbr', 'rrr'], body: (s) => `vec3 c = texture2D(uTex, uv).rgb;\ncol = c.${s};`, tex: true },
              { template: 'col = vec3(uv.x, uv.y, 0.0).[[0]];', options: ['zxy', 'yzx', 'xyz', 'zyx'], body: (s) => `col = vec3(uv.x, uv.y, 0.0).${s};` },
            ];
            const vr = rng.pick(level === 1 ? variants.slice(0, 2) : variants);
            const ans = rng.pick(vr.options);
            return {
              prompt: 'Pick the swizzle so "Yours" matches the target:',
              template: vr.template,
              slots: [{ options: vr.options, answer: ans }],
              build: (vals) => ({ frag: vr.body(vals[0]), textures: vr.tex ? { uTex: 'photo' } : undefined }),
              explain: '<p>Read the colour of the corners: red shows where the 1st slot is large, green the 2nd, blue the 3rd.</p>',
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'glsl.math',
      title: 'Component-wise maths',
      blurb: 'vec * vec multiplies slot by slot — it is NOT a dot product.',
      lesson: [
        {
          title: 'Slot by slot',
          body: `<p>Maths between two vectors of the same size happens <b>per component</b> — x with x, y with y:</p>
<pre class="code">vec2(0.2, 0.5) + vec2(0.1, 0.3) = vec2(0.3, 0.8)</pre>
<div class="analogy">🧾 Like two shopping lists lined up: you add the apples to the apples and the pears to the pears. You never add apples to pears.</div>
<p>Move b and follow the numbers:</p>`,
          controls: [
            { name: 'x', label: 'b.x', min: -0.5, max: 0.5, step: 0.05, value: 0.1 },
            { name: 'y', label: 'b.y', min: -0.5, max: 0.5, step: 0.05, value: 0.3 },
          ],
          visual: (el, x) => {
            const a = [0.2, 0.5], b = [x.x, x.y], s = G.add(a, b);
            el.append(h('pre.code', { html: `a     = (${n(a[0], 2)}, ${n(a[1], 2)})\nb     = (${n(b[0], 2)}, ${n(b[1], 2)})\n<b>a + b = (${n(a[0], 2)}${b[0] < 0 ? '' : '+'}${n(b[0], 2)}, ${n(a[1], 2)}${b[1] < 0 ? '' : '+'}${n(b[1], 2)}) = (${n(s[0], 2)}, ${n(s[1], 2)})</b>` }));
          },
          shader: (x) => ({ frag: 'vec2 a = vec2(0.2, 0.5);\nvec2 s = a + uB;\ncol = vec3(0.1) + 0.1 * step(abs(uv.x - 0.5), 0.003) + 0.1 * step(abs(uv.y - 0.5), 0.003);\nvec2 q = (uv - 0.5) * 2.0;\ncol = mix(col, vec3(1.0, 0.85, 0.4), step(length(q - a), 0.04));\ncol = mix(col, vec3(0.4, 0.85, 1.0), step(length(q - uB), 0.04));\ncol = mix(col, vec3(0.5, 1.0, 0.5), step(length(q - s), 0.05));', uniforms: { uB: [x.x, x.y] } }),
          after: '<p class="small">Dots (−1..1 space): <span style="color:#ffd479">a</span>, <span style="color:#6bdfff">b</span>, <span style="color:#80ff80">a + b</span>.</p>',
        },
        {
          title: 'vec × float scales everything',
          body: `<p>When one side is a single float, it applies to <b>every</b> component:</p>
<pre class="code">vec3(0.2, 0.4, 1.0) * 0.5 = vec3(0.1, 0.2, 0.5)
uv + 0.5                  = vec2(uv.x + 0.5, uv.y + 0.5)</pre>
<p>That's how <code>uv * 2.0 - 1.0</code> works on both axes at once.</p>`,
          controls: [{ name: 'k', label: 'k', min: 0, max: 3, step: 0.1, value: 2 }],
          shader: (x) => ({ frag: 'col = vec3(fract(uv * uK), 0.0);', uniforms: { uK: x.k } }),
          code: (x) => `col = vec3(fract(uv * ${f(x.k, 1)}), 0.0);\n// uv * ${n(x.k, 1)} = vec2(uv.x * ${n(x.k, 1)}, uv.y * ${n(x.k, 1)})`,
        },
        {
          title: 'vec × vec is NOT a dot product',
          body: `<p>Coming from maths class, <code>a * b</code> might look like a dot product. In GLSL it isn't — it's slot by slot, and the result is still a <b>vector</b>:</p>
<pre class="code">vec2 a = vec2(2.0, 3.0);
vec2 b = vec2(4.0, 0.5);
a * b      = vec2(8.0, 1.5)   // vector!
dot(a, b)  = 8.0 + 1.5 = 9.5  // one float</pre>
<div class="note"><code>dot()</code> = multiply slot by slot <b>and then add them all up</b>. Different operation, different type.</div>
<p>Colours use this all the time: <code>texColor * tint</code> filters each channel separately.</p>`,
          quiz: { q: '<code>vec3(1.0, 2.0, 3.0) * vec3(2.0, 0.0, 1.0)</code> = ?', options: ['vec3(2.0, 0.0, 3.0)', '5.0', 'vec3(3.0, 2.0, 4.0)'], answer: 0, explain: '1×2, 2×0, 3×1. (5.0 would be the dot product.)' },
        },
        {
          title: 'Functions work per component too',
          body: `<p>Most built-ins accept vectors and apply themselves to each slot:</p>
<pre class="code">step(0.5, uv)   // vec2(step(0.5, uv.x), step(0.5, uv.y))
abs(uv - 0.5)   // distance from the centre lines, per axis
fract(uv * 4.0) // repeat 4×4</pre>
<p>Below: <code>col = vec3(step(t, uv), 0.0)</code> — red where uv.x ≥ t, green where uv.y ≥ t.</p>`,
          controls: [{ name: 't', label: 't', min: 0, max: 1, step: 0.05, value: 0.5 }],
          shader: (x) => ({ frag: 'col = vec3(step(uT, uv), 0.0);', uniforms: { uT: x.t } }),
          code: (x) => `vec2 s = step(${f(x.t, 2)}, uv); // two 0/1 values at once\ncol = vec3(s, 0.0);`,
        },
        {
          title: 'Sizes must match',
          body: `<pre class="code">vec3 + vec3   ✓        vec3 * float  ✓
vec3 + vec2   ✗        float * vec2  ✓
vec4 * vec3   ✗        vec3 * 2      ✗ (int!)</pre>
<p>If sizes don't match, swizzle one side so they do: <code>t.rgb * c</code>, <code>c.xy + p</code>.</p>`,
        },
      ],
      games: [
        {
          id: 'cw-calc', title: 'Vector calculator', engine: 'numeric', rounds: 6,
          blurb: 'Compute component-wise results (and spot when dot() gives one number).',
          gen: (rng, level) => {
            const len = level === 1 ? 2 : rng.pick([2, 3]);
            const V = () => rng.pickN([0, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2], len);
            const a = V(), b = V();
            const k = rng.pick([0.5, 2, 3]);
            const kinds = level === 1 ? ['add', 'scale', 'addf'] : level === 2 ? ['mul', 'add', 'scale', 'dot', 'step'] : ['dot', 'mul', 'avg', 'max', 'absd', 'mixed'];
            const kind = rng.pick(kinds);
            const A = fmtVec(a), B = fmtVec(b);
            let code, res, why;
            if (kind === 'add') { code = `${A} + ${B}`; res = G.add(a, b); why = 'Add matching slots.'; }
            else if (kind === 'scale') { code = `${A} * ${f(k)}`; res = G.mul(a, k); why = `Every slot × ${n(k)}.`; }
            else if (kind === 'addf') { code = `${A} + 0.5`; res = G.add(a, 0.5); why = 'A float is added to every slot.'; }
            else if (kind === 'mul') { code = `${A} * ${B}`; res = G.mul(a, b); why = 'Slot by slot: x·x, y·y… The result is still a vector.'; }
            else if (kind === 'dot') { code = `dot(${A}, ${B})`; res = [G.dot(a, b)]; why = 'Multiply slot by slot, then ADD them up → one float.'; }
            else if (kind === 'step') { const e = rng.pick([0.25, 0.35, 0.45]); code = `step(${f(e)}, ${A})`; res = G.step(e, a); why = `Each slot: 1 if ≥ ${n(e)}, else 0.`; }
            else if (kind === 'avg') { code = `(${A} + ${B}) * 0.5`; res = G.mul(G.add(a, b), 0.5); why = 'Bracket first, then halve each slot: the midpoint.'; }
            else if (kind === 'max') { code = `max(${A}, ${B})`; res = G.max(a, b); why = 'max per slot (not "the bigger vector").'; }
            else if (kind === 'absd') { code = `abs(${A} - ${B})`; res = G.abs(G.sub(a, b)); why = 'Subtract per slot, then drop the signs.'; }
            else { code = `${A} * ${B} + ${f(k)}`; res = G.add(G.mul(a, b), k); why = 'Multiply slot by slot first, then add the float to every slot.'; }
            res = res.map((z) => +z.toFixed(3));
            return { prompt: 'What is the result?', code, answer: res.length === 1 ? res[0] : res, wrap: res.length > 1 ? vecName(res.length) : undefined, explain: `<p>${why} → <code>${fmtVec(res)}</code></p>` };
          },
        },
        {
          id: 'dot-or-not', title: '* or dot()?', engine: 'mcq', rounds: 8,
          blurb: 'Which result does this expression give: a vector or a single number?',
          gen: (rng, level) => {
            const len = level === 1 ? 2 : rng.pick([2, 3]);
            const vals = [1, 2, 3, 0.5, 0];
            const a = rng.pickN(vals, len), b = rng.pickN(vals, len);
            const ops = [
              { code: `a * b`, r: fmtVec(G.mul(a, b)) },
              { code: `dot(a, b)`, r: f(G.dot(a, b), 2) },
              { code: `a + b`, r: fmtVec(G.add(a, b)) },
              { code: `a - b`, r: fmtVec(G.sub(a, b)) },
              { code: `length(a)`, r: f(G.length(a), 2) },
            ];
            const pool = level === 1 ? ops.slice(0, 3) : ops;
            const ans = rng.pick(pool.slice(0, 2).concat(level === 3 ? pool : []));
            const wrongs = [...ops.filter((o) => o !== ans).map((o) => o.r), fmtVec(G.add(G.mul(a, b), 1)), f(G.dot(a, b) + 1, 2)];
            const opts = distinct(rng, ans.r, (r, i) => wrongs[i % wrongs.length], 4);
            return {
              prompt: `<code>vec${len} a = ${fmtVec(a)};</code><br><code>vec${len} b = ${fmtVec(b)};</code><br>What is <code>${ans.code}</code>?`,
              options: opts.map((o) => ({ code: o })),
              explain: `<p><code>a * b</code> = ${ops[0].r} (slot by slot, a vector). <code>dot(a, b)</code> = ${ops[1].r} (the slot products added up, one float).</p>`,
            };
          },
        },
        {
          id: 'cw-gpu', title: 'Be the GPU: vector step', engine: 'paint', rounds: 4,
          blurb: 'step() on a whole vec2 at once, then combine the two results.',
          gen: (rng, level) => {
            const T = [0.25, 0.5, 0.75];
            const W = level === 1 ? 4 : 8;
            const e = [rng.pick(T), rng.pick(T)];
            const E = `vec2(${f(e[0])}, ${f(e[1])})`;
            const sx = (u) => +(u >= e[0]), sy = (v2) => +(v2 >= e[1]);
            const rules = [
              { code: `vec2 s = step(${E}, uv);\ncol = vec3(s.x * s.y);`, solve: (u, v2) => sx(u) * sy(v2), note: 's.x * s.y is 1 only when BOTH are 1 → an AND.' },
              { code: `vec2 s = step(${E}, uv);\ncol = vec3(max(s.x, s.y));`, solve: (u, v2) => Math.max(sx(u), sy(v2)), note: 'max(s.x, s.y) is 1 when EITHER is 1 → an OR.' },
              { code: `vec2 s = step(${E}, uv);\ncol = vec3(s.x - s.y);`, solve: (u, v2) => Math.max(0, sx(u) - sy(v2)), note: 's.x − s.y is 1 only where s.x = 1 and s.y = 0 (negative values show as black).', lvl: 2 },
              { code: 'vec2 d = abs(uv - 0.5);\nvec2 s = step(d, vec2(0.25));\ncol = vec3(s.x * s.y);', solve: (u, v2) => +(Math.abs(u - 0.5) <= 0.25 && Math.abs(v2 - 0.5) <= 0.25), note: 'step(d, 0.25) is 1 where d ≤ 0.25: within 0.25 of the centre on each axis → a centred square.', lvl: 3 },
            ];
            const r = rng.pick(rules.filter((x) => (x.lvl || 1) <= level));
            return {
              prompt: 'Paint what this outputs:',
              sub: 'step(edge, x) is 1 when x ≥ edge. With vectors, each component gets its own test.',
              code: r.code, w: W, h: W,
              palette: [{ color: [0, 0, 0], label: '0' }, { color: [1, 1, 1], label: '1' }],
              showUV: level === 1,
              solve: (u, v2) => r.solve(u, v2),
              explain: `<p>${r.note}</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'glsl.builtins',
      title: 'Built-in functions',
      blurb: 'What each built-in takes and returns — and the argument order.',
      lesson: [
        {
          title: 'genType: one name, many sizes',
          body: `<p>The GLSL spec writes most functions like this:</p>
<pre class="code">genType sin(genType x)
genType mix(genType a, genType b, genType t)</pre>
<p><b>genType</b> means "float, vec2, vec3 or vec4 — your choice, but the same everywhere". So <code>sin(float)</code> returns a float and <code>sin(vec3)</code> returns a vec3.</p>
<div class="analogy">🍹 Like a juicer: put in 1 orange, get 1 glass. Put in a crate of 3, get 3 glasses. Same machine.</div>`,
        },
        {
          title: 'Functions that collapse to one float',
          body: `<p>Some functions turn a vector into <b>one number</b>. Learn these — they're the usual type-error culprits:</p>
<pre class="code">float length(genType x)            // how long
float distance(genType a, genType b)
float dot(genType a, genType b)     // weighted sum
vec4  texture2D(sampler2D s, vec2 uv) // always vec4!
vec3  cross(vec3 a, vec3 b)          // vec3 only</pre>
<p>Below: <code>length(uv - 0.5)</code> — a vec2 goes in, one float (distance from the centre) comes out.</p>`,
          controls: [{ name: 'k', label: 'rings', min: 1, max: 12, step: 1, value: 6 }],
          shader: (x) => ({ frag: 'float d = length(uv - 0.5);  // vec2 in → float out\ncol = vec3(fract(d * uK));', uniforms: { uK: x.k } }),
          code: (x) => `float d = length(uv - 0.5);\ncol = vec3(fract(d * ${f(x.k)}));`,
        },
        {
          title: 'Argument order matters',
          body: `<p>These three trip everyone up:</p>
<pre class="code">step(edge, x)          // edge FIRST: 1.0 if x >= edge
mix(a, b, t)           // t LAST: a at t=0, b at t=1
smoothstep(e0, e1, x)  // x LAST
clamp(x, lo, hi)       // x FIRST</pre>
<p>Swap the arguments of step and see what happens:</p>`,
          controls: [{ name: 's', label: '0 = step(0.3, uv.x) · 1 = step(uv.x, 0.3)', min: 0, max: 1, step: 1, value: 0 }],
          shader: (x) => ({ frag: x.s ? 'col = vec3(step(uv.x, 0.3));' : 'col = vec3(step(0.3, uv.x));' }),
          code: (x) => (x.s ? 'col = vec3(step(uv.x, 0.3)); // 1 where 0.3 >= uv.x → LEFT is white' : 'col = vec3(step(0.3, uv.x)); // 1 where uv.x >= 0.3 → RIGHT is white'),
        },
        {
          title: 'Mixed float/vector arguments',
          body: `<p>Several functions let some arguments be a plain float even when the others are vectors:</p>
<pre class="code">mix(vec3 a, vec3 b, float t)     ✓
clamp(vec3 x, float lo, float hi) ✓
step(float edge, vec2 x)          ✓
max(vec3 x, float y)              ✓
mix(vec3 a, float b, float t)     ✗ a and b must match</pre>
<div class="tip">Tool tip: in the Unity Shader Graph or Unreal, the node's pins show the same thing — inputs that accept "Vector1" (a float) next to Vector3s.</div>`,
          quiz: { q: 'What does <code>texture2D(uTex, uv)</code> return?', options: ['vec4', 'vec3', 'float', 'vec2'], answer: 0, explain: 'Always RGBA. Take .rgb for a colour, .a for alpha, .r for a single channel.' },
        },
      ],
      games: [
        {
          id: 'fn-result', title: 'Function results', engine: 'numeric', rounds: 6,
          blurb: 'Evaluate common built-ins by hand.',
          gen: (rng, level) => {
            const pick = (arr) => rng.pick(arr);
            const L1 = [
              () => { const a = pick([0, 2, 10]), b = pick([4, 20]), t = pick([0.25, 0.5, 0.75]); return { code: `mix(${f(a)}, ${f(b)}, ${f(t)})`, ans: G.mix(a, b, t), why: `a + (b − a)·t = ${n(a)} + ${n(b - a)}·${n(t)}.` }; },
              () => { const e = pick([0.3, 0.5]), x = pick([0.2, 0.7, 0.9]); return { code: `step(${f(e)}, ${f(x)})`, ans: G.step(e, x), why: `Is x (${n(x)}) ≥ edge (${n(e)})? ${x >= e ? 'Yes → 1' : 'No → 0'}.` }; },
              () => { const x = pick([1.3, -0.4, 0.6, 2]); return { code: `clamp(${f(x)}, 0.0, 1.0)`, ans: G.clamp(x, 0, 1), why: 'Squeezed into 0..1.' }; },
              () => { const x = pick([2.75, 1.5, 3.25, 0.4]); return { code: `fract(${f(x)})`, ans: G.fract(x), why: 'The part after the decimal point.' }; },
              () => { const x = pick([-0.3, 0.7, -2]); return { code: `abs(${f(x)})`, ans: Math.abs(x), why: 'Drop the sign.' }; },
            ];
            const L2 = [
              () => { const [a, b] = pick([[3, 4], [0.6, 0.8], [6, 8], [0.3, 0.4]]); return { code: `length(vec2(${f(a)}, ${f(b)}))`, ans: Math.hypot(a, b), why: `√(${n(a)}² + ${n(b)}²).` }; },
              () => { const a = [pick([1, 2]), pick([2, 3])], b = [pick([3, 0.5]), pick([0.5, 1])]; return { code: `dot(vec2(${f(a[0])}, ${f(a[1])}), vec2(${f(b[0])}, ${f(b[1])}))`, ans: G.dot(a, b), why: `${n(a[0])}·${n(b[0])} + ${n(a[1])}·${n(b[1])}.` }; },
              () => { const x = pick([5.5, 7, 4.5, 3]), y = pick([2, 3]); return { code: `mod(${f(x)}, ${f(y)})`, ans: G.mod(x, y), why: `Remainder after dividing by ${n(y)}.` }; },
              () => { const x = pick([0.5, 0.25]); return { code: `smoothstep(0.0, 1.0, ${f(x)})`, ans: G.smoothstep(0, 1, x), why: 't²(3 − 2t).' }; },
              () => { const a = pick([2, 3]), b = pick([2, 3]); return { code: `pow(${f(a)}, ${f(b)})`, ans: a ** b, why: `${a} multiplied by itself ${b} times.` }; },
            ];
            const L3 = [
              () => { const x = pick([-1.5, -0.25, -2.5]); return { code: `floor(${f(x)})`, ans: Math.floor(x), why: 'floor goes DOWN — for negatives that means further from zero.' }; },
              () => { const x = pick([-0.25, -1.75]); return { code: `fract(${f(x)})`, ans: G.fract(x), why: 'fract(x) = x − floor(x). For negatives: e.g. −0.25 − (−1) = 0.75.' }; },
              () => { const a = pick([0.3, 0.6]), b = pick([0.4, 0.8]); return { code: `distance(vec2(0.0), vec2(${f(a)}, ${f(b)}))`, ans: Math.hypot(a, b), why: 'distance = length of the difference.' }; },
              () => { const t = pick([1.5, -0.5]); return { code: `mix(0.0, 10.0, ${f(t)})`, ans: G.mix(0, 10, t), why: 'mix does NOT clamp t: it extrapolates.' }; },
              () => { const x = pick([0.5, 0.2]); return { code: `smoothstep(0.0, 0.4, ${f(x)})`, ans: G.smoothstep(0, 0.4, x), why: 'First t = (x − e0)/(e1 − e0), clamped to 0..1; then t²(3 − 2t).' }; },
            ];
            const pool = level === 1 ? L1 : level === 2 ? [...L1, ...L2, ...L2] : [...L2, ...L3, ...L3];
            const k = rng.pick(pool)();
            return { prompt: 'What does this return?', code: k.code, answer: +k.ans.toFixed(3), explain: `<p>${k.why} → <b>${n(k.ans)}</b></p>` };
          },
        },
        {
          id: 'returns', title: 'What does it return?', engine: 'mcq', rounds: 8,
          blurb: 'Name the return type of built-in calls.',
          gen: (rng, level) => {
            const pool = [
              { e: 'length(c)', t: 'float', lvl: 1 }, { e: 'normalize(c)', t: 'vec3', lvl: 1 }, { e: 'texture2D(uTex, p)', t: 'vec4', lvl: 1 },
              { e: 'dot(p, p)', t: 'float', lvl: 1 }, { e: 'sin(p)', t: 'vec2', lvl: 1 }, { e: 'mix(c, c * 2.0, x)', t: 'vec3', lvl: 1 },
              { e: 'distance(p, vec2(0.5))', t: 'float', lvl: 2 }, { e: 'cross(c, c)', t: 'vec3', lvl: 2 }, { e: 'step(0.5, t)', t: 'vec4', lvl: 2 },
              { e: 'clamp(c, 0.0, 1.0)', t: 'vec3', lvl: 2 }, { e: 'max(p, 0.0)', t: 'vec2', lvl: 2 }, { e: 'floor(x)', t: 'float', lvl: 2 },
              { e: 'abs(t.xy)', t: 'vec2', lvl: 3 }, { e: 'length(t.rgb - c)', t: 'float', lvl: 3 }, { e: 'reflect(c, c)', t: 'vec3', lvl: 3 },
              { e: 'smoothstep(0.0, 1.0, p)', t: 'vec2', lvl: 3 }, { e: 'atan(p.y, p.x)', t: 'float', lvl: 3 }, { e: 'texture2D(uTex, p).a', t: 'float', lvl: 3 },
            ];
            const ex = rng.pick(pool.filter((x) => x.lvl <= level));
            const others = rng.shuffle(['float', 'vec2', 'vec3', 'vec4', 'int'].filter((t) => t !== ex.t)).slice(0, 3);
            return { prompt: 'What type does this return?', sub: CTX_HTML, code: ex.e, options: [ex.t, ...others].map((t) => ({ code: t })), grid: true, explain: `<p><code>${ex.e}</code> → <b>${ex.t}</b>. ${['length', 'distance', 'dot', 'atan'].some((fn) => ex.e.startsWith(fn)) ? 'It collapses a vector into one number.' : ex.e.startsWith('texture2D(uTex, p)') && ex.t === 'vec4' ? 'Texture reads are always RGBA.' : 'genType: same size in, same size out.'}</p>` };
          },
        },
        {
          id: 'fn-legal', title: 'Valid call?', engine: 'buckets', rounds: 2,
          blurb: 'Do the argument and return types fit?',
          gen: (rng) => ({
            prompt: 'Does this line compile?',
            sub: CTX_HTML,
            buckets: ['✅ Compiles', '💥 Error'],
            items: compileCards(rng, FN_COMPILE, 10),
            explain: '<p>Check what the function returns (float? same-size vector? vec4?) and whether the arguments have matching sizes.</p>',
          }),
        },
        {
          id: 'arg-order', title: 'Argument order', engine: 'codefill', rounds: 5,
          blurb: 'Put the arguments in the right slots to match the target.',
          gen: (rng, level) => {
            const variants = [
              { template: 'col = vec3(step([[0]], [[1]]));', opts: ['0.3', 'uv.x'], ans: rng.chance() ? ['0.3', 'uv.x'] : ['uv.x', '0.3'], why: 'step(edge, x): 1 where x ≥ edge. step(0.3, uv.x) → right side white; step(uv.x, 0.3) → left side white.' },
              { template: 'col = mix([[0]], [[1]], [[2]]);', opts: ['vec3(1.0, 0.0, 0.0)', 'vec3(0.0, 0.0, 1.0)', 'uv.x'], ans: rng.chance() ? ['vec3(1.0, 0.0, 0.0)', 'vec3(0.0, 0.0, 1.0)', 'uv.x'] : ['vec3(0.0, 0.0, 1.0)', 'vec3(1.0, 0.0, 0.0)', 'uv.x'], why: 'mix(a, b, t): a where t = 0 (left), b where t = 1 (right). t is always last.' },
              { template: 'col = vec3(smoothstep([[0]], [[1]], [[2]]));', opts: ['0.2', '0.8', 'uv.x'], ans: rng.chance() ? ['0.2', '0.8', 'uv.x'] : ['0.8', '0.2', 'uv.x'], why: 'smoothstep(e0, e1, x): x last. Swapping e0 and e1 flips the ramp.', lvl: 2 },
              { template: 'col = vec3(clamp([[0]], [[1]], [[2]]));', opts: ['uv.x', '0.25', '0.75'], ans: ['uv.x', '0.25', '0.75'], why: 'clamp(x, min, max): x first. The gradient is flattened below 0.25 and above 0.75.', lvl: 2 },
            ];
            const vr = rng.pick(variants.filter((x) => (x.lvl || 1) <= level));
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: 'Place the arguments so "Yours" matches the target:',
              sub: 'Each blank uses the same set of tokens.',
              template: vr.template,
              slots: vr.ans.map((a) => ({ options: vr.opts, answer: a })),
              build: (vals) => ({ frag: fill(vals) }),
              explain: `<p>${vr.why}</p>`,
            };
          },
        },
      ],
    },
    // ==================================================================
    {
      id: 'glsl.hlsl',
      title: 'GLSL ↔ HLSL ↔ nodes',
      blurb: 'Same ideas, different names: mix/lerp, fract/frac, vec3/float3, and node names.',
      lesson: [
        {
          title: 'Same language, different accent',
          body: `<p><b>GLSL</b> is used by OpenGL/WebGL (and this app). <b>HLSL</b> is used by DirectX, Unity and Unreal. They're ~90% the same — the rest is mostly <b>names</b>.</p>
<div class="analogy">🇬🇧🇺🇸 Like British vs American English: lift/elevator, flat/apartment. Same thing, different word.</div>
<pre class="code">// GLSL                 // HLSL
vec3 c = vec3(0.5);     float3 c = float3(0.5, 0.5, 0.5);
mix(a, b, t)            lerp(a, b, t)
fract(x)                frac(x)
clamp(x, 0.0, 1.0)      saturate(x)</pre>`,
        },
        {
          title: 'Types',
          body: `<pre class="code">GLSL        HLSL
float       float  (and half = lower precision)
vec2/3/4    float2/3/4   (half2/3/4)
ivec2       int2
mat3        float3x3
sampler2D   Texture2D + SamplerState</pre>
<p>HLSL also converts ints to floats implicitly and allows the <code>f</code> suffix (<code>0.5f</code>). GLSL ES 1.00 allows neither.</p>
<div class="tip">In Unity URP/HDRP shader code you'll see <code>half</code> a lot: same as float but 16-bit on mobile GPUs — faster, less precise. GLSL's equivalent is <code>mediump</code>.</div>`,
        },
        {
          title: 'Functions',
          body: `<pre class="code">GLSL                    HLSL
mix(a, b, t)            lerp(a, b, t)
fract(x)                frac(x)
clamp(x, 0.0, 1.0)      saturate(x)
texture2D(tex, uv)      tex.Sample(samp, uv)   (old: tex2D)
atan(y, x)              atan2(y, x)
dFdx / dFdy             ddx / ddy
inversesqrt(x)          rsqrt(x)
mod(x, y)               fmod(x, y)  ⚠ differs for negatives
M * v                   mul(M, v)</pre>
<div class="note">⚠ <code>mod(-1.0, 3.0)</code> = 2 in GLSL (floored), but <code>fmod(-1, 3)</code> = −1 in HLSL (truncated). Repeating patterns can glitch left of 0 when porting!</div>`,
        },
        {
          title: 'Node graphs speak the same language',
          body: `<p>Material editors are shader code with boxes. The same operations, by node name:</p>
<pre class="code">code         Unreal node          Unity Shader Graph
mix          Lerp                 Lerp
fract        Frac                 Fraction
saturate     Saturate             Saturate
1.0 - x      OneMinus             One Minus
texture2D    TextureSample        Sample Texture 2D
.rg swizzle  ComponentMask        Swizzle / Split
vec4(c, a)   AppendVector         Combine
dot          Dot                  Dot Product
uv           TexCoord             UV</pre>
<p>If you can read the GLSL, you can rebuild it as nodes — and vice versa.</p>`,
        },
        {
          title: 'Gotchas when porting',
          body: `<ul>
<li><b>UV origin</b>: OpenGL textures have v = 0 at the <b>bottom</b>; DirectX at the <b>top</b>. Flipped textures → <code>1.0 - uv.y</code>.</li>
<li><b>Matrix order</b>: GLSL <code>M * v</code> ↔ HLSL <code>mul(M, v)</code> (and the matrix layout may be transposed).</li>
<li><b>Output</b>: GLSL writes <code>gl_FragColor</code>; HLSL <b>returns</b> a float4 marked <code>: SV_Target</code>.</li>
<li><b>Literals</b>: HLSL lets you write <code>2</code> for a float; GLSL ES 1.00 needs <code>2.0</code>.</li></ul>`,
          quiz: { q: 'You port <code>lerp(a, b, frac(t))</code> to GLSL. Which is right?', options: ['mix(a, b, fract(t))', 'lerp(a, b, fract(t))', 'mix(a, b, frac(t))'], answer: 0, explain: 'Both names change: lerp → mix, frac → fract.' },
        },
      ],
      games: [
        {
          id: 'glsl-or-hlsl', title: 'GLSL or HLSL?', engine: 'buckets', rounds: 2,
          blurb: 'Sort the names: which language do they belong to?',
          gen: (rng) => ({
            prompt: 'Which language is this from?',
            sub: 'Pick the language it is ONLY valid in.',
            buckets: ['GLSL', 'HLSL'],
            count: 12,
            items: [
              { code: 'vec3', bucket: 0 }, { code: 'float3', bucket: 1 },
              { code: 'mix(a, b, t)', bucket: 0 }, { code: 'lerp(a, b, t)', bucket: 1 },
              { code: 'fract(x)', bucket: 0 }, { code: 'frac(x)', bucket: 1 },
              { code: 'texture2D(t, uv)', bucket: 0 }, { code: 'tex.Sample(s, uv)', bucket: 1 },
              { code: 'atan2(y, x)', bucket: 1, why: 'GLSL uses atan(y, x).' }, { code: 'dFdx(v)', bucket: 0 },
              { code: 'ddx(v)', bucket: 1 }, { code: 'gl_FragColor', bucket: 0 },
              { code: ': SV_Target', bucket: 1 }, { code: 'float4x4', bucket: 1 },
              { code: 'mat4', bucket: 0 }, { code: 'rsqrt(x)', bucket: 1 },
              { code: 'inversesqrt(x)', bucket: 0 }, { code: 'mul(M, v)', bucket: 1 },
              { code: 'saturate(x)', bucket: 1, why: 'Not built into GLSL (this app adds one for convenience). GLSL: clamp(x, 0.0, 1.0).' },
              { code: 'half3', bucket: 1, why: 'HLSL low-precision type. GLSL uses mediump.' },
            ],
            explain: '<p>Mnemonic: HLSL names are short and "C-like" (lerp, frac, float3); GLSL names read like words (mix, fract, vec3).</p>',
          }),
        },
        {
          id: 'translate', title: 'Translate it', engine: 'mcq', rounds: 8,
          blurb: 'GLSL ↔ HLSL ↔ Unreal ↔ Unity Shader Graph names.',
          gen: (rng, level) => {
            const dirs = level === 1 ? [['glsl', 'hlsl'], ['hlsl', 'glsl']] : level === 2 ? [['glsl', 'hlsl'], ['hlsl', 'glsl'], ['glsl', 'ue'], ['glsl', 'unity']] : [['hlsl', 'ue'], ['ue', 'glsl'], ['unity', 'hlsl'], ['glsl', 'unity'], ['ue', 'unity']];
            const [from, to] = rng.pick(dirs);
            const label = { glsl: 'GLSL', hlsl: 'HLSL', ue: 'an Unreal material node', unity: 'a Unity Shader Graph node' };
            const rows = DICT.filter((r) => r[from] !== r[to] && !r[to].startsWith('(') && !r[from].startsWith('('));
            const row = rng.pick(rows.slice(0, level === 1 ? 10 : rows.length));
            const opts = distinct(rng, row[to], (r) => { const w = r.pick(DICT)[to]; return w.startsWith('(') ? null : w; }, 4);
            const isCode = (k) => k === 'glsl' || k === 'hlsl';
            return {
              prompt: `<b>${label[from]}</b>: <code>${row[from].replace(/</g, '&lt;')}</code><br>What is it in <b>${label[to]}</b>?`,
              options: opts.map((o) => (isCode(to) ? { code: o } : o)),
              explain: `<p>GLSL <code>${row.glsl}</code> = HLSL <code>${row.hlsl}</code> = Unreal <b>${row.ue}</b> = Unity <b>${row.unity}</b>.</p>`,
            };
          },
        },
        {
          id: 'port-hlsl', title: 'Port to GLSL', engine: 'codefill', rounds: 4,
          blurb: 'An HLSL line must become GLSL. Pick the GLSL names.',
          gen: (rng, level) => {
            const variants = [
              { hlsl: 'col = lerp(float3(1, 0, 0), float3(0, 0, 1), uv.x);', template: 'col = [[0]](vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), uv.x);', slots: [{ options: ['mix', 'lerp', 'blend', 'interp'], answer: 'mix' }] },
              { hlsl: 'col = frac(uv.x * 4.0).xxx;', template: 'col = vec3([[0]](uv.x * 4.0));', slots: [{ options: ['fract', 'frac', 'mod', 'floor'], answer: 'fract' }] },
              { hlsl: 'float3 c = float3(uv, 0.5);\ncol = c;', template: '[[0]] c = [[1]](uv, 0.5);\ncol = c;', slots: [{ options: ['vec3', 'float3', 'float', 'vec2'], answer: 'vec3' }, { options: ['vec3', 'float3', 'vec4', 'vec2'], answer: 'vec3' }] },
              { hlsl: 'col = tex2D(uTex, uv).rgb;', template: 'col = [[0]](uTex, uv).rgb;', slots: [{ options: ['texture2D', 'tex2D', 'Sample', 'sample2D'], answer: 'texture2D' }], tex: true },
              { hlsl: 'col = lerp(float3(0, 0, 0), float3(1, 1, 0), frac(uv.y * 3.0));', template: 'col = [[0]](vec3(0.0), vec3(1.0, 1.0, 0.0), [[1]](uv.y * 3.0));', slots: [{ options: ['mix', 'lerp'], answer: 'mix' }, { options: ['fract', 'frac'], answer: 'fract' }], lvl: 2 },
              { hlsl: 'float a = atan2(uv.y - 0.5, uv.x - 0.5);\ncol = (a / 6.2832 + 0.5).xxx;', template: 'float a = [[0]](uv.y - 0.5, uv.x - 0.5);\ncol = vec3(a / 6.2832 + 0.5);', slots: [{ options: ['atan', 'atan2', 'tan', 'angle'], answer: 'atan' }], lvl: 2 },
              { hlsl: 'col = float3(uv.x * 2, 0, 0);', template: 'col = vec3(uv.x * [[0]], [[1]], 0.0);', slots: [{ options: ['2.0', '2', '2f'], answer: '2.0' }, { options: ['0.0', '0', '0f'], answer: '0.0' }], lvl: 2 },
            ];
            const vr = rng.pick(variants.filter((x) => (x.lvl || 1) <= level));
            const fill = (vals) => vr.template.replace(/\[\[(\d+)\]\]/g, (_, i) => vals[+i]);
            return {
              prompt: `This <b>HLSL</b> must run in WebGL:<pre class="code wrap" style="font-size:12.5px">${vr.hlsl}</pre>Fill in the <b>GLSL</b> version:`,
              template: vr.template, slots: vr.slots,
              build: (vals) => ({ frag: fill(vals), textures: vr.tex ? { uTex: 'photo' } : undefined }),
              explain: '<p>The HLSL names (lerp, frac, float3, tex2D, atan2) don\'t exist in GLSL — the preview shows "no matching overloaded function" or "undeclared identifier". GLSL: mix, fract, vec3, texture2D, atan(y, x).</p>',
            };
          },
        },
        {
          id: 'porting-quiz', title: 'Porting quiz', engine: 'mcq', rounds: 7,
          blurb: 'Gotchas when moving code between GLSL, HLSL and engines.',
          questions: [
            q('A texture looks upside-down after porting from DirectX to OpenGL. Quick fix?', [{ code: 'uv.y = 1.0 - uv.y;' }, { code: 'uv = uv.yx;' }, { code: 'uv *= -1.0;' }, { code: 'uv.x = 1.0 - uv.x;' }], 'DirectX puts v = 0 at the top, OpenGL at the bottom. Flip y.'),
            q('HLSL <code>saturate(x)</code> in standard GLSL is…', [{ code: 'clamp(x, 0.0, 1.0)' }, { code: 'saturate(x)' }, { code: 'normalize(x)' }, { code: 'max(x, 1.0)' }], 'GLSL has no saturate built in.'),
            q('HLSL <code>mul(M, v)</code> in GLSL is…', [{ code: 'M * v' }, { code: 'dot(M, v)' }, { code: 'v + M' }, { code: 'mul(M, v)' }], 'GLSL uses the * operator for matrix × vector.'),
            q('Unreal\'s <b>OneMinus</b> node computes…', [{ code: '1.0 - x' }, { code: 'x - 1.0' }, { code: '-x' }, { code: '1.0 / x' }], 'Used everywhere to invert masks.'),
            q('Unity\'s <b>Fraction</b> node is GLSL…', [{ code: 'fract(x)' }, { code: 'floor(x)' }, { code: 'x / y' }, { code: 'mod(x, 1)' }], 'Keeps the part after the decimal point.'),
            q('Unreal\'s <b>ComponentMask</b> (R, G checked) is like…', [{ code: 'c.rg' }, { code: 'vec2(c)' }, { code: 'c * vec3(1, 1, 0)' }, { code: 'dot(c, c)' }], 'It picks channels: a swizzle. (vec2(c) also happens to give r,g, but the mask is a swizzle.)'),
            tf('<code>mod(-1.0, 3.0)</code> in GLSL and <code>fmod(-1, 3)</code> in HLSL give the same result.', false, 'GLSL mod → 2 (floored). HLSL fmod → −1 (truncated). Watch out for patterns left of 0.', 2),
            tf('<code>half</code> in HLSL is a lower-precision float.', true, '16-bit on many mobile GPUs. GLSL uses precision qualifiers (mediump) instead.', 2),
            tf('An HLSL pixel shader writes its colour to gl_FragColor.', false, 'HLSL returns the colour from the function, tagged : SV_Target.', 2),
            q('GLSL <code>atan(p.y, p.x)</code> in HLSL is…', [{ code: 'atan2(p.y, p.x)' }, { code: 'atan(p.y / p.x)' }, { code: 'atan2(p.x, p.y)' }, { code: 'tan(p.y, p.x)' }], 'Same argument order (y first), different name.', { level: 2 }),
            q('HLSL <code>float4 c = 1;</code> — the GLSL equivalent is…', [{ code: 'vec4 c = vec4(1.0);' }, { code: 'vec4 c = 1;' }, { code: 'vec4 c = 1.0;' }, { code: 'float4 c = 1.0;' }], 'HLSL splats a scalar into all components implicitly; GLSL needs the constructor and a float.', { level: 3 }),
          ],
        },
      ],
    },
  ],
};
