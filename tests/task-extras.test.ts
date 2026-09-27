import request from 'supertest';
import { loginExisting, createUserAndLogin, authGet, authPost } from './helpers';

function server() {
  return request((globalThis as any).strapi.server.httpServer);
}

let ownerJwt: string;
let teamLeadJwt: string;
let employeeJwt: string;
let projectDocId: string;
let employeeUserId: number;

beforeAll(async () => {
  ownerJwt    = await loginExisting('testowner@dailyflow.test', 'TestOwner123!');
  teamLeadJwt = await createUserAndLogin('extralead', 'extralead@test.com', 'Password123!', 'Team Lead');
  employeeJwt = await createUserAndLogin('extraemp', 'extraemp@test.com', 'Password123!', 'Employee');

  // Get the employee's numeric id
  const strapi = (globalThis as any).strapi;
  const emp = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { email: 'extraemp@test.com' },
    select: ['id'],
  });
  employeeUserId = emp.id;

  // Create project and add employee to a group linked to it
  const proj = await authPost(ownerJwt, '/api/projects', {
    data: { name: 'Extras Project', state: 'active' },
  });
  projectDocId = proj.body.data.documentId;

  // Create group, add employee and link to project via Document Service
  await strapi.documents('api::group.group').create({
    data: {
      name: 'Extras Group',
      users_permissions_users: { connect: [employeeUserId] },
      projects: { connect: [
        (await strapi.db.query('api::project.project').findOne({
          where: { documentId: projectDocId },
          select: ['id'],
        })).id,
      ]},
    },
    status: 'published',
  });
});

// ─── assignableUsers ──────────────────────────────────────────────────────────
// task.assignableUsers is not listed in ACTION_MAP in src/index.ts
// so it returns 403 for all roles (permission gap, same as auth-html.session).

describe('Task — assignableUsers (permission gap)', () => {
  test('returns 403 — action not in ACTION_MAP', async () => {
    const res = await authGet(ownerJwt, `/api/tasks/assignable-users?project=${projectDocId}`);
    expect(res.status).toBe(403);
  });
});

// ─── parseUrl ─────────────────────────────────────────────────────────────────

describe('Task — parseUrl', () => {
  test('returns HTML preview tags for a valid URL', async () => {
    const res = await authPost(ownerJwt, '/api/tasks/parse-url', {
      url: 'https://github.com/projects/my-app/tasks/fix-login-bug',
    });
    expect(res.status).toBe(200);
    expect(res.type).toContain('html');
    expect(res.text).toContain('url-import__tag');
  });

  test('returns empty body when no URL given', async () => {
    const res = await authPost(ownerJwt, '/api/tasks/parse-url', { url: '' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
  });

  test('returns invalid-URL tag for a malformed URL', async () => {
    const res = await authPost(ownerJwt, '/api/tasks/parse-url', { url: 'not-a-url' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid URL');
  });
});

// ─── Time Entry duration auto-calculation ────────────────────────────────────

describe('Time Entry — duration auto-calculation', () => {
  let taskDocId: string;

  beforeAll(async () => {
    const task = await authPost(ownerJwt, '/api/tasks', {
      data: { title: 'Duration Calc Task', state: 'pending', project: projectDocId },
    });
    taskDocId = task.body.data.documentId;
  });

  test('startedAt + duration → stoppedAt is computed', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        startedAt: '2026-09-27T08:00:00.000Z',
        duration: 60,
      },
    });
    expect([200, 201]).toContain(res.status);
    // stoppedAt should be startedAt + 60 min
    expect(res.body.data.stoppedAt).toBe('2026-09-27T09:00:00.000Z');
    expect(res.body.data.duration).toBe(60);
  });

  test('stoppedAt + duration → startedAt is computed', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        stoppedAt: '2026-09-27T10:00:00.000Z',
        duration: 30,
      },
    });
    expect([200, 201]).toContain(res.status);
    // startedAt should be stoppedAt - 30 min
    expect(res.body.data.startedAt).toBe('2026-09-27T09:30:00.000Z');
    expect(res.body.data.duration).toBe(30);
  });

  test('startedAt + stoppedAt + duration → duration is recalculated from times', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        startedAt: '2026-09-27T08:00:00.000Z',
        stoppedAt: '2026-09-27T09:00:00.000Z',
        duration: 999, // will be overwritten
      },
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.duration).toBe(60); // calculated from times, not 999
  });
});
