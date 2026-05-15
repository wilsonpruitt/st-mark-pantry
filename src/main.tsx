import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Toaster } from 'sonner'
import { SettingsProvider } from './contexts/SettingsContext'
import { ensureSeedData } from './lib/seed-data'
import { App } from './App'
import './index.css'

void ensureSeedData().catch((err) => {
  console.error('Failed to seed compliance data:', err)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SettingsProvider>
    <Toaster richColors position="bottom-right" />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
