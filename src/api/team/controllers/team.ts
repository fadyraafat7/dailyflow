/**
 * team controller
 *
 * A small internal "team management" API — not a content type of its own,
 * just a few actions layered on top of the users-permissions plugin so
 * Owners/Team Leads don't have to go into the Strapi /admin panel to add
 * teammates or help someone who forgot their password:
 *
 *   - modal:         full team-management modal HTML (HTMX)
 *   - listMembers:   who this caller can see, to assign as project team_members
 *   - createMember:  Owner creates Team Leads/Employees; Team Lead creates Employees
 *   - resetPassword: Owner/Team Lead resets a managed teammate's password
 *
 * All three read/write plugin::users-permissions.user through the plugin's
 * own user service, which hashes passwords itself and stays in sync with
 * the Document Service — we never touch bcrypt or the raw password field
 * directly.
 */

import { isHtmx } from '../../../utils/html';
import {
  getRoleType,
  getUserId,
  getManagedEmployeeIds,
  isManagedEmployee,
  ROLE_OWNER,
  ROLE_TEAM_LEAD,
  ROLE_EMPLOYEE,
} from '../../../utils/access';
import { renderTeamMembersList, renderTeamModal } from '../../../renderers/team';

function sanitize(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    confirmed: !!user.confirmed,
    blocked: !!user.blocked,
    role: user.role ? { id: user.role.id, name: user.role.name, type: user.role.type } : null,
  };
}

