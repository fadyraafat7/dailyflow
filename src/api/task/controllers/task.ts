/**
 * task controller
 *
 * HTMX-style requests get clean HTML (content + data-* only, no behaviour).
 * Everything else gets JSON. All interaction lives in the frontend.
 */

import { factories } from '@strapi/strapi';
import { isHtmx, esc, renderPaginationNav } from '../../../utils/html';
import { renderTaskCard, renderTaskCards } from '../../../renderers/task';
import {
  getRoleType,
  getUserId,
  mergeFilters,
  canAccessProject,
  canManageProject,
  ROLE_OWNER,
  ROLE_TEAM_LEAD,
} from '../../../utils/access';

/** Tasks per page when a request doesn't specify its own pagination. */
const DEFAULT_PAGE_SIZE = 5;

/** Accept flat form fields or JSON; drop empty strings. */
function toData(body: any) {
  const data = body?.data ?? body ?? {};
  for (const k of Object.keys(data)) if (data[k] === '') delete data[k];
  return data;
}

function prettifySlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Plain-text marker the frontend looks for in a rejected response's body
 * to tell "duplicate title" apart from any other error. */
const DUPLICATE_TITLE_MARKER = 'dailyflow:duplicate-task-title';

/**
 * Is there already a task with this title? Scoped to the same project
 * (two different projects can reasonably both have a "Setup CI" task),
 * or among project-less tasks when no project is given. Case/whitespace
 * insensitive so "Fix login" and "fix login " count as the same title.
 * A true match blocks creation — the caller is expected to reject the
 * request rather than create a second task with the same title.
 */
async function findDuplicateTask(
  strapi: any,
  title: string,
  projectDocId: string | null,
  excludeDocumentId?: string,
): Promise<boolean> {
  const trimmed = (title || '').trim();
  if (!trimmed) return false;

  const filters: any = {
    title: { $eqi: trimmed },
    project: projectDocId ? { documentId: projectDocId } : { $null: true },
  };
  if (excludeDocumentId) filters.documentId = { $ne: excludeDocumentId };

  const matches = await strapi.documents('api::task.task').findMany({ filters, limit: 1 });
  return matches.length > 0;
}

function parseUrlInfo(url: string) {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);

  let projectName = '';
  let taskName = '';

  const projIdx = segments.findIndex((s) => /^projects?$/i.test(s));
  if (projIdx !== -1 && segments[projIdx + 1]) {
    projectName = prettifySlug(segments[projIdx + 1]);
  }

  const taskIdx = segments.findIndex((s) => /^tasks?$/i.test(s));
  if (taskIdx !== -1 && segments[taskIdx + 1]) {
    taskName = prettifySlug(segments[taskIdx + 1]);
  } else if (segments.length) {
    taskName = prettifySlug(segments[segments.length - 1]);
  }

  return { projectName, taskName };
}

/** documentId of the project a task belongs to (or null for a project-less task). */
async function getTaskProjectDocId(strapi: any, taskDocId: string): Promise<string | null> {
  const task = await strapi.documents('api::task.task').findOne({
    documentId: taskDocId,
    populate: { project: true },
  });
  return (task as any)?.project?.documentId ?? null;
}

