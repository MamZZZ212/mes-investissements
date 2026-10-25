"""Génère les données de marché statiques de la version en ligne (GitHub Pages).

Exécuté par GitHub Actions (.github/workflows/pages.yml) toutes les ~20 minutes en semaine :
  - data/quotes.json        cotations + mini-courbes de tous les titres de market-symbols.json ;
  - data/history/<sym>.json cours sur 1 an (quotidien), 5 ans (hebdo) et depuis l'origine (mensuel) ;
  - data/fund/<sym>.json    fondamentaux annuels des actions (rafraîchis une fois par jour) ;
  - data/meta.json          date de génération + index de recherche (symbole, nom, type, place).
Réutilise les fonctions de server.py. Usage : python tools/build_market_data.py
"""
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

DATA = ROOT / "data"
DAILY_MAX_AGE = 20 * 3600  # 5 ans / origine / fondamentaux : une fois par jour suffit
SPARK_POINTS = 23           # ~1 mois de séances


def safe(symbol):
    return re.sub(r"[^A-Za-z0-9.\-]", "_", symbol)


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def stale(path):
    return not path.exists() or time.time() - path.stat().st_mtime > DAILY_MAX_AGE


def build_symbol(symbol, is_stock):
    """Cotation (toujours) ; historiques longs et fondamentaux (si plus vieux qu'un jour)."""
    try:
        year = server.chart(symbol, "1y")
    except RuntimeError as e:
        return {"symbol": symbol, "error": str(e)}
    quote = server.quote_from_chart(symbol, year, SPARK_POINTS)
    if quote.get("error"):
        return quote
    hist_path = DATA / "history" / f"{safe(symbol)}.json"
    hist = read_json(hist_path, {})
    hist.update({"currency": quote["currency"], "1y": year["points"]})
    if stale(hist_path) or "5y" not in hist:
        for rng in ("5y", "max"):
            try:
                c = server.chart(symbol, rng)
                hist[rng] = c["points"] if c else hist.get(rng, [])
            except RuntimeError:
                pass
    write_json(hist_path, hist)
    fund_path = DATA / "fund" / f"{safe(symbol)}.json"
    if is_stock and stale(fund_path):
        try:
            write_json(fund_path, server.fundamentals(symbol))
        except RuntimeError:
            pass
    return quote


def main():
    groups = read_json(ROOT / "market-symbols.json", {})
    stocks = set(groups.get("stocks", []))
    symbols = [s for key in ("etf", "stocks", "indices", "fx") for s in groups.get(key, [])]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda s: build_symbol(s, s in stocks), symbols))
    previous = read_json(DATA / "quotes.json", {})
    quotes = {}
    for q in results:
        # en cas d'échec ponctuel, on garde la dernière cotation connue
        quotes[q["symbol"]] = q if not q.get("error") else previous.get(q["symbol"], q)
    write_json(DATA / "quotes.json", quotes)
    index = [{"symbol": q["symbol"], "name": q.get("name"), "type": q.get("type"), "exchange": q.get("exchange")}
             for q in quotes.values() if not q.get("error") and q.get("type") not in ("CURRENCY", "INDEX")]
    write_json(DATA / "meta.json", {"generatedAt": int(time.time()), "symbols": index})
    failed = [q["symbol"] for q in results if q.get("error")]
    print(f"{len(symbols) - len(failed)}/{len(symbols)} titres à jour" + (f" — échecs : {', '.join(failed)}" if failed else ""))


if __name__ == "__main__":
    main()
