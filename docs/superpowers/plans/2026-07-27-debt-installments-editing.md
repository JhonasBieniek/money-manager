# Debt Installments Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users mark individual debt installments as paid — at
creation time and afterwards — without generating an expense, and let
them freely edit any field of an existing debt (count, period,
per-installment amount, total, start date) even when installments are
already paid, by freezing paid rows and only ever regenerating the
pending tail of the schedule.

**Architecture:** One new endpoint (`PATCH
/v1/debts/:debtId/installments/:installmentId`) flips a single
installment's paid state without touching expenses. `updateDebt`'s
structural-change branch is rewritten to always run (the current
"blocked when any installment is paid" guard is deleted): it deletes only
`pending` rows, recomputes the pending tail's due dates/amounts from the
(possibly changed) count/period/amount/start date, and leaves `paid` rows
completely untouched. The frontend gets a shared installment-list UI
component reused by both the create-time preview (local state only, no
API calls until the debt exists) and the edit-time list (each toggle is
an immediate API call).

**Tech stack:** Express + Drizzle + Zod on the API; React + `apiFetch` on
the web app. No new tables/columns — `debtInstallments.status/paidAt/expenseId`
already support everything needed.

**Global constraints (apply to every task):**
- Money is always cents (`Math.round(x * 100)`), dates are always
  `"YYYY-MM-DD"` strings over the wire (`toDateString`/`parseDateString`
  from `@money-manager/utils/installment-schedule`).
- Every `AppError` subclass constructor takes a Portuguese user-facing
  message (see `apps/api/src/shared/errors/app-error.ts`); the error
  middleware serializes it as `{ error, code }` — never `{ message }`.
- `apiFetch` (`apps/web/src/lib/api.ts`) already sets
  `content-type: application/json` whenever `init.body` is set, and
  already attaches the bearer token / CSRF header — call sites never set
  those headers themselves.
- Paid installment rows (`status: "paid"`) are immutable once written by
  this feature: their `installmentNumber`, `dueDate`, `amountCents` never
  change after being set. Only `pending` rows are ever deleted/regenerated.

---

### Task 1: Backend — installment status Zod schemas

**Files:**
- Modify: `apps/api/src/modules/debts/debts.schema.ts`

- [ ] **Step 1: Add the two new schemas**

Append to the end of `apps/api/src/modules/debts/debts.schema.ts` (after
the existing `debtIdParamsSchema`/`DebtIdParams` export):

```ts
export const installmentIdParamsSchema = z.object({
  debtId: z.string().uuid(),
  installmentId: z.string().uuid(),
});

export type InstallmentIdParams = z.infer<typeof installmentIdParamsSchema>;

export const setInstallmentStatusBodySchema = z.object({
  status: z.enum(["paid", "pending"]),
});

export type SetInstallmentStatusBody = z.infer<
  typeof setInstallmentStatusBodySchema
>;
```

- [ ] **Step 2: Typecheck**

Run: `cd "apps/api" && pnpm exec tsc --noEmit -p .`
Expected: no errors (these are pure additions, nothing references them
yet).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/debts/debts.schema.ts
git commit -m "feat(debts): add installment status schemas"
```

---

### Task 2: Backend — `resolveInstallmentCentsForUpdate` (exported, unit-tested)

This replaces `resolveAmountsForUpdate`. The new function only resolves
the per-installment cents for the *pending* tail of an update — the total
is now computed by the caller from paid (frozen) + pending (this value),
not by this function (see Task 3).

**Files:**
- Modify: `apps/api/src/modules/debts/debts.service.ts`
- Create: `apps/api/src/modules/debts/debts.service.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `apps/api/src/modules/debts/debts.service.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { resolveInstallmentCentsForUpdate } from "./debts.service.js";

const baseExisting = {
  installmentCents: 5000,
} as Parameters<typeof resolveInstallmentCentsForUpdate>[1];

describe("resolveInstallmentCentsForUpdate", () => {
  it("mantém o valor da parcela existente quando nada sobre valor é informado", () => {
    const result = resolveInstallmentCentsForUpdate(
      { installmentCount: 6 },
      baseExisting,
      2,
      10000,
      6,
    );
    expect(result).toBe(5000);
  });

  it("usa installmentAmount quando informado, mesmo com parcelas pagas", () => {
    const result = resolveInstallmentCentsForUpdate(
      { installmentAmount: 75 },
      baseExisting,
      2,
      10000,
      6,
    );
    expect(result).toBe(7500);
  });

  it("deriva o valor da parcela a partir de totalAmount, descontando o já pago", () => {
    // 2 paid @ 5000 = 10000 paidTotalCents; new total 40000; pendingCount = 6 - 2 = 4
    // pending total = 40000 - 10000 = 30000; per installment = 30000 / 4 = 7500
    const result = resolveInstallmentCentsForUpdate(
      { totalAmount: 400 },
      baseExisting,
      2,
      10000,
      6,
    );
    expect(result).toBe(7500);
  });

  it("cai no valor existente quando totalAmount é informado mas não há parcelas pendentes", () => {
    const result = resolveInstallmentCentsForUpdate(
      { totalAmount: 100 },
      baseExisting,
      6,
      30000,
      6,
    );
    expect(result).toBe(5000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`):
```bash
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit src/modules/debts/debts.service.test.ts
```
Expected: FAIL — `resolveInstallmentCentsForUpdate is not a function` (or
similar), since the export doesn't exist yet.

- [ ] **Step 3: Replace `resolveAmountsForUpdate` with the new function**

In `apps/api/src/modules/debts/debts.service.ts`, replace the entire
`resolveAmountsForUpdate` function (currently lines 146–194) with:

