# SPEC.md · Dashboard Pribadi dengan AI Agent

Dokumen ini adalah spesifikasi final untuk pengembangan lanjutan dashboard pribadi (kuliah, riset, keuangan, bahasa Inggris) yang sudah ter-deploy di Vercel. Agen coding wajib membaca dokumen ini sampai habis sebelum menulis kode.

---

## 0. Aturan Kerja untuk Agen Coding

1. **Audit dulu, jangan langsung menulis.** Sebelum Fase 1, baca seluruh repo dan buat laporan singkat di `docs/AUDIT.md` berisi: framework dan versinya, cara penyimpanan data saat ini, struktur folder, fitur yang sudah berjalan (struk, suara, kalender, dll.), dan integrasi Gemini yang sudah ada.
2. **Sesuaikan, jangan membongkar.** Spesifikasi ini mengasumsikan Next.js (App Router) + TypeScript. Kalau repo memakai stack lain, ikuti stack yang ada dan terjemahkan spesifikasi ini ke sana. Fitur lama yang sudah berjalan tidak boleh rusak.
3. **Kerjakan per fase** (lihat Bagian 14). Satu fase = satu branch = satu pull request. Jangan lompat fase.
4. **Migrasi data lama.** Kalau data saat ini tersimpan di localStorage atau file, buat skrip migrasi ke database baru tanpa kehilangan data.
5. **Tanyakan ke pemilik** hanya untuk keputusan yang tidak bisa dibatalkan (hapus data, ganti penyedia database). Hal lain putuskan sendiri dan catat di `docs/DECISIONS.md`.
6. **Bahasa UI: Indonesia.** Kode, nama variabel, dan nama tabel dalam bahasa Inggris.
7. **App berdiri sendiri.** Model AI di dalam app adalah **Gemini**, bukan Claude. Semua data disimpan di database milik app.

---

## 1. Ringkasan Produk

App pribadi satu pengguna untuk mengelola kehidupan kuliah, riset, keuangan, dan belajar bahasa Inggris, dengan **AI agent sebagai otak utama**. Semua input (teks, suara, gambar struk) masuk ke satu agen yang memahami seluruh sistem app, memanggil tools untuk membaca dan menulis data, lalu meminta konfirmasi sebelum mengubah data.

### Modul
| Modul | Isi |
|---|---|
| Kuliah | mata kuliah per semester, jadwal kuliah rutin, materi, tugas dan tenggat |
| Riset | proyek riset, kebutuhan riset, target dan progres, ide riset lanjutan, bacaan jurnal |
| Keuangan | akun (bank, tunai, dompet digital, investasi), transaksi masuk/keluar, transfer antar akun, tagihan, budget per kategori, investasi |
| Kalender | satu kalender gabungan: kuliah, tugas (slot pengerjaan + tenggat), riset, tagihan, latihan bahasa |
| Bahasa Inggris | bank kosakata dengan spaced repetition, membaca jurnal berpendamping, koreksi tulisan, latihan bicara, English Mode |
| Otomasi | daftar aturan otomatis yang bisa diaktifkan, dinonaktifkan, dan dilihat riwayatnya |

### Yang TIDAK dibuat (keputusan pemilik)
- Kalkulator IPK/IPS
- Penandaan transaksi ke proyek riset
- Estimasi biaya riset ke anggaran
- Integrasi Telegram (notifikasi cukup push notification biasa)

---

## 2. Stack dan Infrastruktur

| Lapisan | Pilihan | Catatan |
|---|---|---|
| Frontend + API | Next.js App Router, TypeScript, Tailwind | ikuti yang sudah ada |
| Hosting | Vercel | sudah berjalan |
| Database | Supabase (Postgres) | sumber data tunggal untuk laptop dan HP |
| Auth | Supabase Auth, satu pengguna | login email/magic link |
| Storage | Supabase Storage, bucket `receipts` (private) | gambar struk |
| AI | Gemini via SDK `@google/genai` | nama model lewat env, jangan di-hardcode |
| Penjadwal | Supabase `pg_cron` + `pg_net` memanggil `/api/cron/tick` tiap 5 menit | cron Vercel paket gratis frekuensinya terbatas |
| Notifikasi | Web Push (VAPID) + PWA | library `web-push` di server |
| Validasi | Zod | untuk semua input API dan argumen tools |

Kalau repo sudah memakai database lain yang tersinkron antar perangkat, boleh dipertahankan. Catat alasannya di `docs/DECISIONS.md`.

---

## 3. Arsitektur Tingkat Tinggi

```
                 PINTU MASUK
  [Teks]   [Suara]   [Gambar/Struk]   [Penjadwal + Event Data]
     \        |            |                    |
      \       |            |             MESIN OTOMASI
       \      |            |            /              \
        v     v            v      aturan tetap      butuh nalar
     ┌────────────────────────┐   (kode biasa)          |
     │       AGEN GEMINI      │<------------------------+
     │ konteks sistem         │
     │ snapshot kondisi       │
     │ memori jangka panjang  │
     │ loop rencana-aksi-amati│
     └───────────┬────────────┘
                 v
        REGISTRY TOOLS (baca / tulis)
  Kuliah | Riset | Keuangan | Kalender | Bahasa | Otomasi
                 v
   Tools baca  → dieksekusi langsung
   Tools tulis → jadi "usulan aksi" → kartu konfirmasi → eksekusi
                 v
     Database + Log aksi (bisa undo) + Notifikasi push
```

Prinsip:
- **Satu agen untuk semua input.** Teks, suara, dan gambar memakai endpoint dan registry tools yang sama.
- **AI hanya dipakai kalau perlu penalaran.** Aturan pasti (transaksi berulang, pengingat tenggat) dijalankan kode biasa.
- **Pengguna memegang kendali.** Agen tidak pernah mengubah data tanpa konfirmasi, kecuali aturan otomasi yang diaktifkan pengguna secara eksplisit.

---

## 4. Struktur Folder (target)

