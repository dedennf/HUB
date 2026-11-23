# DECISIONS.md

Catatan keputusan teknis, terutama yang menyimpang dari `SPEC.md`. Status:
- **Diputuskan**: agen coding memutuskan sendiri (boleh dibatalkan, tidak merusak data).
- **Perlu persetujuan pemilik**: tidak bisa dibatalkan atau menyangkut data. Belum dikerjakan sebelum pemilik menjawab.

Rujukan temuan ada di `docs/AUDIT.md`.

---

## D-01 · Kode aplikasi lama dihapus dari `main`
**Status: Diputuskan pemilik (2026-11-20): penghapusan disengaja, kode lama tidak dipulihkan.**

Akibatnya: app baru dibangun dari nol. Logika lama tetap boleh dirujuk dari riwayat git (`git show 1be7928:app.js`) untuk di-port. Migrasi data memakai file cadangan JSON yang diunduh pemilik dari perangkatnya (D-05). Usulan di bawah dicatat sebagai riwayat.

Konteks: semua file aplikasi dihapus dari HEAD lewat 11 commit "Delete ..." (AUDIT Bagian 1). Versi utuh terakhir ada di commit `1be7928`.

Usulan:
1. Pemilik mengecek dashboard Vercel apakah production sudah ikut kosong.
2. Di awal Fase 1, pulihkan kode lama dari `1be7928` ke folder `legacy/` dan sajikan apa adanya (misalnya di `/legacy`) sampai app baru setara. Dengan begitu `api/sync.js` dan `api/gemini.js` hidup lagi dan perangkat bisa sinkron terakhir kali sebelum migrasi.
3. Jika penghapusan memang disengaja dan pemilik tidak butuh app lama lagi, cukup pastikan cadangan JSON dari tiap perangkat sudah diunduh sebelum data browser dibersihkan.

Pertanyaan untuk pemilik: penghapusan itu disengaja (mulai ulang) atau tidak sengaja?

---

## D-02 · Stack: Next.js App Router + TypeScript + Tailwind
**Status: Diputuskan**

SPEC 0.2 meminta mengikuti stack yang ada. Stack lama adalah vanilla JS tanpa build, satu file 2.500 baris dengan state global. Alasan tetap memakai Next.js:
- Agen, registry tools, Zod, cron, push, dan RLS membutuhkan logika di server. Kode lama hampir seluruhnya logika klien.
- Kode lama sudah tidak ada di HEAD, jadi tidak ada yang "dibongkar".
- Logika bernilai dari kode lama tetap di-port ke modul TypeScript murni: pengurai nominal dan tanggal, pencocokan akun dan kategori, ekspansi kalender, aturan anggaran dan biaya sejati, `systemContext`.

Fitur lama di AUDIT Bagian 7 menjadi daftar regresi wajib.

---

## D-03 · Database: Upstash Redis ke Supabase (Postgres)
**Status: Disetujui pemilik (2026-11-20).** Data Upstash tetap tidak dihapus sampai migrasi terverifikasi.

SPEC Bagian 2 mengizinkan mempertahankan database lama yang sudah tersinkron. Rekomendasi tetap pindah ke Supabase karena:
- Data di Upstash dienkripsi end-to-end di browser. Server, agen Gemini, `/api/cron/tick`, dan notifikasi tidak bisa membacanya.
- Redis menyimpan satu blob per koleksi, tidak mendukung query, transaksi, RLS, atau `pg_cron`.

Konsekuensi privasi: data tidak lagi terenkripsi end-to-end. Perlindungan berpindah ke RLS, Supabase Auth, dan enkripsi at-rest milik Supabase. Pemilik perlu menyetujui perubahan model privasi ini.

Upstash tidak dihapus. Biarkan sampai migrasi terverifikasi, lalu pemilik yang memutuskan kapan menghapus.

---

## D-04 · Identitas dan ID
**Status: Diputuskan**

ID lama berupa string acak (`lt3k2abcde`, `o_makan`). Semua tabel baru memakai `uuid`. Saat migrasi dibuat tabel bantu `legacy_id_map (table_name, legacy_id, new_id)` agar relasi (transaksi ke akun, tugas ke mata kuliah, literatur ke target) bisa dipetakan dan migrasi bisa diulang tanpa duplikat.

---

## D-05 · Sumber migrasi: file cadangan JSON
**Status: Diputuskan**

