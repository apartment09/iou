import type { ErrorRequestHandler } from 'express';
import { SplitError } from '@splitt/shared';
import { AppError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof SplitError) {
    res.status(400).json({ error: { code: 'invalid_split', message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
};
