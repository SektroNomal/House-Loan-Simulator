/* Scheda "Confronto": scenario consigliato, classifica, tabella e grafici */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$, esc = App.esc;

  const LABELS = { costo: 'costo totale', pv: 'valore attuale', rata: 'rata', rischio: 'rischio tassi', liquidita: 'liquidità iniziale' };
  const PRIO = { bilanciato: 'bilanciata', costo: 'spendere meno', rata: 'rata più bassa', rischio: 'minimo rischio', valore: 'valore attuale' };

  function reasons(best, items) {
    const out = [];
    const others = items.filter((i) => i !== best);
    const min = (f) => Math.min(...items.map(f));
    const max = (f) => Math.max(...items.map(f));
    const r = best.res;
    if (!others.length) {
      out.push('Aggiungi almeno un altro scenario (es. variabile o durata diversa) per un confronto.');
    }
    const cMax = max((i) => i.res.costoTotale);
    if (others.length && r.costoTotale <= min((i) => i.res.costoTotale) + 1) out.push(`Costo complessivo più basso: <b>${F.eur(r.costoTotale)}</b> (${F.eur(cMax - r.costoTotale)} in meno del più caro)`);
    else if (others.length) out.push(`Costo complessivo ${F.eur(r.costoTotale)} (+${F.eur(r.costoTotale - min((i) => i.res.costoTotale))} rispetto al più economico, compensato da altri vantaggi)`);
    out.push(`Rata ${F.eur(best.rataMese)}/mese${best.ratio != null ? ` (${F.pct(best.ratio, 1)} del reddito)` : ''}${others.length && best.rataMese <= min((i) => i.rataMese) + 0.5 ? ': la più bassa' : ''}`);
    if (!best.variabile) out.push('Tasso fisso: rata certa, nessun rischio di rialzo dei tassi');
    else out.push(`Con Euribor +2% la rata salirebbe a ${F.eur(best.rataStressMese)} (+${F.pct(best.rischio, 0)})${best.sc.capAttivo ? ' – protetta dal CAP' : ''}`);
    out.push(`Interessi totali ${F.eur(r.totInteressi)} · TAEG ${r.taeg == null ? '–' : F.pct(r.taeg)}`);
    out.push(`Dopo il rogito ti restano ${F.eur(best.liquiditaResidua)} di liquidità`);
    return out;
  }

  function renderWinner(c) {
    const best = c.best;
    if (!best) { $('#winner').innerHTML = ''; return; }
    const second = c.ranking[1];
    let h = `<div class="winner" style="--wc:${App.color(best.sc)}">
      <div class="score"><b>${best.score}</b><span>punti su 100</span></div>
      <div class="sub">🏆 Scenario consigliato · priorità ${PRIO[App.state.profile.priorita] || 'bilanciata'}</div>
      <h2>${esc(best.sc.nome)}</h2>
      <div class="sub">${esc(App.tassoLabel(best.sc))} · ${F.dur(best.res.durataMesi)}</div>
      <ul>${reasons(best, c.items).map((x) => `<li>${x}</li>`).join('')}</ul>`;
    if (best.warnings.length) h += `<div class="sub" style="margin-top:8px">⚠️ ${best.warnings.map(esc).join(' · ')}</div>`;
    if (second) {
      const dc = second.res.costoTotale - best.res.costoTotale, dr = second.rataMese - best.rataMese;
      h += `<div class="sub" style="margin-top:8px">Alternativa: <b>${esc(second.sc.nome)}</b> (${second.score} punti): costo ${F.signEur(dc)}, rata ${F.signEur(dr)}/mese.</div>`;
    }
    $('#winner').innerHTML = h + '</div>';
  }

  function renderRanking(c) {
    $('#ranking').innerHTML = c.ranking.map((it, i) => `<li>
      <span class="pos">${i + 1}</span>
      <span class="name">${esc(it.sc.nome)}<small class="muted">${F.eur(it.rataMese)}/mese · costo ${F.k(it.res.costoTotale)}${it.warnings.length ? ' · ⚠️ ' + it.warnings.length : ''}</small></span>
      <span class="bar"><div style="width:${it.score}%;background:${App.color(it.sc)}"></div></span>
      <span class="sc">${it.score}</span></li>`).join('');
    $('#weightsInfo').innerHTML = `<span class="muted">Pesi: ${Object.entries(c.weights).map(([k, v]) => `${LABELS[k]} ${Math.round(v * 100)}%`).join(' · ')} · le penalità per vincoli non rispettati riducono il punteggio.</span>`;
  }

  function renderTable(c) {
    const items = c.items;
    const multi = items.length > 1;
    const row = (label, f, fmt, better) => {
      const vals = items.map(f);
      const nums = vals.filter((v) => typeof v === 'number' && Number.isFinite(v));
      const lo = Math.min(...nums), hi = Math.max(...nums);
      const diff = multi && better && nums.length > 1 && hi - lo > Math.max(1e-6, Math.abs(hi) * 1e-4);
      return [label, ...vals.map((v) => {
        let cls = '';
        if (diff && typeof v === 'number') {
          if (v === (better === 'low' ? lo : hi)) cls = 'best';
          else if (v === (better === 'low' ? hi : lo)) cls = 'worst';
        }
        return { html: fmt(v), cls };
      })];
    };
    const group = (t) => ({ cls: 'group', cells: [{ html: t, attr: ` colspan="${items.length + 1}"` }] });
    const eur = (v) => F.eur(v), eur2 = (v) => F.eur(v, 2), pct = (v) => (v == null ? '–' : F.pct(v));
    const rows = [
      group('Mutuo'),
      row('Prezzo casa', (i) => i.res.prezzo, eur),
      row('Anticipo', (i) => i.res.anticipo, eur),
      row('Importo mutuo', (i) => i.res.mutuo, eur, 'low'),
      row('LTV', (i) => i.res.ltv, (v) => F.pct(v, 0), 'low'),
      row('Durata', (i) => i.res.durataMesi, (v) => F.dur(v), 'low'),
      row('Tasso', (i) => App.tassoLabel(i.sc), esc),
      row('TAN iniziale', (i) => i.res.tanIniziale, pct, 'low'),
      row('TAEG', (i) => i.res.taeg, pct, 'low'),
      group('Rata'),
      row('Prima rata (mensile eq.)', (i) => i.res.rataIniziale * App.meq(i.res), eur2, 'low'),
      row('Rata massima (mensile eq.)', (i) => i.rataMese, eur2, 'low'),
      row('Rata con Euribor +2%', (i) => i.rataStressMese, eur2, 'low'),
      row('Rata / reddito', (i) => i.ratio, (v) => (v == null ? '–' : F.pct(v, 1)), 'low'),
      group('Costi'),
      row('Totale interessi', (i) => i.res.totInteressi, eur, 'low'),
      row('Spese di acquisto', (i) => i.res.costiAcq.totale, eur, 'low'),
      row('Costi del mutuo', (i) => i.res.costiMut.totale, eur, 'low'),
      row('Assicurazioni e spese', (i) => i.res.totAss + i.res.totFees, eur, 'low'),
      row('Detrazioni IRPEF', (i) => i.res.totDetr, eur, 'high'),
      row('Costo del credito', (i) => i.res.costoCredito, eur, 'low'),
      row('Costo totale (prezzo incluso)', (i) => i.res.costoTotale, eur, 'low'),
      row(`Valore attuale costi (al ${F.pct(c.altNet)})`, (i) => i.res.valoreAttuale, eur, 'low'),
      group('Liquidità e sostenibilità'),
      row('Liquidità al rogito', (i) => i.res.liquiditaRogito, eur, 'low'),
      row('Liquidità residua', (i) => i.liquiditaResidua, eur, 'high'),
      row('Età a fine mutuo', (i) => i.etaFine, (v) => F.n(v, 0) + ' anni', 'low'),
      row('Anno in cui capitale > interessi', (i) => i.res.annoIncrocio || 0, (v) => (v ? 'anno ' + v : 'dalla 1ª rata'), 'low'),
      group('Valutazione'),
      row('Avvisi', (i) => i.warnings.length, (v) => (v ? '⚠️ ' + v : '✅'), 'low'),
      row('Punteggio', (i) => i.score, (v) => `<b>${v}</b>`, 'high'),
    ];
    $('#cmpTable').innerHTML = App.table(['', ...items.map((i) => ({ html: App.scHead(i.sc) }))], rows);
  }

  function yearSeries(items, f, opts) {
    const maxY = Math.max(...items.map((i) => i.res.years.length));
    const labels = Array.from({ length: maxY + (opts && opts.zero ? 1 : 0) }, (_, k) => (opts && opts.zero ? k : k + 1));
    const datasets = items.map((i) => {
      const data = labels.map((y) => f(i, y));
      return { label: i.sc.nome, data, borderColor: App.color(i.sc), backgroundColor: App.alpha(App.color(i.sc), 0.15), spanGaps: false };
    });
    return { labels, datasets };
  }

  function renderCharts(c) {
    const items = c.items;
    App.chart('chResidui', {
      type: 'line',
      data: yearSeries(items, (i, y) => (y === 0 ? i.res.mutuo : y <= i.res.years.length ? i.res.years[y - 1].residualEnd : null), { zero: true }),
      options: App.lineOpts({ xTitle: 'Anno' }),
    });
    App.chart('chInteressiCum', {
      type: 'line',
      data: yearSeries(items, (i, y) => (y === 0 ? 0 : y <= i.res.years.length ? i.res.years.slice(0, y).reduce((a, b) => a + b.interest, 0) : null), { zero: true }),
      options: App.lineOpts({ xTitle: 'Anno' }),
    });
    const rateData = yearSeries(items, (i, y) => (y <= i.res.years.length ? i.res.years[y - 1].rataMedia * App.meq(i.res) : null));
    rateData.datasets.forEach((d) => { d.stepped = true; });
    App.chart('chRate', { type: 'line', data: rateData, options: App.lineOpts({ xTitle: 'Anno', zero: false, dec: 2 }) });

    const comp = [
      ['Interessi', (i) => i.res.totInteressi, '#ef4444'],
      ['Spese di acquisto', (i) => i.res.costiAcq.totale, '#f59e0b'],
      ['Costi mutuo', (i) => i.res.costiMut.totale, '#8b5cf6'],
      ['Assicurazioni e spese', (i) => i.res.totAss + i.res.totFees + i.res.totPenali, '#06b6d4'],
      ['Detrazioni (−)', (i) => -i.res.totDetr, '#22c55e'],
    ];
    App.chart('chComposizione', {
      type: 'bar',
      data: { labels: items.map((i) => i.sc.nome), datasets: comp.map(([l, f, col]) => ({ label: l, data: items.map((i) => Math.round(f(i))), backgroundColor: col })) },
      options: App.lineOpts({ stacked: true }),
    });

    const keys = ['costo', 'pv', 'rata', 'rischio', 'liquidita'];
    const rng = {};
    keys.forEach((k) => { const v = items.map((i) => i.metrics[k]); rng[k] = [Math.min(...v), Math.max(...v)]; });
    const norm = (i, k) => { const [lo, hi] = rng[k]; return hi - lo > 1e-9 ? Math.round(100 * (1 - (i.metrics[k] - lo) / (hi - lo))) : 100; };
    App.chart('chRadar', {
      type: 'radar',
      data: {
        labels: ['Costo totale', 'Valore attuale', 'Rata', 'Rischio tassi', 'Liquidità iniziale'],
        datasets: items.map((i) => ({ label: i.sc.nome, data: keys.map((k) => norm(i, k)), borderColor: App.color(i.sc), backgroundColor: App.alpha(App.color(i.sc), 0.12), pointRadius: 3 })),
      },
      options: {
        plugins: { legend: { position: 'bottom' } },
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: App.cssVar('--grid') }, angleLines: { color: App.cssVar('--grid') } } },
      },
    });

    const tot = [
      ['Prezzo casa', (i) => i.res.prezzo, '#94a3b8'],
      ['Spese acquisto + costi mutuo', (i) => i.res.costiAcq.totale + i.res.costiMut.totale, '#f59e0b'],
      ['Interessi e oneri (netto detrazioni)', (i) => i.res.costoCredito - i.res.costiMut.totale, '#ef4444'],
    ];
    const o = App.lineOpts({ stacked: true });
    o.indexAxis = 'y';
    o.scales = { x: { stacked: true, ticks: { callback: App.eurTick } }, y: { stacked: true, grid: { display: false } } };
    App.chart('chTotali', {
      type: 'bar',
      data: { labels: items.map((i) => i.sc.nome), datasets: tot.map(([l, f, col]) => ({ label: l, data: items.map((i) => Math.round(f(i))), backgroundColor: col })) },
      options: o,
    });
  }

  App.renderers.confronto = function () {
    const c = App.cmp();
    App.syncProfile();
    renderWinner(c);
    renderRanking(c);
    renderTable(c);
    renderCharts(c);
  };
})();
