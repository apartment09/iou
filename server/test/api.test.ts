import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { openDb } from '../src/db/connection.js';
import { createApp } from '../src/app.js';
import { advanceDate } from '../src/services/recurring.js';

type Agent = InstanceType<typeof TestAgent>;

let bundle: ReturnType<typeof createApp>;
let app: ReturnType<typeof createApp>['express'];

beforeEach(() => {
  bundle = createApp(openDb(':memory:'));
  app = bundle.express;
});

const agent = () => request.agent(app);
const post = (a: Agent, url: string, body?: object) =>
  a.post(url).set('X-Requested-With', 'fetch').send(body);
const put = (a: Agent, url: string, body: object) =>
  a.put(url).set('X-Requested-With', 'fetch').send(body);
const del = (a: Agent, url: string) => a.delete(url).set('X-Requested-With', 'fetch');

/** First account self-registers and becomes the admin. */
async function registerAdmin(a: Agent, name = 'Kai', username = 'kai') {
  const res = await post(a, '/api/auth/register', { name, username, password: 'secret-pw-1' });
  expect(res.status).toBe(201);
  expect(res.body.isAdmin).toBe(true);
  return res.body as { id: number; name: string };
}

/** Admin creates an account; the new user signs in on their own agent. */
async function createUserAndLogin(admin: Agent, a: Agent, name: string, username: string) {
  const created = await post(admin, '/api/admin/users', { name, username, password: 'secret-pw-2' });
  expect(created.status).toBe(201);
  const login = await post(a, '/api/auth/login', { username, password: 'secret-pw-2' });
  expect(login.status).toBe(200);
  return login.body as { id: number; name: string };
}

async function createGroup(a: Agent, name = 'Trip') {
  const res = await post(a, '/api/groups', { name });
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

async function joinViaGroupInvite(host: Agent, joiner: Agent, groupId: number) {
  const invite = await post(host, '/api/invites', { groupId });
  expect(invite.status).toBe(201);
  const res = await post(joiner, `/api/invites/${invite.body.token}/accept`);
  expect(res.status).toBe(200);
}

describe('auth and account management', () => {
  it('first user registers as admin, then registration is closed', async () => {
    expect((await agent().get('/api/auth/status')).body).toEqual({ needsSetup: true });

    const kai = agent();
    await registerAdmin(kai);
    const me = await kai.get('/api/auth/me');
    expect(me.body).toMatchObject({ name: 'Kai', username: 'kai', isAdmin: true });

    expect((await agent().get('/api/auth/status')).body).toEqual({ needsSetup: false });
    const closed = await post(agent(), '/api/auth/register', {
      name: 'Eve',
      username: 'eve',
      password: 'password-123',
    });
    expect(closed.status).toBe(403);
  });

  it('only the admin can create accounts; usernames are unique', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    await createUserAndLogin(kai, anna, 'Anna', 'anna');
    expect((await anna.get('/api/auth/me')).body).toMatchObject({ username: 'anna', isAdmin: false });

    // Non-admins cannot manage accounts.
    expect((await post(anna, '/api/admin/users', { name: 'Eve', username: 'eve', password: 'password-123' })).status).toBe(403);
    expect((await anna.get('/api/admin/users')).status).toBe(403);

    // Admin sees the user list; duplicate usernames are rejected (case-insensitive).
    const list = await kai.get('/api/admin/users');
    expect(list.body).toHaveLength(2);
    const dupe = await post(kai, '/api/admin/users', { name: 'Anna 2', username: 'Anna', password: 'password-123' });
    expect(dupe.status).toBe(409);
  });

  it('supports login/logout and rejects wrong credentials', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    await createUserAndLogin(kai, anna, 'Anna', 'anna');

    const fresh = agent();
    expect((await fresh.get('/api/auth/me')).status).toBe(401);
    expect((await post(fresh, '/api/auth/login', { username: 'anna', password: 'wrong-pass' })).status).toBe(401);
    expect((await post(fresh, '/api/auth/login', { username: 'ANNA', password: 'secret-pw-2' })).status).toBe(200);
    await post(fresh, '/api/auth/logout');
    expect((await fresh.get('/api/auth/me')).status).toBe(401);
  });

  it('users can change their password', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    await createUserAndLogin(kai, anna, 'Anna', 'anna');

    const wrong = await post(anna, '/api/auth/password', {
      currentPassword: 'not-my-password',
      newPassword: 'brand-new-pw-1',
    });
    expect(wrong.status).toBe(401);

    const ok = await post(anna, '/api/auth/password', {
      currentPassword: 'secret-pw-2',
      newPassword: 'brand-new-pw-1',
    });
    expect(ok.status).toBe(204);

    expect((await post(agent(), '/api/auth/login', { username: 'anna', password: 'secret-pw-2' })).status).toBe(401);
    expect((await post(agent(), '/api/auth/login', { username: 'anna', password: 'brand-new-pw-1' })).status).toBe(200);
  });

  it('admin can reset any password; non-admins cannot', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    const annaUser = await createUserAndLogin(kai, anna, 'Anna', 'anna');

    expect(
      (await post(anna, `/api/admin/users/${annaUser.id}/password`, { password: 'hacked-pw-123' })).status,
    ).toBe(403);
    expect((await post(kai, '/api/admin/users/9999/password', { password: 'whatever-123' })).status).toBe(404);

    expect(
      (await post(kai, `/api/admin/users/${annaUser.id}/password`, { password: 'fresh-start-1' })).status,
    ).toBe(204);
    expect((await post(agent(), '/api/auth/login', { username: 'anna', password: 'secret-pw-2' })).status).toBe(401);
    expect((await post(agent(), '/api/auth/login', { username: 'anna', password: 'fresh-start-1' })).status).toBe(200);
  });

  it('rejects mutations without the custom header (CSRF backstop)', async () => {
    const res = await agent().post('/api/auth/register').send({
      name: 'Kai',
      username: 'kai',
      password: 'secret-pw-1',
    });
    expect(res.status).toBe(401);
  });
});

