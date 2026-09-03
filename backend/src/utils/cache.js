const redisClient = require("../config/redis");
const logger = require("../config/logger");

const PREFIX = "solveit";

function buildKey(...parts) {
  return [PREFIX, ...parts].join(":");
}

/**
 * The shared ioredis client is configured for BullMQ (unbounded retries +
 * offline queueing), which means a command issued while Redis is down would
 * wait indefinitely and hang the HTTP request. Cache reads/writes are optional
 * by definition, so we skip them entirely unless the connection is ready.
 */
function ready() {
  return redisClient.status === "ready";
}

async function getCache(key) {
  if (!ready()) return null;
  try {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn(`[cache] read miss for ${key}: ${err.message}`);
    return null;
  }
}

async function setCache(key, value, ttlSeconds) {
  if (!ready()) return;
  try {
    const raw = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.set(key, raw, "EX", ttlSeconds);
    } else {
      await redisClient.set(key, raw);
    }
  } catch (err) {
    logger.warn(`[cache] write failed for ${key}: ${err.message}`);
  }
}

async function delCache(keyOrPattern) {
  if (!ready()) return;
  try {
    if (keyOrPattern.includes("*")) {
      // SCAN rather than KEYS: KEYS blocks the Redis event loop on large
      // keyspaces, and this runs on every admin write.
      const found = [];
      let cursor = "0";
      do {
        const [next, batch] = await redisClient.scan(cursor, "MATCH", keyOrPattern, "COUNT", 200);
        cursor = next;
        found.push(...batch);
      } while (cursor !== "0");
      if (found.length) await redisClient.del(found);
    } else {
      await redisClient.del(keyOrPattern);
    }
  } catch (err) {
    logger.warn(`[cache] invalidate failed for ${keyOrPattern}: ${err.message}`);
  }
}

/**
 * Cache-aside wrapper: returns the cached value if present, otherwise calls
 * `loader`, caches the result for `ttlSeconds`, and returns it. Never lets a
 * Redis outage break the request — falls through to `loader` on any error.
 */
async function cacheWrap(key, ttlSeconds, loader) {
  const cached = await getCache(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await setCache(key, fresh, ttlSeconds);
  return fresh;
}

module.exports = { buildKey, getCache, setCache, delCache, cacheWrap };
