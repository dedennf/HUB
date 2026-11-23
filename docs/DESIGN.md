# DESIGN.md · Panduan Desain UI Kompas

Dokumen ini mengunci tampilan app. Agen coding wajib membacanya sebelum menyentuh UI. Bila bertentangan dengan SPEC.md soal tampilan, dokumen ini yang berlaku. Soal data dan perilaku, SPEC.md tetap yang berlaku.

Rujukan visual ada di `docs/design/mockups/*.dc.html`. File itu mockup statis berisi markup dan inline style (format kanvas desain, bukan kode produksi). Baca untuk melihat susunan, ukuran, warna, dan teks persisnya. **Jangan** menyalin file itu ke app atau memakai `support.js`, `x-dc`, `sc-if`, atau `DCLogic`. Bangun ulang sebagai komponen React + Tailwind.

| Mockup | Layar di app |
|---|---|
| `Main.dc.html` | Beranda (HP) |
| `BerandaGelap.dc.html` | Beranda mode gelap |
| `Keuangan.dc.html` | Uang, tab Ringkasan |
| `Rencana.dc.html` | Uang, tab Rencana |
| `Kuliah.dc.html` | Agenda |
| `Saya.dc.html` | Saya |
| `Riset.dc.html` | Riset |
| `Bahasa.dc.html` | Bahasa Inggris |
| `Agen.dc.html` | Sheet Ra + kartu konfirmasi aksi |
| `Kondisi.dc.html` | Kondisi khusus (merekam, membaca struk, toast undo, Ra offline, impor pertama) |
| `WebBeranda.dc.html` | Beranda versi laptop + panel Ra |
| `WebKeuangan.dc.html` | Uang versi laptop |
| `Logo.dc.html` | Logo Kompas dan avatar Ra |

---

## 1. Identitas

- Nama app: **Kompas** (wordmark huruf kecil: `kompas`). Ganti semua teks "Hub Pribadi" di UI, `<title>`, `manifest.json`, dan halaman login.
- Nama asisten: **Ra**. Semua label "Asisten" atau "Agen" di UI diganti "Ra".
- Logo: `public/brand/kompas-icon.svg` (ikon app), `public/brand/kompas-mark.svg` (versi monokrom, ikut warna teks), `public/brand/ra-avatar.svg` (avatar Ra). Ikon ukuran ≤ 24 px memakai varian tanpa bintang (`kompas-icon-small.svg`).
- Buat ulang `public/icon-192.png`, `icon-512.png`, `icon-180.png`, dan favicon dari `kompas-icon.svg`.
- Simbol Ra di seluruh app = bintang empat sudut (path di `ra-avatar.svg`). Dipakai di tombol Ra tengah navigasi, avatar pesan, dan kartu usulan.

## 2. Token Desain

Definisikan sebagai CSS variable di `app/globals.css` (Tailwind 4 `@theme`), dengan blok mode gelap. Jangan menulis hex langsung di komponen.

### 2.1 Warna

| Token | Terang | Gelap | Dipakai untuk |
|---|---|---|---|
| `--bg` | `#F5F6F8` | `#0D1412` | latar halaman |
| `--surface` | `#FFFFFF` | `#17211F` | kartu, nav bawah, sheet |
| `--text` | `#111827` | `#E6ECEA` | teks utama |
| `--muted` | `#5B6472` | `#9DAAA6` | teks sekunder, label |
| `--border` | `#E3E6EB` | `#2A3734` | garis kartu dan tombol |
| `--divider` | `#EEF0F3` | `#24302D` | pemisah baris daftar |
| `--track` | `#E9ECF0` | `#2A3734` | latar bar progres, segmented control |
| `--accent` | `#0E7C6B` | `#12A58C` | warna utama, tombol primer, tab aktif |
| `--accent-soft` | `#E7F3F1` | `#16332D` | latar ikon menu, item nav aktif (web) |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | teks di atas accent |
| `--positive` | `#0A7D45` | `#4ADE9A` | uang masuk, naik |
| `--negative` | `#C2362B` | `#FF8A80` | uang keluar, turun, titik notifikasi |
| `--warn-bg` / `--warn-fg` | `#FEF3C7` / `#8A4B08` | `#3A2E12` / `#F5B547` | tenggat dekat, field meragukan |
| `--info-bg` / `--info-fg` | `#DBEAFE` / `#1E40AF` | `#1C2A4A` / `#9DBBFF` | chip info |
| `--ok-bg` / `--ok-fg` | `#DCFCE7` / `#166534` | `#14301F` / `#4ADE9A` | chip berhasil |
| `--danger-bg` / `--danger-fg` | `#FDECEA` / `#9B1C12` | `#3A1714` / `#FF8A80` | tombol "Lupa", peringatan |

