/* Simulatore Mutuo Casa – stato, formattazione e utilità condivise dell'interfaccia */
(function () {
  'use strict';
  const E = window.MutuoEngine;
  const App = (window.App = window.App || {});
  App.E = E;
  App.renderers = {};

  const STORE = 'simulatoreMutuo.v1';
  const PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777'];
  App.PALETTE = PALETTE;
  App.MAX_SC = 6;
  App.THEME_KEY = 'simulatoreMutuo.theme';

  /* ---------- Stato e valori predefiniti ---------- */
  function nextMonth() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  const uid = () => 's' + Math.random().toString(36).slice(2, 9);
  App.uid = uid;

  const BASE_SC = {
    nome: 'Scenario', colore: PALETTE[0], dataInizio: '',
    prezzo: 250000, anticipo: 50000, tipoCasa: 'prima', venditore: 'privato', renditaCatastale: 800,
    agenziaPerc: 3, agenziaIva: true, notaioAcquisto: 2500, altreSpese: 500,
    durataAnni: 25, durataMesi: 0, frequenza: 12, ammortamento: 'francese', tipoTasso: 'fisso',
    tanFisso: 3.1, anniFissi: 5, euribor: 2.1, spread: 0.9, euriborScenario: 'costante', euriborTarget: 2.5,
    euriborAnni: 5, euriborCustom: '2,1; 2,3; 2,6; 3; 3', floor: 0, capAttivo: false, cap: 6,
    istruttoria: 1000, perizia: 300, notaioMutuo: 2000, mediazione: 0, incassoRata: 1.5, speseAnnue: 0,
    assIncendio: 150, assCpi: 0, cpiObbligatoria: false, detrazione: true,
  };
  App.makeScenario = (over) => Object.assign({}, BASE_SC, { id: uid(), dataInizio: nextMonth() }, over || {});

  App.PRESETS = {
    fisso20: { nome: 'Fisso 20 anni', tipoTasso: 'fisso', durataAnni: 20, durataMesi: 0, tanFisso: 2.95 },
    fisso25: { nome: 'Fisso 25 anni', tipoTasso: 'fisso', durataAnni: 25, durataMesi: 0, tanFisso: 3.1 },
    fisso30: { nome: 'Fisso 30 anni', tipoTasso: 'fisso', durataAnni: 30, durataMesi: 0, tanFisso: 3.3 },
    variabile: { nome: 'Variabile', tipoTasso: 'variabile', euribor: 2.1, spread: 0.9, euriborScenario: 'costante', capAttivo: false },
    variabileCap: { nome: 'Variabile con CAP', tipoTasso: 'variabile', euribor: 2.1, spread: 1.1, euriborScenario: 'costante', capAttivo: true, cap: 4.5 },
    variabileRialzo: { nome: 'Variabile, Euribor in rialzo', tipoTasso: 'variabile', euribor: 2.1, spread: 0.9, euriborScenario: 'lineare', euriborTarget: 3.5, euriborAnni: 5 },
    misto: { nome: 'Misto (5 anni fisso)', tipoTasso: 'misto', tanFisso: 2.9, anniFissi: 5, euribor: 2.1, spread: 1.0, euriborScenario: 'costante' },
    italiano: { nome: "Fisso all'italiana", ammortamento: 'italiano', tipoTasso: 'fisso' },
    anticipo30: { nome: 'Anticipo 30%' },
  };

  function defaultProfile() {
    return { reddito: 3500, altreRate: 0, liquidita: 80000, speseMensili: 2000, mesiEmergenza: 6, eta: 35,
      rendAlt: 3.5, tassaAlt: '12.5', inflazione: 2, quotaMax: 33, priorita: 'bilanciato' };
  }
  function defaultUi() {
    return {
      tab: 'scenari',
      piano: { sc: '', view: 'anni', plan: false },
      est: { sc: '', amount: 10000, mode: 'durata', penale: 0, minSaving: 5, N: '', goalEndN: 5, goalEndYears: 20,
        goalRataN: 5, goalRata: 800, plan: { mode: 'durata', oneOff: [{ year: 5, amount: 10000 }], recAmount: 0, recFrom: 1, recTo: 10 },
        surN: 5, surTan: 2.6, surAnni: '' },
      stress: { sc: '', tan: 3.2, anni: 25, ltvMax: 80, spesePerc: 7 },
      affitto: { sc: '', affitto: 900, incrAffitto: 2, rivalutazione: 1.5, manutenzione: 1, altriCosti: 600, costiVendita: 3, orizzonte: 25 },
    };
  }
  function defaultState() {
    const s1 = App.makeScenario({ nome: 'Fisso 25 anni', colore: PALETTE[0] });
    const s2 = App.makeScenario({ nome: 'Variabile 25 anni', colore: PALETTE[1], tipoTasso: 'variabile' });
    const s3 = App.makeScenario({ nome: 'Fisso 30 anni', colore: PALETTE[2], durataAnni: 30, tanFisso: 3.3 });
    return { profile: defaultProfile(), scenarios: [s1, s2, s3], activeId: s1.id, ui: defaultUi() };
  }
  App.defaultState = defaultState;

  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  function merge(def, src) {
    if (!isObj(src)) return def;
    const out = Object.assign({}, def);
    for (const k of Object.keys(def)) {
      if (!(k in src)) continue;
      if (isObj(def[k])) out[k] = merge(def[k], src[k]);
      else if (src[k] !== undefined && src[k] !== null && !isObj(src[k])) out[k] = src[k];
    }
    return out;
  }
  const safeColor = (c, i) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : PALETTE[i % PALETTE.length]);

  function normalize(raw) {
    if (!isObj(raw) || !Array.isArray(raw.scenarios) || !raw.scenarios.length) throw new Error('Formato non valido');
    const d = defaultState();
    const seen = new Set();
    const scenarios = raw.scenarios.slice(0, App.MAX_SC).filter(isObj).map((s, i) => {
      const sc = merge(Object.assign({}, BASE_SC, { dataInizio: nextMonth() }), s);
      sc.id = typeof s.id === 'string' && s.id && !seen.has(s.id) ? s.id : uid();
      seen.add(sc.id);
      sc.colore = safeColor(sc.colore, i);
      sc.nome = String(sc.nome || 'Scenario ' + (i + 1)).slice(0, 40);
      return sc;
    });
    if (!scenarios.length) throw new Error('Nessuno scenario');
    const st = { profile: merge(d.profile, raw.profile), scenarios, activeId: raw.activeId, ui: merge(d.ui, raw.ui) };
    const oneOff = isObj(raw.ui) && isObj(raw.ui.est) && isObj(raw.ui.est.plan) ? raw.ui.est.plan.oneOff : null;
    st.ui.est.plan.oneOff = Array.isArray(oneOff) ? oneOff.filter(isObj).slice(0, 30).map((o) => ({ year: E.num(o.year, 1), amount: E.num(o.amount) })) : d.ui.est.plan.oneOff;
    if (!scenarios.some((s) => s.id === st.activeId)) st.activeId = scenarios[0].id;
    return st;
  }
  App.normalize = normalize;

  App.load = function () {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* dati salvati non validi: si riparte dagli esempi */ }
    return defaultState();
  };
  App.save = function () {
    try { localStorage.setItem(STORE, JSON.stringify(App.state)); } catch (e) { /* storage non disponibile */ }
  };
  App.exportJson = () => JSON.stringify(Object.assign({ app: 'simulatore-mutuo', version: 1 }, App.state), null, 2);
  App.encodeShare = () => btoa(unescape(encodeURIComponent(JSON.stringify(App.state))));
  App.decodeShare = (s) => normalize(JSON.parse(decodeURIComponent(escape(atob(s)))));

  /* ---------- Accesso ai dati ---------- */
  App.active = () => App.state.scenarios.find((s) => s.id === App.state.activeId) || App.state.scenarios[0];
  App.scById = (id) => App.state.scenarios.find((s) => s.id === id) || App.active();
  App.getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  App.setPath = (obj, path, v) => {
    const ks = path.split('.');
    const last = ks.pop();
    const o = ks.reduce((acc, k) => (isObj(acc[k]) ? acc[k] : (acc[k] = {})), obj);
    o[last] = v;
  };

  let cmpCache = null;
  const memo = new Map();
  App.invalidate = () => { cmpCache = null; memo.clear(); };
  App.cmp = () => cmpCache || (cmpCache = E.compareScenarios(App.state.scenarios, App.state.profile));
  App.item = (id) => App.cmp().items.find((it) => it.sc.id === id);
  App.sim = (sc) => { const it = App.item(sc.id); return it ? it.res : E.simulate(sc); };
  App.memo = (key, fn) => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key);
  };
  App.fondo = () => E.num(App.state.profile.speseMensili) * E.num(App.state.profile.mesiEmergenza);
  App.altNet = () => E.altNetRate(App.state.profile);
  App.meq = (res) => res.m / 12;

  /* ---------- Formattazione ---------- */
  const nfCache = {};
  const nf = (min, max) => nfCache[min + '_' + max] || (nfCache[min + '_' + max] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' }));
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const F = (App.fmt = {
    n: (v, d = 0) => (fin(v) ? nf(d, d).format(d ? v : Math.round(v) || 0) : '–'),
    eur: (v, d = 0) => (fin(v) ? nf(d, d).format(d ? v : Math.round(v) || 0) + ' €' : '–'),
    pct: (v, d = 2) => (fin(v) ? nf(d, d).format(v * 100) + '%' : '–'),
    k: (v) => {
      if (!fin(v)) return '–';
      const a = Math.abs(v);
      if (a >= 1e6) return nf(0, 2).format(v / 1e6) + ' M€';
      if (a >= 1e4) return nf(0, 0).format(v / 1e3) + 'k €';
      if (a >= 1e3) return nf(0, 1).format(v / 1e3) + 'k €';
      return nf(0, 0).format(v) + ' €';
    },
    dur: (mo) => {
      mo = Math.round(mo);
      const y = Math.floor(mo / 12), r = mo % 12, parts = [];
      if (y) parts.push(y + (y === 1 ? ' anno' : ' anni'));
      if (r) parts.push(r + (r === 1 ? ' mese' : ' mesi'));
      return parts.join(' e ') || '0 mesi';
    },
    date: (sc, off) => {
      let [y, m] = String((sc && sc.dataInizio) || '').split('-').map(Number);
      if (!y || !m) [y, m] = nextMonth().split('-').map(Number);
      const t = y * 12 + (m - 1) + Math.round(off || 0);
      return MESI[((t % 12) + 12) % 12] + ' ' + Math.floor(t / 12);
    },
    signEur: (v) => (fin(v) ? (v > 0 ? '+' : '') + F.eur(v) : '–'),
  });

  App.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.$ = (s, r) => (r || document).querySelector(s);
  App.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  App.color = (sc) => safeColor(sc.colore, App.state.scenarios.indexOf(sc));
  App.scHead = (sc) => `<span class="sc-head"><i style="background:${App.color(sc)}"></i>${App.esc(sc.nome)}</span>`;
  App.tassoLabel = (sc) => {
    const t = sc.tipoTasso || 'fisso';
    if (t === 'fisso') return `Fisso ${F.n(E.num(sc.tanFisso), 2)}%`;
    const v = `Euribor ${F.n(E.num(sc.euribor), 2)}% + ${F.n(E.num(sc.spread), 2)}%${sc.capAttivo ? ` (CAP ${F.n(E.num(sc.cap), 2)}%)` : ''}`;
    return t === 'misto' ? `Misto: ${F.n(E.num(sc.tanFisso), 2)}% per ${E.num(sc.anniFissi)} anni, poi ${v}` : `Variabile ${v}`;
  };
  App.kpi = (label, value, sub, cls) =>
    `<div class="kpi ${cls || ''}"><div class="l">${label}</div><div class="v" title="${App.esc(String(value).replace(/<[^>]+>/g, ''))}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;

  App.table = (head, rows, opt) => {
    opt = opt || {};
    const cell = (c, tag) => {
      if (c && typeof c === 'object') return `<${tag}${c.cls ? ` class="${c.cls}"` : ''}${c.attr || ''}>${c.html}</${tag}>`;
      return `<${tag}>${c == null ? '' : c}</${tag}>`;
    };
    let h = `<table class="tbl ${opt.cls || ''}"><thead><tr>${head.map((c) => cell(c, 'th')).join('')}</tr></thead><tbody>`;
    for (const r of rows) {
      const cells = Array.isArray(r) ? r : r.cells;
      h += `<tr${!Array.isArray(r) && r.cls ? ` class="${r.cls}"` : ''}>${cells.map((c) => cell(c, 'td')).join('')}</tr>`;
    }
    h += '</tbody>';
    if (opt.foot) h += `<tfoot><tr>${opt.foot.map((c) => cell(c, 'td')).join('')}</tr></tfoot>`;
    return h + '</table>';
  };

  /* ---------- Grafici ---------- */
  const charts = {};
  App.cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  App.alpha = (hex, a) => {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  App.chartTheme = () => {
    if (!window.Chart) return;
    const d = window.Chart.defaults;
    d.color = App.cssVar('--muted');
    d.borderColor = App.cssVar('--grid');
    d.font.family = App.cssVar('--font') || 'Segoe UI, system-ui, sans-serif';
    d.animation.duration = 250;
    d.plugins.legend.labels.boxWidth = 12;
    d.plugins.legend.labels.boxHeight = 12;
  };
  App.chart = (id, cfg) => {
    const cv = document.getElementById(id);
    if (!cv) return null;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (!window.Chart) {
      const box = cv.parentElement;
      if (!box.querySelector('.chart-fallback')) {
        cv.hidden = true;
        box.insertAdjacentHTML('beforeend', '<div class="chart-fallback">Grafico non disponibile: libreria Chart.js non caricata.</div>');
      }
      return null;
    }
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
    try { charts[id] = new window.Chart(cv, cfg); } catch (e) { console.error('Grafico ' + id, e); return null; }
    return charts[id];
  };
  App.resizeCharts = () => Object.values(charts).forEach((c) => c.resize());
  App.redrawCharts = () => Object.values(charts).forEach((c) => c.update('none'));

  const eurTick = (v) => F.k(v);
  App.eurTick = eurTick;
  App.tipEur = (d, withPct) => ({
    callbacks: {
      label: (c) => {
        const p = c.parsed;
        const isObjP = p && typeof p === 'object';
        const v = isObjP ? (c.chart.options.indexAxis === 'y' ? p.x : p.y) : p;
        const name = isObjP ? c.dataset.label : c.label;
        let s = (name ? name + ': ' : '') + F.eur(v, d || 0);
        if (withPct) {
          const tot = c.dataset.data.reduce((a, b) => a + (+b || 0), 0);
          if (tot) s += ` (${F.pct(v / tot, 1)})`;
        }
        return s;
      },
    },
  });
  App.lineOpts = (o) => {
    o = o || {};
    return {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', display: o.legend !== false }, tooltip: o.tooltip || App.tipEur(o.dec || 0) },
      scales: {
        x: { stacked: !!o.stacked, grid: { display: false }, title: { display: !!o.xTitle, text: o.xTitle || '' }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { stacked: !!o.stacked, beginAtZero: o.zero !== false, ticks: { callback: o.yFmt || eurTick }, title: { display: !!o.yTitle, text: o.yTitle || '' } },
      },
      elements: { point: { radius: o.points ? 2 : 0, hoverRadius: 4 }, line: { tension: 0.15, borderWidth: 2 } },
    };
  };
  App.pieOpts = (o) => {
    o = o || {};
    return { cutout: o.cutout || '55%', plugins: { legend: { position: o.legendPos || 'right' }, tooltip: App.tipEur(0, true) } };
  };

  /* ---------- Varie ---------- */
  let toastT;
  App.toast = (msg, ms) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms || 2800);
  };
  App.download = (name, text, mime) => {
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  let timer = null;
  App.schedule = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => App.render(), delay == null ? 120 : delay);
  };
  App.changed = () => { App.invalidate(); App.save(); App.schedule(); };
})();