```ts
export function resolveInstallmentCentsForUpdate(
  input: UpdateDebtBody,
  existing: DebtRow,
  paidCount: number,
  paidTotalCents: number,
  installmentCount: number,
): number {
  const pendingCount = installmentCount - paidCount;

  if (input.installmentAmount !== undefined) {
    return Math.round(input.installmentAmount * 100);
  }

  if (input.totalAmount !== undefined) {
    if (pendingCount === 0) {
      return existing.installmentCents;
    }
    const totalCents = Math.round(input.totalAmount * 100);
    return Math.round((totalCents - paidTotalCents) / pendingCount);
  }

  return existing.installmentCents;
}
```

Note: `installmentCount`/`installmentPeriod` resolution (`input.installmentCount
?? existing.installmentCount`, etc.) moves to the call site in `updateDebt`
(Task 3) — this function no longer computes them.

- [ ] **Step 4: Run tests to verify they pass**

Run the same command as Step 2.
Expected: `Tests: 4 passed, 4 total`.

Note: the file won't fully typecheck yet (`updateDebt` still calls the
old `resolveAmountsForUpdate` shape) — that's fixed in Task 3. This is
expected and fine; the unit test only imports the one function, which
already compiles standalone.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/debts/debts.service.ts apps/api/src/modules/debts/debts.service.test.ts
git commit -m "feat(debts): resolve pending installment amount via resolveInstallmentCentsForUpdate"
```

---

### Task 3: Backend — freeze paid installments in `updateDebt`

**Files:**
- Modify: `apps/api/src/modules/debts/debts.service.ts`
- Modify: `apps/api/tests/integration/debts.integration.test.ts`

- [ ] **Step 1: Replace `countPaidInstallments` with `getPaidInstallmentAmounts`**

In `apps/api/src/modules/debts/debts.service.ts`, replace the
`countPaidInstallments` function (currently lines 123–134) with:

```ts
async function getPaidInstallmentAmounts(debtId: string): Promise<number[]> {
  const rows = await getDb()
    .select({ amountCents: debtInstallments.amountCents })
    .from(debtInstallments)
    .where(
      and(
        eq(debtInstallments.debtId, debtId),
        eq(debtInstallments.status, "paid"),
      ),
    );
  return rows.map((row) => row.amountCents);
}
```

- [ ] **Step 2: Rewrite `updateDebt`**

Replace the entire `updateDebt` function (currently lines 502–645,
starting at `export async function updateDebt(` and ending at the closing
`}` before `export async function deleteDebt`) with:

```ts
export async function updateDebt(
  userId: string,
  debtId: string,
  input: UpdateDebtBody,
): Promise<DebtWithInstallments> {
  const row = await getDebtRow(userId, debtId);
  const paidAmounts = await getPaidInstallmentAmounts(debtId);
  const paidCount = paidAmounts.length;
  const paidTotalCents = paidAmounts.reduce((acc, cents) => acc + cents, 0);

  const paymentMethod =
    input.paymentMethodIndex !== undefined
      ? PAYMENT_METHOD_MAP[input.paymentMethodIndex]!
      : (row.paymentMethod as PaymentMethod);
  const creditCardId =
    paymentMethod === "credit_card"
      ? (input.creditCardId ?? row.creditCardId)
      : null;

  if (paymentMethod === "credit_card" && creditCardId) {
    await assertCreditCardBelongsToUser(userId, creditCardId);
  }

  const now = new Date();
  const updates: Partial<DebtRow> = { updatedAt: now };

  if (input.name !== undefined) {
    updates.name = input.name.trim();
  }
  if (input.autoSyncExpenses !== undefined) {
    updates.autoSyncExpenses = input.autoSyncExpenses;
  }
  if (
    input.paymentMethodIndex !== undefined ||
    input.creditCardId !== undefined
  ) {
    updates.paymentMethod = paymentMethod;
    updates.creditCardId = creditCardId;
  }

  if (hasStructuralChanges(input)) {
    const installmentCount = input.installmentCount ?? row.installmentCount;
    const installmentPeriod = (input.installmentPeriod ??
      row.installmentPeriod) as InstallmentPeriod;

    if (installmentCount < paidCount) {
      throw new BadRequestError(
        "A quantidade de parcelas não pode ser menor que as parcelas já pagas",
      );
    }

    const installmentCents = resolveInstallmentCentsForUpdate(
      input,
      row,
      paidCount,
      paidTotalCents,
      installmentCount,
    );

    const startDate = input.startDate
      ? parseDateString(input.startDate)
      : parseDateString(row.startDate);
    const endDate = calculateDebtEndDate(
      startDate,
      installmentCount,
      installmentPeriod,
    );
    const fullDueDates = generateInstallmentDueDates(
      startDate,
      installmentCount,
      installmentPeriod,
    );
    const pendingDueDates = fullDueDates.slice(paidCount);
    const totalCents =
      paidTotalCents + installmentCents * pendingDueDates.length;

    await getDb().transaction(async (tx) => {
      await tx
        .delete(debtInstallments)
        .where(
          and(
            eq(debtInstallments.debtId, debtId),
            eq(debtInstallments.status, "pending"),
          ),
        );

      await tx
        .update(debts)
        .set({
          ...updates,
          installmentCount,
          installmentPeriod,
          installmentCents,
          totalCents,
          startDate: toDateString(startDate),
          endDate: toDateString(endDate),
        })
        .where(eq(debts.id, debtId));

      if (pendingDueDates.length > 0) {
        await tx.insert(debtInstallments).values(
          pendingDueDates.map((dueDate, index) => ({
            id: newId(),
            debtId,
            userId,
            installmentNumber: paidCount + index + 1,
            dueDate: toDateString(dueDate),
            amountCents: installmentCents,
            status: "pending" as const,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      await refreshDebtBalance(tx, debtId);

      const autoSync = input.autoSyncExpenses ?? row.autoSyncExpenses;
      if (autoSync) {
        const [debt] = await tx
          .select()
          .from(debts)
          .where(eq(debts.id, debtId))
          .limit(1);
        if (debt) {
          await syncInstallmentsForMonth(
            tx,
            userId,
            debt,
            now.getFullYear(),
            now.getMonth() + 1,
          );
        }
      }
    });
  } else {
    await getDb().update(debts).set(updates).where(eq(debts.id, debtId));

    if (input.autoSyncExpenses === true && !row.autoSyncExpenses) {
      const [debt] = await getDb()
        .select()
        .from(debts)
        .where(eq(debts.id, debtId))
        .limit(1);
      if (debt) {
        await getDb().transaction(async (tx) => {
          await syncInstallmentsForMonth(
            tx,
            userId,
            debt,
            now.getFullYear(),
            now.getMonth() + 1,
          );
        });
      }
    }
  }

  const result = await listDebts(userId);
  const updated = result.items.find((item) => item.id === debtId);
  if (!updated) {
    throw new NotFoundError("Dívida não encontrada");
  }
  return updated;
}
```

Note what's gone from the old version: the `hasPaidInstallments &&
hasStructuralChanges(input) → throw BadRequestError("Não é possível
alterar parcelas ou valores após o pagamento de parcelas")` guard is
deleted entirely, and the branch condition changed from `!hasPaidInstallments
&& hasStructuralChanges(input)` to just `hasStructuralChanges(input)`
(structural edits are now always allowed). The `remainingBalanceCents:
totalCents, status: "active"` fields are no longer set directly in the
`debts` update — `refreshDebtBalance` (already called right after) derives
both correctly from the new `totalCents` and the untouched paid rows,
which is required now that `paidCount` can be > 0 here.

- [ ] **Step 3: Typecheck**

Run: `cd "apps/api" && pnpm exec tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Run the Task 2 unit tests again**

Run (from `apps/api`):
```bash
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit src/modules/debts/debts.service.test.ts
```
Expected: `Tests: 4 passed, 4 total` (unchanged from Task 2 — confirms the
rewrite didn't break the pure function).

- [ ] **Step 5: Replace the now-obsolete "blocked" integration test**

In `apps/api/tests/integration/debts.integration.test.ts`, replace the
`it("PATCH /v1/debts/:id bloqueia alteração estrutural com parcelas
pagas", ...)` test (currently lines 201–223) with:

```ts
  it("PATCH /v1/debts/:id aumenta parcelas mantendo as já pagas congeladas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida com parcelas pagas",
        installmentCount: 2,
        installmentAmount: 30,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const paidInstallment = createRes.body.installments.find(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidInstallment).toBeDefined();

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 4 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installmentCount).toBe(4);
    expect(patchRes.body.installments).toHaveLength(4);

    const stillPaid = patchRes.body.installments.find(
      (item: { id: string }) => item.id === paidInstallment.id,
    );
    expect(stillPaid.status).toBe("paid");
    expect(stillPaid.dueDate).toBe(paidInstallment.dueDate);
    expect(stillPaid.amountCents).toBe(paidInstallment.amountCents);

    // paid (3000) + 3 new pending @ 3000 = 3000 + 9000 = 12000
    expect(patchRes.body.totalCents).toBe(12000);
    expect(patchRes.body.paidCents).toBe(3000);
  });

  it("PATCH /v1/debts/:id altera período e data de início preservando parcelas pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida com período alterado",
        installmentCount: 2,
        installmentAmount: 40,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const paidInstallment = createRes.body.installments.find(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidInstallment).toBeDefined();

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentPeriod: "weekly", startDate: "2027-01-01" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installmentPeriod).toBe("weekly");

    const stillPaid = patchRes.body.installments.find(
      (item: { id: string }) => item.id === paidInstallment.id,
    );
    expect(stillPaid.status).toBe("paid");
    expect(stillPaid.dueDate).toBe(paidInstallment.dueDate);
    expect(stillPaid.amountCents).toBe(paidInstallment.amountCents);

    const pending = patchRes.body.installments.find(
      (item: { id: string }) => item.id !== paidInstallment.id,
    );
    expect(pending.status).toBe("pending");
    // paidCount = 1, so the pending row is index 1 of the regenerated
    // schedule: startDate (2027-01-01) + 1 week = 2027-01-08.
    expect(pending.dueDate).toBe("2027-01-08");
  });

  it("PATCH /v1/debts/:id rejeita quantidade de parcelas menor que as já pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida quase paga",
        installmentCount: 2,
        installmentAmount: 30,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 0 });

    expect(patchRes.status).toBe(400);
  });
```

(The first new test reuses the existing `autoSyncExpenses: true` +
2-installment pattern from the test right above it in this file, which
already reliably produces exactly one paid installment via the
create-time auto-sync — same mechanism the "atualiza nome e flags com
parcelas pagas" test above it already depends on.)

- [ ] **Step 6: Start a disposable Postgres and run migrations**

```bash
docker rm -f mm-plan-test-db >/dev/null 2>&1
docker run -d --name mm-plan-test-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=money_manager_test -p 55440:5432 postgres:16-alpine
for i in $(seq 1 15); do docker exec mm-plan-test-db pg_isready -U postgres >/dev/null 2>&1 && echo READY && break; sleep 1; done
cd "packages/db" && DATABASE_URL="postgres://postgres:postgres@localhost:55440/money_manager_test" pnpm drizzle-kit migrate
```
Expected: `READY`, then `migrations applied successfully!`.

- [ ] **Step 7: Run the debts integration suite**

Run (from `apps/api`):
```bash
DATABASE_URL="postgres://postgres:postgres@localhost:55440/money_manager_test" JWT_SECRET="test-secret-for-jest-minimum-32-chars-long" node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects integration --runInBand tests/integration/debts.integration.test.ts
```
Expected: all tests pass (9 previous + 3 new − 1 replaced = 11 total).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/debts/debts.service.ts apps/api/tests/integration/debts.integration.test.ts
git commit -m "feat(debts): allow editing any debt field with paid installments frozen"
```

---

### Task 4: Backend — toggle installment paid state endpoint

**Files:**
- Modify: `apps/api/src/modules/debts/debts.service.ts`
- Modify: `apps/api/src/modules/debts/debts.controller.ts`
- Modify: `apps/api/src/modules/debts/debts.routes.ts`
- Modify: `apps/api/tests/integration/debts.integration.test.ts`

- [ ] **Step 1: Add `setInstallmentStatus` to the service**

In `apps/api/src/modules/debts/debts.service.ts`, add this new exported
function directly above `export async function deleteDebt`:

```ts
export async function setInstallmentStatus(
  userId: string,
  debtId: string,
  installmentId: string,
  status: "paid" | "pending",
): Promise<DebtWithInstallments> {
  await getDebtRow(userId, debtId);

  const [installment] = await getDb()
    .select()
    .from(debtInstallments)
    .where(
      and(
        eq(debtInstallments.id, installmentId),
        eq(debtInstallments.debtId, debtId),
      ),
    )
    .limit(1);

  if (!installment) {
    throw new NotFoundError("Parcela não encontrada");
  }

  if (installment.status !== status) {
    const now = new Date();
    await getDb().transaction(async (tx) => {
      if (status === "paid") {
        await tx
          .update(debtInstallments)
          .set({ status: "paid", paidAt: now, updatedAt: now })
          .where(eq(debtInstallments.id, installmentId));
      } else {
        await tx
          .update(debtInstallments)
          .set({
            status: "pending",
            paidAt: null,
            expenseId: null,
            updatedAt: now,
          })
          .where(eq(debtInstallments.id, installmentId));
      }
      await refreshDebtBalance(tx, debtId);
    });
  }

  const result = await listDebts(userId);
  const updated = result.items.find((item) => item.id === debtId);
  if (!updated) {
    throw new NotFoundError("Dívida não encontrada");
  }
  return updated;
}
```

- [ ] **Step 2: Add the controller handler**

In `apps/api/src/modules/debts/debts.controller.ts`, add the new import
and handler:

```ts
import {
  createDebtBodySchema,
  debtIdParamsSchema,
  installmentIdParamsSchema,
  setInstallmentStatusBodySchema,
  updateDebtBodySchema,
} from "./debts.schema.js";
```

(replaces the existing 3-item import block at the top of the file), and
append this new function at the end of the file:

```ts
export async function setInstallmentStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const { debtId, installmentId } = installmentIdParamsSchema.parse(
    req.params,
  );
  const { status } = setInstallmentStatusBodySchema.parse(req.body);
  const debt = await debtsService.setInstallmentStatus(
    getUserId(req),
    debtId,
    installmentId,
    status,
  );
  res.status(200).json(debt);
}
```

- [ ] **Step 3: Add the route**

In `apps/api/src/modules/debts/debts.routes.ts`, append after the
existing `delete` route:

```ts
debtsRoutes.patch(
  "/:debtId/installments/:installmentId",
  authenticate,
  debtsController.setInstallmentStatus,
);
```

Full file after this change:

```ts
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as debtsController from "./debts.controller.js";

export const debtsRoutes = Router();

debtsRoutes.get("/", authenticate, debtsController.list);
debtsRoutes.post("/", authenticate, debtsController.create);
debtsRoutes.patch("/:id", authenticate, debtsController.update);
debtsRoutes.delete("/:id", authenticate, debtsController.remove);
debtsRoutes.patch(
  "/:debtId/installments/:installmentId",
  authenticate,
  debtsController.setInstallmentStatus,
);
```

- [ ] **Step 4: Typecheck**

Run: `cd "apps/api" && pnpm exec tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Add integration tests**

In `apps/api/tests/integration/debts.integration.test.ts`, add these new
tests right before the final `it("DELETE /v1/debts/:id ...")` test:

```ts
  it("PATCH /v1/debts/:debtId/installments/:installmentId marca parcelas pagas manualmente em sequência, sem criar despesa", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Marcação manual",
        installmentCount: 5,
        installmentAmount: 60,
        autoSyncExpenses: false,
      });

    const debtId = createRes.body.id as string;
    const [firstId, secondId] = createRes.body.installments.map(
      (item: { id: string }) => item.id,
    );

    // Simulates marking 2 of 5 installments as already paid right after
    // creation, via sequential toggle calls (the pattern the frontend uses).
    await request(app)
      .patch(`/v1/debts/${debtId}/installments/${firstId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });

    const toggleRes = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${secondId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });

    expect(toggleRes.status).toBe(200);
    const paidItems = toggleRes.body.installments.filter(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidItems).toHaveLength(2);
    expect(paidItems.every((item: { expenseId: string | null }) => item.expenseId === null)).toBe(
      true,
    );
    expect(toggleRes.body.paidCents).toBe(12000);
    expect(toggleRes.body.remainingBalanceCents).toBe(18000);

    const expensesRes = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(
      expensesRes.body.items.some((item: { description: string }) =>
        item.description.includes("Marcação manual"),
      ),
    ).toBe(false);
  });

  it("PATCH /v1/debts/:debtId/installments/:installmentId desmarca parcela paga por autoSync sem apagar a despesa", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Desmarcar sync",
        installmentCount: 1,
        installmentAmount: 45,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const installment = createRes.body.installments[0];
    expect(installment.status).toBe("paid");
    expect(installment.expenseId).not.toBeNull();

    const toggleRes = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${installment.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "pending" });

    expect(toggleRes.status).toBe(200);
    const toggled = toggleRes.body.installments.find(
      (item: { id: string }) => item.id === installment.id,
    );
    expect(toggled.status).toBe("pending");
    expect(toggled.expenseId).toBeNull();
    expect(toggleRes.body.paidCents).toBe(0);

    const expensesRes = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(
      expensesRes.body.items.some((item: { description: string }) =>
        item.description.includes("Desmarcar sync"),
      ),
    ).toBe(true);
  });

  it("PATCH /v1/debts/:debtId/installments/:installmentId é idempotente e retorna 404 para parcela inexistente", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Idempotência",
        installmentCount: 1,
        installmentAmount: 10,
      });

    const debtId = createRes.body.id as string;
    const installmentId = createRes.body.installments[0].id as string;

    const first = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${installmentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "pending" });
    expect(first.status).toBe(200);

    const notFound = await request(app)
      .patch(`/v1/debts/${debtId}/installments/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });
    expect(notFound.status).toBe(404);
  });
```

- [ ] **Step 6: Run the debts integration suite**

Reuse the disposable database from Task 3 (start it again if it was
removed):
```bash
docker ps --filter name=mm-plan-test-db --format "{{.Names}}" | grep -q mm-plan-test-db || {
  docker rm -f mm-plan-test-db >/dev/null 2>&1
  docker run -d --name mm-plan-test-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=money_manager_test -p 55440:5432 postgres:16-alpine
  for i in $(seq 1 15); do docker exec mm-plan-test-db pg_isready -U postgres >/dev/null 2>&1 && echo READY && break; sleep 1; done
  cd "packages/db" && DATABASE_URL="postgres://postgres:postgres@localhost:55440/money_manager_test" pnpm drizzle-kit migrate
}
```

Run (from `apps/api`):
```bash
DATABASE_URL="postgres://postgres:postgres@localhost:55440/money_manager_test" JWT_SECRET="test-secret-for-jest-minimum-32-chars-long" node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects integration --runInBand tests/integration/debts.integration.test.ts
```
Expected: all tests pass (14 total: 11 from Task 3 + 3 new).

- [ ] **Step 7: Run the full unit suite**

Run (from `apps/api`):
```bash
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit
```
Expected: all suites pass, including `debts.service.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/debts/debts.service.ts apps/api/src/modules/debts/debts.controller.ts apps/api/src/modules/debts/debts.routes.ts apps/api/tests/integration/debts.integration.test.ts
git commit -m "feat(debts): add endpoint to toggle a single installment's paid state"
```

- [ ] **Step 9: Tear down the disposable database**

```bash
docker rm -f mm-plan-test-db
```

---

### Task 5: Frontend — `InstallmentList` component

**Files:**
- Create: `apps/web/src/components/features/debts/installment-list.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Check } from "lucide-react";
import { cn } from "../../../lib/cn";

export interface InstallmentListItem {
  key: string;
  number: number;
  dueDate: string;
  amountCents: number;
  paid: boolean;
  toggling?: boolean;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDueDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

interface InstallmentListProps {
  items: InstallmentListItem[];
  onToggle: (item: InstallmentListItem) => void;
}

export function InstallmentList({ items, onToggle }: InstallmentListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
        Parcelas
      </label>
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-white/5 bg-white/5 p-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.toggling}
            onClick={() => onToggle(item)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
              item.paid
                ? "bg-emerald-500/10 text-emerald-300"
                : "text-zinc-400 hover:bg-white/5",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  item.paid
                    ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                    : "border-white/20",
                )}
              >
                {item.paid ? <Check className="h-3 w-3" /> : null}
              </span>
              Parcela {item.number} · {formatDueDate(item.dueDate)}
            </span>
            <span className="font-mono">
              {formatCurrency(item.amountCents)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "apps/web" && pnpm exec tsc --noEmit -p .`
Expected: no errors (nothing imports this component yet, but it must
compile standalone).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/debts/installment-list.tsx
git commit -m "feat(debts): add InstallmentList toggle component"
```

---

### Task 6: Frontend — wire `DebtFormModal` (start date, unlock, installment toggles)

**Files:**
- Modify: `apps/web/src/components/features/debts/debt-form-modal.tsx`

- [ ] **Step 1: Update imports**

Replace the top of the file (currently lines 1–21) with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type {
  DebtInstallment,
  DebtWithInstallments,
  PaymentMethod,
} from "@money-manager/types";
import {
  INSTALLMENT_PERIOD_LABELS,
  INSTALLMENT_PERIODS,
  type InstallmentPeriod,
} from "@money-manager/types";
import {
  calculateDebtEndDate,
  calendarDate,
  generateInstallmentDueDates,
  parseDateString,
  toDateString,
} from "@money-manager/utils/installment-schedule";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { SearchableSelect } from "../../ui/searchable-select";
import { InstallmentList, type InstallmentListItem } from "./installment-list";
import { Banknote, CreditCard, X, Zap } from "lucide-react";
```

(this adds `DebtInstallment` to the type import, adds
`generateInstallmentDueDates` to the installment-schedule import, and adds
the new `InstallmentList`/`InstallmentListItem` import)

- [ ] **Step 2: Remove the structural-lock consts, add installment/start-date state**

Replace:

```ts
  const isEditing = debt !== null;
  const hasPaidInstallments =
    debt?.installments.some((item) => item.status === "paid") ?? false;
  const structuralLocked = isEditing && hasPaidInstallments;

  const [name, setName] = useState("");
  const [installmentCount, setInstallmentCount] = useState("12");
  const [installmentPeriod, setInstallmentPeriod] =
    useState<InstallmentPeriod>("monthly");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [autoSyncExpenses, setAutoSyncExpenses] = useState(false);
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(0);
  const [creditCardId, setCreditCardId] = useState("");
  const [creditCards, setCreditCards] = useState<CreditCardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

with:

```ts
  const isEditing = debt !== null;

  const [name, setName] = useState("");
  const [installmentCount, setInstallmentCount] = useState("12");
  const [installmentPeriod, setInstallmentPeriod] =
    useState<InstallmentPeriod>("monthly");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [autoSyncExpenses, setAutoSyncExpenses] = useState(false);
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(0);
  const [creditCardId, setCreditCardId] = useState("");
  const [creditCards, setCreditCards] = useState<CreditCardOption[]>([]);
  const [installments, setInstallments] = useState<DebtInstallment[]>([]);
  const [previewPaidNumbers, setPreviewPaidNumbers] = useState<Set<number>>(
    new Set(),
  );
  const [togglingInstallmentId, setTogglingInstallmentId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 3: Update the open/debt-change effect**

Replace:

```ts
  useEffect(() => {
    if (!open) return;

    if (debt) {
      setName(debt.name);
      setInstallmentCount(String(debt.installmentCount));
      setInstallmentPeriod(debt.installmentPeriod);
      setInstallmentAmount(formatMoneyDisplay(debt.installmentCents / 100));
      setTotalAmount(formatMoneyDisplay(debt.totalCents / 100));
      setAutoSyncExpenses(debt.autoSyncExpenses);
      setPaymentMethodIndex(paymentMethodToIndex(debt.paymentMethod));
      setCreditCardId(debt.creditCardId ?? "");
    } else {
      setName("");
      setInstallmentCount("12");
      setInstallmentPeriod("monthly");
      setInstallmentAmount("");
      setTotalAmount("");
      setAutoSyncExpenses(false);
      setPaymentMethodIndex(0);
      setCreditCardId("");
    }
    setError(null);
  }, [open, debt]);
```

with:

```ts
  useEffect(() => {
    if (!open) return;

    if (debt) {
      setName(debt.name);
      setInstallmentCount(String(debt.installmentCount));
      setInstallmentPeriod(debt.installmentPeriod);
      setInstallmentAmount(formatMoneyDisplay(debt.installmentCents / 100));
      setTotalAmount(formatMoneyDisplay(debt.totalCents / 100));
      setStartDate(debt.startDate);
      setAutoSyncExpenses(debt.autoSyncExpenses);
      setPaymentMethodIndex(paymentMethodToIndex(debt.paymentMethod));
      setCreditCardId(debt.creditCardId ?? "");
      setInstallments(debt.installments);
    } else {
      setName("");
      setInstallmentCount("12");
      setInstallmentPeriod("monthly");
      setInstallmentAmount("");
      setTotalAmount("");
      setStartDate(
        toDateString(
          calendarDate(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            new Date().getDate(),
          ),
        ),
      );
      setAutoSyncExpenses(false);
      setPaymentMethodIndex(0);
      setCreditCardId("");
      setInstallments([]);
    }
    setPreviewPaidNumbers(new Set());
    setError(null);
  }, [open, debt]);
```

- [ ] **Step 4: Update `endDateLabel` to use the `startDate` state**

Replace:

```ts
  const endDateLabel = useMemo(() => {
    if (!Number.isInteger(countValue) || countValue < 1) {
      return null;
    }
    const start = debt
      ? parseDateString(debt.startDate)
      : calendarDate(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          new Date().getDate(),
        );
    const end = calculateDebtEndDate(start, countValue, installmentPeriod);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(end);
  }, [countValue, installmentPeriod, debt]);
```

with:

```ts
  const endDateLabel = useMemo(() => {
    if (!Number.isInteger(countValue) || countValue < 1) {
      return null;
    }
    const start = startDate
      ? parseDateString(startDate)
      : calendarDate(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          new Date().getDate(),
        );
    const end = calculateDebtEndDate(start, countValue, installmentPeriod);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(end);
  }, [countValue, installmentPeriod, startDate]);
```

- [ ] **Step 5: Add the installment-list derivation and toggle handler**

Directly after the `endDateLabel` `useMemo` block (before `function
syncTotalFromInstallment`), add:

```ts
  const previewInstallmentCents = useMemo(() => {
    const installmentParsed = parseMoneyAmountInput(installmentAmount);
    if (Number.isFinite(installmentParsed) && installmentParsed > 0) {
      return Math.round(installmentParsed * 100);
    }
    const totalParsed = parseMoneyAmountInput(totalAmount);
    if (
      Number.isFinite(totalParsed) &&
      totalParsed > 0 &&
      Number.isInteger(countValue) &&
      countValue >= 1
    ) {
      return Math.round((totalParsed * 100) / countValue);
    }
    return 0;
  }, [installmentAmount, totalAmount, countValue]);

  const previewDueDates = useMemo(() => {
    if (!Number.isInteger(countValue) || countValue < 1) {
      return [];
    }
    const start = startDate
      ? parseDateString(startDate)
      : calendarDate(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          new Date().getDate(),
        );
    return generateInstallmentDueDates(start, countValue, installmentPeriod);
  }, [countValue, installmentPeriod, startDate]);

  const installmentListItems: InstallmentListItem[] = isEditing
    ? installments.map((item) => ({
        key: item.id,
        number: item.installmentNumber,
        dueDate: item.dueDate,
        amountCents: item.amountCents,
        paid: item.status === "paid",
        toggling: togglingInstallmentId === item.id,
      }))
    : previewDueDates.map((date, index) => ({
        key: `preview-${index + 1}`,
        number: index + 1,
        dueDate: toDateString(date),
        amountCents: previewInstallmentCents,
        paid: previewPaidNumbers.has(index + 1),
      }));

  async function handleToggleInstallment(item: InstallmentListItem) {
    if (!isEditing) {
      setPreviewPaidNumbers((prev) => {
        const next = new Set(prev);
        if (next.has(item.number)) {
          next.delete(item.number);
        } else {
          next.add(item.number);
        }
        return next;
      });
      return;
    }

    if (!debt) return;
    setTogglingInstallmentId(item.key);
    try {
      const res = await apiFetch(
        `/v1/debts/${debt.id}/installments/${item.key}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: item.paid ? "pending" : "paid" }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao atualizar parcela");
      }
      const updated = (await res.json()) as DebtWithInstallments;
      setInstallments(updated.installments);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar parcela");
    } finally {
      setTogglingInstallmentId(null);
    }
  }
