import { h, shaderView } from '../core/ui.js';
import { renderer } from '../core/renderer.js';
import { TEXTURE_NAMES } from '../core/textures.js';

const EXAMPLES = [
  { name: 'UV gradient', frag: '// uv goes 0→1 left→right (x) and bottom→top (y)\ncol = vec3(uv.x, uv.y, 0.0);' },
  { name: 'Circle', frag: 'float d = length(uv - 0.5);\nfloat circle = 1.0 - smoothstep(0.3, 0.31, d);\ncol = vec3(circle);' },
  { name: 'Stripes', frag: 'float s = step(0.5, fract(uv.x * 8.0));\ncol = mix(vec3(0.1, 0.1, 0.3), vec3(1.0, 0.8, 0.3), s);' },
  { name: 'Animated rings', frag: 'float d = length(uv - 0.5);\nfloat r = sin(d * 40.0 - uTime * 4.0) * 0.5 + 0.5;\ncol = vec3(r, r * 0.5, 1.0 - r);' },
  { name: 'Lit sphere', frag: 'vec4 s = sphereNormal(uv);\nvec3 L = normalize(vec3(0.6, 0.7, 0.5));\nfloat diff = max(dot(s.xyz, L), 0.0);\ncol = vec3(1.0, 0.5, 0.3) * diff * s.w;' },
  { name: 'Noise (fbm)', frag: 'float n = fbm(uv * 6.0 + uTime * 0.3);\ncol = vec3(n);' },
  { name: 'Texture', frag: 'col = texture2D(uTex, uv * 2.0).rgb;' },
  { name: 'Tiles + IDs', frag: 'vec2 g = uv * 5.0;\nvec2 id = floor(g);\nvec2 f = fract(g);\nfloat r = hash(id);\nfloat d = length(f - 0.5);\ncol = hsv2rgb(vec3(r, 0.6, 1.0)) * step(d, 0.4);' },
  { name: 'Sphere mesh (3D)', mesh: 'sphere', frag: 'vec3 L = normalize(vec3(0.5, 0.8, 0.4));\ncol = vec3(0.3, 0.6, 1.0) * max(dot(N, L), 0.0) + 0.05;', spin: 0.5 },
  { name: 'Wavy plane (vertex)', mesh: 'plane', vert: 'pos.y += sin(pos.x * 6.0 + uTime * 2.0) * 0.1;', frag: 'col = vec3(uv, 1.0) * (0.5 + 0.5 * N.y);', spin: 0.2 },
];

export function playgroundView(root) {
  let ex = EXAMPLES[0];
  let meshSel = 'quad';
  let texName = 'photo';
  root.append(h('h1', '🧪 Playground'), h('p.small.dim', 'Write a fragment body: set <code>col</code> (vec3) using <code>uv</code> (0..1), <code>uTime</code>, and helpers like <code>hash, vnoise, fbm, rot, sdCircle, sdBox, sphereNormal, hsv2rgb</code>. Texture available as <code>uTex</code>.'));
  const err = h('div.err-box.hidden');
  const ta = h('textarea.code-edit', { spellcheck: false, autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off' });
  ta.value = ex.frag;
  const vta = h('textarea.code-edit', { spellcheck: false, autocapitalize: 'off', style: { minHeight: '70px' }, placeholder: '// optional vertex body (3D meshes): edit pos, normal, uv' });
  vta.value = ex.vert || '';
  const view = shaderView(build(), { size: 300 });
  root.append(h('div.view-wrap', view));
  const sel = h('select', { style: { width: '100%', padding: '10px', borderRadius: '10px', background: 'var(--bg3)', border: '1px solid var(--line)' } },
    EXAMPLES.map((e, i) => h('option', { value: i }, e.name)));
  sel.onchange = () => { ex = EXAMPLES[+sel.value]; ta.value = ex.frag; vta.value = ex.vert || ''; meshSel = ex.mesh || 'quad'; update(); };
  const texSel = h('select', { style: { width: '100%', padding: '10px', borderRadius: '10px', background: 'var(--bg3)', border: '1px solid var(--line)' } }, TEXTURE_NAMES.map((n) => h('option', { value: n, selected: n === texName }, n)));
  texSel.onchange = () => { texName = texSel.value; update(); };
  function build() {
    return { frag: ta.value, vert: vta.value, mesh: meshSel || 'quad', textures: { uTex: texName }, camera: { spin: ex.spin || 0 } , animate: true };
  }
  let t;
  function update() {
    const spec = build();
    const r = renderer().compile(spec);
    if (r.error) { err.textContent = r.error; err.classList.remove('hidden'); }
    else { err.classList.add('hidden'); view.update(spec); }
  }
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(update, 350); });
  vta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(update, 350); });
  root.append(h('div.small.dim', 'Example'), sel, h('div.spacer'), err, ta,
    h('div.small.dim', 'Vertex body (only for 3D meshes)'), vta,
    h('div.small.dim', 'Texture uTex'), texSel);
  // token bar to make typing on a phone easier
  const tokens = ['uv', 'col', '=', ';', '(', ')', '.', ',', '*', '+', '-', '/', 'vec3(', 'vec2(', 'float ', 'sin(', 'fract(', 'step(', 'smoothstep(', 'length(', 'mix(', 'uTime', '0.5', '1.0'];
  const bar = h('div.chips');
  tokens.forEach((tk) => bar.append(h('button.chip', {
    onclick: () => {
      const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
      ta.value = ta.value.slice(0, s) + tk + ta.value.slice(e);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + tk.length;
      clearTimeout(t); t = setTimeout(update, 350);
    },
  }, tk)));
  root.append(h('div.small.dim', 'Quick tokens'), bar);
  update();
}
