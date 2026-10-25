/* Marchés : liste de suivi (ETF et actions) avec cours en direct, et catalogue des ETF éligibles PEA. */
(function (root) {
  const V = root.ViewKit;
  let tab = 'watch';

  function watchRow(q, symbol, state) {
    if (!q || q.error) return `<tr><td>${V.sym(symbol, 'Cours indisponible')}</td><td colspan="5"></td><td class="amt"><button class="btn ghost" data-unwatch="${V.esc(symbol)}" aria-label="Retirer">${icon('trash')}</button></td></tr>`;
    const isEtf = q.type === 'ETF' || q.type === 'MUTUALFUND';
    return `<tr class="clickable" data-href="#titre/${encodeURIComponent(symbol)}">
      <td>${V.sym(symbol, q.name)}</td><td>${V.spark(q.spark)}</td>
      <td class="amt">${Money.cur(q.price, q.currency)}</td><td class="amt">${V.change(q.changePct)}</td>
      <td>${V.range52(q)}</td>
      <td>${isEtf ? V.badge(`PEA : ${Catalog.peaStatus(symbol, 'etf')}`, Catalog.isPeaEtf(symbol) ? 'accent' : '') : V.verdictBadge(state.scores[symbol])}</td>
      <td class="amt"><button class="btn ghost" data-unwatch="${V.esc(symbol)}" aria-label="Retirer de la liste">${icon('trash')}</button></td></tr>`;
  }

  function watchTable(quotes, state) {
    const groups = [['ETF', (q) => q && (q.type === 'ETF' || q.type === 'MUTUALFUND')], ['Actions', (q) => !q || !(q.type === 'ETF' || q.type === 'MUTUALFUND')]];
    return groups.map(([label, test]) => {
      const list = state.watchlist.filter((s) => test(quotes[s]));
      if (!list.length) return '';
      return `<div class="card mt"><div class="card-head"><h2>${label}</h2><span class="small">${list.length} titre(s)</span></div><div class="table-wrap"><table>
        <thead><tr><th>Titre</th><th>1 mois</th><th class="amt">Cours</th><th class="amt">Jour</th><th>52 semaines</th><th>${label === 'ETF' ? 'PEA' : 'Filtre Buffett'}</th><th></th></tr></thead>
        <tbody>${list.map((s) => watchRow(quotes[s], s, state)).join('')}</tbody></table></div></div>`;
    }).join('');
  }

  function etfTable(quotes) {
    const rows = Catalog.PEA_ETFS.map((e) => {
      const q = quotes[e.symbol] || {};
      return `<tr class="clickable" data-href="#titre/${encodeURIComponent(e.symbol)}"><td>${V.sym(e.symbol, q.name || e.name)}</td><td>${V.esc(e.zone)}</td><td>${V.esc(e.role)}</td>
        <td class="amt">${Money.pct(e.ter, false, 2)}</td><td class="small">${e.isin}</td><td class="amt">${Money.cur(q.price, q.currency)}</td><td class="amt">${V.change(q.changePct)}</td><td>${V.spark(q.spark)}</td></tr>`;
    }).join('');
    const safe = Catalog.SAFE_OPTIONS.map((o) => `<tr><td><b>${V.esc(o.name)}</b></td><td>${V.esc(o.where)}</td><td>${V.badge(o.risk, 'good')}</td><td class="small">${V.esc(o.note)}</td></tr>`).join('');
    return `<div class="card"><div class="card-head"><div><h2>ETF éligibles au PEA</h2><p>Pour la poche Cœur : larges, diversifiés, peu chers. Frais annuels indicatifs — vérifie le DIC.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>ETF</th><th>Zone</th><th>Rôle</th><th class="amt">Frais/an</th><th>ISIN</th><th class="amt">Cours</th><th class="amt">Jour</th><th>1 mois</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card mt"><div class="card-head"><div><h2>Placements peu risqués</h2><p>Pour la poche Sécurité (hors PEA : le PEA n’accepte que des actions européennes et assimilées).</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Support</th><th>Où</th><th>Risque</th><th>À savoir</th></tr></thead><tbody>${safe}</tbody></table></div></div>`;
  }

  function bindSearch(el, ctx) {
    const input = el.querySelector('#add-q'), box = el.querySelector('#add-results');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      timer = setTimeout(async () => {
        const found = await MarketApi.search(q).catch(() => []);
        box.hidden = !found.length;
        box.innerHTML = found.map((f) => `<button type="button" data-sym="${V.esc(f.symbol)}"><span>${V.sym(f.symbol, f.name)}</span><span class="small">${V.esc(f.type)} · ${V.esc(f.exchange || '')}</span></button>`).join('');
        box.querySelectorAll('[data-sym]').forEach((b) => b.addEventListener('click', () => {
          if (!ctx.state.watchlist.includes(b.dataset.sym)) Store.toggleWatch(b.dataset.sym);
          App.toast(`${b.dataset.sym} ajouté à ta liste de suivi.`);
        }));
      }, 250);
    });
  }

  async function render(el, ctx) {
    const state = ctx.state;
    const token = V.mount(el, `<div class="page-head"><div><h1>Marchés</h1><p>Cours en direct (différés jusqu’à 15 min selon la place) de ta liste de suivi.</p></div></div>
      <div class="tabs" role="tablist"><button role="tab" data-tab="watch" aria-selected="${tab === 'watch'}">Liste de suivi</button><button role="tab" data-tab="etf" aria-selected="${tab === 'etf'}">ETF PEA & placements sûrs</button></div>
      ${tab === 'watch' ? `<div class="card" style="position:relative"><label class="field">Ajouter un titre à suivre<input type="search" id="add-q" placeholder="Nom, ticker ou ISIN — ex. Nvidia, Air Liquide, IE00B4L5Y983" autocomplete="off"></label><div id="add-results" class="search-results mt" hidden></div></div>` : ''}
      <div id="mk"><div class="empty">Chargement des cours…</div></div>${V.DISCLAIMER}`);
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(el, ctx); }));
    if (tab === 'watch') bindSearch(el, ctx);
    try {
      const symbols = tab === 'watch' ? state.watchlist : Catalog.PEA_ETFS.map((e) => e.symbol);
      const quotes = await MarketApi.quotes(symbols);
      if (!V.alive(el, token)) return;
      const mk = el.querySelector('#mk');
      mk.innerHTML = tab === 'watch' ? (watchTable(quotes, state) || V.empty('Ta liste de suivi est vide.')) : etfTable(quotes);
      mk.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', (e) => { if (!e.target.closest('button')) location.hash = r.dataset.href; }));
      mk.querySelectorAll('[data-unwatch]').forEach((b) => b.addEventListener('click', () => Store.toggleWatch(b.dataset.unwatch)));
    } catch (e) {
      if (V.alive(el, token)) el.querySelector('#mk').innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.MarketsView = { render, live: true };
})(window);
