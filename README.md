# Kompas

Dashboard pribadi satu pengguna untuk kuliah, riset, keuangan, dan belajar bahasa Inggris, dengan asisten **Ra** (Gemini). Dulu bernama Hub Pribadi. Spesifikasi lengkap ada di `SPEC.md`, panduan tampilan di `docs/DESIGN.md`, hasil audit di `docs/AUDIT.md`, dan keputusan teknis di `docs/DECISIONS.md`.

Stack: Next.js 16 (App Router, TypeScript, Tailwind 4), Supabase (Postgres, Auth, Realtime), Zod, Vitest.

## Menyiapkan Supabase (sekali)

1. Buat proyek di supabase.com. Region Singapore paling dekat dari Indonesia.
2. **Authentication, Sign In / Providers**: matikan *Allow new users to sign up*.
3. **Authentication, Users**: *Add user* dengan email pemilik (tanpa kata sandi).
4. **Authentication, URL Configuration**:
   - Site URL: alamat production Vercel, misalnya `https://nama-app.vercel.app`
   - Redirect URLs: `https://nama-app.vercel.app/auth/confirm`, `http://localhost:3000/auth/confirm`, dan pola preview Vercel jika perlu
5. **Authentication, Emails, Magic Link** (opsional, butuh SMTP sendiri atau paket Pro): ganti isi template dengan `supabase/templates/magic_link.html` agar email memuat kode 6 angka. Tanpa ini login tetap jalan lewat kata sandi (Pengaturan, Kata sandi) dan tautan bawaan.
6. Jalankan migrasi (lihat di bawah).

## Variabel lingkungan

Salin `.env.example` ke `.env.local` untuk lokal, dan isi yang sama di Vercel (Settings, Environment Variables). Untuk Fase 1 yang wajib:

| Variabel | Isi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon atau publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role atau secret key. Dipakai penjadwal untuk masuk sebagai pemilik (Fase 6) |
| `OWNER_EMAIL` | email pemilik, satu-satunya yang boleh login |
| `APP_TIMEZONE` | `Asia/Jakarta` |
| `GEMINI_API_KEY` | kunci API dari Google AI Studio, untuk Ra (Fase 3) |
| `GEMINI_MODEL` | nama model Gemini yang dipakai Ra, misalnya model Flash terbaru yang tersedia di akunmu |
| `GEMINI_FALLBACK_MODEL` | opsional: model Gemini cadangan saat model utama penuh (503) atau kuotanya habis |
| `GEMINI_THINKING_LEVEL` | opsional: `minimal`, `low` (bawaan), `medium`, `high`, atau `off`. Makin rendah makin cepat |

| `GEMINI_LIVE_MODEL` | nama model Gemini yang mendukung Live API, untuk Ngobrol langsung (Fase 8) dan transkripsi pesan suara (D-63) |
| `GEMINI_TTS_MODEL` | model TTS Gemini untuk suara IELTS Listening (D-65), mis. `gemini-3.8-flash-tts` |
| `CRON_SECRET` | teks acak panjang, kunci penjadwal `/api/cron/tick` (Fase 6) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | pasangan kunci push notification (Fase 6) |
| `VAPID_SUBJECT` | `mailto:` diikuti email pemilik |

Tanpa dua variabel Gemini, Ra tetap jalan memakai pengurai lokal dan menampilkan banner "Gemini belum diatur".

## Otomasi dan notifikasi (Fase 6)

Tiga langkah sekali pasang:

1. **Kunci push.** Jalankan perintah berikut di laptop. Salin `publicKey` ke `NEXT_PUBLIC_VAPID_PUBLIC_KEY` dan `privateKey` ke `VAPID_PRIVATE_KEY` di Vercel. Kunci privat jangan dibagikan ke siapa pun.

```bash
npx web-push generate-vapid-keys
```

2. **Rahasia penjadwal.** Isi `CRON_SECRET` di Vercel dengan teks acak panjang (minimal 32 karakter), lalu redeploy.

3. **Jadwal 5 menitan.** Buka `docs/cron-setup.sql`, ganti `<URL_APP>` dan `<CRON_SECRET>`, lalu jalankan di Supabase (SQL Editor). pg_cron memanggil `/api/cron/tick` tiap 5 menit. Vercel Cron (`vercel.json`) juga memanggilnya sekali sehari sebagai cadangan.

Setelah itu buka **Saya → Notifikasi**, tekan **Aktifkan notifikasi** di laptop dan HP. Di iPhone, tambahkan Kompas ke Layar Utama lebih dulu.

## Perintah

```bash
npm install
```

```bash
npm run dev          # http://localhost:3000
npm run build        # build produksi
npm run lint
npm test             # unit test (vitest)
npm run test:db      # migrasi + uji RLS dan saldo di PostgreSQL kosong, butuh PGURL
```

Migrasi ke proyek Supabase:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref-proyek>
```

```bash
npx supabase db push
```

Supabase lokal (butuh Docker): `npx supabase start`, lalu isi `.env.local` dengan URL dan anon key yang ditampilkan. Email berisi kode masuk bisa dilihat di Mailpit (`http://localhost:54324`).

## Memindahkan data app lama 
 

1. Di app lama: Pengaturan, Data dan cadangan, Unduh cadangan (JSON).
2. Di app baru: Pengaturan, Impor cadangan, pilih file.
3. Periksa pratinjau. Data yang janggal ditandai kuning dan bisa diperbaiki di layar itu.
4. Tekan Impor. Semua data masuk dalam satu transaksi, lalu saldo tiap akun dicocokkan dengan perhitungan app lama.

Impor boleh diulang. Data yang sudah pernah masuk dilewati.
