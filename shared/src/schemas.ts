/** zod schemas for every write endpoint — used by server middleware for
 * validation and by client forms, so "what is a valid expense" is defined once. */

import { z } from 'zod';

export const registerSchema = z.object({
  token: z.string().min(1).optional(),
  email: z.email().max(120),
  name: z.string().trim().min(1).max(60),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const groupNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createInviteSchema = z.object({
  kind: z.enum(['account', 'group']),
  groupId: z.number().int().positive().optional(),
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
  icon: z.string().min(1).max(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GroupNameInput = z.infer<typeof groupNameSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
