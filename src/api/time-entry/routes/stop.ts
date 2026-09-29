export default {
  routes: [
    {
      method: 'PUT',
      path: '/time-entries/:id/stop',
      handler: 'time-entry.stop',
      config: { auth: { scope: ['api::time-entry.time-entry.update'] } },
    },
    {
      method: 'GET',
      path: '/time-entries/by-task/:taskDocId',
      handler: 'time-entry.byTask',
      config: { auth: { scope: ['api::time-entry.time-entry.find'] } },
    },
  ],
};
