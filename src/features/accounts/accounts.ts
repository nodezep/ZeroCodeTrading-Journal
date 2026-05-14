import { supabase } from '../../lib/supabaseClient'
import type { Trade } from '../trades/types'

export type TradingAccountStatus = 'Active' | 'Blown' | 'Archived'
export type AccountEventType = 'Deposit' | 'Withdrawal' | 'Blown'

export type TradingAccount = {
  id: string
  user_id: string
  name: string
  broker: string | null
  currency: string
  starting_balance: number
  status: TradingAccountStatus
  blown_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type AccountEvent = {
  id: string
  account_id: string
  user_id: string
  event_type: AccountEventType
  amount: number
  occurred_at: string
  note: string | null
  created_at: string
}

export type AccountSnapshot = TradingAccount & {
  events: AccountEvent[]
  trades: Trade[]
  deposits: number
  withdrawals: number
  livePnl: number
  currentBalance: number
}

export async function fetchTradingAccounts() {
  const { data, error } = await supabase
    .from('trading_accounts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as TradingAccount[]
}

export async function fetchAccountSnapshots() {
  const [accountsResult, eventsResult, tradesResult] = await Promise.all([
    supabase.from('trading_accounts').select('*').order('created_at', { ascending: false }),
    supabase.from('account_events').select('*').order('occurred_at', { ascending: false }),
    supabase.from('trades').select('*').eq('trade_mode', 'Live').not('account_id', 'is', null),
  ])

  if (accountsResult.error) throw accountsResult.error
  if (eventsResult.error) throw eventsResult.error
  if (tradesResult.error) throw tradesResult.error

  const events = (eventsResult.data ?? []) as AccountEvent[]
  const trades = (tradesResult.data ?? []) as Trade[]

  return ((accountsResult.data ?? []) as TradingAccount[]).map((account) => {
    const accountEvents = events.filter((event) => event.account_id === account.id)
    const accountTrades = trades.filter((trade) => trade.account_id === account.id)
    const deposits = accountEvents
      .filter((event) => event.event_type === 'Deposit')
      .reduce((sum, event) => sum + Number(event.amount), 0)
    const withdrawals = accountEvents
      .filter((event) => event.event_type === 'Withdrawal')
      .reduce((sum, event) => sum + Number(event.amount), 0)
    const livePnl = accountTrades.reduce((sum, trade) => sum + Number(trade.pnl_amount ?? 0), 0)

    return {
      ...account,
      events: accountEvents,
      trades: accountTrades,
      deposits,
      withdrawals,
      livePnl,
      currentBalance: Number(account.starting_balance) + deposits - withdrawals + livePnl,
    }
  })
}
