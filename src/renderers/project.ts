import { esc, renderView } from "../utils/html";

export function renderProjectEditForm(
  project: any,
  employees: any[],
  currentMemberIds: number[],
): string {
  const docId = esc(project.documentId);
  const nameVal = esc(project.name || "");
  const descVal = esc(project.description || "");

  let checkboxes = "";
  if (employees.length) {
    checkboxes = employees
      .map((e: any) => {
        const checked = currentMemberIds.includes(e.id) ? " checked" : "";
        return `<label><input type="checkbox" name="team_members" value="${e.id}"${checked} /> ${esc(e.username)}</label>`;
      })
      .join("\n");
  } else {
    checkboxes =
      '<p class="form-hint">No employees yet — add one from the Team panel first.</p>';
  }

  return `<div class="modal" id="project-edit-modal" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-put="/api/projects/${docId}" hx-swap="none"
    @htmx:after-request="if($event.detail.successful){document.getElementById('project-edit-modal').remove();htmx.trigger(document.body,'refresh-projects')}">
    <h3>Edit project</h3>
    <input type="text" name="name" class="form-control" placeholder="Project name" value="${nameVal}" required />
    <textarea name="description" class="form-control" rows="4" placeholder="Project description">${descVal}</textarea>
    <select name="state" class="form-select">
      <option value="active"${project.state === "active" ? " selected" : ""}>active</option>
      <option value="archived"${project.state === "archived" ? " selected" : ""}>archived</option>
    </select>
    <label class="url-import__label">Team members</label>
    <div class="checkbox-list">
      <input type="hidden" name="_has_team_members" value="1" />
      ${checkboxes}
    </div>
    <div class="task-edit__actions">
      <button type="submit">Save</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('project-edit-modal').remove()">Cancel</button>
    </div>
  </form>
</div>`;
}

export function renderProjectCard(project: any): string {
  const id = esc(project.documentId);
  const count = Array.isArray(project.tasks) ? project.tasks.length : 0;
  const descriptionText = project.description ? esc(project.description) : "";
  const description = descriptionText
    ? `<p class="project-card__desc">${descriptionText}</p>`
    : "";

  return renderView("project/card", {
    id,
    name: esc(project.name),
    state: esc(project.state),
    count,
    taskLabel: count === 1 ? "task" : "tasks",
    description,
    descriptionText,
  }).trim();
}

export function renderProjectCards(projects: any[]): string {
  return projects.length
    ? projects.map(renderProjectCard).join("\n")
    : renderView("project/empty").trim();
}
