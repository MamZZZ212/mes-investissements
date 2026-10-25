/* Carte d'analyse « à la Buffett » d'une action : verdict, critères, valeur intrinsèque, historique financier. */
(function (root) {
  const V = root.ViewKit;

  function ring(r) {
    const pct = r.applicable ? r.passed / r.applicable * 100 : 0;
    const color = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' }[r.verdict.tone] || 'var(--muted)';
    return `<div class="score-ring" style="--p:${pct};--ring:${color}"><div><b>${r.passed}/${r.applicable}</b><small>critères</small></div></div>`;
  }

  function criterion(c) {
    const mark = { pass: '✓', fail: '✕', na: '–' }[c.status];
    return `<div class="criterion"><div class="mark ${c.status}">${mark}</div><div><h4>${V.esc(c.title)}</h4><p>${V.esc(c.help)}</p></div>
      <div class="val">${V.esc(c.value)}<small>${V.esc(c.threshold)}</small></div></div>`;
  }

  function valuation(r, q, rules) {
    if (!r.intrinsic) return '<p class="small">Valeur intrinsèque non calculable (cash-flow libre négatif ou manquant, ou comptes publiés pour une autre classe d’actions) : sans marge de sécurité vérifiable, Buffett passerait son tour.</p>';
    const iv = r.intrinsic.value, gap = (q.price / iv - 1) * 100;
    return `<table><tbody>
      <tr><td>Valeur intrinsèque estimée</td><td class="amt"><b>${Money.cur(iv, q.currency)}</b></td></tr>
      <tr><td>Prix d’achat maximal (marge ${rules.mos} %)</td><td class="amt"><b class="pos">${Money.cur(r.buyBelow, q.currency)}</b></td></tr>
      <tr><td>Cours actuel</td><td class="amt">${Money.cur(q.price, q.currency)} <span class="small ${gap > 0 ? 'neg' : 'pos'}">(${Money.pct(gap, true, 0)} vs valeur)</span></td></tr>
      <tr><td>Rendement du cash-flow libre</td><td class="amt">${Money.pct(r.metrics.fcfYield)}</td></tr></tbody></table>
      <p class="small">Hypothèses : cash-flow libre moyen des 3 derniers exercices, croissance ${Money.pct(r.intrinsic.growth)} /an pendant 10 ans (plafonnée à ${rules.maxGrowth} %), puis 2,5 %/an ; actualisation à ${rules.discount} %. Une estimation, pas une certitude : modifie ces paramètres dans Stratégie → Règles.</p>`;
  }

  function history(fund) {
    const s = fund.series, years = fund.years.map((y) => y.slice(0, 4));
    const line = (label, arr, fmt = (v) => Money.big(v)) => `<tr><td>${label}</td>${arr.map((v) => `<td class="amt">${fmt(v)}</td>`).join('')}</tr>`;
    const margin = s.netIncome.map((v, i) => (Money.ok(v) && s.revenue[i] ? v / s.revenue[i] * 100 : null));
    const roe = s.netIncome.map((v, i) => (Money.ok(v) && s.equity[i] > 0 ? v / s.equity[i] * 100 : null));
    return `<div class="card"><div class="card-head"><div><h2>Historique financier</h2><p>Exercices annuels, en ${V.esc(fund.currency || '')}</p></div></div><div class="table-wrap"><table>
      <thead><tr><th></th>${years.map((y) => `<th class="amt">${y}</th>`).join('')}</tr></thead><tbody>
      ${line('Chiffre d’affaires', s.revenue)}${line('Résultat net', s.netIncome)}${line('Cash-flow libre', s.fcf)}
      ${line('Marge nette', margin, (v) => Money.pct(v))}${line('ROE', roe, (v) => Money.pct(v))}${line('BPA dilué', s.eps, (v) => Money.num(v, 2))}
      ${line('Dette totale', s.totalDebt)}${line('Nombre d’actions', s.shares)}</tbody></table></div></div>`;
  }

  function competence(symbol, state) {
    const on = !!state.competence[symbol];
    return `<label class="row" style="gap:10px;margin-top:14px;padding:12px;border-radius:10px;background:var(--surface-2)"><input type="checkbox" id="competence" ${on ? 'checked' : ''}>
      <span><b>Cercle de compétence</b> — je comprends comment cette entreprise gagne de l’argent et pourquoi elle en gagnera encore dans 10 ans.</span></label>`;
  }

  async function mount(el, token, symbol, state) {
    const box = el.querySelector('#buffett');
    const rules = state.strategy.rules;
    try {
      const { quote, fund, result: r } = await BuffettScore.analyze(symbol, rules);
      if (!V.alive(el, token)) return;
      if (!r.available) { box.innerHTML = `<div class="card"><div class="empty">${V.esc(r.verdict.label)}</div></div>`; return; }
      const quality = r.criteria.filter((c) => c.group === 'quality'), price = r.criteria.filter((c) => c.group === 'price');
      box.innerHTML = `<div class="card"><div class="card-head"><div class="verdict">${ring(r)}<div><h3>${V.esc(r.verdict.label)}</h3>
          <p>Qualité : ${Money.pct(r.verdict.qualityPct, false, 0)} des critères (seuil ${rules.minQuality} %) · Prix : ${price.filter((c) => c.status === 'pass').length}/${price.length}</p></div></div>
          ${V.badge('Grille Buffett', r.verdict.tone || 'accent')}</div>
        <div class="grid two"><div><h3>Qualité de l’entreprise</h3><div class="criteria">${quality.map(criterion).join('')}</div></div>
        <div><h3>Prix</h3><div class="criteria">${price.map(criterion).join('')}</div><div class="mt">${valuation(r, quote, rules)}</div>${competence(symbol, state)}</div></div></div>
        <div class="mt">${history(fund)}</div>`;
      box.querySelector('#competence').addEventListener('change', (e) => { Store.setCompetence(symbol, e.target.checked); App.toast(e.target.checked ? 'Noté : dans ton cercle de compétence.' : 'Retiré de ton cercle de compétence.'); });
    } catch (e) {
      if (V.alive(el, token)) box.innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.BuffettCard = { mount };
})(window);
