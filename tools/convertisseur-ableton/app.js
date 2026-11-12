// CONVERTISSEUR ABLETON : MP4 / MOV → AVI H.264 + PCM, lisible par Ableton Live 11.
// Démultiplexage avec mp4box.js (vendor/), décodage et encodage avec WebCodecs.
"use strict";
(() => {
const $ = s => document.querySelector(s);
const drop = $("#drop"), pick = $("#pick"), list = $("#list"), warn = $("#warn");
const q = $("#q"), res = $("#res");
$("#theme").addEventListener("click", () => window.mazaTheme && window.mazaTheme.toggle());
class UserErr extends Error {}

try { const s = JSON.parse(localStorage.getItem("avi-conv-h264") || "{}"); if (s.res) res.value = s.res; if (s.q) q.value = s.q; if (!q.value) q.value = "0.1"; } catch (e) {}
const savePrefs = () => { try { localStorage.setItem("avi-conv-h264", JSON.stringify({ res: res.value, q: q.value })); } catch (e) {} };
q.addEventListener("change", savePrefs);
res.addEventListener("change", savePrefs);

if (!("VideoDecoder" in window) || !("VideoEncoder" in window) || !("AudioDecoder" in window)) {
  warn.hidden = false;
  warn.textContent = "Ce navigateur ne sait pas décoder la vidéo ici. Ouvrez cette page dans Chrome ou Edge (version récente).";
}

pick.addEventListener("change", () => { addFiles(pick.files); pick.value = ""; });
// Glisser-déposer n'importe où sur la page
let depth = 0;
const over = on => drop.classList.toggle("over", on);
window.addEventListener("dragenter", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { depth++; over(true); } });
window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) over(false); });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => {
  e.preventDefault(); depth = 0; over(false);
  if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});
const setState = (li, text) => { li.querySelector(".state").textContent = text; };

const queue = []; let busy = false;
function addFiles(files) {
  for (const file of files) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = '<div class="row"><span class="name"></span><span class="state">En attente</span></div><div class="meta"></div><div class="bar"><i></i></div><p class="status">En attente</p><div class="actions"></div>';
    li.querySelector(".name").textContent = file.name;
    li.querySelector(".meta").textContent = fmtSize(file.size);
    list.appendChild(li);
    queue.push({ file, li });
  }
  pump();
}
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const job = queue.shift();
    try { setState(job.li, "Conversion…"); await convert(job); }
    catch (e) {
      console.error(e);
      job.li.classList.add("error");
      setState(job.li, "Erreur");
      job.li.querySelector(".status").textContent = e instanceof UserErr ? e.message : "Conversion impossible : " + (e && e.message || e);
    }
  }
  busy = false;
}
function fmtSize(b) { const fr = (v, d) => v.toLocaleString("fr-FR", { maximumFractionDigits: d }); return b > 1e9 ? fr(b / 1e9, 2) + " Go" : b > 1e6 ? fr(b / 1e6, 1) + " Mo" : Math.max(1, Math.round(b / 1e3)) + " Ko"; }
function fmtDur(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Demux (mp4box) ---------- */
async function demux(file, onProgress) {
  const mp4 = MP4Box.createFile();
  let info = null, err = null;
  const vS = [], aS = [];
  mp4.onError = e => { err = e; };
  mp4.onReady = i => {
    info = i;
    const v = i.videoTracks[0], a = i.audioTracks[0];
    if (v) mp4.setExtractionOptions(v.id, "v", { nbSamples: 1000 });
    if (a) mp4.setExtractionOptions(a.id, "a", { nbSamples: 1000 });
    mp4.start();
  };
  mp4.onSamples = (id, user, samples) => { const t = user === "v" ? vS : aS; for (const s of samples) t.push(s); };
  const CH = 8 * 1024 * 1024;
  for (let off = 0; off < file.size; ) {
    const buf = await file.slice(off, off + CH).arrayBuffer();
    buf.fileStart = off; off += buf.byteLength;
    mp4.appendBuffer(buf);
    onProgress(off / file.size);
    if (err) break;
  }
  mp4.flush();
  if (!info) throw new UserErr("Ce fichier n'est pas un MP4 ou MOV lisible.");
  if (!info.videoTracks.length) throw new UserErr("Aucune piste vidéo dans ce fichier.");
  return { mp4, info, vS, aS };
}
function videoDescription(trak) {
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const st = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(st);
      return new Uint8Array(st.buffer, 8);
    }
  }
  return undefined;
}
function audioDescription(trak) {
  const e = trak.mdia.minf.stbl.stsd.entries[0];
  try { return e.esds.esd.descs[0].descs[0].data; } catch (x) { return undefined; }
}
function rotationOf(track) {
  const m = track.matrix; if (!m) return 0;
  const a = m[0] | 0, b = m[1] | 0;
  if (a === 0 && b > 0) return 90;
  if (a === 0 && b < 0) return 270;
  if (a < 0) return 180;
  return 0;
}
function snapFps(f) {
  if (!isFinite(f) || f <= 0) return [25, 1];
  if (f > 61) f = 60;
  const c = [[24000, 1001], [24, 1], [25, 1], [30000, 1001], [30, 1], [50, 1], [60000, 1001], [60, 1]];
  let best = c[0];
  for (const x of c) if (Math.abs(x[0] / x[1] - f) < Math.abs(best[0] / best[1] - f)) best = x;
  if (Math.abs(best[0] / best[1] - f) / f > 0.03) best = [Math.max(1, Math.round(f)), 1];
  return best;
}

