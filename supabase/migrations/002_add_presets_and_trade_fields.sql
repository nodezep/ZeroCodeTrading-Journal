-- Add preset tables + trade dropdown fields (session + rr_ratio)

alter table public.trades
add column if not exists session text;

alter table public.trades
add column if not exists rr_ratio text;

create table if not exists public.pair_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pair_presets_user_label_uniq
on public.pair_presets (user_id, lower(label));

alter table public.pair_presets enable row level security;

create table if not exists public.session_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists session_presets_user_label_uniq
on public.session_presets (user_id, lower(label));

alter table public.session_presets enable row level security;

create table if not exists public.rr_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  r_factor numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rr_presets_user_label_uniq
on public.rr_presets (user_id, lower(label));

alter table public.rr_presets enable row level security;

drop policy if exists "pair_presets_select_own" on public.pair_presets;
create policy "pair_presets_select_own" on public.pair_presets for select using (auth.uid() = user_id);
drop policy if exists "pair_presets_insert_own" on public.pair_presets;
create policy "pair_presets_insert_own" on public.pair_presets for insert with check (auth.uid() = user_id);
drop policy if exists "pair_presets_update_own" on public.pair_presets;
create policy "pair_presets_update_own" on public.pair_presets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "pair_presets_delete_own" on public.pair_presets;
create policy "pair_presets_delete_own" on public.pair_presets for delete using (auth.uid() = user_id);

drop policy if exists "session_presets_select_own" on public.session_presets;
create policy "session_presets_select_own" on public.session_presets for select using (auth.uid() = user_id);
drop policy if exists "session_presets_insert_own" on public.session_presets;
create policy "session_presets_insert_own" on public.session_presets for insert with check (auth.uid() = user_id);
drop policy if exists "session_presets_update_own" on public.session_presets;
create policy "session_presets_update_own" on public.session_presets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "session_presets_delete_own" on public.session_presets;
create policy "session_presets_delete_own" on public.session_presets for delete using (auth.uid() = user_id);

drop policy if exists "rr_presets_select_own" on public.rr_presets;
create policy "rr_presets_select_own" on public.rr_presets for select using (auth.uid() = user_id);
drop policy if exists "rr_presets_insert_own" on public.rr_presets;
create policy "rr_presets_insert_own" on public.rr_presets for insert with check (auth.uid() = user_id);
drop policy if exists "rr_presets_update_own" on public.rr_presets;
create policy "rr_presets_update_own" on public.rr_presets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "rr_presets_delete_own" on public.rr_presets;
create policy "rr_presets_delete_own" on public.rr_presets for delete using (auth.uid() = user_id);

