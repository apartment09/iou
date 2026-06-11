import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useCreateUser, useMe, useResetPassword, useUsers } from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { Avatar, Button, Card, ErrorText, Field, Spinner, TextInput } from '../components/ui.js';

export function AdminUsersPage() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Spinner />;
  if (!me?.isAdmin) return <Navigate to="/" replace />;

  return (
    <Shell title="Users" back="/">
      <div className="space-y-4">
        <CreateUserCard />
        <UserListCard />
      </div>
    </Shell>
  );
}

function CreateUserCard() {
  const create = useCreateUser();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [lastCreated, setLastCreated] = useState<{ name: string; username: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name, username, password },
      {
        onSuccess: (user) => {
          setLastCreated({ name: user.name, username: user.username });
          setName('');
          setUsername('');
          setPassword('');
        },
      },
    );
  };

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-muted">Create account</h2>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <TextInput required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <TextInput
              required
              minLength={3}
              maxLength={30}
              autoCapitalize="none"
              placeholder="e.g. anna"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Initial password">
            <TextInput
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <ErrorText>{create.error?.message}</ErrorText>
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      {lastCreated && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          Account for <strong>{lastCreated.name}</strong> created. Tell them their username
          (<strong>{lastCreated.username}</strong>) and the password — they can change it under
          "Account" after signing in.
        </p>
      )}
    </Card>
  );
}

function UserListCard() {
  const { data: users, isPending } = useUsers();
  const reset = useResetPassword();
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetDone, setResetDone] = useState<string | null>(null);

  const submitReset = (e: FormEvent, userId: number, name: string) => {
    e.preventDefault();
    reset.mutate(
      { userId, password: newPassword },
      {
        onSuccess: () => {
          setResetUserId(null);
          setNewPassword('');
          setResetDone(name);
        },
      },
    );
  };

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-muted">
        All accounts{users ? ` (${users.length})` : ''}
      </h2>
      {isPending ? (
        <Spinner />
      ) : (
        <ul className="space-y-2.5">
          {users?.map((user) => (
            <li key={user.id}>
              <div className="flex items-center gap-3">
                <Avatar name={user.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {user.name}
                  <span className="ml-2 text-xs text-faint">@{user.username}</span>
                </span>
                {user.isAdmin && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                    admin
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResetUserId(resetUserId === user.id ? null : user.id);
                    setNewPassword('');
                    setResetDone(null);
                  }}
                  className="text-xs font-semibold text-faint hover:text-muted"
                >
                  Reset password
                </button>
              </div>
              {resetUserId === user.id && (
                <form
                  onSubmit={(e) => submitReset(e, user.id, user.name)}
                  className="mt-2 flex gap-2 rounded-md bg-surface-2 p-2"
                >
                  <TextInput
                    required
                    minLength={8}
                    placeholder="New password (min. 8 chars)"
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" disabled={reset.isPending}>
                    Set
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{reset.error?.message}</ErrorText>
      {resetDone && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          Password for <strong>{resetDone}</strong> reset — tell them the new one; they can change
          it under "Account".
        </p>
      )}
    </Card>
  );
}
