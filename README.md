# Maille — App de tricot 🧶

Application mobile-first pour gérer ton tricot : patrons, stock de laine et projets.
Les données sont **synchronisées via Supabase** (compte email + mot de passe), donc
accessibles depuis tous tes appareils. Les fichiers (patrons PDF/PNG, photos) sont
stockés dans Supabase Storage.

## Deux versions dans ce repo

On garde volontairement **deux versions** de l'app, côte à côte (dossiers, pas branches —
comme ça on peut voir et comparer les deux à tout moment) :

| Version | Emplacement | Techno | Données | URL déployée |
| --- | --- | --- | --- | --- |
| **Principale** (celle décrite ci-dessous) | racine du repo (`src/`, `index.html`) | React + Vite + Supabase | Synchro Supabase | `…/<repo>/` |
| **Organic** (design importé de Claude Design) | [`public/maille-organic/`](public/maille-organic/) | HTML + Preact/htm, sans build | `localStorage` du navigateur | `…/<repo>/maille-organic/` |

La version Organic est autonome et n'affecte pas la version principale ; voir son
[README dédié](public/maille-organic/README.md).

## Démarrer

```bash
npm install
npm run dev      # serveur de dev sur http://localhost:5173
npm run build    # build de production dans dist/
npm run preview  # prévisualiser le build
```

La config Supabase est dans `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
La clé `sb_publishable_...` est publique par conception : l'accès aux données est
protégé par les règles RLS de Postgres (chaque utilisateur ne voit que ses lignes).

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` compile l'app et la publie à chaque push.
Dans **Settings → Pages**, mets la source sur **GitHub Actions**. L'app sera servie à
`https://<user>.github.io/<repo>/` (routage par hash, chemins d'assets relatifs).

Pour que l'inscription fonctionne sans lien de confirmation par email, désactive
**Confirm email** dans **Supabase → Authentication → Sign In / Providers → Email**.

## Base de données

Tables (Postgres, RLS activé) : `patterns`, `yarns`, `projects`, `project_yarns`
(associations laine↔projet), `project_photos`. La réconciliation du stock se fait
côté serveur via les fonctions `set_allocation` / `remove_allocation` (atomiques).

## Les 5 zones

| Zone | Rôle |
| --- | --- |
| 🏠 **Accueil** | Carte résumé (projets terminés, pelotes / grammes / mètres utilisés) + accès rapide aux projets en cours |
| 📚 **Bibliothèque** | Répertorier les patrons (PDF ou image), classés par catégorie et auteur, associables aux projets |
| 🧶 **Yarn Stash** | Base de laines (marque, nom, m/pelote, g/pelote, grammes en stock, pelotes auto, blend, couleur, dye lot, photo) |
| 🧵 **Projets** | Projets actifs et terminés : patron, taille, gauge, aiguilles, dates, laines, notes, photos |
| 👤 **Profil** | Prénom, résumé et réinitialisation des données |

## Le lien laine ↔ projet

Chaque laine du stash a une quantité en grammes. Quand tu associes une laine à un
projet et indiques les grammes utilisés, cette quantité est **retirée du stash**.
Si tu réduis la quantité utilisée (par ex. de 1000 g à 800 g), les 200 g restants
**retournent automatiquement au stash**. Supprimer un projet ou une association
rend aussi les grammes réservés.

Une même laine de base (marque → composition) peut exister en plusieurs couleurs /
dye lots : utilise **Dupliquer (autre couleur)** depuis une fiche laine.

## Stack

React + TypeScript + Vite, Zustand (état + persistance), React Router. Stockage
fichiers via IndexedDB.
