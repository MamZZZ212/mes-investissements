/* Fiche d'un titre : graphique de cours, statistiques, position détenue et analyse Buffett (actions). */
(function (root) {
  const V = root.ViewKit;
  const RANGES = [['5d', '5J'], ['1mo', '1M'], ['6mo', '6M'], ['ytd', 'YTD'], ['1y', '1A'], ['5y', '5A'], ['max', 'Max']];
  let range = '1y';

  async function drawChart(el, token, symbol, currency) {
    const note = el.querySelector('#perf');
    try {
      const h = await MarketApi.history(symbol, range);
      if (!V.alive(el, token) || !h.points?.length) return;
      const pts = h.points, first = pts[0][1], last = pts[pts.length - 1][1];
      note.innerHTML = `Sur la période : <b class="${Money.tone(last - first)}">${Money.pct((last / first - 1) * 100, true)}</b>`;
      const fmt = range === '5d' ? (t) => Money.time(t) : (t) => Money.date(t);
      const color = last >= first ? ChartKit.css('--good') : ChartKit.css('--bad');
      ChartKit.lines('chart-px', pts.map((p) => fmt(p[0])), [{ label: symbol, data: pts.map((p) => p[1]), color }], { fill: true, format: (v) => Money.cur(v, currency) });
    } catch (e) { if (V.alive(el, token)) note.textContent = e.message; }
  }

  function holdingCard(symbol, state, q) {
    const held = state.holdings.filter((h) => h.symbol === symbol);
    if (!held.length) return '';
    const qty = Valuation.sum(held, (h) => Number(h.qty)), cost = Valuation.sum(held, (h) => Number(h.qty) * Number(h.pru));
    const value = qty * (q.price || 0);
    return `<div class="card"><h2>Ta position</h2><table class="mt"><tbody>
      <tr><td>Quantité</td><td class="amt">${Money.num(qty, 4)}</td></tr>
      <tr><td>Prix de revient moyen</td><td class="amt">${Money.cur(qty ? cost / qty : null, q.currency)}</td></tr>
      <tr><td>Valeur</td><td class="amt"><b>${Money.cur(value, q.currency)}</b></td></tr>
      <tr><td>Plus-value latente</td><td class="amt ${Money.tone(value - cost)}">${Money.cur(value - cost, q.currency)} (${Money.pct(cost ? (value / cost - 1) * 100 : null, true)})</td></tr>
      <tr><td>Compte(s)</td><td class="amt">${[...new Set(held.map((h) => Catalog.account(h.account).short))].join(', ')}</td></tr></tbody></table></div>`;
  }

  function infoCard(symbol, q) {
    const isEtf = q.type === 'ETF' || q.type === 'MUTUALFUND';
    const etf = Catalog.etfInfo(symbol);
    const pea = Catalog.peaStatus(symbol, isEtf ? 'etf' : 'stock');
    const rows = [
      ['Type', isEtf ? 'ETF / fonds' : 'Action'], ['Place de cotation', q.exchange || '—'], ['Devise', q.currency || '—'],
      ['Plus haut 52 sem.', Money.cur(q.high52, q.currency)], ['Plus bas 52 sem.', Money.cur(q.low52, q.currency)],
      ['Éligible PEA', pea === 'oui' ? V.badge('Oui', 'good') : pea === 'non' ? V.badge('Non → Revolut', 'warn') : V.badge('À vérifier')],
      ...(etf ? [['ISIN', etf.isin], ['Frais annuels (TER)', Money.pct(etf.ter, false, 2)], ['Exposition', etf.zone], ['Rôle suggéré', etf.role]] : []),
    ];
    return `<div class="card"><h2>Informations</h2><table class="mt"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="amt">${v}</td></tr>`).join('')}</tbody></table>
      ${isEtf ? '<p class="small mt">Les ETF n’ont pas de grille Buffett : on les juge sur la largeur de l’indice, les frais et la taille du fonds. Buffett lui-même recommande un ETF large et peu cher pour la majorité des épargnants.</p>' : ''}</div>`;
  }

  async function render(el, ctx, symbol) {
    const state = ctx.state;
    const token = V.mount(el, `<div id="asset"><div class="empty">Chargement de ${V.esc(symbol)}…</div></div>`);
    let q;
    try { q = (await MarketApi.quotes([symbol]))[symbol]; } catch (e) { q = { error: e.message }; }
    if (!V.alive(el, token)) return;
    if (!q || q.error) { el.querySelector('#asset').innerHTML = `<div class="notice">${V.esc(q?.error || 'Titre introuvable')}</div>`; return; }
    const watched = state.watchlist.includes(symbol);
    const isEtf = q.type === 'ETF' || q.type === 'MUTUALFUND';
    el.querySelector('#asset').innerHTML = `
      <a class="inline" href="javascript:history.back()">${'←'} Retour</a>
      <div class="page-head mt"><div><h1>${V.esc(q.name)}</h1><p>${V.esc(symbol)} · ${V.esc(q.exchange || '')} · mis à jour ${q.time ? Money.time(q.time) : '—'}</p></div>
        <div class="row"><div class="right"><div style="font-size:28px;font-weight:700" class="num">${Money.cur(q.price, q.currency)}</div>${V.change(q.changePct)} <span class="small">aujourd’hui</span></div>
        <button class="btn" id="watch">${icon('star')}${watched ? 'Suivi' : 'Suivre'}</button><button class="btn primary" id="add">${icon('plus')}Ajouter au portefeuille</button></div></div>
      <div class="card"><div class="card-head"><p id="perf">…</p><div class="seg" id="ranges">${RANGES.map(([r, l]) => `<button data-r="${r}" aria-pressed="${r === range}">${l}</button>`).join('')}</div></div><div class="chart-box tall"><canvas id="chart-px"></canvas></div></div>
      <div class="grid two mt">${infoCard(symbol, q)}${holdingCard(symbol, state, q)}</div>
      ${isEtf ? '' : '<div id="buffett" class="mt"><div class="card"><div class="empty">Analyse des comptes de l’entreprise…</div></div></div>'}
      ${V.DISCLAIMER}`;
    el.querySelector('#watch').addEventListener('click', () => { const on = Store.toggleWatch(symbol); App.toast(on ? 'Ajouté à la liste de suivi.' : 'Retiré de la liste de suivi.'); });
    el.querySelector('#add').addEventListener('click', () => PortfolioForms.openPosition({ symbol, name: q.name, kind: isEtf ? 'etf' : 'stock', currency: q.currency, account: Catalog.peaStatus(symbol, isEtf ? 'etf' : 'stock') === 'non' ? 'revolut' : 'pea', qty: '', pru: q.price }));
    el.querySelectorAll('#ranges button').forEach((b) => b.addEventListener('click', () => {
      range = b.dataset.r;
      el.querySelectorAll('#ranges button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      drawChart(el, token, symbol, q.currency);
    }));
    drawChart(el, token, symbol, q.currency);
    if (!isEtf) BuffettCard.mount(el, token, symbol, state);
  }

  root.AssetView = { render };
})(window);
