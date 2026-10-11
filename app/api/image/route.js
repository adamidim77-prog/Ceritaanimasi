import { NextResponse } from "next/server";
import { generateImage, errorResponse } from "../../../lib/gemini";
import { buildImagePrompt } from "../../../lib/prompts";

export const maxDuration = 60;

export async function POST(req) {
  try {
    const { prompt, character, style } = await req.json();
    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json({ error: "Prompt gambar kosong." }, { status: 400 });
    }
    const text = buildImagePrompt({ style, character, prompt });
    const img = await generateImage(text);
    return NextResponse.json(img);
  } catch (e) {
    return errorResponse(e);
  }
}
