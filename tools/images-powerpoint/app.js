// Images PowerPoint & PDF : liste les images d'un fichier et les télécharge dans leur qualité d'origine.
// PowerPoint (et Word / Excel) : les images sont rangées telles quelles dans le dossier media du fichier.
// PDF : les JPEG sont récupérés tels quels ; les autres images sont reconstituées en PNG.
(() => {
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const els = {
  drop: $("#drop"), input: $("#input"), message: $("#message"), result: $("#result"),
  loading: $("#loading"), loadName: $("#load-name"), loadStep: $("#load-step"), loadPct: $("#load-pct"),
  loadBar: $("#load-bar"), loadProgress: $("#load-progress"),
  fileName: $("#file-name"), fileMeta: $("#file-meta"), fileIcon: $("#file-icon"), change: $("#change"),
  selectAll: $("#select-all"), hideSmall: $("#hide-small"), grid: $("#grid"), empty: $("#empty"),
  dock: $("#dock"), dockCount: $("#dock-count"), download: $("#download"),
  viewer: $("#viewer"), viewerImg: $("#viewer-img"), viewerTxt: $("#viewer-txt"), viewerDl: $("#viewer-dl"),
};

$("#theme").addEventListener("click", () => window.mazaTheme && window.mazaTheme.toggle());

const ICONS = {
  slides: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  pdf: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
};

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", gif: "image/gif",
  bmp: "image/bmp", webp: "image/webp", svg: "image/svg+xml", tif: "image/tiff", tiff: "image/tiff",
  avif: "image/avif", heic: "image/heic", emf: "image/emf", wmf: "image/wmf", wdp: "image/vnd.ms-photo",
  jxr: "image/vnd.ms-photo", jp2: "image/jp2",
};
const PREVIEWABLE = new Set(["png", "jpg", "jpeg", "jpe", "gif", "bmp", "webp", "svg", "avif"]);
const SMALL_PX = 300; // en dessous : icônes, puces, logos

let state = freshState();
function freshState() { return { images: [], baseName: "", urls: [], unitCount: 0, unit: "diapo", skipped: 0 }; }

/* ---------- Utilitaires ---------- */

function formatBytes(b) {
  if (b < 1000) return `${b} o`;
  const u = ["Ko", "Mo", "Go"]; let v = b / 1000, i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${u[i]}`;
}
const ext = (p) => (p.split(".").pop() || "").toLowerCase();
const fileOf = (p) => p.split("/").pop();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

/* ---------- Progression ---------- */

let lastPaint = 0;
async function progress(ratio, step) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  els.loadBar.style.width = `${pct}%`;
  els.loadPct.textContent = `${pct} %`;
  els.loadProgress.setAttribute("aria-valuenow", String(pct));
  if (step) els.loadStep.textContent = step;
  // Laisser le navigateur afficher la barre de temps en temps
  if (performance.now() - lastPaint > 60) { lastPaint = performance.now(); await nextFrame(); }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => { if (e.lengthComputable) progress((e.loaded / e.total) * 0.25, "Lecture du fichier…"); };
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Impossible de lire ce fichier."));
    reader.readAsArrayBuffer(file);
  });
}

/* ---------- PowerPoint (et Word / Excel) ---------- */

/** Résout un chemin relatif d'une relation (ex. "../media/image1.png" depuis "ppt/slides/"). */
function resolve(baseDir, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}
const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");

async function readRels(zip, relsPath) {
  const f = zip.file(relsPath);
  if (!f) return [];
  const doc = parseXml(await f.async("text"));
  const baseDir = relsPath.replace(/_rels\/[^/]+$/, "");
  return [...doc.getElementsByTagName("Relationship")]
    .filter((r) => r.getAttribute("TargetMode") !== "External")
    .map((r) => ({ id: r.getAttribute("Id"), target: resolve(baseDir, r.getAttribute("Target") || "") }));
}

/** Ordre réel des diapositives (celui de la présentation, pas celui des noms de fichiers). */
async function slideOrder(zip) {
  const pres = zip.file("ppt/presentation.xml");
  if (!pres) return [];
  const rels = await readRels(zip, "ppt/_rels/presentation.xml.rels");
  const byId = new Map(rels.map((r) => [r.id, r.target]));
  const doc = parseXml(await pres.async("text"));
  return [...doc.getElementsByTagNameNS("*", "sldId")]
    .map((el) => byId.get(el.getAttribute("r:id") || el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")))
    .filter(Boolean);
}

async function analyseOffice(buffer, fileName) {
  await progress(0.27, "Ouverture du fichier…");
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(/\.ppt$/i.test(fileName)
      ? "Les anciens fichiers .ppt ne sont pas pris en charge. Ouvrez-le dans PowerPoint et enregistrez-le en .pptx."
      : "Ce fichier n'est pas un PowerPoint (.pptx) ni un PDF lisible.");
  }

  await progress(0.32, "Repérage des images dans les diapos…");
  const media = Object.values(zip.files).filter((f) => !f.dir && /(^|\/)media\/[^/]+$/.test(f.name) && MIME[ext(f.name)]);
  const usage = new Map(); // chemin → { pages:Set, template }
  const use = (path) => { if (!usage.has(path)) usage.set(path, { pages: new Set(), template: false }); return usage.get(path); };

  const order = await slideOrder(zip);
  for (let i = 0; i < order.length; i++) {
    const relsPath = order[i].replace(/([^/]+)$/, "_rels/$1.rels");
    for (const r of await readRels(zip, relsPath)) use(r.target).pages.add(i + 1);
    if (i % 10 === 0) await progress(0.32 + 0.08 * (i / order.length), `Repérage des images dans les diapos (${i + 1}/${order.length})…`);
  }
  for (const relsPath of Object.keys(zip.files).filter((n) => /^ppt\/(slideLayouts|slideMasters)\/_rels\/[^/]+\.rels$/.test(n))) {
    for (const r of await readRels(zip, relsPath)) use(r.target).template = true;
  }

  // Extraction, avec une progression pondérée par la taille de chaque image
  const weight = (f) => (f._data && f._data.uncompressedSize) || 1;
  const totalWeight = media.reduce((s, f) => s + weight(f), 0) || 1;
  let doneWeight = 0;
  const images = [];
  for (let k = 0; k < media.length; k++) {
    const f = media[k];
    await progress(0.4 + 0.5 * (doneWeight / totalWeight), `Extraction des images (${k + 1}/${media.length})…`);
    const e = ext(f.name);
    const bytes = await f.async("uint8array");
    doneWeight += weight(f);
    const u = usage.get(f.name) || { pages: new Set(), template: false };
    images.push({
      name: fileOf(f.name), ext: e, size: bytes.length, blob: new Blob([bytes], { type: MIME[e] }),
      pages: [...u.pages].sort((a, b) => a - b), template: u.template, width: 0, height: 0, selected: false,
    });
  }
  return { images, unitCount: order.length, unit: "diapo", skipped: 0 };
}

/* ---------- PDF ---------- */

let pdfLibLoading = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve();
  if (!pdfLibLoading) {
    pdfLibLoading = new Promise((resolve, reject) => {
      const s = Object.assign(document.createElement("script"), { src: "vendor/pdf-lib.min.js" });
      s.onload = resolve;
      s.onerror = () => { pdfLibLoading = null; reject(new Error("Impossible de charger le lecteur PDF.")); };
      document.head.append(s);
    });
  }
  return pdfLibLoading;
}

/** Annule les prédicteurs PNG (10–15) et TIFF (2) appliqués avant la compression. */
function unpredict(data, parms, P) {
  if (!(parms instanceof P.PDFDict)) return data;
  const num = (k, d) => { const v = parms.lookup(P.PDFName.of(k)); return v instanceof P.PDFNumber ? v.asNumber() : d; };
  const predictor = num("Predictor", 1);
  if (predictor < 2) return data;
  const colors = num("Colors", 1), bpc = num("BitsPerComponent", 8), columns = num("Columns", 1);
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));

  if (predictor === 2) {
    if (bpc !== 8) return data;
    const out = new Uint8Array(data);
    for (let row = 0; row * rowLen < out.length; row++) {
      const start = row * rowLen;
      for (let i = bpp; i < rowLen; i++) out[start + i] = (out[start + i] + out[start + i - bpp]) & 255;
    }
    return out;
  }

  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (type === 1) v += a;
      else if (type === 2) v += b;
      else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return out;
}

function filterNames(dict, P, ctx) {
  const f = dict.lookup(P.PDFName.of("Filter"));
  if (f instanceof P.PDFName) return [f.decodeText()];
  if (f instanceof P.PDFArray) return f.asArray().map((x) => ctx.lookup(x)).map((n) => (n instanceof P.PDFName ? n.decodeText() : ""));
  return [];
}

function decodeParms(dict, P, index) {
  const d = dict.lookup(P.PDFName.of("DecodeParms"));
  if (d instanceof P.PDFArray) return d.lookup(index);
  return d;
}

/** Décode les données brutes d'une image (filtres sans perte + prédicteur). */
function decodedPixels(stream, P, ctx) {
  const names = filterNames(stream.dict, P, ctx);
  const data = names.length ? P.decodePDFRawStream(stream).decode() : stream.contents;
  return unpredict(data, decodeParms(stream.dict, P, names.length - 1), P);
}

/** Décrit l'espace de couleurs d'une image. */
function colorSpace(cs, P, ctx) {
  cs = ctx.lookup(cs);
  if (cs instanceof P.PDFName) {
    const n = cs.decodeText();
    if (n === "DeviceGray" || n === "CalGray" || n === "G") return { kind: "gray", n: 1 };
    if (n === "DeviceRGB" || n === "CalRGB" || n === "RGB") return { kind: "rgb", n: 3 };
    if (n === "DeviceCMYK" || n === "CMYK") return { kind: "cmyk", n: 4 };
    return null;
  }
  if (cs instanceof P.PDFArray) {
    const type = ctx.lookup(cs.get(0));
    const name = type instanceof P.PDFName ? type.decodeText() : "";
    if (name === "ICCBased") {
      const icc = ctx.lookup(cs.get(1));
      const nObj = icc && icc.dict && icc.dict.lookup(P.PDFName.of("N"));
      const n = nObj instanceof P.PDFNumber ? nObj.asNumber() : 3;
      return n === 1 ? { kind: "gray", n: 1 } : n === 4 ? { kind: "cmyk", n: 4 } : { kind: "rgb", n: 3 };
    }
    if (name === "CalRGB") return { kind: "rgb", n: 3 };
    if (name === "CalGray") return { kind: "gray", n: 1 };
    if (name === "Indexed" || name === "I") {
      const base = colorSpace(cs.get(1), P, ctx);
      const hival = ctx.lookup(cs.get(2)).asNumber();
      const lookupObj = ctx.lookup(cs.get(3));
      let lookup;
      if (lookupObj instanceof P.PDFRawStream) lookup = decodedPixels(lookupObj, P, ctx);
      else if (lookupObj && lookupObj.asBytes) lookup = lookupObj.asBytes();
      if (!base || !lookup) return null;
      return { kind: "indexed", n: 1, base, hival, lookup };
    }
    if (name === "Separation") return { kind: "separation", n: 1 };
  }
  return null;
}

/** Lit les échantillons d'une image en entiers 0–255, quelle que soit la profondeur (1 à 16 bits). */
function samples(data, width, height, comps, bpc) {
  const out = new Uint8Array(width * height * comps);
  const rowBits = width * comps * bpc;
  const rowBytes = Math.ceil(rowBits / 8);
  const max = (1 << Math.min(bpc, 8)) - 1;
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let i = 0; i < width * comps; i++) {
      let v;
      if (bpc === 8) v = data[rowStart + i];
      else if (bpc === 16) v = data[rowStart + i * 2];
      else {
        const bit = i * bpc;
        v = (data[rowStart + (bit >> 3)] >> (8 - bpc - (bit & 7))) & max;
        v = Math.round((v * 255) / max);
      }
      out[y * width * comps + i] = v || 0;
    }
  }
  return out;
}

/** Convertit une image PDF non JPEG en pixels RGBA. */
function toRGBA(stream, P, ctx) {
  const d = stream.dict;
  const num = (k, def) => { const v = d.lookup(P.PDFName.of(k)); return v instanceof P.PDFNumber ? v.asNumber() : def; };
  const width = num("Width", 0), height = num("Height", 0), bpc = num("BitsPerComponent", 8);
  if (!width || !height) throw new Error("dimensions inconnues");
  const cs = colorSpace(d.lookup(P.PDFName.of("ColorSpace")) || P.PDFName.of("DeviceGray"), P, ctx);
  if (!cs) throw new Error("espace de couleurs non pris en charge");

  const data = decodedPixels(stream, P, ctx);
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (cs.kind === "indexed") {
    // Les index ne sont pas des intensités : on les lit bruts
    const rowBytes = Math.ceil((width * bpc) / 8);
    const bn = cs.base.n;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let idx;
        if (bpc === 8) idx = data[y * rowBytes + x];
        else { const bit = x * bpc; idx = (data[y * rowBytes + (bit >> 3)] >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1); }
        idx = Math.min(idx || 0, cs.hival);
        const o = (y * width + x) * 4, l = idx * bn;
        if (cs.base.kind === "gray") rgba[o] = rgba[o + 1] = rgba[o + 2] = cs.lookup[l];
        else if (cs.base.kind === "cmyk") cmykToRgb(cs.lookup[l], cs.lookup[l + 1], cs.lookup[l + 2], cs.lookup[l + 3], rgba, o);
        else { rgba[o] = cs.lookup[l]; rgba[o + 1] = cs.lookup[l + 1]; rgba[o + 2] = cs.lookup[l + 2]; }
        rgba[o + 3] = 255;
      }
    }
  } else {
    const s = samples(data, width, height, cs.n, bpc);
    const decode = d.lookup(P.PDFName.of("Decode"));
    const invert = decode instanceof P.PDFArray && decode.size() >= 2 && ctx.lookup(decode.get(0)).asNumber() > ctx.lookup(decode.get(1)).asNumber();
    for (let i = 0, o = 0; i < width * height; i++, o += 4) {
      if (cs.kind === "gray" || cs.kind === "separation") {
        let v = s[i];
        if (invert) v = 255 - v;
        if (cs.kind === "separation") v = 255 - v; // 1 = encre pleine = sombre
        rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
      } else if (cs.kind === "cmyk") {
        cmykToRgb(s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], rgba, o);
      } else {
        rgba[o] = s[i * 3]; rgba[o + 1] = s[i * 3 + 1]; rgba[o + 2] = s[i * 3 + 2];
      }
      rgba[o + 3] = 255;
    }
  }

  // Transparence (masque doux)
  const smask = ctx.lookup(d.get(P.PDFName.of("SMask")));
  if (smask instanceof P.PDFRawStream) {
    try {
      const m = smask.dict;
      const mw = m.lookup(P.PDFName.of("Width")).asNumber(), mh = m.lookup(P.PDFName.of("Height")).asNumber();
      const mbpcObj = m.lookup(P.PDFName.of("BitsPerComponent"));
      const alpha = samples(decodedPixels(smask, P, ctx), mw, mh, 1, mbpcObj ? mbpcObj.asNumber() : 8);
      for (let y = 0; y < height; y++) {
        const my = Math.min(mh - 1, Math.floor((y * mh) / height));
        for (let x = 0; x < width; x++) {
          const mx = Math.min(mw - 1, Math.floor((x * mw) / width));
          rgba[(y * width + x) * 4 + 3] = alpha[my * mw + mx];
        }
      }
    } catch { /* masque illisible : image opaque */ }
  }
  return { rgba, width, height };
}

function cmykToRgb(c, m, y, k, out, o) {
  out[o] = 255 - Math.min(255, c + k);
  out[o + 1] = 255 - Math.min(255, m + k);
  out[o + 2] = 255 - Math.min(255, y + k);
}

const canvasPool = document.createElement("canvas");
function encodePng({ rgba, width, height }) {
  canvasPool.width = width;
  canvasPool.height = height;
  const c = canvasPool.getContext("2d");
  c.putImageData(new ImageData(rgba, width, height), 0, 0);
  return new Promise((resolve, reject) => canvasPool.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG"))), "image/png"));
}

async function analysePdf(buffer) {
  await progress(0.26, "Chargement du lecteur PDF…");
  await loadPdfLib();
  const P = window.PDFLib;
  await progress(0.3, "Analyse du PDF…");

  let doc;
  try {
    doc = await P.PDFDocument.load(buffer, { updateMetadata: false });
  } catch (err) {
    if (err && /encrypt/i.test(`${err.name} ${err.message}`)) {
      throw new Error("Ce PDF est chiffré (protégé contre la copie ou par un mot de passe) : ses images ne peuvent pas être lues ici.");
    }
    throw new Error("Ce PDF est illisible ou abîmé.");
  }
  const ctx = doc.context;
  const N = (n) => P.PDFName.of(n);

  // 1. Repérer les images de chaque page (y compris dans les groupes / formulaires imbriqués)
  const found = new Map(); // "12 0 R" → { stream, num, pages:Set }
  const resourcesOf = (node) => {
    for (let n = node, depth = 0; n && depth < 32; depth++) {
      const r = n.lookup(N("Resources"));
      if (r instanceof P.PDFDict) return r;
      n = n.lookup(N("Parent"));
    }
    return null;
  };
  // Noms d'objets réellement dessinés (« /Im3 Do ») dans un flux de contenu.
  // Utile quand plusieurs pages partagent une même liste de ressources.
  const drawnNames = (streams) => {
    try {
      const names = new Set();
      for (const st of streams) {
        if (!(st instanceof P.PDFRawStream)) continue;
        const bytes = filterNames(st.dict, P, ctx).length ? P.decodePDFRawStream(st).decode() : st.contents;
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        for (const m of text.matchAll(/\/([^\s\/\[\]<>(){}%]+)\s+Do\b/g)) {
          names.add(m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
        }
      }
      return names;
    } catch { return null; } // contenu illisible : on garde toutes les ressources
  };
  const pageContents = (node) => {
    const c = node.lookup(N("Contents"));
    if (c instanceof P.PDFArray) return c.asArray().map((x) => ctx.lookup(x));
    return c ? [c] : [];
  };
  const walk = (res, pageNo, seen, used) => {
    const xo = res && res.lookup(N("XObject"));
    if (!(xo instanceof P.PDFDict)) return;
    for (const [name, val] of xo.entries()) {
      if (used && !used.has(name.decodeText())) continue;
      const obj = ctx.lookup(val);
      if (!(obj instanceof P.PDFRawStream)) continue;
      const key = val instanceof P.PDFRef ? val.toString() : `inline-${found.size}`;
      const sub = obj.dict.lookup(N("Subtype"));
      if (sub === N("Image")) {
        const mask = obj.dict.lookup(N("ImageMask"));
        if (mask instanceof P.PDFBool && mask.asBoolean()) continue; // pochoir 1 bit, pas une vraie image
        if (!found.has(key)) found.set(key, { stream: obj, num: val instanceof P.PDFRef ? val.objectNumber : found.size + 1, pages: new Set() });
        found.get(key).pages.add(pageNo);
      } else if (sub === N("Form") && !seen.has(key)) {
        seen.add(key);
        const formRes = obj.dict.lookup(N("Resources"));
        walk(formRes instanceof P.PDFDict ? formRes : res, pageNo, seen, drawnNames([obj]));
      }
    }
  };
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const node = pages[i].node;
    walk(resourcesOf(node), i + 1, new Set(), drawnNames(pageContents(node)));
    if (i % 5 === 0) await progress(0.3 + 0.1 * (i / pages.length), `Lecture des pages (${i + 1}/${pages.length})…`);
  }

  // 2. Extraire chaque image
  const entries = [...found.values()];
  const images = [];
  let skipped = 0;
  for (let k = 0; k < entries.length; k++) {
    await progress(0.4 + 0.55 * (k / Math.max(1, entries.length)), `Extraction des images (${k + 1}/${entries.length})…`);
    const { stream, num, pages: pg } = entries[k];
    const filters = filterNames(stream.dict, P, ctx);
    const last = filters[filters.length - 1];
    const pagesArr = [...pg].sort((a, b) => a - b);
    const base = { name: `image-${num}`, pages: pagesArr, template: false, selected: false, width: 0, height: 0 };
    try {
      if (last === "DCTDecode" || last === "DCT" || last === "JPXDecode") {
        // JPEG / JPEG 2000 : le fichier d'origine est rangé tel quel dans le PDF
        let bytes = stream.contents;
        const before = filters.slice(0, -1);
        if (before.length) {
          // Filtres appliqués par-dessus le JPEG (ASCII85, Flate…) : on les retire seulement eux.
          const dict = stream.dict.clone(ctx);
          dict.set(N("Filter"), ctx.obj(before.map((f) => N(f))));
          dict.delete(N("DecodeParms"));
          bytes = P.decodePDFRawStream({ dict, contents: stream.contents }).decode();
        }
        const e = last === "JPXDecode" ? "jp2" : "jpg";
        images.push({ ...base, name: `${base.name}.${e}`, ext: e, size: bytes.length, blob: new Blob([bytes], { type: MIME[e] }) });
      } else if (filters.some((f) => /JBIG2|CCITT/.test(f))) {
        skipped++;
      } else {
        const px = toRGBA(stream, P, ctx);
        const blob = await encodePng(px);
        images.push({ ...base, name: `${base.name}.png`, ext: "png", size: blob.size, blob, width: px.width, height: px.height });
      }
    } catch (err) {
      console.warn("Image ignorée", num, err);
      skipped++;
    }
  }

  images.sort((a, b) => (a.pages[0] || 1e9) - (b.pages[0] || 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { images, unitCount: pages.length, unit: "page", skipped };
}

/** Lit les dimensions réelles d'une image (0 si le navigateur ne sait pas l'afficher). */
function measure(img) {
  if (img.width || !PREVIEWABLE.has(img.ext)) return Promise.resolve();
  return new Promise((done) => {
    const el = new Image();
    el.onload = () => { img.width = el.naturalWidth; img.height = el.naturalHeight; done(); };
    el.onerror = () => { img.unreadable = true; done(); };
    el.src = img.url;
  });
}

/* ---------- Affichage ---------- */

/** « 1, 2, 3, 7 » devient « 1 à 3, 7 ». */
function ranges(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j - i >= 2 ? `${nums[i]} à ${nums[j]}` : j > i ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return out;
}

function whereLabel(img) {
  const unit = state.unit === "page" ? "Page" : "Diapo";
  if (img.pages.length && state.unitCount > 1 && img.pages.length === state.unitCount) return { text: `Toutes les ${unit.toLowerCase()}s` };
  if (img.pages.length === 1) return { text: `${unit} ${img.pages[0]}` };
  if (img.pages.length > 1) {
    const parts = ranges(img.pages);
    return { text: `${unit}s ${parts.length > 3 ? `${parts.slice(0, 3).join(", ")}…` : parts.join(", ")}` };
  }
  if (img.template) return { text: "Modèle de diapositive" };
  return { text: "Non utilisée", quiet: true };
}

function downloadName(img) {
  const base = img.name.replace(/\.[^.]+$/, "");
  const prefix = img.pages.length ? `${state.unit}-${String(img.pages[0]).padStart(2, "0")}` : img.template ? "modele" : "autre";
  return `${prefix}_${base}.${img.ext === "jpe" ? "jpg" : img.ext}`;
}

const isSmall = (img) => img.width > 0 && Math.max(img.width, img.height) < SMALL_PX;
const visibleImages = () => state.images.filter((img) => !(els.hideSmall.checked && isSmall(img)));

function card(img) {
  const li = document.createElement("li");
  li.className = "card";

  const label = document.createElement("label");
  const input = Object.assign(document.createElement("input"), { type: "checkbox", checked: img.selected });
  input.setAttribute("aria-label", `Sélectionner ${img.name}`);
  input.addEventListener("change", () => { img.selected = input.checked; li.classList.toggle("selected", img.selected); updateSelection(); });

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const canPreview = PREVIEWABLE.has(img.ext) && !img.unreadable;
  if (canPreview) thumb.append(Object.assign(document.createElement("img"), { src: img.url, alt: "", loading: "lazy", decoding: "async" }));
  else thumb.innerHTML = `<span class="noprev"><b>${img.ext.toUpperCase()}</b>Aperçu indisponible</span>`;
  const tick = document.createElement("span");
  tick.className = "tick";
  tick.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  thumb.append(tick);

  const details = document.createElement("div");
  details.className = "details";
  const dims = Object.assign(document.createElement("div"), {
    className: "dims",
    textContent: img.width ? `${img.width} × ${img.height}` : img.ext === "svg" ? "Vectoriel" : img.ext.toUpperCase(),
  });
  const sub = document.createElement("div");
  sub.className = "sub";
  sub.append(...[img.ext.toUpperCase(), formatBytes(img.size)].map((t) => Object.assign(document.createElement("span"), { textContent: t })));
  const where = whereLabel(img);
  details.append(dims, sub, Object.assign(document.createElement("span"), { className: `where${where.quiet ? " quiet" : ""}`, textContent: where.text }));

  label.append(input, thumb, details);
  li.append(label);

  const zoom = document.createElement("button");
  zoom.type = "button";
  zoom.className = "zoom";
  zoom.setAttribute("aria-label", `Agrandir ${img.name}`);
  zoom.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>';
  zoom.addEventListener("click", () => openViewer(img));
  zoom.hidden = !canPreview;
  li.append(zoom);

  li.classList.toggle("selected", img.selected);
  return li;
}

function renderGrid() {
  const list = visibleImages();
  els.grid.replaceChildren(...list.map(card));
  const hidden = state.images.length - list.length;
  els.empty.hidden = list.length > 0;
  els.empty.textContent = state.images.length === 0
    ? "Aucune image trouvée dans ce fichier."
    : `${hidden > 1 ? `Les ${hidden} images` : "L'image"} de ce fichier ${hidden > 1 ? "sont petites" : "est petite"} : décochez « Masquer les petites images » pour les voir.`;
  updateSelection();
}

function updateSelection() {
  const visible = visibleImages();
  const selected = state.images.filter((i) => i.selected);
  const total = selected.reduce((s, i) => s + i.size, 0);
  els.selectAll.checked = visible.length > 0 && visible.every((i) => i.selected);
  els.selectAll.indeterminate = !els.selectAll.checked && visible.some((i) => i.selected);
  els.dock.hidden = selected.length === 0;
  els.dockCount.replaceChildren(
    document.createTextNode(`${plural(selected.length, "image")} sélectionnée${selected.length > 1 ? "s" : ""}`),
    Object.assign(document.createElement("small"), { textContent: formatBytes(total) }),
  );
  els.download.textContent = selected.length > 1 ? "Télécharger en .zip" : "Télécharger";
}

function showMessage(text, kind) {
  els.message.hidden = !text;
  els.message.textContent = text || "";
  els.message.className = `message ${kind || ""}`;
}

/* ---------- Téléchargement ---------- */

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function downloadSelected() {
  const selected = state.images.filter((i) => i.selected);
  if (!selected.length) return;
  if (selected.length === 1) { save(selected[0].blob, downloadName(selected[0])); return; }

  els.download.disabled = true;
  els.download.textContent = "Préparation…";
  try {
    const zip = new JSZip();
    const used = new Set();
    for (const img of selected) {
      let name = downloadName(img);
      for (let n = 2; used.has(name); n++) name = downloadName(img).replace(/(\.[^.]+)$/, `-${n}$1`);
      used.add(name);
      zip.file(name, img.blob);
    }
    // Les images sont déjà compressées : on les range telles quelles (plus rapide, même poids).
    save(await zip.generateAsync({ type: "blob", compression: "STORE" }), `${state.baseName} - images.zip`);
  } finally {
    els.download.disabled = false;
    updateSelection();
  }
}

/* ---------- Agrandissement ---------- */

function openViewer(img) {
  els.viewerImg.src = img.url;
  els.viewerImg.alt = img.name;
  els.viewerTxt.replaceChildren(
    Object.assign(document.createElement("b"), { textContent: img.width ? `${img.width} × ${img.height}` : img.ext.toUpperCase() }),
    document.createTextNode(`, ${formatBytes(img.size)}, ${whereLabel(img).text.toLowerCase()}`),
  );
  els.viewerDl.href = img.url;
  els.viewerDl.download = downloadName(img);
  els.viewer.showModal();
}
$("#viewer-close").addEventListener("click", () => els.viewer.close());
els.viewer.addEventListener("click", (e) => { if (e.target === els.viewer) els.viewer.close(); });

/* ---------- Ouverture d'un fichier ---------- */

function reset() {
  state.urls.forEach((u) => URL.revokeObjectURL(u));
  state = freshState();
  els.grid.replaceChildren();
  els.result.hidden = true;
  els.dock.hidden = true;
  els.selectAll.checked = false;
}

let opening = 0;
async function open(file) {
  const ticket = ++opening;
  reset();
  showMessage("");
  els.drop.hidden = true;
  els.loading.hidden = false;
  els.loadName.textContent = file.name;
  lastPaint = 0;
  await progress(0, "Lecture du fichier…");
  try {
    const buffer = await readFile(file);
    const head = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
    const isPdf = String.fromCharCode(...head) === "%PDF-" || /\.pdf$/i.test(file.name);
    const result = isPdf ? await analysePdf(buffer) : await analyseOffice(buffer, file.name);
    if (ticket !== opening) return;

    await progress(0.96, "Préparation des aperçus…");
    Object.assign(state, result, { baseName: file.name.replace(/\.[^.]+$/, "") });
    for (const img of state.images) { img.url = URL.createObjectURL(img.blob); state.urls.push(img.url); }
    await Promise.all(state.images.map(measure));
    await progress(1, "Terminé");

    const total = state.images.reduce((s, i) => s + i.size, 0);
    els.fileName.textContent = file.name;
    els.fileIcon.innerHTML = isPdf ? ICONS.pdf : ICONS.slides;
    const parts = [];
    if (state.unitCount) parts.push(plural(state.unitCount, state.unit));
    parts.push(plural(state.images.length, "image"), `${formatBytes(total)} d'images`);
    els.fileMeta.textContent = parts.join(", ");

    els.loading.hidden = true;
    els.result.hidden = false;
    renderGrid();
    if (state.skipped) {
      showMessage(`${plural(state.skipped, "image")} dans un format non pris en charge (scan noir et blanc ou encodage rare) ${state.skipped > 1 ? "n'ont" : "n'a"} pas pu être ${state.skipped > 1 ? "récupérées" : "récupérée"}.`, "work");
    }
  } catch (err) {
    console.error(err);
    if (ticket !== opening) return;
    els.loading.hidden = true;
    els.drop.hidden = false;
    showMessage(err.message || "Impossible de lire ce fichier.", "err");
  }
}

els.input.addEventListener("change", () => { if (els.input.files[0]) open(els.input.files[0]); els.input.value = ""; });
els.change.addEventListener("click", () => els.input.click());
els.selectAll.addEventListener("change", () => {
  for (const img of visibleImages()) img.selected = els.selectAll.checked;
  renderGrid();
});
els.hideSmall.addEventListener("change", () => {
  if (els.hideSmall.checked) state.images.forEach((i) => { if (isSmall(i)) i.selected = false; });
  renderGrid();
});
els.download.addEventListener("click", downloadSelected);

// Glisser-déposer n'importe où sur la page
let depth = 0;
const over = (on) => els.drop.classList.toggle("over", on);
window.addEventListener("dragenter", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { depth++; over(true); } });
window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) over(false); });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault(); depth = 0; over(false);
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) open(f);
});
})();
