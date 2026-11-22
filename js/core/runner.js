// Runs a game session: a sequence of rounds, each handled by an engine.
// Shows the feedback sheet after every round and a results screen at the end.
import { h, clear, rich, meters } from './ui.js';
import { makeRng } from './rng.js';
import * as store from './store.js';
import { ENGINES } from '../engines/index.js';

/** Produce the next question/item for a game (from gen() or a questions bank). */
export function makeItem(game, rng, level, used) {
  if (typeof game.gen === 'function') return game.gen(rng, level);
  if (Array.isArray(game.questions) && game.questions.length) {
    let pool = game.questions.filter((q) => (q.level || 1) <= level);
    if (!pool.length) pool = game.questions;
    const fresh = pool.filter((q) => !used.has(q));
    const q = rng.pick(fresh.length ? fresh : pool);
    used.add(q);
    return typeof q === 'function' ? q(rng, level) : q;
  }
  throw new Error(`Game "${game.id}" has neither gen() nor questions[]`);
}

export function roundsFor(game) {
  const eng = ENGINES[game.engine];
  return game.rounds || (eng && eng.defaultRounds) || 6;
}

/**
 * opts: {
 *   title, kind: 'game'|'practice',
 *   plan: [{concept, game}]  (one entry per round)
 *   onExit(), onNext?() + nextLabel
 * }
 */
