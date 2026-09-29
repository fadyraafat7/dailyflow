import { loginExisting, createUserAndLogin, authGet, authPost, authPut, authDelete } from './helpers';
import request from 'supertest';

let ownerJwt: string;
let employeeJwt: string;
let assignedEmployeeJwt: string;
let memberEmployeeJwt: string;
let projectDocId: string;
let taskDocId: string;
let entryDocId: string;

beforeAll(async () => {
  ownerJwt    = await loginExisting('testowner@dailyflow.test', 'TestOwner123!');
  employeeJwt = await createUserAndLogin('timeemployee', 'timeemployee@test.com', 'Password123!', 'Employee');
  assignedEmployeeJwt = await createUserAndLogin('assignedtimeemployee', 'assignedtimeemployee@test.com', 'Password123!', 'Employee');
  memberEmployeeJwt = await createUserAndLogin('membertimeemployee', 'membertimeemployee@test.com', 'Password123!', 'Employee');

  const proj = await authPost(ownerJwt, '/api/projects', {
    data: { name: 'Time Entry Project', state: 'active' },
  });
  projectDocId = proj.body.data.documentId;

  const task = await authPost(ownerJwt, '/api/tasks', {
    data: { title: 'Time Entry Task', state: 'pending', project: projectDocId },
  });
  taskDocId = task.body.data.documentId;

  // This employee has no group membership in the project. Their legitimate
  // access comes solely from being assigned to this exact task.
  const strapi = (globalThis as any).strapi;
  const assignedEmployee = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { email: 'assignedtimeemployee@test.com' },
    select: ['id'],
  });
  await strapi.db.query('api::task.task').update({
    where: { documentId: taskDocId },
    data: { assigned_to: assignedEmployee.id },
  });

  const memberEmployee = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { email: 'membertimeemployee@test.com' },
    select: ['id'],
  });
  const project = await strapi.db.query('api::project.project').findOne({
    where: { documentId: projectDocId },
    select: ['id'],
  });
  await strapi.documents('api::group.group').create({
    data: {
      name: 'Time Entry Members',
      users_permissions_users: { connect: [memberEmployee.id] },
      projects: { connect: [project.id] },
    },
    status: 'published',
  });
});

describe('Time Entries — create', () => {
  test('Owner can create a time entry with auto-computed duration', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        startedAt: '2026-09-27T08:00:00.000Z',
        stoppedAt: '2026-09-27T09:30:00.000Z',
      },
    });
    // Strapi core router returns 201 for creates
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.duration).toBe(90);
    entryDocId = res.body.data.documentId;
  });

  test('rejects entry where stoppedAt is before startedAt', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        startedAt: '2026-09-27T10:00:00.000Z',
        stoppedAt: '2026-09-27T09:00:00.000Z',
      },
    });
    expect(res.status).toBe(400);
  });

  test('rejects entry with no task', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: { startedAt: '2026-09-27T08:00:00.000Z' },
    });
    expect(res.status).toBe(400);
  });

  test('Employee cannot create entry for a task they have no access to', async () => {
    const res = await authPost(employeeJwt, '/api/time-entries', {
      data: { task: taskDocId, startedAt: '2026-09-27T08:00:00.000Z' },
    });
    expect(res.status).toBe(403);
  });

  test('Employee assigned to the task can create a time entry', async () => {
    const res = await authPost(assignedEmployeeJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        startedAt: '2026-09-27T08:00:00.000Z',
        stoppedAt: '2026-09-27T08:15:00.000Z',
        comment: 'Assigned task work',
      },
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.duration).toBe(15);
  });

  test('Employee in a project group can create a time entry', async () => {
    const res = await authPost(memberEmployeeJwt, '/api/time-entries', {
      data: {
        task: taskDocId,
        startedAt: '2026-09-27T09:00:00.000Z',
        stoppedAt: '2026-09-27T09:30:00.000Z',
      },
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.duration).toBe(30);
  });

  test('returns 404 for a task that does not exist', async () => {
    const res = await authPost(ownerJwt, '/api/time-entries', {
      data: { task: '00000000-0000-0000-0000-000000000000', startedAt: '2026-09-27T08:00:00.000Z' },
    });
    expect(res.status).toBe(404);
  });
});

describe('Time Entries — read', () => {
  test('Owner can list time entries', async () => {
    const res = await authGet(ownerJwt, '/api/time-entries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('Owner can get one time entry', async () => {
    const res = await authGet(ownerJwt, `/api/time-entries/${entryDocId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documentId).toBe(entryDocId);
  });
});

describe('Time Entries — update', () => {
  test('Owner can update a time entry', async () => {
    const res = await authPut(ownerJwt, `/api/time-entries/${entryDocId}`, {
      data: {
        startedAt: '2026-09-27T08:00:00.000Z',
        stoppedAt: '2026-09-27T10:00:00.000Z',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.duration).toBe(120);
  });
});

describe('Time Entries — stop (PUT)', () => {
  test('Owner can stop a running timer', async () => {
    const created = await authPost(ownerJwt, '/api/time-entries', {
      data: { task: taskDocId, startedAt: new Date(Date.now() - 60000).toISOString() },
    });
    const runningDocId = created.body.data.documentId;

    // Stop route is PUT /api/time-entries/:id/stop
    const res = await authPut(ownerJwt, `/api/time-entries/${runningDocId}/stop`, {});
    expect(res.status).toBe(200);
    expect(res.body.data.stoppedAt).toBeTruthy();
    expect(res.body.data.duration).toBeGreaterThanOrEqual(1);
  });
});

describe('Time Entries — delete', () => {
  test('Owner can delete a time entry', async () => {
    const res = await authDelete(ownerJwt, `/api/time-entries/${entryDocId}`);
    expect([200, 204]).toContain(res.status);
  });
});
