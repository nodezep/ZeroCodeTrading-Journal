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
      const payload = {
        ...values,
        time: undefined,
        date: dateIso,
        day_of_week: dayOfWeek,
        user_id: session.user.id,
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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Master Trade Log</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Your last 200 trades (MVP)</p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400"
            type="button"
            onClick={() => {
              setActiveTrade(null)
              setDialogOpen(true)
            }}
          >
            Add trade
          </button>
          <a
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
            href="/plan"
          >
            Daily plan
          </a>
          <a
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
            href="/settings"
          >
            Settings
          </a>
          <button
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
            type="button"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900/20">
        <label className="sm:col-span-2">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Search</div>
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="coin pair, strategy, notes…"
          />
        </label>

        <label>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Position</div>
          <select
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
            value={filters.position}
            onChange={(e) =>
              setFilters((f) => ({ ...f, position: e.target.value as Filters['position'] }))
            }
          >
            <option value="All">All</option>
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </label>

        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
              checked={filters.onlyWins}
              onChange={(e) => setFilters((f) => ({ ...f, onlyWins: e.target.checked }))}
            />
            Wins
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
              checked={filters.onlyLosses}
              onChange={(e) => setFilters((f) => ({ ...f, onlyLosses: e.target.checked }))}
            />
            Losses
          </label>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Total PnL</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {stats.totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Win rate</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {stats.winRate.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Wins / Losses</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {stats.wins} / {stats.losses}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Trades</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {stats.totalTrades}
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/40 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Pair</th>
                <th className="px-4 py-3">TF</th>
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3 text-right">PnL</th>
                <th className="px-4 py-3 text-right">R</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-900 dark:bg-zinc-950/30">
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
                const posClass =
                  t.position_type === 'Long'
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : 'text-red-600 dark:text-red-300'
                const dateLabel = t.date ? format(new Date(t.date), 'yyyy-MM-dd') : '—'
                const timeLabel = t.date ? format(new Date(t.date), 'HH:mm') : '—'

                return (
                  <tr
                    key={t.id}
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
                    onClick={() => {
                      setActiveTrade(t)
                      setDialogOpen(true)
                    }}
                  >
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-200">{dateLabel}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-200">
                      {timeLabel}
                    </td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-200">{t.coin_pair}</td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-200">{t.timeframe}</td>
                    <td className={`px-4 py-3 font-medium ${posClass}`}>{t.position_type}</td>
                    <td className={`px-4 py-3 font-medium ${resultClass}`}>{resultLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-200">
                      {t.pnl_amount ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <div className="tabular-nums text-zinc-900 dark:text-zinc-200">{t.r_factor ?? '—'}</div>
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            const ok = window.confirm('Delete this trade?')
                            if (!ok) return
                            deleteMutation.mutate(t.id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
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
