// Multiple choice. Tap an option to answer.
// item: {
//   prompt, sub, code, shader, shaders, graph, visual, color   (see common.media)
//   options: [ {text|code|shader|color|graph|visual} | 'string' ],
//   answer: index of correct option (default 0),
//   explain: html shown after answering,
//   grid: true → two-column layout (auto when options are visual),
//   noShuffle: true → keep option order
// }
import { h } from '../core/ui.js';
import { media, optionContent, wait } from './common.js';

export default {
  id: 'mcq',
  defaultRounds: 8,
  round({ el, item, rng }) {
    return new Promise((resolve) => {
      el.append(...media(item));
      const opts = item.options.map((o, i) => ({ o: typeof o === 'object' ? o : { text: o }, correct: i === (item.answer ?? 0) }));
      if (!item.noShuffle) rng.shuffle(opts);
      const visual = opts.some(({ o }) => o.shader || o.color || o.graph);
      const grid = item.grid ?? (visual || (opts.length === 4 && opts.every(({ o }) => o.text != null && String(o.text).length < 14 && !o.code)));
      const box = h('div.options' + (grid ? '.grid2' : ''));
      let done = false;
      const btns = opts.map(({ o, correct }) => {
        const b = h('button.opt' + (visual ? '.compact' : ''), ...optionContent(o));
        b.addEventListener('click', async () => {
          if (done) return; done = true;
          b.classList.add(correct ? 'right' : 'wrong');
          if (!correct) btns.forEach((x, j) => { if (opts[j].correct) x.classList.add('right'); });
          await wait(450);
          resolve({ score: correct ? 1 : 0, explain: item.explain });
        });
        return b;
      });
      btns.forEach((b) => box.appendChild(b));
      el.appendChild(box);
    });
  },
};
