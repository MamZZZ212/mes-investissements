/* Coffre à documents du profil actif, conservé dans ce navigateur (IndexedDB) : rien n'est envoyé en ligne. */
(function (root) {
  const DB_NAME = 'invest-docs';
  const STORE = 'files';
  const MAX_BYTES = 10 * 1024 * 1024;
  let dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('profile', 'profile');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Stockage des documents indisponible dans ce navigateur.'));
    });
    return dbPromise;
  }

  /* Exécute une requête IndexedDB et renvoie son résultat sous forme de promesse. */
  async function run(mode, fn) {
    const store = (await db()).transaction(STORE, mode).objectStore(STORE);
    return new Promise((resolve, reject) => {
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const profileId = () => root.ProfileRegistry.active().id;

  async function list() {
    const rows = await run('readonly', (s) => s.index('profile').getAll(profileId()));
    return rows.sort((a, b) => b.at - a.at).map((r) => ({ name: r.id, label: r.name, size: r.size, at: r.at }));
  }

  async function upload(file) {
    if (file.size > MAX_BYTES) throw new Error(`${file.name} dépasse 10 Mo.`);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await run('readwrite', (s) => s.put({ id, profile: profileId(), name: file.name, type: file.type, size: file.size, at: Date.now(), blob: file }));
    return id;
  }

  const get = (id) => run('readonly', (s) => s.get(id));
  const readText = async (id) => (await get(id)).blob.text();

  /* Lien local temporaire pour ouvrir / télécharger le fichier. */
  async function link(id) {
    const r = await get(id);
    return URL.createObjectURL(new File([r.blob], r.name, { type: r.type }));
  }

  const remove = (id) => run('readwrite', (s) => s.delete(id));

  async function removeProfile(profile) {
    const ids = await run('readonly', (s) => s.index('profile').getAllKeys(profile));
    for (const id of ids) await remove(id);
  }

  root.DocumentVault = { list, upload, readText, link, remove, removeProfile, MAX_BYTES };
})(window);
