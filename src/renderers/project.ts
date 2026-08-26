import { esc, renderView } from "../utils/html";

export function renderProjectCard(project: any): string {
  const id = esc(project.documentId);
  const count = Array.isArray(project.tasks) ? project.tasks.length : 0;
  const description = project.description
    ? `<p class="project-card__desc">${esc(project.description)}</p>`
    : "";

  return renderView("project/card", {
    id,
    name: esc(project.name),
    state: esc(project.state),
    count,
    taskLabel: count === 1 ? "task" : "tasks",
    description,
  }).trim();
}

export function renderProjectCards(projects: any[]): string {
  return projects.length
    ? projects.map(renderProjectCard).join("\n")
    : renderView("project/empty").trim();
}