Server tidak bisa membaca Upstash (D-03), maka migrasi memakai format cadangan yang sudah ada (`{ app: 'hub-pribadi', version: 1, data }`). Alur:
1. Di app lama, sinkron terakhir di semua perangkat.
2. Unduh cadangan dari perangkat paling lengkap. Karena kode lama tidak dipulihkan (D-01), pemilik mengunduhnya dari app lama yang masih tersimpan di cache PWA perangkat. Jika app lama sudah tidak bisa dibuka, opsi darurat adalah menjalankan `1be7928` secara lokal di origin yang sama.
3. Halaman impor di app baru (setelah login) mengunggah file, menampilkan pratinjau jumlah per tabel, lalu menulis dalam satu transaksi database.
4. Impor idempoten lewat `legacy_id_map`. File cadangan disimpan sebagai arsip.

---

## D-06 · Aturan konversi waktu saat migrasi
**Status: Diputuskan**

- Transaksi lama hanya punya tanggal. `occurred_at` diisi tanggal tersebut jam 12.00 Asia/Jakarta, agar tidak bergeser hari saat dikonversi ke UTC.
- Tenggat tugas lama hanya tanggal. `due_at` diisi jam 23.59 Asia/Jakarta.
- Rencana kerja (`work`, `workStart`, `workEnd`) menjadi satu baris `task_work_slots`. Jika jam kosong, dipakai 19.00 sampai 21.00 dan ditandai di catatan.
- `schedule.day` lama (0 = Senin) menjadi `weekday` (1 = Senin).
- Semua perhitungan tanggal di server memakai `APP_TIMEZONE`, bukan jam perangkat.

---

## D-07 · Saldo akun: saldo awal + saldo terpelihara
**Status: Diputuskan**

SPEC menyimpan `accounts.balance`. App lama hanya menyimpan saldo awal (`open`). Ditambahkan kolom `opening_balance bigint`. `balance` tetap diperbarui oleh fungsi database saat transaksi dibuat, diubah, dihapus, atau di-undo (sesuai SPEC), dan disediakan fungsi `recompute_account_balance(account_id)` = `opening_balance` + jumlah transaksi, untuk memeriksa konsistensi dan untuk fitur "Cocokkan saldo".

---

## D-08 · Fitur lama di luar SPEC tetap dipertahankan
**Status: Diputuskan**

Fitur berikut tidak ada di SPEC tetapi sudah dipakai, sehingga dipertahankan dan ditambahkan ke model data:

| Fitur lama | Tabel / kolom baru |
|---|---|
| Target tabungan | `savings_goals (name, target_amount, saved_amount, deadline, note)` |
| Utang dan piutang | `debts (direction, person, amount, paid_amount, occurred_on, due_on, note)` |
| Biaya sejati | `sinking_funds (name, amount, due_on, saved_amount, is_done, note)` |
| Libur | `holidays (name, start_date, end_date)` |
| Bimbingan | `supervisions (met_on, supervisor, points, status, next_on)` |
| Sub-kategori, ikon, warna, kata kunci | kolom tambahan di `categories`, `subcategory` di `transactions` |
| Biaya admin transfer | `transactions.group_id` |
| Jenis, prioritas, subtugas, tautan tugas | `tasks.kind, priority, parent_id, url` |
| Status dan jenis kebutuhan riset | `research_needs.status, kind` menggantikan `is_fulfilled` |
| Metadata literatur | `readings.venue, collection, tags, claim, verification_status, linked_target_ids, linked_idea_ids` |
| Acara berulang | `events.recurrence, recurrence_until, location, end_date` |
| Tagihan tahunan | `bills.frequency, category_id` |
| Alias akun | `accounts.aliases text[]` diisi dari teks alias lama |
| Catatan kebiasaan untuk Gemini | satu baris `agent_memory` `kind = 'preference'` |

Semua tabel tambahan mengikuti aturan SPEC Bagian 5 (uuid, `user_id`, timestamp, RLS, nominal `bigint`).

---

## D-09 · Kategori bawaan memakai daftar lama
**Status: Diputuskan**

Daftar lama (14 pengeluaran, 7 pemasukan) sudah mencakup semua kategori bawaan SPEC dengan nama sedikit berbeda, ditambah Riset & lapangan, Organisasi, Hadiah & donasi, Biaya admin & pajak, Proyek atau freelance, Hasil investasi. Memakai daftar lama menjaga data lama tetap utuh. `Biaya admin & pajak` wajib ada karena dipakai biaya transfer.

---

## D-10 · Proyek riset default
**Status: Diputuskan**

Data riset lama tidak punya proyek. Migrasi membuat satu `research_projects` bernama "Riset utama" dan menautkan semua target, kebutuhan, ide, dan literatur ke sana. Pengguna bisa memecahnya nanti. `research_ideas.project_id` boleh null sesuai SPEC.

---

## D-11 · Pengurai lokal tetap ada sebagai jalur cadangan
**Status: Diputuskan**

