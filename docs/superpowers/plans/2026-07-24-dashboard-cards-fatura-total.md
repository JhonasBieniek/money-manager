# Dashboard Cards Fatura Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the accumulated fatura (R$) total for the filtered period on the
"Cartões e Faturas" page (`/dashboard/cards`), and stop counting credit-card
expenses unitarily in the general dashboard totals — only the fatura
(statement) total counts as credit-card spend there, while category/tag
breakdowns keep counting individual expenses as before.

**Architecture:** Two independent changes. (A) A pure frontend change to
`CreditCardsPage.tsx` that sums the already-fetched per-card statement totals
client-side — no API change. (B) A backend change to
`dashboard.service.ts` that replaces the unitary `SUM(expenses.amountCents)`
for credit-card rows with `SUM(creditCardStatements totals)` scoped by
billing cycle (`cycleYear`/`cycleMonth`), for both `getDashboardSummary` and
`getDashboardHistory`. `expensesByCategory` and `goalsUsage` are untouched.

**Tech Stack:** Node/Express API with Drizzle ORM (Postgres), Jest for
tests (unit tests mock `@money-manager/db`; integration tests hit a real
Postgres via `DATABASE_URL` and are skipped otherwise), React + Vite web
app (no automated frontend tests exist in this repo today).

---

## Spec reference

Design doc: `docs/superpowers/specs/2026-07-24-dashboard-cards-fatura-total-design.md`

## File Structure

- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts` — `getDashboardSummary` and `getDashboardHistory` gain a credit-card-statement-based total and exclude `paymentMethod = "credit_card"` from the raw expense sum.
- Modify: `apps/api/src/modules/dashboard/dashboard.service.test.ts` — unit tests updated for the new query shape.
- Create: `apps/api/tests/integration/dashboard-cards.integration.test.ts` — end-to-end proof that a credit-card expense counts by billing cycle, not by `occurredAt` month.
- Modify: `apps/web/src/pages/CreditCardsPage.tsx` — accumulated fatura total banner for the filtered period.

---

### Task 1: Failing unit test — `getDashboardSummary` excludes credit-card expenses and adds the fatura total

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.service.test.ts`

- [ ] **Step 1: Update the `@money-manager/db` mock and the `getDashboardSummary` test**

Replace the whole file content with:

