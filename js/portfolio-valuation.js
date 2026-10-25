/* Valorisation du portefeuille en euros : positions, plus-values, répartition par compte et par poche,
   et historique simulé (positions actuelles appliquées aux cours passés). */
(function (root) {
  const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const isCash = (h) => h.kind === 'cash' || !h.symbol;

  function defaultSleeve(kind) {
    if (kind === 'cash') return 'securite';
    return kind === 'stock' ? 'satellite' : 'coeur';
  }

  function valuePosition(h, quotes, fx) {
    const sleeve = h.sleeve || defaultSleeve(h.kind);
    if (isCash(h)) {
      const v = Number(h.amount) || 0;
      return { ...h, sleeve, valueEur: v, costEur: v, pnlEur: 0, pnlPct: 0, dayEur: 0, priced: true };
    }
    const q = quotes[h.symbol] || {};
    const currency = q.currency || h.currency || 'EUR';
    const rate = fx[currency];
    const price = q.price;
    const priced = Money.ok(price) && Money.ok(rate);
    const qty = Number(h.qty) || 0;
    const valueEur = priced ? qty * price * rate : qty * (Number(h.pru) || 0) * (rate || 1);
    const costEur = qty * (Number(h.pru) || 0) * (rate || 1);
    const dayEur = priced && Money.ok(q.changePct) ? valueEur - valueEur / (1 + q.changePct / 100) : 0;
    return {
      ...h, sleeve, currency, price, changePct: q.changePct, name: h.name || q.name || h.symbol, quote: q,
      valueEur, costEur, pnlEur: valueEur - costEur, pnlPct: costEur ? (valueEur - costEur) / costEur * 100 : null, dayEur, priced,
    };
  }

  function groupBy(positions, key, total) {
    const out = {};
    positions.forEach((p) => { out[p[key]] = (out[p[key]] || 0) + p.valueEur; });
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { value: v, pct: total ? v / total * 100 : 0 }]));
  }

  /* Charge les cours et le change nécessaires puis valorise toutes les positions. */
  async function build(state) {
    const symbols = state.holdings.filter((h) => !isCash(h)).map((h) => h.symbol);
    const quotes = symbols.length ? await MarketApi.quotes(symbols) : {};
    const currencies = state.holdings.map((h) => quotes[h.symbol]?.currency || h.currency);
    const fx = await MarketApi.fxToEur(currencies);
    const positions = state.holdings.map((h) => valuePosition(h, quotes, fx)).sort((a, b) => b.valueEur - a.valueEur);
    const total = sum(positions, (p) => p.valueEur);
    const cost = sum(positions, (p) => p.costEur);
    const day = sum(positions, (p) => p.dayEur);
    positions.forEach((p) => { p.weight = total ? p.valueEur / total * 100 : 0; });
    return {
      positions, total, cost, pnl: total - cost, pnlPct: cost ? (total - cost) / cost * 100 : 0,
      day, dayPct: total - day ? day / (total - day) * 100 : 0, fx,
      byAccount: groupBy(positions, 'account', total), bySleeve: groupBy(positions, 'sleeve', total),
      invested: sum(positions.filter((p) => p.sleeve !== 'securite'), (p) => p.valueEur),
      unpriced: positions.filter((p) => !p.priced).map((p) => p.symbol),
    };
  }

  const dayKey = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

  /* Valeur quotidienne du portefeuille actuel sur la période (les liquidités restent constantes). */
  async function history(valuation, range = '1y') {
    const priced = valuation.positions.filter((p) => !isCash(p) && p.priced);
    const cash = sum(valuation.positions.filter(isCash), (p) => p.valueEur);
    const fxSymbols = [...new Set(priced.map((p) => p.currency).filter((c) => c !== 'EUR'))].map((c) => `${c}EUR=X`);
    const all = await Promise.all([...priced.map((p) => p.symbol), ...fxSymbols].map((s) => MarketApi.history(s, range).catch(() => null)));
    const series = {};
    all.forEach((h) => { if (h && h.points) series[h.symbol] = new Map(h.points.map(([t, c]) => [dayKey(t), c])); });
    const days = [...new Set(priced.flatMap((p) => [...(series[p.symbol]?.keys() || [])]))].sort();
    const last = {};
    const points = days.map((d) => {
      let v = cash;
      priced.forEach((p) => {
        const px = series[p.symbol]?.get(d) ?? last[p.symbol];
        const rate = p.currency === 'EUR' ? 1 : series[`${p.currency}EUR=X`]?.get(d) ?? last[p.currency] ?? valuation.fx[p.currency];
        if (px != null) last[p.symbol] = px;
        if (rate != null) last[p.currency] = rate;
        v += (Number(p.qty) || 0) * (px ?? p.price) * rate;
      });
      return [d, v];
    });
    return points;
  }

  root.Valuation = { build, history, defaultSleeve, isCash, sum };
})(window);
