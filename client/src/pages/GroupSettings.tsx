import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  useAddMember,
  useAllUsers,
  useArchiveGroup,
  useCategories,
  useCreateCategory,
  useCreateInvite,
  useDeleteCategory,
  useDeleteRecurring,
  useGroup,
  useLeaveGroup,
  useMe,
  useRecurring,
  useRemoveMember,
  useRenameGroup,
  useUpdateCategory,
} from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { CategoryIcon, IconPicker } from '../components/CategoryIcon.js';
import { Avatar, Button, Card, ErrorText, Field, Select, Spinner, TextInput } from '../components/ui.js';
import { formatDay, money } from '../lib/format.js';

export function GroupSettingsPage() {
  const groupId = Number(useParams().groupId);
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const navigate = useNavigate();

  const rename = useRenameGroup(groupId);
  const archive = useArchiveGroup(groupId);
  const leave = useLeaveGroup(groupId);
  const addMember = useAddMember(groupId);
  const removeMember = useRemoveMember(groupId);
  const { data: allUsers } = useAllUsers();
  const createInvite = useCreateInvite();

  const [name, setName] = useState<string | null>(null);
  const [userToAdd, setUserToAdd] = useState<number | ''>('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      { groupId },
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

  return (
    <Shell title="Group settings" back={`/groups/${groupId}`}>
      <div className="space-y-4">
        {isOwner && !archived && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-muted">Name</h2>
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
          <h2 className="mb-3 text-sm font-semibold text-muted">
            Members ({activeMembers.length})
          </h2>
          <ul className="space-y-2.5">
            {activeMembers.map((member) => (
              <li key={member.userId} className="flex items-center gap-3">
                <Avatar name={member.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.name}
                  {member.userId === me.id && <span className="text-faint"> (you)</span>}
                  {member.role === 'owner' && (
                    <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                      owner
                    </span>
                  )}
                </span>
                {member.userId !== me.id && member.role !== 'owner' && !archived && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${member.name} from the group?`)) {
                        removeMember.mutate(member.userId);
                      }
                    }}
                    className="text-xs font-semibold text-neg hover:text-neg"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <ErrorText>{removeMember.error?.message}</ErrorText>

          {!archived && (() => {
            const candidates =
              allUsers?.filter((u) => !activeMembers.some((m) => m.userId === u.id)) ?? [];
            if (candidates.length === 0) return null;
            return (
              <div className="mt-4 border-t border-edge pt-4">
                <div className="flex gap-2">
                  <Select
                    value={userToAdd}
                    onChange={(e) => setUserToAdd(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Add someone…</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (@{u.username})
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={userToAdd === '' || addMember.isPending}
                    onClick={() => {
                      if (userToAdd === '') return;
                      addMember.mutate(userToAdd, { onSuccess: () => setUserToAdd('') });
                    }}
                  >
                    Add
                  </Button>
                </div>
                <ErrorText>{addMember.error?.message}</ErrorText>
              </div>
            );
          })()}

          {!archived && (
            <div className="mt-4 border-t border-edge pt-4">
              {inviteUrl ? (
                <div>
                  <p className="mb-2 text-xs text-muted">
                    Share this link — anyone with an account on this server can join. Expires in
                    14 days:
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      onFocus={(e) => e.target.select()}
                      className="w-full rounded-lg border border-edge bg-surface-2 px-2 py-1.5 text-xs text-muted"
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

        {!archived && <RecurringCard groupId={groupId} />}

        {!archived && <CategoriesCard groupId={groupId} />}

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neg">Danger zone</h2>
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
          {isOwner && archived && <p className="text-sm text-faint">This group is archived.</p>}
        </Card>
      </div>
    </Shell>
  );
}

function RecurringCard({ groupId }: { groupId: number }) {
  const { data: templates } = useRecurring(groupId);
  const remove = useDeleteRecurring(groupId);

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-muted">Recurring expenses</h2>
      {templates && templates.length > 0 ? (
        <ul className="divide-y divide-edge">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center gap-3 py-2">
              <span className="text-faint">
                <Repeat className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{template.title}</p>
                <p className="text-xs text-faint">
                  {money(template.amountCents)} · {template.frequency === 'monthly' ? 'monthly' : 'weekly'} · next{' '}
                  {formatDay(template.nextDate)}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete ${template.title}`}
                onClick={() => {
                  if (window.confirm(`Stop "${template.title}"? Already created expenses stay.`)) {
                    remove.mutate(template.id);
                  }
                }}
                className="rounded-lg p-1.5 text-faint hover:bg-neg-soft hover:text-neg"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-faint">Rent, internet, subscriptions — added automatically.</p>
      )}
      <ErrorText>{remove.error?.message}</ErrorText>
      <Link to={`/groups/${groupId}/recurring/new`} className="mt-3 block">
        <Button type="button" variant="secondary" className="w-full">
          + New recurring expense
        </Button>
      </Link>
    </Card>
  );
}

function CategoriesCard({ groupId }: { groupId: number }) {
  const { data: categories } = useCategories(groupId);
  const create = useCreateCategory(groupId);
  const update = useUpdateCategory(groupId);
  const remove = useDeleteCategory(groupId);

  // editingId null = closed form, 0 = creating new, >0 = editing that category
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('tag');

  const openFor = (id: number, name: string, icon: string) => {
    setEditingId(id);
    setFormName(name);
    setFormIcon(icon);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || editingId === null) return;
    const close = { onSuccess: () => setEditingId(null) };
    if (editingId === 0) create.mutate({ name: formName.trim(), icon: formIcon }, close);
    else update.mutate({ id: editingId, name: formName.trim(), icon: formIcon }, close);
  };

  const deleteCategory = (id: number, name: string) => {
    if (window.confirm(`Delete "${name}"? Expenses using it keep their data and show as "Default".`)) {
      if (editingId === id) setEditingId(null);
      remove.mutate(id);
    }
  };

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-muted">Categories</h2>
      <ul className="divide-y divide-edge">
        {categories?.map((category) => (
          <li key={category.id} className="flex items-center gap-3 py-2">
            <span className="text-muted">
              <CategoryIcon name={category.icon} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
            <button
              type="button"
              aria-label={`Edit ${category.name}`}
              onClick={() => openFor(category.id, category.name, category.icon)}
              className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-muted"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Delete ${category.name}`}
              onClick={() => deleteCategory(category.id, category.name)}
              className="rounded-lg p-1.5 text-faint hover:bg-neg-soft hover:text-neg"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <ErrorText>{remove.error?.message}</ErrorText>

      {editingId === null ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => openFor(0, '', 'tag')}
        >
          + New category
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-md bg-surface-2 p-3">
          <Field label={editingId === 0 ? 'New category' : 'Edit category'}>
            <TextInput
              required
              maxLength={40}
              placeholder="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </Field>
          <IconPicker value={formIcon} onChange={setFormIcon} />
          <ErrorText>{create.error?.message ?? update.error?.message}</ErrorText>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={create.isPending || update.isPending}>
              {editingId === 0 ? 'Add' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
