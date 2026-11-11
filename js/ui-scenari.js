/* Scheda "Scenari": profilo, gestione scenari, modulo e riepilogo */
(function () {
  'use strict';
  const App = window.App, E = App.E, F = App.fmt, $ = App.$, $$ = App.$$, esc = App.esc;
  const num = (v, d) => E.num(v, d);

  /* ---------- Lettura/scrittura campi ---------- */
  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') {
      if (el.value === '') return '';
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : '';
    }
    if (el.tagName === 'SELECT' && /^-?\d+(\.\d+)?$/.test(el.value) && el.dataset.field === 'frequenza') return Number(el.value);
    return el.value;
  }
  App.readInput = readInput;
  function writeInput(el, v) {
    if (el === document.activeElement && el.type !== 'checkbox' && el.tagName !== 'SELECT') return;
    if (el.type === 'checkbox') el.checked = !!v;
    else {
      const s = v == null ? '' : String(v);
      if (el.value !== s) el.value = s;
    }
  }
  App.writeInput = writeInput;

  function syncProfile() {
    const p = App.state.profile;
    $$('[data-profile]').forEach((el) => writeInput(el, p[el.dataset.profile]));
  }
  App.syncProfile = syncProfile;

  function fillForm() {
    const sc = App.active();
    $$('#scForm [data-field]').forEach((el) => writeInput(el, el.dataset.field === 'colore' ? App.color(sc) : sc[el.dataset.field]));
    const r = $('[data-anticipo-pct]');
    if (r && r !== document.activeElement) r.value = num(sc.prezzo) > 0 ? Math.round((100 * num(sc.anticipo)) / num(sc.prezzo)) : 0;
    updateShow();
  }
  App.fillForm = fillForm;

  function updateShow() {
    const sc = App.active();
    $$('#scForm [data-show]').forEach((el) => {
      const ok = el.dataset.show.split(';').every((cond) => {
        const [k, vals] = cond.split('=');
        return vals.split('|').includes(String(sc[k.trim()]));
      });
      el.hidden = !ok;
    });
  }

  /* ---------- Eventi ---------- */
  function bind() {
    $$('[data-profile]').forEach((el) => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const k = el.dataset.profile;
        App.state.profile[k] = el.tagName === 'SELECT' ? el.value : readInput(el);
        $$(`[data-profile="${k}"]`).forEach((o) => o !== el && writeInput(o, App.state.profile[k]));
        App.changed();
      });
    });

    const form = $('#scForm');
    const onField = (ev) => {
      const el = ev.target;
      const k = el.dataset && el.dataset.field;
      if (!k) return;
      const sc = App.active();
      sc[k] = readInput(el);
      if (k === 'colore') sc.colore = /^#[0-9a-f]{6}$/i.test(el.value) ? el.value : sc.colore;
      if (k === 'prezzo' || k === 'anticipo') {
        const r = $('[data-anticipo-pct]');
        if (r) r.value = num(sc.prezzo) > 0 ? Math.round((100 * num(sc.anticipo)) / num(sc.prezzo)) : 0;
      }
      if (['tipoTasso', 'euriborScenario', 'capAttivo', 'venditore'].includes(k)) updateShow();
      if (k === 'nome' || k === 'colore') renderChips();
      App.changed();
    };
    form.addEventListener('input', onField);
    form.addEventListener('change', (ev) => { if (ev.target.tagName === 'SELECT' || ev.target.type === 'checkbox') onField(ev); });
    form.addEventListener('focusout', (ev) => { if (ev.target.dataset && ev.target.dataset.field) writeInput(ev.target, App.active()[ev.target.dataset.field]); });

    const range = $('[data-anticipo-pct]');
    range.addEventListener('input', (ev) => {
      ev.stopPropagation();
      const sc = App.active();
      const p = num(sc.prezzo);
      sc.anticipo = Math.round((p * num(range.value)) / 100 / 500) * 500;
      writeInput($('#scForm [data-field="anticipo"]'), sc.anticipo);
      App.changed();
    });

    $('#chips').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-id]');
      if (!b) return;
      App.state.activeId = b.dataset.id;
      App.save();
      fillForm();
      App.render();
    });

    $('#presetSel').addEventListener('change', (ev) => {
      const v = ev.target.value;
      ev.target.value = '';
      if (!v) return;
      const base = App.active();
      const over = v === 'copia' ? { nome: base.nome + ' (copia)' } : Object.assign({}, App.PRESETS[v]);
      if (v === 'anticipo30') over.anticipo = Math.round((num(base.prezzo) * 0.3) / 1000) * 1000;
      addScenario(Object.assign({}, base, over));
    });
    $('#btnDup').addEventListener('click', () => { const b = App.active(); addScenario(Object.assign({}, b, { nome: b.nome + ' (copia)' })); });
    $('#btnDel').addEventListener('click', () => {
      const st = App.state;
      if (st.scenarios.length <= 1) return App.toast('Serve almeno uno scenario.');
      const sc = App.active();
      if (!window.confirm(`Eliminare lo scenario "${sc.nome}"?`)) return;
      const i = st.scenarios.indexOf(sc);
      st.scenarios.splice(i, 1);
      st.activeId = st.scenarios[Math.max(0, i - 1)].id;
      fillForm();
      App.changed();
      App.render();
    });
  }

  function addScenario(data) {
    const st = App.state;
    if (st.scenarios.length >= App.MAX_SC) return App.toast(`Puoi confrontare al massimo ${App.MAX_SC} scenari.`);
    const used = st.scenarios.map((s) => String(s.colore).toLowerCase());
    const colore = App.PALETTE.find((c) => !used.includes(c)) || App.PALETTE[st.scenarios.length % App.PALETTE.length];
    const sc = Object.assign(JSON.parse(JSON.stringify(data)), { id: App.uid(), colore });
    st.scenarios.push(sc);
    st.activeId = sc.id;
    fillForm();
    App.changed();
    App.render();
    App.toast(`Scenario "${sc.nome}" aggiunto.`);
  }

  /* ---------- Rendering ---------- */
  function renderChips() {
    const best = App.cmp().best;
    $('#chips').innerHTML = App.state.scenarios
      .map((s) => `<button type="button" class="chip${s.id === App.state.activeId ? ' active' : ''}" data-id="${s.id}" style="--c:${App.color(s)}" title="${esc(App.tassoLabel(s))}">
        <span class="dot"></span>${esc(s.nome)}${best && best.sc.id === s.id && App.state.scenarios.length > 1 ? ' <span class="star" title="Scenario consigliato">★</span>' : ''}</button>`)
      .join('');
    $('#btnDel').disabled = App.state.scenarios.length <= 1;
    $('#btnDup').disabled = App.state.scenarios.length >= App.MAX_SC;
  }
  App.renderChips = renderChips;

  function hint(name, html, cls) {
    const el = $(`[data-hint="${name}"]`);
    if (el) { el.innerHTML = html || ''; el.className = 'hint' + (cls ? ' ' + cls : ''); }
  }

  function renderHints(sc, res, it) {
    const prima = sc.tipoCasa !== 'seconda';
    hint('anticipo', `Mutuo richiesto: <b>${F.eur(res.mutuo)}</b> · LTV ${F.pct(res.ltv, 0)}`, res.ltv > 0.8 ? 'warn' : '');
    hint('anticipoPct', `${F.pct(res.prezzo ? res.anticipo / res.prezzo : 0, 0)} del prezzo${res.ltv > 0.8 ? ' · oltre l\'80% di LTV serve una garanzia' : ''}`);
    hint('tipoCasa', prima ? 'Agevolazioni: registro 2% (o IVA 4%), sostitutiva 0,25%, detrazione interessi.' : 'Registro 9% (o IVA 10%), sostitutiva 2%, niente detrazione.');
    const ca = res.costiAcq;
    hint('venditore', sc.venditore === 'impresa'
      ? `IVA ${F.eur(ca.iva)} + registro/ipotecaria/catastale ${F.eur(600)}`
      : `Registro ${F.eur(ca.registro)} + ipotecaria e catastale ${F.eur(100)}`);
    hint('rendita', num(sc.renditaCatastale) > 0 ? `Valore catastale: ${F.eur(ca.base)}` : 'Senza rendita la base imponibile è il prezzo.');
    hint('agenzia', `Provvigione: ${F.eur(ca.agenzia)}`);
    const anniFine = num(App.state.profile.eta) + res.durataMesi / 12;
    hint('durata', `${res.n} rate · ultima: ${F.date(sc, res.durataMesi)} · età a fine mutuo ${Math.round(anniFine)} anni`, anniFine > 75 ? 'warn' : '');
    hint('tan', `TAN iniziale: <b>${F.pct(res.tanIniziale)}</b>${it && it.variabile ? ` · con Euribor +2%: rata max ${F.eur(it.rataStressMese)}` : ''}`);
    hint('sostitutiva', `Imposta sostitutiva ${prima ? '0,25%' : '2%'}: <b>${F.eur(res.costiMut.sostitutiva)}</b> · costi mutuo totali ${F.eur(res.costiMut.totale)} · TAEG ${res.taeg == null ? '–' : F.pct(res.taeg)}`);
    if (sc.detrazione && !prima) hint('detrazione', 'La detrazione degli interessi spetta solo per l\'abitazione principale: per la seconda casa non viene calcolata.', 'warn');
    else if (sc.detrazione) hint('detrazione', `Detrazione stimata: <b>${F.eur(res.totDetr)}</b> in totale (19% di interessi e oneri fino a 4.000 €/anno, max 760 €/anno).`);
    else hint('detrazione', '');
  }

  function renderProfileHint() {
    const p = App.state.profile;
    const fondo = App.fondo();
    const rataMax = Math.max(0, (num(p.reddito) * num(p.quotaMax, 33)) / 100 - num(p.altreRate));
    const risp = num(p.reddito) - num(p.speseMensili) - num(p.altreRate);
    $('#profileHint').innerHTML = `Fondo di emergenza: <b>${F.eur(fondo)}</b> · rata massima sostenibile: <b>${F.eur(rataMax)}</b>/mese · rendimento alternativo netto: <b>${F.pct(App.altNet())}</b> · risparmio mensile prima della rata: <b>${F.eur(risp)}</b>`;
  }

  function renderSummary(sc, res, it) {
    const p = App.state.profile;
    const meq = App.meq(res);
    const freq = { 12: 'mensile', 4: 'trimestrale', 2: 'semestrale', 1: 'annuale' }[res.m];
    const ratio = it ? it.ratio : null;
    const quota = num(p.quotaMax, 33) / 100;
    const k = App.kpi;
    const rataLbl = res.m === 12 ? 'Rata mensile' : `Rata ${freq}`;
    const rataSub = sc.ammortamento === 'italiano' || sc.tipoTasso !== 'fisso'
      ? `da ${F.eur(res.rataIniziale, 2)} · max ${F.eur(res.rataMax, 2)}`
      : res.m !== 12 ? `≈ ${F.eur(res.rataIniziale * meq)} al mese` : 'costante per tutta la durata';
    let h = `<div class="card-head"><h2><i style="background:${App.color(sc)}"></i>${esc(sc.nome)}</h2></div>
      <div class="muted" style="font-size:.85rem;margin:-6px 0 10px">${esc(App.tassoLabel(sc))} · ${F.dur(res.durataMesi)} · ammortamento ${sc.ammortamento === 'italiano' ? 'italiano' : 'francese'}</div>
      <div class="kpis two">
        ${k(rataLbl, F.eur(res.rataIniziale, 2), rataSub, 'hl')}
        ${k('Importo mutuo', F.eur(res.mutuo), `LTV ${F.pct(res.ltv, 0)}`, res.ltv > 0.8 ? 'warn' : '')}
        ${k('TAN / TAEG', `${F.pct(res.tanIniziale)} / ${res.taeg == null ? '–' : F.pct(res.taeg)}`, 'TAEG con costi obbligatori')}
        ${k('Totale interessi', F.eur(res.totInteressi), `${F.pct(res.mutuo ? res.totInteressi / res.mutuo : 0, 0)} del capitale`)}
        ${k('Liquidità al rogito', F.eur(res.liquiditaRogito), it ? `resta ${F.eur(it.liquiditaResidua)}` : '', it && it.liquiditaResidua < 0 ? 'bad' : it && it.liquiditaResidua < App.fondo() ? 'warn' : '')}
        ${k('Costo totale casa', F.eur(res.costoTotale), `credito ${F.eur(res.costoCredito)}`)}
        ${k('Fine mutuo', F.date(sc, res.durataMesi), `incrocio capitale > interessi: anno ${res.annoIncrocio || '–'}`)}
        ${k('Detrazioni fiscali', F.eur(res.totDetr), sc.detrazione && sc.tipoCasa !== 'seconda' ? 'già sottratte dai costi' : 'non applicate')}
      </div>`;
    if (ratio != null) {
      const cls = ratio > 0.4 ? 'bad' : ratio > quota ? 'warn' : '';
      h += `<div class="ratio-line"><span>Rata (+ altre rate) / reddito</span><b>${F.pct(ratio, 1)}</b></div>
        <div class="progress ${cls}"><div style="width:${Math.min(100, ratio * 100 / 0.6 * 100 / 100).toFixed(1)}%"></div><span class="mark" style="left:${((quota / 0.6) * 100).toFixed(1)}%" title="Soglia ${F.pct(quota, 0)}"></span></div>
        <small class="muted">Barra fino al 60% · tacca = soglia ${F.pct(quota, 0)}${it.variabile ? ` · con Euribor +2%: ${F.pct(it.ratioStress, 1)}` : ''}</small>`;
    }
    h += `<h3 style="margin-top:14px">Dove vanno i soldi</h3><div class="chart-box pie"><canvas id="chSummary"></canvas></div>`;
    if (it && it.warnings.length) h += `<div class="alert warn"><b>Attenzione</b><ul>${it.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
    else if (it) h += `<div class="alert good">✅ Scenario sostenibile rispetto al tuo profilo.</div>`;
    const ca = res.costiAcq, cm = res.costiMut;
    const row = (l, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${l}</td><td>${F.eur(v)}</td></tr>`;
    h += `<details class="more"><summary>Dettaglio costi</summary><table class="kv">
      ${sc.venditore === 'impresa' ? row('IVA', ca.iva) : row('Imposta di registro', ca.registro)}
      ${row('Ipotecaria + catastale', ca.ipotecaria + ca.catastale)}${row('Agenzia', ca.agenzia)}${row('Notaio acquisto', ca.notaio)}${row('Altre spese', ca.altre)}
      ${row('Totale spese di acquisto', ca.totale, 'tot')}
      ${row('Istruttoria + perizia', cm.istruttoria + cm.perizia)}${row('Notaio mutuo', cm.notaio)}${row('Mediazione', cm.mediazione)}${row('Imposta sostitutiva', cm.sostitutiva)}
      ${row('Totale costi mutuo', cm.totale, 'tot')}
      ${row('Interessi', res.totInteressi)}${row('Assicurazioni', res.totAss)}${row('Incasso rata e spese annue', res.totFees)}${row('− Detrazioni IRPEF', -res.totDetr)}
      ${row('Costo del credito', res.costoCredito, 'tot')}
      ${row('Prezzo + spese + credito', res.costoTotale, 'tot')}
      </table></details>`;
    $('#summary').innerHTML = h;
    const parts = [
      ['Anticipo', res.anticipo, '#64748b'], ['Capitale mutuo', res.mutuo, App.color(sc)], ['Interessi', res.totInteressi, '#ef4444'],
      ['Imposte e spese acquisto', ca.totale, '#f59e0b'], ['Costi mutuo', cm.totale, '#8b5cf6'], ['Assicurazioni e spese', res.totAss + res.totFees, '#06b6d4'],
    ].filter((x) => x[1] > 0.5);
    App.chart('chSummary', {
      type: 'doughnut',
      data: { labels: parts.map((x) => x[0]), datasets: [{ data: parts.map((x) => Math.round(x[1])), backgroundColor: parts.map((x) => x[2]), borderWidth: 1 }] },
      options: App.pieOpts(),
    });
  }

  App.renderers.scenari = function () {
    const sc = App.active();
    const it = App.item(sc.id);
    const res = it ? it.res : E.simulate(sc);
    syncProfile();
    fillForm();
    renderChips();
    renderProfileHint();
    renderHints(sc, res, it);
    renderSummary(sc, res, it);
  };
  App.bindScenari = bind;
})();
