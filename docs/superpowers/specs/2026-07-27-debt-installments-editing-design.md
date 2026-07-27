# Debt Installments Editing — Design

**Goal:** Let users (1) mark specific installments as already paid — at debt
creation time and afterwards — without generating a real expense, and (2)
freely edit any field of an existing debt (installment count, period,
per-installment amount, total, start date), including debts that already
have paid installments, without losing the paid history.

**Architecture:** Paid installments become immutable ledger entries. Every
edit to a debt only ever regenerates the *pending* tail of the installment
schedule; paid rows (number, due date, amount, `paidAt`, `expenseId`) are
never rewritten. A new endpoint toggles a single installment's paid state
directly, reused by both the creation flow (called right after the debt is
created) and the edit flow.

**Tech stack:** Same as the rest of the debts feature — Express + Drizzle
on the API side, React + `apiFetch` on the web side. No schema migration
needed; `debtInstallments.status/paidAt/expenseId` already support this.

---

## 1. Backend

### 1.1 New endpoint: toggle installment paid state

`PATCH /v1/debts/:debtId/installments/:installmentId`

Body: `{ status: "paid" | "pending" }`

- Verifies the debt belongs to the authenticated user (reuses
  `getDebtRow`) and that the installment belongs to that debt.
- `status: "paid"`: sets `status = "paid"`, `paidAt = now`. Leaves
  `expenseId` untouched (null, since this is a manual mark — no expense is
  created). No-op if already paid.
- `status: "pending"`: sets `status = "pending"`, `paidAt = null`,
  `expenseId = null`. If the installment had a real linked expense (e.g.
  from `autoSyncExpenses`), that `expenses` row is **not** deleted — it
  simply becomes unlinked from the debt and keeps existing as an ordinary
  expense. No-op if already pending.
- Either way, calls the existing `refreshDebtBalance(tx, debtId)` inside a
  transaction afterward, so `remainingBalanceCents`/`status` (`active` vs
  `paid_off`) stay correct.
- Returns the full updated `DebtWithInstallments` (same shape `listDebts`
  returns for one item), so the frontend can just replace its local state.

`debts.controller.ts` gets a new `setInstallmentStatus` handler;
`debts.routes.ts` adds the route; `debts.schema.ts` adds
`installmentIdParamsSchema` (`{ debtId: uuid, installmentId: uuid }`) and
`setInstallmentStatusBodySchema` (`{ status: z.enum(["paid", "pending"]) }`).

### 1.2 `createDebt` — unchanged

No backend change needed here. The frontend marks installments paid via
1.1 *after* the debt (and its installments) are created — see §2.1. This
avoids a second "which installments are pre-paid" code path on the create
endpoint.

### 1.3 `updateDebt` — unified regeneration, paid rows frozen

Today, `updateDebt` throws `BadRequestError` whenever any structural field
(`installmentCount`, `installmentPeriod`, `installmentAmount`,
`totalAmount`, `startDate`) changes on a debt that has any paid
installment. That guard is removed. Structural changes are now always
allowed; the regeneration algorithm changes:

```
paidCount = number of installments with status = "paid"
paidRows  = those installments (id, amountCents — frozen, never touched)

if hasStructuralChanges(input):
  installmentCount  = input.installmentCount ?? existing.installmentCount
  installmentPeriod = input.installmentPeriod ?? existing.installmentPeriod
  startDate         = input.startDate ? parse(input.startDate) : parse(existing.startDate)

  if installmentCount < paidCount:
    throw BadRequestError("A quantidade de parcelas não pode ser menor que as parcelas já pagas")

  paidTotalCents = sum(paidRows.amountCents)   # paidRows already fetched above, alongside paidCount

  installmentCents = resolveInstallmentCentsForUpdate(input, existing, paidCount, paidTotalCents, installmentCount)
  # see §1.4 — this is the only piece that changed shape from today's resolveAmountsForUpdate

  fullDueDates    = generateInstallmentDueDates(startDate, installmentCount, installmentPeriod)
  pendingDueDates = fullDueDates.slice(paidCount)   # due dates for installment numbers paidCount+1..installmentCount

  pendingTotalCents = installmentCents * pendingDueDates.length
  totalCents          = paidTotalCents + pendingTotalCents

  transaction:
    delete debtInstallments where debtId = X and status = "pending"   # paid rows survive untouched
    update debts set installmentCount, installmentPeriod, installmentCents,
                      totalCents, startDate, endDate, ...other simple field updates
    insert debtInstallments for pendingDueDates, numbered paidCount+1..installmentCount, status "pending"
    refreshDebtBalance(tx, debtId)   # recomputes remainingBalanceCents/status from totalCents & paidCents
    if autoSync enabled: syncInstallmentsForMonth(tx, ..., now.year, now.month)   # same as today
else:
  # no structural fields changed — same simple-field-update path as today
  # (name / autoSyncExpenses / paymentMethodIndex / creditCardId), including
  # the "autoSync just got turned on" immediate-sync branch, unchanged.
```

