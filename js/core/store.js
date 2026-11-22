// Progress persistence + mastery model.
//
// Per concept we track three things the UI shows as meters:
//  • Covered        – how much of the material you've touched (lesson + distinct games played)
//  • Understanding  – how well you perform (moving average of round scores, weighted by confidence)
//  • Retention      – how fresh it is in memory (spaced-repetition half-life decay)

const KEY = 'shaderdojo.progress.v1';
const DAY = 86400000;

function blank() {
  return { v: 1, created: Date.now(), concepts: {}, games: {}, xp: 0, streak: { days: 0, last: '' }, history: [], settings: { sound: false } };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { console.warn('progress load failed', e); }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  listeners.forEach((f) => f());
}
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
export function getState() { return state; }

function cRec(id) {
  return (state.concepts[id] ||= { lessonSeen: 0, lessonTotal: 0, lessonDone: false, rounds: 0, ema: null, half: 1, last: 0, reviews: 0, recent: [] });
}
function gRec(cid, gid) {
  return (state.games[cid + '/' + gid] ||= { plays: 0, rounds: 0, best: 0, last: 0, level: 1, recent: [] });
}
export function gameRecord(cid, gid) { return state.games[cid + '/' + gid] || { plays: 0, rounds: 0, best: 0, last: 0, level: 1, recent: [] }; }
export function conceptRecord(id) { return state.concepts[id] || null; }

// ------------------------------------------------------------------ lessons
export function markSlide(cid, index, total) {
  const c = cRec(cid);
  c.lessonTotal = total;
  c.lessonSeen = Math.max(c.lessonSeen, index + 1);
  if (c.lessonSeen >= total) c.lessonDone = true;
  save();
}
export function markLessonDone(cid, total) {
  const c = cRec(cid);
  c.lessonTotal = total; c.lessonSeen = total; c.lessonDone = true;
  if (!c.last) c.last = Date.now();
  touchStreak();
  save();
}

// ------------------------------------------------------------------ games
/** Record a single answered round. score in 0..1 */
export function recordRound(cid, gid, score) {
  const c = cRec(cid), g = gRec(cid, gid);
  c.rounds++; g.rounds++;
  c.ema = c.ema == null ? score : c.ema * 0.78 + score * 0.22;
  c.recent.push(+score.toFixed(2)); if (c.recent.length > 30) c.recent.shift();
  g.recent.push(+score.toFixed(2)); if (g.recent.length > 30) g.recent.shift();
  state.xp += Math.round(5 + 10 * score);
}

/**
 * Finish a session. perConcept: {cid: [scores]} ; perGame: {"cid/gid": [scores]}
 * Returns info about level changes.
 */
export function finishSession(perConcept, perGame, meta = {}) {
  const now = Date.now();
  const levelChanges = [];
  for (const [cid, scores] of Object.entries(perConcept)) {
    if (!scores.length) continue;
    const c = cRec(cid);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const elapsed = c.last ? (now - c.last) / DAY : 0;
    if (!c.last) {
      c.half = avg >= 0.8 ? 1.5 : 1;
    } else if (elapsed >= c.half * 0.5) {
      // a genuine review: grow or shrink the memory half-life
      c.half = avg >= 0.85 ? c.half * 2.5 : avg >= 0.65 ? c.half * 1.6 : Math.max(0.5, c.half * 0.5);
      c.reviews++;
    } else if (avg >= 0.8) {
      c.half *= 1.08; // cramming helps only a little
    }
    c.half = Math.min(c.half, 180);
    c.last = now;
  }
  for (const [key, scores] of Object.entries(perGame)) {
    if (!scores.length) continue;
    const [cid, gid] = key.split('/');
    const g = gRec(cid, gid);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    g.plays++; g.last = now; g.best = Math.max(g.best, avg);
    if (!meta.practice && scores.length >= 3) {
      if (avg >= 0.85 && g.level < 3) { g.level++; levelChanges.push({ cid, gid, level: g.level, up: true }); }
      else if (avg < 0.4 && g.level > 1) { g.level--; levelChanges.push({ cid, gid, level: g.level, up: false }); }
    }
  }
  state.history.push({ t: now, n: Object.values(perGame).flat().length, avg: avgOf(Object.values(perGame).flat()), kind: meta.kind || 'game', title: meta.title || '' });
  if (state.history.length > 400) state.history.shift();
  touchStreak();
  save();
  return { levelChanges };
}
export function setGameLevel(cid, gid, level) { gRec(cid, gid).level = level; save(); }

function avgOf(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function dayStr(t = Date.now()) { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function touchStreak() {
  const today = dayStr();
  if (state.streak.last === today) return;
  const yest = dayStr(Date.now() - DAY);
  state.streak.days = state.streak.last === yest ? state.streak.days + 1 : 1;
  state.streak.last = today;
}

// ------------------------------------------------------------------ metrics
export function retention(cid, now = Date.now()) {
  const c = state.concepts[cid];
  if (!c || !c.last || c.rounds === 0) return 0;
  const days = (now - c.last) / DAY;
  return Math.pow(2, -days / c.half);
}
export function understanding(cid) {
  const c = state.concepts[cid];
  if (!c || c.ema == null) return 0;
  return c.ema * Math.min(1, c.rounds / 10);
}
export function coverage(concept) {
  const c = state.concepts[concept.id];
  const lesson = concept.lesson && concept.lesson.length ? (c ? (c.lessonDone ? 1 : c.lessonSeen / concept.lesson.length) : 0) : 1;
  const games = concept.games || [];
  const played = games.filter((g) => gameRecord(concept.id, g.id).plays > 0).length;
  const gameFrac = games.length ? played / games.length : 1;
  return 0.35 * lesson + 0.65 * gameFrac;
}
export function conceptMetrics(concept) {
  return { coverage: coverage(concept), understanding: understanding(concept.id), retention: retention(concept.id) };
}
export function aggregate(concepts) {
  if (!concepts.length) return { coverage: 0, understanding: 0, retention: 0 };
  const ms = concepts.map(conceptMetrics);
  const avg = (k) => ms.reduce((s, m) => s + m[k], 0) / ms.length;
  return { coverage: avg('coverage'), understanding: avg('understanding'), retention: avg('retention') };
}
export function isStarted(concept) {
  const c = state.concepts[concept.id];
  return !!(c && (c.rounds > 0 || c.lessonSeen > 0));
}
export function isComplete(concept) {
  const c = state.concepts[concept.id];
  if (!c) return false;
  const lessonOk = !concept.lesson || !concept.lesson.length || c.lessonDone;
  const games = concept.games || [];
  const played = games.filter((g) => gameRecord(concept.id, g.id).plays > 0).length;
  return lessonOk && played >= Math.min(2, games.length) && (c.ema ?? 0) >= 0.6;
}
export function isDue(concept) {
  const c = state.concepts[concept.id];
  return !!(c && c.rounds > 0 && retention(concept.id) < 0.75);
}

// ------------------------------------------------------------------ backup
export function exportJSON() { return JSON.stringify(state); }
export function importJSON(str) {
  const obj = JSON.parse(str);
  if (!obj || typeof obj !== 'object' || !obj.concepts) throw new Error('Not a Shader Dojo backup');
  state = { ...blank(), ...obj };
  save();
}
export function resetAll() { state = blank(); save(); }
export function setSetting(k, v) { state.settings[k] = v; save(); }
