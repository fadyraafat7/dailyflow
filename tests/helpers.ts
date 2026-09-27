import request from 'supertest';

function getHttpServer() {
  return (globalThis as any).strapi.server.httpServer;
}

// JWTs are cached in globalThis by setup.ts (Owner pre-login) and by this
// module as users are created. globalThis persists across test files;
// a module-level Map does not (each file gets a fresh module instance).
function getCache(): Record<string, string> {
  if (!(globalThis as any).jwtCache) (globalThis as any).jwtCache = {};
  return (globalThis as any).jwtCache;
}

/**
 * Creates a test user with the given role and returns their JWT.
 * Each call creates a fresh user to avoid state leaking between tests.
 */
export async function createUserAndLogin(
  username: string,
  email: string,
  password: string,
  roleName: 'Owner' | 'Team Lead' | 'Employee' = 'Employee'
): Promise<string> {
  const strapi = (globalThis as any).strapi;

  // Find the role
  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { name: roleName } });

  if (!role) throw new Error(`Role "${roleName}" not found. Check Strapi roles config.`);

  // Use the plugin's own `add` service — handles hashing internally
  await strapi.plugin('users-permissions').service('user').add({
    username,
    email,
    password,
    provider: 'local',
    confirmed: true,
    blocked: false,
    role: role.id,
  });

  // Login via HTTP to get a real JWT — cached in globalThis to avoid rate-limit 429s
  return loginExisting(email, password);
}

/** Login with an existing account. Result is cached in globalThis — same email returns same JWT across all test files. */
export async function loginExisting(email: string, password: string): Promise<string> {
  const cache = getCache();
  if (cache[email]) return cache[email];

  const res = await request(getHttpServer())
    .post('/api/auth/local')
    .send({ identifier: email, password });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  const jwt = res.body.jwt as string;
  cache[email] = jwt;
  return jwt;
}

/** Authenticated GET */
export function authGet(jwt: string, url: string) {
  return request(getHttpServer())
    .get(url)
    .set('Authorization', `Bearer ${jwt}`);
}

/** Authenticated POST */
export function authPost(jwt: string, url: string, body: object) {
  return request(getHttpServer())
    .post(url)
    .set('Authorization', `Bearer ${jwt}`)
    .send(body);
}

/** Authenticated PUT */
export function authPut(jwt: string, url: string, body: object) {
  return request(getHttpServer())
    .put(url)
    .set('Authorization', `Bearer ${jwt}`)
    .send(body);
}

/** Authenticated DELETE */
export function authDelete(jwt: string, url: string) {
  return request(getHttpServer())
    .delete(url)
    .set('Authorization', `Bearer ${jwt}`);
}
