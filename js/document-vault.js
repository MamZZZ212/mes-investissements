/* Coffre à documents d'un profil (Supabase Storage, dossier privé documents/<id du profil>/). */
(function (root) {
  const BUCKET = 'documents';
  const MAX_BYTES = 10 * 1024 * 1024;
  const storage = () => root.CloudSession.client().storage.from(BUCKET);
  const folder = () => root.CloudSession.user().id;

  /* Nom de fichier sûr, horodaté pour éviter d'écraser un document du même nom. */
  function safeName(name) {
    const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
    return `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${clean}`;
  }

  async function list() {
    const { data, error } = await storage().list(folder(), { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw new Error(error.message);
    return data.filter((f) => f.id).map((f) => ({ name: f.name, label: f.name.replace(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}_/, ''), size: f.metadata?.size || 0, at: f.created_at }));
  }

  async function upload(file) {
    if (file.size > MAX_BYTES) throw new Error(`${file.name} dépasse 10 Mo.`);
    const name = safeName(file.name);
    const { error } = await storage().upload(`${folder()}/${name}`, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw new Error(error.message);
    return name;
  }

  async function readText(name) {
    const { data, error } = await storage().download(`${folder()}/${name}`);
    if (error) throw new Error(error.message);
    return data.text();
  }

  /* Lien de téléchargement temporaire (1 minute). */
  async function link(name) {
    const { data, error } = await storage().createSignedUrl(`${folder()}/${name}`, 60, { download: true });
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async function remove(name) {
    const { error } = await storage().remove([`${folder()}/${name}`]);
    if (error) throw new Error(error.message);
  }

  root.DocumentVault = { list, upload, readText, link, remove, MAX_BYTES };
})(window);
