import './loadEnv.js';
import { buildApp } from './app.js';

const app = await buildApp();
try {
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