```
app/
  (dashboard)/
    page.tsx                 # beranda + briefing
    kuliah/  riset/  keuangan/  kalender/  bahasa/  otomasi/  pengaturan/
  api/
    agent/route.ts           # POST: teks / audio / gambar → respons agen
    agent/confirm/route.ts   # POST: eksekusi usulan aksi
    agent/undo/route.ts      # POST: batalkan aksi
    receipts/upload/route.ts # POST: upload + hash + simpan
    cron/tick/route.ts       # POST: dipanggil penjadwal tiap 5 menit
    push/subscribe/route.ts  # POST: simpan push subscription
lib/
  agent/
    core.ts                  # loop agen
    system-prompt.ts         # konteks sistem
    snapshot.ts              # ringkasan kondisi terkini
    memory.ts                # baca/tulis memori agen
    tools/
      index.ts               # registry
      finance.ts  academic.ts  research.ts  calendar.ts  english.ts  automation.ts
  automation/
    engine.ts  triggers.ts  conditions.ts  actions.ts
  english/srs.ts             # algoritma spaced repetition
  push.ts  supabase.ts  gemini.ts  schemas.ts
components/
  agent/AgentBar.tsx  ActionCard.tsx  VoiceButton.tsx  ReceiptPicker.tsx
public/
  manifest.json  sw.js
supabase/migrations/
docs/ AUDIT.md  DECISIONS.md
```

---

## 5. Model Data

Semua tabel memakai `id uuid primary key default gen_random_uuid()`, `user_id uuid references auth.users`, `created_at timestamptz default now()`, `updated_at timestamptz`. Kolom-kolom itu tidak ditulis ulang di bawah. Aktifkan Row Level Security di semua tabel dengan kebijakan `user_id = auth.uid()`. Nominal uang disimpan sebagai `bigint` dalam rupiah (tanpa desimal).

### 5.1 Keuangan
```sql
create table accounts (
  name text not null,                 -- "BCA", "GoPay", "Tunai"
  type text not null,                 -- bank | ewallet | cash | investment
  balance bigint not null default 0,
  aliases text[] default '{}',         -- "atm biru", "dana yang biru"
  is_archived boolean default false
);

create table categories (
  name text not null,
  kind text not null,                 -- expense | income
  is_default boolean default false,   -- kategori bawaan
  monthly_budget bigint               -- null = tanpa budget
);

create table transactions (
  kind text not null,                 -- expense | income | transfer
  amount bigint not null check (amount > 0),
  account_id uuid references accounts,
  to_account_id uuid references accounts,   -- hanya untuk transfer
  category_id uuid references categories,
  merchant text,
  note text,
  occurred_at timestamptz not null,
  receipt_id uuid references receipts,
  source text not null default 'manual',    -- manual | agent | receipt | voice | automation
  dedupe_hash text
);

create table investments (
  account_id uuid references accounts,
  instrument text not null,           -- reksa dana, saham, emas, dll
  name text not null,
  units numeric,
  invested_amount bigint,
  current_value bigint,
  valued_at date
);

create table bills (
  name text not null,
  amount bigint not null,
  due_day int,                        -- tanggal jatuh tempo bulanan
  due_date date,                      -- untuk tagihan sekali bayar
  default_account_id uuid references accounts,
  is_recurring boolean default true,
  is_active boolean default true
);

create table receipts (
  storage_path text not null,
  image_hash text not null,           -- sha256, untuk cegah duplikat
  mime_type text,
  extracted jsonb,                    -- hasil baca Gemini
  status text default 'pending'       -- pending | confirmed | rejected
);
create unique index receipts_hash_uq on receipts(user_id, image_hash);
```

Saldo akun diperbarui oleh fungsi database atau service di server saat transaksi dikonfirmasi, diubah, dihapus, atau di-undo. Jangan dihitung di klien.

Kategori bawaan saat pertama kali setup: Makan, Transportasi, Kebutuhan Harian, Kos/Tempat Tinggal, Pulsa/Internet, Kuliah, Riset, Hiburan, Kesehatan, Langganan, Lainnya (pengeluaran) dan Uang Saku, Gaji/Honor, Beasiswa, Lainnya (pemasukan). Pengguna bisa menambah sendiri.

### 5.2 Kuliah
```sql
create table semesters ( name text not null, start_date date, end_date date, is_active boolean default false );

create table courses (
  semester_id uuid references semesters,
  code text, name text not null, lecturer text, credits int, room text
);

create table course_schedules (
  course_id uuid references courses,
  weekday int not null,               -- 1 = Senin ... 7 = Minggu
  start_time time not null, end_time time not null, location text
);

create table materials (
  course_id uuid references courses,
  title text not null, url text, storage_path text, notes text
);

create table tasks (
  course_id uuid references courses,  -- boleh null untuk tugas umum
  title text not null, description text,
  due_at timestamptz,
  status text default 'todo',         -- todo | in_progress | done | overdue
  estimated_minutes int,
  completed_at timestamptz
);

create table task_work_slots (        -- kapan tugas dikerjakan
  task_id uuid references tasks,
  start_at timestamptz not null, end_at timestamptz not null,
  suggested_by_agent boolean default false
);
```

### 5.3 Riset
```sql
create table research_projects ( title text not null, description text, status text default 'active' );

create table research_needs ( project_id uuid references research_projects, item text not null, is_fulfilled boolean default false );

create table research_targets (
  project_id uuid references research_projects,
  title text not null, due_date date,
  progress int default 0 check (progress between 0 and 100),
  last_touched_at timestamptz
);

create table research_ideas ( project_id uuid references research_projects, content text not null, source text );

create table readings (                -- jurnal/artikel yang dibaca
  project_id uuid references research_projects,
  title text not null, authors text, year int, doi text, url text,
  content_excerpt text, notes text
);
```