Warna kategori (titik di briefing dan kalender):

| Kategori | Terang | Gelap |
|---|---|---|
| Kuliah | `#2563EB` | `#7AA7FF` |
| Tugas / tenggat | `#D97706` | `#F5B547` |
| Tagihan | `#7C3AED` | `#B79BFF` |
| Bahasa / riset | `--accent` | `--accent` |

Avatar akun (inisial dua huruf di lingkaran): pakai pasangan latar lembut + teks tua seperti di mockup Uang (biru untuk bank, hijau untuk dompet digital, kuning untuk tunai, ungu untuk investasi).

Aksesibilitas warna: naik/turun **selalu** disertai tanda `▲`/`▼` atau `+`/`−`, tidak boleh hanya warna. Kontras teks minimal 4.5:1.

### 2.2 Tipografi

- Judul dan angka besar: **Plus Jakarta Sans** 600/700/800 (`next/font/google`).
- Teks lain: **Inter** 400/500/600/700.
- Semua nominal uang memakai `font-variant-numeric: tabular-nums`.

| Peran | HP | Laptop | Font / bobot |
|---|---|---|---|
| Angka hero (uang siap pakai) | 34 px | 40 px | Jakarta 800, letter-spacing −0.5px |
| Judul halaman | 22 px | 26 px | Jakarta 800 |
| Judul seksi | 15 px | 16 px | Jakarta 700 |
| Angka kartu ringkasan | 24 px | 26 px | Jakarta 800 |
| Teks isi | 14 px | 14 px | Inter 400–600 |
| Teks kecil | 13 px | 13 px | Inter |
| Keterangan, chip | 12 px | 12 px | Inter 600 untuk chip |
| Label nav bawah | 11 px | | Inter |

### 2.3 Ukuran, jarak, sudut

- Padding layar: 20 px (HP), 32 px (laptop). Jarak antar seksi 12–20 px.
- Radius: kartu 16 px (laptop 18 px), tombol 12–14 px, chip 8 px, pill dan tab rentang 22 px, avatar bulat penuh.
- Bayangan kartu: `0 1px 2px rgba(17,24,39,0.06)`. Mode gelap: tanpa bayangan, pakai `--border`.
- **Target sentuh minimal 44 × 44 px** untuk semua tombol dan tautan.
- Ikon: `lucide-react`, stroke 1.8, ukuran 20–22 px. Simbol Ra pakai SVG sendiri.

### 2.4 Format angka dan teks

- Rupiah penuh: `Rp3.825.000` (tanpa spasi, titik ribuan).
- Rupiah ringkas di bar dan keterangan: `Rp620rb`, `Rp1,2jt`.
- Persen: `3,8%` (koma desimal).
- Tanggal: `Sabtu, 21 Nov`, jam `08.00`.
- Data yang belum ada **tidak boleh dikarang**. Tampilkan keadaan kosong yang jelas (misalnya "Belum ada literatur. Tambahkan lewat Ra atau tombol +").

## 3. Mode Gelap

- Pengaturan tema di **Saya → Tampilan**: Otomatis (ikut sistem, bawaan), Terang, Gelap. Simpan di tabel `settings` dan juga `localStorage` agar tidak berkedip saat dimuat.
- Semua warna lewat token di bagian 2.1, jadi semua layar otomatis ikut. Rujukan: `BerandaGelap.dc.html`.

## 4. Mode Privasi Saldo

- Ikon mata di samping label "Uang siap pakai" di Beranda (dan di kartu total saldo versi laptop).
- Saat aktif, semua nominal saldo dan kekayaan bersih di seluruh app tampil `Rp•••••••`. Nominal transaksi individual tetap terlihat.
- Status disimpan di `localStorage` per perangkat. `aria-label` bergantian "Sembunyikan saldo" / "Tampilkan saldo".

