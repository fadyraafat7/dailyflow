import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 30000,
  // Run tests sequentially — Strapi shares a single DB instance
  maxWorkers: 1,
  globalSetup: './tests/setup.ts',
  globalTeardown: './tests/teardown.ts',
};

export default config;
