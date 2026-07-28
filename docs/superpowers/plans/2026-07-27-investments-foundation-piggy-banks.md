# Investments Foundation & Piggy Banks (Cofrinhos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users register investment accounts and fixed-income holdings with manually maintained values, see a patrimony summary, and allocate patrimony into named "cofrinhos" (piggy banks) tied to a goal that may or may not have a monetary target.

**Architecture:** Two new, mutually isolated API modules (`apps/api/src/modules/investments/`, `apps/api/src/modules/piggy-banks/`) following the exact schema/service/controller/routes pattern already used by `debts` and `goals`. The `investments` module is split into three independent route files — `investment-accounts`, `investment-holdings`, `patrimony` — each mounted at its own top-level URL prefix. `patrimony.service.ts` reads directly from the `investment_holdings`, `investment_accounts`, and `piggy_banks` Drizzle tables to compute totals in real time (no caching, no service-to-service imports); no other cross-module coupling exists. Frontend follows the `DebtsPage`/`DebtCard`/`DebtFormModal` composition pattern.

**Tech Stack:** Express + Drizzle + Zod (API), React + `apiFetch` (web), pnpm workspaces + Turborepo, Jest (unit + integration), Postgres. No new runtime dependencies — `lucide-react` (already a dependency) supplies the piggy bank icon set.

**Source spec:** `docs/superpowers/specs/2026-07-27-investments-foundation-piggy-banks-design.md` — restate nothing from it beyond what's copied verbatim below; read it if a task references a section number (e.g. "§1.5") for rationale.

## Global Constraints

