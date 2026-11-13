# Hub Pribadi

Aplikasi pribadi untuk kuliah, riset, dan keuangan. Berjalan sebagai PWA (web app yang bisa dipasang di HP), tidak bergantung pada Claude. Versi ini menambah sinkron antar perangkat dan Gemini yang memahami sistemmu.

## Isi folder

| File | Fungsi |
|---|---|
| index.html, app.css, app.js | Aplikasi |
| manifest.webmanifest, sw.js, icon-*.png, icon.svg | Agar bisa dipasang di HP dan dibuka tanpa internet |
| **api/sync.js** | Fungsi server untuk sinkron (menyimpan data terenkripsi di Upstash) |
| **api/gemini.js** | Fungsi server yang meneruskan permintaan ke Gemini memakai kunci di server |

Folder `api` harus sejajar dengan `index.html`. Tidak ada langkah build dan tidak ada library luar.

## Memperbarui yang sudah ter-deploy di Vercel

Ganti semua file di project dengan isi folder ini, termasuk folder `api`, lalu deploy ulang (push ke GitHub kalau project tersambung ke GitHub, atau jalankan `vercel --prod`). Setelah itu buka aplikasi di HP dan laptop, lalu muat ulang sekali atau dua kali supaya versi baru terambil. Datamu di browser tidak terhapus.

Pakai satu alamat yang sama di semua perangkat, sebaiknya alamat production. Alamat yang berbeda (misalnya alamat preview) punya penyimpanan data sendiri-sendiri.

## Kenapa HP tadinya kosong

Data tersimpan di browser tiap perangkat, jadi laptop dan HP tidak berbagi data. Untuk membagi data, aplikasi perlu penyimpanan di server. Karena kamu sudah di Vercel, penyimpanannya memakai Upstash Redis lewat Vercel.

## Mengaktifkan sinkron HP dan laptop

Semua langkah ini juga tertulis di aplikasi: Pengaturan, tab Sinkron.

1. Di dashboard Vercel buka project-mu, tab **Storage**, lalu hubungkan database **Upstash (Redis)** dengan paket gratis. Vercel menambahkan variabel `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` ke project secara otomatis.
2. Di aplikasi (laptop): Pengaturan, tab Sinkron, tekan **Buat kode acak**. Salin nilai **SYNC_TOKEN** yang tampil.
3. Di Vercel buka **Settings, Environment Variables**, tambah `SYNC_TOKEN` dengan nilai tadi, lalu **Redeploy**.
4. Kembali ke aplikasi, tekan **Tes koneksi**. Kalau muncul "Server siap", tekan **Aktifkan sinkron**.
5. Tekan **Salin tautan pemasangan HP**, kirim ke HP-mu (misalnya chat ke diri sendiri), lalu buka tautannya di HP. Kode terisi otomatis dan sinkron langsung aktif. Hapus pesan tautannya setelah dipakai.

Cara kerjanya:
- Data **dienkripsi di browser** (AES-GCM) sebelum dikirim. Vercel dan Upstash hanya menyimpan teks acak. Server juga tidak mengetahui Kode sinkron aslinya, hanya hasil hash-nya (nilai SYNC_TOKEN).
- Dua perangkat digabung otomatis per data. Kalau data yang sama diubah di dua perangkat, versi yang terakhir disimpan yang dipakai. Data baru dari kedua sisi sama-sama dipertahankan.
- Penghapusan ikut tersinkron, termasuk "Hapus semua data".
- Sinkron berjalan saat aplikasi dibuka, tiap menit saat tampil, dan beberapa detik setelah kamu mengubah data. Saat offline, aplikasi tetap bisa dipakai dan perubahan dikirim begitu tersambung lagi.
- **Kalau Kode sinkron hilang** dan tidak ada perangkat yang masih menyimpannya, data di server tidak bisa dibuka. Simpan kode di pengelola kata sandi.
- Kode sinkron dan kunci Gemini tidak ikut tersinkron dan tidak masuk file cadangan.
- Menurut halaman harga Upstash saat ini, tier gratis dibatasi 500 ribu perintah per bulan dan 256 MB. Pemakaian pribadi jauh di bawah itu. Cek halaman harga Upstash karena angkanya bisa berubah.

## Menyambungkan Gemini

Semua langkah ini juga tertulis di aplikasi: Pengaturan, tab Asisten.

**Jalur disarankan (kunci aman di server, cukup sekali untuk semua perangkat):**
1. Buka aistudio.google.com/api-keys, masuk dengan akun Google, buat API key baru, lalu salin.
2. Di Vercel: **Settings, Environment Variables**, tambah `GEMINI_API_KEY` berisi kunci tadi, lalu **Redeploy**.
3. Pastikan `SYNC_TOKEN` sudah diisi dan Kode sinkron sudah dibuat (langkah sinkron di atas). Kode itu dipakai untuk mengamankan jalur ke server supaya orang lain tidak bisa memakai kuota Gemini-mu.
4. Di aplikasi pilih **Lewat server Vercel**, simpan, lalu tekan **Uji koneksi**.

