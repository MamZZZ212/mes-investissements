/* Graphiques Chart.js aux couleurs du thème (clair / sombre), avec infobulles. */
(function (root) {
  const charts = {};
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function tooltip(format) {
    return {
      backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: css('--ink-2'), borderColor: css('--border'), borderWidth: 1,
      padding: 10, boxPadding: 4, usePointStyle: true,
      callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ' : ' : ''}${format(c.parsed.y ?? c.parsed)}` },
    };
  }

  function render(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || !root.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new root.Chart(canvas, config);
  }

  /* Courbe de prix / de valeur : axe Y non ancré à zéro, remplissage léger sous la courbe. */
  function lines(id, labels, series, opts = {}) {
    const format = opts.format || ((v) => Money.eur(v));
    const muted = css('--muted');
    render(id, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label, data: s.data, borderColor: s.color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15,
          borderDash: s.dash || [], fill: i === 0 && opts.fill ? { target: 'origin', above: s.color + '1f' } : false, backgroundColor: s.color,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: series.length > 1, position: 'top', align: 'end', labels: { color: css('--ink-2'), boxWidth: 10, boxHeight: 10, font: { size: 12 } } }, tooltip: tooltip(format) },
        scales: {
          x: { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: muted, maxTicksLimit: 7, maxRotation: 0, font: { size: 11 } } },
          y: { grid: { color: css('--grid') }, border: { display: false }, beginAtZero: !!opts.zero, ticks: { color: muted, font: { size: 11 }, callback: (v) => format(v) } },
        },
      },
    });
  }

  function doughnut(id, labels, data, colors) {
    render(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: css('--surface'), borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%', animation: { duration: 200 },
        plugins: { legend: { display: false }, tooltip: tooltip((v) => Money.eur(v)) },
      },
    });
  }

  const sleeveColors = () => ({ securite: css('--sleeve-securite'), coeur: css('--sleeve-coeur'), satellite: css('--sleeve-satellite') });
  const palette = () => ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5'].map(css);

  root.ChartKit = { css, lines, doughnut, sleeveColors, palette, destroyAll() { Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; }); } };
})(window);
