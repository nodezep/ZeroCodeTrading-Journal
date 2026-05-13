export type TradePositionType = 'Long' | 'Short'

export type SetupChecklistItem = {
  id: string
  label: string
  checked: boolean
}

export type Trade = {
  id: string
  user_id: string
  date: string
  day_of_week: string
  coin_pair: string
  session: string | null
  strategy_type: string
  timeframe: string
  position_type: TradePositionType
  range_percentage: number | null
  risk_percentage: number | null
  is_win: boolean
  is_loss: boolean
  limit_level: string | null
  pnl_amount: number | null
  r_factor: number | null
  rr_ratio: string | null
  total_fees: number | null
  macro_notes: string | null
  setup_details: string | null
  setup_checklist: SetupChecklistItem[] | null
  lessons_learned: string | null
  screenshot_url: string | null
  
  // Professional Enhancements
  journal_type: 'Live' | 'Backtest'
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  setup_grade: 'A' | 'B' | 'C' | 'D' | null
  mistakes: string[] | null
  confluence_count: number | null

  created_at: string
  updated_at: string
}
