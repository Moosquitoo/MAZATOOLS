// MAZATOOLS : thème clair / sombre partagé entre le hub et les outils.
// À charger dans le <head> de chaque page (script classique, avant l'affichage)
// pour éviter un flash de la mauvaise couleur.
//
// - Le choix est gardé dans localStorage("theme") : "light", "dark", ou rien (= système).
// - Changer de thème dans le hub l'applique aussitôt à tous les outils ouverts.
// - Un outil ouvert dans le hub reçoit la classe "in-hub" sur <html> et masque son propre bouton.
(function () {
  var root = document.documentElement;
  var KEY = 'theme';

  function apply(theme) {
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
  }

  function current() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  try { apply(localStorage.getItem(KEY)); } catch (e) { /* stockage indisponible */ }

  var embedded;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (embedded) root.classList.add('in-hub');

  // Changement fait dans un autre onglet ou dans le hub
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(e.newValue); });
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.type === 'mazatools:theme') apply(e.data.theme);
  });

  window.mazaTheme = {
    current: current,
    apply: apply,
    /** Bascule clair / sombre, mémorise le choix et le transmet aux autres pages. */
    toggle: function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      var msg = { type: 'mazatools:theme', theme: next };
      var frames = document.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        try { frames[i].contentWindow.postMessage(msg, location.origin); } catch (e) { /* ignore */ }
      }
      if (embedded) { try { window.parent.postMessage(msg, location.origin); } catch (e) { /* ignore */ } }
      window.dispatchEvent(new CustomEvent('mazatools:theme', { detail: next }));
      return next;
    },
  };

  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.type === 'mazatools:theme') {
      window.dispatchEvent(new CustomEvent('mazatools:theme', { detail: e.data.theme }));
    }
  });
})();
