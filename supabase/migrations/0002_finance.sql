-- Keuangan (SPEC 5.1 + tambahan D-07, D-08)

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  type text not null check (type in ('bank', 'ewallet', 'cash', 'investment')),
  opening_balance bigint not null default 0,
  balance bigint not null default 0,          -- dipelihara pemicu di 0011, jangan diubah dari klien
  aliases text[] not null default '{}',
  is_archived boolean not null default false,
  sort_order int not null default 0
);
create index accounts_user_idx on public.accounts (user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  slug text,                                   -- kunci kategori bawaan, mis. 'o_makan'
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  is_default boolean not null default false,
  monthly_budget bigint check (monthly_budget is null or monthly_budget >= 0),
  icon text,
  color text,
  keywords text[] not null default '{}',
  subcategories text[] not null default '{}',
  sort_order int not null default 0,
  is_hidden boolean not null default false,
  unique (user_id, slug)
);
create index categories_user_idx on public.categories (user_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  storage_path text not null,
  image_hash text not null,
  mime_type text,
  extracted jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected'))
);
create unique index receipts_hash_uq on public.receipts (user_id, image_hash);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  amount bigint not null check (amount > 0),
  account_id uuid not null references public.accounts on delete restrict,
  to_account_id uuid references public.accounts on delete restrict,
  category_id uuid references public.categories on delete set null,
  subcategory text,
  merchant text,
  note text,
  occurred_at timestamptz not null,
  receipt_id uuid references public.receipts on delete set null,
  source text not null default 'manual'
    check (source in ('manual', 'agent', 'receipt', 'voice', 'automation', 'import')),
  dedupe_hash text,
  group_id uuid,                               -- menautkan transfer dengan biaya adminnya
  constraint transactions_transfer_target check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (kind <> 'transfer' and to_account_id is null)
  )
);
create index transactions_user_time_idx on public.transactions (user_id, occurred_at desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_group_idx on public.transactions (group_id);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  account_id uuid references public.accounts on delete set null,
  instrument text not null,
  name text not null,
  platform text,
  units numeric,
  invested_amount bigint,
  current_value bigint,
  valued_at date,
  note text
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  amount bigint not null check (amount >= 0),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'yearly', 'once')),
  due_day int check (due_day between 1 and 31),
  due_date date,
  next_due_date date,
  default_account_id uuid references public.accounts on delete set null,
  category_id uuid references public.categories on delete set null,
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  note text
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  target_amount bigint not null check (target_amount >= 0),
  saved_amount bigint not null default 0 check (saved_amount >= 0),
  deadline date,
  note text
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  direction text not null check (direction in ('payable', 'receivable')),  -- utang | piutang
  person text not null,
  amount bigint not null check (amount >= 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  occurred_on date,
  due_on date,
  note text
);

create table public.sinking_funds (                 -- "biaya sejati"
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  amount bigint not null check (amount >= 0),
  due_on date,
  saved_amount bigint not null default 0 check (saved_amount >= 0),
  is_done boolean not null default false,
  note text
);
