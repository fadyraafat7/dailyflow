import { esc, renderView } from "../utils/html";

export function renderProjectCard(project: any): string {
  const id = esc(project.documentId);
  const count = Array.isArray(project.tasks) ? project.tasks.length : 0;
  const descriptionText = project.description ? esc(project.description) : "";
  const description = descriptionText
    ? `<p class="project-card__desc">${descriptionText}</p>`
    : "";

  return renderView("project/card", {
    project: {
      id: project.documentId,
      name: project.name,
      state: project.state,
      description: project.description,
    },
    count,
    taskLabel: count === 1 ? "task" : "tasks",
  }).trim();
}

export function renderProjectCards(projects: any[]): string {
  return projects.length
    ? projects.map(renderProjectCard).join("\n")
    : renderView("project/empty").trim();
}
