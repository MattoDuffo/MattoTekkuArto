// "Be the GPU": you are the fragment shader. Paint each pixel of a small grid
// with the colour the shader code would output for that pixel.
// item: {
//   prompt, sub, code (the shader you are executing) ... (media),
//   w, h: grid size (default 6x6)
//   palette: [{color:[r,g,b], label:'0'}]  (at least 2)
//   solve(u, v, x, y) -> palette index for the pixel whose centre is (u,v)
//   showUV: true → print uv in each cell; start: initial palette index (default 0)
//   explain
// }
import { h } from '../core/ui.js';
import { css } from '../core/glsl.js';
import { media } from './common.js';

export default {
  id: 'paint',
  defaultRounds: 4,
  round({ el, item }) {
    return new Promise((resolve) => {
      el.append(...media(item));
      const W = item.w || 6, H = item.h || 6;
      const pal = item.palette;
      let cur = pal.length > 1 ? 1 : 0;
      const cells = [];
      const grid = h('div.pgrid', { style: { gridTemplateColumns: `repeat(${W}, 1fr)`, maxWidth: Math.min(340, W * 56) + 'px' } });
      for (let row = H - 1; row >= 0; row--) {
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W, v = (row + 0.5) / H;
          const c = { x, y: row, u, v, val: item.start ?? 0, el: null };
          c.el = h('div.cell', item.showUV ? `${fmt(u)},${fmt(v)}` : '');
          c.el.dataset.k = cells.length;
          cells.push(c);
          grid.append(c.el);
        }
      }
      const paintCell = (c) => { c.el.style.background = css(pal[c.val].color); };
      cells.forEach(paintCell);
      // drag painting
      let down = false;
      const at = (ev) => {
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        if (t && t.dataset && t.dataset.k != null && grid.contains(t)) { const c = cells[+t.dataset.k]; if (c.val !== cur) { c.val = cur; paintCell(c); } }
      };
      grid.addEventListener('pointerdown', (ev) => { down = true; grid.setPointerCapture?.(ev.pointerId); at(ev); });
      grid.addEventListener('pointermove', (ev) => { if (down) at(ev); });
      window.addEventListener('pointerup', () => (down = false));
      const palEl = h('div.palette');
      const pbtns = pal.map((p, i) => {
        const b = h('button', { style: { background: css(p.color) }, onclick: () => { cur = i; pbtns.forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); } }, p.label ?? '');
        return b;
      });
      pbtns[cur].classList.add('sel');
      pbtns.forEach((b) => palEl.append(b));
      const btn = h('button.btn.block', 'Run on GPU ▶');
      el.append(h('div.small.dim.center', 'Pick a colour, then tap or drag over pixels. Bottom-left is uv (0,0).'), palEl, grid, btn);
      btn.onclick = () => {
        btn.disabled = true;
        let right = 0;
        cells.forEach((c) => {
          const want = item.solve(c.u, c.v, c.x, c.y);
          if (want === c.val) right++;
          else c.el.classList.add('x');
          c.want = want;
        });
        // show the GPU answer next to it
        const ans = h('div.pgrid', { style: { gridTemplateColumns: `repeat(${W}, 1fr)`, maxWidth: Math.min(200, W * 34) + 'px' } });
        cells.forEach((c) => ans.append(h('div.cell', { style: { background: css(pal[c.want].color) } })));
        const score = right / cells.length;
        resolve({
          score: score >= 0.999 ? 1 : score * score,
          answerText: `<p>${right}/${cells.length} pixels correct.${score < 1 ? ' The GPU would output:' : ''}</p>`,
          explain: (d) => { if (score < 1) d.append(ans); if (item.explain) d.append(h('div', { html: item.explain })); },
        });
      };
    });
  },
};
function fmt(x) { return (+x.toFixed(2)).toString().replace(/^0\./, '.'); }
