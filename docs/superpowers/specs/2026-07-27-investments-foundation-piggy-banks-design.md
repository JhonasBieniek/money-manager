# Investments Foundation & Piggy Banks (Cofrinhos) — Design

**Goal:** Let users track net worth (`patrimônio`) for the first time: register
investment accounts and fixed-income (`renda fixa`) positions with manually
maintained values, see a total patrimony summary, and — the actual feature
request that motivated this round — allocate part of that patrimony into
named **cofrinhos** (piggy banks), each tied to a goal that may or may not
have a monetary target.

**Scope of this round:** roadmap Feature 20 phase **20a only** (foundation:
accounts + fixed-income holdings CRUD, patrimony summary — no automatic
quotes) plus Feature **20.5 in full** (cofrinhos). Full feature context and
rationale for every table/enum/route below lives in `planning/ROADMAP.md`
§"Feature 20 — Investimentos e patrimônio" and §"Feature 20.5 — Cofrinhos
(metas de patrimônio)" — that file is untracked/gitignored by design (it's a
planning doc for a separate, larger multi-repo effort), so this spec restates
everything needed to implement this round without depending on it.

**Explicitly out of scope, deferred to future rounds (see §4):** automatic
quotes for variable-income (`renda variável`) positions (Brapi/CoinGecko),
`investment_snapshots` / evolution charts, IPCA/CDI benchmarks, and any E2E
tests.

**Architecture:** Two new, mutually isolated modules, following the exact
pattern already used by `debts` and `goals`:

- `apps/api/src/modules/investments/` — investment accounts, fixed-income
  holdings, and the patrimony summary aggregation.
- `apps/api/src/modules/piggy-banks/` — cofrinhos and their deposit/withdraw
  transaction history.

`patrimony.service` (inside the `investments` module) reads from both
`investment_holdings` and `piggy_banks` to compute totals, but neither module
otherwise imports the other, and neither has any FK or side-effect into
`expenses`, `incomes`, `goals`, `debts`, or `credit_cards` — same "ilha de
domínio" isolation rule the roadmap already establishes for this whole area.
Patrimony summary is computed with a real-time aggregation query on every
request (no caching/materialized totals) — the same pattern
`dashboard.service` and `goals.service` already use, appropriate at this
app's scale (single user, low row counts per table).

**Tech stack:** Same as the rest of the app — Express + Drizzle + Zod on the
API, React + `apiFetch` on the web. No new runtime dependencies. `lucide-react`
(already a dependency) supplies the piggy bank icon set. No new npm packages
needed this round (charting libraries are deferred along with the charts
themselves).

---

## 1. Backend

### 1.1 Data model (`packages/db`)

New enums:

- `investment_account_type`: `brokerage | crypto | fixed_income | pension | real_estate | cash | other`
- `asset_class`: `stocks | fii | fixed_income | crypto | fund | real_estate | cash | other` — created now, **unused** this round (every `investment_holdings.asset_class` stays `null`); exists so Feature 20b (variable income) doesn't need a second migration to add it.
- `income_type`: `fixed_income | variable_income` — only `fixed_income` is insertable this round (enforced in the service layer, not a DB constraint — see §1.5).
- `pricing_source`: `manual | brapi | coingecko | yahoo | alpha_vantage` — only `manual` is used/insertable this round.
- `piggy_bank_status`: `active | completed`
- `piggy_bank_transaction_type`: `deposit | withdrawal`

