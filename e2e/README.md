# E2E tests (Playwright)

Critical **browser** journeys — things HTTP integration cannot reach (CSRF, cookies, sessionStorage, cross-page navigation, dashboard aggregation).

## Test pyramid

| Layer | Responsibility |
|-------|----------------|
| **E2E** | Few multi-page flows with real product value |
| **Integration** | Business rules, Postgres, HTTP contracts |
| **Unit** | Schemas, services, `billing-cycle` |

**Rule:** if the API already enforces a rule and the browser only repeats form validation, it does **not** belong in E2E.

## Prerequisites

```bash
docker compose up -d postgres
pnpm test:e2e
```

Loads `.env` from the repo root; local Postgres defaults to port **15432**.

## Specs (8 tests)

| Spec | What it protects |
|------|------------------|
| `auth.spec.ts` (4) | Register/login, HttpOnly cookie, invalid credentials, **protected route → login** |
| `expenses.spec.ts` (1) | Expense → list → total on dashboard |
| `incomes.spec.ts` (1) | Income → list → total on dashboard |
| `dashboard.spec.ts` (1) | **Balance = incomes − expenses** in the same month (UI aggregation) |
| `credit-cards.spec.ts` (1) | Card → credit expense → **list + statement** (cross-module integration) |

### Out of E2E scope (Jest)

Form validations (category, zero amount), goals at 100%, tags CRUD, statement close/reopen, billing-cycle, Telegram.

## Run

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

`E2E_REUSE_SERVERS=1` — reuse an already-running API/Vite dev server.

## CI

The `e2e` job in `.github/workflows/ci.yml` runs after `ci`: Postgres → migrate → Playwright → trace/screenshot on failure.
