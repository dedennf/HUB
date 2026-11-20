# Hub Pribadi

Dashboard pribadi satu pengguna untuk kuliah, riset, keuangan, dan belajar bahasa Inggris. Spesifikasi lengkap ada di `SPEC.md`, hasil audit di `docs/AUDIT.md`, dan keputusan teknis di `docs/DECISIONS.md`.

Stack: Next.js 16 (App Router, TypeScript, Tailwind 4), Supabase (Postgres, Auth, Realtime), Zod, Vitest.

## Menyiapkan Supabase (sekali)

1. Buat proyek di supabase.com. Region Singapore paling dekat dari Indonesia.
2. **Authentication, Sign In / Providers**: matikan *Allow new users to sign up*.
3. **Authentication, Users**: *Add user* dengan email pemilik (tanpa kata sandi).
4. **Authentication, URL Configuration**:
   - Site URL: alamat production Vercel, misalnya `https://nama-app.vercel.app`
   - Redirect URLs: `https://nama-app.vercel.app/auth/confirm`, `https://*-<nama-akun-vercel>.vercel.app/**`, dan `http://localhost:3000/auth/confirm`
5. **Authentication, Emails, Magic Link**: ganti isi template dengan `supabase/templates/magic_link.html`. Template ini memakai `token_hash` sehingga tautan bisa dibuka di perangkat lain.
6. Jalankan migrasi (lihat di bawah).

## Langkah selanjutnya (menyelesaikan Fase 1)

Urutannya penting: uji dulu di **preview** Vercel, baru gabungkan ke `main` (production). Waktu yang dibutuhkan sekitar 30 sampai 45 menit.

### 1. Simpan cadangan data lama
Pastikan file `hub-pribadi-YYYY-MM-DD.json` dari app lama tersimpan aman, misalnya di Google Drive. File ini satu-satunya sumber data lama.

### 2. Buat proyek Supabase
1. Masuk ke supabase.com, lalu **New project**.
2. Isi nama proyek (misalnya `hub-pribadi`), buat **Database Password** yang kuat, lalu simpan di pengelola kata sandi. Password ini dipakai saat migrasi.
3. Region: **Southeast Asia (Singapore)**. Paket: Free.
4. Tunggu sampai proyek siap (beberapa menit).
5. Catat tiga hal ini. Letaknya di tombol **Connect** atau **Project Settings, API Keys**:
   - **Project URL**, bentuknya `https://<ref>.supabase.co`. Bagian `<ref>` adalah *project ref*.
   - **anon / publishable key**: boleh dipakai di browser.
   - **service_role / secret key**: rahasia, jangan dibagikan atau di-commit.

### 3. Atur login di Supabase
Menu **Authentication**:
1. **Sign In / Providers**: matikan *Allow new users to sign up*. Pastikan provider Email aktif.
2. **Users, Add user, Create new user**: isi emailmu, centang *Auto Confirm User*. Kata sandi boleh diisi acak karena login memakai tautan email.
3. **URL Configuration**:
   - Site URL: alamat production Vercel, misalnya `https://nama-app.vercel.app`
   - Redirect URLs, tambahkan:
     - `https://nama-app.vercel.app/auth/confirm`
     - `https://*-<nama-akun-vercel>.vercel.app/**` (supaya semua alamat preview Vercel diterima)
     - `http://localhost:3000/auth/confirm`
4. **Emails, Templates, Magic Link**: ganti subjek menjadi `Masuk ke Hub Pribadi` dan isi pesan dengan isi file `supabase/templates/magic_link.html`. Tanpa langkah ini, tautan dari laptop tidak bisa dibuka di HP.

Catatan: email bawaan Supabase dibatasi beberapa email per jam dan bisa masuk folder spam. Untuk satu pengguna ini cukup. Kalau sering terkena batas, pasang SMTP sendiri di **Authentication, Emails, SMTP Settings**.

### 4. Jalankan migrasi database
Di laptop, dari folder repo (branch `fase-1-fondasi-data`):

```bash
npm install
```

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref>
```

```bash
npx supabase db push
```

`db push` menanyakan Database Password dari langkah 2. Cek hasilnya di **Table Editor**: harus ada tabel `accounts`, `transactions`, `tasks`, dan lainnya, masing-masing berlabel RLS aktif.

### 5. Atur project di Vercel
1. **Settings, Build and Deployment**: Framework Preset **Next.js**. Sebelumnya project ini statis, jadi mungkin masih tertulis *Other*. Root Directory kosong, perintah build bawaan.
2. **Settings, Environment Variables**: tambahkan lima variabel di tabel *Variabel lingkungan* di atas. Centang **Production** dan **Preview**. Nilai `OWNER_EMAIL` harus sama persis dengan email di langkah 3.
3. **Deployments**: cari deployment untuk branch `fase-1-fondasi-data`, lalu **Redeploy** supaya variabel baru terbaca. Jika project tersambung ke GitHub, preview dibuat otomatis setiap kali branch ini di-push.

### 6. Uji di alamat preview
1. Buka alamat preview dari Vercel (bentuknya `https://nama-app-git-fase-1-...vercel.app`). Kalau diminta login Vercel, itu proteksi preview bawaan, jadi login saja.
2. Masukkan emailmu, buka tautan dari email. Kamu masuk ke Beranda.
3. **Pengaturan, Impor cadangan**: pilih file JSON. Periksa tanda kuning (tanggal transaksi BORMA, tanggal semester 7, akun tagihan). Perbaiki di layar itu, tekan **Periksa ulang**, lalu **Impor sekarang**.
4. Pastikan layar hasil menulis **Semua saldo cocok**.
5. Buka alamat preview yang sama di HP, minta tautan masuk, buka dari email di HP.
6. Biarkan HP di halaman Keuangan, tab Transaksi. Catat satu transaksi dari laptop. Transaksi itu harus muncul di HP dalam beberapa detik tanpa memuat ulang. Setelah itu hapus transaksi uji tersebut.
7. **Pengaturan, Pemeriksaan saldo** harus menulis saldo konsisten.

Jika ada yang gagal, catat pesan di layar dan alamat halamannya, lalu laporkan.

### 7. Gabungkan ke production
1. Merge PR Fase 0, lalu PR Fase 1, ke `main`. Vercel men-deploy ulang production otomatis.
2. Di HP yang masih memasang app lama: buka alamat production, muat ulang dua kali. Service worker baru menghapus cache app lama. Lalu pasang ulang ke layar utama jika perlu.
3. Data tidak perlu diimpor ulang. Database preview dan production sama.

Setelah ini kriteria Fase 1 bisa dicentang penuh, dan pekerjaan berlanjut ke Fase 1b (mengembalikan fitur lama).

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
