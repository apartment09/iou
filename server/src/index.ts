import { openDb } from './db/connection.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { nowIso } from './util.js';

const db = openDb(config.dbPath);
const app = createApp(db);

// Expired sessions are harmless but pile up — sweep once a day.
setInterval(() => app.sessions.deleteExpired(nowIso()), 24 * 60 * 60 * 1000).unref();

app.express.listen(config.port, () => {
  console.log(`Splitt server listening on http://localhost:${config.port} (db: ${config.dbPath})`);
});