```ts
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const dbMock = {
  select: jest.fn(),
};

const getGoalUsageMock = jest.fn();

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  incomes: {
    userId: "user_id",
    amountCents: "amount_cents",
    deletedAt: "deleted_at",
    occurredAt: "occurred_at",
  },
  expenses: {
    userId: "user_id",
    amountCents: "amount_cents",
    goalCategory: "goal_category",
    paymentMethod: "payment_method",
    deletedAt: "deleted_at",
    occurredAt: "occurred_at",
  },
  creditCardStatements: {
    userId: "user_id",
    cycleYear: "cycle_year",
    cycleMonth: "cycle_month",
    calculatedTotalCents: "calculated_total_cents",
    adjustedTotalCents: "adjusted_total_cents",
  },
}));

jest.unstable_mockModule("../goals/goals.service.js", () => ({
  getGoalUsage: getGoalUsageMock,
}));

jest.unstable_mockModule("../debts/debts.service.js", () => ({
  syncUserDebtsForMonth: jest.fn().mockResolvedValue(undefined),
}));

const dashboardService = await import("./dashboard.service.js");

function chainWhere<T>(value: T, grouped = false) {
  if (grouped) {
    return {
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve(value),
        }),
      }),
    };
  }
  return {
    from: () => ({
      where: () => Promise.resolve(value),
    }),
  };
}

describe("getDashboardSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getGoalUsageMock.mockResolvedValue([
      {
        category: "prazeres",
        percentageValue: 10,
        ceiling: 100_000,
        spent: 25_000,
        usagePercent: 25,
      },
    ]);
  });

  it("agrega totais, expensesByCategory e goalsUsage usando o total da fatura para cartão", async () => {
    const responses = [
      [{ total: 1_000_000 }], // incomes
      [{ total: 250_000 }], // expenses (não-cartão)
      [{ total: 150_000 }], // faturas do mês (creditCardStatements)
      [
        { category: "prazeres", total: 250_000 },
        { category: "custos-fixos", total: 150_000 },
      ], // expensesByCategory (inclui cartão, sem mudança)
    ];
    let callIndex = 0;
    dbMock.select.mockImplementation(() => {
      const response = responses[callIndex++] ?? [];
      return chainWhere(response, callIndex === 4);
    });

    const summary = await dashboardService.getDashboardSummary("user-1", 2025, 6);

    expect(summary.totalIncomes).toBe(1_000_000);
    expect(summary.totalExpenses).toBe(400_000);
    expect(summary.balance).toBe(600_000);
    expect(summary.expensesByCategory).toEqual([
      { category: "Prazeres", amount: 250_000 },
      { category: "Custos Fixos", amount: 150_000 },
    ]);
    expect(summary.goalsUsage).toHaveLength(1);
    expect(summary.goalsUsage[0]?.spent).toBe(25_000);
    expect(getGoalUsageMock).toHaveBeenCalledWith("user-1", 2025, 6);
    expect(dbMock.select).toHaveBeenCalledTimes(4);
  });
});

describe("getDashboardHistory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 15));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retorna meses com totais agregados, somando faturas de cartão por ciclo", async () => {
    const incomeRows = [
      { year: 2025, monthNum: 4, total: 500_000 },
      { year: 2025, monthNum: 5, total: 800_000 },
      { year: 2025, monthNum: 6, total: 1_000_000 },
    ];
    const expenseRows = [
      { year: 2025, monthNum: 4, total: 300_000 },
      { year: 2025, monthNum: 5, total: 600_000 },
      { year: 2025, monthNum: 6, total: 100_000 },
    ];
    const cardStatementRows = [{ year: 2025, monthNum: 6, total: 70_000 }];

    let callIndex = 0;
    dbMock.select.mockImplementation(() => {
      const response =
        callIndex === 0
          ? incomeRows
          : callIndex === 1
            ? expenseRows
            : cardStatementRows;
      callIndex++;
      return {
        from: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(response),
          }),
        }),
      };
    });

    const history = await dashboardService.getDashboardHistory("user-1", 3);

    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({
      month: "2025-04",
      incomes: 500_000,
      expenses: 300_000,
      balance: 200_000,
    });
    expect(history[1]).toMatchObject({
      month: "2025-05",
      incomes: 800_000,
      expenses: 600_000,
      balance: 200_000,
    });
    expect(history[2]).toMatchObject({
      month: "2025-06",
      incomes: 1_000_000,
      expenses: 170_000,
      balance: 830_000,
    });
    expect(dbMock.select).toHaveBeenCalledTimes(3);
  });
});
```

This changes both describe blocks at once (the file is small and both need
the same mock-module update), but only the **assertions** matter for this
step — the implementation hasn't changed yet, so both tests are expected to
fail.

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/api`:

```bash
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit dashboard.service.test
```

Expected: both tests FAIL. `getDashboardSummary`'s test fails because
`dbMock.select` is only called 3 times today (not 4) and `totalExpenses`
comes out as `250_000` (the 3rd mocked response, since the 4th/`groupBy`
response never gets consumed correctly). `getDashboardHistory`'s test fails
because `dbMock.select` is only called 2 times today (not 3) and
`history[2].expenses` is `100_000`, not `170_000`.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/api/src/modules/dashboard/dashboard.service.test.ts
git commit -m "test(dashboard): expect fatura totals instead of unitary credit-card expenses"
```

---

### Task 2: Implement the fatura-based totals in `dashboard.service.ts`

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts`

- [ ] **Step 1: Replace the file content**

```ts
import { creditCardStatements, expenses, getDb, incomes } from "@money-manager/db";
import type {
  DashboardHistoryMonth,
  DashboardSummary,
} from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import { and, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import * as goalsService from "../goals/goals.service.js";
import { syncUserDebtsForMonth } from "../debts/debts.service.js";

function monthYearRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function buildMonthSlots(
  months: number,
): Array<{ year: number; monthNum: number; month: string }> {
  const now = new Date();
  const slots: Array<{ year: number; monthNum: number; month: string }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const monthNum = date.getMonth() + 1;
    slots.push({
      year,
      monthNum,
      month: `${year}-${String(monthNum).padStart(2, "0")}`,
    });
  }

  return slots;
}

