// Fill the blanks in shader code (from token chips) so the output matches a target.
// item: {
//   prompt, sub,
//   template: 'col = vec3(step([[0]], uv.x));'   ([[i]] marks blank number i)
//   slots: [{ options: ['0.5', 'uv.y', ...], answer: '0.5' }]
//   build(values: string[]) -> shader spec          (values in slot order)
//   target?: spec (defaults to build(answers))
//   noTarget: true → no target image (e.g. "make it compile" / logic questions)
//   explain
// }
// Scoring: exact answers = 100%. Any other combination that renders the same
// image as the target also counts as correct (there is often more than one way!).
import { h, shaderView, highlight } from '../core/ui.js';
import { renderer } from '../core/renderer.js';

const EMPTY = { frag: 'col = vec3(0.1 + 0.04 * checker(uv, 8.0));' };

export default {
  id: 'codefill',
  defaultRounds: 5,
  round({ el, item, rng }) {
    return new Promise((resolve) => {
      if (item.prompt) el.append(h('div.prompt', { html: item.prompt + (item.sub ? `<span class="sub">${item.sub}</span>` : '') }));
      const answers = item.slots.map((s) => s.answer);
      const vals = item.slots.map(() => null);
      const target = item.target || (item.build ? item.build(answers) : null);
      let yView = null;
      if (target && !item.noTarget) {
        yView = shaderView(EMPTY, { caption: 'Yours (fill all blanks)' });
        el.append(h('div.pair', shaderView(target, { caption: 'Target' }), yView));
      }
      let active = 0;
      const code = h('pre.code.wrap');
      const chips = h('div.chips');
      const render = () => {
        code.innerHTML = highlight(item.template);
        code.querySelectorAll('.tk-blank').forEach((b) => {
          const i = +b.dataset.slot;
          b.textContent = vals[i] ?? '?';
          b.classList.toggle('active', i === active);
          b.onclick = () => { active = i; render(); };
        });
        chips.innerHTML = '';
        const opts = item.slots[active]._shuffled ||= rng.shuffle(item.slots[active].options.slice());
        opts.forEach((o) => chips.append(h('button.chip' + (vals[active] === o ? '.sel' : ''), {
          onclick: () => {
            vals[active] = o;
            const nextEmpty = vals.findIndex((v) => v == null);
            if (nextEmpty >= 0) active = nextEmpty;
            render();
            if (yView) yView.update(vals.some((v) => v == null) ? EMPTY : item.build(vals));
          },
        }, o)));
        btn.disabled = vals.some((v) => v == null);
      };
      const btn = h('button.btn.block', 'Check');
      el.append(code, h('div.small.dim', 'Tap a blank, then pick a token.'), chips, h('div.spacer'), btn);
      render();
      btn.onclick = () => {
        btn.disabled = true;
        const exact = vals.every((v, i) => v === answers[i]);
        let score;
        if (exact) score = 1;
        else if (target && item.build && !item.exactOnly) {
          const d = renderer().diff(item.build(vals), target, 48, 0.37);
          const right = vals.filter((v, i) => v === answers[i]).length / vals.length;
          score = d < 0.006 ? 1 : right * 0.6;
        } else score = vals.filter((v, i) => v === answers[i]).length / vals.length * 0.7;
        const sol = item.template.replace(/\[\[(\d+)\]\]/g, (_, i) => `{{hl:${answers[+i]}:hl}}`);
        const d = h('div');
        if (score < 1) { d.append(h('p', 'One correct solution:')); const pre = h('pre.code.wrap', { html: highlight(sol) }); d.append(pre); }
        else if (!exact) d.append(h('p', '✨ Different code from ours, same image — that counts!'));
        if (item.explain) d.append(h('div', { html: item.explain }));
        resolve({ score, explain: d });
      };
    });
  },
};
