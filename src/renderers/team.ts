import { esc, toTitleCase, renderMultiSelect } from '../utils/html';

export function renderResetPasswordForm(member: { id: number; username: string }): string {
  return `<div class="modal" id="reset-pw-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-post="/api/team/members/${member.id}/reset-password" hx-swap="none"
    @htmx:after-request="if($event.detail.successful){document.getElementById('reset-pw-modal-wrap')?.remove();window.dispatchEvent(new CustomEvent('show-toast',{detail:'Password updated for ${esc(member.username)}.'}));}">
    <h3>Reset password — ${esc(member.username)}</h3>
    <input type="password" name="password" class="form-control" placeholder="New password" minlength="6" required autocomplete="new-password" />
    <input type="password" name="passwordConfirmation" class="form-control" placeholder="Confirm password" minlength="6" required autocomplete="new-password" />
    <div class="task-edit__actions">
      <button type="submit">Reset</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('reset-pw-modal-wrap')?.remove()">Cancel</button>
    </div>
  </form>
</div>`;
}

export function renderTeamMemberRow(member: any, callerRole: string): string {
  const memberRoleType = member.role?.type || '';
  const memberRoleName = member.role?.name || 'user';
  const isEmployee = memberRoleType === 'employee';
  const isTeamLead = memberRoleType === 'team_lead';

  const canReset =
    callerRole === 'owner' ||
    (callerRole === 'team_lead' && isEmployee);
  const canDelete =
    callerRole === 'owner' ||
    (callerRole === 'team_lead' && isEmployee);

  const confirmMsg = isTeamLead
    ? `Delete Team Lead "${esc(member.username)}"? This may affect projects, tasks, and time entries associated with this user.`
    : `Delete Employee "${esc(member.username)}"? This may affect projects, tasks, and time entries associated with this user.`;

  const resetButton = canReset
    ? `<button type="button" class="btn-icon" title="Reset password"
        hx-get="/api/team/modal?view=reset-form&amp;memberId=${member.id}&amp;memberName=${encodeURIComponent(member.username)}" hx-target="#modal-container" hx-swap="innerHTML"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>`
    : '';
  const deleteButton = canDelete
    ? `<button type="button" class="btn-icon btn-delete" title="Delete"
      hx-delete="/api/team/members/${member.id}" hx-swap="none"
      hx-confirm="Are you sure?"
      @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/team/members',{target:'#team-members',swap:'innerHTML'})}">🗑</button>`
    : '';
  return `<div class="team-member-row">
  <div class="team-member-row__info">
    <span class="team-member-row__name">${esc(toTitleCase(member.username || ''))}</span>
    <span class="team-member-row__email">${esc(member.email)}</span>
  </div>
  <div style="display:flex;align-items:center;gap:.5rem">
    <span class="badge">${esc(memberRoleName)}</span>
    ${resetButton}${deleteButton}
  </div>
</div>`;
}

export function renderTeamMembersList(members: any[], callerRole = ''): string {
  if (!members.length) return '<p class="empty">No team members yet.</p>';
  return members.map((member) => renderTeamMemberRow(member, callerRole)).join('\n');
}

function renderSectionedMembers(members: any[], callerRole: string): string {
  const teamLeads = members.filter((m) => m.role?.type === 'team_lead');
  const employees = members.filter((m) => m.role?.type === 'employee');
  let html = '';

  if (callerRole === 'owner' && teamLeads.length) {
    html += '<h4 style="margin:.6rem 0 .3rem;font-size:.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Team Leads</h4>';
    html += teamLeads.map((m) => renderTeamMemberRow(m, callerRole)).join('\n');
  }

  if (employees.length) {
    html += '<h4 style="margin:.6rem 0 .3rem;font-size:.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Employees</h4>';
    html += employees.map((m) => renderTeamMemberRow(m, callerRole)).join('\n');
  }

  if (!html) return '<p class="empty">No team members yet.</p>';
  return html;
}

export function renderTeamPage(members: any[], callerRoleType: string): string {
  return `<div id="team-password-reveal"></div>
<div id="team-members" class="groups-list">${renderSectionedMembers(members, callerRoleType)}</div>`;
}