/* ---------- Audio ---------- */
async function decodeAudio(file, mp4, at, aS) {
  const sr = at.audio.sample_rate, srcCh = at.audio.channel_count;
  let codec = at.codec;
  if (/^mp4a\.(6b|69)$/i.test(codec)) codec = "mp3";
  if (/^opus$/i.test(codec)) codec = "opus";
  const cfg = { codec, sampleRate: sr, numberOfChannels: srcCh };
  const desc = audioDescription(mp4.getTrackById(at.id));
  if (desc && codec.startsWith("mp4a")) cfg.description = desc;
  let planes = null, ch = srcCh, rate = sr;
  let ok = false;
  try { ok = (await AudioDecoder.isConfigSupported(cfg)).supported; } catch (e) {}
  if (ok && aS.length) {
    const chunks = []; let decErr = null;
    const dec = new AudioDecoder({ output: d => chunks.push(d), error: e => { decErr = e; } });
    dec.configure(cfg);
    for (const s of aS) {
      dec.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(s.cts * 1e6 / s.timescale), duration: Math.round(s.duration * 1e6 / s.timescale), data: s.data }));
      if (dec.decodeQueueSize > 64) await sleep(0);
    }
    try { await dec.flush(); } catch (e) { decErr = decErr || e; }
    dec.close();
    if (!decErr && chunks.length) {
      ch = chunks[0].numberOfChannels; rate = chunks[0].sampleRate;
      const total = chunks.reduce((n, d) => n + d.numberOfFrames, 0);
      planes = Array.from({ length: ch }, () => new Float32Array(total));
      let o = 0;
      for (const d of chunks) {
        for (let c = 0; c < ch; c++) {
          const tmp = new Float32Array(d.numberOfFrames);
          d.copyTo(tmp, { planeIndex: c, format: "f32-planar" });
          planes[c].set(tmp, o);
        }
        o += d.numberOfFrames; d.close();
      }
    } else chunks.forEach(d => d.close());
  }
  if (!planes) {
    try {
      const ac = new OfflineAudioContext(Math.max(1, Math.min(srcCh || 2, 32)), 1, sr || 48000);
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      ch = buf.numberOfChannels; rate = buf.sampleRate;
      planes = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    } catch (e) { return null; }
  }
  // Drop encoder priming declared by the edit list (e.g. 1024 AAC samples)
  try {
    const el = mp4.getTrackById(at.id).edts.elst.entries;
    const mt = el && el.length ? el[el.length - 1].media_time : 0;
    const skip = Math.round(mt / at.timescale * rate);
    if (skip > 0 && skip < planes[0].length / 2) planes = planes.map(p => p.subarray(skip));
  } catch (e) {}
  // Downmix to stereo if needed, then interleave as 16-bit PCM
  let L, R = null;
  if (ch === 1) L = planes[0];
  else if (ch === 2) { L = planes[0]; R = planes[1]; }
  else {
    const n = planes[0].length; L = new Float32Array(n); R = new Float32Array(n);
    if (ch >= 6) { // FL FR C LFE SL SR
      for (let i = 0; i < n; i++) {
        const c = planes[2][i] * 0.707;
        L[i] = (planes[0][i] + c + planes[4][i] * 0.707) * 0.6;
        R[i] = (planes[1][i] + c + planes[5][i] * 0.707) * 0.6;
      }
    } else {
      for (let c = 0; c < ch; c++) { const t = c % 2 ? R : L, p = planes[c]; for (let i = 0; i < n; i++) t[i] += p[i]; }
      const k = 1 / Math.ceil(ch / 2);
      for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
    }
  }
  const outCh = R ? 2 : 1, n = L.length, pcm = new Int16Array(n * outCh);
  const cv = x => { x = x < -1 ? -1 : x > 1 ? 1 : x; return x < 0 ? x * 32768 : x * 32767; };
  if (R) for (let i = 0; i < n; i++) { pcm[2 * i] = cv(L[i]); pcm[2 * i + 1] = cv(R[i]); }
  else for (let i = 0; i < n; i++) pcm[i] = cv(L[i]);
  return { sr: rate, ch: outCh, pcm, samples: n, downmixed: ch > 2 };
}

