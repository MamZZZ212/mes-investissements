/* Documents : relevés, avis d'opéré, PDF… stockés dans le coffre privé du profil ; import direct des CSV. */
(function (root) {
  const V = root.ViewKit;
  const IMPORTABLE = /\.(csv|txt)$/i;

  const size = (b) => (b > 1048576 ? `${Money.num(b / 1048576, 1)} Mo` : `${Money.num(b / 1024, 0)} Ko`);

  function table(docs) {
    if (!docs.length) return V.empty('Aucun document pour l’instant. Dépose tes relevés Revolut, exports Boursobank, avis d’opéré…');
    return `<div class="table-wrap"><table><thead><tr><th>Document</th><th class="amt">Taille</th><th>Ajouté le</th><th></th></tr></thead><tbody>
      ${docs.map((d) => `<tr><td><b>${V.esc(d.label)}</b></td><td class="amt">${size(d.size)}</td><td>${new Date(d.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td class="amt nowrap">${IMPORTABLE.test(d.name) ? `<button class="btn ghost" data-import="${V.esc(d.name)}">${icon('upload')}Importer</button>` : ''}
        <button class="btn ghost" data-get="${V.esc(d.name)}" aria-label="Télécharger">${icon('external')}</button>
        <button class="btn ghost danger" data-del="${V.esc(d.name)}" aria-label="Supprimer">${icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>`;
  }

  async function uploadAll(el, ctx, files) {
    const box = el.querySelector('#doc-msg');
    let ok = 0;
    for (const file of files) {
      box.innerHTML = `<div class="notice info">Envoi de ${V.esc(file.name)}…</div>`;
      try { await DocumentVault.upload(file); ok++; } catch (e) { App.toast(e.message); }
    }
    box.innerHTML = '';
    if (ok) App.toast(`${ok} document(s) ajouté(s).`);
    render(el, ctx);
  }

  function bind(el, ctx) {
    el.querySelectorAll('[data-get]').forEach((b) => b.addEventListener('click', async () => { window.open(await DocumentVault.link(b.dataset.get), '_blank', 'noopener'); }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement ce document ?')) return;
      await DocumentVault.remove(b.dataset.del).catch((e) => App.toast(e.message));
      render(el, ctx);
    }));
    el.querySelectorAll('[data-import]').forEach((b) => b.addEventListener('click', async () => {
      try { PortfolioForms.openImport({ text: await DocumentVault.readText(b.dataset.import) }); } catch (e) { App.toast(e.message); }
    }));
  }

  async function render(el, ctx) {
    const token = V.mount(el, `<div class="page-head"><div><h1>Mes documents</h1><p>Rangés dans ce navigateur, pour ce profil uniquement : rien n’est envoyé sur Internet (10 Mo max par fichier).</p></div></div>
      <label class="dropzone" id="drop">${icon('upload')}<div><b>Dépose tes fichiers ici</b> ou clique pour choisir</div><div class="small">CSV Revolut, export Boursobank, PDF, images…</div><input type="file" multiple hidden></label>
      <div id="doc-msg" class="mt"></div><div class="card mt" id="docs"><div class="empty">Chargement…</div></div>${V.DISCLAIMER}`);
    const drop = el.querySelector('#drop');
    drop.querySelector('input').addEventListener('change', (e) => uploadAll(el, ctx, [...e.target.files]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadAll(el, ctx, [...e.dataTransfer.files]); });
    try {
      const docs = await DocumentVault.list();
      if (!V.alive(el, token)) return;
      el.querySelector('#docs').innerHTML = table(docs);
      bind(el, ctx);
    } catch (e) {
      if (V.alive(el, token)) el.querySelector('#docs').innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.DocumentsView = { render };
})(window);
