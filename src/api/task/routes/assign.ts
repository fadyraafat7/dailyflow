export default {
  routes: [
    {
      method: 'GET',
      path: '/tasks/assignable-users',
      handler: 'task.assignableUsers',
      config: { auth: { scope: ['api::task.task.find'] } },
    },
  ],
};
