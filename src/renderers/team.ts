import { esc } from '../utils/html';

export function renderTeamMemberRow(member: any): string {
  return `<div class="team-member-row">
  <div class="team-member-row__info">
    <span class="team-member-row__name">${esc(member.username)}</span>
    <span class="team-member-row__email">${esc(member.email)}</span>
  </div>
  <div style="display:flex;align-items:center;gap:.5rem">
    <span class="badge">${esc(member.role?.name || '')}</span>
    <form class="reset-pw-form" hx-post="/api/team/members/${member.id}/reset-password"
      hx-target="#team-password-reveal" hx-swap="innerHTML" style="display:flex;gap:.4rem;align-items:center">
      <input type="password" name="password" class="form-control" placeholder="New password" minlength="6" required style="width:140px;padding:.3rem .5rem;font-size:.85rem" />
      <button type="submit" class="btn-ghost">Reset</button>
    </form>
  </div>
</div>`;
}

export function renderTeamMembersList(members: any[]): string {
  if (!members.length) return '<p class="empty">No team members yet.</p>';
  return members.map(renderTeamMemberRow).join('\n');
}

export function renderTeamModal(members: any[], callerRoleType: string): string {
  const roleOptions = callerRoleType === 'owner'
    ? '<option value="employee">Employee</option><option value="team_lead">Team Lead</option>'
    : '<option value="employee">Employee</option>';

  return `<div class="modal" id="team-modal" onclick="if(event.target===this)this.remove()">
  <div class="task-edit" style="width:min(520px,92vw)">
    <h3>Team</h3>
    <div id="team-password-reveal"></div>
    <div id="team-members" class="team-list">${renderTeamMembersList(members)}</div>
    <h3 style="margin-top:.5rem">Add a team member</h3>
    <form hx-post="/api/team/members" hx-target="#team-password-reveal" hx-swap="innerHTML"
      @htmx:after-request="if($event.detail.successful){htmx.ajax('GET','/api/team/members',{target:'#team-members',swap:'innerHTML'});$el.reset()}">
      <div style="display:flex;flex-direction:column;gap:.7rem">
        <input type="text" name="username" class="form-control" placeholder="Username" required />
        <input type="email" name="email" class="form-control" placeholder="Email" required />
        <input type="password" name="password" class="form-control" placeholder="Password" minlength="6" required autocomplete="new-password" />
        <select name="roleType" class="form-select">${roleOptions}</select>
        <div class="task-edit__actions">
          <button type="submit">Add</button>
          <button type="button" class="btn-ghost" onclick="document.getElementById('team-modal').remove()">Close</button>
        </div>
      </div>
    </form>
  </div>
</div>`;
}