export default ({ strapi }: { strapi: any }) => ({
  /**
   * GET /team/modal
   * Returns the full team-management modal HTML. HTMX-only.
   */
  async modal(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Owners and Team Leads can view the team.');
    }

    const managedIds = role === ROLE_TEAM_LEAD
      ? await getManagedEmployeeIds(strapi, getUserId(ctx) as number)
      : undefined;
    const where = role === ROLE_TEAM_LEAD
      ? { id: { $in: managedIds }, role: { type: ROLE_EMPLOYEE } }
      : { role: { type: { $in: [ROLE_TEAM_LEAD, ROLE_EMPLOYEE] } } };
    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      where,
      populate: { role: true },
      orderBy: { username: 'asc' },
    });
    let projects: any[];
    if (role === ROLE_TEAM_LEAD) {
      const userId = getUserId(ctx);
      const ownedIds = (await strapi.db.query('api::project.project').findMany({
        where: { users_permissions_user: userId, publishedAt: { $ne: null } },
        select: ['id'],
      })).map((r: any) => r.id);
      const { getGroupProjectIds } = require('../../../utils/access');
      const groupProjectIds = await getGroupProjectIds(strapi, userId);
      const allIds = [...new Set([...ownedIds, ...groupProjectIds])];
      projects = allIds.length
        ? await strapi.db.query('api::project.project').findMany({
            where: { id: { $in: allIds } },
            select: ['id', 'name', 'state'],
            orderBy: { name: 'asc' },
          })
        : [];
    } else {
      projects = await strapi.db.query('api::project.project').findMany({
        where: { publishedAt: { $ne: null } },
        select: ['id', 'name', 'state'],
        orderBy: { name: 'asc' },
      });
    }

    const groups = await strapi.db.query('api::group.group').findMany({
      where: { publishedAt: { $ne: null } },
      select: ['id', 'name'],
      orderBy: { name: 'asc' },
    });

    ctx.type = 'html';
    ctx.body = renderTeamModal(users.map(sanitize), role as string, projects, groups);
  },

  /**
   * GET /team/members
   * Owner sees everyone; Team Lead sees Employees only.
   * Returns HTML for HTMX requests, JSON otherwise.
   */
  async listMembers(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Owners and Team Leads can view the team.');
    }

    const managedIds = role === ROLE_TEAM_LEAD
      ? await getManagedEmployeeIds(strapi, getUserId(ctx) as number)
      : undefined;
    const where = role === ROLE_TEAM_LEAD
      ? { id: { $in: managedIds }, role: { type: ROLE_EMPLOYEE } }
      : { role: { type: { $in: [ROLE_TEAM_LEAD, ROLE_EMPLOYEE] } } };
    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      where,
      populate: { role: true },
      orderBy: { username: 'asc' },
    });

    const members = users.map(sanitize);

    if (!isHtmx(ctx)) {
      ctx.body = { data: members };
      return;
    }

    ctx.type = 'html';
    ctx.body = renderTeamMembersList(members, role);
  },

  /**
  * POST /team/members  { username, email, password, passwordConfirmation, roleType? }
   * Owner can create Team Leads or Employees. Team Lead can only create
   * Employees. Password is optional — auto-generated when omitted.
   */
  async createMember(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Owners and Team Leads can add team members.');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    const roleType = role === ROLE_TEAM_LEAD ? ROLE_EMPLOYEE : body.roleType;
    const providedPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const passwordConfirmation = typeof body.passwordConfirmation === 'string' ? body.passwordConfirmation.trim() : '';

    if (!username || !email) {
      return ctx.badRequest('Username and email are required.');
    }
    if (roleType !== ROLE_TEAM_LEAD && roleType !== ROLE_EMPLOYEE) {
      return ctx.badRequest('roleType must be "team_lead" or "employee".');
    }
    if (role === ROLE_TEAM_LEAD && roleType !== ROLE_EMPLOYEE) {
      return ctx.forbidden('Team Leads can only add Employees.');
    }
    if (!providedPassword || providedPassword.length < 6) {
      return ctx.badRequest('Password is required and must be at least 6 characters.');
    }
    if (providedPassword !== passwordConfirmation) {
      return ctx.badRequest('Password and confirmation do not match.');
    }

    const targetRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: roleType } });
    if (!targetRole) return ctx.badRequest(`Role "${roleType}" is not set up.`);

    const password = providedPassword;

    let created: any;
    try {
      created = await strapi.plugin('users-permissions').service('user').add({
        username,
        email,
        password,
        provider: 'local',
        confirmed: true,
        blocked: false,
        role: targetRole.id,
      });
    } catch (err: any) {
      return ctx.badRequest(
        err?.message || 'Could not create this user (the email or username may already be in use).',
      );
    }

    const rawGroupIds = Array.isArray(body.groupIds) ? body.groupIds : body.groupIds ? [body.groupIds] : [];
    const groupIds = rawGroupIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
    if (groupIds.length) {
      const groups = await strapi.db.query('api::group.group').findMany({
        where: { id: { $in: groupIds }, publishedAt: { $ne: null } },
        select: ['id', 'documentId'],
      });
      for (const group of groups) {
        await strapi.documents('api::group.group').update({
          documentId: group.documentId,
          data: { users_permissions_users: { connect: [created.id] } },
          status: 'published',
        });
      }
    }

    if (!isHtmx(ctx)) {
      ctx.body = {
        data: {
          ...sanitize({ ...created, role: targetRole }),
          password,
        },
      };
      return;
    }

    ctx.type = 'html';
    ctx.body = `<div class="password-reveal"><div>Member <strong>${created.username}</strong> created successfully.</div></div>`;
  },

  /**
   * POST /team/members/:id/reset-password
   */
  async resetPassword(ctx: any) {
    const role = getRoleType(ctx);
    const callerId = getUserId(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden("Only Owners and Team Leads can reset a teammate's password.");
    }

    const targetId = Number(ctx.params.id);
    if (!targetId) return ctx.badRequest('Invalid user id.');
    if (targetId === callerId) {
      return ctx.badRequest('Use "Change password" in your account menu to change your own password.');
    }

    const target = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: targetId },
      populate: { role: true },
    });
    if (!target) return ctx.notFound('User not found.');

    if (role === ROLE_OWNER && target.role?.type === ROLE_OWNER) {
      return ctx.forbidden("Owners cannot reset another Owner's password here.");
    }
    if (role === ROLE_TEAM_LEAD) {
      const isEmployee = target.role?.type === ROLE_EMPLOYEE;
      const managed = isEmployee && (await isManagedEmployee(strapi, callerId as number, targetId));
      if (!managed) {
        return ctx.forbidden('You can only reset the password of Employees on your own projects.');
      }
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const newPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const passwordConfirmation = typeof body.passwordConfirmation === 'string' ? body.passwordConfirmation.trim() : '';
    if (!newPassword || newPassword.length < 6) {
      return ctx.badRequest('Password is required and must be at least 6 characters.');
    }
    if (newPassword !== passwordConfirmation) {
      return ctx.badRequest('Password and confirmation do not match.');
    }
    await strapi.plugin('users-permissions').service('user').edit(target.id, { password: newPassword });

    if (!isHtmx(ctx)) {
      ctx.body = { data: { id: target.id, username: target.username } };
      return;
    }

    ctx.type = 'html';
    ctx.body = `<div class="password-reveal"><div>Password updated for <strong>${target.username}</strong>.</div></div>`;
  },

  /** DELETE /team/members/:id. Relations are reassigned or detached first. */
  async deleteMember(ctx: any) {
    const role = getRoleType(ctx);
    const callerId = getUserId(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Owners and Team Leads can delete team members.');
    }

    const targetId = Number(ctx.params.id);
    if (!targetId || targetId === callerId) return ctx.badRequest('This user cannot be deleted here.');
    const target = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: targetId },
      populate: { role: true },
    });
    if (!target) return ctx.notFound('User not found.');
    const targetRole = target.role?.type;
    if (targetRole === ROLE_OWNER || (role === ROLE_TEAM_LEAD && targetRole !== ROLE_EMPLOYEE)) {
      return ctx.forbidden('You do not have permission to delete this user.');
    }
    if (role === ROLE_TEAM_LEAD && !(await isManagedEmployee(strapi, callerId as number, targetId))) {
      return ctx.forbidden('You can only delete Employees on your own projects.');
    }

    const owner = role === ROLE_OWNER
      ? await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { role: { type: ROLE_OWNER }, id: { $ne: targetId } },
      })
      : null;
    if (targetRole === ROLE_TEAM_LEAD && owner) {
      const ownedProjects = await strapi.db.query('api::project.project').findMany({
        where: { users_permissions_user: targetId },
        select: ['id', 'documentId'],
      });
      for (const project of ownedProjects) {
        await strapi.documents('api::project.project').update({
          documentId: project.documentId,
          data: { users_permissions_user: owner.id },
          status: 'published',
        });
      }
    }
    const userGroups = await strapi.db.query('api::group.group').findMany({
      where: { users_permissions_users: targetId, publishedAt: { $ne: null } },
      select: ['id', 'documentId'],
    });
    for (const group of userGroups) {
      await strapi.documents('api::group.group').update({
        documentId: group.documentId,
        data: { users_permissions_users: { disconnect: [targetId] } },
        status: 'published',
      });
    }
    await strapi.db.query('api::task.task').updateMany({
      where: { users_permissions_user: targetId },
      data: { users_permissions_user: null },
    });
    await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: targetId } });

    if (!isHtmx(ctx)) {
      ctx.body = { data: { id: targetId } };
      return;
    }
    ctx.type = 'html';
    ctx.body = '';
  },
});
