export const VOICES = [
  { id: "Kore", label: "Wanita, tegas" },
  { id: "Aoede", label: "Wanita, ringan" },
  { id: "Puck", label: "Pria, ceria" },
  { id: "Charon", label: "Pria, tenang" },
];

export const EMPTY = {
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

export const uid = () => Math.random().toString(36).slice(2, 9);
export const todayKey = () => new Date().toLocaleDateString("sv-SE");
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, body) {
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
