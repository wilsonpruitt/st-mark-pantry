import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { ArrowLeft, Phone, Mail, MapPin, Pencil, Trash2, Users, AlertTriangle, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { useSettings } from '@/contexts/SettingsContext';
import { formatDate, getTodayISO } from '@/utils/dateHelpers';

export function ClientDetail() {
  const { settings } = useSettings();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);


  const today = getTodayISO();
  const monthStart = today.substring(0, 7) + '-01';

  const client = useLiveQuery(
    () => (id ? db.clients.get(id) : undefined),
    [id]
  );

  const visits = useLiveQuery(
    () =>
      id
        ? db.visits
            .where('clientId')
            .equals(id)
            .toArray()
            .then((v) => v.sort((a, b) => b.date.localeCompare(a.date)))
        : [],
    [id]
  );

  // Find the most recent visit this month (excluding today)
  const visitThisMonth = visits?.find(
    (v) => v.date >= monthStart && v.date <= today && v.date !== today
  );

  if (client === undefined || visits === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (client === null) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Client not found.</p>
        </div>
      </div>
    );
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await db.transaction('rw', [db.clients, db.visits], async () => {
        await db.visits.where('clientId').equals(id).delete();
        await db.clients.delete(id);
      });
      navigate('/clients');
    } catch {
      setDeleting(false);
    }
  }

  const fullName = `${client.firstName} ${client.lastName}`;
  const hasAddress =
    client.address.street || client.address.city || client.address.state || client.address.zip;
  const addressParts = [
    client.address.street,
    [client.address.city, client.address.state].filter(Boolean).join(', '),
    client.address.zip,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Monthly visit warning */}
      {visitThisMonth && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-100 px-4 py-3 text-sm font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
          <AlertTriangle className="size-4 shrink-0" />
          Already visited this month on {formatDate(visitThisMonth.date)}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/clients/${id}/edit`}>
              <Pencil className="size-4" />
              <span className="hidden sm:inline">Edit</span>
            </Link>
          </Button>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Client</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete {fullName}? This will also delete all
                  their visit records. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={deleting}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Client Info */}
      <div>
        <h1 className="text-2xl font-bold">{fullName}</h1>

        <div className="mt-4 space-y-2">
          {client.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="size-4 text-muted-foreground shrink-0" />
              <a href={`tel:${client.phone}`} className="text-primary hover:underline">
                {client.phone}
              </a>
            </div>
          )}

          {client.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                {client.email}
              </a>
            </div>
          )}

          {hasAddress && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <span>{addressParts.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <Snowflake className="size-4 text-muted-foreground shrink-0" />
          <span>
            Perishable foods:{' '}
            <span className={client.acceptsPerishables === false ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-muted-foreground'}>
              {client.acceptsPerishables === false ? 'No' : 'Yes'}
            </span>
          </span>
        </div>

        {client.notes && (
          <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
            <span className="font-medium">Notes: </span>
            {client.notes}
          </div>
        )}
      </div>

      <Separator />

      {/* Family Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Family ({client.numberInFamily} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.familyMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No family members listed</p>
          ) : (
            <div className="space-y-2">
              {client.familyMembers.map((member, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{member.name}</span>
                    {member.relationship && (
                      <Badge variant="outline" className="ml-2">
                        {member.relationship}
                      </Badge>
                    )}
                  </div>
                  {member.age !== undefined && (
                    <span className="text-sm text-muted-foreground shrink-0 ml-2">
                      Age {member.age}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visit History */}
      <Card>
        <CardHeader>
          <CardTitle>Visit History</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits recorded</p>
          ) : (
            <div className="space-y-2">
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-md border px-3 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{formatDate(visit.date)}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        ({visit.dayOfWeek})
                      </span>
                    </div>
                    {visit.servedBy && (
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">
                        Served by {visit.servedBy}
                      </span>
                    )}
                  </div>
                  {settings.inventoryEnabled && visit.itemsReceived && (
                    <p className="text-xs text-muted-foreground">
                      Items: {visit.itemsReceived}
                    </p>
                  )}
                </div>
              ))}

              <Separator className="my-2" />
              <p className="text-sm text-muted-foreground">
                Total visits: {visits.length}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
