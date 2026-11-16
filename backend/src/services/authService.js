const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { config } = require('../config/env');

const COOKIE = 'ss_token';
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Pre-computed hash used to equalise timing for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const hashPassword = (pw) => bcrypt.hash(pw, 12);

/** CSRF token bound to the session (HMAC of user id + session start). Sent as X-CSRF-Token. */
const csrfFor = (userId, sat) => crypto.createHmac('sha256', config.cookieSecret).update(`${userId}.${sat}`).digest('hex');

function signSession(user, sat = Math.floor(Date.now() / 1000)) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion, sat }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function cookieOptions() {
  return { httpOnly: true, secure: config.isProd, sameSite: config.cookieSameSite, path: '/' };
}
const setSessionCookie = (res, token) => res.cookie(COOKIE, token, cookieOptions());
const clearSessionCookie = (res) => res.clearCookie(COOKIE, cookieOptions());

async function login(email, password) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(423, 'Account temporarily locked. Try again later.', 'ACCOUNT_LOCKED');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILS) { user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000); user.failedLogins = 0; }
    await user.save();
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated', 'ACCOUNT_DISABLED');
  user.failedLogins = 0; user.lockedUntil = undefined; user.lastLoginAt = new Date();
  await user.save();
  const sat = Math.floor(Date.now() / 1000);
  return { user, token: signSession(user, sat), csrfToken: csrfFor(user._id, sat) };
}

module.exports = { COOKIE, hashPassword, signSession, csrfFor, setSessionCookie, clearSessionCookie, login };
