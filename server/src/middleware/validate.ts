import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../errors.js';

export function validate<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join('.');
      throw badRequest(`${path ? `${path}: ` : ''}${issue?.message ?? 'Invalid input'}`);
    }
    req.body = result.data;
    next();
  };
}
