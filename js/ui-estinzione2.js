/* Scheda "Estinzione anticipata" (parte 2): obiettivi, piano personalizzato, surroga */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$, esc = App.esc;
  const num = (v, d) => E.num(v, d);

  function liquidityNote(c, N, amount) {
    const accum = Math.max(0, c.risp) * 12 * N;
    const avail = c.disp + accum;
    if (amount <= 0) return '';
    return amount <= c.disp
      ? `<br><small class="muted">Coperto già oggi dalla liquidità libera (${F.eur(c.disp)} oltre al fondo emergenza).</small>`
      : amount <= avail
        ? `<br><small class="muted">Servono i risparmi dei prossimi ${N} anni: disponibili circa ${F.eur(avail)} (risparmio stimato ${F.eur(c.risp)}/mese).</small>`
        : `<br><small style="color:var(--bad)">⚠️ Oltre la liquidità stimata entro l'anno ${N} (${F.eur(avail)}).</small>`;
  }

  function renderGoals(c) {
    const { u, sc, base } = c;
    const years = base.rows.length / base.m;
    const pen = num(u.penale);
    const N1 = Math.max(0, Math.round(num(u.goalEndN))), T = num(u.goalEndYears);
    let h;
    if (!(T > 0)) h = '<div class="alert info">Inserisci in quanti anni vuoi chiudere il mutuo.</div>';
    else if (N1 >= years) h = `<div class="alert warn">Il mutuo dura ${F.n(years, 1)} anni: scegli un anno di versamento precedente.</div>`;
    else if (T >= years) h = `<div class="alert good">Il mutuo termina già in ${F.dur(base.durataMesi)}: nessun versamento necessario.</div>`;
    else {
      const g = App.memo(`gEnd:${sc.id}:${N1}:${T}`, () => E.amountForEnd(sc, N1, T, pen));
      const saved = base.totInteressi - g.sim.totInteressi;
      const tot = T <= N1;
      h = `<div class="alert ${tot ? 'warn' : 'good'}">${tot ? 'Serve l\'estinzione totale' : 'Versa'} <b>${F.eur(g.amount)}</b> ${N1 ? `dopo l'anno ${N1} (${App.dateOfPeriod(sc, base, N1 * base.m)})` : 'al rogito'}: il mutuo finisce in ${F.dur(g.sim.durataMesi)} (${App.dateOfPeriod(sc, g.sim, g.sim.rows.length)}) e risparmi ${F.eur(saved)} di interessi.${liquidityNote(c, N1, g.amount)}</div>`;
    }
    $('#goalEnd').innerHTML = h;

    const N2 = Math.max(0, Math.round(num(u.goalRataN))), target = num(u.goalRata);
    let h2;
    if (!(target > 0)) h2 = '<div class="alert info">Inserisci la rata desiderata.</div>';
    else if (N2 >= years) h2 = `<div class="alert warn">Il mutuo dura ${F.n(years, 1)} anni: scegli un anno di versamento precedente.</div>`;
    else {
      const g = App.memo(`gRata:${sc.id}:${N2}:${target}`, () => E.amountForRata(sc, N2, target, pen));
      const p = N2 * base.m;
      const cur = base.rows[p] ? base.rows[p].payment : base.rataIniziale;
      if (!g) h2 = '<div class="alert warn">Obiettivo non calcolabile.</div>';
      else if (g.amount <= 0) h2 = `<div class="alert good">La rata dopo l'anno ${N2} è già ${F.eur(cur, 2)}: obiettivo raggiunto senza versamenti.</div>`;
      else {
        const nr = g.sim.rows[p] ? g.sim.rows[p].payment : 0;
        h2 = `<div class="alert good">Versa <b>${F.eur(g.amount)}</b> ${N2 ? `dopo l'anno ${N2}` : 'al rogito'}: la rata passa da ${F.eur(cur, 2)} a ${F.eur(nr, 2)} e risparmi ${F.eur(base.totInteressi - g.sim.totInteressi)} di interessi.${liquidityNote(c, N2, g.amount)}</div>`;
      }
    }
    $('#goalRata').innerHTML = h2;
  }

  function renderPlanList() {
    const list = App.state.ui.est.plan.oneOff;
    const box = $('#planList');
    const rows = box.querySelectorAll('.plan-row');
    if (rows.length !== list.length || !list.length) {
      box.innerHTML = list.length
        ? list.map((o, i) => `<div class="plan-row" data-i="${i}">
            <div class="inp"><input type="number" data-k="year" min="0" step="1" value="${esc(o.year)}" aria-label="Dopo l'anno"><i>anno</i></div>
            <div class="inp"><input type="number" data-k="amount" min="0" step="1000" value="${esc(o.amount)}" aria-label="Importo"><i>€</i></div>
            <button class="btn small icon" data-del="${i}" title="Rimuovi">✕</button></div>`).join('')
        : '<p class="muted" style="font-size:.88rem">Nessun versamento una tantum.</p>';
      return;
    }
    rows.forEach((r, i) => {
      r.querySelectorAll('input').forEach((inp) => {
        if (inp !== document.activeElement) inp.value = list[i][inp.dataset.k];
      });
    });
  }

  function renderPlan(c) {
    const { sc, base, altNet } = c;
    renderPlanList();
    const plan = App.memo('plan:' + sc.id, () => E.simulatePlan(sc, App.planCfg()));
    const k = App.kpi;
    if (!plan.totExtra) {
      $('#planKpis').innerHTML = '<p class="muted" style="font-size:.88rem;grid-column:1/-1">Aggiungi almeno un versamento per vedere l\'effetto del piano.</p>';
    } else {
      const d = base.flows.map((f, i) => f - (plan.flows[i] || 0));
      while (d.length < plan.flows.length) d.push(-(plan.flows[d.length] || 0));
      const net = d.reduce((a, b) => a + b, 0);
      const ir = E.irr(d);
      const irA = ir == null ? null : Math.pow(1 + ir, base.m) - 1;
      const p = plan.rows.length ? plan.rows[plan.rows.length - 1] : null;
      const nuovaRata = plan.rows.length > 1 ? plan.rows[plan.rows.length - 2].payment : p ? p.payment : 0;
      $('#planKpis').innerHTML = k('Totale versato', F.eur(plan.totExtra), plan.totPenali ? `penali ${F.eur(plan.totPenali)}` : '')
        + k('Interessi risparmiati', F.eur(base.totInteressi - plan.totInteressi), base.totDetr - plan.totDetr > 1 ? `detrazioni perse ${F.eur(base.totDetr - plan.totDetr)}` : '', 'good')
        + k('Risparmio netto', F.eur(net), 'interessi + spese − detrazioni perse − penali', net > 0 ? 'good' : 'bad')
        + k('Rendimento del piano', irA == null ? '–' : F.pct(irA), `alternativa netta ${F.pct(altNet)}`, irA != null && irA > altNet ? 'good' : 'warn')
        + k('Fine mutuo', App.dateOfPeriod(sc, plan, plan.rows.length), `${F.dur(base.durataMesi - plan.durataMesi)} prima`)
        + k(App.state.ui.est.plan.mode === 'rata' ? 'Rata finale' : 'Rata', F.eur(nuovaRata, 2), `iniziale ${F.eur(base.rataIniziale, 2)}`);
    }
    const nY = base.years.length;
    const labels = Array.from({ length: nY + 1 }, (_, i) => i);
    const resAt = (res, y) => (y === 0 ? res.mutuo - res.extra0 : y <= res.years.length ? res.years[y - 1].residualEnd : 0);
    const extraAt = (y) => (y === 0 ? plan.extra0 : plan.years[y - 1] ? plan.years[y - 1].extra : 0);
    const o = App.lineOpts({ xTitle: 'Anno' });
    App.chart('chEstPiano', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Senza versamenti', data: labels.map((y) => Math.round(resAt(base, y))), borderColor: '#94a3b8', borderDash: [5, 4] },
          { label: 'Con il piano', data: labels.map((y) => Math.round(resAt(plan, y))), borderColor: App.color(sc), backgroundColor: App.alpha(App.color(sc), 0.12), fill: true },
          { type: 'bar', label: 'Versamenti', data: labels.map((y) => Math.round(extraAt(y))), backgroundColor: App.alpha('#f59e0b', 0.8) },
        ],
      },
      options: o,
    });
  }

  function renderSurroga(c) {
    const { u, sc, base } = c;
    const box = $('#surroga');
    const N = Math.max(1, Math.round(num(u.surN, 1)));
    const p = N * base.m;
    if (p >= base.rows.length) { box.innerHTML = `<div class="alert warn">Il mutuo termina prima dell'anno ${N}.</div>`; return; }
    const resid = E.residualAfter(base, p);
    const remPeriods = base.rows.length - p;
    const remMonths = Math.round((remPeriods * 12) / base.m);
    const newMonths = num(u.surAnni) > 0 ? Math.round(num(u.surAnni) * 12) : remMonths;
    const nsc = Object.assign({}, sc, {
      prezzo: resid, anticipo: 0, tipoTasso: 'fisso', tanFisso: num(u.surTan), durataAnni: Math.floor(newMonths / 12), durataMesi: newMonths % 12,
      istruttoria: 0, perizia: 0, notaioMutuo: 0, mediazione: 0,
    });
    const ns = App.memo(`sur:${sc.id}:${N}:${u.surTan}:${newMonths}`, () => E.simulate(nsc));
    const oldInt = base.rows.slice(p).reduce((a, r) => a + r.interest, 0);
    const oldRata = base.rows[p].payment;
    const oldTan = base.rows[p].rate;
    const saved = oldInt - ns.totInteressi;
    const dR = (ns.rataIniziale - oldRata) * App.meq(base);
    const row = (l, a, b, cls) => `<tr><td>${l}</td><td>${a}</td><td class="${cls || ''}">${b}</td></tr>`;
    let verdict;
    if (saved > 1000 && num(u.surTan) / 100 < oldTan) verdict = `<div class="alert good">✅ La surroga conviene: risparmi ${F.eur(saved)} di interessi${dR < 0 ? ` e ${F.eur(-dR)} al mese di rata` : ''}. È gratuita: chiedi un'offerta anche alla tua banca per una rinegoziazione.</div>`;
    else if (saved > 0) verdict = `<div class="alert warn">⚖️ Risparmio modesto (${F.eur(saved)}): valuta tempi e condizioni accessorie (assicurazioni, conti obbligatori).</div>`;
    else verdict = `<div class="alert bad">❌ Non conviene: con la nuova offerta pagheresti ${F.eur(-saved)} di interessi in più${newMonths > remMonths ? ' (anche per la durata più lunga)' : ''}.</div>`;
    box.innerHTML = `<div class="table-wrap nolimit"><table class="tbl compact"><thead><tr><th>Dopo l'anno ${N} (${App.dateOfPeriod(sc, base, p)})</th><th>Mutuo attuale</th><th>Dopo la surroga</th></tr></thead><tbody>
      ${row('Debito residuo', F.eur(resid), F.eur(resid))}
      ${row('TAN', F.pct(oldTan) + (sc.tipoTasso === 'fisso' ? '' : ' (oggi, poi varia)'), F.pct(num(u.surTan) / 100) + ' fisso')}
      ${row('Durata residua', F.dur(remMonths), F.dur(newMonths))}
      ${row('Rata', F.eur(oldRata, 2), F.eur(ns.rataIniziale, 2), dR < 0 ? 'pos' : dR > 0 ? 'neg' : '')}
      ${row('Interessi residui', F.eur(oldInt), F.eur(ns.totInteressi), saved > 0 ? 'pos' : 'neg')}
      </tbody></table></div>${verdict}`;
  }

  App.renderEst2 = function (c) {
    renderGoals(c);
    renderPlan(c);
    renderSurroga(c);
  };

  App.bindEst2 = function () {
    const box = $('#planList');
    box.addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-k]');
      if (!inp) return;
      const i = +inp.closest('.plan-row').dataset.i;
      const o = App.state.ui.est.plan.oneOff[i];
      if (!o) return;
      o[inp.dataset.k] = inp.value === '' ? '' : +inp.value;
      App.changed();
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      App.state.ui.est.plan.oneOff.splice(+b.dataset.del, 1);
      box.innerHTML = '';
      App.changed();
    });
    $('#btnPlanAdd').addEventListener('click', () => {
      const list = App.state.ui.est.plan.oneOff;
      if (list.length >= 30) { App.toast('Massimo 30 versamenti.'); return; }
      const last = list[list.length - 1];
      list.push({ year: last ? num(last.year) + 1 : 3, amount: last ? num(last.amount) : 10000 });
      App.changed();
    });
  };
})();
