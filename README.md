# DailyFlow

A task and time-tracking application built with Strapi 5, HTMX, and Alpine.js. Features project management, team collaboration with role-based access control (Owner / Team Lead / Employee), and per-task time entry tracking.

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
│   │   ├── task/          # Task CRUD + URL import
│   │   ├── time-entry/    # Time entry CRUD + stop timer
│   │   └── team/          # Team member management
│   ├── extensions/        # Extended user schema (tasks, projects, team_projects relations)
│   ├── renderers/         # Server-side HTML renderers (project edit form, team modal)
│   └── utils/             # RBAC helpers, HTML utilities, password generation
├── views/                 # HTML templates for HTMX responses
└── .tmp/data.db           # SQLite database (auto-created)

Frontend/           # Standalone SPA (no bundler)
├── index.html      # Single-page app
├── config.js       # API base URL + HTMX/Alpine config
├── app.css         # Full stylesheet with dark mode
└── serve.mjs       # Static file server (port 5500)
```

## Content Types

- **Project** -- name, description, state (active/archived), owner, team members
- **Task** -- title, planned date, priority (low/high), state (pending/active/paused/completed), linked to a project
- **Time Entry** -- startedAt, stoppedAt, duration, linked to a task

## Roles & Permissions

| | Owner | Team Lead | Employee |
|---|---|---|---|
| Projects | Full CRUD | CRUD (own only) | View (assigned only) |
| Tasks | Full CRUD + delete | Full CRUD + delete | Create/update (assigned projects) |
| Time Entries | Full CRUD | Full CRUD | Full CRUD (assigned projects) |
| Team Management | Yes | Yes | No |

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

On first run with an empty database, the bootstrap creates:

- Three roles: Owner, Team Lead, Employee
- A default Owner account:
  - Email: `nohaalideveloper@gmail.com`
  - Username: `noha`
  - Password: `Noha@2025`

The Strapi admin panel is available at `http://localhost:1337/admin`.

### Frontend

```bash
cd Frontend
node serve.mjs
```

Open `http://localhost:5500` and log in with the Owner credentials above.

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
| GET | `/api/time-entries` | List time entries |
| POST | `/api/time-entries` | Create/start time entry |
| PUT | `/api/time-entries/:id/stop` | Stop running timer |
| GET | `/api/team/modal` | Team management modal (HTML) |
| GET | `/api/team/members` | List team members |
| POST | `/api/team/members` | Create team member (with optional password) |
| PUT | `/api/team/members/:id/reset-password` | Reset member password |

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
- Inline time tracking (start/stop timers per task)
- Team management modal for Owner/Team Lead roles
- Change password
- URL-based task import
- Responsive layout with dark mode support
