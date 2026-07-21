# Maille — version « Organic »

Version de l'app **importée depuis Claude Design** (projet _Knitting project tracker app_,
fichier `Maille.dc.html`, système de design **Organic**). Isolée sur sa propre branche
(`claude/maille-organic`) pour devenir la version principale du projet.

> Historique : à l'origine cette version vivait sous `public/maille-organic/` dans le
> même dépôt que l'app React (branche `claude/maille`), copiée telle quelle dans le
> build par Vite. Elle a été déplacée à la racine de sa propre branche pour être
> déployée et développée indépendamment.

## Ce que c'est

Une reprise fidèle du prototype, en application autonome :

- **Sans build** : HTML + CSS + des modules JS. Rien à compiler.
- **Multi-utilisateurs, avec compte** : auth par email/mot de passe (Supabase Auth).
  Chaque utilisateur a ses propres laines, patrons et projets — isolés par des
  règles RLS Postgres (personne ne peut lire les données d'un autre).
- **Backend dédié** : un projet Supabase séparé de l'app React principale
  (`maille-organic`, pas `maille-knitting`), pour ne pas mélanger les deux
  modèles de données.
- **Autonome** : [Preact](https://preactjs.com/), [htm](https://github.com/developit/htm)
  et `@supabase/supabase-js` (bundlé nous-mêmes avec esbuild, les CDN publics
  étant bloqués dans certains environnements) sont embarqués dans `vendor/`.

Zones : Accueil · Bibliothèque · Yarn Stash · Projets (+ détail) · Profil — avec le même
lien laine ↔ projet que la version principale (les grammes utilisés sont déduits du stash,
calculés à la volée à partir des allocations, jamais stockés en double).

## Backend Supabase

Projet dédié **`maille-organic`** (org `louismistral's Org`, région `eu-west-3`).

- **Tables** : `yarns`, `colorways` (coloris/dye lots d'une laine), `patterns`,
  `projects`, `project_allocations` (laine ↔ projet), `project_photos`. Chaque
  table a une colonne `user_id` et une policy RLS `user_id = auth.uid()`.
- **Storage** : buckets privés `patterns` et `photos`, fichiers rangés sous
  `<user_id>/...` ; policies RLS sur `storage.objects` limitées à ce dossier.
  L'app affiche les fichiers via des URLs signées (1h, régénérées au besoin).
- **Auth** : email + mot de passe. Par défaut, Supabase exige une confirmation
  par email avant la première connexion. Pour un flux sans friction (comme
  l'app principale), désactive **Confirm email** dans
  **Supabase → Authentication → Sign In / Providers → Email** du projet
  `maille-organic`.
- La clé publique dans `supabaseClient.js` (`sb_publishable_...`) est sans
  danger à exposer : elle ne donne accès à rien sans passer par les policies RLS.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Point d'entrée |
| `styles.css` | Tokens et composants du design system Organic (importés tels quels) + extras du prototype + responsive mobile |
| `app.js` | Logique + rendu (portage du `Maille.dc.html`, template `{{ }}`/`sc-for`/`sc-if` réécrit en htm) + auth et CRUD Supabase |
| `supabaseClient.js` | Client Supabase (URL + clé publique du projet `maille-organic`) |
| `vendor/` | Preact, htm et `@supabase/supabase-js` embarqués |

## Lancer

C'est du statique : ouvre `index.html` via n'importe quel serveur local, p. ex.

```bash
python3 -m http.server 8000   # puis http://localhost:8000/
```

## Déploiement

Pas de build : le workflow `.github/workflows/deploy.yml` de cette branche publie les
fichiers tels quels sur GitHub Pages à chaque push. Tant que `claude/maille-organic`
n'est pas la branche par défaut du dépôt, la version reste accessible via son propre
lien de prévisualisation ; une fois passée en branche par défaut, elle sera servie à
`https://<user>.github.io/<repo>/`.
