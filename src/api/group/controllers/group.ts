import { getRoleType, getUserId, ROLE_OWNER, ROLE_TEAM_LEAD, ROLE_EMPLOYEE } from '../../../utils/access';
import { renderGroupModal, renderGroupList, renderGroupEditForm } from '../../../renderers/group';

async function getAllUsers(strapi: any, role: string, userId: number | null) {
  const where = role === ROLE_OWNER
    ? { role: { type: { $in: [ROLE_TEAM_LEAD, ROLE_EMPLOYEE] } } }
    : { role: { type: ROLE_EMPLOYEE } };
  return strapi.db.query('plugin::users-permissions.user').findMany({
    where,
    populate: { role: true },
    orderBy: { username: 'asc' },
  });
}

async function getAllProjects(strapi: any, role: string, userId: number | null) {
  if (role === ROLE_OWNER) {
    return strapi.db.query('api::project.project').findMany({
      where: { publishedAt: { $ne: null } },
      select: ['id', 'name', 'state'],
      orderBy: { name: 'asc' },
    });
  }
  const owned = await strapi.db.query('api::project.project').findMany({
    where: { users_permissions_user: userId, publishedAt: { $ne: null } },
    select: ['id', 'name', 'state'],
  });
  const groups = await strapi.db.query('api::group.group').findMany({
    where: { users_permissions_users: userId, publishedAt: { $ne: null } },
    populate: { projects: { select: ['id', 'name', 'state'] } },
  });
  const groupProjects = groups.flatMap((g: any) => g.projects || []);
  const map = new Map<number, any>();
  [...owned, ...groupProjects].forEach((p: any) => map.set(p.id, p));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadGroups(strapi: any) {
  return strapi.db.query('api::group.group').findMany({
    where: { publishedAt: { $ne: null } },
    populate: {
      users_permissions_users: { select: ['id', 'username'], populate: { role: true } },
      projects: { select: ['id', 'name', 'state'] },
    },
    orderBy: { name: 'asc' },
  });
}

function normalizeGroup(g: any) {
  return {
    ...g,
    members: g.users_permissions_users || [],
    projects: g.projects || [],
  };
}

export default ({ strapi }: { strapi: any }) => ({
  async modal(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Owners and Team Leads can manage groups.');
    }
    const userId = getUserId(ctx);
    const [groups, users, projects] = await Promise.all([
      loadGroups(strapi),
      getAllUsers(strapi, role, userId),
      getAllProjects(strapi, role, userId),
    ]);
    ctx.type = 'html';
    ctx.body = renderGroupModal(groups.map(normalizeGroup), role, users, projects);
  },

  async list(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden('Only Owners and Team Leads can view groups.');
    }
    const groups = await loadGroups(strapi);
    ctx.type = 'html';
    ctx.body = renderGroupList(groups.map(normalizeGroup), role as string);
  },

  async editForm(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const { documentId } = ctx.params;
    const group = await strapi.documents('api::group.group').findOne({
      documentId,
      populate: {
        users_permissions_users: { fields: ['id', 'username'], populate: { role: { fields: ['id', 'name'] } } },
        projects: { fields: ['id', 'name', 'state'] },
      },
    });
    if (!group) return ctx.notFound('Group not found.');
    const userId = getUserId(ctx);
    const [users, projects] = await Promise.all([
      getAllUsers(strapi, role, userId),
      getAllProjects(strapi, role, userId),
    ]);
    ctx.type = 'html';
    ctx.body = renderGroupEditForm(normalizeGroup(group), users, projects);
  },

  async create(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const name = String(body.name || '').trim();
    if (!name) return ctx.badRequest('Group name is required.');

    const rawMemberIds = Array.isArray(body.memberIds) ? body.memberIds : body.memberIds ? [body.memberIds] : [];
    const memberIds = rawMemberIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
    const rawProjectIds = Array.isArray(body.projectIds) ? body.projectIds : body.projectIds ? [body.projectIds] : [];
    const projectIds = rawProjectIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);

    try {
      await strapi.documents('api::group.group').create({
        data: {
          name,
          users_permissions_users: { connect: memberIds },
          projects: { connect: projectIds },
        },
        status: 'published',
      });
    } catch (err: any) {
      return ctx.badRequest(err?.message || 'Could not create group.');
    }

    ctx.type = 'html';
    ctx.body = `<div class="password-reveal">Group <strong>${name}</strong> created.</div>`;
  },

  async update(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const { documentId } = ctx.params;
    const existing = await strapi.documents('api::group.group').findOne({
      documentId,
      populate: { users_permissions_users: { fields: ['id'] }, projects: { fields: ['id'] } },
    });
    if (!existing) return ctx.notFound('Group not found.');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const name = String(body.name || '').trim();
    if (!name) return ctx.badRequest('Group name is required.');

    const rawMemberIds = Array.isArray(body.memberIds) ? body.memberIds : body.memberIds ? [body.memberIds] : [];
    const memberIds = rawMemberIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
    const rawProjectIds = Array.isArray(body.projectIds) ? body.projectIds : body.projectIds ? [body.projectIds] : [];
    const projectIds = rawProjectIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0);

    const oldMemberIds = (existing.users_permissions_users || []).map((u: any) => u.id);
    const oldProjectIds = (existing.projects || []).map((p: any) => p.id);

    const disconnectMembers = oldMemberIds.filter((id: number) => !memberIds.includes(id));
    const connectMembers = memberIds.filter((id: number) => !oldMemberIds.includes(id));
    const disconnectProjects = oldProjectIds.filter((id: number) => !projectIds.includes(id));
    const connectProjects = projectIds.filter((id: number) => !oldProjectIds.includes(id));

    await strapi.documents('api::group.group').update({
      documentId,
      data: {
        name,
        users_permissions_users: {
          connect: connectMembers,
          disconnect: disconnectMembers,
        },
        projects: {
          connect: connectProjects,
          disconnect: disconnectProjects,
        },
      },
      status: 'published',
    });

    ctx.type = 'html';
    ctx.body = `<div class="password-reveal">Group <strong>${name}</strong> updated.</div>`;
  },

  async remove(ctx: any) {
    const role = getRoleType(ctx);
    if (role !== ROLE_OWNER && role !== ROLE_TEAM_LEAD) {
      return ctx.forbidden();
    }
    const { documentId } = ctx.params;
    const existing = await strapi.documents('api::group.group').findOne({ documentId });
    if (!existing) return ctx.notFound('Group not found.');

    await strapi.documents('api::group.group').delete({ documentId });

    ctx.type = 'html';
    ctx.body = '';
  },
});
