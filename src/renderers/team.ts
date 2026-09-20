import { esc } from '../utils/html';

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

  const resetForm = canReset
    ? `<form class="reset-pw-form" hx-post="/api/team/members/${member.id}/reset-password"
      hx-target="#team-password-reveal" hx-swap="innerHTML" style="display:flex;gap:.4rem;align-items:center">
      <input type="password" name="password" class="form-control" placeholder="New password" minlength="6" required style="width:140px;padding:.3rem .5rem;font-size:.85rem" />
      <input type="password" name="passwordConfirmation" class="form-control" placeholder="Confirm" minlength="6" required style="width:140px;padding:.3rem .5rem;font-size:.85rem" />
      <button type="submit" class="btn-ghost">Reset</button>
    </form>`
    : '';
  const deleteButton = canDelete
    ? `<button type="button" class="btn-icon btn-delete" title="Delete ${esc(memberRoleName)}"
      hx-delete="/api/team/members/${member.id}" hx-target="closest .team-member-row" hx-swap="outerHTML"
      hx-confirm="${confirmMsg}">🗑</button>`
    : '';
  return `<div class="team-member-row">
  <div class="team-member-row__info">
    <span class="team-member-row__name">${esc(member.username)}</span>
    <span class="team-member-row__email">${esc(member.email)}</span>
  </div>
  <div style="display:flex;align-items:center;gap:.5rem">
    <span class="badge">${esc(memberRoleName)}</span>
    ${resetForm}${deleteButton}
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

export function renderTeamModal(members: any[], callerRoleType: string, projects: any[] = []): string {
  const isOwner = callerRoleType === 'owner';

  const roleField = isOwner
    ? `<select name="roleType" class="form-select">
        <option value="employee">Employee</option>
        <option value="team_lead">Team Lead</option>
      </select>`
    : '<input type="hidden" name="roleType" value="employee" />';

  const projectOptions = projects.length
    ? `<div id="team-project-picker">
        <label class="project-picker-label" for="team-projects">Projects</label>
        <select id="team-projects" name="projectIds" class="project-picker" multiple size="4">
          ${projects.map((project: any) => `<option value="${esc(project.id)}">${esc(project.name)}${project.state ? ` · ${esc(project.state)}` : ''}</option>`).join('')}
        </select>
        <p class="form-hint">Select one or more projects.</p>
      </div>`
    : '<p class="form-hint">No projects available for assignment.</p>';

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
