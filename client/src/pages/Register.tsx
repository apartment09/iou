import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStatus, useInvitePreview, useRegister } from '../api/hooks.js';
import { Button, Card, ErrorText, Field, TextInput } from '../components/ui.js';

export function RegisterPage() {
  const [params] = useSearchParams();
  const token = params.get('invite') ?? undefined;
  const { data: status } = useAuthStatus();
  const allowed = Boolean(token) || status?.needsSetup;

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="text-5xl">💸</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Splitt</h1>
      </div>
      {allowed ? (
        <RegisterForm token={token} />
      ) : (
        <Card>
          <p className="text-sm text-slate-600">
            Splitt is invite-only. Ask a member for an invite link, then come back.
          </p>
          <p className="mt-3 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-600">
              Sign in
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}

function RegisterForm({ token }: { token?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();
  const navigate = useNavigate();
  const preview = useInvitePreview(token ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate(
      { name, email, password, token },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  };

  return (
    <Card>
      {token && preview.data?.kind === 'group' && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {preview.data.inviterName} invited you to join{' '}
          <strong>{preview.data.groupName}</strong>. Create your account to get started.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          <TextInput required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {register.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </Card>
  );
}
