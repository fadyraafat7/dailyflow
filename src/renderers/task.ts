import { esc, renderView, toTitleCase } from "../utils/html";

function durationInMinutes(timeEntry: any): number {
  const hasSavedDuration =
    timeEntry.duration !== null &&
    timeEntry.duration !== undefined &&
    timeEntry.duration !== "";
  const savedDuration = Number(timeEntry.duration);
  if (hasSavedDuration && Number.isFinite(savedDuration) && savedDuration > 0)
    return savedDuration;
  if (!timeEntry.startedAt || !timeEntry.stoppedAt) return 0;

  const startedAt = new Date(timeEntry.startedAt).getTime();
  const stoppedAt = new Date(timeEntry.stoppedAt).getTime();
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(stoppedAt) ||
    stoppedAt < startedAt
  )
    return 0;

  return Math.round((stoppedAt - startedAt) / 60000);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes}m`;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function renderTaskCard(task: any, role = ""): string {
  const id = esc(task.documentId);
  const plannedDateRaw = task.plannedDate ? esc(task.plannedDate) : "";
  const date = task.plannedDate
    ? `<span class="task-card__date">${esc(task.plannedDate)}</span>`
    : "";
  const projectDocId = task.project?.documentId;
  const projectName = task.project?.name ? toTitleCase(task.project.name) : '';
  const projectLink = projectDocId && projectName
    ? `<a href="#" class="task-card__project-link" data-project-id="${esc(projectDocId)}" data-project-name="${esc(projectName)}" onclick="event.preventDefault();(function(el){if(window.Alpine){var d=window.Alpine.$data(document.body);d.selected={id:el.dataset.projectId,name:el.dataset.projectName,count:0};if(d.navigate)d.navigate('tasks');location.hash='tasks';setTimeout(function(){document.body.dispatchEvent(new CustomEvent('load-tasks',{bubbles:true}));},80);}else{var c=Array.prototype.find.call(document.querySelectorAll('.project-card'),function(x){return x.dataset.id===el.dataset.projectId});if(c)c.click();}})(this)">${esc(projectName)}</a>`
    : '';
  const timeEntries = Array.isArray(task.time_entries) ? task.time_entries : [];
  const runningEntry = timeEntries.find((timeEntry: any) => timeEntry && !timeEntry.stoppedAt);
  const completedCount = timeEntries.filter((timeEntry: any) => timeEntry && timeEntry.stoppedAt).length;
  const totalMinutes = timeEntries.reduce(
    (total: number, timeEntry: any) => total + durationInMinutes(timeEntry),
    0,
  );
  const creatorUsername = task.users_permissions_user?.username;
  const addedBy = creatorUsername
    ? `<span class="task-card__added-by">Added by ${esc(creatorUsername)}</span>`
    : "";
  const assignedUsername = task.assigned_to?.username;
  const assignedTo = assignedUsername
    ? `<span class="badge state--active">👤 ${esc(assignedUsername)}</span>`
    : "";

  let timeSummary: string;
  if (runningEntry) {
    const startIso = esc(runningEntry.startedAt);
    const timerId = `timer-${esc(runningEntry.documentId)}`;
    const entryDocId = esc(runningEntry.documentId);
    timeSummary = `<div class="task-card__time"><div class="task-card__total"><span class="badge state--running">running</span> <span id="${timerId}" data-start="${startIso}">00:00:00</span>${completedCount ? ` + ${formatDuration(totalMinutes)}` : ''}</div></div>
<script>(function(){var el=document.getElementById('${timerId}');if(!el)return;var start=new Date('${startIso}').getTime();function tick(){var d=Date.now()-start;if(d<0)d=0;var h=Math.floor(d/3600000);var m=Math.floor((d%3600000)/60000);var s=Math.floor((d%60000)/1000);el.textContent=(h<10?'0':'')+h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s}tick();var iv=setInterval(tick,1000);el._iv=iv;new MutationObserver(function(){if(!document.contains(el))clearInterval(iv)}).observe(el.parentNode,{childList:true});
window._stopTimerWithComment=window._stopTimerWithComment||function(eId,tId){var m=document.createElement('div');m.className='modal';m.id='stop-modal-'+eId;m.innerHTML='<form class="task-edit" hx-put="/api/time-entries/'+eId+'/stop" hx-swap="none"><h3>Stop Timer</h3><textarea name="comment" class="form-control" rows="3" placeholder="Comment (optional)" style="resize:vertical;width:100%"></textarea><div class="task-edit__actions"><button type="submit">Stop</button> <button type="button" class="btn-ghost" id="_sc-'+eId+'">Cancel</button></div></form>';m.onclick=function(e){if(e.target===m)m.remove()};document.body.appendChild(m);document.getElementById('_sc-'+eId).onclick=function(){m.remove()};var f=m.querySelector('form');htmx.process(f);f.addEventListener('htmx:afterRequest',function(e){if(e.detail.successful){m.remove();htmx.trigger(document.body,'refresh-tasks');if(tId)htmx.ajax('GET','/api/time-entries/by-task/'+tId,{target:'#time-entry-list',swap:'innerHTML'})}})};
})()</script>`;
  } else if (timeEntries.length) {
    timeSummary = `<div class="task-card__time"><div class="task-card__total">Duration: <strong>${formatDuration(totalMinutes)}</strong></div></div>`;
  } else {
    timeSummary = `<div class="task-card__time"><span class="task-card__no-time">No time entries</span></div>`;
  }

  const timerControls = runningEntry
    ? `<button type="button" class="btn-icon" title="Stop timer"
        onclick="window._stopTimerWithComment('${esc(runningEntry.documentId)}','${id}')">⏹</button>`
    : `<button type="button" class="btn-icon" title="Start timer"
        hx-post="/api/time-entries"
        hx-swap="none"
        hx-vals='js:{"task":"${id}","startedAt":new Date().toISOString()}'>▶</button>`;

  return renderView("task/card", {
    id,
    title: esc(toTitleCase(task.title || '')),
    priority: esc(task.priority),
    state: esc(task.state),
    date,
    plannedDateRaw,
    timeSummary,
    timerControls,
    addedBy,
    assignedTo,
    assignedToId: task.assigned_to?.id || '',
    projectLink,
    canDelete: role === "owner" || role === "team_lead" ? "" : "hidden",
  }).trim();
}

export function renderTaskCards(tasks: any[], role = "", sort = ""): string {
  if (!tasks.length) return renderView("task/empty").trim();

  if (sort !== "plannedDate:asc") {
    return tasks.map((task) => renderTaskCard(task, role)).join("\n");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const weekAhead = todayMs + 7 * 86400000;

  const bucketFor = (raw: string | null): string => {
    if (!raw) return "No date";
    const d = new Date(raw);
    d.setHours(0, 0, 0, 0);
    const ms = d.getTime();
    if (Number.isNaN(ms)) return "No date";
    if (ms < todayMs) return "Overdue";
    if (ms === todayMs) return "Today";
    if (ms <= weekAhead) return "This week";
    return "Later";
  };

  let lastBucket = "";
  let html = "";
  for (const task of tasks) {
    const bucket = bucketFor(task.plannedDate ?? null);
    if (bucket !== lastBucket) {
      html += `<div class="task-group-heading">${esc(bucket)}</div>\n`;
      lastBucket = bucket;
    }
    html += renderTaskCard(task, role) + "\n";
  }
  return html;
}
