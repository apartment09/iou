/** API DTOs — the single source of truth for what the server returns
 * and the client consumes. */

import type { Share, SplitInput, SplitMethod } from './split.js';
import type { Transfer } from './settlement.js';

export interface UserDto {
  id: number;
  email: string;
  name: string;
}

export type GroupRole = 'owner' | 'member';

export interface MemberDto {
  userId: number;
  name: string;
  role: GroupRole;
  joinedAt: string;
  leftAt: string | null;
}

export interface GroupSummaryDto {
  id: number;
  name: string;
  defaultCurrency: string;
  memberCount: number;
  myBalanceCents: number;
  archivedAt: string | null;
}

export interface GroupDetailDto {
  id: number;
  name: string;
  defaultCurrency: string;
  createdBy: number;
  archivedAt: string | null;
  members: MemberDto[];
}

export type ExpenseType = 'expense' | 'settlement';

export interface ExpenseDto {
  id: number;
  groupId: number;
  type: ExpenseType;
  title: string;
  amountCents: number;
  currency: string;
  categoryId: number | null;
  date: string;
  paidBy: number;
  splitMethod: SplitMethod;
  splitInput: SplitInput;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  splits: Share[];
}

export interface CategoryDto {
  id: number;
  groupId: number | null;
  name: string;
  icon: string;
}

export interface BalancesDto {
  members: { userId: number; name: string; balanceCents: number }[];
  transfers: Transfer[];
}

export interface ActivityDto {
  id: number;
  kind: string;
  actorId: number;
  actorName: string;
  refId: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface InvitePreviewDto {
  kind: 'account' | 'group';
  groupId: number | null;
  groupName: string | null;
  inviterName: string;
}

export interface AuthStatusDto {
  /** True until the very first user registers (allows setup without an invite). */
  needsSetup: boolean;
}
