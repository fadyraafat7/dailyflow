/**
 * Shared role-based access control helpers for DailyFlow.
 *
 * Three roles:
 *   - owner:     sees and manages everything.
 *   - team_lead: creates/owns Projects, manages tasks/time entries.
 *   - employee:  sees Projects linked to their groups or assigned to them.
 *
 * Membership is determined through Groups (not direct project team_members).
 */

export const ROLE_OWNER = 'owner';
export const ROLE_TEAM_LEAD = 'team_lead';
export const ROLE_EMPLOYEE = 'employee';

export type RoleType = typeof ROLE_OWNER | typeof ROLE_TEAM_LEAD | typeof ROLE_EMPLOYEE;

export function getRoleType(ctx: any): string | null {
  return ctx.state?.user?.role?.type ?? null;
}

export function getUserId(ctx: any): number | null {
  return ctx.state?.user?.id ?? null;
}

export function mergeFilters(ctx: any, extra: any) {
  const existing = (ctx.query as any)?.filters;
  const combined = existing ? { $and: [existing, extra] } : extra;
  ctx.query = { ...ctx.query, filters: combined };
}

export function stripEmptyFilters(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const cleaned = stripEmptyFilters(v);
      if (Object.keys(cleaned).length) out[k] = cleaned;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Is this user the Team Lead who owns the given project? */
export async function isProjectOwner(strapi: any, projectDocId: string, userId: number): Promise<boolean> {
  const project = await strapi.documents('api::project.project').findOne({
    documentId: projectDocId,
    populate: { users_permissions_user: true },
  });
  return !!project && project.users_permissions_user?.id === userId;
}

/** Is this user a member of the given project via groups? */
export async function isProjectMember(strapi: any, projectDocId: string, userId: number): Promise<boolean> {
  const projectGroupIds = await getGroupProjectIds(strapi, userId);
  const project = await strapi.documents('api::project.project').findOne({
    documentId: projectDocId,
  });
  if (!project) return false;
  return projectGroupIds.includes(project.id);
}

/**
 * Can this caller read/add-to/edit-within the given project?
 * Also checks assigned tasks.
 */
export async function canAccessProject(strapi: any, ctx: any, projectDocId: string): Promise<boolean> {
  const role = getRoleType(ctx);
  const userId = getUserId(ctx);
  if (!userId || !projectDocId) return false;
  if (role === ROLE_OWNER) return true;
  if (role === ROLE_TEAM_LEAD) {
    if (await isProjectOwner(strapi, projectDocId, userId)) return true;
    if (await isProjectMember(strapi, projectDocId, userId)) return true;
    const assignedIds = await getAssignedProjectIds(strapi, userId);
    const project = await strapi.documents('api::project.project').findOne({ documentId: projectDocId });
    return !!project && assignedIds.includes(project.id);
  }
  if (role === ROLE_EMPLOYEE) {
    if (await isProjectMember(strapi, projectDocId, userId)) return true;
    const assignedIds = await getAssignedProjectIds(strapi, userId);
    const project = await strapi.documents('api::project.project').findOne({ documentId: projectDocId });
    return !!project && assignedIds.includes(project.id);
  }
  return false;
}

export async function canManageProject(strapi: any, ctx: any, projectDocId: string): Promise<boolean> {
  const role = getRoleType(ctx);
  const userId = getUserId(ctx);
  if (!userId || !projectDocId) return false;
  if (role === ROLE_OWNER) return true;
  if (role === ROLE_TEAM_LEAD) return isProjectOwner(strapi, projectDocId, userId);
  return false;
}

/**
 * Is this Employee in the same group as the Team Lead?
 */
export async function isManagedEmployee(
  strapi: any,
  teamLeadUserId: number,
  employeeUserId: number,
): Promise<boolean> {
  const leadGroups = await strapi.db.query('api::group.group').findMany({
    where: { users_permissions_users: teamLeadUserId, publishedAt: { $ne: null } },
    populate: { users_permissions_users: { select: ['id'] } },
  });
  for (const group of leadGroups) {
    if ((group.users_permissions_users || []).some((u: any) => u.id === employeeUserId)) {
      return true;
    }
  }
  return false;
}

export async function getManagedEmployeeIds(strapi: any, teamLeadUserId: number): Promise<number[]> {
  const groups = await strapi.db.query('api::group.group').findMany({
    where: { users_permissions_users: teamLeadUserId, publishedAt: { $ne: null } },
    populate: { users_permissions_users: { select: ['id'] } },
  });
  const employeeIds: number[] = groups.flatMap((g: any) =>
    (g.users_permissions_users || []).map((u: any) => Number(u.id)),
  );
  const unique = [...new Set(employeeIds)].filter((id): id is number =>
    Number.isInteger(id) && id > 0 && id !== teamLeadUserId,
  );
  return unique;
}

export async function getOwnedProjectIds(strapi: any, teamLeadUserId: number): Promise<number[]> {
  const rows = await strapi.db.query('api::project.project').findMany({
    where: { users_permissions_user: teamLeadUserId },
    select: ['id'],
  });
  return rows.map((r: any) => r.id);
}

export async function getAssignedProjectIds(strapi: any, userId: number): Promise<number[]> {
  const tasks = await strapi.db.query('api::task.task').findMany({
    where: { assigned_to: userId, publishedAt: { $ne: null } },
    populate: { project: { select: ['id'] } },
  });
  const ids: number[] = tasks
    .map((t: any) => t.project?.id)
    .filter((id: any): id is number => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

export async function getGroupProjectIds(strapi: any, userId: number): Promise<number[]> {
  const groups = await strapi.db.query('api::group.group').findMany({
    where: { users_permissions_users: userId, publishedAt: { $ne: null } },
    populate: { projects: { select: ['id'] } },
  });
  const ids: number[] = groups.flatMap((g: any) =>
    (g.projects || []).map((p: any) => Number(p.id)),
  );
  return [...new Set(ids)].filter((id): id is number => Number.isInteger(id) && id > 0);
}

/** @deprecated Use getGroupProjectIds instead */
export async function getMemberProjectIds(strapi: any, employeeUserId: number): Promise<number[]> {
  return getGroupProjectIds(strapi, employeeUserId);
}
