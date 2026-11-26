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

## D-26 · GRANT eksplisit untuk role API dan logout lewat Route Handler
**Status: Diputuskan (perbaikan bug production)**

Log production menunjukkan `permission denied for table ...` di semua tabel. Proyek Supabase baru bisa tidak otomatis memberi role `authenticated` hak atas tabel dan fungsi baru (pengaturan Data API), sedangkan migrasi 0001 sampai 0013 mengandalkan hak bawaan itu. Migrasi `0014_api_grants.sql` memberi GRANT eksplisit (select, insert, update, delete untuk `authenticated`, semua untuk `service_role`, execute fungsi) dan default privileges untuk migrasi berikutnya. Baris tetap dibatasi RLS. Tiruan Supabase di `supabase/tests/00_supabase_stub.sql` sekarang juga tidak memberi hak bawaan, sehingga kesalahan seperti ini tertangkap `npm run test:db`.

Log yang sama menunjukkan sesi lama tidak pernah terhapus setelah ditolak sebagai bukan pemilik, karena `signOut()` dipanggil dari layout (Server Component tidak boleh mengubah cookie). `requireUser()` kini mengalihkan ke Route Handler `/auth/reject` yang menghapus sesi lalu menuju `/login?error=not_owner`.

---

# Keputusan Fase 1b · Desain

## D-27 · Nama fase dan definisi angka di Beranda
**Status: Diputuskan (pemilik meminta Fase 1b Desain sebelum Fase 2)**

- Fase 1b = **Desain** (penerapan `docs/DESIGN.md`). Pekerjaan yang dulu disebut 1b (input di semua modul, dock input cepat, kalender bulan dan minggu, ekspor cadangan) bergeser menjadi usulan **Fase 1c**, menunggu persetujuan pemilik.
- **Uang siap pakai** = saldo semua akun aktif selain akun investasi.
- **Kekayaan bersih** = semua akun aktif + nilai investasi + sisa piutang − sisa utang.
- **"▲ x% bulan ini"** = arus masuk dan keluar akun sejak awal bulan dibagi kekayaan bersih awal bulan. Nilai investasi dan utang dianggap tetap sepanjang bulan karena riwayatnya belum dicatat. Tidak ditampilkan bila belum ada transaksi bulan ini.
- **Grafik 1B, 3B, 6B, 1T** = saldo uang siap pakai per hari, dihitung mundur dari saldo sekarang memakai transaksi. Rentang tanpa transaksi tidak digambar ("Belum ada transaksi dalam …"). Sumbu Y diberi rentang minimum 10% supaya perubahan kecil tidak tampak dramatis.
- Kartu briefing diberi judul **"Hari ini"**, bukan "Briefing pagi · Ra", karena isinya disusun dari data tanpa Ra. Tombol aksinya hanya yang berfungsi (Lihat, Bayar, Ulang). Briefing dari Ra hadir di Fase 6.
- Tombol Struk dan Suara membuka Ra ("Ra segera hadir"). Tombol Catat dan Transfer membuka form transaksi.
- Kotak pencarian di Beranda laptop dan ikon cari di Uang tidak dipasang karena fitur pencarian belum ada. Tombol "+" di Agenda dan "Cocokkan saldo" di Uang menunggu Fase 1c.
- Nama dan program studi untuk sapaan disimpan di `settings` (`profile_name`, `profile_program`) dan diubah di Saya, Profil.

## D-28 · Kontras warna: token tambahan di luar DESIGN 2.1
**Status: Diputuskan**

DESIGN 2.1 memasangkan `--on-accent` `#FFFFFF` dengan `--accent` gelap `#12A58C` (kontras 3,1:1), padahal DESIGN juga mewajibkan kontras teks minimal 4,5:1. Ditambahkan dua token:
- `--accent-fill`: latar berisi teks putih (tombol primer, tab rentang aktif, tanggal terpilih, tombol Ra). Terang `#0E7C6B`, gelap `#0E7C6B` (5,1:1).
- `--accent-strong`: teks accent di atas `--accent-soft` (menu sidebar aktif). Terang `#0A5E51`, gelap `#3CC2A9`.

`--accent` tetap dipakai untuk teks, ikon, garis, dan bar progres. Semua halaman lolos pemeriksaan axe-core WCAG 2 AA di mode terang dan gelap.

Token lain yang ditambahkan karena dibutuhkan komponen DESIGN 6 tetapi tidak tercantum di tabel 2.1: warna avatar akun (`--av-*`, dari mockup Uang, dengan pasangan gelap), warna toast undo, overlay sheet, dan warna kategori "acara" (`--cat-event`).

## D-29 · Penyimpanan tema, privasi, dan panel Ra
**Status: Diputuskan**

- Tema: `settings.theme` (lintas perangkat) dan `localStorage` `kompas-theme`. Skrip kecil di `<head>` memasang tema sebelum halaman tampil sehingga tidak berkedip. Bila pilihan di database berbeda (diubah dari perangkat lain), `ThemeSync` menyesuaikan.
- Privasi saldo: `localStorage` `kompas-privacy`, per perangkat sesuai DESIGN 4. Grafik saldo ikut disembunyikan.
- Panel Ra laptop yang diciutkan: `localStorage` `kompas-ra-collapsed`.

## D-30 · Komponen Ra tanpa data asli dan undo manual
**Status: Diputuskan**

- RaSheet, RaPanel, dan RaInputBar tampil di app dengan "Ra segera hadir". Input Ra bisa difokuskan (Ctrl+K) tetapi belum mengirim apa pun.
- ChatBubble, ActionCard, ActionBar, OfflineBanner, RecordingView, dan ReceiptScanning belum punya data asli. Keenamnya dipajang di `/dev/komponen` yang hanya ada saat pengembangan (404 di production), sehingga tidak ada data contoh di app sungguhan (DESIGN 8).
- UndoToast sudah dipakai sungguhan: setelah mencatat transaksi manual, tombol Batalkan selama 10 detik menghapus transaksi itu (saldo ikut kembali lewat pemicu).
- Flashcard dan StatTile ditunda ke fase Bahasa Inggris karena belum ada halaman yang memakainya.
- Mencentang tugas di TaskRow langsung menyimpan status (aksi pengguna sendiri, bukan usulan Ra).

---

# Keputusan Fase 1c · Port fitur lama

## D-31 · Formulir generik untuk semua modul
**Status: Diputuskan**

Satu daftar entitas (`lib/entities/registry.ts`) memuat field, skema Zod, dan pemetaan baris untuk 19 jenis data: tugas, mata kuliah, jadwal, materi, semester, acara, libur, proyek riset, target, kebutuhan, ide, literatur, bimbingan, tagihan, utang/piutang, target tabungan, biaya sejati, investasi, dan kategori. Halaman `/catat/[jenis]` (tambah) dan `/catat/[jenis]/[id]` (ubah dan hapus) serta satu server action melayani semuanya. Query string mengisi nilai awal (mis. `/catat/jadwal?course_id=…`), dan `?kembali=` menentukan tujuan setelah simpan.

Aturan khusus:
- Semester aktif hanya satu: menandai satu semester aktif otomatis menonaktifkan yang lain.
- Menyimpan target riset memperbarui `last_touched_at`.
- Rencana kerja tugas disimpan sebagai satu `task_work_slots` (bukan usulan agen), durasi bawaan 2 jam.
- Kategori bawaan tidak bisa dihapus, hanya disembunyikan.

Aksi khusus di luar formulir generik:
- **Bayar tagihan** mencatat pengeluaran lalu memajukan jatuh tempo (bulanan +1 bulan, tahunan +1 tahun, sekali bayar = nonaktif).
- **Cicilan utang atau piutang** menambah `paid_amount`, dan bila akun dipilih ikut mencatat transaksi.
- **Cocokkan saldo** mencatat selisih sebagai transaksi penyesuaian di kategori Lainnya.

## D-32 · Ra memakai pengurai lokal sebelum Gemini
**Status: Diputuskan**

