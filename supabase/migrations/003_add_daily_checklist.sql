-- Add per-day accountability checklist storage
alter table public.daily_plans
add column if not exists daily_checklist jsonb;

