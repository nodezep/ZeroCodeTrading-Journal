import { supabase } from '../lib/supabaseClient'
import { useSession } from '../features/auth/useSession'
import { useTheme } from '../app/theme'

type Props = {
  active?: 'Dashboard' | 'Journal' | 'Calendar' | 'Accounts' | 'Daily Plan' | 'Settings'
}

function linkClass(active: boolean) {
  return [
    'text-sm font-medium hover:text-purple-400 transition-colors',
    active ? 'text-zinc-100' : 'text-zinc-500',
  ].join(' ')
}

export function TopNav({ active }: Props) {
  const { session } = useSession()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-3">
        <nav className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-6">
            <a href="/" className={linkClass(active === 'Journal')}>
              Journal
            </a>
            <a href="/dashboard" className={linkClass(active === 'Dashboard')}>
              Dashboard
            </a>
            <a href="/calendar" className={linkClass(active === 'Calendar')}>
              Calendar
            </a>
            <a href="/accounts" className={linkClass(active === 'Accounts')}>
              Accounts
            </a>
            <a href="/plan" className={linkClass(active === 'Daily Plan')}>
              Daily Plan
            </a>
            <a href="/settings" className={linkClass(active === 'Settings')}>
              Settings
            </a>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
              onClick={toggleTheme}
              title="Toggle light/dark"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
              {session?.user?.email ?? ''}
            </span>
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
      </div>
    </div>
  )
}

