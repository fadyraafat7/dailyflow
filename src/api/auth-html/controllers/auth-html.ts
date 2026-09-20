import { esc } from '../../../utils/html';

const PERMS: Record<string, string[]> = {
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

function userPayload(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role ? { id: user.role.id, name: user.role.name, type: user.role.type } : null,
  };
}

function triggerJson(eventName: string, detail: any) {
  return JSON.stringify({ [eventName]: detail });
}

export default ({ strapi }: { strapi: any }) => ({
  async login(ctx: any) {
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');

    if (!identifier || !password) {
      ctx.status = 422;
      ctx.type = 'html';
      ctx.body = `<div class="login-card__error">${esc('Email/username and password are required.')}</div>`;
      return;
    }

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { $or: [{ email: identifier }, { username: identifier }] },
      populate: { role: true },
    });

    if (!user || user.blocked) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = `<div class="login-card__error">${esc('Invalid identifier or password.')}</div>`;
      return;
    }

    const valid = await strapi.plugin('users-permissions').service('user').validatePassword(password, user.password);
    if (!valid) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = `<div class="login-card__error">${esc('Invalid identifier or password.')}</div>`;
      return;
    }

    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });
    const roleType = user.role?.type || '';
    const perms = PERMS[roleType] || [];

    ctx.type = 'html';
    ctx.set('HX-Trigger', triggerJson('auth-login', {
      jwt,
      user: userPayload(user),
      perms,
    }));
    ctx.body = '';
  },

  async session(ctx: any) {
    const user = ctx.state?.user;
    if (!user) {
      ctx.status = 401;
      ctx.type = 'html';
      ctx.body = '';
      return;
    }

    const full = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      populate: { role: true },
    });
    if (!full) {
      ctx.status = 401;
      ctx.type = 'html';
      ctx.body = '';
      return;
    }

    const roleType = full.role?.type || '';
    const perms = PERMS[roleType] || [];

    ctx.type = 'html';
    ctx.set('HX-Trigger', triggerJson('auth-session', {
      user: userPayload(full),
      perms,
    }));
    ctx.body = '';
  },

  async changePassword(ctx: any) {
    const sessionUser = ctx.state?.user;
    if (!sessionUser) {
      ctx.status = 401;
      ctx.type = 'html';
      ctx.body = `<div class="login-card__error">Session expired — please log in again.</div>`;
      return;
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.password || '');

    if (newPassword.length < 6) {
      ctx.status = 422;
      ctx.type = 'html';
      ctx.body = `<div class="login-card__error">New password must be at least 6 characters.</div>`;
      return;
    }

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: sessionUser.id },
      select: ['id', 'password'],
    });

    const valid = await strapi.plugin('users-permissions').service('user').validatePassword(currentPassword, user.password);
    if (!valid) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = `<div class="login-card__error">Current password is incorrect.</div>`;
      return;
    }

    await strapi.plugin('users-permissions').service('user').edit(user.id, { password: newPassword });

    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

    ctx.type = 'html';
    ctx.set('HX-Trigger', triggerJson('auth-password-changed', { jwt }));
    ctx.body = `<div class="password-reveal">Password changed successfully.</div>`;
  },
});
