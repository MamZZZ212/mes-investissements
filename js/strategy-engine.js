/* Stratégie « cœur-satellite » : profils d'allocation et contrôle de discipline du portefeuille.
   Cadre pédagogique générique : ce n'est pas un conseil personnalisé. */
(function (root) {
  const PROFILES = [
    { id: 'prudent', label: 'Prudent', targets: { securite: 50, coeur: 45, satellite: 5 }, desc: 'Priorité au capital. Baisse maximale historique d’un portefeuille comparable : ~15-20 %.' },
    { id: 'equilibre', label: 'Équilibré', targets: { securite: 25, coeur: 65, satellite: 10 }, desc: 'Croissance avec un matelas solide. Baisse possible ~25-30 % sur la partie actions.' },
    { id: 'dynamique', label: 'Dynamique', targets: { securite: 10, coeur: 75, satellite: 15 }, desc: 'Horizon long (8 ans et +). Doit supporter -35 % sans vendre.' },
    { id: 'offensif', label: 'Offensif', targets: { securite: 5, coeur: 75, satellite: 20 }, desc: 'Horizon 10 ans et +, revenus stables. Volatilité forte.' },
  ];

  const GOLDEN_RULES = [
    ['Règle n°1 : ne pas perdre d’argent', 'On n’investit en actions que l’argent dont on n’aura pas besoin avant 5 ans, après avoir constitué son épargne de précaution.'],
    ['Rester dans son cercle de compétence', 'N’acheter une action que si l’on comprend comment l’entreprise gagne de l’argent et pourquoi elle en gagnera encore dans 10 ans.'],
    ['Acheter une entreprise, pas un ticker', 'Rentabilité élevée, dette faible, cash-flow régulier : la qualité d’abord, le prix ensuite.'],
    ['Exiger une marge de sécurité', 'Acheter nettement sous la valeur estimée, pour absorber les erreurs d’estimation.'],
    ['Être patient', 'Pas d’opportunité ? Le cœur ETF continue d’être alimenté chaque mois et la réserve satellite attend.'],
    ['Peur et cupidité', 'Ne jamais vendre dans la panique ni acheter parce que « tout le monde en parle ». Pas de levier, pas de CFD.'],
  ];

  const profile = (id) => PROFILES.find((p) => p.id === id);

  function emergencyTarget(strategy, budget) {
    const expense = budget?.avgExpense || strategy.monthlyExpenses || 0;
    return { amount: expense * strategy.rules.emergencyMonths, expense, fromBudget: !!budget?.avgExpense };
  }

  const check = (level, title, text, link) => ({ level, title, text, link });

  function emergencyCheck(v, strategy, budget) {
    const e = emergencyTarget(strategy, budget);
    const have = v.bySleeve.securite?.value || 0;
    if (!e.amount) return check('warn', 'Épargne de précaution non définie', 'Relie ton budget ou indique tes dépenses mensuelles dans Stratégie.', '#strategie');
    if (have >= e.amount) return check('ok', 'Épargne de précaution constituée', `${Money.eur(have)} en sécurité pour un objectif de ${Money.eur(e.amount)} (${strategy.rules.emergencyMonths} mois de dépenses).`);
    return check('bad', 'Épargne de précaution incomplète', `Il manque ${Money.eur(e.amount - have)} pour couvrir ${strategy.rules.emergencyMonths} mois de dépenses : à compléter avant d’acheter des actions.`, '#plan');
  }

  /* Écarts à la cible ; une poche Sécurité « trop grosse » est normale tant que la précaution n'est pas complète. */
  function driftChecks(v, strategy, budget) {
    const band = strategy.rules.rebalanceBand;
    const emergencyShort = (v.bySleeve.securite?.value || 0) < emergencyTarget(strategy, budget).amount;
    return Catalog.SLEEVES.map((s) => {
      const actual = v.bySleeve[s.id]?.pct || 0, target = strategy.targets[s.id] || 0, gap = actual - target;
      if (Math.abs(gap) <= band || (s.id === 'securite' && gap > 0 && emergencyShort)) return null;
      return check('warn', `Poche ${s.label} ${gap > 0 ? 'au-dessus' : 'en dessous'} de la cible`, `${Money.pct(actual, false, 0)} contre ${target} % visés (tolérance ±${band} pts). Oriente les prochains versements ${gap > 0 ? 'vers les autres poches' : 'vers cette poche'} plutôt que de vendre.`, '#plan');
    }).filter(Boolean);
  }

  function lineChecks(v, state) {
    const { rules } = state.strategy;
    const out = [];
    v.positions.filter((p) => p.kind === 'stock').forEach((p) => {
      if (p.weight > rules.maxLinePct) out.push(check('warn', `${p.symbol} pèse ${Money.pct(p.weight, false, 1)} du portefeuille`, `Ta règle limite une action à ${rules.maxLinePct} %. Ne renforce plus cette ligne.`, `#titre/${p.symbol}`));
      const s = state.scores[p.symbol];
      if (!s) out.push(check('info', `${p.symbol} n’a pas encore été analysée`, 'Ouvre sa fiche pour vérifier qu’elle passe tes critères de qualité.', `#titre/${p.symbol}`));
      else if (s.verdict === 'reject') out.push(check('bad', `${p.symbol} ne passe plus tes filtres`, `${s.passed}/${s.applicable} critères. Demande-toi si tu l’achèterais aujourd’hui.`, `#titre/${p.symbol}`));
      if (!state.competence[p.symbol]) out.push(check('info', `Cercle de compétence : ${p.symbol}`, 'Confirme sur sa fiche que tu comprends son activité.', `#titre/${p.symbol}`));
      if (p.account === 'pea' && Catalog.peaStatus(p.symbol, p.kind) === 'non') out.push(check('bad', `${p.symbol} dans le PEA ?`, 'Ce titre n’est normalement pas éligible au PEA : vérifie le compte saisi.', '#portefeuille'));
    });
    return out;
  }

  /* Liste ordonnée des alertes : bloquant → à surveiller → information → ok. */
  function disciplineChecks(v, state) {
    if (!v.positions.length) return [check('info', 'Portefeuille vide', 'Ajoute tes positions Revolut et PEA, ou importe un relevé CSV.', '#portefeuille')];
    const list = [emergencyCheck(v, state.strategy, state.budget), ...driftChecks(v, state.strategy, state.budget),...lineChecks(v, state)];
    const order = { bad: 0, warn: 1, info: 2, ok: 3 };
    return list.sort((a, b) => order[a.level] - order[b.level]);
  }

  root.Strategy = { PROFILES, GOLDEN_RULES, profile, emergencyTarget, disciplineChecks };
})(window);
