import { esc, renderView } from "../utils/html";

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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}

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

export function renderTimeEntryList(taskDocId: string, taskTitle: string, entries: any[]): string {
  const totalMinutes = entries.reduce((sum: number, e: any) => sum + durationInMinutes(e), 0);

  const rows = entries.map((e: any) => {
    const dur = durationInMinutes(e);
    const running = !e.stoppedAt;
    return `<tr>
      <td>${formatDateTime(e.startedAt)}</td>
      <td>${running ? '<span class="badge state--running">running</span>' : formatDateTime(e.stoppedAt)}</td>
      <td>${running ? '—' : formatDuration(dur)}</td>
      <td>${!running ? `<button type="button" class="btn-icon btn-delete" title="Delete"
        hx-delete="/api/time-entries/${esc(e.documentId)}" hx-swap="none"
        hx-confirm="Delete this time entry?"
        @htmx:after-request="htmx.ajax('GET','/api/time-entries/by-task/${esc(taskDocId)}',{target:'#time-entry-list',swap:'innerHTML'});$dispatch('refresh-tasks')">🗑</button>` : ''}</td>
    </tr>`;
  }).join('\n');

  return `<div id="time-entry-list">
  ${entries.length ? `<table class="time-entry-table">
    <thead><tr><th>Started</th><th>Stopped</th><th>Duration</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2"><strong>Total</strong></td><td><strong>${formatDuration(totalMinutes)}</strong></td><td></td></tr></tfoot>
  </table>` : '<p class="form-hint">No time entries yet.</p>'}
</div>`;
}
