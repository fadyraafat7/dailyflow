# DailyFlow

A task and time-tracking application built with Strapi 5, HTMX, and Alpine.js. Features project management, group-based team collaboration with role-based access control (Owner / Team Lead / Employee), task assignment, and per-task time entry tracking.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Strapi 5 (TypeScript) |
| Database | SQLite (default), PostgreSQL, MySQL |
| Auth | JWT via Strapi users-permissions plugin |
| Frontend | HTMX 2 + Alpine.js 3 (no build step) |
| Styling | Vanilla CSS with light/dark theme |

## Project Structure

```
dailyflow/          # Strapi backend
├── config/         # Database, server, middleware, plugin config
├── src/
│   ├── api/
│   │   ├── project/       # Project CRUD + edit-form endpoint
│   │   ├── task/          # Task CRUD + URL import + assignment
│   │   ├── time-entry/    # Time entry CRUD + stop timer
│   │   ├── team/          # Team member management
│   │   └── group/         # Group management (members + projects)
│   ├── extensions/        # Extended user schema (tasks, projects, groups relations)
│   ├── renderers/         # Server-side HTML renderers (project, task, team, group)
│   └── utils/             # RBAC helpers, HTML utilities, password generation
├── views/                 # HTML templates for HTMX responses
└── .tmp/data.db           # SQLite database (auto-created)

Frontend/           # Standalone SPA (no bundler)
├── index.html      # Single-page app
├── app.css         # Full stylesheet with dark mode
└── serve.mjs       # Static file server (port 5500)
```

## Content Types

- **Project** -- name, description, state (active/archived), owner, linked to groups
- **Task** -- title, planned date, priority (low/high), state (pending/active/paused/completed), linked to a project, assigned_to user
- **Time Entry** -- startedAt, stoppedAt, duration, linked to a task
- **Group** -- name, users (manyToMany), projects (manyToMany)

## Groups

Groups are the membership mechanism for projects. Instead of assigning users directly to projects, users are added to groups, and groups are linked to projects. A user can belong to multiple groups, and a group can contain multiple projects.

- Owner and Team Lead can create, edit, and delete groups
- When adding a new team member, they are assigned to groups (not projects)
- A user sees projects linked to their groups, plus any projects where they have assigned tasks

## Task Assignment

Tasks can be assigned to specific users via the `assigned_to` field:
- Owner can assign tasks to any user
- Team Lead can assign tasks to employees in their groups
- When a user is assigned a task, they automatically see the project and task

## Roles & Permissions

| | Owner | Team Lead | Employee |
|---|---|---|---|
| Projects | Full CRUD | CRUD (own only) | View (group + assigned) |
| Tasks | Full CRUD + delete | Full CRUD + delete | Create/update (group + assigned projects) |
| Time Entries | Full CRUD | Full CRUD | Full CRUD (group + assigned projects) |
| Team Management | Yes | Yes (employees only) | No |
| Group Management | Yes | Yes | No |

## Getting Started

### Prerequisites

- Node.js 20-26
- npm 6+

### Backend

```bash
cd dailyflow
npm install
npm run develop
```

On first run with an empty database, set `DAILYFLOW_OWNER_EMAIL` and `DAILYFLOW_OWNER_USERNAME`. You may also set `DAILYFLOW_OWNER_PASSWORD`; otherwise the bootstrap generates a one-time random password and prints it to the server log. The bootstrap then creates:

- Three roles: Owner, Team Lead, Employee

The Strapi admin panel is available at `http://localhost:1337/admin`.

### Frontend

```bash
cd Frontend
node serve.mjs
```

Open `http://localhost:5500` and log in with the Owner credentials configured through environment variables.

## API Overview

All custom endpoints return HTML fragments when the request includes HTMX headers, and JSON otherwise.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List projects (paginated, role-filtered) |
| POST | `/api/projects` | Create project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| GET | `/api/projects/:id/edit-form` | Project edit modal (HTML) |
| GET | `/api/tasks` | List tasks (paginated, role-filtered) |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/from-url` | Import task from URL |
| POST | `/api/tasks/parse-url` | Parse URL metadata |
| GET | `/api/tasks/assignable-users` | List users assignable to a task |
| GET | `/api/time-entries` | List time entries |
| POST | `/api/time-entries` | Create/start time entry |
| PUT | `/api/time-entries/:id/stop` | Stop running timer |
| GET | `/api/team/modal` | Team management modal (HTML) |
| GET | `/api/team/members` | List team members |
| POST | `/api/team/members` | Create team member |
| POST | `/api/team/members/:id/reset-password` | Reset member password |
| DELETE | `/api/team/members/:id` | Delete member (removes from groups) |
| GET | `/api/groups/modal` | Group management modal (HTML) |
| GET | `/api/groups/list` | List groups (HTML) |
| GET | `/api/groups/:documentId/edit` | Group edit form (HTML) |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/:documentId` | Update group |
| DELETE | `/api/groups/:documentId` | Delete group |

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_CLIENT` | `sqlite` | Database client (`sqlite`, `postgres`, `mysql`) |
| `DATABASE_HOST` | `127.0.0.1` | Database host (postgres/mysql) |
| `DATABASE_PORT` | `5432` | Database port |
| `DATABASE_NAME` | -- | Database name |
| `DATABASE_USERNAME` | -- | Database user |
| `DATABASE_PASSWORD` | -- | Database password |

### CORS

The backend allows requests from `localhost:5500`, `localhost:5173`, `localhost:3000`, and `localhost:8080`. Update `config/middlewares.ts` to add other origins.

## Frontend Features

- Login/logout with JWT stored in localStorage
- Project list with search, state filter, and pagination
- Task panel with search, filters (priority, state), sorting, and date grouping
- Task assignment (assign tasks to specific users)
- Inline time tracking (start/stop timers per task)
- Group management modal (create/edit/delete groups with members and projects)
- Team management modal for Owner/Team Lead roles
- Change password
- URL-based task import
- Responsive layout with dark mode support
