import { buildServer } from './server.js';
import { config } from './config.js';
import { closeAll } from './db.js';

const app = await buildServer();

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info(`${signal} — zamykanie...`);
    await app.close();
    await closeAll();
    process.exit(0);
  });
}
