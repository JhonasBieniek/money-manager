# Money Manager

Portfolio-grade **personal finance platform** with multi-user auth, goal-based budgeting, hierarchical tags, and a **Telegram voice bot** that turns spoken expenses into ledger entries — built to demonstrate production-minded full-stack engineering.

## Architecture overview

```
┌─────────────┐     JWT (sessionStorage)   ┌──────────────────────────────────────────┐
│  Vite SPA   │◄──────────────────────────►│  Express 5 API                           │
│  React 19   │     refresh cookie (HttpOnly)│  Drizzle ORM · PostgreSQL 16           │
│  Tailwind 4 │     CSRF (x-xsrf-token)    │  Zod validation · helmet · rate-limit   │
└──────┬──────┘                             └───────────────┬──────────────────────────┘
       │                                                    │
       │                                                    │ internal API key
       │                                         ┌──────────▼──────────┐
       │                                         │  Grammy Telegram bot │
       │                                         │  polling (dev) /     │
       │                                         │  webhook (prod)      │
       │                                         └──────────┬──────────┘
       │                                                    │ HTTP
       │                                         ┌──────────▼──────────┐
       │                                         │  apps/stt (Python)   │
       │                                         │  faster-whisper local │
       │                                         │  model baked in image │
       └─────────────────────────────────────────┴──────────────────────┘

```

**Design principles**

- **Money in cents** — all amounts stored as integers; no floating-point ledger math.
- **User isolation** — every row scoped by `user_id`; JWT on all business routes.
- **Bot boundary** — Telegram bot never touches the database; it calls internal HTTP endpoints with a shared secret.
- **Local speech** — Whisper runs in a dedicated Python service; the model is embedded at Docker build time (no runtime Hugging Face downloads).
- **Soft delete** — expenses and incomes keep audit-friendly `deleted_at` timestamps.

## Stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Vite 6, React 19, React Router 7, Tailwind CSS 4, Framer Motion |
| API | Express 5, Zod 3, jose (JWT), bcrypt, helmet, express-rate-limit |
| Database | PostgreSQL 16 + Drizzle ORM (SQL migrations) |
| Shared | `@money-manager/types` (contracts), `@money-manager/utils` (ids, dates, auth helpers) |
| Bot | Grammy (TypeScript), long-polling in dev / webhook in production |
| STT | Python 3.12, FastAPI, faster-whisper (`apps/stt`) |
| Testing | Jest + ts-jest (~138 tests), supertest integration against real Postgres in CI |
| E2E | Playwright (Chromium) — register, login, expense CRUD, dashboard |
| CI / security | GitHub Actions (lint, build, test, migrate, E2E), CodeQL |

## Technical highlights

### Domain model

| Concept | Behavior |
|---------|----------|
| **Goals** | Six `goal_category` buckets with percentage sliders; usage computed from expenses in each category |
| **Tags** | Hierarchical tags (parent/child); many-to-many on expenses and incomes |
| **Expenses** | Require `goalCategory` in the UI; bot-created rows may start uncategorized (`goalCategory` null) |
| **Incomes** | Source enum (salary, freelance, investment, gift, other) + optional tags |
| **Dashboard** | Monthly summary (income, expense, balance, goal usage) + rolling history (3M / 6M / 1Y) |
| **Telegram link** | Time-limited tokens per user (`/start <token>`); no shared static link code |

### Auth & security

- **Sessions** — short-lived JWT access token in `sessionStorage`; refresh token in `HttpOnly` cookie with rotation on `/v1/auth/refresh`.
- **CSRF** — double-submit cookie (`_csrf` + `x-xsrf-token`) on mutating requests.
- **Passwords** — bcrypt hashing; generic error messages on login to reduce enumeration.
- **Internal API** — `x-internal-api-key` for bot → API expense creation and Telegram account linking.
- **HTTP hardening** — helmet, CORS allowlist, global rate limiting.

### Telegram voice pipeline

1. **Voice message** — user sends audio to the bot (linked account required).
2. **Download** — bot fetches the file from Telegram CDN (retry + timeout).
3. **Transcribe** — `POST /transcribe` on `apps/stt` (local faster-whisper, Portuguese default).
4. **Parse** — utterance parser extracts amount + description (and optional payment hints).
5. **Persist** — `POST /v1/internal/expenses` with idempotency key per message; `source: telegram_whisper`, payment method **PIX**.
6. **Categorize later** — web app shows uncategorized items in the header bell panel; user assigns `goalCategory` + tags.

