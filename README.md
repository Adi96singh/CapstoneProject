# SolveIt — Smart Complaint & Resolution Platform

A backend-focused, AI-augmented, real-time complaint management system for colleges, hostels, offices, and communities.

## Status — all 17 phases built

- ✅ Phase 1 — Project scaffold (backend + frontend folders, Docker Compose, config)
- ✅ Phase 2 — All 15 Sequelize models + one consolidated initial migration
- ✅ Phase 3 — Authentication (register, login, logout, forgot/reset password, JWT middleware, RBAC)
- ✅ Phase 4 — Complaint CRUD + full lifecycle state machine
- ✅ Phase 5 — Staff assignment (auto-assign by department + lowest active workload)
- ✅ Phase 6 — SLA deadline calculation (per category+priority `SlaRule`, with fallbacks)
- ✅ Phase 7 — Redis caching (categories, departments, SLA rules, staff workload, analytics — cache-aside via `utils/cache.js`)
- ✅ Phase 8 — Security hardening (Helmet + CSP, CORS, Redis-backed rate limiting, `express-validator` on every mutating route, audit logging, upload allowlist/size caps)
- ✅ Phase 9 — Real-time (Socket.IO, JWT handshake auth, per-user/per-role rooms)
- ✅ Phase 10 — Admin analytics (status/priority/category breakdown, avg resolution time, SLA breach rate, daily trend — cached 5 min)
- ✅ Phase 11 — File upload (Multer → Cloudinary, UUID filenames, `fileProcessingQueue`)
- ✅ Phase 12 — AI integration (all 6 Gemini features)
- ✅ Phase 6/8 — Background infra (5 BullMQ queues, 5 workers, node-cron SLA scan every 15 min)
- ✅ Phase 13–14 — Payments (Stripe Checkout stub, webhook), notifications, comments (with internal notes), admin CRUD for departments/categories/SLA rules/users
- ✅ Phase 15 — Frontend (20 static HTML pages, plain JS, no framework/build step)
- ✅ Phase 16 — Tests (Jest, pure-logic unit tests — no live DB/Redis required to run)
- ✅ Phase 17 — This README

## Stack

- **Backend:** Node.js, Express, Sequelize (MySQL), Redis, BullMQ, Socket.IO
- **AI:** Google Gemini API (REST, via native `fetch` — no SDK dependency)
- **Payments:** Stripe (test mode, premium complaints only)
- **Storage:** Cloudinary
- **Email:** Nodemailer (Mailtrap for dev)
- **Frontend:** Plain HTML/CSS/JS (no framework, no build step)

## Local Setup

### 1. Prerequisites
- Node.js 18+ (native `fetch` and `crypto.randomUUID` are used)
- Docker (for MySQL + Redis) — or your own local instances

### 2. Environment
```bash
cp .env.example backend/.env
# fill in DB, Redis, Gemini, Cloudinary, Stripe, SMTP values
```
Every AI/payment/storage/email feature degrades gracefully if its key is missing:
- No `GEMINI_API_KEY` → AI features return `{ aiAvailable: false }` instead of failing the request.
- No `STRIPE_SECRET_KEY` → the checkout endpoint returns a 503 instead of crashing.
- No `CLOUDINARY_CLOUD_NAME` → image upload returns a 503.
- No `SMTP_USER` → the email worker logs instead of sending.

This means you can run the **whole app, including AI-assisted complaint creation, without any external API keys** — you just won't see AI classification or emails actually go out.

### 3. Start infrastructure
```bash
docker-compose up -d
```

### 4. Install, migrate, seed
```bash
cd backend
npm install
npm run migrate
npm run seed
```
The seeder creates:

| Role | Email | Password |
|---|---|---|
| admin | admin@solveit.app | Admin@123 |
| staff (Facilities) | staff.facilities@solveit.app | Staff@123 |
| staff (IT) | staff.it@solveit.app | Staff@123 |
| user | user@solveit.app | User@123 |

plus 2 departments, 4 categories, 4 default SLA rules, and one demo complaint.

### 5. Run the API + background workers
In separate terminals:
```bash
npm run dev      # Express API on :5000, Socket.IO, and the 15-min SLA cron
npm run worker   # BullMQ workers: email, notification, ai, escalation, fileProcessing
```
`GET /api/health` is a liveness check.

### 6. Run the frontend
The frontend is static — no build step. The backend now serves it from the same origin, so you can open:
```text
http://localhost:5000
```

Alternatively, serve the `frontend` folder with VS Code Live Server on port `5500` and open:
```bash
cd frontend
npx serve -l 5500
```
Then open `http://localhost:5500`. Keep `CLIENT_URL=http://localhost:5500` in `backend/.env` for the separate-server setup. The frontend automatically uses `http://localhost:5000/api` for local development.

