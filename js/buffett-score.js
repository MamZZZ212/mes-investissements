/* Grille « à la Buffett » : qualité de l'entreprise (rentabilité, régularité, dette, dilution)
   puis prix (PER, marge de sécurité sur une valeur intrinsèque par flux de trésorerie actualisés).
   Les seuils viennent des règles de la stratégie : l'utilisateur les ajuste. */
(function (root) {
  const valid = (arr) => (arr || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const lastOf = (arr) => { const v = valid(arr); return v.length ? v[v.length - 1] : null; };
  const firstOf = (arr) => { const v = valid(arr); return v.length ? v[0] : null; };

  function cagr(arr) {
    const v = valid(arr);
    if (v.length < 2 || v[0] <= 0 || v[v.length - 1] <= 0) return null;
    return (Math.pow(v[v.length - 1] / v[0], 1 / (v.length - 1)) - 1) * 100;
  }

  function ratios(a, b) {
    return a.map((x, i) => (Money.ok(x) && Money.ok(b[i]) && b[i] > 0 ? x / b[i] * 100 : null)).filter((v) => v !== null);
  }

  /* Indicateurs dérivés des séries annuelles. fx = conversion devise des comptes → devise de cotation. */
  function metrics(f, price, fx) {
    const s = f.series;
    const roes = ratios(s.netIncome, s.equity);
    const shares = lastOf(s.shares);
    const fcfAvg = mean(valid(s.fcf).slice(-3));
    const eps = Money.ok(f.trailing.eps) ? f.trailing.eps : lastOf(s.eps);
    const netDebt = (lastOf(s.totalDebt) || 0) - (lastOf(s.cash) || 0);
    return {
      roe: mean(roes), roeMin: roes.length ? Math.min(...roes) : null, equityNegative: valid(s.equity).some((v) => v <= 0),
      netMargin: mean(ratios(s.netIncome, s.revenue)), grossMargin: mean(ratios(s.grossProfit, s.revenue)),
      lossYears: valid(s.netIncome).filter((v) => v <= 0).length, years: valid(s.netIncome).length,
      epsGrowth: cagr(s.eps), revGrowth: cagr(s.revenue),
      fcfNegYears: valid(s.fcf).filter((v) => v <= 0).length, fcfYears: valid(s.fcf).length,
      debtYears: lastOf(s.netIncome) > 0 ? Math.max(0, netDebt) / lastOf(s.netIncome) : null,
      shareChange: firstOf(s.shares) && shares ? (shares / firstOf(s.shares) - 1) * 100 : null,
      pe: Money.ok(eps) && eps > 0 && Money.ok(price) ? price / (eps * fx) : null,
      fcfPerShare: fcfAvg && shares ? fcfAvg / shares * fx : null,
      fcfYield: fcfAvg && shares && price ? (fcfAvg / shares * fx) / price * 100 : null,
    };
  }

  /* Valeur intrinsèque : 10 ans de croissance prudente du cash-flow libre, puis 2,5 %/an, actualisés. */
  function intrinsicValue(m, rules) {
    if (!Money.ok(m.fcfPerShare) || m.fcfPerShare <= 0) return null;
    const growths = [m.revGrowth, m.epsGrowth].filter(Money.ok);
    const g = Math.max(0, Math.min(rules.maxGrowth, growths.length ? Math.min(...growths) : 0)) / 100;
    const r = rules.discount / 100, gt = 0.025;
    let cf = m.fcfPerShare, pv = 0;
    for (let y = 1; y <= 10; y++) { cf *= 1 + g; pv += cf / Math.pow(1 + r, y); }
    const terminal = (cf * (1 + gt)) / (r - gt) / Math.pow(1 + r, 10);
    return { value: pv + terminal, growth: g * 100 };
  }

  const crit = (id, group, title, help, value, threshold, pass) => ({ id, group, title, help, value, threshold, status: pass === null ? 'na' : pass ? 'pass' : 'fail' });
  const test = (v, fn) => (Money.ok(v) ? fn(v) : null);

  function criteria(m, iv, price, rules) {
    const P = Money.pct;
    return [
      crit('roe', 'quality', 'Rentabilité des capitaux propres', 'Combien l’entreprise gagne avec l’argent de ses actionnaires (moyenne).', m.equityNegative ? 'Capitaux propres négatifs' : P(m.roe), `≥ ${rules.minRoe} %`, m.equityNegative ? null : test(m.roe, (v) => v >= rules.minRoe)),
      crit('netMargin', 'quality', 'Marge nette', 'Part du chiffre d’affaires qui finit en bénéfice : signe de pouvoir de fixation des prix.', P(m.netMargin), `≥ ${rules.minNetMargin} %`, test(m.netMargin, (v) => v >= rules.minNetMargin)),
      crit('grossMargin', 'quality', 'Marge brute (avantage concurrentiel)', 'Une marge brute élevée et stable trahit souvent un « fossé » protecteur.', P(m.grossMargin), `≥ ${rules.minGrossMargin} %`, test(m.grossMargin, (v) => v >= rules.minGrossMargin)),
      crit('profits', 'quality', 'Bénéficiaire chaque année', 'Aucune perte sur les exercices disponibles.', m.years ? `${m.years - m.lossYears}/${m.years} ans` : '—', 'Aucune perte', m.years ? m.lossYears === 0 : null),
      crit('epsGrowth', 'quality', 'Croissance du bénéfice par action', 'Croissance annuelle moyenne du BPA dilué.', P(m.epsGrowth, true), `≥ ${rules.minEpsGrowth} %/an`, test(m.epsGrowth, (v) => v >= rules.minEpsGrowth)),
      crit('revGrowth', 'quality', 'Croissance du chiffre d’affaires', 'Croissance annuelle moyenne des ventes.', P(m.revGrowth, true), `≥ ${rules.minRevGrowth} %/an`, test(m.revGrowth, (v) => v >= rules.minRevGrowth)),
      crit('fcf', 'quality', 'Cash-flow libre positif', 'L’activité génère du vrai cash après investissements, chaque année.', m.fcfYears ? `${m.fcfYears - m.fcfNegYears}/${m.fcfYears} ans` : '—', 'Chaque année', m.fcfYears ? m.fcfNegYears === 0 : null),
      crit('debt', 'quality', 'Dette remboursable rapidement', 'Années de bénéfice nécessaires pour rembourser la dette nette.', Money.ok(m.debtYears) ? `${Money.num(m.debtYears, 1)} ans` : '—', `≤ ${rules.maxDebtYears} ans`, test(m.debtYears, (v) => v <= rules.maxDebtYears)),
      crit('dilution', 'quality', 'Pas de dilution des actionnaires', 'Le nombre d’actions baisse (rachats) ou reste stable.', P(m.shareChange, true), '≤ +2 %', test(m.shareChange, (v) => v <= 2)),
      crit('pe', 'price', 'Prix raisonnable (PER)', 'Cours ÷ bénéfice par action sur 12 mois.', Money.ok(m.pe) ? Money.num(m.pe, 1) : '—', `≤ ${rules.maxPe}`, test(m.pe, (v) => v <= rules.maxPe)),
      crit('mos', 'price', `Marge de sécurité de ${rules.mos} %`, 'Le cours doit être nettement sous la valeur intrinsèque estimée.', iv && Money.ok(price) ? (price > iv.value ? `${Money.pct((price / iv.value - 1) * 100, false, 0)} au-dessus` : `${Money.pct((1 - price / iv.value) * 100, false, 0)} en dessous`) : '—', `≥ ${rules.mos} % sous la valeur`, iv && Money.ok(price) ? price <= iv.value * (1 - rules.mos / 100) : null),
    ];
  }

  function verdictOf(list, rules) {
    const q = list.filter((c) => c.group === 'quality' && c.status !== 'na');
    const qualityPct = q.length ? q.filter((c) => c.status === 'pass').length / q.length * 100 : 0;
    const cheap = list.filter((c) => c.group === 'price').every((c) => c.status === 'pass');
    if (q.length < 5) return { id: 'na', label: 'Données insuffisantes', tone: '', qualityPct };
    if (qualityPct >= rules.minQuality && cheap) return { id: 'buy', label: 'Passe tous tes filtres', tone: 'good', qualityPct };
    if (qualityPct >= rules.minQuality) return { id: 'wait', label: 'Belle entreprise — prix trop élevé', tone: 'warn', qualityPct };
    return { id: 'reject', label: 'Ne passe pas tes filtres', tone: 'bad', qualityPct };
  }

  function evaluate(fund, quote, fx, rules) {
    if (!fund || !fund.available) return { available: false, verdict: { id: 'na', label: 'Pas de données financières (ETF ou titre non couvert)', tone: '' } };
    const price = quote?.price;
    const m = metrics(fund, price, fx === undefined ? 1 : fx);
    let iv = intrinsicValue(m, rules);
    // Valeur 10× au-dessus du cours : presque toujours une classe d'actions différente (ex. BRK-B vs actions A).
    if (iv && Money.ok(price) && iv.value / price > 10) iv = null;
    const list = criteria(m, iv, price, rules);
    const applicable = list.filter((c) => c.status !== 'na');
    return {
      available: true, metrics: m, criteria: list, intrinsic: iv,
      buyBelow: iv ? iv.value * (1 - rules.mos / 100) : null,
      passed: applicable.filter((c) => c.status === 'pass').length, applicable: applicable.length,
      verdict: verdictOf(list, rules),
    };
  }

  /* Cours + comptes + change (si les comptes sont publiés dans une autre devise que la cotation). */
  async function analyze(symbol, rules) {
    const [quotes, fund] = await Promise.all([MarketApi.quotes([symbol]), MarketApi.fundamentals(symbol)]);
    const quote = quotes[symbol];
    let fx = 1;
    if (fund?.currency && quote?.currency && fund.currency !== quote.currency) {
      const rates = await MarketApi.fxToEur([fund.currency, quote.currency]);
      fx = rates[fund.currency] && rates[quote.currency] ? rates[fund.currency] / rates[quote.currency] : NaN;
    }
    const result = evaluate(fund, quote, fx, rules);
    if (result.available) Store.setScore(symbol, { verdict: result.verdict.id, label: result.verdict.label, passed: result.passed, applicable: result.applicable });
    return { quote, fund, result };
  }

  root.BuffettScore = { evaluate, analyze, cagr };
})(window);
