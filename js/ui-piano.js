/* Scheda "Piano di ammortamento": KPI, grafici, tabella annuale/per rata, esportazione CSV */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$;

  App.planCfg = () => {
    const u = App.state.ui.est;
    return { mode: u.plan.mode, penale: u.penale, oneOff: u.plan.oneOff, recurring: { amount: u.plan.recAmount, from: u.plan.recFrom, to: u.plan.recTo } };
  };
  App.dateOfPeriod = (sc, res, k) => F.date(sc, (k * 12) / res.m);

  function current() {
    const sc = App.scById(App.state.ui.piano.sc);
    const base = App.sim(sc);
    const withPlan = !!App.state.ui.piano.plan;
    const res = withPlan ? App.memo('plan:' + sc.id, () => E.simulatePlan(sc, App.planCfg())) : base;
    return { sc, base, res, withPlan };
  }

  function renderKpis(sc, base, res, withPlan) {
    const k = App.kpi, meq = App.meq(res);
    let h = k('Prima rata', F.eur(res.rataIniziale, 2), res.m !== 12 ? `≈ ${F.eur(res.rataIniziale * meq)} al mese` : `max ${F.eur(res.rataMax, 2)}`, 'hl')
      + k('Durata effettiva', F.dur(res.durataMesi), `${res.rows.length} rate · fine ${App.dateOfPeriod(sc, res, res.rows.length)}`)
      + k('Totale interessi', F.eur(res.totInteressi), `${F.pct(res.mutuo ? res.totInteressi / res.mutuo : 0, 1)} del capitale`)
      + k('Totale rate pagate', F.eur(res.totRate), `capitale ${F.eur(res.mutuo)}`)
      + k('Assicurazioni e spese', F.eur(res.totAss + res.totFees), 'incasso rata, polizze, spese annue')
      + k('Detrazioni IRPEF', F.eur(res.totDetr), 'risparmio fiscale stimato', 'good')
      + k('TAEG', res.taeg == null ? '–' : F.pct(res.taeg), `TAN iniziale ${F.pct(res.tanIniziale)}`)
      + k('Capitale > interessi', res.annoIncrocio ? 'Anno ' + res.annoIncrocio : 'Subito', 'da quando la rata rimborsa più capitale');
    if (withPlan) {
      const saved = base.totInteressi - res.totInteressi;
      h += k('Versamenti extra', F.eur(res.totExtra), 'piano dalla scheda Estinzione', 'warn')
        + k('Interessi risparmiati', F.eur(saved), `${F.dur(base.durataMesi - res.durataMesi)} in meno`, 'good');
    }
    $('#pianoKpis').innerHTML = h;
  }

  function renderCharts(sc, res) {
    const ys = res.years;
    const labels = ys.map((y) => y.year);
    const hasExtra = res.totExtra > 0;
    const ds = [
      { label: 'Quota capitale', data: ys.map((y) => Math.round(y.principal)), backgroundColor: App.color(sc), stack: 'r' },
      { label: 'Quota interessi', data: ys.map((y) => Math.round(y.interest)), backgroundColor: '#ef4444', stack: 'r' },
    ];
    if (hasExtra) ds.push({ label: 'Versamenti extra', data: ys.map((y) => Math.round(y.extra)), backgroundColor: '#f59e0b', stack: 'r' });
    ds.push({ type: 'line', label: 'Debito residuo', data: ys.map((y) => Math.round(y.residualEnd)), borderColor: '#64748b', backgroundColor: 'transparent', yAxisID: 'y2', borderDash: [5, 4] });
    const o = App.lineOpts({ stacked: true, xTitle: 'Anno' });
    o.scales.y2 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: App.eurTick } };
    App.chart('chPianoBar', { type: 'bar', data: { labels, datasets: ds }, options: o });

    const infl = E.num(App.state.profile.inflazione) / 100;
    const meq = App.meq(res);
    const nominal = ys.map((y) => y.rataMedia * meq);
    const reddito = E.num(App.state.profile.reddito);
    const ds2 = [
      { label: 'Rata nominale (mensile)', data: nominal.map((v) => +v.toFixed(2)), borderColor: App.color(sc), backgroundColor: App.alpha(App.color(sc), 0.1), fill: true, stepped: true },
      { label: `Rata reale (euro di oggi, inflazione ${F.n(infl * 100, 1)}%)`, data: nominal.map((v, i) => +(v / Math.pow(1 + infl, i)).toFixed(2)), borderColor: '#16a34a', borderDash: [5, 4] },
    ];
    if (reddito > 0) ds2.push({ label: `Soglia ${App.state.profile.quotaMax}% del reddito (oggi)`, data: nominal.map(() => (reddito * E.num(App.state.profile.quotaMax, 33)) / 100 - E.num(App.state.profile.altreRate)), borderColor: '#dc2626', borderWidth: 1, borderDash: [2, 3] });
    App.chart('chPianoReale', { type: 'line', data: { labels, datasets: ds2 }, options: App.lineOpts({ xTitle: 'Anno', dec: 2 }) });

    const cm = res.costiMut, ca = res.costiAcq;
    const torta = [
      ['Capitale restituito', res.mutuo, App.color(sc)], ['Interessi', res.totInteressi, '#ef4444'], ['Costi del mutuo', cm.totale, '#8b5cf6'],
      ['Assicurazioni', res.totAss, '#06b6d4'], ['Incasso rata e spese', res.totFees, '#94a3b8'], ['Penali', res.totPenali, '#f97316'],
    ].filter((x) => x[1] > 0.5);
    App.chart('chPianoTorta', {
      type: 'doughnut',
      data: { labels: torta.map((x) => x[0]), datasets: [{ data: torta.map((x) => Math.round(x[1])), backgroundColor: torta.map((x) => x[2]) }] },
      options: App.pieOpts(),
    });
    const rog = [
      ['Anticipo', res.anticipo, '#2563eb'], [sc.venditore === 'impresa' ? 'IVA e imposte' : 'Imposte (registro, ipo-catastali)', ca.imposte, '#f59e0b'],
      ['Agenzia', ca.agenzia, '#ea580c'], ['Notaio acquisto', ca.notaio, '#9333ea'], ['Notaio mutuo', cm.notaio, '#a855f7'],
      ['Istruttoria e perizia', cm.istruttoria + cm.perizia + cm.mediazione, '#0891b2'], ['Imposta sostitutiva', cm.sostitutiva, '#64748b'], ['Altre spese', ca.altre, '#94a3b8'],
    ].filter((x) => x[1] > 0.5);
    App.chart('chPianoRogito', {
      type: 'doughnut',
      data: { labels: rog.map((x) => x[0]), datasets: [{ data: rog.map((x) => Math.round(x[1])), backgroundColor: rog.map((x) => x[2]) }] },
      options: App.pieOpts(),
    });
  }

  function yearRows(sc, res) {
    return res.years.map((y) => {
      const k0 = (y.year - 1) * res.m + 1, k1 = Math.min(y.year * res.m, res.rows.length);
      return { y, from: App.dateOfPeriod(sc, res, k0), to: App.dateOfPeriod(sc, res, k1) };
    });
  }

  function renderTable(sc, res) {
    const view = App.state.ui.piano.view;
    const hasExtra = res.totExtra > 0;
    let html;
    if (view === 'rate') {
      const head = ['N.', 'Scadenza', 'TAN', 'Rata', 'Quota capitale', 'Quota interessi'].concat(hasExtra ? ['Extra'] : [], ['Debito residuo']);
      const rows = [];
      res.rows.forEach((r) => {
        if ((r.k - 1) % res.m === 0 && res.m > 1) rows.push({ cls: 'group', cells: [{ html: `Anno ${r.year}`, attr: ` colspan="${head.length}"` }] });
        rows.push({ cls: r.extra > 0 ? 'hl' : '', cells: [r.k, App.dateOfPeriod(sc, res, r.k), F.pct(r.rate), F.eur(r.payment, 2), F.eur(r.principal, 2), F.eur(r.interest, 2)]
          .concat(hasExtra ? [r.extra ? F.eur(r.extra) : ''] : [], [F.eur(r.residual, 2)]) });
      });
      const foot = ['Totale', '', '', F.eur(res.totRate, 2), F.eur(res.rows.reduce((a, r) => a + r.principal, 0), 2), F.eur(res.totInteressi, 2)].concat(hasExtra ? [F.eur(res.totExtra)] : [], ['']);
      html = App.table(head, rows, { cls: 'compact', foot });
    } else {
      const head = ['Anno', 'Periodo', 'TAN medio', 'Rata media', 'Rate pagate', 'Capitale', 'Interessi'].concat(hasExtra ? ['Extra'] : [], ['Assic. e spese', 'Detrazione', 'Debito residuo', '% estinto']);
      const rows = yearRows(sc, res).map(({ y, from, to }) => ({
        cls: y.extra > 0 ? 'hl' : '',
        cells: [y.year, `${from} – ${to}`, F.pct(y.rate), F.eur(y.rataMedia, 2), F.eur(y.payments), F.eur(y.principal), F.eur(y.interest)]
          .concat(hasExtra ? [y.extra ? F.eur(y.extra) : ''] : [], [F.eur(y.insurance + y.fees), { html: y.detrazione ? F.eur(y.detrazione) : '', cls: 'pos' }, F.eur(y.residualEnd), F.pct(res.mutuo ? 1 - y.residualEnd / res.mutuo : 1, 0)]),
      }));
      const foot = ['Totale', '', '', '', F.eur(res.totRate), F.eur(res.years.reduce((a, y) => a + y.principal, 0)), F.eur(res.totInteressi)]
        .concat(hasExtra ? [F.eur(res.totExtra)] : [], [F.eur(res.totAss + res.totFees), F.eur(res.totDetr), '', '']);
      html = App.table(head, rows, { foot });
    }
    $('#pianoTable').innerHTML = html;
  }

  const csvNum = (v, d) => (Number.isFinite(v) ? v.toFixed(d == null ? 2 : d).replace('.', ',') : '');
  const csvCell = (s) => { s = String(s); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function exportCsv() {
    const { sc, res } = current();
    const view = App.state.ui.piano.view;
    const lines = [];
    if (view === 'rate') {
      lines.push(['N', 'Scadenza', 'Anno', 'TAN %', 'Rata', 'Quota capitale', 'Quota interessi', 'Extra', 'Penale', 'Debito residuo']);
      res.rows.forEach((r) => lines.push([r.k, App.dateOfPeriod(sc, res, r.k), r.year, csvNum(r.rate * 100, 3), csvNum(r.payment), csvNum(r.principal), csvNum(r.interest), csvNum(r.extra), csvNum(r.penalty), csvNum(r.residual)]));
    } else {
      lines.push(['Anno', 'Dal', 'Al', 'TAN medio %', 'Rata media', 'Rate pagate', 'Quota capitale', 'Quota interessi', 'Extra', 'Assicurazioni', 'Spese', 'Detrazione', 'Debito residuo']);
      yearRows(sc, res).forEach(({ y, from, to }) => lines.push([y.year, from, to, csvNum(y.rate * 100, 3), csvNum(y.rataMedia), csvNum(y.payments), csvNum(y.principal), csvNum(y.interest), csvNum(y.extra), csvNum(y.insurance), csvNum(y.fees), csvNum(y.detrazione), csvNum(y.residualEnd)]));
    }
    const text = '\ufeff' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
    const name = 'piano-ammortamento-' + String(sc.nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (view === 'rate' ? '-rate' : '-anni') + '.csv';
    App.download(name, text, 'text/csv;charset=utf-8');
    App.toast('File CSV scaricato: si apre con Excel.');
  }

  App.renderers.piano = function () {
    const { sc, base, res, withPlan } = current();
    renderKpis(sc, base, res, withPlan);
    renderCharts(sc, res);
    renderTable(sc, res);
  };
  App.bindPiano = () => { $('#btnCsv').addEventListener('click', exportCsv); };
})();
