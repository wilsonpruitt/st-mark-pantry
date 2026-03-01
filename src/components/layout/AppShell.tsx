import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SyncIndicator } from './SyncIndicator'

export function AppShell() {
  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="flex h-14 items-center justify-between bg-primary px-4">
        <h1 className="text-sm font-bold text-primary-foreground">
          St. Mark Legacy Food Pantry
        </h1>
        <SyncIndicator />
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  )
}
