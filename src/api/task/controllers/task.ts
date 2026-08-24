/**
 * task controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::task.task', ({ strapi }) => ({
  async create(ctx) {
    if (!ctx.state.user) {
      return ctx.unauthorized('You must be logged in to create a task');
    }

    ctx.request.body.data = {
      ...ctx.request.body.data,
      createdBy: ctx.state.user.id,
    };

    const response = await super.create(ctx);
    return response;
  },
}));