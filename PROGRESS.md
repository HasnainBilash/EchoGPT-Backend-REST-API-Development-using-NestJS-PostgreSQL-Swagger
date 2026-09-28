# EchoGPT Backend — Progress & Handover

A living log of what has been built, how, and what comes next. Anyone (human or AI assistant) can read this file and continue the work without any prior context.

> **Resume here →** Phases 1–6 are done (1–5 pushed; 6 tested by the developer, awaiting the owner's re-test before push). **Next: Phase 7 — Admin Panel APIs.**

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
| 4 | AI Provider Management | ✅ Done |
| 5 | Chat API | ✅ Done |
| 6 | Web Search API | ✅ Done |
| 7 | Admin Panel APIs | ⏭️ Next |
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

---

## Phase 4 — AI Provider Management ✅

**Endpoints**

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/admin/providers` | Admin | List all providers (keys masked) |
| POST | `/admin/providers` | Admin | Add a provider (OpenAI / Anthropic / Gemini) |
| GET | `/admin/providers/{id}` | Admin | View one provider |
| PATCH | `/admin/providers/{id}` | Admin | Edit (send `apiKey` only to rotate it) |
| DELETE | `/admin/providers/{id}` | Admin | Delete |
| POST | `/admin/providers/{id}/enable` | Admin | Enable |
| POST | `/admin/providers/{id}/disable` | Admin | Disable |
| POST | `/admin/providers/{id}/default` | Admin | Make it the default |
| POST | `/admin/providers/{id}/health-check` | Admin | Real call to the vendor; stores status, reason and latency |
| GET | `/providers` | Any user | Enabled providers and their models (no secrets) |

**Checklist**

- [x] Add / edit / delete / enable / disable providers
- [x] API keys encrypted with AES-256-GCM; only a masked hint (`••••abcd`) is ever returned
- [x] Default provider selection, with automatic fallback
- [x] Health check endpoint making a real authenticated call to each vendor
- [x] One adapter class per vendor behind a shared interface (Phase 5 adds the chat call to them)
- [x] `ENCRYPTION_KEY` validated at startup (64 hex characters)
- [x] Smoke tests: `src/providers/providers.spec.ts` (3 tests)

**How it works (in plain words)**

- **Providers are managed by admins, not users.** The platform owns the API keys, and users just pick a provider and model from `GET /providers`. This is how a paid multi-AI product works: users never need their own keys.
- **Keys are encrypted at rest.** Before a key is saved it is encrypted with AES-256-GCM using `ENCRYPTION_KEY` from the environment. The database holds only `v1:<iv>:<tag>:<ciphertext>`, so a stolen database backup doesn't reveal the keys. GCM also detects tampering: a modified value fails to decrypt instead of producing garbage. The API never returns the key, only its last 4 characters so an admin can tell keys apart.
- **Adapters.** Each vendor has its own small adapter class (OpenAI, Anthropic, Gemini). They differ in URL and auth header, and all implement the same interface. The rest of the code never checks which vendor it is talking to. Adding a new vendor means one new class and one line in the registry.
- **Default provider rule.** While any provider is enabled, exactly one enabled provider is the default. The first one added becomes default automatically. If the default is disabled or deleted, the oldest enabled provider takes over. A disabled provider can't be made default.
- **Health check.** This makes a real, cheap, authenticated call to the vendor (list models) with a 15-second timeout. The result (HEALTHY/UNHEALTHY, the vendor's reason, latency) is stored on the provider. It never crashes: a bad key simply shows `UNHEALTHY — Invalid or unauthorized API key (HTTP 401)`. Rotating the key or changing the URL resets the status to `UNKNOWN`.
- **Deleting a provider** keeps past chats. Their link to the provider is simply set to empty.

**Test guide** (log in as `admin@echogpt.local` / `Admin12345`)

| # | Do this | Expect |
| --- | --- | --- |
| 1 | As a normal user: `GET /admin/providers` | **403** "Insufficient role" |
| 2 | As admin: `POST /admin/providers` with the example body (OpenAI) | **201** — `isDefault: true` (first one), `apiKeyHint: "••••xxxx"`, no key in the response |
| 3 | Add Anthropic: `{ "name": "Claude", "type": "ANTHROPIC", "apiKey": "sk-ant-test-1234", "defaultModel": "claude-sonnet-5" }` | **201**, `isDefault: false` |
| 4 | Same name again | **409** "A provider with this name already exists" |
| 5 | `POST /admin/providers/{Claude id}/default` | **200** Claude is default; `GET /admin/providers` shows OpenAI is not |
| 6 | `POST /admin/providers/{OpenAI id}/health-check` | **200** with `health.status: "UNHEALTHY"` and "Invalid or unauthorized API key (HTTP 401)…" — a real reply from OpenAI |
| 7 | `PATCH /admin/providers/{id}` `{ "apiKey": "sk-new-key-9876" }` | hint becomes `••••9876`, health resets to `UNKNOWN` |
| 8 | `POST /admin/providers/{Claude id}/disable` | Claude disabled, OpenAI becomes default again automatically |
| 9 | As a normal user: `GET /providers` | only enabled providers; fields are id, name, type, models, default — no key |
| 10 | `DELETE /admin/providers/{id}` | **200** "Provider deleted" |

With a **real** API key, step 6 returns `HEALTHY` with the latency.

---

## Phase 5 — Chat API ✅

**Endpoints** (Swagger tag **Chat**, all need login)

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/chat/messages` | Send a prompt, get the AI reply (new or existing conversation) |
| GET | `/chat/conversations?page=&limit=` | My conversations, most recent first (paginated) |
| GET | `/chat/conversations/{id}` | One conversation with all its messages |
| PATCH | `/chat/conversations/{id}` | Rename |
| DELETE | `/chat/conversations/{id}` | Delete with its messages |

**Checklist**

- [x] Send prompt / receive AI response through the provider adapters (real HTTP calls)
- [x] Provider selection (`providerId`) and model selection (`model`), with sensible fallbacks
- [x] Conversation history: list (paginated), view, rename, delete
- [x] Last 20 messages sent to the AI as context
- [x] Daily chat limit enforced (429); failed AI calls return 502 and use no quota
- [x] Mock OpenAI-compatible server for demos without API keys (`npm run mock:ai`)
- [x] Smoke tests: `src/chat/chat.spec.ts` (4 tests)

**How it works (in plain words)**

- **One endpoint to chat.** Leave out `conversationId` and a new conversation is created, titled from your first message. Send it and the chat continues. The last 20 messages go to the AI with the new prompt, so it remembers what was said.
- **Which AI answers?** If you send a `providerId`, that provider answers (it must exist and be enabled). Otherwise the conversation keeps the provider it already uses, and a brand-new chat uses the default. The model works the same way: the one you ask for (it must be in that provider's list), else the one the chat already uses, else the provider's default model.
- **Same code for every vendor.** The chat service builds one standard request. The adapter for OpenAI, Anthropic or Gemini converts it to that vendor's format: Anthropic wants the system prompt as a separate field, and Gemini calls the assistant "model". The adapter also reads the reply and token counts back.
- **Order of work:** check the daily limit (429 if used up), call the AI, and only if that succeeds save the question, the answer and one usage record together in a single database transaction. If the AI call fails, the user gets **502** with a short reason, and nothing is saved or counted. The full vendor error goes to the server log.
- **Privacy.** Every lookup is filtered by the logged-in user. Someone else's conversation returns **404**, not 403, so ids can't even be confirmed to exist.
- **Stored per reply:** model, prompt/completion tokens and response time, for the admin analytics in Phase 7.
- **Mock AI.** `npm run mock:ai` starts a small local server that speaks the OpenAI API and echoes your prompt. It also says how many earlier messages it received, which proves the context works. Add it as a provider with `baseUrl: http://localhost:4010/v1`.

**Test guide**

Setup: run `npm run mock:ai` in a second terminal. As admin, add the provider below (or reuse the existing **Mock AI** one):
`{ "name": "Mock AI", "type": "OPENAI", "apiKey": "mock-key-1234", "defaultModel": "mock-echo", "models": ["mock-echo", "mock-smart"], "baseUrl": "http://localhost:4010/v1" }`

| # | Do this (as a normal user) | Expect |
| --- | --- | --- |
| 1 | `GET /providers` → copy the Mock AI `id` | listed with models `mock-echo`, `mock-smart` |
| 2 | `POST /chat/messages` `{ "message": "What is REST?", "providerId": "<mock id>" }` | **200** — reply `[mock mock-echo] You said: "What is REST?" … 0 earlier message(s)`; `usage.remaining` 19 |
| 3 | Same with `"conversationId": "<id from step 2>"` and a new message (no providerId) | reply says **2 earlier message(s)** — the context works; same provider kept |
| 4 | Add `"model": "mock-smart"` | reply from `mock-smart`; later messages keep it |
| 5 | `"model": "gpt-9"` | **400** listing the allowed models |
| 6 | `"providerId": "<the OpenAI id with a fake key>"` | **502** "AI provider "OpenAI" failed: Invalid or unauthorized API key (HTTP 401)"; usage unchanged |
| 7 | `GET /chat/conversations` | your chat with `messageCount`, newest first |
| 8 | `GET /chat/conversations/{id}` | messages in order: user, assistant, user, assistant… |
| 9 | `PATCH /chat/conversations/{id}` `{ "title": "My chat" }` | renamed |
| 10 | Log in as another user, `GET /chat/conversations/{same id}` | **404** |
| 11 | Send more than 20 messages in one day on Free | **429** "Daily chat limit reached (20/20)…" |
| 12 | `DELETE /chat/conversations/{id}` | **200**; `GET` it again → **404** |

---

## Phase 6 — Web Search API ✅

**Endpoints** (Swagger tag **Web Search**, all need login)

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/search` | Search DuckDuckGo + optional AI summary (`summarize`, `providerId`) |
| GET | `/search/history?page=&limit=` | My past searches, newest first |
| GET | `/search/history/{id}` | One past search with its saved results and summary |
| DELETE | `/search/history/{id}` | Delete one |
| DELETE | `/search/history` | Clear all my history |
| GET | `/search/recent?limit=` | Latest distinct queries |
| GET | `/search/suggestions?q=` | Suggestions while typing (my history + DuckDuckGo autocomplete) |

**Checklist**

- [x] Search query (DuckDuckGo Instant Answer, free, no key)
- [x] AI-assisted: optional summary with citations from any chat provider
- [x] Search history (paginated), view, delete one, clear all
- [x] Recent searches (repeats collapsed)
- [x] Search suggestions (own history first, then web autocomplete)
- [x] Daily search limit enforced (429)
- [ ] ~~Search result caching~~ (bonus, skipped — the `search_cache` table is ready for it)
- [x] Smoke tests: `src/search/search.spec.ts` (5 tests)

**How it works (in plain words)**

- **The search engine.** DuckDuckGo's free Instant Answer API gives a topic summary (often from Wikipedia), official links and related topics. We turn that into a clean list of up to 10 results `{ title, url, snippet, source }`, with duplicates removed. It is not a full web index: topics ("NestJS", "Bangladesh") work well, but questions ("what is rest api") usually return 0 results. That's a limit of the free API, not an error. Swapping in a paid engine later means replacing one class (`DuckDuckGoClient`).
- **AI-assisted.** Unless `summarize` is false, the results are numbered and sent to an AI provider, which writes a 2–4 sentence answer citing them like [1]. It's the same adapters as chat, so any provider works.
- **Graceful failure.** If the summary fails (bad key, AI down), the search **still succeeds**: you get the results, `summary: null` and a `summaryError` saying why. Only an unreachable search engine fails the request (**502**), and then nothing is saved or counted. A wrong `providerId` is rejected before any work is done.
- **History is a snapshot.** Each search stores its results and summary, so reopening it later shows exactly what you saw, even if the web has changed.
- **Recent vs history.** History lists every search. Recent collapses repeats, so "NestJS" and "  nestjs " count as the same query because queries are normalized: trimmed, spaces collapsed, lower-cased.
- **Suggestions** show your own matching past searches first, then DuckDuckGo autocomplete. If autocomplete is down, you still get your history. Suggestions don't count toward any limit.
- **Quirk handled.** DuckDuckGo sometimes answers mixed-case queries with an empty body, so queries are sent lower-cased and an empty reply means "no results".

**Test guide**

For a summary you can read, use the Mock AI provider (`npm run mock:ai`). The mock just echoes the prompt it was given, which shows the numbered results the AI receives. A real provider would write a proper answer.

| # | Do this (as a normal user) | Expect |
| --- | --- | --- |
| 1 | `POST /search` `{ "query": "NestJS", "providerId": "<Mock AI id>" }` | **200** — ~4 results (Wikipedia first), `summary` from Mock AI, `usage.remaining` 9 |
| 2 | `{ "query": "Bangladesh", "providerId": "<OpenAI id with fake key>" }` | **200** — results returned, `summary: null`, `summaryError` "…Invalid or unauthorized API key (HTTP 401)" |
| 3 | `{ "query": "what is rest api", "summarize": false }` | **200** — `resultCount: 0` (Instant Answer limitation), no summary |
| 4 | `{ "query": "  nestjs  ", "summarize": false }` | **200** — same results as step 1 |
| 5 | `GET /search/history` | all 4 searches, newest first |
| 6 | `GET /search/history/{id from step 1}` | saved results + summary |
| 7 | `GET /search/recent` | `nestjs`, `what is rest api`, `Bangladesh` — NestJS appears once |
| 8 | `GET /search/suggestions?q=ne` | `nestjs` (source `history`) first, then web suggestions |
| 9 | Another user: `GET /search/history/{same id}` | **404** |
| 10 | More than 10 searches in a day on Free | **429** "Daily search limit reached…" |
| 11 | `DELETE /search/history/{id}`, then `DELETE /search/history` | "Search deleted", then "Deleted N search(es)" |

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