Pengurai lokal app lama di-port ke `lib/parse/` (fungsi murni, tanggal selalu dihitung dari tanggal WIB yang dikirim server). Input Ra di panel laptop dan sheet HP aktif. Perintah yang dikenali: transaksi (keluar, masuk, transfer, tarik atau setor tunai, biaya admin), tugas (dengan mata kuliah, tenggat, rencana kerja), acara (jam, tempat, berulang, beberapa hari), ide, kebutuhan riset, serta pertanyaan saldo, pengeluaran atau pemasukan per periode dan kategori, tugas, dan tagihan. Beberapa perintah sekaligus bisa dipisah koma, "terus", atau "lalu".

Sesuai SPEC 6.3, hasilnya selalu berupa kartu usulan. Tidak ada data yang berubah sampai pengguna menekan Setujui. Setelah disimpan, toast Batalkan 10 detik menghapus semua yang baru dibuat. Usulan belum dicatat di `agent_actions` dan chip belum bisa diubah langsung, karena itu bagian Fase 3 (agen Gemini). Selama fitur suara belum ada, tombol bulat accent di bar input menjadi tombol kirim.

Keempat kalimat uji SPEC Fase 3 sudah lolos di unit test pengurai. Perintah app lama yang belum di-port ke pengurai (mengubah akun, mata kuliah, jadwal, anggaran, utang, tagihan, investasi lewat kalimat) tersedia lewat formulir dan akan ditangani Ra Gemini.

## D-33 · Kalender bulan dan minggu, ekspor cadangan
**Status: Diputuskan**

- Kalender punya tiga tampilan lewat `?tampilan=`: Agenda (bawaan), Minggu, dan Bulan. Tampilan bulan memakai kisi Senin sampai Minggu dengan titik warna per jenis item, dan daftar item hari terpilih di bawahnya.
- Ekspor: `/api/ekspor/json` (seluruh tabel data, tanpa `user_id`, format `{ app: 'kompas', version: 1 }`) dan `/api/ekspor/csv` (transaksi, waktu WIB, UTF-8 dengan BOM agar terbaca Excel). Keduanya hanya untuk pemilik. Impor dari format Kompas sendiri belum dibuat, karena data sudah tersimpan di database dan tersinkron.

## D-34 · Fitur lama yang belum kembali setelah Fase 1c
**Status: Dicatat**

Dari daftar AUDIT Bagian 7, yang belum ada: subtugas (kolom `parent_id` sudah ada, belum ada UI), tautan literatur ke target dan ide (kolom sudah ada), gabung kategori, statistik belajar (persen tepat waktu, streak), grafik cashflow 6 bulan, mode offline PWA (Fase 6), dan pemulihan dari cadangan JSON Kompas. Semuanya bisa dikerjakan bersama fase yang relevan.

---

# Keputusan Fase 2 · Tools dan API

## D-35 · Bentuk tool: baca langsung, tulis dua tahap
**Status: Diputuskan**

SPEC 6.8 meminta `execute()`, `summarize()`, dan `buildUndo()`. Di Kompas, tool tulis dipecah menjadi `prepare` dan `commit`:
- `prepare` memvalidasi argumen (Zod), meresolusi nama ke id, dan menyusun ringkasan kartu. Tahap ini tidak pernah mengubah data, sehingga cocok dengan alur "usulan aksi" SPEC 6.2.
- `commit` dijalankan setelah pengguna menyetujui dan mengembalikan `undo` berisi operasi pembalik (hapus baris baru, kembalikan nilai lama, atau sisipkan ulang baris yang dihapus dengan id yang sama).

Argumen yang sudah diresolusi (`resolved`) inilah yang nanti disimpan di `agent_actions.args`. `lib/agent/executor.ts` menyediakan `callTool`, `commitTool`, dan `undo`. `functionDeclarations()` mengubah skema Zod menjadi JSON Schema (`parametersJsonSchema`) untuk Gemini.

Nominal boleh dikirim sebagai teks rupiah ("30rb") dan dikonversi ke integer. Waktu menerima `YYYY-MM-DD` (jam 12.00 WIB), `YYYY-MM-DDTHH:MM` (WIB), atau ISO lengkap.

## D-36 · Tool yang butuh penalaran bahasa atau gambar
**Status: Diputuskan**

- `correct_writing` tidak memanggil Gemini dari dalam tool. Model menulis koreksinya sendiri lalu memanggil tool ini dengan `corrected`, `mistakes[]`, dan `score`, kemudian tool menyimpan `writing_submissions` dan memperbarui `mistake_patterns`. Parameter ini melengkapi SPEC (`text`, `kind`).
- `explain_text` dan `start_practice` mengembalikan data pendukung (level, tujuan, pola kesalahan teratas, kata yang sudah dikenal, kosakata jatuh tempo). Penjelasan dan latihannya disusun model.
- `read_receipt` membaca kolom `receipts.extracted`. Pengisiannya oleh Gemini Vision dikerjakan di fase Struk.

## D-37 · Aturan resolusi dan tebakan
**Status: Diputuskan**

- Urutan pencocokan nama: id persis, nama atau alias persis, awalan, mengandung, lalu semua kata kueri. Lebih dari satu kandidat di satu tingkat menghasilkan galat dengan `candidates`, supaya agen bertanya, bukan menebak.
- Memori `alias` dicek sebelum nama akun, kategori, dan mata kuliah. Kategori transaksi: memori `merchant_rule`, kategori yang disebut, merchant, lalu kata di catatan, dengan cadangan "Lainnya" yang ditandai meragukan.
- Akun yang tidak disebut: akun yang paling sering dipakai untuk kategori itu (SPEC 6.5), ditandai `doubtful: ['account']` untuk kartu kuning.
- Mata kuliah semester aktif diutamakan. Proyek riset yang tidak disebut memakai proyek aktif pertama.
- Ra pengurai lokal (D-32) kini menyimpan lewat registry yang sama, sehingga transaksi yang disetujui tercatat dengan `source = 'agent'`. Dari klien, `undoRa` hanya menerima operasi hapus. Undo yang lebih luas berjalan dari payload tersimpan di server pada Fase 3.

---

# Keputusan Fase 3 · Inti Agen dan Input Teks

## D-38 · Antarmuka model dan SDK Gemini
**Status: Diputuskan**

Loop agen (`lib/agent/core.ts`) bicara ke antarmuka `AgentModel` (`lib/agent/model.ts`), bukan langsung ke SDK. Implementasi produksinya `GeminiModel` memakai `@google/genai` dengan pemanggilan fungsi manual (`automaticFunctionCalling` dimatikan), karena tool tulis tidak boleh dijalankan sebelum pengguna setuju. Uji memakai model tiruan dengan antarmuka yang sama.

- `GEMINI_API_KEY` dan `GEMINI_MODEL` wajib. Nama model sengaja tidak ditulis di kode supaya bisa diganti dari Vercel tanpa deploy ulang kode.
- `GEMINI_BASE_URL` hanya untuk uji e2e dengan server Gemini tiruan. Jangan diisi di production.
- Konten giliran model disimpan utuh di `agent_messages` (termasuk `thoughtSignature`), supaya riwayat tetap sah untuk Gemini di giliran berikutnya. Riwayat yang dikirim dibatasi 16 pesan terakhir.

## D-39 · Usulan, konfirmasi, dan undo
**Status: Diputuskan**

