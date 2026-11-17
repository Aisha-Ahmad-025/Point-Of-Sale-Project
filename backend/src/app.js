// const express = require('express');
// const helmet = require('helmet');
// const cors = require('cors');
// const cookieParser = require('cookie-parser');
// const morgan = require('morgan');
// const { config } = require('./config/env');
// const routes = require('./routes');
// const { notFound, errorHandler } = require('./middleware/error');
// const { apiLimiter } = require('./middleware/rateLimit');

// function createApp() {
//   const app = express();
//   if (config.isProd) app.set('trust proxy', 1);
//   app.disable('x-powered-by');
//   app.use(helmet());
//   app.use(cors({
//     origin(origin, cb) {
//       if (!origin || config.clientUrls.includes(origin)) return cb(null, true); // no Origin = same-origin / curl / server-to-server
//       return cb(null, false);
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
//     allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
//   }));
//   app.use(express.json({ limit: '200kb' }));
//   app.use(cookieParser(config.cookieSecret));
//   if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));
//   app.use('/api/v1', apiLimiter, routes);
//   app.use(notFound);
//   app.use(errorHandler);
//   return app;
// }
// module.exports = { createApp };


const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { config } = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const { apiLimiter } = require('./middleware/rateLimit');

function createApp() {
  const app = express();

  // Trust one proxy hop when running behind Netlify.
  // TRUST_PROXY=1 enables this for local Netlify Dev as well.
  if (config.isProd || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  app.use(helmet());

  app.use(cors({
    origin(origin, cb) {
      if (!origin || config.clientUrls.includes(origin)) {
        return cb(null, true);
      }

      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  }));

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser(config.cookieSecret));

  if (!config.isTest) {
    app.use(morgan(config.isProd ? 'combined' : 'dev'));
  }

  app.use('/api/v1', apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
