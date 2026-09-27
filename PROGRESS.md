# EchoGPT Backend — Progress & Handover

A living log of what has been built, how, and what comes next. Anyone (human or AI assistant) can read this file and continue the work without any prior context.

> **Resume here →** Phases 1–3 are done (2 and 3 are tested by the developer, awaiting the owner's joint re-test before push). **Next: Phase 4 — AI Provider Management.**

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
| 2 | User Management | ✅ Done |
| 3 | Subscription Management | ✅ Done |
| 4 | AI Provider Management | ⏭️ Next |
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

## Phase 2 — User Management ✅

**Endpoints** (Swagger tag **Users**, all need login)

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/users/me` | Any user | View my profile |
| PATCH | `/users/me` | Any user | Update my name / avatar (only the fields sent) |
| PATCH | `/users/me/password` | Any user | Change password → all devices signed out, fresh tokens for this one |
| DELETE | `/users/me` | Any user | Delete my account (password required) |
| PATCH | `/users/{id}/role` | **Admin** | Promote to ADMIN / demote to USER |

**Checklist**

- [x] Profile view and update (email and role cannot be changed through the profile)
- [x] Change password: current password required, new one must differ, all sessions revoked
- [x] Delete account: password required, all the user's data removed by database cascades
- [x] User roles: admin-only role change; the last admin can never be deleted or demoted
- [x] First admin account created by `npm run db:seed` from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [x] Shared password rules for register and change-password
- [x] Smoke tests: `src/users/users.service.spec.ts` (4 tests)

**How it works (in plain words)**

- **"me" endpoints.** The server knows who you are from the access token, so users can only ever read or change their *own* account. There is no id to tamper with.
- **PATCH = partial update.** Only the fields you send change. `null` clears a field. Unknown fields such as `email` or `role` are rejected with 400.
- **Password change signs out everywhere.** If someone else knew the old password, their sessions die too. You get new tokens straight away, so you stay logged in on this device.
- **Wrong confirmation password returns 403, not 401.** A 401 would make the extension think the login expired and log the user out.
- **Delete is permanent.** Database cascades remove sessions, subscription, chats, searches and usage. Request logs are kept for statistics with the user id removed. A deleted user's token stops working on the very next request.
- **Roles are checked on every request** from the database, so a promotion or demotion takes effect immediately without logging in again.

**Test guide** (log in first; Swagger applies the token automatically)

| # | Do this | Expect |
| --- | --- | --- |
| 1 | `GET /users/me` | **200** with your profile (no password hash) |
| 2 | `PATCH /users/me` `{ "fullName": "Your Name", "avatarUrl": "https://example.com/me.png" }` | **200** with the new values |
| 3 | `PATCH /users/me` `{ "email": "x@y.com" }` | **400** "property email should not exist" |
| 4 | `PATCH /users/me/password` with a wrong `currentPassword` | **403** "Current password is incorrect" |
| 5 | Same with `newPassword` equal to the current one | **400** "must be different" |
| 6 | Correct change | **200** + new tokens; login with the old password → **401** |
| 7 | As a normal user: `PATCH /users/{your id}/role` `{ "role": "ADMIN" }` | **403** "Insufficient role" |
| 8 | Log in as `admin@echogpt.local` / `Admin12345`, repeat step 7 | **200**, role ADMIN (set it back to USER) |
| 9 | As admin, demote your own id to USER | **409** "Cannot demote the last admin" |
| 10 | Throwaway account: `DELETE /users/me` `{ "password": "..." }` | **200**; then `GET /users/me` → **401** "Account is no longer active" |

---

## Phase 3 — Subscription Management ✅

**Endpoints** (Swagger tag **Subscriptions**)

| Method | Path | Login | What it does |
| --- | --- | --- | --- |
| GET | `/plans` | No | List Free and Premium with prices and limits |
| GET | `/subscriptions/me` | Yes | My plan and status |
| GET | `/subscriptions/me/usage` | Yes | Requests used and remaining today, and when they reset |
| POST | `/subscriptions/me/upgrade` | Yes | Free → Premium for 30 days |
| POST | `/subscriptions/me/downgrade` | Yes | Premium → Free immediately |

**Checklist**

- [x] Free & Premium plans (limits stored in the `plans` table, not in code)
- [x] Subscription status API
- [x] Upgrade / downgrade (no payment provider: upgrade grants a 30-day period)
- [x] Usage limits: `UsageService.assertWithinLimit()` → **429** when today's quota is used; `record()` after a successful request
- [x] Remaining requests API
- [x] Expired Premium falls back to Free automatically
- [x] Smoke tests: `src/subscriptions/subscriptions.spec.ts` (4 tests)

**How it works (in plain words)**

- **Plans live in the database.** Free allows 20 chats and 10 searches per day. Premium allows 500 and 200. Changing a limit is a data change, not a code change, and `null` means unlimited.
- **Status values.** `ACTIVE` means the plan is in force. `CANCELED` means the user downgraded to Free. `EXPIRED` means the Premium period ran out and the account went back to Free.
- **No scheduled job for expiry.** Each time a subscription is read, the server checks whether the Premium end date has passed. If it has, it switches the account to Free right there. This is simpler and can't be missed if a server restarts.
- **Usage counting.** Each successful chat or search adds one row to `usage_records`. "Used today" counts rows since 00:00 UTC (06:00 in Bangladesh). The check runs *before* the work and the record is written *after* it succeeds, so failed AI calls never use up quota. The counts use an existing database index, so they stay fast with many rows.
- **Payments are out of scope.** In production, a payment provider (e.g. Stripe) webhook would call the same upgrade logic.

**Test guide**

| # | Do this | Expect |
| --- | --- | --- |
| 1 | `GET /plans` (no login needed) | **200** — FREE $0 (20 chat / 10 search), PREMIUM 999 cents (500 / 200) |
| 2 | Log in, `GET /subscriptions/me` | **200** — status ACTIVE, plan FREE |
| 3 | `GET /subscriptions/me/usage` | chat 20 remaining, search 10 remaining, `resetsAt` = next 00:00 UTC |
| 4 | `POST /subscriptions/me/downgrade` while on Free | **409** "Already on the Free plan" |
| 5 | `POST /subscriptions/me/upgrade` | **200** "Upgraded to Premium until …" (30 days) |
| 6 | Upgrade again | **409** "Already on Premium until …" |
| 7 | `GET /subscriptions/me/usage` | limits are now 500 / 200 |
| 8 | `POST /subscriptions/me/downgrade` | **200** — status CANCELED, plan FREE |

The **429 limit** itself can be triggered by hand from Phase 5 (chat) onwards. Until then it is covered by the smoke test and by a database-simulated check.

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
