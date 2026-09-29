/**
 * Overrides the users-permissions plugin's own `GET /api/users/me` action.
 *
 * Also injects a `permissions` array so the frontend can gate UI elements
 * without duplicating the role→permission map client-side. The map lives
 * here as the single source of truth; the frontend calls `can('x.y')` and
 * checks against the set returned from this endpoint.
 */

const UI_PERMS: Record<string, string[]> = {
  owner: [
    'project.create', 'project.update', 'project.delete',
    'task.create', 'task.update', 'task.delete',
    'time-entry.create', 'time-entry.update', 'time-entry.delete',
    'team.view', 'team.createTeamLead', 'team.deleteTeamLead',
    'team.createEmployee', 'team.deleteEmployee',
    'team.resetTeamLeadPassword', 'team.resetEmployeePassword',
  ],
  team_lead: [
    'project.create', 'project.update', 'project.delete',
    'task.create', 'task.update', 'task.delete',
    'time-entry.create', 'time-entry.update', 'time-entry.delete',
    'team.view', 'team.createEmployee', 'team.deleteEmployee',
    'team.resetEmployeePassword',
  ],
  employee: [
    'task.create', 'task.update',
    'time-entry.create', 'time-entry.update', 'time-entry.delete',
  ],
};

export default (plugin: any) => {
  plugin.controllers.user.me = async (ctx: any) => {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized();

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: authUser.id },
      populate: { role: true },
    });
    if (!user) return ctx.notFound();

    const roleType: string = (user as any).role?.type ?? '';
    const { password, resetPasswordToken, confirmationToken, ...safeUser } = user as any;
    ctx.body = {
      ...safeUser,
      role: user.role ? { id: user.role.id, name: user.role.name, type: user.role.type } : null,
      permissions: UI_PERMS[roleType] ?? [],
    };
  };

  return plugin;
};