## 5. Navigasi

### 5.1 HP (lebar < 1024 px)

Bar bawah tetap, tinggi 76 px, lima slot:

| Slot | Label | Rute | Isi |
|---|---|---|---|
| 1 | Beranda | `/` | |
| 2 | Uang | `/keuangan` | tab Ringkasan · Transaksi · Rencana · Investasi |
| 3 | (tombol Ra) | membuka sheet | lingkaran accent 56 px, naik 24 px, bintang putih |
| 4 | Agenda | `/kalender` | strip mingguan, kelas hari ini, tugas, kartu progres skripsi |
| 5 | Saya | `/saya` (baru) | Riset, Bahasa, Otomasi, Memori Ra, Tampilan, Notifikasi, Cadangan & impor |

Rute `/kuliah`, `/riset`, `/pengaturan` tetap ada dan dijangkau dari Agenda atau Saya. Tambahkan `/bahasa` dan `/otomasi` sebagai halaman kosong dengan keadaan kosong bila fiturnya belum dibangun.

### 5.2 Laptop (≥ 1024 px)

Tiga kolom (rujukan `WebBeranda.dc.html`):
- Sidebar kiri 240 px: logo Kompas + menu Beranda, Keuangan, Kuliah, Riset, Kalender, Bahasa, Otomasi, Pengaturan. Item aktif berlatar `--accent-soft`, teks `--accent`.
- Konten tengah, lebar maksimum konten 1440 px.
- Panel Ra kanan 340–380 px, selalu terlihat, bisa diciutkan ke ikon. Berisi riwayat chat, kartu aksi, zona seret struk ("Seret struk ke sini atau tempel screenshot (Ctrl+V)"), dan bar input.
- **Ctrl+K / Cmd+K** di mana saja memfokuskan input Ra.
- Saat jendela menyempit, sidebar dan panel Ra turun ke bawah (flex-wrap), lalu di bawah 1024 px berganti ke navigasi HP.

## 6. Komponen

Buat di `components/ui/` dan `components/ra/`. Satu komponen satu file. Nama dalam bahasa Inggris.

| Komponen | Isi dan perilaku | Rujukan |
|---|---|---|
| `MoneyHero` | label "Uang siap pakai" + ikon mata, angka hero, baris kecil "Kekayaan bersih Rp… · ▲ x% bulan ini" | Main |
| `RangeTabs` | 1B · 3B · 6B · 1T, tinggi 44 px, aktif = latar accent | Main |
| `Sparkline` | garis accent tanpa grid di bawah MoneyHero | Main |
| `QuickActions` | grid 4: Catat, Struk, Suara, Transfer. Ikon dalam kotak 48 px radius 16 | Main |
| `BriefingCard` | judul "Briefing pagi · Ra" + jam, baris: titik kategori, teks, tombol aksi kecil (Lokasi, Jadwalkan, Bayar, Ulang) | Main |
| `ProposalBanner` | avatar Ra + "N usulan Ra menunggu" + tautan "Tinjau" | Main |
| `SegmentedTabs` | 4 tab di latar `--track`, tab aktif putih, tinggi 40 px | Keuangan |
| `CashflowCard` | cashflow bulan ini + dua kotak Masuk ▲ / Keluar ▼ | Keuangan |
| `AccountRow` | avatar inisial, nama, jenis, saldo, perubahan berwarna. Investasi diberi keterangan "tidak siap pakai" | Keuangan |
| `BudgetBar` / `PlanRow` | nama, keterangan, chip persen, bar 8 px. Bar oranye bila ≥ 75% | Rencana |
| `PersonRow` | piutang/utang: avatar inisial, nama, keterangan, nominal | Rencana |
| `WeekStrip` | 7 hari, hari ini berlatar accent, titik oranye di hari bertenggat | Kuliah |
| `ClassCard` | kartu kelas, garis atas biru 4 px, jam, nama, ruang | Kuliah |
| `TaskRow` | lingkaran centang 28 px (tombol), judul, keterangan, chip tenggat (Besok = warn, lainnya netral) | Kuliah |
| `ProgressCard` | judul proyek riset + persen besar accent + bar | Kuliah, Riset |
| `LiteratureRow` | judul, penulis · tahun, chip status verifikasi: Teks lengkap dibaca (ok), DOI dicek (info), Belum dicek (warn) | Riset |
| `MenuRow` | ikon di kotak `--accent-soft`, judul, keterangan, panah › | Saya |
| `StatTile` | angka kecil (streak, diulang hari ini, dikuasai) | Bahasa |
| `Flashcard` | kata, arti, contoh kalimat miring, empat tombol Lupa / Sulit / Bisa / Mudah | Bahasa |
| `Chip` | varian `neutral`, `warn`, `info`, `ok` | semua |
| `RaSheet` | bottom sheet radius atas 24 px, handle, header avatar Ra + "Ra" + sakelar English Mode | Agen |
| `ChatBubble` | pengguna: kanan, latar accent, sudut kanan bawah 4 px. Pesan suara diberi ikon mic + durasi | Agen |
| `ActionCard` | ikon jenis aksi, label jenis, nilai utama besar, chip yang bisa diketuk untuk diubah (kategori, akun, tanggal). Field meragukan = chip warn + kalimat penjelasan | Agen |
| `ActionBar` | Batal (sekunder) + "Setujui semua (N)" (primer, 2× lebar) | Agen |
| `RaInputBar` | tombol kamera, tombol galeri, input teks, tombol mic accent 48 px | Agen |
| `UndoToast` | latar gelap, ikon centang, teks "Tersimpan: …", tombol "Batalkan", bar hitung mundur 10 detik | Kondisi |
| `OfflineBanner` | latar warn, "Ra sedang tidak tersambung… cek lagi sebelum simpan" | Kondisi |
| `RecordingView` | gelombang suara, timer besar, tombol mic 76 px dalam lingkaran lembut, "Lepas untuk kirim · geser ke kiri untuk batal" | Kondisi |
| `ReceiptScanning` | pratinjau struk dengan garis pindai accent, "Ra sedang membaca struk…", skeleton | Kondisi |
| `ImportPreview` | jumlah per jenis data dalam grid 2 kolom, peringatan kuning untuk data janggal, tombol "Impor data" | Kondisi |
| `Skeleton` | balok abu `--border` radius 6 px untuk keadaan memuat | Kondisi |

