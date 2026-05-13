-- Seed example trades (replace the user_id UUID).
-- In Supabase, create a user in Auth first, then paste their UUID below.

-- replace with your auth.users id:
-- \set user_id '00000000-0000-0000-0000-000000000000'

insert into public.trades (
  user_id,
  date,
  day_of_week,
  coin_pair,
  strategy_type,
  timeframe,
  position_type,
  range_percentage,
  risk_percentage,
  is_win,
  is_loss,
  limit_level,
  pnl_amount,
  r_factor,
  total_fees,
  macro_notes,
  setup_details,
  setup_checklist,
  lessons_learned,
  screenshot_url
)
values
  -- FX
  (:'user_id', '2026-04-25 14:20:00+00', 'Friday', 'GBP/USD', 'OB', '5m', 'Short', 0.7, 1.0, true, false, 'L1', 98.10, 1.6, 1.80, 'News volatility', 'OB rejection', null, 'Move stop to BE later', null),
  (:'user_id', '2026-04-28 10:10:00+00', 'Tuesday', 'USD/JPY', 'ICCR', '1m', 'Long', 0.5, 0.5, false, true, 'L0', -22.00, -0.7, 0.90, 'Overtrading risk', 'Forced a setup', null, 'Stick to plan', null),
  (:'user_id', '2026-04-30 07:55:00+00', 'Thursday', 'XAU/USD', 'OB', '3m', 'Long', 0.9, 1.0, true, false, 'L2', 180.75, 2.0, 2.50, 'Strong momentum', 'OB continuation', null, 'Let winners run', null),

  -- Indices
  (:'user_id', '2026-05-01 15:00:00+00', 'Friday', 'NASDAQ', 'ICCR', '5m', 'Short', 1.0, 1.0, false, true, 'L1', -105.00, -1.2, 2.75, 'Late session', 'Counter-trend entry', null, 'Avoid fading strong moves', null),
  (:'user_id', '2026-05-05 09:25:00+00', 'Tuesday', 'US30', 'OB', '15m', 'Long', 1.4, 1.0, true, false, 'L0', 260.00, 2.8, 3.50, 'Clean levels', 'OB + liquidity sweep', null, 'Good patience', null);

  
