-- Live trading accounts, account events, and trade-to-account linking.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

alter table public.trading_accounts enable row level security;

drop policy if exists "trading_accounts_select_own" on public.trading_accounts;
create policy "trading_accounts_select_own" on public.trading_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "trading_accounts_insert_own" on public.trading_accounts;
create policy "trading_accounts_insert_own" on public.trading_accounts
for insert
with check (auth.uid() = user_id);

drop policy if exists "trading_accounts_update_own" on public.trading_accounts;
create policy "trading_accounts_update_own" on public.trading_accounts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "trading_accounts_delete_own" on public.trading_accounts;
create policy "trading_accounts_delete_own" on public.trading_accounts
for delete
using (auth.uid() = user_id);

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

alter table public.account_events enable row level security;

drop policy if exists "account_events_select_own" on public.account_events;
create policy "account_events_select_own" on public.account_events
for select
using (auth.uid() = user_id);

drop policy if exists "account_events_insert_own" on public.account_events;
create policy "account_events_insert_own" on public.account_events
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trading_accounts
    where trading_accounts.id = account_events.account_id
      and trading_accounts.user_id = auth.uid()
  )
);

drop policy if exists "account_events_update_own" on public.account_events;
create policy "account_events_update_own" on public.account_events
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trading_accounts
    where trading_accounts.id = account_events.account_id
      and trading_accounts.user_id = auth.uid()
  )
);

drop policy if exists "account_events_delete_own" on public.account_events;
create policy "account_events_delete_own" on public.account_events
for delete
using (auth.uid() = user_id);

alter table public.trades
add column if not exists account_id uuid references public.trading_accounts (id) on delete set null;

create index if not exists trades_account_date_idx
on public.trades (account_id, date desc);
