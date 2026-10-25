/* Stratégie : profil de risque, allocation cœur-satellite, composition du cœur, règles d'or et seuils Buffett. */
(function (root) {
  const V = root.ViewKit;

  const RULE_FIELDS = [
    ['Discipline', [
      ['emergencyMonths', 'Épargne de précaution', 'mois de dépenses à garder en sécurité', 1, 12, 1],
      ['maxLinePct', 'Poids max d’une action', '% du portefeuille total', 1, 25, 0.5],
      ['rebalanceBand', 'Tolérance avant rééquilibrage', 'points d’écart par poche', 1, 20, 1],
      ['horizonYears', 'Horizon minimal des actions', 'années', 1, 30, 1],
    ]],
    ['Qualité (grille Buffett)', [
      ['minRoe', 'ROE minimum', '%', 0, 60, 1], ['minNetMargin', 'Marge nette minimum', '%', 0, 50, 1],
      ['minGrossMargin', 'Marge brute minimum', '%', 0, 90, 1], ['minEpsGrowth', 'Croissance BPA minimum', '% par an', -10, 40, 1],
      ['minRevGrowth', 'Croissance CA minimum', '% par an', -10, 40, 1], ['maxDebtYears', 'Dette nette max', 'années de bénéfice', 0, 15, 0.5],
      ['minQuality', 'Part de critères qualité à réussir', '%', 40, 100, 5],
    ]],
    ['Prix', [
      ['maxPe', 'PER maximum', 'cours / bénéfice', 5, 80, 1], ['mos', 'Marge de sécurité', '% sous la valeur intrinsèque', 0, 60, 5],
      ['discount', 'Taux d’actualisation', '% (rendement exigé)', 5, 15, 0.5], ['maxGrowth', 'Croissance max retenue', '% par an dans le calcul', 0, 25, 1],
    ]],
  ];

  function profiles(s) {
    return `<div class="profile-cards">${Strategy.PROFILES.map((p) => `<button class="profile-card" data-profile="${p.id}" aria-pressed="${s.profile === p.id}">
      <b>${p.label}</b><div class="split-bar">${Catalog.SLEEVES.map((x) => `<div class="s-${x.id}" style="flex:${p.targets[x.id]}"></div>`).join('')}</div>
      <span class="num">${p.targets.securite} % sécurité · ${p.targets.coeur} % cœur · ${p.targets.satellite} % satellite</span><span>${p.desc}</span></button>`).join('')}</div>`;
  }

  function targets(s) {
    const row = (id, label, help, max) => `<div class="slider-row"><div class="name">${V.sleeveDot(id)}${label}<small>${help}</small></div>
      <input type="range" min="0" max="${max}" step="5" value="${s.targets[id]}" data-target="${id}"><div class="val num" id="t-${id}">${s.targets[id]} %</div></div>`;
    return row('securite', 'Sécurité', 'livrets, fonds euros, monétaire', 80) + row('satellite', 'Satellite', 'actions individuelles', 40)
      + `<div class="slider-row"><div class="name">${V.sleeveDot('coeur')}Cœur<small>ETF diversifiés (le reste)</small></div><div></div><div class="val num" id="t-coeur">${s.targets.coeur} %</div></div>`;
  }

  function core(s) {
    const rows = s.core.map((c, i) => `<tr><td>${V.sym(c.symbol, Catalog.etfInfo(c.symbol)?.name || '')}</td><td class="amt"><input type="number" min="0" max="100" step="5" value="${c.weight}" data-core="${i}" style="width:80px"> %</td><td class="amt"><button class="btn ghost danger" data-core-del="${i}" aria-label="Retirer">${icon('trash')}</button></td></tr>`).join('');
    const choices = Catalog.PEA_ETFS.filter((e) => !s.core.some((c) => c.symbol === e.symbol)).map((e) => `<option value="${e.symbol}">${e.symbol} — ${e.name} (${Money.pct(e.ter, false, 2)})</option>`).join('');
    return `<table><tbody>${rows}</tbody></table><div class="row mt"><select id="core-add" style="flex:1"><option value="">Ajouter un ETF au cœur…</option>${choices}</select></div>
      <p class="small">Un seul ETF Monde suffit souvent : simple, diversifié sur ~1 400 entreprises. Les poids sont normalisés automatiquement.</p>`;
  }

  function rules(s) {
    return RULE_FIELDS.map(([title, fields]) => `<h3 class="mt" style="margin-bottom:4px">${title}</h3>${fields.map(([k, label, help, min, max, step]) => `<div class="rule"><div>${label}<small>${help}</small></div><input type="number" min="${min}" max="${max}" step="${step}" value="${s.rules[k]}" data-rule="${k}"></div>`).join('')}`).join('');
  }

  function bind(el, s) {
    el.querySelectorAll('[data-profile]').forEach((b) => b.addEventListener('click', () => {
      const p = Strategy.profile(b.dataset.profile);
      Store.updateStrategy({ profile: p.id, targets: { ...p.targets } });
    }));
    el.querySelectorAll('[data-target]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const t = { ...s.targets, [inp.dataset.target]: Number(inp.value) };
        if (t.securite + t.satellite > 100) t[inp.dataset.target] = 100 - t[inp.dataset.target === 'securite' ? 'satellite' : 'securite'];
        t.coeur = 100 - t.securite - t.satellite;
        inp.value = t[inp.dataset.target];
        ['securite', 'coeur', 'satellite'].forEach((k) => { el.querySelector(`#t-${k}`).textContent = `${t[k]} %`; });
        Store.updateStrategy({ targets: t, profile: 'perso' }, true);
      });
      inp.addEventListener('change', () => App.rerender());
    });
    el.querySelectorAll('[data-rule]').forEach((inp) => inp.addEventListener('change', () => { if (inp.value !== '') { Store.updateRules({ [inp.dataset.rule]: Number(inp.value) }, true); App.toast('Règle mise à jour.'); } }));
    el.querySelectorAll('[data-core]').forEach((inp) => inp.addEventListener('change', () => { const c = s.core.map((x) => ({ ...x })); c[inp.dataset.core].weight = Number(inp.value); Store.updateStrategy({ core: c }); }));
    el.querySelectorAll('[data-core-del]').forEach((b) => b.addEventListener('click', () => Store.updateStrategy({ core: s.core.filter((_, i) => i !== Number(b.dataset.coreDel)) })));
    el.querySelector('#core-add').addEventListener('change', (e) => { if (e.target.value) Store.updateStrategy({ core: [...s.core, { symbol: e.target.value, weight: s.core.length ? 20 : 100 }] }); });
    el.querySelector('#expenses').addEventListener('change', (e) => Store.updateStrategy({ monthlyExpenses: Number(e.target.value) }, true));
    el.querySelector('#reset-rules').addEventListener('click', () => { Store.updateStrategy({ rules: { ...Store.DEFAULT_RULES } }); App.toast('Règles par défaut rétablies.'); });
  }

  function render(el, ctx) {
    const s = ctx.state.strategy, b = ctx.state.budget;
    V.mount(el, `<div class="page-head"><div><h1>Stratégie</h1><p>Cœur-satellite : la majorité en ETF larges et peu chers, une petite part en actions très sélectionnées, un matelas de sécurité.</p></div></div>
      <div class="card"><div class="card-head"><div><h2>1. Ton profil</h2><p>Choisis selon ton horizon et ta capacité à voir ton portefeuille baisser sans vendre.</p></div></div>${profiles(s)}</div>
      <div class="grid two mt">
        <div class="card"><div class="card-head"><div><h2>2. Allocation cible</h2><p>Ajuste librement ; le cœur prend le reste.</p></div></div>${targets(s)}
          <div class="rule mt"><div>Dépenses mensuelles<small>${b?.avgExpense ? `Issues de ton budget : ${Money.eur(b.avgExpense)} (prioritaire)` : 'Utilisées si le budget n’est pas relié'}</small></div><input type="number" id="expenses" min="0" step="50" value="${s.monthlyExpenses}"></div></div>
        <div class="card"><div class="card-head"><div><h2>3. Composition du cœur</h2><p>ETF éligibles PEA achetés chaque mois.</p></div></div>${core(s)}</div>
      </div>
      <div class="grid two mt">
        <div class="card"><div class="card-head"><div><h2>4. Tes conditions d’investissement</h2><p>Appliquées au screener, aux fiches et aux alertes.</p></div><button class="btn ghost" id="reset-rules">Valeurs par défaut</button></div>${rules(s)}</div>
        <div class="card"><div class="card-head"><h2>Les règles d’or</h2></div>${Strategy.GOLDEN_RULES.map(([t, d], i) => `<div class="insight"><div class="ico">${i + 1}</div><div><h4>${t}</h4><p>${d}</p></div><span></span></div>`).join('')}
          <div class="notice mt"><b>Se couvrir (« hedger ») ?</b> Pour un particulier, la meilleure protection n’est pas un produit dérivé mais la poche Sécurité, la diversification mondiale du cœur et le temps. Les produits de couverture (options, ETF inverses, CFD) coûtent cher et sont conçus pour des professionnels.</div></div>
      </div>${V.DISCLAIMER}`);
    bind(el, s);
  }

  root.StrategyView = { render };
})(window);