export async function getDashboardSummary(
  userId: string,
  year: number,
  month: number,
): Promise<DashboardSummary> {
  await syncUserDebtsForMonth(userId, year, month);

  const db = getDb();
  const { start, end } = monthYearRange(year, month);

  const [
    incomesResult,
    expensesResult,
    cardStatementsResult,
    categoryRows,
    goalsUsageRows,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)::int`,
      })
      .from(incomes)
      .where(
        and(
          eq(incomes.userId, userId),
          isNull(incomes.deletedAt),
          gte(incomes.occurredAt, start),
          lte(incomes.occurredAt, end),
        ),
      ),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          ne(expenses.paymentMethod, "credit_card"),
          gte(expenses.occurredAt, start),
          lte(expenses.occurredAt, end),
        ),
      ),
    db
      .select({
        total: sql<number>`COALESCE(SUM(COALESCE(${creditCardStatements.adjustedTotalCents}, ${creditCardStatements.calculatedTotalCents})), 0)::int`,
      })
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.userId, userId),
          eq(creditCardStatements.cycleYear, year),
          eq(creditCardStatements.cycleMonth, month),
        ),
      ),
    db
      .select({
        category: expenses.goalCategory,
        total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          gte(expenses.occurredAt, start),
          lte(expenses.occurredAt, end),
        ),
      )
      .groupBy(expenses.goalCategory),
    goalsService.getGoalUsage(userId, year, month),
  ]);

  const totalIncomes = incomesResult[0]?.total ?? 0;
  const nonCreditCardExpenses = expensesResult[0]?.total ?? 0;
  const creditCardBillsTotal = cardStatementsResult[0]?.total ?? 0;
  const totalExpenses = nonCreditCardExpenses + creditCardBillsTotal;

  const expensesByCategory = categoryRows
    .filter((row) => row.category !== null && (row.total ?? 0) > 0)
    .map((row) => ({
      category: GOAL_CATEGORY_LABELS[row.category!] ?? row.category!,
      amount: row.total ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const goalsUsage = goalsUsageRows.map((goal) => ({
    category: goal.category,
    percentage: goal.percentageValue,
    ceiling: goal.ceiling,
    spent: goal.spent,
    usagePercent: goal.usagePercent,
  }));

  return {
    totalIncomes,
    totalExpenses,
    balance: totalIncomes - totalExpenses,
    expensesByCategory,
    goalsUsage,
  };
}

export async function getDashboardHistory(
  userId: string,
  months: number,
): Promise<DashboardHistoryMonth[]> {
  const db = getDb();
  const slots = buildMonthSlots(months);
  const first = slots[0];
  const last = slots[slots.length - 1];

  if (!first || !last) {
    return [];
  }

  const { start } = monthYearRange(first.year, first.monthNum);
  const { end } = monthYearRange(last.year, last.monthNum);

  const monthKey = (year: number, monthNum: number) => `${year}-${monthNum}`;

  const [incomeRows, expenseRows, cardStatementRows] = await Promise.all([
    db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${incomes.occurredAt})::int`,
        monthNum: sql<number>`EXTRACT(MONTH FROM ${incomes.occurredAt})::int`,
        total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)::int`,
      })
      .from(incomes)
      .where(
        and(
          eq(incomes.userId, userId),
          isNull(incomes.deletedAt),
          gte(incomes.occurredAt, start),
          lte(incomes.occurredAt, end),
        ),
      )
      .groupBy(
        sql`EXTRACT(YEAR FROM ${incomes.occurredAt})`,
        sql`EXTRACT(MONTH FROM ${incomes.occurredAt})`,
      ),
    db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${expenses.occurredAt})::int`,
        monthNum: sql<number>`EXTRACT(MONTH FROM ${expenses.occurredAt})::int`,
        total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          ne(expenses.paymentMethod, "credit_card"),
          gte(expenses.occurredAt, start),
          lte(expenses.occurredAt, end),
        ),
      )
      .groupBy(
        sql`EXTRACT(YEAR FROM ${expenses.occurredAt})`,
        sql`EXTRACT(MONTH FROM ${expenses.occurredAt})`,
      ),
    db
      .select({
        year: creditCardStatements.cycleYear,
        monthNum: creditCardStatements.cycleMonth,
        total: sql<number>`COALESCE(SUM(COALESCE(${creditCardStatements.adjustedTotalCents}, ${creditCardStatements.calculatedTotalCents})), 0)::int`,
      })
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.userId, userId),
          or(
            ...slots.map((slot) =>
              and(
                eq(creditCardStatements.cycleYear, slot.year),
                eq(creditCardStatements.cycleMonth, slot.monthNum),
              ),
            ),
          ),
        ),
      )
      .groupBy(creditCardStatements.cycleYear, creditCardStatements.cycleMonth),
  ]);

  const incomesByMonth = new Map(
    incomeRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );
  const nonCreditCardExpensesByMonth = new Map(
    expenseRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );
  const creditCardBillsByMonth = new Map(
    cardStatementRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );

  return slots.map((slot) => {
    const key = monthKey(slot.year, slot.monthNum);
    const incomesTotal = incomesByMonth.get(key) ?? 0;
    const expensesTotal =
      (nonCreditCardExpensesByMonth.get(key) ?? 0) +
      (creditCardBillsByMonth.get(key) ?? 0);

    return {
      month: slot.month,
      year: slot.year,
      monthNum: slot.monthNum,
      incomes: incomesTotal,
      expenses: expensesTotal,
      balance: incomesTotal - expensesTotal,
    };
  });
}
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit dashboard.service.test
```

Expected: PASS (both describe blocks).

- [ ] **Step 3: Type-check the API package**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/dashboard/dashboard.service.ts
git commit -m "feat(dashboard): use fatura totals instead of unitary credit-card expenses"
```

