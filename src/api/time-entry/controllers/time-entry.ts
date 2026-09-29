/**
 * time-entry controller
 *
 * Time entries have no owner/team field of their own — visibility and
 * write-access are scoped transitively via the parent task's project
 * (see ../../../utils/access.ts), rather than filtered directly.
 */

import { factories } from '@strapi/strapi';
import { isHtmx } from '../../../utils/html';
import { renderTimeEntryCard, renderTimeEntryCards, renderTimeEntryList } from '../../../renderers/time-entry';
import {
	getRoleType,
	getUserId,
	mergeFilters,
	canAccessProject,
	getOwnedProjectIds,
	getMemberProjectIds,
	getAssignedProjectIds,
	ROLE_TEAM_LEAD,
	ROLE_EMPLOYEE,
} from '../../../utils/access';

function toData(body: any) {
	const data = body?.data ?? body ?? {};
	for (const key of Object.keys(data)) if (data[key] === '') delete data[key];

	const hasStart = data.startedAt && Number.isFinite(new Date(data.startedAt).getTime());
	const hasStop = data.stoppedAt && Number.isFinite(new Date(data.stoppedAt).getTime());
	const hasDur = data.duration !== undefined && Number.isFinite(Number(data.duration)) && Number(data.duration) > 0;

	if (hasStart && hasStop && !hasDur) {
		const diff = Math.round((new Date(data.stoppedAt).getTime() - new Date(data.startedAt).getTime()) / 60000);
		if (diff >= 0) data.duration = diff;
	} else if (hasStart && hasDur && !hasStop) {
		data.stoppedAt = new Date(new Date(data.startedAt).getTime() + Number(data.duration) * 60000).toISOString();
	} else if (hasStop && hasDur && !hasStart) {
		data.startedAt = new Date(new Date(data.stoppedAt).getTime() - Number(data.duration) * 60000).toISOString();
	} else if (hasStart && hasStop && hasDur) {
		data.duration = Math.round((new Date(data.stoppedAt).getTime() - new Date(data.startedAt).getTime()) / 60000);
	}

	if (data.duration !== undefined) data.duration = Number(data.duration);
	return data;
}

/** Fetch a time entry along with its task's project, for access checks. */
async function fetchWithProject(strapi: any, documentId: string) {
	return strapi.documents('api::time-entry.time-entry').findOne({
		documentId,
		populate: { task: { populate: { project: true } } },
	});
}

function projectDocIdOf(entry: any): string | null {
	return entry?.task?.project?.documentId ?? null;
}

