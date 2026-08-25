/**
 * time-entry controller
 */

import { factories } from '@strapi/strapi';
import { isHtmx } from '../../../utils/html';
import { renderTimeEntryCard, renderTimeEntryCards } from '../../../renderers/time-entry';

function toData(body: any) {
	const data = body?.data ?? body ?? {};
	for (const key of Object.keys(data)) if (data[key] === '') delete data[key];
	if (data.duration === undefined && data.startedAt && data.stoppedAt) {
		const startedAt = new Date(data.startedAt).getTime();
		const stoppedAt = new Date(data.stoppedAt).getTime();
		if (Number.isFinite(startedAt) && Number.isFinite(stoppedAt) && stoppedAt >= startedAt) {
			data.duration = Math.round((stoppedAt - startedAt) / 60000);
		}
	}
	return data;
}

export default factories.createCoreController('api::time-entry.time-entry', ({ strapi }) => ({
	async find(ctx) {
		const res = await super.find(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCards(res.data ?? []);
	},

	async findOne(ctx) {
		const res = await super.findOne(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCard(res.data);
	},

	async create(ctx) {
		ctx.request.body = { data: toData(ctx.request.body) };
		const res = await super.create(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCard(res.data);
	},

	async update(ctx) {
		ctx.request.body = { data: toData(ctx.request.body) };
		const res = await super.update(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCard(res.data);
	},

	async delete(ctx) {
		const res = await super.delete(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = '';
	},
}));
