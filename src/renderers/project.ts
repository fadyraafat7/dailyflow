import { esc, renderView, toTitleCase, renderMultiSelect } from "../utils/html";

export function renderProjectCreateForm(allGroups: any[]): string {
  const groupOptions = allGroups.length
    ? allGroups.map((g: any) => `<option value="${g.id}">${esc(g.name)}</option>`).join("\n")
    : '';

  return `<div class="modal" id="project-create-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-post="/api/projects" hx-swap="none"
    @htmx:after-request="if($event.detail.successful){document.getElementById('project-create-modal-wrap')?.remove();htmx.trigger(document.body,'refresh-projects')}">
    <h3>New project</h3>
    <input type="text" name="name" class="form-control" placeholder="Project name" required />
    <textarea name="description" class="form-control" rows="4" placeholder="Project description"></textarea>
    <select name="state" class="form-select">
      <option value="active">active</option>
      <option value="archived">archived</option>
    </select>
    <label class="url-import__label">Groups</label>
    ${renderMultiSelect('groupIds', allGroups.map((g: any) => ({ value: g.id, label: g.name })), 'Select groups...')}
    <div class="task-edit__actions">
      <button type="submit">Add</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('project-create-modal-wrap')?.remove()">Cancel</button>
    </div>
  </form>
</div>`;
}

export function renderProjectEditForm(
  project: any,
  allGroups: any[],
  currentGroupIds: number[],
): string {
  const docId = esc(project.documentId);
  const nameVal = esc(project.name || "");
  const descVal = esc(project.description || "");

  const groupOptions = allGroups.length
    ? allGroups.map((g: any) => {
        const sel = currentGroupIds.includes(g.id) ? " selected" : "";
        return `<option value="${g.id}"${sel}>${esc(g.name)}</option>`;
      }).join("\n")
    : '';

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
    <label class="url-import__label">Groups</label>
    <input type="hidden" name="_has_groupIds" value="1" />
    ${renderMultiSelect('groupIds', allGroups.map((g: any) => ({ value: g.id, label: g.name, selected: currentGroupIds.includes(g.id) })), 'Select groups...')}
    <div class="task-edit__actions">
      <button type="submit">Save</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('project-edit-modal').remove()">Cancel</button>
    </div>
  </form>
</div>`;
}

export function renderProjectCard(project: any, role: string): string {
  const id = esc(project.documentId);
  const count = Array.isArray(project.tasks) ? project.tasks.length : 0;
  const descriptionText = project.description ? esc(project.description) : "";
  const description = descriptionText
    ? `<p class="project-card__desc">${descriptionText}</p>`
    : "";

  return renderView("project/card", {
    id,
    name: esc(toTitleCase(project.name || '')),
    state: esc(project.state),
    count,
    taskLabel: count === 1 ? "task" : "tasks",
    description,
    descriptionText,
    canManage: role === "owner" || role === "team_lead" ? "" : "hidden",
  }).trim();
}

export function renderProjectCards(projects: any[], role = ""): string {
  return projects.length
    ? projects.map((project) => renderProjectCard(project, role)).join("\n")
    : renderView("project/empty").trim();
}
