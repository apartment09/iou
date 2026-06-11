/** zod schemas for every write endpoint — used by server middleware for
 * validation and by client forms, so "what is a valid expense" is defined once. */

import { z } from 'zod';

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Username: 3-30 letters, digits, dots, dashes or underscores');

const password = z.string().min(8, 'Password needs at least 8 characters').max(200);

/** Self-registration — only available until the first (admin) account exists. */
export const registerSchema = z.object({
  username,
  name: z.string().trim().min(1).max(60),
  password,
});

/** Admin-created accounts. */
export const createUserSchema = registerSchema;

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const groupNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createInviteSchema = z.object({
  groupId: z.number().int().positive(),
});

export const addMemberSchema = z.object({
  userId: z.number().int().positive(),
});

const userId = z.number().int().positive();

export const splitInputSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('equal'),
    participants: z.array(userId).min(1),
  }),
  z.object({
    method: z.literal('exact'),
    amounts: z.array(z.object({ userId, cents: z.number().int().min(0) })).min(1),
  }),
  z.object({
    method: z.literal('percentage'),
    percents: z.array(z.object({ userId, percent: z.number().min(0).max(100) })).min(1),
  }),
  z.object({
    method: z.literal('shares'),
    shares: z.array(z.object({ userId, shares: z.number().int().min(0) })).min(1),
  }),
]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const expenseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive().max(100_000_000),
  date: isoDate,
  categoryId: z.number().int().positive().nullable().optional(),
  paidBy: userId,
  split: splitInputSchema,
  notes: z.string().trim().max(500).optional(),
});

export const settlementSchema = z
  .object({
    payerId: userId,
    recipientId: userId,
    amountCents: z.number().int().positive().max(100_000_000),
    date: isoDate,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((s) => s.payerId !== s.recipientId, {
    message: 'Payer and recipient must be different people',
  });

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  // Lucide icon name, e.g. "shopping-cart"
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid icon name'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type GroupNameInput = z.infer<typeof groupNameSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
