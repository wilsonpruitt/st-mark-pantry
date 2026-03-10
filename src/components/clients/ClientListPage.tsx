import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { searchClients } from '@/utils/search';

export function ClientListPage() {
  const [query, setQuery] = useState('');

  const allClients = useLiveQuery(
    () => db.clients.orderBy('lastName').toArray(),
    []
  );

  if (allClients === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const clients = searchClients(allClients, query);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Clients</h1>
          <span className="text-muted-foreground text-sm">
            ({allClients.length} client{allClients.length !== 1 ? 's' : ''})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link to="/clients/new">
              <UserPlus className="size-4" />
              Add Client
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search clients by name, phone, or address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Client List */}
      {allClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            No clients yet. Add your first client to get started.
          </p>
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">
            No clients match "{query}"
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((client) => (
            <Link key={client.id} to={`/clients/${client.id}`}>
              <Card className="py-3 px-4 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {client.firstName} {client.lastName}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        Family: {client.numberInFamily}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                      {client.phone && <span>{client.phone}</span>}
                      {client.address?.city && client.address?.state && (
                        <span>
                          {client.address.city}, {client.address.state}
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
