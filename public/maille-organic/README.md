# Maille — version « Organic »

Deuxième version de l'app, **importée depuis Claude Design** (projet _Knitting project
tracker app_, fichier `Maille.dc.html`, système de design **Organic**). Elle coexiste
avec la version React + Supabase à la racine du repo — les deux sont gardées volontairement.

## Ce que c'est

Une reprise fidèle du prototype, en application autonome :

- **Sans build** : HTML + CSS + un module JS. Rien à compiler.
- **Sans backend** : les données vivent dans le `localStorage` du navigateur
  (clé `maille_v1`). Aucune dépendance à Supabase.
- **Autonome** : [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm)
  sont embarqués dans `vendor/` (aucun CDN au chargement).

Zones : Accueil · Bibliothèque · Yarn Stash · Projets (+ détail) · Profil — avec le même
lien laine ↔ projet que la version principale (les grammes utilisés sont déduits du stash).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Point d'entrée |
| `styles.css` | Tokens et composants du design system Organic (importés tels quels) + extras du prototype |
| `app.js` | Logique + rendu (portage du `Maille.dc.html` : logique inchangée, template `{{ }}`/`sc-for`/`sc-if` réécrit en htm) |
| `vendor/` | Preact + htm embarqués |

## Lancer

C'est du statique : ouvre `index.html` via n'importe quel serveur local, p. ex.

```bash
python3 -m http.server 8000   # puis http://localhost:8000/public/maille-organic/
```

## Déploiement

Le dossier est sous `public/`, donc Vite le recopie tel quel dans `dist/` lors du build
de l'app principale. Une fois déployé sur GitHub Pages, cette version est servie à
`https://<user>.github.io/<repo>/maille-organic/`, à côté de la version principale.
