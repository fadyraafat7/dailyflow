export default {
  routes: [
    { method: 'GET', path: '/groups/modal', handler: 'group.modal' },
    { method: 'GET', path: '/groups/list', handler: 'group.list' },
    { method: 'GET', path: '/groups/:documentId/edit-form', handler: 'group.editForm' },
    { method: 'POST', path: '/groups', handler: 'group.create' },
    { method: 'PUT', path: '/groups/:documentId', handler: 'group.update' },
    { method: 'DELETE', path: '/groups/:documentId', handler: 'group.remove' },
  ],
};