When `paidCount === 0` this degenerates to exactly today's "delete all,
regenerate all" behavior — no regression for debts with nothing paid yet.

`hasStructuralChanges` and the `hasPaidInstallments && hasStructuralChanges
→ throw` guard in `updateDebt` (currently around line 502) are deleted.
`resolveAmountsForUpdate` is replaced by `resolveInstallmentCentsForUpdate`
(§1.4), and the whole structural branch is rewritten per the pseudocode
above (currently lines ~538–606 of `debts.service.ts`).

### 1.4 `resolveInstallmentCentsForUpdate` — only resolves the per-installment amount

Replaces `resolveAmountsForUpdate`. It no longer computes `totalCents`
(that's now derived in `updateDebt` from paid + pending, per §1.3) — it
only resolves the new `installmentCents` for the pending tail:

```ts
function resolveInstallmentCentsForUpdate(
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
      // nothing pending left to price — total is fully determined by paid rows
      return existing.installmentCents;
    }
    // paidTotalCents is the sum of `paidRows.amountCents` computed in
    // updateDebt (§1.3) right before calling this function — passed in as
    // a parameter alongside paidCount, not re-queried here.
    const totalCents = Math.round(input.totalAmount * 100);
    return Math.round((totalCents - paidTotalCents) / pendingCount);
  }

  return existing.installmentCents; // nothing about amount changed — keep current per-installment value
}
```

This preserves the already-approved rule ("increase count only → paid
installments keep their value, total rises") as the default case, while
also letting an explicit `installmentAmount` or `totalAmount` override the
pending portion's pricing — same precedence `resolveAmounts` already uses
for brand-new debts.

### 1.5 Validation additions (`debts.schema.ts`)

- `setInstallmentStatusBodySchema`: `{ status: z.enum(["paid", "pending"]) }`.
- `installmentIdParamsSchema`: `{ debtId: z.string().uuid(), installmentId: z.string().uuid() }`.
- No changes to `createDebtBodySchema`/`updateDebtBodySchema` beyond what
  already exists (`installmentCount` etc. are already all-optional on
  update).

---

## 2. Frontend

### 2.1 Creation flow (`DebtFormModal`, `isEditing === false`)

After the user fills in name/count/period/amount/etc. (unchanged fields),
add an **installment preview list** below the existing fields, generated
client-side from the same `calculateDebtEndDate`/date-math already
imported in this file (no new API call needed to preview — due dates are
deterministic from `startDate` + `installmentPeriod` + `installmentCount`,
mirroring `generateInstallmentDueDates` in `packages/utils`, which is
already a workspace dependency reachable from `apps/web`).

Each row: installment number, formatted due date, formatted amount, and a
pago/pendente toggle (checkbox or pill button). Local state:
`paidInstallmentIndexes: Set<number>` (1-indexed).

On submit:
1. `POST /v1/debts` as today (installments come back all `pending`).
2. For each index in `paidInstallmentIndexes`, find the matching created
   installment (`installments[index - 1].id`) and call
   `PATCH /v1/debts/:debtId/installments/:installmentId` with
   `{ status: "paid" }`, sequentially (typical case is a handful of
   installments, not hundreds).
3. `onSaved()` as today.

If any of the follow-up PATCH calls fail, surface the existing error
banner — the debt itself was created successfully, so the error message
should make clear only the paid-marking step failed (partial-success case,
acceptable given this is a low-stakes manual bookkeeping action the user
can retry from the edit view).

### 2.2 Edit flow (`DebtFormModal`, `isEditing === true`)

- Remove `structuralLocked` entirely (currently: `isEditing &&
  hasPaidInstallments`, used to disable/greys-out the count/period/amount
  fields and show the amber warning banner). All fields become always
  editable.
- Add the same installment list UI as §2.1, but now reflecting the
  *existing* `debt.installments` (already available on the `debt` prop —
  `DebtWithInstallments.installments`), each row showing its real
  `status`. Toggling a row calls the new endpoint immediately (optimistic
  or refetch-on-success — follow whatever pattern `debt-card.tsx`'s
  edit/delete callbacks already use for refresh) rather than waiting for
  the main form's "Salvar alterações" submit, since it's a separate
  concern from the structural fields.
- When the user *also* changes count/period/amount/total/start date and
  hits "Salvar alterações", that still goes through the normal
  `PATCH /v1/debts/:id` with the structural fields — same as today, minus
  the removed lock.

### 2.3 `debt-form-modal.tsx` — new local component

Given both create and edit need the same "list of installments with a
paid/pending toggle" UI, extract it as a small local component within
`debt-form-modal.tsx` (or a sibling file
`apps/web/src/components/features/debts/installment-list.tsx` if it grows
past ~40 lines) taking `installments: {number, dueDate, amountCents,
paid}[]` and `onToggle(index)`.

### 2.4 `packages/types/src/api/debts.ts`

No changes — `DebtInstallment` already has everything the toggle endpoint
needs to expose.

---

## 3. Error handling

- `installmentCount < paidCount` on update → `400` with the Portuguese
  message above (mirrors the existing style of other `BadRequestError`s in
  this service).
- Toggle endpoint on an installment that doesn't belong to the given debt,
  or a debt that doesn't belong to the user → `404` (reuse
  `NotFoundError("Dívida não encontrada")` / add
  `NotFoundError("Parcela não encontrada")`).
- Toggle endpoint is idempotent (no-op, still 200) when asked to set a
  status the installment already has.

---

## 4. Testing plan (covered in the implementation plan, listed here for completeness)

- **Unit** (`debts.service.test.ts` — new file, this service currently has
  no unit tests, only the integration suite):
  - `resolveInstallmentCentsForUpdate` cases: no amount fields provided →
    keeps existing; `installmentAmount` provided → uses it; `totalAmount`
    provided with paid rows present → subtracts paid total, divides by
    pending count; `totalAmount` provided with `pendingCount === 0` →
    falls back to existing.
- **Integration** (`debts.integration.test.ts`):
  - Create a debt, mark 2 of 5 installments paid via the toggle endpoint
    at "creation time" (sequential calls) → paid count/paidCents correct,
    no expenses created.
  - Increase `installmentCount` on a debt with paid installments → paid
    rows unchanged (id, dueDate, amountCents), new pending rows appended
    with correct numbering/dates, `totalCents` = paid sum + new pending
    sum.
  - Change `installmentPeriod` and `startDate` on a debt with paid
    installments → paid rows still unchanged; pending rows' due dates
    follow the new period/start.
  - Attempt to set `installmentCount` below `paidCount` → `400`.
  - Toggle a paid (autoSync-linked, has `expenseId`) installment back to
    `pending` → installment becomes pending with `expenseId: null`, but
    the original expense still exists via `GET /v1/expenses`.
  - Toggle an already-paid installment to `paid` again (idempotent) → `200`,
    no error, no duplicate side effects.

---

## 5. Out of scope

- Bulk "mark first N as paid" shortcut — explicitly rejected in favor of
  the per-installment list.
- Deleting/cancelling an orphaned expense when unlinking an
  autoSync-created installment — the expense is intentionally preserved.
- Any change to `deleteDebt` (soft-delete) behavior.
