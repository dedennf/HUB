# AUDIT.md · Fase 0

Tanggal audit: 2026-11-20 (zona Asia/Jakarta)
Branch: `claude/clever-allen-aw0q0z` (sama persis dengan `main`, commit `978b811`)
Cakupan: seluruh isi repo di HEAD dan seluruh riwayat git (17 commit).

---

## 1. Temuan Paling Penting

> **Kode aplikasi tidak ada lagi di HEAD.** Isi repo saat ini hanya `CLAUDE.md` dan `SPEC.md`.

Pada 2026-11-21 (waktu commit) terdapat 11 commit berurutan "Delete ..." lewat antarmuka web GitHub yang menghapus semua file aplikasi (`index.html`, `app.js`, `app.css`, `sw.js`, `manifest.webmanifest`, ikon, `README.md`, dan folder `api/`). Commit terakhir (`978b811`) lalu menambahkan `CLAUDE.md` dan `SPEC.md`.

Versi terakhir aplikasi yang utuh ada di commit **`1be7928`** (2026-11-14). Semua isi audit di bawah ini berasal dari versi tersebut. Kode itu masih bisa dipulihkan penuh dari riwayat git:

```bash
git checkout 1be7928 -- .
```

Akibat yang mungkin terjadi (belum bisa dipastikan dari repo, perlu dicek pemilik di dashboard Vercel):

- Jika project Vercel tersambung ke GitHub dan mendeploy otomatis dari `main`, deploy production terbaru hanya berisi dua file Markdown. Halaman utama dan `/api/sync` serta `/api/gemini` akan mengembalikan 404.
- Perangkat yang sudah memasang PWA kemungkinan masih membuka aplikasi lama dari cache service worker (`hub-pribadi-v4`, strategi cache dulu). Tetapi sinkron dan Gemini lewat server akan gagal karena fungsi `api/` hilang.
- **Data pengguna aman di browser** (IndexedDB per perangkat) dan, jika sinkron aktif, di Upstash Redis dalam bentuk terenkripsi. Penghapusan file di repo tidak menghapus data tersebut, selama pemilik tidak menghapus data situs di browser atau database Upstash.

Fase 0 tidak memulihkan apa pun karena instruksinya adalah tidak mengubah kode. Langkah pemulihan diusulkan di `DECISIONS.md` (D-01).

---

## 2. Framework, Bahasa, dan Versi

| Aspek | Kondisi di `1be7928` |
|---|---|
| Framework | **Tidak ada.** HTML + CSS + JavaScript murni (vanilla), satu file `app.js` 2.541 baris (sekitar 217 KB) |
| Bahasa | JavaScript (ES2020+, `'use strict'`), bukan TypeScript |
| Build | Tidak ada langkah build, tidak ada bundler |
| Dependensi | Tidak ada `package.json`, tidak ada library luar sama sekali |
| Server | 2 Vercel Serverless Functions gaya CommonJS (`module.exports = async (req, res)`) di `api/` |
| Styling | `app.css` buatan sendiri (210 baris), mode gelap otomatis, bukan Tailwind |
| Rendering | Template string ke `innerHTML`, render ulang seluruh halaman tiap perubahan. Event lewat delegasi `data-act` |
| Routing | State di memori (`UI.tab`), tanpa URL per halaman |
| Test, lint, CI | Tidak ada. Tidak ada `.github/`, tidak ada `vercel.json` |
| Pengecekan sintaks | `node --check` lolos untuk `app.js`, `sw.js`, `api/gemini.js`, `api/sync.js` (Node 22) |

Perintah dev/build/lint/test: **belum ada**. Aplikasi cukup disajikan sebagai file statis. Bagian "Perintah" di `CLAUDE.md` baru bisa diisi setelah stack Fase 1 ditetapkan.

---

## 3. Struktur Folder (versi `1be7928`)