export function runSession(root, opts) {
  document.body.classList.add('fullscreen');
  const plan = opts.plan;
  const rng = makeRng();
  const perConcept = {}, perGame = {};
  const used = new Map();
  const before = {};
  for (const p of plan) if (!before[p.concept.id]) before[p.concept.id] = store.conceptMetrics(p.concept);
  let idx = 0, total = 0;
  let aborted = false;

  clear(root);
  const bar = h('i', { style: { width: '0%' } });
  const scoreEl = h('div.score', '0');
  const quit = h('button.x', { onclick: () => { if (idx === 0 || confirm('Quit this session? Progress from finished rounds is kept.')) { aborted = true; finish(true); } } }, '✕');
  const top = h('div.game-top', quit, h('div.progress', bar), scoreEl);
  const subtitle = h('div.game-title');
  const stage = h('div');
  root.append(top, subtitle, stage);

  async function nextRound() {
    if (aborted) return;
    if (idx >= plan.length) return finish(false);
    const { concept, game } = plan[idx];
    const eng = ENGINES[game.engine];
    bar.style.width = (idx / plan.length) * 100 + '%';
    clear(subtitle);
    subtitle.append(h('span', `${idx + 1}/${plan.length}`), h('span.pill.accent', game.title));
    const level = opts.level || store.gameRecord(concept.id, game.id).level || 1;
    if (opts.kind === 'practice') subtitle.append(h('span.pill', concept.title));
    else subtitle.append(h('span.pill', 'Level ' + level));
    clear(stage);
    window.scrollTo(0, 0);
    const key = concept.id + '/' + game.id;
    if (!used.has(key)) used.set(key, new Set());
    let result;
    try {
      if (!eng) throw new Error('Unknown engine ' + game.engine);
      let item;
      // retry generation a few times if a generator throws
      for (let tries = 0; ; tries++) {
        try { item = makeItem(game, rng, level, used.get(key)); break; } catch (e) { if (tries > 3) throw e; }
      }
      result = await eng.round({ el: stage, item, game, concept, level, rng, roundIndex: idx, totalRounds: plan.length });
    } catch (e) {
      console.error(e);
      stage.append(h('div.card', h('b', 'This round crashed 😬'), h('pre.code.wrap', String(e && e.stack || e))));
      result = { score: null };
    }
    if (aborted) return;
    if (result.score != null) {
      const s = Math.max(0, Math.min(1, result.score));
      store.recordRound(concept.id, game.id, s);
      (perConcept[concept.id] ||= []).push(s);
      (perGame[key] ||= []).push(s);
      total += s;
      scoreEl.textContent = Math.round(total * 10);
      await feedback(s, result);
    } else {
      await feedback(null, result);
    }
    idx++;
    nextRound();
  }

  function feedback(s, result) {
    return new Promise((resolve) => {
      if (result.skipFeedback) return resolve();
      const cls = s == null ? 'mid' : s >= 0.8 ? 'good' : s >= 0.4 ? 'mid' : 'bad';
      const msg = s == null ? 'Skipped' : s >= 0.999 ? pick(['Correct!', 'Nailed it!', 'Exactly!', 'Perfect!']) : s >= 0.8 ? 'Very close!' : s >= 0.4 ? 'Partly right' : 'Not quite';
      const icon = s == null ? '⚠️' : s >= 0.8 ? '✅' : s >= 0.4 ? '🟡' : '❌';
      const sheet = h('div.sheet.' + cls,
        h('div.verdict', icon, ' ', msg, s != null && s < 0.999 && s > 0 ? h('span.pill', Math.round(s * 100) + '%') : null),
        result.answerText ? h('div', { html: result.answerText }) : null,
        result.explain ? h('div.explain', rich(result.explain)) : null,
        h('div.spacer'),
        h('button.btn.block', { onclick: close }, idx + 1 >= plan.length ? 'See results' : 'Continue'));
      const back = h('div.sheet-backdrop');
      document.body.append(back, sheet);
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
      function close() {
        sheet.classList.remove('open');
        back.remove();
        setTimeout(() => sheet.remove(), 260);
        resolve();
      }
    });
  }

  function finish(early) {
    const res = store.finishSession(perConcept, perGame, { practice: opts.kind === 'practice', kind: opts.kind, title: opts.title });
    if (early && !Object.keys(perGame).length) { cleanup(); return opts.onExit(); }
    clear(root);
    const all = Object.values(perGame).flat();
    const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
    const stars = avg >= 0.9 ? 3 : avg >= 0.7 ? 2 : avg >= 0.4 ? 1 : 0;
    root.append(
      h('div.spacer'),
      h('div.stars', '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('div.big-score', Math.round(avg * 100) + '%'),
      h('p.center.dim', avg >= 0.9 ? 'Outstanding — this is sinking in.' : avg >= 0.7 ? 'Solid work. A bit more practice will lock it in.' : avg >= 0.4 ? 'Good effort! Re-read the lesson slides if something felt fuzzy.' : 'Tough one. That\'s how learning feels — try the lesson again, then replay.'),
      ...res.levelChanges.map((lc) => h('div.card.center', lc.up ? `⬆️ Level up! This game is now level ${lc.level}.` : `⬇️ Dropped to level ${lc.level} to rebuild confidence.`)),
    );
    const concepts = [...new Map(plan.map((p) => [p.concept.id, p.concept])).values()];
    for (const c of concepts.slice(0, 8)) {
      const m = store.conceptMetrics(c);
      const b = before[c.id];
      const d = Math.round((m.understanding - b.understanding) * 100);
      root.append(h('div.card', h('div.row', h('b.grow', c.title), d ? h('span.pill.' + (d > 0 ? 'good' : 'bad'), (d > 0 ? '+' : '') + d + '% understanding') : null), meters(m)));
    }
    root.append(h('div.spacer'));
    if (opts.onNext) root.append(h('button.btn.block', { onclick: () => { cleanup(); opts.onNext(); } }, opts.nextLabel || 'Next'), h('div.spacer'));
    if (opts.onAgain) root.append(h('button.btn.block.ghost', { onclick: () => { cleanup(); opts.onAgain(); } }, 'Play again'), h('div.spacer'));
    root.append(h('button.btn.block.ghost', { onclick: () => { cleanup(); opts.onExit(); } }, 'Done'));
    window.scrollTo(0, 0);
  }

  function cleanup() {
    document.body.classList.remove('fullscreen');
    document.querySelectorAll('.sheet, .sheet-backdrop').forEach((e) => e.remove());
  }
  // In case the user navigates away mid-session
  const onHash = () => { aborted = true; cleanup(); window.removeEventListener('hashchange', onHash); };
  window.addEventListener('hashchange', onHash);

  nextRound();
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