```

- [ ] **Step 6: Remove the `structuralLocked` guard from validation**

Replace:

```ts
    if (!structuralLocked) {
      if (!Number.isInteger(countValue) || countValue < 1) {
        setError("Informe um número válido de parcelas.");
        setLoading(false);
        return;
      }

      if (
        (!Number.isFinite(installmentParsed) || installmentParsed <= 0) &&
        (!Number.isFinite(totalParsed) || totalParsed <= 0)
      ) {
        setError("Informe o valor da parcela ou o valor total.");
        setLoading(false);
        return;
      }
    }
```

with:

```ts
    if (!Number.isInteger(countValue) || countValue < 1) {
      setError("Informe um número válido de parcelas.");
      setLoading(false);
      return;
    }

    if (
      (!Number.isFinite(installmentParsed) || installmentParsed <= 0) &&
      (!Number.isFinite(totalParsed) || totalParsed <= 0)
    ) {
      setError("Informe o valor da parcela ou o valor total.");
      setLoading(false);
      return;
    }
```

- [ ] **Step 7: Rebuild the payload unconditionally, always include `startDate`**

Replace:

```ts
    const payload: Record<string, unknown> = {
      name: name.trim(),
      autoSyncExpenses,
      paymentMethodIndex,
    };

    if (!structuralLocked) {
      payload.installmentCount = countValue;
      payload.installmentPeriod = installmentPeriod;

      if (Number.isFinite(installmentParsed) && installmentParsed > 0) {
        payload.installmentAmount = installmentParsed;
      }
      if (Number.isFinite(totalParsed) && totalParsed > 0) {
        payload.totalAmount = totalParsed;
      }

      if (!isEditing) {
        const today = calendarDate(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          new Date().getDate(),
        );
        payload.startDate = toDateString(today);
      }
    }
