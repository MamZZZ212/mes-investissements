// Relais des données de marché (version en ligne de server.py) : cours, historiques, recherche, fondamentaux.
// Source : Yahoo Finance, endpoints publics sans clé. Réservé aux utilisateurs connectés (JWT vérifié par Supabase).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const YF = "https://query1.finance.yahoo.com";
const TTL: Record<string, number> = { quote: 60, history: 900, search: 3600, fund: 12 * 3600 };
const RANGES: Record<string, string> = { "1d": "5m", "5d": "30m", "1mo": "1d", "6mo": "1d", ytd: "1d", "1y": "1d", "5y": "1wk", max: "1mo" };
const FUND_TYPES: Record<string, string> = {
  revenue: "TotalRevenue", grossProfit: "GrossProfit", operatingIncome: "OperatingIncome", netIncome: "NetIncome",
  equity: "StockholdersEquity", totalDebt: "TotalDebt", cash: "CashAndCashEquivalents", fcf: "FreeCashFlow", eps: "DilutedEPS",
  shares: "OrdinarySharesNumber", dividends: "CashDividendsPaid", buybacks: "RepurchaseOfCapitalStock",
  currentAssets: "CurrentAssets", currentLiabilities: "CurrentLiabilities",
};
const TRAILING: Record<string, string> = { eps: "DilutedEPS", netIncome: "NetIncome", revenue: "TotalRevenue", fcf: "FreeCashFlow" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// deno-lint-ignore no-explicit-any
const cache = new Map<string, { at: number; value: any }>();
async function cached<T>(kind: string, key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(`${kind}:${key}`);
  if (hit && Date.now() - hit.at < TTL[kind] * 1000) return hit.value;
  const value = await fn();
  cache.set(`${kind}:${key}`, { at: Date.now(), value });
  return value;
}

// deno-lint-ignore no-explicit-any
async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Yahoo Finance a répondu ${r.status}`);
  return r.json();
}

async function chart(symbol: string, range: string) {
  const q = new URLSearchParams({ range, interval: RANGES[range] ?? "1d", includePrePost: "false", events: "div,split" });
  const data = await fetchJson(`${YF}/v8/finance/chart/${encodeURIComponent(symbol)}?${q}`);
  const res = data?.chart?.result?.[0];
  if (!res) return null;
  const closes: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
  const points = (res.timestamp ?? []).map((t: number, i: number) => [t, closes[i]]).filter((p: [number, number | null]) => p[1] != null)
    .map(([t, c]: [number, number]) => [t, Math.round(c * 1e4) / 1e4]);
  return { meta: res.meta ?? {}, points };
}

async function quote(symbol: string) {
  const c = await chart(symbol, "1mo");
  if (!c) return { symbol, error: "Symbole introuvable" };
  const m = c.meta, pts = c.points as [number, number][];
  const price = m.regularMarketPrice;
  let prev = pts.length >= 2 ? pts[pts.length - 2][1] : m.chartPreviousClose;
  if (pts.length && price != null && Math.abs(pts[pts.length - 1][1] - price) / Math.max(price, 1e-9) > 0.0001) prev = pts[pts.length - 1][1];
  let change = m.regularMarketChangePercent;
  if (change == null && prev) change = (price - prev) / prev * 100;
  return {
    symbol, price, changePct: change, currency: m.currency, name: m.longName || m.shortName || symbol, type: m.instrumentType,
    exchange: m.fullExchangeName || m.exchangeName, time: m.regularMarketTime, high52: m.fiftyTwoWeekHigh, low52: m.fiftyTwoWeekLow,
    spark: pts.map((p) => p[1]),
  };
}

async function quotes(symbols: string[]) {
  const list = await Promise.all(symbols.map((s) => cached("quote", s, () => quote(s)).catch((e) => ({ symbol: s, error: String(e.message ?? e) }))));
  return Object.fromEntries(list.map((q) => [q.symbol, q]));
}

async function history(symbol: string, range: string) {
  const c = await chart(symbol, range);
  return c ? { symbol, currency: c.meta.currency, range, points: c.points } : { symbol, error: "Symbole introuvable" };
}

async function search(q: string) {
  const params = new URLSearchParams({ q, quotesCount: "12", newsCount: "0", listsCount: "0" });
  const data = (await fetchJson(`${YF}/v1/finance/search?${params}`)) ?? {};
  const kinds = ["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CRYPTOCURRENCY"];
  // deno-lint-ignore no-explicit-any
  return (data.quotes ?? []).filter((i: any) => kinds.includes(i.quoteType))
    // deno-lint-ignore no-explicit-any
    .map((i: any) => ({ symbol: i.symbol, name: i.longname || i.shortname, type: i.quoteType, exchange: i.exchDisp }));
}

async function fundamentals(symbol: string) {
  const types = [...Object.values(FUND_TYPES).map((v) => `annual${v}`), ...Object.values(TRAILING).map((v) => `trailing${v}`)];
  const params = new URLSearchParams({ type: types.join(","), period1: "1262304000", period2: String(Math.floor(Date.now() / 1000) + 86400 * 400) });
  const data = (await fetchJson(`${YF}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?${params}`)) ?? {};
  const raw: Record<string, Record<string, number>> = {};
  let currency: string | null = null;
  for (const r of data.timeseries?.result ?? []) {
    const t = r.meta?.type?.[0];
    // deno-lint-ignore no-explicit-any
    const rows = (r[t] ?? []).filter((x: any) => x?.reportedValue);
    if (!rows.length) continue;
    // deno-lint-ignore no-explicit-any
    raw[t] = Object.fromEntries(rows.map((x: any) => [x.asOfDate, x.reportedValue.raw]));
    currency ??= rows[rows.length - 1].currencyCode;
  }
  const years = [...new Set(Object.entries(raw).filter(([k]) => k.startsWith("annual")).flatMap(([, v]) => Object.keys(v)))].sort();
  const series = Object.fromEntries(Object.entries(FUND_TYPES).map(([key, name]) => [key, years.map((y) => raw[`annual${name}`]?.[y] ?? null)]));
  const trailing = Object.fromEntries(Object.entries(TRAILING).map(([key, name]) => {
    const vals = raw[`trailing${name}`] ?? {};
    const last = Object.keys(vals).sort().pop();
    return [key, last ? vals[last] : null];
  }));
  return { symbol, currency, years, series, trailing, available: years.length > 0 && series.netIncome.some((v) => v != null) };
}

const json = (code: number, body: unknown) => new Response(JSON.stringify(body), { status: code, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const p = url.searchParams;
  try {
    switch (p.get("op")) {
      case "quotes": return json(200, await quotes((p.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 80)));
      case "history": {
        const range = p.get("range") ?? "1y", sym = p.get("symbol") ?? "";
        if (!RANGES[range]) return json(400, { error: "Période inconnue" });
        return json(200, await cached("history", `${sym}:${range}`, () => history(sym, range)));
      }
      case "search": {
        const term = (p.get("q") ?? "").trim();
        return json(200, term ? await cached("search", term.toLowerCase(), () => search(term)) : []);
      }
      case "fundamentals": {
        const sym = p.get("symbol") ?? "";
        return json(200, await cached("fund", sym, () => fundamentals(sym)));
      }
      default: return json(404, { error: "Opération inconnue" });
    }
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : String(e) });
  }
});
