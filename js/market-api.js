/* Accès aux données de marché (cours, historiques, recherche, fondamentaux, change), même format partout :
   - sur le PC (serveur local, port 5179) : en direct via /api/… ;
   - en ligne (GitHub Pages) : fichiers data/… publiés toutes les ~20 min par GitHub Actions. */
(function (root) {
  const LIVE = location.port === '5179';
  const memo = new Map();
  const QUOTE_TTL = 55 * 1000;
  const STATIC_TTL = 5 * 60 * 1000;
  let lastStatus = { live: null, at: null, dataTime: null };
  const listeners = [];

  function setStatus(live, dataTime = null) {
    const changed = lastStatus.live !== live || lastStatus.dataTime !== dataTime;
    lastStatus = { live, at: Date.now(), dataTime };
    if (changed) listeners.forEach((fn) => fn(lastStatus));
  }

  async function getJson(path, missingOk = false) {
    let res;
    try { res = await fetch(path, { cache: LIVE ? 'default' : 'no-cache' }); } catch (e) {
      setStatus(false);
      throw new Error(LIVE ? 'Serveur local injoignable : lance « Ouvrir-Investissements.bat ».' : 'Données de marché injoignables : vérifie ta connexion.');
    }
    if (missingOk && res.status === 404) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(false); throw new Error(data.error || `Erreur ${res.status}`); }
    if (LIVE) setStatus(true);
    return data;
  }

  async function cached(key, ttl, fn) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await fn();
    memo.set(key, { at: Date.now(), value });
    return value;
  }

  /* ── Données statiques (version en ligne) ── */
  const fileName = (symbol) => symbol.replace(/[^A-Za-z0-9.\-]/g, '_');
  const staticQuotes = () => cached('static:quotes', STATIC_TTL, () => getJson('data/quotes.json'));
  const staticMeta = () => cached('static:meta', STATIC_TTL, async () => {
    const meta = await getJson('data/meta.json');
    setStatus(true, meta.generatedAt);
    return meta;
  });

  function sliceRange(h, range) {
    const pts = h['1y'] || [];
    const since = (days) => pts.filter(([t]) => t >= Date.now() / 1000 - days * 86400);
    if (range === '5d') return pts.slice(-5);
    if (range === '1mo') return since(31);
    if (range === '6mo') return since(183);
    if (range === 'ytd') return pts.filter(([t]) => new Date(t * 1000).getFullYear() === new Date().getFullYear());
    return h[range] || pts;
  }

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  async function staticSearch(q) {
    const { symbols } = await staticMeta();
    const term = norm(q).trim();
    const etf = Catalog.PEA_ETFS.find((e) => e.isin.toLowerCase() === term);
    return symbols.filter((s) => (etf && s.symbol === etf.symbol) || norm(s.symbol).includes(term) || norm(s.name).includes(term)).slice(0, 12);
  }

  /* ── Interface commune ── */
  const normalizeQuote = (q) => (q && q.currency === 'GBp'
    ? { ...q, currency: 'GBP', price: q.price / 100, high52: q.high52 / 100, low52: q.low52 / 100, spark: (q.spark || []).map((v) => v / 100) }
    : q);

  async function quotes(symbols, force = false) {
    const list = [...new Set(symbols.filter(Boolean))];
    if (!LIVE) {
      staticMeta().catch(() => null);
      const all = await staticQuotes();
      return Object.fromEntries(list.map((s) => [s, normalizeQuote(all[s]) || { symbol: s, error: 'Titre non suivi en ligne (à ajouter dans market-symbols.json)' }]));
    }
    const now = Date.now();
    const missing = list.filter((s) => force || !memo.has('q:' + s) || now - memo.get('q:' + s).at > QUOTE_TTL);
    for (let i = 0; i < missing.length; i += 40) {
      const data = await getJson(`/api/quotes?symbols=${encodeURIComponent(missing.slice(i, i + 40).join(','))}`);
      Object.values(data).forEach((q) => memo.set('q:' + q.symbol, { at: now, value: normalizeQuote(q) }));
    }
    return Object.fromEntries(list.map((s) => [s, memo.get('q:' + s)?.value]));
  }

  /* Taux de conversion vers l'euro pour chaque devise demandée (EUR = 1). */
  async function fxToEur(currencies) {
    const others = [...new Set(currencies.filter((c) => c && c !== 'EUR'))];
    const data = others.length ? await quotes(others.map((c) => `${c}EUR=X`)) : {};
    const rates = { EUR: 1 };
    others.forEach((c) => { rates[c] = data[`${c}EUR=X`]?.price ?? null; });
    return rates;
  }

  async function history(symbol, range = '1y') {
    if (LIVE) return cached(`h:${symbol}:${range}`, 10 * 60 * 1000, () => getJson(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`));
    const h = await cached(`sh:${symbol}`, STATIC_TTL, () => getJson(`data/history/${fileName(symbol)}.json`, true));
    if (!h) throw new Error('Historique non disponible en ligne pour ce titre.');
    return { symbol, currency: h.currency, range, points: sliceRange(h, range) };
  }

  const MarketApi = {
    quotes,
    fxToEur,
    history,
    search: (q) => (LIVE ? cached(`s:${q.toLowerCase()}`, 3600 * 1000, () => getJson(`/api/search?q=${encodeURIComponent(q)}`)) : staticSearch(q)),
    fundamentals: (symbol) => cached(`f:${symbol}`, 6 * 3600 * 1000, async () => (LIVE
      ? getJson(`/api/fundamentals?symbol=${encodeURIComponent(symbol)}`)
      : (await getJson(`data/fund/${fileName(symbol)}.json`, true)) || { symbol, available: false })),
    live: LIVE,
    status: () => lastStatus,
    onStatus: (fn) => listeners.push(fn),
  };

  root.MarketApi = MarketApi;
})(window);
