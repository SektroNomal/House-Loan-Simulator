/* Scheda "Affitto vs acquisto": patrimonio netto nel tempo, punto di pareggio, affitto di indifferenza, sensibilità */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$, esc = App.esc;
  const num = (v, d) => E.num(v, d);

  const run = (sc, prm) => E.rentVsBuy(sc, App.state.profile, prm);
  const last = (r) => r.years[r.years.length - 1];

  /* Affitto mensile per cui, all'orizzonte, comprare e affittare si equivalgono */
  function rentIndifference(sc, prm) {
    const f = (a) => { const r = run(sc, Object.assign({}, prm, { affitto: a })); const l = last(r); return l.buyerNW - l.renterNW; };
    let lo = 0, hi = 20000;
    if (f(lo) >= 0) return 0;
    if (f(hi) < 0) return null;
    for (let i = 0; i < 40 && hi - lo > 1; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) >= 0) hi = mid; else lo = mid;
    }
    return hi;
  }

  function renderReco(sc, r, prm) {
    const l = last(r), H = l.year;
    const diff = l.buyerNW - l.renterNW;
    const be = r.breakEven;
    const affitto = num(prm.affitto);
    const prezzo = r.res.prezzo;
    const ratio = affitto > 0 ? prezzo / (affitto * 12) : null;
    const indiff = App.memo('rvb-ind:' + sc.id, () => rentIndifference(sc, prm));
    const riv = num(prm.rivalutazione);
    const sens = App.memo('rvb-sens:' + sc.id, () => [0, riv - 1, riv + 1, riv + 2]
      .filter((v, i, a) => a.indexOf(v) === i && Math.abs(v - riv) > 1e-9)
      .sort((a, b) => a - b)
      .map((v) => { const x = run(sc, Object.assign({}, prm, { rivalutazione: v })); return { v, be: x.breakEven, diff: last(x).buyerNW - last(x).renterNW }; }));

    let cls, big;
    if (diff > 0 && be != null && be <= H * 0.6) { cls = 'good'; big = `🏠 Comprare conviene: pareggio dopo ${be} ${be === 1 ? 'anno' : 'anni'}, a ${H} anni +${F.eur(diff)} di patrimonio`; }
    else if (diff > 0) { cls = 'warn'; big = `🏠 Comprare conviene, ma solo nel lungo periodo: pareggio dopo ${be} anni (+${F.eur(diff)} a ${H} anni)`; }
    else { cls = 'bad'; big = `🔑 Con questi parametri l'affitto è più conveniente: a ${H} anni ${F.eur(-diff)} di patrimonio in più restando in affitto`; }

    const li = [];
    li.push(`Patrimonio a ${H} anni: <b>acquisto ${F.eur(l.buyerNW)}</b> (casa ${F.eur(l.houseValue)} − costi di vendita − debito ${F.eur(l.residual)}${l.buyerPort > 1 ? ` + risparmi investiti ${F.eur(l.buyerPort)}` : ''}) contro <b>affitto ${F.eur(l.renterNW)}</b> (investiti al ${F.pct(r.altNet, 2)} netto).`);
    if (be != null) li.push(`Se pensi di <b>vendere o trasferirti prima di ${be} anni</b>, l'affitto è più conveniente: i costi iniziali (${F.eur(r.initial - r.res.anticipo)} tra imposte, notaio, agenzia e spese del mutuo) non vengono recuperati.`);
    if (indiff != null) li.push(`<b>Affitto di indifferenza</b> a ${H} anni: ${F.eur(indiff)}/mese. ${affitto >= indiff ? 'Un affitto equivalente più alto rende conveniente comprare.' : `L'affitto attuale (${F.eur(affitto)}) è più basso: comprare diventa conveniente solo con un affitto oltre questa cifra.`}`);
    if (ratio) li.push(`Rapporto prezzo/affitto annuo: <b>${F.n(ratio, 1)}</b> (rendimento lordo ${F.pct(1 / ratio, 1)}). Indicativamente sotto 15 favorisce l'acquisto, sopra 25 l'affitto.`);
    if (sens.length) {
      li.push('Sensibilità alla rivalutazione della casa: ' + sens.map((s) => `${F.n(s.v, 1)}% → ${s.be != null ? `pareggio dopo ${s.be} anni` : 'nessun pareggio'} (${F.signEur(s.diff)})`).join('; ') + '.');
    }
    li.push('Il confronto ipotizza che chi affitta investa anticipo, spese iniziali e ogni mese la differenza di uscite; chi compra investe la differenza quando l\'affitto supera i costi di proprietà.');

    const box = $('#affReco');
    box.className = 'card reco ' + cls;
    box.innerHTML = `<div class="big">${big}</div><div class="muted" style="font-size:.85rem">Scenario: ${App.scHead(sc)} · ${esc(App.tassoLabel(sc))}</div><ul>${li.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }

  function renderCharts(r) {
    const ys = r.years;
    const labels = ys.map((y) => y.year);
    const o = App.lineOpts({ xTitle: 'Anni', zero: false });
    App.chart('chAffitto', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Patrimonio acquisto', data: ys.map((y) => Math.round(y.buyerNW)), borderColor: '#2563eb', backgroundColor: App.alpha('#2563eb', 0.1), fill: false },
          { label: 'Patrimonio affitto', data: ys.map((y) => Math.round(y.renterNW)), borderColor: '#f59e0b', backgroundColor: App.alpha('#f59e0b', 0.1), fill: false },
          { label: 'Valore casa', data: ys.map((y) => Math.round(y.houseValue)), borderColor: '#16a34a', borderDash: [5, 4], borderWidth: 1.5, hidden: true },
          { label: 'Debito residuo', data: ys.map((y) => Math.round(y.residual)), borderColor: '#dc2626', borderDash: [5, 4], borderWidth: 1.5, hidden: true },
        ],
      },
      options: o,
    });
    App.chart('chAffittoUscite', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Affitto pagato (cumulato)', data: ys.map((y) => Math.round(y.rentPaid)), borderColor: '#f59e0b', backgroundColor: App.alpha('#f59e0b', 0.15), fill: true },
          { label: 'Uscite proprietario (cumulate)', data: ys.map((y) => Math.round(y.ownerCosts)), borderColor: '#2563eb', backgroundColor: App.alpha('#2563eb', 0.12), fill: true },
        ],
      },
      options: App.lineOpts({ xTitle: 'Anni' }),
    });
  }

  function renderTable(r) {
    const head = ['Anno', 'Valore casa', 'Debito residuo', 'Uscite proprietario cumulate', 'Affitto pagato cumulato', 'Patrimonio acquisto', 'Patrimonio affitto', 'Differenza'];
    const rows = r.years.map((y) => {
      const d = y.buyerNW - y.renterNW;
      return {
        cls: r.breakEven != null && y.year === r.breakEven ? 'hl' : '',
        cells: [y.year === 0 ? 'Rogito' : y.year, F.eur(y.houseValue), F.eur(y.residual), F.eur(y.ownerCosts), F.eur(y.rentPaid), F.eur(y.buyerNW), F.eur(y.renterNW), { html: F.signEur(d), cls: d >= 0 ? 'pos' : 'neg' }],
      };
    });
    $('#affTable').innerHTML = App.table(head, rows, { cls: 'compact' })
      + '<small class="muted">Le uscite del proprietario comprendono anticipo, imposte e spese iniziali, rate (capitale + interessi), assicurazioni, manutenzione e altri costi, al netto della detrazione degli interessi. La riga evidenziata è l\'anno di pareggio.</small>';
  }

  App.renderers.affitto = function () {
    const u = App.state.ui.affitto;
    const sc = App.scById(u.sc);
    const r = App.memo('rvb:' + sc.id, () => run(sc, u));
    renderReco(sc, r, u);
    renderCharts(r);
    renderTable(r);
  };
})();
