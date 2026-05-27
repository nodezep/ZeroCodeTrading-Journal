import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isAfter,
  isBefore,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type DailyChecklistItem = { id: string; label: string; checked: boolean }

type DailyPlanRow = {
  date: string
  daily_checklist: DailyChecklistItem[] | null
}

type DashboardMode = 'Backtest' | 'Live'

type TradeRow = {
  date: string
  trade_mode: DashboardMode
  pnl_amount: number | null
  r_factor: number | null
}

function getLocalDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function completionForChecklist(input: unknown): number | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const items = input
    .filter((raw) => raw && typeof raw === 'object')
    .map((raw) => raw as Partial<DailyChecklistItem>)
    .filter((item) => typeof item.id === 'string' && typeof item.label === 'string')
  if (items.length === 0) return null
  const checked = items.filter((item) => !!item.checked).length
  return clamp01(checked / items.length)
}

async function fetchDailyPlansForMonth(month: Date) {
  const start = format(startOfMonth(month), 'yyyy-MM-dd')
  const end = format(endOfMonth(month), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('daily_plans')
    .select('date,daily_checklist')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
    .limit(400)
  if (error) throw error
  return (data ?? []) as DailyPlanRow[]
}

function toneForCompletion(completion: number | null) {
  if (completion == null) return 'bg-zinc-900/30 border-zinc-800 text-zinc-500'
  if (completion >= 1) return 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200'
  if (completion >= 0.8) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
  if (completion >= 0.5) return 'bg-amber-500/10 border-amber-500/20 text-amber-200'
  return 'bg-rose-500/10 border-rose-500/20 text-rose-200'
}

export function DashboardPage() {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const [mode, setMode] = useState<DashboardMode>(
    () => (localStorage.getItem('dashboard_trade_mode') as DashboardMode) || 'Backtest',
  )

  const plansQuery = useQuery({
    queryKey: ['daily_plans', 'month', getLocalDateKey(visibleMonth)],
    queryFn: () => fetchDailyPlansForMonth(visibleMonth),
  })

  const tradesQuery = useQuery({
    queryKey: ['trades', 'dashboard', mode, getLocalDateKey(visibleMonth)],
    queryFn: async () => {
      const start = startOfMonth(visibleMonth).toISOString()
      const end = endOfMonth(visibleMonth).toISOString()
      const { data, error } = await supabase
        .from('trades')
        .select('date,trade_mode,pnl_amount,r_factor')
        .eq('trade_mode', mode)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .limit(2000)
      if (error) throw error
      return (data ?? []) as TradeRow[]
    },
  })

  const byDate = useMemo(() => {
    const map = new Map<string, DailyPlanRow>()
    for (const row of plansQuery.data ?? []) map.set(row.date, row)
    return map
  }, [plansQuery.data])

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(visibleMonth)),
      end: endOfWeek(endOfMonth(visibleMonth)),
    })
  }, [visibleMonth])

  const monthSummary = useMemo(() => {
    const inMonth = days.filter((day) => isSameMonth(day, visibleMonth))
    const completion = inMonth
      .map((day) => completionForChecklist(byDate.get(getLocalDateKey(day))?.daily_checklist ?? null))
      .filter((value): value is number => value != null)
    const avg = completion.length ? completion.reduce((sum, value) => sum + value, 0) / completion.length : null
    const perfect = completion.filter((value) => value >= 1).length
    const good = completion.filter((value) => value >= 0.8).length
    return { avg, perfect, good, trackedDays: completion.length }
  }, [byDate, days, visibleMonth])

  const equityCurve = useMemo(() => {
    const start = startOfMonth(visibleMonth)
    const end = endOfMonth(visibleMonth)

    const byDay = new Map<string, number>()
    for (const trade of tradesQuery.data ?? []) {
      const tradeDate = new Date(trade.date)
      if (isBefore(tradeDate, start) || isAfter(tradeDate, end)) continue
      const key = getLocalDateKey(tradeDate)
      const value = mode === 'Live' ? Number(trade.pnl_amount ?? 0) : Number(trade.r_factor ?? 0)
      byDay.set(key, (byDay.get(key) ?? 0) + (Number.isFinite(value) ? value : 0))
    }

    let cumulative = 0
    return days
      .filter((d) => isSameMonth(d, visibleMonth))
      .map((d) => {
        const key = getLocalDateKey(d)
        cumulative += byDay.get(key) ?? 0
        return { date: format(d, 'MMM d'), value: Math.round(cumulative * 100) / 100 }
      })
  }, [days, mode, tradesQuery.data, visibleMonth])

  const streak = useMemo(() => {
    const today = new Date()
    const sameMonth = format(today, 'yyyy-MM') === format(visibleMonth, 'yyyy-MM')
    if (!sameMonth) return null
    let count = 0
    for (let i = 0; i < 400; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)
      const key = getLocalDateKey(date)
      const completion = completionForChecklist(byDate.get(key)?.daily_checklist ?? null)
      if (completion != null && completion >= 0.8) count++
      else break
    }
    return count
  }, [byDate, visibleMonth])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Dashboard</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Review & motivation</h1>
          <p className="mt-1 text-sm text-zinc-500">See your month at a glance and keep the streak alive.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/plan"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
          >
            Open daily plan
          </a>
          <a
            href="/calendar"
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500"
          >
            Open performance calendar
          </a>
        </div>
      </header>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Daily plan consistency</div>
              <div className="mt-1 text-sm text-zinc-500">
                {format(visibleMonth, 'MMMM yyyy')} • {monthSummary.trackedDays} tracked days
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
                onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
                onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
              >
                Next
              </button>
            </div>
          </div>

          {plansQuery.error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {(plansQuery.error as Error).message}
            </div>
          )}

          <div className="mt-5 grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                {d}
              </div>
            ))}
            {days.map((date) => {
              const key = getLocalDateKey(date)
              const row = byDate.get(key) ?? null
              const completion = completionForChecklist(row?.daily_checklist ?? null)
              const inMonth = isSameMonth(date, visibleMonth)
              return (
                <a
                  key={key}
                  href={`/plan?date=${key}`}
                  title={
                    completion == null
                      ? `${key}: no plan saved`
                      : `${key}: ${Math.round(completion * 100)}% checklist completion`
                  }
                  className={[
                    'rounded-xl border px-2 py-3 text-center text-sm font-semibold tabular-nums transition-colors',
                    toneForCompletion(completion),
                    inMonth ? '' : 'opacity-50',
                    'hover:border-purple-500/40 hover:bg-purple-500/5',
                  ].join(' ')}
                >
                  {format(date, 'd')}
                </a>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
          <div className="text-sm font-semibold text-zinc-100">This month</div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Avg completion</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">
                {monthSummary.avg == null ? '-' : `${Math.round(monthSummary.avg * 100)}%`}
              </div>
              <div className="mt-1 text-xs text-zinc-500">Based on saved daily plans.</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Perfect days</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-200">{monthSummary.perfect}</div>
              <div className="mt-1 text-xs text-zinc-500">100% checklist completion.</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Good days</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-amber-200">{monthSummary.good}</div>
              <div className="mt-1 text-xs text-zinc-500">80%+ completion.</div>
            </div>
            {streak != null && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-purple-200/80">Current streak</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-purple-100">{streak} days</div>
                <div className="mt-1 text-xs text-purple-100/70">80%+ checklist completion.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-100">Equity curve</div>
            <div className="mt-1 text-sm text-zinc-500">
              {mode === 'Live' ? 'Cumulative PnL' : 'Cumulative R'} for {format(visibleMonth, 'MMMM yyyy')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['Backtest', 'Live'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  mode === value
                    ? 'bg-purple-600 text-white'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900',
                ].join(' ')}
                onClick={() => {
                  setMode(value)
                  localStorage.setItem('dashboard_trade_mode', value)
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {(tradesQuery.error as Error | undefined) && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {(tradesQuery.error as Error).message}
          </div>
        )}

        <div className="mt-5 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve}>
              <CartesianGrid stroke="rgba(63,63,70,0.5)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'rgba(161,161,170,0.9)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'rgba(161,161,170,0.9)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(9,9,11,0.95)',
                  border: '1px solid rgba(63,63,70,0.8)',
                  borderRadius: 12,
                  color: 'rgba(244,244,245,0.95)',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="rgba(168,85,247,0.9)"
                fill="rgba(168,85,247,0.18)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
