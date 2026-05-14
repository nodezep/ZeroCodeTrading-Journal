import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../../lib/supabaseClient'
import type { TradingAccount } from '../accounts/accounts'
import type { PresetRow, RrPresetRow } from '../presets/presets'
import { tradeUpsertSchema } from './tradeSchema'
import type { TradeUpsertValues } from './tradeSchema'
import type { SetupChecklistItem, Trade } from './types'

const DEFAULT_CHECKLIST: SetupChecklistItem[] = [
  { id: 'trend_bias', label: 'Trend bias (structure + trendlines)', checked: false },
  { id: 'impulse_correction_continuation', label: 'Impulse → correction → continuation mapped', checked: false },
  { id: 'support_resistance', label: 'Support/Resistance aligns with the model', checked: false },
  { id: 'break_of_structure', label: 'Break/shift of structure confirms direction', checked: false },
  { id: 'confirmation_close', label: 'Confirmation candle CLOSED', checked: false },
  { id: 'fib_golden_zone', label: 'Fibonacci golden zone confluence', checked: false },
  { id: 'ob_fvg', label: 'Order blocks / Fair value gaps', checked: false },
]

function normalizeChecklist(input: unknown): SetupChecklistItem[] {
  const map = new Map<string, SetupChecklistItem>()
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Partial<SetupChecklistItem>
      if (typeof item.id !== 'string' || typeof item.label !== 'string') continue
      map.set(item.id, { id: item.id, label: item.label, checked: !!item.checked })
    }
  }
  return DEFAULT_CHECKLIST.map((d) => map.get(d.id) ?? d)
}

