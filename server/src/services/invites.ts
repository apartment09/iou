import type { InvitePreviewDto, UserDto } from '@splitt/shared';
import { badRequest, forbidden, notFound } from '../errors.js';
import { isoInDays, newToken, nowIso } from '../util.js';
import type { InviteRepository, InviteRow } from '../repositories/invites.js';
import type { GroupRepository } from '../repositories/groups.js';
import type { UserRepository } from '../repositories/users.js';
import type { ActivityRepository } from '../repositories/activity.js';
import { config } from '../config.js';

export class InviteService {
  constructor(
    private readonly invites: InviteRepository,
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
    private readonly activity: ActivityRepository,
  ) {}

  /** Account invites are single-use; group invites are shareable links,
   * reusable until they expire. */
  create(actor: UserDto, kind: 'account' | 'group', groupId?: number) {
    if (kind === 'group') {
      if (!groupId) throw badRequest('groupId is required for group invites');
      const membership = this.groups.findMember(groupId, actor.id);
      if (!membership || membership.left_at) throw notFound('Group not found');
      const group = this.groups.findById(groupId);
      if (!group || group.archived_at) throw badRequest('Group is archived');
    }
    const token = newToken();
    const expiresAt = isoInDays(config.inviteTtlDays);
    this.invites.create({
      token,
      kind,
      groupId: kind === 'group' ? groupId! : null,
      createdBy: actor.id,
      now: nowIso(),
      expiresAt,
    });
    return { token, kind, groupId: kind === 'group' ? groupId! : null, expiresAt };
  }

  preview(token: string): InvitePreviewDto {
    const invite = this.requireValid(token);
    const group = invite.group_id ? this.groups.findById(invite.group_id) : undefined;
    const inviter = this.users.findById(invite.created_by);
    return {
      kind: invite.kind,
      groupId: invite.group_id,
      groupName: group?.name ?? null,
      inviterName: inviter?.name ?? 'Unknown',
    };
  }

  /** A signed-in user accepts a group invite. */
  accept(token: string, user: UserDto): { groupId: number } {
    const invite = this.requireValid(token);
    if (invite.kind !== 'group' || !invite.group_id) {
      throw badRequest('This invite is for creating an account — you already have one');
    }
    this.join(invite.group_id, user.id);
    return { groupId: invite.group_id };
  }

  /** Used by AuthService during registration (inside its transaction). */
  validateForRegistration(token: string | undefined): InviteRow {
    if (!token) throw forbidden('Registration requires an invite');
    return this.requireValid(token);
  }

  consumeForNewUser(invite: InviteRow, userId: number, now: string): void {
    if (invite.kind === 'account') this.invites.markUsed(invite.id, userId, now);
    if (invite.kind === 'group' && invite.group_id) this.join(invite.group_id, userId);
  }

  private join(groupId: number, userId: number): void {
    const group = this.groups.findById(groupId);
    if (!group || group.archived_at) throw notFound('Group not found');
    const existing = this.groups.findMember(groupId, userId);
    const now = nowIso();
    if (existing && !existing.left_at) return; // already a member — joining twice is fine
    if (existing) this.groups.reactivateMember(groupId, userId, now);
    else this.groups.addMember(groupId, userId, 'member', now);
    const user = this.users.findById(userId);
    this.activity.add(groupId, userId, 'member_joined', null, { userName: user?.name }, now);
  }

  private requireValid(token: string): InviteRow {
    const invite = this.invites.findByToken(token);
    const valid =
      invite &&
      invite.expires_at > nowIso() &&
      (invite.kind === 'group' || invite.used_at === null);
    if (!valid) throw notFound('This invite link is invalid or has expired');
    return invite;
  }
}
