import { Outlet } from 'react-router-dom'
import { useTheme } from '../app/theme'

export function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-40 border-b border-zinc-200/60 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <a className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100" href="/trades">
            Trading Journal
          </a>
          <button
            type="button"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={toggleTheme}
            title="Toggle light/dark"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>
      <Outlet />
    </div>
  )
}
