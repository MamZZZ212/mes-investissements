/* Configuration de la version en ligne (GitHub Pages + Supabase).
   La clé « publishable » est publique par conception : la sécurité repose sur la Row Level Security
   (chaque profil ne lit que ses propres données). Ne JAMAIS mettre ici la clé secrète / service_role. */
(function (root) {
  const url = '';   // ex. https://abcdefgh.supabase.co
  const key = '';   // ex. sb_publishable_…

  // Mode en ligne sur GitHub Pages ; le serveur local (port 5179) garde le mode hors-ligne, sauf « ?cloud ».
  const local = location.port === '5179' && !new URLSearchParams(location.search).has('cloud');
  root.CloudConfig = { url, key, enabled: Boolean(url && key) && !local };
})(window);
