# ROADMAP.md · Arah Pengembangan Kompas v2

**Status: Disetujui pemilik (2026-11-26).** Jawaban pemilik ada di Bagian 7 dan D-67. Fase di sini menjadi lanjutan `SPEC.md` Bagian 14 dan mengikuti aturan yang sama: satu fase = satu branch = satu pull request, keputusan yang menyimpang dicatat di `docs/DECISIONS.md`.

---

## 1. Posisi Kompas hari ini

Fase 0 sampai 8 sudah tercentang. Kompas sekarang adalah **pencatat yang sangat lengkap**: keuangan dengan saldo konsisten dan undo, kuliah, kalender gabungan, otomasi dengan pg_cron, push, struk, suara, Live API, dan modul IELTS yang cukup dalam.

Ketimpangannya ada di modul **Riset**. Halaman `/riset` hanya 106 baris dan registry Ra untuk riset cuma punya 5 tool (`get_research_progress`, `add_research_target`, `update_research_progress`, `add_research_idea`, `add_research_need`). Padahal pemiliknya mahasiswa D4 Survei Pemetaan dan Informasi Geografis (SPIG) UPI yang sedang mengerjakan Tugas Akhir (TA) kuantitatif tentang evaluasi jarak bebas jaringan SUTT berbasis UAV LiDAR, dan skripsi adalah pekerjaan paling berat, paling panjang, dan paling menentukan di semester ini. Bandingkan dengan modul Bahasa yang punya sesi harian, 4 skill IELTS, TTS, dan estimasi band.

Tabel `readings` sebenarnya sudah kaya (klaim, status verifikasi DOI, inklusi, tautan ke target dan ide), tetapi Ra belum bisa memakainya untuk membantu berpikir.

Masih ada juga pekerjaan yang belum tuntas:
- SPEC 14 Fase 1: impor data lama ke production dan uji preview Vercel di HP.
- SPEC 14 Fase 5 dan 6: uji suara dan push di Safari iPhone dan Chrome Android asli.
- SPEC 15 Daftar Uji Akhir: seluruhnya belum dicentang.
- D-34: subtugas, tautan literatur ke target dan ide di UI, gabung kategori, statistik belajar, grafik cashflow 6 bulan, mode offline PWA, pemulihan dari cadangan JSON Kompas.

## 2. Arah baru dalam satu kalimat

**Dari pencatat menjadi pendamping skripsi.** Kompas v2 memusatkan tenaga Ra pada perjalanan skripsi (literatur, struktur bab, bimbingan, waktu menulis), sambil membuat modul lain bekerja untuk tujuan itu, bukan berdiri sendiri.

Tiga prinsip yang mengikat semua fase:

1. **Ra tidak pernah mengarang sumber.** Setiap rujukan yang ditampilkan Ra harus berasal dari pustaka pengguna (`readings`) atau dari hasil API metadata ilmiah yang bisa dilacak (DOI terverifikasi). Kalau tidak ada sumber, Ra bilang tidak ada. Aturan ini masuk ke `system-prompt` dan diuji otomatis.
2. **Ra mengulas, pengguna menulis.** Ra membantu memeriksa logika argumen, kecocokan klaim dengan sumber, dan kerapian struktur. Ra tidak menghasilkan bab utuh untuk diserahkan sebagai karya pengguna. Ini menjaga integritas akademik dan membuat pemilik benar-benar menguasai skripsinya saat sidang.
3. **Konfirmasi tetap berlaku.** Semua perubahan oleh Ra tetap lewat registry `lib/agent/tools` (prepare lalu commit), sesuai SPEC 6.3 dan 6.4.

Yang tetap **tidak** dibuat (keputusan pemilik di SPEC 1, tidak berubah): kalkulator IPK/IPS, penandaan transaksi ke proyek riset, estimasi biaya riset ke anggaran, integrasi Telegram. Model AI tetap Gemini.

---

## 3. Urutan fase

