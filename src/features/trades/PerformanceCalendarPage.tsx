import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { fetchAccountSnapshots } from '../accounts/accounts'
import type { AccountSnapshot } from '../accounts/accounts'
import { useSession } from '../auth/useSession'
import type { Trade } from './types'

type CalendarMode = 'Live' | 'Backtest'

type CalendarDay = {
  date: Date
  key: string
  trades: Trade[]
  totalR: number
  totalPnl: number
  wins: number
  losses: number
}

function getLocalDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

async function fetchCalendarTrades(month: Date, mode: CalendarMode, accountId: string) {
  const start = startOfMonth(month).toISOString()
  const end = endOfMonth(month).toISOString()

  let query = supabase
    .from('trades')
    .select('*')
    .eq('trade_mode', mode)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
    .limit(1000)

  if (mode === 'Live' && accountId !== 'all') {
    query = query.eq('account_id', accountId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Trade[]
}

function formatR(value: number) {
  const rounded = Math.round(value * 100) / 100
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(Number.isInteger(rounded) ? 0 : 2)}R`
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function accountBasis(account: AccountSnapshot) {
  return Number(account.starting_balance) + account.deposits
}

function parseOutcome(value: string) {
  const parsed = Number(value.trim().replace(/r$/i, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function PerformanceCalendarPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<CalendarMode>(
    () => (localStorage.getItem('preferred_trade_mode') as CalendarMode) || 'Live',
  )
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date()))
  const [selectedAccountId, setSelectedAccountId] = useState(() => localStorage.getItem('calendar_account_id') || 'all')
  const [outcomeInput, setOutcomeInput] = useState('')

  const accountsQuery = useQuery({ queryKey: ['accounts', 'snapshots'], queryFn: fetchAccountSnapshots })
  const accounts = accountsQuery.data ?? []
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null
  const currency = selectedAccount?.currency ?? accounts[0]?.currency ?? 'USD'
  const liveBasis =
    selectedAccount != null
      ? accountBasis(selectedAccount)
      : accounts
          .filter((account) => account.currency === currency && account.status !== 'Archived')
          .reduce((sum, account) => sum + accountBasis(account), 0)

  const tradesQuery = useQuery({
    queryKey: ['trades', 'calendar', mode, getLocalDateKey(visibleMonth), selectedAccountId],
    queryFn: () => fetchCalendarTrades(visibleMonth, mode, selectedAccountId),
  })

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const byDay = new Map<string, Trade[]>()
    for (const trade of tradesQuery.data ?? []) {
      const key = getLocalDateKey(new Date(trade.date))
      const trades = byDay.get(key) ?? []
      trades.push(trade)
      byDay.set(key, trades)
    }

    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(visibleMonth)),
      end: endOfWeek(endOfMonth(visibleMonth)),
    })

    return days.map((date) => {
      const key = getLocalDateKey(date)
      const trades = byDay.get(key) ?? []
      return {
        date,
        key,
        trades,
        totalR: trades.reduce((sum, trade) => sum + (trade.r_factor ?? 0), 0),
        totalPnl: trades.reduce((sum, trade) => sum + (trade.pnl_amount ?? 0), 0),
        wins: trades.filter((trade) => trade.is_win).length,
        losses: trades.filter((trade) => trade.is_loss).length,
      }
    })
  }, [tradesQuery.data, visibleMonth])

  const selectedDay = calendarDays.find((day) => day.key === selectedDate)
  const monthlyStats = useMemo(() => {
    const daysInMonth = calendarDays.filter((day) => isSameMonth(day.date, visibleMonth))
    const activeDays = daysInMonth.filter((day) => day.trades.length > 0)
    const resultForDay = (day: CalendarDay) => (mode === 'Live' ? day.totalPnl : day.totalR)
    const totalPnl = activeDays.reduce((sum, day) => sum + day.totalPnl, 0)
    const totalR = activeDays.reduce((sum, day) => sum + day.totalR, 0)
    const monthPercent = mode === 'Live' && liveBasis > 0 ? (totalPnl / liveBasis) * 100 : null
    return {
      activeDays: activeDays.length,
      greenDays: activeDays.filter((day) => resultForDay(day) > 0).length,
      redDays: activeDays.filter((day) => resultForDay(day) < 0).length,
      totalPnl,
      totalR,
      monthPercent,
      trades: activeDays.reduce((sum, day) => sum + day.trades.length, 0),
    }
  }, [calendarDays, liveBasis, mode, visibleMonth])

  const quickAddMutation = useMutation({
    mutationFn: async (outcome: number) => {
      if (!session) throw new Error('Not signed in')
      if (mode === 'Live' && selectedAccountId === 'all') {
        throw new Error('Choose one live account before adding a live PnL entry.')
      }

      const tradeDate = new Date(`${selectedDate}T12:00:00`)
      const isLive = mode === 'Live'
      const payload = {
        user_id: session.user.id,
        date: tradeDate.toISOString(),
        day_of_week: format(tradeDate, 'EEEE'),
        trade_mode: mode,
        account_id: isLive ? selectedAccountId : null,
        coin_pair: isLive ? 'Live Quick PnL' : 'Backtest',
        session: null,
        strategy_type: isLive ? 'Quick PnL' : 'Quick RR',
        timeframe: 'N/A',
        position_type: 'Long' as const,
        range_percentage: null,
        risk_percentage: null,
        is_win: outcome > 0,
        is_loss: outcome < 0,
        limit_level: null,
        pnl_amount: isLive ? outcome : null,
        r_factor: isLive ? null : outcome,
        rr_ratio: null,
        total_fees: null,
        macro_notes: null,
        setup_details: null,
        setup_checklist: null,
        lessons_learned: null,
        screenshot_url: null,
      }

      const { error } = await supabase.from('trades').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      setOutcomeInput('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trades'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      const { error } = await supabase.from('trades').delete().eq('id', tradeId)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trades'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    },
  })

  function submitQuickOutcome(value: string) {
    const parsed = parseOutcome(value)
    if (parsed == null || parsed === 0) return
    quickAddMutation.mutate(parsed)
  }

  const selectedResult = mode === 'Live' ? selectedDay?.totalPnl ?? 0 : selectedDay?.totalR ?? 0
  const selectedPercent = mode === 'Live' && liveBasis > 0 ? ((selectedDay?.totalPnl ?? 0) / liveBasis) * 100 : null

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300">
              {mode === 'Live' ? 'Live Performance' : 'Backtest Performance'}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">
              {mode === 'Live' ? 'Live PnL Calendar' : 'RR Calendar'}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {mode === 'Live'
                ? 'Live mode uses your account PnL and percentage gain/loss.'
                : 'Backtest mode uses R outcomes so practice data stays separate.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
              {(['Live', 'Backtest'] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => {
                    setMode(nextMode)
                    localStorage.setItem('preferred_trade_mode', nextMode)
                  }}
                  className={[
                    'rounded-md px-4 py-2 text-sm font-semibold transition',
                    mode === nextMode ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
                  ].join(' ')}
                >
                  {nextMode}
                </button>
              ))}
            </div>

            {mode === 'Live' && (
              <select
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:border-purple-500/50 focus:ring-4"
                value={selectedAccountId}
                onChange={(event) => {
                  setSelectedAccountId(event.target.value)
                  localStorage.setItem('calendar_account_id', event.target.value)
                }}
              >
                <option value="all">All live accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} {account.status === 'Blown' ? '(blown)' : ''}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
            >
              Previous
            </button>
            <div className="min-w-36 text-center text-sm font-bold text-zinc-100">{format(visibleMonth, 'MMMM yyyy')}</div>
            <button
              type="button"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            >
              Next
            </button>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          {
            label: mode === 'Live' ? 'Month PnL' : 'Month Result',
            value: mode === 'Live' ? money(monthlyStats.totalPnl, currency) : formatR(monthlyStats.totalR),
            tone: (mode === 'Live' ? monthlyStats.totalPnl : monthlyStats.totalR) >= 0 ? 'green' : 'red',
          },
          {
            label: mode === 'Live' ? 'Month Gain' : 'Trades Logged',
            value: mode === 'Live' ? formatPercent(monthlyStats.monthPercent) : monthlyStats.trades,
            tone: 'neutral',
          },
          { label: 'Green Days', value: monthlyStats.greenDays, tone: 'green' },
          { label: 'Red Days', value: monthlyStats.redDays, tone: 'red' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{stat.label}</div>
            <div
              className={[
                'mt-3 text-3xl font-bold tabular-nums',
                stat.tone === 'green' ? 'text-emerald-300' : stat.tone === 'red' ? 'text-rose-300' : 'text-zinc-100',
              ].join(' ')}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      <main className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/50 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="px-2 py-3">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const isSelected = day.key === selectedDate
              const isCurrentMonth = isSameMonth(day.date, visibleMonth)
              const hasTrades = day.trades.length > 0
              const result = mode === 'Live' ? day.totalPnl : day.totalR
              const dayPercent = mode === 'Live' && liveBasis > 0 ? (day.totalPnl / liveBasis) * 100 : null
              const tone =
                result > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : result < 0
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-300'

              return (
                <button
                  key={day.key}
                  type="button"
                  className={[
                    'min-h-20 min-w-0 overflow-hidden border p-2 text-left transition hover:bg-zinc-900/70 sm:min-h-28 sm:p-3',
                    tone,
                    isSelected ? 'ring-2 ring-purple-400 ring-inset' : '',
                    isCurrentMonth ? '' : 'opacity-35',
                  ].join(' ')}
                  onClick={() => setSelectedDate(day.key)}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="text-sm font-bold text-zinc-100">{format(day.date, 'd')}</span>
                    {hasTrades && (
                      <span className="min-w-0 truncate text-[10px] text-zinc-500">{day.trades.length} trades</span>
                    )}
                  </div>
                  {hasTrades && (
                    <div className="mt-3 min-w-0 sm:mt-5">
                      <div className="w-full min-w-0 truncate text-sm font-black tabular-nums leading-tight sm:text-xl">
                        {mode === 'Live' ? money(day.totalPnl, currency) : formatR(day.totalR)}
                      </div>
                      <div className="mt-1 w-full min-w-0 truncate text-[11px] leading-tight text-zinc-500">
                        {mode === 'Live' ? formatPercent(dayPercent) : `${day.wins}W / ${day.losses}L`}
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Selected Day</div>
              <div className="mt-1 text-xl font-bold text-zinc-100">
                {format(new Date(`${selectedDate}T12:00:00`), 'MMM d, yyyy')}
              </div>
            </div>
            <div
              className={[
                'rounded-lg px-2 py-1 text-sm font-bold tabular-nums',
                selectedResult > 0
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : selectedResult < 0
                    ? 'bg-rose-500/10 text-rose-300'
                    : 'bg-zinc-800 text-zinc-300',
              ].join(' ')}
            >
              {mode === 'Live' ? money(selectedResult, currency) : formatR(selectedResult)}
            </div>
          </div>

          {mode === 'Live' && <div className="mt-2 text-sm text-zinc-500">{formatPercent(selectedPercent)} for the day</div>}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              submitQuickOutcome(outcomeInput)
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
              inputMode="decimal"
              placeholder={mode === 'Live' ? '+120 or -35' : '+4R or -1R'}
              value={outcomeInput}
              onChange={(event) => setOutcomeInput(event.target.value)}
            />
            <button
              type="submit"
              disabled={quickAddMutation.isPending}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
            >
              Add
            </button>
          </form>

          {mode === 'Backtest' && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {['-1', '+1', '+2', '+4'].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800"
                  onClick={() => submitQuickOutcome(value)}
                >
                  {value}R
                </button>
              ))}
            </div>
          )}

          {mode === 'Live' && selectedAccountId === 'all' && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Choose one account to quick-add live PnL. Viewing all accounts is read-only.
            </div>
          )}

          {(quickAddMutation.error || deleteMutation.error || tradesQuery.error || accountsQuery.error) && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {((quickAddMutation.error || deleteMutation.error || tradesQuery.error || accountsQuery.error) as Error).message}
            </div>
          )}

          <div className="mt-6 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entries</div>
            {tradesQuery.isLoading && <div className="text-sm text-zinc-500">Loading trades...</div>}
            {!tradesQuery.isLoading && (selectedDay?.trades.length ?? 0) === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                No {mode === 'Live' ? 'PnL' : 'R'} entries for this day yet.
              </div>
            )}
            {selectedDay?.trades.map((trade) => {
              const value = mode === 'Live' ? trade.pnl_amount ?? 0 : trade.r_factor ?? 0
              return (
                <div key={trade.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/70 px-3 py-2">
                  <div>
                    <div
                      className={[
                        'font-bold tabular-nums',
                        value > 0 ? 'text-emerald-300' : value < 0 ? 'text-rose-300' : 'text-zinc-300',
                      ].join(' ')}
                    >
                      {mode === 'Live' ? money(value, currency) : formatR(value)}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {format(new Date(trade.date), 'HH:mm')} / {trade.coin_pair}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => {
                      const ok = window.confirm(`Delete this ${mode === 'Live' ? 'PnL' : 'RR'} entry?`)
                      if (ok) deleteMutation.mutate(trade.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
      </main>
    </div>
  )
}
