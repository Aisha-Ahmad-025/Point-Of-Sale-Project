// const rateLimit = require('express-rate-limit');
// const { config } = require('../config/env');

// const skip = () => config.isTest && !process.env.TEST_RATE_LIMIT;
// const handler = (code, message) => (req, res) => res.status(429).json({ success: false, error: { code, message } });

// const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip, handler: handler('RATE_LIMITED', 'Too many requests, slow down.') });
// const loginLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skip,
//   handler: handler('LOGIN_RATE_LIMITED', 'Too many login attempts. Try again in 15 minutes.'),
// });
// module.exports = { apiLimiter, loginLimiter };

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { config } = require('../config/env');

const skip = () => config.isTest && !process.env.TEST_RATE_LIMIT;

const handler = (code, message) => (req, res) =>
  res.status(429).json({
    success: false,
    error: { code, message },
  });

// Identify the visitor using trusted request information.
const getClientIp = (req) => {
  const candidates = [
    req.ip,
    req.headers['x-nf-client-connection-ip'],
    req.socket?.remoteAddress,
  ];

  const ip = candidates.find(
    (value) => typeof value === 'string' && value.trim()
  );

  // Local Netlify development fallback only.
  if (!ip && !config.isProd) {
    return 'netlify-local';
  }

  if (!ip) {
    throw new Error('Unable to determine client IP for rate limiting.');
  }

  return ip.trim();
};

// Normalize IPv6 addresses to prevent rate-limit bypass.
const keyGenerator = (req) => ipKeyGenerator(getClientIp(req), 56);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator,
  handler: handler('RATE_LIMITED', 'Too many requests, slow down.'),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator,
  handler: handler(
    'LOGIN_RATE_LIMITED',
    'Too many login attempts. Try again in 15 minutes.'
  ),
});

module.exports = { apiLimiter, loginLimiter };
