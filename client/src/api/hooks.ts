import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityDto,
  AuthStatusDto,
  BalancesDto,
  CategoryDto,
  ExpenseDto,
  ExpenseInput,
  GroupDetailDto,
  GroupSummaryDto,
  InvitePreviewDto,
  SettlementInput,
  UserDto,
} from '@splitt/shared';
import { ApiError, del, get, patch, post, put } from './client.js';

// ---- auth ----

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<UserDto | null> => {
      try {
        return await get<UserDto>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export const useAuthStatus = () =>
  useQuery({
    queryKey: ['auth-status'],
    queryFn: () => get<AuthStatusDto>('/auth/status'),
    staleTime: Infinity,
  });

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; password: string }) => post<UserDto>('/auth/login', input),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; username: string; password: string }) =>
      post<UserDto>('/auth/register', input),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      void qc.invalidateQueries({ queryKey: ['auth-status'] });
    },
  });
}

export const useChangePassword = () =>
  useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      post('/auth/password', input),
  });

/** All accounts on the server — used to pick people to add to a group. */
export const useAllUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: () => get<UserDto[]>('/users'),
    staleTime: 60 * 1000,
  });

// ---- admin: account management ----

export const useUsers = () =>
  useQuery({ queryKey: ['admin-users'], queryFn: () => get<UserDto[]>('/admin/users') });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; username: string; password: string }) =>
      post<UserDto>('/admin/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/auth/logout'),
    onSuccess: () => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}

// ---- groups ----

export const useGroups = () =>
  useQuery({ queryKey: ['groups'], queryFn: () => get<GroupSummaryDto[]>('/groups') });

export const useGroup = (groupId: number) =>
  useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => get<GroupDetailDto>(`/groups/${groupId}`),
  });

export const useBalances = (groupId: number) =>
  useQuery({
    queryKey: ['groups', groupId, 'balances'],
    queryFn: () => get<BalancesDto>(`/groups/${groupId}/balances`),
  });

export const useExpenses = (groupId: number) =>
  useQuery({
    queryKey: ['groups', groupId, 'expenses'],
    queryFn: () => get<ExpenseDto[]>(`/groups/${groupId}/expenses`),
  });

export const useExpense = (groupId: number, expenseId: number, enabled = true) =>
  useQuery({
    queryKey: ['groups', groupId, 'expenses', expenseId],
    queryFn: () => get<ExpenseDto>(`/groups/${groupId}/expenses/${expenseId}`),
    enabled: enabled && Number.isInteger(expenseId),
  });

export const useActivity = (groupId: number) =>
  useQuery({
    queryKey: ['groups', groupId, 'activity'],
    queryFn: () => get<ActivityDto[]>(`/groups/${groupId}/activity`),
  });

export const useCategories = (groupId: number) =>
  useQuery({
    queryKey: ['groups', groupId, 'categories'],
    queryFn: () => get<CategoryDto[]>(`/groups/${groupId}/categories`),
    staleTime: 60 * 1000,
  });

/** Every group mutation invalidates the whole ['groups'] subtree — balances,
 * lists and activity all depend on the same data, simplest correct thing. */
function useGroupMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export const useCreateGroup = () =>
  useGroupMutation((input: { name: string }) => post<GroupDetailDto>('/groups', input));

export const useRenameGroup = (groupId: number) =>
  useGroupMutation((input: { name: string }) => patch<GroupDetailDto>(`/groups/${groupId}`, input));

export const useArchiveGroup = (groupId: number) =>
  useGroupMutation(() => del(`/groups/${groupId}`));

export const useLeaveGroup = (groupId: number) =>
  useGroupMutation(() => post(`/groups/${groupId}/leave`));

export const useAddMember = (groupId: number) =>
  useGroupMutation((userId: number) => post(`/groups/${groupId}/members`, { userId }));

export const useRemoveMember = (groupId: number) =>
  useGroupMutation((userId: number) => del(`/groups/${groupId}/members/${userId}`));

export const useCreateExpense = (groupId: number) =>
  useGroupMutation((input: ExpenseInput) => post<ExpenseDto>(`/groups/${groupId}/expenses`, input));

export const useUpdateExpense = (groupId: number, expenseId: number) =>
  useGroupMutation((input: ExpenseInput) =>
    put<ExpenseDto>(`/groups/${groupId}/expenses/${expenseId}`, input),
  );

export const useDeleteExpense = (groupId: number) =>
  useGroupMutation((expenseId: number) => del(`/groups/${groupId}/expenses/${expenseId}`));

export const useCreateSettlement = (groupId: number) =>
  useGroupMutation((input: SettlementInput) =>
    post<ExpenseDto>(`/groups/${groupId}/settlements`, input),
  );

export const useCreateCategory = (groupId: number) =>
  useGroupMutation((input: { name: string; icon: string }) =>
    post<CategoryDto>(`/groups/${groupId}/categories`, input),
  );

// ---- invites ----

export interface CreatedInvite {
  token: string;
  groupId: number;
  expiresAt: string;
}

export const useCreateInvite = () =>
  useMutation({
    mutationFn: (input: { groupId: number }) => post<CreatedInvite>('/invites', input),
  });

export const useInvitePreview = (token: string) =>
  useQuery({
    queryKey: ['invites', token],
    queryFn: () => get<InvitePreviewDto>(`/invites/${token}`),
    retry: false,
    enabled: token.length > 0,
  });

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => post<{ groupId: number }>(`/invites/${token}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}
