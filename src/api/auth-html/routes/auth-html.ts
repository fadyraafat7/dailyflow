export default {
  routes: [
    {
      method: 'POST',
      path: '/auth-html/login',
      handler: 'auth-html.login',
      config: { auth: false },
    },
    { method: 'GET', path: '/auth-html/session', handler: 'auth-html.session' },
    { method: 'POST', path: '/auth-html/change-password', handler: 'auth-html.changePassword' },
  ],
};