function parseNumberOrNull(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
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
  rrOptions,
  accountOptions,
}: {
  open: boolean
  onClose: () => void
  initialTrade: Trade | null
  onSubmit: (values: TradeUpsertValues) => Promise<void> | void
  isSubmitting: boolean
  templateDefaults: Pick<TradeUpsertValues, 'coin_pair' | 'strategy_type' | 'timeframe' | 'position_type'>
  pairOptions: PresetRow[]
  sessionOptions: PresetRow[]
  rrOptions: RrPresetRow[]
  accountOptions: TradingAccount[]
}) {
  const queryClient = useQueryClient()

  const form = useForm<TradeUpsertValues>({
    resolver: zodResolver(tradeUpsertSchema),
    defaultValues: {
      trade_mode: 'Live',
      account_id: null,
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
    },
  })

  useEffect(() => {
    if (!open) return
    if (!initialTrade) {
      form.reset({
        trade_mode: 'Live',
        account_id: null,
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
      trade_mode: initialTrade.trade_mode ?? 'Live',
      account_id: initialTrade.account_id ?? null,
      date: format(d, 'yyyy-MM-dd'),
      time: format(d, 'HH:mm'),
      coin_pair: initialTrade.coin_pair ?? '',
      session: initialTrade.session ?? null,
      strategy_type: initialTrade.strategy_type ?? templateDefaults.strategy_type,
      timeframe: initialTrade.timeframe ?? templateDefaults.timeframe,
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
    })
  }, [form, initialTrade, open, templateDefaults])

  const tradeMode = form.watch('trade_mode')
  const checklist = form.watch('setup_checklist') ?? normalizeChecklist(null)
  const doneCount = checklist.reduce((count, item) => count + (item.checked ? 1 : 0), 0)

  async function quickAddPreset(table: 'pair_presets' | 'session_presets' | 'rr_presets', label: string) {
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">
            {initialTrade ? 'Edit trade' : 'Add trade'}
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form
          className="max-h-[80vh] overflow-y-auto p-5"
          onSubmit={form.handleSubmit(async (values) => onSubmit(values))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-zinc-700 dark:text-zinc-300">Mode</span>
              <div className="mt-2 inline-flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-800">
                {(['Live', 'Backtest'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={[
                      'px-3 py-2 text-sm',
                      tradeMode === m
                        ? 'bg-purple-500 text-white'
                        : 'bg-white text-zinc-900 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900',
                    ].join(' ')}
                    onClick={() => form.setValue('trade_mode', m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </label>

            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Date</span>
              <input
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                type="date"
                {...form.register('date')}
              />
            </label>

            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Time</span>
              <input
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                type="time"
                {...form.register('time')}
              />
            </label>

            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Coin pair</span>
              <select
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                value={form.watch('coin_pair')}
                onChange={async (e) => {
                  const v = e.target.value
                  if (v === '__add__') {
                    const label = window.prompt('Add a new pair (e.g. GBP/USD, XAU/USD):')
                    if (!label) return
                    try {
                      await quickAddPreset('pair_presets', label)
                      form.setValue('coin_pair', label.trim())
                    } catch (err) {
                      alert((err as Error).message)
                    }
                    return
                  }
                  form.setValue('coin_pair', v)
                }}
              >
                <option value="" disabled>
                  Select pair…
                </option>
                {pairOptions.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
                <option value="__add__">+ Add new pair…</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Position</span>
              <select
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                {...form.register('position_type')}
              >
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {tradeMode === 'Backtest' ? 'R outcome (R)' : 'Risk:Reward'}
              </span>
              {tradeMode === 'Backtest' ? (
                <input
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                  inputMode="decimal"
                  placeholder="-1, +2, +3.5"
                  value={form.watch('r_factor') ?? ''}
                  onChange={(e) => form.setValue('r_factor', parseNumberOrNull(e.target.value))}
                />
              ) : (
                <select
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                  value={form.watch('rr_ratio') ?? ''}
                  onChange={async (e) => {
                    const label = e.target.value
                    if (label === '__add__') {
                      const next = window.prompt('Add a new R:R (e.g. 1:1, 1:2):')
                      if (!next) return
                      try {
                        await quickAddPreset('rr_presets', next)
                        form.setValue('rr_ratio', next.trim())
                      } catch (err) {
                        alert((err as Error).message)
                      }
                      return
                    }
                    form.setValue('rr_ratio', label || null)
                  }}
                >
                  <option value="">Select R:R…</option>
                  {rrOptions.map((r) => (
                    <option key={r.id} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                  <option value="1:1">1:1</option>
                  <option value="1:2">1:2</option>
                  <option value="1:3">1:3</option>
                  <option value="__add__">+ Add new R:R…</option>
                </select>
              )}
            </label>

            {tradeMode === 'Live' && (
              <label className="block text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">Trading account</span>
                <select
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                  value={form.watch('account_id') ?? ''}
                  onChange={(e) => form.setValue('account_id', e.target.value || null)}
                >
                  <option value="">No account selected</option>
                  {accountOptions
                    .filter((account) => account.status !== 'Archived')
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} {account.status === 'Blown' ? '(blown)' : ''}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {tradeMode === 'Live' && (
              <label className="block text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">Session</span>
                <select
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                  value={form.watch('session') ?? ''}
                  onChange={async (e) => {
                    const v = e.target.value
                    if (v === '__add__') {
                      const label = window.prompt('Add a new session (London / New York / Asia):')
                      if (!label) return
                      try {
                        await quickAddPreset('session_presets', label)
                        form.setValue('session', label.trim())
                      } catch (err) {
                        alert((err as Error).message)
                      }
                      return
                    }
                    form.setValue('session', v ? v : null)
                  }}
                >
                  <option value="">Select session…</option>
                  {sessionOptions.map((s) => (
                    <option key={s.id} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                  <option value="London">London</option>
                  <option value="New York">New York</option>
                  <option value="Asia">Asia</option>
                  <option value="__add__">+ Add new session…</option>
                </select>
              </label>
            )}

            <div className="flex items-end gap-6">
              <div className="flex flex-col gap-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Result</div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="result"
                      className="h-4 w-4 border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900/30"
                      checked={!form.watch('is_win') && !form.watch('is_loss')}
                      onChange={() => {
                        form.setValue('is_win', false)
                        form.setValue('is_loss', false)
                      }}
                    />
                    None
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="result"
                      className="h-4 w-4 border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900/30"
                      checked={form.watch('is_win')}
                      onChange={() => {
                        form.setValue('is_win', true)
                        form.setValue('is_loss', false)
                      }}
                    />
                    <span className="text-emerald-600 dark:text-emerald-300">Win</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="result"
                      className="h-4 w-4 border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900/30"
                      checked={form.watch('is_loss')}
                      onChange={() => {
                        form.setValue('is_loss', true)
                        form.setValue('is_win', false)
                      }}
                    />
                    <span className="text-red-600 dark:text-red-300">Loss</span>
                  </label>
                </div>
                {tradeMode === 'Backtest' && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Tip: you can just enter the R outcome (e.g. -1, +2) and leave result as None.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-zinc-700 dark:text-zinc-300">Macro notes</span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                value={form.watch('macro_notes') ?? ''}
                onChange={(e) => form.setValue('macro_notes', e.target.value ? e.target.value : null)}
              />
            </label>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/10">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Setup checklist</div>
                <div className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
                  {doneCount}/{checklist.length} complete
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {checklist.map((item, idx) => (
                  <label key={item.id} className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900/30"
                      checked={item.checked}
                      onChange={(e) => {
                        const next = checklist.map((c, i) => (i === idx ? { ...c, checked: e.target.checked } : c))
                        form.setValue('setup_checklist', next, { shouldDirty: true })
                      }}
                    />
                    <span className="text-zinc-900 dark:text-zinc-200">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block text-sm sm:col-span-2">
              <span className="text-zinc-700 dark:text-zinc-300">Lessons learned</span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                value={form.watch('lessons_learned') ?? ''}
                onChange={(e) => form.setValue('lessons_learned', e.target.value ? e.target.value : null)}
              />
            </label>
          </div>

          <details className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/10">
            <summary className="cursor-pointer select-none text-sm text-zinc-700 dark:text-zinc-300">
              More fields (optional)
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">Strategy</span>
                <input
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                  {...form.register('strategy_type')}
                />
              </label>

              <label className="block text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">Timeframe</span>
                <input
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                  {...form.register('timeframe')}
                />
              </label>

              {tradeMode === 'Live' && (
                <>
                  <label className="block text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">PnL amount</span>
                    <input
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                      inputMode="decimal"
                      value={form.watch('pnl_amount') ?? ''}
                      onChange={(e) => form.setValue('pnl_amount', parseNumberOrNull(e.target.value))}
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">Total fees</span>
                    <input
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                      inputMode="decimal"
                      value={form.watch('total_fees') ?? ''}
                      onChange={(e) => form.setValue('total_fees', parseNumberOrNull(e.target.value))}
                    />
                  </label>
                </>
              )}

              <label className="block text-sm sm:col-span-2">
                <span className="text-zinc-700 dark:text-zinc-300">Setup notes (optional)</span>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                  value={form.watch('setup_details') ?? ''}
                  onChange={(e) => form.setValue('setup_details', e.target.value ? e.target.value : null)}
                />
              </label>
            </div>
          </details>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
            >
              {initialTrade ? 'Save trade' : 'Add trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
