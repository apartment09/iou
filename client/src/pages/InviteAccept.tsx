import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite, useInvitePreview, useMe } from '../api/hooks.js';
import { Button, Card, ErrorText, Spinner } from '../components/ui.js';

export function InviteAcceptPage() {
  const { token = '' } = useParams();
  const { data: me, isPending: mePending } = useMe();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();
  const navigate = useNavigate();

  if (mePending || preview.isPending) return <Spinner />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center text-5xl">💌</div>
      <Card>
        {preview.isError ? (
          <p className="text-sm text-slate-600">This invite link is invalid or has expired.</p>
        ) : preview.data!.kind === 'group' ? (
          <>
            <p className="text-sm text-slate-600">
              <strong>{preview.data!.inviterName}</strong> invited you to join
            </p>
            <p className="mt-1 text-xl font-bold">{preview.data!.groupName}</p>
            <ErrorText>{accept.error?.message}</ErrorText>
            {me ? (
              <Button
                className="mt-4 w-full"
                disabled={accept.isPending}
                onClick={() =>
                  accept.mutate(token, {
                    onSuccess: ({ groupId }) => navigate(`/groups/${groupId}`, { replace: true }),
                  })
                }
              >
                Join as {me.name}
              </Button>
            ) : (
              <div className="mt-4 space-y-2">
                <Link to={`/register?invite=${token}`} className="block">
                  <Button className="w-full">Create account & join</Button>
                </Link>
                <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="block">
                  <Button variant="secondary" className="w-full">
                    I already have an account
                  </Button>
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              <strong>{preview.data!.inviterName}</strong> invited you to Splitt.
            </p>
            {me ? (
              <p className="mt-3 text-sm text-slate-500">You already have an account — you're all set.</p>
            ) : (
              <Link to={`/register?invite=${token}`} className="mt-4 block">
                <Button className="w-full">Create account</Button>
              </Link>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
