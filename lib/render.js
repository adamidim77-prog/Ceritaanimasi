// Render video vertikal 9:16 langsung di browser.
// Gambar dianimasikan (zoom/geser), diberi subtitle, lalu direkam bersama suara memakai MediaRecorder.
// Perekaman berjalan real-time: video 60 detik butuh sekitar 60 detik.

const FADE = 0.5; // detik, transisi antar adegan
const SUB_WORDS = 5; // jumlah kata per potongan subtitle

export function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const options = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of options) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function chunkWords(words, size = SUB_WORDS) {
  const out = [];
  for (let i = 0; i < words.length; i += size) {
    out.push(words.slice(i, i + size).join(" "));
  }
  return out;
}

export function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {}
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

async function decodeAudio(actx, dataUrl) {
  const ab = await (await fetch(dataUrl)).arrayBuffer();
  return await actx.decodeAudioData(ab);
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

function drawScene(ctx, item, idx, localT, W, H, alpha) {
  const bw = item.bitmap.width;
  const bh = item.bitmap.height;
  const p = ease(Math.min(Math.max(localT / item.dur, 0), 1));
  const mode = idx % 4;
  const ZOOM = 1.14;
  let scale;
  let fx = 0.5; // posisi horizontal jendela potong (0..1)
  if (mode === 0) scale = lerp(1, ZOOM, p); // zoom in
  else if (mode === 1) scale = lerp(ZOOM, 1, p); // zoom out
  else {
    scale = ZOOM; // geser kiri ke kanan atau sebaliknya
    fx = mode === 2 ? p : 1 - p;
  }
  const sw = bw / scale;
  const sh = bh / scale;
  const sx = (bw - sw) * fx;
  const sy = (bh - sh) / 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(item.bitmap, sx, sy, sw, sh, 0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawSubtitle(ctx, item, localT, W, H, fontFamily) {
  if (!item.chunks.length || localT < 0 || localT > item.dur) return;
  const span = Math.max(item.dur - 0.4, 0.5);
  const per = span / item.chunks.length;
  const i = Math.min(Math.floor(Math.max(localT - 0.15, 0) / per), item.chunks.length - 1);
  const text = item.chunks[i];
  const fs = Math.round(W * 0.07);
  ctx.font = `800 ${fs}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const lines = wrapLines(ctx, text, W * 0.86);
  const lh = fs * 1.25;
  const bottom = H * 0.8;
  const top = bottom - (lines.length - 1) * lh;
  ctx.lineJoin = "round";
  ctx.lineWidth = fs * 0.2;
  ctx.strokeStyle = "rgba(0,0,0,0.92)";
  ctx.fillStyle = "#ffffff";
  lines.forEach((ln, k) => {
    const y = top + k * lh;
    ctx.strokeText(ln, W / 2, y);
    ctx.fillText(ln, W / 2, y);
  });
}

export async function renderVideo({
  scenes,
  music,
  quality = "720",
  fontFamily = "system-ui, sans-serif",
  signal,
  onProgress,
}) {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("Browser ini belum mendukung perekaman video. Pakai Chrome terbaru.");
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  const W = quality === "1080" ? 1080 : 720;
  const H = quality === "1080" ? 1920 : 1280;

  const cleanup = [];
  try {
    // ---- siapkan bahan ----
    const items = [];
    for (const s of scenes) {
      if (signal?.aborted) throw new Error("Dibatalkan.");
      const bitmap = await loadBitmap(s.image);
      let buffer = null;
      if (s.audio) {
        try {
          buffer = await decodeAudio(actx, s.audio);
        } catch {
          buffer = null;
        }
      }
      const words = (s.narasi || "").trim().split(/\s+/).filter(Boolean);
      const dur = buffer ? buffer.duration + 0.5 : Math.max(3, words.length / 2.3 + 0.8);
      items.push({ bitmap, buffer, dur, chunks: chunkWords(words) });
    }
    let acc = 0;
    for (const it of items) {
      it.start = acc;
      acc += it.dur;
    }
    const total = acc + 0.3;

    let musicBuffer = null;
    if (music) {
      try {
        musicBuffer = await decodeAudio(actx, music);
      } catch {
        musicBuffer = null;
      }
    }

    // ---- canvas dan perekam ----
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const dest = actx.createMediaStreamDestination();
    const stream = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    const mime = pickMime();
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: quality === "1080" ? 8_000_000 : 5_000_000,
      audioBitsPerSecond: 128_000,
    });
    const parts = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) parts.push(e.data);
    };
    const finished = new Promise((resolve, reject) => {
      rec.onstop = () =>
        resolve(new Blob(parts, { type: (mime || "video/webm").split(";")[0] }));
      rec.onerror = (e) => reject(e.error || new Error("Perekaman gagal."));
    });

    const draw = (t) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      let idx = items.findIndex((it) => t >= it.start && t < it.start + it.dur);
      if (idx < 0) idx = t < 0 ? 0 : items.length - 1;
      const cur = items[idx];
      drawScene(ctx, cur, idx, t - cur.start, W, H, 1);
      const next = items[idx + 1];
      const untilEnd = cur.start + cur.dur - t;
      if (next && untilEnd < FADE) {
        drawScene(ctx, next, idx + 1, 0, W, H, 1 - untilEnd / FADE);
      }
      drawSubtitle(ctx, cur, t - cur.start, W, H, fontFamily);
    };

    // ---- jadwalkan suara ----
    await actx.resume();
    const t0 = actx.currentTime + 0.4;
    items.forEach((it) => {
      if (!it.buffer) return;
      const src = actx.createBufferSource();
      src.buffer = it.buffer;
      src.connect(dest);
      src.start(t0 + it.start + 0.1);
    });
    let musicSrc = null;
    if (musicBuffer) {
      musicSrc = actx.createBufferSource();
      musicSrc.buffer = musicBuffer;
      musicSrc.loop = true;
      const gain = actx.createGain();
      gain.gain.value = 0.12;
      musicSrc.connect(gain);
      gain.connect(dest);
      musicSrc.start(t0);
      musicSrc.stop(t0 + total + 0.2);
    }

    draw(0);
    rec.start(1000);

    // ---- jalankan animasi mengikuti jam audio ----
    await new Promise((resolve, reject) => {
      let lastPct = -1;
      const frame = () => {
        if (signal?.aborted) {
          reject(new Error("Dibatalkan."));
          return;
        }
        const t = actx.currentTime - t0;
        if (t >= total) {
          resolve();
          return;
        }
        draw(Math.max(0, t));
        const pct = Math.floor((Math.max(0, t) / total) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress?.(pct / 100);
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }).catch((err) => {
      try {
        rec.state !== "inactive" && rec.stop();
      } catch {}
      throw err;
    });

    draw(total - 0.01);
    await new Promise((r) => setTimeout(r, 400));
    rec.stop();
    const blob = await finished;
    onProgress?.(1);
    stream.getTracks().forEach((t) => t.stop());
    return { blob, ext: blob.type.includes("mp4") ? "mp4" : "webm", duration: total };
  } finally {
    try {
      await actx.close();
    } catch {}
    cleanup.forEach((fn) => fn());
  }
}
