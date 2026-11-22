// Shared rendering helpers for engines.
import { h, codeBlock, shaderView, swatch, rich } from '../core/ui.js';
import { graph } from '../core/draw2d.js';

/**
 * Render the "media" part of an item (prompt visuals). Supported fields:
 *  prompt (html), sub (html), code (glsl string), shader (spec), shaders: [{spec, label}],
 *  graph: {fns, opts}, visual: fn(el), color: [r,g,b], colors: [[r,g,b], ...]
 */
export function media(item, opts = {}) {
  const out = [];
  if (item.prompt) out.push(h('div.prompt', { html: item.prompt + (item.sub ? `<span class="sub">${item.sub}</span>` : '') }));
  if (item.code) out.push(codeBlock(item.code, item.codeWrap ? 'wrap' : ''));
  if (item.shader) out.push(h('div.view-wrap', shaderView(item.shader, { size: opts.size || item.size || 220, caption: item.shaderCaption, onTap: opts.onTap })));
  if (item.shaders) {
    out.push(h('div.pair', item.shaders.map((s) => h('div', shaderView(s.spec || s, { caption: s.caption }), s.label ? h('div.lbl', { html: s.label }) : null))));
  }
  if (item.graph) out.push(graph(item.graph.fns, item.graph.opts || {}, 320));
  if (item.color) out.push(h('div', { style: { width: '120px', margin: '8px auto' } }, swatch(item.color)));
  if (item.visual) { const d = h('div'); item.visual(d); out.push(d); }
  return out;
}

/** Render one answer option's content */
export function optionContent(o) {
  const parts = [];
  if (o.shader) parts.push(shaderView(o.shader, { res: 200 }));
  if (o.color) parts.push(swatch(o.color));
  if (o.graph) parts.push(graph(o.graph.fns, o.graph.opts || {}, 160, 110));
  if (o.visual) { const d = h('div'); o.visual(d); parts.push(d); }
  if (o.code) parts.push(codeBlock(o.code));
  if (o.text != null) parts.push(h('div', { html: String(o.text) }));
  if (typeof o === 'string' || typeof o === 'number') parts.push(h('div', { html: String(o) }));
  return parts;
}

export function submitButton(label = 'Check') {
  return h('button.btn.block', label);
}

export function explainOf(item, extra) {
  if (!extra) return item.explain;
  if (!item.explain) return extra;
  const d = h('div');
  d.append(rich(extra), rich(item.explain));
  return d;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
