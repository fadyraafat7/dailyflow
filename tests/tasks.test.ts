import { createUserAndLogin, loginExisting, authGet, authPost, authDelete } from './helpers';

let ownerJwt: string;
let employeeJwt: string;
let projectDocId: string;

beforeAll(async () => {
  // Owner was created by bootstrap — just login with the same credentials
  ownerJwt = await loginExisting('testowner@dailyflow.test', 'TestOwner123!');
  employeeJwt = await createUserAndLogin('testemployee', 'employee@test.com', 'Password123!', 'Employee');

  // Create a project as Owner for the task tests
  const res = await authPost(ownerJwt, '/api/projects', {
    data: { name: 'Test Project', state: 'active' },
  });
  projectDocId = res.body.data?.documentId;
});

describe('Tasks — Owner', () => {
  let taskDocId: string;

  test('can create a task', async () => {
    const res = await authPost(ownerJwt, '/api/tasks', {
      data: { title: 'My First Task', state: 'pending', project: projectDocId },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('My First Task');
    taskDocId = res.body.data.documentId;
  });

  test('rejects duplicate task title in the same project', async () => {
    const res = await authPost(ownerJwt, '/api/tasks', {
      data: { title: 'My First Task', state: 'pending', project: projectDocId },
    });
    expect(res.status).toBe(400);
  });

  test('can list tasks', async () => {
    const res = await authGet(ownerJwt, '/api/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('can delete a task', async () => {
    const res = await authDelete(ownerJwt, `/api/tasks/${taskDocId}`);
    expect([200, 204]).toContain(res.status);
  });
});

describe('Tasks — Employee', () => {
  test('cannot create a task without an assigned project', async () => {
    const res = await authPost(employeeJwt, '/api/tasks', {
      data: { title: 'Employee Loose Task', state: 'pending' },
    });
    // Employee must belong to a project — expect 403
    expect(res.status).toBe(403);
  });
});

describe('Tasks — from-url endpoint', () => {
  test('creates a task from a GitHub URL', async () => {
    const res = await authPost(ownerJwt, '/api/tasks/from-url', {
      data: {
        url: 'https://github.com/projects/my-app/tasks/fix-login-bug',
        priority: 'high',
        state: 'pending',
      },
    });
    expect(res.status).toBe(200);
  });

  test('returns 400 when no title can be derived', async () => {
    const res = await authPost(ownerJwt, '/api/tasks/from-url', {
      data: { url: '', title: '' },
    });
    expect(res.status).toBe(400);
  });
});
