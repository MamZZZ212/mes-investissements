/* Screener Buffett : applique tes critères à un univers de grandes entreprises et à tes actions suivies. */
(function (root) {
  const V = root.ViewKit;
  const results = {};
  let onlyPass = false;
  let running = false;

  const universe = (state) => [...new Set([...Catalog.UNIVERSE, ...state.watchlist.filter((s) => !Catalog.isPeaEtf(s)), ...state.holdings.filter((h) => h.kind === 'stock').map((h) => h.symbol)])];
  const RANK = { buy: 0, wait: 1, reject: 2, na: 3 };

  function row(sym, x) {
    const r = x.result, m = r.metrics || {}, q = x.quote || {};
    const vs = r.buyBelow && q.price ? (q.price / r.buyBelow - 1) * 100 : null;
    return `<tr class="clickable" data-href="#titre/${encodeURIComponent(sym)}">
      <td>${V.sym(sym, q.name)}</td>
      <td>${V.verdictBadge({ verdict: r.verdict.id, label: r.verdict.label, passed: r.passed, applicable: r.applicable })}</td>
      <td class="amt">${Money.pct(m.roe, false, 0)}</td><td class="amt">${Money.pct(m.netMargin, false, 0)}</td>
      <td class="amt">${Money.pct(m.epsGrowth, true, 0)}</td><td class="amt">${Money.ok(m.debtYears) ? Money.num(m.debtYears, 1) + ' ans' : '—'}</td>
      <td class="amt">${Money.ok(m.pe) ? Money.num(m.pe, 1) : '—'}</td>
      <td class="amt">${Money.cur(r.buyBelow, q.currency)}<div class="small ${vs > 0 ? 'neg' : 'pos'}">${Money.ok(vs) ? (vs > 0 ? `cours ${Money.pct(vs, true, 0)} au-dessus` : 'cours en dessous') : ''}</div></td>
      <td>${V.badge(Catalog.peaStatus(sym, 'stock') === 'oui' ? 'PEA' : 'Revolut', Catalog.peaStatus(sym, 'stock') === 'oui' ? 'accent' : '')}</td></tr>`;
  }

  function table() {
    const list = Object.entries(results).filter(([, x]) => x.result.available && (!onlyPass || x.result.verdict.id === 'buy'))
      .sort((a, b) => (RANK[a[1].result.verdict.id] - RANK[b[1].result.verdict.id]) || (b[1].result.passed / b[1].result.applicable - a[1].result.passed / a[1].result.applicable));
    if (!list.length) return V.empty(onlyPass ? 'Aucune entreprise ne passe tous tes filtres au prix actuel. C’est normal : Buffett attend parfois des années. Le cœur ETF continue de travailler.' : 'Lance l’analyse pour voir les résultats.');
    return `<div class="table-wrap"><table><thead><tr><th>Entreprise</th><th>Verdict</th><th class="amt">ROE</th><th class="amt">Marge nette</th><th class="amt">Croiss. BPA</th><th class="amt">Dette</th><th class="amt">PER</th><th class="amt">Prix max</th><th>Compte</th></tr></thead>
      <tbody>${list.map(([s, x]) => row(s, x)).join('')}</tbody></table></div>`;
  }

  function summary() {
    const all = Object.values(results).filter((x) => x.result.available);
    const n = (id) => all.filter((x) => x.result.verdict.id === id).length;
    return `<div class="grid kpis">${V.kpi('Analysées', all.length)}${V.kpi('Passent tous les filtres', `<span class="pos">${n('buy')}</span>`, 'qualité + prix')}${V.kpi('Belles mais chères', `<span class="warn-text">${n('wait')}</span>`, 'à surveiller')}${V.kpi('Rejetées', `<span class="neg">${n('reject')}</span>`)}</div>`;
  }

  function paint(el) {
    const out = el.querySelector('#scr-out');
    if (!out) return;
    out.innerHTML = summary() + `<div class="card mt">${table()}</div>`;
    out.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.href; }));
  }

  async function run(el, state) {
    if (running) return;
    running = true;
    const list = universe(state), bar = el.querySelector('#scr-bar'), label = el.querySelector('#scr-label');
    let done = 0;
    const next = async () => {
      while (list.length) {
        const sym = list.shift();
        try { results[sym] = await BuffettScore.analyze(sym, state.strategy.rules); } catch (e) { /* titre ignoré */ }
        done++;
        if (!el.isConnected) continue;
        bar.style.width = `${done / (done + list.length) * 100}%`;
        label.textContent = `${done} / ${done + list.length} analysées`;
        if (done % 4 === 0) paint(el);
      }
    };
    await Promise.all([next(), next(), next(), next()]);
    running = false;
    if (el.isConnected) { paint(el); label.textContent = `Analyse terminée · ${done} entreprises`; }
  }

  function render(el, ctx) {
    const state = ctx.state, r = state.strategy.rules;
    V.mount(el, `<div class="page-head"><div><h1>Screener Buffett</h1><p>Quelles entreprises respectent tes conditions ? Qualité d’abord, prix ensuite.</p></div>
        <div class="row"><label class="row small"><input type="checkbox" id="only" ${onlyPass ? 'checked' : ''}>Seulement celles qui passent</label><button class="btn primary" id="go">${icon('filter')}${Object.keys(results).length ? 'Relancer' : 'Lancer l’analyse'}</button></div></div>
      <div class="notice info">Tes conditions actuelles : ROE ≥ ${r.minRoe} %, marge nette ≥ ${r.minNetMargin} %, marge brute ≥ ${r.minGrossMargin} %, BPA +${r.minEpsGrowth} %/an, CA +${r.minRevGrowth} %/an, dette ≤ ${r.maxDebtYears} ans de bénéfice, pas de dilution, PER ≤ ${r.maxPe}, marge de sécurité ${r.mos} %. <a class="inline" href="#strategie">Ajuster</a></div>
      <div class="card mt"><div class="row"><span class="small" id="scr-label">${universe(state).length} entreprises (univers de qualité + tes actions suivies)</span></div><div class="bar-track mt"><div class="bar-fill" id="scr-bar" style="width:${Object.keys(results).length ? 100 : 0}%"></div></div></div>
      <div id="scr-out" class="mt"></div>${V.DISCLAIMER}`);
    el.querySelector('#go').addEventListener('click', () => run(el, state));
    el.querySelector('#only').addEventListener('change', (e) => { onlyPass = e.target.checked; paint(el); });
    if (Object.keys(results).length) paint(el); else run(el, state);
  }

  root.ScreenerView = { render };
})(window);
