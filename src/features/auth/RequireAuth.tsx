import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from './useSession'

export function RequireAuth() {
  const { session, isLoading } = useSession()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
        <div className="text-sm text-zinc-400">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
