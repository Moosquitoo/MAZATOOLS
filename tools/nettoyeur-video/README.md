# REMOVE AI FILTER

Retire les **Content Credentials (C2PA)**, les métadonnées **Adobe XMP** et les autres métadonnées de fichier des vidéos MP4 / MOV / M4V et des images JPG / PNG.

- Aucun réencodage : l'image et le son sont copiés tels quels (qualité identique, pixels identiques, traitement instantané).
- 100 % local : le fichier est traité en JavaScript dans le navigateur, rien n'est envoyé sur un serveur.
- Un seul fichier (`index.html`), aucune dépendance, aucune étape de build.
- Le type réel du fichier est reconnu à ses premiers octets, pas à son extension.

## Ce qui est retiré

### Vidéos (MP4, MOV, M4V)

| Élément | Détail |
|---|---|
| Manifeste C2PA | boîte `uuid` C2PA (outil utilisé, mentions d'IA générative, historique d'édition) |
| XMP Adobe | boîte `uuid` XMP et `udta/XMP_` |
| Métadonnées | boîtes `udta`, `meta`, `free`, `skip`, `wide` |
| Dates | dates de création / modification (`mvhd`, `tkhd`, `mdhd`) |
| Encodeur | nom du gestionnaire (`hdlr`), nom du compresseur et code fabricant (`stsd`) |

Les offsets des échantillons (`stco` / `co64`) sont recalculés, et l'index (`moov`) est placé en début de fichier pour une lecture plus rapide en ligne.

### Images JPEG

| Élément | Détail |
|---|---|
| Manifeste C2PA | segments `APP11` (JUMBF) |
| EXIF et XMP | segments `APP1` (appareil, logiciel, dates, position GPS, miniature, XMP Adobe) |
| IPTC / Photoshop | segment `APP13` |
| Divers | commentaires (`COM`), autres segments `APPn`, miniature JFXX, données après la fin de l'image (photos animées…) |

Conservés : `APP0` JFIF, le profil de couleur (`APP2` ICC) et le segment `APP14` Adobe, nécessaires pour afficher les bonnes couleurs. Si la photo avait un sens de rotation EXIF, un EXIF minimal ne contenant que ce sens est réécrit, pour qu'elle ne s'affiche pas tournée.

### Images PNG

| Élément | Détail |
|---|---|
| Manifeste C2PA | bloc `caBX` |
| Textes | blocs `tEXt`, `zTXt`, `iTXt` (XMP Adobe, logiciel, prompts de génération Stable Diffusion / ComfyUI…) |
| EXIF et dates | blocs `eXIf` et `tIME` |
| Divers | tout autre bloc facultatif, données après la fin de l'image |

Conservés : les blocs nécessaires à l'affichage (image, palette, transparence, gamma, profil de couleur, HDR, animation APNG).

**Limites** : seules les métadonnées du fichier sont modifiées. Un filigrane invisible intégré dans les pixels eux-mêmes (comme SynthID de Google) n'est pas touché. Les MP4 fragmentés (streaming) ne sont pas pris en charge.
