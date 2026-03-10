import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/db/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, X, Save, AlertTriangle } from 'lucide-react';
import { FamilyMemberList } from './FamilyMemberList';
import type { Client, FamilyMember, Address } from '@/types';

const EMPTY_ADDRESS: Address = {
  street: '',
  city: '',
  state: 'TX',
  zip: '',
};

export function ClientForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState<Address>({ ...EMPTY_ADDRESS });
  const [notes, setNotes] = useState('');
  const [acceptsPerishables, setAcceptsPerishables] = useState(true);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  // Family size override
  const [overrideFamilySize, setOverrideFamilySize] = useState(false);
  const [manualFamilySize, setManualFamilySize] = useState(1);

  // Duplicate detection
  const [duplicate, setDuplicate] = useState<Client | null>(null);
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);

  // Calculated family size
  const calculatedFamilySize = 1 + familyMembers.length;
  const effectiveFamilySize = overrideFamilySize ? manualFamilySize : calculatedFamilySize;

  // Load existing client data for edit mode
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function loadClient() {
      const client = await db.clients.get(id!);
      if (cancelled) return;

      if (!client) {
        navigate('/clients', { replace: true });
        return;
      }

      setFirstName(client.firstName);
      setLastName(client.lastName);
      setPhone(client.phone ?? '');
      setEmail(client.email ?? '');
      setAddress(client.address ?? { ...EMPTY_ADDRESS });
      setNotes(client.notes ?? '');
      setAcceptsPerishables(client.acceptsPerishables !== false);
      setFamilyMembers(client.familyMembers ?? []);

      // Check if family size was manually overridden
      const autoSize = 1 + (client.familyMembers ?? []).length;
      if (client.numberInFamily !== autoSize) {
        setOverrideFamilySize(true);
        setManualFamilySize(client.numberInFamily);
      }

      setLoading(false);
    }

    loadClient();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // Duplicate detection on name blur
  async function checkForDuplicate() {
    if (!firstName.trim() || !lastName.trim()) return;
    if (isEdit) return; // Don't check duplicates when editing

    setDismissedDuplicate(false);

    const normalizedFirst = firstName.trim().toLowerCase();
    const normalizedLast = lastName.trim().toLowerCase();
    const normalizedStreet = address.street.trim().toLowerCase();

    const allClients = await db.clients.toArray();
    const match = allClients.find(
      (c) =>
        c.firstName.toLowerCase() === normalizedFirst &&
        c.lastName.toLowerCase() === normalizedLast &&
        (normalizedStreet === '' || (c.address?.street ?? '').toLowerCase() === normalizedStreet)
    );

    setDuplicate(match ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) return;

    setSaving(true);

    try {
      const now = new Date().toISOString();
      const clientData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: {
          street: address.street.trim(),
          city: address.city.trim(),
          state: address.state.trim() || 'TX',
          zip: address.zip.trim(),
        },
        familyMembers: familyMembers.filter((m) => m.name.trim() !== ''),
        numberInFamily: effectiveFamilySize,
        notes: notes.trim() || undefined,
        acceptsPerishables: acceptsPerishables ? undefined : false,
      };

      if (isEdit && id) {
        await db.clients.update(id, {
          ...clientData,
          updatedAt: now,
        });
        navigate('/');
      } else {
        const newClient: Client = {
          id: crypto.randomUUID(),
          ...clientData,
          createdAt: now,
          updatedAt: now,
        };
        await db.clients.add(newClient);
        navigate(`/clients/${newClient.id}`);
      }
    } catch {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">
          {isEdit ? 'Edit Client' : 'Add Client'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={checkForDuplicate}
                  required
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={checkForDuplicate}
                  required
                  placeholder="Last name"
                />
              </div>
            </div>

            {/* Duplicate Warning */}
            {duplicate && !dismissedDuplicate && (
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
                <AlertTriangle className="size-4 text-yellow-600" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span className="text-yellow-800 dark:text-yellow-200">
                    A client named {duplicate.firstName} {duplicate.lastName}
                    {duplicate.address?.street && ` at ${duplicate.address.street}`} already exists.
                    Continue anyway?
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDismissedDuplicate(true)}
                  >
                    <X className="size-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsPerishables}
                onChange={(e) => setAcceptsPerishables(e.target.checked)}
                className="rounded border-input"
              />
              Can receive perishable foods
            </label>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="street">Street</Label>
              <Input
                id="street"
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  placeholder="Austin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value })}
                  placeholder="TX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">Zip</Label>
                <Input
                  id="zip"
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  placeholder="78701"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this client..."
            />
          </CardContent>
        </Card>

        {/* Family Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Family Members</span>
              <span className="text-sm font-normal text-muted-foreground">
                Family size: {effectiveFamilySize}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FamilyMemberList
              members={familyMembers}
              onChange={setFamilyMembers}
            />

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideFamilySize}
                  onChange={(e) => {
                    setOverrideFamilySize(e.target.checked);
                    if (e.target.checked) {
                      setManualFamilySize(calculatedFamilySize);
                    }
                  }}
                  className="rounded border-input"
                />
                Override family size
              </label>
              {overrideFamilySize && (
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={manualFamilySize}
                  onChange={(e) => setManualFamilySize(parseInt(e.target.value, 10) || 1)}
                  className="w-20"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !firstName.trim() || !lastName.trim()}>
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save Client'}
          </Button>
        </div>
      </form>
    </div>
  );
}
