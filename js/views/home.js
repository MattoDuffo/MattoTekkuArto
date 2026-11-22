import { h, ring, meters } from '../core/ui.js';
import * as cur from '../core/curriculum.js';
import * as store from '../core/store.js';
import { dueConcepts } from '../core/practice.js';

const expanded = new Set();

export function homeView(root) {
  const st = store.getState();
  const next = cur.currentPathConcept();
  const step = next ? cur.nextStepIn(next) : null;
  const due = dueConcepts();

  root.append(
    h('div.row', h('h1.grow', 'Shader Dojo'),
      h('span.pill.warn', '🔥 ' + (st.streak.days || 0)),
      h('span.pill.accent', '✦ ' + st.xp + ' xp')),
  );

  if (next) {
    const label = !step ? 'Review' : step.kind === 'lesson' ? '📖 Lesson' : '🎮 ' + step.game.title;
    root.append(h('div.card.hero.tap', { onclick: () => (location.hash = cur.stepHref(next, step).slice(1)) },
      h('div.small.dim', `Learning path · ${next.topic.icon} ${next.topic.title}`),
      h('h2', { style: { margin: '4px 0' } }, next.title),
      h('div.dim', next.blurb || ''),
      h('div.spacer'),
      h('button.btn.block', 'Continue → ' + label)));
  } else {
    root.append(h('div.card.hero', h('h2', '🏆 Path complete!'), h('p', 'Every concept is complete. Keep your knowledge fresh in Practice.')));
  }

  root.append(h('div.card.tap', { onclick: () => (location.hash = '/practice') },
    h('div.row', h('div.grow', h('b', '🧠 Practice'), h('div.small.dim', due.length ? `${due.length} concept${due.length > 1 ? 's' : ''} fading — a quick review will refresh them.` : 'Rehearse what you have learned.')),
      due.length ? h('span.pill.warn', due.length + ' due') : null)));

  root.append(h('h2', 'Learning path'));
  root.append(h('p.small.dim', 'Follow the topics top to bottom. Each concept = a short lesson + several mini-games. You can jump anywhere at any time.'));

  if (next) expanded.add(next.topic.id);
  for (const t of cur.topics) {
    const agg = store.aggregate(t.concepts);
    const doneCount = t.concepts.filter(store.isComplete).length;
    const open = expanded.has(t.id);
    const list = h('div', { class: open ? '' : 'hidden' });
    const head = h('div.card.tap', {
      onclick: () => { if (expanded.has(t.id)) expanded.delete(t.id); else expanded.add(t.id); list.classList.toggle('hidden'); },
    }, h('div.row', ring(agg.coverage, t.icon),
      h('div.grow', h('b', `${t.order}. ${t.title}`), h('div.small.dim', `${doneCount}/${t.concepts.length} concepts complete`)),
      h('span.dim', open ? '▾' : '▸')));
    t.concepts.forEach((c, i) => {
      const done = store.isComplete(c);
      const isCur = next && next.id === c.id;
      list.append(h('div.path-step.tap' + (done ? '.done' : '') + (isCur ? '.current' : ''), { onclick: () => (location.hash = '/concept/' + c.id) },
        h('div.dot', done ? '✓' : String(i + 1)),
        h('div.grow', h('div', c.title), h('div.small.dim', `${c.lesson.length} slides · ${c.games.length} games`)),
        store.isDue(c) ? h('span.pill.warn', 'review') : null));
    });
    root.append(head, list);
  }
  if (cur.loadErrors.length) {
    root.append(h('div.card', h('b', 'Some topics failed to load'), h('pre.code.wrap', cur.loadErrors.map((e) => e.file + ': ' + (e.error?.message || e.error)).join('\n'))));
  }
}

export function topicsView(root) {
  root.append(h('h1', 'Topics'), h('p.dim.small', `${cur.topics.length} topics · ${cur.concepts.length} concepts · ${cur.totalGames()} games`));
  for (const t of cur.topics) {
    const agg = store.aggregate(t.concepts);
    root.append(h('div.card.tap', { onclick: () => (location.hash = '/topic/' + t.id) },
      h('div.row', h('div', { style: { fontSize: '30px' } }, t.icon), h('div.grow', h('b', t.title), h('div.small.dim', t.blurb || ''))),
      meters(agg)));
  }
}