SPEC 15 meminta app tetap bisa dipakai saat Gemini gagal. Pengurai lokal lama (nominal, tanggal relatif, akun, kategori) di-port ke `lib/parse/` dan dipakai untuk: (a) fallback saat Gemini error atau kuota habis, menghasilkan usulan aksi yang sama dengan agen, dan (b) normalisasi argumen tools di server (misalnya "30rb" ke 30000). Tetap tanpa eksekusi langsung, semua lewat kartu konfirmasi.

---

## D-12 · Mode kunci Gemini di browser dihapus
**Status: Diputuskan**

Mode `direct` menyimpan `GEMINI_API_KEY` di IndexedDB dan bertentangan dengan SPEC 12. App baru hanya memanggil Gemini dari server lewat SDK `@google/genai`, model dari env `GEMINI_MODEL`. Proxy umum `api/gemini.js` tidak dibawa ke app baru.

---

## D-13 · Manifest PWA
**Status: Diputuskan**

SPEC menyebut `public/manifest.json`. Nama file bebas, isi dipertahankan dari `manifest.webmanifest` lama (nama "Hub Pribadi", ikon 192/512/maskable). Warna tema diseragamkan karena manifest dan `index.html` lama berbeda. Cache service worker lama (`hub-pribadi-v4`) dibersihkan oleh service worker baru agar perangkat tidak terus menampilkan versi lama.

---

## D-14 · Pembulatan nominal saat migrasi
**Status: Diputuskan**

Semua nominal dibulatkan ke rupiah terdekat (`Math.round`). Selisih pembulatan dicatat di laporan impor per record. Untuk cadangan 2026-11-21, ini hanya menyentuh satu saldo awal dengan selisih di bawah Rp1.

## D-15 · Data mencurigakan tidak diperbaiki diam-diam
**Status: Diputuskan**

Importer tidak mengubah isi data selain format. Record yang janggal (misalnya tanggal transaksi jauh sebelum app dibuat) ditampilkan di layar pratinjau impor dengan penanda kuning, dan pengguna memilih sendiri untuk memperbaikinya atau tidak. Transaksi bertanggal 2024-11-15 di cadangan 2026-11-21 masuk kategori ini.

## D-16 · Koleksi tak dikenal di cadangan
**Status: Perlu masukan pemilik**

Cadangan memuat koleksi `recurring` dan `focus` yang tidak ada di kode git (AUDIT 10.1). Keduanya kosong, jadi tidak ada data yang hilang. Importer akan menolak dengan peringatan jika suatu saat koleksi tak dikenal berisi data, bukan membuangnya diam-diam.

Kode versi terbaru itu sebaiknya diambil supaya fitur yang sudah dipakai (kemungkinan struk, transaksi berulang, dan mode fokus) masuk daftar regresi. Sumber yang mungkin: folder lokal di laptop pemilik, atau tab Source pada deployment terakhir di dashboard Vercel.

---

# Keputusan Fase 1

## D-17 · Fase 1 dibagi 1a (fondasi) dan 1b (port UI)
**Status: Disetujui pemilik (rencana Fase 1)**

Kode app lama sudah dihapus (D-01), jadi tidak ada fitur lama yang berjalan. Fase 1a (branch `fase-1-fondasi-data`) berisi proyek Next.js, semua migrasi, RLS, login satu pengguna, impor cadangan, sinkron realtime, serta halaman baca untuk semua modul plus tambah dan ubah akun dan transaksi. Fase 1b mengembalikan seluruh 26 fitur di AUDIT Bagian 7 di atas database baru.

Selama 1a belum ada mode offline. Service worker baru sengaja tidak meng-cache apa pun dan menghapus cache lama `hub-pribadi-v4`, supaya HP tidak terus menampilkan app lama. Cache offline dibangun ulang bersama push notification di Fase 6.

## D-18 · Konvensi Next.js 16
**Status: Diputuskan**

Versi yang terpasang Next.js 16.4.6. Di versi ini `middleware.ts` sudah diganti `proxy.ts`, jadi penyegaran sesi Supabase ada di `proxy.ts`. `cacheComponents` dimatikan karena hampir semua halaman membaca sesi pengguna di setiap permintaan, sehingga cache tidak memberi manfaat dan hanya menambah aturan Suspense. `serverActions.bodySizeLimit` dinaikkan ke 5 MB untuk file cadangan.

## D-19 · Login satu pengguna
**Status: Diputuskan**

Magic link Supabase dengan tiga lapis pembatas: pendaftaran dimatikan di Supabase, `shouldCreateUser: false`, dan email harus sama dengan env `OWNER_EMAIL` (dicek saat meminta tautan, saat tautan dibuka, dan di setiap halaman). Email selain pemilik mendapat pesan yang sama supaya tidak bisa dipakai menebak email.

