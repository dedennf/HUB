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
5. **Authentication, Emails, Magic Link**: ganti isi template dengan `supabase/templates/magic_link.html`. Template ini memakai `token_hash` sehingga tautan bisa dibuka di perangkat lain.
6. Jalankan migrasi (lihat di bawah).

## Variabel lingkungan

Salin `.env.example` ke `.env.local` untuk lokal, dan isi yang sama di Vercel (Settings, Environment Variables). Untuk Fase 1 yang wajib:

| Variabel | Isi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon atau publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role atau secret key (belum dipakai di Fase 1, disiapkan untuk cron) |
| `OWNER_EMAIL` | email pemilik, satu-satunya yang boleh login |
| `APP_TIMEZONE` | `Asia/Jakarta` |

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

Supabase lokal (butuh Docker): `npx supabase start`, lalu isi `.env.local` dengan URL dan anon key yang ditampilkan. Email tautan masuk bisa dilihat di Mailpit (`http://localhost:54324`).

## Memindahkan data app lama 
 

1. Di app lama: Pengaturan, Data dan cadangan, Unduh cadangan (JSON).
2. Di app baru: Pengaturan, Impor cadangan, pilih file.
3. Periksa pratinjau. Data yang janggal ditandai kuning dan bisa diperbaiki di layar itu.
4. Tekan Impor. Semua data masuk dalam satu transaksi, lalu saldo tiap akun dicocokkan dengan perhitungan app lama.

Impor boleh diulang. Data yang sudah pernah masuk dilewati.
