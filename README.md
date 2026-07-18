# Maille — App de tricot 🧶

Application mobile-first pour gérer ton tricot : patrons, stock de laine et projets.
Tout fonctionne **en local dans le navigateur** — aucun compte, aucun serveur. Les
métadonnées sont dans `localStorage` et les fichiers (patrons PDF/PNG, photos) dans
IndexedDB.

## Démarrer

```bash
npm install
npm run dev      # serveur de dev sur http://localhost:5173
npm run build    # build de production dans dist/
npm run preview  # prévisualiser le build
```

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
