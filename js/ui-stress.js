/* Scheda "Stress test & sostenibilità": shock Euribor, pareggio fisso/variabile, bilancio familiare, quanto mi posso permettere */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$, esc = App.esc;
  const num = (v, d) => E.num(v, d);
  const SHOCKS = [-1, 0, 1, 2, 3];
  const shockLbl = (s) => (s === 0 ? 'Scenario base' : `Euribor ${s > 0 ? '+' : '−'}${Math.abs(s)}%`);

  const stressOf = (sc) => App.memo('stress:' + sc.id, () => E.stressTest(sc, SHOCKS));
  const isVar = (sc) => (sc.tipoTasso || 'fisso') !== 'fisso';

  function soglia() {
    const p = App.state.profile;
    const red = num(p.reddito);
    return red > 0 ? { red, quota: num(p.quotaMax, 33) / 100, max: (red * num(p.quotaMax, 33)) / 100 - num(p.altreRate) } : null;
  }

  function renderTable() {
    const scs = App.state.scenarios;
    const s = soglia();
    const altre = num(App.state.profile.altreRate);
    const head = ['Scenario', 'Tasso'].concat(SHOCKS.map(shockLbl), ['Interessi totali (+2%)', 'Δ costo con +2%']);
    const rows = scs.map((sc) => {
      const st = stressOf(sc);
      const base = st.find((x) => x.shock === 0);
      const meq = App.meq(base.res);
      const cells = [{ html: App.scHead(sc) }, { html: `<small>${esc(App.tassoLabel(sc))}</small>` }];
      SHOCKS.forEach((sh) => {
        const x = st.find((y) => y.shock === sh);
        const v = x.rataMax * meq;
        const ratio = s ? (v + altre) / s.red : null;
        const d = base.rataMax ? x.rataMax / base.rataMax - 1 : 0;
        let cls = '';
        if (ratio != null) cls = ratio > 0.4 ? 'worst' : ratio > s.quota ? 'neg' : '';
        cells.push({ html: `${F.eur(v)}${sh !== 0 && Math.abs(d) > 0.0005 ? `<br><small class="muted">${d > 0 ? '+' : ''}${F.pct(d, 1)}</small>` : ''}${ratio != null ? `<br><small class="muted">${F.pct(ratio, 0)} del reddito</small>` : ''}`, cls });
      });
      const s2 = st.find((y) => y.shock === 2);
      cells.push(F.eur(s2.totInteressi));
      cells.push({ html: F.signEur(s2.costoCredito - base.costoCredito), cls: s2.costoCredito - base.costoCredito > 1 ? 'neg' : '' });
      return cells;
    });
    $('#stressTable').innerHTML = App.table(head, rows) + (s ? `<small class="muted">Rata massima mensile del piano. In rosso le rate oltre il ${F.pct(s.quota, 0)} del reddito (evidenziate oltre il 40%).</small>` : '');
  }

  function bisect(sc, target) {
    const f = (sh) => E.simulate(sc, { shock: sh }).costoCredito - target;
    let lo = -5, hi = 10;
    const flo = f(lo), fhi = f(hi);
    if (flo > 0) return { always: 'fisso' };
    if (fhi < 0) return { always: 'variabile' };
    for (let i = 0; i < 40 && hi - lo > 0.005; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return { shock: (lo + hi) / 2 };
  }

  function renderBreakEven() {
    const scs = App.state.scenarios;
    const fixed = scs.filter((sc) => !isVar(sc));
    const vars = scs.filter(isVar);
    const box = $('#breakEven');
    if (!fixed.length || !vars.length) {
      box.innerHTML = '<div class="alert info">Aggiungi almeno uno scenario a tasso fisso e uno variabile/misto per calcolare l\'Euribor di pareggio.</div>';
      return;
    }
    const bestFix = fixed.map((sc) => ({ sc, res: App.sim(sc) })).reduce((a, b) => (b.res.costoCredito < a.res.costoCredito ? b : a));
    const lines = vars.map((sc) => {
      const be = App.memo('be:' + sc.id + ':' + bestFix.sc.id, () => bisect(sc, bestFix.res.costoCredito));
      const nm = `<b>${esc(sc.nome)}</b>`, fx = `<b>${esc(bestFix.sc.nome)}</b> (${F.pct(num(bestFix.sc.tanFisso) / 100)})`;
      if (be.always === 'fisso') return `<li>${nm}: costa più di ${fx} anche con l'Euribor 5 punti più basso: meglio il fisso.</li>`;
      if (be.always === 'variabile') return `<li>${nm}: resta più conveniente di ${fx} in ogni scenario (grazie al CAP).</li>`;
      const res = E.simulate(sc, { shock: be.shock });
      const yrs = Math.min(res.years.length, (res.path || []).length);
      const avgE = yrs ? res.path.slice(0, yrs).reduce((a, b) => a + b, 0) / yrs : null;
      const avgTan = res.years.reduce((a, y) => a + y.rate, 0) / Math.max(1, res.years.length);
      const sh = be.shock;
      const msg = sh >= 0
        ? `conviene rispetto a ${fx} finché l'Euribor resta, in media, entro <b>+${F.n(sh, 2)} punti</b> rispetto allo scenario ipotizzato`
        : `costa già più di ${fx}: per pareggiare l'Euribor dovrebbe scendere in media di <b>${F.n(-sh, 2)} punti</b>`;
      return `<li>${nm} ${msg} (Euribor medio di pareggio ≈ ${avgE == null ? '–' : F.pct(avgE)}, TAN medio ≈ ${F.pct(avgTan)}).</li>`;
    });
    box.innerHTML = `<div class="alert info"><b>⚖️ Euribor di pareggio fisso/variabile</b> (costo del credito uguale):<ul style="margin:6px 0 0;padding-left:18px">${lines.join('')}</ul></div>`;
  }

  function renderCharts() {
    const scs = App.state.scenarios;
    const s = soglia();
    const ds = scs.map((sc) => {
      const st = stressOf(sc);
      const meq = App.meq(st[0].res);
      return { label: sc.nome, data: st.map((x) => Math.round(x.rataMax * meq)), backgroundColor: App.alpha(App.color(sc), 0.8) };
    });
    if (s) ds.push({ type: 'line', label: `Soglia ${F.pct(s.quota, 0)} del reddito`, data: SHOCKS.map(() => Math.round(s.max)), borderColor: '#dc2626', borderDash: [5, 4], pointRadius: 0 });
    const o = App.lineOpts({ zero: false });
    o.scales.y.beginAtZero = true;
    App.chart('chStress', { type: 'bar', data: { labels: SHOCKS.map((x) => (x === 0 ? 'Base' : (x > 0 ? '+' : '−') + Math.abs(x) + '%')), datasets: ds }, options: o });

    const maxY = Math.max(...scs.map((sc) => App.sim(sc).years.length));
    const labels = Array.from({ length: maxY }, (_, i) => i + 1);
    const o2 = App.lineOpts({ xTitle: 'Anno', yFmt: (v) => F.n(v, 1) + '%', zero: false });
    o2.plugins.tooltip = { callbacks: { label: (c) => `${c.dataset.label}: ${F.n(c.parsed.y, 2)}%` } };
    App.chart('chTan', {
      type: 'line',
      data: {
        labels,
        datasets: scs.map((sc) => {
          const ys = App.sim(sc).years;
          return { label: sc.nome, data: labels.map((y) => (ys[y - 1] ? +(ys[y - 1].rate * 100).toFixed(3) : null)), borderColor: App.color(sc), stepped: true };
        }),
      },
      options: o2,
    });
  }

  function renderBudget() {
    const sc = App.scById(App.state.ui.stress.sc);
    const it = App.item(sc.id);
    const p = App.state.profile;
    const red = num(p.reddito), altre = num(p.altreRate), spese = num(p.speseMensili);
    const rata = it.rataMese;
    const accessori = (it.res.years[0] ? it.res.years[0].insurance + it.res.years[0].fees : 0) / 12;
    const risp = red - rata - altre - spese - accessori;
    const parts = [['Rata mutuo', rata, App.color(sc)], ['Altre rate', altre, '#f97316'], ['Spese di vita', spese, '#64748b'], ['Assicurazioni e spese mutuo', accessori, '#06b6d4'], ['Risparmio', Math.max(0, risp), '#16a34a']].filter((x) => x[1] > 0.5);
    App.chart('chBudget', {
      type: 'doughnut',
      data: { labels: parts.map((x) => x[0]), datasets: [{ data: parts.map((x) => Math.round(x[1])), backgroundColor: parts.map((x) => x[2]) }] },
      options: App.pieOpts(),
    });
    const box = $('#budgetInfo');
    if (!(red > 0)) { box.innerHTML = '<div class="alert info">Inserisci il reddito nel profilo per valutare la sostenibilità.</div>'; return; }
    const quota = num(p.quotaMax, 33) / 100;
    const ratio = (rata + altre) / red;
    const cls = ratio > 0.4 ? 'bad' : ratio > quota ? 'warn' : '';
    const mesiFondo = it.liquiditaResidua / Math.max(1, spese + rata + altre);
    let h = `<div style="margin:8px 0 4px;font-size:.88rem">Rate / reddito: <b>${F.pct(ratio, 1)}</b> (soglia ${F.pct(quota, 0)})</div>
      <div class="progress ${cls}"><div style="width:${Math.min(100, (ratio / 0.6) * 100).toFixed(1)}%"></div><span class="mark" style="left:${((quota / 0.6) * 100).toFixed(1)}%"></span></div>
      <ul style="font-size:.88rem;padding-left:18px;margin:10px 0 0">
        <li>Risparmio mensile stimato: <b style="color:var(${risp >= 0 ? '--good' : '--bad'})">${F.eur(risp)}</b> (${F.pct(risp / red, 0)} del reddito)</li>`;
    if (it.variabile) h += `<li>Con Euribor +2%: rata ${F.eur(it.rataStressMese)} (${F.pct(it.ratioStress, 1)} del reddito), risparmio ${F.eur(risp - (it.rataStressMese - rata))}</li>`;
    h += `<li>Liquidità dopo il rogito: ${F.eur(it.liquiditaResidua)} ≈ <b>${F.n(Math.max(0, mesiFondo), 1)} mesi</b> di uscite (obiettivo ${F.n(num(p.mesiEmergenza), 0)})</li></ul>`;
    if (risp < 0) h += '<div class="alert bad" style="margin-top:8px">Le uscite superano il reddito: riduci il prezzo, allunga la durata o aumenta l\'anticipo.</div>';
    box.innerHTML = h;
  }

  function renderAfford() {
    const u = App.state.ui.stress, p = App.state.profile;
    const a = E.affordability(Object.assign({}, p, { tan: u.tan, anni: u.anni, ltvMax: u.ltvMax, spesePerc: u.spesePerc, fondo: App.fondo() }));
    const k = App.kpi;
    $('#affordKpis').innerHTML = k('Prezzo massimo', F.eur(a.prezzoMax), `limite: ${a.vincolo === 'liquidita' ? 'liquidità (anticipo + spese)' : 'reddito (rata)'}`, 'hl')
      + k('Rata massima', F.eur(a.rataMax), `${F.n(num(p.quotaMax, 33), 0)}% del reddito − altre rate`)
      + k('Mutuo necessario', F.eur(a.mutuoNecessario), `massimo finanziabile ${F.eur(a.mutuoMax)}`)
      + k('Anticipo + spese', F.eur(a.anticipoNecessario + a.speseStimate), `liquidità utilizzabile ${F.eur(a.liquiditaUtilizzabile)}`);
    const parts = [['Mutuo', a.mutuoNecessario, '#2563eb'], ['Anticipo', a.anticipoNecessario, '#16a34a'], ['Spese di acquisto', a.speseStimate, '#f59e0b'], ['Fondo emergenza', App.fondo(), '#94a3b8']];
    const o = App.lineOpts({ legend: true, stacked: true });
    o.indexAxis = 'y';
    o.scales = { x: { stacked: true, ticks: { callback: App.eurTick } }, y: { stacked: true, grid: { display: false } } };
    o.plugins.tooltip = App.tipEur(0);
    App.chart('chAfford', {
      type: 'bar',
      data: { labels: ['Composizione'], datasets: parts.map((x) => ({ label: x[0], data: [Math.round(x[1])], backgroundColor: x[2] })) },
      options: o,
    });
  }

  App.renderers.stress = function () {
    renderTable();
    renderBreakEven();
    renderCharts();
    renderBudget();
    renderAfford();
  };
})();
