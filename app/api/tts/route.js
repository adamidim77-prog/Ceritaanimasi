import { NextResponse } from "next/server";
import { generateSpeech, errorResponse } from "../../../lib/gemini";

export const maxDuration = 60;

const VOICES = ["Kore", "Aoede", "Puck", "Charon"];

export async function POST(req) {
  try {
    const { text, voice } = await req.json();
    const t = String(text || "").trim();
    if (!t) {
      return NextResponse.json({ error: "Narasi kosong." }, { status: 400 });
    }
    if (t.length > 800) {
      return NextResponse.json(
        { error: "Narasi terlalu panjang (maksimal 800 karakter per adegan). Persingkat dulu." },
        { status: 400 }
      );
    }
    const v = VOICES.includes(voice) ? voice : "Kore";
    const audio = await generateSpeech(t, v);
    return NextResponse.json(audio);
  } catch (e) {
    return errorResponse(e);
  }
                                       }
