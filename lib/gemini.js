import { NextResponse } from "next/server";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const DEFAULTS = {
  text: "gemini-flash-latest",
  image: "gemini-2.5-flash-image",
};

export class GeminiError extends Error {
  constructor(status, message, raw) {
    super(message);
    this.status = status;
    this.raw = raw;
  }
}

function friendly(status, raw = "") {
  const low = String(raw).toLowerCase();
  if (status === 429)
    return "Kuota Gemini habis atau permintaan terlalu cepat (429). Tunggu sebentar, atau tunggu kuota harian reset.";
  if (status === 400 && (low.includes("api key") || low.includes("api_key")))
    return "API key tidak valid. Cek GEMINI_API_KEY di pengaturan environment.";
  if (status === 400 && low.includes("billed"))
    return "Model ini hanya untuk akun berbayar (billing belum aktif). Ganti GEMINI_IMAGE_MODEL atau aktifkan billing.";
  if (status === 401 || status === 403)
    return `API key ditolak atau tidak punya izin (${status}). ${raw}`;
  if (status === 404)
    return "Model tidak ditemukan dan tidak ada model pengganti yang tersedia di akun ini. Cek GEMINI_TEXT_MODEL atau GEMINI_IMAGE_MODEL.";
  if (status === 500 || status === 503)
    return `Server Gemini sedang sibuk (${status}). Coba lagi sebentar lagi.`;
  return `Permintaan gagal (${status}). ${raw}`;
}

function getKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      500,
      "GEMINI_API_KEY belum diisi. Tambahkan di Environment Variables lalu deploy ulang."
    );
  }
  return key;
}

export async function callGemini(model, body) {
  const key = getKey();
  let res;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    throw new GeminiError(502, "Tidak bisa terhubung ke Gemini. Coba lagi.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = data?.error?.message || "";
    throw new GeminiError(res.status, friendly(res.status, raw), raw);
  }
  return data;
}

/* ---------- pilih model otomatis ---------- */

let modelListCache = null;
const picked = { text: null, image: null };

async function listModels() {
  if (modelListCache) return modelListCache;
  const key = getKey();
  const all = [];
  let pageToken = "";
  for (let i = 0; i < 5; i++) {
    const url = `${BASE}/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { "x-goog-api-key": key }, cache: "no-store" });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    all.push(...(data.models || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  modelListCache = all
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""));
  return modelListCache;
}

function score(name) {
  const v = parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
  const stable = /preview|exp/.test(name) ? 0 : 1;
  const notLite = /lite/.test(name) ? 0 : 1;
  return [stable, v, notLite];
}

function bySuitability(a, b) {
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sb[i] - sa[i];
  }
  return 0;
}

async function discover(kind, exclude) {
  let names;
  try {
    names = await listModels();
  } catch {
    return null;
  }
  let candidates;
  if (kind === "image") {
    candidates = names.filter((n) => n.startsWith("gemini") && n.includes("image"));
  } else {
    const bad = /(image|tts|embed|live|audio|imagen|veo|robotics|computer|aqa|learnlm|thinking-exp)/;
    candidates = names.filter((n) => n.startsWith("gemini") && n.includes("flash") && !bad.test(n));
  }
  candidates = candidates.filter((n) => n !== exclude).sort(bySuitability);
  return candidates[0] || null;
}

// Panggil model sesuai jenisnya. Kalau modelnya 404, cari model pengganti yang tersedia.
async function callModel(kind, body) {
  const fromEnv = kind === "image" ? process.env.GEMINI_IMAGE_MODEL : process.env.GEMINI_TEXT_MODEL;
  const first = picked[kind] || fromEnv || DEFAULTS[kind];
  try {
    return await callGemini(first, body);
  } catch (e) {
    if (e instanceof GeminiError && e.status === 404) {
      const alt = await discover(kind, first);
      if (alt) {
        const data = await callGemini(alt, body);
        picked[kind] = alt;
        return data;
      }
    }
    throw e;
  }
}

/* ---------- teks dan gambar ---------- */

export async function generateText(prompt, { json = false, temperature = 0.9 } = {}) {
  const generationConfig = { temperature };
  if (json) generationConfig.responseMimeType = "application/json";
  const data = await callModel("text", {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  });
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    throw new GeminiError(
      422,
      `AI tidak mengembalikan teks${reason ? ` (${reason})` : ""}. Ubah ide atau cerita lalu coba lagi.`
    );
  }
  return text;
}

export async function generateImage(text) {
  const base = { contents: [{ role: "user", parts: [{ text }] }] };
  let data;
  try {
    data = await callModel("image", {
      ...base,
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "9:16" },
      },
    });
  } catch (e) {
    // sebagian model menolak imageConfig: coba lagi tanpa itu (rasio sudah ada di prompt)
    if (e instanceof GeminiError && e.status === 400) {
      data = await callModel("image", {
        ...base,
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      });
    } else {
      throw e;
    }
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
  if (!imgPart) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    throw new GeminiError(
      422,
      `Gambar tidak dihasilkan${reason ? ` (${reason})` : ""}. Prompt mungkin diblokir filter keamanan. Ubah prompt adegan lalu coba lagi.`
    );
  }
  const inl = imgPart.inlineData || imgPart.inline_data;
  return { mime: inl.mimeType || inl.mime_type || "image/png", data: inl.data };
}

export function errorResponse(e) {
  const status = e instanceof GeminiError ? e.status : 500;
  const message = e instanceof GeminiError ? e.message : "Terjadi kesalahan di server.";
  return NextResponse.json(
    { error: message },
    { status: status >= 400 && status < 600 ? status : 500 }
  );
      }
