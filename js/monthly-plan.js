/* Plan d'investissement mensuel (DCA) : répartit le versement du mois entre les poches en comblant
   d'abord l'épargne de précaution puis les écarts à la cible ; projection sur plusieurs années. */
(function (root) {
  const SLEEVES = ['securite', 'coeur', 'satellite'];

  /* Montant mensuel : épargne du plan optimisé du budget (jamais négative) ou montant saisi à la main.
     Le virement Revolut du budget finance les dépenses courantes : il n'est pas de l'épargne. */
  function monthlyAmount(strategy, budget) {
    if (strategy.monthly.source === 'budget' && budget?.n) {
      const saving = Math.round(budget.planSaving);
      if (saving > 0) return { amount: saving, label: 'Épargne du plan optimisé de ton budget', fromBudget: true };
      return { amount: 0, label: `Ton budget optimisé ne dégage pas encore d’épargne (${Money.signedEur(saving)}/mois)`, fromBudget: true, deficit: true };
    }
    return { amount: Number(strategy.monthly.manual) || 0, label: 'Montant saisi manuellement' };
  }

  /* Versement ponctuel (bonus, prime…) : même logique de répartition, appliquée en une fois. */
  function lumpSum(state, valuation, amount) {
    const emergency = Strategy.emergencyTarget(state.strategy, state.budget);
    const gap = Math.max(0, emergency.amount - (valuation.bySleeve.securite?.value || 0));
    return splitBySleeve(amount, valuation, state.strategy, gap);
  }

  /* Répartition du versement selon les déficits par rapport à la cible après versement. */
  function splitBySleeve(amount, valuation, strategy, emergencyGap) {
    const out = { securite: 0, coeur: 0, satellite: 0 };
    let rest = amount;
    if (emergencyGap > 0) {
      out.securite = Math.min(rest, emergencyGap);
      rest -= out.securite;
    }
    if (rest <= 0) return out;
    const totalAfter = valuation.total + amount;
    const current = Object.fromEntries(SLEEVES.map((s) => [s, (valuation.bySleeve[s]?.value || 0) + out[s]]));
    const deficits = Object.fromEntries(SLEEVES.map((s) => [s, Math.max(0, totalAfter * (strategy.targets[s] || 0) / 100 - current[s])]));
    const dsum = SLEEVES.reduce((a, s) => a + deficits[s], 0);
    SLEEVES.forEach((s) => { out[s] += dsum > 0 ? rest * deficits[s] / dsum : rest * (strategy.targets[s] || 0) / 100; });
    return out;
  }

  /* Détail par titre : ETF du cœur selon leurs poids ; satellite réparti sur les actions qui passent les filtres. */
  function lines(split, state, quotes) {
    const out = [];
    if (split.securite > 0) out.push({ sleeve: 'securite', label: 'Épargne de sécurité', detail: 'Livret A / LDDS, fonds euros ou monétaire', amount: split.securite });
    const core = state.strategy.core.filter((c) => c.weight > 0);
    const wsum = core.reduce((a, c) => a + c.weight, 0) || 1;
    core.forEach((c) => {
      const amount = split.coeur * c.weight / wsum, q = quotes[c.symbol];
      out.push({ sleeve: 'coeur', symbol: c.symbol, label: q?.name || c.symbol, detail: `${Catalog.peaStatus(c.symbol, 'etf') === 'oui' ? 'PEA' : 'Compte-titres'} · ${c.weight} % du cœur`, amount, shares: q?.price ? Math.floor(amount / q.price) : null, price: q?.price });
    });
    const picks = Object.entries(state.scores).filter(([, s]) => s.verdict === 'buy').map(([sym]) => sym);
    if (split.satellite > 0 && picks.length) {
      picks.forEach((sym) => out.push({ sleeve: 'satellite', symbol: sym, label: sym, detail: `Passe tes filtres · ${Catalog.peaStatus(sym, 'stock') === 'oui' ? 'PEA' : 'Revolut'}`, amount: split.satellite / picks.length }));
    } else if (split.satellite > 0) {
      out.push({ sleeve: 'satellite', label: 'Réserve satellite (en attente)', detail: 'Aucune action ne passe tous tes filtres au bon prix : on garde le cash prêt pour une opportunité.', amount: split.satellite });
    }
    return out;
  }

  function build(state, valuation, quotes) {
    const { strategy, budget } = state;
    const monthly = monthlyAmount(strategy, budget);
    const emergency = Strategy.emergencyTarget(strategy, budget);
    const gap = Math.max(0, emergency.amount - (valuation.bySleeve.securite?.value || 0));
    const split = splitBySleeve(monthly.amount, valuation, strategy, gap);
    return { monthly, emergency, gap, monthsToEmergency: gap > 0 && monthly.amount > 0 ? Math.ceil(gap / monthly.amount) : 0, split, lines: lines(split, state, quotes) };
  }

  /* Projection mensuelle : versements répartis selon la cible, rendements annuels hypothétiques par poche. */
  function projection(state, startTotal, monthly, years, equityShift = 0) {
    const { targets, returns } = state.strategy;
    const pots = Object.fromEntries(SLEEVES.map((s) => [s, startTotal * (targets[s] || 0) / 100]));
    const rate = (s) => ((returns[s] || 0) + (s === 'securite' ? 0 : equityShift)) / 100 / 12;
    const points = [startTotal];
    for (let m = 1; m <= years * 12; m++) {
      SLEEVES.forEach((s) => { pots[s] = pots[s] * (1 + rate(s)) + monthly * (targets[s] || 0) / 100; });
      if (m % 12 === 0) points.push(SLEEVES.reduce((a, s) => a + pots[s], 0));
    }
    return points;
  }

  root.MonthlyPlan = { build, projection, monthlyAmount, lumpSum };
})(window);
