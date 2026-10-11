import { NextResponse } from "next/server";
import { generateText, errorResponse } from "../../../lib/gemini";
import { STYLES, wordsFor } from "../../../lib/prompts";

export const maxDuration = 60;

export async function POST(req) {
  try {
    const { idea, lang, style, durasi } = await req.json();
    if (!idea || !String(idea).trim()) {
      return NextResponse.json({ error: "Isi ide atau topik dulu." }, { status: 400 });
    }
    const seconds = Number(durasi) || 60;
    const words = wordsFor(seconds);
    const prompt = [
      `Tulis cerita pendek untuk video animasi vertikal berdurasi sekitar ${seconds} detik.`,
      `Bahasa: ${lang || "Bahasa Indonesia"}.`,
      `Ide: ${String(idea).trim()}`,
      `Gaya visual: ${STYLES[style]?.label || "Kartun flat"}.`,
      `Panjang: sekitar ${words} kata.`,
      "Aturan: kalimat pendek dan enak dibacakan, kalimat pertama langsung menarik perhatian, alur jelas (awal, masalah, penyelesaian), ditutup dengan pesan singkat.",
      "Tulis hanya teks narasi: tanpa judul, tanpa tanda bintang, tanpa daftar, tanpa penjelasan tambahan.",
    ].join("\n");
    const story = await generateText(prompt);
    return NextResponse.json({ story });
  } catch (e) {
    return errorResponse(e);
  }
      }
