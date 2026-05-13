import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { tradeUpsertSchema } from './tradeSchema'
import type { TradeUpsertValues } from './tradeSchema'
import type { SetupChecklistItem, Trade } from './types'
import type { PresetRow } from '../presets/presets'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

function parseNumberOrNull(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const DEFAULT_CHECKLIST: SetupChecklistItem[] = [
  {
    id: 'trend_bias',
    label: 'Trend bias (bullish/bearish) from structure + trendlines',
    checked: false,
  },
  {
    id: 'impulse_correction_continuation',
    label: 'Impulse → correction → continuation (or reversal) mapped',
    checked: false,
  },
  {
    id: 'support_resistance',
    label: 'Support/Resistance aligned with the model',
    checked: false,
  },
  {
    id: 'break_of_structure',
    label: 'Break/shift of market structure confirms direction',
    checked: false,
  },
  {
    id: 'confirmation_close',
    label: 'Confirmation candle CLOSED (entry confirmation)',
    checked: false,
  },
  {
    id: 'fib_golden_zone',
    label: 'Fibonacci golden zone confluence (with S/R if possible)',
    checked: false,
  },
  {
    id: 'ob_fvg',
    label: 'Order blocks / Fair value gaps for precise entries',
    checked: false,
  },
]

function normalizeChecklist(input: unknown): SetupChecklistItem[] {
  const map = new Map<string, SetupChecklistItem>()

  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Partial<SetupChecklistItem>
      if (typeof item.id !== 'string' || typeof item.label !== 'string') continue
      map.set(item.id, {
        id: item.id,
        label: item.label,
        checked: !!item.checked,
      })
    }
  }

  return DEFAULT_CHECKLIST.map((d) => map.get(d.id) ?? d)
}

