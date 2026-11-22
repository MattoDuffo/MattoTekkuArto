// Helpers for content authors. Import what you need in a topic file:
//   import { G, f, v, tf, q, distinct, BW, GRAY3 } from './_kit.js';
import * as G from '../core/glsl.js';
export { G };
export const { f, v, n, nv, css } = G;
export { h, codeBlock, shaderView } from '../core/ui.js';
export { graph, canvas2d, plot, vectorPlane, arrow } from '../core/draw2d.js';

/** True/False question for the mcq engine */
export const tf = (statement, isTrue, explain, level = 1) => ({
  prompt: statement, options: ['True', 'False'], answer: isTrue ? 0 : 1, noShuffle: true, explain, level, grid: true,
});

/** Multiple-choice question where the FIRST option is the correct one (engine shuffles). */
export const q = (prompt, options, explain, extra = {}) => ({ prompt, options, answer: 0, explain, ...extra });

/**
 * Build a list of n distinct options: the correct one first, then distractors
 * produced by makeWrong(rng, i) until n unique ones exist (compared by key()).
 */
export function distinct(rng, correct, makeWrong, n = 4, key = (x) => JSON.stringify(x)) {
  const out = [correct];
  const seen = new Set([key(correct)]);
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const w = makeWrong(rng, tries);
    const k = key(w);
    if (w == null || seen.has(k)) continue;
    seen.add(k); out.push(w);
  }
  return out;
}

/** Palettes for the paint engine */
export const BW = [{ color: [0, 0, 0], label: '0' }, { color: [1, 1, 1], label: '1' }];
export const GRAY3 = [{ color: [0, 0, 0], label: '0' }, { color: [0.5, 0.5, 0.5], label: '.5' }, { color: [1, 1, 1], label: '1' }];
export const RGBK = [
  { color: [0, 0, 0], label: 'K' }, { color: [1, 0, 0], label: 'R' }, { color: [0, 1, 0], label: 'G' },
  { color: [0, 0, 1], label: 'B' }, { color: [1, 1, 0], label: 'Y' }, { color: [1, 1, 1], label: 'W' },
];

/** Named colours (0..1) */
export const C = {
  black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1],
  yellow: [1, 1, 0], cyan: [0, 1, 1], magenta: [1, 0, 1], gray: [0.5, 0.5, 0.5], orange: [1, 0.5, 0],
};

/** Shuffle helper that returns a new array */
export const shuffled = (rng, arr) => rng.shuffle(arr.slice());
