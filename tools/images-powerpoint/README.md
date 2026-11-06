# Images PowerPoint & PDF

Déposez une présentation PowerPoint (.pptx, .ppsx, .potx) ou un PDF pour voir toutes ses images en miniature, avec la ou les diapos / pages où elles apparaissent, puis téléchargez celles que vous voulez dans leur qualité d'origine.

- **PowerPoint** : les images sont récupérées telles qu'elles sont rangées dans le fichier, sans recompression. Une image recadrée dans PowerPoint est récupérée en entier.
- **PDF** : les photos (JPEG, JPEG 2000) sont récupérées telles quelles ; les autres images sont reconstituées en PNG à leur définition d'origine, transparence comprise. Les PDF chiffrés et les scans noir et blanc (JBIG2, CCITT) ne sont pas pris en charge.
- Une barre de progression suit la lecture, l'analyse et l'extraction.
- Une image seule se télécharge directement ; plusieurs images partent dans un .zip, nommées par diapo ou par page (`diapo-03_image5.png`, `page-02_image-7.jpg`).
- « Masquer les petites images » cache les icônes et logos de moins de 300 px.
- Fonctionne aussi avec les fichiers Word (.docx) et Excel (.xlsx).
- Tout se passe dans le navigateur. Bibliothèques dans `vendor/` : [JSZip](https://stuk.github.io/jszip/) (MIT) et [pdf-lib](https://pdf-lib.js.org) (MIT), chargée seulement quand un PDF est déposé.
