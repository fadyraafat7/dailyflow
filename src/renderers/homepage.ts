import { esc, toTitleCase } from '../utils/html';
import { ICON_PIN, ICON_PLAY, ICON_STOP, ICON_CLOCK } from '../utils/icons';

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
  const recentSection = `
  <div class="hp-sidebar hp-recent-card" id="hp-recent-card">
    <div class="hp-recent-card__header">
      <div class="hp-recent-card__title-row">
        <span class="hp-recent-card__icon">${ICON_CLOCK}</span>
        <h2 class="hp-recent-card__title">Recent Tasks</h2>
      </div>
    </div>
    <div id="hp-recent-body" class="hp-recent-body"></div>
  </div>`;

  const avatarColors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  const initials = (name: string) => name ? name[0].toUpperCase() : '?';

  let html = `<div class="hp-sidebar-col" id="hp-sidebar">
  ${recentSection}
  <div class="hp-act-card">
    <div class="hp-act-card__header">
      <div class="hp-act-card__title-row">
        <div class="hp-act-card__title-text">
          <span class="hp-act-card__label">Activities</span>
          <span class="hp-act-card__date">${esc(todayLabel())}</span>
        </div>
      </div>
    </div>
    <div class="hp-act-card__list">`;

  for (let ui = 0; ui < sidebarUsers.length; ui++) {
    const user = sidebarUsers[ui];
    const taskGroups = userEntriesMap.get(user.id) ?? [];
    const roleName = user.role?.name ?? '';
    const totalMinutes = taskGroups.reduce((sum: number, tg: any) =>
      sum + tg.entries.reduce((s: number, e: any) => s + durationInMinutes(e), 0), 0);
    const avatarColor = avatarColors[ui % avatarColors.length];
    const hasActivity = taskGroups.length > 0;

    html += `
    <div class="hp-person" data-user-id="${esc(user.id)}">
      <div class="hp-person__head">
        <div class="hp-person__avatar" style="background:${avatarColor}">${esc(initials(user.username))}</div>
        <div class="hp-person__info">
          <span class="hp-person__name">${esc(user.username)}</span>
          ${roleName ? `<span class="hp-person__role">${esc(roleName)}</span>` : ''}
        </div>
        ${totalMinutes ? `<div class="hp-person__total-pill">${esc(formatDuration(totalMinutes))}</div>` : ''}
      </div>`;

    if (!hasActivity) {
      html += `<p class="hp-person__empty">No time logged today</p>`;
    } else {
      html += `<ul class="hp-person__tasks">`;
      for (const { task, entries } of taskGroups) {
        const taskTitle = toTitleCase(task.title || '');
        const projectName = task.project?.name ? toTitleCase(task.project.name) : '';
        const taskTotal = entries.reduce((s: number, e: any) => s + durationInMinutes(e), 0);
        const hasRunning = entries.some((e: any) => !e.stoppedAt);

        html += `<li class="hp-task-item">
          <div class="hp-task-item__header">
            <div class="hp-task-item__title-wrap">
              <span class="hp-task-item__title">${esc(taskTitle)}</span>
              ${projectName ? `<span class="hp-task-item__project">${esc(projectName)}</span>` : ''}
            </div>
            <span class="hp-task-item__duration ${hasRunning ? 'hp-task-item__duration--running' : ''}">${hasRunning ? '● ' : ''}${esc(formatDuration(taskTotal))}</span>
          </div>
          <ul class="hp-entries">`;

        for (const entry of entries) {
          const dur = durationInMinutes(entry);
          const comment = entry.comment ? esc(entry.comment) : '';
          const running = !entry.stoppedAt;
          const timeLabel = running
            ? `<span class="hp-entry__running-badge">running</span>`
            : `${esc(formatTime(entry.startedAt))} → ${esc(formatTime(entry.stoppedAt))}`;

          html += `<li class="hp-entry ${running ? 'hp-entry--running' : ''}">
            <span class="hp-entry__dot"></span>
            <div class="hp-entry__body">
              <span class="hp-entry__time">${timeLabel}</span>
              <span class="hp-entry__dur">${running ? '…' : esc(formatDuration(dur))}</span>
              ${comment ? `<span class="hp-entry__comment">${comment}</span>` : ''}
            </div>
          </li>`;
        }

        html += `</ul></li>`;
      }
      html += `</ul>`;
    }

    html += `</div>`;
  }

  html += `</div></div></div>`;
  return html;
}