**`investment_accounts`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk `users` | |
| `name` | text not null | ex. "XP Investimentos" |
| `type` | investment_account_type not null | |
| `institution` | text nullable | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**`investment_holdings`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `account_id` | uuid fk `investment_accounts` not null | |
| `user_id` | uuid fk `users` not null | denormalized for ownership checks, matches roadmap §20.4 |
| `symbol` | text not null | free name this round, e.g. "CDB Banco X" |
| `income_type` | income_type not null, default `fixed_income` | service rejects `variable_income` on write this round (§1.5) |
| `asset_class` | asset_class nullable | unused this round, always `null` |
| `quantity` | numeric(18,8) not null, default `1` | always `1` this round |
| `average_cost_cents` | bigint nullable | unused this round (variable-income only) |
| `current_unit_value_cents` | bigint not null | total value, since `quantity = 1` |
| `maturity_date` | date nullable | reminder/sort only, never affects calculations |
| `pricing_source` | pricing_source not null, default `manual` | always `manual` this round |
| `manual_override` | boolean not null, default `false` | unused this round (variable-income only) |
| `last_valuation_at` | timestamptz not null, default `now()` | bumped on create and on every valuation update |
| `last_quote_error` | text nullable | unused this round |
| `notes` | text nullable | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**`piggy_banks`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk `users` | |
| `name` | text not null | |
| `icon` | text nullable | a `lucide-react` icon name (e.g. `"plane"`), not a raw emoji — see §2 |
| `current_amount_cents` | bigint not null, default `0` | never negative |
| `target_amount_cents` | bigint nullable | `null` = non-monetary goal |
| `goal_description` | text nullable | free-text purpose |
| `target_date` | date nullable | display/sort only |
| `status` | piggy_bank_status not null, default `active` | manual toggle, never auto-set |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**`piggy_bank_transactions`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `piggy_bank_id` | uuid fk `piggy_banks` not null | |
| `user_id` | uuid fk `users` not null | |
| `type` | piggy_bank_transaction_type not null | `deposit` \| `withdrawal` |
| `amount_cents` | bigint not null | always positive; sign comes from `type` |
| `note` | text nullable | |
| `occurred_at` | timestamptz not null, default `now()` | |
| `created_at` | timestamptz not null, default `now()` | |

Money is always integer cents; dates are always `"YYYY-MM-DD"` strings over
the wire — same conventions as the rest of the codebase.

### 1.2 Module `investments` — API

| Method | Route | Body / Notes |
|---|---|---|
| GET | `/v1/investment-accounts` | list, no pagination (low row count expected, same as `goals`) |
| POST | `/v1/investment-accounts` | `{ name, type, institution? }` |
| GET | `/v1/investment-accounts/:id` | |
| PATCH | `/v1/investment-accounts/:id` | partial: `name`, `type`, `institution` |
| DELETE | `/v1/investment-accounts/:id` | soft delete; cascades to soft-delete its holdings |
| GET | `/v1/investment-holdings` | optional `?accountId=` filter |
| POST | `/v1/investment-holdings` | `{ accountId, symbol, currentUnitValueCents, maturityDate?, notes? }` — always created with `incomeType: "fixed_income"` |
| GET | `/v1/investment-holdings/:id` | |
| PATCH | `/v1/investment-holdings/:id` | `symbol`, `maturityDate`, `notes` — **not** value (see next row) |
| DELETE | `/v1/investment-holdings/:id` | soft delete |
| PATCH | `/v1/investment-holdings/:id/valuation` | `{ currentUnitValueCents }` — dedicated endpoint so `last_valuation_at` is always updated exactly when value changes |
| GET | `/v1/patrimony/summary` | see response shape below |

