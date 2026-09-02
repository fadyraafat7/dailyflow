export default {
  routes: [
    {
      method: 'POST',
      path: '/tasks/from-url',
      handler: 'task.fromUrl',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/tasks/parse-url',
      handler: 'task.parseUrl',
      config: { auth: false },
    },
  ],
};
