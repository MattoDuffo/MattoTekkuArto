// 2D canvas drawing helpers: function graphs, vectors, triangles, etc.
import { h } from './ui.js';

/** Create a hi-dpi 2D canvas element. Returns {el, ctx, w, h} with ctx scaled to css px. */
export function canvas2d(cssW = 300, cssH = cssW, cls = '') {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const el = h('canvas' + cls);
  el.width = Math.round(cssW * dpr); el.height = Math.round(cssH * dpr);
  el.style.width = '100%'; el.style.maxWidth = cssW + 'px'; el.style.aspectRatio = `${cssW}/${cssH}`;
  el.style.display = 'block'; el.style.margin = '0 auto'; el.style.borderRadius = '12px'; el.style.background = '#0e0f15';
  const ctx = el.getContext('2d');
  ctx.scale(dpr, dpr);
  return { el, ctx, w: cssW, h: cssH };
}

const COLORS = ['#ffd479', '#6bdfff', '#ff7ab2', '#3ddc97', '#c7b8ff', '#ff9f43'];

/**
 * Plot y = f(x) functions.
 * fns: [{f: x=>y, color, label, width, dash}]
 * opts: {xmin, xmax, ymin, ymax, grid:true, points:[{x,y,color,label}], vlines:[{x,color,label}], hlines, labels:true}
 */
export function plot(target, fns, opts = {}) {
  const { ctx, w, h: H } = target;
  const xmin = opts.xmin ?? 0, xmax = opts.xmax ?? 1, ymin = opts.ymin ?? -0.1, ymax = opts.ymax ?? 1.1;
  const pad = 26;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (w - pad - 8);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - pad - 8);
  ctx.clearRect(0, 0, w, H);
  ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, w, H);
  // grid
  ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#6c7289';
  const nice = (span) => { const s = span / 5; const p = Math.pow(10, Math.floor(Math.log10(s))); const m = s / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
  const sx = opts.xstep ?? nice(xmax - xmin), sy = opts.ystep ?? nice(ymax - ymin);
  ctx.lineWidth = 1;
  for (let x = Math.ceil(xmin / sx) * sx; x <= xmax + 1e-9; x += sx) {
    ctx.strokeStyle = Math.abs(x) < 1e-9 ? '#4a4f63' : '#22252f';
    ctx.beginPath(); ctx.moveTo(X(x), Y(ymin)); ctx.lineTo(X(x), Y(ymax)); ctx.stroke();
    ctx.fillText(+x.toFixed(2) + '', X(x) - 6, H - 10);
  }
  for (let y = Math.ceil(ymin / sy) * sy; y <= ymax + 1e-9; y += sy) {
    ctx.strokeStyle = Math.abs(y) < 1e-9 ? '#4a4f63' : '#22252f';
    ctx.beginPath(); ctx.moveTo(X(xmin), Y(y)); ctx.lineTo(X(xmax), Y(y)); ctx.stroke();
    ctx.fillText(+y.toFixed(2) + '', 2, Y(y) + 3);
  }
  for (const l of opts.vlines || []) {
    ctx.strokeStyle = l.color || '#888'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(l.x), Y(ymin)); ctx.lineTo(X(l.x), Y(ymax)); ctx.stroke(); ctx.setLineDash([]);
    if (l.label) { ctx.fillStyle = l.color || '#888'; ctx.fillText(l.label, X(l.x) + 3, Y(ymax) + 10); }
  }
  for (const l of opts.hlines || []) {
    ctx.strokeStyle = l.color || '#888'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(xmin), Y(l.y)); ctx.lineTo(X(xmax), Y(l.y)); ctx.stroke(); ctx.setLineDash([]);
  }
  fns.forEach((fn, i) => {
    ctx.strokeStyle = fn.color || COLORS[i % COLORS.length];
    ctx.lineWidth = fn.width || 2.5;
    if (fn.dash) ctx.setLineDash(fn.dash);
    ctx.beginPath();
    const N = 300; let pen = false, prevY = null;
    for (let k = 0; k <= N; k++) {
      const x = xmin + ((xmax - xmin) * k) / N;
      let y = fn.f(x);
      if (!isFinite(y)) { pen = false; continue; }
      y = Math.max(ymin - 10, Math.min(ymax + 10, y));
      // break line on big jumps (discontinuities like step/fract)
      if (pen && prevY != null && Math.abs(y - prevY) > (ymax - ymin) * 0.35) pen = false;
      if (!pen) { ctx.moveTo(X(x), Y(y)); pen = true; } else ctx.lineTo(X(x), Y(y));
      prevY = y;
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (fn.label) { ctx.fillStyle = fn.color || COLORS[i % COLORS.length]; ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.fillText(fn.label, pad + 4, 14 + i * 14); }
  });
  for (const p of opts.points || []) {
    ctx.fillStyle = p.color || '#fff';
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r || 5, 0, Math.PI * 2); ctx.fill();
    if (p.label) { ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillText(p.label, X(p.x) + 7, Y(p.y) - 7); }
  }
  return { X, Y, inv: (px, py) => [xmin + ((px - pad) / (w - pad - 8)) * (xmax - xmin), ymin + ((H - pad - py) / (H - pad - 8)) * (ymax - ymin)] };
}

