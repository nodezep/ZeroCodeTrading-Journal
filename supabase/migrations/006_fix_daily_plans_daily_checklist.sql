-- Ensure daily_plans has the daily_checklist column (some environments may have missed migration 003).

alter table public.daily_plans
add column if not exists daily_checklist jsonb;