---

### Task 3: Integration test proving the fix end-to-end (real DB)

**Files:**
- Create: `apps/api/tests/integration/dashboard-cards.integration.test.ts`

This proves the exact bug the feature fixes: a credit-card purchase dated
inside calendar month M can belong to a *different* billing cycle (M+1) —
the dashboard for month M must not count it at all (neither unitarily nor as
part of a fatura), and the dashboard for the billing-cycle month must count
the fatura total, even though no expense has `occurredAt` in that month.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "@jest/globals";
import { findBillingCycleForPurchase } from "@money-manager/utils/billing-cycle";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("dashboard cards fatura total integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("conta a fatura pelo mês do ciclo de faturamento, não pela data da despesa", async () => {
    const { accessToken } = await registerUser(app);

    const cardRes = await request(app)
      .post("/v1/credit-cards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Nubank Roxinho", lastFour: "1234", dueDay: 10 });
    expect(cardRes.status).toBe(201);
    const cardId = cardRes.body.id as string;

    // dueDay 10 / closingOffsetDays padrão 7 fecha por volta do dia 3.
    // Uma compra em 15/06 cai no ciclo de julho (04/06 a 03/07).
    const purchaseDate = new Date(2025, 5, 15);
    const cycle = findBillingCycleForPurchase(purchaseDate, 10, 7);

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 200,
        description: "Mercado (dinheiro)",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        occurredAt: new Date(2025, 5, 10).toISOString(),
      });

    const cardExpenseRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 300,
        description: "Compra no crédito",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseDate.toISOString(),
      });
    expect(cardExpenseRes.status).toBe(201);

    const juneRes = await request(app)
      .get("/v1/dashboard/summary?year=2025&month=6")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(juneRes.status).toBe(200);
    expect(juneRes.body.totalExpenses).toBe(20_000);
    expect(juneRes.body.expensesByCategory).toEqual(
      expect.arrayContaining([
        { category: "Custos Fixos", amount: 20_000 },
        { category: "Prazeres", amount: 30_000 },
      ]),
    );

    const cycleRes = await request(app)
      .get(`/v1/dashboard/summary?year=${cycle.cycleYear}&month=${cycle.cycleMonth}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(cycleRes.status).toBe(200);
    expect(cycleRes.body.totalExpenses).toBe(30_000);
    expect(cycleRes.body.expensesByCategory).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the integration test**

Requires `DATABASE_URL` to be set (see `apps/api/.env` or the project's test
DB setup); if unset, `describeWithDb` skips the suite.

```bash
cd apps/api && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects integration --runInBand dashboard-cards.integration.test
```

Expected: PASS (or SKIPPED if `DATABASE_URL` is not configured in this
environment — in that case, note it in the task wrap-up instead of treating
it as a failure).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/dashboard-cards.integration.test.ts
git commit -m "test(dashboard): add integration coverage for fatura-based totals"
```

---

### Task 4: Accumulated fatura total banner on `/dashboard/cards`

**Files:**
- Modify: `apps/web/src/pages/CreditCardsPage.tsx`

No automated frontend tests exist in this repo (`apps/web` has no test
runner configured and no `*.test.tsx` files anywhere under `apps/web/src`),
so this task is implemented directly and verified manually in the browser
(Step 3).

- [ ] **Step 1: Add the currency formatter, the accumulated total, and the import**

In `apps/web/src/pages/CreditCardsPage.tsx`, change the import block (lines
1–13) from:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreditCard, CreditCardWithCurrentStatement } from "@money-manager/types";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import {
  MONTH_OPTIONS,
  buildYearOptions,
  getCurrentMonthYear,
} from "../lib/transaction-list-filters";
import { FilterSelect } from "../components/ui/filter-select";
import { CreditCardFormModal } from "../components/features/credit-cards/credit-card-form-modal";
import { StatementCard } from "../components/features/credit-cards/statement-card";
import { Calendar as CalendarIcon, CreditCard as CreditCardIcon, Plus } from "lucide-react";
```

to:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreditCard, CreditCardWithCurrentStatement } from "@money-manager/types";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import {
  MONTH_OPTIONS,
  buildYearOptions,
  formatFilterPeriodLabel,
  getCurrentMonthYear,
} from "../lib/transaction-list-filters";
import { FilterSelect } from "../components/ui/filter-select";
import { CreditCardFormModal } from "../components/features/credit-cards/credit-card-form-modal";
import { StatementCard } from "../components/features/credit-cards/statement-card";
import { Calendar as CalendarIcon, CreditCard as CreditCardIcon, Plus } from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
```

