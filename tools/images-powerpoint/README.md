# Images PowerPoint

Déposez une présentation PowerPoint (.pptx, .ppsx, .potx) pour voir toutes ses images en miniature, avec la ou les diapos où elles apparaissent, puis téléchargez celles que vous voulez dans leur qualité d'origine.

- Les images sont récupérées telles qu'elles sont rangées dans le fichier : aucune recompression, et une image recadrée dans PowerPoint est récupérée en entier.
- Une image seule se télécharge directement ; plusieurs images partent dans un .zip, nommées par diapo (`diapo-03_image5.png`).
- « Masquer les petites images » cache les icônes et logos de moins de 300 px.
- Fonctionne aussi avec les fichiers Word (.docx) et Excel (.xlsx).
- Tout se passe dans le navigateur. Bibliothèque utilisée : [JSZip](https://stuk.github.io/jszip/) (MIT), dans `vendor/`.
