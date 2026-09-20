import type { Core } from '@strapi/strapi';
import { generateRandomPassword } from './utils/password';

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
 *   4. If there are no users at all yet, creates an Owner account using
 *      deployment-provided identity settings and a random password.
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
      editForm: ['owner', 'team_lead'],
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
  {
    uid: 'plugin::users-permissions.auth',
    actions: {
      // Self-service password change — the controller itself also checks
      // ctx.state.user, this just makes sure our custom roles (which are
      // not the plugin's built-in "Authenticated" role) are granted it.
      changePassword: ['owner', 'team_lead', 'employee'],
    },
  },
  {
    uid: 'api::team.team',
    actions: {
      modal: ['owner', 'team_lead'],
      listMembers: ['owner', 'team_lead'],
      createMember: ['owner', 'team_lead'],
      resetPassword: ['owner', 'team_lead'],
      deleteMember: ['owner', 'team_lead'],
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

  const uids = ['api::project.project', 'api::task.task', 'api::time-entry.time-entry', 'api::team.team'];
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
  const existingOwner = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { role: ownerRole.id },
  });
  if (existingOwner) return existingOwner;
  if (userCount > 0) {
    throw new Error('[dailyflow] Existing users found but no Owner exists. Set an Owner role before starting the app.');
  }

  const email = process.env.DAILYFLOW_OWNER_EMAIL?.trim();
  const username = process.env.DAILYFLOW_OWNER_USERNAME?.trim();
  if (!email || !username) {
    throw new Error('[dailyflow] Empty database: set DAILYFLOW_OWNER_EMAIL and DAILYFLOW_OWNER_USERNAME before starting.');
  }
  const password = process.env.DAILYFLOW_OWNER_PASSWORD?.trim() || generateRandomPassword();

  const created = await strapi.plugin('users-permissions').service('user').add({
    username,
    email,
    password,
    provider: 'local',
    confirmed: true,
    blocked: false,
    role: ownerRole.id,
  });

  strapi.log.warn(`[dailyflow] Created Owner account for ${email} (${username}).`);
  if (!process.env.DAILYFLOW_OWNER_PASSWORD) {
    strapi.log.warn(`[dailyflow] Generated Owner password (store it securely): ${password}`);
  }
  return await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: created.id } });
}

async function migrateOwnerlessData(strapi: Core.Strapi, owner: any) {
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
    const owner = await ensureOwnerAccount(strapi, roles.owner);
    await migrateOwnerlessData(strapi, owner);
  },
};
