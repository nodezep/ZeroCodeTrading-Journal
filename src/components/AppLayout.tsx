import { Outlet, useLocation } from 'react-router-dom'
import { TopNav } from './TopNav'

export function AppLayout() {
  const location = useLocation()
  const path = location.pathname
  const active =
    path === '/dashboard'
      ? ('Dashboard' as const)
      : path === '/calendar'
        ? ('Calendar' as const)
        : path === '/accounts'
          ? ('Accounts' as const)
          : path === '/plan'
            ? ('Daily Plan' as const)
            : path === '/settings'
              ? ('Settings' as const)
              : ('Journal' as const)

  return (
    <div className="min-h-full">
      <TopNav active={active} />
      <Outlet />
    </div>
  )
}
