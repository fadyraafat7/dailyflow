export type DemoRole = 'owner' | 'team_lead' | 'employee';

export type DemoUser = {
  key: string;
  username: string;
  email: string;
  password: string;
  role: DemoRole;
};

export type DemoGroup = {
  name: string;
  members: string[];
};

export type DemoProject = {
  name: string;
  description: string;
  state: 'active' | 'archived';
  owner: string;
  groups: string[];
};

export type DemoTask = {
  project: string;
  title: string;
  plannedDate: string;
  priority: 'low' | 'high';
  state: 'pending' | 'active' | 'paused' | 'completed';
  assignedTo: string;
};

export type DemoTimeEntry = {
  project: string;
  task: string;
  startedAt: string;
  duration: number;
};

export const DEMO_USERS: DemoUser[] = [
  { key: 'owner', username: 'owner', email: 'owner@dailyflow.local', password: 'Owner123!', role: 'owner' },
  { key: 'lead1', username: 'lead1', email: 'lead1@dailyflow.local', password: 'Lead123!', role: 'team_lead' },
  { key: 'lead2', username: 'lead2', email: 'lead2@dailyflow.local', password: 'Lead123!', role: 'team_lead' },
  { key: 'employee1', username: 'employee1', email: 'employee1@dailyflow.local', password: 'Employee123!', role: 'employee' },
  { key: 'employee2', username: 'employee2', email: 'employee2@dailyflow.local', password: 'Employee123!', role: 'employee' },
  { key: 'employee3', username: 'employee3', email: 'employee3@dailyflow.local', password: 'Employee123!', role: 'employee' },
  { key: 'employee4', username: 'employee4', email: 'employee4@dailyflow.local', password: 'Employee123!', role: 'employee' },
  { key: 'employee5', username: 'employee5', email: 'employee5@dailyflow.local', password: 'Employee123!', role: 'employee' },
  { key: 'employee6', username: 'employee6', email: 'employee6@dailyflow.local', password: 'Employee123!', role: 'employee' },
];

export const DEMO_GROUPS: DemoGroup[] = [
  { name: 'Web Development', members: ['owner', 'lead1', 'employee1', 'employee2', 'employee3'] },
  { name: 'Mobile Development', members: ['owner', 'lead2', 'employee4', 'employee5'] },
  { name: 'Design', members: ['lead1', 'employee6'] },
  { name: 'Marketing', members: ['owner', 'lead2', 'employee5', 'employee6'] },
];

export const DEMO_PROJECTS: DemoProject[] = [
  {
    name: 'Corporate Website',
    description: 'A responsive company website with a refreshed brand experience and content platform.',
    state: 'active',
    owner: 'lead1',
    groups: ['Web Development', 'Design'],
  },
  {
    name: 'Mobile Banking App',
    description: 'A secure mobile banking experience for account management, transfers, and notifications.',
    state: 'active',
    owner: 'lead2',
    groups: ['Mobile Development', 'Design'],
  },
  {
    name: 'E-commerce Platform',
    description: 'A modern online storefront with catalog, checkout, and campaign management.',
    state: 'active',
    owner: 'owner',
    groups: ['Web Development', 'Marketing'],
  },
  {
    name: 'Marketing Website',
    description: 'A campaign-focused website for product launches and lead generation.',
    state: 'active',
    owner: 'lead2',
    groups: ['Marketing', 'Design'],
  },
  {
    name: 'Internal Dashboard',
    description: 'An internal operations dashboard for reporting, workflows, and team coordination.',
    state: 'active',
    owner: 'lead1',
    groups: ['Web Development'],
  },
  {
    name: 'Customer Portal',
    description: 'A self-service portal where customers can manage their profile, requests, and support history.',
    state: 'archived',
    owner: 'owner',
    groups: ['Web Development', 'Mobile Development'],
  },
];

const projectTasks = (
  project: string,
  assignments: string[],
  plannedDates: string[],
): DemoTask[] => [
  ['Set up project structure', 'high', 'completed'],
  ['Create database schema', 'high', 'completed'],
  ['Implement authentication', 'high', 'active'],
  ['Build dashboard UI', 'high', 'active'],
  ['Implement API endpoints', 'high', 'pending'],
  ['Add validation', 'low', 'pending'],
  ['Write tests', 'low', 'paused'],
].map(([title, priority, state], index) => ({
  project,
  title,
  plannedDate: plannedDates[index],
  priority: priority as DemoTask['priority'],
  state: state as DemoTask['state'],
  assignedTo: assignments[index],
}));

