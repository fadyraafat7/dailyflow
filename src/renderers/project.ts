import { esc } from '../utils/html';

export function renderProjectCard(project: any): string {
  const id = esc(project.documentId);
  const count = Array.isArray(project.tasks) ? project.tasks.length : 0;
  const description = project.description
    ? `<p class="project-card__desc">${esc(project.description)}</p>`
    : '';

  return `
  <article class="project-card" data-id="${id}" data-name="${esc(project.name)}" data-state="${esc(project.state)}">
    <header class="project-card__head">
      <h3 class="project-card__name">${esc(project.name)}</h3>
      <span class="badge state--${esc(project.state)}">${esc(project.state)}</span>
      <span class="badge badge--count">${count} task${count === 1 ? '' : 's'}</span>
    </header>
    ${description}
  </article>`.trim();
}

export function renderProjectCards(projects: any[]): string {
  return projects.length
    ? projects.map(renderProjectCard).join('\n')
    : '<p class="empty">No projects yet.</p>';
}
