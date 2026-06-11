import { Router } from 'express';
import {
  addMemberSchema,
  createCategorySchema,
  expenseSchema,
  groupNameSchema,
  settlementSchema,
  type AddMemberInput,
  type CreateCategoryInput,
  type ExpenseInput,
  type GroupNameInput,
  type SettlementInput,
} from '@splitt/shared';
import { notFound } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import type { AuthService } from '../services/auth.js';
import type { GroupService } from '../services/groups.js';
import type { ExpenseService } from '../services/expenses.js';
import type { BalanceService } from '../services/balances.js';
import type { GroupRepository } from '../repositories/groups.js';
import type { CategoryRepository } from '../repositories/categories.js';
import type { ActivityRepository } from '../repositories/activity.js';

interface Deps {
  auth: AuthService;
  groupService: GroupService;
  expenseService: ExpenseService;
  balanceService: BalanceService;
  groupRepo: GroupRepository;
  categoryRepo: CategoryRepository;
  activityRepo: ActivityRepository;
}

export function groupRoutes(deps: Deps): Router {
  const { auth, groupService, expenseService, balanceService, groupRepo, categoryRepo, activityRepo } = deps;

  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', (req, res) => {
    res.json(groupService.listForUser(req.user!.id));
  });

  router.post('/', validate(groupNameSchema), (req, res) => {
    res.status(201).json(groupService.create(req.user!, (req.body as GroupNameInput).name));
  });

  // Everything below operates on one group and requires active membership.
  const group = Router({ mergeParams: true });
  router.use('/:groupId', requireMembership(groupRepo), group);

  group.get('/', (req, res) => {
    res.json(groupService.get(req.group!));
  });

  group.patch('/', validate(groupNameSchema), (req, res) => {
    res.json(groupService.rename(req.user!, req.group!, (req.body as GroupNameInput).name));
  });

  group.delete('/', (req, res) => {
    groupService.archive(req.user!, req.group!);
    res.status(204).end();
  });

  group.post('/leave', (req, res) => {
    groupService.leave(req.user!, req.group!);
    res.status(204).end();
  });

  group.post('/members', validate(addMemberSchema), (req, res) => {
    groupService.addMember(req.user!, req.group!, (req.body as AddMemberInput).userId);
    res.status(204).end();
  });

  group.delete('/members/:userId', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) throw notFound('Member not found');
    groupService.removeMember(req.user!, req.group!, userId);
    res.status(204).end();
  });

  group.get('/balances', (req, res) => {
    res.json(balanceService.getBalances(req.group!.id));
  });

  group.get('/activity', (req, res) => {
    res.json(activityRepo.listByGroup(req.group!.id, 100));
  });

  group.get('/categories', (req, res) => {
    res.json(categoryRepo.listForGroup(req.group!.id));
  });

  group.post('/categories', validate(createCategorySchema), (req, res) => {
    const input = req.body as CreateCategoryInput;
    res.status(201).json(categoryRepo.create(req.group!.id, input.name, input.icon));
  });

  const ownCategory = (req: { params: Record<string, unknown>; group?: { id: number } }) => {
    const category = categoryRepo.findById(Number(req.params.categoryId));
    if (!category || category.groupId !== req.group!.id) throw notFound('Category not found');
    return category;
  };

  group.patch('/categories/:categoryId', validate(createCategorySchema), (req, res) => {
    const category = ownCategory(req);
    const input = req.body as CreateCategoryInput;
    categoryRepo.update(category.id, input.name, input.icon);
    res.json({ ...category, name: input.name, icon: input.icon });
  });

  // Expenses using the category fall back to "Default" (FK sets NULL).
  group.delete('/categories/:categoryId', (req, res) => {
    categoryRepo.delete(ownCategory(req).id);
    res.status(204).end();
  });

  group.get('/expenses', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(expenseService.list(req.group!.id, limit, offset));
  });

  group.post('/expenses', validate(expenseSchema), (req, res) => {
    res.status(201).json(expenseService.createExpense(req.user!, req.group!, req.body as ExpenseInput));
  });

  group.get('/expenses/:expenseId', (req, res) => {
    res.json(expenseService.get(req.group!.id, Number(req.params.expenseId)));
  });

  group.put('/expenses/:expenseId', validate(expenseSchema), (req, res) => {
    res.json(
      expenseService.updateExpense(req.user!, req.group!, Number(req.params.expenseId), req.body as ExpenseInput),
    );
  });

  group.delete('/expenses/:expenseId', (req, res) => {
    expenseService.remove(req.user!, req.group!, Number(req.params.expenseId));
    res.status(204).end();
  });

  group.post('/settlements', validate(settlementSchema), (req, res) => {
    res.status(201).json(expenseService.createSettlement(req.user!, req.group!, req.body as SettlementInput));
  });

  group.put('/settlements/:expenseId', validate(settlementSchema), (req, res) => {
    res.json(
      expenseService.updateSettlement(req.user!, req.group!, Number(req.params.expenseId), req.body as SettlementInput),
    );
  });

  return router;
}
