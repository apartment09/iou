import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChangePassword, useLogout, useMe } from '../api/hooks.js';
import { Shell, ThemeToggle } from '../components/Layout.js';
import { Avatar, Button, Card, ErrorText, Field, Spinner, TextInput } from '../components/ui.js';

export function AccountPage() {
  const { data: me } = useMe();
  const change = useChangePassword();
  const logout = useLogout();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saved, setSaved] = useState(false);

  if (!me) {
    return (
      <Shell title="Account" back="/">
        <Spinner />
      </Shell>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setSaved(true);
          setCurrentPassword('');
          setNewPassword('');
        },
      },
    );
  };

  return (
    <Shell title="Account" back="/">
      <div className="space-y-4">
        <Card className="flex items-center gap-3">
          <Avatar name={me.name} />
          <div>
            <p className="font-semibold">{me.name}</p>
            <p className="text-xs text-faint">
              @{me.username}
              {me.isAdmin ? ' · admin' : ''}
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-muted">Change password</h2>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Current password">
              <TextInput
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label="New password (min. 8 characters)">
              <TextInput
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <ErrorText>{change.error?.message}</ErrorText>
            {saved && (
              <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
                Password changed ✓
              </p>
            )}
            <Button type="submit" className="w-full" disabled={change.isPending}>
              {change.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">Appearance</h2>
          <ThemeToggle variant="row" />
        </Card>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
        >
          Sign out
        </Button>
      </div>
    </Shell>
  );
}
