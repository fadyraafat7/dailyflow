/**
 * task controller
 *
 * HTMX-style requests get clean HTML (content + data-* only, no behaviour).
 * Everything else gets JSON. All interaction lives in the frontend.
 */

import { factories } from '@strapi/strapi';
import { isHtmx } from '../../../utils/html';
import { renderTaskCard, renderTaskCards } from '../../../renderers/task';

/** Accept flat form fields or JSON; drop empty strings. */
function toData(body: any) {
  const data = body?.data ?? body ?? {};
  for (const k of Object.keys(data)) if (data[k] === '') delete data[k];
  return data;
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
}));
