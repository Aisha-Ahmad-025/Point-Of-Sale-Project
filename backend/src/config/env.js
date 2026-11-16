require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/swiftshelf_pos',
  jwtSecret: process.env.JWT_ACCESS_SECRET || (isTest ? 'test_jwt_secret_test_jwt_secret_1234' : ''),
  jwtExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  cookieSecret: process.env.COOKIE_SECRET || (isTest ? 'test_cookie_secret_test_cookie_1234' : ''),
  sessionAbsoluteHours: Number(process.env.SESSION_ABSOLUTE_HOURS) || 12,
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  currency: process.env.CURRENCY_CODE || 'PKR',
  timezone: process.env.STORE_TIMEZONE || 'Asia/Karachi',
  useTransactions: (process.env.USE_TRANSACTIONS || 'auto').toLowerCase(),
};

function validateConfig() {
  const problems = [];
  const weak = (v) => !v || v.length < 32 || v.startsWith('replace_with');
  if (weak(config.jwtSecret)) problems.push('JWT_ACCESS_SECRET must be set to a random string of at least 32 characters.');
  if (weak(config.cookieSecret)) problems.push('COOKIE_SECRET must be set to a random string of at least 32 characters.');
  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) problems.push('COOKIE_SAMESITE must be lax, strict or none.');
  if (config.cookieSameSite === 'none' && !isProd) problems.push('COOKIE_SAMESITE=none requires HTTPS (NODE_ENV=production).');
  if (problems.length) {
    const err = new Error(`Invalid configuration:\n - ${problems.join('\n - ')}\nSee backend/.env.example and the README.`);
    err.code = 'CONFIG_INVALID';
    throw err;
  }
}

module.exports = { config, validateConfig };
