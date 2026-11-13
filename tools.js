// Liste des outils affichés dans MAZATOOLS.
// Pour ajouter un outil : copiez son dossier dans tools/, puis ajoutez une entrée ici.
//
//   id          identifiant court, utilisé dans le lien direct (…/#id)
//   name        nom affiché
//   description une ligne qui dit à quoi sert l'outil
//   path        dossier de l'outil (doit contenir un index.html)
//   url         à la place de path : lien vers un site externe, ouvert dans un nouvel onglet
//               (rangé dans la partie « Liens » de la barre latérale)
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
    id: 'remove-ai-filter',
    name: 'REMOVE AI FILTER',
    description: 'Retirer les Content Credentials',
    path: 'tools/nettoyeur-video/',
    icon: '<path d="M21 21H8a2 2 0 0 1-1.42-.59l-3-3a2 2 0 0 1 0-2.82l10-10a2 2 0 0 1 2.83 0l4.59 4.58a2 2 0 0 1 0 2.83L13 21"/><path d="M8.5 10.5l5 5"/>',
  },
  {
    id: 'images-powerpoint',
    name: 'Images PowerPoint & PDF',
    description: "Récupérer les images d'une présentation ou d'un PDF",
    path: 'tools/images-powerpoint/',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  },
  {
    id: 'convertisseur-ableton',
    name: 'CONVERTISSEUR ABLETON',
    description: 'Convertir une vidéo en AVI pour Live 11',
    path: 'tools/convertisseur-ableton/',
    icon: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  },
  {
    id: 'netexplorer',
    name: 'NET EXPLORER',
    description: 'Envoyer des fichiers volumineux',
    url: 'https://mazarine.netexplorer.pro/transfers/sends',
    icon: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  },
  {
    id: 'cobalt',
    name: 'COBALT',
    description: 'Télécharger une vidéo YouTube ou Instagram',
    url: 'https://cobalt.tools/',
    icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  },
];