### 5.4 Kalender
Kalender gabungan adalah **view**, bukan tabel terpisah, supaya tidak ada data ganda:
```sql
create view calendar_items as
  -- kuliah rutin (diekspansi di aplikasi per minggu), tenggat tugas,
  -- slot pengerjaan tugas, target riset, tagihan, latihan bahasa
  ...
```
Agen coding menulis view ini lengkap atau, kalau lebih praktis, fungsi server `getCalendarItems(from, to)` yang menggabungkan semua sumber. Setiap item punya `type`, `title`, `start_at`, `end_at`, `ref_table`, `ref_id`, `color`.

Tabel tambahan untuk acara bebas:
```sql
create table events ( title text not null, start_at timestamptz not null, end_at timestamptz, notes text );
```

### 5.5 Agen
```sql
create table agent_memory (
  kind text not null,                 -- alias | merchant_rule | habit | preference | correction
  key text not null,                  -- "dana yang biru", "Indomaret"
  value jsonb not null,               -- {"account_id": "..."} / {"category_id": "..."}
  confidence numeric default 1,
  last_used_at timestamptz
);

create table agent_conversations ( title text, channel text );   -- text | voice | receipt

create table agent_messages (
  conversation_id uuid references agent_conversations,
  role text not null,                 -- user | model | tool
  content jsonb not null
);

create table agent_actions (          -- usulan + log aksi
  conversation_id uuid references agent_conversations,
  tool_name text not null,
  args jsonb not null,
  summary text not null,              -- teks untuk kartu konfirmasi
  status text default 'proposed',     -- proposed | executed | rejected | undone | failed
  permission text not null,           -- write | destructive
  result jsonb,
  undo_payload jsonb,                 -- data untuk membalik aksi
  executed_at timestamptz
);
```

### 5.6 Otomasi dan Notifikasi
```sql
create table automations (
  name text not null,
  is_enabled boolean default true,
  is_system boolean default false,    -- otomasi bawaan
  trigger jsonb not null,             -- lihat Bagian 8.2
  conditions jsonb default '[]',
  action jsonb not null,
  mode text not null,                 -- rule | agent
  auto_write boolean default false,   -- true hanya jika pengguna mengaktifkan eksplisit
  last_run_at timestamptz,
  next_run_at timestamptz
);

create table automation_runs (
  automation_id uuid references automations,
  status text not null,               -- success | skipped | failed
  output jsonb, error text
);

create table push_subscriptions ( endpoint text unique not null, keys jsonb not null, device_label text );

create table notifications (
  title text not null, body text, url text,
  category text,                      -- briefing | deadline | bill | budget | english | research
  sent_at timestamptz, read_at timestamptz
);
```

### 5.7 Bahasa Inggris
```sql
create table vocab (
  term text not null,
  meaning_id text,                    -- arti dalam bahasa Indonesia
  definition_en text,
  example text,
  part_of_speech text,
  source_type text,                   -- manual | reading | mistake | agent
  source_ref uuid,                    -- id readings atau writing_submissions
  -- spaced repetition (SM-2)
  ease numeric default 2.5,
  interval_days int default 0,
  repetitions int default 0,
  due_at timestamptz default now(),
  lapses int default 0
);

create table vocab_reviews ( vocab_id uuid references vocab, grade int not null );   -- 0..5

create table writing_submissions (
  prompt text, original text not null, corrected text,
  feedback jsonb,                     -- daftar kesalahan + penjelasan
  kind text                           -- free | summary | abstract | english_mode
);

create table mistake_patterns (
  pattern text not null,              -- "subject-verb agreement", "article a/an/the"
  example text,
  count int default 1,
  last_seen_at timestamptz
);

create table practice_sessions (
  kind text not null,                 -- review | reading | writing | speaking
  duration_seconds int, summary text, score jsonb
);
```

### 5.8 Pengaturan
```sql
create table settings (
  key text not null, value jsonb not null,
  unique (user_id, key)
);
```
Kunci default: `briefing_time` "06:30", `recap_time` "21:00", `quiet_hours` ["22:30","06:00"], `english_goal` "academic_general", `english_level` "intermediate", `english_daily_minutes` 15, `english_mode` false, `english_correction_level` "important_only", `timezone` "Asia/Jakarta", `agent_max_steps` 6.

---

## 6. Inti AI Agent

### 6.1 Endpoint
`POST /api/agent` menerima `multipart/form-data`:
- `conversation_id` (opsional)
- `text` (opsional)
- `audio` (opsional, file webm/ogg/m4a)
- `images[]` (opsional, satu atau lebih)
- `mode` (opsional): `default` | `english_practice`

Respons (JSON atau stream):
```json
{
  "conversation_id": "...",
  "reply": "teks jawaban agen",
  "proposed_actions": [ { "id": "...", "tool": "add_transaction", "summary": "Pengeluaran Rp30.000 · Transportasi · GoPay", "args": {} } ],
  "english_feedback": null
}
```

### 6.2 Loop Agen (`lib/agent/core.ts`)
```
1. Muat konteks sistem + snapshot + memori relevan + riwayat percakapan
2. Kirim ke Gemini bersama deklarasi tools
3. Selama langkah < agent_max_steps:
     a. Jika Gemini memanggil tool BACA  → eksekusi, kirim hasilnya kembali, lanjut
     b. Jika Gemini memanggil tool TULIS → JANGAN eksekusi
        simpan sebagai agent_actions status 'proposed'
        kembalikan ke Gemini: {"status":"menunggu_konfirmasi","action_id":"..."}
        lanjut (agar agen bisa mengusulkan beberapa aksi sekaligus)
     c. Jika Gemini menjawab teks tanpa tool → selesai
4. Kembalikan reply + daftar proposed_actions ke klien
```
Jika batas langkah tercapai, hentikan dan kembalikan pesan bahwa permintaan terlalu panjang untuk diproses sekaligus.