| Fase | Nama | Inti | Perkiraan ukuran |
|---|---|---|---|
| 9 | Fondasi Kokoh | lunasi utang v1, ukur pemakaian Gemini, cadangan otomatis | sedang |
| 10 | Ruang Skripsi | struktur bab, peta jalan menuju sidang, bimbingan jadi tugas | besar |
| 11 | Pustaka Cerdas | cari dan verifikasi literatur lewat API terbuka, matriks literatur, ekspor sitasi | besar |
| 12 | Ra Pengulas | ulasan paragraf, cek klaim terhadap pustaka, abstrak bahasa Inggris | sedang |
| 13 | Ra Perencana | blok waktu menulis, tinjauan mingguan lintas modul | sedang |
| 14 | Log Pengolahan Data (opsional) | catatan langkah, parameter, dan uji akurasi pengolahan data untuk Bab III dan IV | sedang |

Fase 9 wajib lebih dulu. Fase 10 dan 11 adalah inti v2. Fase 12 bergantung pada 11 (butuh pustaka yang terverifikasi). Fase 13 bisa disisipkan kapan saja setelah 10.

---

## 4. Rincian fase

### Fase 9 · Fondasi Kokoh

Tujuannya agar v1 benar-benar selesai sebelum menambah beban baru.

- [ ] Tuntaskan item terbuka SPEC 14 (impor production, preview Vercel, uji perangkat asli) dan seluruh SPEC 15.
- [ ] Kerjakan sisa D-34: subtugas, gabung kategori, statistik belajar (persen tepat waktu, streak), grafik cashflow 6 bulan.
- [x] Pemulihan dari cadangan JSON Kompas (D-70).
- [x] Tautan literatur ke target dan ide di UI (D-71).
- [ ] Mode offline PWA minimal: shell app dan data terakhir yang dibaca bisa dibuka tanpa sinyal (hanya baca).
- [x] **Meteran Gemini.** Tabel `ai_usage` (tanggal, fitur, model, token masuk, token keluar, status). Halaman diagnosa (D-45) menampilkan pemakaian harian per fitur. Batas harian yang bisa diatur, dengan pesan ramah saat tercapai (SPEC 12 sudah meminta penanganan kuota, ini membuatnya terukur). Selesai, lihat D-68.
- [x] **Cadangan otomatis mingguan.** Otomasi bawaan baru: ekspor JSON ke bucket privat `backups` tiap Minggu, simpan 8 terakhir, notifikasi bila gagal. Mencegah kehilangan data yang dulu terjadi (D-01). Selesai, lihat D-69.
- [x] **Jaga Supabase tetap hidup.** Sudah ada sejak D-64: `/api/cron/tick` menyimpan `cron_last_tick` dan halaman Notifikasi memberi peringatan bila lebih dari 20 menit.

### Fase 10 · Ruang Skripsi

Halaman baru `/riset/skripsi` (atau tab di `/riset`) yang menjadikan proyek riset berstatus `active` sebagai pusat kerja.

**Data baru** (migrasi `0020_thesis.sql`, RLS seperti tabel lain):

```sql
create table thesis_chapters (
  project_id uuid references research_projects on delete cascade,
  number int not null,                 -- 1 sampai 5 sesuai templat TA SPIG
  title text not null,                 -- "Pendahuluan", "Kajian Pustaka", ...
  status text not null default 'not_started'
    check (status in ('not_started', 'drafting', 'review', 'revising', 'approved')),
  word_target int,
  word_count int not null default 0,   -- diisi manual atau dari sesi menulis
  last_touched_at timestamptz,
  note text
);

create table thesis_milestones (       -- peta jalan: proposal, seminar, pengambilan data, sidang
  project_id uuid references research_projects on delete cascade,
  kind text not null check (kind in ('proposal', 'seminar_proposal', 'ethics_permit', 'fieldwork', 'analysis', 'seminar_result', 'defense', 'revision', 'other')),
  title text not null,
  due_date date,
  done_at timestamptz,
  sort int not null default 0
);

create table writing_sessions (        -- sesi fokus menulis
  project_id uuid references research_projects on delete set null,
  chapter_id uuid references thesis_chapters on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  words_added int,
  note text
);
```