- Setiap panggilan tool tulis menjadi baris `agent_actions` berstatus `proposed`. `args` berisi argumen yang sudah diresolusi, `result` menyimpan `original_args`, `doubtful`, `warning`, dan `followups`. Gemini menerima `{status: 'menunggu_konfirmasi', action_id, summary}`.
- `edits` di `/api/agent/confirm` memakai nama argumen tool (`category`, `account`, `occurred_at`, `from_account`, `to_account`, `course`, `due_at`) dengan nilai id atau tanggal. Server menggabungkannya ke `original_args`, menjalankan `prepare` ulang, baru `commit`. Jadi validasi dan resolusi tetap lewat registry.
- SPEC 6.3 meminta eksekusi "di dalam transaksi database". Registry berjalan lewat PostgREST yang tidak punya transaksi lintas permintaan, jadi "Setujui semua" dijalankan berurutan dan bila satu gagal, semua yang sudah jalan di batch itu dibalik memakai undo payload. Hasil akhirnya sama: semua tersimpan atau tidak ada.
- Undo selalu memakai `undo_payload` yang tersimpan di server, baik dari toast maupun dari Log Agen (`/pengaturan/log-agen`). Klien hanya mengirim id aksi. `undoRa` lama dan server action `ra-actions.ts` dihapus.
- Usulan yang belum diputuskan ketika pengguna mengirim pesan baru otomatis ditolak.
- Respons `/api/agent` mengikuti SPEC 6.1 (`proposed_actions`, `english_feedback`) dan menambah `lookups` (daftar akun, kategori, mata kuliah untuk pilihan chip), `lines`, serta `offline`.

## D-40 · Belajar dari koreksi
**Status: Diputuskan**

Saat pengguna mengganti chip sebelum menyetujui:
- Kategori transaksi berubah: `merchant_rule` dengan kunci merchant atau catatan pendek (maksimal 3 kata) → `{category_id}`.
- Akun transaksi berubah: `correction` dengan kunci yang sama → `{account_id}`. `add_transaction` memakai koreksi ini sebagai akun bawaan bila akun tidak disebut, sebelum tebakan "akun paling sering".
- Mata kuliah tugas berubah: `alias` dari teks mata kuliah yang disebut → `{course_id}`. `resolveCourse` kini membaca memori alias.

Memori yang sama diperbarui, bukan diduplikasi. Nilai sama menaikkan `confidence` 0,1 (maksimal 1), nilai berbeda mengembalikannya ke 0,7. `last_used_at` diperbarui saat memori dipakai di konteks. Aturan merchant kini dicocokkan sebagai kata utuh di merchant atau catatan.

Tebakan kategori dari kata lepas di catatan dipersempit: hanya kata minimal 4 huruf yang sama persis dengan nama atau kata kunci kategori. Sebelumnya "pak" di "titip pak ujang" ikut cocok ke "Pulsa & internet" lewat kata kunci "paket".

## D-41 · Cadangan saat Gemini tidak tersedia
**Status: Diputuskan**

Bila Gemini belum diatur atau gagal (kuota, timeout, ditolak, jaringan), `/api/agent` memakai pengurai lokal (D-32). Hasil pengurai diubah menjadi panggilan tool lalu disimpan sebagai `agent_actions` biasa, jadi kartu, konfirmasi, undo, dan Log Agen identik dengan jalur Gemini. Klien menampilkan `OfflineBanner` dengan alasannya. Slot "kerjakan" dari pengurai disimpan sebagai `followups` dan dijalankan setelah tugasnya tersimpan.

Batas laju 30 pesan per menit dihitung dari `agent_messages` peran `user`. `agent_max_steps` dibaca dari tabel settings (bawaan 6, maksimal 12).

## D-42 · Ra tidak boleh diam saat server bermasalah
**Status: Diputuskan**

- Loop Gemini punya batas waktu total 40 detik (`AGENT_BUDGET_MS`), dan tiap panggilan Gemini 20 detik. Setelah itu pengurai lokal mengambil alih, jauh sebelum fungsi Vercel dipotong di 60 detik (yang sebelumnya muncul sebagai "tidak tersambung ke server").
- Galat di luar model saat loop agen (database, tool, data tak terduga) dicatat lengkap di log `[agent] loop agen galat` lalu tetap dilayani pengurai lokal dengan banner "galat di server Ra".
- Pesan galat di chat kini menyebut penyebabnya (status HTTP, waktu habis, sesi login habis, atau tidak ada internet) alih-alih satu kalimat umum.

## D-43 · Tingkat berpikir Gemini dan batas waktu per panggilan
**Status: Diputuskan**

Di production Gemini membalas `504 DEADLINE_EXCEEDED`. SDK mengirim `httpOptions.timeout` ke Google sebagai `X-Server-Timeout`, jadi satu panggilan berpikir lebih dari 20 detik dihentikan Google sendiri. Penyebabnya mode berpikir bawaan model Gemini 3 untuk konteks berisi 38 deklarasi tool.

- `thinkingConfig.thinkingLevel` dikirim dengan bawaan `low`. Bisa diatur lewat `GEMINI_THINKING_LEVEL` (`minimal`, `low`, `medium`, `high`, atau `off` untuk tidak mengirimnya).
- Bila model menolak pengaturan ini (400 yang menyebut thinking), permintaan dikirim ulang tanpa pengaturan itu dan model tersebut diingat selama proses server hidup.
- Batas per panggilan 25 detik, batas loop tetap 40 detik (D-42).
- 504 dipetakan ke `timeout` dan tidak dicoba ulang. Hanya 500, 502, dan 503 yang dicoba ulang sekali.

## D-44 · Model cadangan saat Gemini utama penuh
**Status: Diputuskan**

Production membalas `503` dua kali berturut-turut untuk `gemini-3.8-flash` (model sedang penuh). Kapasitas model ada di sisi Google, jadi Ra diberi jalan keluar:

- `GEMINI_FALLBACK_MODEL` (opsional). Bila model utama membalas 5xx, 504, atau kuota habis, permintaan langsung dikirim ke model cadangan tanpa mencoba ulang model utama, supaya tetap dalam batas waktu 40 detik (D-42).
- Galat 400, 403, dan 404 (kunci atau nama model salah) tidak dialihkan, supaya salah konfigurasi tetap kelihatan.
- Tanpa model cadangan, perilaku lama berlaku: coba ulang sekali untuk 500, 502, dan 503.
- Pengalihan dicatat di log `[agent] ... pindah ke model cadangan`.

## D-45 · Halaman diagnosa Gemini
**Status: Diputuskan**

Masalah koneksi Gemini di production sulit dibedakan dari log saja (model penuh, nama model, kuota, atau isi permintaan Ra). `GET /api/agent/diagnose` hanya untuk pemilik yang sedang login. Endpoint ini menguji model utama dan model cadangan secara paralel dengan pesan singkat, dengan dan tanpa 38 deklarasi tool, ditambah satu uji tanpa `thinkingLevel`. Hasilnya JSON berisi konfigurasi (tanpa API key), status, galat asli, dan lama tiap uji, dan juga dicatat di log Vercel. Satu kunjungan memakai paling banyak lima permintaan kecil ke Gemini.

---

# Keputusan Fase 4 · Struk

## D-46 · Alur struk: ekstraksi satu kali, usulan dari registry
**Status: Diputuskan**

SPEC 7.2 meminta server "memanggil agen dengan gambar" lalu agen memanggil `read_receipt` dan mengusulkan transaksi. Di Kompas, `/api/receipts/upload` memanggil Gemini satu kali dengan output terstruktur (`responseMimeType: application/json` dan `responseJsonSchema` sesuai SPEC 7.2, ditambah `category_hint`), lalu server menyusun usulan secara pasti lewat registry tools (`add_transaction` atau `add_transfer`, prepare lalu agent_actions). Alasannya:
- Satu panggilan Gemini per struk, bukan dua sampai tiga putaran loop agen. Lebih hemat kuota dan cepat (D-42 sampai D-45 menunjukkan kuota dan waktu itu sempit).
- Aturan SPEC (bukti transfer antar akun sendiri → transfer, keyakinan < 0,7 → field kuning, merchant_rule dulu) berjalan pasti dan bisa diuji, tidak bergantung nalar model.
- Kartu, konfirmasi, undo, dan Log Agen sama persis dengan input teks. `read_receipt` tetap ada untuk agen membaca hasil tersimpan.

