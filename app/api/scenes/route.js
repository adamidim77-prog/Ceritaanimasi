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
    const { story, lang, count } = await req.json();
    if (!story || String(story).trim().length < 20) {
      return NextResponse.json(
        { error: "Cerita terlalu pendek. Tulis atau buat cerita dulu." },
        { status: 400 }
      );
    }
    const n = Math.min(Math.max(Number(count) || 8, 3), 20);
    const prompt = [
      "Kamu penulis storyboard untuk video animasi vertikal.",
      `Cerita (${lang || "Bahasa Indonesia"}):`,
      '"""',
      String(story).trim(),
      '"""',
      `Pecah cerita itu menjadi tepat ${n} adegan berurutan. Balas HANYA dengan JSON berbentuk:`,
      '{"character":"...","scenes":[{"narasi":"...","prompt":"..."}]}',
      "Aturan:",
      '- "character": deskripsi visual tetap semua tokoh utama dan dunia cerita, dalam bahasa Inggris (usia, bentuk tubuh, pakaian, warna, ciri khas), 2-3 kalimat. Ini akan disisipkan ke setiap prompt gambar agar tokoh konsisten.',
      `- "narasi": bagian cerita untuk adegan itu dalam ${lang || "Bahasa Indonesia"}, diambil dari cerita di atas tanpa mengubah alur, 1-3 kalimat, mudah dibacakan.`,
      '- "prompt": deskripsi gambar adegan itu dalam bahasa Inggris: siapa melakukan apa, di mana, ekspresi, sudut kamera, pencahayaan. Jangan menulis teks atau huruf di dalam gambar. Jangan mengulang deskripsi tokoh, cukup sebut perannya.',
    ].join("\n");

    const text = await generateText(prompt, { json: true, temperature: 0.7 });
    let obj;
    try {
      obj = parseJson(text);
    } catch {
      throw new GeminiError(422, "Hasil AI tidak terbaca. Coba tekan Pecah jadi adegan sekali lagi.");
    }
    const scenes = Array.isArray(obj?.scenes)
      ? obj.scenes
          .map((s) => ({
            narasi: String(s?.narasi || "").trim(),
            prompt: String(s?.prompt || "").trim(),
          }))
          .filter((s) => s.narasi || s.prompt)
      : [];
    if (!scenes.length) {
      throw new GeminiError(422, "AI tidak menghasilkan adegan. Coba lagi.");
    }
    return NextResponse.json({ character: String(obj?.character || "").trim(), scenes });
  } catch (e) {
    return errorResponse(e);
  }
}
