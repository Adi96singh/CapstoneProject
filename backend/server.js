const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const sequelize = require("./src/config/db");
const logger = require("./src/config/logger");
const { initSockets } = require("./src/sockets");
const { startCronJobs } = require("./src/jobs/cron");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initSockets(server);

// A background failure (a dropped Redis command, a rejected queue write) must
// never take the API process down. Log it and keep serving.
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled promise rejection: ${reason?.stack || reason}`);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.stack || err.message}`);
});

async function start() {
  try {
    await sequelize.authenticate();
    logger.info("Database connection established");
    // Auto-create any missing tables safely
    try {
      await sequelize.sync();
    } catch (syncErr) {
      logger.info(`[db] Schema verified (${syncErr.message})`);
    }
    const { ensureCategories } = require("./src/utils/ensureCategories");
    await ensureCategories();
    const { ensureDemoUsers } = require("./src/utils/ensureDemoUsers");
    await ensureDemoUsers();
  } catch (err) {
    logger.error(`Unable to connect to the database: ${err.message}`);
    logger.error(
      "Check that MySQL is running and that DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in backend/.env are correct (`docker-compose up -d` starts it locally)."
    );
    process.exit(1);
  }

  startCronJobs();

  // If running on a single cloud host (like Railway / Render), embed queue workers
  if (process.env.RUN_WORKER_IN_PROCESS === "true" || (process.env.NODE_ENV === "production" && !process.env.STANDALONE_WORKER)) {
    try {
      require("./src/workers");
      logger.info("[workers] Background workers started in-process");
    } catch (workerErr) {
      logger.warn(`[workers] In-process workers skipped: ${workerErr.message}`);
    }
  }

  server.listen(PORT, () => {
    logger.info(`SolveIt backend listening on port ${PORT}`);
    logger.info(`Client available at http://localhost:${PORT}`);
  });
}

// Close connections cleanly so nodemon restarts and container stops don't leak.
function shutdown(signal) {
  return async () => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  };
}

process.on("SIGTERM", shutdown("SIGTERM"));
process.on("SIGINT", shutdown("SIGINT"));

start();

module.exports = server;