Rincian:
- **Duplikat**: hash SHA-256 dihitung klien dari berkas asli sebelum dikompres, supaya foto atau screenshot yang sama selalu menghasilkan hash yang sama. Server menolak hash yang sudah ada dan menautkan ke transaksinya. Struk yang usulannya ditolak, di-undo, atau gagal dibaca boleh diunggah ulang: indeks unik `receipts_hash_uq` kini hanya untuk status selain `rejected` (migrasi 0015).
- **Status struk**: `pending` saat dibaca, `confirmed` saat usulan disetujui, `rejected` saat ditolak, di-undo, atau total tak terbaca. Bila Gemini gagal, berkas dan barisnya dihapus.
- **Penyimpanan**: bucket privat `receipts`, berkas di `<user_id>/<hash>.<ext>`, RLS Storage per folder pengguna. Gambar ditampilkan lewat signed URL 10 menit (kartu usulan dan halaman ubah transaksi).
- **Ukuran**: foto dikompres di klien (sisi terpanjang 1600 px, JPEG 0,8). HEIC yang tidak bisa dibaca browser dikirim asli (Gemini membaca HEIC). Batas 4 MB per berkas karena batas body fungsi Vercel 4,5 MB, termasuk PDF.
- **Akun dan kategori**: nama akun dan kategori pengguna dimasukkan ke prompt. `payment_method` atau akun asal yang cocok dengan akun pengguna dipakai sebagai akun. Bukti transfer ke pihak lain menjadi pengeluaran dari akun asal. Kategori: merchant_rule di memori, lalu `category_hint` dari Gemini.
- **Field meragukan**: keyakinan < 0,7 menandai nominal dan tanggal. Chip "Cek nominal" bisa diubah sebelum disetujui (`edits.amount`). Tanggal di masa depan atau lebih dari 400 hari lalu dianggap salah baca dan diganti waktu sekarang.
- **Batas laju**: 20 struk per menit. Satu permintaan satu struk. Banyak struk diunggah berurutan dan digabung menjadi satu pesan Ra dengan "Setujui semua".
- Transaksi dari struk tercatat dengan `source = 'receipt'` dan `receipt_id`.

---

# Keputusan Fase 5 · Suara Tingkat 1

## D-47 · Pesan suara ke Gemini
**Status: Diputuskan**

- **Format**: perekam memakai `MediaRecorder` (webm/opus di Chrome, mp4 di Safari). Sebelum dikirim, rekaman diurai dengan Web Audio lalu ditulis ulang sebagai WAV 16 kHz mono. Daftar format audio resmi Gemini memuat WAV, sedangkan webm tidak, dan mp4 dari Safari belum pasti. WAV 60 detik kira-kira 1,9 MB, masih di bawah batas body Vercel 4,5 MB. Ini bukan speech-to-text: audio tetap utuh dan Gemini yang mendengarkan (SPEC 7.3). Bila browser tidak bisa mengurai, rekaman asli dikirim.
- **Interaksi**: tahan tombol mic untuk bicara, lepas untuk kirim, geser ke kiri lebih dari 80 px untuk batal. Ketukan singkat memulai mode ketuk: rekaman berjalan sampai tombol mic diketuk lagi atau tombol Kirim ditekan. Batas 60 detik, lalu terkirim otomatis. Keyboard: Enter atau Spasi pada tombol mic. Saat kolom teks berisi, tombol bulat menjadi tombol kirim teks.
- **Transkrip**: audio dikirim sebagai `inlineData` di giliran pengguna, dan konteks sistem diberi aturan PESAN SUARA. Gemini wajib mengawali jawaban teks terakhirnya dengan baris "Transkrip: ...". Server memisahkan baris itu dari balasan, lalu menampilkannya di gelembung pesan suara. Ini menghemat satu panggilan transkripsi terpisah.
- **Privasi dan riwayat**: audio tidak disimpan di mana pun. Di `agent_messages`, giliran pengguna disimpan sebagai teks `[pesan suara] <transkrip>`, jadi percakapan lanjutan tidak mengirim ulang audio. Percakapan baru dari suara memakai `channel = 'voice'`.
- **Saat Gemini tidak tersedia**: pengurai lokal tidak bisa mendengar. Ra menjawab dengan banner offline dan meminta pengguna mengetik. Tidak ada usulan yang dibuat.
- **Dikte bawaan browser** (opsi di SPEC 7.3) tidak ditambahkan. Keyboard HP sudah punya tombol dikte sendiri.
- **Belum teruji di perangkat asli**: Safari iPhone dan Chrome Android. Uji otomatis memakai Chromium dengan mikrofon palsu di ukuran laptop dan HP.

## D-48 · Pesan suara: transkripsi dulu, lalu loop agen biasa
**Status: Diputuskan** (mengganti bagian "Transkrip" di D-47)

Di production pesan suara berhenti di batas waktu 40 detik ("Gemini terlalu lama menjawab"). Penyebabnya, versi D-47 mengirim audio di giliran pengguna, sehingga audio ikut terkirim ulang di setiap langkah loop agen (biasanya 2 sampai 3 langkah), selalu bersama 38 deklarasi tool.

Sekarang audio diproses dua tahap, keduanya oleh Gemini:
1. **Transkripsi** (`lib/agent/voice.ts`): satu panggilan dengan audio sebagai inline data, tanpa tool, output JSON `{transcript, clear}`, tingkat berpikir `minimal`. Rekaman sunyi atau tidak jelas → Ra meminta mengulang, tidak ada usulan.
2. **Loop agen biasa** dengan teks `[pesan suara] <transkrip>`. Konteks sistem memberi tahu bahwa teks itu transkrip otomatis yang mungkin salah dengar.

Klien tetap mengirim audio mentah dan tidak ada speech-to-text di perangkat (SPEC 7.3). Yang berubah hanya urutan di server: Gemini menulis ucapan dulu, baru memahami dan memanggil tool, alih-alih keduanya dalam satu giliran. Aturan "Transkrip:" di jawaban akhir dihapus. Transkrip lebih andal karena tidak bergantung format jawaban model. `/api/agent/diagnose` menambah uji transkripsi audio 1 detik untuk mengukur waktunya di production.

## D-49 · Rekaman sunyi tidak dikirim ke Gemini
**Status: Diputuskan**

Diagnosa production menunjukkan Gemini "mentranskripsi" 1 detik audio sunyi menjadi "Catat ya, beli kopi 25rb." Model mengarang perintah dari keheningan, dan prompt bertema keuangan ikut mendorongnya. Usulan hasil karangan itu tetap harus disetujui pengguna, tapi tidak boleh muncul sama sekali.

Tiga lapis pengaman:
1. **Browser**: perekam mencatat puncak RMS (Web Audio, `getByteTimeDomainData`). Di bawah 0,02 rekaman tidak dikirim, dan Ra menjawab "Tidak ada suara yang terdengar".
2. **Server**: untuk WAV PCM 16-bit, puncak RMS dihitung per jendela 100 ms. Di bawah 0,01 transkripsi dilewati tanpa memanggil Gemini, sehingga ucapan pendek di antara jeda tetap lolos.
3. **Prompt transkripsi**: tema keuangan dihapus. Model diminta hanya menulis ucapan manusia yang terdengar, dilarang mengarang, dan mengisi `clear = false` untuk sunyi, bising, atau musik.

`/api/agent/diagnose` kini memakai 1 detik nada 440 Hz (bukan ucapan) sebagai uji transkripsi. Bila model mengembalikan transkrip, hasilnya ditandai `halusinasi`.

---

# Keputusan Fase 6 · Otomasi dan Notifikasi

## D-50 · Penjadwal berjalan sebagai pemilik, isi otomasi disusun kode
**Status: Diputuskan**

