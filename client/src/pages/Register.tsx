import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStatus, useRegister } from '../api/hooks.js';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui.js';

/** Setup page: only the very first account self-registers (and becomes
 * admin). All other accounts are created by the admin. */
export function RegisterPage() {
  const { data: status } = useAuthStatus();

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="text-5xl">💸</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">IOU</h1>
      </div>
      {status?.needsSetup ? (
        <SetupForm />
      ) : (
        <Card>
          <p className="text-sm text-muted">
            Accounts on this server are created by the admin — ask them for one.
          </p>
          <p className="mt-3 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-accent">
              Sign in
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}

function SetupForm() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate(
      { name, username, password },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  };

  return (
    <Card>
      <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
        Welcome! This first account becomes the <strong>admin</strong> — it can create accounts
        for everyone else.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          <TextInput required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username">
          <TextInput
            autoComplete="username"
            autoCapitalize="none"
            required
            minLength={3}
            maxLength={30}
            placeholder="e.g. kai"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password (min. 8 characters)">
          <TextInput
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{register.error?.message}</ErrorText>
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? 'Creating account…' : 'Create admin account'}
        </Button>
      </form>
    </Card>
  );
}
