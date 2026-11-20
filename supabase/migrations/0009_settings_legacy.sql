-- Pengaturan (SPEC 5.8) dan tabel bantu migrasi data lama (D-04, D-05)

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  key text not null,
  value jsonb not null,
  unique (user_id, key)
);

-- Pemetaan id lama (string acak app lama) ke uuid baru, agar impor bisa diulang tanpa duplikat.
create table public.legacy_id_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  source_table text not null,
  legacy_id text not null,
  new_id uuid not null,
  unique (user_id, source_table, legacy_id)
);

-- Catatan setiap impor cadangan (tanpa isi data).
create table public.legacy_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  exported_at timestamptz,
  file_sha256 text not null,
  summary jsonb not null default '{}'
);