```
/
├── index.html              # cangkang: nav, header, <main>, dock chat asisten, <dialog>, toast
├── app.js                  # seluruh logika aplikasi
├── app.css                 # seluruh gaya
├── sw.js                   # service worker: cache statis, tidak menyentuh /api/
├── manifest.webmanifest    # PWA (bukan manifest.json)
├── icon.svg, icon-180.png, icon-192.png, icon-512.png
├── README.md               # panduan deploy, sinkron, Gemini, pesan galat
└── api/
    ├── sync.js             # sinkron terenkripsi via Upstash Redis REST
    └── gemini.js           # proxy ke Gemini REST API memakai kunci di server
```

Pembagian bagian di dalam `app.js` (nomor baris):

| Baris | Bagian |
|---|---|
| 1 sampai 28 | utilitas tanggal, format rupiah, escape HTML |
| 30 sampai 69 | penyimpanan (IndexedDB, fallback localStorage) |
| 70 sampai 109 | kategori bawaan, preset akun |
| 110 sampai 240 | state UI, toast, dialog, mesin formulir generik |
| 241 sampai 366 | kalkulasi: saldo, anggaran, biaya sejati, kalender gabungan, `saveTx` |
| 368 sampai 635 | pengurai lokal (nominal, tanggal, akun, kategori, perintah tugas, pertanyaan) |
| 636 sampai 803 | integrasi Gemini |
| 804 sampai 1628 | komponen dan halaman: Beranda, Kalender, Kuliah, Riset, Keuangan |
| 1629 sampai 1875 | sinkron (enkripsi, merge, tombstone, jadwal) |
| 1876 sampai 2370 | dock asisten dan "agen" aksi (`AG`, `makePlan`, `runPlan`, `localAgent`) |
| 2372 sampai 2455 | Pengaturan, cadangan, impor, hapus semua |
| 2456 sampai 2541 | router, wiring event, `init()` |

---

## 4. Penyimpanan Data Saat Ini

### 4.1 Di perangkat
- **IndexedDB** database `hub-pribadi` versi 1, satu object store `kv`. Setiap koleksi disimpan sebagai satu nilai array di kunci bernama koleksi (`transactions`, `tasks`, dan seterusnya), plus `settings` dan `tomb`.
- Fallback ke `localStorage` kunci `hub-pribadi` (seluruh state dalam satu JSON) jika IndexedDB gagal dibuka.
- `navigator.storage.persist()` diminta saat start.
- ID dibuat di klien: `Date.now().toString(36) + acak 5 karakter`. **Bukan UUID.** Kategori bawaan memakai ID tetap seperti `o_makan`, `i_saku`.

### 4.2 Sinkron antar perangkat (sudah berjalan)
- `api/sync.js` menyimpan data di **Upstash Redis** (hash `hubpribadi:data`) lewat REST. Variabel env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (atau nama lama `KV_REST_API_*`), `SYNC_TOKEN`.
- **Enkripsi end-to-end di browser**: AES-GCM dengan kunci turunan PBKDF2 dari "Kode sinkron". Server hanya melihat teks acak. `SYNC_TOKEN` = SHA-256 dari `'hub-auth-v1:' + kode`, dibandingkan dengan `timingSafeEqual`.
- Satu field Redis per koleksi (`c:<nama>`), plus `tomb` dan `settings`, plus `rev` untuk optimistic concurrency (409 jika `baseRev` beda).
- Merge per record berdasarkan stempel `_u` (last write wins), penghapusan lewat tombstone yang dibuang setelah 90 hari.
- Jadwal sinkron: saat dibuka, tiap menit saat tampil, 2,5 detik setelah perubahan, saat kembali online.
- Pemasangan HP lewat tautan `#sync=<kode>`.
- `aiLog` tidak ikut sinkron. Dari pengaturan, hanya `sem`, `semStart`, `semEnd`, `geminiModel`, `geminiNotes`, `shareSummary` yang ikut.

Konsekuensi untuk Fase 1: karena terenkripsi, **data di Upstash tidak bisa dibaca server**. Migrasi ke database baru harus berangkat dari data yang sudah didekripsi di browser, yaitu file cadangan JSON (lihat 4.3) atau skrip yang berjalan di halaman aplikasi lama.

### 4.3 Cadangan
- Ekspor JSON: `{ app: 'hub-pribadi', version: 1, exported, data: S }` dengan kunci Gemini dan kode sinkron dikosongkan. Ini format sumber migrasi yang paling aman.
- Ekspor CSV transaksi (UTF-8 BOM).
- Impor JSON (mengganti seluruh data), dan "Hapus semua data" dengan konfirmasi berlapis.