Aturan semua komponen:
- Pakai elemen asli: `<button>`, `<a href>`, `<input>` + `<label>`. Tombol hanya-ikon wajib `aria-label`.
- Setiap komponen punya keadaan kosong dan memuat.
- Komponen Ra (`RaSheet`, `ActionCard`, dll.) dibangun visualnya sekarang. Sambungan ke agen Gemini dikerjakan di fase agen sesuai SPEC.md. Sebelum itu, tombol Ra membuka sheet berisi keterangan "Ra segera hadir" dan input yang belum aktif.

## 7. Animasi

- Bottom sheet: geser dari bawah 200 ms ease-out.
- Angka saldo berubah: transisi angka 300 ms.
- Toast undo: muncul 150 ms, hitung mundur 10 detik linear.
- Hormati `prefers-reduced-motion`: matikan semua animasi selain fade.

## 8. Yang Tidak Dilakukan

- Tidak memakai gradien latar, emoji sebagai ikon, atau kartu bergaris tepi kiri berwarna.
- Tidak meniru nama, logo, ilustrasi, atau warna merek aplikasi lain.
- Tidak menampilkan data contoh dari mockup (Rp3.825.000, "outcrop", dll.) di app sungguhan. Semua angka dari database.

## 9. Kriteria Selesai Fase Desain

- [ ] Token warna, font, dan mode gelap terpasang di `globals.css`
- [ ] Nama Kompas dan Ra menggantikan Hub Pribadi dan Asisten di seluruh UI, manifest, dan ikon
- [ ] Navigasi HP lima slot dan tata letak laptop tiga kolom berjalan
- [ ] Halaman Beranda, Uang (Ringkasan + Rencana), Agenda, Saya, dan Riset memakai komponen bagian 6 dengan data asli
- [ ] Mode privasi saldo dan pengaturan tema berfungsi dan tersimpan
- [ ] Halaman `/bahasa` dan `/otomasi` ada dengan keadaan kosong
- [ ] Semua target sentuh ≥ 44 px, kontras lolos, bisa dipakai dengan keyboard
- [ ] Dicek di lebar 390 px (HP) dan 1440 px (laptop), mode terang dan gelap
