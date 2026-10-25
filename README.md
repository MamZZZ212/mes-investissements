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

Adresse : **https://mamzzz212.github.io/mes-investissements/**

- Hébergement de l'interface : GitHub Pages (code public, aucune donnée personnelle dedans).
- Comptes, portefeuilles et documents : Supabase (projet `mes-investissements`, région Europe). Chaque profil ne voit que ses propres données (Row Level Security, voir `supabase/schema.sql`).
- Cours de bourse : fonction Supabase `market` (`supabase/functions/market/index.ts`), réservée aux profils connectés.
- **Inscription sur invitation** : le premier compte créé est administrateur. Menu **Administration** → « Créer une invitation » → le lien est copié, envoie-le. Chaque code ne sert qu'une fois.
- **Documents** : coffre privé par profil (10 Mo max par fichier). Les CSV peuvent être importés dans le portefeuille en un clic.
- Le lien avec Mon Budget ne fonctionne que depuis ton PC (là où Mon Budget tourne). Sur téléphone, saisis le montant mensuel dans Plan mensuel.
- Mot de passe oublié : la récupération par e-mail n'est pas configurée (le service e-mail gratuit de Supabase est limité). L'administrateur peut réinitialiser un compte depuis la console Supabase → Authentication → Users.

La version locale (`Ouvrir-Investissements.bat`, http://localhost:5179) continue de fonctionner hors ligne, sans compte, avec les données du navigateur du PC.

### Mise à jour du site en ligne

Toute modification poussée sur la branche `main` du dépôt GitHub est publiée automatiquement par GitHub Pages en une minute environ. Après une modification de `supabase/functions/market`, redéployer :

```bash
npx supabase functions deploy market --project-ref <référence du projet>
```