`GET /v1/patrimony/summary` response (matches the full roadmap contract so
the shape doesn't break when Features 20b/20c land later):

```typescript
{
  totalAssetsCents: number;       // investmentsCents + piggyBanksCents
  investmentsCents: number;       // sum of investment_holdings only
  piggyBanksCents: number;        // sum of piggy_banks only
  byAssetClass: {
    class: "fixed_income_group";
    label: "Renda fixa";
    totalCents: number;
    percentage: number;
  }[];                            // always one bucket this round
  byAccount: { accountId: string; name: string; totalCents: number }[];
  lastUpdatedAt: string | null;   // max(last_valuation_at) across holdings
  quotesStale: false;             // hardcoded this round — no variable-income positions exist yet
  upcomingMaturities: {
    holdingId: string;
    name: string;
    maturityDate: string;
    totalCents: number;
  }[];                            // holdings maturing within 90 days
}
```

### 1.3 Module `piggy-banks` — API

| Method | Route | Body / Notes |
|---|---|---|
| GET | `/v1/piggy-banks` | optional `?status=active\|completed` filter; no pagination (low row count expected, same as investment accounts) |
| POST | `/v1/piggy-banks` | `{ name, icon?, targetAmountCents?, goalDescription?, targetDate? }` |
| GET | `/v1/piggy-banks/:id` | |
| PATCH | `/v1/piggy-banks/:id` | partial: `name`, `icon`, `targetAmountCents`, `goalDescription`, `targetDate` |
| DELETE | `/v1/piggy-banks/:id` | soft delete; `piggy_bank_transactions` rows are preserved (history isn't lost, just stops counting toward patrimony) |
| POST | `/v1/piggy-banks/:id/deposit` | `{ amountCents, note? }` |
| POST | `/v1/piggy-banks/:id/withdraw` | `{ amountCents, note? }` — validates against `current_amount_cents` |
| PATCH | `/v1/piggy-banks/:id/status` | `{ status: "active" \| "completed" }` — always manual, toggles either direction (a completed piggy bank can be reopened to `active`) |
| GET | `/v1/piggy-banks/:id/transactions` | paginated history |

### 1.4 Deferred endpoints (not built this round)

`PATCH /v1/investment-holdings/:id/quote-mode`, `POST .../refresh-quote`,
`POST /v1/investments/refresh-quotes`, `GET /v1/patrimony/history`,
`GET /v1/patrimony/benchmarks`, `POST /v1/patrimony/snapshots` — all exist
only to serve variable-income quoting or charts (§4).

### 1.5 Business rules

- `piggy_banks.current_amount_cents` never goes negative — `withdraw`
  validates `amountCents <= current_amount_cents` before applying.
- `amountCents` on deposit/withdraw must be `> 0`.
- `piggy_banks.target_amount_cents`, if provided (create or update), must be
  `> 0`.
- `investment_holdings.current_unit_value_cents` must be `>= 0` (create and
  valuation update).
- `POST /v1/investment-holdings` rejects any `incomeType` other than
  `"fixed_income"` with `400 BadRequestError` ("Renda variável ainda não
  suportada") — this is a service-layer guard, not a DB `CHECK` constraint,
  so Feature 20b can start allowing it without a migration.
- Deleting an `investment_accounts` row soft-deletes its `investment_holdings`
  rows in the same transaction (logical cascade, matches roadmap §20.6).
- A completed piggy bank (`status = "completed"`) still accepts deposits and
  withdrawals and still counts toward patrimony — completion is just a
  user-set badge, not a lock.
- No integration with `expenses`/`incomes`: depositing into or withdrawing
  from a piggy bank never creates, edits, or deletes an expense/income row.

### 1.6 `packages/types` and `packages/utils`

- `packages/types/src/api/investments.ts` (new) — `InvestmentAccount`,
  `InvestmentAccountType`, `InvestmentHolding`, `IncomeType`,
  `PatrimonySummary`, and the request DTOs for each endpoint in §1.2.
- `packages/types/src/api/piggy-banks.ts` (new) — `PiggyBank`,
  `PiggyBankStatus`, `PiggyBankTransaction`, `PiggyBankTransactionType`, and
  the request DTOs for each endpoint in §1.3.
- `packages/utils` — no changes. Nothing this round needs date-math or
  formatting helpers beyond what already exists (unlike Feature 19's
  `installment-schedule.ts`, there's no recurring schedule to generate here).

### 1.7 Errors

Same conventions as `debts` (which this session just worked on): `AppError`
subclasses with Portuguese messages, `{ error, code }` JSON shape via the
existing error middleware.

| Scenario | Error |
|---|---|
| Account/holding/piggy bank not found, or belongs to another user | `404 NotFoundError` — "Conta não encontrada" / "Posição não encontrada" / "Cofrinho não encontrado" |
| Withdrawal amount exceeds `current_amount_cents` | `400 BadRequestError` — "Saldo insuficiente no cofrinho" |
| `amountCents <= 0` on deposit/withdraw | `400 BadRequestError` |
| `targetAmountCents <= 0` when provided | `400 BadRequestError` |
| `currentUnitValueCents < 0` on holding create/valuation | `400 BadRequestError` |
| `incomeType: "variable_income"` on holding create | `400 BadRequestError` — "Renda variável ainda não suportada" |

---

## 2. Frontend (`apps/web`)

- `DashboardLayout` — add a **Patrimônio** nav item routing to
  `/dashboard/investments` (existing component, minor edit).
- `InvestmentsPage` (new, `/dashboard/investments`) — composes the sections
  below.
- `PatrimonySummaryCards` — total patrimony, investments-vs-cofrinhos split,
  last updated timestamp, upcoming-maturity alerts (from
  `upcomingMaturities`).
- `InvestmentAccountSection` — holdings grouped by account; create/edit/
  delete account actions.
- `HoldingRow` — name, value, maturity date, actions (edit, update value,
  delete). Fixed-income layout only.
- `InvestmentAccountFormModal` — CRUD for `name` / `type` / `institution`.
- `HoldingFormModal` — CRUD for `symbol` / `currentUnitValueCents` /
  `maturityDate` / `notes`.
- `ValuationModal` — the "Atualizar valor" shortcut (value only, hits the
  dedicated valuation endpoint).
- `PiggyBanksSection` — grid of piggy bank cards, on the same page.
- `PiggyBankCard` — name, icon, current value, progress bar when
  `targetAmountCents` is set, elapsed-time display when it isn't, completed
  badge. When `current_amount_cents` reaches `target_amount_cents`, the card
  shows an inline "Marcar como concluído?" prompt rather than silently
  waiting for the user to notice the full progress bar — status still only
  changes on explicit confirmation (§1.5).
- `PiggyBankFormModal` — CRUD for `name` / icon / target / description /
  target date. Icon field is a picker over a fixed set of ~24 `lucide-react`
  icons (travel, home, car, education, gift, emergency-fund, generic
  piggy-bank, etc.) rather than free-text emoji entry, for visual consistency
  with icons used elsewhere in the app.
- `PiggyBankTransactionModal` — deposit / withdraw, amount + optional note.

Not built this round: `PiggyBankHistoryDrawer` (transaction history has no
dedicated UI yet — the data and `GET .../transactions` endpoint exist from
day one, so this is pure UI backlog, not a data gap), and all charting
components (§4).

---

## 3. Testing plan

**Unit** (`*.service.test.ts`, mocked Drizzle, same pattern as
`debts.service.test.ts`):

- `investments.service.test.ts` — patrimony summary aggregation math
  (holdings sum + piggy banks sum), `upcomingMaturities` 90-day filtering,
  cascade soft-delete of holdings when their account is deleted, rejection of
  `incomeType: "variable_income"`.
- `piggy-banks.service.test.ts` — deposit increments balance, withdrawal
  decrements balance, withdrawal above balance rejected, `targetAmountCents`
  validation, status toggle is always manual (never auto-flipped by a
  deposit that reaches the target).

**Integration** (`apps/api/tests/integration/`, real Postgres):

- `investment-accounts.integration.test.ts` — CRUD, ownership isolation
  (404 for another user's account).
- `investment-holdings.integration.test.ts` — CRUD, the dedicated valuation
  endpoint, cascade delete when the parent account is deleted.
- `piggy-banks.integration.test.ts` — CRUD, deposit/withdraw including the
  insufficient-balance 400 case, status toggle, transaction history listing.
- `patrimony.integration.test.ts` — creates an account + holding and a piggy
  bank through real HTTP calls, asserts `GET /v1/patrimony/summary` sums both
  correctly end-to-end.

No E2E this round (Playwright / Feature 16 infrastructure isn't scoped in
yet).

---

## 4. Out of scope (deferred to future rounds)

- **Feature 20b** — automatic quotes for variable-income positions (Brapi
  for B3, CoinGecko for crypto), `investment_quote_cache`, refresh
  endpoints, manual-override toggle.
- **Feature 20c** — `investment_snapshots`, `benchmark_rates`,
  `AllocationDonutChart`, `PatrimonyEvolutionChart`,
  `BenchmarkComparisonChart`, IPCA/CDI comparisons. Consequence of deferring
  this: no patrimony history accumulates until snapshot capture is actually
  built, so the eventual evolution chart starts with no backfilled past data.
- **Feature 20d / Feature 16** — Playwright E2E coverage.
- Any variable-income (`renda variável`) holding, even with a manually-typed
  value — explicitly deferred alongside quoting (F20b), per roadmap §20.12's
  own phase boundary.
- `PiggyBankHistoryDrawer` UI (data/endpoint exist; no screen yet).
- Everything already listed as out-of-scope for Feature 20 itself in the
  roadmap: no integration with expenses/incomes/goals/debts/credit cards, no
  net worth minus liabilities, no brokerage note import, no automatic
  rebalancing, no IR/DARF.
