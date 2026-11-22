// Loads all topic modules and provides lookups + the default learning path.
import { TOPIC_FILES } from '../content/index.js';
import * as store from './store.js';

export const topics = [];
export const concepts = [];     // in learning-path order
const conceptById = new Map();
const topicById = new Map();
export const loadErrors = [];

export async function loadCurriculum() {
  const results = await Promise.allSettled(TOPIC_FILES.map((f) => import(`../content/${f}.js`)));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') { loadErrors.push({ file: TOPIC_FILES[i], error: r.reason }); console.error(TOPIC_FILES[i], r.reason); return; }
    const t = r.value.default;
    if (!t || !t.id) { loadErrors.push({ file: TOPIC_FILES[i], error: 'no default export' }); return; }
    t.order = topics.length + 1;
    topics.push(t);
    topicById.set(t.id, t);
    for (const c of t.concepts || []) {
      c.topic = t;
      c.games ||= [];
      c.lesson ||= [];
      for (const g of c.games) g.concept = c;
      concepts.push(c);
      conceptById.set(c.id, c);
    }
  });
}

export const getConcept = (id) => conceptById.get(id);
export const getTopic = (id) => topicById.get(id);
export const getGame = (cid, gid) => (getConcept(cid)?.games || []).find((g) => g.id === gid);

/** First concept on the path that isn't complete yet */
export function currentPathConcept() {
  return concepts.find((c) => !store.isComplete(c)) || null;
}

/** What should you do next inside a concept? → {kind:'lesson'} | {kind:'game', game} | null */
export function nextStepIn(concept) {
  const c = store.conceptRecord(concept.id);
  if (concept.lesson.length && !(c && c.lessonDone)) return { kind: 'lesson' };
  const unplayed = concept.games.find((g) => store.gameRecord(concept.id, g.id).plays === 0);
  if (unplayed) return { kind: 'game', game: unplayed };
  if (store.isComplete(concept)) return null;
  // replay the weakest game
  const weakest = concept.games.slice().sort((a, b) => store.gameRecord(concept.id, a.id).best - store.gameRecord(concept.id, b.id).best)[0];
  return weakest ? { kind: 'game', game: weakest } : null;
}

export function stepHref(concept, step, fromPath = true) {
  if (!step) return `#/concept/${concept.id}`;
  const q = fromPath ? '?path=1' : '';
  return step.kind === 'lesson' ? `#/lesson/${concept.id}${q}` : `#/play/${concept.id}/${step.game.id}${q}`;
}

/** href for "continue learning path" */
export function continueHref() {
  const c = currentPathConcept();
  if (!c) return '#/practice';
  return stepHref(c, nextStepIn(c));
}

export function totalGames() { return concepts.reduce((s, c) => s + c.games.length, 0); }
