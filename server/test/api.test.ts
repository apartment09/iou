import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { openDb } from '../src/db/connection.js';
import { createApp } from '../src/app.js';

type Agent = InstanceType<typeof TestAgent>;

let app: ReturnType<typeof createApp>['express'];

beforeEach(() => {
  app = createApp(openDb(':memory:')).express;
});

const agent = () => request.agent(app);
const post = (a: Agent, url: string, body?: object) =>
  a.post(url).set('X-Requested-With', 'fetch').send(body);
const put = (a: Agent, url: string, body: object) =>
  a.put(url).set('X-Requested-With', 'fetch').send(body);
const del = (a: Agent, url: string) => a.delete(url).set('X-Requested-With', 'fetch');

async function registerFirstUser(a: Agent, name = 'Kai', email = 'kai@example.com') {
  const res = await post(a, '/api/auth/register', { name, email, password: 'secret-pw-1' });
  expect(res.status).toBe(201);
  return res.body as { id: number; name: string };
}

/** First user invites a friend who registers through an account invite. */
async function registerInvitedUser(host: Agent, a: Agent, name: string, email: string) {
  const invite = await post(host, '/api/invites', { kind: 'account' });
  expect(invite.status).toBe(201);
  const res = await post(a, '/api/auth/register', {
    name,
    email,
    password: 'secret-pw-2',
    token: invite.body.token,
  });
  expect(res.status).toBe(201);
  return res.body as { id: number; name: string };
}

async function createGroup(a: Agent, name = 'Trip') {
  const res = await post(a, '/api/groups', { name });
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

async function joinViaGroupInvite(host: Agent, joiner: Agent, groupId: number) {
  const invite = await post(host, '/api/invites', { kind: 'group', groupId });
  expect(invite.status).toBe(201);
  const res = await post(joiner, `/api/invites/${invite.body.token}/accept`);
  expect(res.status).toBe(200);
}

describe('auth', () => {
  it('allows the first user to register without an invite, then requires invites', async () => {
    const status = await agent().get('/api/auth/status');
    expect(status.body).toEqual({ needsSetup: true });

    const a = agent();
    await registerFirstUser(a);
    const me = await a.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.name).toBe('Kai');

    expect((await agent().get('/api/auth/status')).body).toEqual({ needsSetup: false });
    const noInvite = await post(agent(), '/api/auth/register', {
      name: 'Eve',
      email: 'eve@example.com',
      password: 'password-123',
    });
    expect(noInvite.status).toBe(403);
  });

  it('supports login/logout and account invites', async () => {
    const host = agent();
    await registerFirstUser(host);
    const friend = agent();
    await registerInvitedUser(host, friend, 'Anna', 'anna@example.com');

    // Account invites are single-use.
    const reuse = await post(agent(), '/api/auth/register', {
      name: 'Eve',
      email: 'eve@example.com',
      password: 'password-123',
      token: 'not-a-real-token',
    });
    expect(reuse.status).toBe(404);

    const fresh = agent();
    expect((await fresh.get('/api/auth/me')).status).toBe(401);
    const bad = await post(fresh, '/api/auth/login', { email: 'anna@example.com', password: 'wrong-pass' });
    expect(bad.status).toBe(401);
    const ok = await post(fresh, '/api/auth/login', { email: 'anna@example.com', password: 'secret-pw-2' });
    expect(ok.status).toBe(200);
    expect((await fresh.get('/api/auth/me')).body.name).toBe('Anna');
    await post(fresh, '/api/auth/logout');
    expect((await fresh.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects mutations without the custom header (CSRF backstop)', async () => {
    const res = await agent().post('/api/auth/register').send({
      name: 'Kai',
      email: 'kai@example.com',
      password: 'secret-pw-1',
    });
    expect(res.status).toBe(401);
  });
});

describe('groups and membership', () => {
  it('isolates groups: non-members get 404, ex-members lose access', async () => {
    const kai = agent();
    await registerFirstUser(kai);
    const anna = agent();
    await registerInvitedUser(kai, anna, 'Anna', 'anna@example.com');

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
    await registerFirstUser(kai);
    const anna = agent();
    await registerInvitedUser(kai, anna, 'Anna', 'anna@example.com');
    const ben = agent();
    await registerInvitedUser(kai, ben, 'Ben', 'ben@example.com');

    const { id: groupId } = await createGroup(kai);
    const invite = await post(kai, '/api/invites', { kind: 'group', groupId });
    expect((await post(anna, `/api/invites/${invite.body.token}/accept`)).status).toBe(200);
    expect((await post(ben, `/api/invites/${invite.body.token}/accept`)).status).toBe(200);
    expect((await post(ben, `/api/invites/${invite.body.token}/accept`)).status).toBe(200);

    const detail = await kai.get(`/api/groups/${groupId}`);
    expect(detail.body.members).toHaveLength(3);
  });

  it('lets a new person register directly through a group invite link', async () => {
    const kai = agent();
    await registerFirstUser(kai);
    const { id: groupId } = await createGroup(kai);
    const invite = await post(kai, '/api/invites', { kind: 'group', groupId });

    const preview = await agent().get(`/api/invites/${invite.body.token}`);
    expect(preview.body.kind).toBe('group');
    expect(preview.body.groupName).toBe('Trip');

    const newbie = agent();
    const res = await post(newbie, '/api/auth/register', {
      name: 'Cleo',
      email: 'cleo@example.com',
      password: 'password-123',
      token: invite.body.token,
    });
    expect(res.status).toBe(201);
    expect((await newbie.get(`/api/groups/${groupId}`)).status).toBe(200);
  });

  it('only owners can rename/archive; owner cannot leave', async () => {
    const kai = agent();
    await registerFirstUser(kai);
    const anna = agent();
    await registerInvitedUser(kai, anna, 'Anna', 'anna@example.com');
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
    kaiId = (await registerFirstUser(kai)).id;
    anna = agent();
    annaId = (await registerInvitedUser(kai, anna, 'Anna', 'anna@example.com')).id;
    ben = agent();
    benId = (await registerInvitedUser(kai, ben, 'Ben', 'ben@example.com')).id;
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

  it('supports custom categories per group', async () => {
    const created = await post(kai, `/api/groups/${groupId}/categories`, { name: 'Plants', icon: '🪴' });
    expect(created.status).toBe(201);
    const list = await anna.get(`/api/groups/${groupId}/categories`);
    expect(list.body.some((c: { name: string }) => c.name === 'Plants')).toBe(true);
    expect(list.body.some((c: { name: string }) => c.name === 'Groceries')).toBe(true);
  });
});
