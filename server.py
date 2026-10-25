"""Serveur local de Mes Investissements : sert l'appli et relaie les données de marché.

Sources (publiques, sans clé ni compte) :
  - cours, historiques et recherche : Yahoo Finance (cotations différées de ~15 min selon les places) ;
  - fondamentaux annuels (CA, bénéfices, dette, cash-flow…) : séries publiques Yahoo Finance.
Les réponses sont mises en cache (mémoire + disque pour les fondamentaux) pour rester léger.
Écoute uniquement sur 127.0.0.1 : rien n'est exposé sur le réseau, aucun ordre n'est jamais passé.
"""
import functools
import http.server
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("INVEST_PORT", "5179"))
CACHE_FILE = ROOT / ".cache" / "fundamentals.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
YF = "https://query1.finance.yahoo.com"

TTL = {"quote": 60, "history": 900, "search": 3600, "fund": 12 * 3600}
RANGES = {"1d": "5m", "5d": "30m", "1mo": "1d", "6mo": "1d", "ytd": "1d", "1y": "1d", "5y": "1wk", "max": "1mo"}
FUND_TYPES = {
    "revenue": "TotalRevenue", "grossProfit": "GrossProfit", "operatingIncome": "OperatingIncome",
    "netIncome": "NetIncome", "equity": "StockholdersEquity", "totalDebt": "TotalDebt", "cash": "CashAndCashEquivalents",
    "fcf": "FreeCashFlow", "eps": "DilutedEPS", "shares": "OrdinarySharesNumber", "dividends": "CashDividendsPaid",
    "buybacks": "RepurchaseOfCapitalStock", "currentAssets": "CurrentAssets", "currentLiabilities": "CurrentLiabilities",
}
TRAILING = {"eps": "DilutedEPS", "netIncome": "NetIncome", "revenue": "TotalRevenue", "fcf": "FreeCashFlow"}

_cache = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=8)


def cached(kind, key, fn):
    with _lock:
        hit = _cache.get((kind, key))
    if hit and time.time() - hit[0] < TTL[kind]:
        return hit[1]
    value = fn()
    with _lock:
        _cache[(kind, key)] = (time.time(), value)
    return value


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise RuntimeError(f"Yahoo Finance a répondu {e.code}")
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Impossible de joindre Yahoo Finance : vérifie ta connexion.")


