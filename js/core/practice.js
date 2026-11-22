// Builds mixed "rehearsal" sessions from concepts you've already started,
// prioritising what is fading from memory (low retention) or still shaky (low understanding).
import { concepts as ALL } from './curriculum.js';
import * as store from './store.js';
import { makeRng } from './rng.js';

/**
 * opts: { topicId?, conceptId?, rounds = 10, mode: 'smart' | 'due' | 'weak' | 'mixed' }
 * returns { plan: [{concept, game}], note }
 */
export function buildPractice(opts = {}) {
  const rng = makeRng();
  const rounds = opts.rounds || 10;
  let pool = ALL.filter((c) => c.games.length);
  if (opts.topicId) pool = pool.filter((c) => c.topic.id === opts.topicId);
  if (opts.conceptId) pool = pool.filter((c) => c.id === opts.conceptId);
  let started = pool.filter((c) => store.isStarted(c));
  let note = '';
  if (!started.length) {
    started = pool.slice(0, 3);
    note = 'You haven\'t started anything here yet, so this is a taster of the first concepts.';
  }
  const scored = started.map((c) => {
    const ret = store.retention(c.id), und = store.understanding(c.id);
    let p;
    if (opts.mode === 'due') p = (1 - ret) * 1.5 + (store.isDue(c) ? 1 : 0);
    else if (opts.mode === 'weak') p = (1 - und) * 1.5;
    else if (opts.mode === 'mixed') p = rng.float(0, 1);
    else p = (1 - ret) * 0.6 + (1 - und) * 0.5 + (store.isDue(c) ? 0.5 : 0);
    return { c, p: p + rng.float(0, 0.25) };
  }).sort((a, b) => b.p - a.p);
  const K = Math.min(scored.length, opts.conceptId ? 1 : Math.max(2, Math.min(5, Math.ceil(rounds / 2))));
  const chosen = scored.slice(0, K).map((s) => s.c);
  const plan = [];
  for (let i = 0; i < rounds; i++) {
    const c = chosen[i % chosen.length];
    // prefer games you've played (rehearsal) but sometimes try a new one
    const played = c.games.filter((g) => store.gameRecord(c.id, g.id).plays > 0);
    const g = played.length && rng.chance(0.75) ? rng.pick(played) : rng.pick(c.games);
    plan.push({ concept: c, game: g });
  }
  // interleave: shuffle but avoid the same game twice in a row
  rng.shuffle(plan);
  for (let i = 1; i < plan.length; i++) {
    if (plan[i].game === plan[i - 1].game) {
      const j = plan.findIndex((p, k) => k > i && p.game !== plan[i].game);
      if (j > 0) [plan[i], plan[j]] = [plan[j], plan[i]];
    }
  }
  return { plan, note, concepts: chosen };
}

export function dueConcepts() { return ALL.filter((c) => store.isDue(c)); }
