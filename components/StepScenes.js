"use client";

import { useState } from "react";
import { buildImagePrompt } from "../lib/prompts";
import { fitToPortrait, fileToDataUrl } from "../lib/image";
import { api, uid } from "../lib/api";

export default function StepScenes({ p, set, setScene, goStep, copyText, usage, setUsage }) {
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});
  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const setMsgKey = (k, v) => setMsg((m) => ({ ...m, [k]: v }));

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

  function copyPrompt(s) {
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

  const doneImages = p.scenes.filter((s) => s.image).length;

  return (
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
        Adegan tanpa gambar akan dilewati saat video dibuat. Untuk menghemat kuota, buat gambar satu
        per satu atau upload gambar buatan sendiri.
      </p>
    </section>
  );
    }
