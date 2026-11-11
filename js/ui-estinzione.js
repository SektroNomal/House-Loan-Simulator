/* Scheda "Estinzione anticipata": raccomandazione, convenienza per anno, importo ottimale, durata vs rata */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$, esc = App.esc;
  const num = (v, d) => E.num(v, d);
  const VERD = { si: ['si', 'Conviene'], marginale: ['marginale', 'Marginale'], no: ['no', 'Non conviene'] };
  const COL = { si: '#16a34a', marginale: '#f59e0b', no: '#dc2626' };

  App.estCtx = function () {
    const u = App.state.ui.est;
    const sc = App.scById(u.sc);
    const it = App.item(sc.id);
    const base = it ? it.res : E.simulate(sc);
    const altNet = App.altNet();
    const an = App.memo('pre:' + sc.id, () => E.analyzePrepayment(sc, { amount: num(u.amount), mode: u.mode, penale: num(u.penale), altNet, minSaving: num(u.minSaving) / 100 }));
    const maxN = an.rows.length ? an.rows[an.rows.length - 1].N : 0;
    let N = Math.round(num(u.N, 0));
    if (!(N >= 1 && N <= maxN)) N = an.best ? an.best.N : Math.min(1, maxN);
    const am = N ? App.memo('amt:' + sc.id + ':' + N, () => E.amountAnalysis(sc, { N, mode: u.mode, penale: num(u.penale), altNet })) : null;
    const p = App.state.profile;
    const disp = Math.max(0, num(p.liquidita) - base.liquiditaRogito - App.fondo());
    const rataMese = base.rataIniziale * App.meq(base);
    const risp = num(p.reddito) - num(p.speseMensili) - num(p.altreRate) - rataMese;
    return { u, sc, it, base, altNet, an, N, maxN, am, disp, risp, rataMese };
  };

  function effect(row, mode, base) {
    return mode === 'rata'
      ? `la rata scende da ${F.eur(row.oldRata, 2)} a ${F.eur(row.newRata, 2)}`
      : `il mutuo finisce ${F.dur(row.monthsSaved)} prima`;
  }

  function renderReco(c) {
    const { u, sc, base, an, altNet, disp, risp } = c;
    const box = $('#estReco');
    if (!an.rows.length) {
      box.className = 'card reco warn';
      box.innerHTML = '<div class="big">Mutuo troppo breve per analizzare un versamento anticipato.</div>';
      return;
    }
    const tanNetto = base.tanIniziale * (sc.detrazione && sc.tipoCasa !== 'seconda' ? 1 - E.DETR_ALIQ : 1);
    const li = [];
    let cls, big;
    if (an.anyGood) {
      const b = an.best, d = an.deadline;
      const bestAm = App.memo('amt:' + sc.id + ':' + b.N, () => E.amountAnalysis(sc, { N: b.N, mode: u.mode, penale: num(u.penale), altNet }));
      const optimal = bestAm ? bestAm.optimal : b.A;
      const accum = Math.max(0, risp) * 12 * b.N;
      const sugg = Math.max(0, Math.min(optimal, disp + accum));
      cls = 'good';
      big = `✅ Conviene iniettare liquidità entro l'anno ${d.N} (${App.dateOfPeriod(sc, base, d.p)}). Momento migliore: dopo l'anno ${b.N}.`;
      li.push(`Versando <b>${F.eur(b.A)}</b> dopo l'anno ${b.N} risparmi <b>${F.eur(b.netSaving)}</b> netti (${F.pct(b.savingPct, 0)} della somma) e ${effect(b, u.mode)}.`);
      li.push(`Il versamento “rende” <b>${F.pct(b.irr)}</b> l'anno senza rischi, contro il ${F.pct(altNet)} netto dell'investimento alternativo.`);
      if (bestAm) {
        li.push(optimal >= bestAm.resid - 1
          ? `Importo consigliato: fino all'intero debito residuo (${F.eur(bestAm.resid)}): ogni euro versato rende più dell'alternativa.`
          : `Importo ottimale: circa <b>${F.eur(optimal)}</b>; oltre, il rendimento di ogni euro in più scende sotto il ${F.pct(altNet)}${base.totDetr > 0 ? ' (anche perché si perde la detrazione sugli interessi)' : ''}.`);
      }
      li.push(`Con la tua liquidità (oltre al fondo di emergenza di ${F.eur(App.fondo())}) e i risparmi accumulati entro l'anno ${b.N}, puoi versare circa <b>${F.eur(sugg)}</b>.`);
      if (d.N > b.N) li.push(`Dopo l'anno ${d.N} gli interessi residui sono troppo bassi: meglio investire o tenere la liquidità.`);
      if (risp > 50) {
        const yearly = Math.max(500, Math.round((risp * 12 * 0.5) / 500) * 500);
        const plan = App.memo('reco-plan:' + sc.id, () => E.simulatePlan(sc, { mode: u.mode, penale: num(u.penale), oneOff: [], recurring: { amount: yearly, from: 1, to: d.N } }));
        li.push(`In alternativa, un piano ricorrente di <b>${F.eur(yearly)}/anno</b> (metà del risparmio annuo stimato) dall'anno 1 al ${d.N} fa risparmiare ${F.eur(base.totInteressi - plan.totInteressi)} di interessi${u.mode === 'durata' ? ` e chiude il mutuo ${F.dur(base.durataMesi - plan.durataMesi)} prima` : ''}.`);
      }
    } else if (an.rows.some((r) => r.verdict === 'marginale')) {
      cls = 'warn';
      big = '⚖️ Versamento poco significativo: rende più dell\'alternativa, ma il risparmio è sotto la soglia scelta.';
      li.push(`Il rendimento massimo è ${F.pct(Math.max(...an.rows.map((r) => r.irr || 0)))} contro il ${F.pct(altNet)} netto alternativo.`);
      li.push('Valuta di aumentare la somma, di versare prima o di abbassare la soglia di risparmio minimo.');
    } else {
      cls = 'bad';
      big = '❌ Non conviene estinguere anticipatamente: la liquidità rende di più se investita.';
      li.push(`Il mutuo costa circa ${F.pct(tanNetto)} netto${tanNetto < base.tanIniziale ? ' (dopo la detrazione del 19%)' : ''}: meno del ${F.pct(altNet)} netto dell'investimento alternativo.`);
      const maxIrr = Math.max(...an.rows.map((r) => r.irr || 0));
      if (maxIrr > 0) li.push(`Estinguere diventerebbe conveniente se l'investimento alternativo rendesse meno del <b>${F.pct(maxIrr)}</b> netto (prova a modificare il rendimento alternativo qui sopra).`);
      li.push('Tieni la liquidità per il fondo di emergenza e investi il resto; rivaluta se i tassi dell\'alternativa scendono.');
    }
    if (sc.tipoTasso !== 'fisso') li.push('ℹ️ Mutuo a tasso variabile: la convenienza dipende dallo scenario Euribor ipotizzato; se i tassi salgono, estinguere conviene di più.');
    if (num(u.penale) > 0) li.push('⚠️ Per i mutui prima casa delle persone fisiche la penale è vietata per legge (L. 40/2007).');
    box.className = 'card reco ' + cls;
    box.innerHTML = `<div class="big">${big}</div><ul>${li.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }

  function pctAxis(o) {
    o.scales.y2 = { position: 'right', grid: { display: false }, ticks: { callback: (v) => F.n(v, 1) + '%' } };
    o.plugins.tooltip = {
      callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y2' ? F.n(ctx.parsed.y, 2) + '%' : F.eur(ctx.parsed.y)}` },
    };
    return o;
  }

  function renderYearChart(c) {
    const rows = c.an.rows;
    const o = pctAxis(App.lineOpts({ xTitle: 'Versamento dopo l\'anno' }));
    App.chart('chEstAnni', {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.N),
        datasets: [
          { label: 'Risparmio netto', data: rows.map((r) => Math.round(r.netSaving)), backgroundColor: rows.map((r) => App.alpha(COL[r.verdict], 0.75)), order: 2 },
          { type: 'line', label: 'Rendimento del versamento', data: rows.map((r) => (r.irr == null ? null : +(r.irr * 100).toFixed(3))), borderColor: App.color(c.sc), yAxisID: 'y2', order: 1 },
          { type: 'line', label: 'Rendimento alternativo netto', data: rows.map(() => +(c.altNet * 100).toFixed(3)), borderColor: '#64748b', borderDash: [5, 4], yAxisID: 'y2', order: 1 },
        ],
      },
      options: o,
    });
  }

  function renderAmount(c) {
    const sel = $('#estNSel');
    const opts = c.an.rows.map((r) => `<option value="${r.N}">${r.N}</option>`).join('');
    if (sel.innerHTML !== opts) sel.innerHTML = opts;
    sel.value = String(c.N);
    const am = c.am;
    if (!am) {
      App.chart('chEstImporti', { type: 'bar', data: { labels: [], datasets: [] } });
      $('#estAmountInfo').innerHTML = '<p class="muted">Nessun dato.</p>';
      return;
    }
    const o = pctAxis(App.lineOpts({ xTitle: 'Somma versata' }));
    App.chart('chEstImporti', {
      type: 'bar',
      data: {
        labels: am.rows.map((r) => F.k(r.A)),
        datasets: [
          { label: 'Risparmio netto', data: am.rows.map((r) => Math.round(r.netSaving)), backgroundColor: am.rows.map((r) => (r.A <= am.optimal ? App.alpha('#16a34a', 0.75) : App.alpha('#94a3b8', 0.6))), order: 2 },
          { type: 'line', label: 'Rendimento marginale', data: am.rows.map((r) => (r.irrMarg == null ? null : +(r.irrMarg * 100).toFixed(3))), borderColor: '#ea580c', yAxisID: 'y2', order: 1 },
          { type: 'line', label: 'Alternativa netta', data: am.rows.map(() => +(c.altNet * 100).toFixed(3)), borderColor: '#64748b', borderDash: [5, 4], yAxisID: 'y2', order: 1 },
        ],
      },
      options: o,
    });
    const optRow = am.rows.find((r) => r.A === am.optimal);
    $('#estAmountInfo').innerHTML = am.optimal > 0
      ? `<div class="alert good">Dopo l'anno ${c.N} (debito residuo ${F.eur(am.resid)}) conviene versare fino a <b>${F.eur(am.optimal)}</b>: risparmio netto ${F.eur(optRow.netSaving)}${c.u.mode === 'durata' ? `, ${F.dur(optRow.monthsSaved)} in meno` : `, nuova rata ${F.eur(optRow.newRata, 2)}`}. ${am.optimal < am.resid - 1 ? 'Oltre, ogni euro in più rende meno dell\'alternativa.' : ''} Disponibile oggi oltre al fondo emergenza: ${F.eur(c.disp)}.</div>`
      : `<div class="alert bad">Dopo l'anno ${c.N} nessun importo rende più del ${F.pct(c.altNet)} netto dell'alternativa.</div>`;
  }

  function renderTable(c) {
    const { an, sc, base, u } = c;
    const head = ['Dopo l\'anno', 'Data', 'Debito residuo', 'Versamento', 'Interessi risparmiati', 'Detrazione persa', 'Risparmio netto', '% sul versato', 'Rendimento', 'VAN', u.mode === 'rata' ? 'Nuova rata' : 'Durata ridotta', 'Verdetto'];
    const rows = an.rows.map((r) => ({
      cls: an.best && r.N === an.best.N ? 'hl' : '',
      cells: [r.N, App.dateOfPeriod(sc, base, r.p), F.eur(r.resid), F.eur(r.A), F.eur(r.interestSaved), r.detrLost > 0.5 ? F.eur(r.detrLost) : '–',
        { html: F.eur(r.netSaving), cls: r.netSaving >= 0 ? 'pos' : 'neg' }, F.pct(r.savingPct, 1), r.irr == null ? '–' : F.pct(r.irr), { html: F.eur(r.van), cls: r.van >= 0 ? 'pos' : 'neg' },
        u.mode === 'rata' ? `${F.eur(r.oldRata, 2)} → ${F.eur(r.newRata, 2)}` : F.dur(r.monthsSaved),
        { html: `<span class="badge ${VERD[r.verdict][0]}">${VERD[r.verdict][1]}${an.best && r.N === an.best.N ? ' ★' : ''}</span>` }],
    }));
    $('#estTable').innerHTML = App.table(head, rows, { cls: 'compact' });
    $('#estTableInfo').textContent = `Alternativa netta ${F.pct(c.altNet)} · soglia risparmio ${F.n(num(u.minSaving), 0)}% · ★ = anno migliore (VAN per euro versato)`;
  }

  function renderModes(c) {
    const { sc, base, N, u } = c;
    if (!N) { $('#estModes').innerHTML = ''; return; }
    const p = N * base.m;
    const A = Math.min(num(u.amount), E.residualAfter(base, p));
    const sims = App.memo('modes:' + sc.id + ':' + N, () => ['durata', 'rata'].map((mode) => E.simulate(sc, { extras: [{ period: p, amount: A, mode }], penale: num(u.penale) })));
    const [d, r] = sims;
    const iAlt = Math.pow(1 + c.altNet, 1 / base.m) - 1;
    const vanOf = (s) => E.npv(base.flows.slice(p).map((f, i) => f - (s.flows[p + i] || 0)), iAlt);
    const row = (l, a, b) => `<tr><td>${l}</td><td>${a}</td><td>${b}</td></tr>`;
    const sd = base.totInteressi - d.totInteressi, sr = base.totInteressi - r.totInteressi;
    $('#estModes').innerHTML = `<p class="muted" style="font-size:.88rem">Versamento di ${F.eur(A)} dopo l'anno ${N} (scenario “${esc(sc.nome)}”).</p>
      <table class="tbl compact"><thead><tr><th></th><th>Riduci durata</th><th>Riduci rata</th></tr></thead><tbody>
      ${row('Interessi risparmiati', F.eur(sd), F.eur(sr))}
      ${row('Nuova rata', F.eur(d.rows[p] ? d.rows[p].payment : 0, 2), F.eur(r.rows[p] ? r.rows[p].payment : 0, 2))}
      ${row('Fine mutuo', App.dateOfPeriod(sc, d, d.rows.length), App.dateOfPeriod(sc, r, r.rows.length))}
      ${row('Durata risparmiata', F.dur(base.durataMesi - d.durataMesi), F.dur(base.durataMesi - r.durataMesi))}
      ${row('Detrazioni perse', F.eur(base.totDetr - d.totDetr), F.eur(base.totDetr - r.totDetr))}
      ${row(`VAN al ${F.pct(c.altNet)}`, F.eur(vanOf(d)), F.eur(vanOf(r)))}
      </tbody></table>
      <div class="alert info">Ridurre la <b>durata</b> fa risparmiare più interessi (${F.eur(sd - sr)} in più); ridurre la <b>rata</b> libera ${F.eur(((base.rows[p] ? base.rows[p].payment : 0) - (r.rows[p] ? r.rows[p].payment : 0)) * App.meq(base))} al mese e aumenta la flessibilità. Scegli la durata se la rata attuale è sostenibile.</div>`;
  }

  App.renderers.estinzione = function () {
    const c = App.estCtx();
    App.syncProfile();
    renderReco(c);
    renderYearChart(c);
    renderAmount(c);
    renderTable(c);
    renderModes(c);
    if (App.renderEst2) App.renderEst2(c);
  };
})();
