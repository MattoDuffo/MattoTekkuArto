import { h, clear } from './core/ui.js';
import { loadCurriculum } from './core/curriculum.js';
import { homeView, topicsView } from './views/home.js';
import { topicView, conceptView, cheatsheetView } from './views/topic.js';
import { lessonView } from './views/lesson.js';
import { playView, practiceView, practiceRunView } from './views/play.js';
import { playgroundView } from './views/playground.js';
import { statsView } from './views/stats.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

const TABS = [
  { href: '#/', icon: '🧭', label: 'Path', match: (r) => r === '' || r === 'concept' || r === 'lesson' || r === 'play' },
  { href: '#/topics', icon: '📚', label: 'Topics', match: (r) => r === 'topics' || r === 'topic' || r === 'cheatsheet' },
  { href: '#/practice', icon: '🧠', label: 'Practice', match: (r) => r === 'practice' },
  { href: '#/playground', icon: '🧪', label: 'Playground', match: (r) => r === 'playground' },
  { href: '#/stats', icon: '📊', label: 'Progress', match: (r) => r === 'stats' },
];

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(qs || '');
  const r = parts[0] || '';
  document.body.classList.remove('fullscreen');
  document.querySelectorAll('.sheet, .sheet-backdrop').forEach((e) => e.remove());
  clear(app);
  clear(tabbar);
  TABS.forEach((t) => tabbar.append(h('a' + (t.match(r) ? '.on' : ''), { href: t.href }, h('span.ico', t.icon), t.label)));
  try {
    switch (r) {
      case '': homeView(app); break;
      case 'topics': topicsView(app); break;
      case 'topic': topicView(app, parts[1]); break;
      case 'cheatsheet': cheatsheetView(app, parts[1]); break;
      case 'concept': conceptView(app, parts[1]); break;
      case 'lesson': lessonView(app, parts[1], query); break;
      case 'play': playView(app, parts[1], parts[2], query); break;
      case 'practice': parts[1] === 'run' ? practiceRunView(app, query) : practiceView(app); break;
      case 'playground': playgroundView(app); break;
      case 'stats': statsView(app); break;
      default: homeView(app);
    }
  } catch (e) {
    console.error(e);
    app.append(h('div.card', h('b', 'Something broke'), h('pre.code.wrap', String(e.stack || e))));
  }
  window.scrollTo(0, 0);
}

async function boot() {
  app.append(h('p.dim.center', { style: { marginTop: '40vh' } }, 'Loading…'));
  await loadCurriculum();
  window.addEventListener('hashchange', route);
  route();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
