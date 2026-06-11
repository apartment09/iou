import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateGroup } from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui.js';

export function NewGroupPage() {
  const [name, setName] = useState('');
  const create = useCreateGroup();
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name },
      { onSuccess: (group) => navigate(`/groups/${group.id}`, { replace: true }) },
    );
  };

  return (
    <Shell title="New group" back="/">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label='Name (e.g. "Paris 2026", "Flat", "Anna & me")'>
            <TextInput
              required
              maxLength={80}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <ErrorText>{create.error?.message}</ErrorText>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            Create group
          </Button>
        </form>
        <p className="mt-4 text-xs text-faint">
          You can invite people afterwards via a share link — or keep it to yourself for personal
          expense tracking.
        </p>
      </Card>
    </Shell>
  );
}
