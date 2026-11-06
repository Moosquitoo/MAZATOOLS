import { probe, compress, detectEncoders, CODEC_LABELS } from './engine.js';
import { planForTarget, formatBytes, formatDuration, MB } from './planner.js';

const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  input: $('#file-input'),
  drop: $('#drop'),
  items: $('#items'),
  template: $('#item-template'),
  toolbar: $('#toolbar'),
  count: $('#count'),
  runAll: $('#run-all'),
  clearDone: $('#clear-done'),
  target: $('#target-mb'),
  range: $('#target-range'),
  slider: $('.slider'),
  bubble: $('#bubble'),
  codec: $('#codec'),
  codecNote: $('#codec-note'),
  mirror: $('#target-mirror'),
  res: $('#res'),
  resField: $('.res-field'),
  resHint: $('#res-hint'),
  pxField: $('#px-field'),
  customWidth: $('#custom-width'),
  notice: $('#support-notice'),
};

const items = [];
let encoders = { avc: false, hevc: false, av1: false };
let running = false;

/* ---------------- Taille visée : champ + curseur ---------------- */

const STORAGE_KEY = 'shrinksizer:settings';
const DEFAULT_MAX_MB = 500;

/** Bornes du curseur : de 1 Mo (ou moins pour un petit fichier) jusqu'au plus gros fichier déposé. */
function rangeBounds() {
  const largest = Math.max(0, ...items.map((i) => i.file.size)) / MB;
  const max = largest > 0 ? Math.max(0.5, Math.ceil(largest * 10) / 10) : DEFAULT_MAX_MB;
  const min = Math.min(1, max / 20);
  return { min, max };
}

/** Arrondi lisible selon l'ordre de grandeur. */
function roundMB(v) {
  if (v < 10) return Math.round(v * 10) / 10;
  if (v < 100) return Math.round(v);
  return Math.round(v / 5) * 5;
}