/* ---------- Conversion ---------- */
async function convert({ file, li }) {
  const status = li.querySelector(".status"), bar = li.querySelector(".bar i");
  const setP = (p, msg) => { bar.style.width = (p * 100).toFixed(1) + "%"; if (msg) status.textContent = msg; };
  if (!("VideoDecoder" in window)) throw new UserErr("Ce navigateur ne sait pas décoder la vidéo. Utilisez Chrome ou Edge.");
  const maxH = +res.value, bpp = +q.value || 0.1;

  status.textContent = "Lecture du fichier…";
  const { mp4, info, vS, aS } = await demux(file, p => setP(p * 0.08));
  const vt = info.videoTracks[0], at = info.audioTracks[0];
  if (!vS.length) throw new UserErr("La piste vidéo est vide.");

  // Timing
  const ts = vt.timescale || vS[0].timescale;
  let minCts = Infinity, maxEnd = 0;
  for (const s of vS) { if (s.cts < minCts) minCts = s.cts; if (s.cts + s.duration > maxEnd) maxEnd = s.cts + s.duration; }
  const durSec = (maxEnd - minCts) / ts;
  const [rate, scale] = snapFps(vS.length / durSec);
  const totalOut = Math.max(1, Math.round(durSec * rate / scale));
  const outTimeUs = i => i * 1e6 * scale / rate;

  // Geometry
  const rot = rotationOf(vt);
  let dw = Math.round(vt.track_width || vt.video.width), dh = Math.round(vt.track_height || vt.video.height);
  if (rot % 180) [dw, dh] = [dh, dw];
  let W = dw, H = dh;
  if (maxH && Math.min(dw, dh) > maxH) { const k = maxH / Math.min(dw, dh); W = dw * k; H = dh * k; }
  W = Math.max(16, Math.round(W / 16) * 16); H = Math.max(16, Math.round(H / 8) * 8);
  li.querySelector(".meta").textContent = `${fmtSize(file.size)}, ${W}×${H}, ${String(+(rate / scale).toFixed(2)).replace(".", ",")} i/s, ${fmtDur(durSec)}`;

  // Video decoder
  let codec = vt.codec;
  const cfg = { codec, codedWidth: vt.video.width, codedHeight: vt.video.height };
  const desc = videoDescription(mp4.getTrackById(vt.id));
  if (desc) cfg.description = desc;
  let sup = false;
  try { sup = (await VideoDecoder.isConfigSupported(cfg)).supported; } catch (e) {}
  if (!sup) {
    const hevc = /^(hvc1|hev1)/.test(codec);
    throw new UserErr(hevc
      ? "Cette vidéo est en HEVC (H.265), que ce navigateur ne décode pas. Réexportez-la en H.264, ou essayez dans Edge."
      : `Codec vidéo non pris en charge par ce navigateur (${codec}).`);
  }

  // Audio first (fast), so a failure is known early
  let audio = null;
  if (at) { status.textContent = "Décodage du son…"; audio = await decodeAudio(file, mp4, at, aS); }
  setP(0.12, "Conversion des images…");

  const canvas = ("OffscreenCanvas" in window) ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "high";
  const draw = f => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (!rot) { ctx.drawImage(f, 0, 0, W, H); return; }
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot * Math.PI / 180);
    const rw = rot % 180 ? H : W, rh = rot % 180 ? W : H;
    ctx.drawImage(f, -rw / 2, -rh / 2, rw, rh); ctx.restore();
  };

  // H.264 encoder: constrained baseline (no B-frames), Annex B, keyframe every second
  const fps = rate / scale;
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16), mbps = mbs * fps;
  const level = mbs <= 3600 && mbps <= 108000 ? "1F" : mbs <= 8192 && mbps <= 245760 ? "28" : mbs <= 8704 && mbps <= 522240 ? "2A" : mbps <= 983040 ? "33" : "34";
  const encCfg = { codec: "avc1.42E0" + level, width: W, height: H, framerate: fps,
    bitrate: Math.max(500e3, Math.round(W * H * fps * bpp)), bitrateMode: "variable",
    latencyMode: "quality", avc: { format: "annexb" } };
  let encOk = false;
  try { encOk = (await VideoEncoder.isConfigSupported(encCfg)).supported; } catch (e) {}
  if (!encOk) { delete encCfg.bitrateMode; delete encCfg.latencyMode; try { encOk = (await VideoEncoder.isConfigSupported(encCfg)).supported; } catch (e) {} }
  if (!encOk) throw new UserErr("Ce navigateur ne sait pas encoder en H.264 à cette taille. Essayez une résolution plus basse, ou un autre navigateur (Chrome, Edge).");
  const frames = []; let encErr = null, bytes = 0;
  const LIMIT = 1.95e9 - (audio ? audio.pcm.byteLength : 0);
  const enc = new VideoEncoder({
    output: ch => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); frames.push({ data: b, key: ch.type === "key" }); bytes += b.byteLength + 24; },
    error: e => { encErr = e; }
  });
  enc.configure(encCfg);
  const gop = Math.max(1, Math.round(fps));
  const frameDurUs = Math.round(1e6 * scale / rate);
  let outIdx = 0, hasPrev = false;
  const emitUntil = async tUs => {
    if (!hasPrev) return;
    while (outIdx < totalOut && outTimeUs(outIdx) < tUs - 1) {
      if (encErr) throw encErr;
      const vf = new VideoFrame(canvas, { timestamp: Math.round(outTimeUs(outIdx)), duration: frameDurUs });
      enc.encode(vf, { keyFrame: outIdx % gop === 0 }); vf.close();
      outIdx++;
      while (enc.encodeQueueSize > 4 && !encErr) await sleep(2);
      if (bytes > LIMIT) throw new UserErr("Le fichier dépasserait 2 Go, la limite d'un AVI. Baissez la résolution ou la qualité, puis relancez.");
    }
    setP(0.12 + 0.85 * outIdx / totalOut, `Conversion des images… ${outIdx} / ${totalOut}`);
  };

  const pending = []; let wake = null, decErr = null, flushed = false, flushDone = false;
  const poke = () => { if (wake) { const w = wake; wake = null; w(); } };
  const dec = new VideoDecoder({ output: f => { pending.push(f); poke(); }, error: e => { decErr = e; poke(); } });
  dec.addEventListener && dec.addEventListener("dequeue", poke);
  dec.configure(cfg);
  let si = 0;
  while (si < vS.length && !vS[si].is_sync) si++;
  try {
    for (;;) {
      if (decErr) throw decErr;
      while (si < vS.length && dec.decodeQueueSize < 8 && pending.length < 3) {
        const s = vS[si++];
        dec.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp: Math.round((s.cts - minCts) * 1e6 / ts), duration: Math.round(s.duration * 1e6 / ts), data: s.data }));
        s.data = null;
      }
      if (si >= vS.length && !flushed) { flushed = true; dec.flush().then(() => { flushDone = true; poke(); }, e => { decErr = decErr || e; poke(); }); }
      if (pending.length) {
        const f = pending.shift();
        try { await emitUntil(f.timestamp); draw(f); hasPrev = true; } finally { f.close(); }
        continue;
      }
      if (flushDone) break;
      await Promise.race([new Promise(r => { wake = r; }), sleep(40)]);
    }
    await emitUntil(Infinity);
    if (!outIdx) throw new UserErr("Aucune image n'a pu être décodée.");
    await enc.flush();
    if (encErr) throw encErr;
  } finally {
    pending.forEach(f => f.close());
    try { dec.close(); } catch (e) {}
    try { enc.close(); } catch (e) {}
  }
  if (!frames.length || !frames[0].key) throw new UserErr("L'encodage H.264 n'a produit aucune image exploitable.");

  setP(0.98, "Assemblage du fichier AVI…");
  const blob = buildAvi({ W, H, rate, scale, frames, audio });
  const outName = file.name.replace(/\.[^.]+$/, "") + ".avi";
  const url = URL.createObjectURL(blob);
  li.classList.add("done");
  setState(li, "Prêt");
  status.textContent = `AVI de ${fmtSize(blob.size)}, téléchargé automatiquement.` + (at && !audio ? " Son illisible : fichier sans son." : "") + (audio && audio.downmixed ? " Son réduit en stéréo." : "");
  const btn = document.createElement("button");
  btn.className = "primary"; btn.type = "button"; btn.textContent = `Télécharger à nouveau (${fmtSize(blob.size)})`;
  btn.addEventListener("click", () => save(url, outName));
  li.querySelector(".actions").appendChild(btn);
  save(url, outName);
}
function save(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

/* ---------- AVI (RIFF, OpenDML-free AVI 1.0) writer ---------- */
function buildAvi({ W, H, rate, scale, frames, audio }) {
  const hdr = n => { const b = new ArrayBuffer(n); return [b, new DataView(b)]; };
  const cc = (dv, o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  const nStreams = audio ? 2 : 1;
  const blockAlign = audio ? audio.ch * 2 : 0;

  // movi payload
  const parts = [], index = [];
  let pos = 4, maxV = 0; // offsets relative to the 'movi' fourcc
  const chunk = (id, data, key = true) => {
    const [b, dv] = hdr(8); cc(dv, 0, id); dv.setUint32(4, data.byteLength, true);
    parts.push(b, data);
    index.push([id, pos, data.byteLength, key]);
    pos += 8 + data.byteLength;
    if (data.byteLength & 1) { parts.push(new Uint8Array(1)); pos += 1; }
  };
  let aPos = 0;
  const audioUpTo = i => audio ? Math.min(audio.samples, Math.round(i * audio.sr * scale / rate)) : 0;
  const pcmBytes = audio ? new Uint8Array(audio.pcm.buffer) : null;
  const aChunk = to => { if (to > aPos) { chunk("01wb", pcmBytes.subarray(aPos * blockAlign, to * blockAlign)); aPos = to; } };
  // a little audio preroll so players start with sound buffered
  aChunk(audioUpTo(1));
  for (let i = 0; i < frames.length; i++) {
    chunk("00dc", frames[i].data, frames[i].key);
    if (frames[i].data.byteLength > maxV) maxV = frames[i].data.byteLength;
    aChunk(audioUpTo(i + 2));
  }
  if (audio) while (aPos < audio.samples) aChunk(Math.min(audio.samples, aPos + audio.sr));
  const moviLen = pos; // includes 'movi' fourcc

  // idx1
  const [ib, idv] = hdr(8 + 16 * index.length);
  cc(idv, 0, "idx1"); idv.setUint32(4, 16 * index.length, true);
  index.forEach(([id, off, len, key], k) => { const o = 8 + 16 * k; cc(idv, o, id); idv.setUint32(o + 4, key ? 0x10 : 0, true); idv.setUint32(o + 8, off, true); idv.setUint32(o + 12, len, true); });

  // headers
  const strlV = 4 + (8 + 56) + (8 + 40);
  const strlA = audio ? 4 + (8 + 56) + (8 + 16) : 0;
  const hdrlLen = 4 + (8 + 56) + (8 + strlV) + (audio ? 8 + strlA : 0);
  const headLen = 12 + 8 + hdrlLen + 12; // RIFF hdr + hdrl LIST + movi LIST hdr
  const [hb, d] = hdr(headLen);
  const fileLen = headLen + (moviLen - 4) + ib.byteLength;
  let o = 0;
  const u32 = v => { d.setUint32(o, v >>> 0, true); o += 4; }, u16 = v => { d.setUint16(o, v, true); o += 2; }, i32 = v => { d.setInt32(o, v, true); o += 4; }, f = s => { cc(d, o, s); o += 4; };
  f("RIFF"); u32(fileLen - 8); f("AVI ");
  f("LIST"); u32(hdrlLen); f("hdrl");
  const usPerFrame = Math.round(1e6 * scale / rate);
  const vBps = Math.ceil(maxV * rate / scale);
  f("avih"); u32(56);
  u32(usPerFrame); u32(vBps + (audio ? audio.sr * blockAlign : 0)); u32(0); u32(0x10 | 0x100);
  u32(frames.length); u32(0); u32(nStreams); u32(maxV + 8 + (audio ? Math.ceil(audio.sr * blockAlign * 2 * scale / rate) : 0));
  u32(W); u32(H); u32(0); u32(0); u32(0); u32(0);
  // video stream
  f("LIST"); u32(strlV); f("strl");
  f("strh"); u32(56);
  f("vids"); f("H264"); u32(0); u16(0); u16(0); u32(0); u32(scale); u32(rate); u32(0); u32(frames.length); u32(maxV + 8); i32(-1); u32(0);
  u16(0); u16(0); u16(W); u16(H);
  f("strf"); u32(40);
  u32(40); i32(W); i32(H); u16(1); u16(24); f("H264"); u32(W * H * 3); i32(0); i32(0); u32(0); u32(0);
  if (audio) {
    f("LIST"); u32(strlA); f("strl");
    f("strh"); u32(56);
    f("auds"); u32(1); u32(0); u16(0); u16(0); u32(0); u32(1); u32(audio.sr); u32(0); u32(audio.samples); u32(audio.sr * blockAlign); i32(-1); u32(blockAlign);
    u16(0); u16(0); u16(0); u16(0);
    f("strf"); u32(16);
    u16(1); u16(audio.ch); u32(audio.sr); u32(audio.sr * blockAlign); u16(blockAlign); u16(16);
  }
  f("LIST"); u32(moviLen); f("movi");
  if (o !== headLen) throw new Error("AVI header size mismatch " + o + " vs " + headLen);
  return new Blob([hb, ...parts, ib], { type: "video/avi" });
}

})();
