import type { Core } from '@strapi/strapi';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * DailyFlow bootstrap.
 *
 * Runs on every server start and is fully idempotent — it never
 * recreates roles/permissions/accounts that already exist, so it's safe
 * to leave in place permanently rather than running once and deleting.
 *
 * What it does:
 *   1. Creates the three custom roles (Owner / Team Lead / Employee) if
 *      they don't exist yet.
 *   2. Grants/revokes permissions on those roles to match the matrix
 *      below (safe to re-run — it reconciles rather than duplicating).
 *   3. Revokes the Public role's access to project/task/time-entry (this
 *      is what let the whole app run with zero authentication so far).
 *   4. If there are no users at all yet, creates a default Owner account
 *      with a random password (printed to the console and written to
 *      .owner-credentials.txt) so there's a way to log in at all.
 *   5. Assigns any existing project with no owner to that Owner account,
 *      so pre-existing data doesn't become invisible once Team Lead/
 *      Employee visibility filtering goes live.
 */

type RoleType = 'owner' | 'team_lead' | 'employee';

const ROLE_DEFS: { name: string; type: RoleType; description: string }[] = [
  {
    name: 'Owner',
    type: 'owner',
    description: 'Full access to every project, task, and time entry in DailyFlow.',
  },
  {
    name: 'Team Lead',
    type: 'team_lead',
    description:
      'Creates projects and assigns Employees to them; manages the tasks and time entries inside their own projects.',
  },
  {
    name: 'Employee',
    type: 'employee',
    description:
      'Adds and edits tasks and time entries only inside projects they have been assigned to as a team member.',
  },
];

const ALL_ROLE_TYPES: RoleType[] = ['owner', 'team_lead', 'employee'];

/** action name -> which roles get it, per content type. Owner gets everything by convention below as well. */
const ACTION_MAP: { uid: string; actions: Record<string, RoleType[]> }[] = [
  {
    uid: 'api::project.project',
    actions: {
      find: ['owner', 'team_lead', 'employee'],
      findOne: ['owner', 'team_lead', 'employee'],
      create: ['owner', 'team_lead'],
      update: ['owner', 'team_lead'],
      delete: ['owner', 'team_lead'],
    },
  },
  {
    uid: 'api::task.task',
    actions: {
      find: ['owner', 'team_lead', 'employee'],
      findOne: ['owner', 'team_lead', 'employee'],
      create: ['owner', 'team_lead', 'employee'],
      update: ['owner', 'team_lead', 'employee'],
      delete: ['owner', 'team_lead'],
      fromUrl: ['owner', 'team_lead', 'employee'],
      parseUrl: ['owner', 'team_lead', 'employee'],
    },
  },
  {
    uid: 'api::time-entry.time-entry',
    actions: {
      // Time entries have no owner field of their own — visibility is
      // scoped transitively via the parent task's project in the
      // controller, so every role gets full CRUD here at the
      // permission-system level.
      find: ['owner', 'team_lead', 'employee'],
      findOne: ['owner', 'team_lead', 'employee'],
      create: ['owner', 'team_lead', 'employee'],
      update: ['owner', 'team_lead', 'employee'],
      delete: ['owner', 'team_lead', 'employee'],
      stop: ['owner', 'team_lead', 'employee'],
    },
  },
  {
    uid: 'plugin::users-permissions.user',
    actions: {
      // Just enough for the frontend to know who's logged in and show
      // the right UI — not general user-management access.
      me: ['owner', 'team_lead', 'employee'],
    },
  },
];

async function ensureRoles(strapi: Core.Strapi): Promise<Record<RoleType, any>> {
  const roles: Partial<Record<RoleType, any>> = {};
  for (const def of ROLE_DEFS) {
    let role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: def.type } });
    if (!role) {
      role = await strapi.db.query('plugin::users-permissions.role').create({
        data: { name: def.name, description: def.description, type: def.type },
      });
      strapi.log.info(`[dailyflow] Created role "${def.name}".`);
    }
    roles[def.type] = role;
  }
  return roles as Record<RoleType, any>;
}