Kolom tambahan: `supervisions.action_items jsonb` (daftar poin revisi dari dosen, masing-masing bisa ditautkan ke `tasks.id` dan `thesis_chapters.id`).

**Fitur:**
- [ ] Peta jalan menuju sidang: garis waktu milestone dengan hitung mundur ke milestone terdekat. Templat awal mengikuti alur TA SPIG: proposal TA, seminar proposal, pengambilan dan pengolahan data, sidang TA, revisi. Sidang ditargetkan tahun 2027, tanggal pasti diisi pemilik nanti. Semua bisa diubah.
- [ ] Templat bab dari `2_TEMPLATE LAPORAN TA_2024_rev 1` Prodi SPIG UPI, disimpan sebagai data awal (bukan hardcode di UI) supaya bisa diganti:
  - Bab I Pendahuluan: 1.1 Latar Belakang Penelitian, 1.2 Identifikasi Masalah, 1.3 Batasan Masalah, 1.4 Rumusan Masalah, 1.5 Tujuan, 1.6 Manfaat, 1.7 Kerangka Pemikiran
  - Bab II Kajian Pustaka: 2.1 Penelitian Terdahulu, lalu dasar teori (jumlah bebas)
  - Bab III Metode Penelitian: 3.1 Lokasi dan Waktu (termasuk Alat dan Bahan), 3.2 Diagram Alir, 3.3 Pelaksanaan, 3.4 Tutorial Penggunaan Software, 3.5 Pengujian Penelitian
  - Bab IV Hasil dan Pembahasan (subbab bebas)
  - Bab V Kesimpulan dan Saran: 5.1 Kesimpulan, 5.2 Saran
  - Bagian pelengkap yang dilacak sebagai daftar periksa: abstrak Indonesia dan Inggris, kata pengantar, daftar pustaka, lampiran, curriculum vitae, surat pernyataan bebas plagiat.
  Subbab disimpan di tabel `thesis_sections` (chapter_id, number, title, status, note) dengan status yang sama seperti bab.
- [ ] Papan bab: kartu per bab dengan status, progres kata, hari sejak disentuh, dan tautan ke literatur yang relevan (`readings.linked_target_ids` sudah ada, ditambah tautan ke bab).
- [ ] Bimbingan jadi tugas: setelah mencatat bimbingan, Ra mengusulkan pemecahan poin revisi menjadi tugas dengan tenggat menjelang bimbingan berikutnya. Lewat kartu konfirmasi, bukan langsung.
- [ ] Sesi fokus menulis: tombol mulai/selesai (timer gaya pomodoro), isi kata tambahan di akhir sesi. Statistik mingguan: jam menulis, kata, streak. Menyentuh `last_touched_at` bab dan target.
- [ ] Beranda: kartu "Skripsi hari ini" (milestone terdekat, bab yang paling lama tidak disentuh, poin revisi terbuka).
- [ ] Tool Ra baru: `get_thesis_overview`, `add_thesis_milestone`, `update_chapter_status`, `log_writing_session`, `split_supervision_to_tasks`.
- [ ] Otomasi bawaan baru: pengingat bab yang tidak disentuh lebih dari N hari, pengingat H-3 bimbingan berisi poin revisi yang belum selesai.

### Fase 11 · Pustaka Cerdas

Membuat literatur bisa dipercaya. Ini fase yang paling penting untuk mencegah sitasi palsu.

**Sumber data terbuka** (dipanggil dari server, tanpa data pribadi di dalam kueri):
- Crossref REST API (`api.crossref.org`) untuk melengkapi metadata dari DOI dan memastikan DOI benar-benar terdaftar.
- OpenAlex (`api.openalex.org`) untuk pencarian karya ilmiah berdasarkan kata kunci, penulis, dan tahun, termasuk banyak jurnal Indonesia yang terindeks.
- Unpaywall (`api.unpaywall.org`) untuk menemukan versi akses terbuka bila ada.

