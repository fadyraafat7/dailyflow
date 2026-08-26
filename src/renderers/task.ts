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

export function renderTaskCard(task: any): string {
  const id = esc(task.documentId);
  const date = task.plannedDate
    ? `<span class="task-card__date">${esc(task.plannedDate)}</span>`
    : "";
  const timeEntries = Array.isArray(task.time_entries) ? task.time_entries : [];
  const totalMinutes = timeEntries.reduce(
    (total: number, timeEntry: any) => total + durationInMinutes(timeEntry),
    0,
  );
  const timeSummary = `<div class="task-card__time">${timeEntries.length ? `<div class="task-card__total">Duration: <strong>${formatDuration(totalMinutes)}</strong></div>` : '<span class="task-card__no-time">No time entries</span>'}</div>`;

  return renderView("task/card", {
    id,
    title: esc(task.title),
    priority: esc(task.priority),
    state: esc(task.state),
    date,
    timeSummary,
  }).trim();
}

export function renderTaskCards(tasks: any[]): string {
  return tasks.length
    ? tasks.map(renderTaskCard).join("\n")
    : renderView("task/empty").trim();
}
