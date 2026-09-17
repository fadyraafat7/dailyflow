/**
 * project controller

 */

import { factories } from '@strapi/strapi';
import { isHtmx, renderPaginationNav } from '../../../utils/html';
import { renderProjectCards } from '../../../renderers/project';
import {
  getRoleType,
  getUserId,
  mergeFilters,
  canManageProject,
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

export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  async find(ctx) {
    // Scope the list to what this role is allowed to see: Owner sees
    // everything, Team Lead sees projects they created, Employee sees
    // only projects they've been added to as a team member.
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId) mergeFilters(ctx, { users_permissions_user: userId });
    if (role === ROLE_EMPLOYEE && userId) mergeFilters(ctx, { team_members: userId });

    const incomingPagination = (ctx.query.pagination as object) || {};
    ctx.query = {
      ...ctx.query,
      populate: { tasks: true },
      pagination: { pageSize: DEFAULT_PAGE_SIZE, page: 1, ...incomingPagination },
    };
    const res = await super.find(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';

    let html = renderProjectCards(res.data ?? []);

    const meta = (res as any).meta?.pagination;
    if (meta) {
      html += renderPaginationNav(meta, 'goToProjectsPage');
    }

    ctx.body = html;
  },

  async findOne(ctx) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId) mergeFilters(ctx, { users_permissions_user: userId });
    if (role === ROLE_EMPLOYEE && userId) mergeFilters(ctx, { team_members: userId });
    return super.findOne(ctx);
  },

  // Create/update/delete no longer render the list themselves — the
  // frontend refetches via a "refresh-projects" event so the current
  // search/filter/page stay in effect instead of resetting to page 1
  // unfiltered.
  async create(ctx) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    // Only Team Leads (and Owners, acting as their own Team Lead) create
    // projects — Employees are added to a project's team, not creators
    // of one. The role-permission grants already block Employees from
    // reaching this action at all; this is just defense in depth.
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Team Leads and Owners can create projects.');
    }

    const data = toData(ctx.request.body);
    // The creator becomes the project's owning Team Lead, regardless of
    // what (if anything) the client sent for this field.
    data.users_permissions_user = userId;
    ctx.request.body = { data };

    const res = await super.create(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = '';
  },

  async update(ctx) {
    const { id } = ctx.params;
    if (!(await canManageProject(strapi, ctx, id))) {
      return ctx.forbidden('You do not have access to this project.');
    }
    ctx.request.body = { data: toData(ctx.request.body) };
    const res = await super.update(ctx);
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
}));
