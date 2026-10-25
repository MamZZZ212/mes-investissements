/* État de l'application : positions, liste de suivi, stratégie, analyses, dernier résumé budget.
   Persisté dans le navigateur (localStorage) en mode local, ou dans le profil Supabase en mode en ligne. */
(function (root) {
  const STORE_KEY = 'invest.v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const listeners = [];
  let state = null;
  let remoteSave = null;  // en ligne : sauvegarde dans le profil Supabase au lieu du navigateur

  const DEFAULT_RULES = {
    emergencyMonths: 4, maxLinePct: 5, rebalanceBand: 5, horizonYears: 5,
    minRoe: 15, minNetMargin: 10, minGrossMargin: 40, minEpsGrowth: 5, minRevGrowth: 5,
    maxDebtYears: 4, maxPe: 25, mos: 30, discount: 10, maxGrowth: 12, minQuality: 70,
  };

  const DEFAULT_STRATEGY = {
    profile: 'equilibre',
    targets: { securite: 25, coeur: 65, satellite: 10 },
    rules: DEFAULT_RULES,
    core: [{ symbol: 'DCAM.PA', weight: 100 }],
    monthly: { source: 'budget', manual: 300 },
    returns: { securite: 2, coeur: 6, satellite: 7 },
    projectionYears: 15,
    monthlyExpenses: 2000,
  };

  function freshState() {
    return { holdings: [], watchlist: clone(root.Catalog.DEFAULT_WATCHLIST), strategy: clone(DEFAULT_STRATEGY), scores: {}, competence: {}, budget: null };
  }

  /* Complète un état chargé avec les champs ajoutés depuis. */
  function normalize(data) {
    const base = freshState();
    return {
      ...base, ...data,
      holdings: Array.isArray(data.holdings) ? data.holdings : [],
      watchlist: Array.isArray(data.watchlist) ? data.watchlist : base.watchlist,
      strategy: { ...base.strategy, ...data.strategy, rules: { ...DEFAULT_RULES, ...(data.strategy || {}).rules }, monthly: { ...base.strategy.monthly, ...(data.strategy || {}).monthly } },
      scores: data.scores || {}, competence: data.competence || {},
    };
  }

  /* initial : état du profil en ligne (ou null pour un nouveau profil) ; sans argument, lecture du navigateur. */
  function load(initial) {
    if (initial !== undefined) {
      state = initial ? normalize(initial) : freshState();
      return state;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      state = saved ? normalize(saved) : freshState();
    } catch (e) { state = freshState(); }
    return state;
  }

  function persist() {
    if (remoteSave) { remoteSave(state); return; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* mode privé */ }
  }

  function save(silent) {
    persist();
    if (!silent) listeners.forEach((fn) => fn(state));
  }

  const uid = () => Math.random().toString(36).slice(2, 10);

  const Store = {
    load,
    useRemote(fn) { remoteSave = fn; },
    get: () => state,
    subscribe: (fn) => listeners.push(fn),
    DEFAULT_RULES,

    upsertHolding(h) {
      const i = state.holdings.findIndex((x) => x.id === h.id);
      const clean = { ...h, id: h.id || uid() };
      if (i >= 0) state.holdings[i] = clean; else state.holdings.push(clean);
      save();
      return clean;
    },
    removeHolding(id) { state.holdings = state.holdings.filter((h) => h.id !== id); save(); },
    /* Remplace les positions d'un compte par celles d'un import (relevé = photo complète du compte). */
    replaceAccount(account, holdings) {
      state.holdings = state.holdings.filter((h) => h.account !== account).concat(holdings.map((h) => ({ ...h, id: uid(), account })));
      save();
    },

    toggleWatch(symbol) {
      const has = state.watchlist.includes(symbol);
      state.watchlist = has ? state.watchlist.filter((s) => s !== symbol) : [...state.watchlist, symbol];
      save();
      return !has;
    },

    updateStrategy(patch, silent) { Object.assign(state.strategy, patch); save(silent); },
    updateRules(patch, silent) { Object.assign(state.strategy.rules, patch); save(silent); },

    /* Résultat d'analyse Buffett mémorisé pour les alertes du tableau de bord. */
    setScore(symbol, s) { state.scores[symbol] = { ...s, at: Date.now() }; save(true); },
    setCompetence(symbol, v) { state.competence[symbol] = v; save(true); },
    setBudget(summary) { state.budget = summary; save(true); },

    exportJSON: () => JSON.stringify(state, null, 1),
    importJSON(text) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.holdings)) throw new Error('Fichier de sauvegarde invalide');
      state = normalize(data);
      save();
    },
    reset() { state = freshState(); save(); },
  };

  root.Store = Store;
})(window);
