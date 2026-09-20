/**
 * Overrides the users-permissions plugin's own `GET /api/users/me` action.
 *
 * The plugin's built-in `me` controller runs the response through Strapi's
 * content-API permission sanitizer (sanitizeQuery/sanitizeOutput), which
 * only keeps a populated relation (here: `?populate=role`) if the caller's
 * role has its OWN separate permission on the related content type
 * (plugin::users-permissions.role) — not just on `user.me` itself. Since
 * our custom roles (Owner/Team Lead/Employee, granted in src/index.ts)
 * only ever get the `user.me` permission, that sanitizer silently drops
 * `role` from the response with no error, which is what made the "Team"
 * button (gated on authUser.role.type) never appear, and the role badge
 * never show, in the frontend.
 *
 * Fixing this "properly" would mean granting a role permission on
 * plugin::users-permissions.role, which opens up more than we want
 * (Strapi's role content type is meant for the admin panel, not the
 * content API). Overriding `me` to answer directly is simpler and safer:
 * it always returns exactly the shape the frontend needs, with the
 * sensitive fields (password, tokens) stripped explicitly.
 */
export default (plugin: any) => {
  plugin.controllers.user.me = async (ctx: any) => {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized();

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: authUser.id },
      populate: { role: true },
    });
    if (!user) return ctx.notFound();

    const { password, resetPasswordToken, confirmationToken, ...safeUser } = user as any;
    ctx.body = {
      ...safeUser,
      role: user.role ? { id: user.role.id, name: user.role.name, type: user.role.type } : null,
    };
  };

  return plugin;
};
