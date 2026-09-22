export default {
  routes: [
    {
      method: 'PUT',
      path: '/time-entries/:id/stop',
      handler: 'time-entry.stop',
    },
    {
      method: 'GET',
      path: '/time-entries/by-task/:taskDocId',
      handler: 'time-entry.byTask',
    },
  ],
};
