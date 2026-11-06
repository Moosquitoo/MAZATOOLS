# Nettoyeur vidéo

Page web qui retire les **Content Credentials (C2PA)**, les métadonnées **Adobe XMP** et les autres métadonnées de fichier des vidéos MP4 / MOV / M4V.

- Aucun réencodage : l'image et le son sont copiés tels quels (qualité identique, traitement instantané).
- 100 % local : la vidéo est traitée en JavaScript dans le navigateur, rien n'est envoyé sur un serveur.
- Un seul fichier (`index.html`), aucune dépendance, aucune étape de build.

## Ce qui est retiré

| Élément | Détail |
|---|---|
| Manifeste C2PA | boîte `uuid` C2PA (outil utilisé, mentions d'IA générative, historique d'édition) |
| XMP Adobe | boîte `uuid` XMP et `udta/XMP_` |
| Métadonnées | boîtes `udta`, `meta`, `free`, `skip`, `wide` |
| Dates | dates de création / modification (`mvhd`, `tkhd`, `mdhd`) |
| Encodeur | nom du gestionnaire (`hdlr`), nom du compresseur et code fabricant (`stsd`) |

Les offsets des échantillons (`stco` / `co64`) sont recalculés, et l'index (`moov`) est placé en début de fichier pour une lecture plus rapide en ligne.

**Limites** : seules les métadonnées du fichier sont modifiées. Un filigrane invisible intégré dans l'image elle-même n'est pas touché. Les MP4 fragmentés (streaming) ne sont pas pris en charge.

## Mettre en ligne avec GitHub Pages

1. Créez un dépôt sur GitHub (par ex. `nettoyeur-video`) et ajoutez-y `index.html` et ce `README.md`.
2. Dans le dépôt : **Settings → Pages**.
3. Sous *Build and deployment*, choisissez **Deploy from a branch**, la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Après une minute environ, la page est disponible à l'adresse `https://<votre-nom>.github.io/nettoyeur-video/`.

En local, il suffit d'ouvrir `index.html` dans un navigateur.
