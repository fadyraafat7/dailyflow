/**
 * homepage controller
 *
 * Returns a combined view: all accessible tasks (grouped by project) in the
 * main area, plus a sidebar showing today's "اعمل اليوم" (Do Today) summary
 * for each visible team member — their time entries with duration & comment.
 *
 * Owner  → sees all users' daily summaries in the sidebar.
 * Team Lead → sees only their own managed employees' summaries + their own.
 * Employee → sees only their own daily summary.
 */

import {
  getRoleType,
  getUserId,
  getOwnedProjectIds,
  getGroupProjectIds,
  getMemberProjectIds,
  getManagedEmployeeIds,
  ROLE_OWNER,
  ROLE_TEAM_LEAD,
  ROLE_EMPLOYEE,
} from '../../../utils/access';
import { renderHomepage, renderSidebar } from '../../../renderers/homepage';

export default ({ strapi }: { strapi: any }) => ({
  async find(ctx: any) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (!userId) return ctx.unauthorized();

    // ── 1. Fetch accessible tasks with their project & time_entries ──────
    let taskWhere: any = { publishedAt: { $ne: null } };

    if (role === ROLE_TEAM_LEAD) {
      const [ownedIds, groupIds] = await Promise.all([
        getOwnedProjectIds(strapi, userId),
        getGroupProjectIds(strapi, userId),
      ]);
      const projectIds = [...new Set([...ownedIds, ...groupIds])];
      const assignedRows = await strapi.db.query('api::task.task').findMany({
        where: { assigned_to: userId, publishedAt: { $ne: null } },
        select: ['id'],
      });
      const assignedIds = assignedRows.map((r: any) => r.id);
      taskWhere = assignedIds.length
        ? { publishedAt: { $ne: null }, $or: [{ project: { id: { $in: projectIds } } }, { id: { $in: assignedIds } }] }
        : { publishedAt: { $ne: null }, project: { id: { $in: projectIds } } };
    } else if (role === ROLE_EMPLOYEE) {
      const memberIds = await getMemberProjectIds(strapi, userId);
      const assignedRows = await strapi.db.query('api::task.task').findMany({
        where: { assigned_to: userId, publishedAt: { $ne: null } },
        select: ['id'],
      });
      const assignedIds = assignedRows.map((r: any) => r.id);
      taskWhere = assignedIds.length
        ? { publishedAt: { $ne: null }, $or: [{ project: { id: { $in: memberIds } } }, { id: { $in: assignedIds } }] }
        : { publishedAt: { $ne: null }, project: { id: { $in: memberIds } } };
    }

    const tasks = await strapi.db.query('api::task.task').findMany({
      where: taskWhere,
      populate: {
        project: { select: ['id', 'name', 'documentId'] },
        time_entries: true,
        assigned_to: { select: ['id', 'username'] },
        users_permissions_user: { select: ['id', 'username'] },
      },
      orderBy: { createdAt: 'desc' },
      limit: 200,
    });

    // ── 2. Determine which users to show in the sidebar ──────────────────
    let sidebarUserIds: number[] = [userId];

    if (role === ROLE_OWNER) {
      const allUsers = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { blocked: { $ne: true } },
        select: ['id', 'username'],
        populate: { role: { select: ['type'] } },
        orderBy: { username: 'asc' },
      });
      sidebarUserIds = allUsers.map((u: any) => u.id);
    } else if (role === ROLE_TEAM_LEAD) {
      const empIds = await getManagedEmployeeIds(strapi, userId);
      sidebarUserIds = [userId, ...empIds];
    }

    // ── 3. Fetch today's time entries for sidebar users ──────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayEntries = await strapi.db.query('api::time-entry.time-entry').findMany({
      where: {
        publishedAt: { $ne: null },
        startedAt: { $gte: todayStart.toISOString(), $lte: todayEnd.toISOString() },
      },
      populate: {
        task: {
          populate: { project: { select: ['id', 'name'] } },
        },
        users_permissions_user: { select: ['id', 'username'] },
      },
      orderBy: { startedAt: 'asc' },
      limit: 500,
    });

    // ── 4. Fetch user info for sidebar ───────────────────────────────────
    const sidebarUsers = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: { id: { $in: sidebarUserIds }, blocked: { $ne: true } },
      select: ['id', 'username'],
      populate: { role: { select: ['type', 'name'] } },
      orderBy: { username: 'asc' },
    });

    // ── 5. Match entries to users (time entries store creator via task.assigned_to
    //       or we fall back to matching by task's assigned_to or added_by) ─
    // Since time_entry doesn't have a direct user relation in this schema,
    // we match through: entry → task → assigned_to OR users_permissions_user
    const taskMap = new Map<number, any>();
    for (const t of tasks) taskMap.set(t.id, t);

    // Build per-user entry list from the task data we already have
    const userEntriesMap = new Map<number, { task: any; entries: any[] }[]>();
    for (const uid of sidebarUserIds) userEntriesMap.set(uid, []);

    for (const task of tasks) {
      const timeEntries: any[] = task.time_entries ?? [];
      const todayTaskEntries = timeEntries.filter((e: any) => {
        if (!e.startedAt) return false;
        const d = new Date(e.startedAt);
        return d >= todayStart && d <= todayEnd;
      });
      if (!todayTaskEntries.length) continue;

      // Attribute to: assigned_to first, then creator
      const attributedUserId = task.assigned_to?.id ?? task.users_permissions_user?.id;
      if (attributedUserId && userEntriesMap.has(attributedUserId)) {
        userEntriesMap.get(attributedUserId)!.push({ task, entries: todayTaskEntries });
      }
    }

    ctx.type = 'html';
    ctx.body = renderHomepage({ tasks, sidebarUsers, userEntriesMap, role: role || '' });
  },

  async sidebar(ctx: any) {
    const role = getRoleType(ctx);
    const userId = getUserId(ctx);
    if (!userId) return ctx.unauthorized();

    let sidebarUserIds: number[] = [userId];
    if (role === ROLE_OWNER) {
      const allUsers = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { blocked: { $ne: true } },
        select: ['id'],
      });
      sidebarUserIds = allUsers.map((u: any) => u.id);
    } else if (role === ROLE_TEAM_LEAD) {
      const empIds = await getManagedEmployeeIds(strapi, userId);
      sidebarUserIds = [userId, ...empIds];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const sidebarUsers = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: { id: { $in: sidebarUserIds }, blocked: { $ne: true } },
      select: ['id', 'username'],
      populate: { role: { select: ['type', 'name'] } },
      orderBy: { username: 'asc' },
    });

    // Fetch tasks + their time_entries for today
    let taskWhere: any = { publishedAt: { $ne: null } };
    if (role === ROLE_TEAM_LEAD) {
      const [ownedIds, groupIds] = await Promise.all([
        getOwnedProjectIds(strapi, userId),
        getGroupProjectIds(strapi, userId),
      ]);
      const projectIds = [...new Set([...ownedIds, ...groupIds])];
      taskWhere = { publishedAt: { $ne: null }, project: { id: { $in: projectIds } } };
    } else if (role === ROLE_EMPLOYEE) {
      const memberIds = await getMemberProjectIds(strapi, userId);
      taskWhere = { publishedAt: { $ne: null }, project: { id: { $in: memberIds } } };
    }

    const tasks = await strapi.db.query('api::task.task').findMany({
      where: taskWhere,
      populate: {
        project: { select: ['id', 'name'] },
        time_entries: true,
        assigned_to: { select: ['id', 'username'] },
        users_permissions_user: { select: ['id', 'username'] },
      },
      limit: 200,
    });

    const userEntriesMap = new Map<number, { task: any; entries: any[] }[]>();
    for (const uid of sidebarUserIds) userEntriesMap.set(uid, []);

    for (const task of tasks) {
      const todayEntries = (task.time_entries ?? []).filter((e: any) => {
        if (!e.startedAt) return false;
        const d = new Date(e.startedAt);
        return d >= todayStart && d <= todayEnd;
      });
      if (!todayEntries.length) continue;
      const attributedUserId = task.assigned_to?.id ?? task.users_permissions_user?.id;
      if (attributedUserId && userEntriesMap.has(attributedUserId)) {
        userEntriesMap.get(attributedUserId)!.push({ task, entries: todayEntries });
      }
    }

    ctx.type = 'html';
    ctx.body = renderSidebar(sidebarUsers, userEntriesMap);
  },
});
