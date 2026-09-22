import { esc } from '../utils/html';

export function renderGroupRow(group: any, callerRole: string): string {
  const memberCount = group.members?.length || 0;
  const projectCount = group.projects?.length || 0;
  const memberNames = (group.members || []).map((m: any) => esc(m.username)).join(', ') || 'No members';
  const projectNames = (group.projects || []).map((p: any) => esc(p.name)).join(', ') || 'No projects';

  const canManage = callerRole === 'owner' || callerRole === 'team_lead';

  const editButton = canManage
    ? `<button type="button" class="btn-icon" title="Edit group"
        hx-get="/api/groups/${group.documentId}/edit-form" hx-target="#group-form-area" hx-swap="innerHTML">✏️</button>`
    : '';
  const deleteButton = canManage
    ? `<button type="button" class="btn-icon btn-delete" title="Delete group"
        hx-delete="/api/groups/${group.documentId}" hx-target="closest .group-row" hx-swap="outerHTML"
        hx-confirm="Delete group &quot;${esc(group.name)}&quot;? Members will be unlinked but not deleted.">🗑</button>`
    : '';

  return `<div class="group-row" id="group-${esc(group.documentId)}">
  <div class="group-row__info">
    <span class="group-row__name">${esc(group.name)}</span>
    <span class="group-row__detail">${memberCount} member${memberCount !== 1 ? 's' : ''} · ${projectCount} project${projectCount !== 1 ? 's' : ''}</span>
    <span class="group-row__members">${memberNames}</span>
    <span class="group-row__projects">${projectNames}</span>
  </div>
  <div style="display:flex;align-items:center;gap:.3rem">
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

  return `<form hx-put="/api/groups/${group.documentId}" hx-target="#group-form-area" hx-swap="innerHTML"
    @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'})}">
    <h4>Edit: ${esc(group.name)}</h4>
    <div style="display:flex;flex-direction:column;gap:.7rem">
      <input type="text" name="name" class="form-control" value="${esc(group.name)}" required />
      <div>
        <label class="project-picker-label">Members</label>
        <div class="checkbox-list">${userCheckboxes}</div>
      </div>
      <div>
        <label class="project-picker-label">Projects</label>
        <div class="checkbox-list">${projectCheckboxes}</div>
      </div>
      <div class="task-edit__actions">
        <button type="submit">Save</button>
        <button type="button" class="btn-ghost" onclick="document.getElementById('group-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>
  </form>`;
}