describe('groups and membership', () => {
  it('isolates groups: non-members get 404, ex-members lose access', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    await createUserAndLogin(kai, anna, 'Anna', 'anna');

    const { id: groupId } = await createGroup(kai, 'Secret Trip');
    expect((await anna.get(`/api/groups/${groupId}`)).status).toBe(404);
    expect((await anna.get(`/api/groups/${groupId}/expenses`)).status).toBe(404);

    await joinViaGroupInvite(kai, anna, groupId);
    expect((await anna.get(`/api/groups/${groupId}`)).status).toBe(200);

    await post(anna, `/api/groups/${groupId}/leave`);
    expect((await anna.get(`/api/groups/${groupId}`)).status).toBe(404);
  });

  it('group invites are reusable, joining twice is harmless', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    await createUserAndLogin(kai, anna, 'Anna', 'anna');
    const ben = agent();
    await createUserAndLogin(kai, ben, 'Ben', 'ben');

    const { id: groupId } = await createGroup(kai);
    const invite = await post(kai, '/api/invites', { groupId });
    expect((await post(anna, `/api/invites/${invite.body.token}/accept`)).status).toBe(200);
    expect((await post(ben, `/api/invites/${invite.body.token}/accept`)).status).toBe(200);
    expect((await post(ben, `/api/invites/${invite.body.token}/accept`)).status).toBe(200);

    const detail = await kai.get(`/api/groups/${groupId}`);
    expect(detail.body.members).toHaveLength(3);
  });

  it('invite preview is public but accepting requires an account', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const { id: groupId } = await createGroup(kai);
    const invite = await post(kai, '/api/invites', { groupId });

    const preview = await agent().get(`/api/invites/${invite.body.token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.groupName).toBe('Trip');
    expect(preview.body.inviterName).toBe('Kai');

    expect((await post(agent(), `/api/invites/${invite.body.token}/accept`)).status).toBe(401);
    expect((await agent().get('/api/invites/not-a-real-token')).status).toBe(404);
  });

  it('any member can add users directly; user directory requires auth', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    const annaUser = await createUserAndLogin(kai, anna, 'Anna', 'anna');
    const ben = agent();
    const benUser = await createUserAndLogin(kai, ben, 'Ben', 'ben');

    expect((await agent().get('/api/users')).status).toBe(401);
    const directory = await anna.get('/api/users');
    expect(directory.status).toBe(200);
    expect(directory.body).toHaveLength(3);

    const { id: groupId } = await createGroup(kai);
    await joinViaGroupInvite(kai, anna, groupId);

    // Anna (a regular member) adds Ben directly — no invite link needed.
    expect((await post(anna, `/api/groups/${groupId}/members`, { userId: benUser.id })).status).toBe(204);
    expect((await ben.get(`/api/groups/${groupId}`)).status).toBe(200);
    // Adding twice is harmless; unknown users are a 404.
    expect((await post(anna, `/api/groups/${groupId}/members`, { userId: benUser.id })).status).toBe(204);
    expect((await post(anna, `/api/groups/${groupId}/members`, { userId: 9999 })).status).toBe(404);

    const detail = await kai.get(`/api/groups/${groupId}`);
    expect(detail.body.members).toHaveLength(3);
    void annaUser;
  });

  it('any member can remove members without expenses; expense history blocks removal', async () => {
    const kai = agent();
    const kaiUser = await registerAdmin(kai);
    const anna = agent();
    const annaUser = await createUserAndLogin(kai, anna, 'Anna', 'anna');
    const ben = agent();
    const benUser = await createUserAndLogin(kai, ben, 'Ben', 'ben');

    const { id: groupId } = await createGroup(kai);
    await post(kai, `/api/groups/${groupId}/members`, { userId: annaUser.id });
    await post(kai, `/api/groups/${groupId}/members`, { userId: benUser.id });

    // Removing yourself or the owner is rejected.
    expect((await del(anna, `/api/groups/${groupId}/members/${annaUser.id}`)).status).toBe(409);
    expect((await del(anna, `/api/groups/${groupId}/members/${kaiUser.id}`)).status).toBe(409);

    // Ben gets an expense: he can no longer be removed — even when settled.
    await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Pizza',
      amountCents: 1000,
      date: '2026-06-10',
      paidBy: kaiUser.id,
      split: { method: 'equal', participants: [kaiUser.id, benUser.id] },
    });
    expect((await del(anna, `/api/groups/${groupId}/members/${benUser.id}`)).status).toBe(409);
    await post(ben, `/api/groups/${groupId}/settlements`, {
      payerId: benUser.id,
      recipientId: kaiUser.id,
      amountCents: 500,
      date: '2026-06-11',
    });
    expect((await del(anna, `/api/groups/${groupId}/members/${benUser.id}`)).status).toBe(409);

    // Anna has no expenses — any member (Ben) can remove her.
    expect((await del(ben, `/api/groups/${groupId}/members/${annaUser.id}`)).status).toBe(204);
    expect((await anna.get(`/api/groups/${groupId}`)).status).toBe(404);
  });

  it('only owners can rename/archive; owner cannot leave', async () => {
    const kai = agent();
    await registerAdmin(kai);
    const anna = agent();
    await createUserAndLogin(kai, anna, 'Anna', 'anna');
    const { id: groupId } = await createGroup(kai);
    await joinViaGroupInvite(kai, anna, groupId);

    expect((await anna.patch(`/api/groups/${groupId}`).set('X-Requested-With', 'fetch').send({ name: 'X' })).status).toBe(403);
    expect((await post(kai, `/api/groups/${groupId}/leave`)).status).toBe(409);
    expect((await kai.patch(`/api/groups/${groupId}`).set('X-Requested-With', 'fetch').send({ name: 'Renamed' })).status).toBe(200);
  });
});

describe('expenses, balances, settle up', () => {
  let kai: Agent;
  let anna: Agent;
  let ben: Agent;
  let groupId: number;
  let kaiId: number;
  let annaId: number;
  let benId: number;

  beforeEach(async () => {
    kai = agent();
    kaiId = (await registerAdmin(kai)).id;
    anna = agent();
    annaId = (await createUserAndLogin(kai, anna, 'Anna', 'anna')).id;
    ben = agent();
    benId = (await createUserAndLogin(kai, ben, 'Ben', 'ben')).id;
    groupId = (await createGroup(kai, 'Flat')).id;
    await joinViaGroupInvite(kai, anna, groupId);
    await joinViaGroupInvite(kai, ben, groupId);
  });

  const addEqualExpense = (a: Agent, amountCents: number, paidBy: number, participants: number[], title = 'Food') =>
    post(a, `/api/groups/${groupId}/expenses`, {
      title,
      amountCents,
      date: '2026-06-10',
      paidBy,
      split: { method: 'equal', participants },
    });

  it('computes balances and simplified transfers across the group', async () => {
    // Kai pays 30 for everyone; Anna pays 12 for herself and Ben.
    expect((await addEqualExpense(kai, 3000, kaiId, [kaiId, annaId, benId])).status).toBe(201);
    expect((await addEqualExpense(anna, 1200, annaId, [annaId, benId])).status).toBe(201);

    const res = await ben.get(`/api/groups/${groupId}/balances`);
    expect(res.status).toBe(200);
    const balances = Object.fromEntries(
      res.body.members.map((m: { userId: number; balanceCents: number }) => [m.userId, m.balanceCents]),
    );
    expect(balances[kaiId]).toBe(2000);
    expect(balances[annaId]).toBe(-400);
    expect(balances[benId]).toBe(-1600);
    const total = res.body.members.reduce((s: number, m: { balanceCents: number }) => s + m.balanceCents, 0);
    expect(total).toBe(0);
    expect(res.body.transfers.length).toBeLessThanOrEqual(2);
  });

  it('settlements bring balances to zero and unlock leaving', async () => {
    await addEqualExpense(kai, 3000, kaiId, [kaiId, annaId, benId]);

    // Anna owes 1000 — leaving must be blocked.
    expect((await post(anna, `/api/groups/${groupId}/leave`)).status).toBe(409);

    const settle = await post(anna, `/api/groups/${groupId}/settlements`, {
      payerId: annaId,
      recipientId: kaiId,
      amountCents: 1000,
      date: '2026-06-11',
    });
    expect(settle.status).toBe(201);
    expect(settle.body.type).toBe('settlement');

    const balances = await kai.get(`/api/groups/${groupId}/balances`);
    const anna2 = balances.body.members.find((m: { userId: number }) => m.userId === annaId);
    expect(anna2.balanceCents).toBe(0);

    expect((await post(anna, `/api/groups/${groupId}/leave`)).status).toBe(204);
  });

  it('settlements are editable; type guards keep the two edit routes apart', async () => {
    await addEqualExpense(kai, 3000, kaiId, [kaiId, annaId, benId]);
    const settle = await post(anna, `/api/groups/${groupId}/settlements`, {
      payerId: annaId,
      recipientId: kaiId,
      amountCents: 900, // oops, typo — should have been 1000
      date: '2026-06-11',
    });
    expect(settle.status).toBe(201);

    const fixed = await put(anna, `/api/groups/${groupId}/settlements/${settle.body.id}`, {
      payerId: annaId,
      recipientId: kaiId,
      amountCents: 1000,
      date: '2026-06-12',
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ amountCents: 1000, date: '2026-06-12', type: 'settlement' });

    const balances = await kai.get(`/api/groups/${groupId}/balances`);
    const anna2 = balances.body.members.find((m: { userId: number }) => m.userId === annaId);
    expect(anna2.balanceCents).toBe(0);

    const activity = await kai.get(`/api/groups/${groupId}/activity`);
    expect(activity.body.map((a: { kind: string }) => a.kind)).toContain('settlement_updated');

    // Editing a settlement via the expense route (and vice versa) is rejected.
    const viaExpenseRoute = await put(kai, `/api/groups/${groupId}/expenses/${settle.body.id}`, {
      title: 'Sneaky',
      amountCents: 1,
      date: '2026-06-12',
      paidBy: kaiId,
      split: { method: 'equal', participants: [kaiId] },
    });
    expect(viaExpenseRoute.status).toBe(409);
    const expense = await addEqualExpense(kai, 500, kaiId, [kaiId]);
    const viaSettlementRoute = await put(kai, `/api/groups/${groupId}/settlements/${expense.body.id}`, {
      payerId: kaiId,
      recipientId: annaId,
      amountCents: 500,
      date: '2026-06-12',
    });
    expect(viaSettlementRoute.status).toBe(409);
  });

  it('validates splits: exact amounts must sum to the total, members must be active', async () => {
    const badSum = await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Broken',
      amountCents: 1000,
      date: '2026-06-10',
      paidBy: kaiId,
      split: { method: 'exact', amounts: [{ userId: kaiId, cents: 999 }] },
    });
    expect(badSum.status).toBe(400);

    const stranger = await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Ghost',
      amountCents: 1000,
      date: '2026-06-10',
      paidBy: kaiId,
      split: { method: 'equal', participants: [kaiId, 9999] },
    });
    expect(stranger.status).toBe(400);
  });

  it('supports percentage and shares splits end to end', async () => {
    const pct = await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Rent',
      amountCents: 100000,
      date: '2026-06-01',
      paidBy: kaiId,
      split: {
        method: 'percentage',
        percents: [
          { userId: kaiId, percent: 50 },
          { userId: annaId, percent: 30 },
          { userId: benId, percent: 20 },
        ],
      },
    });
    expect(pct.status).toBe(201);
    expect(pct.body.splits).toEqual([
      { userId: kaiId, cents: 50000 },
      { userId: annaId, cents: 30000 },
      { userId: benId, cents: 20000 },
    ]);

    const shares = await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Dinner',
      amountCents: 9000,
      date: '2026-06-02',
      paidBy: annaId,
      split: {
        method: 'shares',
        shares: [
          { userId: kaiId, shares: 2 },
          { userId: annaId, shares: 1 },
        ],
      },
    });
    expect(shares.status).toBe(201);
    expect(shares.body.splits).toEqual([
      { userId: kaiId, cents: 6000 },
      { userId: annaId, cents: 3000 },
    ]);
  });

  it('edit and soft-delete update balances and keep the activity trail', async () => {
    const created = await addEqualExpense(kai, 3000, kaiId, [kaiId, annaId, benId]);
    const expenseId = created.body.id;

    const updated = await put(kai, `/api/groups/${groupId}/expenses/${expenseId}`, {
      title: 'Food (fixed)',
      amountCents: 6000,
      date: '2026-06-10',
      paidBy: kaiId,
      split: { method: 'equal', participants: [kaiId, annaId, benId] },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.amountCents).toBe(6000);

    let balances = await kai.get(`/api/groups/${groupId}/balances`);
    expect(balances.body.members.find((m: { userId: number }) => m.userId === kaiId).balanceCents).toBe(4000);

    expect((await del(anna, `/api/groups/${groupId}/expenses/${expenseId}`)).status).toBe(204);
    balances = await kai.get(`/api/groups/${groupId}/balances`);
    expect(balances.body.members.every((m: { balanceCents: number }) => m.balanceCents === 0)).toBe(true);

    const activity = await kai.get(`/api/groups/${groupId}/activity`);
    const kinds = activity.body.map((a: { kind: string }) => a.kind);
    expect(kinds).toContain('expense_added');
    expect(kinds).toContain('expense_updated');
    expect(kinds).toContain('expense_deleted');
  });

  it('dashboard shows my balance per group', async () => {
    await addEqualExpense(kai, 3000, kaiId, [kaiId, annaId, benId]);
    const groups = await anna.get('/api/groups');
    expect(groups.status).toBe(200);
    const flat = groups.body.find((g: { id: number }) => g.id === groupId);
    expect(flat.myBalanceCents).toBe(-1000);
    expect(flat.memberCount).toBe(3);
  });

  describe('recurring expenses', () => {
    it('advanceDate clamps short months but remembers the anchor day', () => {
      expect(advanceDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
      expect(advanceDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
      expect(advanceDate('2026-12-15', 'monthly', 15)).toBe('2027-01-15');
      expect(advanceDate('2026-06-29', 'weekly', 29)).toBe('2026-07-06');
    });

    it('materializes due templates with catch-up; ticking twice is idempotent', async () => {
      const created = await post(kai, `/api/groups/${groupId}/recurring`, {
        title: 'Internet',
        amountCents: 3000,
        paidBy: kaiId,
        split: { method: 'equal', participants: [kaiId, annaId, benId] },
        frequency: 'weekly',
        startDate: '2026-06-01',
      });
      expect(created.status).toBe(201);
      expect(created.body.nextDate).toBe('2026-06-01');

      bundle.recurring.tick('2026-06-15'); // due: 06-01, 06-08, 06-15
      bundle.recurring.tick('2026-06-15'); // no-op

      const expenses = await kai.get(`/api/groups/${groupId}/expenses`);
      const generated = expenses.body.filter((e: { title: string }) => e.title === 'Internet');
      expect(generated).toHaveLength(3);
      expect(generated.map((e: { date: string }) => e.date).sort()).toEqual([
        '2026-06-01', '2026-06-08', '2026-06-15',
      ]);
      expect(generated[0].splits).toHaveLength(3);

      const templates = await kai.get(`/api/groups/${groupId}/recurring`);
      expect(templates.body[0].nextDate).toBe('2026-06-22');

      // Generated expenses count toward balances like any other.
      const balances = await kai.get(`/api/groups/${groupId}/balances`);
      const kaiBalance = balances.body.members.find((m: { userId: number }) => m.userId === kaiId);
      expect(kaiBalance.balanceCents).toBe(6000); // paid 9000, owes 3000
    });

    it('templates are listable and deletable; nothing fires before the start date', async () => {
      const created = await post(kai, `/api/groups/${groupId}/recurring`, {
        title: 'Rent',
        amountCents: 120000,
        paidBy: kaiId,
        split: { method: 'shares', shares: [{ userId: kaiId, shares: 1 }, { userId: annaId, shares: 1 }] },
        frequency: 'monthly',
        startDate: '2026-07-01',
      });
      bundle.recurring.tick('2026-06-15');
      expect((await kai.get(`/api/groups/${groupId}/expenses`)).body).toHaveLength(0);

      expect((await del(anna, `/api/groups/${groupId}/recurring/${created.body.id}`)).status).toBe(204);
      expect((await kai.get(`/api/groups/${groupId}/recurring`)).body).toHaveLength(0);
      bundle.recurring.tick('2026-07-02');
      expect((await kai.get(`/api/groups/${groupId}/expenses`)).body).toHaveLength(0);
    });

    it('a participant who left causes a logged skip, not silent loss or a crash', async () => {
      await post(kai, `/api/groups/${groupId}/recurring`, {
        title: 'Streaming',
        amountCents: 1500,
        paidBy: kaiId,
        split: { method: 'equal', participants: [kaiId, annaId] },
        frequency: 'monthly',
        startDate: '2026-07-01',
      });
      // Anna leaves (balance is zero — nothing recorded yet).
      await post(anna, `/api/groups/${groupId}/leave`);

      bundle.recurring.tick('2026-07-01');
      expect((await kai.get(`/api/groups/${groupId}/expenses`)).body).toHaveLength(0);
      const activity = await kai.get(`/api/groups/${groupId}/activity`);
      const skipped = activity.body.find((a: { kind: string }) => a.kind === 'recurring_skipped');
      expect(skipped.payload.title).toBe('Streaming');

      // The schedule kept moving — next month is still scheduled.
      const templates = await kai.get(`/api/groups/${groupId}/recurring`);
      expect(templates.body[0].nextDate).toBe('2026-08-01');
    });
  });

  it('monthly stats sum expenses by category, excluding settlements and other months', async () => {
    const categories = await kai.get(`/api/groups/${groupId}/categories`);
    const groceries = categories.body.find((c: { name: string }) => c.name === 'Groceries').id;

    const add = (title: string, amountCents: number, date: string, categoryId: number | null) =>
      post(kai, `/api/groups/${groupId}/expenses`, {
        title, amountCents, date, categoryId, paidBy: kaiId,
        split: { method: 'equal', participants: [kaiId, annaId] },
      });
    await add('Aldi', 4000, '2026-06-03', groceries);
    await add('Rewe', 2000, '2026-06-20', groceries);
    await add('Mystery', 1000, '2026-06-10', null);
    await add('May groceries', 9999, '2026-05-30', groceries); // other month
    await post(kai, `/api/groups/${groupId}/settlements`, {
      payerId: annaId, recipientId: kaiId, amountCents: 3500, date: '2026-06-15',
    });

    const stats = await anna.get(`/api/groups/${groupId}/stats?month=2026-06`);
    expect(stats.status).toBe(200);
    expect(stats.body.totalCents).toBe(7000); // settlement and May excluded
    expect(stats.body.expenseCount).toBe(3);
    expect(stats.body.byCategory).toEqual([
      { categoryId: groceries, cents: 6000, count: 2 },
      { categoryId: null, cents: 1000, count: 1 },
    ]);

    expect((await kai.get(`/api/groups/${groupId}/stats?month=junk`)).status).toBe(400);
  });

  it('categories are per-group, editable and removable; deletion falls back to Default', async () => {
    // Every group starts with its own editable copy of the default set.
    const list = await anna.get(`/api/groups/${groupId}/categories`);
    expect(list.body).toHaveLength(7);
    const groceries = list.body.find((c: { name: string }) => c.name === 'Groceries');
    expect(groceries.groupId).toBe(groupId);
    expect(groceries.icon).toBe('shopping-cart');

    // Any member can create and rename categories.
    const created = await post(kai, `/api/groups/${groupId}/categories`, { name: 'Plants', icon: 'leaf' });
    expect(created.status).toBe(201);
    const renamed = await anna
      .patch(`/api/groups/${groupId}/categories/${created.body.id}`)
      .set('X-Requested-With', 'fetch')
      .send({ name: 'Garden', icon: 'flower' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Garden', icon: 'flower' });

    // An expense using a category falls back to Default (null) on deletion.
    const expense = await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Tulips',
      amountCents: 500,
      date: '2026-06-10',
      paidBy: kaiId,
      categoryId: created.body.id,
      split: { method: 'equal', participants: [kaiId] },
    });
    expect(expense.body.categoryId).toBe(created.body.id);
    expect((await del(kai, `/api/groups/${groupId}/categories/${created.body.id}`)).status).toBe(204);
    const after = await kai.get(`/api/groups/${groupId}/expenses/${expense.body.id}`);
    expect(after.body.categoryId).toBeNull();

    // Categories from other groups are rejected, in expenses and in edits.
    const other = await createGroup(kai, 'Other Group');
    const otherCategories = await kai.get(`/api/groups/${other.id}/categories`);
    const foreign = otherCategories.body[0].id;
    const crossUse = await post(kai, `/api/groups/${groupId}/expenses`, {
      title: 'Sneaky',
      amountCents: 100,
      date: '2026-06-10',
      paidBy: kaiId,
      categoryId: foreign,
      split: { method: 'equal', participants: [kaiId] },
    });
    expect(crossUse.status).toBe(400);
    const crossEdit = await kai
      .patch(`/api/groups/${groupId}/categories/${foreign}`)
      .set('X-Requested-With', 'fetch')
      .send({ name: 'Hijack', icon: 'tag' });
    expect(crossEdit.status).toBe(404);
  });
});
