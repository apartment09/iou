import type { InvitePreviewDto, UserDto } from '@iou/shared';
import { badRequest, notFound } from '../errors.js';
import { isoInDays, newToken, nowIso } from '../util.js';
import type { InviteRepository, InviteRow } from '../repositories/invites.js';
import type { GroupRepository } from '../repositories/groups.js';
import type { UserRepository } from '../repositories/users.js';
import type { ActivityRepository } from '../repositories/activity.js';
import { config } from '../config.js';

/** Group invite links: shareable, reusable until they expire, usable by
 * anyone who has an account on this server. */
export class InviteService {
  constructor(
    private readonly invites: InviteRepository,
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
    private readonly activity: ActivityRepository,
  ) {}

  create(actor: UserDto, groupId: number) {
    const membership = this.groups.findMember(groupId, actor.id);
    if (!membership || membership.left_at) throw notFound('Group not found');
    const group = this.groups.findById(groupId);
    if (!group || group.archived_at) throw badRequest('Group is archived');
    const token = newToken();
    const expiresAt = isoInDays(config.inviteTtlDays);
    this.invites.create({ token, groupId, createdBy: actor.id, now: nowIso(), expiresAt });
    return { token, groupId, expiresAt };
  }

  preview(token: string): InvitePreviewDto {
    const invite = this.requireValid(token);
    const group = this.groups.findById(invite.group_id)!;
    const inviter = this.users.findById(invite.created_by);
    return {
      groupId: invite.group_id,
      groupName: group.name,
      inviterName: inviter?.name ?? 'Unknown',
    };
  }

  accept(token: string, user: UserDto): { groupId: number } {
    const invite = this.requireValid(token);
    this.join(invite.group_id, user.id);
    return { groupId: invite.group_id };
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
    if (!invite || invite.expires_at <= nowIso()) {
      throw notFound('This invite link is invalid or has expired');
    }
    return invite;
  }
}
