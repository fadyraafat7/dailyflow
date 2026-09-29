import path from 'path';
import { createStrapi } from '@strapi/strapi';
import {
  DEMO_GROUPS,
  DEMO_PROJECTS,
  DEMO_TASKS,
  DEMO_TIME_ENTRIES,
  DEMO_USERS,
  type DemoUser,
} from './data';
import { connectMissingRelations, emptyCounts, findOneBy, printSummary } from './helpers';

type StrapiLike = any;

const OWNER_DEFAULTS = DEMO_USERS.find((user) => user.role === 'owner')!;

function rejectProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed cannot run in production.');
  }
}

function configureFreshDatabaseOwner() {
  // The normal bootstrap remains the single owner of role and initial Owner
  // creation. These defaults only make `npm run seed` work against a fresh
  // local database that has not configured DAILYFLOW_OWNER_* yet.
  process.env.DAILYFLOW_OWNER_EMAIL ||= OWNER_DEFAULTS.email;
  process.env.DAILYFLOW_OWNER_USERNAME ||= OWNER_DEFAULTS.username;
  process.env.DAILYFLOW_OWNER_PASSWORD ||= OWNER_DEFAULTS.password;
}

async function ensureUser(strapi: StrapiLike, user: DemoUser, roleId: number) {
  const existing = await findOneBy(strapi, 'plugin::users-permissions.user', { email: user.email });
  if (existing) {
    // Demo addresses are reserved for this development-only dataset. Refresh
    // their predictable credentials through the plugin service so a reset
    // database and an already-seeded database behave the same way. `edit`
    // hashes the password; no plaintext is written directly to the database.
    const updated = await strapi.plugin('users-permissions').service('user').edit(existing.id, {
      password: user.password,
      confirmed: true,
      blocked: false,
      role: roleId,
    });
    console.log(`↻ Reusing ${user.email} (demo credentials refreshed)`);
    return updated;
  }

  const created = await strapi.plugin('users-permissions').service('user').add({
    username: user.username,
    email: user.email,
    password: user.password,
    provider: 'local',
    confirmed: true,
    blocked: false,
    role: roleId,
  });
  console.log(`+ Created ${user.email}`);
  return created;
}

async function ensureGroup(strapi: StrapiLike, name: string, memberIds: number[]) {
  const existing = await findOneBy(strapi, 'api::group.group', { name });
  if (!existing) {
    const created = await strapi.documents('api::group.group').create({
      data: { name, users_permissions_users: { connect: memberIds } },
      status: 'published',
    });
    console.log(`+ Created group: ${name}`);
    return created;
  }

  await connectMissingRelations(
    strapi,
    'api::group.group',
    existing.documentId,
    'users_permissions_users',
    (existing.users_permissions_users || []).map((member: any) => member.id),
    memberIds,
  );
  console.log(`↻ Reusing group: ${name}`);
  return existing;
}

async function ensureProject(strapi: StrapiLike, definition: (typeof DEMO_PROJECTS)[number], ownerId: number) {
  const existing = await findOneBy(strapi, 'api::project.project', { name: definition.name });
  if (!existing) {
    const created = await strapi.documents('api::project.project').create({
      data: {
        name: definition.name,
        description: definition.description,
        state: definition.state,
        users_permissions_user: ownerId,
      },
      status: 'published',
    });
    console.log(`+ Created project: ${definition.name}`);
    return created;
  }

  await strapi.documents('api::project.project').update({
    documentId: existing.documentId,
    status: 'published',
    data: {
      description: definition.description,
      state: definition.state,
      users_permissions_user: ownerId,
    },
  });
  console.log(`↻ Reusing project: ${definition.name}`);
  return existing;
}

async function ensureTask(strapi: StrapiLike, definition: (typeof DEMO_TASKS)[number], projectId: number, creatorId: number, assignedToId: number) {
  const existing = await findOneBy(strapi, 'api::task.task', {
    title: definition.title,
    project: projectId,
  });
  const data = {
    title: definition.title,
    plannedDate: definition.plannedDate,
    priority: definition.priority,
    state: definition.state,
    project: projectId,
    users_permissions_user: creatorId,
    assigned_to: assignedToId,
  };

  if (!existing) {
    const created = await strapi.documents('api::task.task').create({ data, status: 'published' });
    console.log(`+ Created task: ${definition.project} / ${definition.title}`);
    return created;
  }

  await strapi.documents('api::task.task').update({ documentId: existing.documentId, data, status: 'published' });
  console.log(`↻ Reusing task: ${definition.project} / ${definition.title}`);
  return existing;
}

