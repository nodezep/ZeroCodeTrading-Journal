import { z } from 'zod'

const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  checked: z.boolean(),
})

export const tradeUpsertSchema = z.object({
  date: z.string().min(1), // yyyy-MM-dd
  time: z.string().min(1), // HH:mm
  trade_mode: z.enum(['Live', 'Backtest']),
  coin_pair: z.string().min(1),
  session: z.string().nullable(),
  strategy_type: z.string().min(1),
  timeframe: z.string().min(1),
  position_type: z.enum(['Long', 'Short']),
  range_percentage: z.number().nullable(),
  risk_percentage: z.number().nullable(),
  is_win: z.boolean(),
  is_loss: z.boolean(),
  limit_level: z.string().nullable(),
  pnl_amount: z.number().nullable(),
  r_factor: z.number().nullable(),
  rr_ratio: z.string().nullable(),
  total_fees: z.number().nullable(),
  macro_notes: z.string().nullable(),
  setup_details: z.string().nullable(),
  setup_checklist: z.array(checklistItemSchema).nullable(),
  lessons_learned: z.string().nullable(),
  screenshot_url: z.string().url().nullable(),
})

export type TradeUpsertValues = z.infer<typeof tradeUpsertSchema>
