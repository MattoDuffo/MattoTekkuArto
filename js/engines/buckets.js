// Rapid sorting: cards appear one at a time, tap the bucket they belong to.
// item: {
//   prompt, sub,
//   buckets: ['Vertex shader', 'Fragment shader'],
//   items: [{ text | code | shader | color, bucket: index, why: 'explanation' }],
//   count?: how many cards to show (default all, shuffled)
//   explain
// }
import { h, codeBlock, shaderView, swatch } from '../core/ui.js';
import { wait } from './common.js';

export default {
  id: 'buckets',
  defaultRounds: 3,
  round({ el, item, rng }) {
    return new Promise((resolve) => {
      if (item.prompt) el.append(h('div.prompt', { html: item.prompt + (item.sub ? `<span class="sub">${item.sub}</span>` : '') }));
      const cards = rng.shuffle(item.items.slice()).slice(0, item.count || item.items.length);
      let k = 0, right = 0;
      const mistakes = [];
      const counter = h('div.small.dim.center');
      const card = h('div.bucket-card');
      const btns = h('div.buckets', { style: { gridTemplateColumns: item.buckets.length === 2 ? '1fr 1fr' : item.buckets.length === 4 ? '1fr 1fr' : '1fr' } });
      el.append(counter, card, btns);
      let busy = false;
      const show = () => {
        counter.textContent = `${k + 1} / ${cards.length}`;
        card.className = 'bucket-card';
        card.innerHTML = '';
        const c = cards[k];
        if (c.shader) card.append(shaderView(c.shader, { size: 150 }));
        if (c.color) card.append(h('div', { style: { width: '120px' } }, swatch(c.color)));
        if (c.code) card.append(codeBlock(c.code));
        if (c.text) card.append(h('div', { html: c.text }));
      };
      item.buckets.forEach((b, bi) => {
        btns.append(h('button.btn.ghost', {
          onclick: async () => {
            if (busy) return; busy = true;
            const c = cards[k];
            const ok = c.bucket === bi;
            if (ok) right++; else mistakes.push(c);
            card.classList.add(ok ? 'flash-good' : 'flash-bad');
            if (!ok) card.append(h('div.small', { style: { color: 'var(--bad)' } }, '→ ' + item.buckets[c.bucket]));
            await wait(ok ? 350 : 1100);
            k++; busy = false;
            if (k >= cards.length) finish(); else show();
          },
        }, b));
      });
      show();
      function finish() {
        const d = h('div');
        if (mistakes.length) {
          d.append(h('p', 'You mixed up:'));
          const ul = h('ul');
          mistakes.forEach((m) => ul.append(h('li', { html: `${m.text || (m.code ? '<code>' + m.code.replace(/</g, '&lt;') + '</code>' : 'that card')} → <b>${item.buckets[m.bucket]}</b>${m.why ? '. ' + m.why : ''}` })));
          d.append(ul);
        }
        if (item.explain) d.append(h('div', { html: item.explain }));
        resolve({ score: right / cards.length, answerText: `<p>${right}/${cards.length} sorted correctly.</p>`, explain: d });
      }
    });
  },
};
