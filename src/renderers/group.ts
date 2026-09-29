import { esc, toTitleCase, renderMultiSelect } from '../utils/html';

export function renderGroupPage(groups: any[], callerRole: string): string {

  return `<div id="group-form-area"></div>
<div id="group-list" class="groups-list">${renderGroupList(groups, callerRole)}</div>`;
}

export function renderGroupCreateForm(allUsers: any[], allProjects: any[]): string {
  const userOptions = allUsers.map((u: any) =>
    `<option value="${u.id}">${esc(u.username)} (${esc(u.role?.name || 'user')})</option>`
  ).join('');

  const projectOptions = allProjects.map((p: any) =>
    `<option value="${p.id}">${esc(p.name)}${p.state ? ` · ${esc(p.state)}` : ''}</option>`
  ).join('');

  return `<div class="modal" id="group-create-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-post="/api/groups" hx-target="#group-form-area" hx-swap="innerHTML"
    @htmx:after-request="if($event.detail.successful){document.getElementById('group-create-modal-wrap')?.remove();htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'})}">
    <h3>New group</h3>
    <input type="text" name="name" class="form-control" placeholder="Group name" required />
    <div>
      <label class="url-import__label">Members</label>
      ${renderMultiSelect('memberIds', allUsers.map((u: any) => ({ value: u.id, label: `${u.username} (${u.role?.name || 'user'})` })), 'Select members...')}
    </div>
    <div>
      <label class="url-import__label">Projects</label>
      ${renderMultiSelect('projectIds', allProjects.map((p: any) => ({ value: p.id, label: p.name + (p.state ? ` · ${p.state}` : '') })), 'Select projects...')}
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
  const memberNames = (group.members || []).map((m: any) => esc(toTitleCase(m.username || ''))).join(', ') || 'No members';
  const projectLinks = (group.projects || []).map((p: any) =>
    p.documentId
      ? `<a href="#" class="task-card__project-link" data-project-id="${esc(p.documentId)}" data-project-name="${esc(p.name)}" onclick="event.preventDefault();(function(el){if(window.Alpine){var d=window.Alpine.$data(document.body);d.selected={id:el.dataset.projectId,name:el.dataset.projectName,count:0};if(d.navigate)d.navigate('tasks');location.hash='tasks';setTimeout(function(){document.body.dispatchEvent(new CustomEvent('load-tasks',{bubbles:true}));},80);}else{var c=Array.prototype.find.call(document.querySelectorAll('.project-card'),function(x){return x.dataset.id===el.dataset.projectId});if(c)c.click();}})(this)">${esc(p.name)}</a>`
      : esc(p.name)
  ).join(', ') || 'No projects';

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
    <span class="group-row__projects">${projectLinks}</span>
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

  const userOpts = allUsers.map((u: any) =>
    `<option value="${u.id}">${esc(u.username)} (${esc(u.role?.name || 'user')})</option>`
  ).join('');

  const projectOpts = allProjects.map((p: any) =>
    `<option value="${p.id}">${esc(p.name)}${p.state ? ` · ${esc(p.state)}` : ''}</option>`
  ).join('');

  const addForm = canManage ? `
    <h3 style="margin-top:.5rem">Create group</h3>
    <form hx-post="/api/groups" hx-target="#group-form-area" hx-swap="innerHTML"
      @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'});$el.reset()}">
      <div style="display:flex;flex-direction:column;gap:.7rem">
        <input type="text" name="name" class="form-control" placeholder="Group name" required />
        <div>
          <label class="project-picker-label">Members</label>
          ${renderMultiSelect('memberIds', allUsers.map((u: any) => ({ value: u.id, label: `${u.username} (${u.role?.name || 'user'})` })), 'Select members...')}
        </div>
        <div>
          <label class="project-picker-label">Projects</label>
          ${renderMultiSelect('projectIds', allProjects.map((p: any) => ({ value: p.id, label: p.name + (p.state ? ` · ${p.state}` : '') })), 'Select projects...')}
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

  const userOptions = allUsers.map((u: any) =>
    `<option value="${u.id}" ${currentMemberIds.has(u.id) ? 'selected' : ''}>${esc(u.username)} (${esc(u.role?.name || 'user')})</option>`
  ).join('');

  const projectOptions = allProjects.map((p: any) =>
    `<option value="${p.id}" ${currentProjectIds.has(p.id) ? 'selected' : ''}>${esc(p.name)}${p.state ? ` · ${esc(p.state)}` : ''}</option>`
  ).join('');

  return `<div class="modal" id="group-edit-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-put="/api/groups/${group.documentId}" hx-swap="none"
    @htmx:after-request="if($event.detail.successful){document.getElementById('group-edit-modal-wrap')?.remove();htmx.ajax('GET','/api/groups/list',{target:'#group-list',swap:'innerHTML'})}">
    <h3>Edit: ${esc(group.name)}</h3>
    <input type="text" name="name" class="form-control" value="${esc(group.name)}" required />
    <div>
      <label class="url-import__label">Members</label>
      ${renderMultiSelect('memberIds', allUsers.map((u: any) => ({ value: u.id, label: `${u.username} (${u.role?.name || 'user'})`, selected: currentMemberIds.has(u.id) })), 'Select members...')}
    </div>
    <div>
      <label class="url-import__label">Projects</label>
      ${renderMultiSelect('projectIds', allProjects.map((p: any) => ({ value: p.id, label: p.name + (p.state ? ` · ${p.state}` : ''), selected: currentProjectIds.has(p.id) })), 'Select projects...')}
    </div>
    <div class="task-edit__actions">
      <button type="submit">Save</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('group-edit-modal-wrap')?.remove()">Cancel</button>
    </div>
  </form>
</div>`;
}
