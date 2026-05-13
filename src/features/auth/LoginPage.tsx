import { useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [serverError, setServerError] = useState<string | null>(null)

  const title = useMemo(() => (mode === 'login' ? 'Sign in' : 'Create account'), [mode])

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword(values)
      if (error) return setServerError(error.message)
      navigate('/trades', { replace: true })
      return
    }

    const { error } = await supabase.auth.signUp(values)
    if (error) return setServerError(error.message)
    navigate('/trades', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Trading Journal + Backtesting System (MVP)
        </p>
      </div>

      <form
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <label className="block text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">Email</span>
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/40 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
            type="email"
            autoComplete="email"
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <div className="mt-2 text-xs text-red-300">{form.formState.errors.email.message}</div>
          )}
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">Password</span>
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-purple-500/40 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <div className="mt-2 text-xs text-red-300">
              {form.formState.errors.password.message}
            </div>
          )}
        </label>

        {serverError && <div className="mt-4 text-sm text-red-300">{serverError}</div>}

        <button
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          onClick={() => setMode((m) => (m === 'login' ? 'signup' : 'login'))}
        >
          {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