### 4.4 Model data lama (21 koleksi + settings)

| Koleksi | Field utama | Padanan di SPEC Bagian 5 |
|---|---|---|
| `accounts` | `name, type (bank/ewallet/tunai/investasi), open (saldo awal), alias (teks), archived` | `accounts` (saldo disimpan, bukan saldo awal) |
| `categories` | `kind (out/in), name, icon, color, keywords[], subs[], hidden, builtin, order` | `categories` (tanpa icon, color, keywords, subs, order) |
| `transactions` | `type (out/in/tf), date (YYYY-MM-DD), amount, acc, to, cat, sub, note, group` | `transactions` (tanpa `sub`, tanpa `group`, waktu berupa `timestamptz`) |
| `investments` | `name, kind, platform, cost, value, note` | `investments` |
| `budgets` | `cat, limit` (bulanan, ditampilkan sebagai batas harian) | `categories.monthly_budget` |
| `bills` | `name, amount, freq (bulanan/tahunan/sekali), nextDue, cat, acc, note, active` | `bills` (tanpa frekuensi tahunan, tanpa kategori) |
| `goals` | `name, target, saved, deadline, note` | **tidak ada** |
| `debts` | `dir (utang/piutang), person, amount, paid, date, due, note` | **tidak ada** |
| `trueExp` | `name, amount, due, saved, note, done` (biaya sejati, dicicil per bulan) | **tidak ada** |
| `courses` | `name, alias, sem (angka), sks, lecturer, note` | `courses` + `semesters` |
| `schedule` | `course, day (0 = Senin), start, end, room` | `course_schedules` (`weekday` 1 = Senin) |
| `tasks` | `title, kind (tugas/ujian/kuis/praktikum), course, due, work, workStart, workEnd, prio, parent, link, note, done, doneAt` | `tasks` + `task_work_slots` (tanpa jenis, prioritas, subtugas, tautan) |
| `materials` | `title, course, meeting, type, url, tags, note` | `materials` |
| `holidays` | `name, start, end` | **tidak ada** |
| `milestones` | `title, due, pct, note` (tanpa proyek) | `research_targets` (wajib punya proyek) |
| `needs` | `title, kind, status (belum/diurus/terpenuhi), note` | `research_needs` (hanya boolean) |
| `ideas` | `title, origin, status (mentah/layak/dibuang), note` | `research_ideas` |
| `literature` | `title, authors, year, venue, doi, col, tags, claim, st (status verifikasi), inc, note, ideas, ms` | `readings` |
| `bimbingan` | `date, with, points, status, nextDate` | **tidak ada** |
| `events` | `title, date, endDate, time, endTime, place, repeat, until, note` | `events` (tanpa pengulangan dan tempat) |
| `aiLog` | `t, text, via, kind` (30 perintah terakhir) | mirip `agent_messages` |
| `settings` | `sem, semStart, semEnd, geminiKey, geminiModel, useGemini, geminiMode, geminiNotes, shareSummary, syncOn, syncSecret, syncRev, lastBackup, lastAcc, created` | `settings` + `semesters` |

Catatan penting model lama:
- **Tidak ada konsep proyek riset.** Target, kebutuhan, ide, dan literatur berdiri sendiri. SPEC mewajibkan `project_id`. Migrasi perlu membuat satu proyek default.
- **Saldo tidak disimpan**, selalu dihitung di klien dari `open` ditambah seluruh transaksi.
- **Biaya admin transfer** disimpan sebagai transaksi `out` terpisah berkategori `o_admin` yang ditautkan ke transfernya lewat `group`.
- Nominal disimpan sebagai `Number` JavaScript. Form memakai input uang, jadi praktiknya bilangan bulat, tetapi tidak dijamin. Migrasi wajib membulatkan dan memvalidasi.
- Tanggal transaksi hanya `YYYY-MM-DD` tanpa jam. Tugas punya `due` tanggal saja (tanpa jam).
- **Zona waktu mengikuti jam perangkat**, tidak ada `Asia/Jakarta` di kode.

