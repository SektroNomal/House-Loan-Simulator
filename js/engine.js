/* Simulatore Mutuo Casa – motore di calcolo (senza dipendenze, usabile anche in Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MutuoEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DETR_ALIQ = 0.19;
  const DETR_MAX = 4000;
  const EPS = 0.005;

  function num(v, d = 0) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : d;
    const x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(x) ? x : d;
  }

  function annuity(R, r, n) {
    if (n <= 0) return R;
    if (Math.abs(r) < 1e-12) return R / n;
    return (R * r) / (1 - Math.pow(1 + r, -n));
  }

  function npv(flows, i) {
    let s = 0, d = 1;
    const f = 1 / (1 + i);
    for (let k = 0; k < flows.length; k++) {
      if (flows[k]) s += flows[k] * d;
      d *= f;
    }
    return s;
  }

  // Tasso interno di rendimento per periodo (bisezione robusta)
  function irr(flows) {
    let lo = -0.2, hi = 0.5;
    let flo = npv(flows, lo);
    const fhi = npv(flows, hi);
    if (!Number.isFinite(flo) || flo * fhi > 0) {
      lo = -0.03;
      flo = npv(flows, lo);
      if (!Number.isFinite(flo) || flo * fhi > 0) return null;
    }
    for (let it = 0; it < 200; it++) {
      const mid = (lo + hi) / 2;
      const fm = npv(flows, mid);
      if (fm * flo <= 0) hi = mid;
      else { lo = mid; flo = fm; }
      if (hi - lo < 1e-13) break;
    }
    return (lo + hi) / 2;
  }

  function periodsInfo(sc) {
    const m = [12, 4, 2, 1].includes(num(sc.frequenza, 12)) ? num(sc.frequenza, 12) : 12;
    const months = Math.max(1, Math.round(num(sc.durataAnni) * 12 + num(sc.durataMesi)));
    const n = Math.max(1, Math.round((months * m) / 12));
    return { m, months, n };
  }

  function importoMutuo(sc) {
    const prezzo = Math.max(0, num(sc.prezzo));
    const anticipo = Math.min(Math.max(0, num(sc.anticipo)), prezzo);
    return { prezzo, anticipo, mutuo: prezzo - anticipo };
  }

  // Imposte e spese di acquisto (normativa italiana, valori indicativi)
  function costiAcquisto(sc) {
    const prima = sc.tipoCasa !== 'seconda';
    const prezzo = Math.max(0, num(sc.prezzo));
    let registro = 0, ipotecaria = 0, catastale = 0, iva = 0, base = prezzo;
    if (sc.venditore === 'impresa') {
      iva = prezzo * (prima ? 0.04 : 0.10);
      registro = 200; ipotecaria = 200; catastale = 200;
    } else {
      const rc = num(sc.renditaCatastale);
      base = rc > 0 ? rc * 1.05 * (prima ? 110 : 120) : prezzo;
      registro = Math.max(1000, base * (prima ? 0.02 : 0.09));
      ipotecaria = 50; catastale = 50;
    }
    const imposte = registro + ipotecaria + catastale + iva;
    const agenzia = prezzo * num(sc.agenziaPerc) / 100 * (sc.agenziaIva ? 1.22 : 1);
    const notaio = num(sc.notaioAcquisto);
    const altre = num(sc.altreSpese);
    return { base, registro, ipotecaria, catastale, iva, imposte, agenzia, notaio, altre, totale: imposte + agenzia + notaio + altre };
  }

  function costiMutuo(sc, mutuo) {
    const prima = sc.tipoCasa !== 'seconda';
    const sostitutiva = mutuo * (prima ? 0.0025 : 0.02);
    const istruttoria = num(sc.istruttoria), perizia = num(sc.perizia);
    const notaio = num(sc.notaioMutuo), mediazione = num(sc.mediazione);
    const totale = istruttoria + perizia + notaio + mediazione + sostitutiva;
    // Oneri accessori detraibili (19%) insieme agli interessi, nel limite di 4.000 €
    return { istruttoria, perizia, notaio, mediazione, sostitutiva, totale, oneriDetraibili: totale };
  }

  // Percorso annuo dell'indice (Euribor) in decimali
  function parsePath(str) {
    return String(str || '')
      .split(/[;\s]+/)
      .map((s) => parseFloat(s.replace(',', '.')))
      .filter((x) => Number.isFinite(x));
  }

  function indexPath(sc, years, shockPct) {
    const e0 = num(sc.euribor);
    const mode = sc.euriborScenario || 'costante';
    const custom = mode === 'personalizzato' ? parsePath(sc.euriborCustom) : [];
    const T = Math.max(1, num(sc.euriborAnni, 1));
    const tgt = num(sc.euriborTarget, e0);
    const out = [];
    for (let y = 0; y < years; y++) {
      let v = e0;
      if (mode === 'lineare') v = y >= T ? tgt : e0 + ((tgt - e0) * y) / T;
      else if (mode === 'personalizzato' && custom.length) v = custom[Math.min(y, custom.length - 1)];
      out.push((v + num(shockPct)) / 100);
    }
    return out;
  }

  function annualRate(sc, yearIdx, path) {
    const t = sc.tipoTasso || 'fisso';
    if (t === 'fisso') return num(sc.tanFisso) / 100;
    if (t === 'misto' && yearIdx < num(sc.anniFissi)) return num(sc.tanFisso) / 100;
    let rate = path[Math.min(yearIdx, path.length - 1)] + num(sc.spread) / 100;
    rate = Math.max(rate, num(sc.floor) / 100);
    if (sc.capAttivo) rate = Math.min(rate, num(sc.cap) / 100);
    return rate;
  }

  /**
   * Simula il mutuo.
   * opts.extras: [{ period, amount, mode: 'durata'|'rata' }] – versamento dopo la rata n. "period" (0 = prima della 1ª rata)
   * opts.penale: % penale estinzione anticipata
   * opts.shock: punti % aggiunti all'indice (stress test)
   * opts.discount: tasso annuo di attualizzazione (decimale) per il valore attuale
   */
  function simulate(sc, opts = {}) {
    const { m, months, n } = periodsInfo(sc);
    const { prezzo, anticipo, mutuo } = importoMutuo(sc);
    const italiano = sc.ammortamento === 'italiano';
    const penale = num(opts.penale) / 100;
    const path = indexPath(sc, Math.ceil(n / m) + 80, num(opts.shock));

    const extras = new Map();
    for (const e of opts.extras || []) {
      const a = num(e.amount), p = Math.round(num(e.period));
      if (a > 0 && p >= 0) {
        if (!extras.has(p)) extras.set(p, []);
        extras.get(p).push(e);
      }
    }

    let R = mutuo, end = n, payment = null, quota = null, lastRate = null, recalc = false;
    const rows = [];

    function applyExtras(k, ann) {
      const list = extras.get(k);
      if (!list || R <= EPS) return [0, 0];
      const r = ann / m;
      const remaining = Math.max(1, end - k);
      if (italiano) { if (quota == null) quota = R / remaining; }
      else if (payment == null) { payment = annuity(R, r, remaining); lastRate = ann; }
      let extra = 0, pen = 0, mode = 'durata';
      for (const e of list) {
        const a = Math.min(num(e.amount), R);
        if (a <= 0) continue;
        R -= a; extra += a; pen += a * penale;
        if (e.mode) mode = e.mode;
      }
      if (R <= EPS) { R = 0; return [extra, pen]; }
      if (mode === 'rata') recalc = true;
      else if (italiano) end = Math.min(end, k + Math.max(1, Math.ceil(R / quota - 1e-9)));
      else {
        let nf;
        if (Math.abs(r) < 1e-12) nf = R / payment;
        else {
          const x = 1 - (r * R) / payment;
          nf = x > 1e-12 ? -Math.log(x) / Math.log(1 + r) : remaining;
        }
        end = Math.min(end, k + Math.max(1, Math.ceil(nf - 1e-9)));
      }
      return [extra, pen];
    }

    const [extra0, pen0] = applyExtras(0, annualRate(sc, 0, path));
    const maxP = n + 1200;
    for (let k = 1; R > EPS && k <= maxP; k++) {
      const yearIdx = Math.floor((k - 1) / m);
      const ann = annualRate(sc, yearIdx, path);
      const r = ann / m;
      const remaining = Math.max(1, end - k + 1);
      const interest = R * r;
      let principal, pay;
      if (italiano) {
        if (quota == null || recalc) quota = R / remaining;
        principal = remaining <= 1 ? R : Math.min(quota, R);
        pay = principal + interest;
      } else {
        if (payment == null || recalc || ann !== lastRate) payment = annuity(R, r, remaining);
        pay = payment;
        principal = pay - interest;
        if (remaining <= 1 || principal >= R - EPS) { principal = R; pay = R + interest; }
      }
      recalc = false;
      lastRate = ann;
      R -= principal;
      if (R < EPS) R = 0;
      const [ex, pe] = applyExtras(k, ann);
      rows.push({ k, year: yearIdx + 1, rate: ann, payment: pay, interest, principal, extra: ex, penalty: pe, residual: R });
    }

    // Aggregazione annuale, assicurazioni, spese, detrazioni
    const ass = num(sc.assIncendio) + num(sc.assCpi);
    const incasso = num(sc.incassoRata);
    const speseAnnue = num(sc.speseAnnue);
    const cm = costiMutuo(sc, mutuo);
    const ca = costiAcquisto(sc);
    const detr = !!sc.detrazione && sc.tipoCasa !== 'seconda';
    const nYears = Math.ceil(rows.length / m);
    const years = [];
    for (let y = 1; y <= nYears; y++) {
      years.push({ year: y, payments: 0, interest: 0, principal: 0, extra: 0, penalty: 0, count: 0, residualStart: 0, residualEnd: 0, rateSum: 0, rate: 0, insurance: ass, fees: speseAnnue, detrazione: 0, rataMedia: 0 });
    }
    for (const r of rows) {
      const Y = years[r.year - 1];
      Y.payments += r.payment; Y.interest += r.interest; Y.principal += r.principal;
      Y.extra += r.extra; Y.penalty += r.penalty; Y.count++; Y.rateSum += r.rate;
      Y.residualEnd = r.residual;
    }
    let prevRes = mutuo - extra0;
    for (const Y of years) {
      Y.residualStart = prevRes;
      prevRes = Y.residualEnd;
      Y.rate = Y.count ? Y.rateSum / Y.count : 0;
      Y.rataMedia = Y.count ? Y.payments / Y.count : 0;
      Y.fees += incasso * Y.count;
      if (detr) Y.detrazione = DETR_ALIQ * Math.min(DETR_MAX, Y.interest + (Y.year === 1 ? cm.oneriDetraibili : 0));
    }

    // Flussi in uscita per periodo (positivi = esborsi del mutuatario)
    const L = nYears * m + 1;
    const flows = new Array(Math.max(L, 1)).fill(0);
    flows[0] += extra0 + pen0;
    for (const r of rows) flows[r.k] += r.payment + r.extra + r.penalty + incasso;
    for (const Y of years) {
      flows[(Y.year - 1) * m] += Y.insurance + speseAnnue;
      flows[Math.min(Y.year * m, flows.length - 1)] -= Y.detrazione;
    }

    // TAEG (stima ISC): include istruttoria, perizia, imposta sostitutiva, mediazione, incasso rata, assicurazioni obbligatorie
    const assObbl = num(sc.assIncendio) + (sc.cpiObbligatoria ? num(sc.assCpi) : 0);
    const tf = new Array(Math.max(L, 1)).fill(0);
    tf[0] = mutuo - (cm.istruttoria + cm.perizia + cm.sostitutiva + cm.mediazione) - extra0;
    for (const r of rows) tf[r.k] -= r.payment + r.extra + incasso;
    for (const Y of years) tf[(Y.year - 1) * m] -= assObbl + speseAnnue;
    const iT = mutuo > 0 ? irr(tf) : null;
    const taeg = iT == null ? null : Math.pow(1 + iT, m) - 1;

    const regular = rows.length > 1 ? rows.slice(0, -1) : rows;
    const pays = regular.map((r) => r.payment);
    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
    const totInteressi = sum(rows, (r) => r.interest);
    const totExtra = extra0 + sum(rows, (r) => r.extra);
    const totPenali = pen0 + sum(rows, (r) => r.penalty);
    const totAss = sum(years, (y) => y.insurance);
    const totFees = sum(years, (y) => y.fees);
    const totDetr = sum(years, (y) => y.detrazione);
    const totRate = sum(rows, (r) => r.payment);
    const costoCredito = totInteressi + cm.totale + totAss + totFees + totPenali - totDetr;
    const costoTotale = prezzo + ca.totale + costoCredito;
    const liquiditaRogito = anticipo + ca.totale + cm.totale + (flows[0] || 0) - extra0 - pen0;
    const crossover = years.find((y) => y.principal > y.interest);
    const disc = num(opts.discount);
    const iD = Math.pow(1 + disc, 1 / m) - 1;
    const valoreAttuale = anticipo + ca.totale + cm.totale + npv(flows, iD);

    return {
      sc, m, n, months, prezzo, anticipo, mutuo, ltv: prezzo > 0 ? mutuo / prezzo : 0,
      rows, years, flows, extra0, path,
      rataIniziale: rows.length ? rows[0].payment : 0,
      rataMax: pays.length ? Math.max(...pays) : 0,
      rataMin: pays.length ? Math.min(...pays) : 0,
      rataMedia: rows.length ? totRate / rows.length : 0,
      tanIniziale: rows.length ? rows[0].rate : annualRate(sc, 0, path),
      taeg, totInteressi, totExtra, totPenali, totAss, totFees, totDetr, totRate,
      costiAcq: ca, costiMut: cm, costoCredito, costoTotale, liquiditaRogito, valoreAttuale,
      durataPeriodi: rows.length, durataMesi: (rows.length * 12) / m,
      annoIncrocio: crossover ? crossover.year : null,
    };
  }

  function residualAfter(res, p) {
    if (p <= 0) return res.mutuo - res.extra0;
    const row = res.rows[Math.min(p, res.rows.length) - 1];
    return row ? row.residual : 0;
  }

  function diffFlows(base, sim, p) {
    const len = Math.max(base.flows.length, sim.flows.length);
    const d = [];
    for (let k = p; k < len; k++) d.push((base.flows[k] || 0) - (sim.flows[k] || 0));
    return d;
  }

  const annualize = (i, m) => (i == null ? null : Math.pow(1 + i, m) - 1);
  const periodic = (a, m) => Math.pow(1 + a, 1 / m) - 1;

  /**
   * Analizza un versamento straordinario di "amount" dopo N anni, per ogni N.
   * prm: { amount, mode, penale, altNet (decimale), minSaving (decimale) }
   */
  function analyzePrepayment(sc, prm) {
    const base = simulate(sc);
    const m = base.m;
    const iAlt = periodic(num(prm.altNet), m);
    const out = [];
    const totalYears = Math.ceil(base.rows.length / m);
    for (let N = 1; N < totalYears; N++) {
      const p = N * m;
      if (p >= base.rows.length) break;
      const resid = residualAfter(base, p);
      const A = Math.min(num(prm.amount), resid);
      if (A <= 0) break;
      const sim = simulate(sc, { extras: [{ period: p, amount: A, mode: prm.mode }], penale: prm.penale });
      const d = diffFlows(base, sim, p);
      const netSaving = d.reduce((s, x) => s + x, 0);
      const irrA = annualize(irr(d), m);
      const van = npv(d, iAlt);
      const interestSaved = base.totInteressi - sim.totInteressi;
      const detrLost = base.totDetr - sim.totDetr;
      const remainingInterest = base.rows.slice(p).reduce((s, r) => s + r.interest, 0);
      const row = {
        N, p, A, resid, interestSaved, detrLost, penalty: sim.totPenali, netSaving,
        savingPct: A > 0 ? netSaving / A : 0, irr: irrA, van, vanPerEuro: A > 0 ? van / A : 0,
        monthsSaved: ((base.rows.length - sim.rows.length) * 12) / m,
        oldRata: base.rows[p] ? base.rows[p].payment : 0,
        newRata: sim.rows[p] ? sim.rows[p].payment : 0,
        remainingInterest,
        interestShare: base.years[N] ? base.years[N].interest / Math.max(1e-9, base.years[N].payments) : 0,
      };
      const alt = num(prm.altNet);
      if (irrA == null || irrA <= alt) row.verdict = 'no';
      else if (row.savingPct < num(prm.minSaving)) row.verdict = 'marginale';
      else row.verdict = 'si';
      out.push(row);
    }
    const good = out.filter((r) => r.verdict === 'si');
    const best = good.reduce((b, r) => (!b || r.vanPerEuro > b.vanPerEuro ? r : b), null);
    const deadline = good.length ? good[good.length - 1] : null;
    return { base, rows: out, best, deadline, anyGood: good.length > 0 };
  }

  function niceStep(raw) {
    if (raw <= 0) return 1000;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const c of [1, 2, 2.5, 5, 10]) if (c * mag >= raw) return c * mag;
    return 10 * mag;
  }

  /** Quanto conviene iniettare dopo N anni: risparmio e rendimento marginale per importo */
  function amountAnalysis(sc, prm) {
    const base = simulate(sc);
    const m = base.m;
    const p = Math.max(0, Math.round(num(prm.N) * m));
    if (p >= base.rows.length) return null;
    const resid = residualAfter(base, p);
    if (resid <= 0) return null;
    const step = niceStep(resid / 20);
    const amounts = [];
    for (let a = step; a < resid - 1; a += step) amounts.push(a);
    amounts.push(resid);
    const alt = num(prm.altNet);
    const iAlt = periodic(alt, m);
    const rows = [];
    let prev = base, optimal = 0, broke = false;
    for (const A of amounts) {
      const sim = simulate(sc, { extras: [{ period: p, amount: A, mode: prm.mode }], penale: prm.penale });
      const d = diffFlows(base, sim, p);
      const dm = diffFlows(prev, sim, p);
      const irrTot = annualize(irr(d), m);
      const irrMarg = annualize(irr(dm), m);
      const netSaving = d.reduce((s, x) => s + x, 0);
      rows.push({ A, netSaving, irr: irrTot, irrMarg, van: npv(d, iAlt), monthsSaved: ((base.rows.length - sim.rows.length) * 12) / m, newRata: sim.rows[p] ? sim.rows[p].payment : 0 });
      if (!broke && irrMarg != null && irrMarg > alt) optimal = A;
      else broke = true;
      prev = sim;
    }
    return { N: prm.N, p, resid, step, rows, optimal };
  }

  /** Importo minimo (dopo N anni, riduzione durata) per chiudere il mutuo entro targetYears dall'inizio */
  function amountForEnd(sc, N, targetYears, penale) {
    const base = simulate(sc);
    const m = base.m;
    const p = Math.round(N * m);
    const target = Math.round(targetYears * m);
    const resid = residualAfter(base, p);
    if (base.rows.length <= target) return { amount: 0, feasible: true, sim: base };
    if (target <= p) return { amount: resid, feasible: true, sim: simulate(sc, { extras: [{ period: p, amount: resid, mode: 'durata' }], penale }) };
    let lo = 0, hi = resid;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      const s = simulate(sc, { extras: [{ period: p, amount: mid, mode: 'durata' }], penale });
      if (s.rows.length <= target) hi = mid; else lo = mid;
      if (hi - lo < 1) break;
    }
    const amount = Math.ceil(hi / 10) * 10;
    return { amount: Math.min(amount, resid), feasible: true, sim: simulate(sc, { extras: [{ period: p, amount: Math.min(amount, resid), mode: 'durata' }], penale }) };
  }

  /** Importo minimo (dopo N anni, riduzione rata) per portare la rata sotto targetRata */
  function amountForRata(sc, N, targetRata, penale) {
    const base = simulate(sc);
    const m = base.m;
    const p = Math.round(N * m);
    if (p >= base.rows.length) return null;
    const resid = residualAfter(base, p);
    if (base.rows[p].payment <= targetRata) return { amount: 0, sim: base };
    let lo = 0, hi = resid;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      const s = simulate(sc, { extras: [{ period: p, amount: mid, mode: 'rata' }], penale });
      const rata = s.rows[p] ? s.rows[p].payment : 0;
      if (rata <= targetRata) hi = mid; else lo = mid;
      if (hi - lo < 1) break;
    }
    const amount = Math.min(Math.ceil(hi / 10) * 10, resid);
    return { amount, sim: simulate(sc, { extras: [{ period: p, amount, mode: 'rata' }], penale }) };
  }

  /** Piano personalizzato: versamenti una tantum + versamento ricorrente annuo */
  function simulatePlan(sc, plan) {
    const { m } = periodsInfo(sc);
    const extras = [];
    for (const o of plan.oneOff || []) {
      if (num(o.amount) > 0) extras.push({ period: Math.round(num(o.year) * m), amount: num(o.amount), mode: plan.mode });
    }
    const rec = plan.recurring || {};
    if (num(rec.amount) > 0) {
      const from = Math.max(1, Math.round(num(rec.from, 1)));
      const to = Math.max(from, Math.round(num(rec.to, from)));
      for (let y = from; y <= to; y++) extras.push({ period: y * m, amount: num(rec.amount), mode: plan.mode });
    }
    return simulate(sc, { extras, penale: plan.penale });
  }

  function stressTest(sc, shocks) {
    return shocks.map((s) => {
      const r = simulate(sc, { shock: s });
      return { shock: s, res: r, rataMax: r.rataMax, rataIniziale: r.rataIniziale, totInteressi: r.totInteressi, costoCredito: r.costoCredito };
    });
  }

  const WEIGHTS = {
    bilanciato: { costo: 0.4, rata: 0.25, rischio: 0.25, liquidita: 0.1 },
    costo: { costo: 0.7, rata: 0.1, rischio: 0.15, liquidita: 0.05 },
    rata: { costo: 0.2, rata: 0.6, rischio: 0.15, liquidita: 0.05 },
    rischio: { costo: 0.25, rata: 0.15, rischio: 0.55, liquidita: 0.05 },
    valore: { pv: 0.65, rata: 0.1, rischio: 0.2, liquidita: 0.05 },
  };

  function altNetRate(profile) {
    return (num(profile.rendAlt) / 100) * (1 - num(profile.tassaAlt) / 100);
  }

  function compareScenarios(scenarios, profile) {
    const altNet = altNetRate(profile);
    const reddito = num(profile.reddito);
    const altreRate = num(profile.altreRate);
    const fondo = num(profile.speseMensili) * num(profile.mesiEmergenza);
    const quotaMax = num(profile.quotaMax, 33) / 100;
    const items = scenarios.map((sc) => {
      const res = simulate(sc, { discount: altNet });
      const variabile = (sc.tipoTasso || 'fisso') !== 'fisso';
      const stress = variabile ? simulate(sc, { shock: 2, discount: altNet }) : res;
      const meq = res.m / 12;
      const rataMese = res.rataMax * meq;
      const rataStressMese = stress.rataMax * meq;
      const ratio = reddito > 0 ? (rataMese + altreRate) / reddito : null;
      const ratioStress = reddito > 0 ? (rataStressMese + altreRate) / reddito : null;
      const liquiditaResidua = num(profile.liquidita) - res.liquiditaRogito;
      const etaFine = num(profile.eta) + res.durataMesi / 12;
      const rischio = res.rataMax > 0 ? stress.rataMax / res.rataMax - 1 : 0;
      const warnings = [];
      let penalty = 0;
      if (ratio != null && ratio > 0.4) { penalty += 30; warnings.push('Rata oltre il 40% del reddito: difficilmente finanziabile'); }
      else if (ratio != null && ratio > quotaMax) { penalty += 15; warnings.push(`Rata oltre il ${Math.round(quotaMax * 100)}% del reddito netto`); }
      if (ratioStress != null && ratioStress > 0.4 && variabile) { penalty += 10; warnings.push('Con Euribor +2% la rata supera il 40% del reddito'); }
      if (liquiditaResidua < 0) { penalty += 25; warnings.push('Liquidità insufficiente per anticipo e spese'); }
      else if (liquiditaResidua < fondo) { penalty += 8; warnings.push('Dopo il rogito il fondo di emergenza è sotto la soglia'); }
      if (res.ltv > 0.8) { penalty += 5; warnings.push('LTV > 80%: serve garanzia (es. Fondo Consap) o spread più alto'); }
      if (etaFine > 75) { penalty += 10; warnings.push(`A fine mutuo avrai ${Math.round(etaFine)} anni (molte banche richiedono ≤ 75-80)`); }
      return { sc, res, stress, variabile, rataMese, rataStressMese, ratio, ratioStress, liquiditaResidua, etaFine, rischio, warnings, penalty,
        metrics: { costo: res.costoTotale, pv: res.valoreAttuale, rata: rataMese, rischio, liquidita: res.liquiditaRogito } };
    });
    const w = WEIGHTS[profile.priorita] || WEIGHTS.bilanciato;
    const keys = Object.keys(w);
    const ranges = {};
    for (const key of keys) {
      const vals = items.map((it) => it.metrics[key]);
      ranges[key] = [Math.min(...vals), Math.max(...vals)];
    }
    for (const it of items) {
      it.norm = {};
      let s = 0;
      for (const key of keys) {
        const [lo, hi] = ranges[key];
        const v = hi - lo > 1e-9 ? (it.metrics[key] - lo) / (hi - lo) : 0;
        it.norm[key] = v;
        s += w[key] * v;
      }
      it.score = Math.max(0, Math.min(100, Math.round(100 * (1 - s) - it.penalty)));
    }
    const ranking = items.slice().sort((a, b) => b.score - a.score || a.metrics.costo - b.metrics.costo);
    return { items, ranking, best: ranking[0] || null, altNet, weights: w, fondo };
  }

  /** Quanto posso permettermi */
  function affordability(p) {
    const reddito = num(p.reddito), quota = num(p.quotaMax, 33) / 100;
    const rataMax = Math.max(0, reddito * quota - num(p.altreRate));
    const r = num(p.tan) / 100 / 12, n = Math.max(1, Math.round(num(p.anni) * 12));
    const mutuoMax = Math.abs(r) < 1e-12 ? rataMax * n : (rataMax * (1 - Math.pow(1 + r, -n))) / r;
    const ltv = num(p.ltvMax, 80) / 100, s = num(p.spesePerc, 6) / 100;
    const L = Math.max(0, num(p.liquidita) - num(p.fondo));
    const pLiq = L / Math.max(1e-9, 1 - ltv + s);
    const pMix = (L + mutuoMax) / (1 + s);
    const prezzoMax = Math.max(0, Math.min(pLiq, pMix));
    // Tutta la liquidità utilizzabile va in anticipo e spese; il resto è mutuo (≤ LTV e ≤ mutuo massimo)
    const mutuoNec = Math.max(0, Math.min(mutuoMax, prezzoMax * (1 + s) - L));
    return { rataMax, mutuoMax, prezzoMax, vincolo: pLiq < pMix ? 'liquidita' : 'reddito', mutuoNecessario: mutuoNec, anticipoNecessario: prezzoMax - mutuoNec, speseStimate: prezzoMax * s, liquiditaUtilizzabile: L };
  }

  /** Affitto vs acquisto: patrimonio netto nel tempo */
  function rentVsBuy(sc, profile, prm) {
    const res = simulate(sc);
    const m = res.m, step = 12 / m;
    const H = Math.max(1, Math.round(num(prm.orizzonte, 20)));
    const months = H * 12;
    const altNet = altNetRate(profile);
    const g = Math.pow(1 + altNet, 1 / 12);
    const monthFlow = new Array(months + 1).fill(0);
    res.flows.forEach((f, k) => { const t = Math.round(k * step); if (t <= months) monthFlow[t] += f; });
    const residByMonth = new Array(months + 1).fill(0);
    residByMonth[0] = res.mutuo - res.extra0;
    let last = residByMonth[0];
    const resByK = new Map(res.rows.map((r) => [Math.round(r.k * step), r.residual]));
    for (let t = 1; t <= months; t++) { if (resByK.has(t)) last = resByK.get(t); else if (t > res.rows.length * step) last = 0; residByMonth[t] = last; }
    const initial = res.anticipo + res.costiAcq.totale + res.costiMut.totale + monthFlow[0];
    let renterPort = initial, buyerPort = 0, rentPaid = 0, ownerCosts = initial;
    const riv = num(prm.rivalutazione) / 100, manut = num(prm.manutenzione) / 100, altri = num(prm.altriCosti);
    const vend = num(prm.costiVendita) / 100;
    const years = [{ year: 0, buyerNW: res.prezzo * (1 - vend) - residByMonth[0] , renterNW: renterPort, houseValue: res.prezzo, residual: residByMonth[0], rentPaid: 0, ownerCosts }];
    let breakEven = null;
    for (let t = 1; t <= months; t++) {
      renterPort *= g; buyerPort *= g;
      const y = Math.floor((t - 1) / 12);
      const house = res.prezzo * Math.pow(1 + riv, t / 12);
      const buyerOut = monthFlow[t] + (house * manut) / 12 + altri / 12;
      const rent = num(prm.affitto) * Math.pow(1 + num(prm.incrAffitto) / 100, y);
      rentPaid += rent; ownerCosts += buyerOut;
      const diff = buyerOut - rent;
      if (diff > 0) renterPort += diff; else buyerPort += -diff;
      if (t % 12 === 0) {
        const buyerNW = house * (1 - vend) - residByMonth[t] + buyerPort;
        const yr = { year: t / 12, buyerNW, renterNW: renterPort, houseValue: house, residual: residByMonth[t], rentPaid, ownerCosts, buyerPort };
        years.push(yr);
        if (breakEven == null && buyerNW >= renterPort) breakEven = t / 12;
      }
    }
    return { years, breakEven, initial, res, altNet };
  }

  return {
    DETR_ALIQ, DETR_MAX, num, annuity, npv, irr, periodsInfo, importoMutuo, costiAcquisto, costiMutuo, indexPath, annualRate,
    simulate, residualAfter, analyzePrepayment, amountAnalysis, amountForEnd, amountForRata, simulatePlan, stressTest,
    compareScenarios, affordability, rentVsBuy, altNetRate, WEIGHTS,
  };
});