- **Sesi pemilik**: `/api/cron/tick` tidak memakai service role untuk membaca dan menulis data. Service role hanya membuat tautan masuk untuk `OWNER_EMAIL` (`auth.admin.generateLink`, tanpa email terkirim). Tautan itu langsung ditukar jadi sesi (`verifyOtp`) dan sesinya ditutup setelah tick. Dengan cara ini RLS, `user_id` bawaan, dan seluruh registry tools berlaku persis seperti saat pemilik memakai app, tanpa jalur kode kedua yang melewati RLS.
- **Penjadwal**: pg_cron memanggil tick tiap 5 menit lewat pg_net. URL dan `CRON_SECRET` disimpan di Supabase Vault (`docs/cron-setup.sql`), bukan di migrasi atau kode, karena nilainya berbeda per lingkungan dan bersifat rahasia. Vercel Cron Hobby hanya boleh sekali sehari, jadi `vercel.json` memakainya sebagai cadangan harian (23.05 UTC = 06.05 WIB). `proxy.ts` mengecualikan `/api/cron/` dari pengalihan login karena rute itu dilindungi `CRON_SECRET` sendiri (perbandingan waktu-konstan).
- **Aman dari eksekusi ganda (SPEC 8.3)**: `claim_due_automations` dan `claim_automation_events` mengambil baris dengan `for update skip locked`. Otomasi terjadwal diberi sewa 10 menit (next_run_at maju), peristiwa langsung ditandai diproses. Dua tick bersamaan mendapat himpunan yang terpisah (diuji).
- **Otomasi bawaan (SPEC 8.5)**: 12 otomasi dipasang otomatis di tick pertama (kolom `system_key`), jadwalnya mengikuti jam di Pengaturan. Yang bermode "agent" (briefing, rekap, saran slot, transaksi janggal, rekap mingguan, minggu padat) disusun kode dari data, bukan teks bebas Gemini. Alasannya: pasti, cepat, dan tidak memakan kuota Gemini yang terbukti sempit (D-42 sampai D-49). Batasan SPEC 8.1 tetap dipegang: mode agent hanya mengirim notifikasi atau usulan di `agent_actions` yang dikonfirmasi di Beranda.
- **Tugas lewat tenggat**: otomasi bawaan "Tugas lewat tenggat" mengubah status tugas menjadi `overdue` tanpa konfirmasi, sesuai daftar SPEC 8.5. Ini perubahan status, bukan data baru.
- **Peristiwa data**: pemicu database di `transactions`, `tasks`, `research_targets`, `vocab`, dan `bills` menulis ke `automation_events`, jadi semua jalur input (form, Ra, struk, suara, impor) tercakup. Lebih dari 20 peristiwa sejenis dalam satu tick dianggap impor massal dan dilewati. Transaksi yang terjadi lebih dari 2 hari lalu tidak memicu peringatan budget atau transaksi janggal.
- **Riwayat jalan**: otomasi tiap 5 menit (pengingat tenggat, lewat tenggat, ambang saldo) hanya mencatat run yang menghasilkan sesuatu, supaya riwayat tidak terisi 288 baris kosong per hari.

## D-51 · Aturan buatan pengguna
**Status: Diputuskan**

- `create_automation` tetap tool tulis biasa: kartu menampilkan aturan dalam bahasa manusia ("Tiap tanggal 5 jam 08.00 → Catat pengeluaran Rp150.000 dari GoPay, Pulsa & internet · Otomatis tanpa konfirmasi: Ya") dan baru tersimpan setelah disetujui.
- Aksi `add_transaction` hanya ditulis langsung bila `mode = rule` dan `auto_write = true` (disetujui saat aturan dibuat). Selain itu menjadi usulan di Beranda. Transaksi dari otomasi tercatat `source = 'automation'`.
- Pemicu ambang (`threshold`) dicek tiap tick, tapi paling banyak jalan sekali per hari selama kondisinya bertahan.
- `agent_task` menjalankan loop agen (maks 4 langkah, 30 detik). Tool tulis tetap menjadi usulan. Tanpa Gemini, run dicatat dilewati.
- Mengaktifkan ulang otomasi dari halaman Otomasi mengosongkan `next_run_at`, sehingga jadwalnya dihitung ulang dari saat itu, bukan langsung menembakkan jadwal yang terlewat.

## D-52 · Notifikasi dan jam tenang
**Status: Diputuskan**

- Semua notifikasi disimpan di `notifications` (lonceng di Beranda, daftar di Saya → Notifikasi), lalu dikirim lewat Web Push (`web-push`, VAPID) ke semua perangkat. Langganan yang dibalas 404 atau 410 dihapus.
- `dedupe_key` unik per pengguna mencegah pengingat yang sama terkirim dua kali (mis. `deadline:<id>:h1`, `briefing:<tanggal>`). Indeksnya unik biasa, bukan parsial, supaya bisa dipakai `upsert ... on conflict`. NULL tetap boleh banyak.
- Jam tenang: notifikasi yang dibuat di dalam jam tenang diberi `deliver_after` = akhir jam tenang, lalu dikirim tick pertama setelahnya. Pengecualian SPEC 8.1: tenggat yang jatuh di dalam jam tenang itu sendiri tetap dikirim langsung.
- Kunci VAPID dibaca saat runtime, bukan `process.env.NEXT_PUBLIC_*` literal yang ditanam Next saat build. Dengan begitu kunci yang diisi setelah build tetap terbaca.
- Petunjuk iPhone (SPEC 9): Safari baru mendukung push untuk app yang ditambahkan ke Layar Utama. Halaman Notifikasi menampilkan langkahnya bila Safari di iPhone belum dalam mode standalone.
- Usulan yang menunggu (dari otomasi maupun percakapan yang belum diputuskan, 7 hari terakhir) tampil sebagai kartu di Beranda dengan Setujui dan Tolak, menggantikan banner "N usulan" lama.

---

# Keputusan Fase 7 · Bahasa Inggris

## D-53 · Fitur bahasa memanggil Gemini langsung, bukan lewat loop agen
**Status: Diputuskan**

Jelaskan, pecah kalimat, isi entri kata, koreksi tulisan, pertanyaan latihan bicara, penilaian bicara, dan umpan balik English Mode memanggil Gemini satu kali dengan output JSON terstruktur (`lib/english/ai.ts`), lalu divalidasi Zod. Tidak lewat loop agen dengan 38 tool, karena lebih cepat, lebih hemat kuota, dan hasilnya terstruktur untuk UI. Tool `correct_writing`, `explain_text`, `start_practice`, dan lainnya tetap ada untuk Ra di chat, dan memakai penyimpanan yang sama (`lib/english/store.ts`).

- Penjelasan untuk pengguna selalu dalam bahasa Indonesia. Teks bahasa Inggris di UI diberi `lang="en"` supaya pembaca layar melafalkannya benar.
- Jenis kesalahan dibakukan ke 13 kategori (`MISTAKE_TYPES`, mis. "article a/an/the", "subject-verb agreement"), supaya `mistake_patterns` terkumpul rapi dan latihan berikutnya bisa memancing pola yang paling sering salah (SPEC 10.4).
- Tanpa Gemini, review kartu dan bank kata tetap jalan. Fitur yang butuh Gemini menampilkan alasannya (belum diatur, kuota habis, terlalu lama).

## D-54 · Aksi pengguna di halaman Bahasa langsung tersimpan
**Status: Diputuskan**

Menilai kartu, menyimpan kata, dan menyimpan hasil koreksi adalah aksi pengguna sendiri di halamannya, bukan usulan Ra. Jadi langsung tersimpan tanpa kartu konfirmasi. Aturan SPEC 6.3 tetap berlaku untuk Ra di chat. Isi yang dibuat Gemini (arti kata, definisi, contoh) selalu tampil di form dulu dan baru tersimpan saat pengguna menekan Simpan.

Sesi latihan dicatat ke `practice_sessions` (review saat dek selesai, baca saat menekan Selesai membaca, tulis setiap koreksi, bicara setiap penilaian). Streak dihitung dari hari yang punya review atau sesi latihan.

## D-55 · English Mode dan latihan bicara
**Status: Diputuskan**

