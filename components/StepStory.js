"use client";

import { useState } from "react";
import { STYLES, DURATIONS, LANGS } from "../lib/prompts";
import { api, uid } from "../lib/api";

export default function StepStory({ p, set, goStep }) {
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});
  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const setMsgKey = (k, v) => setMsg((m) => ({ ...m, [k]: v }));

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

  const canSplit = p.story.trim().length >= 30 && !busy.scenes;
  const hasScenes = p.scenes.length > 0;

  return (
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
          {p.story.trim() ? p.story.trim().split(/\s+/).length : 0} kata. Kamu bebas mengedit hasil
          AI sebelum lanjut.
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
          <button type="button" className="btn btn-primary" onClick={splitScenes} disabled={!canSplit}>
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
  );
}
