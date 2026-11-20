# CLAUDE.md

Instruksi tetap untuk agen coding yang bekerja di repo ini.

## Konteks
Dashboard pribadi satu pengguna (mahasiswa) untuk kuliah, riset, keuangan, dan belajar bahasa Inggris, dengan AI agent berbasis **Gemini** sebagai otak utama. App sudah ter-deploy di Vercel. Spesifikasi lengkap ada di `SPEC.md`. Baca seluruhnya sebelum mulai.

## Aturan
- Kerjakan per fase sesuai `SPEC.md` Bagian 14. Satu fase = satu branch = satu pull request.
- Mulai dari Fase 0 (audit). Jangan menulis fitur sebelum `docs/AUDIT.md` selesai.
- Jangan merusak fitur yang sudah berjalan. Jalankan build dan cek sebelum commit.
- Model AI di dalam app adalah Gemini. Jangan mengganti ke penyedia lain.
- Agen di dalam app tidak boleh mengubah data tanpa konfirmasi pengguna (lihat `SPEC.md` 6.3 dan 6.4).
- UI berbahasa Indonesia. Kode, variabel, dan nama tabel berbahasa Inggris.
- Nominal uang disimpan sebagai integer rupiah. Zona waktu Asia/Jakarta.
- Rahasia hanya di server dan `.env`. Jangan commit `.env`.
- Keputusan teknis yang menyimpang dari `SPEC.md` dicatat di `docs/DECISIONS.md` beserta alasannya.
- Untuk keputusan yang tidak bisa dibatalkan (hapus data, ganti database), berhenti dan tanyakan ke pemilik.

## Perintah
- Dev: `npm run dev`
- Build: `npm run build` (wajib lolos sebelum commit)
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit test: `npm test`
- Uji migrasi, RLS, dan saldo di PostgreSQL kosong: `PGURL=postgres://... npm run test:db`
- Migrasi ke Supabase: `npx supabase db push` (setelah `npx supabase link`)
- Supabase lokal: `npx supabase start` (butuh Docker)
- Migrasi baru: tambah file berurutan di `supabase/migrations/`, jangan ubah file yang sudah dijalankan di production.
