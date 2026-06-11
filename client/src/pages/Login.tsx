import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStatus, useLogin } from '../api/hooks.js';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui.js';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const { data: status } = useAuthStatus();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => navigate(next, { replace: true }) });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="text-5xl">💸</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Splitt</h1>
        <p className="mt-1 text-sm text-slate-500">Shared expenses, settled simply.</p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <TextInput
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorText>{login.error?.message}</ErrorText>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
      {status?.needsSetup && (
        <p className="mt-4 text-center text-sm text-slate-500">
          First time here?{' '}
          <Link to="/register" className="font-semibold text-emerald-600">
            Create the first account
          </Link>
        </p>
      )}
      {!status?.needsSetup && (
        <p className="mt-4 text-center text-sm text-slate-400">
          No account yet? Ask the admin to create one for you.
        </p>
      )}
    </div>
  );
}
