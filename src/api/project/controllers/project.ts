/**
 * project controller
 
 */

import { factories } from '@strapi/strapi';
import { isHtmx } from '../../../utils/html';
import { renderProjectCards } from '../../../renderers/project';

function toData(body: any) {
  const data = body?.data ?? body ?? {};
  for (const key of Object.keys(data)) {
    if (data[key] === '') delete data[key];
  }
  return data;
}

async function renderProjectList(ctx: any, strapi: any) {
  const projects = await strapi.documents('api::project.project').findMany({
    populate: { tasks: true },
  });
  ctx.type = 'html';
  ctx.body = renderProjectCards(projects);
}

export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  async find(ctx) {
    ctx.query = { ...ctx.query, populate: { tasks: true } };
    const res = await super.find(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = renderProjectCards(res.data ?? []);
  },

  async create(ctx) {
    ctx.request.body = { data: toData(ctx.request.body) };
    const res = await super.create(ctx);
    if (!isHtmx(ctx)) return res;
    await renderProjectList(ctx, strapi);
  },

  async update(ctx) {
    ctx.request.body = { data: toData(ctx.request.body) };
    const res = await super.update(ctx);
    if (!isHtmx(ctx)) return res;
    await renderProjectList(ctx, strapi);
  },

  async delete(ctx) {
    const res = await super.delete(ctx);
    if (!isHtmx(ctx)) return res;
    await renderProjectList(ctx, strapi);
  },
}));
