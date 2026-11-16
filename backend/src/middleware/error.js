const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');
const { config } = require('../config/env');

const notFound = (req, res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof ApiError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400; code = 'INVALID_ID'; message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409; code = 'DUPLICATE';
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    message = `A record with this ${field} already exists`;
    details = [{ path: field, message }];
  } else if (err.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body too large';
  }

  if (status >= 500 && !config.isTest) {
    // Log server-side only. Never send stack traces to clients.
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { notFound, errorHandler };
