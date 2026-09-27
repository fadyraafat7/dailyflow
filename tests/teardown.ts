/**
 * Global teardown — runs ONCE after all test suites finish.
 */
import fs from 'fs';
import path from 'path';

export default async function teardown() {
  const app = (globalThis as any).strapi;
  if (app) await app.destroy();

  // Delete the test DB file after every run
  const dbPath = path.join(__dirname, '..', '.tmp', 'test.db');
  try { fs.unlinkSync(dbPath); } catch { /* already gone */ }
}
