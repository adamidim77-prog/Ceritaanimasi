"use client";

import { useEffect, useRef, useState } from "react";
import { STYLES, DURATIONS, LANGS, buildImagePrompt } from "../lib/prompts";
import { loadProject, saveProject, clearProject } from "../lib/store";
import { fitToPortrait, fileToDataUrl } from "../lib/image";
import { renderVideo } from "../lib/render";

const VOICES = [
  { id: "Kore", label: "Wanita, tegas" },
  { id: "Aoede", label: "Wanita, ringan" },
  { id: "Puck", label: "Pria, ceria" },
  { id: "Charon", label: "Pria, tenang" },
];

const EMPTY = {
  idea: "",
  story: "",
  lang: "Bahasa Indonesia",
  style: "flat",
  durasi: 60,
  character: "",
  scenes: [],
  step: 1,
  voice: "Kore",
  music: "",
  musicName: "",
  quality: "720",
  meta: null,
};

const IDLE = { status: "idle", progress: 0, url: "", ext: "", msg: "" };

const uid = () => Math.random().toString(36).slice(2, 9);
const todayKey = () => new Date().toLocaleDateString("sv-SE");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const [render, setRender] = useState(IDLE);
  const saveTimer = useRef(null);
  const stopAll = useRef(false);
  const abortRef = useRef(null);

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

  // bersihkan URL video saat halaman ditutup
  useEffect(() => {
    return () => {
      if (render.url) URL.revokeObjectURL(render.url);
    };
  }, [render.url]);

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
  const goStep = (n) => {
    set({ step: n });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} disalin`);
    } catch {
      window.prompt("Salin teks ini:", text);
    }
  }

  /* ---------- langkah 1 ---------- */
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
      p.scenes.some((s) => s.image || s.audio) &&
      !window.confirm("Memecah ulang akan menghapus gambar dan suara adegan yang sudah ada. Lanjutkan?")
    )
      return;
    setMsgKey("scenes", "");
    setBusyKey("scenes", true);
    try {
      const count = DURATIONS.find((d) => d.value === p.durasi)?.scenes || 8;
      const d = await api("/api/scenes", { story: p.story, lang: p.lang, count });
      set({
        character: d.character,
        scenes: d.scenes.map((s) => ({
          id: uid(),
          narasi: s.narasi,
          prompt: s.prompt,
          image: "",
          audio: "",
        })),
        step: 2,
        meta: null,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsgKey("scenes", e.message);
    } finally {
      setBusyKey("scenes", false);
    }
  }

  /* ---------- langkah 2 ---------- */
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
    copyText(text, "Prompt");
  }

  function addScene() {
    set({
      scenes: [...p.scenes, { id: uid(), narasi: "", prompt: "", image: "", audio: "" }],
    });
  }

  function removeScene(id) {
    if (!window.confirm("Hapus adegan ini?")) return;
    set({ scenes: p.scenes.filter((s) => s.id !== id) });
  }

  /* ---------- langkah 3 ---------- */
  async function makeVoice(s) {
    const key = "a" + s.id;
    setMsgKey(key, "");
    setBusyKey(key, true);
    try {
      const d = await api("/api/tts", { text: s.narasi, voice: p.voice });
      setScene(s.id, { audio: `data:${d.mime};base64,${d.data}` });
    } catch (e) {
      setMsgKey(
        key,
        e.status === 429
          ? `${e.message} Pakai Upload suara (rekaman sendiri atau buatan aplikasi lain).`
          : e.message
      );
    } finally {
      setBusyKey(key, false);
    }
  }

  async function makeAllVoices() {
    return sum + (s.audio ? 8 : Math.max(3, words / 2.3 + 0.8));
    }, 0)
  );
  const canSplit = p.story.trim().length >= 30 && !busy.scenes;
  const hasScenes = p.scenes.length > 0;

  const stepBtn = (n, title, disabled) => (
    <li>
      <button
        type="button"
        className="step"
        aria-current={p.step === n ? "step" : undefined}
        disabled={disabled}
        onClick={() => goStep(n)}
      >
        <b>{n}</b>
        <span>{title}</span>
      </button>
    </li>
  );

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
        {stepBtn(1, "Cerita", false)}
        {stepBtn(2, "Adegan", !hasScenes)}
        {stepBtn(3, "Suara", !hasScenes)}
        {stepBtn(4, "Video", !hasScenes)}
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
              {hasScenes && (
                <button type="button" className="btn" onClick={() => goStep(2)}>
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
      ) : p.step === 2 ? (
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
              <button type="button" className="btn" onClick={() => goStep(1)}>
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
            <button type="button" className="btn btn-primary" onClick={() => goStep(3)}>
              Lanjut ke Suara
            </button>
          </div>
          <p className="note">
            Adegan tanpa gambar akan dilewati saat video dibuat. Untuk menghemat kuota, buat gambar
            satu per satu atau upload gambar buatan sendiri.
          </p>
        </section>
      ) : p.step === 3 ? (
        <section aria-labelledby="h-suara" style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <h2 id="h-suara">Suara narasi</h2>
            <div className="summary">
              <span>
                <b>{doneAudio}</b> dari <b>{p.scenes.length}</b> suara siap
              </span>
            </div>

            <div className="field">
              <span className="label">Pilih suara AI</span>
              <div className="chips">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="chip"
                    aria-pressed={p.voice === v.id}
                    onClick={() => set({ voice: v.id })}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="hint">
                Ganti suara hanya berlaku untuk suara yang dibuat sesudahnya. Buat ulang adegan yang
    stopAll.current = false;
    setMsgKey("voices", "");
    setBusyKey("all", true);
    try {
      for (let i = 0; i < p.scenes.length; i++) {
        const s = p.scenes[i];
        if (stopAll.current) break;
        if (s.audio || !s.narasi.trim()) continue;
        const key = "a" + s.id;
        setBusyKey(key, true);
        try {
          const d = await api("/api/tts", { text: s.narasi, voice: p.voice });
          setScene(s.id, { audio: `data:${d.mime};base64,${d.data}` });
        } catch (e) {
          setMsgKey(key, e.message);
          setMsgKey("voices", `Berhenti di adegan ${i + 1}: ${e.message}`);
          break;
        } finally {
          setBusyKey(key, false);
        }
        await wait(1500);
      }
    } finally {
      setBusyKey("all", false);
    }
  }

  async function onAudioFile(s, file) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMsgKey("a" + s.id, "File harus berupa audio (MP3, WAV, M4A).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setMsgKey("a" + s.id, "File audio terlalu besar (maksimal 15 MB).");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setScene(s.id, { audio: url });
      setMsgKey("a" + s.id, "");
    } catch (e) {
      setMsgKey("a" + s.id, e.message);
    }
  }

  async function onMusicFile(file) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMsgKey("music", "File harus berupa audio (MP3, WAV, M4A).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setMsgKey("music", "File musik terlalu besar (maksimal 15 MB).");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      set({ music: url, musicName: file.name });
      setMsgKey("music", "");
    } catch (e) {
      setMsgKey("music", e.message);
    }
  }

  /* ---------- langkah 4 ---------- */
  async function doRender() {
    const usable = p.scenes.filter((s) => s.image);
    if (!usable.length) {
      setRender({ ...IDLE, status: "error", msg: "Belum ada adegan yang punya gambar." });
      return;
    }
    if (render.url) URL.revokeObjectURL(render.url);
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

  async function newProject() {
    if (!window.confirm("Mulai proyek baru? Proyek yang sekarang akan dihapus dari perangkat ini."))
      return;
    try {
      await clearProject();
    } catch {}
    abortRef.current?.abort();
    setP(EMPTY);
    setMsg({});
    setRender(IDLE);
    window.scrollTo({ top: 0 });
  }

  const doneImages = p.scenes.filter((s) => s.image).length;
  const doneAudio = p.scenes.filter((s) => s.audio).length;
  const usableScenes = p.scenes.filter((s) => s.image);
  const estSeconds = Math.round(
    usableScenes.reduce((sum, s) => {
      const words = (s.narasi || "").trim().split(/\s+/).filter(Boolean).length;
