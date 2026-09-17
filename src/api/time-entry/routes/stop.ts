export default {
  routes: [
    {
      method: 'PUT',
      path: '/time-entries/:id/stop',
      handler: 'time-entry.stop',
    },
  ],
};
