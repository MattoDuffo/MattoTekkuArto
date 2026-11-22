// Seeded random number generator (mulberry32) with handy helpers.
// Every game generator receives one of these as `rng`.
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed,
    next,
    /** float in [min, max) */
    float: (min = 0, max = 1) => min + (max - min) * next(),
    /** integer in [min, max] (inclusive) */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** random element */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** n distinct elements */
    pickN: (arr, n) => rng.shuffle(arr.slice()).slice(0, n),
    /** in-place Fisher-Yates shuffle, returns arr */
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    chance: (p = 0.5) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    /** value snapped to a step, e.g. rng.step(0, 1, 0.25) -> 0, .25, .5, .75 or 1 */
    step: (min, max, step) => {
      const n = Math.round((max - min) / step);
      return +(min + step * Math.floor(next() * (n + 1))).toFixed(6);
    },
    /** weighted pick: items [{w, v}] */
    weighted: (items) => {
      const total = items.reduce((s, it) => s + it.w, 0);
      let r = next() * total;
      for (const it of items) { if ((r -= it.w) <= 0) return it.v; }
      return items[items.length - 1].v;
    },
  };
  return rng;
}
