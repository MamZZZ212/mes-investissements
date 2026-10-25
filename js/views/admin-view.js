/* Administration (réservée à l'administrateur) : codes d'invitation et liste des profils. */
(function (root) {
  const V = root.ViewKit;
  const inviteLink = (code) => `${location.origin}${location.pathname}#inscription/${code}`;

  function invitesTable(invites, members) {
    const names = Object.fromEntries(members.map((m) => [m.id, m.display_name || 'Sans nom']));
    if (!invites.length) return V.empty('Aucune invitation créée.');
    return `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Pour</th><th>Statut</th><th></th></tr></thead><tbody>
      ${invites.map((i) => `<tr><td><b class="num">${i.code}</b></td><td>${V.esc(i.note || '—')}</td>
        <td>${i.used_by ? V.badge(`Utilisé par ${names[i.used_by] || 'un profil'}`, 'good') : V.badge('Disponible', 'accent')}</td>
        <td class="amt nowrap">${i.used_by ? '' : `<button class="btn ghost" data-copy="${i.code}">Copier le lien</button><button class="btn ghost danger" data-del="${i.code}" aria-label="Supprimer">${icon('trash')}</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); App.toast('Lien d’invitation copié : envoie-le par message.'); } catch (e) { prompt('Copie ce lien :', text); }
  }

  async function render(el, ctx) {
    if (!CloudSession.profile()?.is_admin) { el.innerHTML = V.empty('Réservé à l’administrateur.'); return; }
    const token = V.mount(el, `<div class="page-head"><div><h1>Administration</h1><p>Invite tes proches : chaque invitation sert une seule fois.</p></div></div>
      <div class="card"><form id="inv" class="row"><input type="text" name="note" placeholder="Pour qui ? (ex. Sarah)" maxlength="80" style="flex:1"><button class="btn primary">${icon('plus')}Créer une invitation</button></form></div>
      <div class="grid two mt"><div class="card"><h2>Invitations</h2><div id="invites" class="mt"><div class="empty">Chargement…</div></div></div>
      <div class="card"><h2>Profils</h2><div id="members" class="mt"></div>
        <p class="small mt">Dans l’application, aucun profil, administrateur compris, ne peut lire le portefeuille ou les documents d’un autre. En revanche, en tant que propriétaire du projet Supabase, tu y as techniquement accès depuis la console Supabase : préviens tes invités.</p></div></div>`);
    el.querySelector('#inv').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const inv = await CloudSession.Admin.createInvite(new FormData(e.target).get('note') || '');
        await copy(inviteLink(inv.code));
        render(el, ctx);
      } catch (err) { App.toast(err.message); }
    });
    try {
      const [invites, members] = await Promise.all([CloudSession.Admin.invites(), CloudSession.Admin.members()]);
      if (!V.alive(el, token)) return;
      el.querySelector('#invites').innerHTML = invitesTable(invites, members);
      el.querySelector('#members').innerHTML = `<table><tbody>${members.map((m) => `<tr><td><b>${V.esc(m.display_name || 'Sans nom')}</b></td><td>${m.is_admin ? V.badge('Admin', 'accent') : ''}</td><td class="amt small">depuis le ${new Date(m.created_at).toLocaleDateString('fr-FR')}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(inviteLink(b.dataset.copy))));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { await CloudSession.Admin.deleteInvite(b.dataset.del).catch((e) => App.toast(e.message)); render(el, ctx); }));
    } catch (e) {
      if (V.alive(el, token)) el.querySelector('#invites').innerHTML = `<div class="notice">${V.esc(e.message)}</div>`;
    }
  }

  root.AdminView = { render };
})(window);
