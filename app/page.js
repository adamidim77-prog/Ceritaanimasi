"use client";

import { useEffect, useRef, useState } from "react";
import { loadProject, saveProject, clearProject } from "../lib/store";
import { EMPTY, todayKey } from "../lib/api";
import StepStory from "../components/StepStory";
import StepScenes from "../components/StepScenes";
import StepVoice from "../components/StepVoice";
import StepVideo from "../components/StepVideo";

export default function Home() {
  const [p, setP] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [usage, setUsage] = useState(0);
  const [toast, setToast] = useState("");
  const [resetKey, setResetKey] = useState(0);
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
  const goStep = (n) => {
    set({ step: n });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function showToast(t) {
    setToast(t);
    setTimeout(() => setToast(""), 2000);
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} disalin`);
    } catch {
      window.prompt("Salin teks ini:", text);
    }
  }

  async function newProject() {
    if (!window.confirm("Mulai proyek baru? Proyek yang sekarang akan dihapus dari perangkat ini."))
      return;
    try {
      await clearProject();
    } catch {}
    setP(EMPTY);
    setResetKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }

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

  const common = { p, set, setScene, goStep, copyText };

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
        <StepStory key={resetKey} {...common} />
      ) : p.step === 2 ? (
        <StepScenes key={resetKey} {...common} usage={usage} setUsage={setUsage} />
      ) : p.step === 3 ? (
        <StepVoice key={resetKey} {...common} />
      ) : (
        <StepVideo key={resetKey} {...common} />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
    }
