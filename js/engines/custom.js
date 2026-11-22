// Fully custom round. The game (or item) provides its own play function.
// item: { play(ctx) -> Promise<{score, explain?, answerText?}> }
// ctx = { el, rng, level, h, shaderView, ... } (see runner) — build any UI you like.
import * as ui from '../core/ui.js';
import * as d2 from '../core/draw2d.js';
import { renderer } from '../core/renderer.js';

export default {
  id: 'custom',
  defaultRounds: 5,
  round(ctx) {
    const play = ctx.item.play || ctx.game.play;
    return play({ ...ctx, ui, d2, renderer: renderer() });
  },
};