---

## 5. Integrasi Gemini yang Sudah Ada

| Aspek | Kondisi |
|---|---|
| Cara panggil | `fetch` langsung ke REST `v1beta/models/{model}:generateContent`. **Tidak memakai SDK `@google/genai`** |
| Jalur | Dua mode: `proxy` (lewat `api/gemini.js`, kunci di env `GEMINI_API_KEY`, diamankan `SYNC_TOKEN`) dan `direct` (kunci disimpan di IndexedDB browser lalu dipanggil dari klien) |
| Model | Diatur pengguna di Pengaturan, default `gemini-flash-latest`. Ada tombol daftar model (`/v1beta/models`). Bukan dari env |
| Fungsi | `geminiParse` (kalimat bebas ke JSON berskema intent, `responseMimeType: application/json`), `geminiAsk` (tanya jawab atas ringkasan data, perlu izin `shareSummary`) |
| Konteks sistem | `systemContext()`: aturan transaksi (transfer bukan pengeluaran, tarik tunai, top up, biaya admin), daftar akun + alias, kategori + sub + kata kunci, mata kuliah + singkatan, catatan kebiasaan pengguna |
| Snapshot | `dataSummary()`: saldo, investasi, total bulan ini dan lalu per kategori, transaksi 14 hari, anggaran, utang, tagihan, target tabungan, tugas, jadwal, target riset, kebutuhan, ide |
| Function calling | **Tidak ada.** Gemini diminta mengeluarkan JSON `{intent, actions:[{name,args}]}` yang dipetakan ke 33 aksi lokal (`AG_DOC`) |
| Multimodal | **Tidak ada.** Tidak ada gambar, PDF, atau audio yang dikirim |
| Konfirmasi | Semua hasil ditampilkan sebagai pratinjau dengan tombol Simpan, Ubah dulu, Batal. Tidak ada undo setelah disimpan |
| Galat | Pesan ramah untuk 429, 400/403, 404, timeout 25 detik. Fallback ke pengurai lokal |
| Keamanan proxy | Proxy meneruskan `payload` apa pun ke model apa pun yang lolos regex, untuk pemegang `SYNC_TOKEN`. Tidak ada pembatasan laju |

Aksi yang sudah didukung lewat chat (`AG_DOC`): `account.add/update/reconcile/remove`, `tx.add/deleteLast`, `task.add/done/delete/update`, `event.add/update/delete`, `holiday.add`, `course.add`, `class.add`, `semester.set`, `material.add`, `idea.add`, `need.add`, `milestone.add/progress`, `bimbingan.add`, `budget.set`, `goal.add/save`, `debt.add/pay`, `bill.add`, `investment.add/update`, `category.add`, `nav.go`.

Selain Gemini, ada **pengurai lokal tanpa AI** yang cukup kaya: membaca nominal ("15rb", "1,5jt"), tanggal relatif ("besok", "senin"), jam, pengulangan, akun lewat nama dan alias, kategori lewat kata kunci, perintah tugas, dan beberapa pertanyaan (agenda, saldo, total). Ini berjalan offline.

---

## 6. Status Fitur yang Disebut di SPEC

| Fitur | Status di repo |
|---|---|
| Struk (kamera, galeri, ekstraksi) | **Belum ada.** Tidak ada input file gambar, tidak ada Vision |
| Suara / speech-to-text | **Belum ada.** Tidak ada `SpeechRecognition` maupun `MediaRecorder` |
| Kalender gabungan | **Ada** (bulan, minggu, hari, filter warna per jenis) |
| Push notification | **Belum ada.** Service worker tidak menangani `push` atau `notificationclick` |
| PWA | **Ada** (manifest, ikon, service worker cache, panduan pasang di HP) |
| Sinkron laptop dan HP | **Ada** (Upstash, terenkripsi) |
| Auth pengguna | Tidak ada login. Akses server hanya lewat kode sinkron bersama |
| Kalkulator IPK | Tidak ada (sesuai keputusan pemilik) |
| Bahasa Inggris | **Belum ada sama sekali** |
| Otomasi / penjadwal | **Belum ada** |

