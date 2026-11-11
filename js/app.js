/* Avvio dell'applicazione: stato, schede, controlli generici, azioni dell'intestazione */
(function () {
  'use strict';
  const App = window.App, $ = App.$, $$ = App.$$, esc = App.esc;
  const TABS = ['scenari', 'confronto', 'piano', 'estinzione', 'stress', 'affitto', 'guida'];
  const SC_KEYS = ['piano', 'est', 'stress', 'affitto'];

  /* ---------- Stato iniziale (localStorage, link condiviso, scheda da URL) ---------- */
  App.state = App.load();
  let shareMsg = null;
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('s=')) {
    try {
      App.state = App.decodeShare(decodeURIComponent(hash.slice(2)));
      App.save();
      shareMsg = 'Dati caricati dal link condiviso.';
    } catch (e) {
      shareMsg = 'Link condiviso non valido: caricati i dati salvati.';
    }
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* URL non modificabile (es. file aperto in locale) */ }
  }
  const urlTab = (new URLSearchParams(location.search).get('tab') || (hash.match(/(?:^|&)tab=([a-z]+)/) || [])[1] || '').toLowerCase();
  if (TABS.includes(urlTab)) App.state.ui.tab = urlTab;
  if (!TABS.includes(App.state.ui.tab)) App.state.ui.tab = 'scenari';

  /* ---------- Rendering ---------- */
  function fixScRefs() {
    const ids = App.state.scenarios.map((s) => s.id);
    SC_KEYS.forEach((k) => { if (!ids.includes(App.state.ui[k].sc)) App.state.ui[k].sc = App.state.activeId; });
  }

  function fillScSelects() {
    const opts = App.state.scenarios.map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('');
    $$('select[data-scselect]').forEach((sel) => {
      if (sel.dataset.opts !== opts) { sel.innerHTML = opts; sel.dataset.opts = opts; }
    });
  }

  function syncUi() {
    $$('[data-ui]').forEach((el) => {
      if (el.id === 'estNSel') return;
      const v = App.getPath(App.state.ui, el.dataset.ui);
      App.writeInput(el, v);
    });
    $$('[data-pill]').forEach((g) => {
      const v = String(App.getPath(App.state.ui, g.dataset.pill));
      $$('button[data-v]', g).forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    });
  }

  function showTab(tab) {
    $$('button.tab[data-tab]').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('section.tab-panel').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
  }

  App.render = function () {
    fixScRefs();
    fillScSelects();
    syncUi();
    const tab = App.state.ui.tab;
    showTab(tab);
    const fn = App.renderers[tab];
    if (!fn) return;
    try {
      fn();
    } catch (e) {
      console.error(e);
      App.toast('Errore nel calcolo: controlla i dati inseriti.');
    }
  };

  /* ---------- Eventi ---------- */
  function bindUi() {
    const onUi = (ev) => {
      const el = ev.target.closest('[data-ui]');
      if (!el) return;
      if (ev.type === 'input' && (el.tagName === 'SELECT' || el.type === 'checkbox')) return;
      App.setPath(App.state.ui, el.dataset.ui, App.readInput(el));
      App.changed();
    };
    document.addEventListener('input', onUi);
    document.addEventListener('change', (ev) => {
      const el = ev.target.closest && ev.target.closest('[data-ui]');
      if (el && (el.tagName === 'SELECT' || el.type === 'checkbox')) onUi(ev);
    });
    document.addEventListener('focusout', (ev) => {
      const el = ev.target;
      if (el && el.dataset && el.dataset.ui && el.tagName === 'INPUT' && el.type !== 'checkbox') {
        setTimeout(() => App.writeInput(el, App.getPath(App.state.ui, el.dataset.ui)), 0);
      }
    });
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pill] button[data-v]');
      if (!b) return;
      const g = b.closest('[data-pill]');
      App.setPath(App.state.ui, g.dataset.pill, b.dataset.v);
      App.changed();
    });
  }

  function bindTabs() {
    const nav = $('nav.tabs');
    nav.addEventListener('click', (ev) => {
      const b = ev.target.closest('button.tab[data-tab]');
      if (!b || b.dataset.tab === App.state.ui.tab) return;
      App.state.ui.tab = b.dataset.tab;
      App.save();
      App.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    nav.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(App.state.ui.tab);
      const j = (i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      App.state.ui.tab = TABS[j];
      App.save();
      App.render();
      const nb = $(`button.tab[data-tab="${TABS[j]}"]`);
      if (nb) nb.focus();
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }

  function applyState(st, msg) {
    const tab = App.state.ui.tab;
    App.state = st;
    App.state.ui.tab = tab;
    App.invalidate();
    App.save();
    App.fillForm();
    App.render();
    if (msg) App.toast(msg);
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    App.chartTheme();
  }

  function bindHeader() {
    $('#btnShare').addEventListener('click', () => {
      const url = location.href.split('#')[0] + '#s=' + App.encodeShare();
      const local = location.protocol === 'file:';
      copyText(url)
        .then(() => App.toast(local
          ? 'Link copiato, ma funziona solo su questo computer: per condividerlo pubblica il sito (es. GitHub Pages) oppure usa Esporta.'
          : 'Link copiato negli appunti: contiene tutti i dati inseriti.', local ? 5000 : 2800))
        .catch(() => { window.prompt('Copia questo link:', url); });
    });
    $('#btnExport').addEventListener('click', () => {
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      App.download(`simulatore-mutuo-${stamp}.json`, App.exportJson(), 'application/json');
      App.toast('File JSON scaricato.');
    });
    const file = $('#fileImport');
    $('#btnImport').addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      if (f.size > 2e6) return App.toast('File troppo grande.');
      const rd = new FileReader();
      rd.onload = () => {
        let st;
        try { st = App.normalize(JSON.parse(String(rd.result))); } catch (e) { return App.toast('File non valido: ' + e.message); }
        applyState(st, `Importati ${st.scenarios.length} scenari.`);
      };
      rd.onerror = () => App.toast('Impossibile leggere il file.');
      rd.readAsText(f);
    });
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#btnReset').addEventListener('click', () => {
      if (!window.confirm('Ripristinare i dati di esempio? Scenari e profilo attuali verranno sostituiti.')) return;
      applyState(App.defaultState(), 'Dati di esempio ripristinati.');
    });
    $('#btnTheme').addEventListener('click', () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(App.THEME_KEY, t); } catch (e) { /* storage non disponibile */ }
      applyTheme(t);
      App.render();
    });
    window.addEventListener('beforeprint', () => App.resizeCharts());
    window.addEventListener('afterprint', () => App.resizeCharts());
  }

  /* ---------- Avvio ---------- */
  function start() {
    let theme = null;
    try { theme = localStorage.getItem(App.THEME_KEY); } catch (e) { /* storage non disponibile */ }
    if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(theme);
    App.bindScenari();
    App.bindPiano();
    App.bindEst2();
    bindUi();
    bindTabs();
    bindHeader();
    App.fillForm();
    App.render();
    if (shareMsg) App.toast(shareMsg, 3500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
