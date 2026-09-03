const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();
require("express-async-errors"); // lets thrown errors in async route handlers reach errorHandler

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const routes = require("./routes");
const { stripeWebhook } = require("./controllers/webhookController");
const { errorHandler, notFound } = require("./middlewares/errorHandler");

const app = express();
const frontendPath = path.resolve(__dirname, "../../frontend");

// ---------------------------------------------------------------------------
// Allowed origins
// CLIENT_URL may hold a single origin or a comma-separated list. We derive the
// ws:// + wss:// variants too so Socket.IO passes connect-src when the client
// is served from a different origin than the API.
// ---------------------------------------------------------------------------
const clientOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const websocketOrigins = clientOrigins.flatMap((o) => [
  o.replace(/^http:/, "ws:").replace(/^https:/, "wss:"),
]);

// In development we also allow the usual local dev servers so the static client
// works whether it is served by this process (:5000) or by Live Server (:5500).
const devOrigins =
  process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "ws://localhost:5000",
        "ws://127.0.0.1:5000",
        "ws://localhost:5500",
        "ws://127.0.0.1:5500",
      ];

const connectSrc = ["'self'", ...clientOrigins, ...websocketOrigins, ...devOrigins];

// Root healthcheck for cloud platforms (Render, Railway, Kubernetes)
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).send("OK"));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Scripts are all same-origin files under /js. In development we also
        // allow inline scripts so that the many HTML pages that use small
        // <script>...</script> init blocks work without CSP violations.
        // Production keeps the strict 'self'-only policy.
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://sdk.cashfree.com",
          "https://cdn.socket.io",
        ],
        // Inline style attributes are still used for a few dynamic values
        // (progress widths, popover positioning).
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.cashfree.com",
          "https://sdk.cashfree.com",
        ],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc: [
          ...connectSrc,
          "https://sandbox.cashfree.com",
          "https://api.cashfree.com",
          "https://*.cashfree.com",
        ],
        frameSrc: [
          "'self'",
          "https://sandbox.cashfree.com",
          "https://api.cashfree.com",
          "https://*.cashfree.com",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        // Only force HTTPS in production — otherwise it breaks plain-http
        // local development.
        ...(process.env.NODE_ENV === "production" ? {} : { upgradeInsecureRequests: null }),
      },
    },
    // Cloudinary-hosted attachments open in a new tab; COEP would block them.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: process.env.NODE_ENV === "production",
  })
);

app.use(
  cors({
    origin: clientOrigins.length ? clientOrigins : true,
    credentials: true,
  })
);

// Stripe webhook needs the raw body for signature verification — must be
// registered BEFORE express.json() parses the body.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ---------------------------------------------------------------------------
// Rate limiting
// Redis-backed when Redis is reachable, in-memory otherwise. Critically, a
// Redis outage must not hang or fail requests: ioredis is configured with an
// unbounded retry policy, so a naive sendCommand would queue forever. We check
// the connection status first and fall through to the memory store instead.
// ---------------------------------------------------------------------------
function buildRateLimiter(options) {
  const { prefix = "solveit:rl:api:", ...rest } = options;
  const base = {
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (req, res, _next, opts) => {
      return res.status(opts.statusCode).json({
        success: false,
        message:
          typeof opts.message === "string"
            ? opts.message
            : opts.message?.message || "Too many requests. Please try again later.",
      });
    },
    ...rest,
  };

  // Always available, and used whenever Redis is not usable.
  const memoryLimiter = rateLimit(base);

  let RedisStore;
  let redisClient;
  try {
    ({ RedisStore } = require("rate-limit-redis"));
    redisClient = require("./config/redis");
  } catch {
    return memoryLimiter; // rate-limit-redis / ioredis not installed
  }

  // The RedisStore constructor eagerly loads a Lua script, so building it while
  // Redis is unreachable produces an unhandled rejection and kills the process.
  // It is therefore constructed lazily, only once the connection is ready.
  let redisLimiter = null;
  let buildFailed = false;

  function getRedisLimiter() {
    if (redisLimiter || buildFailed) return redisLimiter;
    try {
      redisLimiter = rateLimit({
        ...base,
        store: new RedisStore({
          prefix,
          sendCommand: (...args) => redisClient.call(...args),
        }),
      });
    } catch (err) {
      buildFailed = true;
      redisLimiter = null;
    }
    return redisLimiter;
  }

  return function rateLimiterWithFallback(req, res, next) {
    const limiter = redisClient.status === "ready" ? getRedisLimiter() : null;
    if (!limiter) return memoryLimiter(req, res, next);
    // If the Redis round-trip fails mid-flight, fall back rather than 500.
    return limiter(req, res, (err) => (err ? memoryLimiter(req, res, next) : next()));
  };
}

// Global limit: generous backstop against abuse (increased by 20x).
app.use(
  "/api",
  buildRateLimiter({
    prefix: "solveit:rl:global:",
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || (process.env.NODE_ENV === "production" ? 6000 : 40000),
    message: "Too many requests. Please try again later.",
  })
);

// Auth endpoints limit (increased by 20x). Skips /auth/me.
// Successful requests are not counted against the brute-force budget.
app.use(
  "/api/auth",
  buildRateLimiter({
    prefix: "solveit:rl:auth:",
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_AUTH_MAX) || (process.env.NODE_ENV === "production" ? 1000 : 20000),
    skipSuccessfulRequests: true,
    skip: (req) => req.method === "GET",
    message: "Too many login attempts. Please try again in 15 minutes.",
  })
);

app.use("/api", routes);

// Serve the static client from the same origin when the backend is run alone.
app.use(
  express.static(frontendPath, {
    extensions: ["html"], // /login also resolves to /login.html
  })
);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
