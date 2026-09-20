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

/**
 * Is this Employee a team_member on at least one project owned by this
 * Team Lead? Used to scope a Team Lead's reach in the team-management API
 * (src/api/team) to "my own people" rather than every Employee in the
 * system — the same "own team" boundary applied everywhere else.
 */
export async function isManagedEmployee(
  strapi: any,
  teamLeadUserId: number,
  employeeUserId: number,
): Promise<boolean> {
  const count = await strapi.db.query('api::project.project').count({
    where: { users_permissions_user: teamLeadUserId, team_members: employeeUserId },
  });
  return count > 0;
}

/**
 * Numeric ids of every project owned by this Team Lead / that this
 * Employee is a team_member of.
 *
 * These exist to work around a Strapi content-API restriction: any
 * `find`/`findOne` filter (or create/update input) that references a
 * relation is rejected with "Invalid key <field>" unless the caller's
 * role has its own `find` permission on the RELATION'S TARGET content
 * type — here, plugin::users-permissions.user. None of our roles are
 * granted that (it would let Team Leads/Employees list every user
 * account in the system via GET /api/users, which we don't want), so a
 * filter like `{ users_permissions_user: userId }` or `{ team_members:
 * userId }` throws a 400 for every request, for every role — this was
 * verified live and affects project.find/findOne, task.find/findOne,
 * and time-entry.find/findOne alike.
 *
 * The fix used throughout the project/task/time-entry controllers:
 * resolve the allowed project ids here via the raw Query Engine (which
 * is NOT subject to that content-API permission check, same as
 * Document Service isn't), then filter by `{ id: { $in: [...] } }` —
 * a plain scalar field, so the restricted-relation check never fires.
 */
export async function getOwnedProjectIds(strapi: any, teamLeadUserId: number): Promise<number[]> {
  const rows = await strapi.db.query('api::project.project').findMany({
    where: { users_permissions_user: teamLeadUserId },
    select: ['id'],
  });
  return rows.map((r: any) => r.id);
}

export async function getMemberProjectIds(strapi: any, employeeUserId: number): Promise<number[]> {
  const rows = await strapi.db.query('api::project.project').findMany({
    where: { team_members: employeeUserId },
    select: ['id'],
  });
  return rows.map((r: any) => r.id);
}
