"use client";

import { useEffect, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/image";
import { api, wait, VOICES } from "../lib/api";

const MAX_AUDIO = 15 * 1024 * 1024;

export default function StepVoice({ p, set, setScene, goStep }) {
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});
  const stopAll = useRef(false);
  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const setMsgKey = (k, v) => setMsg((m) => ({ ...m, [k]: v }));

  useEffect(() => {
    return () => {
      stopAll.current = true;
    };
  }, []);

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
    const key = "a" + s.id;
    if (!file.type.startsWith("audio/")) {
      setMsgKey(key, "File harus berupa audio (MP3, WAV, M4A).");
      return;
    }
    if (file.size > MAX_AUDIO) {
      setMsgKey(key, "File audio terlalu besar (maksimal 15 MB).");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setScene(s.id, { audio: url });
      setMsgKey(key, "");
    } catch (e) {
      setMsgKey(key, e.message);
    }
  }

  async function onMusicFile(file) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMsgKey("music", "File harus berupa audio (MP3, WAV, M4A).");
      return;
    }
    if (file.size > MAX_AUDIO) {
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

  const doneAudio = p.scenes.filter((s) => s.audio).length;

  return (
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
            Ganti suara hanya berlaku untuk suara yang dibuat sesudahnya. Buat ulang adegan yang lama
            kalau mau disamakan.
          </p>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={makeAllVoices}
            disabled={busy.all}
          >
            {busy.all ? "Membuat suara..." : "Buat semua suara"}
          </button>
          {busy.all && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopAll.current = true;
              }}
            >
              Berhenti
            </button>
          )}
        </div>
        {msg.voices && <p className="err">{msg.voices}</p>}
        <p className="hint">
          Suara AI juga memakai kuota. Kalau habis, upload rekaman sendiri di tiap adegan. Adegan
          tanpa suara tetap masuk video (tanpa narasi, hanya subtitle).
        </p>
      </div>

      <ol className="scenes">
        {p.scenes.map((s, i) => (
          <li key={s.id} className="vrow">
            <div className="thumb">
              {s.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <div className="scene-body">
              <p>
                <b>Adegan {i + 1}.</b> {s.narasi || "(narasi kosong)"}
              </p>
              {s.audio && <audio controls preload="none" src={s.audio} />}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => makeVoice(s)}
                  disabled={busy["a" + s.id] || !s.narasi.trim()}
                >
                  {busy["a" + s.id] ? "Membuat..." : s.audio ? "Buat ulang suara" : "Buat suara AI"}
                </button>
                <label className="btn btn-sm" style={{ cursor: "pointer" }}>
                  Upload suara
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      onAudioFile(s, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {s.audio && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => setScene(s.id, { audio: "" })}
                  >
                    Hapus suara
                  </button>
                )}
              </div>
              {msg["a" + s.id] && <p className="err">{msg["a" + s.id]}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="card">
        <h2>Musik latar (opsional)</h2>
        <p className="hint">
          Pakai musik bebas hak cipta supaya aman dimonetisasi. Volumenya dibuat pelan di bawah suara
          narasi.
        </p>
        {p.music ? (
          <div className="field">
            <p>
              <b>{p.musicName || "Musik latar"}</b>
            </p>
            <audio controls preload="none" src={p.music} />
            <div className="actions">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => set({ music: "", musicName: "" })}
              >
                Hapus musik
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <label className="btn btn-sm" style={{ cursor: "pointer" }}>
              Upload musik (MP3/WAV)
              <input
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  onMusicFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
        {msg.music && <p className="err">{msg.music}</p>}
      </div>

      <div className="actions">
        <button type="button" className="btn" onClick={() => goStep(2)}>
          Kembali
        </button>
        <button type="button" className="btn btn-primary" onClick={() => goStep(4)}>
          Lanjut ke Video
        </button>
      </div>
    </section>
  );
}
