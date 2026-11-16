const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');

const skip = () => config.isTest && !process.env.TEST_RATE_LIMIT;
const handler = (code, message) => (req, res) => res.status(429).json({ success: false, error: { code, message } });

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, skip, handler: handler('RATE_LIMITED', 'Too many requests, slow down.') });
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skip,
  handler: handler('LOGIN_RATE_LIMITED', 'Too many login attempts. Try again in 15 minutes.'),
});
module.exports = { apiLimiter, loginLimiter };
