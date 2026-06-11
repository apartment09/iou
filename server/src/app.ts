import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { UserRepository } from './repositories/users.js';
import { SessionRepository } from './repositories/sessions.js';
import { InviteRepository } from './repositories/invites.js';
import { GroupRepository } from './repositories/groups.js';
import { CategoryRepository } from './repositories/categories.js';
import { ExpenseRepository } from './repositories/expenses.js';
import { ActivityRepository } from './repositories/activity.js';
import { AuthService } from './services/auth.js';
import { InviteService } from './services/invites.js';
import { BalanceService } from './services/balances.js';
import { GroupService } from './services/groups.js';
import { ExpenseService } from './services/expenses.js';
import { requireCustomHeader } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './errors.js';
import { authRoutes, userDirectoryRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { inviteRoutes } from './routes/invites.js';
import { groupRoutes } from './routes/groups.js';
import { config } from './config.js';

export interface App {
  express: express.Express;
  sessions: SessionRepository;
}

/** Composition root: all wiring happens here, by hand — no DI framework. */
export function createApp(db: Db): App {
  migrate(db);

  const userRepo = new UserRepository(db);
  const sessionRepo = new SessionRepository(db);
  const inviteRepo = new InviteRepository(db);
  const groupRepo = new GroupRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const expenseRepo = new ExpenseRepository(db);
  const activityRepo = new ActivityRepository(db);

  const inviteService = new InviteService(inviteRepo, groupRepo, userRepo, activityRepo);
  const authService = new AuthService(userRepo, sessionRepo);
  const balanceService = new BalanceService(expenseRepo, groupRepo);
  const groupService = new GroupService(db, groupRepo, expenseRepo, activityRepo, userRepo, categoryRepo, balanceService);
  const expenseService = new ExpenseService(db, expenseRepo, groupRepo, categoryRepo, activityRepo);

  const app = express();
  app.set('trust proxy', 1); // nginx terminates TLS in front of us
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireCustomHeader);
  api.use('/auth', authRoutes(authService));
  api.use('/users', userDirectoryRoutes(authService, userRepo));
  api.use('/admin', adminRoutes(authService));
  api.use('/invites', inviteRoutes(authService, inviteService));
  api.use(
    '/groups',
    groupRoutes({
      auth: authService,
      groupService,
      expenseService,
      balanceService,
      groupRepo,
      categoryRepo,
      activityRepo,
    }),
  );
  api.use(() => {
    throw notFound('Unknown API route');
  });
  app.use('/api', api);

  // In production the built client is served by nginx; serving it here too
  // makes `npm start` self-contained for local testing.
  const clientDist = join(import.meta.dirname, '..', '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(join(clientDist, 'index.html'));
      } else {
        next();
      }
    });
  }

  app.use(errorHandler);
  return { express: app, sessions: sessionRepo };
}

export { config };
