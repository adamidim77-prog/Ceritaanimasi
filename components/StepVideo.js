"use client";

import { useEffect, useRef, useState } from "react";
import { renderVideo } from "../lib/render";
import { api } from "../lib/api";

const IDLE = { status: "idle", progress: 0, url: "", ext: "", msg: "" };

export default function StepVideo({ p, set, goStep, copyText }) {
  const [render, setRender] = useState(IDLE);
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});
  const abortRef = useRef(null);
  const urlRef = useRef("");
  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const setMsgKey = (k, v) => setMsg((m) => ({ ...m, [k]: v }));

  // hentikan render dan bersihkan video kalau halaman ini ditinggalkan
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function doRender() {
    const usable = p.scenes.filter((s) => s.image);
    if (!usable.length) {
      setRender({ ...IDLE, status: "error", msg: "Belum ada adegan yang punya gambar." });
      return;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setRender({ ...IDLE, status: "running" });
    let lock = null;
    try {
      lock = await navigator.wakeLock?.request("screen");
    } catch {}
    try {
      const fontFamily = getComputedStyle(document.body).fontFamily;
      const r = await renderVideo({
        scenes: usable,
        music: p.music,
        quality: p.quality,
        fontFamily,
        signal: ac.signal,
        onProgress: (v) => setRender((x) => ({ ...x, progress: v })),
      });
      const url = URL.createObjectURL(r.blob);
      urlRef.current = url;
      setRender({ status: "done", progress: 1, url, ext: r.ext, msg: "" });
    } catch (e) {
      setRender({ ...IDLE, status: "error", msg: e.message || "Render gagal." });
    } finally {
      try {
        lock?.release();
      } catch {}
    }
  }

  async function makeMeta() {
    setMsgKey("meta", "");
    setBusyKey("meta", true);
    try {
      const d = await api("/api/meta", { story: p.story, lang: p.lang });
      set({ meta: d });
    } catch (e) {
      setMsgKey("meta", e.message);
    } finally {
      setBusyKey("meta", false);
    }
  }

  const usable = p.scenes.filter((s) => s.image);
  const skipped = p.scenes.length - usable.length;
  const estSeconds = Math.round(
    usable.reduce((sum, s) => {
      const words = (s.narasi || "").trim().split(/\s+/).filter(Boolean).length;
      return sum + (s.audio ? 8 : Math.max(3, words / 2.3 + 0.8));
    }, 0)
  );
  const pct = Math.round(render.progress * 100);

  return (
    <section aria-labelledby="h-video" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h2 id="h-video">Buat video</h2>
        <div className="summary">
          <span>
            <b>{usable.length}</b> adegan dipakai
          </span>
          {skipped > 0 && (
            <span>
              <b>{skipped}</b> adegan dilewati (belum ada gambar)
            </span>
          )}
          <span>
            Perkiraan durasi: <b>{estSeconds} detik</b>
          </span>
        </div>

        <div className="field">
          <span className="label">Kualitas</span>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={p.quality === "720"}
              onClick={() => set({ quality: "720" })}
            >
              720p (stabil, disarankan)
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={p.quality === "1080"}
              onClick={() => set({ quality: "1080" })}
            >
              1080p (lebih tajam, berat)
            </button>
          </div>
        </div>

        <p className="note">
          Video direkam langsung di browser dan berjalan real-time, jadi durasinya sama dengan lama
          proses. Selama proses, jangan pindah tab, jangan kunci layar, dan jangan tutup halaman ini.
        </p>

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={doRender}
            disabled={render.status === "running" || usable.length === 0}
          >
            {render.status === "running"
              ? "Sedang merender..."
              : render.status === "done"
              ? "Buat ulang video"
              : "Buat video"}
          </button>
          {render.status === "running" && (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
              Batalkan
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => goStep(3)}>
            Kembali
          </button>
        </div>

        {render.status === "running" && (
          <div className="field" role="status" aria-live="polite">
            <div
              className="bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="hint">{pct}% selesai</p>
          </div>
        )}
        {render.status === "error" && <p className="err">{render.msg}</p>}
      </div>

      {render.status === "done" && (
        <div className="card">
          <h2>Video siap</h2>
          <video className="player" src={render.url} controls playsInline />
          <div className="actions">
            <a
              className="btn btn-primary"
              href={render.url}
              download={`cerita-animasi.${render.ext}`}
            >
              Download video ({render.ext.toUpperCase()})
            </a>
          </div>
          {render.ext === "webm" && (
            <p className="hint">
              Browser ini menghasilkan format WebM. YouTube menerimanya, tapi Instagram biasanya butuh
              MP4. Ubah dulu lewat CapCut atau pengubah video online, atau pakai Chrome terbaru yang
              bisa langsung menghasilkan MP4.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Teks untuk upload</h2>
        <p className="hint">
          Judul, deskripsi, dan hashtag untuk kamu tempel saat upload sendiri ke YouTube dan
          Instagram.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={makeMeta}
            disabled={busy.meta || p.story.trim().length < 20}
          >
            {busy.meta ? "Membuat..." : p.meta ? "Buat ulang teks" : "Buatkan judul dan hashtag"}
          </button>
        </div>
        {msg.meta && <p className="err">{msg.meta}</p>}
        {p.meta &&
          [
            ["Judul", "title"],
            ["Deskripsi", "description"],
            ["Hashtag", "hashtags"],
          ].map(([label, key]) => (
            <div key={key} className="copyrow">
              <label htmlFor={`m-${key}`}>{label}</label>
              <textarea
                id={`m-${key}`}
                rows={key === "description" ? 4 : 2}
                value={p.meta[key] || ""}
                onChange={(e) => set({ meta: { ...p.meta, [key]: e.target.value } })}
              />
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => copyText(p.meta[key] || "", label)}
                >
                  Salin {label.toLowerCase()}
                </button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