```

with:

```ts
    const payload: Record<string, unknown> = {
      name: name.trim(),
      autoSyncExpenses,
      paymentMethodIndex,
      installmentCount: countValue,
      installmentPeriod,
      startDate,
    };

    if (Number.isFinite(installmentParsed) && installmentParsed > 0) {
      payload.installmentAmount = installmentParsed;
    }
    if (Number.isFinite(totalParsed) && totalParsed > 0) {
      payload.totalAmount = totalParsed;
    }
```

- [ ] **Step 8: Mark preview-selected installments paid right after creating**

Replace:

```ts
    try {
      const res = await apiFetch(
        isEditing ? `/v1/debts/${debt.id}` : "/v1/debts",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar dívida");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
```

with:

```ts
    try {
      const res = await apiFetch(
        isEditing ? `/v1/debts/${debt.id}` : "/v1/debts",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar dívida");
      }

      if (!isEditing && previewPaidNumbers.size > 0) {
        const created = (await res.json()) as DebtWithInstallments;
        for (const installment of created.installments) {
          if (!previewPaidNumbers.has(installment.installmentNumber)) {
            continue;
          }
          const markRes = await apiFetch(
            `/v1/debts/${created.id}/installments/${installment.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({ status: "paid" }),
            },
          );
          if (!markRes.ok) {
            throw new Error(
              "Dívida criada, mas houve um erro ao marcar parcelas como pagas. Edite a dívida para ajustar.",
            );
          }
        }
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
```

- [ ] **Step 9: Remove the amber lock banner and `lockedFieldClass`**

Delete this block entirely (currently right before the `<form ...>` tag):

```tsx
        {structuralLocked ? (
          <p className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
            Parcelas e valores não podem ser alterados após o pagamento de
            parcelas. Você ainda pode editar nome, forma de pagamento e sync de
            despesas.
          </p>
        ) : null}
```

And delete this line (currently right before the `return (` statement):

```ts
  const lockedFieldClass =
    "opacity-60 cursor-not-allowed pointer-events-none select-none";
```

- [ ] **Step 10: Unlock the Parcelas/Período grid, add the start-date field**

Replace:

```tsx
          <div
            className={cn(
              "grid grid-cols-2 gap-4",
              structuralLocked && lockedFieldClass,
            )}
          >
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Parcelas
              </label>
              <input
                type="number"
                min={1}
                max={9999}
                required={!structuralLocked}
                disabled={structuralLocked}
                value={installmentCount}
                onChange={(e) => handleInstallmentCountChange(e.target.value)}
                className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Período
              </label>
              <select
                value={installmentPeriod}
                disabled={structuralLocked}
                onChange={(e) =>
                  setInstallmentPeriod(e.target.value as InstallmentPeriod)
                }
                className="w-full rounded-2xl border border-white/5 bg-zinc-900 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
              >
                {INSTALLMENT_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {INSTALLMENT_PERIOD_LABELS[period]}
                  </option>
                ))}
              </select>
              {endDateLabel ? (
                <p className="mt-1.5 text-xs text-zinc-500">
                  Quitação prevista: {endDateLabel}
                </p>
              ) : null}
            </div>
          </div>
```

with:

```tsx
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Parcelas
              </label>
              <input
                type="number"
                min={1}
                max={9999}
                required
                value={installmentCount}
                onChange={(e) => handleInstallmentCountChange(e.target.value)}
                className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Período
              </label>
              <select
                value={installmentPeriod}
                onChange={(e) =>
                  setInstallmentPeriod(e.target.value as InstallmentPeriod)
                }
                className="w-full rounded-2xl border border-white/5 bg-zinc-900 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
              >
                {INSTALLMENT_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {INSTALLMENT_PERIOD_LABELS[period]}
                  </option>
                ))}
              </select>
              {endDateLabel ? (
                <p className="mt-1.5 text-xs text-zinc-500">
                  Quitação prevista: {endDateLabel}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Data de início
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
```

- [ ] **Step 11: Unlock the amount grid, add the installment list**

Replace:

```tsx
          <div
            className={cn(
              "grid grid-cols-1 gap-4 sm:grid-cols-2",
              structuralLocked && lockedFieldClass,
            )}
          >
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor da parcela
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={installmentAmount}
                  onChange={handleInstallmentAmountChange}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor total
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={totalAmount}
                  onChange={handleTotalAmountChange}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          </div>
```

with:

```tsx
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor da parcela
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={installmentAmount}
                  onChange={handleInstallmentAmountChange}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor total
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={totalAmount}
                  onChange={handleTotalAmountChange}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          </div>

          <InstallmentList
            items={installmentListItems}
            onToggle={(item) => void handleToggleInstallment(item)}
          />
```

- [ ] **Step 12: Typecheck**

Run: `cd "apps/web" && pnpm exec tsc --noEmit -p .`
Expected: no errors. If `cn` is reported unused, it's still used by the
payment-method button classes further down the file — no action needed;
if truly unused after all edits, remove its import (this should not
happen, since `cn` is still used later in the file).

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/components/features/debts/debt-form-modal.tsx
git commit -m "feat(debts): unlock debt editing and add installment paid-state toggles"
```

---

### Task 7: Manual verification + final full-suite run

**Files:** none (verification only)

- [ ] **Step 1: Start a disposable dev database and API/web servers**

```bash
docker rm -f mm-debts-verify-db >/dev/null 2>&1
docker run -d --name mm-debts-verify-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=money_manager_dev -p 55441:5432 postgres:16-alpine
for i in $(seq 1 15); do docker exec mm-debts-verify-db pg_isready -U postgres >/dev/null 2>&1 && echo READY && break; sleep 1; done
cd "packages/db" && DATABASE_URL="postgres://postgres:postgres@localhost:55441/money_manager_dev" pnpm drizzle-kit migrate
```

Then, in two separate background shells from the repo root:
```bash
DATABASE_URL="postgres://postgres:postgres@localhost:55441/money_manager_dev" JWT_ACCESS_SECRET="dev-access-secret-min-32-characters-long-change-me" JWT_REFRESH_SECRET="dev-refresh-secret-min-32-characters-long-change-me" INTERNAL_API_KEY="dev-internal-key-change-me" API_PORT=3101 API_HOST=0.0.0.0 CORS_ORIGINS="http://localhost:5173" NODE_ENV=development pnpm --filter @money-manager/api dev
```
```bash
VITE_API_URL="http://localhost:3101" pnpm --filter @money-manager/web dev
```

- [ ] **Step 2: Verify creation-time paid marking in the browser**

Register a test user, open `/dashboard/debts`, click "Nova dívida",
fill in name/parcelas/valor, set "Data de início" a few months in the
past, toggle 2 installments in the new installment list to "paid",
submit. Expected: the created debt shows those 2 installments as
paid (X/Y parcelas pagas reflects it), and `GET /v1/expenses` for those
months shows no new expense from this debt.

- [ ] **Step 3: Verify post-creation editing with paid installments**

Edit that same debt: increase "Parcelas" by 2, change "Período", and
change "Data de início". Save. Expected: no "locked fields" warning is
shown anywhere in the form; the save succeeds; the 2 previously-paid
installments keep their original due dates/amounts/paid status; the new
pending installments reflect the updated period/start date/count.

- [ ] **Step 4: Verify the individual toggle in edit mode**

Reopen the edit modal for the same debt, click a pending installment row
in the list. Expected: it flips to paid immediately (no need to click
"Salvar alterações"), and the debt card's aggregate paid count updates
after closing the modal.

- [ ] **Step 5: Tear down**

```bash
docker rm -f mm-debts-verify-db
```
(stop the two dev server background processes as well)

- [ ] **Step 6: Run the complete API test suite one final time**

```bash
docker rm -f mm-final-test-db >/dev/null 2>&1
docker run -d --name mm-final-test-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=money_manager_test -p 55442:5432 postgres:16-alpine
for i in $(seq 1 15); do docker exec mm-final-test-db pg_isready -U postgres >/dev/null 2>&1 && echo READY && break; sleep 1; done
cd "packages/db" && DATABASE_URL="postgres://postgres:postgres@localhost:55442/money_manager_test" pnpm drizzle-kit migrate
cd "apps/api"
DATABASE_URL="postgres://postgres:postgres@localhost:55442/money_manager_test" JWT_SECRET="test-secret-for-jest-minimum-32-chars-long" node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit
DATABASE_URL="postgres://postgres:postgres@localhost:55442/money_manager_test" JWT_SECRET="test-secret-for-jest-minimum-32-chars-long" node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects integration --runInBand
docker rm -f mm-final-test-db
```
Expected: all unit and integration suites pass.

- [ ] **Step 7: Web typecheck**

```bash
cd "apps/web" && pnpm exec tsc --noEmit -p .
```
Expected: no errors.
