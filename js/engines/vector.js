// Drag vectors on a 2D plane until a condition is met.
// item: {
//   prompt, sub, code ... (media)
//   R: half-size of the plane (default 2)
//   fixed: [{ v:[x,y], color, label, from:[x,y] }]           (static arrows)
//   drag:  [{ v:[x,y], color, label, unit:true, snap:0.05 }] (draggable arrow tips)
//   derived?(vecs) -> [{v, color, label, from}]               (live computed arrows)
//   readout?(vecs) -> html                                    (live numbers)
//   check(vecs) -> score 0..1
//   answer?: [[x,y], ...] arrows revealed after checking
//   explain
// }
import { h } from '../core/ui.js';
import { vectorPlane } from '../core/draw2d.js';
import { media } from './common.js';

export default {
  id: 'vector',
  defaultRounds: 5,
  round({ el, item }) {
    return new Promise((resolve) => {
      el.append(...media(item));
      const R = item.R || 2;
      const P = vectorPlane(R, 320);
      const vecs = item.drag.map((d) => d.v.slice());
      let revealed = false;
      const readout = h('div.readout');
      const draw = () => {
        P.clear({ unitCircle: item.unitCircle });
        (item.fixed || []).forEach((f) => P.arrow(f.v, f.color || '#9aa0b4', f.label, f.from || [0, 0]));
        if (item.derived) item.derived(vecs).forEach((f) => P.arrow(f.v, f.color || '#ff9f43', f.label, f.from || [0, 0], 2.5));
        if (revealed && item.answer) item.answer.forEach((a) => P.arrow(a, 'rgba(61,220,151,0.75)', 'answer', [0, 0], 2));
        item.drag.forEach((d, i) => { P.arrow(vecs[i], d.color || '#ffd479', d.label, [0, 0], 3.5); if (!revealed) P.dot(vecs[i], d.color || '#ffd479', 9); });
        if (item.readout) readout.innerHTML = item.readout(vecs);
      };
      let grab = -1;
      const toW = (ev) => { const r = P.el.getBoundingClientRect(); return P.toWorld(((ev.clientX - r.left) / r.width) * P.w, ((ev.clientY - r.top) / r.height) * P.w); };
      const setV = (i, p) => {
        const d = item.drag[i];
        let v = p;
        if (d.unit) { const l = Math.hypot(v[0], v[1]) || 1; v = [v[0] / l, v[1] / l]; }
        const s = d.snap ?? 0;
        if (s) v = v.map((x) => Math.round(x / s) * s);
        v = v.map((x) => Math.max(-R, Math.min(R, +x.toFixed(3))));
        vecs[i] = v;
      };
      P.el.addEventListener('pointerdown', (ev) => {
        if (revealed) return;
        const p = toW(ev);
        let best = 1e9; grab = 0;
        vecs.forEach((v, i) => { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < best) { best = d; grab = i; } });
        P.el.setPointerCapture?.(ev.pointerId);
        setV(grab, p); draw();
      });
      P.el.addEventListener('pointermove', (ev) => { if (grab >= 0 && !revealed) { setV(grab, toW(ev)); draw(); } });
      P.el.addEventListener('pointerup', () => (grab = -1));
      P.el.addEventListener('pointercancel', () => (grab = -1));
      const btn = h('button.btn.block', { style: { marginTop: '10px' } }, 'Check');
      el.append(P.el, item.readout ? readout : null, h('div.small.dim.center', 'Drag the yellow arrow tip.'), btn);
      draw();
      btn.onclick = () => {
        btn.disabled = true; revealed = true; draw();
        resolve({ score: item.check(vecs), explain: item.explain });
      };
    });
  },
};
