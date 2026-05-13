import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchPairPresets, fetchRrPresets, fetchSessionPresets } from './presets'

function slugifyLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ')
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [pairLabel, setPairLabel] = useState('')
  const [sessionLabel, setSessionLabel] = useState('')
  const [rrLabel, setRrLabel] = useState('1:2')

  const pairsQuery = useQuery({ queryKey: ['presets', 'pairs'], queryFn: fetchPairPresets })
  const sessionsQuery = useQuery({ queryKey: ['presets', 'sessions'], queryFn: fetchSessionPresets })
  const rrQuery = useQuery({ queryKey: ['presets', 'rr'], queryFn: fetchRrPresets })

  const addPair = useMutation({
    mutationFn: async () => {
      const label = slugifyLabel(pairLabel)
      if (!label) return
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Not signed in')
      const { error } = await supabase.from('pair_presets').insert({ user_id: userId, label })
      if (error) throw error
      setPairLabel('')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['presets', 'pairs'] })
    },
  })

  const addSession = useMutation({
    mutationFn: async () => {
      const label = slugifyLabel(sessionLabel)
      if (!label) return
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Not signed in')
      const { error } = await supabase.from('session_presets').insert({ user_id: userId, label })
      if (error) throw error
      setSessionLabel('')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['presets', 'sessions'] })
    },
  })

  const addRr = useMutation({
    mutationFn: async () => {
      const label = slugifyLabel(rrLabel)
      if (!label) return
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Not signed in')
      const { error } = await supabase.from('rr_presets').insert({ user_id: userId, label })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['presets', 'rr'] })
    },
  })

  const deletePreset = useMutation({
    mutationFn: async ({ table, id }: { table: 'pair_presets' | 'session_presets' | 'rr_presets'; id: string }) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['presets', 'pairs'] }),
        queryClient.invalidateQueries({ queryKey: ['presets', 'sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['presets', 'rr'] }),
      ])
    },
  })

  const defaultHelp = useMemo(
    () => (
      <div className="text-xs text-zinc-500">
        Add your common pairs (e.g. GBP/USD, XAU/USD), sessions (London/New York/Asia), and R:R ratios (1:1, 1:2…).
        They’ll show up as dropdowns on the trade form.
      </div>
    ),
    [],
  )

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Dropdown presets</p>
        </div>
        <a className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200 dark:hover:bg-zinc-900" href="/trades">
          Back to trades
        </a>
      </header>

      <section className="mt-6 grid gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Pairs</div>
          {defaultHelp}
          <div className="mt-3 flex gap-2">
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="GBP/USD"
              value={pairLabel}
              onChange={(e) => setPairLabel(e.target.value)}
            />
            <button
              className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
              onClick={() => addPair.mutate()}
              disabled={addPair.isPending}
              type="button"
            >
              Add
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(pairsQuery.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 hover:border-red-500/40 hover:text-red-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-200"
                onClick={() => deletePreset.mutate({ table: 'pair_presets', id: p.id })}
                title="Click to delete"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Sessions</div>
          <div className="mt-3 flex gap-2">
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="London"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
            />
            <button
              className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
              onClick={() => addSession.mutate()}
              disabled={addSession.isPending}
              type="button"
            >
              Add
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(sessionsQuery.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 hover:border-red-500/40 hover:text-red-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-200"
                onClick={() => deletePreset.mutate({ table: 'session_presets', id: s.id })}
                title="Click to delete"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Risk:Reward presets</div>
          <div className="mt-3 flex gap-2">
            <input
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="1:2"
              value={rrLabel}
              onChange={(e) => setRrLabel(e.target.value)}
            />
            <button
              className="rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
              onClick={() => addRr.mutate()}
              disabled={addRr.isPending}
              type="button"
            >
              Add
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(rrQuery.data ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 hover:border-red-500/40 hover:text-red-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-200"
                onClick={() => deletePreset.mutate({ table: 'rr_presets', id: r.id })}
                title="Click to delete"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
