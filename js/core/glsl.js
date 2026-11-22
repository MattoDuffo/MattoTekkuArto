// JavaScript mirror of common GLSL built-ins so generators can compute the
// "correct answer" on the CPU. Every function works component-wise on
// numbers OR arrays (vec2 = [x,y], vec3 = [r,g,b] ...), just like GLSL.

const isA = Array.isArray;
/** apply fn component-wise over any mix of scalars/arrays */
export function cw(fn, ...args) {
  const len = Math.max(...args.map((a) => (isA(a) ? a.length : 1)));
  if (args.every((a) => !isA(a))) return fn(...args);
  const out = [];
  for (let i = 0; i < len; i++) out.push(fn(...args.map((a) => (isA(a) ? a[i] : a))));
  return out;
}

export const add = (a, b) => cw((x, y) => x + y, a, b);
export const sub = (a, b) => cw((x, y) => x - y, a, b);
export const mul = (a, b) => cw((x, y) => x * y, a, b);
export const div = (a, b) => cw((x, y) => x / y, a, b);
export const neg = (a) => cw((x) => -x, a);

export const abs = (a) => cw(Math.abs, a);
export const sign = (a) => cw(Math.sign, a);
export const floor = (a) => cw(Math.floor, a);
export const ceil = (a) => cw(Math.ceil, a);
export const fract = (a) => cw((x) => x - Math.floor(x), a);
export const mod = (a, b) => cw((x, y) => x - y * Math.floor(x / y), a, b);
export const min = (a, b) => cw(Math.min, a, b);
export const max = (a, b) => cw(Math.max, a, b);
export const clamp = (a, lo, hi) => cw((x, l, h) => Math.min(Math.max(x, l), h), a, lo, hi);
export const saturate = (a) => clamp(a, 0, 1);
export const mix = (a, b, t) => cw((x, y, k) => x * (1 - k) + y * k, a, b, t);
export const step = (edge, x) => cw((e, v) => (v < e ? 0 : 1), edge, x);
export const smoothstep = (e0, e1, x) =>
  cw((a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }, e0, e1, x);
export const pow = (a, b) => cw(Math.pow, a, b);
export const sqrt = (a) => cw(Math.sqrt, a);
export const exp = (a) => cw(Math.exp, a);
export const log = (a) => cw(Math.log, a);
export const sin = (a) => cw(Math.sin, a);
export const cos = (a) => cw(Math.cos, a);
export const tan = (a) => cw(Math.tan, a);
export const atan = (y, x) => (x === undefined ? cw(Math.atan, y) : cw(Math.atan2, y, x));
export const radians = (d) => cw((x) => (x * Math.PI) / 180, d);
export const degrees = (r) => cw((x) => (x * 180) / Math.PI, r);

export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const length = (a) => (isA(a) ? Math.sqrt(dot(a, a)) : Math.abs(a));
export const distance = (a, b) => length(sub(a, b));
export const normalize = (a) => { const l = length(a) || 1; return a.map((v) => v / l); };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const reflect = (I, N) => sub(I, mul(N, 2 * dot(N, I)));
export const lerp = mix; // HLSL name

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const rot2 = (p, a) => [Math.cos(a) * p[0] - Math.sin(a) * p[1], Math.sin(a) * p[0] + Math.cos(a) * p[1]];
export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Same hash as the GPU prelude (approximately — float precision differs a bit).
export const hash = (p) => fract(Math.sin(p[0] * 127.1 + p[1] * 311.7) * 43758.5453123);

// ---------- formatting helpers for writing GLSL strings ----------

/** Format a number as a GLSL float literal: 1 -> "1.0", 0.25 -> "0.25", 1/3 -> "0.333" */
export function f(x, digits = 3) {
  if (!isFinite(x)) return '0.0';
  let s = (+x.toFixed(digits)).toString();
  if (!s.includes('.') && !s.includes('e')) s += '.0';
  if (s === '-0.0') s = '0.0';
  return s;
}
/** "vec3(1.0, 0.5, 0.0)" */
export function v(arr, digits = 3) {
  return `vec${arr.length}(${arr.map((x) => f(x, digits)).join(', ')})`;
}
/** Short human readable number: 0.5, 1, -0.25 */
export function n(x, digits = 3) {
  const s = (+(+x).toFixed(digits)).toString();
  return s === '-0' ? '0' : s;
}
/** Human readable vector "(0.5, 1, 0)" */
export function nv(arr, digits = 3) {
  return `(${arr.map((x) => n(x, digits)).join(', ')})`;
}
/** Round to digits */
export const round = (x, d = 3) => +(+x).toFixed(d);
/** CSS color from 0..1 rgb array */
export function css(c) {
  const t = (x) => Math.round(Math.min(Math.max(x, 0), 1) * 255);
  return `rgb(${t(c[0])},${t(c[1])},${t(c[2])})`;
}
