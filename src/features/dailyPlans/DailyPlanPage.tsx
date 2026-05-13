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
  created_at: string
  updated_at: string
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

  const queryKey = useMemo(() => ['daily_plan', selectedDate] as const, [selectedDate])
  const planQuery = useQuery({
    queryKey,
    queryFn: () => fetchDailyPlan(selectedDate),
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
  }, [planQuery.data, planQuery.isSuccess, selectedDate])

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

      <div className="mt-6 flex items-center justify-end">
        <button
          className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          type="button"
          disabled={upsertMutation.isPending}
          onClick={() => upsertMutation.mutate()}
        >
          Save plan
        </button>
      </div>
    </div>
  )
}
