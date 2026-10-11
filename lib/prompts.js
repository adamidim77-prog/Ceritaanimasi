export const STYLES = {
  flat: {
    label: "Kartun flat",
    prompt:
      "flat vector cartoon illustration, bold simple shapes, soft harmonious colors, clean outlines, children's storybook look",
  },
  anime: {
    label: "Anime",
    prompt:
      "anime style illustration, expressive characters, detailed painted background, cinematic lighting",
  },
  threed: {
    label: "3D lucu",
    prompt:
      "cute 3D animated movie style, rounded friendly characters, soft global illumination, vibrant colors",
  },
  islami: {
    label: "Islami tanpa wajah",
    prompt:
      "flat illustration in an Islamic storytelling style, all human characters are faceless (shown from behind, in silhouette, or with no facial features), warm earthy colors, modest clothing, respectful and calm mood",
  },
};

export const DURATIONS = [
  { value: 30, scenes: 6, label: "30 detik" },
  { value: 60, scenes: 8, label: "1 menit" },
  { value: 120, scenes: 12, label: "2 menit" },
  { value: 180, scenes: 15, label: "3 menit" },
];

export const LANGS = [
  { value: "Bahasa Indonesia", label: "Indonesia" },
  { value: "English", label: "English" },
];

// perkiraan jumlah kata narasi untuk durasi tertentu
export function wordsFor(seconds) {
  return Math.round(seconds * 2.3);
}

// prompt gambar lengkap: gaya + tokoh tetap + isi adegan
export function buildImagePrompt({ style, character, prompt }) {
  const st = STYLES[style]?.prompt || STYLES.flat.prompt;
  const parts = [st + "."];
  if (character && character.trim()) {
    parts.push(
      "Recurring characters and world (keep consistent): " +
        character.trim().replace(/[.\s]+$/, "") +
        "."
    );
  }
  parts.push("Scene: " + String(prompt || "").trim().replace(/[.\s]+$/, "") + ".");
  parts.push(
    "Vertical 9:16 portrait composition. No text, no letters, no captions, no watermark."
  );
  return parts.join(" ");
   }