- [ ] **Step 2: Compute the accumulated total and render the banner**

In the same file, after the `yearOptions` memo (currently lines 35–42), add:

```tsx
  const accumulatedTotalCents = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (!item.currentStatement) {
          return sum;
        }
        const effectiveTotal =
          item.currentStatement.adjustedTotalCents ??
          item.currentStatement.calculatedTotalCents;
        return sum + effectiveTotal;
      }, 0),
    [items],
  );

  const periodLabel = formatFilterPeriodLabel(month, year);
```

Then, in the JSX, insert a summary banner right after the filter row
(`</div>` that closes the `flex h-12 items-center gap-2 ...` block, currently
ending at line 147) and before the `{error ? (` block (currently line 149):

```tsx
      {!loading && items.length > 0 ? (
        <div className="glass flex items-center justify-between rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Total de faturas · {periodLabel}
            </p>
            <p
              className="mt-1 text-2xl font-bold text-white"
              data-testid="cards-accumulated-total"
            >
              {formatCurrency(accumulatedTotalCents)}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CreditCardIcon className="h-5 w-5" />
          </div>
        </div>
      ) : null}
```

The final file, from the filter row through the new banner, should read:

```tsx
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-3 sm:h-14 sm:gap-3 sm:px-4">
        <CalendarIcon className="h-4 w-4 shrink-0 text-zinc-500" />
        <FilterSelect
          value={month}
          onChange={(value) => {
            setPeriodFilterActive(true);
            setMonth(value);
          }}
          options={monthOptions}
          ariaLabel="Mês"
        />
        <span className="text-zinc-700">/</span>
        <FilterSelect
          value={year}
          onChange={(value) => {
            setPeriodFilterActive(true);
            setYear(value);
          }}
          options={yearOptions}
          ariaLabel="Ano"
          className="max-w-[5.5rem]"
        />
      </div>

      {!loading && items.length > 0 ? (
        <div className="glass flex items-center justify-between rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Total de faturas · {periodLabel}
            </p>
            <p
              className="mt-1 text-2xl font-bold text-white"
              data-testid="cards-accumulated-total"
            >
              {formatCurrency(accumulatedTotalCents)}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CreditCardIcon className="h-5 w-5" />
          </div>
        </div>
      ) : null}

      {error ? (
```

- [ ] **Step 3: Type-check and manually verify in the browser**

```bash
cd apps/web && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

Then start the web dev server, log in as a test user with at least one
credit card that has a statement in the current period, open
`/dashboard/cards`, and confirm:
- The new "Total de faturas" banner appears above the card list, showing the
  sum of every visible card's displayed total (the same number you'd get by
  adding up each `StatementCard`'s "Total da fatura" value by hand).
- Changing the month/year filter updates the banner to match the new set of
  statements.
- With zero cards (or before any card is created), the banner does not
  render (empty state is unaffected).
- Adjusting a statement's total (via "Ajustar total" on a `StatementCard`)
  and reloading updates the banner accordingly (it must use
  `adjustedTotalCents` when present, not `calculatedTotalCents`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/CreditCardsPage.tsx
git commit -m "feat(credit-cards): show accumulated fatura total for the filtered period"
```

---

### Task 5: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full API test suite**

```bash
cd apps/api && npm test
```

Expected: all unit tests pass; integration tests pass if `DATABASE_URL` is
configured, otherwise they're skipped via `describeWithDb`.

- [ ] **Step 2: Build both apps to catch any type errors across package boundaries**

```bash
cd apps/api && npm run build
cd ../../apps/web && npm run build
```

Expected: both builds succeed.

- [ ] **Step 3: Confirm the manual browser check from Task 4 Step 3 was completed**

If it wasn't (e.g. no dev DB with credit cards available in this
environment), say so explicitly instead of claiming the feature was
verified end-to-end.