- English Mode tersimpan di setelan `english_mode`. Saat aktif, `/api/agent` menjalankan loop agen dan pemeriksaan bahasa secara paralel, jadi balasan tidak bertambah lama. Pemeriksaan hanya untuk pesan teks (bukan transkrip suara), menghormati tingkat koreksi (`off`, `important_only`, `all`), dan melewati pesan yang bukan bahasa Inggris. Pesan disimpan sebagai `writing_submissions` kind `english_mode` dan menambah `mistake_patterns`. Bila pemeriksaan gagal, balasan Ra tetap tampil.
- Latihan bicara tingkat 1 memakai perekam dan pengaman sunyi dari Fase 5 (D-47, D-49). Gemini diminta menulis transkrip apa adanya dan menandai `heard_speech = false` bila tidak ada ucapan. Rekaman tidak disimpan. Transkrip dan skor masuk `practice_sessions.score`. UI menampilkan catatan bahwa penilaian pelafalan bersifat kasar (SPEC 10.2.4).
- Teks bacaan yang ditempel bisa disimpan ke `readings.content_excerpt`, supaya bacaan dari modul Riset bisa dibuka lagi.

---

# Keputusan Fase 8 · Suara Tingkat 2

## D-56 · Percakapan langsung lewat Gemini Live dengan token sementara
**Status: Diputuskan**

- **Token sementara (SPEC 7.3)**: `/api/live/token` membuat token Live API v1alpha (`authTokens.create`) yang sekali pakai, harus dipakai dalam 1 menit, dan berlaku paling lama 30 menit. Model, instruksi sistem, transkrip dua arah, dan deklarasi tools dikunci di token (`liveConnectConstraints`), jadi klien tidak bisa mengubahnya. `GEMINI_API_KEY` tidak pernah sampai ke browser. Batas 20 percakapan per jam.
- **Klien tersambung langsung** ke Gemini lewat SDK `@google/genai` (dimuat dinamis saat dipakai). Mikrofon diambil lewat AudioWorklet (ScriptProcessor untuk Safari lama) dan dikirim sebagai PCM 16-bit 16 kHz per sekitar 100 ms. Suara Ra (PCM 24 kHz) diantrekan tanpa jeda dan dihentikan seketika saat Gemini memberi sinyal `interrupted` (pengguna memotong bicara). AudioContext pemutar dibuat di dalam klik "Mulai" supaya Safari mengizinkan suara.
- **Tools sama, konfirmasi tetap di layar (SPEC 6.3)**: panggilan tool dari Gemini diteruskan klien ke `/api/live/tool`. Server menjalankan tool baca, atau mengubah tool tulis menjadi `agent_actions` proposed. Kartunya muncul di dalam percakapan dengan Setujui dan Tolak, dan Gemini menerima `{status: 'menunggu_konfirmasi'}`. Keputusan pengguna dikabarkan ke Gemini sebagai teks `[layar] ...` tanpa memicu giliran baru.
- **Riwayat**: transkrip dua arah disimpan ke `agent_messages` saat percakapan diakhiri (`/api/live/end`, kanal `voice`, judul "Percakapan langsung"). Audio tidak disimpan.
- **Mode bahasa Inggris**: di `/bahasa/bicara`, instruksi sistem berupa partner percakapan sesuai level, tujuan, tingkat koreksi, dan pola kesalahan teratas. Koreksi disampaikan dengan mengulang bentuk yang benar secara natural, tanpa ceramah. Mode ini tanpa tools. Durasi tercatat sebagai `practice_sessions` kind `speaking`.
- **Verifikasi production**: `/api/agent/diagnose` membuat token dengan konfigurasi asisten yang sama persis (termasuk 38 tool), tersambung, dan menunggu jawaban pertama. Dengan begitu nama model Live dan penerimaan deklarasi tool bisa dipastikan di server asli. Uji lokal memakai server Live tiruan (WebSocket) dengan protokol yang sama.

## D-57 · Login dengan kata sandi, email sebagai cadangan
**Status: Diputuskan**

Saat Kompas dipasang sebagai app (PWA) di laptop atau HP, tautan di email terbuka di browser biasa, bukan di jendela app. Sesi tersimpan di browser itu, sehingga app terpasang tetap di halaman masuk.

Rencana awal memakai kode OTP 6 angka di email. Ternyata proyek Supabase paket gratis tanpa SMTP sendiri tidak bisa mengubah template email (perubahan Supabase Juni 2026), jadi email bawaan hanya berisi tautan dan tidak memuat kode.

Keputusan akhir:
- **Mode utama: email dan kata sandi** (`signInWithPassword`). Tidak bergantung pada email sama sekali, jadi jalan di app terpasang. Kata sandi dibuat atau diganti di Pengaturan, Kata sandi (`updateUser`), minimal 8 karakter.
- **Cadangan: email masuk.** Isi email dulu, lalu tautan dibuka di browser atau kode diketik. Kode langsung jalan begitu template diganti, yaitu kalau nanti memasang SMTP sendiri atau naik ke Pro. Tautan `token_hash` dan `?code=` tetap diterima `/auth/confirm`.
- Pengecekan pemilik dan `bootstrap_user` ada di `lib/auth-finish.ts`, sehingga tiga jalur masuk melewati langkah yang sama. Email selain pemilik tidak pernah dicoba ke Supabase dan mendapat pesan yang sama dengan sandi salah. Batas percobaan mengikuti pembatas bawaan Supabase Auth.

Login tanpa verifikasi sama sekali tidak dipilih. App ini menyimpan data keuangan dan alamatnya publik, jadi harus ada bukti bahwa yang masuk adalah pemilik. Sesi Supabase diperbarui otomatis, jadi kata sandi hanya diminta saat sesi habis atau setelah keluar.

## D-58 · Server Vercel di Singapura
**Status: Diputuskan**

Database Supabase ada di Southeast Asia (Singapore), sedangkan fungsi Vercel tanpa pengaturan berjalan di `iad1` (Washington DC). Setiap halaman memuat beberapa query, dan tiap query bolak-balik Amerika ke Singapura, sehingga app terasa lambat. `vercel.json` kini memakai `"regions": ["sin1"]` agar server berjalan di Singapura, dekat dengan database dan dengan pengguna di Indonesia. Paket Hobby mengizinkan satu region.

Membungkus app menjadi aplikasi desktop (Electron atau Tauri) tidak dipilih sebagai perbaikan kecepatan, karena data tetap diambil lewat server yang sama.

## D-59 · Bola suara di mode Live
**Status: Diputuskan**

Empat batang kecil di samping status diganti bola suara di tengah layar (`components/live/VoiceOrb.tsx`). Tiga lapis gumpalan bergelombang mengikuti volume: mikrofon saat pengguna bicara, dan suara Ra saat Ra bicara. Volume Ra dibaca dari `AnalyserNode` yang dipasang di antara pemutar dan speaker (`PcmPlayer.level()`). Bola abu-abu saat belum tersambung atau mic dibisukan, dan berdenyut pelan saat menyambung.

Digambar di canvas dengan `requestAnimationFrame`. Level dibaca lewat ref, bukan state, supaya React tidak merender ulang tiap frame. Warna diambil dari token tema, jadi ikut mode terang dan gelap. Dengan `prefers-reduced-motion`, bola tidak bergelombang dan hanya membesar mengikuti volume.

## D-60 · Modul Bahasa v2: persiapan IELTS
**Status: Diputuskan**

Pemilik menargetkan IELTS Academic band 6,5, belum ada tanggal tes. Modul Bahasa dirombak dari kumpulan alat lepas menjadi persiapan tes dengan sesi harian sekitar 15 menit. Konsep dan mockup ada di kanvas desain (papan "Bahasa Inggris v2").

**Dasar.** Pembagiannya mengikuti empat jalur Nation (2007): input bermakna, output bermakna, fokus bahasa, dan kelancaran, dengan fokus bahasa tidak mendominasi. Review kartu memakai SM-2 yang sudah ada (pengulangan berjarak). Penilaian Writing dan Speaking memakai empat kriteria public band descriptors IELTS.

