const path = require("path");
const fs = require("fs");
const logger = require("../config/logger");
const { ApiError, failure } = require("../utils/response");

const frontendPath = path.resolve(__dirname, "../../../frontend");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Never try to write a second time if the response already started.
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return failure(res, err.statusCode, err.message, err.details);
  }

  // Sequelize validation / constraint errors
  if (err.name === "SequelizeValidationError" || err.name === "SequelizeUniqueConstraintError") {
    const details = err.errors?.map((e) => ({ field: e.path, message: e.message }));
    return failure(res, 400, "Validation failed", details);
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return failure(res, 400, "Referenced record does not exist");
  }

  // Database is unreachable / dropped mid-request
  if (
    err.name === "SequelizeConnectionError" ||
    err.name === "SequelizeConnectionRefusedError" ||
    err.name === "SequelizeHostNotFoundError" ||
    err.name === "SequelizeAccessDeniedError"
  ) {
    logger.error(`Database unavailable: ${err.message}`);
    return failure(res, 503, "The database is temporarily unavailable. Please try again shortly.");
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return failure(res, 401, "Invalid or expired token");
  }

  // Multer upload errors
  if (err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File is too large (5 MB maximum)"
        : err.code === "LIMIT_UNEXPECTED_FILE"
        ? "Unexpected file field — use the 'image' field"
        : `Upload failed: ${err.message}`;
    return failure(res, 400, message);
  }

  // Malformed JSON body
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return failure(res, 400, "Request body is not valid JSON");
  }

  if (err.type === "entity.too.large") {
    return failure(res, 413, "Request body is too large");
  }

  logger.error(err.stack || err.message);
  return failure(res, 500, "Internal server error");
}

function notFound(req, res) {
  // API clients always get JSON.
  const isApi = req.path.startsWith("/api") || req.get("accept")?.includes("application/json");
  if (isApi) {
    return failure(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
  }

  // Browsers navigating to a bad URL get the styled 404 page when it exists.
  const notFoundPage = path.join(frontendPath, "404.html");
  if (req.method === "GET" && fs.existsSync(notFoundPage)) {
    return res.status(404).sendFile(notFoundPage);
  }

  return failure(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

module.exports = { errorHandler, notFound };