### 6.3 Konfirmasi dan Undo
- `POST /api/agent/confirm` dengan `action_ids[]` dan opsional `edits` (pengguna bisa mengoreksi field di kartu sebelum setuju). Eksekusi di dalam transaksi database. Simpan `undo_payload`.
- Jika pengguna mengedit field sebelum konfirmasi (misalnya ganti kategori), simpan perbedaannya ke `agent_memory` dengan `kind = 'correction'` atau perbarui `merchant_rule`/`alias`.
- `POST /api/agent/undo` membalik aksi berdasarkan `undo_payload`, termasuk mengembalikan saldo akun. Tombol undo tampil 10 detik di toast setelah eksekusi, dan selalu tersedia di halaman log aksi.

### 6.4 Tingkat Izin
| Izin | Contoh | Perilaku |
|---|---|---|
| `read` | lihat saldo, cari transaksi | langsung dieksekusi |
| `write` | tambah transaksi, tambah tugas | kartu konfirmasi satu ketukan |
| `destructive` | hapus atau ubah data lama, hapus otomasi | kartu konfirmasi dengan teks peringatan dan tombol merah |

### 6.5 Konteks Sistem (`system-prompt.ts`)
Disusun dinamis dari database, isi minimal:
- Peran: asisten pribadi untuk mahasiswa, berbahasa Indonesia santai, singkat, tidak bertele-tele.
- Tanggal dan jam sekarang (Asia/Jakarta). Wajib, supaya "besok", "Jumat", "tadi siang" bisa dihitung benar.
- Penjelasan setiap modul dan aturan datanya.
- Daftar akun beserta alias, daftar kategori, mata kuliah semester aktif, proyek riset aktif.
- Aturan:
  - Nominal: pahami "30rb", "30k", "goceng", "ceban", "1,2 jt", "satu setengah juta".
  - Satu kalimat boleh jadi beberapa aksi.
  - Transfer antar akun sendiri dicatat sebagai `transfer`, bukan pengeluaran.
  - Jika data wajib tidak jelas (misalnya akun tidak disebut dan tidak ada di memori), pakai akun default yang paling sering dipakai untuk kategori itu dan tandai di ringkasan kartu agar mudah dikoreksi.
  - Jangan mengarang angka. Selalu panggil tool baca sebelum menjawab pertanyaan tentang data.
  - Jika `english_mode` aktif: pengguna boleh menulis atau bicara dalam bahasa Inggris. Tetap jalankan permintaannya, lalu isi `english_feedback` sesuai `english_correction_level`.

### 6.6 Snapshot (`snapshot.ts`)
Ringkasan ringkas (target di bawah 1.500 token) yang disuntikkan setiap panggilan:
- saldo tiap akun dan total
- pengeluaran bulan ini per kategori vs budget
- tagihan 7 hari ke depan
- jadwal kuliah hari ini dan besok
- tugas belum selesai dengan tenggat 14 hari ke depan
- target riset aktif dan hari sejak terakhir disentuh
- jumlah kosakata yang jatuh tempo hari ini, streak belajar

### 6.7 Memori Agen (`memory.ts`)
- Sebelum memanggil Gemini, ambil memori yang relevan (semua `alias`, `merchant_rule` yang cocok dengan kata di input, `habit` dan `preference`).
- Setelah konfirmasi, perbarui `last_used_at` dan `confidence`.
- Tool `remember` memungkinkan agen menyimpan memori baru saat pengguna berkata misalnya "kalau aku bilang atm kuning itu BRI ya".

### 6.8 Registry Tools
Setiap tool didefinisikan sekali dengan: `name`, `description` (bahasa Indonesia, jelas, karena ini yang dibaca Gemini), `parameters` (skema Zod yang dikonversi ke JSON Schema), `permission`, `execute()`, dan untuk tool tulis `summarize()` serta `buildUndo()`.

**Keuangan**
| Tool | Izin | Parameter utama |
|---|---|---|
| `get_balances` | read | `account_ids?` |
| `search_transactions` | read | `from?`, `to?`, `category?`, `account?`, `query?`, `limit?` |
| `spending_summary` | read | `period` (week/month/custom), `group_by` (category/account/day) |
| `get_bills` | read | `within_days?` |
| `add_transaction` | write | `kind`, `amount`, `account`, `category?`, `merchant?`, `note?`, `occurred_at?`, `receipt_id?` |
| `add_transfer` | write | `amount`, `from_account`, `to_account`, `fee?`, `occurred_at?` |
| `update_transaction` | destructive | `id`, field yang diubah |
| `delete_transaction` | destructive | `id` |
| `add_bill` | write | `name`, `amount`, `due_day?` / `due_date?`, `account?` |
| `update_investment` | write | `investment_id` atau `name`, `current_value`, `units?` |

**Kuliah**
| Tool | Izin | Parameter utama |
|---|---|---|
| `get_tasks` | read | `status?`, `due_within_days?`, `course?` |
| `get_course_schedule` | read | `date?` |
| `add_task` | write | `title`, `course?`, `due_at`, `estimated_minutes?`, `description?` |
| `complete_task` | write | `task_id` atau `title` |
| `add_material` | write | `course`, `title`, `url?`, `notes?` |
| `add_course` | write | `name`, `semester?`, `schedules[]?` |

**Riset**
| Tool | Izin | Parameter utama |
|---|---|---|
| `get_research_progress` | read | `project?` |
| `add_research_target` | write | `project`, `title`, `due_date?` |
| `update_research_progress` | write | `target`, `progress` |
| `add_research_idea` | write | `project?`, `content` |
| `add_research_need` | write | `project`, `item` |

**Kalender**
| Tool | Izin | Parameter utama |
|---|---|---|
| `get_calendar` | read | `from`, `to` |
| `find_free_slots` | read | `from`, `to`, `min_minutes` |
| `schedule_task_work` | write | `task`, `start_at`, `end_at` |
| `add_event` | write | `title`, `start_at`, `end_at?` |

**Struk**
| Tool | Izin | Parameter utama |
|---|---|---|
| `read_receipt` | read | `receipt_id` (memanggil Gemini Vision, lihat 7.2) |

