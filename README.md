# EchoGPT Backend REST API

Backend for the [EchoGPT – Multi AI Chat](https://chromewebstore.google.com/detail/echogpt-multi-ai-chat-sid/negimdcamohmoheiifgecbjgjepkcfhj) Chrome extension, built with **NestJS**, **PostgreSQL**, **Prisma** and **Swagger (OpenAPI)**.

> Build progress, design decisions and per-phase test guides: see [PROGRESS.md](PROGRESS.md).

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

```
prisma/
  schema.prisma          # database schema
  migrations/            # SQL migration files
  seed.ts                # roles + subscription plans
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
scripts/
  mock-ai-server.js      # OpenAI-compatible mock for demos without API keys
```

## Getting started

### Prerequisites

- Node.js 20+ (22 recommended)
- Docker Desktop (runs PostgreSQL, and optionally the API itself)

### 1. Install dependencies

```bash
npm install
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
npm run db:seed             # create roles (USER, ADMIN) and plans (FREE, PREMIUM)
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

## Authentication

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /api/v1/auth/register` | Public | Create an account (USER, Free plan) and receive tokens |
| `POST /api/v1/auth/login` | Public | Email + password → access + refresh token |
| `POST /api/v1/auth/refresh` | Public | Rotate the refresh token and get a new pair |
| `POST /api/v1/auth/logout` | Bearer | Revoke the session of the given refresh token |
| `POST /api/v1/auth/logout-all` | Bearer | Revoke all sessions of the user |

- Send the access token as a header: `Authorization: Bearer <accessToken>` (15 min lifetime).
- The refresh token (30 days) is only sent in the body of `/auth/refresh` and `/auth/logout`.
- Refresh tokens rotate on every use; replaying an old one revokes the session.
- Every route requires a valid access token unless it is explicitly public; admin routes also check the role.
- In Swagger UI, logging in or registering applies the access token to **Authorize** automatically.

`npm run db:seed` also creates a first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` when they are set.

## Users

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/v1/users/me` | Bearer | My profile |
| `PATCH /api/v1/users/me` | Bearer | Update name / avatar |
| `PATCH /api/v1/users/me/password` | Bearer | Change password (revokes all sessions, returns new tokens) |
| `DELETE /api/v1/users/me` | Bearer | Delete my account (password required) |
| `PATCH /api/v1/users/:id/role` | Admin | Promote / demote a user (the last admin is protected) |

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

### Trying chat without an API key

```bash
npm run mock:ai   # OpenAI-compatible mock on http://localhost:4010/v1
```

Then, as an admin, add a provider: `{ "name": "Mock AI", "type": "OPENAI", "apiKey": "mock-key-1234", "defaultModel": "mock-echo", "baseUrl": "http://localhost:4010/v1" }`.

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
| `email_verification_tokens` | Hashed single-use email verification tokens |
| `plans` | `FREE` / `PREMIUM` with daily limits |
| `subscriptions` | Each user's current plan |
| `usage_records` | One row per chat/search request; used for usage limits |
| `ai_providers` | OpenAI / Anthropic / Gemini configs with encrypted API keys |
| `conversations`, `messages` | Chat history |
| `web_searches` | Search history (with result snapshot) |
| `search_cache` | Cached search results |
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
