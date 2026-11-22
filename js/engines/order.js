// Put things in the right order by tapping them in sequence.
// item: {
//   prompt, sub, code, shader ... (media),
//   items: ['first', 'second', ...]  (correct order; html allowed)  or [{text, code}]
//   code: true on an item list → items rendered as code chips
//   explain
// }
import { h, highlight } from '../core/ui.js';
import { media } from './common.js';

export default {
  id: 'order',
  defaultRounds: 4,
  round({ el, item, rng }) {
    return new Promise((resolve) => {
      el.append(...media(item));
      const correct = item.items.map((x, i) => ({ i, x: typeof x === 'object' ? x : { text: x } }));
      let pool = rng.shuffle(correct.slice());
      // make sure it's not already solved
      if (pool.every((p, k) => p.i === k) && pool.length > 1) [pool[0], pool[1]] = [pool[1], pool[0]];
      const chosen = [];
      const seq = h('div.seq');
      const chips = h('div.chips');
      const label = (x) => x.code ? h('span.mono', { html: highlight(x.code) }) : h('span', { html: x.text });
      const render = () => {
        seq.innerHTML = '';
        if (!chosen.length) seq.append(h('div.dim.small', 'Tap the items below in order…'));
        chosen.forEach((c, k) => seq.append(h('div.item', { onclick: () => { chosen.splice(k, 1); render(); } }, h('span.n', k + 1 + '.'), label(c.x))));
        chips.innerHTML = '';
        pool.forEach((p) => {
          const used = chosen.includes(p);
          chips.append(h('button.chip' + (used ? '.used' : ''), { disabled: used, onclick: () => { chosen.push(p); render(); } }, label(p.x)));
        });
        btn.disabled = chosen.length !== pool.length;
      };
      const btn = h('button.btn.block', 'Check');
      el.append(seq, chips, h('div.small.dim', 'Tap a placed item to remove it.'), h('div.spacer'), btn);
      render();
      btn.onclick = () => {
        btn.disabled = true;
        const items = seq.querySelectorAll('.item');
        let right = 0;
        chosen.forEach((c, k) => { const ok = c.i === k; if (ok) right++; items[k].classList.add(ok ? 'right' : 'wrong'); items[k].onclick = null; });
        const score = right / chosen.length;
        const answer = '<ol class="small">' + correct.map((c) => `<li>${c.x.code ? '<code>' + c.x.code.replace(/</g, '&lt;') + '</code>' : c.x.text}</li>`).join('') + '</ol>';
        resolve({ score, answerText: score < 1 ? '<p>Correct order:</p>' + answer : '', explain: item.explain });
      };
    });
  },
};