**Bahasa Inggris**
| Tool | Izin | Parameter utama |
|---|---|---|
| `save_vocab` | write | `term`, `meaning_id?`, `example?`, `source_type?`, `source_ref?` |
| `get_due_reviews` | read | `limit?` |
| `grade_review` | write | `vocab_id`, `grade` |
| `correct_writing` | write | `text`, `kind?` (menyimpan submission + memperbarui `mistake_patterns`) |
| `start_practice` | read | `kind` (review/reading/writing/speaking), `topic?` |
| `explain_text` | read | `text` (menjelaskan istilah dan memecah kalimat sulit) |
| `get_english_progress` | read | `period?` |

**Otomasi dan Memori**
| Tool | Izin | Parameter utama |
|---|---|---|
| `list_automations` | read | |
| `create_automation` | write | `name`, `trigger`, `conditions?`, `action`, `mode`, `auto_write?` |
| `toggle_automation` | write | `automation_id`, `is_enabled` |
| `delete_automation` | destructive | `automation_id` |
| `remember` | write | `kind`, `key`, `value` |

Resolusi nama: parameter seperti `account`, `course`, `project`, `task` menerima nama bebas. Server mencocokkan ke id lewat nama, alias, dan memori. Jika lebih dari satu kandidat cocok, tool mengembalikan daftar kandidat ke agen agar agen memilih atau meminta pengguna memilih lewat kartu.

---

## 7. Pintu Masuk

### 7.1 Teks
`AgentBar` selalu tersedia di semua halaman (bar bawah di HP, panel samping di laptop). Mendukung riwayat percakapan dan menampilkan kartu aksi.

### 7.2 Struk (kamera, galeri, screenshot, PDF)
**Klien (`ReceiptPicker.tsx`)**
- Dua tombol: "Kamera" (`<input type="file" accept="image/*" capture="environment">`) dan "Galeri / File" (`<input type="file" accept="image/*,application/pdf" multiple>` **tanpa** atribut `capture`).
- Dukung drag and drop dan paste dari clipboard di laptop.
- Kompres gambar di klien (sisi terpanjang maks 1600 px, JPEG kualitas 0,8). Konversi HEIC dari iPhone bila perlu.
- Hitung SHA-256 di klien, kirim bersama file.

**Server (`/api/receipts/upload`)**
- Tolak jika `image_hash` sudah ada, kembalikan pesan "struk ini sudah pernah dicatat" beserta tautan transaksinya.
- Simpan ke bucket `receipts`, buat baris `receipts` status `pending`.
- Panggil agen dengan gambar. Agen memanggil `read_receipt` lalu mengusulkan `add_transaction` atau `add_transfer`.

**Ekstraksi Gemini (structured output)**
Gunakan `responseMimeType: "application/json"` dan `responseSchema`:
```json
{
  "doc_type": "receipt | transfer_proof | invoice | ewallet_history | unknown",
  "merchant": "string|null",
  "occurred_at": "ISO datetime|null",
  "currency": "IDR",
  "items": [{ "name": "string", "qty": "number|null", "price": "number|null" }],
  "subtotal": "number|null",
  "discount": "number|null",
  "tax": "number|null",
  "total": "number",
  "payment_method": "string|null",
  "from_account_hint": "string|null",
  "to_account_hint": "string|null",
  "confidence": "number 0..1"
}
```
Aturan:
- `transfer_proof` antar akun milik pengguna → usulkan `add_transfer`, bukan pengeluaran.
- `confidence < 0.7` atau total tidak terbaca → kartu konfirmasi menandai field yang meragukan dengan warna kuning.
- Banyak gambar sekaligus → satu kartu per struk, dengan tombol "Setujui semua".
- Kategori ditebak dari `merchant_rule` di memori dulu, baru dari nalar Gemini.

### 7.3 Suara
**Tingkat 1 (dikerjakan sekarang): audio langsung ke agen**
- `VoiceButton`: tekan-tahan atau ketuk untuk mulai/berhenti, pakai `MediaRecorder` (webm/opus, fallback mp4 di Safari). Tampilkan gelombang suara dan durasi. Batas 60 detik.
- Kirim file audio mentah ke `/api/agent` sebagai inline data ke Gemini. **Jangan** mengubah ke teks dulu di klien.
- Instruksi tambahan untuk Gemini: transkripsikan secara internal, pahami maksud, panggil tools. Kembalikan juga transkrip untuk ditampilkan di riwayat.
- Hasilnya satu kartu berisi semua aksi dari satu rekaman, dengan tombol "Setujui semua" dan edit per aksi.
- Fitur speech-to-text lama boleh dipertahankan sebagai opsi dikte di kolom teks biasa, tapi tombol suara utama memakai alur baru ini.

**Tingkat 2 (Fase 8): percakapan suara dua arah**
- Gemini Live API lewat WebSocket. Server hanya membuat token sementara (ephemeral token), klien tersambung langsung ke Gemini.
- Tools yang sama didaftarkan ke sesi Live. Tool tulis tetap menghasilkan usulan aksi yang dikonfirmasi lewat layar.
- Dipakai juga untuk latihan bicara bahasa Inggris.

---

## 8. Mesin Otomasi

### 8.1 Prinsip
- `mode: "rule"` dijalankan kode biasa tanpa AI. Murah, cepat, pasti.
- `mode: "agent"` memanggil agen untuk penalaran (briefing, saran jadwal, deteksi janggal).
- Otomasi `agent` **hanya boleh menyarankan dan mengirim notifikasi**. Usulan tulisnya masuk ke `agent_actions` status `proposed` dan muncul di beranda untuk dikonfirmasi.
- Otomasi `rule` boleh menulis data langsung hanya jika `auto_write = true`, dan nilai itu hanya bisa diset lewat konfirmasi pengguna.
- Hormati `quiet_hours`: notifikasi yang jatuh di jam tenang ditunda ke akhir jam tenang, kecuali tenggat yang jatuh di dalam jam tenang itu sendiri.

