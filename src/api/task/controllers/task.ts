/**
 * task controller
 *
 * HTMX-style requests get clean HTML (content + data-* only, no behaviour).
 * Everything else gets JSON. All interaction lives in the frontend.
 */

import { factories } from '@strapi/strapi';
import { isHtmx, esc } from '../../../utils/html';
import { renderTaskCard, renderTaskCards } from '../../../renderers/task';
import { renderProjectCards } from '../../../renderers/project';

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

export default factories.createCoreController('api::task.task', ({ strapi }) => ({
  async find(ctx) {
    ctx.query = { ...ctx.query, populate: { ...(ctx.query.populate as object), time_entries: true } };
    const res = await super.find(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = renderTaskCards(res.data ?? []);
  },

  async findOne(ctx) {
    ctx.query = { ...ctx.query, populate: { ...(ctx.query.populate as object), time_entries: true } };
    const res = await super.findOne(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = renderTaskCard(res.data);
  },

  async create(ctx) {
    ctx.request.body = { data: toData(ctx.request.body) };
    const res = await super.create(ctx);
    if (!isHtmx(ctx)) return res;
    const task = await strapi.documents('api::task.task').findOne({ documentId: res.data.documentId, populate: { time_entries: true } });
    ctx.type = 'html';
    ctx.body = renderTaskCard(task);
  },

  async update(ctx) {
    ctx.request.body = { data: toData(ctx.request.body) };
    const res = await super.update(ctx);
    if (!isHtmx(ctx)) return res;
    const task = await strapi.documents('api::task.task').findOne({ documentId: res.data.documentId, populate: { time_entries: true } });
    ctx.type = 'html';
    ctx.body = renderTaskCard(task);
  },

  async delete(ctx) {
    const res = await super.delete(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = '';
  },

  async fromUrl(ctx) {
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
      } else {
        const created = await strapi.documents('api::project.project').create({
          data: { name: finalProjectName, state: 'active' },
          status: 'published',
        });
        projectDocId = created.documentId;
      }
    }

    // 3) Create the task
    const taskData: any = { title: finalTitle, priority, state };
    if (projectDocId) taskData.project = projectDocId;

    const task = await strapi.documents('api::task.task').create({
      data: taskData,
      status: 'published',
      populate: { time_entries: true },
    });

    if (!isHtmx(ctx)) {
      return { data: task, projectCreated: !projectDocId ? false : true };
    }

    ctx.type = 'html';

    let html = renderTaskCard(task);

    // Refresh the projects list via oob swap
    const projects = await strapi.documents('api::project.project').findMany({ populate: { tasks: true } });
    html += `<div id="projects" hx-swap-oob="innerHTML:#projects">${renderProjectCards(projects)}</div>`;

    ctx.body = html;
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
