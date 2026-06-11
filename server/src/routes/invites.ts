import { Router } from 'express';
import { createInviteSchema, type CreateInviteInput } from '@splitt/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/auth.js';
import type { InviteService } from '../services/invites.js';

export function inviteRoutes(auth: AuthService, invites: InviteService): Router {
  const router = Router();

  router.post('/', requireAuth(auth), validate(createInviteSchema), (req, res) => {
    const input = req.body as CreateInviteInput;
    res.status(201).json(invites.create(req.user!, input.groupId));
  });

  // Public: the invite page must render before login/registration.
  router.get('/:token', (req, res) => {
    res.json(invites.preview(String(req.params.token)));
  });

  router.post('/:token/accept', requireAuth(auth), (req, res) => {
    res.json(invites.accept(String(req.params.token), req.user!));
  });

  return router;
}
