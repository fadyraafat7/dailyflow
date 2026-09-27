import { esc } from '../utils/html';

export function renderGroupPage(groups: any[], callerRole: string): string {

  return `<div id="group-form-area"></div>
<div id="group-list" class="groups-list">${renderGroupList(groups, callerRole)}</div>`;
}

export function renderGroupCreateForm(allUsers: any[], allProjects: any[]): string {
  const userCheckboxes = allUsers.map((u: any) =>
    `<label><input type="checkbox" name="memberIds" value="${u.id}" /> ${esc(u.username)} <span class="badge">${esc(u.role?.name || 'user')}</span></label>`
  ).join('');

  const projectCheckboxes = allProjects.map((p: any) =>
    `<label><input type="checkbox" name="projectIds" value="${p.id}" /> ${esc(p.name)}${p.state ? ` · ${esc(p.state)}` : ''}</label>`
  ).join('');

  return `<div class="modal" id="group-create-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-post="/api/groups" hx-target="#group-form-area" hx-swap="innerHTML"
    @htmx:after-request="if($event.detail.successful){document.getElementById('group-create-modal-wrap')?.remove();htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'})}">
    <h3>New group</h3>
    <input type="text" name="name" class="form-control" placeholder="Group name" required />
    <div>
      <label class="url-import__label">Members</label>
      <div class="checkbox-list">${userCheckboxes}</div>
    </div>
    <div>
      <label class="url-import__label">Projects</label>
      <div class="checkbox-list">${projectCheckboxes}</div>
    </div>
    <div class="task-edit__actions">
      <button type="submit">Create</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('group-create-modal-wrap')?.remove()">Cancel</button>
    </div>
  </form>
</div>`;
}

export function renderGroupRow(group: any, callerRole: string): string {
  const memberCount = group.members?.length || 0;
  const projectCount = group.projects?.length || 0;
  const memberNames = (group.members || []).map((m: any) => esc(m.username)).join(', ') || 'No members';
  const projectNames = (group.projects || []).map((p: any) => esc(p.name)).join(', ') || 'No projects';

  const canManage = callerRole === 'owner' || callerRole === 'team_lead';

  const editButton = canManage
    ? `<button type="button" class="btn-icon" title="Edit"
        hx-get="/api/groups/${group.documentId}/edit-form" hx-target="#modal-container" hx-swap="innerHTML">✎</button>`
    : '';
  const deleteButton = canManage
    ? `<button type="button" class="btn-icon btn-delete" title="Delete"
        hx-delete="/api/groups/${group.documentId}" hx-swap="none"
        hx-confirm="Are you sure?"
        @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'})}">🗑</button>`
    : '';

  return `<div class="group-row" id="group-${esc(group.documentId)}">
  <div class="group-row__info">
    <span class="group-row__name">${esc(group.name)}</span>
    <div class="group-row__meta">
      <span class="badge">${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
      <span class="badge">${projectCount} project${projectCount !== 1 ? 's' : ''}</span>
    </div>
    <span class="group-row__members">${memberNames}</span>
    <span class="group-row__projects">${projectNames}</span>
  </div>
  <div class="task-card__actions">
    ${editButton}${deleteButton}
  </div>
</div>`;
}

export function renderGroupList(groups: any[], callerRole: string): string {
  if (!groups.length) return '<p class="empty">No groups yet.</p>';
  return groups.map((g) => renderGroupRow(g, callerRole)).join('\n');
}

export function renderGroupModal(groups: any[], callerRole: string, allUsers: any[], allProjects: any[]): string {
  const canManage = callerRole === 'owner' || callerRole === 'team_lead';

  const userCheckboxes = allUsers.map((u: any) =>
    `<label><input type="checkbox" name="memberIds" value="${u.id}" /> ${esc(u.username)} <span class="badge">${esc(u.role?.name || 'user')}</span></label>`
  ).join('');

  const projectCheckboxes = allProjects.map((p: any) =>
    `<label><input type="checkbox" name="projectIds" value="${p.id}" /> ${esc(p.name)}${p.state ? ` · ${esc(p.state)}` : ''}</label>`
  ).join('');

  const addForm = canManage ? `
    <h3 style="margin-top:.5rem">Create group</h3>
    <form hx-post="/api/groups" hx-target="#group-form-area" hx-swap="innerHTML"
      @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'});$el.reset()}">
      <div style="display:flex;flex-direction:column;gap:.7rem">
        <input type="text" name="name" class="form-control" placeholder="Group name" required />
        <div>
          <label class="project-picker-label">Members</label>
          <div class="checkbox-list">${userCheckboxes}</div>
        </div>
        <div>
          <label class="project-picker-label">Projects</label>
          <div class="checkbox-list">${projectCheckboxes}</div>
        </div>
        <div class="task-edit__actions">
          <button type="submit">Create</button>
          <button type="button" class="btn-ghost" onclick="document.getElementById('group-modal').remove()">Close</button>
        </div>
      </div>
    </form>` : `<div class="task-edit__actions"><button type="button" class="btn-ghost" onclick="document.getElementById('group-modal').remove()">Close</button></div>`;

  return `<div class="modal" id="group-modal" onclick="if(event.target===this)this.remove()">
  <div class="task-edit">
    <h3>Groups</h3>
    <div id="group-form-area"></div>
    <div id="group-list" class="team-list">${renderGroupList(groups, callerRole)}</div>
    ${addForm}
  </div>
</div>`;
}

export function renderGroupEditForm(group: any, allUsers: any[], allProjects: any[]): string {
  const currentMemberIds = new Set((group.members || []).map((m: any) => m.id));
  const currentProjectIds = new Set((group.projects || []).map((p: any) => p.id));

  const userCheckboxes = allUsers.map((u: any) =>
    `<label><input type="checkbox" name="memberIds" value="${u.id}" ${currentMemberIds.has(u.id) ? 'checked' : ''} /> ${esc(u.username)} <span class="badge">${esc(u.role?.name || 'user')}</span></label>`
  ).join('');

  const projectCheckboxes = allProjects.map((p: any) =>
    `<label><input type="checkbox" name="projectIds" value="${p.id}" ${currentProjectIds.has(p.id) ? 'checked' : ''} /> ${esc(p.name)}${p.state ? ` · ${esc(p.state)}` : ''}</label>`
  ).join('');

  return `<div class="modal" id="group-edit-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-put="/api/groups/${group.documentId}" hx-swap="none"
    @htmx:after-request="if($event.detail.successful){document.getElementById('group-edit-modal-wrap')?.remove();htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'})}">
    <h3>Edit: ${esc(group.name)}</h3>
    <input type="text" name="name" class="form-control" value="${esc(group.name)}" required />
    <div>
      <label class="url-import__label">Members</label>
      <div class="checkbox-list">${userCheckboxes}</div>
    </div>
    <div>
      <label class="url-import__label">Projects</label>
      <div class="checkbox-list">${projectCheckboxes}</div>
    </div>
    <div class="task-edit__actions">
      <button type="submit">Save</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('group-edit-modal-wrap')?.remove()">Cancel</button>
    </div>
  </form>
</div>`;
}