/** Make a standalone graph element. Same args as plot(). */
export function graph(fns, opts = {}, size = 300, hgt) {
  const c = canvas2d(size, hgt || Math.round(size * 0.7));
  plot(c, fns, opts);
  c.el.redraw = (f2, o2) => plot(c, f2 || fns, o2 || opts);
  return c.el;
}

/** Draw an arrow in pixel space */
export function arrow(ctx, x0, y0, x1, y1, color = '#fff', width = 3, head = 10) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  if (Math.hypot(x1 - x0, y1 - y0) < 2) return;
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4));
  ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
}

/**
 * A 2D vector plane in range [-R, R]. Returns {el, ctx, w, toPx([x,y]), toWorld(px,py), clear(), arrow(v, color, label, from)}
 */
export function vectorPlane(R = 2, size = 320) {
  const c = canvas2d(size, size, '.vec-canvas');
  const { ctx, w } = c;
  const toPx = (p) => [w / 2 + (p[0] / R) * (w / 2 - 10), w / 2 - (p[1] / R) * (w / 2 - 10)];
  const toWorld = (px, py) => [((px - w / 2) / (w / 2 - 10)) * R, (-(py - w / 2) / (w / 2 - 10)) * R];
  const clearPlane = (opts = {}) => {
    ctx.clearRect(0, 0, w, w); ctx.fillStyle = '#0e0f15'; ctx.fillRect(0, 0, w, w);
    ctx.lineWidth = 1;
    const step = opts.step || (R <= 2 ? 0.5 : 1);
    for (let g = -R; g <= R + 1e-9; g += step) {
      const isAxis = Math.abs(g) < 1e-9, isUnit = Math.abs(Math.abs(g) - 1) < 1e-9;
      ctx.strokeStyle = isAxis ? '#4a4f63' : isUnit ? '#2c3040' : '#1c1f28';
      let [a, b] = toPx([g, -R]), [c2, d] = toPx([g, R]);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c2, d); ctx.stroke();
      [a, b] = toPx([-R, g]); [c2, d] = toPx([R, g]);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c2, d); ctx.stroke();
    }
    if (opts.unitCircle !== false) {
      ctx.strokeStyle = '#3a3f55'; ctx.setLineDash([4, 5]);
      const [cx, cy] = toPx([0, 0]); ctx.beginPath(); ctx.arc(cx, cy, (w / 2 - 10) / R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  };
  const drawArrow = (v, color = '#fff', label, from = [0, 0], width = 3) => {
    const [x0, y0] = toPx(from), [x1, y1] = toPx([from[0] + v[0], from[1] + v[1]]);
    arrow(ctx, x0, y0, x1, y1, color, width);
    if (label) { ctx.fillStyle = color; ctx.font = 'bold 13px -apple-system, sans-serif'; ctx.fillText(label, x1 + 6, y1 - 6); }
  };
  const dot = (p, color = '#fff', r = 5) => { const [x, y] = toPx(p); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  return { ...c, R, toPx, toWorld, clear: clearPlane, arrow: drawArrow, dot };
}
