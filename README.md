# Mes Investissements

Application locale pour suivre ton PEA Boursobank et ton compte Revolut, avec cours en direct, grille d'analyse « à la Buffett », stratégie cœur-satellite et plan mensuel relié à l'appli **Mon Budget**.

## Lancer

Double-clique sur **`Ouvrir-Investissements.bat`** : il démarre en arrière-plan Mes Investissements (http://localhost:5179) **et** Mon Budget (http://localhost:5178) s'ils ne tournent pas déjà, puis ouvre le navigateur. Les serveurs continuent de tourner jusqu'au redémarrage du PC ; pour les arrêter avant, double-clique sur **`Arreter-Investissements.bat`**.

**Démarrage automatique** : deux raccourcis dans le dossier de démarrage de Windows (`Win+R` → `shell:startup`) lancent les deux serveurs, sans fenêtre, à chaque ouverture de session : « Mes Investissements (serveur local) » et « Mon Budget (serveur local) ». Pour désactiver, supprime-les de ce dossier (ou désactive-les dans Gestionnaire des tâches → Applications de démarrage). Lancer un serveur déjà actif ne crée pas de doublon : la seconde instance s'arrête d'elle-même.

« Ce site est inaccessible » (ERR_CONNECTION_REFUSED) sur localhost:5179 = les serveurs ne tournent pas (après un redémarrage par exemple) : relance `Ouvrir-Investissements.bat`.

Prérequis : Python 3 (déjà installé). Aucune bibliothèque à installer.

## Les menus

| Menu | À quoi ça sert |
|---|---|
| Tableau de bord | Valeur totale, plus-values, variation du jour, évolution, poches vs cible, alertes de discipline |
| Portefeuille | Positions par compte (PEA, Revolut, Sécurité), ajout, import CSV |
| Marchés | Liste de suivi en direct + catalogue des ETF éligibles PEA et placements peu risqués |
| Screener Buffett | Passe ~30 grandes entreprises (et tes actions suivies) au crible de tes critères |
| Stratégie | Profil de risque, allocation Sécurité / Cœur / Satellite, composition du cœur, seuils Buffett |
| Plan mensuel | Combien investir ce mois et où, versement ponctuel (bonus), projection |
| Lien budget | Revenus, dépenses et épargne lus depuis Mon Budget |
| Réglages | Sauvegarde / restauration / remise à zéro |

Clique sur n'importe quel titre pour ouvrir sa fiche : graphique, informations, ta position et, pour une action, l'analyse complète (11 critères, valeur intrinsèque, prix d'achat maximal, historique financier).

## Revolut et Boursobank

Ni Revolut ni Boursobank n'ouvrent d'API aux particuliers pour leurs comptes-titres : la connexion automatique n'est pas possible. Deux options :

- **Saisie** : Portefeuille → « Ajouter une position » (recherche par nom, ticker ou ISIN).
- **Import** : Portefeuille → « Importer un relevé ».
  - Revolut (onglet « Fichier CSV ») : Investir → Documents → Actions → Relevé de compte → « Depuis le début » → CSV. L'appli rejoue achats, ventes et divisions pour retrouver quantités et PRU.
  - Boursobank (onglet « Coller un tableau ») : Boursobank ne propose pas d'export CSV des positions du PEA. Sur boursobank.com → ton PEA → Mes positions, sélectionne le tableau (titres des colonnes compris), copie-le et colle-le. Les ISIN sont convertis en tickers ; les titres reconnus seulement par leur nom sont signalés « à vérifier ».
  - Sinon : un CSV `symbole;quantite;pru` (modèle téléchargeable dans le dialogue).

## Données

- Cours, historiques, recherche et fondamentaux : Yahoo Finance (public, sans compte), via `server.py`. Cotations parfois différées de 15 min.
- Tes positions et réglages restent dans ton navigateur (localStorage). Pense à télécharger une sauvegarde dans Réglages.
- Lien budget : `budget-app/bridge.html` lit tes données budget localement et n'envoie un résumé qu'à cette appli (localhost:5179).

## Avertissement

Outil pédagogique d'aide à la décision : il applique les règles que tu choisis à des données publiques. Ce n'est pas un conseil en investissement personnalisé et aucun ordre n'est passé depuis l'application.

## Version en ligne (téléphone, proches)

Adresse : **https://mamzzz212.github.io/mes-investissements/** (comme fit-tracker, via GitHub Pages).

- **Aucun compte** : chacun ouvre le lien sur son téléphone. Les données (portefeuille, stratégie, documents) restent **dans le navigateur de l'appareil** ; rien n'est envoyé sur Internet.
- **Profils** : bouton du profil en bas de la barre latérale → créer, renommer, supprimer ou changer de profil (utile si plusieurs personnes partagent un appareil).
- **Documents** : relevés, PDF, images… rangés dans le navigateur pour le profil actif (10 Mo max par fichier). Les CSV s'importent en un clic.
- **Passer du PC au téléphone** : Réglages → « Télécharger une sauvegarde » sur un appareil, puis « Restaurer » sur l'autre.
- **Cours** : une tâche GitHub Actions (`.github/workflows/pages.yml`) les récupère toutes les ~20 min en semaine (une fois par jour le week-end), fondamentaux une fois par jour, puis republie le site. Seuls les titres de `market-symbols.json` (~100 ETF et actions) sont couverts en ligne : ajoute un symbole Yahoo Finance dans ce fichier pour le suivre. La version PC, elle, accède à tous les titres en direct.
- Lien budget : en ligne, il lit Mon Budget en ligne (https://mamzzz212.github.io/mon-budget/) sur le même appareil ; sur le PC, la version locale.

### Mettre à jour le site

Pousser sur la branche `main` republie le site en 1 à 2 minutes. Pour forcer une mise à jour des cours : onglet **Actions** du dépôt → « Publier le site » → **Run workflow**.
