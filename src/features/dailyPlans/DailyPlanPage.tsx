import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useSession } from '../auth/useSession'

type DailyPlan = {
  id: string
  user_id: string
  date: string
  pre_session_notes: string | null
  trading_session_notes: string | null
  personal_time_notes: string | null
  post_session_notes: string | null
  next_day_planning: string | null
  daily_checklist: DailyChecklistItem[] | null
  created_at: string
  updated_at: string
}

type DailyChecklistItem = {
  id: string
  label: string
  checked: boolean
}

const DEFAULT_DAILY_CHECKLIST: DailyChecklistItem[] = [
  { id: 'wake_0500', label: '5:00 AM — Wake up (no phone, no scrolling)', checked: false },
  { id: 'cold_stretch_breathe', label: 'Cold water → stretch → breathe → move', checked: false },
  { id: 'silence_0515', label: '5:15 AM — Silence & clarity (notebook planning)', checked: false },
  { id: 'movement_0545', label: '5:45 AM — First movement (run/lift/sweat/yoga)', checked: false },
  { id: 'breakfast_0630', label: '6:30 AM — Smart breakfast (protein/fiber/water)', checked: false },
  { id: 'trading_block_0700', label: '7:00–10:00 AM — Deep Work (Trading forex) block', checked: false },
  { id: 'reset_1000', label: '10:00–10:30 AM — Reset (walk/breathe)', checked: false },
  { id: 'growth_1030', label: '10:30 AM–12:30 PM — Growth time (learn/build)', checked: false },
  { id: 'lunch_1230', label: '12:30–1:30 PM — Lunch & movement (walk/stretch)', checked: false },
  { id: 'second_wave_1330', label: '1:30–4:30 PM — Second wave (education/projects)', checked: false },
  { id: 'unload_1630', label: '4:30–5:00 PM — Unload body (stretch/walk)', checked: false },
  { id: 'real_life_1700', label: '5:00 PM onward — Real life (screens off, prayers, bible, family)', checked: false },
  { id: 'wind_down_2130', label: '9:30 PM — Wind down (dim lights, no screens)', checked: false },
  { id: 'sleep_2200', label: '10:00 PM — Sleep (7–8 hours)', checked: false },
]

function normalizeChecklist(input: unknown): DailyChecklistItem[] {
  const map = new Map<string, DailyChecklistItem>()
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Partial<DailyChecklistItem>
      if (typeof item.id !== 'string' || typeof item.label !== 'string') continue
      map.set(item.id, { id: item.id, label: item.label, checked: !!item.checked })
    }
  }
  return DEFAULT_DAILY_CHECKLIST.map((d) => map.get(d.id) ?? d)
}

const DEFAULT_PLAN_TEMPLATE = {
  pre_session_notes: [
    'Sleep: __h | Energy: __/10 | Mood: __/10',
    'Today’s goal (1 sentence): ',
    'Non-negotiables: no phone / workout / breakfast ✅',
    'Market context (high level): ',
    'I will NOT do: ',
  ].join('\n'),
  trading_session_notes: [
    'Session: London / New York / Asia',
    'Pairs on watch (2–5): ',
    'Setup checklist required: all ticks before entry ✅',
    'Entry rules (1–3): ',
    'Risk rules: max trades __ | max loss __R | risk/trade __%',
    'Exit rules: partials / BE rules: ',
  ].join('\n'),
  personal_time_notes: ['Reset plan: walk/breathe ✅', 'Growth focus: ', 'One improvement today: '].join('\n'),
  post_session_notes: [
    'Did I follow rules? Yes/No — why:',
    'What worked (1–3):',
    'Mistakes (1–3):',
    'Emotion log (what + when):',
  ].join('\n'),
  next_day_planning: [
    'Fix one mistake with a rule: “Tomorrow I will …”',
    'Tomorrow watchlist idea:',
    'One improvement goal:',
  ].join('\n'),
}

type PlanTemplate = typeof DEFAULT_PLAN_TEMPLATE

type DailyPlanTemplateRow = {
  user_id: string
  plan_template: PlanTemplate | null
  checklist_template: DailyChecklistItem[] | null
  created_at: string
  updated_at: string
}

async function fetchDailyTemplate() {
  const { data, error } = await supabase.from('daily_plan_templates').select('*').maybeSingle()
  if (error) throw error
  return (data ?? null) as DailyPlanTemplateRow | null
}

async function fetchDailyPlan(date: string) {
  const { data, error } = await supabase.from('daily_plans').select('*').eq('date', date).maybeSingle()
  if (error) throw error
  return (data ?? null) as DailyPlan | null
}

