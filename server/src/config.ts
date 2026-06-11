import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'iou.db'),
  isProduction: process.env.NODE_ENV === 'production',
  sessionTtlDays: 30,
  inviteTtlDays: 14,
};