// Échelle logarithmique : autant de précision entre 1 et 10 Mo qu'entre 100 et 1000 Mo.
function posToMB(pos) {
  const { min, max } = rangeBounds();
  return roundMB(Math.exp(Math.log(min) + (pos / 1000) * (Math.log(max) - Math.log(min))));
}
function mbToPos(mb) {
  const { min, max } = rangeBounds();
  const clamped = Math.min(max, Math.max(min, mb));
  return Math.round(((Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000);
}

function targetMB() {
  return Math.max(0.1, parseFloat(String(els.target.value).replace(',', '.')) || 25);
}

const fmtMB = (mb) => `${mb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

function syncSlider() {
  const mb = targetMB();
  els.range.value = String(mbToPos(mb));
  paintSlider(mb);
}

function paintSlider(mb) {
  const ratio = +els.range.value / 1000;
  els.slider.style.setProperty('--pct', `${ratio * 100}%`);
  els.slider.style.setProperty('--ratio', String(ratio));
  els.bubble.textContent = fmtMB(mb);
  els.range.setAttribute('aria-valuetext', fmtMB(mb));
  els.mirror.textContent = String(els.target.value || '0');
}

function onRangeInput() {
  const mb = posToMB(+els.range.value);
  els.target.value = String(mb);
  paintSlider(mb);
  onSettingsChange();
}

function onNumberInput() {
  syncSlider();
  onSettingsChange();
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ targetMB: targetMB(), codec: els.codec.value, res: els.res.value, customWidth: customWidth() }));
  } catch { /* ignore */ }
}

function restoreSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s?.targetMB) els.target.value = s.targetMB;
    if (s?.codec) els.codec.value = s.codec;
    if (s?.res && [...els.res.options].some((o) => o.value === s.res)) els.res.value = s.res;
    if (s?.customWidth) els.customWidth.value = s.customWidth;
  } catch { /* ignore */ }
}

const customWidth = () => Math.max(64, Math.round((parseInt(els.customWidth.value, 10) || 1280) / 2) * 2);

function readSettings() {
  return { mode: 'target', targetMB: targetMB(), codec: els.codec.value, res: els.res.value, customWidth: customWidth(), removeAudio: false, maxWidth: Infinity };
}

/** Largeur verrouillée pour une vidéo donnée (null = automatique). */
function lockWidthFor(info, s) {
  if (!info || s.res === 'auto') return null;
  if (s.res === 'original') return info.width;
  if (s.res === 'custom') return Math.min(info.width, s.customWidth);
  const shortSide = Math.min(info.width, info.height);
  return Math.round((info.width * Math.min(1, +s.res / shortSide)) / 2) * 2;
}

function settingsFor(item) {
  const s = readSettings();
  return { ...s, lockWidth: lockWidthFor(item.info, s) };
}

/** Empreinte des réglages, pour proposer « Recompresser » seulement s'ils ont changé. */
const settingsKey = (s) => [s.targetMB, s.codec, s.res, s.res === 'custom' ? s.customWidth : ''].join('|');

function updateResUi() {
  const locked = els.res.value !== 'auto';
  els.resField.classList.toggle('locked', locked);
  els.pxField.hidden = els.res.value !== 'custom';
  els.resHint.textContent = locked
    ? "Résolution verrouillée : si la taille visée est petite, l'image sera plus compressée."
    : 'La résolution est réduite seulement si la taille visée ne permet pas de garder une image nette.';
}

function effectiveCodec(wanted, item) {
  if (item.info?.engine === 'ffmpeg') return 'avc';
  return encoders[wanted] ? wanted : 'avc';
}

function onSettingsChange() {
  updateCodecNote();
  updateResUi();
  saveSettings();
  items.forEach((item) => { if (item.status !== 'encoding') renderItem(item); });
}

function updateCodecNote() {
  const wanted = els.codec.value;
  const notes = {
    hevc: 'H.265 donne des fichiers plus légers, mais certains appareils et sites ne le lisent pas.',
    av1: 'AV1 donne les fichiers les plus légers ; les appareils anciens ne le lisent pas toujours.',
  };
  els.codecNote.textContent = wanted !== 'avc' && !encoders[wanted]
    ? `Votre navigateur ne sait pas encoder en ${CODEC_LABELS[wanted]} : les vidéos seront produites en H.264.`
    : notes[wanted] ?? '';
}

/* ---------------- File d'attente ---------------- */

let nextId = 1;

function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('video/') || /\.(mkv|avi|mov|mpe?g|wmv|flv|3gp|ts|m2ts|mts|webm|mp4|m4v)$/i.test(f.name));
  if (!files.length) return;
  for (const file of files) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const item = { id: nextId++, file, node, status: 'probing', info: null, result: null, error: null, controller: null };
    items.push(item);
    els.items.append(node);
    wireItem(item);
    probeItem(item);
  }
  // Si la cible dépasse déjà tous les fichiers, on propose la moitié du plus gros.
  const largestMB = Math.max(...items.map((i) => i.file.size)) / MB;
  if (targetMB() >= largestMB) els.target.value = String(roundMB(Math.max(0.1, largestMB / 2)));
  syncSlider();
  onSettingsChange();
}

async function probeItem(item) {
  renderItem(item);
  try {
    item.info = await probe(item.file, (x) => { item.engineLoading = x; renderItem(item); });
    item.status = 'ready';
  } catch (err) {
    console.error(err);
    item.status = 'error';
    item.error = 'Impossible de lire cette vidéo. Le fichier est peut-être abîmé ou dans un format inconnu.';
  }
  item.engineLoading = null;
  renderItem(item);
}

function removeItem(item) {
  item.controller?.abort();
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
  item.node.remove();
  items.splice(items.indexOf(item), 1);
  syncSlider();
  updateToolbar();
}

function wireItem(item) {
  const n = item.node;
  $('.remove', n).addEventListener('click', () => removeItem(item));
  $('.compress', n).addEventListener('click', () => runItem(item));
  $('.redo', n).addEventListener('click', () => runItem(item));
  $('.cancel', n).addEventListener('click', () => item.controller?.abort());
  $('.compare', n).addEventListener('click', () => toggleCompare(item));
}

const underTarget = (item) => item.file.size <= targetMB() * MB;

/* ---------------- Rendu d'un fichier ---------------- */

const chip = (text, cls = '') => Object.assign(document.createElement('span'), { className: `chip ${cls}`.trim(), textContent: text });
const span = (text) => Object.assign(document.createElement('span'), { textContent: text });

function setStatus(n, text, kind) {
  const s = $('.status', n);
  s.textContent = text;
  s.className = `status ${kind}`;
}

function renderItem(item) {
  const n = item.node;
  const target = targetMB();
  const done = item.status === 'done';
  const busy = item.status === 'encoding';
  n.dataset.status = item.status;
  n.classList.toggle('over', Boolean(item.result?.overTarget));

  $('.name', n).textContent = item.file.name;

  // Statut
  if (item.status === 'probing') setStatus(n, item.engineLoading != null ? `Chargement ${Math.round(item.engineLoading * 100)} %` : 'Lecture…', 'work');
  else if (item.status === 'ready') setStatus(n, underTarget(item) ? 'Déjà sous la cible' : 'Prêt', underTarget(item) ? 'warn' : 'work');
  else if (busy) setStatus(n, 'Compression…', 'work');
  else if (done) setStatus(n, item.result.overTarget ? 'Au-dessus de la cible' : `−${Math.max(0, Math.round((1 - item.result.blob.size / item.file.size) * 100))} %`, item.result.overTarget ? 'warn' : 'ok');
  else setStatus(n, 'Erreur', 'err');

  // Infos source
  const parts = [formatBytes(item.file.size)];
  if (item.info) {
    parts.push(`${item.info.width}×${item.info.height}`, formatDuration(item.info.duration), `${Math.round(item.info.fps)} i/s`);
    if (!item.info.hasAudio) parts.push('sans son');
  }
  $('.sizes', n).replaceChildren(...parts.map(span));

  // Jauge
  const original = item.file.size;
  const fill = $('.gauge-fill', n);
  const marker = $('.gauge-target', n);
  fill.style.width = done ? `${Math.min(100, (item.result.blob.size / original) * 100)}%` : '0%';
  const markerMB = done ? item.result.targetMB : target;
  marker.hidden = markerMB * MB >= original;
  if (!marker.hidden) {
    const pct = ((markerMB * MB) / original) * 100;
    marker.style.left = `${pct}%`;
    marker.classList.toggle('edge-left', pct < 12);
    marker.classList.toggle('edge-right', pct > 88);
    $('span', marker).textContent = `Cible ${fmtMB(markerMB)}`;
  }

  // Réglages prévus / utilisés
  item.blocked = false;
  const chips = $('.chips', n);
  if (done) chips.replaceChildren(...planChips(item.result.plan, item));
  else if (busy && item.livePlan) chips.replaceChildren(...planChips(item.livePlan, item));
  else if (item.status === 'ready' && !underTarget(item)) chips.replaceChildren(...previewChips(item, target));
  else chips.replaceChildren();

  // Note
  const note = $('.note', n);
  if (item.status === 'error') note.textContent = item.error;
  else if (item.status === 'ready' && underTarget(item)) note.textContent = 'Ce fichier pèse déjà moins que la taille visée. Baissez la cible pour l\'alléger.';
  else if (!done) note.textContent = '';

  // Boutons
  const compressBtn = $('.compress', n);
  compressBtn.hidden = done || busy || item.status === 'error';
  compressBtn.disabled = item.status !== 'ready' || underTarget(item) || running || item.blocked;
  $('.cancel', n).hidden = !busy;
  $('.remove', n).hidden = busy;
  $('.download', n).hidden = !done;
  $('.compare', n).hidden = !done;
  $('.redo', n).hidden = !done || running || underTarget(item) || settingsKey(readSettings()) === item.result?.key;
  $('.item-progress', n).hidden = !busy;

  updateToolbar();
}

function planChips(plan, item) {
  const size = chip(`${plan.width}×${plan.height}`);
  if (plan.locked) {
    size.classList.add('locked');
    size.insertAdjacentHTML('afterbegin', '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-label="verrouillée"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>');
  }
  const out = [size];
  if (plan.reducedFps) out.push(chip(`${plan.fps} i/s`));
  out.push(chip(CODEC_LABELS[plan.codec] ?? 'H.264'));
  if (plan.videoBps) out.push(chip(`${(plan.videoBps / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mb/s`));
  if (item.info?.engine === 'ffmpeg') out.push(chip('lecteur universel'));
  return out;
}

function previewChips(item, target) {
  const codec = effectiveCodec(els.codec.value, item);
  const plan = planForTarget({
    targetBytes: target * MB,
    duration: item.info.duration,
    srcW: item.info.width,
    srcH: item.info.height,
    fps: item.info.fps,
    hasAudio: item.info.hasAudio,
    codec,
    lockWidth: lockWidthFor(item.info, readSettings()),
  });
  if (!plan.ok) {
    item.blocked = true;
    const min = Math.ceil((plan.minBytes / MB) * 10) / 10;
    return [chip(`Trop petit pour ${formatDuration(item.info.duration)} de vidéo : visez au moins ${fmtMB(min)}`, 'quiet')];
  }
  return [...planChips({ ...plan, codec }, item), chip(`qualité ${plan.quality}`, 'quiet')];
}

function updateToolbar() {
  els.toolbar.hidden = items.length === 0;
  const pending = items.filter((i) => i.status === 'ready' && !underTarget(i) && !i.blocked);
  const done = items.filter((i) => i.status === 'done').length;
  els.count.textContent = `${items.length} vidéo${items.length > 1 ? 's' : ''}${done ? `, ${done} terminée${done > 1 ? 's' : ''}` : ''}`;
  els.runAll.disabled = running || pending.length === 0;
  els.runAll.textContent = running ? 'Compression…' : 'Tout compresser';
  els.clearDone.hidden = done === 0;
}

/* ---------------- Compression ---------------- */

async function runItem(item) {
  if (running || !item.info) return;
  running = true;
  items.forEach(renderItem);
  try { await compressItem(item); } finally { running = false; items.forEach(renderItem); }
}

async function runAll() {
  if (running) return;
  running = true;
  items.forEach(renderItem);
  try {
    for (const item of items.slice()) {
      if (items.includes(item) && item.status === 'ready' && !underTarget(item) && !item.blocked) await compressItem(item);
    }
  } finally { running = false; items.forEach(renderItem); }
}

async function compressItem(item) {
  const settings = settingsFor(item);
  item.controller = new AbortController();
  item.status = 'encoding';
  item.livePlan = null;
  item.result = null;
  if (item.resultUrl) { URL.revokeObjectURL(item.resultUrl); item.resultUrl = null; }
  closeCompare(item);
  renderItem(item);

  const n = item.node;
  const bar = $('.item-progress .bar div', n);
  const progressEl = $('.item-progress', n);
  const text = $('.progress-text', n);
  bar.style.width = '0%';
  text.textContent = 'Préparation…';
  const started = performance.now();
  let passStarted = started;
  let lastPass = 0;

  const report = (e) => {
    if (e.phase === 'loading-engine') {
      bar.style.width = `${Math.round(e.progress * 100)}%`;
      text.textContent = `Chargement du lecteur universel (une seule fois) : ${Math.round(e.progress * 100)} %`;
      return;
    }
    if (e.phase === 'adjusting') {
      text.textContent = e.size > e.targetBytes
        ? `${formatBytes(e.size)}, un peu au-dessus de la cible : nouvelle passe plus légère…`
        : `${formatBytes(e.size)}, il reste de la marge : nouvelle passe avec plus de qualité…`;
      return;
    }
    if (e.attempt !== lastPass) { lastPass = e.attempt; passStarted = performance.now(); }
    if (e.plan && e.plan !== item.livePlan) { item.livePlan = e.plan; $('.chips', n).replaceChildren(...planChips(e.plan, item)); }
    const pct = Math.round(e.progress * 100);
    bar.style.width = `${pct}%`;
    progressEl.setAttribute('aria-valuenow', String(pct));
    const elapsed = (performance.now() - passStarted) / 1000;
    let eta = '';
    if (e.progress > 0.04 && elapsed > 2) {
      const remaining = (elapsed / e.progress) * (1 - e.progress);
      eta = remaining < 60 ? `, environ ${Math.max(1, Math.round(remaining))} s restantes` : `, environ ${Math.round(remaining / 60)} min restantes`;
    }
    text.textContent = `${e.attempt > 1 ? `Passe ${e.attempt} : ` : ''}${pct} %${eta}`;
  };

  try {
    const result = await compress(item.file, item.info, settings, report, item.controller.signal);
    item.result = { ...result, targetMB: settings.targetMB, key: settingsKey(settings), seconds: (performance.now() - started) / 1000 };
    item.status = 'done';
    item.resultUrl = URL.createObjectURL(result.blob);
    showResult(item);
  } catch (err) {
    if (err.name === 'CanceledError' || item.controller.signal.aborted) {
      item.status = 'ready';
    } else {
      console.error(err);
      item.status = 'error';
      item.error = err.minBytes ? err.message : `La compression a échoué : ${err.message || err}. Essayez le format H.264.`;
    }
  } finally {
    item.controller = null;
    item.livePlan = null;
    renderItem(item);
  }
}

function showResult(item) {
  const n = item.node;
  const { blob, overTarget, targetMB: target } = item.result;
  const dl = $('.download', n);
  dl.href = item.resultUrl;
  dl.download = `${item.file.name.replace(/\.[^.]+$/, '')}-shrink.mp4`;
  dl.textContent = `Télécharger (${formatBytes(blob.size)})`;

  const note = $('.note', n);
  const strong = Object.assign(document.createElement('strong'), { textContent: `${formatBytes(item.file.size)} → ${formatBytes(blob.size)}` });
  note.replaceChildren(strong, document.createTextNode(` en ${formatDuration(item.result.seconds)}.`));
  if (overTarget) {
    note.append(document.createTextNode(' '), Object.assign(document.createElement('span'), {
      className: 'warn',
      textContent: item.result.plan?.locked
        ? `Impossible de descendre sous ${fmtMB(target)} en ${item.result.plan.width}×${item.result.plan.height} : visez plus haut ou baissez la résolution.`
        : `Impossible de descendre sous ${fmtMB(target)} pour cette vidéo : visez un peu plus haut.`,
    }));
  }
}

/* ---------------- Comparaison avant / après ---------------- */

function closeCompare(item) {
  const n = item.node;
  const panel = $('.compare-panel', n);
  if (panel.hidden) return;
  panel.hidden = true;
  $('.compare', n).setAttribute('aria-expanded', 'false');
  $('.compare', n).textContent = 'Comparer';
  for (const v of panel.querySelectorAll('video')) { v.pause(); v.removeAttribute('src'); v.load(); }
}

function toggleCompare(item) {
  const n = item.node;
  const panel = $('.compare-panel', n);
  if (!panel.hidden) { closeCompare(item); return; }

  panel.hidden = false;
  $('.compare', n).setAttribute('aria-expanded', 'true');
  $('.compare', n).textContent = 'Fermer la comparaison';

  const before = $('.v-before', panel);
  const after = $('.v-after', panel);
  const stage = $('.compare-stage', panel);
  const slider = $('.compare-slider input', panel);
  const play = $('.play', panel);

  if (!item.sourceUrl) item.sourceUrl = URL.createObjectURL(item.file);
  before.src = item.sourceUrl;
  after.src = item.resultUrl;
  stage.style.aspectRatio = `${item.info.width} / ${item.info.height}`;

  let beforeOk = true;
  before.onerror = () => {
    beforeOk = false;
    stage.style.setProperty('--cut', '0%');
    slider.disabled = true;
    $('.compare-tag.before', stage).textContent = 'Original non lisible ici';
  };

  if (!panel.dataset.wired) {
    panel.dataset.wired = '1';
    slider.addEventListener('input', () => stage.style.setProperty('--cut', `${slider.value}%`));
    const fromPointer = (ev) => {
      const r = stage.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
      slider.value = String(Math.round(pct));
      stage.style.setProperty('--cut', `${pct}%`);
    };
    stage.addEventListener('pointerdown', (ev) => { stage.setPointerCapture(ev.pointerId); fromPointer(ev); });
    stage.addEventListener('pointermove', (ev) => { if (stage.hasPointerCapture(ev.pointerId)) fromPointer(ev); });
    play.addEventListener('click', () => {
      if (after.paused) {
        before.currentTime = after.currentTime;
        after.play();
        if (beforeOk) before.play().catch(() => {});
        play.textContent = 'Pause';
      } else {
        after.pause(); before.pause();
        play.textContent = 'Lire';
      }
    });
    after.addEventListener('ended', () => { before.pause(); play.textContent = 'Lire'; });
    after.addEventListener('timeupdate', () => {
      if (beforeOk && !before.paused && Math.abs(before.currentTime - after.currentTime) > 0.15) before.currentTime = after.currentTime;
    });
  }
  slider.value = '50';
  slider.disabled = false;
  stage.style.setProperty('--cut', '50%');
  play.textContent = 'Lire';
}

/* ---------------- Glisser-déposer ---------------- */

function setupDrop() {
  let depth = 0;
  const over = (on) => els.drop.classList.toggle('over', on);
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; over(true); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) over(false); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0; over(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
  els.input.addEventListener('change', () => { addFiles(els.input.files); els.input.value = ''; });
}

/* ---------------- Démarrage ---------------- */

async function init() {
  restoreSettings();
  setupDrop();
  syncSlider();

  els.range.addEventListener('input', onRangeInput);
  els.target.addEventListener('input', onNumberInput);
  els.target.addEventListener('change', () => { els.target.value = String(targetMB()); onNumberInput(); });
  els.codec.addEventListener('change', onSettingsChange);
  els.res.addEventListener('change', () => { onSettingsChange(); if (els.res.value === 'custom') els.customWidth.focus(); });
  els.customWidth.addEventListener('input', onSettingsChange);
  els.runAll.addEventListener('click', runAll);
  els.clearDone.addEventListener('click', () => items.filter((i) => i.status === 'done').forEach(removeItem));
  $('#theme').addEventListener('click', () => window.mazaTheme?.toggle());
  window.addEventListener('beforeunload', (e) => { if (running) e.preventDefault(); });

  if (!('VideoEncoder' in window)) {
    els.notice.hidden = false;
    els.notice.textContent = "Votre navigateur ne gère pas l'encodage vidéo matériel (WebCodecs). La compression fonctionnera quand même, mais plus lentement. Chrome, Edge, Firefox et Safari récents sont plus rapides.";
  }

  encoders = await detectEncoders();
  for (const opt of els.codec.options) {
    if (opt.value !== 'avc' && !encoders[opt.value]) opt.textContent = `${opt.textContent.split(' (')[0]} (indisponible ici)`;
  }
  onSettingsChange();
}

init();