---

## 7. Daftar Fitur Lama yang Wajib Tetap Berjalan

Daftar ini menjadi kriteria regresi untuk setiap fase berikutnya.

**Umum**
1. PWA bisa dipasang di Android dan iPhone, tetap bisa dibuka saat offline.
2. Mode gelap otomatis, tata letak HP (tab bar bawah) dan laptop (nav samping).
3. Dock chat asisten di semua halaman dengan pratinjau sebelum simpan dan tombol "Ubah dulu".
4. Pengurai lokal tanpa AI tetap jalan saat Gemini mati atau kuota habis.
5. Cadangan JSON, ekspor CSV transaksi, impor cadangan, hapus semua data dengan konfirmasi berlapis.
6. Sinkron laptop dan HP (boleh diganti mekanismenya, tetapi hasilnya harus setara atau lebih baik).

**Beranda**
7. Agenda hari ini, tugas terlambat, tenggat 7 hari, ringkasan riset, saldo total dan selisih bulan ini, kekayaan bersih, batas belanja harian, tagihan 7 hari dengan tombol Bayar, pengingat cadangan, panduan awal.

**Kalender**
8. Tampilan bulan, minggu, hari. Sumber: kelas rutin (hanya di rentang semester, dilewati saat libur), acara (berulang harian/mingguan/bulanan/tahunan, beberapa hari, sampai tanggal), tenggat tugas, ujian, slot pengerjaan, target riset, bimbingan dan bimbingan berikutnya, tagihan, biaya sejati, libur. Filter per jenis. Klik membuka item asal.

**Kuliah**
9. Semester aktif dengan tanggal mulai dan selesai, filter semester.
10. Mata kuliah (nama, singkatan, SKS, dosen, catatan) dan jadwal kelas mingguan.
11. Tugas dengan jenis (tugas, ujian, kuis, praktikum), prioritas, subtugas, tautan, tenggat, rencana kerja dengan jam mulai dan selesai.
12. Materi per pertemuan dengan jenis, tag, tautan, pencarian.
13. Statistik: tugas selesai, persentase tepat waktu, streak hari tanpa terlambat, beban per mata kuliah.

**Riset**
14. Target (milestone) dengan progres persen yang bisa digeser langsung.
15. Kebutuhan dengan jenis dan status tiga tingkat.
16. Ide lanjutan dengan status (mentah, layak, dibuang).
17. Literatur dengan DOI, koleksi, tag, klaim, status verifikasi (belum dicek, DOI dicek, halaman dicek, teks lengkap dibaca), tautan ke ide dan target, salin daftar pustaka.
18. Catatan bimbingan dengan poin, status, dan jadwal bimbingan berikutnya.

**Keuangan**
19. Akun (bank, dompet digital, tunai, investasi) dengan saldo awal, alias, arsip. Akun bertransaksi tidak bisa dihapus.
20. Transaksi masuk, keluar, transfer dengan biaya admin terpisah. Daftar dan tampilan per hari, filter akun, kategori, pencarian.
21. Cocokkan saldo (rekonsiliasi) yang membuat transaksi penyesuaian.
22. Kategori bawaan 14 pengeluaran dan 7 pemasukan, sub-kategori, kata kunci, ikon, warna, sembunyikan, gabung kategori.
23. Anggaran per kategori dengan batas harian tersisa.
24. Target tabungan, biaya sejati, utang dan piutang dengan cicilan, tagihan berulang (bulanan, tahunan, sekali) dengan tombol Bayar yang memajukan jatuh tempo.
25. Investasi (modal vs nilai), grafik 6 bulan.

**Pengaturan**
26. Tab Asisten (jalur Gemini, model, catatan kebiasaan, izin ringkasan data, lihat konteks yang dikirim, riwayat perintah), tab Sinkron, tab Data dan cadangan.

---

## 8. Catatan Kualitas dan Risiko

