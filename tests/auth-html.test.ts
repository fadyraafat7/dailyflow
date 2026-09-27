import request from 'supertest';
import { loginExisting } from './helpers';

function server() {
  return request((globalThis as any).strapi.server.httpServer);
}

const OWNER_EMAIL = 'testowner@dailyflow.test';
const OWNER_PASSWORD = 'TestOwner123!';

// ─── login ───────────────────────────────────────────────────────────────────
// auth-html/login has config: { auth: false } so it always works.
// jwtManagement:'refresh' in plugins.ts means jwt service returns an
// object { accessToken, refreshToken } instead of a plain string.

describe('auth-html — login', () => {
  test('returns 200 and HX-Trigger on valid credentials', async () => {
    const res = await server()
      .post('/api/auth-html/login')
      .send({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD });

    expect(res.status).toBe(200);
    const trigger = JSON.parse(res.headers['hx-trigger']);
    expect(trigger['auth-login']).toBeDefined();
    expect(trigger['auth-login'].user.email).toBe(OWNER_EMAIL);
    expect(Array.isArray(trigger['auth-login'].perms)).toBe(true);
  });

  test('Owner gets full permission set in HX-Trigger', async () => {
    const res = await server()
      .post('/api/auth-html/login')
      .send({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD });

    const trigger = JSON.parse(res.headers['hx-trigger']);
    const perms: string[] = trigger['auth-login'].perms;
    expect(perms).toContain('project.create');
    expect(perms).toContain('team.createTeamLead');
    expect(perms).toContain('task.delete');
  });

  test('returns 400 on wrong password', async () => {
    const res = await server()
      .post('/api/auth-html/login')
      .send({ identifier: OWNER_EMAIL, password: 'wrongpassword' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid identifier or password');
  });

  test('returns 400 on unknown email', async () => {
    const res = await server()
      .post('/api/auth-html/login')
      .send({ identifier: 'nobody@test.com', password: 'Password123!' });

    expect(res.status).toBe(400);
  });

  test('returns 422 when fields are empty', async () => {
    const res = await server()
      .post('/api/auth-html/login')
      .send({ identifier: '', password: '' });

    expect(res.status).toBe(422);
  });

  test('is a public route — no JWT required', async () => {
    const res = await server()
      .post('/api/auth-html/login')
      .send({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD });

    expect([200, 400, 422]).toContain(res.status); // never 401/403
  });
});

// ─── session & change-password ───────────────────────────────────────────────
// These routes require auth but auth-html.session / auth-html.changePassword
// are NOT listed in ACTION_MAP in src/index.ts, so no role has permission
// to call them → 403 for everyone (including Owner).
// This documents current behavior; to fix add them to ACTION_MAP.

describe('auth-html — session (permission gap)', () => {
  let jwt: string;

  beforeAll(async () => {
    jwt = await loginExisting(OWNER_EMAIL, OWNER_PASSWORD);
  });

  test('returns 403 — action not in ACTION_MAP', async () => {
    const res = await server()
      .get('/api/auth-html/session')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
  });

  test('returns 403 without JWT too (public role has no access)', async () => {
    const res = await server().get('/api/auth-html/session');
    expect(res.status).toBe(403);
  });
});

describe('auth-html — change-password (permission gap)', () => {
  let jwt: string;

  beforeAll(async () => {
    jwt = await loginExisting(OWNER_EMAIL, OWNER_PASSWORD);
  });

  test('returns 403 — action not in ACTION_MAP', async () => {
    const res = await server()
      .post('/api/auth-html/change-password')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ currentPassword: OWNER_PASSWORD, password: 'NewPassword456!' });

    expect(res.status).toBe(403);
  });
});
