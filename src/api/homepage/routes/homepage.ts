export default {
  routes: [
    { method: 'GET', path: '/homepage', handler: 'homepage.find' },
    { method: 'GET', path: '/homepage/sidebar', handler: 'homepage.sidebar' },
  ],
};