- **Monolit global.** State `S` dan `UI` global, satu file 2.500 baris. Sulit diuji dan sulit dipakai ulang di server. Logika domain (saldo, kalender, pengurai) tercampur dengan HTML.
- **Kunci Gemini di browser** pada mode `direct` bertentangan dengan SPEC Bagian 12.
- **Tanpa auth sungguhan.** Siapa pun yang memegang kode sinkron punya akses penuh ke data dan kuota Gemini.
- **Merge last write wins per record** bisa kehilangan perubahan jika dua perangkat mengubah record yang sama secara offline. Diterima untuk satu pengguna.
- **Zona waktu perangkat.** Aman selama perangkat di WIB, tetapi tidak memenuhi SPEC.
- **Tanggal tanpa jam** di transaksi dan tenggat tugas. Migrasi ke `timestamptz` perlu aturan konversi (lihat `DECISIONS.md`).
- `README.md` menyatakan sinkron dan Gemini **belum pernah diuji di Vercel, Upstash, dan Gemini sungguhan**, hanya dengan tiruan lokal.
- `theme_color` di manifest (`#0e7c6b`) berbeda dengan `index.html` (`#cf4425`). Kecil, kosmetik.

---

## 9. Bagian SPEC yang Perlu Disesuaikan

| Bagian SPEC | Asumsi SPEC | Kondisi nyata | Usulan penyesuaian |
|---|---|---|---|
| 0.1, 2, 4 | Next.js App Router + TS + Tailwind, "ikuti yang sudah ada" | Vanilla JS tanpa build, dan saat ini kode sudah terhapus dari HEAD | Pakai Next.js sesuai target SPEC, bukan meneruskan vanilla (D-02) |
| 0.1, 7.3 | Sudah ada fitur struk dan speech-to-text lama | Keduanya tidak pernah ada | Hapus kalimat "fitur speech-to-text lama boleh dipertahankan". Struk dan suara dibangun dari nol |
| 0.4, Fase 1 | Data lama di localStorage atau file | IndexedDB per perangkat + Upstash terenkripsi E2E | Migrasi lewat file cadangan JSON yang sudah ada, bukan membaca Upstash dari server (D-05) |
| 2 | Supabase sebagai DB | Upstash Redis sudah dipakai untuk sinkron | Pindah ke Supabase karena agen, cron, dan push butuh server membaca data. **Perlu persetujuan pemilik** (D-03) |
| 2, 5 | Kolom `user_id` + RLS + Supabase Auth | Tidak ada auth | Tetap sesuai SPEC |
| 5.1 `accounts` | `balance` disimpan | Saldo dihitung dari saldo awal + transaksi | Tambah `opening_balance`, `balance` tetap dipelihara server dan bisa dihitung ulang (D-07) |
| 5.1 `transactions` | Tanpa sub-kategori dan grup | Ada `sub` dan `group` (biaya admin) | Tambah `subcategory text` dan `group_id uuid`. `add_transfer.fee` membuat baris kedua dengan `group_id` sama |
| 5.1 `categories` | Hanya nama, jenis, budget | Ada ikon, warna, kata kunci, sub, urutan, sembunyikan | Tambah kolom `icon, color, keywords text[], subcategories text[], sort_order, is_hidden` |
| 5.1 kategori bawaan | 11 + 4 kategori | 14 + 7 kategori dengan nama berbeda | Pakai daftar lama sebagai bawaan agar data lama tidak kehilangan kategori. Daftar SPEC sudah tercakup |
| 5.1 `bills` | `due_day`/`due_date`, berulang bulanan | Frekuensi bulanan, tahunan, sekali + kategori | Tambah `frequency` dan `category_id` |
| 5.1, 11 | Tidak ada target tabungan, utang, biaya sejati | Ketiganya dipakai | Tambah tabel `savings_goals`, `debts`, `sinking_funds` agar fitur lama tidak hilang |
| 5.2 `tasks` | Tanpa jenis, prioritas, subtugas, tautan | Ada | Tambah `kind, priority, parent_id, url` |
| 5.2 | Tidak ada libur | Ada `holidays` | Tambah tabel `holidays` dan masukkan ke `getCalendarItems` |
| 5.2 `course_schedules.weekday` | 1 = Senin | 0 = Senin | Migrasi `+1` |
| 5.3 | Semua item riset wajib `project_id` | Tidak ada proyek | Buat proyek default saat migrasi, `project_id` boleh null untuk ide |
| 5.3 `research_needs` | `is_fulfilled boolean` | Status tiga tingkat + jenis | Ganti ke `status text` dan `kind text` |
| 5.3 `readings` | Field dasar | Ada koleksi, tag, klaim, status verifikasi, tautan ke target dan ide | Tambah kolom tersebut. Status verifikasi DOI penting untuk riset |
| 5.3 | Tidak ada bimbingan | Ada `bimbingan` | Tambah tabel `supervisions` + item kalender + tool agen |
| 5.4 `events` | Tanpa pengulangan | Ada `repeat`, `until`, `place`, beberapa hari | Tambah `recurrence text`, `recurrence_until date`, `location text`, `is_all_day boolean` |
| 6.8 | Daftar tools | 33 aksi lama mencakup hal di luar daftar | Tambah tools untuk fitur yang dipertahankan (rekonsiliasi, utang, target tabungan, acara ubah/hapus, libur, bimbingan, semester) |
| 9 | `public/manifest.json` | `manifest.webmanifest` | Bebas. Pertahankan ikon lama |
| 12 | Kunci hanya di server | Ada mode kunci di browser | Hapus mode `direct` saat Fase 3 |
| 14 Fase 1 | "Data lama termigrasi" | Data tersebar di beberapa perangkat | Tambah kriteria: sinkron terakhir di app lama dulu, lalu ekspor dari perangkat terlengkap |
| 15 | "Fitur lama tetap berjalan" | Banyak fitur lama tidak disebut di SPEC | Rujuk daftar Bagian 7 dokumen ini |

