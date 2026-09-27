# EchoGPT Backend REST API

Backend for the [EchoGPT – Multi AI Chat](https://chromewebstore.google.com/detail/echogpt-multi-ai-chat-sid/negimdcamohmoheiifgecbjgjepkcfhj) Chrome extension, built with **NestJS**, **PostgreSQL**, **Prisma** and **Swagger (OpenAPI)**.

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
  common/                # shared filters, DTOs and decorators
  health/                # GET /api/v1/health
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

### 3. Start PostgreSQL

```bash
docker compose up -d db
```

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
| `npm run db:seed` | Seed roles and plans |
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