- Money is always integer cents (`bigint` DB columns, `number` in TS/JSON). Dates are always `"YYYY-MM-DD"` strings over the wire (Drizzle `date()` columns already return strings, not `Date` objects).
- All new tables use soft delete (`deletedAt` nullable timestamp) — never hard-delete a row. Every list/get query filters `isNull(table.deletedAt)`.
- Every list endpoint in this feature returns `{ items: [...] }` with **no pagination**, except `GET /v1/piggy-banks/:id/transactions`, which uses the same `limit`/`offset` convention as `apps/api/src/modules/expenses/expenses.schema.ts` (`z.coerce.number().int().min(1).max(100).default(20)` for limit, `z.coerce.number().int().min(0).default(0)` for offset) and returns `{ items, meta: { total, limit, offset } }`.
- Errors use the existing `AppError` subclasses (`NotFoundError` 404, `BadRequestError` 400) with Portuguese messages, exactly as `apps/api/src/shared/errors/app-error.ts` already defines. Do not add new error classes.
- Every route is mounted behind the existing `authenticate` middleware (`apps/api/src/shared/middleware/authenticate.js`) and reads the caller's id via `getUserId(req)` (`apps/api/src/shared/types/request.js`). Every query/mutation filters by `userId` — cross-user access must 404, not 403 (matches `debts`/existing modules).
- `GET /v1/patrimony/summary`'s `quotesStale` field is the TypeScript literal type `false` (not `boolean`) — this round never sets it any other way, by design, so a future round changing that is a visible type change.
- **Test file naming:** one test file per service file (`investment-accounts.service.ts` → no test file, `patrimony.service.ts` → `patrimony.service.test.ts`), not the single grouped `investments.service.test.ts` the spec's testing-plan section illustrates — this plan splits the `investments` module into 3 route files (per spec §1.2's 3 separate URL prefixes), so tests mirror that same split. Unit tests only cover pure, DB-free functions (this codebase's actual convention — see `apps/api/src/modules/debts/debts.service.test.ts`); anything that requires the database (cascade deletes, ownership checks, uniqueness) is covered by an integration test instead, never by mocking Drizzle.
- **Resolved spec ambiguity:** spec §1.2's `POST /v1/investment-holdings` body list omits `incomeType`, but §1.5 says the endpoint "rejects any incomeType other than fixed_income." This plan accepts an **optional** `incomeType` field on the create body (defaulting server-side to `"fixed_income"` when omitted) and rejects it with 400 when explicitly `"variable_income"` — this preserves both the documented body shape and the forward-compatibility intent ("so Feature 20b can start allowing it without a migration") stated elsewhere in the spec.
- **Resolved spec ambiguity:** the `InvestmentHolding` API type (packages/types) omits `assetClass`, `averageCostCents`, `pricingSource`, `manualOverride`, `lastQuoteError` — these DB columns exist for Feature 20b forward-compatibility (per spec §1.1) but are always `null`/default this round, so exposing them in the API contract now would be dead weight the frontend has to carry for no behavior. `GET /v1/patrimony/summary` still hardcodes `quotesStale: false` per spec, since that field is part of the spec's explicit forward-compatible response contract.
- No integration with `expenses`, `incomes`, `goals`, `debts`, or `credit_cards` — this feature never creates, reads, updates, or deletes rows in those tables.
- Run `pnpm build` once before starting any task in a fresh worktree (builds `@money-manager/db`, `@money-manager/types` and other workspace deps other packages import from) — the workspace's `postinstall` only auto-builds `@money-manager/types`, not `@money-manager/db`.

## Task Dependency Summary

```
Task 1 (DB schema)  ─┐
Task 2 (types)      ─┴─→ Task 3 (investment-accounts) ─┐
                        Task 4 (investment-holdings)  ─┤
                        Task 5 (patrimony)             ├─→ Task 7 (mount app.ts) ─┬─→ Task 8 (integration: accounts+holdings)
                        Task 6 (piggy-banks)           ─┘                        ├─→ Task 9 (integration: piggy-banks)
                                                                                  └─→ Task 10 (integration: patrimony)
Task 7 done ─→ Task 11 (frontend: accounts+holdings UI) ─┐
Task 7 done ─→ Task 12 (frontend: patrimony+piggy-banks UI) ─┴─→ Task 13 (frontend: page composition + nav/routing + browser verification)
```

Tasks 1 and 2 touch fully disjoint files and have no import relationship — safe to run in parallel. Tasks 3–6 each touch only their own new files (no two of them edit the same file) and each depends only on 1+2 — safe to run in parallel with each other. Task 7 is a single-file edit deliberately kept separate from 3–6 so no two parallel implementers edit `app.ts` at once. Tasks 8–10 are read-only-to-others new test files, safe to parallelize once Task 7 lands. Tasks 11 and 12 touch disjoint component directories, safe to parallelize; Task 13 is the integration point and must run after both.

---

### Task 1: Database schema — investments & piggy-banks tables

**Files:**
- Create: `packages/db/src/schema/investments.ts`
- Create: `packages/db/src/schema/piggy-banks.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generated: `packages/db/migrations/*.sql` (via `drizzle-kit generate`, do not hand-write)

**Interfaces:**
- Consumes: `users` table from `./users.js` (existing).
- Produces: Drizzle table objects `investmentAccounts`, `investmentHoldings`, `piggyBanks`, `piggyBankTransactions` and their `$inferSelect`/`$inferInsert` row types, re-exported from `packages/db`'s barrel (`@money-manager/db`). Every later backend task imports these by name.

- [ ] **Step 1: Create `packages/db/src/schema/investments.ts`**

```typescript
import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const investmentAccountTypeEnum = pgEnum("investment_account_type", [
  "brokerage",
  "crypto",
  "fixed_income",
  "pension",
  "real_estate",
  "cash",
  "other",
]);

export const assetClassEnum = pgEnum("asset_class", [
  "stocks",
  "fii",
  "fixed_income",
  "crypto",
  "fund",
  "real_estate",
  "cash",
  "other",
]);

export const incomeTypeEnum = pgEnum("income_type", [
  "fixed_income",
  "variable_income",
]);

export const pricingSourceEnum = pgEnum("pricing_source", [
  "manual",
  "brapi",
  "coingecko",
  "yahoo",
  "alpha_vantage",
]);

export const investmentAccounts = pgTable(
  "investment_accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: investmentAccountTypeEnum("type").notNull(),
    institution: text("institution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("investment_accounts_user_id_idx").on(t.userId)],
);

export const investmentHoldings = pgTable(
  "investment_holdings",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    incomeType: incomeTypeEnum("income_type").notNull().default("fixed_income"),
    assetClass: assetClassEnum("asset_class"),
    quantity: numeric("quantity", { precision: 18, scale: 8 })
      .notNull()
      .default("1"),
    averageCostCents: bigint("average_cost_cents", { mode: "number" }),
    currentUnitValueCents: bigint("current_unit_value_cents", {
      mode: "number",
    }).notNull(),
    maturityDate: date("maturity_date"),
    pricingSource: pricingSourceEnum("pricing_source")
      .notNull()
      .default("manual"),
    manualOverride: boolean("manual_override").notNull().default(false),
    lastValuationAt: timestamp("last_valuation_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastQuoteError: text("last_quote_error"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("investment_holdings_account_id_idx").on(t.accountId),
    index("investment_holdings_user_id_idx").on(t.userId),
  ],
);
```

- [ ] **Step 2: Create `packages/db/src/schema/piggy-banks.ts`**

```typescript
import {
  bigint,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const piggyBankStatusEnum = pgEnum("piggy_bank_status", [
  "active",
  "completed",
]);

export const piggyBankTransactionTypeEnum = pgEnum(
  "piggy_bank_transaction_type",
  ["deposit", "withdrawal"],
);

export const piggyBanks = pgTable(
  "piggy_banks",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    currentAmountCents: bigint("current_amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    targetAmountCents: bigint("target_amount_cents", { mode: "number" }),
    goalDescription: text("goal_description"),
    targetDate: date("target_date"),
    status: piggyBankStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("piggy_banks_user_id_idx").on(t.userId)],
);

export const piggyBankTransactions = pgTable(
  "piggy_bank_transactions",
  {
    id: uuid("id").primaryKey(),
    piggyBankId: uuid("piggy_bank_id")
      .notNull()
      .references(() => piggyBanks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: piggyBankTransactionTypeEnum("type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("piggy_bank_transactions_piggy_bank_id_idx").on(t.piggyBankId),
    index("piggy_bank_transactions_user_id_idx").on(t.userId),
  ],
);
```

- [ ] **Step 3: Append to `packages/db/src/schema/index.ts`**

Add two lines at the end of the file:

```typescript
export * from "./investments.js";
export * from "./piggy-banks.js";
```

- [ ] **Step 4: Generate the migration**

Run from `packages/db`:

```bash
pnpm run db:generate
```

Expected: a new timestamped `.sql` file appears under `packages/db/migrations/` containing `CREATE TYPE` statements for the 6 new enums and `CREATE TABLE` statements for the 4 new tables. Read the generated file to confirm it matches the schema above (column names, types, FKs, defaults) — do not hand-edit it unless it's wrong, in which case fix the schema file and regenerate.

- [ ] **Step 5: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/db` builds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/investments.ts packages/db/src/schema/piggy-banks.ts packages/db/src/schema/index.ts packages/db/migrations
git commit -m "feat(db): add investments and piggy-banks schema"
```

---

### Task 2: `packages/types` — investments & piggy-banks types

**Files:**
- Create: `packages/types/src/api/investments.ts`
- Create: `packages/types/src/api/piggy-banks.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Consumes: nothing (standalone hand-written interfaces, no import from `@money-manager/db` — matches the existing `debts.ts`/`financial.ts` convention in this package).
- Produces: all request/response DTO types every backend and frontend task in this plan imports from `@money-manager/types`.

- [ ] **Step 1: Create `packages/types/src/api/investments.ts`**

```typescript
export const INVESTMENT_ACCOUNT_TYPES = [
  "brokerage",
  "crypto",
  "fixed_income",
  "pension",
  "real_estate",
  "cash",
  "other",
] as const;

export type InvestmentAccountType = (typeof INVESTMENT_ACCOUNT_TYPES)[number];

export const INVESTMENT_ACCOUNT_TYPE_LABELS: Record<
  InvestmentAccountType,
  string
> = {
  brokerage: "Corretora",
  crypto: "Cripto",
  fixed_income: "Renda fixa",
  pension: "Previdência",
  real_estate: "Imóveis",
  cash: "Caixa",
  other: "Outro",
};

export type IncomeType = "fixed_income" | "variable_income";

export interface InvestmentAccount {
  id: string;
  userId: string;
  name: string;
  type: InvestmentAccountType;
  institution: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface InvestmentHolding {
  id: string;
  accountId: string;
  userId: string;
  symbol: string;
  incomeType: IncomeType;
  currentUnitValueCents: number;
  maturityDate: string | null;
  notes: string | null;
  lastValuationAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateInvestmentAccountBody {
  name: string;
  type: InvestmentAccountType;
  institution?: string;
}

export interface UpdateInvestmentAccountBody {
  name?: string;
  type?: InvestmentAccountType;
  institution?: string | null;
}

export interface CreateInvestmentHoldingBody {
  accountId: string;
  symbol: string;
  currentUnitValueCents: number;
  incomeType?: IncomeType;
  maturityDate?: string;
  notes?: string;
}

export interface UpdateInvestmentHoldingBody {
  symbol?: string;
  maturityDate?: string | null;
  notes?: string | null;
}

export interface UpdateHoldingValuationBody {
  currentUnitValueCents: number;
}

export interface PatrimonyAssetClassBucket {
  class: "fixed_income_group";
  label: string;
  totalCents: number;
  percentage: number;
}

export interface PatrimonyAccountBucket {
  accountId: string;
  name: string;
  totalCents: number;
}

export interface PatrimonyUpcomingMaturity {
  holdingId: string;
  name: string;
  maturityDate: string;
  totalCents: number;
}

export interface PatrimonySummary {
  totalAssetsCents: number;
  investmentsCents: number;
  piggyBanksCents: number;
  byAssetClass: PatrimonyAssetClassBucket[];
  byAccount: PatrimonyAccountBucket[];
  lastUpdatedAt: string | null;
  quotesStale: false;
  upcomingMaturities: PatrimonyUpcomingMaturity[];
}
```

- [ ] **Step 2: Create `packages/types/src/api/piggy-banks.ts`**

```typescript
export type PiggyBankStatus = "active" | "completed";
export type PiggyBankTransactionType = "deposit" | "withdrawal";

export interface PiggyBank {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  currentAmountCents: number;
  targetAmountCents: number | null;
  goalDescription: string | null;
  targetDate: string | null;
  status: PiggyBankStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PiggyBankTransaction {
  id: string;
  piggyBankId: string;
  type: PiggyBankTransactionType;
  amountCents: number;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface CreatePiggyBankBody {
  name: string;
  icon?: string;
  targetAmountCents?: number;
  goalDescription?: string;
  targetDate?: string;
}

export interface UpdatePiggyBankBody {
  name?: string;
  icon?: string | null;
  targetAmountCents?: number | null;
  goalDescription?: string | null;
  targetDate?: string | null;
}

export interface PiggyBankTransactionBody {
  amountCents: number;
  note?: string;
}

export interface UpdatePiggyBankStatusBody {
  status: PiggyBankStatus;
}

export interface PiggyBankTransactionListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PiggyBankTransactionListResponse {
  items: PiggyBankTransaction[];
  meta: PiggyBankTransactionListMeta;
}
```

- [ ] **Step 3: Append to `packages/types/src/index.ts`**

Add two lines at the end of the file:

```typescript
export * from "./api/investments.js";
export * from "./api/piggy-banks.js";
```

- [ ] **Step 4: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/types` builds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/api/investments.ts packages/types/src/api/piggy-banks.ts packages/types/src/index.ts
git commit -m "feat(types): add investments and piggy-banks API types"
```

---

### Task 3: API module — investment accounts

**Files:**
- Create: `apps/api/src/modules/investments/investment-accounts.schema.ts`
- Create: `apps/api/src/modules/investments/investment-accounts.service.ts`
- Create: `apps/api/src/modules/investments/investment-accounts.controller.ts`
- Create: `apps/api/src/modules/investments/investment-accounts.routes.ts`

**Interfaces:**
- Consumes: `investmentAccounts`, `investmentHoldings` tables from `@money-manager/db` (Task 1); `InvestmentAccount`, `InvestmentAccountType`, `INVESTMENT_ACCOUNT_TYPES` from `@money-manager/types` (Task 2); `NotFoundError` from `../../shared/errors/app-error.js`; `getUserId` from `../../shared/types/request.js`; `authenticate` from `../../shared/middleware/authenticate.js`; `newId` from `@money-manager/utils`.
- Produces: `export const investmentAccountsRoutes` (a `Router()`), consumed by Task 7. Deleting an account must soft-delete its holdings in the same transaction (spec §1.5) — Task 4 does not need to know this happened; it only ever reads non-deleted holdings.

No unit test file for this task — there is no DB-free pure function to extract (see Global Constraints). Coverage comes from Task 8's integration test.

- [ ] **Step 1: Create `apps/api/src/modules/investments/investment-accounts.schema.ts`**

```typescript
import { z } from "zod";
import {
  INVESTMENT_ACCOUNT_TYPES,
  type InvestmentAccountType,
} from "@money-manager/types";

const investmentAccountTypeSchema = z.enum(
  INVESTMENT_ACCOUNT_TYPES as unknown as [
    InvestmentAccountType,
    ...InvestmentAccountType[],
  ],
);

export const createInvestmentAccountBodySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a conta"),
  type: investmentAccountTypeSchema,
  institution: z.string().trim().min(1).optional(),
});

export type CreateInvestmentAccountBody = z.infer<
  typeof createInvestmentAccountBodySchema
>;

export const updateInvestmentAccountBodySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a conta").optional(),
  type: investmentAccountTypeSchema.optional(),
  institution: z.string().trim().min(1).nullable().optional(),
});

export type UpdateInvestmentAccountBody = z.infer<
  typeof updateInvestmentAccountBodySchema
>;

export const investmentAccountIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type InvestmentAccountIdParams = z.infer<
  typeof investmentAccountIdParamsSchema
>;
```

- [ ] **Step 2: Create `apps/api/src/modules/investments/investment-accounts.service.ts`**

```typescript
import {
  getDb,
  investmentAccounts,
  investmentHoldings,
} from "@money-manager/db";
import type { InvestmentAccount } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import type {
  CreateInvestmentAccountBody,
  UpdateInvestmentAccountBody,
} from "./investment-accounts.schema.js";

type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;

function toInvestmentAccount(row: InvestmentAccountRow): InvestmentAccount {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    institution: row.institution,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function getInvestmentAccountRow(
  userId: string,
  accountId: string,
): Promise<InvestmentAccountRow> {
  const [row] = await getDb()
    .select()
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.id, accountId),
        eq(investmentAccounts.userId, userId),
        isNull(investmentAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Conta não encontrada");
  }

  return row;
}

export async function listInvestmentAccounts(
  userId: string,
): Promise<{ items: InvestmentAccount[] }> {
  const rows = await getDb()
    .select()
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.userId, userId),
        isNull(investmentAccounts.deletedAt),
      ),
    )
    .orderBy(investmentAccounts.createdAt);

  return { items: rows.map(toInvestmentAccount) };
}

export async function getInvestmentAccount(
  userId: string,
  accountId: string,
): Promise<InvestmentAccount> {
  const row = await getInvestmentAccountRow(userId, accountId);
  return toInvestmentAccount(row);
}

export async function createInvestmentAccount(
  userId: string,
  input: CreateInvestmentAccountBody,
): Promise<InvestmentAccount> {
  const now = new Date();
  const id = newId();

  await getDb()
    .insert(investmentAccounts)
    .values({
      id,
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution ?? null,
      createdAt: now,
      updatedAt: now,
    });

  return getInvestmentAccount(userId, id);
}

export async function updateInvestmentAccount(
  userId: string,
  accountId: string,
  input: UpdateInvestmentAccountBody,
): Promise<InvestmentAccount> {
  await getInvestmentAccountRow(userId, accountId);

  const updates: Partial<InvestmentAccountRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.type !== undefined) updates.type = input.type;
  if (input.institution !== undefined) updates.institution = input.institution;

  await getDb()
    .update(investmentAccounts)
    .set(updates)
    .where(eq(investmentAccounts.id, accountId));

  return getInvestmentAccount(userId, accountId);
}

export async function deleteInvestmentAccount(
  userId: string,
  accountId: string,
): Promise<void> {
  await getInvestmentAccountRow(userId, accountId);
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(investmentAccounts.id, accountId));

    await tx
      .update(investmentHoldings)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(investmentHoldings.accountId, accountId),
          isNull(investmentHoldings.deletedAt),
        ),
      );
  });
}
```

- [ ] **Step 3: Create `apps/api/src/modules/investments/investment-accounts.controller.ts`**

```typescript
import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createInvestmentAccountBodySchema,
  investmentAccountIdParamsSchema,
  updateInvestmentAccountBodySchema,
} from "./investment-accounts.schema.js";
import * as investmentAccountsService from "./investment-accounts.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const result = await investmentAccountsService.listInvestmentAccounts(
    getUserId(req),
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = investmentAccountIdParamsSchema.parse(req.params);
  const account = await investmentAccountsService.getInvestmentAccount(
    getUserId(req),
    id,
  );
  res.status(200).json(account);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createInvestmentAccountBodySchema.parse(req.body);
  const account = await investmentAccountsService.createInvestmentAccount(
    getUserId(req),
    body,
  );
  res.status(201).json(account);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = investmentAccountIdParamsSchema.parse(req.params);
  const body = updateInvestmentAccountBodySchema.parse(req.body);
  const account = await investmentAccountsService.updateInvestmentAccount(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(account);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = investmentAccountIdParamsSchema.parse(req.params);
  await investmentAccountsService.deleteInvestmentAccount(getUserId(req), id);
  res.status(204).send();
}
```

- [ ] **Step 4: Create `apps/api/src/modules/investments/investment-accounts.routes.ts`**

```typescript
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as investmentAccountsController from "./investment-accounts.controller.js";

export const investmentAccountsRoutes = Router();

investmentAccountsRoutes.get(
  "/",
  authenticate,
  investmentAccountsController.list,
);
investmentAccountsRoutes.post(
  "/",
  authenticate,
  investmentAccountsController.create,
);
investmentAccountsRoutes.get(
  "/:id",
  authenticate,
  investmentAccountsController.get,
);
investmentAccountsRoutes.patch(
  "/:id",
  authenticate,
  investmentAccountsController.update,
);
investmentAccountsRoutes.delete(
  "/:id",
  authenticate,
  investmentAccountsController.remove,
);
```

- [ ] **Step 5: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/investment-accounts.schema.ts apps/api/src/modules/investments/investment-accounts.service.ts apps/api/src/modules/investments/investment-accounts.controller.ts apps/api/src/modules/investments/investment-accounts.routes.ts
git commit -m "feat(api): add investment accounts CRUD module"
```

---

### Task 4: API module — investment holdings

**Files:**
- Create: `apps/api/src/modules/investments/investment-holdings.schema.ts`
- Create: `apps/api/src/modules/investments/investment-holdings.service.ts`
- Create: `apps/api/src/modules/investments/investment-holdings.controller.ts`
- Create: `apps/api/src/modules/investments/investment-holdings.routes.ts`

**Interfaces:**
- Consumes: `investmentAccounts`, `investmentHoldings` tables from `@money-manager/db` (Task 1); `InvestmentHolding` from `@money-manager/types` (Task 2); `BadRequestError`, `NotFoundError` from `../../shared/errors/app-error.js`; `getUserId`; `authenticate`; `newId`. Does not import anything from Task 3's files — validates the parent account by querying the `investmentAccounts` table directly.
- Produces: `export const investmentHoldingsRoutes` (a `Router()`), consumed by Task 7.

No unit test file for this task — the `incomeType: "variable_income"` rejection is a 2-line guard, covered by Task 8's integration test rather than mocked as a unit test (see Global Constraints).

- [ ] **Step 1: Create `apps/api/src/modules/investments/investment-holdings.schema.ts`**

```typescript
import { z } from "zod";

export const createInvestmentHoldingBodySchema = z.object({
  accountId: z.string().uuid(),
  symbol: z.string().trim().min(1, "Informe um nome para a posição"),
  currentUnitValueCents: z.number().int().min(0, "Valor inválido"),
  incomeType: z.enum(["fixed_income", "variable_income"]).optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().min(1).optional(),
});

export type CreateInvestmentHoldingBody = z.infer<
  typeof createInvestmentHoldingBodySchema
>;

export const updateInvestmentHoldingBodySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Informe um nome para a posição")
    .optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export type UpdateInvestmentHoldingBody = z.infer<
  typeof updateInvestmentHoldingBodySchema
>;

export const updateHoldingValuationBodySchema = z.object({
  currentUnitValueCents: z.number().int().min(0, "Valor inválido"),
});

export type UpdateHoldingValuationBody = z.infer<
  typeof updateHoldingValuationBodySchema
>;

export const investmentHoldingIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type InvestmentHoldingIdParams = z.infer<
  typeof investmentHoldingIdParamsSchema
>;

export const listInvestmentHoldingsQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export type ListInvestmentHoldingsQuery = z.infer<
  typeof listInvestmentHoldingsQuerySchema
>;
```

- [ ] **Step 2: Create `apps/api/src/modules/investments/investment-holdings.service.ts`**

```typescript
import {
  getDb,
  investmentAccounts,
  investmentHoldings,
} from "@money-manager/db";
import type { InvestmentHolding } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type {
  CreateInvestmentHoldingBody,
  ListInvestmentHoldingsQuery,
  UpdateHoldingValuationBody,
  UpdateInvestmentHoldingBody,
} from "./investment-holdings.schema.js";

type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;

function toInvestmentHolding(row: InvestmentHoldingRow): InvestmentHolding {
  return {
    id: row.id,
    accountId: row.accountId,
    userId: row.userId,
    symbol: row.symbol,
    incomeType: row.incomeType,
    currentUnitValueCents: row.currentUnitValueCents,
    maturityDate: row.maturityDate,
    notes: row.notes,
    lastValuationAt: row.lastValuationAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function assertAccountBelongsToUser(
  userId: string,
  accountId: string,
): Promise<void> {
  const [account] = await getDb()
    .select({ id: investmentAccounts.id })
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.id, accountId),
        eq(investmentAccounts.userId, userId),
        isNull(investmentAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account) {
    throw new BadRequestError("Conta de investimento inválida");
  }
}

async function getInvestmentHoldingRow(
  userId: string,
  holdingId: string,
): Promise<InvestmentHoldingRow> {
  const [row] = await getDb()
    .select()
    .from(investmentHoldings)
    .where(
      and(
        eq(investmentHoldings.id, holdingId),
        eq(investmentHoldings.userId, userId),
        isNull(investmentHoldings.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Posição não encontrada");
  }

  return row;
}

export async function listInvestmentHoldings(
  userId: string,
  query: ListInvestmentHoldingsQuery,
): Promise<{ items: InvestmentHolding[] }> {
  const conditions = [
    eq(investmentHoldings.userId, userId),
    isNull(investmentHoldings.deletedAt),
  ];
  if (query.accountId) {
    conditions.push(eq(investmentHoldings.accountId, query.accountId));
  }

  const rows = await getDb()
    .select()
    .from(investmentHoldings)
    .where(and(...conditions))
    .orderBy(investmentHoldings.createdAt);

  return { items: rows.map(toInvestmentHolding) };
}

export async function getInvestmentHolding(
  userId: string,
  holdingId: string,
): Promise<InvestmentHolding> {
  const row = await getInvestmentHoldingRow(userId, holdingId);
  return toInvestmentHolding(row);
}

export async function createInvestmentHolding(
  userId: string,
  input: CreateInvestmentHoldingBody,
): Promise<InvestmentHolding> {
  if (input.incomeType && input.incomeType !== "fixed_income") {
    throw new BadRequestError("Renda variável ainda não suportada");
  }

  await assertAccountBelongsToUser(userId, input.accountId);

  const now = new Date();
  const id = newId();

  await getDb()
    .insert(investmentHoldings)
    .values({
      id,
      accountId: input.accountId,
      userId,
      symbol: input.symbol,
      incomeType: "fixed_income",
      currentUnitValueCents: input.currentUnitValueCents,
      maturityDate: input.maturityDate ?? null,
      notes: input.notes ?? null,
      lastValuationAt: now,
      createdAt: now,
      updatedAt: now,
    });

  return getInvestmentHolding(userId, id);
}

export async function updateInvestmentHolding(
  userId: string,
  holdingId: string,
  input: UpdateInvestmentHoldingBody,
): Promise<InvestmentHolding> {
  await getInvestmentHoldingRow(userId, holdingId);

  const updates: Partial<InvestmentHoldingRow> = { updatedAt: new Date() };
  if (input.symbol !== undefined) updates.symbol = input.symbol;
  if (input.maturityDate !== undefined) {
    updates.maturityDate = input.maturityDate;
  }
  if (input.notes !== undefined) updates.notes = input.notes;

  await getDb()
    .update(investmentHoldings)
    .set(updates)
    .where(eq(investmentHoldings.id, holdingId));

  return getInvestmentHolding(userId, holdingId);
}

export async function updateHoldingValuation(
  userId: string,
  holdingId: string,
  input: UpdateHoldingValuationBody,
): Promise<InvestmentHolding> {
  await getInvestmentHoldingRow(userId, holdingId);

  const now = new Date();
  await getDb()
    .update(investmentHoldings)
    .set({
      currentUnitValueCents: input.currentUnitValueCents,
      lastValuationAt: now,
      updatedAt: now,
    })
    .where(eq(investmentHoldings.id, holdingId));

  return getInvestmentHolding(userId, holdingId);
}

export async function deleteInvestmentHolding(
  userId: string,
  holdingId: string,
): Promise<void> {
  await getInvestmentHoldingRow(userId, holdingId);
  const now = new Date();

  await getDb()
    .update(investmentHoldings)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(investmentHoldings.id, holdingId));
}
```

- [ ] **Step 3: Create `apps/api/src/modules/investments/investment-holdings.controller.ts`**

```typescript
import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createInvestmentHoldingBodySchema,
  investmentHoldingIdParamsSchema,
  listInvestmentHoldingsQuerySchema,
  updateHoldingValuationBodySchema,
  updateInvestmentHoldingBodySchema,
} from "./investment-holdings.schema.js";
import * as investmentHoldingsService from "./investment-holdings.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = listInvestmentHoldingsQuerySchema.parse(req.query);
  const result = await investmentHoldingsService.listInvestmentHoldings(
    getUserId(req),
    query,
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const holding = await investmentHoldingsService.getInvestmentHolding(
    getUserId(req),
    id,
  );
  res.status(200).json(holding);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createInvestmentHoldingBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.createInvestmentHolding(
    getUserId(req),
    body,
  );
  res.status(201).json(holding);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const body = updateInvestmentHoldingBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.updateInvestmentHolding(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(holding);
}

export async function updateValuation(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const body = updateHoldingValuationBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.updateHoldingValuation(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(holding);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  await investmentHoldingsService.deleteInvestmentHolding(getUserId(req), id);
  res.status(204).send();
}
```

- [ ] **Step 4: Create `apps/api/src/modules/investments/investment-holdings.routes.ts`**

```typescript
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as investmentHoldingsController from "./investment-holdings.controller.js";

export const investmentHoldingsRoutes = Router();

investmentHoldingsRoutes.get(
  "/",
  authenticate,
  investmentHoldingsController.list,
);
investmentHoldingsRoutes.post(
  "/",
  authenticate,
  investmentHoldingsController.create,
);
investmentHoldingsRoutes.get(
  "/:id",
  authenticate,
  investmentHoldingsController.get,
);
investmentHoldingsRoutes.patch(
  "/:id",
  authenticate,
  investmentHoldingsController.update,
);
investmentHoldingsRoutes.patch(
  "/:id/valuation",
  authenticate,
  investmentHoldingsController.updateValuation,
);
investmentHoldingsRoutes.delete(
  "/:id",
  authenticate,
  investmentHoldingsController.remove,
);
```

- [ ] **Step 5: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/investment-holdings.schema.ts apps/api/src/modules/investments/investment-holdings.service.ts apps/api/src/modules/investments/investment-holdings.controller.ts apps/api/src/modules/investments/investment-holdings.routes.ts
git commit -m "feat(api): add investment holdings CRUD + valuation module"
```

---

### Task 5: API module — patrimony summary

**Files:**
- Create: `apps/api/src/modules/investments/patrimony.service.ts`
- Create: `apps/api/src/modules/investments/patrimony.service.test.ts`
- Create: `apps/api/src/modules/investments/patrimony.controller.ts`
- Create: `apps/api/src/modules/investments/patrimony.routes.ts`

**Interfaces:**
- Consumes: `investmentAccounts`, `investmentHoldings`, `piggyBanks` tables from `@money-manager/db` (Task 1); `PatrimonySummary`, `PatrimonyAccountBucket`, `PatrimonyUpcomingMaturity` from `@money-manager/types` (Task 2); `getUserId`; `authenticate`. Reads the `piggy_banks` table directly (no import from Task 6's files — the two modules stay isolated per the spec's "ilha de domínio" rule).
- Produces: `export const patrimonyRoutes` (a `Router()`), consumed by Task 7. Also produces the exported pure function `computePatrimonySummary(holdings, accounts, piggyBankRows, now)` used only by this task's own unit test.

- [ ] **Step 1: Write the failing unit test — `apps/api/src/modules/investments/patrimony.service.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import { computePatrimonySummary } from "./patrimony.service.js";

type HoldingFixture = Parameters<typeof computePatrimonySummary>[0][number];
type AccountFixture = Parameters<typeof computePatrimonySummary>[1][number];
type PiggyBankFixture = Parameters<typeof computePatrimonySummary>[2][number];

function holding(overrides: Partial<HoldingFixture>): HoldingFixture {
  return {
    id: "holding-1",
    accountId: "account-1",
    userId: "user-1",
    symbol: "CDB Banco X",
    incomeType: "fixed_income",
    assetClass: null,
    quantity: "1",
    averageCostCents: null,
    currentUnitValueCents: 10000,
    maturityDate: null,
    pricingSource: "manual",
    manualOverride: false,
    lastValuationAt: new Date("2026-01-01T00:00:00.000Z"),
    lastQuoteError: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as HoldingFixture;
}

function account(overrides: Partial<AccountFixture>): AccountFixture {
  return {
    id: "account-1",
    userId: "user-1",
    name: "XP Investimentos",
    type: "brokerage",
    institution: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as AccountFixture;
}

function piggyBank(overrides: Partial<PiggyBankFixture>): PiggyBankFixture {
  return {
    id: "piggy-1",
    userId: "user-1",
    name: "Viagem",
    icon: null,
    currentAmountCents: 5000,
    targetAmountCents: null,
    goalDescription: null,
    targetDate: null,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as PiggyBankFixture;
}

describe("computePatrimonySummary", () => {
  it("soma holdings e cofrinhos para o total de patrimônio", () => {
    const result = computePatrimonySummary(
      [holding({ currentUnitValueCents: 10000 })],
      [account({})],
      [piggyBank({ currentAmountCents: 5000 })],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.investmentsCents).toBe(10000);
    expect(result.piggyBanksCents).toBe(5000);
    expect(result.totalAssetsCents).toBe(15000);
    expect(result.quotesStale).toBe(false);
  });

  it("agrupa holdings por conta em byAccount", () => {
    const result = computePatrimonySummary(
      [
        holding({ id: "h1", accountId: "acc-1", currentUnitValueCents: 3000 }),
        holding({ id: "h2", accountId: "acc-1", currentUnitValueCents: 2000 }),
        holding({ id: "h3", accountId: "acc-2", currentUnitValueCents: 1000 }),
      ],
      [
        account({ id: "acc-1", name: "Conta A" }),
        account({ id: "acc-2", name: "Conta B" }),
      ],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.byAccount).toEqual(
      expect.arrayContaining([
        { accountId: "acc-1", name: "Conta A", totalCents: 5000 },
        { accountId: "acc-2", name: "Conta B", totalCents: 1000 },
      ]),
    );
  });

  it("retorna byAssetClass vazio quando não há holdings", () => {
    const result = computePatrimonySummary(
      [],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );
    expect(result.byAssetClass).toEqual([]);
    expect(result.totalAssetsCents).toBe(0);
  });

  it("filtra upcomingMaturities dentro da janela de 90 dias", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = computePatrimonySummary(
      [
        holding({
          id: "h-soon",
          symbol: "CDB vence em breve",
          maturityDate: "2026-02-01",
          currentUnitValueCents: 1000,
        }),
        holding({
          id: "h-far",
          symbol: "CDB vence longe",
          maturityDate: "2027-01-01",
          currentUnitValueCents: 2000,
        }),
        holding({
          id: "h-none",
          symbol: "CDB sem vencimento",
          maturityDate: null,
          currentUnitValueCents: 3000,
        }),
      ],
      [account({})],
      [],
      now,
    );

    expect(result.upcomingMaturities).toHaveLength(1);
    expect(result.upcomingMaturities[0]?.holdingId).toBe("h-soon");
  });

  it("usa o maior last_valuation_at como lastUpdatedAt", () => {
    const result = computePatrimonySummary(
      [
        holding({
          id: "h1",
          lastValuationAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        holding({
          id: "h2",
          lastValuationAt: new Date("2026-01-10T00:00:00.000Z"),
        }),
      ],
      [account({})],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.lastUpdatedAt).toBe("2026-01-10T00:00:00.000Z");
  });

  it("retorna lastUpdatedAt null quando não há holdings", () => {
    const result = computePatrimonySummary(
      [],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );
    expect(result.lastUpdatedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api`:

```bash
pnpm test -- patrimony.service.test.ts
```

Expected: FAIL — `Cannot find module './patrimony.service.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create `apps/api/src/modules/investments/patrimony.service.ts`**

```typescript
import {
  getDb,
  investmentAccounts,
  investmentHoldings,
  piggyBanks,
} from "@money-manager/db";
import type {
  PatrimonyAccountBucket,
  PatrimonySummary,
  PatrimonyUpcomingMaturity,
} from "@money-manager/types";
import { and, eq, isNull } from "drizzle-orm";

type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;
type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;
type PiggyBankRow = typeof piggyBanks.$inferSelect;

const UPCOMING_MATURITY_WINDOW_DAYS = 90;

export function computePatrimonySummary(
  holdings: InvestmentHoldingRow[],
  accounts: InvestmentAccountRow[],
  piggyBankRows: PiggyBankRow[],
  now: Date,
): PatrimonySummary {
  const investmentsCents = holdings.reduce(
    (acc, holding) => acc + holding.currentUnitValueCents,
    0,
  );
  const piggyBanksCents = piggyBankRows.reduce(
    (acc, piggyBank) => acc + piggyBank.currentAmountCents,
    0,
  );
  const totalAssetsCents = investmentsCents + piggyBanksCents;

  const byAssetClass =
    investmentsCents > 0
      ? [
          {
            class: "fixed_income_group" as const,
            label: "Renda fixa",
            totalCents: investmentsCents,
            percentage: 100,
          },
        ]
      : [];

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const totalsByAccount = new Map<string, number>();
  for (const holding of holdings) {
    totalsByAccount.set(
      holding.accountId,
      (totalsByAccount.get(holding.accountId) ?? 0) +
        holding.currentUnitValueCents,
    );
  }
  const byAccount: PatrimonyAccountBucket[] = Array.from(
    totalsByAccount.entries(),
  ).map(([accountId, totalCents]) => ({
    accountId,
    name: accountNameById.get(accountId) ?? "Conta removida",
    totalCents,
  }));

  const lastUpdatedAt = holdings.reduce<Date | null>((latest, holding) => {
    if (!latest || holding.lastValuationAt > latest) {
      return holding.lastValuationAt;
    }
    return latest;
  }, null);

  const maturityCutoff = new Date(now);
  maturityCutoff.setDate(
    maturityCutoff.getDate() + UPCOMING_MATURITY_WINDOW_DAYS,
  );
  const todayStr = now.toISOString().slice(0, 10);
  const cutoffStr = maturityCutoff.toISOString().slice(0, 10);

  const upcomingMaturities: PatrimonyUpcomingMaturity[] = holdings
    .filter(
      (holding) =>
        holding.maturityDate !== null &&
        holding.maturityDate >= todayStr &&
        holding.maturityDate <= cutoffStr,
    )
    .map((holding) => ({
      holdingId: holding.id,
      name: holding.symbol,
      maturityDate: holding.maturityDate as string,
      totalCents: holding.currentUnitValueCents,
    }))
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  return {
    totalAssetsCents,
    investmentsCents,
    piggyBanksCents,
    byAssetClass,
    byAccount,
    lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    quotesStale: false,
    upcomingMaturities,
  };
}

export async function getPatrimonySummary(
  userId: string,
): Promise<PatrimonySummary> {
  const db = getDb();
  const [holdings, accounts, piggyBankRows] = await Promise.all([
    db
      .select()
      .from(investmentHoldings)
      .where(
        and(
          eq(investmentHoldings.userId, userId),
          isNull(investmentHoldings.deletedAt),
        ),
      ),
    db
      .select()
      .from(investmentAccounts)
      .where(
        and(
          eq(investmentAccounts.userId, userId),
          isNull(investmentAccounts.deletedAt),
        ),
      ),
    db
      .select()
      .from(piggyBanks)
      .where(and(eq(piggyBanks.userId, userId), isNull(piggyBanks.deletedAt))),
  ]);

  return computePatrimonySummary(holdings, accounts, piggyBankRows, new Date());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/api`:

```bash
pnpm test -- patrimony.service.test.ts
```

Expected: PASS, 6/6 tests.

- [ ] **Step 5: Create `apps/api/src/modules/investments/patrimony.controller.ts`**

```typescript
import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import * as patrimonyService from "./patrimony.service.js";

export async function getSummary(req: Request, res: Response): Promise<void> {
  const summary = await patrimonyService.getPatrimonySummary(getUserId(req));
  res.status(200).json(summary);
}
```

- [ ] **Step 6: Create `apps/api/src/modules/investments/patrimony.routes.ts`**

```typescript
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as patrimonyController from "./patrimony.controller.js";

export const patrimonyRoutes = Router();

patrimonyRoutes.get("/summary", authenticate, patrimonyController.getSummary);
```

- [ ] **Step 7: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/investments/patrimony.service.ts apps/api/src/modules/investments/patrimony.service.test.ts apps/api/src/modules/investments/patrimony.controller.ts apps/api/src/modules/investments/patrimony.routes.ts
git commit -m "feat(api): add patrimony summary aggregation module"
```

---

### Task 6: API module — piggy banks

**Files:**
- Create: `apps/api/src/modules/piggy-banks/piggy-banks.schema.ts`
- Create: `apps/api/src/modules/piggy-banks/piggy-banks.service.ts`
- Create: `apps/api/src/modules/piggy-banks/piggy-banks.service.test.ts`
- Create: `apps/api/src/modules/piggy-banks/piggy-banks.controller.ts`
- Create: `apps/api/src/modules/piggy-banks/piggy-banks.routes.ts`

**Interfaces:**
- Consumes: `piggyBanks`, `piggyBankTransactions` tables from `@money-manager/db` (Task 1); `PiggyBank`, `PiggyBankTransaction`, `PiggyBankTransactionType` from `@money-manager/types` (Task 2); `BadRequestError`, `NotFoundError`; `getUserId`; `authenticate`; `newId`.
- Produces: `export const piggyBanksRoutes` (a `Router()`), consumed by Task 7. Also produces the exported pure function `resolveBalanceAfterTransaction(currentAmountCents, type, amountCents)` used only by this task's own unit test.

- [ ] **Step 1: Write the failing unit test — `apps/api/src/modules/piggy-banks/piggy-banks.service.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import { BadRequestError } from "../../shared/errors/app-error.js";
import { resolveBalanceAfterTransaction } from "./piggy-banks.service.js";

describe("resolveBalanceAfterTransaction", () => {
  it("soma o valor ao saldo em um depósito", () => {
    const result = resolveBalanceAfterTransaction(1000, "deposit", 500);
    expect(result).toBe(1500);
  });

  it("subtrai o valor do saldo em um saque", () => {
    const result = resolveBalanceAfterTransaction(1000, "withdrawal", 400);
    expect(result).toBe(600);
  });

  it("permite saque que zera o saldo exatamente", () => {
    const result = resolveBalanceAfterTransaction(1000, "withdrawal", 1000);
    expect(result).toBe(0);
  });

  it("lança BadRequestError quando o saque excede o saldo", () => {
    expect(() =>
      resolveBalanceAfterTransaction(1000, "withdrawal", 1001),
    ).toThrow(BadRequestError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api`:

```bash
pnpm test -- piggy-banks.service.test.ts
```

Expected: FAIL — `Cannot find module './piggy-banks.service.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create `apps/api/src/modules/piggy-banks/piggy-banks.schema.ts`**

```typescript
import { z } from "zod";

export const createPiggyBankBodySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para o cofrinho"),
  icon: z.string().trim().min(1).optional(),
  targetAmountCents: z
    .number()
    .int()
    .positive("Valor da meta inválido")
    .optional(),
  goalDescription: z.string().trim().min(1).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CreatePiggyBankBody = z.infer<typeof createPiggyBankBodySchema>;

export const updatePiggyBankBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe um nome para o cofrinho")
    .optional(),
  icon: z.string().trim().min(1).nullable().optional(),
  targetAmountCents: z
    .number()
    .int()
    .positive("Valor da meta inválido")
    .nullable()
    .optional(),
  goalDescription: z.string().trim().min(1).nullable().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type UpdatePiggyBankBody = z.infer<typeof updatePiggyBankBodySchema>;

export const piggyBankTransactionBodySchema = z.object({
  amountCents: z.number().int().positive("Informe um valor maior que zero"),
  note: z.string().trim().min(1).optional(),
});

export type PiggyBankTransactionBody = z.infer<
  typeof piggyBankTransactionBodySchema
>;

export const updatePiggyBankStatusBodySchema = z.object({
  status: z.enum(["active", "completed"]),
});

export type UpdatePiggyBankStatusBody = z.infer<
  typeof updatePiggyBankStatusBodySchema
>;

export const piggyBankIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type PiggyBankIdParams = z.infer<typeof piggyBankIdParamsSchema>;

export const listPiggyBanksQuerySchema = z.object({
  status: z.enum(["active", "completed"]).optional(),
});

export type ListPiggyBanksQuery = z.infer<typeof listPiggyBanksQuerySchema>;

export const listPiggyBankTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListPiggyBankTransactionsQuery = z.infer<
  typeof listPiggyBankTransactionsQuerySchema
>;
```

- [ ] **Step 4: Create `apps/api/src/modules/piggy-banks/piggy-banks.service.ts`**

```typescript
import { getDb, piggyBankTransactions, piggyBanks } from "@money-manager/db";
import type {
  PiggyBank,
  PiggyBankTransaction,
  PiggyBankTransactionType,
} from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type {
  CreatePiggyBankBody,
  ListPiggyBankTransactionsQuery,
  ListPiggyBanksQuery,
  PiggyBankTransactionBody,
  UpdatePiggyBankBody,
  UpdatePiggyBankStatusBody,
} from "./piggy-banks.schema.js";

type PiggyBankRow = typeof piggyBanks.$inferSelect;
type PiggyBankTransactionRow = typeof piggyBankTransactions.$inferSelect;

function toPiggyBank(row: PiggyBankRow): PiggyBank {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    icon: row.icon,
    currentAmountCents: row.currentAmountCents,
    targetAmountCents: row.targetAmountCents,
    goalDescription: row.goalDescription,
    targetDate: row.targetDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toPiggyBankTransaction(
  row: PiggyBankTransactionRow,
): PiggyBankTransaction {
  return {
    id: row.id,
    piggyBankId: row.piggyBankId,
    type: row.type,
    amountCents: row.amountCents,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function resolveBalanceAfterTransaction(
  currentAmountCents: number,
  type: PiggyBankTransactionType,
  amountCents: number,
): number {
  if (type === "deposit") {
    return currentAmountCents + amountCents;
  }

  if (amountCents > currentAmountCents) {
    throw new BadRequestError("Saldo insuficiente no cofrinho");
  }
  return currentAmountCents - amountCents;
}

async function getPiggyBankRow(
  userId: string,
  piggyBankId: string,
): Promise<PiggyBankRow> {
  const [row] = await getDb()
    .select()
    .from(piggyBanks)
    .where(
      and(
        eq(piggyBanks.id, piggyBankId),
        eq(piggyBanks.userId, userId),
        isNull(piggyBanks.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Cofrinho não encontrado");
  }

  return row;
}

export async function listPiggyBanks(
  userId: string,
  query: ListPiggyBanksQuery,
): Promise<{ items: PiggyBank[] }> {
  const conditions = [
    eq(piggyBanks.userId, userId),
    isNull(piggyBanks.deletedAt),
  ];
  if (query.status) {
    conditions.push(eq(piggyBanks.status, query.status));
  }

  const rows = await getDb()
    .select()
    .from(piggyBanks)
    .where(and(...conditions))
    .orderBy(piggyBanks.createdAt);

  return { items: rows.map(toPiggyBank) };
}

export async function getPiggyBank(
  userId: string,
  piggyBankId: string,
): Promise<PiggyBank> {
  const row = await getPiggyBankRow(userId, piggyBankId);
  return toPiggyBank(row);
}

export async function createPiggyBank(
  userId: string,
  input: CreatePiggyBankBody,
): Promise<PiggyBank> {
  const now = new Date();
  const id = newId();

  await getDb()
    .insert(piggyBanks)
    .values({
      id,
      userId,
      name: input.name,
      icon: input.icon ?? null,
      currentAmountCents: 0,
      targetAmountCents: input.targetAmountCents ?? null,
      goalDescription: input.goalDescription ?? null,
      targetDate: input.targetDate ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

  return getPiggyBank(userId, id);
}

export async function updatePiggyBank(
  userId: string,
  piggyBankId: string,
  input: UpdatePiggyBankBody,
): Promise<PiggyBank> {
  await getPiggyBankRow(userId, piggyBankId);

  const updates: Partial<PiggyBankRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.targetAmountCents !== undefined) {
    updates.targetAmountCents = input.targetAmountCents;
  }
  if (input.goalDescription !== undefined) {
    updates.goalDescription = input.goalDescription;
  }
  if (input.targetDate !== undefined) updates.targetDate = input.targetDate;

  await getDb()
    .update(piggyBanks)
    .set(updates)
    .where(eq(piggyBanks.id, piggyBankId));

  return getPiggyBank(userId, piggyBankId);
}

export async function deletePiggyBank(
  userId: string,
  piggyBankId: string,
): Promise<void> {
  await getPiggyBankRow(userId, piggyBankId);
  const now = new Date();

  await getDb()
    .update(piggyBanks)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(piggyBanks.id, piggyBankId));
}

async function applyTransaction(
  userId: string,
  piggyBankId: string,
  type: PiggyBankTransactionType,
  input: PiggyBankTransactionBody,
): Promise<PiggyBank> {
  const row = await getPiggyBankRow(userId, piggyBankId);
  const nextBalance = resolveBalanceAfterTransaction(
    row.currentAmountCents,
    type,
    input.amountCents,
  );
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx
      .update(piggyBanks)
      .set({ currentAmountCents: nextBalance, updatedAt: now })
      .where(eq(piggyBanks.id, piggyBankId));

    await tx.insert(piggyBankTransactions).values({
      id: newId(),
      piggyBankId,
      userId,
      type,
      amountCents: input.amountCents,
      note: input.note ?? null,
      occurredAt: now,
      createdAt: now,
    });
  });

  return getPiggyBank(userId, piggyBankId);
}

export async function depositToPiggyBank(
  userId: string,
  piggyBankId: string,
  input: PiggyBankTransactionBody,
): Promise<PiggyBank> {
  return applyTransaction(userId, piggyBankId, "deposit", input);
}

export async function withdrawFromPiggyBank(
  userId: string,
  piggyBankId: string,
  input: PiggyBankTransactionBody,
): Promise<PiggyBank> {
  return applyTransaction(userId, piggyBankId, "withdrawal", input);
}

export async function updatePiggyBankStatus(
  userId: string,
  piggyBankId: string,
  input: UpdatePiggyBankStatusBody,
): Promise<PiggyBank> {
  await getPiggyBankRow(userId, piggyBankId);

  await getDb()
    .update(piggyBanks)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(piggyBanks.id, piggyBankId));

  return getPiggyBank(userId, piggyBankId);
}

export async function listPiggyBankTransactions(
  userId: string,
  piggyBankId: string,
  query: ListPiggyBankTransactionsQuery,
): Promise<{
  items: PiggyBankTransaction[];
  meta: { total: number; limit: number; offset: number };
}> {
  await getPiggyBankRow(userId, piggyBankId);

  const [rows, totalResult] = await Promise.all([
    getDb()
      .select()
      .from(piggyBankTransactions)
      .where(eq(piggyBankTransactions.piggyBankId, piggyBankId))
      .orderBy(desc(piggyBankTransactions.occurredAt))
      .limit(query.limit)
      .offset(query.offset),
    getDb()
      .select({ total: count() })
      .from(piggyBankTransactions)
      .where(eq(piggyBankTransactions.piggyBankId, piggyBankId)),
  ]);

  return {
    items: rows.map(toPiggyBankTransaction),
    meta: {
      total: totalResult[0]?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `apps/api`:

```bash
pnpm test -- piggy-banks.service.test.ts
```

Expected: PASS, 4/4 tests.

- [ ] **Step 6: Create `apps/api/src/modules/piggy-banks/piggy-banks.controller.ts`**

```typescript
import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createPiggyBankBodySchema,
  listPiggyBankTransactionsQuerySchema,
  listPiggyBanksQuerySchema,
  piggyBankIdParamsSchema,
  piggyBankTransactionBodySchema,
  updatePiggyBankBodySchema,
  updatePiggyBankStatusBodySchema,
} from "./piggy-banks.schema.js";
import * as piggyBanksService from "./piggy-banks.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = listPiggyBanksQuerySchema.parse(req.query);
  const result = await piggyBanksService.listPiggyBanks(getUserId(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const piggyBank = await piggyBanksService.getPiggyBank(getUserId(req), id);
  res.status(200).json(piggyBank);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createPiggyBankBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.createPiggyBank(
    getUserId(req),
    body,
  );
  res.status(201).json(piggyBank);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = updatePiggyBankBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.updatePiggyBank(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  await piggyBanksService.deletePiggyBank(getUserId(req), id);
  res.status(204).send();
}

export async function deposit(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = piggyBankTransactionBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.depositToPiggyBank(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function withdraw(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = piggyBankTransactionBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.withdrawFromPiggyBank(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function updateStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = updatePiggyBankStatusBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.updatePiggyBankStatus(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function listTransactions(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const query = listPiggyBankTransactionsQuerySchema.parse(req.query);
  const result = await piggyBanksService.listPiggyBankTransactions(
    getUserId(req),
    id,
    query,
  );
  res.status(200).json(result);
}
```

- [ ] **Step 7: Create `apps/api/src/modules/piggy-banks/piggy-banks.routes.ts`**

```typescript
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as piggyBanksController from "./piggy-banks.controller.js";

export const piggyBanksRoutes = Router();

piggyBanksRoutes.get("/", authenticate, piggyBanksController.list);
piggyBanksRoutes.post("/", authenticate, piggyBanksController.create);
piggyBanksRoutes.get("/:id", authenticate, piggyBanksController.get);
piggyBanksRoutes.patch("/:id", authenticate, piggyBanksController.update);
piggyBanksRoutes.delete("/:id", authenticate, piggyBanksController.remove);
piggyBanksRoutes.post(
  "/:id/deposit",
  authenticate,
  piggyBanksController.deposit,
);
piggyBanksRoutes.post(
  "/:id/withdraw",
  authenticate,
  piggyBanksController.withdraw,
);
piggyBanksRoutes.patch(
  "/:id/status",
  authenticate,
  piggyBanksController.updateStatus,
);
piggyBanksRoutes.get(
  "/:id/transactions",
  authenticate,
  piggyBanksController.listTransactions,
);
```

- [ ] **Step 8: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/piggy-banks/piggy-banks.schema.ts apps/api/src/modules/piggy-banks/piggy-banks.service.ts apps/api/src/modules/piggy-banks/piggy-banks.service.test.ts apps/api/src/modules/piggy-banks/piggy-banks.controller.ts apps/api/src/modules/piggy-banks/piggy-banks.routes.ts
git commit -m "feat(api): add piggy banks CRUD + deposit/withdraw/status module"
```

---

### Task 7: Mount investments & piggy-banks routes in `app.ts`

**Files:**
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `investmentAccountsRoutes` (Task 3), `investmentHoldingsRoutes` (Task 4), `patrimonyRoutes` (Task 5), `piggyBanksRoutes` (Task 6).
- Produces: live routes at `/v1/investment-accounts`, `/v1/investment-holdings`, `/v1/patrimony`, `/v1/piggy-banks`, consumed by Tasks 8–10 (integration tests) and Task 13 (frontend, via `apiFetch`).

This task must run **after** Tasks 3–6 are all merged, and **before** Tasks 8–10. Keep it as its own commit so no parallel implementer ever edits this file concurrently with another task.

- [ ] **Step 1: Add the 4 new route imports to `apps/api/src/app.ts`**

The existing import block is alphabetically sorted by the imported variable name. Insert these 4 lines so the block stays sorted — `investmentAccountsRoutes` and `investmentHoldingsRoutes` go between the existing `incomesRoutes` and `tagsRoutes` imports (immediately after `goalsRoutes`... `incomesRoutes`), and `patrimonyRoutes` / `piggyBanksRoutes` go right after those two, still before `tagsRoutes`:

```typescript
import { incomesRoutes } from "./modules/incomes/incomes.routes.js";
import { investmentAccountsRoutes } from "./modules/investments/investment-accounts.routes.js";
import { investmentHoldingsRoutes } from "./modules/investments/investment-holdings.routes.js";
import { patrimonyRoutes } from "./modules/investments/patrimony.routes.js";
import { piggyBanksRoutes } from "./modules/piggy-banks/piggy-banks.routes.js";
import { tagsRoutes } from "./modules/tags/tags.routes.js";
```

(Only the `incomesRoutes` and `tagsRoutes` lines already exist — the 4 lines between them are new.)

- [ ] **Step 2: Add the 4 new `app.use()` mounts**

Insert these 4 lines immediately after the existing `app.use("/v1/debts", debtsRoutes);` line and before `app.use("/v1/expenses", expensesRoutes);`:

```typescript
  app.use("/v1/investment-accounts", investmentAccountsRoutes);
  app.use("/v1/investment-holdings", investmentHoldingsRoutes);
  app.use("/v1/patrimony", patrimonyRoutes);
  app.use("/v1/piggy-banks", piggyBanksRoutes);
```

- [ ] **Step 3: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 4: Run the full unit test suite**

Run from the repo root:

```bash
pnpm turbo run test --filter=@money-manager/api -- --selectProjects unit
```

If the above filter syntax doesn't match this repo's Jest project setup, instead run from `apps/api`:

```bash
pnpm test
```

Expected: all existing unit tests still pass (no regressions from the route change), plus the two new unit test files from Tasks 5 and 6.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): mount investments and piggy-banks routes"
```

---

### Task 8: Integration tests — investment accounts & holdings

**Files:**
- Create: `apps/api/tests/integration/investment-accounts.integration.test.ts`
- Create: `apps/api/tests/integration/investment-holdings.integration.test.ts`

**Interfaces:**
- Consumes: live `/v1/investment-accounts` and `/v1/investment-holdings` routes (Task 7 must be merged first); `createTestApp` from `../helpers/app.js`; `registerUser` from `../helpers/auth.js`; `describeWithDb`, `useIntegrationDbLifecycle` from `../helpers/db.js` — same harness `apps/api/tests/integration/debts.integration.test.ts` already uses.
- Produces: nothing consumed by later tasks — this is leaf test coverage.

Requires a running Postgres (the same one `pnpm test` already requires for this repo's integration project — follow this repo's existing local setup, e.g. `docker compose up -d` if that's how Postgres is normally started here).

- [ ] **Step 1: Create `apps/api/tests/integration/investment-accounts.integration.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("investment accounts integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/investment-accounts cria conta", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "XP Investimentos", type: "brokerage", institution: "XP" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("XP Investimentos");
    expect(res.body.type).toBe("brokerage");
    expect(res.body.institution).toBe("XP");
  });

  it("GET /v1/investment-accounts lista apenas contas do usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Conta A", type: "brokerage" });
    await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Conta B", type: "crypto" });

    const listRes = await request(app)
      .get("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].name).toBe("Conta A");
  });

  it("GET /v1/investment-accounts/:id retorna 404 para conta de outro usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Conta privada", type: "brokerage" });

    const getRes = await request(app)
      .get(`/v1/investment-accounts/${createRes.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(getRes.status).toBe(404);
  });

  it("PATCH /v1/investment-accounts/:id atualiza campos parcialmente", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta original", type: "brokerage" });

    const patchRes = await request(app)
      .patch(`/v1/investment-accounts/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta renomeada" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe("Conta renomeada");
    expect(patchRes.body.type).toBe("brokerage");
  });

  it("DELETE /v1/investment-accounts/:id faz soft delete", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta a excluir", type: "brokerage" });

    const deleteRes = await request(app)
      .delete(`/v1/investment-accounts/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Create `apps/api/tests/integration/investment-holdings.integration.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import type { Express } from "express";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("investment holdings integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  async function createAccount(
    testApp: Express,
    accessToken: string,
  ): Promise<string> {
    const res = await request(testApp)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta teste", type: "brokerage" });
    return res.body.id as string;
  }

  it("POST /v1/investment-holdings cria posição de renda fixa", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "CDB Banco X", currentUnitValueCents: 100000 });

    expect(res.status).toBe(201);
    expect(res.body.symbol).toBe("CDB Banco X");
    expect(res.body.incomeType).toBe("fixed_income");
    expect(res.body.currentUnitValueCents).toBe(100000);
  });

  it("POST /v1/investment-holdings rejeita accountId de outro usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);
    const accountId = await createAccount(app, tokenA);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ accountId, symbol: "CDB inválido", currentUnitValueCents: 1000 });

    expect(res.status).toBe(400);
  });

  it("POST /v1/investment-holdings rejeita incomeType variable_income", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "Ação teste",
        currentUnitValueCents: 1000,
        incomeType: "variable_income",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Renda variável");
  });

  it("PATCH /v1/investment-holdings/:id/valuation atualiza valor e last_valuation_at", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const createRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "CDB valorização",
        currentUnitValueCents: 50000,
      });

    const beforeValuation = createRes.body.lastValuationAt as string;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const valuationRes = await request(app)
      .patch(`/v1/investment-holdings/${createRes.body.id}/valuation`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentUnitValueCents: 52000 });

    expect(valuationRes.status).toBe(200);
    expect(valuationRes.body.currentUnitValueCents).toBe(52000);
    expect(
      new Date(valuationRes.body.lastValuationAt).getTime(),
    ).toBeGreaterThan(new Date(beforeValuation).getTime());
  });

  it("DELETE /v1/investment-accounts/:id faz soft delete em cascata das holdings", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "CDB cascata", currentUnitValueCents: 10000 });

    await request(app)
      .delete(`/v1/investment-accounts/${accountId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const holdingsRes = await request(app)
      .get("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(holdingsRes.status).toBe(200);
    expect(holdingsRes.body.items).toHaveLength(0);
  });

  it("GET /v1/investment-holdings filtra por accountId", async () => {
    const { accessToken } = await registerUser(app);
    const accountId1 = await createAccount(app, accessToken);
    const accountId2 = await createAccount(app, accessToken);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountId1,
        symbol: "CDB conta 1",
        currentUnitValueCents: 1000,
      });
    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountId2,
        symbol: "CDB conta 2",
        currentUnitValueCents: 2000,
      });

    const res = await request(app)
      .get(`/v1/investment-holdings?accountId=${accountId1}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].symbol).toBe("CDB conta 1");
  });

  it("DELETE /v1/investment-holdings/:id faz soft delete", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const createRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "CDB a excluir",
        currentUnitValueCents: 5000,
      });

    const deleteRes = await request(app)
      .delete(`/v1/investment-holdings/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run both integration test files**

Run from `apps/api`:

```bash
pnpm test -- investment-accounts.integration.test.ts investment-holdings.integration.test.ts
```

Expected: PASS, 5/5 + 7/7 tests (12 total). Requires Postgres running locally.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integration/investment-accounts.integration.test.ts apps/api/tests/integration/investment-holdings.integration.test.ts
git commit -m "test(api): add investment accounts and holdings integration tests"
```

---

### Task 9: Integration tests — piggy banks

**Files:**
- Create: `apps/api/tests/integration/piggy-banks.integration.test.ts`

**Interfaces:**
- Consumes: live `/v1/piggy-banks` routes (Task 7 must be merged first); same test harness as Task 8.
- Produces: nothing consumed by later tasks — leaf test coverage.

- [ ] **Step 1: Create `apps/api/tests/integration/piggy-banks.integration.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("piggy banks integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/piggy-banks cria cofrinho com meta monetária", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Viagem",
        icon: "plane",
        targetAmountCents: 500000,
        goalDescription: "Viagem para o Japão",
        targetDate: "2027-06-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Viagem");
    expect(res.body.currentAmountCents).toBe(0);
    expect(res.body.targetAmountCents).toBe(500000);
    expect(res.body.status).toBe("active");
  });

  it("POST /v1/piggy-banks cria cofrinho sem meta monetária", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Fundo de emergência",
        goalDescription: "6 meses de reserva",
      });

    expect(res.status).toBe(201);
    expect(res.body.targetAmountCents).toBeNull();
  });

  it("POST /v1/piggy-banks/:id/deposit incrementa o saldo", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho depósito" });

    const depositRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 10000, note: "Primeiro depósito" });

    expect(depositRes.status).toBe(200);
    expect(depositRes.body.currentAmountCents).toBe(10000);

    const transactionsRes = await request(app)
      .get(`/v1/piggy-banks/${createRes.body.id}/transactions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(transactionsRes.status).toBe(200);
    expect(transactionsRes.body.items).toHaveLength(1);
    expect(transactionsRes.body.items[0].type).toBe("deposit");
    expect(transactionsRes.body.items[0].amountCents).toBe(10000);
    expect(transactionsRes.body.meta.total).toBe(1);
  });

  it("POST /v1/piggy-banks/:id/withdraw decrementa o saldo", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho saque" });

    await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 10000 });

    const withdrawRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/withdraw`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 4000 });

    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.body.currentAmountCents).toBe(6000);
  });

  it("POST /v1/piggy-banks/:id/withdraw rejeita saque maior que o saldo", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho saldo insuficiente" });

    await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 1000 });

    const withdrawRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/withdraw`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 2000 });

    expect(withdrawRes.status).toBe(400);
    expect(withdrawRes.body.error).toContain("Saldo insuficiente");
  });

  it("PATCH /v1/piggy-banks/:id/status alterna entre completed e active", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho status" });

    const completeRes = await request(app)
      .patch(`/v1/piggy-banks/${createRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("completed");

    const reopenRes = await request(app)
      .patch(`/v1/piggy-banks/${createRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "active" });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.status).toBe("active");
  });

  it("um cofrinho completed continua aceitando depósitos", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho concluído" });

    await request(app)
      .patch(`/v1/piggy-banks/${createRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });

    const depositRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 500 });

    expect(depositRes.status).toBe(200);
    expect(depositRes.body.currentAmountCents).toBe(500);
    expect(depositRes.body.status).toBe("completed");
  });

  it("GET /v1/piggy-banks filtra por status", async () => {
    const { accessToken } = await registerUser(app);
    const activeRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Ativo" });
    const completedRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Concluído" });
    await request(app)
      .patch(`/v1/piggy-banks/${completedRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });

    const res = await request(app)
      .get("/v1/piggy-banks?status=active")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(activeRes.body.id);
  });

  it("DELETE /v1/piggy-banks/:id faz soft delete", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho a excluir" });

    const deleteRes = await request(app)
      .delete(`/v1/piggy-banks/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the integration test file**

Run from `apps/api`:

```bash
pnpm test -- piggy-banks.integration.test.ts
```

Expected: PASS, 9/9 tests. Requires Postgres running locally.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/piggy-banks.integration.test.ts
git commit -m "test(api): add piggy banks integration tests"
```

---

### Task 10: Integration test — patrimony summary

**Files:**
- Create: `apps/api/tests/integration/patrimony.integration.test.ts`

**Interfaces:**
- Consumes: live `/v1/patrimony/summary`, `/v1/investment-accounts`, `/v1/investment-holdings`, `/v1/piggy-banks` routes (Task 7 must be merged first); same test harness as Task 8.
- Produces: nothing consumed by later tasks — leaf test coverage.

- [ ] **Step 1: Create `apps/api/tests/integration/patrimony.integration.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("patrimony summary integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/patrimony/summary soma holdings e cofrinhos do usuário", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta patrimônio", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB patrimônio",
        currentUnitValueCents: 100000,
      });

    const piggyBankRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho patrimônio" });

    await request(app)
      .post(`/v1/piggy-banks/${piggyBankRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 25000 });

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.investmentsCents).toBe(100000);
    expect(summaryRes.body.piggyBanksCents).toBe(25000);
    expect(summaryRes.body.totalAssetsCents).toBe(125000);
    expect(summaryRes.body.quotesStale).toBe(false);
    expect(summaryRes.body.byAccount).toEqual([
      {
        accountId: accountRes.body.id,
        name: "Conta patrimônio",
        totalCents: 100000,
      },
    ]);
  });

  it("GET /v1/patrimony/summary retorna zeros para usuário sem posições", async () => {
    const { accessToken } = await registerUser(app);

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.totalAssetsCents).toBe(0);
    expect(summaryRes.body.byAssetClass).toEqual([]);
    expect(summaryRes.body.byAccount).toEqual([]);
    expect(summaryRes.body.lastUpdatedAt).toBeNull();
    expect(summaryRes.body.upcomingMaturities).toEqual([]);
  });

  it("GET /v1/patrimony/summary lista vencimentos dentro de 90 dias em upcomingMaturities", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta vencimento", type: "fixed_income" });

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const soonStr = soon.toISOString().slice(0, 10);

    const far = new Date();
    far.setDate(far.getDate() + 400);
    const farStr = far.toISOString().slice(0, 10);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB vence logo",
        currentUnitValueCents: 10000,
        maturityDate: soonStr,
      });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB vence longe",
        currentUnitValueCents: 20000,
        maturityDate: farStr,
      });

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.upcomingMaturities).toHaveLength(1);
    expect(summaryRes.body.upcomingMaturities[0].name).toBe("CDB vence logo");
  });
});
```

- [ ] **Step 2: Run the integration test file**

Run from `apps/api`:

```bash
pnpm test -- patrimony.integration.test.ts
```

Expected: PASS, 3/3 tests. Requires Postgres running locally.

- [ ] **Step 3: Run the entire test suite (unit + integration) as a final backend sanity check**

Run from the repo root:

```bash
pnpm test
```

Expected: all unit and integration tests pass, including every test file added in Tasks 5, 6, 8, 9, 10.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integration/patrimony.integration.test.ts
git commit -m "test(api): add patrimony summary integration tests"
```

---

### Task 11: Frontend — investment accounts & holdings components

**Files:**
- Create: `apps/web/src/components/features/investments/investment-account-form-modal.tsx`
- Create: `apps/web/src/components/features/investments/investment-account-section.tsx`
- Create: `apps/web/src/components/features/investments/holding-row.tsx`
- Create: `apps/web/src/components/features/investments/holding-form-modal.tsx`
- Create: `apps/web/src/components/features/investments/valuation-modal.tsx`

**Interfaces:**
- Consumes: `InvestmentAccount`, `InvestmentHolding`, `INVESTMENT_ACCOUNT_TYPES`, `INVESTMENT_ACCOUNT_TYPE_LABELS` from `@money-manager/types` (Task 2); `apiFetch` from `../../../lib/api`; `MoneyAmountInput`/`parseMoneyAmountInput` from `../../ui/money-amount-input` (existing, used exactly as `debt-form-modal.tsx` uses it). Backend routes consumed only at runtime (`/v1/investment-accounts`, `/v1/investment-holdings*`) — Task 7 must be merged for manual browser verification, but this task's own deliverable (typechecking) does not require it.
- Produces: `InvestmentAccountFormModal`, `InvestmentAccountSection`, `HoldingRow`, `HoldingFormModal`, `ValuationModal` components, all consumed by Task 13's `InvestmentsPage`.

No test file — this codebase has no `.test.tsx` component tests (verified: `DebtsPage`/`DebtFormModal`/`DebtCard` have none either); correctness is verified by `pnpm build` (typecheck) here and by manual browser verification in Task 13.

- [ ] **Step 1: Create `apps/web/src/components/features/investments/investment-account-form-modal.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { InvestmentAccount } from "@money-manager/types";
import {
  INVESTMENT_ACCOUNT_TYPE_LABELS,
  INVESTMENT_ACCOUNT_TYPES,
} from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { X } from "lucide-react";

interface InvestmentAccountFormModalProps {
  open: boolean;
  account: InvestmentAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InvestmentAccountFormModal({
  open,
  account,
  onClose,
  onSaved,
}: InvestmentAccountFormModalProps) {
  const isEditing = account !== null;

  const [name, setName] = useState("");
  const [type, setType] =
    useState<(typeof INVESTMENT_ACCOUNT_TYPES)[number]>("brokerage");
  const [institution, setInstitution] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setName(account.name);
      setType(account.type);
      setInstitution(account.institution ?? "");
    } else {
      setName("");
      setType("brokerage");
      setInstitution("");
    }
    setError(null);
  }, [open, account]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      institution: institution.trim() || null,
    };

    try {
      const res = await apiFetch(
        isEditing
          ? `/v1/investment-accounts/${account.id}`
          : "/v1/investment-accounts",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar conta");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="investment-account-form-title"
        className="glass w-full max-w-md rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="investment-account-form-title"
            className="text-xl font-bold text-white"
          >
            {isEditing ? "Editar conta" : "Nova conta de investimento"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Nome
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: XP Investimentos"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Tipo
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as (typeof INVESTMENT_ACCOUNT_TYPES)[number])
              }
              className="w-full rounded-2xl border border-white/5 bg-zinc-900 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            >
              {INVESTMENT_ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>
                  {INVESTMENT_ACCOUNT_TYPE_LABELS[accountType]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Instituição (opcional)
            </label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Ex.: XP"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/components/features/investments/holding-row.tsx`**

```tsx
import type { InvestmentHolding } from "@money-manager/types";
import { Edit3, Trash2, TrendingUp } from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

interface HoldingRowProps {
  holding: InvestmentHolding;
  onEdit: (holding: InvestmentHolding) => void;
  onValuation: (holding: InvestmentHolding) => void;
  onDelete: (id: string) => void;
}

export function HoldingRow({
  holding,
  onEdit,
  onValuation,
  onDelete,
}: HoldingRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{holding.symbol}</p>
        <p className="text-sm text-zinc-500">
          {formatCurrency(holding.currentUnitValueCents)}
          {holding.maturityDate
            ? ` · vence em ${formatDate(holding.maturityDate)}`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onValuation(holding)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400"
          aria-label="Atualizar valor"
        >
          <TrendingUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(holding)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Editar posição"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(holding.id)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
          aria-label="Excluir posição"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/components/features/investments/investment-account-section.tsx`**

```tsx
import type { InvestmentAccount, InvestmentHolding } from "@money-manager/types";
import { INVESTMENT_ACCOUNT_TYPE_LABELS } from "@money-manager/types";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { HoldingRow } from "./holding-row";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

interface InvestmentAccountSectionProps {
  account: InvestmentAccount;
  holdings: InvestmentHolding[];
  onEditAccount: (account: InvestmentAccount) => void;
  onDeleteAccount: (id: string) => void;
  onAddHolding: (accountId: string) => void;
  onEditHolding: (holding: InvestmentHolding) => void;
  onValuationHolding: (holding: InvestmentHolding) => void;
  onDeleteHolding: (id: string) => void;
}

export function InvestmentAccountSection({
  account,
  holdings,
  onEditAccount,
  onDeleteAccount,
  onAddHolding,
  onEditHolding,
  onValuationHolding,
  onDeleteHolding,
}: InvestmentAccountSectionProps) {
  const total = holdings.reduce((acc, h) => acc + h.currentUnitValueCents, 0);

  return (
    <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{account.name}</h3>
          <p className="text-sm text-zinc-500">
            {INVESTMENT_ACCOUNT_TYPE_LABELS[account.type]}
            {account.institution ? ` · ${account.institution}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEditAccount(account)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Editar conta"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteAccount(account.id)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Excluir conta"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-4 font-mono text-xl font-bold text-white">
        {formatCurrency(total)}
      </p>

      <div className="mt-4 space-y-2">
        {holdings.map((holding) => (
          <HoldingRow
            key={holding.id}
            holding={holding}
            onEdit={onEditHolding}
            onValuation={onValuationHolding}
            onDelete={onDeleteHolding}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAddHolding(account.id)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 py-3 text-sm font-semibold text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400"
      >
        <Plus className="h-4 w-4" />
        Nova posição
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/components/features/investments/holding-form-modal.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { InvestmentHolding } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";

interface HoldingFormModalProps {
  open: boolean;
  accountId: string | null;
  holding: InvestmentHolding | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function HoldingFormModal({
  open,
  accountId,
  holding,
  onClose,
  onSaved,
}: HoldingFormModalProps) {
  const isEditing = holding !== null;

  const [symbol, setSymbol] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (holding) {
      setSymbol(holding.symbol);
      setCurrentValue(formatMoneyDisplay(holding.currentUnitValueCents / 100));
      setMaturityDate(holding.maturityDate ?? "");
      setNotes(holding.notes ?? "");
    } else {
      setSymbol("");
      setCurrentValue("");
      setMaturityDate("");
      setNotes("");
    }
    setError(null);
  }, [open, holding]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const valueParsed = parseMoneyAmountInput(currentValue);
    if (!isEditing && (!Number.isFinite(valueParsed) || valueParsed < 0)) {
      setError("Informe um valor válido.");
      setLoading(false);
      return;
    }

    try {
      const res = isEditing
        ? await apiFetch(`/v1/investment-holdings/${holding.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              symbol: symbol.trim(),
              maturityDate: maturityDate || null,
              notes: notes.trim() || null,
            }),
          })
        : await apiFetch("/v1/investment-holdings", {
            method: "POST",
            body: JSON.stringify({
              accountId,
              symbol: symbol.trim(),
              currentUnitValueCents: Math.round(valueParsed * 100),
              maturityDate: maturityDate || undefined,
              notes: notes.trim() || undefined,
            }),
          });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar posição");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="holding-form-title"
        className="glass w-full max-w-md rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="holding-form-title" className="text-xl font-bold text-white">
            {isEditing ? "Editar posição" : "Nova posição"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Nome
            </label>
            <input
              type="text"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Ex.: CDB Banco X"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {!isEditing ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor atual
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={currentValue}
                  onChange={setCurrentValue}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Vencimento (opcional)
            </label>
            <input
              type="date"
              value={maturityDate}
              onChange={(e) => setMaturityDate(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Criar posição"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/components/features/investments/valuation-modal.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { InvestmentHolding } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";

interface ValuationModalProps {
  open: boolean;
  holding: InvestmentHolding | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function ValuationModal({
  open,
  holding,
  onClose,
  onSaved,
}: ValuationModalProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !holding) return;
    setValue(formatMoneyDisplay(holding.currentUnitValueCents / 100));
    setError(null);
  }, [open, holding]);

  if (!open || !holding) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parsed = parseMoneyAmountInput(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Informe um valor válido.");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(
        `/v1/investment-holdings/${holding.id}/valuation`,
        {
          method: "PATCH",
          body: JSON.stringify({
            currentUnitValueCents: Math.round(parsed * 100),
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao atualizar valor");
      }
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erro ao atualizar valor",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="valuation-form-title"
        className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="valuation-form-title"
            className="text-xl font-bold text-white"
          >
            Atualizar valor
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {holding.symbol}
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              <span className="text-zinc-500">R$</span>
              <MoneyAmountInput
                value={value}
                onChange={setValue}
                className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Salvando…" : "Salvar valor"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/web` builds with no TypeScript errors. (These components aren't imported anywhere yet — Task 13 wires them in — so this only proves they typecheck in isolation.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/features/investments
git commit -m "feat(web): add investment account and holding components"
```

---

### Task 12: Frontend — patrimony summary & piggy banks components

**Files:**
- Create: `apps/web/src/components/features/investments/patrimony-summary-cards.tsx`
- Create: `apps/web/src/components/features/piggy-banks/piggy-bank-icons.ts`
- Create: `apps/web/src/components/features/piggy-banks/piggy-bank-card.tsx`
- Create: `apps/web/src/components/features/piggy-banks/piggy-banks-section.tsx`
- Create: `apps/web/src/components/features/piggy-banks/piggy-bank-form-modal.tsx`
- Create: `apps/web/src/components/features/piggy-banks/piggy-bank-transaction-modal.tsx`

**Interfaces:**
- Consumes: `PatrimonySummary`, `PiggyBank` from `@money-manager/types` (Task 2); `apiFetch`; `MoneyAmountInput`/`parseMoneyAmountInput`; `cn` from `../../../lib/cn`.
- Produces: `PatrimonySummaryCards`, `PIGGY_BANK_ICONS`/`PIGGY_BANK_ICON_MAP`/`DEFAULT_PIGGY_BANK_ICON`, `PiggyBankCard`, `PiggyBanksSection`, `PiggyBankFormModal`, `PiggyBankTransactionModal`, all consumed by Task 13's `InvestmentsPage`. Touches a fully disjoint set of files from Task 11 — safe to run in parallel with it.

No test file — same rationale as Task 11.

- [ ] **Step 1: Create `apps/web/src/components/features/investments/patrimony-summary-cards.tsx`**

```tsx
import type { PatrimonySummary } from "@money-manager/types";
import { AlertCircle } from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface PatrimonySummaryCardsProps {
  summary: PatrimonySummary;
}

export function PatrimonySummaryCards({ summary }: PatrimonySummaryCardsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Patrimônio total
          </p>
          <p className="font-mono text-2xl font-bold text-white">
            {formatCurrency(summary.totalAssetsCents)}
          </p>
        </div>
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Investimentos
          </p>
          <p className="font-mono text-xl font-bold text-white">
            {formatCurrency(summary.investmentsCents)}
          </p>
        </div>
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Cofrinhos
          </p>
          <p className="font-mono text-xl font-bold text-white">
            {formatCurrency(summary.piggyBanksCents)}
          </p>
        </div>
      </div>

      {summary.lastUpdatedAt ? (
        <p className="text-xs text-zinc-500">
          Última atualização: {formatDateTime(summary.lastUpdatedAt)}
        </p>
      ) : null}

      {summary.upcomingMaturities.length > 0 ? (
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-bold text-white">
              Vencimentos próximos
            </p>
          </div>
          <div className="space-y-2">
            {summary.upcomingMaturities.map((item) => (
              <div
                key={item.holdingId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-zinc-300">{item.name}</span>
                <span className="text-zinc-500">
                  {formatDate(item.maturityDate)} ·{" "}
                  {formatCurrency(item.totalCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/components/features/piggy-banks/piggy-bank-icons.ts`**

```typescript
import {
  Baby,
  Briefcase,
  Building2,
  Camera,
  Car,
  Dumbbell,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  Music,
  Palmtree,
  PiggyBank,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  Trophy,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const PIGGY_BANK_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "piggy-bank", Icon: PiggyBank },
  { name: "plane", Icon: Plane },
  { name: "home", Icon: Home },
  { name: "car", Icon: Car },
  { name: "graduation-cap", Icon: GraduationCap },
  { name: "gift", Icon: Gift },
  { name: "shield-check", Icon: ShieldCheck },
  { name: "heart", Icon: Heart },
  { name: "baby", Icon: Baby },
  { name: "briefcase", Icon: Briefcase },
  { name: "laptop", Icon: Laptop },
  { name: "smartphone", Icon: Smartphone },
  { name: "camera", Icon: Camera },
  { name: "music", Icon: Music },
  { name: "dumbbell", Icon: Dumbbell },
  { name: "utensils", Icon: Utensils },
  { name: "shopping-bag", Icon: ShoppingBag },
  { name: "palmtree", Icon: Palmtree },
  { name: "building-2", Icon: Building2 },
  { name: "wrench", Icon: Wrench },
  { name: "wallet", Icon: Wallet },
  { name: "star", Icon: Star },
  { name: "trophy", Icon: Trophy },
  { name: "gem", Icon: Gem },
];

export const DEFAULT_PIGGY_BANK_ICON = "piggy-bank";

export const PIGGY_BANK_ICON_MAP: Record<string, LucideIcon> =
  Object.fromEntries(PIGGY_BANK_ICONS.map(({ name, Icon }) => [name, Icon]));
```

- [ ] **Step 3: Create `apps/web/src/components/features/piggy-banks/piggy-bank-card.tsx`**

```tsx
import type { PiggyBank } from "@money-manager/types";
import { ArrowDownCircle, ArrowUpCircle, Edit3, Trash2 } from "lucide-react";
import { DEFAULT_PIGGY_BANK_ICON, PIGGY_BANK_ICON_MAP } from "./piggy-bank-icons";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function daysSince(iso: string) {
  const created = new Date(iso);
  const now = new Date();
  return Math.floor(
    (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
  );
}

interface PiggyBankCardProps {
  piggyBank: PiggyBank;
  onDeposit: (piggyBank: PiggyBank) => void;
  onWithdraw: (piggyBank: PiggyBank) => void;
  onEdit: (piggyBank: PiggyBank) => void;
  onDelete: (id: string) => void;
  onMarkCompleted: (id: string) => void;
}

export function PiggyBankCard({
  piggyBank,
  onDeposit,
  onWithdraw,
  onEdit,
  onDelete,
  onMarkCompleted,
}: PiggyBankCardProps) {
  const Icon =
    PIGGY_BANK_ICON_MAP[piggyBank.icon ?? DEFAULT_PIGGY_BANK_ICON] ??
    PIGGY_BANK_ICON_MAP[DEFAULT_PIGGY_BANK_ICON]!;

  const hasTarget = piggyBank.targetAmountCents !== null;
  const progress = hasTarget
    ? Math.min(
        100,
        Math.round(
          (piggyBank.currentAmountCents / piggyBank.targetAmountCents!) * 100,
        ),
      )
    : 0;
  const reachedTarget =
    hasTarget && piggyBank.currentAmountCents >= piggyBank.targetAmountCents!;
  const showCompletionPrompt = reachedTarget && piggyBank.status === "active";

  return (
    <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-white">{piggyBank.name}</h3>
            {piggyBank.goalDescription ? (
              <p className="text-xs text-zinc-500">
                {piggyBank.goalDescription}
              </p>
            ) : null}
          </div>
        </div>
        {piggyBank.status === "completed" ? (
          <span className="inline-flex w-fit rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
            Concluído
          </span>
        ) : null}
      </div>

      <p className="mt-4 font-mono text-2xl font-bold text-white">
        {formatCurrency(piggyBank.currentAmountCents)}
      </p>

      {hasTarget ? (
        <div className="mt-3 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">
            {progress}% de {formatCurrency(piggyBank.targetAmountCents!)}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          {daysSince(piggyBank.createdAt)} dias acumulando
        </p>
      )}

      {showCompletionPrompt ? (
        <button
          type="button"
          onClick={() => onMarkCompleted(piggyBank.id)}
          className="mt-4 w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-bold text-emerald-400 transition hover:bg-emerald-500/20"
        >
          Meta atingida — marcar como concluído?
        </button>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDeposit(piggyBank)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/5 text-sm font-semibold text-emerald-400 transition hover:bg-white/10"
        >
          <ArrowUpCircle className="h-4 w-4" />
          Depositar
        </button>
        <button
          type="button"
          onClick={() => onWithdraw(piggyBank)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
        >
          <ArrowDownCircle className="h-4 w-4" />
          Sacar
        </button>
        <button
          type="button"
          onClick={() => onEdit(piggyBank)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Editar cofrinho"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(piggyBank.id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
          aria-label="Excluir cofrinho"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/components/features/piggy-banks/piggy-banks-section.tsx`**

```tsx
import type { PiggyBank } from "@money-manager/types";
import { Plus } from "lucide-react";
import { PiggyBankCard } from "./piggy-bank-card";

interface PiggyBanksSectionProps {
  piggyBanks: PiggyBank[];
  onCreate: () => void;
  onDeposit: (piggyBank: PiggyBank) => void;
  onWithdraw: (piggyBank: PiggyBank) => void;
  onEdit: (piggyBank: PiggyBank) => void;
  onDelete: (id: string) => void;
  onMarkCompleted: (id: string) => void;
}

export function PiggyBanksSection({
  piggyBanks,
  onCreate,
  onDeposit,
  onWithdraw,
  onEdit,
  onDelete,
  onMarkCompleted,
}: PiggyBanksSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Cofrinhos</h2>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo cofrinho
        </button>
      </div>

      {piggyBanks.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center sm:rounded-3xl">
          <p className="text-zinc-400">Nenhum cofrinho criado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {piggyBanks.map((piggyBank) => (
            <PiggyBankCard
              key={piggyBank.id}
              piggyBank={piggyBank}
              onDeposit={onDeposit}
              onWithdraw={onWithdraw}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkCompleted={onMarkCompleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/components/features/piggy-banks/piggy-bank-form-modal.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { PiggyBank } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";
import { DEFAULT_PIGGY_BANK_ICON, PIGGY_BANK_ICONS } from "./piggy-bank-icons";

interface PiggyBankFormModalProps {
  open: boolean;
  piggyBank: PiggyBank | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function PiggyBankFormModal({
  open,
  piggyBank,
  onClose,
  onSaved,
}: PiggyBankFormModalProps) {
  const isEditing = piggyBank !== null;

  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_PIGGY_BANK_ICON);
  const [hasTarget, setHasTarget] = useState(false);
  const [targetAmount, setTargetAmount] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (piggyBank) {
      setName(piggyBank.name);
      setIcon(piggyBank.icon ?? DEFAULT_PIGGY_BANK_ICON);
      setHasTarget(piggyBank.targetAmountCents !== null);
      setTargetAmount(
        piggyBank.targetAmountCents !== null
          ? formatMoneyDisplay(piggyBank.targetAmountCents / 100)
          : "",
      );
      setGoalDescription(piggyBank.goalDescription ?? "");
      setTargetDate(piggyBank.targetDate ?? "");
    } else {
      setName("");
      setIcon(DEFAULT_PIGGY_BANK_ICON);
      setHasTarget(false);
      setTargetAmount("");
      setGoalDescription("");
      setTargetDate("");
    }
    setError(null);
  }, [open, piggyBank]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const targetParsed = parseMoneyAmountInput(targetAmount);
    if (hasTarget && (!Number.isFinite(targetParsed) || targetParsed <= 0)) {
      setError("Informe um valor de meta válido.");
      setLoading(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      icon,
      goalDescription: goalDescription.trim() || null,
      targetDate: targetDate || null,
      targetAmountCents: hasTarget ? Math.round(targetParsed * 100) : null,
    };

    try {
      const res = await apiFetch(
        isEditing ? `/v1/piggy-banks/${piggyBank.id}` : "/v1/piggy-banks",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar cofrinho");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="piggy-bank-form-title"
        className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="piggy-bank-form-title"
            className="text-xl font-bold text-white"
          >
            {isEditing ? "Editar cofrinho" : "Novo cofrinho"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Nome
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Viagem para o Japão"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Ícone
            </label>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {PIGGY_BANK_ICONS.map(({ name: iconName, Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
                    icon === iconName
                      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                      : "border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10",
                  )}
                  aria-label={iconName}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Descrição do objetivo (opcional)
            </label>
            <input
              type="text"
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              placeholder="Ex.: 15 dias no Japão em 2027"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={hasTarget}
              onChange={(e) => setHasTarget(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30"
            />
            <span className="text-sm text-zinc-300">
              Este cofrinho tem uma meta em dinheiro
            </span>
          </label>

          {hasTarget ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor da meta
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={targetAmount}
                  onChange={setTargetAmount}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Data alvo (opcional)
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Criar cofrinho"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/web/src/components/features/piggy-banks/piggy-bank-transaction-modal.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { PiggyBank } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";

interface PiggyBankTransactionModalProps {
  open: boolean;
  piggyBank: PiggyBank | null;
  mode: "deposit" | "withdraw";
  onClose: () => void;
  onSaved: () => void;
}

export function PiggyBankTransactionModal({
  open,
  piggyBank,
  mode,
  onClose,
  onSaved,
}: PiggyBankTransactionModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setNote("");
    setError(null);
  }, [open, piggyBank, mode]);

  if (!open || !piggyBank) return null;

  const isDeposit = mode === "deposit";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parsed = parseMoneyAmountInput(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Informe um valor maior que zero.");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(
        `/v1/piggy-banks/${piggyBank.id}/${isDeposit ? "deposit" : "withdraw"}`,
        {
          method: "POST",
          body: JSON.stringify({
            amountCents: Math.round(parsed * 100),
            note: note.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao registrar transação");
      }
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erro ao registrar transação",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="piggy-bank-transaction-title"
        className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="piggy-bank-transaction-title"
            className="text-xl font-bold text-white"
          >
            {isDeposit ? "Depositar em" : "Sacar de"} {piggyBank.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Valor
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              <span className="text-zinc-500">R$</span>
              <MoneyAmountInput
                value={amount}
                onChange={setAmount}
                className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Salvando…" : isDeposit ? "Depositar" : "Sacar"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/web` builds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/features/investments/patrimony-summary-cards.tsx apps/web/src/components/features/piggy-banks
git commit -m "feat(web): add patrimony summary and piggy bank components"
```

---

### Task 13: Frontend — page composition, navigation, routing, browser verification

**Files:**
- Create: `apps/web/src/pages/InvestmentsPage.tsx`
- Modify: `apps/web/src/layouts/DashboardLayout.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: every component from Task 11 and Task 12; `InvestmentAccount`, `InvestmentHolding`, `PatrimonySummary`, `PiggyBank` from `@money-manager/types`; `apiFetch`. Requires Task 7's routes to be live for the manual browser verification in Step 5.
- Produces: the `/dashboard/investments` route and its "Patrimônio" nav entry — the end-to-end user-facing feature. Nothing else in this plan depends on this task.

This is the last task in the plan. Run it only after Tasks 11 and 12 are both merged.

- [ ] **Step 1: Create `apps/web/src/pages/InvestmentsPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import type {
  InvestmentAccount,
  InvestmentHolding,
  PatrimonySummary,
  PiggyBank,
} from "@money-manager/types";
import { HoldingFormModal } from "../components/features/investments/holding-form-modal";
import { InvestmentAccountFormModal } from "../components/features/investments/investment-account-form-modal";
import { InvestmentAccountSection } from "../components/features/investments/investment-account-section";
import { PatrimonySummaryCards } from "../components/features/investments/patrimony-summary-cards";
import { ValuationModal } from "../components/features/investments/valuation-modal";
import { PiggyBankFormModal } from "../components/features/piggy-banks/piggy-bank-form-modal";
import { PiggyBankTransactionModal } from "../components/features/piggy-banks/piggy-bank-transaction-modal";
import { PiggyBanksSection } from "../components/features/piggy-banks/piggy-banks-section";
import { apiFetch } from "../lib/api";
import { Plus, Wallet } from "lucide-react";

export function InvestmentsPage() {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([]);
  const [piggyBanks, setPiggyBanks] = useState<PiggyBank[]>([]);
  const [summary, setSummary] = useState<PatrimonySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] =
    useState<InvestmentAccount | null>(null);

  const [holdingFormOpen, setHoldingFormOpen] = useState(false);
  const [holdingAccountId, setHoldingAccountId] = useState<string | null>(
    null,
  );
  const [editingHolding, setEditingHolding] =
    useState<InvestmentHolding | null>(null);

  const [valuationHolding, setValuationHolding] =
    useState<InvestmentHolding | null>(null);

  const [piggyBankFormOpen, setPiggyBankFormOpen] = useState(false);
  const [editingPiggyBank, setEditingPiggyBank] = useState<PiggyBank | null>(
    null,
  );

  const [transactionPiggyBank, setTransactionPiggyBank] =
    useState<PiggyBank | null>(null);
  const [transactionMode, setTransactionMode] = useState<
    "deposit" | "withdraw"
  >("deposit");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, holdingsRes, piggyBanksRes, summaryRes] =
        await Promise.all([
          apiFetch("/v1/investment-accounts"),
          apiFetch("/v1/investment-holdings"),
          apiFetch("/v1/piggy-banks"),
          apiFetch("/v1/patrimony/summary"),
        ]);
      if (
        !accountsRes.ok ||
        !holdingsRes.ok ||
        !piggyBanksRes.ok ||
        !summaryRes.ok
      ) {
        throw new Error("Falha ao carregar dados de patrimônio");
      }
      const accountsData = (await accountsRes.json()) as {
        items: InvestmentAccount[];
      };
      const holdingsData = (await holdingsRes.json()) as {
        items: InvestmentHolding[];
      };
      const piggyBanksData = (await piggyBanksRes.json()) as {
        items: PiggyBank[];
      };
      const summaryData = (await summaryRes.json()) as PatrimonySummary;

      setAccounts(accountsData.items ?? []);
      setHoldings(holdingsData.items ?? []);
      setPiggyBanks(piggyBanksData.items ?? []);
      setSummary(summaryData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openCreateAccount() {
    setEditingAccount(null);
    setAccountFormOpen(true);
  }

  function openEditAccount(account: InvestmentAccount) {
    setEditingAccount(account);
    setAccountFormOpen(true);
  }

  async function handleDeleteAccount(id: string) {
    if (
      !confirm("Tem certeza? As posições dessa conta também serão removidas.")
    )
      return;
    try {
      const res = await apiFetch(`/v1/investment-accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir conta");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function openCreateHolding(accountId: string) {
    setHoldingAccountId(accountId);
    setEditingHolding(null);
    setHoldingFormOpen(true);
  }

  function openEditHolding(holding: InvestmentHolding) {
    setHoldingAccountId(holding.accountId);
    setEditingHolding(holding);
    setHoldingFormOpen(true);
  }

  async function handleDeleteHolding(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta posição?")) return;
    try {
      const res = await apiFetch(`/v1/investment-holdings/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir posição");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function openCreatePiggyBank() {
    setEditingPiggyBank(null);
    setPiggyBankFormOpen(true);
  }

  function openEditPiggyBank(piggyBank: PiggyBank) {
    setEditingPiggyBank(piggyBank);
    setPiggyBankFormOpen(true);
  }

  async function handleDeletePiggyBank(id: string) {
    if (!confirm("Tem certeza que deseja excluir este cofrinho?")) return;
    try {
      const res = await apiFetch(`/v1/piggy-banks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir cofrinho");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function openDeposit(piggyBank: PiggyBank) {
    setTransactionPiggyBank(piggyBank);
    setTransactionMode("deposit");
  }

  function openWithdraw(piggyBank: PiggyBank) {
    setTransactionPiggyBank(piggyBank);
    setTransactionMode("withdraw");
  }

  async function handleMarkCompleted(id: string) {
    try {
      const res = await apiFetch(`/v1/piggy-banks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("Erro ao concluir cofrinho");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao concluir cofrinho");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Patrimônio
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Investimentos
          </h1>
          <p className="max-w-[50ch] text-zinc-400">
            Acompanhe suas contas de investimento, posições de renda fixa e
            cofrinhos com objetivos específicos.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateAccount}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Nova conta
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          Carregando…
        </p>
      ) : (
        <>
          {summary ? <PatrimonySummaryCards summary={summary} /> : null}

          {accounts.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center sm:rounded-3xl">
              <p className="text-zinc-400">
                Nenhuma conta de investimento cadastrada ainda.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {accounts.map((account) => (
                <InvestmentAccountSection
                  key={account.id}
                  account={account}
                  holdings={holdings.filter(
                    (h) => h.accountId === account.id,
                  )}
                  onEditAccount={openEditAccount}
                  onDeleteAccount={(id) => void handleDeleteAccount(id)}
                  onAddHolding={openCreateHolding}
                  onEditHolding={openEditHolding}
                  onValuationHolding={setValuationHolding}
                  onDeleteHolding={(id) => void handleDeleteHolding(id)}
                />
              ))}
            </div>
          )}

          <PiggyBanksSection
            piggyBanks={piggyBanks}
            onCreate={openCreatePiggyBank}
            onDeposit={openDeposit}
            onWithdraw={openWithdraw}
            onEdit={openEditPiggyBank}
            onDelete={(id) => void handleDeletePiggyBank(id)}
            onMarkCompleted={(id) => void handleMarkCompleted(id)}
          />
        </>
      )}

      <InvestmentAccountFormModal
        open={accountFormOpen}
        account={editingAccount}
        onClose={() => setAccountFormOpen(false)}
        onSaved={() => {
          setAccountFormOpen(false);
          void loadAll();
        }}
      />

      <HoldingFormModal
        open={holdingFormOpen}
        accountId={holdingAccountId}
        holding={editingHolding}
        onClose={() => setHoldingFormOpen(false)}
        onSaved={() => {
          setHoldingFormOpen(false);
          void loadAll();
        }}
      />

      <ValuationModal
        open={valuationHolding !== null}
        holding={valuationHolding}
        onClose={() => setValuationHolding(null)}
        onSaved={() => {
          setValuationHolding(null);
          void loadAll();
        }}
      />

      <PiggyBankFormModal
        open={piggyBankFormOpen}
        piggyBank={editingPiggyBank}
        onClose={() => setPiggyBankFormOpen(false)}
        onSaved={() => {
          setPiggyBankFormOpen(false);
          void loadAll();
        }}
      />

      <PiggyBankTransactionModal
        open={transactionPiggyBank !== null}
        piggyBank={transactionPiggyBank}
        mode={transactionMode}
        onClose={() => setTransactionPiggyBank(null)}
        onSaved={() => {
          setTransactionPiggyBank(null);
          void loadAll();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Edit `apps/web/src/layouts/DashboardLayout.tsx`** — add the nav item

Add `Wallet` to the `lucide-react` import (the existing block is alphabetically sorted — insert it between `TrendingUp` and `X`):

```typescript
import {
  CreditCard,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  ReceiptText,
  Settings,
  Tags,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
```

Add a "Patrimônio" entry to `navItems`, right after "Dívidas" and before "Tags":

```typescript
const navItems = [
  { name: "Resumo", href: "/dashboard", icon: LayoutDashboard, end: true },
  { name: "Despesas", href: "/dashboard/expenses", icon: ReceiptText },
  { name: "Receitas", href: "/dashboard/incomes", icon: TrendingUp },
  { name: "Metas", href: "/dashboard/goals", icon: Target },
  { name: "Cartões", href: "/dashboard/cards", icon: CreditCard },
  { name: "Dívidas", href: "/dashboard/debts", icon: Landmark },
  { name: "Patrimônio", href: "/dashboard/investments", icon: Wallet },
  { name: "Tags", href: "/dashboard/tags", icon: Tags },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];
```

Add `"Patrimônio"` to `drawerOnlyItems` so the mobile "Mais" button highlights correctly when on the investments page (matches the existing `"Tags"`/`"Configurações"` entries — "Patrimônio" isn't in `bottomNavItems` either, so it needs the same drawer-active treatment):

```typescript
const drawerOnlyItems = navItems.filter((item) =>
  ["Patrimônio", "Tags", "Configurações"].includes(item.name),
);
```

Add a branch to `getPageTitle`, right after the `debts` branch:

```typescript
function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/tags")) return "Tags";
  if (pathname.startsWith("/dashboard/settings")) return "Configurações";
  if (pathname.startsWith("/dashboard/goals")) return "Metas";
  if (pathname.startsWith("/dashboard/cards")) return "Cartões";
  if (pathname.startsWith("/dashboard/debts")) return "Dívidas";
  if (pathname.startsWith("/dashboard/investments")) return "Patrimônio";
  if (pathname.startsWith("/dashboard/expenses")) return "Despesas";
  if (pathname.startsWith("/dashboard/incomes")) return "Receitas";
  return "Resumo";
}
```

`getHeaderAction` needs no change — only expenses/incomes get the quick-add header button.

- [ ] **Step 3: Edit `apps/web/src/App.tsx`** — add the route

Add the import, alphabetically between `IncomesPage` and `LandingPage`:

```typescript
import { IncomesPage } from "./pages/IncomesPage";
import { InvestmentsPage } from "./pages/InvestmentsPage";
import { LandingPage } from "./pages/LandingPage";
```

Add the route inside `<Route path="/dashboard" element={<DashboardLayout />}>`, right after the `debts` route:

```typescript
<Route path="debts" element={<DebtsPage />} />
<Route path="investments" element={<InvestmentsPage />} />
```

- [ ] **Step 4: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/web` builds with no TypeScript errors.

- [ ] **Step 5: Manual browser verification**

Start Postgres and both dev servers per this repo's existing local setup, then:

1. Register or log in as a test user.
2. Navigate to `/dashboard/investments` via the "Patrimônio" nav item (desktop sidebar and mobile "Mais" drawer). Confirm the page title reads "Patrimônio" and the empty states render ("Nenhuma conta de investimento cadastrada ainda.", "Nenhum cofrinho criado ainda.").
3. Click "Nova conta", create an account (e.g. name "XP Investimentos", type "Corretora"). Confirm it appears with a R$ 0,00 total and no holdings.
4. Click "Nova posição" on that account, create a holding (e.g. "CDB Banco X", R$ 1.000,00). Confirm the account total and the top `PatrimonySummaryCards` update to reflect it, and "Última atualização" appears.
5. Click the valuation (trending-up) icon on the holding, change the value, save. Confirm the new value reflects immediately in the row and the summary cards.
6. Click "Novo cofrinho", create one with a monetary target (e.g. "Viagem", target R$ 500,00) and one without a target (e.g. "Fundo de emergência"). Confirm the targeted one shows a progress bar at 0% and the untargeted one shows "0 dias acumulando".
7. Click "Depositar" on the targeted cofrinho, deposit an amount that reaches or exceeds the target. Confirm the progress bar updates and the "Meta atingida — marcar como concluído?" prompt appears; click it and confirm the card now shows the "Concluído" badge.
8. Click "Sacar" on a cofrinho and attempt to withdraw more than its balance — confirm the API's 400 error message surfaces in the modal (`alert`/error text, not a silent failure).
9. Delete a holding, then delete its parent account — confirm both disappear from the page without error.
10. Check the browser console for errors via `read_console_messages` and the network tab via `read_network_requests` — confirm no unexpected 4xx/5xx responses during the above flow.

Take a screenshot of the populated investments page (accounts + holdings + patrimony cards + piggy banks grid) as proof once the flow above passes.

- [ ] **Step 6: Run the full test suite one more time**

Run from the repo root:

```bash
pnpm test
```

Expected: all unit and integration tests still pass (no regressions from the frontend wiring).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/InvestmentsPage.tsx apps/web/src/layouts/DashboardLayout.tsx apps/web/src/App.tsx
git commit -m "feat(web): compose investments page with nav and routing"
```

---

## Self-Review

**Spec coverage:** §1.1 data model → Task 1. §1.2 investments API (accounts, holdings, valuation, patrimony) → Tasks 3, 4, 5. §1.3 piggy-banks API (CRUD, deposit/withdraw, status, transactions) → Task 6. §1.4 deferred endpoints → intentionally not built (confirmed absent from Tasks 3–6). §1.5 business rules → non-negative balance/withdrawal guard (Task 6's `resolveBalanceAfterTransaction`), `amountCents > 0` / `targetAmountCents > 0` (Zod schemas in Task 6), `currentUnitValueCents >= 0` (Zod schemas in Task 4), `incomeType` rejection (Task 4), cascade soft-delete (Task 3), completed-piggy-bank-still-accepts-transactions (Task 6 has no status check in `applyTransaction`, verified by Task 9's "completed continua aceitando depósitos" test), no expenses/incomes side effects (no such import exists anywhere in Tasks 3–6). §1.6 types → Task 2. §1.7 errors → `NotFoundError`/`BadRequestError` with the exact Portuguese messages from the spec's table, used verbatim in Tasks 3, 4, 6. §2 frontend component list → Tasks 11, 12, 13, one-to-one, including the inline "Marcar como concluído?" prompt language. §3 testing plan → covered per the Global Constraints reinterpretation (pure-function unit tests in Tasks 5/6, integration tests in Tasks 8/9/10). §4 out of scope → nothing in Feature 20b/20c/20d, no RV holding path, no `PiggyBankHistoryDrawer` UI, exists anywhere in this plan.

**Placeholder scan:** no "TBD"/"TODO"/"add appropriate error handling" phrases anywhere above; every step that changes code shows the complete file content, not a diff fragment or description.

**Type consistency:** `InvestmentAccount`/`InvestmentHolding`/`PatrimonySummary`/`PiggyBank`/`PiggyBankTransaction` (Task 2) are used with identical field names in every service (Tasks 3–6), every unit test fixture (Tasks 5–6), every integration test assertion (Tasks 8–10), and every frontend component (Tasks 11–13) — cross-checked `currentUnitValueCents`, `currentAmountCents`, `targetAmountCents`, `lastValuationAt`, `maturityDate`, `goalDescription`, `targetDate` spellings across all of them. `computePatrimonySummary`'s 4-parameter signature (`holdings, accounts, piggyBankRows, now`) matches between its Task 5 definition and its Task 5 test's `Parameters<...>` fixture types. `resolveBalanceAfterTransaction`'s 3-parameter signature matches between its Task 6 definition and Task 6's test. Route paths match exactly between each `*.routes.ts` file and every `apiFetch`/`request(app)` call that targets it (`/v1/investment-accounts`, `/v1/investment-holdings/:id/valuation`, `/v1/piggy-banks/:id/deposit`, etc.).

