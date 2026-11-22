// "Tune it": match a target image by moving sliders.
// item: {
//   prompt, sub,
//   build(values) -> shader spec   (values = {paramName: number})
//   params: [{name, label, min, max, step, target, start}],
//   code?(values) -> glsl string shown live under the sliders (great for seeing numbers change)
//   tolerance: fraction of slider range counted as perfect (default 0.05)
//   compare: 'params' (default) or 'pixels' (when several answers look the same)
//   explain
// }
import { h, shaderView, slider, codeBlock } from '../core/ui.js';
import { renderer } from '../core/renderer.js';
import { n } from '../core/glsl.js';

export default {
  id: 'slider',
  defaultRounds: 4,
  round({ el, item, rng }) {
    return new Promise((resolve) => {
      const vals = {}, target = {};
      for (const p of item.params) {
        target[p.name] = p.target;
        vals[p.name] = p.start ?? (() => {
          // start somewhere clearly different from the target
          const span = p.max - p.min;
          let s; let k = 0;
          do { s = p.min + Math.round((rng.float(0, 1) * span) / (p.step || 0.01)) * (p.step || 0.01); k++; } while (Math.abs(s - p.target) < span * 0.25 && k < 20);
          return +s.toFixed(4);
        })();
      }
      if (item.prompt) el.append(h('div.prompt', { html: item.prompt + (item.sub ? `<span class="sub">${item.sub}</span>` : '') }));
      const tView = shaderView(item.build(target), { caption: 'Target' });
      const yView = shaderView(item.build(vals), { caption: 'Yours' });
      el.append(h('div.pair', tView, yView));
      const codeHost = h('div');
      const showCode = () => { if (item.code) { codeHost.innerHTML = ''; codeHost.append(codeBlock(item.code(vals))); } };
      showCode();
      el.append(codeHost);
      for (const p of item.params) {
        el.append(slider({ ...p, value: vals[p.name] }, (v) => { vals[p.name] = v; yView.update(item.build(vals)); showCode(); }));
      }
      const btn = h('button.btn.block', 'Check');
      el.append(btn);
      btn.onclick = () => {
        btn.disabled = true;
        let score;
        const tol = item.tolerance ?? 0.05;
        if (item.compare === 'pixels') {
          const d = renderer().diff(item.build(vals), item.build(target));
          score = Math.max(0, Math.min(1, 1 - (d - 0.012) / 0.1));
        } else {
          const per = item.params.map((p) => {
            const e = Math.abs(vals[p.name] - p.target) / (p.max - p.min);
            return e <= tol ? 1 : Math.max(0, 1 - (e - tol) / 0.2);
          });
          score = per.reduce((a, b) => a + b, 0) / per.length;
        }
        const ans = item.params.map((p) => `${p.label || p.name}: you <b>${n(vals[p.name])}</b>, target <b>${n(p.target)}</b>`).join('<br>');
        resolve({ score, answerText: `<p class="small">${ans}</p>`, explain: item.explain });
      };
    });
  },
};
