import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import type { Client, Address, FamilyMember } from '@/types';

interface AddClientInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address: Address;
  familyMembers: FamilyMember[];
  notes?: string;
}

interface UpdateClientInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: Address;
  familyMembers?: FamilyMember[];
  notes?: string;
}

export function useClients() {
  const clients = useLiveQuery(() => db.clients.orderBy('lastName').toArray(), []);

  async function addClient(input: AddClientInput): Promise<Client> {
    const now = new Date().toISOString();
    // numberInFamily = the client themselves + family members listed
    const numberInFamily = 1 + (input.familyMembers?.length ?? 0);

    const client: Client = {
      id: crypto.randomUUID(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      address: input.address,
      familyMembers: input.familyMembers ?? [],
      numberInFamily,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.clients.add(client);
    enqueue('clients', client.id, 'upsert', client as unknown as Record<string, unknown>);
    return client;
  }

  async function updateClient(id: string, input: UpdateClientInput): Promise<void> {
    const updates: Partial<Client> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.firstName !== undefined) updates.firstName = input.firstName.trim();
    if (input.lastName !== undefined) updates.lastName = input.lastName.trim();
    if (input.phone !== undefined) updates.phone = input.phone.trim() || undefined;
    if (input.email !== undefined) updates.email = input.email.trim() || undefined;
    if (input.address !== undefined) updates.address = input.address;
    if (input.notes !== undefined) updates.notes = input.notes.trim() || undefined;
    if (input.familyMembers !== undefined) {
      updates.familyMembers = input.familyMembers;
      updates.numberInFamily = 1 + input.familyMembers.length;
    }

    await db.clients.update(id, updates);
    const updated = await db.clients.get(id);
    if (updated) {
      enqueue('clients', id, 'upsert', updated as unknown as Record<string, unknown>);
    }
  }

  async function deleteClient(id: string): Promise<void> {
    // Collect visit IDs before deleting so we can enqueue them
    const visits = await db.visits.where('clientId').equals(id).toArray();

    await db.transaction('rw', [db.clients, db.visits], async () => {
      await db.visits.where('clientId').equals(id).delete();
      await db.clients.delete(id);
    });

    enqueue('clients', id, 'delete');
    for (const visit of visits) {
      enqueue('visits', visit.id, 'delete');
    }
  }

  async function getClient(id: string): Promise<Client | undefined> {
    return db.clients.get(id);
  }

  /**
   * Checks for a potential duplicate client by first name, last name, and street.
   * Returns the matching client if found, or undefined.
   */
  async function checkDuplicate(
    firstName: string,
    lastName: string,
    street: string
  ): Promise<Client | undefined> {
    const normalizedFirst = firstName.trim().toLowerCase();
    const normalizedLast = lastName.trim().toLowerCase();
    const normalizedStreet = street.trim().toLowerCase();

    const candidates = await db.clients
      .where('[firstName+lastName]')
      .equals([firstName.trim(), lastName.trim()])
      .toArray();

    // Dexie compound index is case-sensitive, so also do a broader check
    if (candidates.length === 0) {
      const allClients = await db.clients.toArray();
      return allClients.find(
        (c) =>
          c.firstName.toLowerCase() === normalizedFirst &&
          c.lastName.toLowerCase() === normalizedLast &&
          c.address.street.toLowerCase() === normalizedStreet
      );
    }

    return candidates.find(
      (c) => c.address.street.toLowerCase() === normalizedStreet
    );
  }

  return {
    clients: clients ?? [],
    addClient,
    updateClient,
    deleteClient,
    getClient,
    checkDuplicate,
  };
}
