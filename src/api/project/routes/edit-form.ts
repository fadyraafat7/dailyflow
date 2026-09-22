export default {
  routes: [
    {
      method: 'GET',
      path: '/projects/create-form',
      handler: 'project.createForm',
      config: {
        auth: { scope: ['api::project.project.find'] },
      },
    },
    {
      method: 'GET',
      path: '/projects/group-checkboxes',
      handler: 'project.groupCheckboxes',
      config: {
        auth: { scope: ['api::project.project.find'] },
      },
    },
    {
      method: 'GET',
      path: '/projects/:id/edit-form',
      handler: 'project.editForm',
    },
  ],
};
