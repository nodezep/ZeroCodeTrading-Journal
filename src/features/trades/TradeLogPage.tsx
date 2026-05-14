import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useSession } from '../auth/useSession'
import type { Trade } from './types'
import { TradeUpsertDialog } from './TradeUpsertDialog'
import type { TradeUpsertValues } from './tradeSchema'
import { fetchPairPresets, fetchRrPresets, fetchSessionPresets } from '../presets/presets'

type Filters = {
  search: string
  onlyWins: boolean
  onlyLosses: boolean
  position: 'All' | 'Long' | 'Short'
  tradeMode: 'Live' | 'Backtest'
}

async function fetchTrades(filters: Filters) {
  let query = supabase
    .from('trades')
    .select('*')
    .order('date', { ascending: false })
    .limit(200)

  if (filters.onlyWins) query = query.eq('is_win', true)
  if (filters.onlyLosses) query = query.eq('is_loss', true)
  if (filters.position !== 'All') query = query.eq('position_type', filters.position)
  query = query.eq('trade_mode', filters.tradeMode)
  if (filters.search.trim()) {
    const s = filters.search.trim()
    query = query.or(
      [
        `coin_pair.ilike.%${s}%`,
        `strategy_type.ilike.%${s}%`,
        `timeframe.ilike.%${s}%`,
        `day_of_week.ilike.%${s}%`,
        `limit_level.ilike.%${s}%`,
        `macro_notes.ilike.%${s}%`,
        `setup_details.ilike.%${s}%`,
        `lessons_learned.ilike.%${s}%`,
      ].join(','),
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Trade[]
}

export function TradeLogPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<Filters>({
    search: '',
    onlyWins: false,
    onlyLosses: false,
    position: 'All',
    tradeMode: (localStorage.getItem('preferred_trade_mode') as 'Live' | 'Backtest') || 'Live',
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null)
  const [templateDefaults, setTemplateDefaults] = useState<
    Pick<TradeUpsertValues, 'coin_pair' | 'strategy_type' | 'timeframe' | 'position_type'>
  >(() => {
    try {
      const raw = localStorage.getItem('trade_template_defaults')
      if (!raw) {
        return {
          coin_pair: '',
          strategy_type: 'Backtest',
          timeframe: '5m',
          position_type: 'Long' as const,
        }
      }
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed === 'object' &&
        parsed &&
        'coin_pair' in parsed &&
        'strategy_type' in parsed &&
        'timeframe' in parsed &&
        'position_type' in parsed
      ) {
        const p = parsed as {
          coin_pair: string
          strategy_type: string
          timeframe: string
          position_type: 'Long' | 'Short'
        }
        return {
          coin_pair: typeof p.coin_pair === 'string' ? p.coin_pair : '',
          strategy_type:
            typeof p.strategy_type === 'string' && p.strategy_type.trim()
              ? p.strategy_type
              : 'Backtest',
          timeframe: typeof p.timeframe === 'string' ? p.timeframe : '5m',
          position_type: p.position_type === 'Short' ? 'Short' : 'Long',
        }
      }
      return { coin_pair: '', strategy_type: 'Backtest', timeframe: '5m', position_type: 'Long' as const }
    } catch {
      return { coin_pair: '', strategy_type: 'Backtest', timeframe: '5m', position_type: 'Long' as const }
    }
  })

  const queryKey = useMemo(() => ['trades', filters] as const, [filters])
  const tradesQuery = useQuery({ queryKey, queryFn: () => fetchTrades(filters) })
  const pairPresetsQuery = useQuery({ queryKey: ['presets', 'pairs'], queryFn: fetchPairPresets })
  const sessionPresetsQuery = useQuery({
    queryKey: ['presets', 'sessions'],
    queryFn: fetchSessionPresets,
  })
  const rrPresetsQuery = useQuery({ queryKey: ['presets', 'rr'], queryFn: fetchRrPresets })

  const stats = useMemo(() => {
    const trades = tradesQuery.data ?? []
    const totalTrades = trades.length
    const wins = trades.filter((t) => t.is_win).length
    const losses = trades.filter((t) => t.is_loss).length
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl_amount ?? 0), 0)
    return { totalTrades, wins, losses, winRate, totalPnl }
  }, [tradesQuery.data])

  const upsertMutation = useMutation({
    mutationFn: async (values: TradeUpsertValues) => {
      if (!session) throw new Error('Not signed in')
      const dateIso = new Date(`${values.date}T${values.time}:00`).toISOString()
      const dayOfWeek = format(new Date(`${values.date}T${values.time}:00`), 'EEEE')
      const tradeMode = values.trade_mode
      const rFactor = values.r_factor ?? null
      const derivedWin = tradeMode === 'Backtest' && rFactor != null ? rFactor > 0 : values.is_win
      const derivedLoss = tradeMode === 'Backtest' && rFactor != null ? rFactor < 0 : values.is_loss

      // Only send columns that exist in `public.trades`
      const payload = {
        user_id: session.user.id,
        date: dateIso,
        day_of_week: dayOfWeek,
        trade_mode: tradeMode,
        coin_pair: values.coin_pair,
        session: tradeMode === 'Live' ? values.session : null,
        strategy_type: values.strategy_type,
        timeframe: values.timeframe,
        position_type: values.position_type,
        range_percentage: values.range_percentage,
        risk_percentage: tradeMode === 'Live' ? values.risk_percentage : null,
        is_win: derivedWin,
        is_loss: derivedLoss,
        limit_level: values.limit_level,
        pnl_amount: tradeMode === 'Live' ? values.pnl_amount : null,
        r_factor: rFactor,
        rr_ratio: tradeMode === 'Live' ? values.rr_ratio : null,
        total_fees: tradeMode === 'Live' ? values.total_fees : null,
        macro_notes: values.macro_notes,
        setup_details: values.setup_details,
        setup_checklist: values.setup_checklist,
        lessons_learned: values.lessons_learned,
        screenshot_url: values.screenshot_url,
      }

      if (activeTrade) {
        const { error } = await supabase.from('trades').update(payload).eq('id', activeTrade.id)
        if (error) throw error
        return
      }

      const { error } = await supabase.from('trades').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trades'] })
      setDialogOpen(false)
      setActiveTrade(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      const { error } = await supabase.from('trades').delete().eq('id', tradeId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trades'] })
    },
  })

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 transition-all duration-300">
      <nav className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex gap-6">
          <a href="/" className="text-sm font-medium text-zinc-100 hover:text-purple-400 transition-colors">Journal</a>
          <a href="/plan" className="text-sm font-medium text-zinc-500 hover:text-purple-400 transition-colors">Daily Plan</a>
          <a href="/settings" className="text-sm font-medium text-zinc-500 hover:text-purple-400 transition-colors">Settings</a>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{session?.user?.email}</span>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="text-xs font-bold text-zinc-500 hover:text-rose-400 transition-colors uppercase tracking-wider"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            {filters.tradeMode} Trade Log
          </h1>
          <p className="text-sm text-zinc-500">
            {filters.tradeMode === 'Live'
              ? 'Track your real-time execution and performance.'
              : 'Deep dive into your backtesting sessions and data.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-zinc-900/50 p-1 border border-zinc-800">
            {(['Live', 'Backtest'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setFilters((f) => ({ ...f, tradeMode: type }))
                  localStorage.setItem('preferred_trade_mode', type)
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  filters.tradeMode === type
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <button
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:bg-purple-500 hover:-translate-y-0.5 transition-all active:translate-y-0"
            type="button"
            onClick={() => {
              setActiveTrade(null)
              setDialogOpen(true)
            }}
          >
            New Trade
          </button>
        </div>
      </header>

      <section className="mt-8 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:grid-cols-4 ring-1 ring-white/5 backdrop-blur-md">
        <label className="sm:col-span-2">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Global Search</div>
          <div className="relative mt-2">
            <input
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-4 focus:border-purple-500/50 transition-all pl-10"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Pairs, strategies, or notes..."
            />
            <svg className="absolute left-3.5 top-3 w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </label>

        <label>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Position</div>
          <select
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-4 focus:border-purple-500/50 transition-all"
            value={filters.position}
            onChange={(e) =>
              setFilters((f) => ({ ...f, position: e.target.value as Filters['position'] }))
            }
          >
            <option value="All">All Directions</option>
            <option value="Long">Long Only</option>
            <option value="Short">Short Only</option>
          </select>
        </label>

        <div className="flex items-end gap-3 pb-1">
          <label className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-400 cursor-pointer hover:bg-zinc-900 transition-all min-w-[80px]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-0"
              checked={filters.onlyWins}
              onChange={(e) => setFilters((f) => ({ ...f, onlyWins: e.target.checked }))}
            />
            <span className="truncate">Wins</span>
          </label>
          <label className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-400 cursor-pointer hover:bg-zinc-900 transition-all min-w-[80px]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-0"
              checked={filters.onlyLosses}
              onChange={(e) => setFilters((f) => ({ ...f, onlyLosses: e.target.checked }))}
            />
            <span className="truncate">Losses</span>
          </label>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Profit/Loss', value: stats.totalPnl.toFixed(2), trend: stats.totalPnl >= 0 ? 'up' : 'down' },
          { label: 'Success Rate', value: `${stats.winRate.toFixed(1)}%`, trend: 'neutral' },
          { label: 'W / L Ratio', value: `${stats.wins} : ${stats.losses}`, trend: 'neutral' },
          { label: 'Sample Size', value: stats.totalTrades, trend: 'neutral' },
        ].map((stat, i) => (
          <div key={i} className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/20 p-5 backdrop-blur-sm transition-all hover:bg-zinc-900/40">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{stat.label}</div>
            <div className="mt-3 text-3xl font-bold tabular-nums text-zinc-100">{stat.value}</div>
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 opacity-5 transition-transform group-hover:scale-110 ${
              stat.trend === 'up' ? 'text-emerald-500' : stat.trend === 'down' ? 'text-rose-500' : 'text-purple-500'
            }`}>
               <svg fill="currentColor" viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"/></svg>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/10 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-900/50 text-[10px] uppercase tracking-widest font-bold text-zinc-500">
              <tr>
                <th className="px-6 py-4">Execution Date</th>
                <th className="px-6 py-4">Asset Pair</th>
                <th className="px-6 py-4">Direction</th>
                <th className="px-6 py-4 text-center">RR</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Net PnL</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {tradesQuery.isLoading && (
                <tr>
                  <td className="px-4 py-6 text-zinc-600 dark:text-zinc-400" colSpan={9}>
                    Loading trades…
                  </td>
                </tr>
              )}
              {tradesQuery.isError && (
                <tr>
                  <td className="px-4 py-6 text-red-600 dark:text-red-300" colSpan={9}>
                    {(tradesQuery.error as Error).message}
                  </td>
                </tr>
              )}
              {(tradesQuery.data ?? []).map((t) => {
                const isWin = t.is_win
                const isLoss = t.is_loss
                const resultLabel = isWin ? 'Win' : isLoss ? 'Loss' : '—'
                const resultClass = isWin
                  ? 'text-emerald-600 dark:text-emerald-300'
                  : isLoss
                    ? 'text-red-600 dark:text-red-300'
                    : 'text-zinc-700 dark:text-zinc-300'
                const dateLabel = t.date ? format(new Date(t.date), 'yyyy-MM-dd') : '—'
                const timeLabel = t.date ? format(new Date(t.date), 'HH:mm') : '—'

                return (
                  <tr
                    key={t.id}
                    className="group cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => {
                      setActiveTrade(t)
                      setDialogOpen(true)
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-zinc-100 font-medium">{dateLabel}</span>
                        <span className="text-[10px] text-zinc-500 tabular-nums uppercase">{timeLabel} • {t.day_of_week}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-zinc-100 font-bold tracking-tight">{t.coin_pair}</span>
                        <span className="text-[10px] text-zinc-500 uppercase">{t.timeframe} • {t.strategy_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset ${
                        t.position_type === 'Long' 
                          ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 ring-rose-500/20'
                      }`}>
                        {t.position_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="tabular-nums font-medium text-zinc-100">{t.r_factor ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-bold ${resultClass}`}>
                        {resultLabel}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right tabular-nums font-bold ${
                      (t.pnl_amount ?? 0) > 0 ? 'text-emerald-400' : (t.pnl_amount ?? 0) < 0 ? 'text-rose-400' : 'text-zinc-400'
                    }`}>
                      {t.pnl_amount ? `${t.pnl_amount > 0 ? '+' : ''}${t.pnl_amount.toFixed(2)}` : '0.00'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                        onClick={(e) => {
                          e.stopPropagation()
                          const ok = window.confirm('Permanently delete this record?')
                          if (ok) deleteMutation.mutate(t.id)
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!tradesQuery.isLoading && (tradesQuery.data?.length ?? 0) === 0 && (
                <tr>
                  <td className="px-4 py-10 text-zinc-600 dark:text-zinc-400" colSpan={9}>
                    <div className="flex flex-col gap-3">
                      <div>No trades yet.</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">
                        Click <span className="text-zinc-900 dark:text-zinc-200">Add trade</span> to journal your
                        backtest as you go.
                      </div>
                      <div>
                        <button
                          className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400"
                          type="button"
                          onClick={() => {
                            setActiveTrade(null)
                            setDialogOpen(true)
                          }}
                        >
                          Add your first trade
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <TradeUpsertDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setActiveTrade(null)
        }}
        initialTrade={activeTrade}
        templateDefaults={templateDefaults}
        pairOptions={pairPresetsQuery.data ?? []}
        sessionOptions={sessionPresetsQuery.data ?? []}
        rrOptions={rrPresetsQuery.data ?? []}
        isSubmitting={upsertMutation.isPending}
        onSubmit={async (values) => {
          await upsertMutation.mutateAsync(values)
          if (!activeTrade) {
            const next = {
              coin_pair: values.coin_pair,
              strategy_type: values.strategy_type,
              timeframe: values.timeframe,
              position_type: values.position_type,
            } as const
            setTemplateDefaults(next)
            localStorage.setItem('trade_template_defaults', JSON.stringify(next))
          }
        }}
      />
    </div>
  )
}
