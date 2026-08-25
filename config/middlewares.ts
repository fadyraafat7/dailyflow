import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      // Origins of the separate frontend during development.
      // Add your production frontend URL here before deploying.
      origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8080',
      ],
      // Allow all request headers so HTMX's request headers
      // (HX-Request, HX-Target, …) pass the CORS preflight.
      headers: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
