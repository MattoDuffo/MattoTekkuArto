import { h, topbar, seg } from '../core/ui.js';
import * as cur from '../core/curriculum.js';
import * as store from '../core/store.js';
import { runSession, roundsFor } from '../core/runner.js';
import { buildPractice, dueConcepts } from '../core/practice.js';

export function playView(root, cid, gid, query) {
  const c = cur.getConcept(cid), g = cur.getGame(cid, gid);
  if (!c || !g) return root.append(h('p', 'Game not found'));
  const fromPath = query.get('path') === '1';
  const n = roundsFor(g);
  const start = () => runSession(root, {
    title: g.title,
    kind: 'game',
    plan: Array.from({ length: n }, () => ({ concept: c, game: g })),
    onExit: () => { location.hash = '/concept/' + cid; },
    onAgain: () => { root.innerHTML = ''; start(); },
    onNext: fromPath ? () => { location.hash = cur.continueHref().slice(1); } : null,
    nextLabel: 'Continue learning path ▶',
  });
  // Intro card first (shows what the game is about)
  const gr = store.gameRecord(cid, gid);
  root.append(topbar(g.title, '#/concept/' + cid));
  root.append(h('div.card',
    h('div.small.dim', `${c.topic.icon} ${c.topic.title} · ${c.title}`),
    g.blurb ? h('p', { html: g.blurb }) : null,
    g.howto ? h('p.small.dim', { html: g.howto }) : null,
    h('div.small.dim', `${n} rounds · ~${Math.max(2, Math.round(n * (g.engine === 'mcq' ? 0.3 : 0.6)))} min`)));
  let level = gr.level;
  root.append(h('div.small.dim', 'Difficulty'), seg([1, 2, 3].map((l) => ({ label: ['Level 1 · gentle', 'Level 2', 'Level 3 · tough'][l - 1], value: l })), level, (v) => { level = v; store.setGameLevel(cid, gid, v); }));
  root.append(h('div.spacer'), h('button.btn.block', { onclick: () => { root.innerHTML = ''; start(); } }, 'Start ▶'));
  if (c.lesson.length) root.append(h('div.spacer'), h('button.btn.block.ghost', { onclick: () => (location.hash = '/lesson/' + cid) }, '📖 Re-read the lesson first'));
}

export function practiceView(root) {
  root.append(h('h1', '🧠 Practice'));
  root.append(h('p.dim', 'Short mixed sessions built from what you\'ve already started. Concepts that are fading from memory (low retention) or still shaky come first.'));
  const due = dueConcepts();
  const go = (q) => (location.hash = '/practice/run?' + q);
  root.append(
    h('div.card.tap', { onclick: () => go('mode=smart&rounds=10') }, h('b', '✨ Smart review · 10 rounds'), h('div.small.dim', 'Best default: a mix of fading and weak concepts. ~4 min.')),
    h('div.card.tap', { onclick: () => go('mode=due&rounds=8') }, h('div.row', h('b.grow', '⏰ Due for review · 8 rounds'), due.length ? h('span.pill.warn', due.length + ' due') : h('span.pill.good', 'nothing due')), h('div.small.dim', 'Focus on concepts whose retention dropped.')),
    h('div.card.tap', { onclick: () => go('mode=weak&rounds=8') }, h('b', '🎯 Weak spots · 8 rounds'), h('div.small.dim', 'Concepts where your understanding is lowest.')),
    h('div.card.tap', { onclick: () => go('mode=mixed&rounds=5') }, h('b', '⚡ Quick 5'), h('div.small.dim', 'Five random rounds from anything you\'ve started. ~2 min.')),
    h('div.card.tap', { onclick: () => go('mode=mixed&rounds=15') }, h('b', '🏋️ Long mix · 15 rounds'), h('div.small.dim', 'A bigger workout. ~6 min.')),
  );
  root.append(h('h2', 'By topic'));
  for (const t of cur.topics) {
    const started = t.concepts.filter(store.isStarted).length;
    root.append(h('div.card.tap', { onclick: () => go('topic=' + t.id) }, h('div.row', h('span', t.icon), h('b.grow', t.title), h('span.small.dim', `${started}/${t.concepts.length} started`))));
  }
}

export function practiceRunView(root, query) {
  const opts = {
    topicId: query.get('topic') || undefined,
    conceptId: query.get('concept') || undefined,
    rounds: +(query.get('rounds') || 10),
    mode: query.get('mode') || 'smart',
  };
  const { plan, note } = buildPractice(opts);
  if (!plan.length) { root.append(topbar('Practice', '#/practice'), h('p', 'Nothing to practice here yet.')); return; }
  const start = () => runSession(root, {
    title: 'Practice',
    kind: 'practice',
    plan: buildPractice(opts).plan,
    onExit: () => { location.hash = opts.conceptId ? '/concept/' + opts.conceptId : '/practice'; },
    onAgain: () => { root.innerHTML = ''; start(); },
  });
  if (note) {
    root.append(topbar('Practice', '#/practice'), h('div.card', note), h('button.btn.block', { onclick: () => { root.innerHTML = ''; start(); } }, 'Start ▶'));
  } else start();
}
