import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserDto } from '@iou/shared';
import { notFound, unauthorized } from '../errors.js';
import type { AuthService } from '../services/auth.js';
import type { GroupRepository, GroupRow, MemberRow } from '../repositories/groups.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDto;
      group?: GroupRow;
      membership?: MemberRow;
    }
  }
}

export function requireAuth(auth: AuthService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = (req.cookies as Record<string, string> | undefined)?.sid;
    const user = token ? auth.userForToken(token) : undefined;
    if (!user) throw unauthorized();
    req.user = user;
    next();
  };
}

/** Every /groups/:groupId/* route goes through this. Non-members get the same
 * 404 as a nonexistent group — group existence is never leaked. */
export function requireMembership(groups: GroupRepository): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) throw notFound('Group not found');
    const membership = groups.findMember(groupId, req.user!.id);
    if (!membership || membership.left_at) throw notFound('Group not found');
    req.group = groups.findById(groupId)!;
    req.membership = membership;
    next();
  };
}

/** Cheap CSRF backstop on top of SameSite=Lax cookies: mutations must carry a
 * custom header, which cross-site forms cannot set. */
export const requireCustomHeader: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.headers['x-requested-with'] !== 'fetch') {
    throw unauthorized('Missing X-Requested-With header');
  }
  next();
};
