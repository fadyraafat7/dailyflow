import { esc } from '../utils/html';

export function renderTimeEntryCard(timeEntry: any): string {
  const id = esc(timeEntry.documentId);
  const startedAt = esc(timeEntry.startedAt);
  const stoppedAt = timeEntry.stoppedAt ? esc(timeEntry.stoppedAt) : '';
  const duration = timeEntry.duration ?? '';
  const status = timeEntry.stoppedAt ? 'completed' : 'running';

  return `
<article class="time-entry-card" data-id="${id}" data-started-at="${startedAt}" data-stopped-at="${stoppedAt}" data-duration="${esc(duration)}">
  <div class="time-entry-card__meta">
    <span class="badge state--${status}">${status}</span>
    <time datetime="${startedAt}">${startedAt}</time>
    ${stoppedAt ? `<time datetime="${stoppedAt}">${stoppedAt}</time>` : ''}
    ${duration !== '' ? `<span class="time-entry-card__duration">${esc(duration)} min</span>` : ''}
  </div>
  <div class="time-entry-card__actions">
    <button type="button" class="btn-icon" data-action="edit-time-entry" title="Edit">✎</button>
    <button type="button" class="btn-icon btn-delete" data-action="delete-time-entry" title="Delete">🗑</button>
  </div>
</article>`.trim();
}

export function renderTimeEntryCards(timeEntries: any[]): string {
  return timeEntries.length
    ? timeEntries.map(renderTimeEntryCard).join('\n')
    : '<p class="empty">No time entries yet.</p>';
}
