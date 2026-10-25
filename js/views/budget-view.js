/* Lien budget : état de la connexion avec « Mon Budget » et chiffres utilisés par l'appli investissement. */
(function (root) {
  const V = root.ViewKit;

  function figures(b, state, emergency) {
    const pct = b.avgIncome ? b.planSaving / b.avgIncome * 100 : 0;
    return `<div class="grid kpis">
        ${V.kpi('Revenus moyens', Money.eur(b.avgIncome), `${b.n} mois analysés`)}
        ${V.kpi('Dépenses moyennes', Money.eur(b.avgExpense), 'base de l’épargne de précaution')}
        ${V.kpi('Épargne du plan optimisé', `<span>${Money.signedEur(b.planSaving)}</span>`, `${Money.pct(pct, false, 0)} des revenus, par mois`, b.planSaving > 0 ? 'hero' : '')}
        ${V.kpi('Virement Revolut', Money.eur(b.revolutMonthly), 'dépenses courantes, par mois')}
      </div>
      <div class="grid two mt">
        <div class="card"><h2>Ce que l’appli investissement en fait</h2>
          <div class="insight"><div class="ico">${icon('shield')}</div><div><h4>Épargne de précaution : ${Money.eur(emergency.amount)}</h4><p>${state.strategy.rules.emergencyMonths} mois de tes dépenses moyennes. Tant qu’elle n’est pas constituée, le plan mensuel l’alimente en priorité.</p></div><a class="btn ghost" href="#strategie">Régler</a></div>
          <div class="insight"><div class="ico">${icon('calendar')}</div><div><h4>Montant à investir chaque mois</h4><p>${b.planSaving > 0 ? `Le plan mensuel investit l’épargne de ton plan optimisé : ${Money.eur(b.planSaving)} par mois.` : 'Ton plan optimisé ne dégage pas encore d’épargne mensuelle : le plan n’investit rien chaque mois tant que le budget n’est pas à l’équilibre (règle n°1). Ajuste-le dans le simulateur de Mon Budget.'}</p></div><a class="btn ghost" href="#plan">Plan</a></div>
          ${b.bonusSaved ? `<div class="insight"><div class="ico">${icon('trend')}</div><div><h4>Bonus attendu : ≈ ${Money.eur(b.bonusSaved)} épargnés (${V.esc(b.bonusMonth)})</h4><p>Un versement ponctuel peut être investi en une fois sur le cœur ETF, ou étalé sur 6 à 12 mois si tu préfères lisser le point d’entrée.</p></div><span></span></div>` : ''}
        </div>
        <div class="card"><h2>Autres éléments du budget</h2><table class="mt"><tbody>
          <tr><td>Période couverte</td><td class="amt">${V.esc(b.from)} → ${V.esc(b.to)}</td></tr>
          <tr><td>Solde du compte courant</td><td class="amt">${Money.eur(b.balance)}</td></tr>
          <tr><td>Épargne salariale (PEE + abondement)</td><td class="amt">${Money.eur(b.pee)}</td></tr>
          <tr><td>Objectif d’épargne du budget</td><td class="amt">${Money.eur(b.savingsGoal)}</td></tr>
          <tr><td>Épargne moyenne actuelle</td><td class="amt ${Money.tone(b.avgSaving)}">${Money.signedEur(b.avgSaving)} / mois</td></tr></tbody></table>
          <p class="small">L’épargne salariale (PEE) est bloquée : elle n’est pas comptée dans ta poche sécurité, mais elle fait partie de ton patrimoine.</p></div>
      </div>`;
  }

  async function render(el, ctx) {
    const state = ctx.state;
    const token = V.mount(el, `<div class="page-head"><div><h1>Lien avec Mon Budget</h1><p>Ton appli budget fournit tes revenus, dépenses et capacité d’épargne : l’investissement part de là.</p></div>
      <div class="row"><a class="btn" href="${BudgetLink.BUDGET_URL}/" target="_blank" rel="noopener">${icon('external')}Ouvrir Mon Budget</a><button class="btn primary" id="sync">${icon('refresh')}Synchroniser</button></div></div>
      <div id="status" class="notice info">Connexion à Mon Budget…</div><div id="bfig" class="mt"></div>${V.DISCLAIMER}`);
    const paint = (b, live) => {
      if (!V.alive(el, token)) return;
      const st = el.querySelector('#status');
      if (b && b.n) {
        st.className = 'notice info';
        st.innerHTML = `${live ? '<b>Connecté</b> à Mon Budget' : '<b>Mon Budget n’est pas lancé</b> — dernières données connues'} · synchronisé ${new Date(b.syncedAt || Date.now()).toLocaleString('fr-FR')}`;
        el.querySelector('#bfig').innerHTML = figures(b, state, Strategy.emergencyTarget(state.strategy, b));
      } else {
        st.className = 'notice';
        st.innerHTML = live ? (MarketApi.live ? 'Mon Budget est lancé mais ne contient pas encore de relevé.' : 'Mon Budget en ligne ne contient pas encore de relevé sur cet appareil : ouvre-le et importe tes relevés BNP (ou restaure une sauvegarde de la version PC).') : (!MarketApi.live ? 'Mon Budget en ligne ne répond pas : vérifie ta connexion, puis clique sur Synchroniser.' : 'Mon Budget ne répond pas. Lance « Ouvrir-Investissements.bat » (il démarre les deux applis) ou « Ouvrir-Mon-Budget.bat », puis clique sur Synchroniser.');
      }
    };
    const sync = async () => { const b = await BudgetLink.sync(); paint(b ? { ...b, syncedAt: Date.now() } : state.budget, !!b); };
    el.querySelector('#sync').addEventListener('click', sync);
    sync();
  }

  root.BudgetView = { render };
})(window);