**Alternatif tanpa server:** pilih **Langsung dari browser** dan tempel kuncinya. Kunci tersimpan hanya di perangkat itu, dan harus diisi ulang di tiap perangkat.

**Nama model.** Nilai bawaan `gemini-flash-latest` mengikuti model Flash terbaru. Kalau muncul "nama model tidak ditemukan", tekan **Lihat model tersedia** lalu ketuk salah satu nama untuk memakainya.

### Supaya Gemini paham sistemmu

Setiap kali Gemini diminta memahami perintah, aplikasi menyertakan penjelasan sistem berikut. Kamu bisa melihat persis isinya lewat tombol **Lihat penjelasan sistem yang dikirim**.
- Aturan aplikasi: tiga jenis transaksi, transfer bukan pemasukan atau pengeluaran, tarik tunai dan top up sebagai transfer, biaya admin terpisah, tugas dengan tenggat dan rencana mengerjakan.
- Daftar akunmu beserta nama lainnya, kategori beserta sub-kategori dan kata kuncinya, serta mata kuliah beserta singkatannya.
- **Catatan untuk Gemini tentang kebiasaanmu**, yang kamu tulis sendiri. Contoh: "Rekening utamaku BCA. Kopi dan jajan selalu masuk Makan & minum. Uang saku masuk tiap tanggal 1."

Penjelasan ini tidak memuat saldo atau riwayat transaksi.

**Bertanya tentang datamu (opsional, mati secara bawaan).** Kalau kamu mengaktifkan "Izinkan Gemini membaca ringkasan data", pertanyaan seperti "pengeluaranku paling boros di mana?" bisa dijawab Gemini. Ringkasan yang dikirim: saldo per akun, total per kategori bulan ini dan bulan lalu, transaksi 14 hari terakhir tanpa catatan, anggaran, utang, tagihan, tugas, jadwal, dan target riset. Isi catatan, tautan, dan literatur tidak ikut. Lihat persis isinya lewat tombol **Lihat ringkasan data yang akan dikirim**. Pada tier gratis, Google menyatakan konten yang dikirim dapat dipakai untuk meningkatkan produk mereka.

## Kalau ada pesan galat

| Pesan | Penyebab dan cara memperbaiki |
|---|---|
| Fungsi server belum ada | Folder `api` tidak ikut di-deploy. Pastikan letaknya sejajar dengan `index.html`, lalu deploy ulang. |
| SYNC_TOKEN belum diisi di Vercel | Variabel belum ditambahkan atau belum di-redeploy setelah ditambahkan. |
| Penyimpanan Upstash belum terhubung | Integrasi Upstash belum disambungkan ke project ini. Cek tab Storage. |
| Kode sinkron berbeda dengan SYNC_TOKEN | Nilai SYNC_TOKEN di Vercel tidak sama dengan yang ditampilkan aplikasi. Salin ulang dengan tombol Salin, lalu Redeploy. |
| Kode sinkron tidak cocok dengan data di server | Data di server dibuat dengan kode lain. Pakai kode yang sama, atau tekan "Timpa server dengan data perangkat ini" kalau memang ingin memulai ulang. |
| GEMINI_API_KEY belum diisi di Vercel | Tambahkan variabel itu lalu Redeploy. |
| Kuota Gemini sedang habis | Batas tier gratis tercapai. Perintah biasa tetap jalan. |
| Nama model tidak ditemukan | Tekan Lihat model tersedia lalu pilih salah satu. |

## Fitur lain

Kuliah (mata kuliah per semester, tugas dan ujian dengan tenggat dan rencana mengerjakan, materi, jadwal mingguan, statistik), riset (progres, kebutuhan, ide, literatur dengan status verifikasi DOI, bimbingan), keuangan (akun, transaksi, transfer dengan biaya admin, kategori bawaan dan buatan sendiri, investasi, anggaran harian, target, biaya sejati, utang, tagihan, pencocokan saldo), kalender gabungan, serta asisten perintah cepat. Contoh perintah ada di Pengaturan, tab Asisten.

## Catatan pengujian

Sudah diuji otomatis di Chromium (tampilan desktop dan HP) dengan lingkungan Vercel, Upstash, dan Gemini **tiruan** di komputer lokal: dua perangkat saling sinkron, penggabungan perubahan, konflik, penghapusan, mode offline, kode salah, enkripsi (server tidak memuat teks asli), dan jalur Gemini lewat server. Belum diuji di Vercel sungguhan, Upstash sungguhan, Gemini sungguhan, ataupun iPhone dan Android sungguhan. Kalau ada langkah yang tidak berjalan seperti yang tertulis, catat pesan galatnya dan kabari supaya diperbaiki.