export function renderTeamCreateForm(callerRoleType: string, groups: any[] = []): string {
  const isOwner = callerRoleType === 'owner';
  const addTitle = isOwner ? 'New team member' : 'New Employee';

  const roleField = isOwner
    ? `<select name="roleType" class="form-select">
        <option value="employee">Employee</option>
        <option value="team_lead">Team Lead</option>
      </select>`
    : '<input type="hidden" name="roleType" value="employee" />';

  const groupOptions = groups.length
    ? `<div>
        <label class="url-import__label">Groups</label>
        ${renderMultiSelect('groupIds', groups.map((g: any) => ({ value: g.id, label: g.name })), 'Select groups...')}
      </div>`
    : '';

  return `<div class="modal" id="team-create-modal-wrap" onclick="if(event.target===this)this.remove()">
  <form class="task-edit" hx-post="/api/team/members" hx-target="#team-password-reveal" hx-swap="innerHTML"
    @htmx:after-request="if($event.detail.successful){document.getElementById('team-create-modal-wrap')?.remove();htmx.ajax('GET','/api/team/members',{target:'#team-members',swap:'innerHTML'})}">
    <h3>${addTitle}</h3>
    <input type="text" name="username" class="form-control" placeholder="Username" required />
    <input type="email" name="email" class="form-control" placeholder="Email" required />
    <input type="password" name="password" class="form-control" placeholder="Password" minlength="6" required autocomplete="new-password" />
    <input type="password" name="passwordConfirmation" class="form-control" placeholder="Confirm password" minlength="6" required autocomplete="new-password" />
    ${roleField}
    ${groupOptions}
    <div class="task-edit__actions">
      <button type="submit">Add</button>
      <button type="button" class="btn-ghost" onclick="document.getElementById('team-create-modal-wrap')?.remove()">Cancel</button>
    </div>
  </form>
</div>`;
}

export function renderTeamModal(members: any[], callerRoleType: string, projects: any[] = [], groups: any[] = []): string {
  const isOwner = callerRoleType === 'owner';

  const roleField = isOwner
    ? `<select name="roleType" class="form-select">
        <option value="employee">Employee</option>
        <option value="team_lead">Team Lead</option>
      </select>`
    : '<input type="hidden" name="roleType" value="employee" />';

  const groupOptions = groups.length
    ? `<div>
        <label class="project-picker-label">Groups</label>
        ${renderMultiSelect('groupIds', groups.map((g: any) => ({ value: g.id, label: g.name })), 'Select groups...')}
      </div>`
    : '<p class="form-hint">No groups available. Create groups first.</p>';

  const projectOptions = '';

  const addTitle = isOwner ? 'Add a team member' : 'Add Employee';

  return `<div class="modal" id="team-modal" onclick="if(event.target===this)this.remove()">
  <div class="task-edit">
    <h3>Team</h3>
    <div id="team-password-reveal"></div>
    <div id="team-members" class="team-list">${renderSectionedMembers(members, callerRoleType)}</div>
    <h3 style="margin-top:.5rem">${addTitle}</h3>
    <form hx-post="/api/team/members" hx-target="#team-password-reveal" hx-swap="innerHTML"
      @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/team/members',{target:'#team-members',swap:'innerHTML'});$el.reset()}">
      <div style="display:flex;flex-direction:column;gap:.7rem">
        <input type="text" name="username" class="form-control" placeholder="Username" required />
        <input type="email" name="email" class="form-control" placeholder="Email" required />
        <input type="password" name="password" class="form-control" placeholder="Password" minlength="6" required autocomplete="new-password" />
        <input type="password" name="passwordConfirmation" class="form-control" placeholder="Confirm password" minlength="6" required autocomplete="new-password" />
        ${roleField}
        ${groupOptions}
        ${projectOptions}
        <div class="task-edit__actions">
          <button type="submit">Add</button>
          <button type="button" class="btn-ghost" onclick="document.getElementById('team-modal').remove()">Close</button>
        </div>
      </div>
    </form>
  </div>
</div>`;
}
