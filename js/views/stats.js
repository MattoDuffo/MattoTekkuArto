import { h, meters, toast } from '../core/ui.js';
import * as cur from '../core/curriculum.js';
import * as store from '../core/store.js';

export function statsView(root) {
  const st = store.getState();
  const all = store.aggregate(cur.concepts);
  const complete = cur.concepts.filter(store.isComplete).length;
  const rounds = Object.values(st.concepts).reduce((s, c) => s + (c.rounds || 0), 0);
  root.append(h('h1', '📊 Progress'));
  root.append(h('div.stat-grid',
    stat(st.xp, 'XP'), stat('🔥 ' + st.streak.days, 'day streak'),
    stat(`${complete}/${cur.concepts.length}`, 'concepts complete'), stat(rounds, 'rounds played')));
  root.append(h('div.card', h('b', 'Overall'), meters(all),
    h('p.small.dim', '<b>Covered</b>: lesson read + games tried. <b>Understanding</b>: your recent scores (needs ~10 rounds to be fully trusted). <b>Retention</b>: how fresh it is — it decays over time and each successful review makes it last longer.'.replace(/<\/?b>/g, ''))));
  root.append(h('h2', 'By topic'));
  for (const t of cur.topics) {
    root.append(h('div.card.tap', { onclick: () => (location.hash = '/topic/' + t.id) }, h('b', `${t.icon} ${t.title}`), meters(store.aggregate(t.concepts))));
  }
  root.append(h('h2', 'Recent sessions'));
  const hist = st.history.slice(-12).reverse();
  if (!hist.length) root.append(h('p.dim', 'No sessions yet.'));
  else {
    const tb = h('table.mini', h('tr', h('th', 'When'), h('th', 'What'), h('th', 'Score')));
    hist.forEach((x) => tb.append(h('tr', h('td.small', new Date(x.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), h('td.small', x.title || x.kind), h('td', Math.round(x.avg * 100) + '%'))));
    root.append(tb);
  }
  root.append(h('h2', 'Backup'));
  root.append(h('p.small.dim', 'Progress is saved on this device. iOS Safari may wipe website data after ~7 days without a visit unless you "Add to Home Screen" — so add it, and export a backup from time to time.'));
  root.append(h('div.row',
    h('button.btn.ghost.grow', {
      onclick: async () => {
        const data = store.exportJSON();
        const file = new File([data], `shader-dojo-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Shader Dojo backup' }); return; }
        } catch (e) { /* fall back */ }
        const a = h('a', { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove();
      },
    }, '⬇️ Export'),
    h('button.btn.ghost.grow', {
      onclick: () => {
        const inp = h('input', { type: 'file', accept: 'application/json,.json' });
        inp.onchange = async () => {
          try { store.importJSON(await inp.files[0].text()); toast('Progress restored ✅'); location.reload(); } catch (e) { toast('Import failed: ' + e.message, 3000); }
        };
        inp.click();
      },
    }, '⬆️ Import')));
  root.append(h('div.spacer'), h('button.btn.block.ghost', { style: { color: 'var(--bad)' }, onclick: () => { if (confirm('Erase ALL progress? This cannot be undone.')) { store.resetAll(); location.hash = '/'; } } }, 'Reset all progress'));
  root.append(h('p.small.dim.center', { style: { marginTop: '20px' } }, `${cur.topics.length} topics · ${cur.concepts.length} concepts · ${cur.totalGames()} games`));
}

function stat(v, k) { return h('div.stat', h('div.v', String(v)), h('div.k', k)); }
