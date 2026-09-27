import request from 'supertest';
import { loginExisting, createUserAndLogin, authGet, authPost, authPut, authDelete } from './helpers';

let ownerJwt: string;
let teamLeadJwt: string;
let employeeJwt: string;
let projectDocId: string;

beforeAll(async () => {
  ownerJwt    = await loginExisting('testowner@dailyflow.test', 'TestOwner123!');
  teamLeadJwt = await createUserAndLogin('projlead', 'projlead@test.com', 'Password123!', 'Team Lead');
  employeeJwt = await createUserAndLogin('projemployee', 'projemployee@test.com', 'Password123!', 'Employee');
});

describe('Projects — create', () => {
  test('Owner can create a project', async () => {
    const res = await authPost(ownerJwt, '/api/projects', {
      data: { name: 'Owner Project', state: 'active' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Owner Project');
    projectDocId = res.body.data.documentId;
  });

  test('Team Lead can create a project', async () => {
    const res = await authPost(teamLeadJwt, '/api/projects', {
      data: { name: 'Lead Project', state: 'active' },
    });
    expect(res.status).toBe(200);
  });

  test('Employee cannot create a project', async () => {
    const res = await authPost(employeeJwt, '/api/projects', {
      data: { name: 'Employee Project', state: 'active' },
    });
    expect(res.status).toBe(403);
  });
});

describe('Projects — read', () => {
  test('Owner can list all projects', async () => {
    const res = await authGet(ownerJwt, '/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('Owner can get a single project', async () => {
    const res = await authGet(ownerJwt, `/api/projects/${projectDocId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documentId).toBe(projectDocId);
  });

  test('Employee list returns 200 (only sees assigned/group projects)', async () => {
    // Employee with no group assignments gets 200 with empty or filtered list
    const res = await authGet(employeeJwt, '/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Projects — update', () => {
  test('Owner can update a project', async () => {
    const res = await authPut(ownerJwt, `/api/projects/${projectDocId}`, {
      data: { name: 'Owner Project Updated', state: 'active' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Owner Project Updated');
  });

  test('Employee cannot update a project', async () => {
    const res = await authPut(employeeJwt, `/api/projects/${projectDocId}`, {
      data: { name: 'Hacked', state: 'active' },
    });
    expect(res.status).toBe(403);
  });
});

describe('Projects — delete', () => {
  test('Owner can delete their project', async () => {
    const created = await authPost(ownerJwt, '/api/projects', {
      data: { name: 'To Delete', state: 'active' },
    });
    const docId = created.body.data.documentId;
    const res = await authDelete(ownerJwt, `/api/projects/${docId}`);
    expect([200, 204]).toContain(res.status);
  });

  test('Employee cannot delete a project', async () => {
    const res = await authDelete(employeeJwt, `/api/projects/${projectDocId}`);
    expect(res.status).toBe(403);
  });
});

describe('Projects — unauthenticated', () => {
  test('returns 403 without JWT (Public role has no access)', async () => {
    // Bootstrap revokes Public role access → 403 not 401
    const res = await request((globalThis as any).strapi.server.httpServer)
      .get('/api/projects');
    expect(res.status).toBe(403);
  });
});