Template email memakai format `token_hash` (`supabase/templates/magic_link.html`) agar tautan bisa dibuka di perangkat lain, misalnya diminta dari laptop lalu dibuka di HP. Rute `/auth/confirm` juga menerima `?code=` dari template bawaan Supabase sebagai cadangan.

## D-20 · Mekanisme impor
**Status: Diputuskan**

Transformasi dilakukan di TypeScript (`lib/legacy/transform.ts`, fungsi murni yang diuji). Hasilnya dikirim ke RPC `import_legacy_backup` yang menyisipkan semua tabel dalam satu transaksi database dengan `on conflict (id) do nothing`. RPC berjalan sebagai pengguna (SECURITY INVOKER) sehingga tetap tunduk pada RLS, dan hanya menerima daftar tabel yang sudah ditentukan.

Nilai `transactions.source` ditambah `'import'` (SPEC hanya menyebut manual, agent, receipt, voice, automation) supaya data hasil migrasi bisa dibedakan.

Saat impor:
- Rencana kerja tugas yang punya jam mulai tanpa jam selesai diberi durasi 2 jam (melengkapi D-06).
- `completed_at` tugas memakai `doneAt` jam 12.00 WIB.
- Transaksi yang akunnya sudah terhapus di app lama dipindah ke akun arsip "Akun lama (terhapus)" supaya tidak ada yang hilang.

## D-21 · Kalender gabungan sebagai fungsi TypeScript
**Status: Diputuskan**

SPEC 5.4 membolehkan view atau fungsi server. Dipilih `buildCalendarItems()` di `lib/calendar.ts` karena kelas mingguan dan acara berulang perlu diekspansi per hari, dan aturannya (kelas hanya di rentang semester dan dilewati saat libur, acara beberapa hari) lebih mudah diuji di TypeScript.

## D-22 · Penyesuaian kolom terhadap SPEC 5
**Status: Diputuskan**

- `categories.slug` (unik per pengguna) untuk kategori bawaan, dipakai bootstrap dan impor.
- `research_needs.is_fulfilled` dipertahankan sebagai kolom generated dari `status`, jadi kode yang mengikuti SPEC tetap bisa memakainya.
- `readings.inclusion` (use, maybe, exclude) untuk field "Keputusan" literatur lama.
- `tasks.status` tidak diubah menjadi `overdue` saat impor. Status itu diisi otomasi "Tugas lewat tenggat" di Fase 6, sementara UI menandai keterlambatan dari tanggal.
- `accounts.balance` dikunci pemicu: nilai dari klien diabaikan, hanya pemicu transaksi dan perubahan `opening_balance` yang mengubahnya.
- Tabel `legacy_id_map` dan `legacy_imports` ditambahkan untuk migrasi.

## D-23 · Tipe database ditulis manual dulu
**Status: Diputuskan, sementara**

`lib/types.ts` ditulis tangan untuk kolom yang dipakai UI. Setelah proyek Supabase tersedia, ganti dengan hasil `npx supabase gen types typescript --linked > lib/database.types.ts` dan pasang ke klien.

## D-24 · Branch Fase 1
**Status: Diputuskan pemilik**

Pemilik meminta branch `fase-1-fondasi-data`. Karena PR Fase 0 ([dedennf/HUB#1](https://github.com/dedennf/HUB/pull/1)) belum di-merge, branch ini dibuat dari branch Fase 0 sehingga PR Fase 1 juga memuat commit dokumen Fase 0 sampai PR #1 di-merge.

## D-25 · Identitas login tidak bergantung pada getClaims()
**Status: Diputuskan (perbaikan bug)**

Gejala: setelah membuka magic link, pemilik selalu diarahkan ke `/login?error=not_owner`. `getClaims()` memverifikasi ulang token (lewat JWKS atau `getUser`), dan jika verifikasi itu gagal ia mengembalikan `data: null` disertai error. Kode lama mengabaikan error tersebut sehingga email terbaca kosong.

Perbaikan:
- `/auth/confirm` mengambil email dari hasil `verifyOtp` / `exchangeCodeForSession` (`data.user`, cadangan `data.session.user`).
- `requireUser()` dan `proxy.ts` tetap memakai `getClaims()`, tetapi jatuh ke `getUser()` jika gagal atau klaim email tidak ada.
- Setiap alasan gagal dicatat dengan `console.error` berawalan `[auth]` (terlihat di Vercel Logs). Token dan kode tidak pernah dicetak, dan email disamarkan (`pe***@domain`).
- `OWNER_EMAIL` yang kosong di server kini menghasilkan `error=config`, bukan `not_owner`.
