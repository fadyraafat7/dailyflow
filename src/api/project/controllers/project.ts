/**
 * project controller
 */

import { factories } from '@strapi/strapi';
import { isHtmx, renderPaginationNav } from '../../../utils/html';
import { renderProjectCards, renderProjectCreateForm, renderProjectEditForm } from '../../../renderers/project';
import {
  getRoleType,
  getUserId,
  mergeFilters,
  stripEmptyFilters,
  canManageProject,
  isProjectOwner,
  isProjectMember,
  getOwnedProjectIds,
  getGroupProjectIds,
  getAssignedProjectIds,
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
    },
  });
  if (!row) return;
  project.users_permissions_user = row.users_permissions_user ?? null;
}

export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.query.filters) ctx.query.filters = stripEmptyFilters(ctx.query.filters);
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId) {
      const [owned, groupProjects, assigned] = await Promise.all([
        getOwnedProjectIds(strapi, userId),
        getGroupProjectIds(strapi, userId),
        getAssignedProjectIds(strapi, userId),
      ]);
      mergeFilters(ctx, { id: { $in: [...new Set([...owned, ...groupProjects, ...assigned])] } });
    } else if (role === ROLE_EMPLOYEE && userId) {
      const [groupProjects, assigned] = await Promise.all([
        getGroupProjectIds(strapi, userId),
        getAssignedProjectIds(strapi, userId),
      ]);
      mergeFilters(ctx, { id: { $in: [...new Set([...groupProjects, ...assigned])] } });
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
    if (role === ROLE_TEAM_LEAD && userId && !(await isProjectOwner(strapi, id, userId)) && !(await isProjectMember(strapi, id, userId))) {
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

    const rawGroupIds = Array.isArray(data.groupIds) ? data.groupIds : data.groupIds ? [data.groupIds] : [];
    const groupIds = rawGroupIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
    delete data.groupIds;
    delete data._has_groupIds;

    const project = await strapi.documents('api::project.project').create({
      data,
      status: 'published',
      populate: { tasks: true },
    });

    if (groupIds.length) {
      const projectRow = await strapi.db.query('api::project.project').findOne({
        where: { documentId: project.documentId },
        select: ['id'],
      });
      for (const gid of groupIds) {
        await strapi.db.query('api::group.group').update({
          where: { id: gid },
          data: { projects: { connect: [{ id: projectRow.id }] } },
        });
      }
    }

    if (!isHtmx(ctx)) return { data: project };
    ctx.type = 'html';
    ctx.body = '';
  },

  async update(ctx) {
    const { id } = ctx.params;
    if (!(await canManageProject(strapi, ctx, id))) {
      return ctx.forbidden('You do not have access to this project.');
    }

    const data = toData(ctx.request.body);
    const hasGroupField = data._has_groupIds === '1' || data._has_groupIds === 1;
    const rawGroupIds = Array.isArray(data.groupIds) ? data.groupIds : data.groupIds ? [data.groupIds] : [];
    const groupIds = rawGroupIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
    delete data.groupIds;
    delete data._has_groupIds;

    ctx.request.body = { data };
    const res = await super.update(ctx);

    if (hasGroupField) {
      const projectRow = await strapi.db.query('api::project.project').findOne({
        where: { documentId: id },
        populate: ['groups'],
      });
      const projectNumericId = projectRow?.id;
      const oldGroupIds = (projectRow?.groups || []).map((g: any) => g.id);
      const connectGroupIds = groupIds.filter((gid: number) => !oldGroupIds.includes(gid));
      const disconnectGroupIds = oldGroupIds.filter((gid: number) => !groupIds.includes(gid));

      for (const gid of connectGroupIds) {
        await strapi.db.query('api::group.group').update({
          where: { id: gid },
          data: { projects: { connect: [{ id: projectNumericId }] } },
        });
      }
      for (const gid of disconnectGroupIds) {
        await strapi.db.query('api::group.group').update({
          where: { id: gid },
          data: { projects: { disconnect: [{ id: projectNumericId }] } },
        });
      }
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
  async createForm(ctx) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const allGroups = await strapi.db.query('api::group.group').findMany({
      where: { publishedAt: { $ne: null } },
      select: ['id', 'name'],
      orderBy: { name: 'asc' },
    });
    ctx.type = 'html';
    ctx.body = renderProjectCreateForm(allGroups);
  },

  async groupCheckboxes(ctx) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const allGroups = await strapi.db.query('api::group.group').findMany({
      where: { publishedAt: { $ne: null } },
      select: ['id', 'name'],
      orderBy: { name: 'asc' },
    });
    const { esc } = require('../../../utils/html');
    const html = allGroups.length
      ? allGroups.map((g: any) =>
        `<label><input type="checkbox" name="groupIds" value="${g.id}" /> ${esc(g.name)}</label>`
      ).join('\n')
      : '<p class="form-hint">No groups available.</p>';
    ctx.type = 'html';
    ctx.body = html;
  },

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

    const allGroups = await strapi.db.query('api::group.group').findMany({
      where: { publishedAt: { $ne: null } },
      select: ['id', 'name'],
      orderBy: { name: 'asc' },
    });
    const projectRow = await strapi.db.query('api::project.project').findOne({
      where: { documentId: id },
      populate: ['groups'],
    });
    const currentGroupIds = (projectRow?.groups || []).map((g: any) => g.id);
    ctx.type = 'html';
    ctx.body = renderProjectEditForm(project, allGroups, currentGroupIds);
  },
}));