### 7. Tests
```bash
cd backend
npm test
```
25 tests covering the state machine, role-transition policy, workload-based assignment ranking, SLA hour fallback logic, escalation priority bumping, and cache key building — all pure logic, no live DB/Redis required. Full Supertest integration coverage against a real test DB is a natural next step but out of scope here.

## API Reference

All routes are under `/api`. Authenticated routes require `Authorization: Bearer <token>`.

### Auth
| Method | Route | Notes |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password, role? }` (`role` defaults to `user`) |
| POST | `/auth/login` | Returns `{ user, token }` |
| POST | `/auth/logout` | Client-side token discard |
| POST | `/auth/forgot-password` | Queues a reset email |
| POST | `/auth/reset-password` | `{ token, newPassword }` |
| GET | `/auth/me` | Current user |

### Complaints
| Method | Route | Notes |
|---|---|---|
| POST | `/complaints` | Send `X-Idempotency-Key` header (or `idempotencyKey` in body) to make retries safe. Queues AI classification → duplicate detection in the background. |
| GET | `/complaints` | Auto-scoped by role. `?status=&priority=&categoryId=&search=&page=&limit=`, plus `?userId=&staffId=` for admins |
| GET | `/complaints/:id` | Includes author, staff, category, images, comments, status history, assignments |
| PATCH | `/complaints/:id` | Author-only while `OPEN` (admin anytime) |
| PATCH | `/complaints/:id/status` | `{ toStatus, reason?, staffId? }`, enforced by the state machine + per-role transition table. Triggers Socket.IO events, notifications, and email. |
| GET | `/complaints/:id/comments` | Internal notes hidden from non-staff/admin |
| POST | `/complaints/:id/comments` | `{ content, isInternal? }`. Queues sentiment analysis. |
| POST | `/complaints/:id/images` | Multipart, field name `image`. JPEG/PNG/PDF, 5MB max. |
| DELETE | `/complaints/:id/images/:imageId` | Author or admin only |
| GET | `/complaints/:id/ai/summary` | On-demand thread summary |
| GET | `/complaints/:id/ai/suggested-resolution` | On-demand troubleshooting steps |
| POST | `/complaints/:id/ai/quality-check` | `{ resolutionNote }` → sufficiency/quality feedback |
| POST | `/complaints/:id/checkout` | Creates a Stripe Checkout session for the $199 priority upgrade |

### Categories (read-only, any authenticated user)
| Method | Route |
|---|---|
| GET | `/categories` |

### Notifications
| Method | Route |
|---|---|
| GET | `/notifications?unreadOnly=&page=&limit=` |
| PATCH | `/notifications/:id/read` |
| PATCH | `/notifications/read-all` |

### Admin (admin role only)
| Method | Route |
|---|---|
| GET/POST/PATCH/DELETE | `/admin/departments[/:id]` |
| GET/POST/PATCH/DELETE | `/admin/categories[/:id]` |
| GET/POST/PATCH/DELETE | `/admin/sla-rules[/:id]` |
| GET | `/admin/users` · PATCH `/admin/users/:id` (role, department, active) |
| GET | `/admin/staff-workload` |
| GET | `/admin/analytics?period=7d\|30d\|90d` |
| GET | `/admin/audit-logs?page=&limit=&entityType=&action=&userId=` |
| GET | `/admin/escalations` |

### Webhooks
| Method | Route |
|---|---|
| POST | `/webhooks/stripe` | Verifies `stripe-signature` if `STRIPE_WEBHOOK_SECRET` is set |

## Architecture notes

**Lifecycle state machine:**
```
OPEN → ASSIGNED → IN_PROGRESS → WAITING_FOR_USER
                             → RESOLVED → CLOSED
                             → RESOLVED → REOPENED → IN_PROGRESS
