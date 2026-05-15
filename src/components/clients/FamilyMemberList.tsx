import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import type { FamilyMember } from '@/types';
import { ageToDob, approxAgeFromDob } from '@/lib/family';

interface FamilyMemberListProps {
  members: FamilyMember[];
  onChange: (members: FamilyMember[]) => void;
}

const RELATIONSHIP_OPTIONS = [
  'spouse',
  'child',
  'parent',
  'sibling',
  'grandchild',
  'other',
] as const;

export function FamilyMemberList({ members, onChange }: FamilyMemberListProps) {
  function addMember() {
    onChange([...members, { name: '', relationship: '', dateOfBirth: undefined }]);
  }

  function setAge(index: number, ageStr: string) {
    const updated = members.map((member, i) => {
      if (i !== index) return member;
      if (ageStr === '') {
        return { name: member.name, relationship: member.relationship };
      }
      const age = parseInt(ageStr, 10);
      if (Number.isNaN(age) || age < 0) return member;
      return {
        ...member,
        dateOfBirth: ageToDob(age, new Date().getFullYear()),
        dobEstimated: true,
      };
    });
    onChange(updated);
  }

  function removeMember(index: number) {
    onChange(members.filter((_, i) => i !== index));
  }

  function updateMember(index: number, field: keyof FamilyMember, value: string | number | undefined) {
    const updated = members.map((member, i) => {
      if (i !== index) return member;
      return { ...member, [field]: value };
    });
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      {members.map((member, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Name"
              value={member.name}
              onChange={(e) => updateMember(index, 'name', e.target.value)}
            />
          </div>
          <div className="w-32 shrink-0">
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={member.relationship ?? ''}
              onChange={(e) => updateMember(index, 'relationship', e.target.value || undefined)}
            >
              <option value="">Relation</option>
              {RELATIONSHIP_OPTIONS.map((rel) => (
                <option key={rel} value={rel}>
                  {rel.charAt(0).toUpperCase() + rel.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-20 shrink-0">
            <Input
              type="number"
              placeholder="Age"
              min={0}
              max={150}
              value={member.dateOfBirth ? approxAgeFromDob(member.dateOfBirth) : ''}
              onChange={(e) => setAge(index, e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-w-[44px] min-h-[44px] shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeMember(index)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addMember}
        className="mt-1"
      >
        <Plus className="size-4" />
        Add Family Member
      </Button>
    </div>
  );
}
