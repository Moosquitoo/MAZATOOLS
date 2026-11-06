# MAZATOOLS

Mes petits outils, réunis sur un seul site avec une barre latérale. Chaque outil tourne entièrement dans le navigateur : aucun fichier n'est envoyé sur un serveur.

| Outil | À quoi il sert |
| --- | --- |
| [SHRINKSIZER](tools/shrinksizer/) | Réduire une vidéo à la taille voulue (en Mo), avec la meilleure qualité possible |
| [REMOVE AI FILTER](tools/nettoyeur-video/) | Retirer les Content Credentials (C2PA) et les métadonnées des MP4 / MOV |
| [Images PowerPoint & PDF](tools/images-powerpoint/) | Voir et télécharger les images d'une présentation ou d'un PDF dans leur qualité d'origine |

## Liens

- Site : `https://<pseudo>.github.io/` (ou `https://<pseudo>.github.io/<dépôt>/`)
- Lien direct vers un outil : ajoutez `#` et son identifiant, par exemple `…/#shrinksizer`
- Chaque outil reste utilisable seul : `…/tools/shrinksizer/`

Passer d'un outil à l'autre ne coupe pas un traitement en cours : chaque outil reste ouvert en arrière-plan.

## Mettre en ligne

Le dépôt doit être **public** pour que GitHub Pages soit gratuit.

1. Créez un dépôt public. Pour obtenir l'adresse la plus courte (`https://<pseudo>.github.io/`), nommez-le exactement `<pseudo>.github.io`.
2. Envoyez-y le contenu de ce dossier (`index.html` doit être à la racine du dépôt).
3. **Settings → Pages → Build and deployment** : *Deploy from a branch*, branche `main`, dossier `/ (root)`.

## Ajouter un outil

1. Copiez le dossier de l'outil dans `tools/` (il doit contenir un `index.html`), par exemple `tools/mon-outil/`.
2. Ajoutez une entrée dans [`tools.js`](tools.js) :
   ```js
   {
     id: 'mon-outil',
     name: 'Mon outil',
     description: "Ce que fait l'outil, en une ligne",
     path: 'tools/mon-outil/',
     icon: '<path d="M12 5v14M5 12h14"/>', // icône 24×24 au trait, par ex. copiée depuis lucide.dev
   },
   ```
3. Poussez sur GitHub. L'outil apparaît dans la barre et sur la page d'accueil.

Les outils doivent utiliser des chemins relatifs (`css/style.css`, pas `/css/style.css`) pour fonctionner depuis leur sous-dossier.

### Garder le même style

Toutes les pages partagent `shared/tokens.css` (couleurs claires et sombres, police) et `shared/theme.js` (thème clair / sombre). Pour qu'un nouvel outil suive le thème choisi dans le hub, ajoutez dans son `<head>` :

```html
<script src="../../shared/theme.js"></script>
<link rel="stylesheet" href="../../shared/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
```

puis utilisez les variables `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--border)`, `var(--accent)`… dans son CSS. REMOVE AI FILTER (`tools/nettoyeur-video/`) sert de modèle. Si l'outil a son propre bouton de thème avec la classe `theme`, il est masqué automatiquement dans le hub ; branchez-le sur `window.mazaTheme.toggle()`.

## Tester en local

```bash
python3 -m http.server 8080
# puis ouvrez http://localhost:8080
```

## Structure

```
index.html, hub.css, hub.js   le site : barre latérale et affichage des outils
tools.js                      la liste des outils (à modifier pour en ajouter)
shared/                       thème commun : couleurs, police, clair / sombre
tools/shrinksizer/            compresseur vidéo (voir son README)
tools/nettoyeur-video/        REMOVE AI FILTER : retrait des Content Credentials
tools/images-powerpoint/      extracteur d'images PowerPoint & PDF
```
