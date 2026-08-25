/**
 * project controller
 
 */

import { factories } from '@strapi/strapi';
import { isHtmx } from '../../../utils/html';
import { renderProjectCards } from '../../../renderers/project';

export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  async find(ctx) {
    ctx.query = { ...ctx.query, populate: { tasks: true } };
    const res = await super.find(ctx);
    if (!isHtmx(ctx)) return res;
    ctx.type = 'html';
    ctx.body = renderProjectCards(res.data ?? []);
  },
}));