**Sesi harian** (`/bahasa/sesi`, tabel `english_days`):
1. **Review kartu.** Maksimal 15 kartu. Dianggap selesai otomatis bila tidak ada kartu jatuh tempo.
2. **5 kata akademik baru.** Pengguna menulis satu kalimat yang diperiksa Gemini. Kata masuk ke bank kata dengan `source_type = 'daily'` dan review pertama dijadwalkan besok.
3. **Satu topik grammar.** Diambil dari kurikulum 29 topik B1 sampai C1 (`lib/english/ielts.ts`). Topik yang terkait 3 kesalahan teratas didahulukan. Topik dianggap dikuasai bila skor terbaik minimal 4 dari 5 (`grammar_progress`).
4. **Satu skill tes bergilir per hari.** Langkah ini tercentang otomatis saat hasil latihan yang cocok disimpan.

   | Hari | Skill |
   |---|---|
   | Senin | Reading |
   | Selasa | Writing Task 2 |
   | Rabu | Speaking Part 1 |
   | Kamis | Speaking Part 2 |
   | Jumat | Writing Task 1 |
   | Sabtu | Speaking Part 3 |
   | Minggu | Laporan |

Konten dari Gemini (kata, materi grammar) disimpan di baris hari itu. Membuka ulang sesi tidak memanggil Gemini lagi.

**Latihan per skill:**
- **Reading:** teks 320 sampai 400 kata dengan 3 soal TRUE/FALSE/NOT GIVEN dan 3 soal pilihan ganda. Band dihitung dari persentase memakai tabel konversi umum 40 soal, dan diberi label kasar.
- **Writing:** Task 1 berbasis tabel data, Task 2 esai. Dinilai per kriteria (Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy) dan bisa direvisi lalu dinilai ulang. Hasilnya tersimpan sebagai `writing_submissions` jenis `ielts_task1` atau `ielts_task2`.
- **Speaking:** Part 1, 2 (cue card, persiapan 1 menit, rekaman sampai 2 menit), dan 3. Dinilai lewat `/api/english/ielts-speaking`. Rekaman tidak disimpan.
- **Listening:** belum ada. Rencananya memakai model TTS Gemini.

**Perkiraan band.** Dihitung dari rata-rata 3 latihan terakhir per skill dalam 60 hari. Writing memberi Task 2 bobot dua kali Task 1. Semua skor ditulis sebagai perkiraan, bukan skor resmi.

**Kata harian dipilih Gemini.** Gemini diminta mengutamakan headword Academic Word List (Coxhead, 2000), tetapi daftar AWL tidak ikut disimpan di repo. Akibatnya, kata yang dipilih tidak dijamin selalu berasal dari AWL.

**Pengaturan baru.** `english_target_band` (bawaan 6,5) dan `english_test_date` (opsional). Tanggal tes yang dikosongkan menghapus baris pengaturannya, karena kolom `value` wajib diisi.

Alat lama (Baca jurnal, Tulis bebas, Bank kata, Ngobrol bebas, English Mode) tetap ada di bagian "Alat lain".

## D-61 · Logo akun dan nomor rekening siap salin
**Status: Diputuskan**

Kolom baru di `accounts` (migrasi 0018):
- `account_number`: nomor rekening atau nomor HP e-wallet.
- `account_holder`: nama pemilik.
- `logo_domain`: opsional, untuk akun yang tidak dikenali otomatis.

Nomor tampil dengan tombol Salin di tiga tempat: Beranda, Keuangan, dan detail akun. Ada dua pilihan salin: hanya nomor, atau teks lengkap "BCA 1234567890 a.n. Nama". Tool `get_balances` juga mengembalikan nomor dan atas nama, jadi Ra bisa menjawab "nomor rekening BCA-ku berapa".

Logo diambil dari ikon situs resmi lewat layanan favicon Google (`lib/brands.ts` mencocokkan nama akun dengan domain bank, e-wallet, atau aplikasi investasi). Tidak ada berkas logo merek yang disimpan di repo. Bila ikon gagal dimuat, terlalu kecil, atau tidak muncul dalam 4 detik, tampilan kembali ke lingkaran inisial. Konsekuensinya, Google mengetahui domain bank mana yang ikonnya diminta oleh browser pengguna.

## D-62 · Beranda: aman dibelanjakan, IELTS hari ini, nomor rekening
**Status: Diputuskan**

Beranda mendapat tiga kartu baru di bawah briefing:
- **Aman dibelanjakan hari ini** (`safeToSpend`): sisa budget bulanan semua kategori ber-budget sampai kemarin dibagi sisa hari termasuk hari ini, lalu dikurangi belanja ber-budget hari ini.
- **IELTS hari ini**: progres 4 langkah sesi dan perkiraan band dibanding target.
- **Nomor rekening** (D-61).

Progres skripsi kini tampil juga di HP, tidak hanya di laptop.

## D-63 · Pesan suara ditranskripsi model Gemini Live
**Status: Diputuskan**

Model teks (terutama varian lite) sering salah menuliskan ucapan campuran Indonesia-Inggris. Bila `GEMINI_LIVE_MODEL` diisi dan rekaman berupa WAV 16 kHz mono, server membuka sesi Live singkat dengan `inputAudioTranscription` (`lib/live/transcribe.ts`). Urutannya:
1. Server mengirim PCM per 100 ms, ditambah 700 ms hening dan `audioStreamEnd`.
2. Server mengumpulkan transkrip input, lalu menutup sesi. Jawaban suara model diabaikan.
3. Transkrip diproses loop agen seperti teks biasa. Tool dan kartu konfirmasi tidak berubah.

Bila sesi Live gagal, transkripsi kembali ke model teks seperti D-48. Diagnosa menambahkan uji "transkripsi pesan suara (Live)".

## D-64 · Notifikasi: diagnosa dan daftar ulang otomatis
**Status: Diputuskan**

Penyebab push tidak sampai sulit dilihat dari UI. Perbaikannya:
- `VAPID_SUBJECT` dinormalkan, misalnya "mail to x@y" atau "x@y" menjadi "mailto:x@y". Kunci yang tidak valid dilaporkan jelas, tidak lagi menggagalkan semua pengiriman diam-diam.
- Tombol uji menampilkan galat pengiriman per perangkat. Galat 403 diberi keterangan bahwa kunci VAPID berubah.
- Perangkat yang terdaftar dengan kunci VAPID lama didaftarkan ulang otomatis saat halaman Notifikasi dibuka. Ada juga tombol "Daftarkan ulang".
- `/api/cron/tick` menyimpan `cron_last_tick` di settings. Halaman Notifikasi menampilkan status kunci VAPID, jumlah perangkat, dan kapan penjadwal terakhir jalan, dengan peringatan bila lebih dari 20 menit atau belum pernah.

## D-65 · IELTS Listening dengan suara TTS Gemini, plus terjemahan
**Status: Diputuskan**

Listening dibuat dalam dua langkah, supaya masing-masing muat di batas 60 detik fungsi Vercel:
1. Server action `createListening` meminta Gemini menulis naskah dan 6 soal. Ada dua jenis naskah: Section 1 berupa percakapan dua orang, Section 4 berupa ceramah. Tiap kalimat naskah sudah disertai terjemahan bahasa Indonesia. Naskah dan soal disimpan di tabel `listening_sets` (migrasi 0019).
2. Route `/api/english/listening/audio` mengubah naskah menjadi suara dengan model TTS Gemini (`GEMINI_TTS_MODEL`). Percakapan memakai dua suara (multi-speaker), ceramah memakai satu suara. Hasilnya disimpan sebagai WAV di bucket privat `listening` (`<user_id>/<set_id>.wav`) dan diputar lewat signed URL. Membuka ulang latihan tidak membuat suara ulang.

Suara bawaan: Kore (perempuan), Puck (laki-laki), dan Charon (dosen). Ketiganya bisa diganti lewat `GEMINI_TTS_VOICE_FEMALE`, `GEMINI_TTS_VOICE_MALE`, dan `GEMINI_TTS_VOICE_LECTURER` bila suara tertentu tidak tersedia.

