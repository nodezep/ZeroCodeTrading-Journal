-- Add trade mode and per-user daily plan templates

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_mode_type') then
    create type trade_mode_type as enum ('Live', 'Backtest');
  end if;
end$$;

alter table public.trades
add column if not exists trade_mode trade_mode_type not null default 'Live';

create table if not exists public.daily_plan_templates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_template jsonb,
  checklist_template jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

