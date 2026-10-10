import { buildServer } from './server.js';
import { config } from './config.js';
import { closeAll } from './db.js';
import { emitChange } from './realtime/hub.js';
import { startRelayListener } from './realtime/relay.js';

const app = await buildServer();

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Zmiany z workera (NOTIFY) → gniazda realtime tego procesu (relay.js).
const stopRelay = startRelayListener({
  connectionString: config.DATABASE_URL,
  onMessage: ({ tenant, table, op, rows, opts }) => emitChange(tenant, table, op, rows, opts),
  log: (msg) => app.log.warn(msg),
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info(`${signal} — zamykanie...`);
    await app.close();
    await stopRelay();
    await closeAll();
    process.exit(0);
  });
}
