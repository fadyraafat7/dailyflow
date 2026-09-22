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
  stripEmptyFilters,
  canAccessProject,
  canManageProject,
  getOwnedProjectIds,
  getGroupProjectIds,
  getMemberProjectIds,
  getManagedEmployeeIds,
  ROLE_OWNER,
  ROLE_TEAM_LEAD,
  ROLE_EMPLOYEE,
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

/**
 * Backfill `users_permissions_user` (the "Added by <username>" credit) onto
 * already-fetched tasks. `super.find()`/`super.findOne()` populate this
 * relation fine, but Strapi's content-API output sanitizer silently drops
 * it from the response for every role here — Owner included — because
 * none of our roles has `find` permission on plugin::users-permissions.user
 * (see src/utils/access.ts for why). The raw Query Engine isn't subject to
 * that sanitizer, so one extra query fills it back in.
 */
async function attachCreators(strapi: any, tasks: any[]): Promise<void> {
  if (!tasks.length) return;
  const ids = tasks.map((t) => t.id).filter((id) => id != null);
  if (!ids.length) return;
  const rows = await strapi.db.query('api::task.task').findMany({
    where: { id: { $in: ids } },
    populate: {
      users_permissions_user: { select: ['id', 'username'] },
      assigned_to: { select: ['id', 'username'] },
    },
  });
  const byId = new Map<number, any>(rows.map((r: any) => [r.id, r]));
  for (const task of tasks) {
    const row: any = byId.get(task.id);
    (task as any).users_permissions_user = row?.users_permissions_user ?? null;
    (task as any).assigned_to = row?.assigned_to ?? null;
  }
}

async function isUserInProjectGroups(strapi: any, userId: number, projectDocId: string): Promise<boolean> {
  if (!projectDocId || !userId) return false;
  const groups = await strapi.db.query('api::group.group').findMany({
    where: {
      projects: { documentId: projectDocId },
      users_permissions_users: userId,
      publishedAt: { $ne: null },
    },
    select: ['id'],
    limit: 1,
  });
  return groups.length > 0;
}

