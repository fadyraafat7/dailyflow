import { authPost, authPut, createUserAndLogin, loginExisting } from './helpers';
import { hasSameId } from '../src/utils/access';

let ownerJwt: string;
let teamLeadJwt: string;
let employeeAJwt: string;
let employeeBJwt: string;
let employeeAId: number;
let employeeBId: number;
let assignedToADocId: string;
let assignedToBDocId: string;
let teamLeadTaskDocId: string;

beforeAll(async () => {
  const strapi = (globalThis as any).strapi;
  ownerJwt = await loginExisting('testowner@dailyflow.test', 'TestOwner123!');
  teamLeadJwt = await createUserAndLogin('updatelead', 'updatelead@test.com', 'Password123!', 'Team Lead');
  employeeAJwt = await createUserAndLogin('updateemployeea', 'updateemployeea@test.com', 'Password123!', 'Employee');
  employeeBJwt = await createUserAndLogin('updateemployeeb', 'updateemployeeb@test.com', 'Password123!', 'Employee');

  const [employeeA, employeeB] = await Promise.all([
    strapi.db.query('plugin::users-permissions.user').findOne({ where: { email: 'updateemployeea@test.com' }, select: ['id'] }),
    strapi.db.query('plugin::users-permissions.user').findOne({ where: { email: 'updateemployeeb@test.com' }, select: ['id'] }),
  ]);
  employeeAId = employeeA.id;
  employeeBId = employeeB.id;

  const project = await authPost(ownerJwt, '/api/projects', {
    data: { name: 'Task Update Access Project', state: 'active' },
  });
  const projectDocId = project.body.data.documentId;
  const projectRow = await strapi.db.query('api::project.project').findOne({
    where: { documentId: projectDocId },
    select: ['id'],
  });

  // Both Employees can see this project. The update assertions below ensure
  // that sharing a project does not let one Employee update another's task.
  await strapi.documents('api::group.group').create({
    data: {
      name: 'Task Update Access Group',
      users_permissions_users: { connect: [employeeAId, employeeBId] },
      projects: { connect: [projectRow.id] },
    },
    status: 'published',
  });

  const assignedToA = await authPost(ownerJwt, '/api/tasks', {
    data: { title: 'Assigned to Employee A', state: 'pending', project: projectDocId, assigned_to: employeeAId },
  });
  assignedToADocId = assignedToA.body.data.documentId;

  const assignedToB = await authPost(ownerJwt, '/api/tasks', {
    data: { title: 'Assigned to Employee B', state: 'pending', project: projectDocId, assigned_to: employeeBId },
  });
  assignedToBDocId = assignedToB.body.data.documentId;

  const teamLeadProject = await authPost(teamLeadJwt, '/api/projects', {
    data: { name: 'Team Lead Update Project', state: 'active' },
  });
  const teamLeadTask = await authPost(teamLeadJwt, '/api/tasks', {
    data: { title: 'Team Lead Update Task', state: 'pending', project: teamLeadProject.body.data.documentId },
  });
  teamLeadTaskDocId = teamLeadTask.body.data.documentId;
});

describe('Task update authorization', () => {
  test('normalizes relation and authenticated-user ID types', () => {
    expect(hasSameId({ id: '42' }, 42)).toBe(true);
    expect(hasSameId({ id: 42 }, '42')).toBe(true);
    expect(hasSameId({ id: '42' }, 7)).toBe(false);
  });

  test('Employee can update a task assigned to their authenticated user', async () => {
    const res = await authPut(employeeAJwt, `/api/tasks/${assignedToADocId}`, {
      data: { state: 'active' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('active');
  });

  test('Employee cannot update another Employee\'s task, even in a shared project', async () => {
    const res = await authPut(employeeAJwt, `/api/tasks/${assignedToBDocId}`, {
      data: { state: 'completed' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('You do not have access to this task.');
  });

  test('Owner retains task update access', async () => {
    const res = await authPut(ownerJwt, `/api/tasks/${assignedToADocId}`, {
      data: { priority: 'high' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe('high');
  });

  test('Team Lead retains update access to their project task', async () => {
    const res = await authPut(teamLeadJwt, `/api/tasks/${teamLeadTaskDocId}`, {
      data: { state: 'active' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('active');
  });
});
