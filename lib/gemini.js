import { NextResponse } from "next/server";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
    return "Model tidak ditemukan. Cek nama model di GEMINI_TEXT_MODEL atau GEMINI_IMAGE_MODEL.";
  if (status === 500 || status === 503)
    return `Server Gemini sedang sibuk (${status}). Coba lagi sebentar lagi.`;
  return `Permintaan gagal (${status}). ${raw}`;
}

export async function callGemini(model, body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      500,
      "GEMINI_API_KEY belum diisi. Tambahkan di Environment Variables lalu deploy ulang."
    );
  }
  let res;
  try {
    res = await fetch(`${BASE}/${model}:generateContent`, {
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

export async function generateText(prompt, { json = false, temperature = 0.9 } = {}) {
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const generationConfig = { temperature };
  if (json) generationConfig.responseMimeType = "application/json";
  const data = await callGemini(model, {
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
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const base = { contents: [{ role: "user", parts: [{ text }] }] };
  let data;
  try {
    data = await callGemini(model, {
      ...base,
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "9:16" },
      },
    });
  } catch (e) {
    // sebagian model menolak imageConfig: coba lagi tanpa itu (rasio sudah ada di prompt)
    if (e instanceof GeminiError && e.status === 400) {
      data = await callGemini(model, {
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
  