Ketentuan akses (batas laju, parameter email kontak, kunci API) dicek ulang di dokumentasi resmi masing-masing sebelum fase ini dimulai dan dicatat di DECISIONS. Email kontak yang diminta API memakai variabel env tersendiri yang diisi pemilik, bukan diambil otomatis dari akun.

**Fitur:**
- [ ] Tambah literatur dari DOI: tempel DOI, metadata terisi otomatis, `verification_status` naik ke `doi_checked` hanya kalau Crossref atau OpenAlex mengembalikan data yang cocok.
- [ ] Cari literatur: kotak pencarian di `/riset` memakai OpenAlex, hasil bisa disimpan ke pustaka dengan satu ketukan (lewat konfirmasi Ra bila dari percakapan). Tampilkan jumlah sitasi dan status akses terbuka.
- [ ] Matriks literatur: tampilan tabel per literatur dengan kolom teori, metode, sampel atau konteks, temuan, celah (gap), dan relevansi ke bab. Simpan di kolom baru `readings.matrix jsonb`. Ra boleh mengusulkan isi matriks dari abstrak, ditandai "usulan Ra" sampai pengguna menyetujui.
- [ ] Peta celah penelitian: ringkasan dari kolom celah di matriks, dikelompokkan per tema, sebagai bahan Bab 1 dan Bab 2.
- [ ] Ekspor sitasi: daftar pustaka APA 7 dengan penyesuaian pedoman TA SPIG, siap salin, plus ekspor BibTeX dan RIS untuk Zotero atau Mendeley (template mewajibkan pengelola sitasi seperti Zotero atau Mendeley). Penyesuaian prodi:
  - sitasi dalam teks: satu atau dua penulis ditulis namanya, lebih dari dua ditulis "Penulis pertama dkk. (tahun)", bukan "et al."
  - daftar pustaka: semua penulis ditulis lengkap
  - setiap sumber di teks harus ada di daftar pustaka, dan sebaliknya
- [ ] Tabel Penelitian Terdahulu (Tabel 2.1 di templat: No, Nama Peneliti dan Tahun, Judul, Hasil Penelitian) dibuat otomatis dari literatur berstatus `use`, dengan peringatan untuk literatur yang lebih tua dari 10 tahun (aturan templat).
- [ ] Tool Ra baru: `search_literature` (baca), `fetch_doi_metadata` (baca), `add_reading_from_doi` (tulis), `update_reading_matrix` (tulis).
- [ ] Aturan di `system-prompt`: Ra hanya menyebut sumber yang id-nya ada di hasil tool. Uji integrasi dengan model tiruan memastikan jawaban yang menyebut sumber di luar hasil tool ditolak oleh pemeriksa keluaran.

### Fase 12 · Ra Pengulas

Bantuan menulis yang menjaga pengguna tetap sebagai penulis.

- [ ] Ulas paragraf: tempel paragraf draf, Ra memberi umpan balik terstruktur (alur argumen, klaim tanpa sumber, istilah yang tidak konsisten, kalimat yang ambigu) tanpa menulis ulang seluruhnya. Hasil disimpan di `writing_submissions` dengan `kind` baru `thesis_review`.
- [ ] Cek klaim terhadap pustaka: Ra mencocokkan setiap klaim di paragraf dengan isi `readings` (klaim, catatan, matriks). Keluarannya: klaim yang didukung (dengan sumbernya), klaim yang belum ada sumbernya, dan sitasi di teks yang tidak ada di pustaka ("sitasi yatim").
- [ ] Abstrak dua bahasa: pemeriksa format sesuai templat (satu paragraf, 200 sampai 250 kata, maksimal 7 kata kunci yang bukan kalimat, berisi informasi umum, tujuan, alasan, metode, dan temuan). Versi bahasa Inggris menyambungkan modul Bahasa. Koreksi abstrak (`kind = 'abstract'` sudah ada di skema) dengan kosakata akademik dari pustaka skripsi sendiri masuk ke bank kata.
- [ ] Simulasi sidang: mode Live API (Fase 8) dengan peran penguji yang bertanya berdasarkan isi bab dan matriks literatur. Tanpa tools tulis, seperti latihan bicara.

