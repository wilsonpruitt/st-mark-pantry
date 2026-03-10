import { useState } from 'react';
import { db } from '@/db/database';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FileSpreadsheet, Users, ClipboardList, HandHelping } from 'lucide-react';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (s: string) => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoogleSheetsExport() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const exportClientList = async () => {
    setExporting('clients');
    try {
      const clients = await db.clients.toArray();
      const headers = [
        'First Name',
        'Last Name',
        'Phone',
        'Email',
        'Street',
        'City',
        'State',
        'Zip',
        'Family Size',
        'Notes',
      ];
      const rows = clients.map((c) => [
        c.firstName,
        c.lastName,
        c.phone || '',
        c.email || '',
        c.address?.street ?? '',
        c.address?.city ?? '',
        c.address?.state ?? '',
        c.address?.zip ?? '',
        String(c.numberInFamily),
        c.notes || '',
      ]);
      const csv = toCSV(headers, rows);
      downloadCSV(csv, `pantry-clients-${new Date().toISOString().split('T')[0]}.csv`);
      showMessage('success', `Exported ${clients.length} clients as CSV.`);
    } catch {
      showMessage('error', 'Failed to export client list.');
    } finally {
      setExporting(null);
    }
  };

  const exportVisitLog = async () => {
    setExporting('visits');
    try {
      const visits = await db.visits.toArray();
      const clients = await db.clients.toArray();
      const clientMap = new Map(clients.map((c) => [c.id, c]));

      const headers = [
        'Date',
        'Day of Week',
        'Client First Name',
        'Client Last Name',
        'Family Size',
        'Served By',
        'Notes',
      ];
      const rows = visits
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((v) => {
          const client = clientMap.get(v.clientId);
          return [
            v.date,
            v.dayOfWeek,
            client?.firstName || '',
            client?.lastName || '',
            client ? String(client.numberInFamily) : '',
            v.servedBy || '',
            v.notes || '',
          ];
        });
      const csv = toCSV(headers, rows);
      downloadCSV(csv, `pantry-visits-${new Date().toISOString().split('T')[0]}.csv`);
      showMessage('success', `Exported ${visits.length} visits as CSV.`);
    } catch {
      showMessage('error', 'Failed to export visit log.');
    } finally {
      setExporting(null);
    }
  };

  const exportVolunteerLog = async () => {
    setExporting('volunteers');
    try {
      const volunteers = await db.volunteers.toArray();
      const shifts = await db.volunteerShifts.toArray();
      const volunteerMap = new Map(volunteers.map((v) => [v.id, v]));

      const headers = [
        'First Name',
        'Last Name',
        'Phone',
        'Email',
        'Shift Date',
        'Day of Week',
        'Role',
        'Hours Worked',
      ];
      const rows = shifts
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => {
          const vol = volunteerMap.get(s.volunteerId);
          return [
            vol?.firstName || '',
            vol?.lastName || '',
            vol?.phone || '',
            vol?.email || '',
            s.date,
            s.dayOfWeek,
            s.role || '',
            s.hoursWorked != null ? String(s.hoursWorked) : '',
          ];
        });
      const csv = toCSV(headers, rows);
      downloadCSV(csv, `pantry-volunteers-${new Date().toISOString().split('T')[0]}.csv`);
      showMessage('success', `Exported ${shifts.length} volunteer shifts as CSV.`);
    } catch {
      showMessage('error', 'Failed to export volunteer log.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-4" />
          Export for Google Sheets
        </CardTitle>
        <CardDescription>
          Download CSV files that can be imported directly into Google Sheets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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

        <Button
          onClick={exportClientList}
          variant="outline"
          className="w-full justify-start"
          disabled={exporting !== null}
        >
          <Users className="size-4" />
          {exporting === 'clients' ? 'Exporting...' : 'Client List CSV'}
        </Button>

        <Button
          onClick={exportVisitLog}
          variant="outline"
          className="w-full justify-start"
          disabled={exporting !== null}
        >
          <ClipboardList className="size-4" />
          {exporting === 'visits' ? 'Exporting...' : 'Visit Log CSV'}
        </Button>

        <Button
          onClick={exportVolunteerLog}
          variant="outline"
          className="w-full justify-start"
          disabled={exporting !== null}
        >
          <HandHelping className="size-4" />
          {exporting === 'volunteers' ? 'Exporting...' : 'Volunteer Log CSV'}
        </Button>
      </CardContent>
    </Card>
  );
}
