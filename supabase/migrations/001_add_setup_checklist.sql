-- Add checklist storage for strategy validation steps
alter table public.trades
add column if not exists setup_checklist jsonb;

