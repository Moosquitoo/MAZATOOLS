# CONVERTISSEUR ABLETON

Convertit des vidéos MP4, MOV et M4V en AVI H.264 avec son PCM 16 bits et cadence constante, un format qu'Ableton Live 11 lit sous Windows sans codec supplémentaire.

- Résolution maximale (originale, 1080p, 720p, 480p) et qualité (légère, standard, haute) réglables. Les vidéos ne sont jamais agrandies, et jamais plus grandes que 1920×1080, portrait compris : au-delà, le décodeur de Windows (et donc Live 11) n'affiche pas l'image.
- Le flux H.264 est marqué « Constrained Baseline », le profil attendu par le décodeur de Windows.
- Plusieurs fichiers à la suite ; chaque AVI se télécharge automatiquement à la fin de sa conversion.
- Le son est conservé et calé sur l'image ; au-delà de 2 canaux, il est réduit en stéréo.
- Limite de 2 Go par fichier (format AVI 1.0).
- Tout se passe dans le navigateur (Chrome ou Edge récent conseillé), grâce à WebCodecs et à [mp4box.js](https://github.com/gpac/mp4box.js) (BSD-3-Clause), rangé dans `vendor/`.