export function TradeUpsertDialog({
  open,
  onClose,
  initialTrade,
  onSubmit,
  isSubmitting,
  templateDefaults,
  pairOptions,
  sessionOptions,
}: {
  open: boolean
  onClose: () => void
  initialTrade: Trade | null
  onSubmit: (values: TradeUpsertValues) => Promise<void> | void
  isSubmitting: boolean
  templateDefaults: Pick<TradeUpsertValues, 'coin_pair' | 'strategy_type' | 'timeframe' | 'position_type'>
  pairOptions: PresetRow[]
  sessionOptions: PresetRow[]
}) {
  const queryClient = useQueryClient()
  const form = useForm<TradeUpsertValues>({
    resolver: zodResolver(tradeUpsertSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm'),
      coin_pair: templateDefaults.coin_pair,
      session: null,
      strategy_type: templateDefaults.strategy_type,
      timeframe: templateDefaults.timeframe,
      position_type: templateDefaults.position_type,
      range_percentage: null,
      risk_percentage: null,
      is_win: false,
      is_loss: false,
      limit_level: null,
      pnl_amount: null,
      r_factor: null,
      rr_ratio: null,
      total_fees: null,
      macro_notes: null,
      setup_details: null,
      setup_checklist: normalizeChecklist(null),
      lessons_learned: null,
      screenshot_url: null,
      
      // New fields
      journal_type: (localStorage.getItem('preferred_journal_type') as 'Live' | 'Backtest') || 'Live',
      entry_price: null,
      stop_loss: null,
      take_profit: null,
      setup_grade: null,
      mistakes: [],
      confluence_count: null,
    },
  })

  useEffect(() => {
    if (!open) return
    if (!initialTrade) {
      form.reset({
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm'),
        coin_pair: templateDefaults.coin_pair,
        session: null,
        strategy_type: templateDefaults.strategy_type,
        timeframe: templateDefaults.timeframe,
        position_type: templateDefaults.position_type,
        range_percentage: null,
        risk_percentage: null,
        is_win: false,
        is_loss: false,
        limit_level: null,
        pnl_amount: null,
        r_factor: null,
        rr_ratio: null,
        total_fees: null,
        macro_notes: null,
        setup_details: null,
        setup_checklist: normalizeChecklist(null),
        lessons_learned: null,
        screenshot_url: null,
      })
      return
    }

    const d = new Date(initialTrade.date)
    form.reset({
      date: format(d, 'yyyy-MM-dd'),
      time: format(d, 'HH:mm'),
      coin_pair: initialTrade.coin_pair ?? '',
      strategy_type: initialTrade.strategy_type ?? '',
      timeframe: initialTrade.timeframe ?? '5m',
      position_type: initialTrade.position_type,
      range_percentage: initialTrade.range_percentage ?? null,
      risk_percentage: initialTrade.risk_percentage ?? null,
      is_win: initialTrade.is_win,
      is_loss: initialTrade.is_loss,
      limit_level: initialTrade.limit_level ?? null,
      pnl_amount: initialTrade.pnl_amount ?? null,
      r_factor: initialTrade.r_factor ?? null,
      rr_ratio: initialTrade.rr_ratio ?? null,
      total_fees: initialTrade.total_fees ?? null,
      macro_notes: initialTrade.macro_notes ?? null,
      setup_details: initialTrade.setup_details ?? null,
      setup_checklist: normalizeChecklist(initialTrade.setup_checklist),
      lessons_learned: initialTrade.lessons_learned ?? null,
      screenshot_url: initialTrade.screenshot_url ?? null,
      journal_type: initialTrade.journal_type ?? 'Live',
      entry_price: initialTrade.entry_price ?? null,
      stop_loss: initialTrade.stop_loss ?? null,
      take_profit: initialTrade.take_profit ?? null,
      setup_grade: initialTrade.setup_grade ?? null,
      mistakes: initialTrade.mistakes ?? [],
      confluence_count: initialTrade.confluence_count ?? null,
    })
  }, [form, initialTrade, open, templateDefaults])

  // Auto-calculation logic
  const entryPrice = form.watch('entry_price')
  const stopLoss = form.watch('stop_loss')
  const takeProfit = form.watch('take_profit')
  const posType = form.watch('position_type')

  useEffect(() => {
    if (entryPrice && stopLoss && takeProfit) {
      const risk = Math.abs(entryPrice - stopLoss)
      const reward = Math.abs(takeProfit - entryPrice)
      if (risk > 0) {
        const rr = reward / risk
        form.setValue('r_factor', Number(rr.toFixed(2)))
        form.setValue('rr_ratio', `1:${rr.toFixed(1)}`)
      }
    }
  }, [entryPrice, stopLoss, takeProfit, posType, form])

  const checklist = form.watch('setup_checklist') ?? normalizeChecklist(null)
  const checklistDoneCount = checklist.reduce((count, item) => count + (item.checked ? 1 : 0), 0)
  const checklistTotal = checklist.length
  const checklistComplete = checklistTotal > 0 && checklistDoneCount === checklistTotal

  if (!open) return null

  async function quickAddPreset(
    table: 'pair_presets' | 'session_presets' | 'rr_presets',
    label: string,
  ) {
    const cleaned = label.trim().replace(/\s+/g, ' ')
    if (!cleaned) return
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) throw new Error('Not signed in')

    const { error } = await supabase.from(table).insert({ user_id: userId, label: cleaned })
    if (error) throw error

    const key =
      table === 'pair_presets'
        ? (['presets', 'pairs'] as const)
        : table === 'session_presets'
          ? (['presets', 'sessions'] as const)
          : (['presets', 'rr'] as const)
    await queryClient.invalidateQueries({ queryKey: key })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/90 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">
              {initialTrade ? 'Update Trade Record' : 'Journal New Trade'}
            </h2>
            <div className="flex rounded-md bg-zinc-900 p-1 border border-zinc-800">
              {(['Live', 'Backtest'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => form.setValue('journal_type', type)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    form.watch('journal_type') === type
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          className="max-h-[85vh] overflow-y-auto p-6 space-y-8"
          onSubmit={form.handleSubmit(async (values) => onSubmit(values))}
        >
          {/* Section 1: Core Trade Info */}
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-4 sm:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-zinc-400">Date & Time</span>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-2 focus:border-purple-500/50 transition-all"
                      type="date"
                      {...form.register('date')}
                    />
                    <input
                      className="w-2/3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-2 focus:border-purple-500/50 transition-all"
                      type="time"
                      {...form.register('time')}
                    />
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="text-zinc-400">Coin pair</span>
                  <div className="mt-1.5 flex gap-2">
                    <select
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-2 focus:border-purple-500/50 transition-all"
                      value={form.watch('coin_pair')}
                      onChange={async (e) => {
                        const v = e.target.value
                        if (v === '__add__') {
                          const label = window.prompt('Add a new pair (e.g. BTC/USDT):')
                          if (!label) return
                          try {
                            await quickAddPreset('pair_presets', label)
                            form.setValue('coin_pair', label.trim())
                          } catch (err) { alert((err as Error).message) }
                          return
                        }
                        form.setValue('coin_pair', v)
                      }}
                    >
                      <option value="" disabled>Select pair…</option>
                      {pairOptions.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
                      <option value="__add__">+ Add new…</option>
                    </select>
                  </div>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="text-zinc-400">Position Type</span>
                  <div className="mt-1.5 flex p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                    {(['Long', 'Short'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => form.setValue('position_type', type)}
                        className={`flex-1 py-1 text-xs font-medium rounded transition-all ${
                          form.watch('position_type') === type
                            ? type === 'Long' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="text-zinc-400">Session</span>
                  <select
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-2 focus:border-purple-500/50 transition-all"
                    value={form.watch('session') ?? ''}
                    onChange={(e) => form.setValue('session', e.target.value || null)}
                  >
                    <option value="">Select session…</option>
                    {sessionOptions.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
                    <option value="London">London</option>
                    <option value="New York">New York</option>
                    <option value="Asia">Asia</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-zinc-400">Risk %</span>
                  <input
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 focus:ring-2 focus:border-purple-500/50 transition-all"
                    placeholder="1.0"
                    type="number"
                    step="0.1"
                    {...form.register('risk_percentage', { valueAsNumber: true })}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center space-y-4">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Trade Result</span>
              <div className="flex justify-center gap-4">
                <button
                  type="button"
                  onClick={() => { form.setValue('is_win', true); form.setValue('is_loss', false) }}
                  className={`w-20 py-3 rounded-xl border-2 transition-all ${
                    form.watch('is_win') 
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                      : 'border-zinc-800 bg-zinc-950 text-zinc-600 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xl font-bold">WIN</div>
                </button>
                <button
                  type="button"
                  onClick={() => { form.setValue('is_win', false); form.setValue('is_loss', true) }}
                  className={`w-20 py-3 rounded-xl border-2 transition-all ${
                    form.watch('is_loss') 
                      ? 'bg-rose-500/10 border-rose-500 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]' 
                      : 'border-zinc-800 bg-zinc-950 text-zinc-600 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xl font-bold">LOSS</div>
                </button>
              </div>
              {!form.watch('is_win') && !form.watch('is_loss') && (
                <span className="text-xs text-zinc-500 italic">No result selected</span>
              )}
            </div>
          </div>

          {/* Section 2: Pricing & RR (The "Time Saver") */}
          <div className="grid gap-6 sm:grid-cols-4 bg-zinc-900/20 p-5 rounded-2xl border border-zinc-800/50">
            <label className="block text-sm">
              <span className="text-zinc-500 font-medium">Entry Price</span>
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-500/50 transition-all"
                placeholder="0.00"
                type="number"
                step="any"
                value={form.watch('entry_price') ?? ''}
                onChange={(e) => form.setValue('entry_price', parseNumberOrNull(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-500 font-medium">Stop Loss</span>
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-rose-500/50 transition-all"
                placeholder="0.00"
                type="number"
                step="any"
                value={form.watch('stop_loss') ?? ''}
                onChange={(e) => form.setValue('stop_loss', parseNumberOrNull(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-500 font-medium">Take Profit</span>
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 transition-all"
                placeholder="0.00"
                type="number"
                step="any"
                value={form.watch('take_profit') ?? ''}
                onChange={(e) => form.setValue('take_profit', parseNumberOrNull(e.target.value))}
              />
            </label>
            <div className="flex flex-col justify-end">
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
                <span className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Calculated RR</span>
                <div className="text-lg font-bold text-purple-300">{form.watch('rr_ratio') || '—'}</div>
              </div>
            </div>
          </div>

          {/* Section 3: Analysis & Grading */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/20 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-300">Setup Analysis</h3>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  checklistComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {checklistDoneCount}/{checklistTotal} STEPS
                </div>
              </div>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-3 text-sm group">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="peer h-5 w-5 rounded border-zinc-700 bg-zinc-950 text-purple-500 focus:ring-offset-0 focus:ring-0"
                        checked={item.checked}
                        onChange={(e) => {
                          const next = checklist.map((c, i) => i === idx ? { ...c, checked: e.target.checked } : c)
                          form.setValue('setup_checklist', next, { shouldDirty: true })
                        }}
                      />
                    </div>
                    <span className={`transition-colors ${item.checked ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-400'}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-zinc-400">Setup Grade</span>
                  <div className="mt-1.5 flex gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                    {['A', 'B', 'C', 'D'].map((grade) => (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => form.setValue('setup_grade', grade as any)}
                        className={`flex-1 py-1.5 rounded font-bold transition-all ${
                          form.watch('setup_grade') === grade
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                            : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        {grade}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="text-zinc-400">Confluence Count</span>
                  <input
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                    placeholder="e.g. 4"
                    type="number"
                    value={form.watch('confluence_count') ?? ''}
                    onChange={(e) => form.setValue('confluence_count', parseNumberOrNull(e.target.value))}
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-zinc-400">Mistakes / Patterns</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Fomo', 'Greed', 'Early Exit', 'Revenge', 'Overleverage', 'No SL'].map(mistake => (
                    <button
                      key={mistake}
                      type="button"
                      onClick={() => {
                        const current = form.watch('mistakes') || []
                        const next = current.includes(mistake) 
                          ? current.filter(m => m !== mistake)
                          : [...current, mistake]
                        form.setValue('mistakes', next)
                      }}
                      className={`px-3 py-1 rounded-full border text-xs transition-all ${
                        (form.watch('mistakes') || []).includes(mistake)
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                      }`}
                    >
                      {mistake}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          </div>

          {/* Section 4: Notes & Screenshot */}
          <div className="grid gap-6 sm:grid-cols-2 border-t border-zinc-800 pt-8">
            <label className="block text-sm">
              <span className="text-zinc-400 font-medium">Macro / Session Notes</span>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-purple-500/50 transition-all resize-none"
                placeholder="What did you see in the higher timeframes?"
                value={form.watch('macro_notes') ?? ''}
                onChange={(e) => form.setValue('macro_notes', e.target.value || null)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400 font-medium">Lessons Learned</span>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-purple-500/50 transition-all resize-none"
                placeholder="What will you do differently next time?"
                value={form.watch('lessons_learned') ?? ''}
                onChange={(e) => form.setValue('lessons_learned', e.target.value || null)}
              />
            </label>
          </div>

          <div className="space-y-2 border-t border-zinc-800 pt-6">
            <label className="block text-sm">
              <span className="text-zinc-400 font-medium">Screenshot URL</span>
              <input
                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                placeholder="https://tradingview.com/x/..."
                {...form.register('screenshot_url')}
              />
            </label>
            {form.watch('screenshot_url') && (
              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                <img 
                  src={form.watch('screenshot_url')!} 
                  alt="Trade Screenshot" 
                  className="max-h-[300px] w-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-6">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-bold text-white shadow-lg shadow-purple-500/20 hover:bg-purple-500 hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:translate-y-0"
            >
              {isSubmitting ? 'Saving...' : initialTrade ? 'Update Trade' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
