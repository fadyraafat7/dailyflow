type StrapiLike = any;

export type SeedCounts = {
  users: number;
  groups: number;
  projects: number;
  tasks: number;
  timeEntries: number;
};

export const emptyCounts = (): SeedCounts => ({ users: 0, groups: 0, projects: 0, tasks: 0, timeEntries: 0 });

export async function findOneBy(strapi: StrapiLike, uid: string, where: Record<string, unknown>) {
  return strapi.db.query(uid).findOne({ where });
}

export async function connectMissingRelations(
  strapi: StrapiLike,
  uid: string,
  documentId: string,
  relation: string,
  currentIds: number[],
  desiredIds: number[],
) {
  const connect = desiredIds.filter((id) => !currentIds.includes(id));
  if (!connect.length) return;

  await strapi.documents(uid).update({
    documentId,
    status: 'published',
    data: { [relation]: { connect } },
  });
}

export function printSummary(counts: SeedCounts, owner: { email: string; password?: string }) {
  console.log('\n=================================');
  console.log('DailyFlow Demo Data — DEVELOPMENT ONLY');
  console.log('=================================\n');
  console.log('Users:');
  console.log('  Owner:       1');
  console.log('  Team Leads:  2');
  console.log('  Employees:   6\n');
  console.log(`Groups:        ${counts.groups}`);
  console.log(`Projects:      ${counts.projects}`);
  console.log(`Tasks:         ${counts.tasks}`);
  console.log(`Time Entries:  ${counts.timeEntries}`);
  console.log('\n=================================\n');
  console.log('Demo login (DEVELOPMENT ONLY):\n');
  console.log('Owner');
  console.log(`Email: ${owner.email}`);
  console.log(owner.password ? `Password: ${owner.password}\n` : 'Password: configured outside the seed (existing bootstrap Owner)\n');
  console.log('Team Lead');
  console.log('Email: lead1@dailyflow.local');
  console.log('Password: Lead123!\n');
  console.log('Employee');
  console.log('Email: employee1@dailyflow.local');
  console.log('Password: Employee123!');
}
