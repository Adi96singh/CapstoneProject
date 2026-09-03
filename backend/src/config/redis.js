const path = require("path");
const Redis = require("ioredis");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on the connection it uses for
// blocking commands, and misbehaves if the offline queue is disabled. Both are
// left at BullMQ-friendly values here; callers that must not block (caching,
// rate limiting) check `redisClient.isReady()` before issuing a command, so an
// outage degrades gracefully instead of queueing commands forever.
const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 200, 5000), // back off, keep trying
  reconnectOnError: () => true,
});

// A Redis outage is expected to be survivable, so we log the first error and
// then stay quiet until the connection recovers — otherwise a down Redis fills
// the log with one line per retry.
let errorLogged = false;

redisClient.on("error", (err) => {
  if (!errorLogged) {
    errorLogged = true;
    console.error(
      `[redis] connection error: ${err.message} — caching and rate limiting will degrade gracefully`
    );
  }
});

redisClient.on("connect", () => {
  errorLogged = false;
  console.log("[redis] connected");
});

/** True when a command can be issued right now. */
redisClient.isReady = () => redisClient.status === "ready";

module.exports = redisClient;
