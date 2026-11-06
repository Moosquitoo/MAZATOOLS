// Liste des outils affichés dans MAZATOOLS.
// Pour ajouter un outil : copiez son dossier dans tools/, puis ajoutez une entrée ici.
//
//   id          identifiant court, utilisé dans le lien direct (…/#id)
//   name        nom affiché
//   description une ligne qui dit à quoi sert l'outil
//   path        dossier de l'outil (doit contenir un index.html)
//   icon        tracés SVG d'une icône 24×24 au trait (style Lucide : https://lucide.dev)

export const SITE = {
  name: 'MAZATOOLS',
};

export const TOOLS = [
  {
    id: 'shrinksizer',
    name: 'SHRINKSIZER',
    description: "Réduire le poids d'une vidéo",
    path: 'tools/shrinksizer/',
    icon: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
  },
  {
    id: 'nettoyeur-video',
    name: 'Nettoyeur vidéo',
    description: 'Retirer les Content Credentials',
    path: 'tools/nettoyeur-video/',
    icon: '<path d="M21 21H8a2 2 0 0 1-1.42-.59l-3-3a2 2 0 0 1 0-2.82l10-10a2 2 0 0 1 2.83 0l4.59 4.58a2 2 0 0 1 0 2.83L13 21"/><path d="M8.5 10.5l5 5"/>',
  },
];
