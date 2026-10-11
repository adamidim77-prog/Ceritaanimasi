export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File tidak bisa dibaca."));
    reader.readAsDataURL(file);
  });
}

// Potong dan skala gambar apa pun ke rasio 9:16 (mode cover), simpan sebagai JPEG ringan.
export function fitToPortrait(src, w = 1080, h = 1920) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Gambar tidak bisa dibaca. Pakai JPG atau PNG."));
    img.src = src;
  });
}
