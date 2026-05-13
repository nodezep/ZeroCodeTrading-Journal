# Trading Journal & Backtesting System (MVP)

React (TypeScript) + Supabase (Postgres/Auth) trading journal with a master trade log, basic filters, and a simple trade entry/edit modal.

## 1) Supabase setup

1. Create a Supabase project.
2. In Supabase **SQL Editor**, run:
   - `supabase/schema.sql`
3. If you already ran the schema earlier, also run the latest migration(s):
   - `supabase/migrations/001_add_setup_checklist.sql`
   - `supabase/migrations/002_add_presets_and_trade_fields.sql`
   - `supabase/migrations/003_add_daily_checklist.sql`
3. (Optional) Seed example trades:
   - Open `supabase/seed.sql` and replace `user_id` with your `auth.users.id`, then run it.

## 2) Environment variables

Create a `.env.local` (or copy `.env.example`) with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

You can find these in Supabase: **Project Settings → API**.

## 3) Run the app

```bash
npm install
npm run dev
```

Visit:

- `http://localhost:5173/login`

## Current MVP screens

- Auth: `/login` (email/password sign in + sign up)
- Master Trade Log: `/trades`
  - Read + filters (wins/losses/position/search)
  - Add/Edit trade (modal)
  - Delete trade (confirm)
  - Basic stats (Total PnL, win rate, wins/losses, trades)
- Daily Trade Plan: `/plan` (upsert notes per day)
- Settings: `/settings` (manage dropdown presets: pairs, sessions, R:R)

## Next steps (planned)

- Daily Trade Plan UI + CRUD (`daily_plans`)
- Calendar/Gallery views
- Analytics dashboard + charts
- Screenshot uploads (Supabase Storage)
