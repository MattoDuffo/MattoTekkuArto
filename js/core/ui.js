// Small DOM toolkit + reusable widgets (shader view, code block, sliders, meters).
import { renderer } from './renderer.js';

/** hyperscript: h('div.card#id', {onclick, style:{}, html:'...'}, children...) */
export function h(sel, props, ...kids) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    if (props != null) kids.unshift(props);
    props = {};
  }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function html(str) { const t = document.createElement('template'); t.innerHTML = str; return t.content; }

// ------------------------------------------------------------------ GLSL highlighting
const KW = new Set('if else for while return break continue discard in out inout uniform varying attribute const void true false precision highp mediump lowp struct'.split(' '));
const TY = new Set('float int bool vec2 vec3 vec4 ivec2 ivec3 bvec2 mat2 mat3 mat4 sampler2D half half2 half3 half4 float2 float3 float4 float4x4'.split(' '));
const FN = new Set(('sin cos tan asin acos atan pow exp log exp2 log2 sqrt inversesqrt abs sign floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture2D texture lerp frac saturate tex2D fwidth dFdx dFdy ' +
  'hash hash2 vnoise gnoise fbm voronoi rot sdCircle sdBox sdSegment sphereNormal hsv2rgb luma checker remap').split(' '));
const VARS = new Set('uv col alpha N P pos normal uTime uRes uMouse gl_FragColor gl_FragCoord gl_Position'.split(' '));

export function highlight(code) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '';
  const re = /(\/\/[^\n]*)|(\[\[(\d+)\]\])|(\{\{hl:)|(:hl\}\})|([A-Za-z_][A-Za-z0-9_]*)|(\d+\.?\d*(?:e[-+]?\d+)?|\.\d+)|([\s\S])/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[1]) out += `<span class="tk-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tk-blank" data-slot="${m[3]}">?</span>`;
    else if (m[4]) out += '<span class="tk-hl">';
    else if (m[5]) out += '</span>';
    else if (m[6]) {
      const w = m[6];
      if (KW.has(w)) out += `<span class="tk-kw">${w}</span>`;
      else if (TY.has(w)) out += `<span class="tk-ty">${w}</span>`;
      else if (FN.has(w)) out += `<span class="tk-fn">${w}</span>`;
      else if (VARS.has(w) || /^u[A-Z]/.test(w)) out += `<span class="tk-var">${w}</span>`;
      else out += w;
    } else if (m[7]) out += `<span class="tk-num">${m[7]}</span>`;
    else out += esc(m[8]);
  }
  return out;
}
/** <pre> block with GLSL highlighting. Use {{hl:...:hl}} to highlight a part. */
export function codeBlock(code, cls = '') {
  return h('pre.code' + (cls ? '.' + cls : ''), { html: highlight(code.replace(/^\n+|\s+$/g, '')) });
}

// ------------------------------------------------------------------ shader view
const live = new Set();
let loopOn = false;
function loop() {
  const t = renderer().time;
  for (const v of live) {
    if (!v.el.isConnected) { live.delete(v); continue; }
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    v.draw(t);
  }
  if (live.size) requestAnimationFrame(loop); else loopOn = false;
}
function startLoop() { if (!loopOn) { loopOn = true; requestAnimationFrame(loop); } }

export function usesTime(spec) {
  return !!(spec && (spec.animate || (spec.camera && spec.camera.spin) || /uTime/.test((spec.frag || '') + (spec.vert || '') + (spec.defs || '') + (spec.vdefs || ''))));
}

/**
 * A canvas showing a shader spec.
 * opts: { size: css px (number) or null for 100% width, res: pixel resolution, caption, animate, onTap(u,v,ev) }
 * Returned element has .update(spec), .setUniforms(obj), .spec
 */
