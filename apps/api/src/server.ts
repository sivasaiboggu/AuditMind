import './loadEnv.js';
import { buildApp } from './app.js';

const app = await buildApp();
try {
  const parsedPort = parseInt(process.env.PORT || '3000', 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 3000;
  if (port !== parsedPort) console.warn(`Ignoring invalid PORT "${process.env.PORT}"; listening on 3000.`);
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
