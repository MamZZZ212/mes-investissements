/* Lecture des relevés CSV : historique d'opérations Revolut (compte-titres), export de portefeuille
   Boursobank (PEA) ou CSV générique « symbole ; quantité ; PRU ». Tout se passe dans le navigateur. */
(function (root) {
  function detectDelimiter(line) {
    const counts = [';', ',', '\t'].map((d) => [d, line.split(d).length]);
    return counts.sort((a, b) => b[1] - a[1])[0][0];
  }

  function parseCsv(text) {
    const clean = text.replace(/^﻿/, '').trim();
    const delim = detectDelimiter(clean.split(/\r?\n/)[0]);
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (quoted) {
        if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && clean[i + 1] === '\n') i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    row.push(cell.trim()); rows.push(row);
    return rows.filter((r) => r.some((c) => c !== ''));
  }

  /* « USD 1 234,56 », « $12.30 », « 1.234,5 » → nombre. */
  function num(raw) {
    if (raw == null) return NaN;
    let s = String(raw).replace(/[^\d,.\-]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s);
  }

  const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  function column(headers, ...names) {
    const n = headers.map(norm);
    for (const name of names) { const i = n.findIndex((h) => h === name || h.includes(name)); if (i >= 0) return i; }
    return -1;
  }

  /* Revolut : on rejoue achats, ventes et divisions pour obtenir quantité et prix de revient moyen. */
  function parseRevolut(rows) {
    const h = rows[0];
    const c = { ticker: column(h, 'ticker'), type: column(h, 'type'), qty: column(h, 'quantity'), price: column(h, 'pricepershare'), total: column(h, 'totalamount'), cur: column(h, 'currency') };
    const pos = {};
    rows.slice(1).forEach((r) => {
      const ticker = r[c.ticker], type = (r[c.type] || '').toUpperCase();
      if (!ticker) return;
      const p = pos[ticker] || (pos[ticker] = { symbol: ticker, qty: 0, cost: 0, currency: r[c.cur] || 'USD' });
      const qty = num(r[c.qty]);
      if (type.startsWith('BUY')) {
        const total = Math.abs(num(r[c.total])) || qty * num(r[c.price]);
        p.qty += qty; p.cost += total;
      } else if (type.startsWith('SELL')) {
        const avg = p.qty ? p.cost / p.qty : 0;
        p.qty -= qty; p.cost -= avg * qty;
      } else if (type.includes('SPLIT') && Number.isFinite(qty)) {
        p.qty += qty;
      }
    });
    return Object.values(pos).filter((p) => p.qty > 1e-6).map((p) => ({ symbol: p.symbol, qty: +p.qty.toFixed(6), pru: p.cost / p.qty, currency: p.currency }));
  }

  const ISIN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;

  /* Tableau de positions (copié depuis Boursobank, ou CSV générique) : une ligne par position.
     L'ISIN est cherché dans toute la ligne s'il n'a pas sa propre colonne. */
  function parsePositions(rows) {
    const h = rows[0];
    const c = {
      symbol: column(h, 'symbole', 'symbol', 'ticker', 'code'), isin: column(h, 'isin'), name: column(h, 'name', 'libelle', 'nom', 'valeur'),
      qty: column(h, 'quantity', 'quantite', 'qte', 'nombre'), pru: column(h, 'buyingprice', 'pru', 'prixderevient', 'prixmoyen', 'cost'),
      last: column(h, 'lastprice', 'cours', 'dernier'),
    };
    if (c.qty < 0) throw new Error('Colonne « quantité » introuvable dans ce fichier.');
    return rows.slice(1).map((r) => ({
      symbol: c.symbol >= 0 ? r[c.symbol] : '', isin: c.isin >= 0 ? r[c.isin] : (ISIN.exec(r.join(' ')) || [''])[0],
      name: c.name >= 0 ? r[c.name].replace(ISIN, '').trim() : '',
      qty: num(r[c.qty]), pru: c.pru >= 0 ? num(r[c.pru]) : num(r[c.last]), currency: 'EUR',
    })).filter((p) => p.qty > 0 && (p.symbol || p.isin || p.name));
  }

  /* Trouve le symbole Yahoo par l'ISIN (sûr) ou, à défaut, par le nom (à vérifier),
     en privilégiant la cotation parisienne (PEA). */
  async function resolve(p) {
    if (p.symbol || !(p.isin || p.name)) return p;
    const found = await MarketApi.search(p.isin || p.name).catch(() => []);
    const best = found.find((f) => /\.PA$/.test(f.symbol)) || found[0];
    return best ? { ...p, symbol: best.symbol, name: p.name || best.name, guessed: !p.isin } : p;
  }

  async function parse(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('Fichier vide ou illisible.');
    const headers = rows[0].map(norm);
    const isRevolut = headers.includes('ticker') && headers.includes('type') && headers.some((x) => x.includes('quantity'));
    const format = isRevolut ? 'Revolut (historique des opérations)' : 'Positions (Boursobank / générique)';
    const raw = isRevolut ? parseRevolut(rows) : parsePositions(rows);
    const resolved = await Promise.all(raw.map(resolve));
    const symbols = resolved.filter((p) => p.symbol).map((p) => p.symbol);
    const quotes = symbols.length ? await MarketApi.quotes(symbols) : {};
    const holdings = resolved.map((p) => {
      const q = quotes[p.symbol] || {};
      const kind = q.type === 'ETF' || q.type === 'MUTUALFUND' ? 'etf' : 'stock';
      return { symbol: p.symbol, isin: p.isin, name: q.name || p.name || p.symbol, kind, qty: p.qty, pru: Number.isFinite(p.pru) ? p.pru : 0, currency: q.currency || p.currency, sleeve: Valuation.defaultSleeve(kind), unresolved: !p.symbol || !!q.error, guessed: !!p.guessed };
    });
    return { format, holdings };
  }

  root.StatementImport = { parse, parseCsv, num };
})(window);
