/* Sélecteur de profils : changer, créer, renommer ou supprimer un profil sur cet appareil. */
(function (root) {
  const V = root.ViewKit;

  function rows() {
    const current = ProfileRegistry.active().id;
    return ProfileRegistry.list().map((p) => `<div class="plan-line" style="grid-template-columns:1fr auto;align-items:center">
      <div class="row"><span class="avatar">${V.esc(p.name.slice(0, 1).toUpperCase())}</span><b>${V.esc(p.name)}</b>${p.id === current ? V.badge('Actif', 'accent') : ''}</div>
      <div class="row" style="gap:2px">${p.id === current ? '' : `<button class="btn" data-switch="${p.id}">Ouvrir</button>`}
        <button class="btn ghost" data-rename="${p.id}" aria-label="Renommer">${icon('edit')}</button>
        ${p.id === current ? '' : `<button class="btn ghost danger" data-remove="${p.id}" aria-label="Supprimer">${icon('trash')}</button>`}</div></div>`).join('');
  }

  function open() {
    const d = PortfolioForms.dialog(`<div class="dialog-body">
      <h2>Profils</h2>
      <p class="small" style="margin:0">Chaque profil a son portefeuille, sa stratégie et ses documents, enregistrés dans ce navigateur. Sur un autre téléphone, chacun crée simplement le sien.</p>
      <div id="profile-list">${rows()}</div>
      <form id="new-profile" class="row"><input type="text" name="name" placeholder="Nom du nouveau profil" maxlength="40" required style="flex:1"><button class="btn primary">${icon('plus')}Créer</button></form>
      <div class="dialog-actions"><button type="button" class="btn" data-close>Fermer</button></div></div>`);
    const refresh = () => { d.querySelector('#profile-list').innerHTML = rows(); bind(); };
    function bind() {
      d.querySelectorAll('[data-switch]').forEach((b) => b.addEventListener('click', () => ProfileRegistry.switchTo(b.dataset.switch)));
      d.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', () => {
        const p = ProfileRegistry.list().find((x) => x.id === b.dataset.rename);
        const name = prompt('Nouveau nom du profil :', p.name);
        if (!name) return;
        ProfileRegistry.rename(p.id, name);
        if (p.id === ProfileRegistry.active().id) location.reload(); else refresh();
      }));
      d.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
        const p = ProfileRegistry.list().find((x) => x.id === b.dataset.remove);
        if (!confirm(`Supprimer le profil « ${p.name} », son portefeuille et ses documents ? C’est définitif.`)) return;
        try { await ProfileRegistry.remove(p.id); refresh(); } catch (e) { App.toast(e.message); }
      }));
    }
    bind();
    d.querySelector('#new-profile').addEventListener('submit', (e) => {
      e.preventDefault();
      ProfileRegistry.switchTo(ProfileRegistry.create(new FormData(e.target).get('name')).id);
    });
  }

  root.ProfilePicker = { open };
})(window);
