import { createHash, randomBytes } from 'node:crypto';

export const nowIso = () => new Date().toISOString();

export const isoInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

export const newToken = () => randomBytes(32).toString('base64url');

/** Tokens are stored hashed so a leaked DB does not leak live sessions/invites. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
