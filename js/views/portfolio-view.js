/* Portefeuille : positions par compte avec cours en direct, plus-values, édition et import. */
(function (root) {
  const V = root.ViewKit;
  let filter = 'all';

  function row(p) {
    const acc = Catalog.account(p.account).short;
    const isCash = Valuation.isCash(p);
    const title = isCash ? V.sym(p.name || 'Liquidités', 'Épargne / liquidités') : V.sym(p.symbol, p.name);
    return `<tr>
      <td class="${isCash ? '' : 'clickable-cell'}" ${isCash ? '' : `data-href="#titre/${encodeURIComponent(p.symbol)}" style="cursor:pointer"`}>${title}</td>
      <td>${V.badge(acc)}</td>
      <td class="nowrap">${V.sleeveDot(p.sleeve)}${Catalog.sleeve(p.sleeve).label}</td>
      <td class="amt">${isCash ? '' : Money.num(Number(p.qty), 4)}</td>
      <td class="amt">${isCash ? '' : Money.cur(Number(p.pru), p.currency)}</td>
      <td class="amt">${isCash ? '' : `${Money.cur(p.price, p.currency)}<div class="small">${V.change(p.changePct)}</div>`}</td>
      <td class="amt"><b>${Money.eur(p.valueEur)}</b></td>
      <td class="amt">${isCash ? '' : `<span class="${Money.tone(p.pnlEur)}">${Money.signedEur(p.pnlEur)}</span><div class="small">${Money.pct(p.pnlPct, true)}</div>`}</td>
      <td class="amt">${Money.pct(p.weight, false, 1)}</td>
      <td class="amt nowrap"><button class="btn ghost" data-edit="${p.id}" title="Modifier" aria-label="Modifier">${icon('edit')}</button><button class="btn ghost danger" data-del="${p.id}" title="Supprimer" aria-label="Supprimer">${icon('trash')}</button></td>
    </tr>`;
  }

  function table(v) {
    const list = v.positions.filter((p) => filter === 'all' || p.account === filter);
    if (!list.length) return V.empty('Aucune position ici pour l’instant.', `<button class="btn primary" data-add>${icon('plus')}Ajouter une position</button>`);
    const total = Valuation.sum(list, (p) => p.valueEur), pnl = Valuation.sum(list, (p) => p.pnlEur);
    return `<div class="table-wrap"><table>
      <thead><tr><th>Titre</th><th>Compte</th><th>Poche</th><th class="amt">Qté</th><th class="amt">PRU</th><th class="amt">Cours</th><th class="amt">Valeur</th><th class="amt">+/- latente</th><th class="amt">Poids</th><th></th></tr></thead>
      <tbody>${list.map(row).join('')}</tbody>
      <tfoot><tr><td colspan="6">Total</td><td class="amt">${Money.eur(total)}</td><td class="amt ${Money.tone(pnl)}">${Money.signedEur(pnl)}</td><td></td><td></td></tr></tfoot>
    </table></div>`;
  }

  function tabs(v) {
    const items = [['all', 'Tous'], ...Catalog.ACCOUNTS.map((a) => [a.id, a.short])];
    return `<div class="tabs" role="tablist">${items.map(([id, label]) => {
      const val = id === 'all' ? v.total : v.byAccount[id]?.value;
      return `<button role="tab" data-filter="${id}" aria-selected="${filter === id}">${label}${val ? ` · <span class="num">${Money.eur(val)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function bind(el, ctx, v) {
    const pf = el.querySelector('#pf');
    pf.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; render(el, ctx); }));
    pf.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.href; }));
    pf.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => PortfolioForms.openPosition(null, filter !== 'all' ? filter : 'pea')));
    pf.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const h = ctx.state.holdings.find((x) => x.id === b.dataset.edit);
      if (Valuation.isCash(h)) PortfolioForms.openCash(h); else PortfolioForms.openPosition(h);
    }));
    pf.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const h = ctx.state.holdings.find((x) => x.id === b.dataset.del);
      if (h && confirm(`Supprimer ${h.symbol || h.name} de ton portefeuille ?`)) Store.removeHolding(h.id);
    }));
  }

  async function render(el, ctx) {
    const token = V.mount(el, `<div class="page-head"><div><h1>Portefeuille</h1><p>Tes positions sur le PEA Boursobank, Revolut et ton épargne de sécurité, valorisées en euros.</p></div>
      <div class="row"><button class="btn" id="imp">${icon('upload')}Importer un relevé</button><button class="btn" id="cash">${icon('shield')}Ajouter de l’épargne</button><button class="btn primary" data-add>${icon('plus')}Ajouter une position</button></div></div>
      <div class="notice info" style="margin-bottom:16px">Revolut et Boursobank ne proposent pas d’accès automatique (API) aux comptes-titres des particuliers : ajoute tes positions à la main ou importe le relevé CSV exporté depuis chaque appli. Les cours, eux, sont mis à jour en direct.</div>
      <div id="pf" class="card"><div class="empty">Chargement des cours…</div></div>${V.DISCLAIMER}`);
    el.querySelector('#imp').addEventListener('click', () => PortfolioForms.openImport());
    el.querySelector('#cash').addEventListener('click', () => PortfolioForms.openCash());
    el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => PortfolioForms.openPosition(null, filter !== 'all' ? filter : 'pea')));
    try {
      const v = await Valuation.build(ctx.state);
      if (!V.alive(el, token)) return;
      const warn = v.unpriced.length ? `<div class="notice" style="margin-bottom:12px">Cours indisponible pour ${V.esc(v.unpriced.join(', '))} : valorisé au prix de revient.</div>` : '';
      el.querySelector('#pf').innerHTML = tabs(v) + warn + table(v);
      bind(el, ctx, v);
    } catch (e) {
      if (V.alive(el, token)) el.querySelector('#pf').innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.PortfolioView = { render, live: true };
})(window);