async function reconcilePermissions(strapi: Core.Strapi, roles: Record<RoleType, any>) {
  let created = 0;
  let removed = 0;
  for (const { uid, actions } of ACTION_MAP) {
    for (const [action, allowedRoles] of Object.entries(actions)) {
      const actionId = `${uid}.${action}`;
      for (const roleType of ALL_ROLE_TYPES) {
        const role = roles[roleType];
        const shouldHave = allowedRoles.includes(roleType);
        const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
          where: { action: actionId, role: role.id },
        });
        if (shouldHave && !existing) {
          await strapi.db.query('plugin::users-permissions.permission').create({
            data: { action: actionId, role: role.id },
          });
          created += 1;
        } else if (!shouldHave && existing) {
          await strapi.db.query('plugin::users-permissions.permission').delete({ where: { id: existing.id } });
          removed += 1;
        }
      }
    }
  }
  if (created || removed) {
    strapi.log.info(`[dailyflow] Permissions reconciled (+${created}/-${removed}).`);
  }
}

async function revokePublicAccess(strapi: Core.Strapi) {
  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  if (!publicRole) return;

  const uids = ['api::project.project', 'api::task.task', 'api::time-entry.time-entry'];
  const toDelete = await strapi.db.query('plugin::users-permissions.permission').findMany({
    where: {
      role: publicRole.id,
      $or: uids.map((uid) => ({ action: { $startsWith: `${uid}.` } })),
    },
  });
  for (const perm of toDelete) {
    await strapi.db.query('plugin::users-permissions.permission').delete({ where: { id: perm.id } });
  }
  if (toDelete.length) {
    strapi.log.warn(
      `[dailyflow] Revoked ${toDelete.length} Public-role permission(s) on project/task/time-entry — the app now requires login.`,
    );
  }
}

async function ensureOwnerAccount(strapi: Core.Strapi, ownerRole: any) {
  const userCount = await strapi.db.query('plugin::users-permissions.user').count();
  if (userCount > 0) return;

  const password = crypto.randomBytes(9).toString('base64url');
  const email = 'nohaalideveloper@gmail.com';
  const username = 'noha';

  await strapi.plugin('users-permissions').service('user').add({
    username,
    email,
    password,
    provider: 'local',
    confirmed: true,
    blocked: false,
    role: ownerRole.id,
  });

  const message = [
    '=====================================================',
    'DailyFlow: no users existed yet, so a first account was',
    'created for you with the Owner role.',
    `  email:    ${email}`,
    `  username: ${username}`,
    `  password: ${password}`,
    'This password is shown only this once — log in and change',
    'it from your account settings as soon as you can.',
    '=====================================================',
  ].join('\n');
  strapi.log.warn(message);

  try {
    const credsPath = path.join(strapi.dirs.app.root, '.owner-credentials.txt');
    fs.writeFileSync(credsPath, message + '\n', 'utf8');
    strapi.log.warn(`[dailyflow] Also wrote these credentials to ${credsPath} — delete that file once you've logged in.`);
  } catch (err) {
    strapi.log.error('[dailyflow] Could not write .owner-credentials.txt', err as Error);
  }
}

async function migrateOwnerlessData(strapi: Core.Strapi, ownerRole: any) {
  const owner = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { role: ownerRole.id } });
  if (!owner) return;

  const orphanProjects = await strapi.db.query('api::project.project').findMany({
    where: { users_permissions_user: null },
  });
  for (const project of orphanProjects) {
    await strapi.db.query('api::project.project').update({
      where: { id: project.id },
      data: { users_permissions_user: owner.id },
    });
  }
  if (orphanProjects.length) {
    strapi.log.info(`[dailyflow] Assigned ${orphanProjects.length} pre-existing ownerless project(s) to the Owner account.`);
  }
}

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const roles = await ensureRoles(strapi);
    await reconcilePermissions(strapi, roles);
    await revokePublicAccess(strapi);
    await ensureOwnerAccount(strapi, roles.owner);
    await migrateOwnerlessData(strapi, roles.owner);
  },
};