export const DEMO_TASKS: DemoTask[] = [
  ...projectTasks('Corporate Website', ['employee1', 'employee2', 'employee2', 'employee3', 'employee1', 'lead1', 'employee3'], ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15', '2026-09-18', '2026-09-22']),
  ...projectTasks('Mobile Banking App', ['employee4', 'employee5', 'employee4', 'employee5', 'lead2', 'employee4', 'employee5'], ['2026-09-02', '2026-09-04', '2026-09-09', '2026-09-12', '2026-09-16', '2026-09-19', '2026-09-23']),
  ...projectTasks('E-commerce Platform', ['employee1', 'employee2', 'employee3', 'employee5', 'lead1', 'employee2', 'employee3'], ['2026-08-28', '2026-09-02', '2026-09-07', '2026-09-11', '2026-09-14', '2026-09-20', '2026-09-25']),
  ...projectTasks('Marketing Website', ['employee5', 'employee6', 'lead2', 'employee6', 'employee5', 'employee6', 'lead2'], ['2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13', '2026-09-17', '2026-09-21', '2026-09-26']),
  ...projectTasks('Internal Dashboard', ['employee1', 'employee2', 'lead1', 'employee3', 'employee1', 'employee2', 'employee3'], ['2026-08-25', '2026-08-29', '2026-09-04', '2026-09-10', '2026-09-16', '2026-09-22', '2026-09-28']),
  ...projectTasks('Customer Portal', ['employee4', 'employee1', 'employee5', 'employee2', 'employee4', 'employee3', 'employee5'], ['2026-07-02', '2026-07-06', '2026-07-10', '2026-07-14', '2026-07-18', '2026-07-22', '2026-07-26']),
];

export const DEMO_TIME_ENTRIES: DemoTimeEntry[] = [
  { project: 'Corporate Website', task: 'Set up project structure', startedAt: '2026-09-01T08:00:00.000Z', duration: 120 },
  { project: 'Corporate Website', task: 'Create database schema', startedAt: '2026-09-03T09:00:00.000Z', duration: 150 },
  { project: 'Corporate Website', task: 'Implement authentication', startedAt: '2026-09-08T10:00:00.000Z', duration: 90 },
  { project: 'Mobile Banking App', task: 'Set up project structure', startedAt: '2026-09-02T08:30:00.000Z', duration: 120 },
  { project: 'Mobile Banking App', task: 'Create database schema', startedAt: '2026-09-04T09:30:00.000Z', duration: 180 },
  { project: 'Mobile Banking App', task: 'Implement authentication', startedAt: '2026-09-09T10:30:00.000Z', duration: 75 },
  { project: 'E-commerce Platform', task: 'Set up project structure', startedAt: '2026-08-28T08:00:00.000Z', duration: 105 },
  { project: 'E-commerce Platform', task: 'Create database schema', startedAt: '2026-09-02T09:00:00.000Z', duration: 165 },
  { project: 'E-commerce Platform', task: 'Build dashboard UI', startedAt: '2026-09-11T10:00:00.000Z', duration: 120 },
  { project: 'Marketing Website', task: 'Set up project structure', startedAt: '2026-09-01T08:15:00.000Z', duration: 90 },
  { project: 'Marketing Website', task: 'Create database schema', startedAt: '2026-09-05T09:15:00.000Z', duration: 120 },
  { project: 'Marketing Website', task: 'Build dashboard UI', startedAt: '2026-09-13T10:15:00.000Z', duration: 135 },
  { project: 'Internal Dashboard', task: 'Set up project structure', startedAt: '2026-08-25T08:00:00.000Z', duration: 150 },
  { project: 'Internal Dashboard', task: 'Create database schema', startedAt: '2026-08-29T09:00:00.000Z', duration: 180 },
  { project: 'Internal Dashboard', task: 'Implement authentication', startedAt: '2026-09-04T10:00:00.000Z', duration: 60 },
  { project: 'Customer Portal', task: 'Set up project structure', startedAt: '2026-07-02T08:00:00.000Z', duration: 120 },
  { project: 'Customer Portal', task: 'Create database schema', startedAt: '2026-07-06T09:00:00.000Z', duration: 150 },
  { project: 'Customer Portal', task: 'Build dashboard UI', startedAt: '2026-07-14T10:00:00.000Z', duration: 105 },
];
