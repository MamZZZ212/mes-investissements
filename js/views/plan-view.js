/* Plan mensuel : combien investir ce mois, où, et projection à long terme (hypothèses modifiables). */
(function (root) {
  const V = root.ViewKit;

  let lump = null;

  function sourceSelect(s, b) {
    const opts = [
      ['budget', `Épargne du plan optimisé (budget)${b?.n ? ' — ' + Money.signedEur(Math.round(b.planSaving)) + '/mois' : ''}`, !b?.n],
      ['manual', 'Montant personnalisé', false],
    ];
    return `<select id="src">${opts.map(([v, l, dis]) => `<option value="${v}" ${s.monthly.source === v ? 'selected' : ''} ${dis ? 'disabled' : ''}>${l}</option>`).join('')}</select>`;
  }

  /* Versement ponctuel : par défaut la part épargnée du bonus prévue dans le budget. */
  function lumpCard(state, v, b) {
    const amount = lump ?? Math.round(b?.bonusSaved || 0);
    const split = MonthlyPlan.lumpSum(state, v, amount);
    return `<div class="card"><div class="card-head"><div><h2>Versement ponctuel</h2><p>${b?.bonusSaved ? `Bonus attendu (${V.esc(b.bonusMonth)}) : ≈ ${Money.eur(b.bonusSaved)} épargnés selon ton budget` : 'Prime, bonus, héritage…'}</p></div></div>
      <label class="field">Montant (€)<input type="number" id="lump" min="0" step="100" value="${amount}"></label>
      <div class="mt">${Catalog.SLEEVES.map((x) => `<div class="plan-line"><div>${V.sleeveDot(x.id)}${x.label}</div><div class="amt">${Money.eur(split[x.id])}</div></div>`).join('')}</div>
      <p class="small">Même logique que le plan mensuel : épargne de précaution d’abord, puis les poches en retard. Pour la partie actions, tu peux investir en une fois ou étaler sur 6 à 12 mois pour lisser le prix d’entrée.</p></div>`;
  }

  function planLines(plan) {
    if (!plan.monthly.amount) return V.empty('Indique un montant mensuel pour obtenir ton plan.');
    return plan.lines.map((l) => `<div class="plan-line"><div>${V.sleeveDot(l.sleeve)}<b>${V.esc(l.label)}</b>${l.symbol && l.symbol !== l.label ? ` <span class="small">${V.esc(l.symbol)}</span>` : ''}</div>
      <div class="amt">${Money.eur(l.amount)}</div><small>${V.esc(l.detail)}${l.shares != null ? ` · ≈ ${l.shares} part(s) à ${Money.cur(l.price, 'EUR')}${l.shares === 0 ? ' (cumule sur plusieurs mois ou utilise les fractions d’actions)' : ''}` : ''}</small></div>`).join('');
  }

  function drawProjection(el, state, start, monthly) {
    const years = state.strategy.projectionYears;
    const labels = Array.from({ length: years + 1 }, (_, i) => (i === 0 ? 'Auj.' : `${i} an${i > 1 ? 's' : ''}`));
    const central = MonthlyPlan.projection(state, start, monthly, years, 0);
    const low = MonthlyPlan.projection(state, start, monthly, years, -3);
    const high = MonthlyPlan.projection(state, start, monthly, years, 3);
    const paid = labels.map((_, i) => start + monthly * 12 * i);
    ChartKit.lines('chart-proj', labels, [
      { label: 'Central', data: central, color: ChartKit.css('--accent') },
      { label: 'Optimiste (+3 pts)', data: high, color: ChartKit.css('--good'), dash: [5, 4] },
      { label: 'Pessimiste (-3 pts)', data: low, color: ChartKit.css('--bad'), dash: [5, 4] },
      { label: 'Versements cumulés', data: paid, color: ChartKit.css('--muted'), dash: [2, 3] },
    ], { zero: true });
    el.querySelector('#proj-sum').innerHTML = `Dans ${years} ans : <b>${Money.eur(central[years])}</b> (fourchette ${Money.eur(low[years])} – ${Money.eur(high[years])}) pour ${Money.eur(paid[years])} versés.`;
  }

  function returnsForm(s) {
    const f = (k, label) => `<label class="field">${label}<input type="number" step="0.5" min="-5" max="15" value="${s.returns[k]}" data-ret="${k}"></label>`;
    return `<div class="form-grid" style="grid-template-columns:repeat(4,1fr)">${f('securite', 'Sécurité %/an')}${f('coeur', 'Cœur %/an')}${f('satellite', 'Satellite %/an')}
      <label class="field">Durée (ans)<input type="number" min="1" max="40" value="${s.projectionYears}" id="years"></label></div>`;
  }

  function bind(el, s) {
    el.querySelector('#src').addEventListener('change', (e) => Store.updateStrategy({ monthly: { ...s.monthly, source: e.target.value } }));
    el.querySelector('#manual')?.addEventListener('change', (e) => Store.updateStrategy({ monthly: { ...s.monthly, manual: Number(e.target.value) } }));
    el.querySelectorAll('[data-ret]').forEach((inp) => inp.addEventListener('change', () => Store.updateStrategy({ returns: { ...s.returns, [inp.dataset.ret]: Number(inp.value) } })));
    el.querySelector('#lump').addEventListener('change', (e) => { lump = Math.max(0, Number(e.target.value) || 0); App.rerender(); });
    el.querySelector('#years').addEventListener('change', (e) => Store.updateStrategy({ projectionYears: Math.max(1, Math.min(40, Number(e.target.value))) }));
  }

  async function render(el, ctx) {
    const state = ctx.state, s = state.strategy, b = state.budget;
    const token = V.mount(el, `<div class="page-head"><div><h1>Plan mensuel</h1><p>Investir un peu chaque mois (DCA), sans chercher le bon moment : la méthode la plus robuste pour un particulier.</p></div></div><div id="plan"><div class="empty">Calcul du plan…</div></div>`);
    try {
      const v = await Valuation.build(state);
      const quotes = await MarketApi.quotes(s.core.map((c) => c.symbol));
      if (!V.alive(el, token)) return;
      const plan = MonthlyPlan.build(state, v, quotes);
      el.querySelector('#plan').innerHTML = `
        <div class="grid two">
          <div class="card"><div class="card-head"><div><h2>Ce mois-ci</h2><p>${V.esc(plan.monthly.label)}</p></div><div class="num" style="font-size:24px;font-weight:700">${Money.eur(plan.monthly.amount)}</div></div>
            <label class="field">Source du montant${sourceSelect(s, b)}</label>
            ${s.monthly.source === 'manual' || !b?.n ? `<label class="field mt">Montant mensuel (€)<input type="number" id="manual" min="0" step="10" value="${s.monthly.manual}"></label>` : ''}
            ${plan.monthly.deficit ? `<div class="notice mt"><b>Règle n°1 : ne pas investir de l’argent qu’on n’a pas.</b> Ton budget dépense en moyenne ${Money.eur(b.avgExpense)} pour ${Money.eur(b.avgIncome)} de revenus. Commence par le <a class="inline" href="${BudgetLink.BUDGET_ORIGIN}/#simulateur" target="_blank" rel="noopener">simulateur de ton budget</a> pour dégager une épargne mensuelle ; en attendant, seul le versement ponctuel est investissable.</div>` : ''}
            ${!b?.n ? '<p class="small">Relie ton <a class="inline" href="#budget">appli budget</a> pour calculer ce montant automatiquement.</p>' : ''}
            ${plan.gap > 0 ? `<div class="notice mt">Épargne de précaution : il manque <b>${Money.eur(plan.gap)}</b> (objectif ${Money.eur(plan.emergency.amount)}). Priorité absolue${plan.monthsToEmergency ? ` — environ ${plan.monthsToEmergency} mois à ce rythme` : ' — à compléter avec un versement ponctuel (bonus)'} avant d’investir en actions.</div>` : ''}
            ${plan.monthly.deficit ? '' : `<div class="mt">${planLines(plan)}</div>`}</div>
          <div class="card"><div class="card-head"><div><h2>Répartition du versement</h2><p>Les poches en retard sur leur cible sont servies en premier : on rééquilibre sans vendre.</p></div></div>
            ${Catalog.SLEEVES.map((x) => `<div class="plan-line"><div>${V.sleeveDot(x.id)}${x.label} <span class="small">cible ${s.targets[x.id]} % · actuel ${Money.pct(v.bySleeve[x.id]?.pct || 0, false, 0)}</span></div><div class="amt">${Money.eur(plan.split[x.id])}</div></div>`).join('')}
            <p class="small mt">Exécution : programme un investissement récurrent sur Boursobank (PEA) et/ou Revolut pour les ETF du cœur ; les actions du satellite s’achètent uniquement quand elles passent tes filtres.</p></div>
        </div>
        <div class="grid two mt">${lumpCard(state, v, b)}<div class="card"><h2>Ordre de priorité</h2>
          ${[['shield', 'Épargne de précaution', `${state.strategy.rules.emergencyMonths} mois de dépenses sur livret : ${Money.eur(plan.emergency.amount)}.`], ['wallet', 'Cœur ETF sur le PEA', 'Ouvre la fiscalité avantageuse : après 5 ans, plus d’impôt sur le revenu sur les gains (prélèvements sociaux uniquement).'], ['filter', 'Satellite', 'Seulement des actions qui passent tes filtres, au bon prix, dans ton cercle de compétence.']].map(([ic, t, d]) => `<div class="insight"><div class="ico">${icon(ic)}</div><div><h4>${t}</h4><p>${d}</p></div><span></span></div>`).join('')}</div></div>
        <div class="card mt"><div class="card-head"><div><h2>Projection</h2><p id="proj-sum"></p></div></div>${returnsForm(s)}<div class="chart-box tall mt"><canvas id="chart-proj"></canvas></div>
          <p class="small">Hypothèses de rendement annuel moyen, pas des promesses : les actions peuvent perdre 30 à 50 % sur une année. Les écarts de ±3 points s’appliquent aux poches actions. Avant impôts et inflation.</p></div>
        ${V.DISCLAIMER}`;
      bind(el, s);
      drawProjection(el, state, v.total, plan.monthly.amount);
    } catch (e) {
      if (V.alive(el, token)) el.querySelector('#plan').innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.PlanView = { render };
})(window);