### 8.2 Format Trigger, Kondisi, Aksi
```jsonc
// trigger
{ "type": "schedule", "cron": "30 6 * * *" }                       // waktu (zona Asia/Jakarta)
{ "type": "event", "event": "transaction.created" }                 // peristiwa data
{ "type": "threshold", "metric": "account_balance", "account": "GoPay", "op": "<", "value": 50000 }

// conditions (semua harus terpenuhi)
[ { "metric": "category_spend_week", "category": "Makan", "op": ">", "value": 300000 } ]

// action
{ "type": "add_transaction", "args": { ... } }        // rule + auto_write
{ "type": "notify", "title": "...", "body": "..." }    // rule
{ "type": "agent_task", "instruction": "Susun briefing pagi" }   // agent
```
Event yang dipancarkan aplikasi: `transaction.created`, `task.created`, `task.completed`, `research.progress_updated`, `vocab.created`, `bill.created`. Event dicatat ke tabel antrean ringan `automation_events` lalu diproses oleh `/api/cron/tick` (atau langsung diproses inline jika ringan).

### 8.3 Penjadwal
- `pg_cron` di Supabase memanggil `POST /api/cron/tick` tiap 5 menit memakai `pg_net`, dengan header `Authorization: Bearer ${CRON_SECRET}`.
- `tick` mengambil otomasi yang `next_run_at <= now()`, memproses event baru, menjalankan, mencatat `automation_runs`, lalu menghitung `next_run_at` berikutnya.
- Jalankan dengan aman terhadap eksekusi ganda (kunci baris `for update skip locked` atau flag status).

### 8.4 Membuat Otomasi dengan Bahasa Biasa
Pengguna berkata ke agen, misalnya "setiap tanggal 5 catat bayar wifi 150 ribu dari GoPay". Agen memanggil `create_automation`, kartu konfirmasi menampilkan pratinjau aturan dalam bahasa manusia ("Tiap tanggal 5 jam 08.00 → catat pengeluaran Rp150.000, Pulsa/Internet, GoPay. Otomatis tanpa konfirmasi: Ya"). Setelah disetujui, aturan tersimpan dan muncul di halaman Otomasi.

### 8.5 Otomasi Bawaan (`is_system = true`, bisa dinonaktifkan)
| Nama | Mode | Pemicu | Isi |
|---|---|---|---|
| Briefing pagi | agent | `briefing_time` tiap hari | kuliah hari ini, tenggat terdekat, tagihan, saldo kritis, 1 kosakata hari ini, jumlah review |
| Rekap malam | agent | `recap_time` tiap hari | pengeluaran hari ini, tugas selesai, saran persiapan besok |
| Pengingat tenggat bertingkat | rule | tiap tick | notifikasi H-3, H-1, dan 3 jam sebelum tenggat tugas |
| Tugas lewat tenggat | rule | tiap tick | status jadi `overdue` + notifikasi |
| Saran slot pengerjaan | agent | event `task.created` | cari slot kosong, usulkan `schedule_task_work` |
| Pengingat tagihan | rule | tiap hari 08.00 | H-3 dan H-1, cek apakah saldo akun default cukup |
| Peringatan budget | rule | event `transaction.created` | kategori melewati 80% dan 100% budget bulanan |
| Deteksi transaksi janggal | agent | event `transaction.created` | nominal jauh di atas kebiasaan kategori itu, atau kemungkinan dobel |
| Pengingat riset | rule | tiap hari | target aktif tidak disentuh lebih dari 4 hari |
| Rekap mingguan | agent | Minggu 19.00 | cashflow antar akun, progres riset vs target, progres bahasa |
| Review kosakata | rule | jam pilihan pengguna | jumlah kata yang jatuh tempo |
| Penyeimbang minggu padat | agent | Senin 06.00 | jika minggu ini padat tugas/ujian, sarankan menunda target riset dan menurunkan target latihan bahasa |

---

## 9. Notifikasi (Push Biasa)

- Jadikan app PWA: `public/manifest.json` (nama, ikon 192 dan 512, `display: standalone`) dan service worker `public/sw.js` yang menangani event `push` dan `notificationclick` (buka `url` dari payload).
- Buat kunci VAPID, simpan di env. Halaman Pengaturan punya tombol "Aktifkan notifikasi" yang meminta izin lalu mengirim subscription ke `/api/push/subscribe`. Dukung banyak perangkat (laptop dan HP).
- Server mengirim lewat `web-push`. Hapus subscription yang mengembalikan status 404/410.
- Semua notifikasi juga disimpan di tabel `notifications` dan tampil di ikon lonceng di app.
- Tampilkan petunjuk khusus iPhone: notifikasi baru aktif setelah app ditambahkan ke Home Screen lewat menu Share.

---

## 10. Modul Bahasa Inggris

### 10.1 Pengaturan Default (bisa diubah di Pengaturan)
- Tujuan: `academic_general` (bahasa Inggris akademik untuk jurnal dan menulis, plus percakapan umum). Pilihan lain: `toefl`, `ielts`, `conversation`, `career`.
- Level: `intermediate`. Pilihan: `beginner`, `intermediate`, `upper_intermediate`.
- Waktu harian: 15 menit.
- English Mode: nonaktif.
- Tingkat koreksi: `important_only`. Pilihan: `all`, `important_only`, `off`.

Agen membaca pengaturan ini untuk menyesuaikan kesulitan materi dan gaya latihan.

### 10.2 Fitur
1. **Bank Kosakata + Review (SM-2)**
   - Halaman review gaya kartu: tampil `term`, ketuk untuk melihat arti, contoh, dan sumber. Pengguna menilai: Lupa (1), Sulit (3), Bisa (4), Mudah (5).
   - Algoritma SM-2 di `lib/english/srs.ts`:
     - jika `grade < 3`: `repetitions = 0`, `interval = 1`, `lapses += 1`
     - selain itu: `repetitions += 1`, interval 1 hari untuk repetisi pertama, 6 hari untuk kedua, lalu `round(interval * ease)`
     - `ease = max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))`
     - `due_at = now + interval hari`
   - Sumber kata: input manual, blok teks saat membaca, kesalahan dari koreksi tulisan, dan saran agen.
