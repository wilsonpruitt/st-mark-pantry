import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { Search, UserPlus, Phone, Mail, ClipboardCheck, CalendarDays, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { searchVolunteers } from '@/utils/search';
import { formatDate, formatSlot } from '@/utils/dateHelpers';

export function VolunteerListPage() {
  const [query, setQuery] = useState('');

  const allVolunteers = useLiveQuery(
    () => db.volunteers.orderBy('lastName').toArray(),
    []
  );

  if (allVolunteers === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const displayList =
    query.trim().length >= 2 ? searchVolunteers(allVolunteers, query) : allVolunteers;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Volunteers</h1>
            <span className="text-muted-foreground text-sm">
              ({allVolunteers.length} volunteer{allVolunteers.length !== 1 ? 's' : ''})
            </span>
          </div>
          <Button asChild>
            <Link to="/volunteers/new">
              <UserPlus className="size-4" />
              Add
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <Button variant="outline" size="sm" asChild>
            <Link to="/volunteers/calendar">
              <Calendar className="size-4" />
              Calendar
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/volunteers/schedule">
              <CalendarDays className="size-4" />
              Schedule
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/volunteers/checkin">
              <ClipboardCheck className="size-4" />
              Check In
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search volunteers by name, phone, or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Volunteer List */}
      {allVolunteers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            No volunteers yet. Add your first volunteer to get started.
          </p>
        </div>
      ) : query.trim().length >= 2 && displayList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">
            No volunteers match &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayList.map((volunteer) => (
            <Link key={volunteer.id} to={`/volunteers/${volunteer.id}`}>
              <Card className="py-3 px-4 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">
                        {volunteer.firstName} {volunteer.lastName}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        Since {formatDate(volunteer.createdAt)}
                      </Badge>
                      {volunteer.recurringSlots && volunteer.recurringSlots.length > 0 ? (
                        volunteer.recurringSlots.map((slot) => (
                          <Badge key={slot} variant="outline" className="shrink-0 text-xs">
                            {formatSlot(slot)}
                          </Badge>
                        ))
                      ) : (
                        <>
                          {volunteer.recurringDays?.includes('Monday') && (
                            <Badge variant="outline" className="shrink-0">Every Mon</Badge>
                          )}
                          {volunteer.recurringDays?.includes('Friday') && (
                            <Badge variant="outline" className="shrink-0">Every Fri</Badge>
                          )}
                          {volunteer.recurringDays?.includes('Saturday') && (
                            <Badge variant="outline" className="shrink-0">Every Sat</Badge>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                      {volunteer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" />
                          {volunteer.phone}
                        </span>
                      )}
                      {volunteer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3" />
                          {volunteer.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
