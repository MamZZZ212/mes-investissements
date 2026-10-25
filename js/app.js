/* Point d'entrée : navigation par onglets (hash, avec #titre/SYMBOLE pour les fiches), thème,
   état du marché, rafraîchissement automatique des cours et synchronisation du budget au démarrage.
   Plusieurs profils par appareil (sélecteur dans la barre latérale), chacun avec ses données et documents. */
(function (root) {
  const BASE_VIEWS = [
    { id: 'tableau', label: 'Tableau de bord', icon: 'home', view: () => root.DashboardView },
    { id: 'portefeuille', label: 'Portefeuille', icon: 'wallet', view: () => root.PortfolioView },
    { id: 'marches', label: 'Marchés', icon: 'trend', view: () => root.MarketsView },
    { id: 'screener', label: 'Screener Buffett', icon: 'filter', view: () => root.ScreenerView },
    { id: 'strategie', label: 'Stratégie', icon: 'target', view: () => root.StrategyView },
    { id: 'plan', label: 'Plan mensuel', icon: 'calendar', view: () => root.PlanView },
    { id: 'budget', label: 'Lien budget', icon: 'link', view: () => root.BudgetView },
  ];
  const VIEWS = [
    ...BASE_VIEWS,
    { id: 'documents', label: 'Documents', icon: 'file', view: () => root.DocumentsView },
    { id: 'reglages', label: 'Réglages', icon: 'settings', view: () => root.SettingsView },
  ];
  const REFRESH_MS = 60 * 1000;
  let toastTimer = null;

  function route() {
    const [id, arg] = location.hash.replace(/^#/, '').split('/');
    if (id === 'titre' && arg) return { id: 'titre', symbol: decodeURIComponent(arg), view: root.AssetView };
    const v = VIEWS.find((x) => x.id === id) || VIEWS[0];
    return { id: v.id, view: v.view() };
  }

  function buildNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = VIEWS.map((v) => `<button class="nav-btn" data-view="${v.id}">${root.icon(v.icon)}<span>${v.label}</span></button>`).join('');
    nav.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.view; }));
  }

  function rerender() {
    const r = route();
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-current', b.dataset.view === r.id ? 'page' : 'false'));
    const el = document.getElementById('view');
    r.view.render(el, { state: root.Store.get() }, r.symbol);
  }

  /* Rafraîchit les écrans « en direct » sans gêner une saisie en cours. */
  function autoRefresh() {
    const r = route();
    const busy = document.querySelector('dialog[open]') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (document.hidden || busy || !r.view.live) return;
    rerender();
  }

  function paintStatus(s) {
    const box = document.getElementById('market-status');
    if (s.live === null) return;
    if (!s.live) { box.innerHTML = '<span class="dot off"></span>Cours injoignables'; return; }
    box.innerHTML = s.dataTime ? `<span class="dot live"></span>Cours du ${Money.time(s.dataTime)}` : '<span class="dot live"></span>Cours en direct';
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('invest.theme'); } catch (e) { /* ignore */ }
    if (saved) document.documentElement.dataset.theme = saved;
    document.getElementById('theme').addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('invest.theme', document.documentElement.dataset.theme); } catch (e) { /* ignore */ }
      rerender();
    });
  }

  /* Profil actif + accès au sélecteur de profils. */
  function paintProfile() {
    const p = root.ProfileRegistry.active();
    const box = document.getElementById('account');
    box.innerHTML = `<button class="profile-chip" id="profile-btn" title="Changer de profil"><span class="avatar">${root.ViewKit.esc(p.name.slice(0, 1).toUpperCase())}</span><span><b>${root.ViewKit.esc(p.name)}</b><small>Changer de profil</small></span></button>`;
    box.querySelector('#profile-btn').addEventListener('click', () => root.ProfilePicker.open());
  }

  root.App = {
    rerender,
    refresh(force) {
      if (force) root.MarketApi.quotes(root.Store.get().holdings.map((h) => h.symbol).filter(Boolean), true).catch(() => null).finally(rerender);
      else rerender();
    },
    toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    root.Store.load();
    paintProfile();
    document.getElementById('budget-link').href = `${root.BudgetLink.BUDGET_URL}/`;
    root.Store.subscribe(rerender);
    root.MarketApi.onStatus(paintStatus);
    root.MarketApi.quotes(root.Store.get().watchlist.slice(0, 1)).catch(() => null);
    buildNav();
    initTheme();
    window.addEventListener('hashchange', () => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      rerender();
      window.scrollTo(0, 0);
    });
    rerender();
    setInterval(autoRefresh, REFRESH_MS);
    root.BudgetLink.sync().then((b) => { if (b && route().view.live) rerender(); });
  });
})(window);
