/**
 * Shared role-based access control helpers for DailyFlow.
 *
 * Three roles, set on plugin::users-permissions.role via bootstrap (see
 * src/index.ts):
 *   - owner:     sees and manages everything.
 *   - team_lead: creates/owns Projects (project.users_permissions_user)
 *                and manages the tasks/time entries inside them.
 *   - employee:  only sees Projects they've been added to as a team
 *                member (project.team_members), and can add/edit (not
 *                delete) tasks inside those projects.
 *
 * Row-level scoping (which of *their* projects a Team Lead/Employee can
 * see or touch) is not something the Strapi permission system does on
 * its own — it only gates whole actions per role. These helpers add that
 * scoping on top, either via ctx.query.filters (for find/findOne) or via
 * an explicit ownership/membership check (for create/update/delete).
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

/**
 * Merge an extra filters object into ctx.query.filters (AND'd with
 * whatever filters the request already carries) so the core controller's
 * find/findOne only ever sees rows the caller is scoped to.
 */
export function mergeFilters(ctx: any, extra: any) {
  const existing = (ctx.query as any)?.filters;
  const combined = existing ? { $and: [existing, extra] } : extra;
  ctx.query = { ...ctx.query, filters: combined };
}

/** Is this user the Team Lead who owns the given project? */
export async function isProjectOwner(strapi: any, projectDocId: string, userId: number): Promise<boolean> {
  const project = await strapi.documents('api::project.project').findOne({
    documentId: projectDocId,
    populate: { users_permissions_user: true },
  });
  return !!project && project.users_permissions_user?.id === userId;
}

/** Is this user an Employee assigned to the given project's team? */
export async function isProjectMember(strapi: any, projectDocId: string, userId: number): Promise<boolean> {
  const project = await strapi.documents('api::project.project').findOne({
    documentId: projectDocId,
    populate: { team_members: true },
  });
  return !!project && (project.team_members || []).some((u: any) => u.id === userId);
}

/**
 * Can this caller read/add-to/edit-within the given project? Owner:
 * always. Team Lead: only their own project. Employee: only projects
 * they're a team member of. Used for task/time-entry create+update and
 * for read-scoping.
 */
export async function canAccessProject(strapi: any, ctx: any, projectDocId: string): Promise<boolean> {
  const role = getRoleType(ctx);
  const userId = getUserId(ctx);
  if (!userId || !projectDocId) return false;
  if (role === ROLE_OWNER) return true;
  if (role === ROLE_TEAM_LEAD) return isProjectOwner(strapi, projectDocId, userId);
  if (role === ROLE_EMPLOYEE) return isProjectMember(strapi, projectDocId, userId);
  return false;
}

/**
 * Can this caller manage (create/update/delete) the project itself, or
 * delete a task within it? Owner: always. Team Lead: only their own
 * project. Employee: never — Employees only add/edit tasks, they don't
 * manage projects or delete tasks.
 */
export async function canManageProject(strapi: any, ctx: any, projectDocId: string): Promise<boolean> {
  const role = getRoleType(ctx);
  const userId = getUserId(ctx);
  if (!userId || !projectDocId) return false;
  if (role === ROLE_OWNER) return true;
  if (role === ROLE_TEAM_LEAD) return isProjectOwner(strapi, projectDocId, userId);
  return false;
}