### Fase 13 · Ra Perencana

Ra mulai proaktif, tetapi tetap mengusulkan, bukan memutuskan.

- [ ] Blok waktu otomatis: Ra mencari celah kosong di kalender (di luar kuliah, acara, jam tenang) lalu mengusulkan slot menulis skripsi dan pengerjaan tugas. Memakai `task_work_slots.suggested_by_agent` yang sudah ada.
- [ ] Tinjauan mingguan (Minggu malam): satu kartu lintas modul, misalnya jam menulis minggu ini, tugas yang lewat tenggat, pengeluaran yang naik dibanding rata-rata, latihan IELTS yang terlewat, dan tiga usulan untuk minggu depan.
- [ ] Tinjauan bulanan ringan untuk keuangan dan progres skripsi.

### Fase 14 · Log Pengolahan Data (opsional)

Pengganti rencana awal "Data Lapangan" (transkrip wawancara), karena TA pemilik kuantitatif dan berbasis data UAV LiDAR. Fitur kualitatif tidak dibuat.

- [ ] Catatan pengolahan per langkah: tanggal, software dan versinya, data masukan, parameter, keluaran, dan catatan masalah. Langsung menjadi bahan Bab 3.3 Pelaksanaan dan 3.4 Tutorial Penggunaan Software.
- [ ] Catatan pengujian: metrik akurasi yang dipakai (misalnya RMSE atau selisih terhadap data acuan) beserta nilainya, sebagai bahan Bab 3.5 dan Bab IV.
- [ ] Ekspor log menjadi tabel siap salin. Kompas tidak menyimpan file data mentah (point cloud terlalu besar), hanya catatan dan tautan ke lokasi file.

---

## 5. Ukuran keberhasilan

Diukur dari data Kompas sendiri, bukan perasaan:

- Jam menulis skripsi per minggu dan streak sesi menulis (Fase 10).
- Persentase literatur berstatus minimal `doi_checked` (Fase 11). Target: semua literatur yang `inclusion = 'use'`.
- Jumlah sitasi yatim di draf terakhir yang diulas (Fase 12). Target: nol sebelum bimbingan.
- Waktu dari bimbingan sampai semua poin revisi selesai (Fase 10).
- Pemakaian Gemini per hari tetap di bawah batas yang diatur (Fase 9).

## 6. Risiko dan cara menghadapinya

| Risiko | Penanganan |
|---|---|
| Gemini mengarang judul, penulis, atau DOI | Prinsip 1, pemeriksa keluaran, dan verifikasi lewat Crossref/OpenAlex |
| Kuota Gemini habis karena fitur baru | Meteran dan batas harian di Fase 9, semua fitur tetap bisa diisi manual (SPEC 12) |
| API metadata berubah syarat atau lambat | Lapisan adaptor di `lib/scholar/`, cache hasil di database, fitur manual tetap jalan |
| Data informan bocor | Fase 14 opsional, anonimisasi sebelum dikirim, bucket privat, signed URL pendek |
| Pelanggaran integritas akademik | Prinsip 2: Ra mengulas, tidak menulis bab utuh |
| Fitur baru merusak fitur lama | Daftar AUDIT Bagian 7 tetap jadi uji regresi tiap fase |

## 7. Jawaban pemilik (2026-11-26)

1. Arah pendamping skripsi: **disetujui**.
2. Pendekatan: **kuantitatif**. Fase 14 diganti menjadi Log Pengolahan Data.
3. Struktur bab: **templat TA Prodi SPIG UPI** (`2_TEMPLATE LAPORAN TA_2024_rev 1`), rinciannya di Fase 10.
4. Gaya sitasi: **APA 7**, dengan penyesuaian pedoman prodi ("dkk." dan semua penulis lengkap), rinciannya di Fase 11.
5. API metadata ilmiah terbuka: **boleh**. Email kontak diisi pemilik lewat env `SCHOLAR_CONTACT_EMAIL`, tidak diambil otomatis.
6. Target sidang: **tahun 2027**, tanggal pasti menyusul.