function renderStopwatchWidget(): string {
  return `
<div class="hp-sw" id="hp-sw">
  <div class="hp-sw__glow" aria-hidden="true"></div>
  <div class="hp-sw__inner">
    <div class="hp-sw__left">
      <div class="hp-sw__badge" id="hp-sw-badge">
        <span class="hp-sw__badge-dot"></span>
        <span class="hp-sw__badge-text" id="hp-sw-label">Ready to track</span>
      </div>
      <div class="hp-sw__time-wrap">
        <span class="hp-sw__elapsed" id="hp-sw-elapsed">00:00:00</span>
      </div>
      <p class="hp-sw__hint" id="hp-sw-hint">Start the stopwatch and track your work time</p>
    </div>
    <div class="hp-sw__right">
      <button type="button" class="hp-sw__btn hp-sw__btn--start" id="hp-sw-start" onclick="window._hpSwStart()">
        <span class="hp-sw__btn-icon">${ICON_PLAY}</span>
        <span>Start</span>
      </button>
      <button type="button" class="hp-sw__btn hp-sw__btn--stop" id="hp-sw-stop" onclick="window._hpSwStop()" style="display:none">
        <span class="hp-sw__btn-icon">${ICON_STOP}</span>
        <span>Stop &amp; Save</span>
      </button>
    </div>
  </div>
</div>

<!-- Stopwatch save modal -->
<div class="modal hp-sw-modal" id="hp-sw-modal" style="display:none" onclick="if(event.target===this)window._hpSwCancelModal()">
  <div class="task-edit">
    <h3>Save Time Entry</h3>
    <div class="hp-sw-modal__elapsed-info" id="hp-sw-modal-info"></div>
    <div class="form-group">
      <label class="url-import__label">Project</label>
      <select class="form-control" id="hp-sw-project" onchange="window._hpSwLoadTasks(this.value)">
        <option value="">— Select project —</option>
      </select>
    </div>
    <div class="form-group">
      <label class="url-import__label">Task name</label>
      <input type="text" class="form-control" id="hp-sw-task-input" placeholder="Enter task name…" autocomplete="off" disabled />
    </div>
    <div class="form-group">
      <label class="url-import__label">Comment (optional)</label>
      <textarea class="form-control" id="hp-sw-comment" rows="2" style="resize:vertical;width:100%" placeholder="What did you work on?"></textarea>
    </div>
    <div class="task-edit__actions">
      <button type="button" class="btn" id="hp-sw-save" onclick="window._hpSwSave()">Save</button>
      <button type="button" class="btn-ghost" onclick="window._hpSwCancelModal()">Cancel</button>
    </div>
    <div id="hp-sw-modal-error" style="color:var(--danger,#e53);font-size:.8rem;margin-top:.4rem"></div>
  </div>
</div>`;
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
  const projDocId = esc(task.project?.documentId || '');
  const projName = esc(toTitleCase(task.project?.name || ''));
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
      data-assigned-to="${esc(String(task.assigned_to?.id || ''))}"
      data-project-doc-id="${projDocId}"
      data-project-name="${projName}">Edit</button>
    ${canDelete ? `<button type="button" class="btn-ghost btn-xs hp-btn-delete"
      onclick="window._hpDeleteTask('${docId}')">Delete</button>` : ''}`;

  const trackCall = `window._hpTrackRecentTask({id:'${docId}',title:'${esc(task.title||'')}',projectDocId:'${projDocId}',projectName:'${projName}'})`;

  return `<tr class="hp-task-row"
    data-sort-task="${esc(task.title || '')}"
    data-sort-priority="${prioritySort}"
    data-sort-state="${stateSort}"
    data-sort-time="${totalMinutes}">
    <td class="hp-task-row__title" style="cursor:pointer" onclick="${trackCall}">${title}</td>
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
          <button class="hp-proj-toggle" title="Collapse/expand" onclick="window._hpToggleProject('${esc(project?.documentId ?? '')}',this)" aria-label="Toggle project tasks">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <a class="hp-project-link" href="javascript:void(0)" onclick="window._openProject('${esc(project?.documentId ?? '')}','${esc(projectName)}',${ptasks.length})">${esc(projectName)}</a>
          <button class="btn-icon btn-pin hp-section-pin" title="Pin project" onclick="window._pinProjectSection('${esc(project?.documentId ?? '')}',this)">${ICON_PIN}</button>
        </h3>
        <div class="hp-project-group__count">${ptasks.length} task${ptasks.length !== 1 ? 's' : ''}</div>
        <div class="hp-tasks-table-wrap" data-proj-id="${esc(project?.documentId ?? '')}">
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
    ${renderStopwatchWidget()}
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
