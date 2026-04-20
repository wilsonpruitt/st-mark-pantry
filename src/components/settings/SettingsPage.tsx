import { useRef, useState } from 'react'
import { Download, Upload, FileSpreadsheet, Info, Package, Bell, Cloud, RefreshCw } from 'lucide-react'
import { db } from '@/db/database'
import { exportMultiSheetExcel } from '@/lib/excel'
import { useSettings } from '@/contexts/SettingsContext'
import { syncEngine } from '@/lib/sync-engine'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { DataImport } from './DataImport'
import { GoogleSheetsExport } from './GoogleSheetsExport'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const syncStatus = useSyncStatus()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const exportJSON = async () => {
    try {
      const clients = await db.clients.toArray()
      const visits = await db.visits.toArray()
      const volunteers = await db.volunteers.toArray()
      const volunteerShifts = await db.volunteerShifts.toArray()
      const volunteerSignups = await db.volunteerSignups.toArray()
      const data = {
        clients,
        visits,
        volunteers,
        volunteerShifts,
        volunteerSignups,
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pantry-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      showMessage('success', 'Data exported successfully.')
    } catch {
      showMessage('error', 'Failed to export data.')
    }
  }

  const importJSON = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.clients || !data.visits) {
        throw new Error('Invalid backup file format.')
      }

      await db.transaction('rw', [db.clients, db.visits, db.volunteers, db.volunteerShifts, db.volunteerSignups, db.syncQueue], async () => {
        await db.clients.clear()
        await db.visits.clear()
        await db.volunteers.clear()
        await db.volunteerShifts.clear()
        await db.volunteerSignups.clear()
        await db.syncQueue.clear()

        if (data.clients?.length) await db.clients.bulkAdd(data.clients)
        if (data.visits?.length) await db.visits.bulkAdd(data.visits)
        if (data.volunteers?.length) await db.volunteers.bulkAdd(data.volunteers)
        if (data.volunteerShifts?.length) await db.volunteerShifts.bulkAdd(data.volunteerShifts)
        if (data.volunteerSignups?.length) await db.volunteerSignups.bulkAdd(data.volunteerSignups)
      })

      // Reset sync state so imported data gets properly synced
      localStorage.removeItem('pantry-cloud-seeded')
      syncEngine.resetLastSync()

      const signupCount = data.volunteerSignups?.length ?? 0
      showMessage('success', `Imported ${data.clients.length} clients, ${data.visits.length} visits, ${signupCount} signups.`)
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to import data.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      await syncEngine.sync()
      showMessage('success', 'Sync completed successfully.')
    } catch {
      showMessage('error', 'Sync failed. Will retry automatically.')
    } finally {
      setSyncing(false)
    }
  }

  const handleFullResync = async () => {
    setSyncing(true)
    try {
      syncEngine.resetLastSync()
      await syncEngine.sync()
      showMessage('success', 'Full re-sync completed.')
    } catch {
      showMessage('error', 'Re-sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const exportExcel = async () => {
    try {
      const clients = await db.clients.toArray()
      const visits = await db.visits.toArray()

      const clientRows = clients.map((c) => ({
        ID: c.id,
        'First Name': c.firstName,
        'Last Name': c.lastName,
        Phone: c.phone || '',
        Email: c.email || '',
        Street: c.address?.street ?? '',
        City: c.address?.city ?? '',
        State: c.address?.state ?? '',
        ZIP: c.address?.zip ?? '',
        'Family Size': c.numberInFamily,
        Notes: c.notes || '',
        'Created At': c.createdAt ?? '',
      }))

      const visitRows = visits.map((v) => ({
        ID: v.id,
        'Client ID': v.clientId,
        Date: v.date,
        Day: v.dayOfWeek,
        'Items Received': v.itemsReceived || '',
        'Served By': v.servedBy || '',
        Notes: v.notes || '',
        'Checked In At': v.checkedInAt,
      }))

      await exportMultiSheetExcel(
        [
          { name: 'Clients', data: clientRows },
          { name: 'Visits', data: visitRows },
        ],
        `pantry-export-${new Date().toISOString().split('T')[0]}.xlsx`
      )
      showMessage('success', 'Excel file exported successfully.')
    } catch {
      showMessage('error', 'Failed to export Excel file.')
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4" />
            Features
          </CardTitle>
          <CardDescription>Enable or disable optional features.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="inventory-toggle" className="text-sm font-medium">
                Inventory Tracking
              </Label>
              <p className="text-xs text-muted-foreground">
                Record items given during check-in
              </p>
            </div>
            <Switch
              id="inventory-toggle"
              checked={settings.inventoryEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ inventoryEnabled: checked === true })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Cloud Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="size-4" />
            Cloud Sync
          </CardTitle>
          <CardDescription>Sync data across devices via the cloud.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">{syncStatus.online ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending changes</span>
              <span className="font-medium">{syncStatus.pendingCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last synced</span>
              <span className="font-medium">
                {syncStatus.lastSyncAt
                  ? new Date(syncStatus.lastSyncAt).toLocaleString()
                  : 'Never'}
              </span>
            </div>
          </div>
          <Button
            onClick={handleSyncNow}
            variant="outline"
            className="w-full justify-start"
            disabled={syncing || !syncStatus.online}
          >
            <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Button
            onClick={handleFullResync}
            variant="outline"
            className="w-full justify-start"
            disabled={syncing || !syncStatus.online}
          >
            <RefreshCw className="size-4" />
            Full Re-sync
          </Button>
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            Email Notifications
          </CardTitle>
          <CardDescription>Send confirmation and reminder emails to volunteers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="notifications-toggle" className="text-sm font-medium">
                Enable Notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Sync volunteer data to send automated reminders
              </p>
            </div>
            <Switch
              id="notifications-toggle"
              checked={settings.notificationsEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ notificationsEnabled: checked === true })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>Back up and restore your pantry data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={exportJSON} variant="outline" className="w-full justify-start">
            <Download className="size-4" />
            Export All Data (JSON)
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importJSON(file)
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full justify-start"
            disabled={importing}
          >
            <Upload className="size-4" />
            {importing ? 'Importing...' : 'Import Data (JSON)'}
          </Button>

          <Button onClick={exportExcel} variant="outline" className="w-full justify-start">
            <FileSpreadsheet className="size-4" />
            Export Clients (Excel)
          </Button>
        </CardContent>
      </Card>

      {/* Import from Spreadsheet */}
      <DataImport onComplete={() => showMessage('success', 'Import completed!')} />

      {/* Google Sheets Export */}
      <GoogleSheetsExport />

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">St. Mark Legacy Food Pantry</p>
          <p>Version v1.0.0</p>
          <p>Data is stored locally and synced to the cloud.</p>
        </CardContent>
      </Card>
    </div>
  )
}
