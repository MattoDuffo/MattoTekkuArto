# Shader Dojo 🥋

A mobile web app (made for iPhone) for learning **shaders as a tech artist** through short mini-games.
Graphics polish is not a goal here. Every lesson and game is meant to make one concept **easy to grasp**.

## How it works

* **Topics → Concepts → (Lesson + Mini-games).** 21 topics, from "what is a shader?" through
  UVs, colour, shaping functions, SDFs, patterns, transforms, vectors, lighting, noise, textures,
  the pipeline, vertex shaders, blending, colour spaces, post-processing and performance, ending
  with tech-art effect recipes (dissolve, hologram, water, fire …).
* **Lessons** are short slides with *live shaders, sliders and code that updates as you drag*.
* **Mini-games** (2–5 min sessions) come in many types: quiz, *Be the GPU* (paint pixels by running
  the shader in your head), *Tune it* (match a target with sliders), *Calculate* (keypad),
  *Fill the code*, *Find the spot*, *Sort*, *Order*, *Vector lab*… Most rounds are **procedurally
  generated** with 3 difficulty levels, so you can keep practising without repeats.
* **Learning path**: the default order through all concepts. *Continue* always takes you to the next
  step.
* **Practice**: mixed rehearsal sessions (smart review, due-for-review, weak spots, quick 5, by topic)
  built with spaced repetition.
* **Grading per concept**:
  * **Covered**: how much you've seen (lesson read + games tried)
  * **Understanding**: moving average of your scores, weighted by how many rounds you've played
  * **Retention**: memory freshness. It decays over time, and each successful review makes it decay more slowly.
* **Playground**: write your own fragment shader with live preview.

Progress is stored on the device (localStorage). Use **Progress → Export** for backups. On iOS,
**Add to Home Screen**: it then runs full-screen, works offline, and is less likely to have its storage cleared.

## Run locally

No build step. It's plain ES modules.

```
node tools/serve.mjs 8080      # then open http://127.0.0.1:8080
```

## Put it on your iPhone

Enable **GitHub Pages** for this repo (Settings → Pages → Source: *GitHub Actions*). The workflow
in `.github/workflows/pages.yml` publishes the site on every push to `main`. Open the URL in Safari →
Share → **Add to Home Screen**.

## Project layout

```
index.html, css/app.css
js/core/      renderer (one shared WebGL context), runner, progress store, practice builder, ui
js/engines/   game engines (mcq, slider, numeric, order, paint, tap, codefill, buckets, vector, custom)
js/views/     screens
js/content/   the curriculum, one file per topic  ← see js/content/README.md to add content
tools/        validate.mjs (compiles every shader + runs every generator), e2e.mjs, shot.mjs
```

## Tooling (needs Node + Playwright)

```
node tools/validate.mjs [topicId]          # content validator (WebGL in headless Chromium)
node tools/e2e.mjs /tmp/out [conceptId..]  # plays through lessons & games automatically
node tools/shot.mjs /tmp/out "#/topics"    # iPhone-sized screenshots
```
