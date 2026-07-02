# E2E tests (Playwright)

Browser tests for critical user flows: **register → login → create expense → dashboard**.

## Prerequisites

- Node.js 22+ and pnpm 10+
- PostgreSQL reachable at `DATABASE_URL` (default in CI: `localhost:5432`)

For local runs, start Postgres first (Docker Compose exposes port **15432**). The E2E runner loads `.env` from the repo root automatically; if `DATABASE_URL` is absent there, it defaults to port `15432`.

```bash
docker compose up -d postgres
pnpm test:e2e
```

## Run

From the repository root:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts the API (`:3001`) and Vite dev server (`:5173`) automatically unless `E2E_SKIP_WEBSERVER=true`. Set `E2E_REUSE_SERVERS=1` only if you already have test-configured servers running.

To reuse already-running services:

```bash
export DATABASE_URL=postgresql://money_manager:changeme@localhost:15432/money_manager
export E2E_SKIP_WEBSERVER=true
pnpm test:e2e
```

## Structure

| Path | Purpose |
|------|---------|
| `auth.spec.ts` | Register, login, logout, sessionStorage + refresh cookie |
| `expenses.spec.ts` | Create expense modal flow, list + dashboard totals |
| `helpers/` | `registerUser`, `loginUser`, `createExpense`, unique test emails |
| `fixtures.ts` | Shared `authenticatedPage` fixture |

Each run uses a unique e-mail (`e2e-<timestamp>@example.com`) to avoid collisions.

## CI

The `e2e` job in `.github/workflows/ci.yml` runs on every PR after the main `ci` job: Postgres service → migrate → Playwright (Chromium) → upload HTML report and traces on failure.

## Debugging

```bash
pnpm exec playwright test --config e2e/playwright.config.ts --ui
pnpm exec playwright show-report e2e/playwright-report
```

On failure, traces are captured on the first retry (`trace: on-first-retry`) and screenshots are saved under `e2e/test-results/`.
