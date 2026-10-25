/* Accès aux données de marché (cours, historiques, recherche, fondamentaux, change) :
   via le serveur local (/api/…) ou, en ligne, via la fonction Supabase « market » (même format de réponse). */
(function (root) {
  const memo = new Map();
  const QUOTE_TTL = 55 * 1000;
  let lastStatus = { live: null, at: null };
  const listeners = [];

  /* « /api/quotes?symbols=… » → requête locale, ou fonction en ligne avec le jeton de la session. */
  async function request(path) {
    if (!root.CloudConfig?.enabled) return fetch(path);
    const [op, query] = path.replace(/^\/api\//, '').split('?');
    const headers = { apikey: root.CloudConfig.key, Authorization: `Bearer ${await root.CloudSession.accessToken()}` };
    return fetch(`${root.CloudConfig.url}/functions/v1/market?op=${op}${query ? '&' + query : ''}`, { headers });
  }

  async function get(path) {
    let res;
    try {
      res = await request(path);
    } catch (e) {
      setStatus(false);
      throw new Error(root.CloudConfig?.enabled ? 'Service de cours injoignable : vérifie ta connexion.' : 'Serveur local injoignable : lance « Ouvrir-Investissements.bat ».');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(false); throw new Error(data.error || `Erreur ${res.status}`); }
    setStatus(true);
    return data;
  }

  function setStatus(live) {
    const changed = lastStatus.live !== live;
    lastStatus = { live, at: Date.now() };
    if (changed) listeners.forEach((fn) => fn(lastStatus));
  }

  /* La Bourse de Londres cote en pence (GBp) : on ramène en livres. */
  function normalize(q) {
    if (q && q.currency === 'GBp') {
      const k = 0.01;
      return { ...q, currency: 'GBP', price: q.price * k, high52: q.high52 * k, low52: q.low52 * k, spark: (q.spark || []).map((v) => v * k) };
    }
    return q;
  }

  async function quotes(symbols, force = false) {
    const list = [...new Set(symbols.filter(Boolean))];
    const now = Date.now();
    const missing = list.filter((s) => force || !memo.has('q:' + s) || now - memo.get('q:' + s).at > QUOTE_TTL);
    for (let i = 0; i < missing.length; i += 40) {
      const chunk = missing.slice(i, i + 40);
      const data = await get(`/api/quotes?symbols=${encodeURIComponent(chunk.join(','))}`);
      Object.values(data).forEach((q) => memo.set('q:' + q.symbol, { at: now, value: normalize(q) }));
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

  async function cachedGet(key, path, ttl) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await get(path);
    memo.set(key, { at: Date.now(), value });
    return value;
  }

  const MarketApi = {
    quotes,
    fxToEur,
    history: (symbol, range = '1y') => cachedGet(`h:${symbol}:${range}`, `/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`, 10 * 60 * 1000),
    search: (q) => cachedGet(`s:${q.toLowerCase()}`, `/api/search?q=${encodeURIComponent(q)}`, 60 * 60 * 1000),
    fundamentals: (symbol) => cachedGet(`f:${symbol}`, `/api/fundamentals?symbol=${encodeURIComponent(symbol)}`, 6 * 3600 * 1000),
    status: () => lastStatus,
    onStatus: (fn) => listeners.push(fn),
  };

  root.MarketApi = MarketApi;
})(window);
