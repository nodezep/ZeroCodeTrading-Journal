-- Trading Journal & Backtesting System (Supabase/Postgres)
-- Apply in Supabase SQL editor (order matters).

-- 1) Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_position_type') then
    create type trade_position_type as enum ('Long', 'Short');
  end if;
  if not exists (select 1 from pg_type where typname = 'trade_mode_type') then
    create type trade_mode_type as enum ('Live', 'Backtest');
  end if;
end$$;

-- 2) Utility: updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3) Live trading accounts
create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  broker text,
  currency text not null default 'USD',
  starting_balance numeric not null default 0,
  status text not null default 'Active',
  blown_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trading_accounts_status_check check (status in ('Active', 'Blown', 'Archived')),
  constraint trading_accounts_starting_balance_check check (starting_balance >= 0)
);

drop trigger if exists set_trading_accounts_updated_at on public.trading_accounts;
create trigger set_trading_accounts_updated_at
before update on public.trading_accounts
for each row execute function public.set_updated_at();

create index if not exists trading_accounts_user_status_idx
on public.trading_accounts (user_id, status, created_at desc);

create table if not exists public.account_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  amount numeric not null default 0,
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint account_events_type_check check (event_type in ('Deposit', 'Withdrawal', 'Blown')),
  constraint account_events_amount_check check (
    (event_type = 'Blown' and amount = 0) or (event_type in ('Deposit', 'Withdrawal') and amount > 0)
  )
);

create index if not exists account_events_account_date_idx
on public.account_events (account_id, occurred_at desc);

create index if not exists account_events_user_date_idx
on public.account_events (user_id, occurred_at desc);

-- 4) Trades
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date timestamptz not null,
  day_of_week text not null,
  trade_mode trade_mode_type not null default 'Live',
  account_id uuid references public.trading_accounts (id) on delete set null,
  coin_pair text not null,
  session text,
  strategy_type text not null,
  timeframe text not null,
  position_type trade_position_type not null,
  range_percentage numeric,
  risk_percentage numeric,
  is_win boolean not null default false,
  is_loss boolean not null default false,
  limit_level text,
  pnl_amount numeric,
  r_factor numeric,
  rr_ratio text,
  total_fees numeric,
  macro_notes text,
  setup_details text,
  setup_checklist jsonb,
  lessons_learned text,
  screenshot_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_win_loss_check check (not (is_win and is_loss))
);

drop trigger if exists set_trades_updated_at on public.trades;
create trigger set_trades_updated_at
before update on public.trades
for each row execute function public.set_updated_at();

create index if not exists trades_user_date_idx on public.trades (user_id, date desc);
create index if not exists trades_account_date_idx on public.trades (account_id, date desc);

-- 5) Daily plans
create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  pre_session_notes text,
  trading_session_notes text,
  personal_time_notes text,
  post_session_notes text,
  next_day_planning text,
  daily_checklist jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_plans_user_date_unique unique (user_id, date)
);

-- 6) Daily plan templates (per-user)
create table if not exists public.daily_plan_templates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_template jsonb,
  checklist_template jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_daily_plan_templates_updated_at on public.daily_plan_templates;
create trigger set_daily_plan_templates_updated_at
before update on public.daily_plan_templates
for each row execute function public.set_updated_at();

alter table public.daily_plan_templates enable row level security;

drop policy if exists "daily_plan_templates_select_own" on public.daily_plan_templates;
create policy "daily_plan_templates_select_own" on public.daily_plan_templates
for select
using (auth.uid() = user_id);

drop policy if exists "daily_plan_templates_insert_own" on public.daily_plan_templates;
create policy "daily_plan_templates_insert_own" on public.daily_plan_templates
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_plan_templates_update_own" on public.daily_plan_templates;
create policy "daily_plan_templates_update_own" on public.daily_plan_templates
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists set_daily_plans_updated_at on public.daily_plans;
create trigger set_daily_plans_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

create index if not exists daily_plans_user_date_idx on public.daily_plans (user_id, date desc);

-- 7) Row Level Security (RLS)
alter table public.trading_accounts enable row level security;
alter table public.account_events enable row level security;
alter table public.trades enable row level security;
alter table public.daily_plans enable row level security;

-- 8) Presets (user-defined dropdown values)
create table if not exists public.pair_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_pair_presets_updated_at on public.pair_presets;
create trigger set_pair_presets_updated_at
before update on public.pair_presets
for each row execute function public.set_updated_at();

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

drop trigger if exists set_session_presets_updated_at on public.session_presets;
create trigger set_session_presets_updated_at
before update on public.session_presets
for each row execute function public.set_updated_at();

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

drop trigger if exists set_rr_presets_updated_at on public.rr_presets;
create trigger set_rr_presets_updated_at
before update on public.rr_presets
for each row execute function public.set_updated_at();

create unique index if not exists rr_presets_user_label_uniq
on public.rr_presets (user_id, lower(label));

alter table public.rr_presets enable row level security;

drop policy if exists "trading_accounts_select_own" on public.trading_accounts;
create policy "trading_accounts_select_own" on public.trading_accounts for select using (auth.uid() = user_id);
drop policy if exists "trading_accounts_insert_own" on public.trading_accounts;
create policy "trading_accounts_insert_own" on public.trading_accounts for insert with check (auth.uid() = user_id);
drop policy if exists "trading_accounts_update_own" on public.trading_accounts;
create policy "trading_accounts_update_own" on public.trading_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "trading_accounts_delete_own" on public.trading_accounts;
create policy "trading_accounts_delete_own" on public.trading_accounts for delete using (auth.uid() = user_id);

drop policy if exists "account_events_select_own" on public.account_events;
create policy "account_events_select_own" on public.account_events for select using (auth.uid() = user_id);
drop policy if exists "account_events_insert_own" on public.account_events;
create policy "account_events_insert_own" on public.account_events for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trading_accounts
    where trading_accounts.id = account_events.account_id
      and trading_accounts.user_id = auth.uid()
  )
);
drop policy if exists "account_events_update_own" on public.account_events;
create policy "account_events_update_own" on public.account_events for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trading_accounts
    where trading_accounts.id = account_events.account_id
      and trading_accounts.user_id = auth.uid()
  )
);
drop policy if exists "account_events_delete_own" on public.account_events;
create policy "account_events_delete_own" on public.account_events for delete using (auth.uid() = user_id);

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

drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own" on public.trades
for select
using (auth.uid() = user_id);

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own" on public.trades
for insert
with check (auth.uid() = user_id);

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own" on public.trades
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own" on public.trades
for delete
using (auth.uid() = user_id);

drop policy if exists "daily_plans_select_own" on public.daily_plans;
create policy "daily_plans_select_own" on public.daily_plans
for select
using (auth.uid() = user_id);

drop policy if exists "daily_plans_insert_own" on public.daily_plans;
create policy "daily_plans_insert_own" on public.daily_plans
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_plans_update_own" on public.daily_plans;
create policy "daily_plans_update_own" on public.daily_plans
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_plans_delete_own" on public.daily_plans;
create policy "daily_plans_delete_own" on public.daily_plans
for delete
using (auth.uid() = user_id);
