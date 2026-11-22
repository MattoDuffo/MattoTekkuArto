import { h, meters, topbar } from '../core/ui.js';
import * as cur from '../core/curriculum.js';
import * as store from '../core/store.js';
import { ENGINE_INFO } from '../engines/index.js';

export function topicView(root, id) {
  const t = cur.getTopic(id);
  if (!t) return root.append(h('p', 'Topic not found.'));
  root.append(topbar(`${t.icon} ${t.title}`, '#/topics'));
  root.append(h('p.dim', t.blurb || ''), meters(store.aggregate(t.concepts)));
  root.append(h('div.row', { style: { marginTop: '12px' } },
    h('button.btn.grow', { onclick: () => (location.hash = '/practice/run?topic=' + t.id) }, '🧠 Practice topic'),
    t.cheatsheet ? h('button.btn.ghost', { onclick: () => (location.hash = '/cheatsheet/' + t.id) }, '📋 Cheat sheet') : null));
  root.append(h('h2', 'Concepts'));
  t.concepts.forEach((c, i) => {
    root.append(h('div.card.tap', { onclick: () => (location.hash = '/concept/' + c.id) },
      h('div.row', h('b.grow', `${i + 1}. ${c.title}`), store.isComplete(c) ? h('span.pill.good', 'complete') : store.isDue(c) ? h('span.pill.warn', 'review') : null),
      c.blurb ? h('div.small.dim', c.blurb) : null,
      meters(store.conceptMetrics(c))));
  });
}

export function conceptView(root, id) {
  const c = cur.getConcept(id);
  if (!c) return root.append(h('p', 'Concept not found.'));
  root.append(topbar(c.title, '#/topic/' + c.topic.id));
  root.append(h('div.small.dim', `${c.topic.icon} ${c.topic.title}`), c.blurb ? h('p', c.blurb) : null, meters(store.conceptMetrics(c)));
  const rec = store.conceptRecord(c.id);
  if (c.lesson.length) {
    const seen = rec ? rec.lessonSeen : 0;
    root.append(h('div.card.tap', { onclick: () => (location.hash = '/lesson/' + c.id) },
      h('div.row', h('div', { style: { fontSize: '26px' } }, '📖'),
        h('div.grow', h('b', 'Lesson'), h('div.small.dim', `${c.lesson.length} short slides with live demos`)),
        rec && rec.lessonDone ? h('span.pill.good', 'read') : seen ? h('span.pill', `${seen}/${c.lesson.length}`) : h('span.pill.accent', 'start here'))));
  }
  root.append(h('h3', 'Mini-games'));
  for (const g of c.games) {
    const gr = store.gameRecord(c.id, g.id);
    const info = ENGINE_INFO[g.engine] || { icon: '🎮', name: g.engine };
    root.append(h('div.card.tap', { onclick: () => (location.hash = `/play/${c.id}/${g.id}`) },
      h('div.row', h('div', { style: { fontSize: '26px' } }, info.icon),
        h('div.grow', h('b', g.title), h('div.small.dim', g.blurb || info.name)),
        h('div', { style: { textAlign: 'right' } },
          gr.plays ? h('div.pill.' + (gr.best >= 0.8 ? 'good' : gr.best >= 0.5 ? 'warn' : 'bad'), Math.round(gr.best * 100) + '%') : h('div.pill', 'new'),
          h('div.small.dim', 'Lv ' + gr.level)))));
  }
  if (c.games.length > 1) root.append(h('button.btn.block.ghost', { onclick: () => (location.hash = '/practice/run?concept=' + c.id) }, '🔁 Mixed drill of this concept'));
}

export function cheatsheetView(root, id) {
  const t = cur.getTopic(id);
  root.append(topbar('📋 ' + (t ? t.title : ''), 'back'));
  if (t && t.cheatsheet) root.append(h('div.card.lesson-body', { html: t.cheatsheet }));
}
