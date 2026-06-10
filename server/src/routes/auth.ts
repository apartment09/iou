import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@splitt/shared';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService, SessionResult } from '../services/auth.js';

function setSessionCookie(res: Response, session: SessionResult): void {
  res.cookie('sid', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    expires: new Date(session.expiresAt),
    path: '/',
  });
}

export function authRoutes(auth: AuthService): Router {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get('/status', (_req, res) => {
    res.json({ needsSetup: auth.needsSetup() });
  });

  router.post('/register', authLimiter, validate(registerSchema), (req, res) => {
    const session = auth.register(req.body as RegisterInput);
    setSessionCookie(res, session);
    res.status(201).json(session.user);
  });

  router.post('/login', authLimiter, validate(loginSchema), (req, res) => {
    const { email, password } = req.body as LoginInput;
    const session = auth.login(email, password);
    setSessionCookie(res, session);
    res.json(session.user);
  });

  router.post('/logout', requireAuth(auth), (req, res) => {
    const token = (req.cookies as Record<string, string>).sid;
    if (token) auth.logout(token);
    res.clearCookie('sid', { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAuth(auth), (req, res) => {
    res.json(req.user);
  });

  return router;
}
