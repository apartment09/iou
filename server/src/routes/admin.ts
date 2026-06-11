import { Router } from 'express';
import { createUserSchema, type CreateUserInput } from '@splitt/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/auth.js';

/** Account management — the service rejects non-admins. */
export function adminRoutes(auth: AuthService): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/users', (req, res) => {
    res.json(auth.listUsers(req.user!));
  });

  router.post('/users', validate(createUserSchema), (req, res) => {
    res.status(201).json(auth.createUser(req.user!, req.body as CreateUserInput));
  });

  return router;
}
