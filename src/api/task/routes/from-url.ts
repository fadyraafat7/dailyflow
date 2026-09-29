export default {
  routes: [
    {
      method: 'POST',
      path: '/tasks/from-url',
      handler: 'task.fromUrl',
      config: { auth: { scope: ['api::task.task.create'] } },
    },
    {
      method: 'POST',
      path: '/tasks/parse-url',
      handler: 'task.parseUrl',
      config: { auth: { scope: ['api::task.task.find'] } },
    },
  ],
};
