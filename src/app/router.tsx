import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { lazy, Suspense } from 'react'

const TradeLogPage = lazy(() => import('../features/trades/TradeLogPage').then((m) => ({ default: m.TradeLogPage })))
const PerformanceCalendarPage = lazy(() =>
  import('../features/trades/PerformanceCalendarPage').then((m) => ({ default: m.PerformanceCalendarPage })),
)
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const DailyPlanPage = lazy(() => import('../features/dailyPlans/DailyPlanPage').then((m) => ({ default: m.DailyPlanPage })))
const SettingsPage = lazy(() => import('../features/presets/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

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
            path: '/dashboard',
            element: (
              <Suspense fallback={<PageLoader />}>
                <DashboardPage />
              </Suspense>
            ),
          },
          {
            path: '/trades',
            element: (
              <Suspense fallback={<PageLoader />}>
                <TradeLogPage />
              </Suspense>
            ),
          },
          {
            path: '/calendar',
            element: (
              <Suspense fallback={<PageLoader />}>
                <PerformanceCalendarPage />
              </Suspense>
            ),
          },
          {
            path: '/accounts',
            element: (
              <Suspense fallback={<PageLoader />}>
                <AccountsPage />
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