export default factories.createCoreController('api::time-entry.time-entry', ({ strapi }) => ({
	async find(ctx) {
		// Same restricted-relation issue documented in project/task
		// controllers (see src/utils/access.ts) — `task: { project: {
		// users_permissions_user: userId } } }` recurses into a relation
		// targeting plugin::users-permissions.user, which no role has
		// `find` permission on, and throws. Resolve the allowed project
		// ids first and filter on `task.project.id` (a plain scalar)
		// instead.
		const role = getRoleType(ctx);
		const userId = getUserId(ctx);
		if ((role === ROLE_TEAM_LEAD || role === ROLE_EMPLOYEE) && userId) {
			const ownedIds = await getOwnedProjectIds(strapi, userId);
			const groupIds = await getMemberProjectIds(strapi, userId);
			const assignedIds = await getAssignedProjectIds(strapi, userId);
			const allIds = [...new Set([...ownedIds, ...groupIds, ...assignedIds])];
			mergeFilters(ctx, { task: { project: { id: { $in: allIds } } } });
		}

		const res = await super.find(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCards(res.data ?? []);
	},

	async findOne(ctx) {
		// findOne() targets one time entry by id — checked directly against
		// its task's project instead of adding a query filter, avoiding the
		// restricted-relation problem described in find() above.
		const { id } = ctx.params;
		const role = getRoleType(ctx);
		const userId = getUserId(ctx);
		if (role === ROLE_TEAM_LEAD || role === ROLE_EMPLOYEE) {
			if (!userId) return ctx.notFound();
			const existing = await fetchWithProject(strapi, id);
			const projectDocId = projectDocIdOf(existing);
			if (!projectDocId || !(await canAccessProject(strapi, ctx, projectDocId))) {
				return ctx.notFound();
			}
		}

		const res = await super.findOne(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCard(res.data);
	},

	async create(ctx) {
		const data = toData(ctx.request.body);
		ctx.request.body = { data };

		if (data.startedAt && data.stoppedAt && new Date(data.stoppedAt) < new Date(data.startedAt)) {
			return ctx.badRequest('Stopped at must be after Started at.');
		}

		const taskDocId = typeof data.task === 'string' ? data.task : null;
		if (!taskDocId) return ctx.badRequest('A task is required.');

		const task = await strapi.documents('api::task.task').findOne({
			documentId: taskDocId,
			populate: { project: true, users_permissions_user: true, assigned_to: true },
		});
		const projectDocId = (task as any)?.project?.documentId ?? null;
		const userId = getUserId(ctx);
		const isCreator = (task as any)?.users_permissions_user?.id === userId;
		const isAssigned = (task as any)?.assigned_to?.id === userId;
		if (!isCreator && !isAssigned && !projectDocId) return ctx.forbidden('You do not have access to this task.');
		if (!isCreator && !isAssigned && !(await canAccessProject(strapi, ctx, projectDocId))) {
			return ctx.forbidden('You do not have access to this task.');
		}

		const res = await super.create(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCard(res.data);
	},

	async update(ctx) {
		const { id } = ctx.params;
		const existing = await fetchWithProject(strapi, id);
		if (!existing) return ctx.notFound('Time entry not found');
		const projectDocId = projectDocIdOf(existing);
		if (!(await canAccessProject(strapi, ctx, projectDocId || ''))) {
			return ctx.forbidden('You do not have access to this time entry.');
		}

		const updateData = toData(ctx.request.body);
		if (updateData.startedAt && updateData.stoppedAt && new Date(updateData.stoppedAt) < new Date(updateData.startedAt)) {
			return ctx.badRequest('Stopped at must be after Started at.');
		}
		ctx.request.body = { data: updateData };
		const res = await super.update(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = renderTimeEntryCard(res.data);
	},

	async delete(ctx) {
		const { id } = ctx.params;
		const existing = await fetchWithProject(strapi, id);
		if (!existing) return ctx.notFound('Time entry not found');
		const projectDocId = projectDocIdOf(existing);
		if (!(await canAccessProject(strapi, ctx, projectDocId || ''))) {
			return ctx.forbidden('You do not have access to this time entry.');
		}

		const res = await super.delete(ctx);
		if (!isHtmx(ctx)) return res;
		ctx.type = 'html';
		ctx.body = '';
	},

	async byTask(ctx) {
		const { taskDocId } = ctx.params;
		const userId = getUserId(ctx);
		const task = await strapi.documents('api::task.task').findOne({
			documentId: taskDocId,
			populate: { project: true, users_permissions_user: true, assigned_to: true },
		});
		if (!task) return ctx.notFound();
		const projectDocId = (task as any)?.project?.documentId ?? null;
		const isCreator = (task as any)?.users_permissions_user?.id === userId;
		const isAssigned = (task as any)?.assigned_to?.id === userId;
		if (!isCreator && !isAssigned && !projectDocId) return ctx.forbidden();
		if (!isCreator && !isAssigned && !(await canAccessProject(strapi, ctx, projectDocId))) {
			return ctx.forbidden();
		}

		const entries = await strapi.db.query('api::time-entry.time-entry').findMany({
			where: { task: { documentId: taskDocId }, publishedAt: { $ne: null } },
			orderBy: { startedAt: 'desc' },
		});

		ctx.type = 'html';
		ctx.body = renderTimeEntryList(taskDocId, task.title || '', entries);
	},

	/** Stop a running timer: sets stoppedAt to now and computes the duration. */
	async stop(ctx) {
		const { id } = ctx.params;
		const existing = await fetchWithProject(strapi, id);
		if (!existing) return ctx.notFound('Time entry not found');
		const projectDocId = projectDocIdOf(existing);
		if (!(await canAccessProject(strapi, ctx, projectDocId || ''))) {
			return ctx.forbidden('You do not have access to this time entry.');
		}

		const stoppedAt = new Date().toISOString();
		let duration: number | undefined = existing.duration ?? undefined;
		if (existing.startedAt) {
			const startedMs = new Date(existing.startedAt).getTime();
			const stoppedMs = new Date(stoppedAt).getTime();
			if (Number.isFinite(startedMs) && Number.isFinite(stoppedMs) && stoppedMs >= startedMs) {
				duration = Math.round((stoppedMs - startedMs) / 60000);
			}
		}

		const body = ctx.request.body?.data ?? ctx.request.body ?? {};
		const comment = typeof body.comment === 'string' ? body.comment.trim() : undefined;

		const updated = await strapi.documents('api::time-entry.time-entry').update({
			documentId: id,
			data: { stoppedAt, duration, ...(comment ? { comment } : {}) },
			status: 'published',
		});

		if (!isHtmx(ctx)) return { data: updated };
		ctx.type = 'html';
		ctx.body = '';
	},
}));
