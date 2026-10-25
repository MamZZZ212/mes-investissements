/* Référentiel : comptes, ETF éligibles PEA, placements peu risqués et univers du screener.
   Frais (TER) indicatifs : toujours vérifier le DIC de l'émetteur avant d'acheter. */
(function (root) {
  const ACCOUNTS = [
    { id: 'pea', label: 'PEA Boursobank', short: 'PEA' },
    { id: 'revolut', label: 'Revolut (compte-titres)', short: 'Revolut' },
    { id: 'securite', label: 'Épargne de sécurité', short: 'Sécurité' },
    { id: 'autre', label: 'Autre compte', short: 'Autre' },
  ];

  const SLEEVES = [
    { id: 'securite', label: 'Sécurité', desc: 'Livrets, fonds euros, monétaire : capital stable, disponible.' },
    { id: 'coeur', label: 'Cœur', desc: 'ETF larges et peu chers : la croissance du marché mondial.' },
    { id: 'satellite', label: 'Satellite', desc: 'Actions choisies avec des critères stricts : plus de risque.' },
  ];

  const PEA_ETFS = [
    { symbol: 'DCAM.PA', name: 'Amundi PEA Monde (MSCI World)', isin: 'FR001400U5Q4', ter: 0.20, zone: 'Monde développé', role: 'Cœur' },
    { symbol: 'WPEA.PA', name: 'iShares MSCI World Swap PEA', isin: 'IE0002XZSHO1', ter: 0.25, zone: 'Monde développé', role: 'Cœur' },
    { symbol: 'CW8.PA', name: 'Amundi MSCI World Swap', isin: 'LU1681043599', ter: 0.38, zone: 'Monde développé', role: 'Cœur' },
    { symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500', isin: 'FR0011550185', ter: 0.15, zone: 'États-Unis', role: 'Cœur / complément' },
    { symbol: 'PSP5.PA', name: 'Amundi PEA S&P 500', isin: 'FR0011871128', ter: 0.15, zone: 'États-Unis', role: 'Cœur / complément' },
    { symbol: 'PCEU.PA', name: 'Amundi PEA MSCI Europe', isin: 'FR0013412038', ter: 0.15, zone: 'Europe', role: 'Complément' },
    { symbol: 'ETZ.PA', name: 'BNP Paribas Easy Stoxx Europe 600', isin: 'FR0011550193', ter: 0.20, zone: 'Europe', role: 'Complément' },
    { symbol: 'PAEEM.PA', name: 'Amundi PEA Émergents (MSCI EM)', isin: 'FR0013412020', ter: 0.30, zone: 'Pays émergents', role: 'Diversification' },
    { symbol: 'PUST.PA', name: 'Amundi PEA Nasdaq-100', isin: 'FR0011871110', ter: 0.30, zone: 'Tech US', role: 'Satellite (concentré)' },
    { symbol: 'CAC.PA', name: 'Amundi CAC 40', isin: 'FR0007052782', ter: 0.25, zone: 'France', role: 'Complément' },
  ];

  const SAFE_OPTIONS = [
    { name: 'Livret A / LDDS', where: 'Banque', risk: 'Aucun', note: 'Capital garanti, disponible à tout moment, intérêts nets d’impôt. Plafonnés.' },
    { name: 'Fonds euros (assurance-vie)', where: 'Assureur', risk: 'Très faible', note: 'Capital garanti par l’assureur, fiscalité avantageuse après 8 ans.' },
    { name: 'ETF monétaire (ex. XEON)', where: 'Compte-titres', risk: 'Très faible', note: 'Suit le taux au jour le jour de la BCE. Pas éligible au PEA.', symbol: 'XEON.DE' },
    { name: 'Épargne flexible Revolut', where: 'Revolut', risk: 'Très faible', note: 'Rémunération variable, retrait instantané. Vérifier la garantie applicable dans l’app.' },
  ];

  /* Grandes entreprises souvent citées pour leur qualité : point de départ du screener, pas une liste d'achat. */
  const UNIVERSE = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'BRK-B', 'V', 'MA', 'KO', 'PG', 'JNJ', 'COST', 'AXP', 'MCO', 'ADBE', 'TXN', 'PEP',
    'MC.PA', 'RMS.PA', 'OR.PA', 'AI.PA', 'SU.PA', 'DG.PA', 'EL.PA', 'TTE.PA', 'SAN.PA', 'ASML.AS', 'SAP.DE', 'NOVO-B.CO', 'NESN.SW', 'ITX.MC',
  ];

  const DEFAULT_WATCHLIST = ['DCAM.PA', 'ESE.PA', 'PAEEM.PA', 'PUST.PA', 'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'MC.PA', 'ASML.AS', 'AI.PA', 'BRK-B'];

  /* Places de l'Union européenne / EEE : actions en principe éligibles au PEA (à confirmer chez Boursobank). */
  const PEA_SUFFIXES = ['PA', 'AS', 'DE', 'F', 'MI', 'MC', 'BR', 'LS', 'CO', 'HE', 'ST', 'VI', 'IR', 'OL'];

  function suffix(symbol) {
    const m = /\.([A-Z]+)$/.exec(symbol || '');
    return m ? m[1] : '';
  }

  function isPeaEtf(symbol) { return PEA_ETFS.some((e) => e.symbol === symbol); }

  /* Où ce titre peut-il se loger ? (indication, chaque courtier a sa liste) */
  function peaStatus(symbol, kind) {
    if (isPeaEtf(symbol)) return 'oui';
    if (kind === 'etf') return 'à vérifier';
    return PEA_SUFFIXES.includes(suffix(symbol)) ? 'oui' : 'non';
  }

  const etfInfo = (symbol) => PEA_ETFS.find((e) => e.symbol === symbol);
  const account = (id) => ACCOUNTS.find((a) => a.id === id) || ACCOUNTS[3];
  const sleeve = (id) => SLEEVES.find((s) => s.id === id) || SLEEVES[1];

  root.Catalog = { ACCOUNTS, SLEEVES, PEA_ETFS, SAFE_OPTIONS, UNIVERSE, DEFAULT_WATCHLIST, peaStatus, isPeaEtf, etfInfo, account, sleeve };
})(window);
