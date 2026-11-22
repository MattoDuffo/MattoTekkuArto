// Type a number (or a vector) using an on-screen keypad.
// item: {
//   prompt, sub, code, shader, graph, visual ... (media),
//   answer: number | [numbers],
//   labels?: ['x','y'] component labels, wrap?: 'vec2' shows "vec2( _ , _ )"
//   tolerance: absolute tolerance (default 0.011, i.e. two decimals)
//   explain
// }
import { h } from '../core/ui.js';
import { media } from './common.js';
import { n } from '../core/glsl.js';

export default {
  id: 'numeric',
  defaultRounds: 6,
  round({ el, item }) {
    return new Promise((resolve) => {
      el.append(...media(item));
      const ans = Array.isArray(item.answer) ? item.answer : [item.answer];
      const vals = ans.map(() => '');
      let active = 0;
      const tol = item.tolerance ?? 0.011;
      const fields = ans.map((_, i) => {
        const f = h('div.numfield', { onclick: () => { active = i; paint(); } });
        return f;
      });
      const row = h('div.numfields');
      if (item.wrap) row.append(h('span', item.wrap + '('));
      fields.forEach((f, i) => {
        if (i > 0) row.append(h('span', ','));
        row.append(item.labels ? h('div', { style: { textAlign: 'center' } }, h('div.small.dim', item.labels[i]), f) : f);
      });
      if (item.wrap) row.append(h('span', ')'));
      el.append(row);
      const paint = () => fields.forEach((f, i) => {
        f.classList.toggle('active', i === active);
        f.innerHTML = vals[i] === '' ? '<span class="ph">?</span>' : vals[i];
      });
      paint();
      const press = (k) => {
        let s = vals[active];
        if (k === '⌫') s = s.slice(0, -1);
        else if (k === '−') s = s.startsWith('-') ? s.slice(1) : '-' + s;
        else if (k === '.') { if (!s.includes('.')) s = (s === '' || s === '-' ? s + '0' : s) + '.'; }
        else if (k === '→') { active = (active + 1) % fields.length; paint(); return; }
        else if (s.replace('-', '').length < 7) s += k;
        vals[active] = s; paint();
      };
      const keys = ['7', '8', '9', '⌫', '4', '5', '6', '−', '1', '2', '3', '.', '0'];
      const pad = h('div.keypad', keys.map((k) => h('button', { onclick: () => press(k) }, k)));
      if (fields.length > 1) pad.append(h('button', { onclick: () => press('→') }, 'next'));
      const check = h('button.btn', { style: { gridColumn: fields.length > 1 ? 'span 2' : 'span 3' } }, 'Check');
      pad.append(check);
      el.append(pad);
      check.onclick = () => {
        if (vals.some((v) => v === '' || v === '-' || isNaN(parseFloat(v)))) {
          active = vals.findIndex((v) => v === '' || isNaN(parseFloat(v))); paint(); return;
        }
        check.disabled = true;
        let sc = 0;
        ans.forEach((a, i) => {
          const e = Math.abs(parseFloat(vals[i]) - a);
          const ok = e <= tol + 1e-9;
          const close = e <= Math.max(tol * 4, Math.abs(a) * 0.08);
          sc += ok ? 1 : close ? 0.5 : 0;
          fields[i].classList.add(ok ? 'right' : 'wrong');
        });
        const score = sc / ans.length;
        const shown = ans.length > 1 ? (item.wrap || '') + '(' + ans.map((a) => n(a)).join(', ') + ')' : n(ans[0]);
        resolve({ score, answerText: score < 1 ? `<p>Answer: <b class="mono">${shown}</b></p>` : '', explain: item.explain });
      };
    });
  },
};
