import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { ArrowLeft, Phone, Mail, Trash2, Pencil, Clock, Briefcase, CalendarDays } from 'lucide-react';
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
import { formatDate, formatSlot } from '@/utils/dateHelpers';

export function VolunteerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const volunteer = useLiveQuery(
    () => (id ? db.volunteers.get(id) : undefined),
    [id]
  );

  const shifts = useLiveQuery(
    () =>
      id
        ? db.volunteerShifts
            .where('volunteerId')
            .equals(id)
            .toArray()
            .then((s) => s.sort((a, b) => b.date.localeCompare(a.date)))
        : [],
    [id]
  );

  if (volunteer === undefined || shifts === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (volunteer === null) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Volunteer not found.</p>
        </div>
      </div>
    );
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await db.transaction('rw', [db.volunteers, db.volunteerShifts, db.volunteerSignups], async () => {
        await db.volunteerShifts.where('volunteerId').equals(id).delete();
        await db.volunteerSignups.where('volunteerId').equals(id).delete();
        await db.volunteers.delete(id);
      });
      navigate('/volunteers');
    } catch {
      setDeleting(false);
    }
  }

  const fullName = `${volunteer.firstName} ${volunteer.lastName}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/volunteers/${id}/edit`}>
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
                <DialogTitle>Delete Volunteer</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete {fullName}? This will also delete all
                  their shift records. This action cannot be undone.
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

      {/* Volunteer Info */}
      <div>
        <h1 className="text-2xl font-bold">{fullName}</h1>

        <div className="mt-4 space-y-2">
          {volunteer.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="size-4 text-muted-foreground shrink-0" />
              <a href={`tel:${volunteer.phone}`} className="text-primary hover:underline">
                {volunteer.phone}
              </a>
            </div>
          )}

          {volunteer.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${volunteer.email}`} className="text-primary hover:underline">
                {volunteer.email}
              </a>
            </div>
          )}
        </div>

        {volunteer.recurringSlots && volunteer.recurringSlots.length > 0 ? (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span>Regular: {volunteer.recurringSlots.map(formatSlot).join(', ')}</span>
          </div>
        ) : volunteer.recurringDays && volunteer.recurringDays.length > 0 ? (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span>Regular: Every {volunteer.recurringDays.join(' & ')}</span>
          </div>
        ) : null}

        {volunteer.notes && (
          <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
            <span className="font-medium">Notes: </span>
            {volunteer.notes}
          </div>
        )}
      </div>

      <Separator />

      {/* Shift History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5" />
            Shift History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts recorded</p>
          ) : (
            <div className="space-y-2">
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{formatDate(shift.date)}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({shift.dayOfWeek})
                    </span>
                    {shift.role && (
                      <Badge variant="outline" className="ml-2">
                        <Briefcase className="size-3 mr-1" />
                        {shift.role}
                      </Badge>
                    )}
                  </div>
                  {shift.hoursWorked !== undefined && (
                    <span className="text-sm text-muted-foreground shrink-0 ml-2">
                      {shift.hoursWorked}h
                    </span>
                  )}
                </div>
              ))}

              <Separator className="my-2" />
              <p className="text-sm text-muted-foreground">
                Total shifts: {shifts.length}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
