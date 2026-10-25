/* Session en ligne (Supabase) : connexion, inscription sur invitation, profil, sauvegarde du portefeuille
   et administration des invitations. Actif seulement si CloudConfig.enabled. */
(function (root) {
  const SAVE_DELAY = 800;
  let client = null, user = null, profile = null, saveTimer = null;

  const ERRORS = [
    [/Database error saving new user|INVITATION_INVALIDE/i, 'Code d’invitation invalide ou déjà utilisé.'],
    [/already registered|already exists/i, 'Un compte existe déjà avec cet e-mail.'],
    [/Invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
    [/Password should be at least/i, 'Mot de passe trop court (8 caractères minimum).'],
    [/Email not confirmed/i, 'E-mail non confirmé : demande à l’administrateur de désactiver la confirmation par e-mail.'],
    [/rate limit/i, 'Trop de tentatives : réessaie dans quelques minutes.'],
  ];
  function friendly(error) {
    const msg = error?.message || String(error);
    const hit = ERRORS.find(([re]) => re.test(msg));
    return new Error(hit ? hit[1] : msg);
  }
  const check = ({ data, error }) => { if (error) throw friendly(error); return data; };

  async function loadProfile() {
    profile = check(await client.from('profiles').select('id, display_name, is_admin').eq('id', user.id).maybeSingle()) || { display_name: '', is_admin: false };
  }

  /* Prépare le client et récupère une session existante ; renvoie l'utilisateur connecté ou null. */
  async function init() {
    client = root.supabase.createClient(root.CloudConfig.url, root.CloudConfig.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    if (user) await loadProfile();
    return user;
  }

  async function signIn(email, password) {
    check(await client.auth.signInWithPassword({ email: email.trim(), password }));
  }

  async function signUp({ name, email, password, code }) {
    if (password.length < 8) throw new Error('Mot de passe trop court (8 caractères minimum).');
    const data = check(await client.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim(), invite_code: code.trim().toUpperCase() } } }));
    if (!data.session) throw new Error('Compte créé, mais la confirmation par e-mail est activée dans Supabase : désactive « Confirm email » puis connecte-toi.');
  }

  async function signOut() { await client.auth.signOut(); location.reload(); }

  async function loadState() {
    const row = check(await client.from('portfolios').select('state').eq('user_id', user.id).maybeSingle());
    return row && row.state && Object.keys(row.state).length ? row.state : null;
  }

  /* Sauvegarde différée : regroupe les modifications rapprochées en une seule écriture. */
  function saveState(state) {
    clearTimeout(saveTimer);
    const snapshot = JSON.parse(JSON.stringify(state));
    saveTimer = setTimeout(async () => {
      const { error } = await client.from('portfolios').upsert({ user_id: user.id, state: snapshot, updated_at: new Date().toISOString() });
      if (error) { console.error('Sauvegarde en ligne impossible', error); root.App?.toast('Sauvegarde en ligne impossible : vérifie ta connexion.'); }
    }, SAVE_DELAY);
  }

  async function accessToken() {
    const { data } = await client.auth.getSession();
    return data.session?.access_token || root.CloudConfig.key;
  }

  /* Codes lisibles sans ambiguïté (pas de 0/O ni 1/I). */
  function newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  const Admin = {
    invites: async () => check(await client.from('invites').select('code, note, used_by, used_at, created_at').order('created_at', { ascending: false })),
    members: async () => check(await client.from('profiles').select('id, display_name, is_admin, created_at').order('created_at')),
    createInvite: async (note) => check(await client.from('invites').insert({ code: newCode(), note: note.slice(0, 80), created_by: user.id }).select().single()),
    deleteInvite: async (code) => check(await client.from('invites').delete().eq('code', code)),
  };

  root.CloudSession = {
    init, signIn, signUp, signOut, loadState, saveState, accessToken, Admin,
    client: () => client, user: () => user, profile: () => profile,
  };
})(window);
