/* Écran d'accueil en ligne : connexion, ou création de compte avec un code d'invitation
   (lien « #inscription/CODE » envoyé par l'administrateur). */
(function (root) {
  const V = root.ViewKit;

  function invitedCode() {
    const m = /^#inscription\/([A-Z0-9]+)/i.exec(location.hash);
    return m ? m[1].toUpperCase() : '';
  }

  function form(mode, code) {
    if (mode === 'login') {
      return `<form id="auth-form" class="stack" style="gap:12px">
        <label class="field">E-mail<input type="email" name="email" required autocomplete="email"></label>
        <label class="field">Mot de passe<input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn primary" style="justify-content:center">Se connecter</button></form>`;
    }
    return `<form id="auth-form" class="stack" style="gap:12px">
      <label class="field">Code d’invitation<input type="text" name="code" required value="${V.esc(code)}" placeholder="ex. K7PQ2MXA" autocomplete="off" style="text-transform:uppercase"></label>
      <label class="field">Prénom<input type="text" name="name" required maxlength="60" autocomplete="given-name"></label>
      <label class="field">E-mail<input type="email" name="email" required autocomplete="email"></label>
      <label class="field">Mot de passe (8 caractères minimum)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
      <button class="btn primary" style="justify-content:center">Créer mon profil</button>
      <p class="small" style="margin:0">Le tout premier compte créé devient administrateur (pas besoin de code).</p></form>`;
  }

  function render(el, mode = invitedCode() ? 'signup' : 'login') {
    el.innerHTML = `<div class="auth-wrap"><div class="card auth-card">
      <div class="brand" style="padding:0 0 14px"><span class="brand-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 20v-7M11 20V8M17 20v-5M23 20V4"/></svg></span>Mes Investissements</div>
      <div class="tabs" role="tablist"><button role="tab" data-mode="login" aria-selected="${mode === 'login'}">Connexion</button><button role="tab" data-mode="signup" aria-selected="${mode === 'signup'}">J’ai une invitation</button></div>
      ${form(mode, invitedCode())}
      <div id="auth-msg" class="mt"></div>
      <p class="small mt">Chaque profil est privé : personne d’autre que toi ne voit ton portefeuille ni tes documents.</p></div></div>`;
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => render(el, b.dataset.mode)));
    el.querySelector('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      el.querySelector('#auth-msg').innerHTML = '<div class="notice info">Un instant…</div>';
      try {
        if (mode === 'login') await CloudSession.signIn(f.email, f.password);
        else await CloudSession.signUp(f);
        location.hash = 'tableau';
        location.reload();
      } catch (err) {
        btn.disabled = false;
        el.querySelector('#auth-msg').innerHTML = `<div class="notice">${V.esc(err.message)}</div>`;
      }
    });
  }

  root.AuthView = { render };
})(window);
