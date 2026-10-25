/* Briques d'interface partagées par les écrans : échappement, KPI, sparklines, badges, états vides. */
(function (root) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function kpi(label, value, sub, cls = '') {
    return `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="value num">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  }

  /* Mini-courbe SVG ; couleur selon la tendance de la période. */
  function spark(values) {
    const v = (values || []).filter((x) => Number.isFinite(x));
    if (v.length < 2) return '<svg class="spark"></svg>';
    const min = Math.min(...v), max = Math.max(...v), w = 96, h = 30, span = max - min || 1;
    const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - min) / span * (h - 4)).toFixed(1)}`).join(' ');
    const color = v[v.length - 1] >= v[0] ? 'var(--good)' : 'var(--bad)';
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }

  function range52(q) {
    if (!q || !Money.ok(q.low52) || !Money.ok(q.high52) || q.high52 <= q.low52) return '';
    const pos = Math.max(0, Math.min(100, (q.price - q.low52) / (q.high52 - q.low52) * 100));
    return `<div class="range52" title="Plus bas 52 sem. ${Money.cur(q.low52, q.currency)} · plus haut ${Money.cur(q.high52, q.currency)}"><i style="left:${pos}%"></i></div>`;
  }

  const change = (v) => `<span class="${Money.tone(v)} num">${Money.pct(v, true, 2)}</span>`;
  const sym = (symbol, name) => `<div class="sym"><b>${esc(symbol)}</b><span>${esc(name || '')}</span></div>`;
  const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
  const empty = (text, action = '') => `<div class="empty">${text}${action ? `<div class="mt">${action}</div>` : ''}</div>`;
  const sleeveDot = (id) => `<span class="sleeve-dot s-${id}"></span>`;

  function verdictBadge(score) {
    if (!score) return badge('Non analysée');
    const tone = { buy: 'good', wait: 'warn', reject: 'bad' }[score.verdict] || '';
    const short = { buy: 'Passe les filtres', wait: 'Trop chère', reject: 'Rejetée', na: 'Données insuffisantes' }[score.verdict] || score.label;
    return badge(`${short}${score.applicable ? ` · ${score.passed}/${score.applicable}` : ''}`, tone);
  }

  function checkItem(c) {
    const ico = { bad: 'alert', warn: 'alert', info: 'info', ok: 'check' }[c.level];
    const cls = { bad: 'alert', warn: 'warn', info: '', ok: 'ok' }[c.level];
    return `<div class="insight ${cls}"><div class="ico">${icon(ico)}</div><div><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p></div>${c.link ? `<a class="btn ghost" href="${c.link}">Voir</a>` : '<span></span>'}</div>`;
  }

  /* Bloque les mises à jour asynchrones d'un écran que l'utilisateur a quitté. */
  const alive = (el, token) => el.isConnected && el.dataset.token === token;
  const mount = (el, html) => { const token = Math.random().toString(36).slice(2); el.dataset.token = token; el.innerHTML = html; return token; };

  const DISCLAIMER = '<p class="disclaimer">Outil d’aide à la décision à but pédagogique : il applique les règles que tu choisis à des données publiques (Yahoo Finance, cours parfois différés de 15 min) et ne constitue pas un conseil en investissement personnalisé. Les performances passées ne préjugent pas des performances futures ; un investissement en actions peut perdre une partie importante de sa valeur. Aucun ordre n’est passé depuis cette application.</p>';

  root.ViewKit = { esc, kpi, spark, range52, change, sym, badge, empty, sleeveDot, verdictBadge, checkItem, alive, mount, DISCLAIMER };
})(window);
