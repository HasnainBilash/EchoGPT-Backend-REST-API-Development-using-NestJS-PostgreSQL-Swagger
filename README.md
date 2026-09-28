# EchoGPT Backend REST API

Backend for the [EchoGPT – Multi AI Chat](https://chromewebstore.google.com/detail/echogpt-multi-ai-chat-sid/negimdcamohmoheiifgecbjgjepkcfhj) Chrome extension, built with **NestJS**, **PostgreSQL**, **Prisma** and **Swagger (OpenAPI)**.

> Build progress, design decisions and per-phase test guides: see [PROGRESS.md](PROGRESS.md).

## Highlights

- **54 documented endpoints** across auth, users, subscriptions, AI providers, chat, web search and an admin panel, all explorable in Swagger UI.
- **Real multi-provider AI**: OpenAI, Anthropic (Claude) and Google Gemini behind one adapter interface, with API keys encrypted at rest (AES-256-GCM).
- **Secure by default**: every route requires a JWT unless marked public, role checks for admin routes, rotating refresh tokens with reuse detection, bcrypt passwords, input whitelisting, rate limiting and security headers.
- **Plan-based usage limits**: daily chat and search quotas read from the database, with a remaining-requests API.
- **Observability**: every request is logged and powers the admin analytics, request logs and system health.
- **All bonus features**: email verification, streaming AI responses (Server-Sent Events) and search result caching.
- **Demo without API keys**: a bundled OpenAI-compatible mock server (`npm run mock:ai`), including streaming.

## Assignment checklist

| Requirement | Where |
| --- | --- |
| Registration, login, secure logout, JWT, refresh tokens, password hashing | [Authentication](#authentication) — `src/auth` |
| Profile, update profile, change password, delete account, roles | [Users](#users), [Admin panel](#admin-panel) — `src/users` |
| Free & Premium plans, status, upgrade/downgrade, usage limits, remaining requests | [Subscriptions](#subscriptions--usage-limits) — `src/subscriptions` |
| Add / edit / delete / enable / disable providers, secure keys, default, health check | [AI providers](#ai-providers) — `src/providers` |
| Send prompt, AI response, provider selection, conversation history | [Chat](#chat) — `src/chat` |
| Search query, history, recent searches, suggestions | [Web search](#web-search) — `src/search` |
| Dashboard, user/subscription/provider management, usage analytics, request logs, system health | [Admin panel](#admin-panel) — `src/admin` |
| Swagger for every endpoint (params, bodies, examples, errors, auth) | `/docs`, [docs/openapi.json](docs/openapi.json) |
| Normalized PostgreSQL schema + migrations | [prisma/schema.prisma](prisma/schema.prisma), [prisma/migrations](prisma/migrations) |
| README, `.env.example`, Docker | this file, [.env.example](.env.example), [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml) |
| Postman collection (optional) | [docs/EchoGPT.postman_collection.json](docs/EchoGPT.postman_collection.json) |
| Bonus: email verification | ✅ [Authentication](#authentication) — `src/auth/email-verification.service.ts`, `src/mail` |
| Bonus: streaming response | ✅ [Chat](#chat) — `POST /chat/messages/stream` |
| Bonus: search result caching | ✅ [Web search](#web-search) — `src/search/search-cache.service.ts` |

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | NestJS 11 (TypeScript) |
| Database | PostgreSQL 17 |
| ORM / migrations | Prisma 6 |
| API docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Auth | JWT access + refresh tokens |
| Containers | Docker + Docker Compose |

## Project structure

```text
prisma/
  schema.prisma          # database schema
  migrations/            # SQL migration files
  seed.ts                # roles, subscription plans, first admin
docs/
  openapi.json           # exported OpenAPI 3 spec
  EchoGPT.postman_collection.json
src/
  main.ts                # bootstrap: security headers, CORS, validation, versioning, Swagger
  app.module.ts          # root module
  swagger.ts             # OpenAPI document setup
  config/                # env validation + typed configuration
  prisma/                # PrismaService (DB connection)
  common/                # shared guards, decorators, middleware, filters, DTOs
  health/                # GET /api/v1/health
  auth/                  # register, login, refresh, logout (JWT + sessions)
  users/                 # profile, password change, account deletion, roles
  subscriptions/         # plans, subscription status, upgrade/downgrade, usage limits
  providers/             # AI provider management (admin), vendor adapters, health checks
  chat/                  # send prompt, AI reply, conversation history
  search/                # AI-assisted web search (DuckDuckGo), history, recent, suggestions
  admin/                 # admin panel: dashboard, users, subscriptions, analytics, logs, health
scripts/
  mock-ai-server.js      # OpenAI-compatible mock for demos without API keys
```

## Getting started

### Prerequisites

- Node.js 20+ (22 recommended)
- Docker Desktop (runs PostgreSQL, and optionally the API itself)

### 1. Install dependencies

```bash
npm install   # also generates the Prisma client (postinstall)
```

### 2. Configure environment

```bash
cp .env.example .env
```

Every variable is documented in [.env.example](.env.example). The app validates them at startup and refuses to boot if one is missing or invalid.

Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to two different long random values, and `ENCRYPTION_KEY` to 64 hex characters, e.g. `openssl rand -hex 32` for each. The example `ENCRYPTION_KEY` is for local development only.

### 3. Start PostgreSQL

```bash
docker compose up -d db
```

No Docker? Any PostgreSQL 16+ works: create user, password and database `echogpt` on port 5432 (or change `DATABASE_URL`).

### 4. Run migrations and seed data

```bash
npx prisma migrate deploy   # apply migrations in prisma/migrations
npm run db:seed             # roles (USER, ADMIN), plans (FREE, PREMIUM), first admin
```

### 5. Start the API

```bash
npm run start:dev
```

- API base URL: http://localhost:3000/api/v1
- Swagger UI: http://localhost:3000/docs
- OpenAPI JSON: http://localhost:3000/docs/openapi.json

### Run everything with Docker

```bash
docker compose up --build
```

The API container applies migrations and seeds reference data automatically on startup.

### 2-minute demo

1. `npm run mock:ai` in a second terminal (fake OpenAI-compatible AI, no key needed).
2. Open http://localhost:3000/docs and run **Auth → POST /auth/login** with the seeded admin
   `admin@echogpt.local` / `Admin12345` (from `.env.example`). Swagger applies the token automatically.
3. **Admin · AI Providers → POST /admin/providers** with
   `{ "name": "Mock AI", "type": "OPENAI", "apiKey": "mock-key-1234", "defaultModel": "mock-echo", "baseUrl": "http://localhost:4010/v1" }`.
4. **Auth → POST /auth/register** a normal user, then try **Chat → POST /chat/messages** and **Web Search → POST /search**.
5. Log back in as admin and open **GET /admin/dashboard** and **GET /admin/analytics/usage**.

With real vendor keys, add OpenAI / Anthropic / Gemini providers the same way (without `baseUrl`).

## API documentation

- **Swagger UI**: http://localhost:3000/docs — every endpoint with parameters, bodies, examples, error responses and auth requirements. Protected endpoints are marked with a padlock and a "Requires login" note.
- **OpenAPI spec**: live at `/docs/openapi.json`, exported to [docs/openapi.json](docs/openapi.json).
- **Postman**: import [docs/EchoGPT.postman_collection.json](docs/EchoGPT.postman_collection.json). Logging in stores the tokens in collection variables, protected requests use them automatically, and ids (`conversationId`, `providerId`, …) are captured by the requests that create them.

## Architecture

```text
Request
  → ApiUsageLoggerMiddleware   logs method, route, status, duration, user (on response finish)
  → ThrottlerGuard             rate limit per IP (stricter on login/register)
  → JwtAuthGuard               valid access token required unless @Public()
  → RolesGuard                 @Roles('ADMIN') on admin controllers
  → ValidationPipe             DTO validation; unknown fields rejected
  → Controller → Service → Prisma → PostgreSQL
  → AllExceptionsFilter        every error returned as { statusCode, error, message, path, timestamp }
```

- **One module per feature** (`auth`, `users`, `subscriptions`, `providers`, `chat`, `search`, `admin`): controllers handle HTTP and Swagger, services hold business rules, DTOs define and validate every input and output.
- **AI vendors are adapters** (`src/providers/adapters`) implementing `checkHealth()` and `chat()`. Chat and search depend only on the interface.
- **Search engine is a client class** (`src/search/duckduckgo.client.ts`), so swapping DuckDuckGo for a paid engine touches one file.
- **Configuration** is validated at startup (`src/config/env.validation.ts`) — the app refuses to boot with a missing or malformed secret.

## Security

- Passwords hashed with **bcrypt**. Login takes the same time whether or not the email exists.
- **JWT access tokens** (15 min) plus **refresh tokens** (30 days) stored only as SHA-256 hashes, one session per device. Rotation on every refresh, and **replay of an old refresh token revokes the session**.
- The user is re-checked on every request, so deactivated or deleted accounts are locked out immediately.
- **Role-based access**: admin controllers require `ADMIN`. The last admin can never be deleted, demoted or deactivated.
- **AI provider keys encrypted at rest** with AES-256-GCM and never returned (masked to the last 4 characters).
- **Input validation** on every body and query. Unknown fields are rejected, so mass assignment (e.g. `role`) is impossible.
- Ownership checks on chats and searches return **404** for other users' data, so ids can't be probed.
- **helmet** security headers, configurable **CORS** (`CORS_ORIGINS`), global and per-route **rate limiting**.
- Raw SQL (analytics only) uses Prisma's parameterized `Prisma.sql` — no string concatenation.

## Scalability notes

- The API is **stateless** (JWT auth, sessions in PostgreSQL), so it can run as several instances behind a load balancer.
- Queries that grow with data use **indexes** defined in the schema (usage by user/type/date, conversations by user/updated, logs by date/status…) and every list endpoint is **paginated**.
- Request logging is **fire-and-forget** on response finish, so it never slows a request down.
- Plan limits live in the database, so pricing changes need no deploy. Expired Premium periods are resolved on read — no cron job to run or scale.
- For multi-instance production: move the rate-limit store to Redis (`@nestjs/throttler` storage), and archive `api_usage_logs` periodically.

## Design decisions & limitations

- **No payment provider**: upgrading starts a 30-day Premium period directly. In production a payment webhook would call the same logic.
- **DuckDuckGo Instant Answer** is free and keyless but is not a full web index. Topics ("NestJS") return results, while question-style queries often return none (reported as 0 results, not an error).
- **Logout** revokes the session (refresh token) immediately. An already-issued access token stays valid until it expires (at most 15 minutes) — the usual trade-off of stateless JWTs. Deactivating or deleting an account blocks it at once.
- **Email verification is not enforced**: unverified users can still use the API (the extension stays usable right after sign-up); the status is exposed as `emailVerified` / `emailVerifiedAt` so a client or a future guard can require it.
- **Streaming is Premium-only**, driven by the existing `plans.allow_streaming` flag.
- **Only engine results are cached**, not AI summaries — summaries depend on the chosen provider and are cheap to regenerate.
- Failed AI calls return **502** and are neither saved nor counted against the user's quota.

## Testing

```bash
npm test        # 41 smoke tests across auth, users, subscriptions, providers, chat, search and admin
npm run lint    # ESLint + Prettier
```

The unit tests run without a database (Prisma and HTTP are replaced with in-memory fakes). Step-by-step manual test guides for every feature, with expected results, are in [PROGRESS.md](PROGRESS.md).

## Authentication

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /api/v1/auth/register` | Public | Create an account (USER, Free plan) and receive tokens |
| `POST /api/v1/auth/login` | Public | Email + password → access + refresh token |
| `POST /api/v1/auth/refresh` | Public | Rotate the refresh token and get a new pair |
| `POST /api/v1/auth/logout` | Bearer | Revoke the session of the given refresh token |
| `POST /api/v1/auth/logout-all` | Bearer | Revoke all sessions of the user |
| `POST /api/v1/auth/verify-email` | Public | Verify the email address with the token from the email |
| `GET /api/v1/auth/verify-email?token=` | Public | Same, for the link in the email |
| `POST /api/v1/auth/resend-verification` | Bearer | Send a new verification link |

- Send the access token as a header: `Authorization: Bearer <accessToken>` (15 min lifetime).
- The refresh token (30 days) is only sent in the body of `/auth/refresh` and `/auth/logout`.
- Refresh tokens rotate on every use; replaying an old one revokes the session.
- Every route requires a valid access token unless it is explicitly public; admin routes also check the role.
- In Swagger UI, logging in or registering applies the access token to **Authorize** automatically.

`npm run db:seed` also creates a first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` when they are set.

### Email verification

- Registering sends an email with a verification link (`EMAIL_VERIFICATION_URL?token=…`, by default this API's `GET /auth/verify-email`).
- Tokens are 32 random bytes, stored only as a SHA-256 hash, **single-use**, and expire after **24 hours**. Resending replaces any older unused link.
- Email is sent over SMTP when `SMTP_HOST` is set. **Without SMTP (development) the email, including the link, is written to the server log**, so the flow can be tried end to end.
- A mail failure never blocks registration. `emailVerified` (login/register) and `emailVerifiedAt` (profile, admin views) show the status.

## Users

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/v1/users/me` | Bearer | My profile |
| `PATCH /api/v1/users/me` | Bearer | Update name / avatar |
| `PATCH /api/v1/users/me/password` | Bearer | Change password (revokes all sessions, returns new tokens) |
| `DELETE /api/v1/users/me` | Bearer | Delete my account (password required) |

## Subscriptions & usage limits

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/v1/plans` | Public | Free and Premium plans with prices and daily limits |
| `GET /api/v1/subscriptions/me` | Bearer | Current plan and status (`ACTIVE` / `CANCELED` / `EXPIRED`) |
| `GET /api/v1/subscriptions/me/usage` | Bearer | Requests used and remaining today |
| `POST /api/v1/subscriptions/me/upgrade` | Bearer | Start a 30-day Premium period |
| `POST /api/v1/subscriptions/me/downgrade` | Bearer | Return to Free immediately |

Daily limits (per UTC day) come from the `plans` table: Free 20 chats / 10 searches, Premium 500 / 200. When a limit is reached, chat and search return **429** with the reset time. Payment processing is out of scope.

## AI providers

Admins manage the AI vendors the platform uses; users pick one of the enabled providers when chatting.

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/v1/providers` | Bearer | Enabled providers and their models (no secrets) |
| `GET /api/v1/admin/providers` | Admin | List all providers |
| `POST /api/v1/admin/providers` | Admin | Add an OpenAI / Anthropic / Gemini provider |
| `GET /api/v1/admin/providers/:id` | Admin | View one provider |
| `PATCH /api/v1/admin/providers/:id` | Admin | Edit, or rotate the API key |
| `DELETE /api/v1/admin/providers/:id` | Admin | Delete |
| `POST /api/v1/admin/providers/:id/enable` / `disable` | Admin | Enable / disable |
| `POST /api/v1/admin/providers/:id/default` | Admin | Make it the default provider |
| `POST /api/v1/admin/providers/:id/health-check` | Admin | Real authenticated call to the vendor; stores status and latency |

- API keys are encrypted with **AES-256-GCM** (`ENCRYPTION_KEY`) before they are stored and are never returned, only `••••` plus the last 4 characters.
- While any provider is enabled, exactly one enabled provider is the default; disabling or deleting it hands the role to another.
- Each vendor has an adapter implementing one interface (`src/providers/adapters`), so adding a vendor is one new class.

## Chat

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /api/v1/chat/messages` | Bearer | Send a prompt and get the AI reply (optional `conversationId`, `providerId`, `model`) |
| `GET /api/v1/chat/conversations` | Bearer | My conversations, paginated (`page`, `limit`) |
| `GET /api/v1/chat/conversations/:id` | Bearer | A conversation with its messages |
| `PATCH /api/v1/chat/conversations/:id` | Bearer | Rename |
| `DELETE /api/v1/chat/conversations/:id` | Bearer | Delete |

- The last 20 messages are sent as context. Provider: requested → the conversation's → default. Model: requested (must be offered) → the conversation's → provider default.
- Checks the daily chat limit first (**429**). If the AI provider fails the response is **502** and nothing is saved or counted.

### Streaming responses (Premium)

`POST /api/v1/chat/messages/stream` takes the same body but returns **Server-Sent Events** while the AI writes:

```text
event: start   data: {"conversationId":null,"provider":{…},"model":"gpt-4o-mini"}
event: delta   data: {"text":"A REST API"}      ← repeated; concatenate them
event: done    data: { same body as POST /chat/messages }
event: error   data: {"statusCode":502,"message":"…"}   ← instead of done; nothing saved
```

- Requires a plan with streaming (`plans.allow_streaming`, Premium by default); Free gets **403**.
- Checks (limits, ownership, provider) run before the stream starts, so they stay normal JSON errors.
- The exchange is saved only when the stream completes. A provider failure or a client disconnect saves and counts nothing (the AI call is cancelled).
- Try it: `curl -N -X POST http://localhost:3000/api/v1/chat/messages/stream -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"message\":\"hi\"}"` (Swagger shows the full stream once it ends).

## Web search

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /api/v1/search` | Bearer | Search + optional AI summary (`query`, `summarize`, `providerId`) |
| `GET /api/v1/search/history` | Bearer | Past searches, paginated |
| `GET /api/v1/search/history/:id` | Bearer | One past search with its saved results |
| `DELETE /api/v1/search/history/:id` | Bearer | Delete one |
| `DELETE /api/v1/search/history` | Bearer | Clear all |
| `GET /api/v1/search/recent` | Bearer | Latest distinct queries |
| `GET /api/v1/search/suggestions?q=` | Bearer | Suggestions from own history + DuckDuckGo autocomplete |

- Results come from the free, keyless **DuckDuckGo Instant Answer** API (topic summaries and related links; question-style queries often return nothing).
- The AI summary uses any chat provider. If it fails, results are still returned with `summaryError`.
- Counts toward the daily search limit (**429**); an unreachable engine returns **502** and nothing is counted.
- **Result caching**: engine results are cached in `search_cache` for `SEARCH_CACHE_TTL_SECONDS` (default 1 hour; 0 disables), keyed by a hash of engine + normalized query and shared by all users. A cached search returns `cached: true` and skips the external call. AI summaries are still generated per request.

### Trying chat without an API key

```bash
npm run mock:ai   # OpenAI-compatible mock on http://localhost:4010/v1
```

Then, as an admin, add a provider: `{ "name": "Mock AI", "type": "OPENAI", "apiKey": "mock-key-1234", "defaultModel": "mock-echo", "baseUrl": "http://localhost:4010/v1" }`.

## Admin panel

All `/admin/*` endpoints require the `ADMIN` role (log in with the seeded `ADMIN_EMAIL`).

| Endpoint | Description |
| --- | --- |
| `GET /api/v1/admin/dashboard` | Users, plans, today's usage, content, providers, last-24h requests |
| `GET /api/v1/admin/users` | List / search users (`search`, `role`, `isActive`, pagination) |
| `GET /api/v1/admin/users/:id` | User detail with activity stats |
| `PATCH /api/v1/admin/users/:id/role` | Promote / demote (the last admin is protected) |
| `PATCH /api/v1/admin/users/:id/status` | Activate / deactivate (deactivation revokes all sessions) |
| `DELETE /api/v1/admin/users/:id` | Delete a user |
| `GET /api/v1/admin/subscriptions` | List subscriptions (`plan`, `status`) |
| `PATCH /api/v1/admin/subscriptions/:userId` | Set a user's plan (e.g. grant Premium for N days) |
| `PATCH /api/v1/admin/plans/:code` | Edit a plan's price and daily limits |
| `GET /api/v1/admin/analytics/usage?days=` | Chats, searches and tokens per day; per provider; top users |
| `GET /api/v1/admin/analytics/requests?days=` | Requests, errors and latency per day; busiest endpoints; status codes |
| `GET /api/v1/admin/request-logs` | Every API request, filterable (`userId`, `method`, `statusCode`, `minStatus`, `path`, `from`, `to`) |
| `GET /api/v1/admin/system/health` | Database, runtime and provider health (`?refreshProviders=true` re-checks live) |
| `/api/v1/admin/providers/...` | AI provider management (see above) |

## Useful scripts

| Script | Description |
| --- | --- |
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` | ESLint + Prettier checks |
| `npm test` | Unit tests |
| `npm run prisma:migrate` | Create a new migration from schema changes (dev) |
| `npm run prisma:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed roles, plans and the first admin |
| `npm run mock:ai` | Start the mock AI server for demos without API keys |
| `npm run prisma:studio` | Browse the database in a GUI |

## Database design

| Table | Purpose |
| --- | --- |
| `users` | Accounts (email, password hash, profile, role, status) |
| `roles` | `USER` / `ADMIN` |
| `sessions` | One row per logged-in device; stores the hashed refresh token |
| `email_verification_tokens` | Hashed single-use email verification tokens (24 h) |
| `plans` | `FREE` / `PREMIUM` with daily limits |
| `subscriptions` | Each user's current plan |
| `usage_records` | One row per chat/search request; used for usage limits |
| `ai_providers` | OpenAI / Anthropic / Gemini configs with encrypted API keys |
| `conversations`, `messages` | Chat history |
| `web_searches` | Search history (with result snapshot) |
| `search_cache` | Shared cache of search-engine results (TTL) |
| `api_usage_logs` | Log of every API request (admin analytics & request logs) |

## Error format

Every error response has the same shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email must be an email"],
  "path": "/api/v1/auth/register",
  "timestamp": "2026-09-28T10:00:00.000Z"
}
```