### Frontend UX

- **Transaction modals** — create/edit expenses and incomes without leaving list views.
- **List filters** — month/year, description search, tag filter; API returns filtered totals (`meta.totalAmountCents`).
- **Dashboard** — separate monthly filter for summary cards and goals; history chart keeps its own 3M/6M/1Y selector.
- **Telegram settings** — link card polls account status after code generation (no manual refresh).

## Project layout

```
money-manager-v3/
├── apps/
│   ├── api/                 # Express REST API
│   ├── web/                 # Vite + React SPA (nginx in Docker)
│   ├── bot/                 # Grammy Telegram bot
│   └── stt/                 # Python faster-whisper service
├── packages/
│   ├── db/                  # Drizzle schema + migrations
│   ├── types/               # Shared TypeScript contracts
│   └── utils/               # newId, dates, password helpers
├── e2e/                     # Playwright E2E (auth, expenses)
├── docker-compose.yml       # postgres, api, web, bot, stt
├── .github/workflows/       # CI + CodeQL
├── turbo.json
└── .env.example
```

## Quick start

**Requirements:** Node.js 22+, pnpm 10+, Docker + Compose (recommended).

```bash
cp .env.example .env
# Required: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, SETTINGS_ENCRYPTION_KEY (openssl rand -base64 32)
# Optional: TELEGRAM_BOT_TOKEN for voice expenses
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web | http://localhost:5173 |
| API | http://localhost:3001 |
| API health | http://localhost:3001/health |
| PostgreSQL (host) | localhost:15432 |
| STT (debug) | http://localhost:8001/health |

The browser must use `VITE_API_URL=http://localhost:3001` (host URL, not Docker service names).

**Without full Docker** (API + web on host, DB in Compose):

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm --filter @money-manager/db run db:migrate:runtime
pnpm dev   # turbo dev — api, web, bot, stt per package scripts
```

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/v1/auth/register` · `/v1/auth/login` | Register / login; sets refresh cookie |
| POST | `/v1/auth/refresh` · `/v1/auth/logout` | Rotate session / clear cookie |
| GET | `/v1/auth/csrf` | Issue CSRF cookie |
| GET | `/v1/me` | Current user profile |
| GET · POST | `/v1/tags` | List / create hierarchical tags |
| GET · PUT | `/v1/goals` | Read / update goal percentages |
| GET · POST | `/v1/expenses` | List (filters) / create expense |
| GET · PATCH · DELETE | `/v1/expenses/:id` | Read / update / soft-delete |
| GET | `/v1/expenses/uncategorized` | Bot expenses missing `goalCategory` |
| PATCH | `/v1/expenses/:id/categorize` | Assign category + tags |
| GET · POST | `/v1/incomes` | List / create income |
| GET | `/v1/dashboard/summary` | Monthly totals + goal usage (`?year=&month=`) |
| GET | `/v1/dashboard/history` | Rolling history (`?period=3\|6\|12`) |
| POST | `/v1/telegram/link-token` | Generate Telegram link code |
| GET | `/v1/telegram/account` | Linked Telegram account status |

Internal routes (`x-internal-api-key`): `/v1/internal/expenses`, `/v1/internal/telegram/link`.

All business routes except auth entrypoints require `Authorization: Bearer <accessToken>`.

## Quality

```bash
pnpm lint
pnpm build
pnpm test          # Jest across api, bot, db, utils (~138 tests)
pnpm test:e2e      # Playwright — API + web started automatically (needs Postgres)
```

**E2E locally:** start Postgres (`docker compose up -d postgres`), then `pnpm exec playwright install chromium` once and `pnpm test:e2e`. See [e2e/README.md](./e2e/README.md).

CI runs on every push/PR: install → lint → build → migrate → Jest against PostgreSQL 16, then a dedicated **e2e** job (Playwright with API + Vite + Postgres). Failed E2E runs upload HTML report and traces. CodeQL scans TypeScript weekly and on push.

## License

This project is licensed under the MIT License — see [LICENSE](./LICENSE).

---

Read in Portuguese: [README.pt-BR.md](./README.pt-BR.md)
