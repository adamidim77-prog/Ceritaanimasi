"use client";

import { useEffect, useRef, useState } from "react";
import { STYLES, DURATIONS, LANGS, buildImagePrompt } from "../lib/prompts";
import { loadProject, saveProject, clearProject } from "../lib/store";
import { fitToPortrait, fileToDataUrl } from "../lib/image";

const EMPTY = {
  idea: "",
  story: "",
  lang: "Bahasa Indonesia",
  style: "flat",
  durasi: 60,
  character: "",
  scenes: [],
  step: 1,
};

const uid = () => Math.random().toString(36).slice(2, 9);
const todayKey = () => new Date().toLocaleDateString("sv-SE");

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Tidak ada koneksi ke server. Cek internet lalu coba lagi.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Terjadi kesalahan (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export default function Home() {
  const [p, setP] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});
  const [usage, setUsage] = useState(0);
  const [toast, setToast] = useState("");
  const saveTimer = useRef(null);

  // muat proyek dan hitungan gambar AI hari ini
  useEffect(() => {
    (async () => {
      try {
        const saved = await loadProject();
        if (saved) setP({ ...EMPTY, ...saved });
      } catch {}
      try {
        const u = JSON.parse(localStorage.getItem("ca_usage") || "{}");
        if (u.date === todayKey()) setUsage(u.count || 0);
      } catch {}
      setReady(true);
    })();
  }, []);

  // simpan proyek otomatis
  useEffect(() => {
    if (!ready) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProject(p).catch(() => {});
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [p, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("ca_usage", JSON.stringify({ date: todayKey(), count: usage }));
    } catch {}
  }, [usage, ready]);

  const set = (patch) => setP((prev) => ({ ...prev, ...patch }));
  const setScene = (id, patch) =>
    setP((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const setMsgKey = (k, v) => setMsg((m) => ({ ...m, [k]: v }));
  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 2000);
  };

  async function writeStory() {
    setMsgKey("story", "");
    setBusyKey("story", true);
    try {
      const d = await api("/api/story", {
        idea: p.idea,
        lang: p.lang,
        style: p.style,
        durasi: p.durasi,
      });
      set({ story: d.story });
    } catch (e) {
      setMsgKey("story", e.message);
    } finally {
      setBusyKey("story", false);
    }
  }

  async function splitScenes() {
    if (
      p.scenes.some((s) => s.image) &&
      !window.confirm("Memecah ulang akan menghapus gambar adegan yang sudah ada. Lanjutkan?")
    )
      return;
    setMsgKey("scenes", "");
    setBusyKey("scenes", true);
    try {
      const count = DURATIONS.find((d) => d.value === p.durasi)?.scenes || 8;
      const d = await api("/api/scenes", { story: p.story, lang: p.lang, count });
      set({
        character: d.character,
        scenes: d.scenes.map((s) => ({ id: uid(), narasi: s.narasi, prompt: s.prompt, image: "" })),
        step: 2,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsgKey("scenes", e.message);
    } finally {
      setBusyKey("scenes", false);
    }
  }

  async function makeImage(s) {
    setMsgKey(s.id, "");
    setBusyKey(s.id, true);
    try {
      const d = await api("/api/image", {
        prompt: s.prompt,
        character: p.character,
        style: p.style,
      });
      const img = await fitToPortrait(`data:${d.mime};base64,${d.data}`);
      setScene(s.id, { image: img });
      setUsage((u) => u + 1);
    } catch (e) {
      setMsgKey(
        s.id,
        e.status === 429
          ? `${e.message} Pakai Salin prompt, buat gambar di aplikasi Gemini, lalu Upload gambar.`
          : e.message
      );
    } finally {
      setBusyKey(s.id, false);
    }
  }

  async function onFile(s, file) {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) {
      setMsgKey(s.id, "Format harus JPG, PNG, atau WebP.");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      const img = await fitToPortrait(url);
      setScene(s.id, { image: img });
      setMsgKey(s.id, "");
    } catch (e) {
      setMsgKey(s.id, e.message);
    }
  }

  async function copyPrompt(s) {
    const text = buildImagePrompt({ style: p.style, character: p.character, prompt: s.prompt });
    try {
      await navigator.clipboard.writeText(text);
      showToast("Prompt disalin");
    } catch {
      window.prompt("Salin prompt ini:", text);
    }
  }

  function addScene() {
    set({ scenes: [...p.scenes, { id: uid(), narasi: "", prompt: "", image: "" }] });
  }

  function removeScene(id) {
    if (!window.confirm("Hapus adegan ini?")) return;
    set({ scenes: p.scenes.filter((s) => s.id !== id) });
  }

  async function newProject() {
    if (!window.confirm("Mulai proyek baru? Proyek yang sekarang akan dihapus dari perangkat ini."))
      return;
    try {
      await clearProject();
    } catch {}
    setP(EMPTY);
    setMsg({});
    window.scrollTo({ top: 0 });
  }

  const doneImages = p.scenes.filter((s) => s.image).length;
  const canSplit = p.story.trim().length >= 30 && !busy.scenes;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>CeritaAnimasi</h1>
          <p>Tulis cerita, jadikan adegan bergambar, lalu video vertikal siap upload.</p>
        </div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={newProject}>
          Proyek baru
        </button>
      </header>

      <ol className="stepper" aria-label="Langkah">
        <li>
          <button
            type="button"
            className="step"
            aria-current={p.step === 1 ? "step" : undefined}
            onClick={() => set({ step: 1 })}
          >
            <b>1</b>
            <span>Cerita</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="step"
            aria-current={p.step === 2 ? "step" : undefined}
            disabled={p.scenes.length === 0}
            onClick={() => set({ step: 2 })}
          >
            <b>2</b>
            <span>Adegan</span>
          </button>
        </li>
        <li>
          <button type="button" className="step" disabled>
            <b>3</b>
            <span>Suara</span>
            <small>Menyusul</small>
          </button>
        </li>
        <li>
          <button type="button" className="step" disabled>
            <b>4</b>
            <span>Video</span>
            <small>Menyusul</small>
          </button>
        </li>
      </ol>

      {!ready ? (
        <p className="hint">Memuat proyek...</p>
      ) : p.step === 1 ? (
        <section className="card" aria-labelledby="h-cerita">
          <h2 id="h-cerita">Tulis ceritamu</h2>

          <div className="field">
            <label htmlFor="idea">Ide atau topik</label>
            <textarea
              id="idea"
              rows={2}
              placeholder="Contoh: semut kecil yang tidak mau menyerah membawa remah roti walau hujan turun"
              value={p.idea}
              onChange={(e) => set({ idea: e.target.value })}
            />
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={writeStory}
                disabled={busy.story || !p.idea.trim()}
              >
                {busy.story ? "Menulis cerita..." : "Buatkan cerita dengan AI"}
              </button>
            </div>
            {msg.story && <p className="err">{msg.story}</p>}
          </div>

          <div className="field">
            <label htmlFor="story">Cerita</label>
            <textarea
              id="story"
              rows={9}
              placeholder="Tulis ceritamu sendiri di sini, atau buat dengan AI di atas."
              value={p.story}
              onChange={(e) => set({ story: e.target.value })}
            />
            <p className="hint">
              {p.story.trim() ? p.story.trim().split(/\s+/).length : 0} kata. Kamu bebas mengedit
              hasil AI sebelum lanjut.
            </p>
          </div>

          <div className="row two">
            <div className="field">
              <label htmlFor="lang">Bahasa</label>
              <select id="lang" value={p.lang} onChange={(e) => set({ lang: e.target.value })}>
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Durasi video</span>
              <div className="chips">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className="chip"
                    aria-pressed={p.durasi === d.value}
                    onClick={() => set({ durasi: d.value })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <span className="label">Gaya gambar</span>
            <div className="chips">
              {Object.entries(STYLES).map(([key, st]) => (
                <button
                  key={key}
                  type="button"
                  className="chip"
                  aria-pressed={p.style === key}
                  onClick={() => set({ style: key })}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={splitScenes}
                disabled={!canSplit}
              >
                {busy.scenes ? "Memecah adegan..." : "Pecah jadi adegan"}
              </button>
              {p.scenes.length > 0 && (
                <button type="button" className="btn" onClick={() => set({ step: 2 })}>
                  Kembali ke adegan
                </button>
              )}
            </div>
            {p.story.trim().length < 30 && (
              <p className="hint">Cerita minimal 30 karakter sebelum bisa dipecah.</p>
            )}
            {msg.scenes && <p className="err">{msg.scenes}</p>}
          </div>
        </section>
      ) : (
        <section aria-labelledby="h-adegan" style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <h2 id="h-adegan">Adegan dan gambar</h2>
            <div className="summary">
              <span>
                <b>{p.scenes.length}</b> adegan
              </span>
              <span>
                <b>{doneImages}</b> gambar siap
              </span>
              <span>
                Gambar AI hari ini: <b>{usage}</b>
              </span>
            </div>

            <div className="field">
              <label htmlFor="char">Tokoh dan suasana (bahasa Inggris)</label>
              <textarea
                id="char"
                rows={3}
                value={p.character}
                onChange={(e) => set({ character: e.target.value })}
              />
              <p className="hint">
                Teks ini disisipkan ke semua prompt gambar supaya tokoh tetap sama di setiap adegan.
              </p>
            </div>

            <div className="actions">
              <button type="button" className="btn" onClick={() => set({ step: 1 })}>
                Ubah cerita
              </button>
            </div>
          </div>

          <ol className="scenes">
            {p.scenes.map((s, i) => (
              <li key={s.id} className="scene">
                <div
                  className={`frame${s.image ? " has" : ""}${busy[s.id] ? " loading" : ""}`}
                  aria-live="polite"
                >
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt={`Gambar adegan ${i + 1}`} />
                  ) : busy[s.id] ? (
                    <span>Membuat gambar...</span>
                  ) : (
                    <span>Belum ada gambar</span>
                  )}
                  <span className="num">{i + 1}</span>
                </div>

                <div className="scene-body">
                  <div className="field">
                    <label htmlFor={`n-${s.id}`}>Narasi</label>
                    <textarea
                      id={`n-${s.id}`}
                      value={s.narasi}
                      onChange={(e) => setScene(s.id, { narasi: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`p-${s.id}`}>Prompt gambar (bahasa Inggris)</label>
                    <textarea
                      id={`p-${s.id}`}
                      value={s.prompt}
                      onChange={(e) => setScene(s.id, { prompt: e.target.value })}
                    />
                  </div>

                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => makeImage(s)}
                      disabled={busy[s.id] || !s.prompt.trim()}
                    >
                      {s.image ? "Buat ulang gambar AI" : "Buat gambar AI"}
                    </button>
                    <label className="btn btn-sm" style={{ cursor: "pointer" }}>
                      Upload gambar
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={(e) => {
                          onFile(s, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button type="button" className="btn btn-sm" onClick={() => copyPrompt(s)}>
                      Salin prompt
                    </button>
                    {s.image && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => setScene(s.id, { image: "" })}
                      >
                        Hapus gambar
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeScene(s.id)}
                    >
                      Hapus adegan
                    </button>
                  </div>
                  {msg[s.id] && <p className="err">{msg[s.id]}</p>}
                </div>
              </li>
            ))}
          </ol>

          <div className="actions">
            <button type="button" className="btn" onClick={addScene}>
              Tambah adegan
            </button>
          </div>

          <p className="note">
            Langkah 3 (suara narasi) dan langkah 4 (render video) dibuat setelah langkah 1 dan 2
            berjalan lancar. Untuk menghemat kuota, buat gambar satu per satu atau upload gambar
            buatan sendiri.
          </p>
        </section>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
      }
