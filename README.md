# CeritaAnimasi (langkah 1 dan 2)

Aplikasi untuk mengubah cerita menjadi adegan bergambar (9:16). Langkah 3 (suara) dan 4 (render video) menyusul.

## Isi saat ini
1. **Cerita**: tulis sendiri atau buat dari ide dengan AI. Pilih bahasa, gaya gambar, dan durasi.
2. **Adegan**: cerita dipecah jadi adegan (narasi + prompt gambar). Tiap adegan bisa:
   - Buat gambar AI (satu gambar per klik, tidak mengulang otomatis)
   - Upload gambar buatan sendiri (JPG/PNG/WebP, otomatis dipotong 9:16)
   - Salin prompt (untuk dibuat di aplikasi Gemini lalu di-upload)

Proyek tersimpan otomatis di browser (IndexedDB), jadi tidak hilang saat refresh.

## Deploy lewat GitHub + Vercel
1. Ekstrak ZIP, lalu upload **isi folder** ke repository GitHub baru (jangan upload `node_modules`, `.next`, atau `.env.local`).
2. Di vercel.com pilih **Add New > Project**, lalu import repository itu.
3. Di bagian **Environment Variables** tambahkan `GEMINI_API_KEY` (isi dengan API key dari aistudio.google.com).
4. Tekan **Deploy**. Kalau mengubah environment variable, deploy ulang.

## Jalan di komputer sendiri (opsional)
```
npm install
cp .env.example .env.local   # isi GEMINI_API_KEY
npm run dev
```
Buka http://localhost:3000

## Kalau ada error
- **"GEMINI_API_KEY belum diisi"**: tambahkan di Environment Variables lalu deploy ulang.
- **"Model tidak ditemukan"** atau **"hanya untuk akun berbayar"**: ganti `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL` di Environment Variables.
- **429 / kuota habis**: tunggu reset harian, atau pakai Salin prompt + Upload gambar.