2. **Membaca Berpendamping**
   - Di halaman detail `readings` (modul Riset) dan halaman Bahasa, pengguna menempel atau membuka teks jurnal.
   - Blok kata atau kalimat → menu: "Jelaskan" (`explain_text`), "Simpan kata" (`save_vocab` dengan `source_ref` ke reading).
   - Mode "pecah kalimat": agen menguraikan kalimat panjang jadi bagian-bagian dengan terjemahan dan struktur gramatikalnya.
3. **Koreksi Tulisan**
   - Jenis: bebas, ringkasan jurnal, draf abstrak, jurnal harian.
   - Output terstruktur: `corrected`, daftar `{ original, fix, type, explanation_id }`, dan skor kasar (grammar, vocabulary, clarity).
   - Setiap `type` kesalahan menambah `count` di `mistake_patterns`. Kesalahan kosakata bisa disimpan ke bank kata dengan satu ketukan.
4. **Latihan Bicara**
   - Tingkat 1: rekam jawaban atas pertanyaan agen, Gemini menilai isi, tata bahasa, dan pilihan kata, lalu memberi versi yang lebih natural.
   - Tingkat 2 (Fase 8): percakapan real-time lewat Live API dengan topik (kuliah, riset, presentasi, wawancara kerja).
   - Tampilkan catatan di UI bahwa penilaian pelafalan bersifat kasar.
5. **English Mode**
   - Sakelar di AgentBar. Saat aktif, pengguna boleh memberi perintah dalam bahasa Inggris. Agen tetap menjalankan aksi, lalu menampilkan `english_feedback` kecil di bawah balasan sesuai tingkat koreksi.
   - Setiap interaksi English Mode disimpan sebagai `writing_submissions` dengan `kind = 'english_mode'` agar pola kesalahan ikut terlacak.

### 10.3 Halaman Bahasa
- Ringkasan: streak, kata jatuh tempo hari ini, total kata dikuasai (interval ≥ 21 hari), 3 pola kesalahan teratas.
- Tombol cepat: Review, Baca, Tulis, Bicara.
- Riwayat sesi latihan.

### 10.4 Latihan Adaptif
`start_practice` memilih materi berdasarkan `mistake_patterns` teratas dan level. Contoh: kalau pola teratas "article a/an/the", latihan menulis berikutnya diberi instruksi yang memancing penggunaan artikel, dan review menyelipkan kata-kata terkait.

---

## 11. Halaman dan UI

| Halaman | Isi utama |
|---|---|
| Beranda | kartu briefing, usulan aksi menunggu konfirmasi, tenggat terdekat, saldo ringkas, review bahasa hari ini |
| Kuliah | filter semester, daftar mata kuliah, jadwal mingguan, tugas (todo/in progress/done/overdue), materi |
| Riset | proyek, target + bar progres, kebutuhan, ide, bacaan |
| Keuangan | saldo semua akun, transaksi dengan filter, transfer, tagihan, budget per kategori, investasi, grafik cashflow |
| Kalender | tampilan bulan/minggu/hari, warna per jenis item, klik item membuka detail asal |
| Bahasa | lihat 10.3 |
| Otomasi | daftar aturan (bawaan dan buatan sendiri), sakelar aktif, riwayat jalan, tombol "Buat dengan agen" |
| Log Agen | semua `agent_actions` dengan status, tombol undo |
| Pengaturan | akun keuangan + alias, kategori + budget, jam briefing/rekap/jam tenang, notifikasi, pengaturan bahasa, memori agen (lihat, edit, hapus) |

Komponen penting:
- `ActionCard`: ringkasan aksi, field yang bisa diedit inline, penanda kuning untuk field meragukan, tombol Setujui / Tolak, dan "Setujui semua" untuk banyak aksi.
- Desain responsif, prioritas HP untuk input cepat dan laptop untuk input detail.

---

## 12. Keamanan dan Batasan

- Semua kunci (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) hanya di server.
- Semua route API memeriksa sesi pengguna, kecuali `/api/cron/tick` yang memeriksa `CRON_SECRET`.
- RLS aktif di semua tabel.
- Argumen tools divalidasi Zod sebelum dieksekusi. Agen tidak pernah menjalankan SQL bebas.
- Batasi laju `/api/agent` (misalnya 30 permintaan per menit) untuk menjaga kuota Gemini.
- Bucket `receipts` private, akses lewat signed URL berumur pendek.
- Tangani error Gemini (kuota habis, timeout) dengan pesan ramah dan opsi isi manual.

---

