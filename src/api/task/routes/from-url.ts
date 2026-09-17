export default {
  routes: [
    {
      method: 'POST',
      path: '/tasks/from-url',
      handler: 'task.fromUrl',
    },
    {
      method: 'POST',
      path: '/tasks/parse-url',
      handler: 'task.parseUrl',
    },
  ],
};
