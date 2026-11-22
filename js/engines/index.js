import mcq from './mcq.js';
import slider from './slider.js';
import numeric from './numeric.js';
import order from './order.js';
import paint from './paint.js';
import tap from './tap.js';
import codefill from './codefill.js';
import buckets from './buckets.js';
import vector from './vector.js';
import custom from './custom.js';

export const ENGINES = { mcq, slider, numeric, order, paint, tap, codefill, buckets, vector, custom };

// Friendly names/icons shown in the UI
export const ENGINE_INFO = {
  mcq: { icon: '🔘', name: 'Quiz' },
  slider: { icon: '🎚️', name: 'Tune it' },
  numeric: { icon: '🔢', name: 'Calculate' },
  order: { icon: '🔀', name: 'Order' },
  paint: { icon: '🖌️', name: 'Be the GPU' },
  tap: { icon: '👆', name: 'Find the spot' },
  codefill: { icon: '🧩', name: 'Fill the code' },
  buckets: { icon: '🗂️', name: 'Sort' },
  vector: { icon: '↗️', name: 'Vector lab' },
  custom: { icon: '✨', name: 'Special' },
};