export function DailyPlanPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [values, setValues] = useState({
    pre_session_notes: '',
    trading_session_notes: '',
    personal_time_notes: '',
    post_session_notes: '',
    next_day_planning: '',
  })
  const [checklist, setChecklist] = useState<DailyChecklistItem[]>(() => normalizeChecklist(null))
  const [templateDraft, setTemplateDraft] = useState<PlanTemplate>(() => ({ ...DEFAULT_PLAN_TEMPLATE }))
  const [templateChecklistDraft, setTemplateChecklistDraft] = useState<DailyChecklistItem[]>(() =>
    normalizeChecklist(null).map((c) => ({ ...c, checked: false })),
  )
  const [isEditingTemplate, setIsEditingTemplate] = useState(false)

  const queryKey = useMemo(() => ['daily_plan', selectedDate] as const, [selectedDate])
  const planQuery = useQuery({
    queryKey,
    queryFn: () => fetchDailyPlan(selectedDate),
  })
  const templateQuery = useQuery({
    queryKey: ['daily_template'],
    queryFn: fetchDailyTemplate,
  })

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Not signed in')
      const payload = {
        user_id: session.user.id,
        date: selectedDate,
        pre_session_notes: values.pre_session_notes || null,
        trading_session_notes: values.trading_session_notes || null,
        personal_time_notes: values.personal_time_notes || null,
        post_session_notes: values.post_session_notes || null,
        next_day_planning: values.next_day_planning || null,
        daily_checklist: checklist,
      }

      const { error } = await supabase
        .from('daily_plans')
        .upsert(payload, { onConflict: 'user_id,date' })

      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daily_plan'] })
    },
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Not signed in')
      const payload = {
        user_id: session.user.id,
        plan_template: templateDraft,
        checklist_template: templateChecklistDraft.map((c) => ({ ...c, checked: false })),
      }
      const { error } = await supabase.from('daily_plan_templates').upsert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daily_template'] })
      setIsEditingTemplate(false)
    },
  })

  useEffect(() => {
    if (!planQuery.isSuccess) return
    const hydrated = planQuery.data
    setValues({
      pre_session_notes: hydrated?.pre_session_notes ?? '',
      trading_session_notes: hydrated?.trading_session_notes ?? '',
      personal_time_notes: hydrated?.personal_time_notes ?? '',
      post_session_notes: hydrated?.post_session_notes ?? '',
      next_day_planning: hydrated?.next_day_planning ?? '',
    })
    setChecklist(normalizeChecklist(hydrated?.daily_checklist))
  }, [planQuery.data, planQuery.isSuccess, selectedDate])

  useEffect(() => {
    if (!templateQuery.isSuccess) return
    const template = templateQuery.data
    if (!template) return
    setTemplateDraft(template.plan_template ?? { ...DEFAULT_PLAN_TEMPLATE })
    setTemplateChecklistDraft(
      normalizeChecklist(template.checklist_template ?? null).map((c) => ({ ...c, checked: false })),
    )
  }, [templateQuery.data, templateQuery.isSuccess])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Trade Plan</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Plan, execute, reflect</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
            href="/trades"
          >
            Back to trades
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

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
        <label className="block text-sm">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Date</div>
          <input
            className="mt-2 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>

        {planQuery.isLoading && (
          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>
        )}
        {planQuery.isError && (
          <div className="mt-4 text-sm text-red-300">{(planQuery.error as Error).message}</div>
        )}
      </section>

      <section className="mt-6 grid gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">
              Daily Accountability Checklist
            </div>
            <div className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
              {checklist.filter((c) => c.checked).length}/{checklist.length} complete
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {checklist.map((item, idx) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                  checked={item.checked}
                  onChange={(e) => {
                    setChecklist((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, checked: e.target.checked } : p)),
                    )
                  }}
                />
                <span className="text-zinc-900 dark:text-zinc-200">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {(
          [
            ['Pre-Session', 'pre_session_notes'],
            ['Trading Session', 'trading_session_notes'],
            ['Personal Time', 'personal_time_notes'],
            ['Post-Session', 'post_session_notes'],
            ['Next Day Planning', 'next_day_planning'],
          ] as const
        ).map(([label, key]) => (
          <div
            key={key}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20"
          >
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">{label}</div>
            <textarea
              className="mt-3 min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </div>
        ))}
      </section>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
          type="button"
          onClick={() => {
            const template = templateQuery.data?.plan_template ?? DEFAULT_PLAN_TEMPLATE
            setValues((v) => ({ ...v, ...template }))
            const checklistTemplate = templateQuery.data?.checklist_template ?? DEFAULT_DAILY_CHECKLIST
            setChecklist(normalizeChecklist(checklistTemplate))
          }}
        >
          Load template
        </button>
        <button
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
          type="button"
          onClick={() => setIsEditingTemplate(true)}
        >
          Edit template
        </button>
        <button
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
          type="button"
          disabled={saveTemplateMutation.isPending}
          onClick={() => saveTemplateMutation.mutate()}
          title="Saves your current checklist as the default template (per account)"
        >
          Save template
        </button>
        <button
          className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          type="button"
          disabled={upsertMutation.isPending}
          onClick={() => upsertMutation.mutate()}
        >
          Save plan
        </button>
      </div>

      {isEditingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Edit daily template</div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                onClick={() => setIsEditingTemplate(false)}
              >
                Close
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-5">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/10">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Checklist template</div>
                <div className="mt-3 grid gap-2">
                  {templateChecklistDraft.map((item, idx) => (
                    <div key={item.id} className="flex gap-2">
                      <input
                        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
                        value={item.label}
                        onChange={(e) =>
                          setTemplateChecklistDraft((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-zinc-900"
                        onClick={() => setTemplateChecklistDraft((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  onClick={() =>
                    setTemplateChecklistDraft((prev) => [
                      ...prev,
                      { id: crypto.randomUUID(), label: 'New item', checked: false },
                    ])
                  }
                >
                  Add checklist item
                </button>
              </div>

              <div className="mt-4 grid gap-4">
                {(
                  [
                    ['Pre-Session template', 'pre_session_notes'],
                    ['Trading Session template', 'trading_session_notes'],
                    ['Personal Time template', 'personal_time_notes'],
                    ['Post-Session template', 'post_session_notes'],
                    ['Next Day Planning template', 'next_day_planning'],
                  ] as const
                ).map(([label, key]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20"
                  >
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">{label}</div>
                    <textarea
                      className="mt-3 min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
                      value={templateDraft[key]}
                      onChange={(e) =>
                        setTemplateDraft((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900"
                onClick={() => setIsEditingTemplate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
                disabled={saveTemplateMutation.isPending}
                onClick={() => saveTemplateMutation.mutate()}
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
