// Lesson = a series of short slides. Each slide can contain text, code, a live
// shader with sliders, a graph, a custom visual and a tiny self-check quiz.
//
// Slide format:
// {
//   title: 'What is uv?',
//   body: '<p>html…</p>',                      // supports <div class="note|tip|analogy">
//   controls: [{name:'k', label:'k', min:0, max:1, step:0.01, value:0.5}],
//   shader: spec | (vals) => spec,               // live preview (vals = control values)
//   shaders: [{spec | fn, label}] side by side
//   code: 'glsl' | (vals) => 'glsl',             // live code
//   graph: { fns: [...] | (vals)=>[...], opts: {...} | (vals)=>{...} },
//   visual: (el, vals) => void                   // custom DOM/canvas; re-called on control change
//   after: '<p>html shown under the demo</p>',
//   quiz: { q:'…', options:['a','b'], answer:0, explain:'…' }
// }
import { h, codeBlock, shaderView, slider, topbar, highlight } from '../core/ui.js';
import { graph } from '../core/draw2d.js';
import * as cur from '../core/curriculum.js';
import * as store from '../core/store.js';

/** Highlight <pre class="code"> blocks inside authored html */
export function enhance(el) {
  el.querySelectorAll('pre.code').forEach((p) => { p.innerHTML = highlight(p.textContent.replace(/^\n+|\s+$/g, '')); });
  return el;
}

export function lessonView(root, cid, query) {
  const c = cur.getConcept(cid);
  if (!c) return root.append(h('p', 'Concept not found'));
  const slides = c.lesson;
  const rec = store.conceptRecord(cid);
  let i = query.get('slide') ? +query.get('slide') : 0;
  if (rec && !rec.lessonDone && rec.lessonSeen > 0 && rec.lessonSeen < slides.length && !query.get('slide')) i = Math.max(0, rec.lessonSeen - 1);
  const fromPath = query.get('path') === '1';

  root.append(topbar('📖 ' + c.title, '#/concept/' + cid));
  const dots = h('div.slide-dots');
  const body = h('div.lesson-body');
  const nav = h('div.row', { style: { marginTop: '16px' } });
  root.append(dots, body, nav);

  function show() {
    store.markSlide(cid, i, slides.length);
    const s = slides[i];
    dots.innerHTML = '';
    const seen = (store.conceptRecord(cid) || {}).lessonSeen || 0;
    slides.forEach((_, k) => dots.append(h('i', { class: k === i ? 'on' : k < seen ? 'seen' : '' })));
    body.innerHTML = '';
    body.append(h('h2', { style: { marginTop: '4px' } }, s.title || ''));
    if (s.body) body.append(enhance(h('div', { html: s.body })));
    renderDemo(body, s);
    if (s.after) body.append(enhance(h('div', { html: s.after })));
    if (s.quiz) body.append(quiz(s.quiz));
    nav.innerHTML = '';
    nav.append(h('button.btn.ghost', { disabled: i === 0, onclick: () => { i--; show(); scrollTo(0, 0); } }, '‹ Back'));
    if (i < slides.length - 1) {
      nav.append(h('button.btn.grow', { onclick: () => { i++; show(); scrollTo(0, 0); } }, 'Next ›'));
    } else {
      nav.append(h('button.btn.good.grow', {
        onclick: () => {
          store.markLessonDone(cid, slides.length);
          if (fromPath) location.hash = cur.continueHref().slice(1);
          else {
            const step = cur.nextStepIn(c);
            location.hash = step && step.kind === 'game' ? `/play/${cid}/${step.game.id}` : '/concept/' + cid;
          }
        },
      }, 'Done — play the games ▶'));
    }
  }
  show();
}

export function renderDemo(host, s) {
  const vals = {};
  for (const ct of s.controls || []) vals[ct.name] = ct.value;
  const views = [];
  const dyn = (x) => (typeof x === 'function' ? x(vals) : x);
  let view = null, codeHost = null, graphEl = null, visualHost = null;
  if (s.shader) { view = shaderView(dyn(s.shader), { size: s.size || 220, caption: s.caption }); host.append(h('div.view-wrap', view)); }
  if (s.shaders) {
    const pair = h('div.pair');
    s.shaders.forEach((sh) => { const v = shaderView(dyn(sh.spec), { caption: sh.caption }); views.push([v, sh]); pair.append(h('div', v, sh.label ? h('div.lbl', { html: sh.label }) : null)); });
    host.append(pair);
  }
  if (s.graph) { graphEl = graph(dyn(s.graph.fns), dyn(s.graph.opts) || {}, 320); host.append(graphEl); }
  if (s.visual) { visualHost = h('div'); host.append(visualHost); s.visual(visualHost, vals); }
  if (s.code) { codeHost = h('div'); codeHost.append(codeBlock(dyn(s.code), 'wrap')); host.append(codeHost); }
  for (const ct of s.controls || []) {
    host.append(slider(ct, (v) => {
      vals[ct.name] = v;
      if (view && typeof s.shader === 'function') view.update(s.shader(vals));
      views.forEach(([vw, sh]) => { if (typeof sh.spec === 'function') vw.update(sh.spec(vals)); });
      if (codeHost && typeof s.code === 'function') { codeHost.innerHTML = ''; codeHost.append(codeBlock(s.code(vals), 'wrap')); }
      if (graphEl && (typeof s.graph.fns === 'function' || typeof s.graph.opts === 'function')) graphEl.redraw(dyn(s.graph.fns), dyn(s.graph.opts) || {});
      if (visualHost) { visualHost.innerHTML = ''; s.visual(visualHost, vals); }
    }));
  }
}

function quiz(q) {
  const box = h('div.card', h('div.small.dim', 'Quick check'), h('div', { style: { fontWeight: 600, margin: '4px 0 8px' }, html: q.q }));
  const exp = h('div.small', { style: { marginTop: '8px' } });
  let done = false;
  const opts = h('div.options');
  q.options.forEach((o, i) => {
    const b = h('button.opt', { html: String(o) });
    b.onclick = () => {
      if (done) return; done = true;
      b.classList.add(i === q.answer ? 'right' : 'wrong');
      opts.children[q.answer].classList.add('right');
      exp.innerHTML = (i === q.answer ? '✅ ' : '❌ ') + (q.explain || '');
    };
    opts.append(b);
  });
  box.append(opts, exp);
  return box;
}