OPEN/ASSIGNED/IN_PROGRESS → ESCALATED
OPEN → REJECTED
```

**Assignment algorithm** (`assignmentService.js`): prefers active staff in the department tied to the complaint's category, falls back to any active staff if that department has none, then breaks ties by picking whoever currently has the fewest complaints in `ASSIGNED`/`IN_PROGRESS`/`WAITING_FOR_USER`.

**SLA calculation** (`slaService.js`): looks up a category+priority-specific `SlaRule` first, falls back to a category-less rule for that priority, then falls back to hardcoded defaults (`CRITICAL`: 8h, `HIGH`: 24h, `MEDIUM`: 72h, `LOW`: 168h).

**Escalation** (`escalationService.js` + `cron.js` + `escalationWorker.js`): every 15 minutes, a cron job scans for non-terminal complaints past `slaDeadline` and enqueues one `escalationQueue` job per breach. The worker bumps status to `ESCALATED`, raises priority one level, records an `Escalation` row + status history entry, and notifies the author, assigned staff, and all admins (in-app + email).

**AI features** (`ai/geminiService.js` + `services/aiService.js`):
1. **Classification** — fills in category/priority the user left unset (never downgrades what they chose). Queued, runs after complaint creation.
2. **Duplicate detection** — compares against recent same-category complaints; posts an internal AI note + notifies admins if it looks like a duplicate. Chained after classification.
3. **Summarization** — on-demand, staff-triggered, synchronous (a queue would add latency to something the user is actively waiting on).
4. **Suggested resolution** — on-demand, synchronous.
5. **Comment sentiment/urgency** — queued after every comment; internal triage signal only, never punitive, never surfaced to the comment's author.
6. **Resolution quality check** — on-demand, synchronous, called before a staff member marks something resolved.

Every Gemini call is wrapped so a missing key or a failed request degrades to `null`/`{ aiAvailable: false }` rather than breaking the complaint workflow — see `ai/geminiService.js`'s `generateJSON`.

**Redis caching** (`utils/cache.js`): cache-aside (`cacheWrap`) with namespaced keys (`solveit:categories`, `solveit:analytics:7d`, etc). TTLs: categories/departments/SLA rules 10 min, staff workload 2 min, analytics 5 min. All cache reads/writes are wrapped so a Redis outage falls through to the DB instead of failing the request.

**Security**: Helmet with an explicit CSP, CORS allowlist via `CLIENT_URL`, Redis-backed rate limiting (300 req/15min globally, 20 req/15min on `/auth`), `express-validator` on every mutating route, Sequelize parameterized queries throughout, file uploads restricted to JPEG/PNG/PDF at 5MB with UUID-generated filenames (never trusting the original name), and an audit log (`utils/audit.js`) recording every admin create/update/delete with old/new values and IP.

**Real-time** (`sockets/index.js`): JWT passed as the Socket.IO handshake `auth.token`. Each socket joins `user:<id>` and `role:<role>` rooms. Emits: `complaint:assigned`, `complaint:status_changed`, `complaint:comment_added`, `complaint:escalated`, `notification:new`.

## Project Structure

```
solveit/
├── docker-compose.yml     MySQL + Redis
├── .env.example
├── backend/
│   ├── tests/               5 test files, pure-logic unit tests
│   └── src/
│       ├── config/          db, redis, cloudinary, mailer, stripe, logger, config
│       ├── models/          15 Sequelize models + associations (models/index.js)
│       ├── migrations/      initial schema
│       ├── seeders/         demo departments/categories/SLA rules/users/complaint
│       ├── ai/               geminiService.js — all 6 AI features
│       ├── controllers/     auth, complaint, complaintComment, complaintImage, ai,
│       │                    payment, webhook, admin, category, notification
│       ├── services/        authService, complaintService, complaintCommentService,
│       │                    complaintImageService, assignmentService, slaService,
│       │                    escalationService, aiService, departmentService,
│       │                    categoryService, slaRuleService, userService,
│       │                    notificationService, analyticsService, auditService,
│       │                    paymentService
│       ├── routes/          authRoutes, complaintRoutes, adminRoutes,
│       │                    categoryRoutes, notificationRoutes, route index
│       ├── middlewares/     auth, authorize, errorHandler, upload
│       ├── sockets/          Socket.IO setup + emit helpers
│       ├── jobs/             queues.js (BullMQ queue defs), cron.js (SLA scan)
│       ├── workers/          email, notification, ai, escalation, fileProcessing + index.js
│       ├── templates/        inline HTML email templates
│       └── utils/            response, token, validators, idempotency, cache, audit
└── frontend/
    ├── css/                  main.css (tokens), components.css, pages.css
    ├── js/                   api.js, auth.js, socket.js, complaints.js, dashboard.js,
    │                         notifications.js, admin.js
    ├── index.html, login.html, register.html, forgot-password.html, reset-password.html
    ├── dashboard/             user.html, staff.html, admin.html
    ├── complaints/            create.html, detail.html, list.html
    └── admin/                 analytics.html, users.html, staff.html, categories.html,
                               departments.html, sla-rules.html, escalations.html,
                               audit-logs.html
```

## Known limitations / next steps

- Integration tests (Supertest against a real/in-memory DB) aren't included — the test suite covers pure business logic only.
- The admin category/department pickers on the frontend take raw UUIDs typed into a text box rather than a searchable dropdown — fine for a demo, worth upgrading for real use.
- Stripe webhook signature verification is skipped if `STRIPE_WEBHOOK_SECRET` isn't set (falls back to parsing the raw body) — set it in any environment that isn't purely local demo.
- JWT secret rotation is not implemented beyond a single `JWT_SECRET`; for true rotation, extend `middlewares/auth.js` to try a list of secrets.
