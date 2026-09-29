/**
 * Global setup — runs ONCE before all test suites.
 * Boots a real Strapi instance backed by an in-memory SQLite DB
 * and attaches it to globalThis so every test file can reach it.
 */
import { createStrapi, compileStrapi } from '@strapi/strapi';
import request from 'supertest';

const TEST_APP_DIR = __dirname + '/..';

export default async function setup() {
  process.env.NODE_ENV = 'test';

  // Use a separate SQLite file for tests so we never touch .tmp/data.db
  process.env.DATABASE_CLIENT = 'sqlite';
  process.env.DATABASE_FILENAME = '.tmp/test.db';

  // Required by bootstrap — creates the first Owner account on empty DB
  process.env.DAILYFLOW_OWNER_EMAIL = 'testowner@dailyflow.test';
  process.env.DAILYFLOW_OWNER_USERNAME = 'testowner';
  process.env.DAILYFLOW_OWNER_PASSWORD = 'TestOwner123!';

  const appContext = await compileStrapi({ appDir: TEST_APP_DIR });
  const app = await createStrapi(appContext).load();

  await app.start();

  // Share the instance across all test files
  (globalThis as any).strapi = app;

  // Pre-login the Owner once and cache the JWT in globalThis.
  // Each test file that needs the Owner JWT reads from here instead of
  // calling /api/auth/local again — avoids rate-limit 429s when 6+
  // files all try to login during their beforeAll in the same second.
  const loginRes = await request(app.server.httpServer)
    .post('/api/auth/local')
    .send({
      identifier: process.env.DAILYFLOW_OWNER_EMAIL,
      password: process.env.DAILYFLOW_OWNER_PASSWORD,
    });
  const loginJson = loginRes.body as any;
  (globalThis as any).jwtCache = {
    [process.env.DAILYFLOW_OWNER_EMAIL!]: loginJson.jwt,
  };
}
