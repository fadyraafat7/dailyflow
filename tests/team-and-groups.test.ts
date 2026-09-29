import { loginExisting, createUserAndLogin, authGet, authPost, authDelete } from './helpers';

let ownerJwt: string;
let teamLeadJwt: string;
let employeeJwt: string;
let createdMemberId: number;

beforeAll(async () => {
  ownerJwt    = await loginExisting('testowner@dailyflow.test', 'TestOwner123!');
  teamLeadJwt = await createUserAndLogin('tglead', 'tglead@test.com', 'Password123!', 'Team Lead');
  employeeJwt = await createUserAndLogin('tgemployee', 'tgemployee@test.com', 'Password123!', 'Employee');
});

// ─── Team ────────────────────────────────────────────────────────────────────

describe('Team — listMembers', () => {
  test('Owner can list team members', async () => {
    const res = await authGet(ownerJwt, '/api/team/members');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('Team Lead can list team members', async () => {
    const res = await authGet(teamLeadJwt, '/api/team/members');
    expect(res.status).toBe(200);
  });

  test('Employee cannot list team members', async () => {
    const res = await authGet(employeeJwt, '/api/team/members');
    expect(res.status).toBe(403);
  });
});

describe('Team — createMember', () => {
  test('Owner can create an Employee', async () => {
    const res = await authPost(ownerJwt, '/api/team/members', {
      username: 'newemployee',
      email: 'newemployee@test.com',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
      roleType: 'employee',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('newemployee');
    createdMemberId = res.body.data.id;
  });

  test('Owner can create a Team Lead', async () => {
    const res = await authPost(ownerJwt, '/api/team/members', {
      username: 'newlead',
      email: 'newlead@test.com',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
      roleType: 'team_lead',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role.type).toBe('team_lead');
  });

  test('Team Lead creating a member always creates an Employee (roleType is forced)', async () => {
    // Controller forces roleType = ROLE_EMPLOYEE for Team Leads regardless of what is sent
    const res = await authPost(teamLeadJwt, '/api/team/members', {
      username: 'leadcreated',
      email: 'leadcreated@test.com',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
      roleType: 'team_lead', // will be silently ignored — becomes employee
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role.type).toBe('employee');
  });

  test('rejects when passwords do not match', async () => {
    const res = await authPost(ownerJwt, '/api/team/members', {
      username: 'badpass',
      email: 'badpass@test.com',
      password: 'Password123!',
      passwordConfirmation: 'Wrong456!',
      roleType: 'employee',
    });
    expect(res.status).toBe(400);
  });

  test('rejects password shorter than 6 characters', async () => {
    const res = await authPost(ownerJwt, '/api/team/members', {
      username: 'shortpass',
      email: 'shortpass@test.com',
      password: 'abc',
      passwordConfirmation: 'abc',
      roleType: 'employee',
    });
    expect(res.status).toBe(400);
  });

  test('Employee cannot create members', async () => {
    const res = await authPost(employeeJwt, '/api/team/members', {
      username: 'hack', email: 'hack@test.com',
      password: 'Password123!', passwordConfirmation: 'Password123!',
      roleType: 'employee',
    });
    expect(res.status).toBe(403);
  });
});

describe('Team — resetPassword', () => {
  test('Owner can reset a member password', async () => {
    const res = await authPost(ownerJwt, `/api/team/members/${createdMemberId}/reset-password`, {
      password: 'NewPassword123!',
      passwordConfirmation: 'NewPassword123!',
    });
    expect(res.status).toBe(200);
  });

  test('rejects short password', async () => {
    const res = await authPost(ownerJwt, `/api/team/members/${createdMemberId}/reset-password`, {
      password: 'abc',
      passwordConfirmation: 'abc',
    });
    expect(res.status).toBe(400);
  });
});

describe('Team — deleteMember', () => {
  test('Owner can delete an Employee', async () => {
    const res = await authDelete(ownerJwt, `/api/team/members/${createdMemberId}`);
    expect([200, 204]).toContain(res.status);
  });
});

// ─── Groups ──────────────────────────────────────────────────────────────────
// Group routes are custom HTMX endpoints with permissions explicitly
// reconciled by the bootstrap ACTION_MAP.
// Currently api::group.group is not in ACTION_MAP so all JSON calls → 403.

describe('Groups — permissions', () => {
  test('Owner can create a group', async () => {
    const res = await authPost(ownerJwt, '/api/groups', {
      data: { name: 'Alpha Team' },
    });
    expect(res.status).toBe(200);
  });

  test('Owner can list groups', async () => {
    const res = await authGet(ownerJwt, '/api/groups/list');
    expect(res.status).toBe(200);
  });
});
