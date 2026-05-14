import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useSession } from '../auth/useSession'
import { fetchAccountSnapshots } from './accounts'
import type { AccountEventType, AccountSnapshot } from './accounts'

function parseAmount(value: string) {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function AccountsPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [broker, setBroker] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [startingBalance, setStartingBalance] = useState('')
  const [eventDrafts, setEventDrafts] = useState<Record<string, { amount: string; note: string }>>({})

  const accountsQuery = useQuery({ queryKey: ['accounts', 'snapshots'], queryFn: fetchAccountSnapshots })

  const totals = useMemo(() => {
    const accounts = accountsQuery.data ?? []
    return {
      active: accounts.filter((account) => account.status === 'Active').length,
      blown: accounts.filter((account) => account.status === 'Blown').length,
      balance: accounts
        .filter((account) => account.status !== 'Archived' && account.currency === 'USD')
        .reduce((sum, account) => sum + account.currentBalance, 0),
      pnl: accounts
        .filter((account) => account.status !== 'Archived' && account.currency === 'USD')
        .reduce((sum, account) => sum + account.livePnl, 0),
    }
  }, [accountsQuery.data])

  const createAccount = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Not signed in')
      const initial = parseAmount(startingBalance)
      if (!name.trim() || initial == null) throw new Error('Add an account name and starting balance.')

      const { error } = await supabase.from('trading_accounts').insert({
        user_id: session.user.id,
        name: name.trim(),
        broker: broker.trim() || null,
        currency: currency.trim().toUpperCase() || 'USD',
        starting_balance: initial,
        status: 'Active',
      })

      if (error) throw error
    },
    onSuccess: async () => {
      setName('')
      setBroker('')
      setStartingBalance('')
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  const addEvent = useMutation({
    mutationFn: async ({
      account,
      eventType,
      amount,
      note,
    }: {
      account: AccountSnapshot
      eventType: AccountEventType
      amount: number
      note: string | null
    }) => {
      if (!session) throw new Error('Not signed in')
      const { error: eventError } = await supabase.from('account_events').insert({
        account_id: account.id,
        user_id: session.user.id,
        event_type: eventType,
        amount,
        note,
      })
      if (eventError) throw eventError

      if (eventType === 'Deposit' && account.status === 'Blown') {
        const { error } = await supabase
          .from('trading_accounts')
          .update({ status: 'Active', blown_at: null })
          .eq('id', account.id)
        if (error) throw error
      }
    },
    onSuccess: async (_, variables) => {
      setEventDrafts((drafts) => ({ ...drafts, [variables.account.id]: { amount: '', note: '' } }))
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  const markBlown = useMutation({
    mutationFn: async (account: AccountSnapshot) => {
      if (!session) throw new Error('Not signed in')
      const now = new Date().toISOString()
      const { error: accountError } = await supabase
        .from('trading_accounts')
        .update({ status: 'Blown', blown_at: now })
        .eq('id', account.id)
      if (accountError) throw accountError

      const { error: eventError } = await supabase.from('account_events').insert({
        account_id: account.id,
        user_id: session.user.id,
        event_type: 'Blown',
        amount: 0,
        occurred_at: now,
        note: `Marked blown at ${money(account.currentBalance, account.currency)}`,
      })
      if (eventError) throw eventError
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  function submitEvent(account: AccountSnapshot, eventType: 'Deposit' | 'Withdrawal') {
    const draft = eventDrafts[account.id] ?? { amount: '', note: '' }
    const amount = parseAmount(draft.amount)
    if (amount == null || amount <= 0) return
    addEvent.mutate({ account, eventType, amount, note: draft.note.trim() || null })
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex gap-6">
          <a href="/trades" className="text-sm font-medium text-zinc-500 transition-colors hover:text-purple-400">
            Journal
          </a>
          <a href="/calendar" className="text-sm font-medium text-zinc-500 transition-colors hover:text-purple-400">
            Calendar
          </a>
          <a href="/accounts" className="text-sm font-medium text-zinc-100 transition-colors hover:text-purple-400">
            Accounts
          </a>
          <a href="/plan" className="text-sm font-medium text-zinc-500 transition-colors hover:text-purple-400">
            Daily Plan
          </a>
          <a href="/settings" className="text-sm font-medium text-zinc-500 transition-colors hover:text-purple-400">
            Settings
          </a>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{session?.user?.email}</span>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300">Live Trading</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Accounts</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Track funded accounts, personal accounts, deposits, withdrawals, blown resets, and live trade PnL.
          </p>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          { label: 'USD Balance', value: money(totals.balance, 'USD'), tone: totals.balance >= 0 ? 'green' : 'red' },
          { label: 'Live PnL', value: money(totals.pnl, 'USD'), tone: totals.pnl >= 0 ? 'green' : 'red' },
          { label: 'Active Accounts', value: totals.active, tone: 'neutral' },
          { label: 'Blown Accounts', value: totals.blown, tone: 'red' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{stat.label}</div>
            <div
              className={[
                'mt-3 text-2xl font-bold tabular-nums',
                stat.tone === 'green' ? 'text-emerald-300' : stat.tone === 'red' ? 'text-rose-300' : 'text-zinc-100',
              ].join(' ')}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="text-sm font-bold text-zinc-100">Add Account</div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_120px_160px_auto]">
          <input
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
            placeholder="Account name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
            placeholder="Broker / prop firm"
            value={broker}
            onChange={(event) => setBroker(event.target.value)}
          />
          <input
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
            placeholder="USD"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          />
          <input
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
            inputMode="decimal"
            placeholder="Starting balance"
            value={startingBalance}
            onChange={(event) => setStartingBalance(event.target.value)}
          />
          <button
            type="button"
            disabled={createAccount.isPending}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
            onClick={() => createAccount.mutate()}
          >
            Add
          </button>
        </div>
        {createAccount.error && <div className="mt-3 text-sm text-rose-300">{createAccount.error.message}</div>}
      </section>

      <section className="mt-8 grid gap-4">
        {accountsQuery.isLoading && <div className="text-sm text-zinc-500">Loading accounts...</div>}
        {accountsQuery.error && <div className="text-sm text-rose-300">{accountsQuery.error.message}</div>}
        {(accountsQuery.data ?? []).map((account) => {
          const draft = eventDrafts[account.id] ?? { amount: '', note: '' }
          const isBlown = account.status === 'Blown'
          const recentHistory = [...account.events, ...account.trades]
            .map((item) =>
              'event_type' in item
                ? {
                    id: item.id,
                    date: item.occurred_at,
                    label: item.event_type,
                    amount:
                      item.event_type === 'Withdrawal'
                        ? -Number(item.amount)
                        : item.event_type === 'Deposit'
                          ? Number(item.amount)
                          : 0,
                    note: item.note,
                  }
                : {
                    id: item.id,
                    date: item.date,
                    label: item.is_win ? 'Win' : item.is_loss ? 'Loss' : 'Trade',
                    amount: Number(item.pnl_amount ?? 0),
                    note: `${item.coin_pair} ${item.position_type}`,
                  },
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5)

          return (
            <article key={account.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-bold text-zinc-100">{account.name}</h2>
                    <span
                      className={[
                        'rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest',
                        isBlown ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300',
                      ].join(' ')}
                    >
                      {account.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {account.broker || 'No broker'} / {account.currency}
                    {account.blown_at ? ` / blown ${format(new Date(account.blown_at), 'MMM d, yyyy')}` : ''}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-right sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Balance</div>
                    <div className="mt-1 font-bold tabular-nums text-zinc-100">
                      {money(isBlown ? 0 : account.currentBalance, account.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Deposits</div>
                    <div className="mt-1 font-bold tabular-nums text-emerald-300">
                      {money(account.deposits + Number(account.starting_balance), account.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Live PnL</div>
                    <div className={['mt-1 font-bold tabular-nums', account.livePnl >= 0 ? 'text-emerald-300' : 'text-rose-300'].join(' ')}>
                      {money(account.livePnl, account.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Trades</div>
                    <div className="mt-1 font-bold tabular-nums text-zinc-100">{account.trades.length}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
                <input
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
                  inputMode="decimal"
                  placeholder={isBlown ? 'New deposit to restart' : 'Deposit / withdrawal amount'}
                  value={draft.amount}
                  onChange={(event) =>
                    setEventDrafts((drafts) => ({
                      ...drafts,
                      [account.id]: { ...draft, amount: event.target.value },
                    }))
                  }
                />
                <input
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 outline-none ring-purple-500/20 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-4"
                  placeholder="Note"
                  value={draft.note}
                  onChange={(event) =>
                    setEventDrafts((drafts) => ({
                      ...drafts,
                      [account.id]: { ...draft, note: event.target.value },
                    }))
                  }
                />
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  disabled={addEvent.isPending}
                  onClick={() => submitEvent(account, 'Deposit')}
                >
                  {isBlown ? 'Restart' : 'Deposit'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                  disabled={addEvent.isPending || isBlown}
                  onClick={() => submitEvent(account, 'Withdrawal')}
                >
                  Withdraw
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  disabled={markBlown.isPending || isBlown}
                  onClick={() => {
                    const ok = window.confirm(`Mark ${account.name} as blown?`)
                    if (ok) markBlown.mutate(account)
                  }}
                >
                  Mark Blown
                </button>
                <div className="text-xs text-zinc-500">
                  Assign live trades to this account from the trade form to keep balance accurate.
                </div>
              </div>

              {recentHistory.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                  {recentHistory.map((item) => (
                    <div key={`${item.label}-${item.id}`} className="grid grid-cols-[110px_1fr_auto] gap-3 border-b border-zinc-800 px-3 py-2 text-sm last:border-b-0">
                      <div className="text-zinc-500">{format(new Date(item.date), 'MMM d')}</div>
                      <div className="text-zinc-300">{item.label}{item.note ? ` / ${item.note}` : ''}</div>
                      <div className={['font-bold tabular-nums', item.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'].join(' ')}>
                        {item.amount === 0 ? '0.00' : money(item.amount, account.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
        {!accountsQuery.isLoading && (accountsQuery.data?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
            Add your first live account to start tracking deposits, blown resets, and live PnL.
          </div>
        )}
      </section>
    </div>
  )
}
