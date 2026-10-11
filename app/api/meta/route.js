import { NextResponse } from "next/server";
import { generateText, GeminiError, errorResponse } from "../../../lib/gemini";

export const maxDuration = 60;

function parseJson(text) {
  const clean = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("bukan JSON");
  }
}

export async function POST(req) {
  try {
    const { story, lang } = await req.json();
    if (!story || String(story).trim().length < 20) {
      return NextResponse.json({ error: "Cerita belum ada." }, { status: 400 });
    }
    const language = lang || "Bahasa Indonesia";
    const prompt = [
      `Buat teks unggahan untuk video pendek (YouTube Shorts dan Instagram Reels) dari cerita ini. Bahasa: ${language}.`,
      '"""',
      String(story).trim(),
      '"""',
      'Balas HANYA JSON: {"title":"...","description":"...","hashtags":["#...", "#..."]}',
      "Aturan:",
      "- title: menarik dan memancing penasaran, maksimal 70 karakter, tanpa tanda kutip.",
      "- description: 2-3 kalimat singkat tentang isi video, ditutup ajakan untuk menonton sampai habis dan mengikuti akun.",
      "- hashtags: 8 sampai 12 hashtag relevan, sertakan #shorts dan #reels.",
    ].join("\n");
    const text = await generateText(prompt, { json: true, temperature: 0.8 });
    let obj;
    try {
      obj = parseJson(text);
    } catch {
      throw new GeminiError(422, "Hasil AI tidak terbaca. Coba lagi.");
    }
    const tags = Array.isArray(obj?.hashtags) ? obj.hashtags : [];
    return NextResponse.json({
      title: String(obj?.title || "").trim(),
      description: String(obj?.description || "").trim(),
      hashtags: tags
        .map((h) => String(h).trim())
        .filter(Boolean)
        .map((h) => (h.startsWith("#") ? h : "#" + h))
        .join(" "),
    });
  } catch (e) {
    return errorResponse(e);
  }
      }
