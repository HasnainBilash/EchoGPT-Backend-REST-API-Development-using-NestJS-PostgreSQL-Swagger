# EchoGPT Backend — Progress & Handover

A living log of what has been built, how, and what comes next. Anyone (human or AI assistant) can read this file and continue the work without any prior context.

> **Resume here →** Phase 1 is done and pushed. **Next: Phase 2 — User Management.**

## The assignment in one paragraph

Build a production-ready REST backend for the [EchoGPT Chrome extension](https://chromewebstore.google.com/detail/echogpt-multi-ai-chat-sid/negimdcamohmoheiifgecbjgjepkcfhj) with **NestJS, PostgreSQL, Prisma, Swagger and JWT**: authentication, user management, Free/Premium subscriptions with usage limits, admin-managed AI providers (OpenAI, Anthropic, Gemini), a chat API, an AI-assisted web search API, and admin panel APIs. Graded on architecture, REST design, DB design, code quality, security, auth, error handling, Swagger docs, scalability and git history. **Deadline: 29 September 2026.**

## Ground rules

- Build **only what the assignment asks**. Small additions are fine when they are cheap and save effort later.
- **Bonus items are skipped**: email verification, streaming responses, search result caching. (Their tables already exist, so they can be added later.)
- Each phase: build → test everything against the live API + database → write a test guide → owner re-tests → commit & push → update this file → push.
- AI provider calls are **real HTTP calls**, but no API keys are available, so everything must fail gracefully (clean error, no crash) without them.
- Web search uses **DuckDuckGo Instant Answer** (free, no key).
- One thin **smoke test file per module** (runs without a database).
- Commits are authored by **Bilash** only, no co-author lines.

## Phase overview

| # | Phase | Status |
| --- | --- | --- |
| 0 | Foundation: project, database schema, config, errors, Swagger, Docker | ✅ Done |
| 1 | Authentication | ✅ Done |
| 2 | User Management | ⏭️ Next |
| 3 | Subscription Management | ⬜ |
| 4 | AI Provider Management | ⬜ |
| 5 | Chat API | ⬜ |
| 6 | Web Search API | ⬜ |
| 7 | Admin Panel APIs | ⬜ |
| 8 | Polish & submission (Swagger sweep, Postman, README, final check) | ⬜ |

---

## Phase 0 — Foundation ✅

**What:** the skeleton every feature builds on.

- [x] NestJS 11 + TypeScript, ESLint + Prettier
- [x] Full Prisma schema for **all** phases, plus the initial SQL migration (`prisma/migrations/`)
- [x] Seed data: roles `USER`/`ADMIN`, plans `FREE`/`PREMIUM` with daily limits
- [x] Environment variables validated at startup — the app refuses to boot if one is missing or invalid
- [x] One error format everywhere: `{ statusCode, error, message, path, timestamp }`
- [x] Swagger UI at `/docs`, all routes under `/api/v1`
- [x] Security headers (helmet), CORS, global rate limit (120 requests/min per IP)
- [x] `GET /api/v1/health` (checks the database)
- [x] `Dockerfile` + `docker-compose.yml`, `.env.example`, README

**How (in plain words):** the whole database was designed up front, so later phases add code but rarely change tables. Tables use UUID ids, snake_case names and UTC timestamps. Plan limits live in the `plans` table, not in code, so an admin can change them.

---

## Phase 1 — Authentication ✅

**Endpoints** (Swagger tag **Auth**)

| Method | Path | Login needed | What it does |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Create an account (USER role, Free plan) and log in |
| POST | `/auth/login` | No | Email + password → token pair |
| POST | `/auth/refresh` | No | Refresh token → new token pair (old one stops working) |
| POST | `/auth/logout` | Yes | End the session of the given refresh token (this device) |
| POST | `/auth/logout-all` | Yes | End every session of the user (all devices) |

**Checklist**

- [x] Register / login / logout / logout-all
- [x] JWT access token (15 min) + refresh token (30 days)
- [x] Refresh token rotation with reuse detection
- [x] Password hashing (bcrypt)
- [x] Global login guard (`@Public()` to opt out) + role guard (`@Roles('ADMIN')`)
- [x] Stricter rate limit on login/register: 10 per minute per IP
- [x] Clear 401 messages (token missing / expired / wrong token type)
- [x] Every request logged to `api_usage_logs` (used by Phase 7)
- [x] Swagger fills in the access token automatically after login/register
- [x] Smoke tests: `src/auth/auth.service.spec.ts` (5 tests)

**How it works (in plain words)**

- **Two tokens.** The *access token* is a short-lived pass sent with every request in the header `Authorization: Bearer <token>`. The *refresh token* is only used to get a new pair when the access token expires. Short access tokens limit the damage if one leaks.
- **Sessions.** Every login creates a row in `sessions` (one per device). The database stores only a **SHA-256 hash** of the refresh token, so a leaked database contains no usable tokens.
- **Rotation + reuse detection.** Each refresh swaps the refresh token for a new one. If an old token is ever used again, someone probably stole it, so the whole session is revoked.
- **Passwords** are hashed with bcrypt, never stored in plain text. Login takes the same time whether or not the email exists, so it can't be used to discover registered emails.
- **Secure by default.** One global guard checks the access token on *every* route. Public routes are the exception and are marked `@Public()`. Admin-only routes add `@Roles('ADMIN')`.
- **Input safety.** Unknown fields are rejected, so sending `"role": "ADMIN"` to register returns 400. Nobody can make themselves admin.
- **Account checks.** The guard reloads the user on each request, so a deactivated or deleted account is locked out immediately, even with a valid token.

**Test guide (Swagger at http://localhost:3000/docs)**

| # | Do this | Expect |
| --- | --- | --- |
| 1 | `POST /auth/register` → Try it out → Execute (change the email if it already exists) | **201** with `accessToken`, `refreshToken`, `user`. Padlocks close automatically. |
| 2 | Same request again | **409** "An account with this email already exists" |
| 3 | `POST /auth/login` with a wrong password | **401** "Invalid email or password" |
| 4 | `POST /auth/login` with the right password | **200** + new token pair |
| 5 | `POST /auth/refresh` with the refresh token from step 4 | **200** + a *different* refresh token |
| 6 | Step 5 again with the **old** refresh token | **401** "Refresh token reuse detected — session revoked" |
| 7 | Log in again, then `POST /auth/logout` with only `{ "refreshToken": "..." }` in the body | **200** "Logged out successfully" |
| 8 | `POST /auth/refresh` with that same refresh token | **401** |
| 9 | Terminal: `npm test` | 5 tests pass |

Common mistakes: putting the access token in the body (it goes in the header / Authorize button), and pasting a token with its quotes (`""eyJ...`) which gives a JSON 400.

---

## Phase 2 — User Management ⏭️ (next)

- [ ] `GET /users/me` — view profile
- [ ] `PATCH /users/me` — update name / avatar
- [ ] `PATCH /users/me/password` — change password (needs current password; logs out other devices)
- [ ] `DELETE /users/me` — delete account (needs password confirmation)
- [ ] Roles: prove `@Roles('ADMIN')` blocks normal users (full admin user management comes in Phase 7)
- [ ] Smoke tests

## Phase 3 — Subscription Management

- [ ] `GET /plans` — list Free/Premium plans (public)
- [ ] `GET /subscriptions/me` — current plan and status
- [ ] `POST /subscriptions/upgrade` and `/downgrade` (no real payment — status change only)
- [ ] Usage limits enforced per UTC day (chat + search) from the `plans` table
- [ ] `GET /subscriptions/me/usage` — used / remaining requests today

## Phase 4 — AI Provider Management (admin)

- [ ] Add / edit / delete / enable / disable providers (OpenAI, Anthropic, Gemini)
- [ ] API keys encrypted with AES-256-GCM, never returned (only the last 4 characters)
- [ ] Set the default provider
- [ ] Health check endpoint (real call to the provider; fails cleanly without a key)
- [ ] `GET /providers` for users — enabled providers only, no secrets

## Phase 5 — Chat API

- [ ] Send a prompt → AI response through a common adapter per provider
- [ ] Choose the provider/model, or use the default
- [ ] Conversation history: list, view, delete
- [ ] Counts toward plan limits (429 when used up)

## Phase 6 — Web Search API

- [ ] Search query via DuckDuckGo Instant Answer (+ optional AI summary)
- [ ] Search history, recent searches, suggestions
- [ ] Counts toward plan limits

## Phase 7 — Admin Panel APIs

- [ ] Dashboard statistics
- [ ] User management (list, view, change role, activate/deactivate)
- [ ] Subscription management (change a user's plan)
- [ ] API usage analytics and request logs (from `api_usage_logs`)
- [ ] System health (database, providers, uptime)

## Phase 8 — Polish & submission

- [ ] Swagger sweep: every endpoint has examples and error responses
- [ ] Postman collection (optional)
- [ ] Final README, `.env.example` check, fresh-clone test
- [ ] Submission checklist from the assignment

---

## Conventions for new code

- One folder per feature under `src/` (`module`, `controller`, `service`, `dto/`).
- Routes need login by default. Use `@Public()` to open one and `@Roles(RoleName.ADMIN)` to restrict one.
- Get the logged-in user with `@CurrentUser() user: AuthenticatedUser`.
- Document errors with `@ApiErrorResponses(400, 401, ...)` and add `@ApiBearerAuth('access-token')` on protected routes.
- Request logging is automatic (middleware); no per-route code is needed.
- Validate every input with a DTO (`class-validator`). Unknown fields are rejected globally.

## Local setup notes

- Standard setup (Docker) is in the [README](README.md).
- **No Docker?** Any PostgreSQL 16+ works. Create user/password/database `echogpt`/`echogpt`/`echogpt` on port 5432 (matches `.env.example`), then run `npx prisma migrate deploy` and `npm run db:seed`.
