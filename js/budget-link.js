/* Lien avec l'appli « Mon Budget » (http://localhost:5178) : une page passerelle chargée en iframe invisible
   lit les données budget dans son propre navigateur local et nous envoie un résumé (revenus, dépenses, épargne). */
(function (root) {
  const BUDGET_ORIGIN = 'http://localhost:5178';
  const TIMEOUT = 5000;

  function fetchSummary() {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.hidden = true;
      frame.title = 'Passerelle budget';
      const done = (value) => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        frame.remove();
        resolve(value);
      };
      const onMessage = (e) => {
        if (e.origin !== BUDGET_ORIGIN || !e.data || e.data.type !== 'budget-summary') return;
        done(e.data.summary);
      };
      const timer = setTimeout(() => done(null), TIMEOUT);
      window.addEventListener('message', onMessage);
      frame.src = `${BUDGET_ORIGIN}/bridge.html?origin=${encodeURIComponent(location.origin)}`;
      document.body.appendChild(frame);
    });
  }

  /* Synchronise et mémorise le résumé ; renvoie null si l'appli budget n'est pas lancée. */
  async function sync() {
    const summary = await fetchSummary();
    if (summary) Store.setBudget({ ...summary, syncedAt: Date.now() });
    return summary;
  }

  root.BudgetLink = { sync, BUDGET_ORIGIN };
})(window);
