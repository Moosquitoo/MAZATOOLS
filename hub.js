import { SITE, TOOLS } from './tools.js';

const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;
const stage = $('#stage');
const home = $('#home');
const sidebar = $('#sidebar');
const scrim = $('.scrim');
const menuBtn = $('.menu-btn');
const openAlone = $('#open-alone');
const frames = new Map(); // un iframe par outil, gardé ouvert pour ne pas couper un traitement en cours
const APPS = TOOLS.filter((t) => !t.url);   // outils affichés dans le hub
const LINKS = TOOLS.filter((t) => t.url);   // sites externes, ouverts dans un nouvel onglet
const EXT_ICON = '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

/* ---------- Construction des listes ---------- */

function icon(tool) {
  const box = document.createElement('span');
  box.className = 'tool-icon';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<svg viewBox="0 0 24 24">${tool.icon ?? '<rect x="4" y="4" width="16" height="16" rx="3"/>'}</svg>`;
  return box;
}

function toolLink(tool, cls) {
  const a = document.createElement('a');
  a.className = cls;
  a.dataset.id = tool.id;
  if (tool.url) {
    a.href = tool.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.classList.add('external');
  } else {
    a.href = `#${tool.id}`;
  }
  const text = document.createElement('span');
  text.className = 'tool-text';
  text.append(
    Object.assign(document.createElement('span'), { className: 'tool-name', textContent: tool.name }),
    Object.assign(document.createElement('span'), { className: 'tool-desc', textContent: tool.description }),
  );
  a.append(icon(tool), text);
  if (tool.url) {
    a.insertAdjacentHTML('beforeend', EXT_ICON);
    a.append(Object.assign(document.createElement('span'), { className: 'sr', textContent: ' (nouvel onglet)' }));
  }
  return a;
}

function build() {
  $('.brand-name').textContent = SITE.name;
  const fill = (list, items, cls) => {
    for (const tool of items) {
      const li = document.createElement('li');
      li.append(toolLink(tool, cls));
      list.append(li);
    }
  };
  fill($('#tool-list'), APPS, 'tool-link');
  fill($('#home-list'), APPS, 'home-link');
  fill($('#link-list'), LINKS, 'tool-link');
  fill($('#home-links'), LINKS, 'home-link');
  for (const el of document.querySelectorAll('.links-group')) el.hidden = LINKS.length === 0;
  linkSource();
}

/** Sur GitHub Pages, « Code source » pointe vers le dépôt du site. */
function linkSource() {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  if (!m) return;
  const repo = location.pathname.split('/').filter(Boolean)[0];
  $('#source-link').href = `https://github.com/${m[1]}/${repo ?? `${m[1]}.github.io`}`;
}

/* ---------- Thème ---------- */

function renderTheme() {
  const dark = window.mazaTheme.current() === 'dark';
  root.classList.toggle('is-dark', dark);
  const label = dark ? 'Mode clair' : 'Mode sombre';
  $('.theme-label').textContent = label;
  for (const b of document.querySelectorAll('.theme-btn')) b.setAttribute('aria-label', `Passer en ${label.toLowerCase()}`);
}

for (const b of document.querySelectorAll('.theme-btn')) {
  b.addEventListener('click', () => { window.mazaTheme.toggle(); renderTheme(); });
}
window.addEventListener('mazatools:theme', renderTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTheme);

/* ---------- Navigation ---------- */

function frameFor(tool) {
  let frame = frames.get(tool.id);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.className = 'tool-frame';
    frame.title = tool.name;
    frame.src = tool.path;
    frame.allow = 'clipboard-read; clipboard-write; fullscreen; autoplay';
    stage.append(frame);
    frames.set(tool.id, frame);
  }
  return frame;
}

function show() {
  const id = decodeURIComponent(location.hash.slice(1));
  const tool = APPS.find((t) => t.id === id);

  home.hidden = Boolean(tool);
  for (const [fid, frame] of frames) frame.hidden = !tool || fid !== tool.id;
  if (tool) frameFor(tool).hidden = false;

  for (const a of document.querySelectorAll('.tool-link:not(.external)')) {
    if (tool && a.dataset.id === tool.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  document.title = tool ? `${tool.name} – ${SITE.name}` : SITE.name;
  $('.topbar-title').textContent = tool ? tool.name : SITE.name;
  openAlone.hidden = !tool;
  if (tool) openAlone.href = tool.path;
  closeMenu();
}

/* ---------- Menu mobile ---------- */

function openMenu() {
  sidebar.classList.add('open');
  scrim.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
  sidebar.querySelector('[aria-current="page"], .tool-link')?.focus();
}
function closeMenu() {
  if (!sidebar.classList.contains('open')) return;
  sidebar.classList.remove('open');
  scrim.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}

menuBtn.addEventListener('click', () => (sidebar.classList.contains('open') ? closeMenu() : openMenu()));
scrim.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

build();
renderTheme();
window.addEventListener('hashchange', show);
show();
