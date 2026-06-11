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
        {preview.isError || !preview.data ? (
          <p className="text-sm text-muted">This invite link is invalid or has expired.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              <strong>{preview.data.inviterName}</strong> invited you to join
            </p>
            <p className="mt-1 text-xl font-bold">{preview.data.groupName}</p>
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
              <div className="mt-4 space-y-3">
                <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="block">
                  <Button className="w-full">Sign in to join</Button>
                </Link>
                <p className="text-xs text-faint">
                  No account yet? Ask {preview.data.inviterName} (or the admin) to create one for
                  you, then come back to this link.
                </p>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