---

## 10. Analisis File Cadangan dari Pemilik (2026-11-21)

Pemilik mengunggah cadangan `hub-pribadi-2026-11-21.json` (format `app: hub-pribadi`, `version: 1`, diekspor 2026-11-21 03.29 WIB). File ini **tidak di-commit** ke repo karena berisi data keuangan dan nama orang. Ringkasan isinya:

| Koleksi | Jumlah | Koleksi | Jumlah |
|---|---|---|---|
| courses | 5 | accounts | 5 |
| schedule | 5 | categories | 21 (semua bawaan, tanpa ubahan) |
| tasks | 1 | transactions | 3 |
| events | 1 | debts | 4 (semua piutang) |
| ideas | 2 | bills | 3 |
| `recurring` | 0 | `focus` | 0 |
| lainnya | 0 | tomb | 8 penghapusan |

### 10.1 Temuan
1. **Ada versi app yang tidak tercatat di git.** Koleksi `recurring` dan `focus` tidak ada di `COLLS` commit mana pun (semua 19 commit sudah diperiksa). Nilai `geminiModel` juga sudah diganti pengguna. Artinya versi yang ter-deploy dan dipakai lebih baru dari `1be7928`. Satu catatan transaksi berbentuk "NAMA TOKO · barang 1, barang 2, barang 3" yang mirip hasil baca struk, sehingga **kemungkinan fitur struk sudah ada di versi itu**. Pernyataan "struk belum ada" di Bagian 6 hanya berlaku untuk kode di git.
2. **Saldo awal bukan bilangan bulat.** Satu akun bank punya `open` dengan pecahan sen (`.94`). SPEC mewajibkan integer rupiah.
3. **Tanggal transaksi mencurigakan.** Satu transaksi bertanggal 2024-11-15, padahal app baru dibuat 2026-11-14 dan dua transaksi lain di 2026. Kemungkinan salah baca tahun dari struk.
4. **Semester tanpa tanggal.** `sem = 7`, `semStart` dan `semEnd` kosong. Di app lama ini berarti kelas tampil setiap minggu tanpa batas.
5. **Tagihan tanpa akun default.** Ketiga tagihan punya `acc` kosong.
6. Rencana kerja tugas punya jam mulai tanpa jam selesai. Acara punya rentang dua hari dengan jam mulai dan selesai.
7. Hal yang aman: tidak ada referensi patah (semua `course`, `acc`, `cat` mengarah ke record yang ada), tidak ada transfer, tidak ada grup biaya admin, sinkron nonaktif, kunci Gemini dan kode sinkron sudah kosong.