export function shaderView(spec, opts = {}) {
  const el = h('div.sview');
  const cv = h('canvas');
  el.appendChild(cv);
  if (opts.caption) el.appendChild(h('div.cap', opts.caption));
  if (opts.size) { el.style.width = opts.size + 'px'; el.style.height = (opts.height || opts.size) + 'px'; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const res = opts.res || Math.min(400, Math.round((opts.size || 300) * dpr));
  cv.width = res; cv.height = opts.height ? Math.round(res * opts.height / opts.size) : res;
  const ctx = cv.getContext('2d');
  const state = { el, spec };
  const draw = (t) => {
    const r = renderer().renderTo(ctx, state.spec, opts.time ?? t);
    if (r.error) { el.classList.add('err'); el.dataset.err = r.error; } else el.classList.remove('err');
    if (opts.overlay) opts.overlay(ctx, cv.width, cv.height);
  };
  state.draw = draw;
  const refresh = () => {
    if (usesTime(state.spec) && opts.time == null) { live.add(state); startLoop(); }
    else { live.delete(state); draw(renderer().time); }
  };
  el.update = (s) => { state.spec = s; el.spec = s; refresh(); };
  el.setUniforms = (u) => { state.spec = { ...state.spec, uniforms: { ...(state.spec.uniforms || {}), ...u } }; el.spec = state.spec; refresh(); };
  el.redraw = () => draw(renderer().time);
  el.spec = spec;
  el.canvas = cv;
  if (opts.onTap) {
    const handler = (ev) => {
      const r = cv.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      const u = (p.clientX - r.left) / r.width, v = 1 - (p.clientY - r.top) / r.height;
      opts.onTap(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)), ev);
    };
    cv.addEventListener('pointerdown', handler);
    if (opts.drag) cv.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'touch') handler(ev); });
  }
  // initial draw once connected (so getBoundingClientRect works)
  requestAnimationFrame(refresh);
  return el;
}

// ------------------------------------------------------------------ controls
/**
 * Slider control. def: {name, label, min, max, step, value, fmt(v)}
 */
export function slider(def, onChange) {
  const fmt = def.fmt || ((v) => (+v).toFixed(def.digits ?? (def.step >= 1 ? 0 : 2)));
  const val = h('b', fmt(def.value));
  const input = h('input', { type: 'range', min: def.min, max: def.max, step: def.step ?? 0.01, value: def.value });
  input.addEventListener('input', () => { val.textContent = fmt(+input.value); onChange(+input.value); });
  const el = h('div.ctrl', h('div.lab', h('span', def.label || def.name), val), input);
  el.input = input;
  el.set = (v) => { input.value = v; val.textContent = fmt(+v); };
  return el;
}

export function seg(options, value, onChange) {
  const el = h('div.seg');
  const btns = options.map((o) => {
    const b = h('button', { onclick: () => { btns.forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(o.value); } }, o.label);
    if (o.value === value) b.classList.add('on');
    return b;
  });
  btns.forEach((b) => el.appendChild(b));
  return el;
}

// ------------------------------------------------------------------ meters
export function meters(m) {
  const one = (cls, label, v) => h('div.meter.' + cls,
    h('div.lab', h('span', label), h('span', Math.round(v * 100) + '%')),
    h('div.bar', h('i', { style: { width: Math.round(v * 100) + '%' } })));
  return h('div.meters', one('cov', 'Covered', m.coverage), one('und', 'Understanding', m.understanding), one('ret', 'Retention', m.retention));
}
export function ring(v, icon, color = 'var(--accent)') {
  const r = 20, c = 2 * Math.PI * r;
  const el = h('div.ring');
  el.innerHTML = `<svg width="46" height="46"><circle cx="23" cy="23" r="${r}" fill="none" stroke="#272a37" stroke-width="4"/>
  <circle cx="23" cy="23" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}"/></svg><div class="ico">${icon}</div>`;
  return el;
}

export function toast(msg, ms = 1800) {
  const t = h('div.toast', msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function topbar(title, backHref, extra) {
  return h('div.topbar',
    backHref ? h('button.back', { onclick: () => (backHref === 'back' ? history.back() : (location.hash = backHref)) }, '‹') : null,
    h('div.title', title), extra || null);
}

/** Colour swatch from [r,g,b] 0..1 */
export function swatch(c, label) {
  const t = (x) => Math.round(Math.min(Math.max(x, 0), 1) * 255);
  const el = h('div.swatch', { style: { background: `rgb(${t(c[0])},${t(c[1])},${t(c[2])})` } });
  if (label) return h('div', el, h('div.small.dim.center', label));
  return el;
}

/** Convert rich content (string html | Node | fn(el)) into a node */
export function rich(content) {
  if (content == null) return null;
  if (content instanceof Node) return content;
  if (typeof content === 'function') { const d = h('div'); content(d); return d; }
  return h('div', { html: String(content) });
}