Kunci jawaban tidak dikirim ke browser. Penilaian terjadi di server (`submitListening`):
- Isian dicocokkan setelah dirapikan: huruf kecil, tanpa tanda baca, artikel di depan diabaikan. Variasi yang benar juga diterima, misalnya "15" dan "fifteen".
- Band dihitung dari tabel konversi umum Listening 40 soal, dan diberi label kasar.

Mode tes memutar rekaman sekali tanpa kontrol geser, seperti tes asli. Mode latihan memakai pemutar biasa. Setelah dinilai, transkrip tampil per kalimat beserta terjemahannya, dan terjemahan bisa disembunyikan. Reading juga mendapat terjemahan per paragraf yang baru tampil setelah jawaban diperiksa.

Rotasi skill harian berubah: Rabu menjadi Listening (sebelumnya Speaking Part 1). Speaking Part 1 tetap bisa dilatih dari halaman Speaking. Perkiraan band keseluruhan kini memakai empat skill. Diagnosa menambahkan uji "suara Listening (TTS dua pembicara)".

**Pembaruan D-65.** Model TTS Gemini terbaru menolak permintaan multi-speaker berupa satu teks "Nama: kalimat" (400: *Multi-speaker generation requests must specify speech_metadata.speaker for each text part*). Sekarang tiap kalimat dikirim sebagai `Part` terpisah dengan `speechMetadata.speaker` (dan `style`). Bila model lama menolak format ini dengan 400, permintaan diulang sekali dengan format teks lama. Naskah yang audionya gagal dibuat tetap muncul di daftar "Rekaman sebelumnya" dengan tombol "Buat audio".

## D-66 · Tampilan iPhone (app di layar utama): tanpa zoom, tanpa geser, Belajar di navigasi
**Status: Diputuskan**

Keluhan dari app iPhone: layar sering membesar sendiri lalu bisa digeser ke samping, tampilan terasa terpotong, dan menu belajar sulit ditemukan. Audit otomatis di lebar 375 dan 390 px menemukan:
1. Semua kolom isian, termasuk kotak ketik Ra, memakai huruf 14 sampai 15 px. Safari iPhone memperbesar layar setiap kali kolom di bawah 16 px disentuh. Perbaikannya: di layar sentuh (`pointer: coarse`), semua `input`, `select`, dan `textarea` memakai 16 px. Aturan ini ditulis di luar `@layer` supaya menang dari kelas utilitas.
2. Beberapa grid responsif tidak punya jumlah kolom dasar, sehingga di HP lebarnya mengikuti isi terpanjang. Contohnya halaman Kategori yang 7 px lebih lebar dari layar. Semua grid itu kini memakai `grid-cols-1` di HP.
3. Pengaman tambahan: `body { overflow-x: clip }` supaya halaman tidak pernah bisa digeser ke samping, `touch-action: manipulation` supaya ketuk dua kali tidak memperbesar layar (cubit untuk zoom tetap bisa), dan padding kiri-kanan mengikuti area aman layar.

Navigasi bawah HP menyimpang dari DESIGN 5.1 (lima slot) menjadi tujuh slot: Beranda, Uang, Agenda, Ra (tengah), Belajar, Riset, Saya. Alasannya, di HP Belajar (Bahasa Inggris) dan Riset sebelumnya tersembunyi di menu Saya, padahal di laptop keduanya tampil di sidebar. Lebar tiap slot sekitar 53 px di layar 375 px dan masih memenuhi target sentuh 44 px. Di sidebar, Bahasa berganti label menjadi "Belajar" supaya sama dengan navigasi HP.

---

# Keputusan Kompas v2 (lihat `docs/ROADMAP.md`)

## D-67 · Arah v2: pendamping Tugas Akhir
**Status: Diputuskan pemilik (2026-11-26)**

Pemilik menyetujui `docs/ROADMAP.md` (Fase 9 sampai 14). Jawaban pemilik:
- Pendekatan TA kuantitatif. Rencana Fase 14 untuk data kualitatif (wawancara) diganti Log Pengolahan Data.
- Struktur bab mengikuti templat laporan TA Prodi Survei Pemetaan dan Informasi Geografis UPI (2024 rev 1). Templat disimpan sebagai data awal yang bisa diubah, bukan teks tetap di UI.
- Gaya sitasi APA 7 dengan penyesuaian templat prodi. Templat meminta "dkk." untuk lebih dari dua penulis di dalam teks dan semua penulis ditulis lengkap di daftar pustaka. Ini menyimpang dari APA 7 murni ("et al." dan batas 20 penulis), dan aturan prodi yang dipakai. Contoh daftar pustaka di templat sendiri memakai format lama "Penulis (tahun): judul, jurnal, volume, halaman" yang tidak sama dengan APA 7. Kompas mengikuti APA 7 sesuai jawaban pemilik, dan pemilik disarankan memastikan ke pembimbing format mana yang diterima.
- API Crossref, OpenAlex, dan Unpaywall boleh dipakai. Email kontak untuk API diambil dari env `SCHOLAR_CONTACT_EMAIL` yang diisi pemilik.
- Sidang ditargetkan 2027 tanpa tanggal pasti. Milestone dibuat tanpa tanggal dan diisi kemudian.

Fase 9 dikerjakan di branch yang sama dengan dokumen ROADMAP karena sesi ini hanya boleh mendorong ke satu branch.

## D-68 · Meteran dan batas harian Gemini
**Status: Diputuskan**

ROADMAP Fase 9. Tabel baru `ai_usage` (migrasi 0020) mencatat satu baris per panggilan `generateContent`: fitur, model, token masuk, token keluar (termasuk token berpikir), dan total dari `usageMetadata`. Isi prompt tidak disimpan.

Cara mencatat: `lib/ai-usage.ts` memasang lingkup `AsyncLocalStorage` lewat `withUsage(db, fitur, fn)` di setiap pintu masuk (route Ra, struk, latihan bicara, audio Listening, `withModel` modul Bahasa, dan tick otomasi). `GeminiModel` dan TTS cukup memanggil `reportUsage()`, jadi tidak ada `db` yang harus dioper ke seluruh fungsi. Di luar lingkup (uji unit, diagnosa) pencatatan diam saja. Galat pencatatan tidak pernah menggagalkan fitur.

Batas harian: pengaturan `ai_daily_token_limit` (0 = tanpa batas) di Pengaturan, Pemakaian Gemini. Dicek sekali di awal lingkup. Bila tercapai, panggilan Gemini gagal dengan alasan baru `budget`, sehingga Ra jatuh ke pengurai lokal dan fitur lain menampilkan pesan ramah, sama seperti kuota habis (SPEC 12). Satu permintaan yang sedang berjalan tidak dipotong di tengah, jadi pemakaian bisa sedikit melewati batas.

Percakapan Live tersambung langsung dari browser ke Gemini dengan token sementara (D-56), jadi tokennya tidak terlihat oleh server dan tidak ikut terhitung. Halaman pemakaian menyebutkan hal ini.

`ai_usage` tidak ikut ekspor cadangan karena hanya log.

## D-69 · Cadangan otomatis mingguan
**Status: Diputuskan**

ROADMAP Fase 9, untuk mencegah kehilangan data seperti D-01. Otomasi bawaan ke-13 `backup` (aturan, Minggu 02.30 WIB) menulis cadangan JSON yang sama dengan unduhan manual ke bucket privat `backups` (migrasi 0021), path `<user_id>/kompas-YYYY-MM-DD.json`. Hanya 8 cadangan terbaru yang disimpan, yang lebih lama dihapus. Pembuatan isi cadangan dipindah ke `lib/backup.ts` dan dipakai bersama `/api/ekspor/json`.

Otomasi ini ditandai `auto_write` karena berjalan tanpa konfirmasi. Ia tidak mengubah data pengguna, hanya menulis salinan ke penyimpanan. Notifikasi hanya dikirim bila gagal. Daftar cadangan beserta tautan unduh (signed URL 10 menit) tampil di Pengaturan, Cadangan & impor.

Batas berkas bucket 50 MB. Cadangan Kompas saat ini jauh di bawah itu karena struk dan audio tidak ikut.
