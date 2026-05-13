import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { lazy, Suspense } from 'react'

const TradeLogPage = lazy(() => import('../features/trades/TradeLogPage').then((m) => ({ default: m.TradeLogPage })))
const DailyPlanPage = lazy(() => import('../features/dailyPlans/DailyPlanPage').then((m) => ({ default: m.DailyPlanPage })))
const SettingsPage = lazy(() => import('../features/presets/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function PageLoader() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
      <div className="text-sm text-zinc-400">Loading…</div>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/trades" replace /> },
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/trades',
            element: (
              <Suspense fallback={<PageLoader />}>
                <TradeLogPage />
              </Suspense>
            ),
          },
          {
            path: '/plan',
            element: (
              <Suspense fallback={<PageLoader />}>
                <DailyPlanPage />
              </Suspense>
            ),
          },
          {
            path: '/settings',
            element: (
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
])
