import { esc, renderView } from "../utils/html";

export function renderTimeEntryCard(timeEntry: any): string {
  const id = esc(timeEntry.documentId);
  const startedAt = esc(timeEntry.startedAt);
  const stoppedAt = timeEntry.stoppedAt ? esc(timeEntry.stoppedAt) : "";
  const duration = timeEntry.duration ?? "";
  const status = timeEntry.stoppedAt ? "completed" : "running";

  return renderView("time-entry/card", {
    id,
    startedAt,
    stoppedAt,
    duration: esc(duration),
    status,
    stoppedAtHtml: stoppedAt
      ? `<time datetime="${stoppedAt}">${stoppedAt}</time>`
      : "",
    durationHtml:
      duration !== ""
        ? `<span class="time-entry-card__duration">${esc(duration)} min</span>`
        : "",
  }).trim();
}

export function renderTimeEntryCards(timeEntries: any[]): string {
  return timeEntries.length
    ? timeEntries.map(renderTimeEntryCard).join("\n")
    : renderView("time-entry/empty").trim();
}
