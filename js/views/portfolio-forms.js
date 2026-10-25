/* Dialogues du portefeuille : ajout / modification d'une position (avec recherche), épargne, import CSV. */
(function (root) {
  const V = root.ViewKit;

  function dialog(html) {
    const d = document.createElement('dialog');
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener('close', () => d.remove());
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.showModal();
    return d;
  }

  const options = (list, value) => list.map((o) => `<option value="${o.id}" ${o.id === value ? 'selected' : ''}>${o.label}</option>`).join('');

  /* Champ de recherche Yahoo Finance avec résultats cliquables (nom, ticker ou ISIN). */
  function bindSearch(d, onPick) {
    const input = d.querySelector('[name=q]'), box = d.querySelector('.search-results');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      timer = setTimeout(async () => {
        const found = await MarketApi.search(q).catch(() => []);
        box.hidden = !found.length;
        box.innerHTML = found.map((f, i) => `<button type="button" data-i="${i}"><span>${V.sym(f.symbol, f.name)}</span><span class="small">${V.esc(f.type === 'ETF' ? 'ETF' : f.type === 'EQUITY' ? 'Action' : f.type)} · ${V.esc(f.exchange || '')}</span></button>`).join('');
        box.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { box.hidden = true; onPick(found[b.dataset.i]); }));
      }, 250);
    });
  }

  function openPosition(holding, defaultAccount = 'pea') {
    const h = holding || { account: defaultAccount, qty: '', pru: '', kind: 'etf' };
    const d = dialog(`<form method="dialog">
      <h2>${holding?.id ? 'Modifier la position' : 'Ajouter une position'}</h2>
      <label class="field">Rechercher un titre (nom, ticker ou ISIN)<input type="search" name="q" placeholder="ex. Amundi PEA Monde, NVDA, FR001400U5Q4" autocomplete="off" value="${V.esc(h.symbol || '')}"></label>
      <div class="search-results" hidden></div>
      <div class="notice info" id="picked">${h.symbol ? `${V.esc(h.symbol)} — ${V.esc(h.name || '')}` : 'Choisis un titre dans la recherche.'}</div>
      <div class="form-grid">
        <label class="field">Compte<select name="account">${options(Catalog.ACCOUNTS, h.account)}</select></label>
        <label class="field">Poche<select name="sleeve">${options(Catalog.SLEEVES, h.sleeve || Valuation.defaultSleeve(h.kind))}</select></label>
        <label class="field">Quantité<input type="number" name="qty" step="any" min="0" required value="${h.qty}"></label>
        <label class="field">Prix de revient unitaire (PRU) <span class="small" id="cur">${V.esc(h.currency || '')}</span><input type="number" name="pru" step="any" min="0" required value="${h.pru}"></label>
      </div>
      <div class="dialog-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" value="ok">Enregistrer</button></div>
    </form>`);
    let pick = holding ? { ...holding } : null;
    bindSearch(d, async (f) => {
      const q = (await MarketApi.quotes([f.symbol]))[f.symbol] || {};
      const kind = f.type === 'ETF' || f.type === 'MUTUALFUND' ? 'etf' : 'stock';
      pick = { symbol: f.symbol, name: f.name || q.name, kind, currency: q.currency || 'EUR' };
      d.querySelector('#picked').innerHTML = `<b>${V.esc(f.symbol)}</b> — ${V.esc(pick.name || '')} · cours ${Money.cur(q.price, q.currency)} · PEA : ${Catalog.peaStatus(f.symbol, kind)}`;
      d.querySelector('#cur').textContent = `(${pick.currency})`;
      d.querySelector('[name=sleeve]').value = Valuation.defaultSleeve(kind);
      if (Catalog.peaStatus(f.symbol, kind) === 'non' && d.querySelector('[name=account]').value === 'pea') d.querySelector('[name=account]').value = 'revolut';
    });
    d.querySelector('form').addEventListener('submit', (e) => {
      if (!pick) { e.preventDefault(); App.toast('Choisis d’abord un titre dans la recherche.'); return; }
      const f = new FormData(e.target);
      Store.upsertHolding({ ...h, ...pick, id: h.id, account: f.get('account'), sleeve: f.get('sleeve'), qty: Number(f.get('qty')), pru: Number(f.get('pru')) });
      App.toast('Position enregistrée.');
    });
  }

  function openCash(holding) {
    const h = holding || { name: 'Livret A', amount: '', account: 'securite' };
    const d = dialog(`<form method="dialog">
      <h2>Épargne de sécurité</h2>
      <p class="small" style="margin:0">Livret A, LDDS, fonds euros, épargne Revolut… : la poche qui ne doit pas baisser.</p>
      <div class="form-grid">
        <label class="field">Nom<input type="text" name="name" required value="${V.esc(h.name)}"></label>
        <label class="field">Montant actuel (€)<input type="number" name="amount" step="any" min="0" required value="${h.amount}"></label>
      </div>
      <div class="dialog-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" value="ok">Enregistrer</button></div>
    </form>`);
    d.querySelector('form').addEventListener('submit', (e) => {
      const f = new FormData(e.target);
      Store.upsertHolding({ ...h, kind: 'cash', symbol: '', account: 'securite', sleeve: 'securite', name: f.get('name'), amount: Number(f.get('amount')) });
    });
  }

  const TEMPLATE = 'symbole;quantite;pru\nDCAM.PA;150;5,80\nNVDA;3;180\n';

  function previewRows(holdings) {
    return holdings.map((h) => {
      const tag = h.unresolved ? V.badge('Non reconnu — ignoré', 'bad') : h.guessed ? V.badge('Deviné par le nom : vérifie', 'warn') : V.badge(h.kind === 'etf' ? 'ETF' : 'Action');
      return `<tr><td>${V.sym(h.symbol || h.isin || '?', h.name)}</td><td class="amt">${Money.num(h.qty, 4)}</td><td class="amt">${Money.cur(h.pru, h.currency)}</td><td>${tag}</td></tr>`;
    }).join('');
  }

  /* preset.text : contenu déjà lu (ex. document du coffre en ligne), analysé dès l'ouverture. */
  function openImport(preset = {}) {
    const d = dialog(`<div class="dialog-body">
      <h2>Importer des positions</h2>
      <div class="tabs" role="tablist" style="margin-bottom:0"><button role="tab" data-mode="file" aria-selected="true">Fichier CSV (Revolut)</button><button role="tab" data-mode="paste" aria-selected="false">Coller un tableau (Boursobank)</button></div>
      <div data-pane="file"><p class="small" style="margin:0 0 10px">Revolut → Investir → Documents → Actions → <b>Relevé de compte</b> → période « Depuis le début » → CSV. Ou un CSV <code>symbole;quantite;pru</code> (<a class="inline" href="#" id="tpl">télécharger le modèle</a>).</p>
        <label class="dropzone" style="padding:22px">${icon('upload')}<div>Choisir le fichier CSV</div><input type="file" accept=".csv,text/csv,.txt" hidden></label></div>
      <div data-pane="paste" hidden><p class="small" style="margin:0 0 10px">Sur boursobank.com → ton PEA → <b>Mes positions</b> : sélectionne le tableau à la souris (titres des colonnes compris), copie (Ctrl+C) et colle ici (Ctrl+V).</p>
        <textarea id="pasted" rows="6" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--ink);font:13px/1.4 ui-monospace,monospace" placeholder="Libellé	Quantité	PRU	Cours…"></textarea>
        <button class="btn mt" id="analyse" type="button">Analyser le tableau collé</button></div>
      <label class="field">Compte concerné<select name="account">${options(Catalog.ACCOUNTS.filter((a) => a.id !== 'securite'), 'revolut')}</select></label>
      <div id="preview"></div>
      <div class="dialog-actions"><button type="button" class="btn" data-close>Fermer</button><button class="btn primary" id="go" disabled>Remplacer les positions du compte</button></div>
    </div>`);
    let parsed = null;
    const account = d.querySelector('[name=account]');
    const analyse = async (text) => {
      const box = d.querySelector('#preview');
      box.innerHTML = '<div class="notice info">Lecture et recherche des titres…</div>';
      try {
        parsed = await StatementImport.parse(text);
        const ok = parsed.holdings.filter((h) => !h.unresolved).length;
        box.innerHTML = `<p class="small">Format détecté : <b>${V.esc(parsed.format)}</b> · ${ok}/${parsed.holdings.length} position(s) reconnue(s)</p><div class="table-wrap" style="max-height:220px;overflow:auto"><table><tbody>${previewRows(parsed.holdings)}</tbody></table></div>`;
        d.querySelector('#go').disabled = !ok;
      } catch (err) { parsed = null; d.querySelector('#go').disabled = true; box.innerHTML = `<div class="notice">${V.esc(err.message)}</div>`; }
    };
    d.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      d.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-selected', x === b));
      d.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.mode; });
      account.value = b.dataset.mode === 'paste' ? 'pea' : 'revolut';
    }));
    d.querySelector('#tpl').addEventListener('click', (e) => {
      e.preventDefault();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
      a.download = 'modele-positions.csv';
      a.click();
    });
    d.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      analyse(await file.text());
      // Le relevé est aussi rangé dans le coffre « Documents » du profil.
      DocumentVault.upload(file).then(() => App.toast('Relevé rangé dans tes documents.')).catch((err) => console.error('Archivage du relevé impossible', err));
    });
    d.querySelector('#analyse').addEventListener('click', () => analyse(d.querySelector('#pasted').value));
    if (preset.text) analyse(preset.text);
    d.querySelector('#go').addEventListener('click', () => {
      const kept = parsed.holdings.filter((h) => !h.unresolved).map(({ unresolved, guessed, ...h }) => h);
      if (!confirm(`Remplacer toutes les positions ${Catalog.account(account.value).short} par ces ${kept.length} position(s) ?`)) return;
      Store.replaceAccount(account.value, kept);
      App.toast(`${kept.length} position(s) importée(s) dans ${Catalog.account(account.value).short}.`);
      d.close();
    });
  }

  root.PortfolioForms = { openPosition, openCash, openImport, dialog };
})(window);