export default factories.createCoreController('api::task.task', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.query.filters) ctx.query.filters = stripEmptyFilters(ctx.query.filters);
    // Same restricted-relation issue as project.find() (see
    // src/utils/access.ts) — filtering by `project: { users_permissions_user:
    // userId } }` / `{ team_members: userId }` throws for Team Lead/Employee
    // because that recurses into a relation targeting
    // plugin::users-permissions.user, which no role has `find` permission
    // on. Resolve the allowed PROJECT ids first (a plain query, not a
    // content-API filter) and scope by those instead — `project.id` isn't
    // itself a restricted relation since api::project.project.find IS
    // granted to every role.
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    const assignedTaskIds = userId ? (await strapi.db.query('api::task.task').findMany({
      where: { assigned_to: userId },
      select: ['id'],
    })).map((t: any) => t.id) : [];

    if (role === ROLE_TEAM_LEAD && userId) {
      const ownedIds = await getOwnedProjectIds(strapi, userId);
      const groupProjectIds = await getGroupProjectIds(strapi, userId);
      const allProjectIds = [...new Set([...ownedIds, ...groupProjectIds])];
      if (assignedTaskIds.length) {
        mergeFilters(ctx, { $or: [
          { project: { id: { $in: allProjectIds } } },
          { id: { $in: assignedTaskIds } },
        ]});
      } else {
        mergeFilters(ctx, { project: { id: { $in: allProjectIds } } });
      }
    } else if (role === ROLE_EMPLOYEE && userId) {
      const memberProjectIds = await getMemberProjectIds(strapi, userId);
      if (assignedTaskIds.length) {
        mergeFilters(ctx, { $or: [
          { project: { id: { $in: memberProjectIds } } },
          { id: { $in: assignedTaskIds } },
        ]});
      } else {
        mergeFilters(ctx, { project: { id: { $in: memberProjectIds } } });
      }
    }

    const incomingPagination = (ctx.query.pagination as object) || {};
    ctx.query = {
      ...ctx.query,
      populate: { ...(ctx.query.populate as object), time_entries: true },
      pagination: { pageSize: DEFAULT_PAGE_SIZE, page: 1, ...incomingPagination },
    };
    const res = await super.find(ctx);
    await attachCreators(strapi, res.data ?? []);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';

    const sort = typeof ctx.query.sort === 'string' ? ctx.query.sort : '';
    let html = renderTaskCards(res.data ?? [], role || '', sort);

    const meta = (res as any).meta?.pagination;
    if (meta) {
      html += renderPaginationNav(meta, '/api/tasks', '#tasks', '#task-filters');
    }

    ctx.body = html;
  },

  async findOne(ctx) {
    // findOne() targets a single task by id, so — like project.findOne()
    // — access is checked directly against that one task's project
    // instead of adding a query filter (which would hit the same
    // restricted-relation problem described in find() above).
    const { id } = ctx.params;
    const role = getRoleType(ctx);
    const projectDocId = await getTaskProjectDocId(strapi, id);
    if (projectDocId) {
      if (!(await canAccessProject(strapi, ctx, projectDocId))) {
        return ctx.notFound();
      }
    } else if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.notFound();
    }

    ctx.query = {
      ...ctx.query,
      populate: { ...(ctx.query.populate as object), time_entries: true },
    };
    const res = await super.findOne(ctx);
    if (res?.data) await attachCreators(strapi, [res.data]);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = renderTaskCard(res.data, role || '');
  },

  async create(ctx) {
    const data = toData(ctx.request.body);
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

    // Record who actually created the task — independent of the
    // project's own owning Team Lead — regardless of what (if anything)
    // the client sent for this field. Purely informational (surfaced as
    // "Added by <username>" on the card); access control still runs
    // entirely off the project, not off this field.
    data.users_permissions_user = getUserId(ctx);

    if (data.assigned_to) {
      data.assigned_to = Number(data.assigned_to) || null;
    }

    if (data.assigned_to && projectDocId) {
      if (!(await isUserInProjectGroups(strapi, data.assigned_to, projectDocId))) {
        return ctx.badRequest('The assigned user does not belong to any group linked to this project.');
      }
    }

    // Create via Document Service directly instead of super.create() —
    // same two reasons as project.create() (see src/utils/access.ts and
    // that method's comment): super.create() 400s on the
    // users_permissions_user line above for every role including Owner
    // (content-API blocks setting any plugin::users-permissions.user
    // relation without `find` permission on that content type), and it
    // would leave the task as an unpublished draft that find()/findOne()
    // never returns, since this content type has draftAndPublish on.
    // IMPORTANT: populate users_permissions_user with an explicit `fields`
    // list, never `true`/full object. Document Service bypasses the
    // content-API output sanitizer entirely (that's what makes it usable
    // here at all — see the comment above) — including the sanitizer step
    // that normally strips `password`/resetPasswordToken/confirmationToken
    // from a populated user. `populate: { users_permissions_user: true }`
    // was verified live to return the creator's bcrypt password hash and
    // reset tokens in the plain JSON response; restricting to id/username
    // is what task.attachCreators() and project.attachTeamRelations() also
    // do, for the same reason.
    const task = await strapi.documents('api::task.task').create({
      data,
      status: 'published',
      populate: { time_entries: true, users_permissions_user: { fields: ['username'] }, assigned_to: { fields: ['username'] } },
    });

    if (!isHtmx(ctx)) return { data: task };
    ctx.type = 'html';
    ctx.body = renderTaskCard(task, getRoleType(ctx) || '');
  },

  async update(ctx) {
    const { id } = ctx.params;
    const projectDocId = await getTaskProjectDocId(strapi, id);
    if (!(await canAccessProject(strapi, ctx, projectDocId || ''))) {
      return ctx.forbidden('You do not have access to this task.');
    }

    const updateData = toData(ctx.request.body);
    const assignedToValue = updateData.assigned_to !== undefined
      ? (updateData.assigned_to ? Number(updateData.assigned_to) : null)
      : undefined;
    delete updateData.assigned_to;

    if (assignedToValue && projectDocId) {
      if (!(await isUserInProjectGroups(strapi, assignedToValue, projectDocId))) {
        return ctx.badRequest('The assigned user does not belong to any group linked to this project.');
      }
    }

    ctx.request.body = { data: updateData };
    const res = await super.update(ctx);

    if (assignedToValue !== undefined) {
      await strapi.documents('api::task.task').update({
        documentId: res.data.documentId,
        data: { assigned_to: assignedToValue },
        status: 'published',
      });
    }

    if (!isHtmx(ctx)) return res;
    const task = await strapi.documents('api::task.task').findOne({
      documentId: res.data.documentId,
      populate: { time_entries: true, users_permissions_user: { fields: ['username'] }, assigned_to: { fields: ['username'] } },
    });
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
    const taskData: any = { title: finalTitle, priority, state, users_permissions_user: userId };
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

  async assignableUsers(ctx) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const projectDocId = ctx.query.project as string;
    const selected = ctx.query.selected ? Number(ctx.query.selected) : null;

    let users: any[] = [];
    if (projectDocId) {
      const groups = await strapi.db.query('api::group.group').findMany({
        where: {
          projects: { documentId: projectDocId },
          publishedAt: { $ne: null },
        },
        populate: { users_permissions_users: { select: ['id', 'username'] } },
      });
      const userMap = new Map<number, any>();
      for (const g of groups) {
        for (const u of g.users_permissions_users || []) {
          userMap.set(u.id, u);
        }
      }
      users = [...userMap.values()].sort((a, b) => a.username.localeCompare(b.username));

      if (role === ROLE_TEAM_LEAD) {
        const userId = getUserId(ctx);
        const empIds = await getManagedEmployeeIds(strapi, userId as number);
        const empSet = new Set(empIds);
        users = users.filter((u) => empSet.has(u.id));
      }
    }

    const options = users.map((u: any) =>
      `<option value="${u.id}" ${selected === u.id ? 'selected' : ''}>${esc(u.username)}</option>`
    ).join('');

    ctx.type = 'html';
    ctx.body = `<option value="">Unassigned</option>${options}`;
  },
}));
