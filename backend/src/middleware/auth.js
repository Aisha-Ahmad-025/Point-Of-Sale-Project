const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { config } = require('../config/env');
const { COOKIE, csrfFor, signSession, setSessionCookie, clearSessionCookie } = require('../services/authService');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Verifies the HttpOnly session cookie, loads the user, enforces CSRF on unsafe methods, slides the session. */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) throw ApiError.unauthorized();
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch (e) { clearSessionCookie(res); throw ApiError.unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED'); }
    const now = Math.floor(Date.now() / 1000);
    if (now - payload.sat > config.sessionAbsoluteHours * 3600) { clearSessionCookie(res); throw ApiError.unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED'); }

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) { clearSessionCookie(res); throw ApiError.unauthorized('Session is no longer valid', 'SESSION_INVALID'); }

    const csrf = csrfFor(user._id, payload.sat);
    if (!SAFE.has(req.method)) {
      const header = req.get('x-csrf-token');
      if (!header || !safeEqual(header, csrf)) throw ApiError.forbidden('Missing or invalid CSRF token', 'CSRF_INVALID');
    }
    // Sliding session: refresh the cookie when less than half of the lifetime remains.
    if (payload.exp - now < (payload.exp - payload.iat) / 2) setSessionCookie(res, signSession(user, payload.sat));

    req.user = user;
    req.csrfToken = csrf;
    next();
  } catch (e) { next(e); }
}

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  return next();
};

module.exports = { authenticate, authorize, admin: authorize('admin'), anyRole: authorize('admin', 'cashier') };
