/* Profils sur cet appareil, partagés par Mes Investissements et Mon Budget (fichier identique dans les deux
   applis) : chaque profil a son portefeuille, son budget et ses documents. En ligne, les deux sites ont la même
   origine (mamzzz212.github.io) : le profil choisi dans l'un est actif dans l'autre.
   Le profil « principal » garde les anciennes clés de stockage, pour retrouver les données existantes. */
(function (root) {
  const PROFILES_KEY = 'invest.profiles';
  const ACTIVE_KEY = 'invest.activeProfile';
  const MAIN = { id: 'principal', name: 'Moi' };
  const DATA_KEYS = ['invest.v1', 'budget-bnp.v1'];  // données de chaque appli, une entrée par profil

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* mode privé */ }
  }

  let forced = null;  // profil imposé pour cette page seulement (passerelle budget)
  const list = () => { const l = read(PROFILES_KEY, null); return Array.isArray(l) && l.length ? l : [MAIN]; };
  const active = () => { if (forced) return forced; const id = read(ACTIVE_KEY, MAIN.id); return list().find((p) => p.id === id) || list()[0]; };
  /* Lit un profil précis sans changer le profil actif (inconnu ici = profil vide, jamais un autre profil). */
  const use = (id) => { forced = list().find((p) => p.id === id) || { id, name: '' }; };
  const isMain = (id = active().id) => id === MAIN.id;
  /* Clé de stockage d'une appli pour un profil (base : 'invest.v1' ou 'budget-bnp.v1'). */
  const storeKey = (base = 'invest.v1', id = active().id) => (isMain(id) ? base : `${base}.${id}`);

  function create(name) {
    const profile = { id: Math.random().toString(36).slice(2, 10), name: name.trim().slice(0, 40) || 'Profil' };
    write(PROFILES_KEY, [...list(), profile]);
    return profile;
  }

  function rename(id, name) {
    write(PROFILES_KEY, list().map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 40) || p.name } : p)));
  }

  /* Supprime un profil, ses données dans les deux applis et ses documents (pas le profil actif). */
  async function remove(id) {
    if (id === active().id) throw new Error('Change de profil avant de supprimer celui-ci.');
    write(PROFILES_KEY, list().filter((p) => p.id !== id));
    DATA_KEYS.forEach((base) => { try { localStorage.removeItem(storeKey(base, id)); } catch (e) { /* ignore */ } });
    if (root.DocumentVault) await root.DocumentVault.removeProfile(id);
  }

  function switchTo(id) {
    write(ACTIVE_KEY, id);
    location.hash = '';
    location.reload();
  }

  root.ProfileRegistry = { list, active, use, isMain, storeKey, create, rename, remove, switchTo };
})(window);
