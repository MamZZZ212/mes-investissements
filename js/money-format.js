/* Formatage monétaire et pourcentages à la française. */
(function (root) {
  const cache = {};
  const nf = (key, opts) => cache[key] || (cache[key] = new Intl.NumberFormat('fr-FR', opts));
  const ok = (v) => typeof v === 'number' && Number.isFinite(v);

  const Money = {
    ok,
    eur: (v, digits = 0) => (ok(v) ? nf(`eur${digits}`, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v) : '—'),
    /* Montant dans la devise du titre (USD, EUR…), précision adaptée au prix. */
    cur(v, currency = 'EUR') {
      if (!ok(v)) return '—';
      const digits = Math.abs(v) < 10 ? 3 : 2;
      try { return nf(`c${currency}${digits}`, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: digits }).format(v); } catch (e) { return `${v.toFixed(2)} ${currency}`; }
    },
    pct(v, signed = false, digits = 1) {
      if (!ok(v)) return '—';
      const s = nf(`p${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
      return `${signed && v > 0 ? '+' : ''}${s} %`;
    },
    signedEur: (v, digits = 0) => (ok(v) ? `${v > 0 ? '+' : ''}${Money.eur(v, digits)}` : '—'),
    num: (v, digits = 2) => (ok(v) ? nf(`n${digits}`, { maximumFractionDigits: digits }).format(v) : '—'),
    /* Grand nombre abrégé : 1,2 Md, 340 M. */
    big(v, currency = '') {
      if (!ok(v)) return '—';
      const a = Math.abs(v), unit = a >= 1e12 ? [1e12, ' Bn'] : a >= 1e9 ? [1e9, ' Md'] : a >= 1e6 ? [1e6, ' M'] : [1, ''];
      return `${Money.num(v / unit[0], 1)}${unit[1]}${currency ? ' ' + currency : ''}`;
    },
    tone: (v) => (!ok(v) || v === 0 ? '' : v > 0 ? 'pos' : 'neg'),
    date: (ts) => new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }),
    time: (ts) => new Date(ts * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  };

  root.Money = Money;
})(window);