def chart(symbol, rng):
    interval = RANGES.get(rng, "1d")
    q = urllib.parse.urlencode({"range": rng, "interval": interval, "includePrePost": "false", "events": "div,split"})
    data = fetch_json(f"{YF}/v8/finance/chart/{urllib.parse.quote(symbol)}?{q}")
    result = ((data or {}).get("chart") or {}).get("result")
    if not result:
        return None
    res = result[0]
    meta = res.get("meta", {})
    closes = (((res.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
    points = [[t, round(c, 4)] for t, c in zip(res.get("timestamp") or [], closes) if c is not None]
    return {"meta": meta, "points": points}


def quote(symbol):
    """Dernier cours + variation du jour + mini-historique 1 mois (pour les sparklines)."""
    return quote_from_chart(symbol, chart(symbol, "1mo"))


def quote_from_chart(symbol, c, spark_points=None):
    """Cotation déduite d'une série de cours (spark_points : ne garder que les N derniers points)."""
    if not c:
        return {"symbol": symbol, "error": "Symbole introuvable"}
    m, pts = c["meta"], c["points"]
    if spark_points:
        pts = pts[-spark_points:]
    price = m.get("regularMarketPrice")
    prev = pts[-2][1] if len(pts) >= 2 else m.get("chartPreviousClose")
    if pts and price is not None and abs(pts[-1][1] - price) / max(price, 1e-9) > 0.0001 and len(pts) >= 1:
        prev = pts[-1][1]  # la séance du jour n'est pas encore dans la série quotidienne
    change = m.get("regularMarketChangePercent")
    if change is None and prev:
        change = (price - prev) / prev * 100
    return {
        "symbol": symbol, "price": price, "changePct": change, "currency": m.get("currency"),
        "name": m.get("longName") or m.get("shortName") or symbol, "type": m.get("instrumentType"),
        "exchange": m.get("fullExchangeName") or m.get("exchangeName"), "time": m.get("regularMarketTime"),
        "high52": m.get("fiftyTwoWeekHigh"), "low52": m.get("fiftyTwoWeekLow"),
        "spark": [p[1] for p in pts],
    }


def quotes(symbols):
    def one(s):
        try:
            return cached("quote", s, lambda: quote(s))
        except RuntimeError as e:
            return {"symbol": s, "error": str(e)}
    return {q["symbol"]: q for q in _pool.map(one, symbols)}


def history(symbol, rng):
    c = chart(symbol, rng)
    if not c:
        return {"symbol": symbol, "error": "Symbole introuvable"}
    return {"symbol": symbol, "currency": c["meta"].get("currency"), "range": rng, "points": c["points"]}


def search(q):
    params = urllib.parse.urlencode({"q": q, "quotesCount": 12, "newsCount": 0, "listsCount": 0})
    data = fetch_json(f"{YF}/v1/finance/search?{params}") or {}
    out = []
    for item in data.get("quotes", []):
        if item.get("quoteType") not in ("EQUITY", "ETF", "MUTUALFUND", "INDEX", "CRYPTOCURRENCY"):
            continue
        out.append({"symbol": item.get("symbol"), "name": item.get("longname") or item.get("shortname"),
                    "type": item.get("quoteType"), "exchange": item.get("exchDisp")})
    return out


def fundamentals(symbol):
    """Séries annuelles (4-5 derniers exercices) alignées par année + valeurs sur 12 mois glissants."""
    types = [f"annual{v}" for v in FUND_TYPES.values()] + [f"trailing{v}" for v in TRAILING.values()]
    params = urllib.parse.urlencode({"type": ",".join(types), "period1": 1262304000, "period2": int(time.time()) + 86400 * 400})
    data = fetch_json(f"{YF}/ws/fundamentals-timeseries/v1/finance/timeseries/{urllib.parse.quote(symbol)}?{params}") or {}
    raw, currency = {}, None
    for r in (data.get("timeseries") or {}).get("result") or []:
        t = (r.get("meta") or {}).get("type", [None])[0]
        rows = [x for x in (r.get(t) or []) if x and x.get("reportedValue")]
        if rows:
            raw[t] = {x["asOfDate"]: x["reportedValue"]["raw"] for x in rows}
            currency = currency or rows[-1].get("currencyCode")
    years = sorted({d for k, v in raw.items() if k.startswith("annual") for d in v})
    series = {key: [raw.get(f"annual{name}", {}).get(y) for y in years] for key, name in FUND_TYPES.items()}
    trailing = {}
    for key, name in TRAILING.items():
        vals = raw.get(f"trailing{name}", {})
        trailing[key] = vals[max(vals)] if vals else None
    return {"symbol": symbol, "currency": currency, "years": years, "series": series, "trailing": trailing,
            "available": bool(years and any(v is not None for v in series["netIncome"]))}


class FundCache:
    """Cache disque des fondamentaux (ils ne changent qu'aux publications annuelles)."""

    def __init__(self):
        try:
            self.data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.data = {}

    def get(self, symbol):
        hit = self.data.get(symbol)
        if hit and time.time() - hit["at"] < TTL["fund"]:
            return hit["value"]
        value = fundamentals(symbol)
        with _lock:
            self.data[symbol] = {"at": time.time(), "value": value}
            try:
                CACHE_FILE.parent.mkdir(exist_ok=True)
                CACHE_FILE.write_text(json.dumps(self.data), encoding="utf-8")
            except OSError:
                pass
        return value


fund_cache = FundCache()


class ExclusiveServer(http.server.ThreadingHTTPServer):
    """Sous Windows, la réutilisation d'adresse laisserait deux serveurs écouter le même port :
    une seconde instance (démarrage automatique + lanceur) doit échouer et s'arrêter."""
    allow_reuse_address = False


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.startswith("/api/"):
            return self.api(url.path, {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()})
        if url.path.startswith("/.cache") or url.path.endswith(".py"):
            return self.send_error(404)
        return super().do_GET()

    def api(self, path, q):
        try:
            if path == "/api/quotes":
                symbols = [s.strip() for s in q.get("symbols", "").split(",") if s.strip()][:80]
                return self.send_json(200, quotes(symbols))
            if path == "/api/history":
                sym, rng = q.get("symbol", ""), q.get("range", "1y")
                if rng not in RANGES:
                    return self.send_json(400, {"error": "Période inconnue"})
                return self.send_json(200, cached("history", (sym, rng), lambda: history(sym, rng)))
            if path == "/api/search":
                term = q.get("q", "").strip()
                return self.send_json(200, cached("search", term.lower(), lambda: search(term)) if term else [])
            if path == "/api/fundamentals":
                return self.send_json(200, fund_cache.get(q.get("symbol", "")))
            if path == "/api/status":
                return self.send_json(200, {"ok": True, "port": PORT})
        except RuntimeError as e:
            return self.send_json(502, {"error": str(e)})
        return self.send_error(404)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    try:
        server = ExclusiveServer(("127.0.0.1", PORT), handler)
    except OSError:
        raise SystemExit(f"Le port {PORT} est déjà utilisé : Mes Investissements tourne sans doute déjà.")
    print(f"Mes Investissements : http://localhost:{PORT}")
    server.serve_forever()
