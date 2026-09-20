import { esc, renderView } from "../utils/html";

function durationInMinutes(timeEntry: any): number {
  const hasSavedDuration =
    timeEntry.duration !== null &&
    timeEntry.duration !== undefined &&
    timeEntry.duration !== "";
  const savedDuration = Number(timeEntry.duration);
  if (hasSavedDuration && Number.isFinite(savedDuration) && savedDuration > 0)
    return savedDuration;
  if (!timeEntry.startedAt || !timeEntry.stoppedAt) return 0;

  const startedAt = new Date(timeEntry.startedAt).getTime();
  const stoppedAt = new Date(timeEntry.stoppedAt).getTime();
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(stoppedAt) ||
    stoppedAt < startedAt
  )
    return 0;

  return Math.round((stoppedAt - startedAt) / 60000);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes}m`;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function renderTaskCard(task: any, role = ""): string {
  const id = esc(task.documentId);
  const plannedDateRaw = task.plannedDate ? esc(task.plannedDate) : "";
  const date = task.plannedDate
    ? `<span class="task-card__date">${esc(task.plannedDate)}</span>`
    : "";
  const timeEntries = Array.isArray(task.time_entries) ? task.time_entries : [];
  const runningEntry = timeEntries.find((timeEntry: any) => timeEntry && !timeEntry.stoppedAt);
  const completedCount = timeEntries.filter((timeEntry: any) => timeEntry && timeEntry.stoppedAt).length;
  const totalMinutes = timeEntries.reduce(
    (total: number, timeEntry: any) => total + durationInMinutes(timeEntry),
    0,
  );
  const runningBadge = runningEntry ? `<span class="badge state--running">running</span> ` : "";
  const creatorUsername = task.users_permissions_user?.username;
  const addedBy = creatorUsername
    ? `<span class="task-card__added-by">Added by ${esc(creatorUsername)}</span>`
    : "";
  const timeSummary = `<div class="task-card__time">${
    runningEntry && !completedCount
      ? `<div class="task-card__total">${runningBadge}</div>`
      : timeEntries.length
        ? `<div class="task-card__total">${runningBadge}Duration: <strong>${formatDuration(totalMinutes)}</strong></div>`
        : '<span class="task-card__no-time">No time entries</span>'
  }</div>`;

  const timerControls = runningEntry
    ? `<button type="button" class="btn-icon" title="Stop timer"
        hx-put="/api/time-entries/${esc(runningEntry.documentId)}/stop"
        hx-swap="none"
        @htmx:after-request="$dispatch('refresh-tasks')">⏹</button>`
    : `<button type="button" class="btn-icon" title="Start timer"
        hx-post="/api/time-entries"
        hx-vals='js:{"data": {"task": "${id}", "startedAt": new Date().toISOString()}}'
        hx-swap="none"
        @htmx:after-request="$dispatch('refresh-tasks')">▶</button>`;

  return renderView("task/card", {
    id,
    title: esc(task.title),
    priority: esc(task.priority),
    state: esc(task.state),
    date,
    plannedDateRaw,
    timeSummary,
    timerControls,
    addedBy,
    canDelete: role === "owner" || role === "team_lead" ? "" : "hidden",
  }).trim();
}

export function renderTaskCards(tasks: any[], role = "", sort = ""): string {
  if (!tasks.length) return renderView("task/empty").trim();

  if (sort !== "plannedDate:asc") {
    return tasks.map((task) => renderTaskCard(task, role)).join("\n");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const weekAhead = todayMs + 7 * 86400000;

  const bucketFor = (raw: string | null): string => {
    if (!raw) return "No date";
    const d = new Date(raw);
    d.setHours(0, 0, 0, 0);
    const ms = d.getTime();
    if (Number.isNaN(ms)) return "No date";
    if (ms < todayMs) return "Overdue";
    if (ms === todayMs) return "Today";
    if (ms <= weekAhead) return "This week";
    return "Later";
  };

  let lastBucket = "";
  let html = "";
  for (const task of tasks) {
    const bucket = bucketFor(task.plannedDate ?? null);
    if (bucket !== lastBucket) {
      html += `<div class="task-group-heading">${esc(bucket)}</div>\n`;
      lastBucket = bucket;
    }
    html += renderTaskCard(task, role) + "\n";
  }
  return html;
}
