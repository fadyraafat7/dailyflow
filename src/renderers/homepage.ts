import { esc, toTitleCase } from '../utils/html';
import { ICON_PIN } from '../utils/icons';

function durationInMinutes(entry: any): number {
  const saved = Number(entry.duration);
  if (Number.isFinite(saved) && saved > 0) return saved;
  if (!entry.startedAt || !entry.stoppedAt) return 0;
  const s = new Date(entry.startedAt).getTime();
  const e = new Date(entry.stoppedAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.round((e - s) / 60000);
}

function formatDuration(minutes: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function renderSidebar(
  sidebarUsers: any[],
  userEntriesMap: Map<number, { task: any; entries: any[] }[]>,
): string {
  let html = `<div class="hp-sidebar" id="hp-sidebar">
  <div class="hp-sidebar__header">
    <h2 class="hp-sidebar__title">Do Today</h2>
    <span class="hp-sidebar__date">${esc(todayLabel())}</span>
  </div>
  <div class="hp-sidebar__list">`;

  for (const user of sidebarUsers) {
    const taskGroups = userEntriesMap.get(user.id) ?? [];
    const roleName = user.role?.name ?? '';
    const totalMinutes = taskGroups.reduce((sum: number, tg: any) =>
      sum + tg.entries.reduce((s: number, e: any) => s + durationInMinutes(e), 0), 0);

    html += `
    <div class="hp-person" data-user-id="${esc(user.id)}">
      <div class="hp-person__head">
        <span class="hp-person__name">${esc(user.username)}</span>
        ${roleName ? `<span class="hp-person__role badge">${esc(roleName)}</span>` : ''}
        ${totalMinutes ? `<span class="hp-person__total">${esc(formatDuration(totalMinutes))}</span>` : ''}
      </div>`;

    if (!taskGroups.length) {
      html += `<p class="hp-person__empty">No time logged today</p>`;
    } else {
      html += `<ul class="hp-person__tasks">`;
      for (const { task, entries } of taskGroups) {
        const taskTitle = toTitleCase(task.title || '');
        const projectName = task.project?.name ? toTitleCase(task.project.name) : '';
        const taskTotal = entries.reduce((s: number, e: any) => s + durationInMinutes(e), 0);

        html += `<li class="hp-task-item">
          <div class="hp-task-item__header">
            <span class="hp-task-item__title">${esc(taskTitle)}</span>
            ${projectName ? `<span class="hp-task-item__project">${esc(projectName)}</span>` : ''}
            <span class="hp-task-item__duration">${esc(formatDuration(taskTotal))}</span>
          </div>
          <ul class="hp-entries">`;

        for (const entry of entries) {
          const dur = durationInMinutes(entry);
          const comment = entry.comment ? esc(entry.comment) : '';
          const running = !entry.stoppedAt;
          const timeLabel = running
            ? `<span class="badge state--running">running</span>`
            : `${esc(formatTime(entry.startedAt))} → ${esc(formatTime(entry.stoppedAt))}`;

          html += `<li class="hp-entry">
            <span class="hp-entry__time">${timeLabel}</span>
            <span class="hp-entry__dur">${running ? '…' : esc(formatDuration(dur))}</span>
            ${comment ? `<span class="hp-entry__comment">${comment}</span>` : ''}
          </li>`;
        }

        html += `</ul></li>`;
      }
      html += `</ul>`;
    }

    html += `</div>`;
  }

  html += `</div></div>`;
  return html;
}

function groupTasksByProject(tasks: any[]): Map<string, { project: any; tasks: any[] }> {
  const map = new Map<string, { project: any; tasks: any[] }>();
  for (const task of tasks) {
    const key = task.project?.documentId ?? '__no_project__';
    if (!map.has(key)) {
      map.set(key, { project: task.project ?? null, tasks: [] });
    }
    map.get(key)!.tasks.push(task);
  }
  return map;
}

function renderTaskRow(task: any, role: string): string {
  const docId = esc(task.documentId);
  const state = esc(task.state || 'pending');
  const priority = esc(task.priority || 'low');
  const title = esc(toTitleCase(task.title || ''));
  const assignedTo = task.assigned_to?.username
    ? `<span class="badge state--active">${esc(task.assigned_to.username)}</span>` : '';
  const addedBy = task.users_permissions_user?.username
    ? `<span class="hp-added-by">by ${esc(task.users_permissions_user.username)}</span>` : '';
  const timeEntries: any[] = task.time_entries ?? [];
  const totalMinutes = timeEntries.reduce((s: number, e: any) => s + durationInMinutes(e), 0);
  const running = timeEntries.some((e: any) => !e.stoppedAt);
  const timeHtml = running
    ? `<span class="badge state--running">running</span>`
    : totalMinutes
      ? `<span class="hp-duration">${esc(formatDuration(totalMinutes))}</span>`
      : `<span class="hp-no-time">—</span>`;

  const prioritySort = task.priority === 'high' ? '2' : '1';
  const stateOrder: Record<string, string> = { pending: '1', active: '2', paused: '3', completed: '4' };
  const stateSort = stateOrder[task.state || 'pending'] || '1';

  const canDelete = role === 'owner' || role === 'team_lead';
  const actionBtns = `
    <button type="button" class="btn-ghost btn-xs"
      onclick="window._hpEditTask(this)"
      data-id="${docId}"
      data-title="${esc(task.title || '')}"
      data-priority="${esc(task.priority || 'low')}"
      data-state="${esc(task.state || 'pending')}"
      data-assigned-to="${esc(String(task.assigned_to?.id || ''))}">Edit</button>
    ${canDelete ? `<button type="button" class="btn-ghost btn-xs hp-btn-delete"
      onclick="window._hpDeleteTask('${docId}')">Delete</button>` : ''}`;

  return `<tr class="hp-task-row"
    data-sort-task="${esc(task.title || '')}"
    data-sort-priority="${prioritySort}"
    data-sort-state="${stateSort}"
    data-sort-time="${totalMinutes}">
    <td class="hp-task-row__title">${title}</td>
    <td><span class="badge priority--${priority}">${priority}</span></td>
    <td><span class="badge state--${state}">${state}</span></td>
    <td>${timeHtml}</td>
    <td>${assignedTo}${addedBy}</td>
    <td class="hp-task-row__actions">${actionBtns}</td>
  </tr>`;
}

export function renderHomepage(opts: {
  tasks: any[];
  sidebarUsers: any[];
  userEntriesMap: Map<number, { task: any; entries: any[] }[]>;
  role: string;
}): string {
  const { tasks, sidebarUsers, userEntriesMap, role } = opts;

  const grouped = groupTasksByProject(tasks);
  let mainHtml = '';

  if (!grouped.size) {
    mainHtml = `<div class="hp-empty">No tasks available.</div>`;
  } else {
    for (const [, { project, tasks: ptasks }] of grouped) {
      const projectName = project?.name ? toTitleCase(project.name) : 'No Project';
      mainHtml += `
      <section class="hp-project-group" data-project-id="${esc(project?.documentId ?? '')}">
        <h3 class="hp-project-group__name">
          <a class="hp-project-link" href="javascript:void(0)" onclick="window._openProject('${esc(project?.documentId ?? '')}','${esc(projectName)}',${ptasks.length})">${esc(projectName)}</a>
          <button class="btn-icon btn-pin hp-section-pin" title="Pin project" onclick="window._pinProjectSection('${esc(project?.documentId ?? '')}',this)">${ICON_PIN}</button>
        </h3>
        <div class="hp-project-group__count">${ptasks.length} task${ptasks.length !== 1 ? 's' : ''}</div>
        <div class="hp-tasks-table-wrap">
          <table class="hp-tasks-table">
            <thead>
              <tr>
                <th data-col="task" onclick="window._hpSortTable(this)" style="cursor:pointer;user-select:none">Task <span class="hp-sort-ind">⇅</span></th>
                <th data-col="priority" onclick="window._hpSortTable(this)" style="cursor:pointer;user-select:none">Priority <span class="hp-sort-ind">⇅</span></th>
                <th data-col="state" onclick="window._hpSortTable(this)" style="cursor:pointer;user-select:none">State <span class="hp-sort-ind">⇅</span></th>
                <th data-col="time" onclick="window._hpSortTable(this)" style="cursor:pointer;user-select:none">Time <span class="hp-sort-ind">⇅</span></th>
                <th>Assigned</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${ptasks.map((t) => renderTaskRow(t, role)).join('\n')}
            </tbody>
          </table>
        </div>
      </section>`;
    }
  }

  const sidebar = renderSidebar(sidebarUsers, userEntriesMap);

  return `<div class="homepage-layout" id="homepage-root">
  ${sidebar}
  <main class="hp-main">
    <div class="hp-main__header">
      <h2 class="hp-main__title">All Tasks</h2>
      <span class="hp-main__total">${tasks.length} task${tasks.length !== 1 ? 's' : ''} across ${grouped.size} project${grouped.size !== 1 ? 's' : ''}</span>
    </div>
    <div class="hp-projects" id="hp-projects">
      ${mainHtml}
    </div>
  </main>
</div>`;
}