async function ensureTimeEntry(strapi: StrapiLike, definition: (typeof DEMO_TIME_ENTRIES)[number], taskId: number) {
  const existing = await findOneBy(strapi, 'api::time-entry.time-entry', {
    task: taskId,
    startedAt: definition.startedAt,
  });
  const stoppedAt = new Date(new Date(definition.startedAt).getTime() + definition.duration * 60_000).toISOString();
  const data = { task: taskId, startedAt: definition.startedAt, stoppedAt, duration: definition.duration };

  if (!existing) {
    await strapi.documents('api::time-entry.time-entry').create({ data, status: 'published' });
    console.log(`+ Created time entry: ${definition.project} / ${definition.task}`);
    return;
  }

  await strapi.documents('api::time-entry.time-entry').update({ documentId: existing.documentId, data, status: 'published' });
  console.log(`↻ Reusing time entry: ${definition.project} / ${definition.task}`);
}

async function runSeed(strapi: StrapiLike) {
  const counts = emptyCounts();
  const roles = new Map<string, any>();
  for (const type of ['owner', 'team_lead', 'employee']) {
    const role = await findOneBy(strapi, 'plugin::users-permissions.role', { type });
    if (!role) throw new Error(`Required role "${type}" was not created by bootstrap.`);
    roles.set(type, role);
  }
  console.log('✓ Roles verified');

  const users = new Map<string, any>();
  const bootstrappedOwner = await findOneBy(strapi, 'plugin::users-permissions.user', { role: roles.get('owner').id });
  if (!bootstrappedOwner) throw new Error('Bootstrap completed without an Owner account.');

  if (bootstrappedOwner.email !== OWNER_DEFAULTS.email) {
    console.log(`↻ Preserving bootstrap Owner: ${bootstrappedOwner.email}`);
  }
  for (const user of DEMO_USERS) {
    users.set(user.key, await ensureUser(strapi, user, roles.get(user.role).id));
  }
  counts.users = users.size;

  const groups = new Map<string, any>();
  for (const group of DEMO_GROUPS) {
    const memberIds = group.members.map((member) => users.get(member).id);
    groups.set(group.name, await ensureGroup(strapi, group.name, memberIds));
  }
  counts.groups = groups.size;

  const projects = new Map<string, any>();
  for (const project of DEMO_PROJECTS) {
    projects.set(project.name, await ensureProject(strapi, project, users.get(project.owner).id));
  }
  for (const project of DEMO_PROJECTS) {
    const projectRecord = projects.get(project.name);
    for (const groupName of project.groups) {
      const groupRecord = await strapi.db.query('api::group.group').findOne({
        where: { documentId: groups.get(groupName).documentId },
        populate: { projects: { select: ['id'] } },
      });
      await connectMissingRelations(
        strapi,
        'api::group.group',
        groupRecord.documentId,
        'projects',
        (groupRecord.projects || []).map((linkedProject: any) => linkedProject.id),
        [projectRecord.id],
      );
    }
  }
  counts.projects = projects.size;

  const tasks = new Map<string, any>();
  for (const task of DEMO_TASKS) {
    const project = projects.get(task.project);
    const projectDefinition = DEMO_PROJECTS.find((candidate) => candidate.name === task.project)!;
    const created = await ensureTask(
      strapi,
      task,
      project.id,
      users.get(projectDefinition.owner).id,
      users.get(task.assignedTo).id,
    );
    tasks.set(`${task.project}\u0000${task.title}`, created);
  }
  counts.tasks = tasks.size;

  for (const entry of DEMO_TIME_ENTRIES) {
    await ensureTimeEntry(strapi, entry, tasks.get(`${entry.project}\u0000${entry.task}`).id);
  }
  counts.timeEntries = DEMO_TIME_ENTRIES.length;

  printSummary(counts, { email: OWNER_DEFAULTS.email, password: OWNER_DEFAULTS.password });
}

async function main() {
  rejectProduction();
  configureFreshDatabaseOwner();
  console.log('🌱 Starting DailyFlow demo seed...\n');

  // `seed:compile` has already compiled this TypeScript project. Calling
  // compileStrapi from the compiled process causes Strapi's compiler to end
  // the current Node process, so point createStrapi at that known output.
  const appContext = { appDir: process.cwd(), distDir: path.join(process.cwd(), 'dist') };
  const strapi = await createStrapi(appContext).load();
  try {
    await runSeed(strapi);
    console.log('\n🌱 Demo seed completed successfully.');
  } finally {
    await strapi.destroy();
  }
}

main().catch((error) => {
  console.error('\n✗ DailyFlow demo seed failed:', error);
  process.exitCode = 1;
});
