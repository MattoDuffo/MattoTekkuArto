// Tap the spot on an image that satisfies a condition.
// item: {
//   prompt, sub, code ... (media, except shader which is the tap target)
//   shader: spec to tap on   OR   draw(ctx, w, h) for a custom 2D canvas
//   target: [u, v] (uv of correct spot)   OR   score(u, v) -> 0..1
//   targets: [[u,v], ...] any of several correct spots
//   radius: uv distance counted as perfect (default 0.06)
//   reveal: [[u,v], ...] where to draw the answer marker (defaults to target)
//   explain
// }
import { h, shaderView } from '../core/ui.js';
import { canvas2d } from '../core/draw2d.js';
import { media } from './common.js';

export default {
  id: 'tap',
  defaultRounds: 6,
  round({ el, item }) {
    return new Promise((resolve) => {
      const { shader, ...rest } = item;
      el.append(...media(rest));
      let pick = null, reveal = false;
      const targets = item.targets || (item.target ? [item.target] : []);
      const overlay = (ctx, w, hh) => {
        const mark = (p, color, r) => {
          const x = p[0] * w, y = (1 - p[1]) * hh;
          ctx.lineWidth = Math.max(2, w / 110); ctx.strokeStyle = '#000';
          ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.5, y); ctx.moveTo(x + r * 0.5, y); ctx.lineTo(x + r * 1.6, y);
          ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y - r * 0.5); ctx.moveTo(x, y + r * 0.5); ctx.lineTo(x, y + r * 1.6); ctx.stroke();
        };
        if (reveal) (item.reveal || targets).forEach((t) => mark(t, '#3ddc97', w / 22));
        if (pick) mark(pick, '#ffffff', w / 26);
      };
      let view;
      const onTap = (u, v) => { if (reveal) return; pick = [u, v]; btn.disabled = false; redraw(); };
      let redraw;
      if (shader) {
        view = shaderView(shader, { size: 300, overlay, onTap, drag: true });
        redraw = () => view.redraw();
        el.append(h('div.view-wrap', view));
      } else {
        const c = canvas2d(300, 300);
        const paint = () => { c.ctx.clearRect(0, 0, 300, 300); item.draw(c.ctx, 300, 300); overlay(c.ctx, 300, 300); };
        redraw = paint;
        const handler = (ev) => { const r = c.el.getBoundingClientRect(); onTap((ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height); };
        c.el.style.touchAction = 'none';
        c.el.addEventListener('pointerdown', handler);
        c.el.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'touch') handler(ev); });
        paint();
        el.append(c.el);
      }
      const btn = h('button.btn.block', { disabled: true, style: { marginTop: '12px' } }, 'Confirm');
      el.append(h('div.small.dim.center', 'Tap (or drag) to place the marker.'), btn);
      btn.onclick = () => {
        btn.disabled = true; reveal = true; redraw();
        let score;
        if (item.score) score = item.score(pick[0], pick[1]);
        else {
          const r = item.radius ?? 0.06;
          const d = Math.min(...targets.map((t) => Math.hypot(t[0] - pick[0], t[1] - pick[1])));
          score = d <= r ? 1 : Math.max(0, 1 - (d - r) / (r * 3));
        }
        resolve({
          score,
          answerText: `<p class="small">You tapped uv ≈ (${pick[0].toFixed(2)}, ${pick[1].toFixed(2)}). Green = answer.</p>`,
          explain: item.explain,
        });
      };
    });
  },
};
