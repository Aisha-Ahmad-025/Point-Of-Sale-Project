class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
  static badRequest(msg, code = 'BAD_REQUEST', details) { return new ApiError(400, msg, code, details); }
  static unauthorized(msg = 'Authentication required', code = 'UNAUTHORIZED') { return new ApiError(401, msg, code); }
  static forbidden(msg = 'You do not have permission to do this', code = 'FORBIDDEN') { return new ApiError(403, msg, code); }
  static notFound(msg = 'Resource not found', code = 'NOT_FOUND') { return new ApiError(404, msg, code); }
  static conflict(msg, code = 'CONFLICT', details) { return new ApiError(409, msg, code, details); }
}
module.exports = ApiError;
