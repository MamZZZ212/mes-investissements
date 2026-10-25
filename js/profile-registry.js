/* Profils sur cet appareil : chaque profil a son propre portefeuille, sa stratégie et ses documents.
   Le profil « principal » garde l'ancienne clé de stockage, pour retrouver les données existantes. */
(function (root) {
  const PROFILES_KEY = 'invest.profiles';
  const ACTIVE_KEY = 'invest.activeProfile';
  const MAIN = { id: 'principal', name: 'Moi' };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* mode privé */ }
  }

  const list = () => { const l = read(PROFILES_KEY, null); return Array.isArray(l) && l.length ? l : [MAIN]; };
  const active = () => { const id = read(ACTIVE_KEY, MAIN.id); return list().find((p) => p.id === id) || list()[0]; };
  const storeKey = (id = active().id) => (id === MAIN.id ? 'invest.v1' : `invest.v1.${id}`);

  function create(name) {
    const profile = { id: Math.random().toString(36).slice(2, 10), name: name.trim().slice(0, 40) || 'Profil' };
    write(PROFILES_KEY, [...list(), profile]);
    return profile;
  }

  function rename(id, name) {
    write(PROFILES_KEY, list().map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 40) || p.name } : p)));
  }

  /* Supprime un profil, ses données et ses documents (le profil actif ne peut pas être supprimé). */
  async function remove(id) {
    if (id === active().id) throw new Error('Change de profil avant de supprimer celui-ci.');
    write(PROFILES_KEY, list().filter((p) => p.id !== id));
    try { localStorage.removeItem(storeKey(id)); } catch (e) { /* ignore */ }
    await root.DocumentVault.removeProfile(id);
  }

  function switchTo(id) {
    write(ACTIVE_KEY, id);
    location.hash = 'tableau';
    location.reload();
  }

  root.ProfileRegistry = { list, active, storeKey, create, rename, remove, switchTo };
})(window);