export default factories.createCoreController('api::task.task', ({ strapi }) => ({
  async find(ctx) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId) mergeFilters(ctx, { project: { users_permissions_user: userId } });
    if (role === 'employee' && userId) mergeFilters(ctx, { project: { team_members: userId } });

    const incomingPagination = (ctx.query.pagination as object) || {};
    ctx.query = {
      ...ctx.query,
      populate: { ...(ctx.query.populate as object), time_entries: true },
      pagination: { pageSize: DEFAULT_PAGE_SIZE, page: 1, ...incomingPagination },
    };
    const res = await super.find(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';

    let html = renderTaskCards(res.data ?? []);

    const meta = (res as any).meta?.pagination;
    if (meta) {
      html += renderPaginationNav(meta, 'goToTasksPage');
    }

    ctx.body = html;
  },

  async findOne(ctx) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (role === ROLE_TEAM_LEAD && userId) mergeFilters(ctx, { project: { users_permissions_user: userId } });
    if (role === 'employee' && userId) mergeFilters(ctx, { project: { team_members: userId } });

    ctx.query = { ...ctx.query, populate: { ...(ctx.query.populate as object), time_entries: true } };
    const res = await super.findOne(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = renderTaskCard(res.data);
  },

  async create(ctx) {
    const data = toData(ctx.request.body);
    ctx.request.body = { data };

    const projectDocId = typeof data.project === 'string' ? data.project : null;

    // Every task must belong to a project the caller is authorized for:
    // Team Leads only their own project, Employees only a project
    // they've been assigned to. A task with no project at all is only
    // allowed for Owner/Team Lead (matches the "Employees work within
    // assigned projects" model).
    if (projectDocId) {
      if (!(await canAccessProject(strapi, ctx, projectDocId))) {
        return ctx.forbidden('You do not have access to this project.');
      }
    } else {
      const role = getRoleType(ctx);
      if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
        return ctx.forbidden('Tasks must belong to a project you have access to.');
      }
    }

    const isDuplicate = await findDuplicateTask(strapi, data.title, projectDocId);
    if (isDuplicate) {
      if (!isHtmx(ctx)) return ctx.badRequest('A task with this title already exists in this project.');
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = DUPLICATE_TITLE_MARKER;
      return;
    }

    const res = await super.create(ctx);
    if (!isHtmx(ctx)) return res;
    const task = await strapi.documents('api::task.task').findOne({ documentId: res.data.documentId, populate: { time_entries: true } });
    ctx.type = 'html';
    ctx.body = renderTaskCard(task);
  },

  async update(ctx) {
    const { id } = ctx.params;
    const projectDocId = await getTaskProjectDocId(strapi, id);
    if (!(await canAccessProject(strapi, ctx, projectDocId || ''))) {
      return ctx.forbidden('You do not have access to this task.');
    }

    ctx.request.body = { data: toData(ctx.request.body) };
    const res = await super.update(ctx);
    if (!isHtmx(ctx)) return res;
    const task = await strapi.documents('api::task.task').findOne({ documentId: res.data.documentId, populate: { time_entries: true } });
    ctx.type = 'html';
    ctx.body = renderTaskCard(task);
  },

  async delete(ctx) {
    const { id } = ctx.params;
    // Deletion is Owner/Team Lead only at the role-permission level
    // already (Employees never reach this action) — this scopes a Team
    // Lead to deleting tasks only within their own projects.
    const projectDocId = await getTaskProjectDocId(strapi, id);
    if (!(await canManageProject(strapi, ctx, projectDocId || ''))) {
      return ctx.forbidden('You do not have access to this task.');
    }

    const res = await super.delete(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = '';
  },

  async fromUrl(ctx) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const url = body.url || '';
    const title = body.title || '';
    const projectName = body.projectName || '';
    const priority = body.priority || 'low';
    const state = body.state || 'pending';

    // 1) Parse the URL if provided
    let parsed = { projectName: '', taskName: '' };
    if (url) {
      try { parsed = parseUrlInfo(url); } catch { /* invalid URL, ignore */ }
    }

    const finalTitle = title || parsed.taskName;
    const finalProjectName = projectName || parsed.projectName;

    if (!finalTitle) {
      return ctx.badRequest('Task title is required');
    }

    // 2) Find or create the project
    let projectDocId: string | null = null;

    if (finalProjectName) {
      const existing = await strapi.documents('api::project.project').findMany({
        filters: { name: { $eqi: finalProjectName } },
        limit: 1,
      });

      if (existing.length > 0) {
        projectDocId = existing[0].documentId;
      } else if (role === ROLE_OWNER || role === ROLE_TEAM_LEAD) {
        // Only Owners/Team Leads can spin up a brand-new project this
        // way — Employees don't create projects.
        const created = await strapi.documents('api::project.project').create({
          data: { name: finalProjectName, state: 'active', users_permissions_user: userId },
          status: 'published',
        });
        projectDocId = created.documentId;
      } else {
        if (!isHtmx(ctx)) {
          return ctx.forbidden(`No project named "${finalProjectName}" is available to you — ask your Team Lead to create it and add you to it.`);
        }
        ctx.status = 403;
        ctx.type = 'html';
        ctx.body = `No project named "${esc(finalProjectName)}" is available to you — ask your Team Lead to create it and add you to it.`;
        return;
      }
    }

    // 2b) Whether the project already existed or was just resolved, the
    // caller still needs access to it.
    if (projectDocId && !(await canAccessProject(strapi, ctx, projectDocId))) {
      return ctx.forbidden('You do not have access to this project.');
    }

    // 3) Reject (don't create) if a task with this title already exists
    // in the same project — the frontend surfaces this as an error toast
    // and leaves the form open so the user can pick a different title.
    const isDuplicate = await findDuplicateTask(strapi, finalTitle, projectDocId);
    if (isDuplicate) {
      if (!isHtmx(ctx)) return ctx.badRequest('A task with this title already exists in this project.');
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = DUPLICATE_TITLE_MARKER;
      return;
    }

    // 4) Create the task
    const taskData: any = { title: finalTitle, priority, state };
    if (projectDocId) taskData.project = projectDocId;

    const task = await strapi.documents('api::task.task').create({
      data: taskData, status: 'published', populate: { time_entries: true },
    });

    if (!isHtmx(ctx)) {
      return { data: task, projectCreated: !projectDocId ? false : true };
    }

    // The frontend submits this with hx-swap="none" and reloads both lists
    // itself (refresh-tasks / refresh-projects) so the active search/filter
    // stay in effect, instead of us pushing an unfiltered HTML fragment back.
    ctx.type = 'html';
    ctx.body = '';
  },

  async parseUrl(ctx) {
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const url = body.url || '';

    if (!url) {
      ctx.type = 'html';
      ctx.body = '';
      return;
    }

    let parsed = { projectName: '', taskName: '' };
    try { parsed = parseUrlInfo(url); } catch {
      ctx.type = 'html';
      ctx.body = '<span class="url-import__tag">Invalid URL</span>';
      return;
    }

    const host = new URL(url).hostname;
    const tags: string[] = [];
    if (parsed.projectName) tags.push(`<span class="url-import__tag">📁 Project: <strong>${esc(parsed.projectName)}</strong></span>`);
    if (parsed.taskName) tags.push(`<span class="url-import__tag">📝 Task: <strong>${esc(parsed.taskName)}</strong></span>`);
    if (host) tags.push(`<span class="url-import__tag">🌐 ${esc(host)}</span>`);

    let html = `<div class="url-import__preview">${tags.join('')}</div>`;

    // Use hx-swap-oob to fill form fields from the server
    if (parsed.projectName) {
      html += `<input id="field-projectName" name="projectName" type="text" class="form-control" placeholder="Project name..." value="${esc(parsed.projectName)}" hx-swap-oob="outerHTML:#field-projectName" />`;
    }
    if (parsed.taskName) {
      html += `<input id="field-title" name="title" type="text" class="form-control" placeholder="Task title..." required value="${esc(parsed.taskName)}" hx-swap-oob="outerHTML:#field-title" />`;
    }

    ctx.type = 'html';
    ctx.body = html;
  },
}));
