/* Réglages : sauvegarde / restauration des données, remise à zéro, informations sur les sources. */
(function (root) {
  const V = root.ViewKit;

  function download() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `investissements-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function render(el, ctx) {
    const s = ctx.state;
    V.mount(el, `<div class="page-head"><div><h1>Réglages</h1><p>${root.CloudConfig?.enabled ? 'Tes données sont enregistrées dans ton profil en ligne (Supabase, Europe). Pour reprendre les données de la version PC : télécharge une sauvegarde sur la version PC, puis « Restaurer » ici.' : 'Tes données restent dans ce navigateur : pense à faire une sauvegarde de temps en temps.'}</p></div></div>
      <div class="grid two">
        <div class="card"><h2>Sauvegarde</h2><p class="small">${s.holdings.length} position(s), ${s.watchlist.length} titre(s) suivi(s), ${Object.keys(s.scores).length} analyse(s).</p>
          <div class="row mt"><button class="btn primary" id="export">Télécharger une sauvegarde</button>
          <label class="btn">Restaurer…<input type="file" id="import" accept=".json,application/json" hidden></label></div>
          <div class="row mt"><button class="btn danger" id="reset">Tout effacer</button></div></div>
        <div class="card"><h2>Sources et limites</h2><ul class="small" style="padding-left:18px;line-height:1.7;margin:8px 0 0">
          <li>Cours, historiques et recherche : Yahoo Finance, via ${root.CloudConfig?.enabled ? 'le relais en ligne réservé aux profils connectés' : 'le serveur local'} (cache 1 min). Cotations parfois différées de 15 min.</li>
          <li>Fondamentaux : séries annuelles publiques Yahoo Finance (4 à 5 derniers exercices), mises en cache 12 h.</li>
          <li>Revolut et Boursobank : pas d’API publique pour les comptes-titres de particuliers → saisie manuelle ou import CSV.</li>
          <li>Budget : lu depuis l’appli Mon Budget (localhost:5178) par une passerelle locale, rien ne sort de ton ordinateur.</li>
          <li>Aucun ordre de bourse n’est passé par l’application : tu restes seul décisionnaire.</li></ul></div>
      </div>${V.DISCLAIMER}`);
    el.querySelector('#export').addEventListener('click', download);
    el.querySelector('#import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { Store.importJSON(await file.text()); App.toast('Sauvegarde restaurée.'); } catch (err) { App.toast(err.message); }
    });
    el.querySelector('#reset').addEventListener('click', () => { if (confirm('Effacer toutes tes positions, ta liste de suivi et ta stratégie ?')) { Store.reset(); App.toast('Données effacées.'); } });
  }

  root.SettingsView = { render };
})(window);
