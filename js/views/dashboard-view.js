/* Tableau de bord : valeur totale, performance, poches vs cible, discipline, comptes, marchés du jour. */
(function (root) {
  const V = root.ViewKit;
  let range = '1y';

  function allocationRows(v, strategy) {
    const colors = ChartKit.sleeveColors();
    return Catalog.SLEEVES.map((s) => {
      const pct = v.bySleeve[s.id]?.pct || 0, target = strategy.targets[s.id] || 0;
      return `<div class="alloc-row"><div>${V.sleeveDot(s.id)}${s.label}</div>
        <div class="alloc-track"><div class="fill" style="width:${Math.min(100, pct)}%;background:${colors[s.id]}"></div><div class="target" style="left:${target}%" title="Cible ${target} %"></div></div>
        <div class="right num"><b>${Money.pct(pct, false, 0)}</b> <span class="small">/ ${target} %</span></div></div>`;
    }).join('');
  }

  function accountsCard(v) {
    const rows = Catalog.ACCOUNTS.filter((a) => v.byAccount[a.id]).map((a) => `<tr><td>${a.label}</td><td class="amt">${Money.eur(v.byAccount[a.id].value)}</td><td class="amt small">${Money.pct(v.byAccount[a.id].pct, false, 0)}</td></tr>`).join('');
    const top = v.positions.slice(0, 5).map((p) => `<tr class="clickable" data-href="${p.symbol ? '#titre/' + encodeURIComponent(p.symbol) : '#portefeuille'}"><td>${V.sym(p.symbol || 'Liquidités', p.name)}</td><td class="amt">${Money.eur(p.valueEur)}</td><td class="amt">${p.symbol ? V.change(p.changePct) : ''}</td></tr>`).join('');
    return `<div class="card"><div class="card-head"><h2>Comptes</h2><a class="inline" href="#portefeuille">Gérer</a></div>
      <table><tbody>${rows}</tbody></table>
      <h3 class="mt" style="margin-bottom:6px">Principales positions</h3><table><tbody>${top}</tbody></table></div>`;
  }

  function moversCard(quotes, watchlist) {
    const list = watchlist.map((s) => quotes[s]).filter((q) => q && Money.ok(q.price)).sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0)).slice(0, 6);
    const rows = list.map((q) => `<tr class="clickable" data-href="#titre/${encodeURIComponent(q.symbol)}"><td>${V.sym(q.symbol, q.name)}</td><td>${V.spark(q.spark)}</td><td class="amt">${Money.cur(q.price, q.currency)}</td><td class="amt">${V.change(q.changePct)}</td></tr>`).join('');
    return `<div class="card"><div class="card-head"><div><h2>Marchés du jour</h2><p>Plus fortes variations de ta liste de suivi</p></div><a class="inline" href="#marches">Tout voir</a></div>
      <div class="table-wrap"><table><tbody>${rows || '<tr><td class="muted">Cours indisponibles</td></tr>'}</tbody></table></div></div>`;
  }

  async function drawHistory(el, token, v) {
    const box = el.querySelector('#hist-note');
    const points = await Valuation.history(v, range).catch(() => []);
    if (!V.alive(el, token)) return;
    if (points.length < 2) { box.textContent = 'Historique indisponible (ajoute des positions cotées).'; return; }
    const first = points[0][1], last = points[points.length - 1][1];
    box.innerHTML = `Sur la période : <b class="${Money.tone(last - first)}">${Money.signedEur(last - first)} (${Money.pct((last / first - 1) * 100, true)})</b> — simulation avec tes positions actuelles.`;
    ChartKit.lines('chart-hist', points.map((p) => new Date(p[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: range === '5y' ? '2-digit' : undefined })), [{ label: 'Valeur', data: points.map((p) => p[1]), color: ChartKit.css('--accent') }], { fill: true });
  }

  function body(v, state, quotes) {
    const b = state.budget;
    const monthly = MonthlyPlan.monthlyAmount(state.strategy, b);
    const checks = Strategy.disciplineChecks(v, state);
    return `
      <div class="grid kpis">
        ${V.kpi('Valeur totale', Money.eur(v.total), `${v.positions.length} position${v.positions.length > 1 ? 's' : ''}`, 'hero')}
        ${V.kpi('Plus-value latente', `<span class="${Money.tone(v.pnl)}">${Money.signedEur(v.pnl)}</span>`, `${Money.pct(v.pnlPct, true)} sur ${Money.eur(v.cost)} investis`)}
        ${V.kpi('Aujourd’hui', `<span class="${Money.tone(v.day)}">${Money.signedEur(v.day)}</span>`, Money.pct(v.dayPct, true, 2))}
        ${V.kpi('À investir ce mois', Money.eur(monthly.amount), `${monthly.label} · <a class="inline" href="#plan">plan</a>`)}
      </div>
      <div class="grid two mt">
        <div class="card"><div class="card-head"><div><h2>Évolution du portefeuille</h2><p id="hist-note">Chargement de l’historique…</p></div>
          <div class="seg" id="range">${[['1mo', '1M'], ['6mo', '6M'], ['1y', '1A'], ['5y', '5A']].map(([r, l]) => `<button data-r="${r}" aria-pressed="${r === range}">${l}</button>`).join('')}</div></div>
          <div class="chart-box"><canvas id="chart-hist"></canvas></div></div>
        <div class="card"><div class="card-head"><div><h2>Poches vs cible</h2><p>Profil ${V.esc(Strategy.profile(state.strategy.profile)?.label || 'personnalisé')} · trait noir = cible</p></div><a class="inline" href="#strategie">Modifier</a></div>
          ${allocationRows(v, state.strategy)}
          <div class="legend">${Catalog.SLEEVES.map((s) => `<span>${V.sleeveDot(s.id)}${s.label} : ${V.esc(s.desc)}</span>`).join('')}</div></div>
      </div>
      <div class="grid two mt">
        <div class="card"><div class="card-head"><div><h2>Discipline</h2><p>Tes règles appliquées à ton portefeuille</p></div></div>${checks.slice(0, 6).map(V.checkItem).join('')}</div>
        ${v.positions.length ? accountsCard(v) : moversCard(quotes, state.watchlist)}
      </div>
      ${v.positions.length ? `<div class="mt">${moversCard(quotes, state.watchlist)}</div>` : ''}
      ${V.DISCLAIMER}`;
  }

  async function render(el, ctx) {
    const state = ctx.state;
    const token = V.mount(el, `<div class="page-head"><div><h1>Tableau de bord</h1><p>Vue d’ensemble de ton PEA Boursobank, de ton compte Revolut et de ton épargne de sécurité.</p></div>
      <button class="btn" id="refresh">${icon('refresh')}Actualiser</button></div><div id="dash"><div class="grid kpis">${'<div class="card kpi"><div class="label skeleton">…</div><div class="value skeleton">0000 €</div></div>'.repeat(4)}</div></div>`);
    el.querySelector('#refresh').addEventListener('click', () => App.refresh(true));
    try {
      const [v, quotes] = await Promise.all([Valuation.build(state), MarketApi.quotes(state.watchlist)]);
      if (!V.alive(el, token)) return;
      el.querySelector('#dash').innerHTML = body(v, state, quotes);
      el.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.href; }));
      el.querySelectorAll('#range button').forEach((b) => b.addEventListener('click', () => { range = b.dataset.r; render(el, ctx); }));
      drawHistory(el, token, v);
    } catch (e) {
      if (V.alive(el, token)) el.querySelector('#dash').innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.DashboardView = { render, live: true };
})(window);