## 13. Variabel Lingkungan

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=            # model utama agen (teks, gambar, audio)
GEMINI_LIVE_MODEL=       # model untuk Live API (Fase 8)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:email-pemilik
CRON_SECRET=
APP_TIMEZONE=Asia/Jakarta
```
Buat `.env.example` berisi daftar ini tanpa nilai.

---

## 14. Fase Pengerjaan

Setiap fase selesai jika semua kriteria terpenuhi, build lolos, dan preview Vercel sudah dicoba di laptop dan HP.

**Fase 0 · Audit**
- [x] `docs/AUDIT.md` dan `docs/DECISIONS.md` dibuat
- [x] Daftar fitur lama yang wajib tetap berjalan (AUDIT Bagian 7)

**Fase 1 · Fondasi Data dan Sinkron** (dibagi 1a dan 1b, lihat D-17)
- [x] Supabase terpasang, migrasi semua tabel Bagian 5, RLS aktif. Diverifikasi di Supabase lokal (image resmi Postgres 17) dan `npm run test:db`. Tinggal `supabase db push` ke proyek pemilik.
- [x] Auth satu pengguna. Diuji: email lain tidak dikirimi tautan, tautan valid milik pengguna lain ditolak, tautan bisa dibuka di perangkat lain.
- [ ] Data lama termigrasi tanpa hilang. Importer selesai dan diuji dengan cadangan asli 2026-11-21 (54 data, 5 saldo cocok persis, impor ulang tidak menggandakan). Impor ke database production menunggu proyek Supabase pemilik.
- [x] Data yang diinput di laptop langsung terlihat di HP. Diuji dua browser: transaksi baru muncul di HP tanpa reload dalam kurang dari 1 detik.
- [ ] Preview Vercel dicoba di laptop dan HP (menunggu env Supabase di Vercel)
- [ ] Fase 1b: fitur lama AUDIT Bagian 7 kembali berjalan

**Fase 1b · Desain** (ditambahkan pemilik, panduan di `docs/DESIGN.md`)
- [x] Token warna, font, dan mode gelap terpasang
- [x] Nama Kompas dan Ra menggantikan Hub Pribadi dan Asisten di UI, manifest, ikon, dan email login
- [x] Navigasi HP lima slot dan tata letak laptop tiga kolom
- [x] Beranda, Uang (Ringkasan, Transaksi, Rencana, Investasi), Agenda, Saya, dan Riset memakai komponen DESIGN dengan data asli
- [x] Mode privasi saldo dan pengaturan tema tersimpan
- [x] `/bahasa` dan `/otomasi` dengan keadaan kosong
- [x] Target sentuh ≥ 44 px, lolos axe-core WCAG 2 AA, bisa dipakai dengan keyboard (Ctrl+K)
- [x] Dicek di 390 px dan 1440 px, terang dan gelap (Supabase lokal, D-27 sampai D-30)

**Fase 1c · Port fitur lama** (disetujui pemilik, D-31 sampai D-34)
- [x] Input di semua modul: tugas, mata kuliah, jadwal, materi, semester, acara, libur, riset, tagihan dan Bayar, utang dan cicilan, budget, target tabungan, biaya sejati, investasi, kategori
- [x] Input cepat lewat Ra dengan pengurai lokal (kartu usulan, Setujui, Batalkan), Cocokkan saldo, kalender bulan dan minggu, ekspor cadangan JSON dan CSV

**Fase 2 · Tools dan API** (D-35 sampai D-37)
- [x] Registry tools lengkap Bagian 6.8 dengan validasi Zod (38 tool, `lib/agent/tools`, deklarasi JSON Schema untuk Gemini)
- [x] Resolusi nama ke id (akun, mata kuliah, proyek, tugas, kategori, target, investasi, otomasi) termasuk alias dan memori, kandidat bila ambigu
- [x] Update saldo otomatis dan konsisten saat tambah, ubah, hapus, undo (uji integrasi Supabase lokal, `npm run test:it`)

**Fase 3 · Inti Agen + Input Teks** (D-38 sampai D-41)
- [x] Loop agen, konteks sistem, snapshot, memori (`lib/agent/core.ts`, cadangan pengurai lokal saat Gemini tidak tersedia)
- [x] Usulan aksi, `ActionCard`, konfirmasi, undo, Log Agen (chip bisa diubah, aksi destruktif bertombol merah, `/pengaturan/log-agen`)
- [x] Uji kalimat: "tadi beli bensin 30rb pakai gopay terus makan siang 25 ribu cash", "tugas laporan RDTR dikumpul jumat jam 23.59", "pindahin 500rb dari BCA ke Dana", "sisa uang di semua akun berapa" (model tiruan di `npm run test:it`, e2e dengan server Gemini tiruan)
- [x] Koreksi pengguna tersimpan ke memori dan dipakai di permintaan berikutnya

**Fase 4 · Struk**
- [ ] Tombol kamera dan galeri terpisah, multi pilih, PDF, paste, drag and drop
- [ ] Kompresi, hash, tolak duplikat
- [ ] Ekstraksi terstruktur, deteksi bukti transfer, penanda field meragukan
- [ ] Merchant rule dari memori dipakai untuk kategori

**Fase 5 · Suara Tingkat 1**
- [ ] Rekaman audio dikirim langsung ke Gemini, bukan teks
- [ ] Satu rekaman bisa menghasilkan beberapa aksi
- [ ] Transkrip tampil di riwayat
- [ ] Berjalan di Chrome Android, Safari iPhone, dan browser laptop

**Fase 6 · Otomasi + Notifikasi**
- [ ] PWA, service worker, push subscription multi perangkat
- [ ] `pg_cron` → `/api/cron/tick`, aman dari eksekusi ganda
- [ ] Semua otomasi bawaan Bagian 8.5 berjalan
- [ ] Membuat otomasi lewat agen dengan bahasa biasa
- [ ] Halaman Otomasi dengan riwayat jalan
- [ ] Jam tenang dihormati

**Fase 7 · Bahasa Inggris**
- [ ] Bank kosakata + review SM-2
- [ ] Membaca berpendamping dari modul Riset
- [ ] Koreksi tulisan + `mistake_patterns`
- [ ] Latihan bicara tingkat 1
- [ ] English Mode di AgentBar
- [ ] Otomasi review kosakata dan konten bahasa di briefing

**Fase 8 · Suara Tingkat 2 (Live API)**
- [ ] Token sementara dari server, klien tersambung langsung
- [ ] Tools yang sama, tool tulis tetap lewat konfirmasi layar
- [ ] Mode percakapan untuk latihan bicara bahasa Inggris

---

## 15. Daftar Uji Akhir

- [ ] Input yang sama lewat teks, suara, dan struk menghasilkan aksi yang setara
- [ ] Tidak ada data yang berubah tanpa konfirmasi, kecuali otomasi `auto_write` yang diaktifkan pengguna
- [ ] Undo mengembalikan data dan saldo persis seperti semula
- [ ] Struk yang sama diunggah dua kali ditolak
- [ ] Transfer antar akun tidak tercatat sebagai pengeluaran
- [ ] Waktu relatif ("besok", "Jumat depan", "tadi pagi") dihitung benar di zona Asia/Jakarta
- [ ] Notifikasi muncul di laptop dan HP, dan tidak muncul di jam tenang
- [ ] Gemini gagal atau kuota habis → app tetap bisa dipakai secara manual
- [ ] Fitur lama dari laporan audit tetap berjalan
