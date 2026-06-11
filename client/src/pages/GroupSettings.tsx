import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useArchiveGroup,
  useCreateCategory,
  useCreateInvite,
  useGroup,
  useLeaveGroup,
  useMe,
  useRemoveMember,
  useRenameGroup,
} from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { Avatar, Button, Card, ErrorText, Field, Spinner, TextInput } from '../components/ui.js';

export function GroupSettingsPage() {
  const groupId = Number(useParams().groupId);
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const navigate = useNavigate();

  const rename = useRenameGroup(groupId);
  const archive = useArchiveGroup(groupId);
  const leave = useLeaveGroup(groupId);
  const removeMember = useRemoveMember(groupId);
  const createInvite = useCreateInvite();
  const createCategory = useCreateCategory(groupId);

  const [name, setName] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('');

  if (!group || !me) {
    return (
      <Shell title="Settings" back="">
        <Spinner />
      </Shell>
    );
  }

  const myRole = group.members.find((m) => m.userId === me.id)?.role;
  const isOwner = myRole === 'owner';
  const activeMembers = group.members.filter((m) => m.leftAt === null);
  const archived = Boolean(group.archivedAt);

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    if (name !== null && name.trim()) rename.mutate({ name: name.trim() });
  };

  const makeInvite = () => {
    createInvite.mutate(
      { kind: 'group', groupId },
      {
        onSuccess: (invite) => {
          setInviteUrl(`${window.location.origin}/invite/${invite.token}`);
          setCopied(false);
        },
      },
    );
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  };

  const addCategory = (e: FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    createCategory.mutate(
      { name: categoryName.trim(), icon: categoryIcon.trim() || '🏷️' },
      { onSuccess: () => { setCategoryName(''); setCategoryIcon(''); } },
    );
  };

  return (
    <Shell title="Group settings" back={`/groups/${groupId}`}>
      <div className="space-y-4">
        {isOwner && !archived && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-600">Name</h2>
            <form onSubmit={submitRename} className="flex gap-2">
              <TextInput
                maxLength={80}
                value={name ?? group.name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={rename.isPending || name === null}>
                Save
              </Button>
            </form>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-600">
            Members ({activeMembers.length})
          </h2>
          <ul className="space-y-2.5">
            {activeMembers.map((member) => (
              <li key={member.userId} className="flex items-center gap-3">
                <Avatar name={member.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.name}
                  {member.userId === me.id && <span className="text-slate-400"> (you)</span>}
                  {member.role === 'owner' && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      owner
                    </span>
                  )}
                </span>
                {isOwner && member.userId !== me.id && !archived && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${member.name} from the group?`)) {
                        removeMember.mutate(member.userId);
                      }
                    }}
                    className="text-xs font-semibold text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <ErrorText>{removeMember.error?.message}</ErrorText>

          {!archived && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              {inviteUrl ? (
                <div>
                  <p className="mb-2 text-xs text-slate-500">
                    Share this link — it works for new and existing accounts and expires in 14 days:
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      onFocus={(e) => e.target.select()}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                    />
                    <Button type="button" variant="secondary" onClick={copyInvite}>
                      {copied ? '✓' : 'Copy'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={makeInvite}
                  disabled={createInvite.isPending}
                >
                  🔗 Create invite link
                </Button>
              )}
              <ErrorText>{createInvite.error?.message}</ErrorText>
            </div>
          )}
        </Card>

        {!archived && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-600">Add a category</h2>
            <form onSubmit={addCategory} className="flex gap-2">
              <TextInput
                placeholder="Icon"
                maxLength={4}
                value={categoryIcon}
                onChange={(e) => setCategoryIcon(e.target.value)}
                className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-2.5 text-center outline-none focus:border-emerald-500"
              />
              <TextInput
                placeholder="Name"
                maxLength={40}
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={createCategory.isPending}>
                Add
              </Button>
            </form>
            <ErrorText>{createCategory.error?.message}</ErrorText>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-red-600">Danger zone</h2>
          {!isOwner && (
            <>
              <Button
                variant="danger"
                className="w-full"
                disabled={leave.isPending}
                onClick={() => {
                  if (window.confirm('Leave this group?')) {
                    leave.mutate(undefined, { onSuccess: () => navigate('/') });
                  }
                }}
              >
                Leave group
              </Button>
              <ErrorText>{leave.error?.message}</ErrorText>
            </>
          )}
          {isOwner && !archived && (
            <>
              <Button
                variant="danger"
                className="w-full"
                disabled={archive.isPending}
                onClick={() => {
                  if (window.confirm('Archive this group? It becomes read-only.')) {
                    archive.mutate(undefined, { onSuccess: () => navigate('/') });
                  }
                }}
              >
                Archive group
              </Button>
              <ErrorText>{archive.error?.message}</ErrorText>
            </>
          )}
          {isOwner && archived && <p className="text-sm text-slate-400">This group is archived.</p>}
        </Card>
      </div>
    </Shell>
  );
}
