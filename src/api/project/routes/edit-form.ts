export default {
  routes: [
    {
      method: 'GET',
      path: '/projects/:id/edit-form',
      handler: 'project.editForm',
    },
  ],
};
