/**
 * project controller
 */

import { factories } from '@strapi/strapi';
import { isHtmx, renderPaginationNav } from '../../../utils/html';
import { renderProjectCards, renderProjectEditForm } from '../../../renderers/project';
import {
  getRoleType,
  getUserId,
  mergeFilters,
  stripEmptyFilters,
  canManageProject,
  isProjectOwner,
  isProjectMember,
  getOwnedProjectIds,
  getMemberProjectIds,
  getManagedEmployeeIds,
  ROLE_OWNER,
  ROLE_TEAM_LEAD,
  ROLE_EMPLOYEE,
} from '../../../utils/access';

/** Projects per page when a request doesn't specify its own pagination. */
const DEFAULT_PAGE_SIZE = 3;

function toData(body: any) {
  const data = body?.data ?? body ?? {};
  for (const key of Object.keys(data)) {
    if (data[key] === '') delete data[key];
  }
  return data;
}

/**
 * Backfill `users_permissions_user`/`team_members` onto an already-fetched
 * project. Just like task.ts's attachCreators, Strapi's content-API output
 * sanitizer silently drops both — even for Owner — because no role here
 * has `find` permission on plugin::users-permissions.user (see
 * src/utils/access.ts). Without this, the "Edit project" modal's
 * team-member checkboxes would always render as empty, even right after
 * successfully assigning someone. The raw Query Engine isn't subject to
 * that sanitizer.
 */
async function attachTeamRelations(strapi: any, project: any): Promise<void> {
  if (!project) return;
  const row = await strapi.db.query('api::project.project').findOne({
    where: { id: project.id },
    populate: {
      users_permissions_user: { select: ['id', 'username'] },
      team_members: { select: ['id', 'username', 'email'] },
    },
  });
  if (!row) return;
  project.users_permissions_user = row.users_permissions_user ?? null;
  project.team_members = row.team_members ?? [];
}

/**
 * Normalize the team_members value coming from either a JSON API body
 * ({ set: [1,2] }) or an HTML form (checkbox values as strings, plus a
 * hidden "_has_team_members" sentinel so an empty selection is
 * distinguishable from "field not sent").
 */
function normalizeTeamMemberIds(raw: any): number[] {
  if (raw?.set) return raw.set.map(Number).filter(Number.isFinite);
  if (Array.isArray(raw)) return raw.map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
  if (typeof raw === 'string' && raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? [n] : [];
  }
  return [];
}

export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.query.filters) ctx.query.filters = stripEmptyFilters(ctx.query.filters);
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId) {
      mergeFilters(ctx, { id: { $in: await getOwnedProjectIds(strapi, userId) } });
    } else if (role === ROLE_EMPLOYEE && userId) {
      mergeFilters(ctx, { id: { $in: await getMemberProjectIds(strapi, userId) } });
    }

    const incomingPagination = (ctx.query.pagination as object) || {};
    ctx.query = {
      ...ctx.query,
      populate: { tasks: true },
      pagination: { pageSize: DEFAULT_PAGE_SIZE, page: 1, ...incomingPagination },
    };
    const res = await super.find(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';

    let html = renderProjectCards(res.data ?? [], role || '');

    const meta = (res as any).meta?.pagination;
    if (meta) {
      html += renderPaginationNav(meta, '/api/projects', '#projects', '#project-filters');
    }

    ctx.body = html;
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId && !(await isProjectOwner(strapi, id, userId))) {
      return ctx.notFound();
    }
    if (role === ROLE_EMPLOYEE && userId && !(await isProjectMember(strapi, id, userId))) {
      return ctx.notFound();
    }
    const res = await super.findOne(ctx);
    if (res?.data) await attachTeamRelations(strapi, res.data);
    return res;
  },

  async create(ctx) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Team Leads and Owners can create projects.');
    }

    const data = toData(ctx.request.body);
    data.users_permissions_user = userId;

    const project = await strapi.documents('api::project.project').create({
      data,
      status: 'published',
      populate: { tasks: true },
    });

    if (!isHtmx(ctx)) return { data: project };
    ctx.type = 'html';
    ctx.body = '';
  },

  async update(ctx) {
    const { id } = ctx.params;
    if (!(await canManageProject(strapi, ctx, id))) {
      return ctx.forbidden('You do not have access to this project.');
    }

    const rawBody = ctx.request.body?.data ?? ctx.request.body ?? {};
    const hasTeamField = Object.prototype.hasOwnProperty.call(rawBody, 'team_members')
      || Object.prototype.hasOwnProperty.call(rawBody, '_has_team_members');
    const rawTeamMembers = rawBody.team_members;

    let memberIds: number[] = [];
    if (hasTeamField) {
      memberIds = normalizeTeamMemberIds(rawTeamMembers);
      const employeeCount = await strapi.db.query('plugin::users-permissions.user').count({
        where: { id: { $in: memberIds }, role: { type: ROLE_EMPLOYEE } },
      });
      if (employeeCount !== memberIds.length) {
        return ctx.forbidden('Projects can only include Employees as team members.');
      }
      if (getRoleType(ctx) === ROLE_TEAM_LEAD) {
        const managedIds = await getManagedEmployeeIds(strapi, getUserId(ctx) as number);
        if (memberIds.some((memberId) => !managedIds.includes(memberId))) {
          return ctx.forbidden('You can only assign Employees within your team scope.');
        }
      }
    }

    const data = toData(ctx.request.body);
    delete data.team_members;
    delete data._has_team_members;
    ctx.request.body = { data };

    const res = await super.update(ctx);

    if (hasTeamField) {
      await strapi.documents('api::project.project').update({
        documentId: id,
        data: { team_members: memberIds },
        status: 'published',
      });
    }

    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = '';
  },

  async delete(ctx) {
    const { id } = ctx.params;
    if (!(await canManageProject(strapi, ctx, id))) {
      return ctx.forbidden('You do not have access to this project.');
    }
    const res = await super.delete(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = '';
  },

  /**
   * GET /projects/:id/edit-form
   * Returns the project edit modal HTML with pre-filled values and
   * team-member checkboxes. Owner/Team Lead only.
   */
  async editForm(ctx) {
    const { id } = ctx.params;
    if (!(await canManageProject(strapi, ctx, id))) {
      return ctx.notFound();
    }

    const project = await strapi.documents('api::project.project').findOne({
      documentId: id,
      populate: { tasks: true },
    });
    if (!project) return ctx.notFound();

    const row = await strapi.db.query('api::project.project').findOne({
      where: { id: project.id },
      populate: { team_members: { select: ['id', 'username'] } },
    });
    const currentMemberIds = (row?.team_members || []).map((u: any) => u.id);

    const employeeIds = getRoleType(ctx) === ROLE_TEAM_LEAD
      ? await getManagedEmployeeIds(strapi, getUserId(ctx) as number)
      : undefined;
    const employees = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: {
        role: { type: ROLE_EMPLOYEE },
        ...(employeeIds ? { id: { $in: employeeIds } } : {}),
      },
      orderBy: { username: 'asc' },
    });

    ctx.type = 'html';
    ctx.body = renderProjectEditForm(project, employees, currentMemberIds);
  },
}));
