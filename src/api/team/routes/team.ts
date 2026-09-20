export default {
  routes: [
    { method: 'GET', path: '/team/modal', handler: 'team.modal' },
    { method: 'GET', path: '/team/members', handler: 'team.listMembers' },
    { method: 'POST', path: '/team/members', handler: 'team.createMember' },
    { method: 'POST', path: '/team/members/:id/reset-password', handler: 'team.resetPassword' },
  ],
};
