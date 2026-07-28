# Investment Analytics (Patrimônio — Snapshots, Evolução, IPCA/CDI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a daily snapshot of the user's total patrimony, and add an
allocation donut, a patrimony-evolution line chart, and an IPCA/CDI
benchmark comparison to the existing "Patrimônio" page.

**Architecture:** Two new tables (`investment_snapshots`, per-user;
`benchmark_rates`, global cache — both isolated per Feature 20's rule, no
FK/import into expenses/incomes/goals/cards/debts/dashboard). A new
`investments/benchmarks/` submodule (mirroring `investments/pricing/`'s
existing shape) fetches Banco Central's public SGS API and computes
IPCA/CDI comparisons. A second in-process scheduler
(`patrimony-scheduler.ts`) runs alongside the existing 20b
`pricing/quote-scheduler.ts`, sharing a BRT-date helper extracted out of it
(`brt-date.ts`). Three new endpoints extend the existing
`patrimony.controller.ts`/`patrimony.routes.ts`. On the frontend, four new
chart components (using the newly-added `recharts` dependency) render below
the existing `PatrimonySummaryCards` on `InvestmentsPage.tsx`.

**Tech Stack:** Express + Drizzle + Zod (API), React + `apiFetch` (web),
native `fetch` for the outbound BCB call, `recharts` (new frontend
dependency) for charts, Jest (unit + integration), Postgres. No new backend
runtime dependencies.

**Source spec:** `docs/superpowers/specs/2026-07-28-investment-analytics-design.md`
— restate nothing from it beyond what's copied verbatim below; read it if a
task references a section number (e.g. "§1.2") for rationale.

## Global Constraints

- Money is always integer cents (`bigint` DB columns, `number` in TS/JSON). Dates are always `"YYYY-MM-DD"` strings over the wire.
- **BRT day boundary:** any code that decides "what day is it" for a per-day record (i.e. `investment_snapshots.snapshot_date`) MUST use `todayBrtString` from the new `brt-date.ts` (Task 3) — never `toDateString` (from `@money-manager/utils`, which uses server-local time) or `new Date().toISOString().slice(0, 10)` (UTC). This app already shipped one production bug from exactly this mistake (see the regression test in `patrimony.integration.test.ts`, commit `f29a1c8`) — do not repeat it for snapshots.
- `numeric` Drizzle columns take string values on insert/update (e.g. `monthlyRatePct: value.toFixed(4)`), matching the existing convention in `investment-holdings.service.ts` (`quantity: String(input.quantity)`).
- No integration with `expenses`, `incomes`, `goals`, `debts`, or `credit_cards` — this feature never creates, reads, updates, or deletes rows in those tables (Feature 20 isolation rule, unchanged from 20a/20b).
- Errors use the existing `AppError` subclasses (`NotFoundError` 404, `BadRequestError` 400) with Portuguese messages. Do not add new error classes.
- Every route is mounted behind the existing `authenticate` middleware and reads the caller's id via `getUserId(req)`. Every query filters by `userId` where the table has one (`investment_snapshots` does; `benchmark_rates` is global and has none).
- **No live external HTTP calls in any automated test** — BCB included, matching 20b's existing convention for Brapi/CoinGecode. Provider tests use an injected `fetchFn`; integration tests seed `benchmark_rates` directly via `getDb()`, never through a real refresh.
- **Test file naming:** one test file per source file, except `brt-date.test.ts`, which absorbs the 4 existing `hasDailyTriggerPassed` cases out of `quote-scheduler.test.ts` (deleted, Task 3) — both functions physically move to `brt-date.ts`, so their tests move with them.
- Unit tests only cover pure, DB-free functions (this codebase's actual convention). Anything requiring the database is covered by an integration test instead, never by mocking Drizzle.
- `recharts` is the only new dependency this plan adds, and it is frontend-only (Task 10). No new backend npm dependencies — the second scheduler is a plain `setInterval`, matching 20b's existing choice.
- Run `pnpm build` once before starting any task in a fresh worktree (builds `@money-manager/db` and `@money-manager/types`, which other packages import from) — the workspace's `postinstall` only auto-builds `@money-manager/types`, not `@money-manager/db`.

## Task Dependency Summary

```
Task 1 (DB schema)     ─┐
Task 2 (types)         ─┼─→ Task 3 (brt-date, modifies quote-scheduler.ts)
Task 4 (bcb-provider)  ─┘

Task 1 + 2 + 4        ─→ Task 5 (benchmark.service)
Task 1 + 2 + 3        ─→ Task 6 (patrimony.service extensions)
Task 3 + 5 + 6         ─→ Task 7 (patrimony-scheduler + server.ts wiring)
Task 5 + 6             ─→ Task 8 (new endpoints)
Task 8                 ─→ Task 9 (integration tests)

Task 2                 ─→ Task 10 (recharts + period selector + donut chart)
Task 10                ─→ Task 11 (evolution + benchmark line charts)
Task 8 + Task 11        ─→ Task 12 (wire into InvestmentsPage)
Task 12                ─→ Task 13 (browser verification)
```

Tasks 1, 2, and 4 touch fully disjoint files with no import relationship —
safe to run in parallel. Task 3 modifies an existing 20b file
(`quote-scheduler.ts`) and must not run concurrently with any other task
touching that file (none do). Tasks 5 and 6 both depend on Task 3 landing
first (6 needs `todayBrtString`; 5 does not, but 7 needs both 5 and 6
regardless, so sequencing 3 before 5 avoids a second merge point). Task 7
is a single-file `server.ts` edit plus the new scheduler, kept separate so
no two implementers edit `server.ts` at once. Tasks 10 and 11 are
frontend-only and independent of the whole backend chain until Task 12,
the integration point.

---

### Task 1: Database schema — investment_snapshots & benchmark_rates tables

**Files:**
- Modify: `packages/db/src/schema/investments.ts`
- Generated: `packages/db/migrations/*.sql` (via `drizzle-kit generate`, do not hand-write)

**Interfaces:**
- Consumes: `users` table from `./users.js` (existing).
- Produces: Drizzle table objects `investmentSnapshots`, `benchmarkRates`, enum `benchmarkTypeEnum`, and their `$inferSelect`/`$inferInsert` row types, re-exported from `@money-manager/db`'s existing barrel (`investments.ts` is already re-exported via `export * from "./investments.js"` in `schema/index.ts` — no change needed there). Every later backend task imports these by name.

- [ ] **Step 1: Add `uniqueIndex` to the existing import and append the new enum + tables**

Modify the import block at the top of `packages/db/src/schema/investments.ts`:

```typescript
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
```

Append at the end of the file, after the existing `investmentQuoteCache` table:

```typescript
export const benchmarkTypeEnum = pgEnum("benchmark_type", ["ipca", "cdi"]);

export const investmentSnapshots = pgTable(
  "investment_snapshots",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    totalAssetsCents: bigint("total_assets_cents", { mode: "number" }).notNull(),
    byAssetClass: jsonb("by_asset_class").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("investment_snapshots_user_id_idx").on(t.userId),
    uniqueIndex("investment_snapshots_user_date_idx").on(
      t.userId,
      t.snapshotDate,
    ),
  ],
);

export const benchmarkRates = pgTable(
  "benchmark_rates",
  {
    benchmark: benchmarkTypeEnum("benchmark").notNull(),
    referenceMonth: date("reference_month").notNull(),
    monthlyRatePct: numeric("monthly_rate_pct", {
      precision: 10,
      scale: 4,
    }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.benchmark, t.referenceMonth] })],
);
```

- [ ] **Step 2: Generate the migration**

Run from `packages/db`:

```bash
pnpm run db:generate
```

Expected: a new timestamped `.sql` file under `packages/db/migrations/` with a `CREATE TYPE "benchmark_type"` statement and `CREATE TABLE` statements for `investment_snapshots` and `benchmark_rates`, matching the columns above exactly (including the unique index on `investment_snapshots` and the composite PK on `benchmark_rates`). Read the generated file to confirm — do not hand-edit it unless it's wrong, in which case fix the schema file and regenerate.

- [ ] **Step 3: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/db` builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/investments.ts packages/db/migrations
git commit -m "feat(db): add investment_snapshots and benchmark_rates schema"
```

---

### Task 2: `packages/types` — snapshot & benchmark types

**Files:**
- Modify: `packages/types/src/api/investments.ts`

**Interfaces:**
- Consumes: nothing new (appends to the existing file, reuses its existing `PatrimonyAssetClassBucket`).
- Produces: `BenchmarkType`, `PatrimonySnapshot`, `PatrimonyHistoryPoint`, `BenchmarkComparisonPoint`, `BenchmarkComparison` — imported by every later backend and frontend task in this plan.

- [ ] **Step 1: Append to `packages/types/src/api/investments.ts`**

Add at the end of the file (after the existing `PatrimonySummary` interface):

```typescript
export type BenchmarkType = "ipca" | "cdi";

export interface PatrimonySnapshot {
  id: string;
  userId: string;
  snapshotDate: string;
  totalAssetsCents: number;
  byAssetClass: PatrimonyAssetClassBucket[];
  createdAt: string;
}

export interface PatrimonyHistoryPoint {
  snapshotDate: string;
  totalAssetsCents: number;
}

export interface BenchmarkComparisonPoint {
  referenceMonth: string;
  patrimonyIndexed: number;
  ipcaAccumulatedPct: number | null;
  cdiAccumulatedPct: number | null;
}

export interface BenchmarkComparison {
  series: BenchmarkComparisonPoint[];
  portfolioReturnPct: number | null;
  cdiReturnPct: number | null;
}
```

- [ ] **Step 2: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/types` builds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/api/investments.ts
git commit -m "feat(types): add investment snapshot and benchmark types"
```

---

### Task 3: Shared `brt-date.ts` — extracted from `pricing/quote-scheduler.ts`

**Files:**
- Create: `apps/api/src/modules/investments/brt-date.ts`
- Create: `apps/api/src/modules/investments/brt-date.test.ts`
- Modify: `apps/api/src/modules/investments/pricing/quote-scheduler.ts`
- Delete: `apps/api/src/modules/investments/pricing/quote-scheduler.test.ts`

**Interfaces:**
- Consumes: nothing (pure date/time functions, no imports beyond built-in `Intl`).
- Produces: `todayBrtString(now: Date): string`, `hasDailyTriggerPassed(now: Date, lastRunDate: string | null): boolean`, `hasWeeklyElapsed(now: Date, lastRunAt: Date | null, intervalDays?: number): boolean`. Task 6 (`patrimony.service.ts`) imports `todayBrtString`. Task 7 (`patrimony-scheduler.ts`) imports all three.

This task moves two existing, already-tested functions verbatim (no
behavior change) and adds one new one. `quote-scheduler.ts`'s own daily-tick
behavior is unchanged — only where these two functions physically live
changes.

- [ ] **Step 1: Write the failing test — `apps/api/src/modules/investments/brt-date.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import {
  hasDailyTriggerPassed,
  hasWeeklyElapsed,
  todayBrtString,
} from "./brt-date.js";

describe("todayBrtString", () => {
  it("retorna a data em BRT mesmo quando UTC já virou o dia seguinte", () => {
    // 01:30 UTC = 22:30 BRT do dia anterior (UTC-3)
    const now = new Date("2026-01-16T01:30:00.000Z");
    expect(todayBrtString(now)).toBe("2026-01-15");
  });
});

describe("hasDailyTriggerPassed", () => {
  it("retorna false antes das 8h BRT", () => {
    // 10:00 UTC = 07:00 BRT (UTC-3)
    const now = new Date("2026-01-15T10:00:00.000Z");
    expect(hasDailyTriggerPassed(now, null)).toBe(false);
  });

  it("retorna true às 8h BRT ou depois, se ainda não rodou hoje", () => {
    // 11:30 UTC = 08:30 BRT
    const now = new Date("2026-01-15T11:30:00.000Z");
    expect(hasDailyTriggerPassed(now, null)).toBe(true);
  });

  it("retorna false se já rodou hoje (mesma data BRT)", () => {
    const now = new Date("2026-01-15T11:30:00.000Z");
    expect(hasDailyTriggerPassed(now, "2026-01-15")).toBe(false);
  });

  it("retorna true no dia seguinte após as 8h, mesmo com lastRunDate do dia anterior", () => {
    const now = new Date("2026-01-16T11:30:00.000Z");
    expect(hasDailyTriggerPassed(now, "2026-01-15")).toBe(true);
  });
});

describe("hasWeeklyElapsed", () => {
  it("retorna true quando nunca rodou (lastRunAt null)", () => {
    expect(hasWeeklyElapsed(new Date("2026-01-15T00:00:00.000Z"), null)).toBe(
      true,
    );
  });

  it("retorna false quando faltam menos de 7 dias", () => {
    const lastRunAt = new Date("2026-01-10T00:00:00.000Z");
    const now = new Date("2026-01-15T00:00:00.000Z"); // 5 dias depois
    expect(hasWeeklyElapsed(now, lastRunAt)).toBe(false);
  });

  it("retorna true quando já passaram 7 dias ou mais", () => {
    const lastRunAt = new Date("2026-01-08T00:00:00.000Z");
    const now = new Date("2026-01-15T00:00:00.000Z"); // exatamente 7 dias depois
    expect(hasWeeklyElapsed(now, lastRunAt)).toBe(true);
  });

  it("aceita um intervalDays customizado", () => {
    const lastRunAt = new Date("2026-01-13T00:00:00.000Z");
    const now = new Date("2026-01-15T00:00:00.000Z"); // 2 dias depois
    expect(hasWeeklyElapsed(now, lastRunAt, 2)).toBe(true);
    expect(hasWeeklyElapsed(now, lastRunAt, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api`:

```bash
pnpm test -- brt-date.test.ts
```

Expected: FAIL — `Cannot find module './brt-date.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create `apps/api/src/modules/investments/brt-date.ts`**

```typescript
const DAILY_TRIGGER_HOUR_BRT = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function todayBrtString(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function hasDailyTriggerPassed(
  now: Date,
  lastRunDate: string | null,
): boolean {
  const todayBrt = todayBrtString(now);
  if (lastRunDate === todayBrt) return false;

  const hourParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hourBrt =
    Number(hourParts.find((p) => p.type === "hour")?.value ?? "0") % 24;

  return hourBrt >= DAILY_TRIGGER_HOUR_BRT;
}

export function hasWeeklyElapsed(
  now: Date,
  lastRunAt: Date | null,
  intervalDays = 7,
): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= intervalDays * MS_PER_DAY;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/api`:

```bash
pnpm test -- brt-date.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Update `apps/api/src/modules/investments/pricing/quote-scheduler.ts` to import from `brt-date.ts`**

The file currently defines `todayBrtString` and `hasDailyTriggerPassed`
locally (lines 4–35, including the `DAILY_TRIGGER_HOUR_BRT` constant).
Replace that block:

Remove these lines from the top of the file (everything from
`const TICK_INTERVAL_MS = ...` down through the closing brace of
`hasDailyTriggerPassed`, i.e. lines 4–35 of the current file) and replace
with:

```typescript
import { hasDailyTriggerPassed, todayBrtString } from "../brt-date.js";

const TICK_INTERVAL_MS = 15 * 60 * 1000;
```

The file's first import line (`import { getDb, users } from "@money-manager/db";`)
stays as-is; add the new import right after it. The rest of the file
(`QuoteScheduler` interface, `startQuoteScheduler` function body) is
unchanged — it already calls `hasDailyTriggerPassed` and `todayBrtString`
by name, which now resolve to the imported versions instead of local
definitions. Do **not** re-export `hasDailyTriggerPassed` from this file —
nothing outside this file imports it from here after this change (verify
with a repo-wide search for `from "./quote-scheduler` and
`from "../pricing/quote-scheduler` before moving on; the only prior
consumer was `quote-scheduler.test.ts`, deleted in Step 6).

- [ ] **Step 6: Delete the now-redundant `quote-scheduler.test.ts`**

```bash
rm apps/api/src/modules/investments/pricing/quote-scheduler.test.ts
```

Its 4 cases now live in `brt-date.test.ts` (Step 1), testing the same
functions at their new home.

- [ ] **Step 7: Build, typecheck, and run the full pricing test suite**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

Run from `apps/api`:

```bash
pnpm test -- investments
```

Expected: all existing `investments/pricing/*.test.ts` files still pass
(confirms the `quote-scheduler.ts` edit didn't break anything), plus the
new `brt-date.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/investments/brt-date.ts apps/api/src/modules/investments/brt-date.test.ts apps/api/src/modules/investments/pricing/quote-scheduler.ts apps/api/src/modules/investments/pricing/quote-scheduler.test.ts
git commit -m "refactor(api): extract shared BRT date helpers out of quote-scheduler"
```

---

### Task 4: `investments/benchmarks` — BCB SGS provider

**Files:**
- Create: `apps/api/src/modules/investments/benchmarks/bcb-provider.ts`
- Create: `apps/api/src/modules/investments/benchmarks/bcb-provider.test.ts`

**Interfaces:**
- Consumes: nothing from this codebase (standalone HTTP client, mirrors `pricing/brapi-quote-provider.ts`'s shape).
- Produces: `createBcbProvider(fetchFn?): { fetchSeries(seriesCode: number, lastN: number): Promise<BcbSeriesPoint[]> }`, `BcbSeriesPoint { date: string; value: number }`, `BcbProviderError`. Task 5 imports all three.

- [ ] **Step 1: Write the failing test — `bcb-provider.test.ts`**

```typescript
import { describe, expect, it, jest } from "@jest/globals";
import { BcbProviderError, createBcbProvider } from "./bcb-provider.js";

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("createBcbProvider", () => {
  it("retorna pontos normalizados para uma série mensal (IPCA)", async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse([
        { data: "01/04/2026", valor: "0.67" },
        { data: "01/05/2026", valor: "0.58" },
      ]),
    );
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchSeries(433, 3);

    expect(result).toEqual([
      { date: "2026-04-01", value: 0.67 },
      { date: "2026-05-01", value: 0.58 },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("retorna pontos diários sem forçar dia 1 (CDI)", async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse([{ data: "27/07/2026", valor: "14.15" }]),
    );
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchSeries(4389, 15);

    expect(result).toEqual([{ date: "2026-07-27", value: 14.15 }]);
  });

  it("lança BcbProviderError em status não-200", async () => {
    const fetchFn = jest.fn(async () => fakeResponse([], false, 503));
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });

  it("lança BcbProviderError em erro de rede", async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error("network down");
    });
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });

  it("lança BcbProviderError quando a resposta não é um array", async () => {
    const fetchFn = jest.fn(async () => fakeResponse({ erro: "formato" }));
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });

  it("lança BcbProviderError quando um ponto tem valor não numérico", async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse([{ data: "01/04/2026", valor: "N/D" }]),
    );
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api`:

```bash
pnpm test -- bcb-provider.test.ts
```

Expected: FAIL — `Cannot find module './bcb-provider.js'`.

- [ ] **Step 3: Create `apps/api/src/modules/investments/benchmarks/bcb-provider.ts`**

```typescript
const BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

export interface BcbSeriesPoint {
  date: string; // "YYYY-MM-DD", exactly as returned by BCB — not forced to day 1
  value: number;
}

export class BcbProviderError extends Error {}

interface BcbRawPoint {
  data: string;
  valor: string;
}

function normalizeBcbDate(brDate: string): string {
  const [day, month, year] = brDate.split("/");
  return `${year}-${month}-${day}`;
}

export function createBcbProvider(fetchFn: typeof fetch = fetch) {
  return {
    async fetchSeries(
      seriesCode: number,
      lastN: number,
    ): Promise<BcbSeriesPoint[]> {
      const url = `${BCB_SGS_BASE_URL}.${seriesCode}/dados/ultimos/${lastN}?formato=json`;

      let response: Response;
      try {
        response = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
      } catch {
        throw new BcbProviderError(
          `Falha ao consultar BCB SGS série ${seriesCode}`,
        );
      }

      if (!response.ok) {
        throw new BcbProviderError(
          `BCB SGS retornou status ${response.status} para série ${seriesCode}`,
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new BcbProviderError(
          `BCB SGS retornou resposta inválida para série ${seriesCode}`,
        );
      }

      if (!Array.isArray(data)) {
        throw new BcbProviderError(
          `BCB SGS retornou formato inesperado para série ${seriesCode}`,
        );
      }

      return (data as BcbRawPoint[]).map((point) => {
        const value = Number(point?.valor);
        if (typeof point?.data !== "string" || !Number.isFinite(value)) {
          throw new BcbProviderError(
            `BCB SGS retornou ponto inválido para série ${seriesCode}`,
          );
        }
        return { date: normalizeBcbDate(point.data), value };
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/api`:

```bash
pnpm test -- bcb-provider.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/benchmarks/bcb-provider.ts apps/api/src/modules/investments/benchmarks/bcb-provider.test.ts
git commit -m "feat(api): add BCB SGS provider for IPCA/CDI series"
```

---

### Task 5: `investments/benchmarks` — benchmark service (refresh + comparison)

**Files:**
- Create: `apps/api/src/modules/investments/benchmarks/benchmark.service.ts`
- Create: `apps/api/src/modules/investments/benchmarks/benchmark.service.test.ts`

**Interfaces:**
- Consumes: `getDb`, `benchmarkRates`, `investmentSnapshots` from `@money-manager/db` (Task 1); `BenchmarkComparison`, `BenchmarkComparisonPoint`, `BenchmarkType` from `@money-manager/types` (Task 2); `createBcbProvider`, `BcbSeriesPoint` from `./bcb-provider.js` (Task 4); `toDateString` from `@money-manager/utils/installment-schedule` (existing, same import `patrimony.service.ts` already uses).
- Produces: `refreshBenchmarks(now: Date): Promise<void>`, `getBenchmarkComparison(userId: string, period: "year" | "12m"): Promise<BenchmarkComparison>`, and the pure, exported (for testing) `compoundAccumulatedPct`, `latestPerMonth`, `annualToMonthlyPct` helpers. Task 7 (`patrimony-scheduler.ts`) calls `refreshBenchmarks`. Task 8 (endpoints) calls `getBenchmarkComparison`.

- [ ] **Step 1: Write the failing unit tests — `benchmark.service.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import {
  annualToMonthlyPct,
  compoundAccumulatedPct,
  latestPerMonth,
} from "./benchmark.service.js";

describe("annualToMonthlyPct", () => {
  it("converte uma taxa anualizada para o equivalente mensal", () => {
    // 12.6825% a.a. -> ~1% a.m. (raiz duodécima de 1.126825 ≈ 1.01)
    const result = annualToMonthlyPct(12.6825);
    expect(result).toBeCloseTo(1, 1);
  });

  it("retorna 0 para taxa anual 0", () => {
    expect(annualToMonthlyPct(0)).toBe(0);
  });
});

describe("compoundAccumulatedPct", () => {
  it("retorna a própria taxa para um único mês", () => {
    expect(compoundAccumulatedPct([0.67])).toBeCloseTo(0.67, 2);
  });

  it("composição de múltiplos meses dentro do mesmo ano", () => {
    // (1.0067 * 1.0058) - 1 ≈ 1.2539%
    expect(compoundAccumulatedPct([0.67, 0.58])).toBeCloseTo(1.25, 1);
  });

  it("retorna 0 para lista vazia", () => {
    expect(compoundAccumulatedPct([])).toBe(0);
  });
});

describe("latestPerMonth", () => {
  it("mantém apenas o ponto mais recente de cada mês (série diária)", () => {
    const points = [
      { date: "2026-07-07", value: 14.15 },
      { date: "2026-07-27", value: 14.25 },
      { date: "2026-06-30", value: 14.0 },
    ];
    const result = latestPerMonth(points);

    expect(result.get("2026-07")).toEqual({ date: "2026-07-27", value: 14.25 });
    expect(result.get("2026-06")).toEqual({ date: "2026-06-30", value: 14.0 });
  });

  it("é um no-op para uma série já mensal (um ponto por mês)", () => {
    const points = [
      { date: "2026-04-01", value: 0.67 },
      { date: "2026-05-01", value: 0.58 },
    ];
    const result = latestPerMonth(points);

    expect(result.size).toBe(2);
    expect(result.get("2026-04")).toEqual({ date: "2026-04-01", value: 0.67 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/api`:

```bash
pnpm test -- benchmark.service.test.ts
```

Expected: FAIL — `Cannot find module './benchmark.service.js'`.

- [ ] **Step 3: Create `apps/api/src/modules/investments/benchmarks/benchmark.service.ts`**

```typescript
import { benchmarkRates, getDb, investmentSnapshots } from "@money-manager/db";
import type {
  BenchmarkComparison,
  BenchmarkComparisonPoint,
  BenchmarkType,
} from "@money-manager/types";
import { toDateString } from "@money-manager/utils/installment-schedule";
import { and, asc, eq, gte } from "drizzle-orm";
import { createBcbProvider } from "./bcb-provider.js";
import type { BcbSeriesPoint } from "./bcb-provider.js";

export const IPCA_SERIES_CODE = 433;
export const CDI_SERIES_CODE = 4389;
const FETCH_POINTS = 14 * 22; // ~14 months of margin; CDI is daily, IPCA is monthly

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function latestPerMonth(
  points: BcbSeriesPoint[],
): Map<string, BcbSeriesPoint> {
  const byMonth = new Map<string, BcbSeriesPoint>();
  for (const point of points) {
    const key = monthKey(point.date);
    const existing = byMonth.get(key);
    if (!existing || point.date > existing.date) {
      byMonth.set(key, point);
    }
  }
  return byMonth;
}

export function annualToMonthlyPct(annualPct: number): number {
  return (Math.pow(1 + annualPct / 100, 1 / 12) - 1) * 100;
}

export function compoundAccumulatedPct(monthlyRates: number[]): number {
  const factor = monthlyRates.reduce((acc, rate) => acc * (1 + rate / 100), 1);
  return Math.round((factor - 1) * 10000) / 100;
}

async function refreshOneBenchmark(
  benchmark: BenchmarkType,
  seriesCode: number,
  convert: (rawValue: number) => number,
  now: Date,
): Promise<void> {
  const provider = createBcbProvider();
  const points = await provider.fetchSeries(seriesCode, FETCH_POINTS);
  const monthly = latestPerMonth(points);

  const db = getDb();
  for (const [key, point] of monthly) {
    const referenceMonth = `${key}-01`;
    const monthlyRatePct = convert(point.value).toFixed(4);

    await db
      .insert(benchmarkRates)
      .values({ benchmark, referenceMonth, monthlyRatePct, fetchedAt: now })
      .onConflictDoUpdate({
        target: [benchmarkRates.benchmark, benchmarkRates.referenceMonth],
        set: { monthlyRatePct, fetchedAt: now },
      });
  }
}

export async function refreshBenchmarks(now: Date): Promise<void> {
  try {
    await refreshOneBenchmark("ipca", IPCA_SERIES_CODE, (v) => v, now);
  } catch (err) {
    console.error("[benchmark.service] IPCA refresh failed", err);
  }

  try {
    await refreshOneBenchmark("cdi", CDI_SERIES_CODE, annualToMonthlyPct, now);
  } catch (err) {
    console.error("[benchmark.service] CDI refresh failed", err);
  }
}

export async function getBenchmarkComparison(
  userId: string,
  period: "year" | "12m",
): Promise<BenchmarkComparison> {
  const now = new Date();
  const startMonth =
    period === "year"
      ? `${now.getFullYear()}-01-01`
      : toDateString(new Date(now.getFullYear(), now.getMonth() - 11, 1));

  const db = getDb();
  const [snapshots, rateRows] = await Promise.all([
    db
      .select({
        snapshotDate: investmentSnapshots.snapshotDate,
        totalAssetsCents: investmentSnapshots.totalAssetsCents,
      })
      .from(investmentSnapshots)
      .where(
        and(
          eq(investmentSnapshots.userId, userId),
          gte(investmentSnapshots.snapshotDate, startMonth),
        ),
      )
      .orderBy(asc(investmentSnapshots.snapshotDate)),
    db
      .select()
      .from(benchmarkRates)
      .where(gte(benchmarkRates.referenceMonth, startMonth))
      .orderBy(asc(benchmarkRates.referenceMonth)),
  ]);

  const ratesByBenchmark: Record<BenchmarkType, Map<string, number>> = {
    ipca: new Map(),
    cdi: new Map(),
  };
  for (const row of rateRows) {
    ratesByBenchmark[row.benchmark].set(
      row.referenceMonth,
      Number(row.monthlyRatePct),
    );
  }

  const months = Array.from(
    new Set([...ratesByBenchmark.ipca.keys(), ...ratesByBenchmark.cdi.keys()]),
  ).sort();

  const startCents = snapshots[0]?.totalAssetsCents ?? null;

  const ipcaRatesSoFar: number[] = [];
  const cdiRatesSoFar: number[] = [];
  const series: BenchmarkComparisonPoint[] = months.map((month) => {
    const ipcaRate = ratesByBenchmark.ipca.get(month);
    const cdiRate = ratesByBenchmark.cdi.get(month);
    if (ipcaRate !== undefined) ipcaRatesSoFar.push(ipcaRate);
    if (cdiRate !== undefined) cdiRatesSoFar.push(cdiRate);

    const snapshotForMonth = snapshots.find((s) =>
      s.snapshotDate.startsWith(month),
    );
    const patrimonyIndexed =
      startCents && snapshotForMonth
        ? Math.round((snapshotForMonth.totalAssetsCents / startCents) * 10000) /
          100
        : 100;

    return {
      referenceMonth: month,
      patrimonyIndexed,
      ipcaAccumulatedPct:
        ipcaRate !== undefined ? compoundAccumulatedPct(ipcaRatesSoFar) : null,
      cdiAccumulatedPct:
        cdiRate !== undefined ? compoundAccumulatedPct(cdiRatesSoFar) : null,
    };
  });

  const lastSnapshot = snapshots[snapshots.length - 1] ?? null;
  const portfolioReturnPct =
    startCents && lastSnapshot && snapshots.length >= 2
      ? Math.round(
          ((lastSnapshot.totalAssetsCents - startCents) / startCents) * 10000,
        ) / 100
      : null;
  const cdiReturnPct =
    cdiRatesSoFar.length > 0 ? compoundAccumulatedPct(cdiRatesSoFar) : null;

  return { series, portfolioReturnPct, cdiReturnPct };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `apps/api`:

```bash
pnpm test -- benchmark.service.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/benchmarks/benchmark.service.ts apps/api/src/modules/investments/benchmarks/benchmark.service.test.ts
git commit -m "feat(api): add benchmark refresh and comparison service"
```

---

### Task 6: `patrimony.service.ts` extensions — registerSnapshot, getPatrimonyHistory

**Files:**
- Modify: `apps/api/src/modules/investments/patrimony.service.ts`

**Interfaces:**
- Consumes: `investmentSnapshots` table from `@money-manager/db` (Task 1); `PatrimonyHistoryPoint`, `PatrimonySnapshot` types from `@money-manager/types` (Task 2); `todayBrtString` from `./brt-date.js` (Task 3); `newId` from `@money-manager/utils` (existing, not yet imported in this file).
- Produces: `registerSnapshot(userId: string, now: Date): Promise<PatrimonySnapshot>`, `getPatrimonyHistory(userId: string, months: number): Promise<PatrimonyHistoryPoint[]>`. Task 7 (`patrimony-scheduler.ts`) and Task 8 (endpoints) both call these.

No unit test file changes for this task. Both new functions call `getDb()`
directly (they are DB-touching wrappers, the same shape as the existing
`getPatrimonySummary`, not the pure `computePatrimonySummary` core) — per
this codebase's actual convention (Global Constraints), DB-touching
functions are covered by an integration test, not a mocked unit test.
Task 9 covers both.

- [ ] **Step 1: Update the import block at the top of `patrimony.service.ts`**

Current imports:

```typescript
import {
  getDb,
  investmentAccounts,
  investmentHoldings,
  investmentQuoteCache,
  piggyBanks,
} from "@money-manager/db";
import { ASSET_CLASS_LABELS } from "@money-manager/types";
import type {
  PatrimonyAccountBucket,
  PatrimonyAssetClassBucket,
  PatrimonySummary,
  PatrimonyUpcomingMaturity,
} from "@money-manager/types";
import { toDateString } from "@money-manager/utils/installment-schedule";
import { and, eq, isNull } from "drizzle-orm";
```

Replace with:

```typescript
import {
  getDb,
  investmentAccounts,
  investmentHoldings,
  investmentQuoteCache,
  investmentSnapshots,
  piggyBanks,
} from "@money-manager/db";
import { ASSET_CLASS_LABELS } from "@money-manager/types";
import type {
  PatrimonyAccountBucket,
  PatrimonyAssetClassBucket,
  PatrimonyHistoryPoint,
  PatrimonySnapshot,
  PatrimonySummary,
  PatrimonyUpcomingMaturity,
} from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { toDateString } from "@money-manager/utils/installment-schedule";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { todayBrtString } from "./brt-date.js";
```

`toDateString` stays on its existing subpath import — verified in
`packages/utils/src/index.ts` that only `newId`, `EMAIL_MAX`/`PASSWORD_MAX`,
the password/refresh-token helpers, and the `date.js` helpers are
re-exported from the package root barrel; `toDateString` is not among them,
so it keeps importing from `@money-manager/utils/installment-schedule`
exactly as the file already does today. `newId` is a new import line, used
throughout every other service file in this module the same way.

- [ ] **Step 2: Append to the end of `patrimony.service.ts`**

```typescript
type InvestmentSnapshotRow = typeof investmentSnapshots.$inferSelect;

function toPatrimonySnapshot(row: InvestmentSnapshotRow): PatrimonySnapshot {
  return {
    id: row.id,
    userId: row.userId,
    snapshotDate: row.snapshotDate,
    totalAssetsCents: row.totalAssetsCents,
    byAssetClass: row.byAssetClass as PatrimonyAssetClassBucket[],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerSnapshot(
  userId: string,
  now: Date,
): Promise<PatrimonySnapshot> {
  const summary = await getPatrimonySummary(userId);
  const snapshotDate = todayBrtString(now);
  const db = getDb();

  await db
    .insert(investmentSnapshots)
    .values({
      id: newId(),
      userId,
      snapshotDate,
      totalAssetsCents: summary.totalAssetsCents,
      byAssetClass: summary.byAssetClass,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [investmentSnapshots.userId, investmentSnapshots.snapshotDate],
      set: {
        totalAssetsCents: summary.totalAssetsCents,
        byAssetClass: summary.byAssetClass,
      },
    });

  const [row] = await db
    .select()
    .from(investmentSnapshots)
    .where(
      and(
        eq(investmentSnapshots.userId, userId),
        eq(investmentSnapshots.snapshotDate, snapshotDate),
      ),
    )
    .limit(1);

  return toPatrimonySnapshot(row!);
}

export async function getPatrimonyHistory(
  userId: string,
  months: number,
): Promise<PatrimonyHistoryPoint[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = toDateString(cutoff);

  const rows = await getDb()
    .select({
      snapshotDate: investmentSnapshots.snapshotDate,
      totalAssetsCents: investmentSnapshots.totalAssetsCents,
    })
    .from(investmentSnapshots)
    .where(
      and(
        eq(investmentSnapshots.userId, userId),
        gte(investmentSnapshots.snapshotDate, cutoffStr),
      ),
    )
    .orderBy(asc(investmentSnapshots.snapshotDate));

  return rows;
}
```

`registerSnapshot`'s insert always generates a fresh `newId()`, but on a
same-day conflict the `set` clause never touches `id` — the existing row's
original id is preserved, only `totalAssetsCents`/`byAssetClass` update.
The re-select after the upsert returns the true persisted row (including
its real `createdAt`, which stays the day's first-registration timestamp
even on later same-day updates) rather than reconstructing the response by
hand.

- [ ] **Step 3: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/investments/patrimony.service.ts
git commit -m "feat(api): add snapshot registration and history to patrimony service"
```

---

### Task 7: `patrimony-scheduler.ts` + `server.ts` wiring

**Files:**
- Create: `apps/api/src/modules/investments/patrimony-scheduler.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `getDb`, `users` from `@money-manager/db`; `registerSnapshot` from `./patrimony.service.js` (Task 6); `refreshBenchmarks` from `./benchmarks/benchmark.service.js` (Task 5); `hasDailyTriggerPassed`, `hasWeeklyElapsed`, `todayBrtString` from `./brt-date.js` (Task 3).
- Produces: `startPatrimonyScheduler(): PatrimonyScheduler` (`{ stop(): void }`), started once at server boot alongside the existing `startQuoteScheduler()`.

No test file for this task — it's an orchestration wrapper around
already-tested pieces (`hasDailyTriggerPassed`/`hasWeeklyElapsed` tested in
Task 3, `registerSnapshot`/`refreshBenchmarks` tested via Task 6/Task 5 plus
Task 9's integration coverage), the same reasoning `quote-scheduler.ts`
itself has no dedicated test file beyond the gate functions it used to
contain.

- [ ] **Step 1: Create `apps/api/src/modules/investments/patrimony-scheduler.ts`**

```typescript
import { getDb, users } from "@money-manager/db";
import { refreshBenchmarks } from "./benchmarks/benchmark.service.js";
import { hasDailyTriggerPassed, hasWeeklyElapsed, todayBrtString } from "./brt-date.js";
import { registerSnapshot } from "./patrimony.service.js";

const TICK_INTERVAL_MS = 15 * 60 * 1000;

export interface PatrimonyScheduler {
  stop(): void;
}

export function startPatrimonyScheduler(): PatrimonyScheduler {
  let lastSnapshotRunDate: string | null = null;
  let lastBenchmarkRunAt: Date | null = null;

  const tick = async (): Promise<void> => {
    const now = new Date();

    if (hasDailyTriggerPassed(now, lastSnapshotRunDate)) {
      try {
        const allUsers = await getDb().select({ id: users.id }).from(users);
        let succeeded = 0;
        for (const user of allUsers) {
          try {
            await registerSnapshot(user.id, now);
            succeeded += 1;
          } catch (err) {
            console.error(
              `[patrimony-scheduler] snapshot failed for user ${user.id}`,
              err,
            );
          }
        }
        lastSnapshotRunDate = todayBrtString(now);
        console.log(
          `[patrimony-scheduler] daily snapshot sweep completed for ${succeeded}/${allUsers.length} user(s)`,
        );
      } catch (err) {
        console.error("[patrimony-scheduler] daily snapshot sweep failed", err);
      }
    }

    if (hasWeeklyElapsed(now, lastBenchmarkRunAt)) {
      try {
        await refreshBenchmarks(now);
        lastBenchmarkRunAt = now;
        console.log("[patrimony-scheduler] weekly benchmark refresh completed");
      } catch (err) {
        console.error(
          "[patrimony-scheduler] weekly benchmark refresh failed",
          err,
        );
      }
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);

  return {
    stop(): void {
      clearInterval(interval);
    },
  };
}
```

One user's `registerSnapshot` failure is caught per-iteration and logged,
not allowed to skip the remaining users — different from
`quote-scheduler.ts`'s existing all-or-nothing sweep (unchanged by this
plan). `lastSnapshotRunDate`/`lastBenchmarkRunAt` are only updated once
their respective block completes without an unhandled throw, so a genuinely
unexpected crash (e.g. the initial `users` query itself failing) correctly
causes a retry next tick rather than silently marking the day/week done.

- [ ] **Step 2: Wire into `apps/api/src/server.ts`**

Current content:

```typescript
import "dotenv/config";
import { waitForDbConnection } from "@money-manager/db";
import { getJwtAccessSecret, getJwtRefreshSecret } from "./config/secrets.js";
import { createApp } from "./app.js";
import { startQuoteScheduler } from "./modules/investments/pricing/quote-scheduler.js";

async function main(): Promise<void> {
  getJwtAccessSecret();
  getJwtRefreshSecret();

  if (process.env.DATABASE_URL?.trim()) {
    await waitForDbConnection();
  }

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  const app = createApp();
  const scheduler = startQuoteScheduler();

  const server = app.listen(port, host, () => {
    console.log(`api listening on http://${host}:${port}`);
  });

  const shutdown = (): void => {
    scheduler.stop();
    server.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  console.error("[API] failed to start", error);
  process.exit(1);
});
```

Replace with:

```typescript
import "dotenv/config";
import { waitForDbConnection } from "@money-manager/db";
import { getJwtAccessSecret, getJwtRefreshSecret } from "./config/secrets.js";
import { createApp } from "./app.js";
import { startPatrimonyScheduler } from "./modules/investments/patrimony-scheduler.js";
import { startQuoteScheduler } from "./modules/investments/pricing/quote-scheduler.js";

async function main(): Promise<void> {
  getJwtAccessSecret();
  getJwtRefreshSecret();

  if (process.env.DATABASE_URL?.trim()) {
    await waitForDbConnection();
  }

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  const app = createApp();
  const quoteScheduler = startQuoteScheduler();
  const patrimonyScheduler = startPatrimonyScheduler();

  const server = app.listen(port, host, () => {
    console.log(`api listening on http://${host}:${port}`);
  });

  const shutdown = (): void => {
    quoteScheduler.stop();
    patrimonyScheduler.stop();
    server.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  console.error("[API] failed to start", error);
  process.exit(1);
});
```

- [ ] **Step 3: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/investments/patrimony-scheduler.ts apps/api/src/server.ts
git commit -m "feat(api): add patrimony scheduler for daily snapshots and weekly benchmarks"
```

---

### Task 8: New endpoints — history, snapshots, benchmarks

**Files:**
- Create: `apps/api/src/modules/investments/patrimony.schema.ts`
- Modify: `apps/api/src/modules/investments/patrimony.controller.ts`
- Modify: `apps/api/src/modules/investments/patrimony.routes.ts`

**Interfaces:**
- Consumes: `getPatrimonyHistory`, `registerSnapshot` from `./patrimony.service.js` (Task 6); `getBenchmarkComparison` from `./benchmarks/benchmark.service.js` (Task 5); `getUserId`, `authenticate` (existing).
- Produces: `GET /v1/patrimony/history`, `POST /v1/patrimony/snapshots`, `GET /v1/patrimony/benchmarks`, mounted on the existing `patrimonyRoutes` router (already mounted in `app.ts` from 20a — no change needed there). Task 9 and Task 12 (frontend) both call these by route.

No unit test file for this task — thin controller/schema wiring, covered by
Task 9's integration tests (same convention as every other controller in
this module).

- [ ] **Step 1: Create `apps/api/src/modules/investments/patrimony.schema.ts`**

```typescript
import { z } from "zod";

export const patrimonyHistoryQuerySchema = z.object({
  period: z.enum(["3", "6", "12", "24"]).transform(Number),
});

export type PatrimonyHistoryQuery = z.infer<typeof patrimonyHistoryQuerySchema>;

export const patrimonyBenchmarksQuerySchema = z.object({
  period: z.enum(["year", "12m"]),
});

export type PatrimonyBenchmarksQuery = z.infer<
  typeof patrimonyBenchmarksQuerySchema
>;
```

- [ ] **Step 2: Replace `apps/api/src/modules/investments/patrimony.controller.ts`**

Current content is one function (`getSummary`). Replace the whole file
with:

```typescript
import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import * as benchmarkService from "./benchmarks/benchmark.service.js";
import {
  patrimonyBenchmarksQuerySchema,
  patrimonyHistoryQuerySchema,
} from "./patrimony.schema.js";
import * as patrimonyService from "./patrimony.service.js";

export async function getSummary(req: Request, res: Response): Promise<void> {
  const summary = await patrimonyService.getPatrimonySummary(getUserId(req));
  res.status(200).json(summary);
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  const { period } = patrimonyHistoryQuerySchema.parse(req.query);
  const items = await patrimonyService.getPatrimonyHistory(
    getUserId(req),
    period,
  );
  res.status(200).json({ items });
}

export async function registerSnapshot(
  req: Request,
  res: Response,
): Promise<void> {
  const snapshot = await patrimonyService.registerSnapshot(
    getUserId(req),
    new Date(),
  );
  res.status(200).json(snapshot);
}

export async function getBenchmarks(
  req: Request,
  res: Response,
): Promise<void> {
  const { period } = patrimonyBenchmarksQuerySchema.parse(req.query);
  const comparison = await benchmarkService.getBenchmarkComparison(
    getUserId(req),
    period,
  );
  res.status(200).json(comparison);
}
```

- [ ] **Step 3: Replace `apps/api/src/modules/investments/patrimony.routes.ts`**

```typescript
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as patrimonyController from "./patrimony.controller.js";

export const patrimonyRoutes = Router();

patrimonyRoutes.get("/summary", authenticate, patrimonyController.getSummary);
patrimonyRoutes.get("/history", authenticate, patrimonyController.getHistory);
patrimonyRoutes.post(
  "/snapshots",
  authenticate,
  patrimonyController.registerSnapshot,
);
patrimonyRoutes.get(
  "/benchmarks",
  authenticate,
  patrimonyController.getBenchmarks,
);
```

- [ ] **Step 4: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/api` builds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/investments/patrimony.schema.ts apps/api/src/modules/investments/patrimony.controller.ts apps/api/src/modules/investments/patrimony.routes.ts
git commit -m "feat(api): add history, snapshots, and benchmarks endpoints"
```

---

### Task 9: Integration tests — history, snapshots, benchmarks

**Files:**
- Create: `apps/api/tests/integration/patrimony-analytics.integration.test.ts`

**Interfaces:**
- Consumes: `createTestApp` from `../helpers/app.js`, `registerUser` from `../helpers/auth.js`, `describeWithDb`/`useIntegrationDbLifecycle` from `../helpers/db.js` (all existing, same pattern as `patrimony.integration.test.ts`); `getDb`, `benchmarkRates` from `@money-manager/db` (Task 1), used to seed benchmark rows directly instead of a live BCB call.
- Produces: nothing consumed by later tasks — this is the last backend task.

- [ ] **Step 1: Create `apps/api/tests/integration/patrimony-analytics.integration.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { benchmarkRates, getDb } from "@money-manager/db";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("patrimony analytics integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/patrimony/snapshots cria um snapshot com o patrimônio atual", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta snapshot", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB snapshot",
        currentUnitValueCents: 50000,
      });

    const snapshotRes = await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.body.totalAssetsCents).toBe(50000);
    expect(snapshotRes.body.byAssetClass).toEqual([
      {
        class: "fixed_income_group",
        label: "Renda fixa",
        totalCents: 50000,
        percentage: 100,
      },
    ]);
  });

  it("POST /v1/patrimony/snapshots chamado duas vezes no mesmo dia atualiza, não duplica", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta idempotência", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB primeiro valor",
        currentUnitValueCents: 10000,
      });

    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB segundo valor",
        currentUnitValueCents: 5000,
      });

    const secondSnapshotRes = await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondSnapshotRes.status).toBe(200);
    expect(secondSnapshotRes.body.totalAssetsCents).toBe(15000);

    const historyRes = await request(app)
      .get("/v1/patrimony/history?period=3")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(historyRes.body.items).toHaveLength(1);
    expect(historyRes.body.items[0].totalAssetsCents).toBe(15000);
  });

  it("GET /v1/patrimony/history não mistura snapshots de usuários diferentes", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    const accountA = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Conta A", type: "brokerage" });
    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        accountId: accountA.body.id,
        symbol: "CDB A",
        currentUnitValueCents: 20000,
      });
    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${tokenA}`);

    const accountB = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Conta B", type: "brokerage" });
    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        accountId: accountB.body.id,
        symbol: "CDB B",
        currentUnitValueCents: 99999,
      });
    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${tokenB}`);

    const historyA = await request(app)
      .get("/v1/patrimony/history?period=3")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(historyA.body.items).toHaveLength(1);
    expect(historyA.body.items[0].totalAssetsCents).toBe(20000);
  });

  it("GET /v1/patrimony/history rejeita period inválido com 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/patrimony/history?period=5")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });

  it("GET /v1/patrimony/benchmarks compõe a série a partir de benchmark_rates semeados", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta benchmark", type: "brokerage" });
    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB benchmark",
        currentUnitValueCents: 100000,
      });
    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    await getDb()
      .insert(benchmarkRates)
      .values([
        {
          benchmark: "ipca",
          referenceMonth: currentMonth,
          monthlyRatePct: "0.6700",
          fetchedAt: now,
        },
        {
          benchmark: "cdi",
          referenceMonth: currentMonth,
          monthlyRatePct: "1.0000",
          fetchedAt: now,
        },
      ]);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=year")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(1);
    expect(res.body.series[0].referenceMonth).toBe(currentMonth);
    expect(res.body.series[0].ipcaAccumulatedPct).toBeCloseTo(0.67, 2);
    expect(res.body.series[0].cdiAccumulatedPct).toBeCloseTo(1.0, 2);
    expect(res.body.series[0].patrimonyIndexed).toBe(100);
    expect(res.body.cdiReturnPct).toBeCloseTo(1.0, 2);
  });

  it("GET /v1/patrimony/benchmarks retorna série vazia sem lançar erro quando não há benchmark_rates", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=12m")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toEqual([]);
    expect(res.body.portfolioReturnPct).toBeNull();
    expect(res.body.cdiReturnPct).toBeNull();
  });

  it("GET /v1/patrimony/benchmarks rejeita period inválido com 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=mes")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the integration suite**

Run from `apps/api` (requires a running test database — same prerequisite as every other integration test in this repo):

```bash
pnpm test -- patrimony-analytics.integration.test.ts
```

Expected: PASS — 8 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/patrimony-analytics.integration.test.ts
git commit -m "test(api): add integration coverage for patrimony analytics endpoints"
```

---

### Task 10: Frontend — `recharts` dependency, period selector, allocation donut

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/features/investments/charts/patrimony-period-selector.tsx`
- Create: `apps/web/src/components/features/investments/charts/allocation-donut-chart.tsx`

**Interfaces:**
- Consumes: `PatrimonyAssetClassBucket` from `@money-manager/types` (existing, from 20b); `cn` from `../../../../lib/cn` (existing).
- Produces: `PatrimonyPeriodSelector` (props: `options: {value, label}[]`, `value: string`, `onChange: (value: string) => void`) and `AllocationDonutChart` (props: `buckets: PatrimonyAssetClassBucket[]`). Task 11 imports `PatrimonyPeriodSelector`. Task 12 imports both.

- [ ] **Step 1: Add the `recharts` dependency**

Run from the repo root:

```bash
pnpm --filter @money-manager/web add recharts
```

Expected: `apps/web/package.json`'s `dependencies` gains a `"recharts"` entry and `pnpm-lock.yaml` updates. Do not hand-edit the version — let pnpm resolve and pin it.

- [ ] **Step 2: Create `apps/web/src/components/features/investments/charts/patrimony-period-selector.tsx`**

```tsx
import { cn } from "../../../../lib/cn";

export interface PatrimonyPeriodOption {
  value: string;
  label: string;
}

interface PatrimonyPeriodSelectorProps {
  options: PatrimonyPeriodOption[];
  value: string;
  onChange: (value: string) => void;
}

export function PatrimonyPeriodSelector({
  options,
  value,
  onChange,
}: PatrimonyPeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-bold transition-all",
            value === option.value
              ? "bg-emerald-500 text-zinc-950"
              : "bg-white/5 text-zinc-400 hover:bg-white/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/components/features/investments/charts/allocation-donut-chart.tsx`**

```tsx
import type { PatrimonyAssetClassBucket } from "@money-manager/types";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#a855f7", // purple-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#71717a", // zinc-500
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

interface AllocationDonutChartProps {
  buckets: PatrimonyAssetClassBucket[];
}

export function AllocationDonutChart({ buckets }: AllocationDonutChartProps) {
  if (buckets.length === 0) {
    return (
      <div className="glass flex h-64 items-center justify-center rounded-3xl p-4 text-center text-sm text-zinc-500 sm:rounded-[2.5rem] sm:p-6">
        Ainda não há posições para mostrar alocação.
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
      <h3 className="mb-4 text-base font-bold text-white sm:text-lg">
        Alocação por classe
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={buckets}
            dataKey="totalCents"
            nameKey="label"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
          >
            {buckets.map((bucket, index) => (
              <Cell key={bucket.class} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const bucket = payload[0].payload as PatrimonyAssetClassBucket;
              return (
                <div className="glass rounded-xl px-3 py-2 text-xs text-white">
                  <p className="font-bold">{bucket.label}</p>
                  <p className="text-zinc-400">
                    {formatCurrency(bucket.totalCents)} · {bucket.percentage}%
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-4 flex flex-wrap gap-3">
        {buckets.map((bucket, index) => (
          <div key={bucket.class} className="flex items-center gap-2 text-xs">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-zinc-400">{bucket.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/web` builds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/features/investments/charts/patrimony-period-selector.tsx apps/web/src/components/features/investments/charts/allocation-donut-chart.tsx
git commit -m "feat(web): add recharts dependency, period selector, and allocation donut chart"
```

---

### Task 11: Frontend — evolution and benchmark comparison charts

**Files:**
- Create: `apps/web/src/components/features/investments/charts/patrimony-evolution-chart.tsx`
- Create: `apps/web/src/components/features/investments/charts/benchmark-comparison-chart.tsx`

**Interfaces:**
- Consumes: `PatrimonyHistoryPoint`, `BenchmarkComparison` from `@money-manager/types` (Task 2); `apiFetch` from `../../../../lib/api` (existing); `PatrimonyPeriodSelector` from `./patrimony-period-selector.js` (Task 10).
- Produces: `PatrimonyEvolutionChart` (props: `refreshKey?: number`) and `BenchmarkComparisonChart` (no props — owns its own period state and fetch). Task 12 imports both.

- [ ] **Step 1: Create `apps/web/src/components/features/investments/charts/patrimony-evolution-chart.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { PatrimonyHistoryPoint } from "@money-manager/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../../../lib/api";
import { PatrimonyPeriodSelector } from "./patrimony-period-selector.js";

const PERIOD_OPTIONS = [
  { value: "3", label: "3M" },
  { value: "6", label: "6M" },
  { value: "12", label: "1A" },
  { value: "24", label: "2A" },
];

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateLabel(dateStr: string) {
  const month = Number(dateStr.slice(5, 7));
  return MONTH_LABELS[month - 1] ?? dateStr;
}

interface PatrimonyEvolutionChartProps {
  refreshKey?: number;
}

export function PatrimonyEvolutionChart({
  refreshKey,
}: PatrimonyEvolutionChartProps) {
  const [period, setPeriod] = useState("3");
  const [points, setPoints] = useState<PatrimonyHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/v1/patrimony/history?period=${period}`);
        if (res.ok) {
          const data = (await res.json()) as {
            items: PatrimonyHistoryPoint[];
          };
          setPoints(data.items ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [period, refreshKey]);

  return (
    <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-white sm:text-lg">
          Evolução do patrimônio
        </h3>
        <PatrimonyPeriodSelector
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {loading ? (
        <div className="h-56 w-full animate-pulse rounded-2xl bg-white/5" />
      ) : points.length < 2 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-zinc-500">
          Ainda não há histórico suficiente.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <LineChart data={points}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis
              dataKey="snapshotDate"
              tickFormatter={formatDateLabel}
              stroke="#71717a"
              fontSize={12}
            />
            <YAxis
              tickFormatter={(v: number) => formatCurrency(v)}
              stroke="#71717a"
              fontSize={12}
              width={80}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const point = payload[0].payload as PatrimonyHistoryPoint;
                return (
                  <div className="glass rounded-xl px-3 py-2 text-xs text-white">
                    <p className="font-bold">{point.snapshotDate}</p>
                    <p className="text-zinc-400">
                      {formatCurrency(point.totalAssetsCents)}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="totalAssetsCents"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/components/features/investments/charts/benchmark-comparison-chart.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { BenchmarkComparison } from "@money-manager/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../../../lib/api";
import { PatrimonyPeriodSelector } from "./patrimony-period-selector.js";

const PERIOD_OPTIONS = [
  { value: "year", label: "Ano" },
  { value: "12m", label: "12M" },
];

interface ChartPoint {
  referenceMonth: string;
  patrimonyAccumulatedPct: number;
  ipcaAccumulatedPct: number | null;
  cdiAccumulatedPct: number | null;
}

function formatPct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

export function BenchmarkComparisonChart() {
  const [period, setPeriod] = useState("year");
  const [comparison, setComparison] = useState<BenchmarkComparison | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/v1/patrimony/benchmarks?period=${period}`);
        if (res.ok) {
          setComparison((await res.json()) as BenchmarkComparison);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [period]);

  const chartData: ChartPoint[] = (comparison?.series ?? []).map((point) => ({
    referenceMonth: point.referenceMonth,
    patrimonyAccumulatedPct: point.patrimonyIndexed - 100,
    ipcaAccumulatedPct: point.ipcaAccumulatedPct,
    cdiAccumulatedPct: point.cdiAccumulatedPct,
  }));

  return (
    <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-white sm:text-lg">
            Patrimônio vs IPCA/CDI
          </h3>
          <p className="text-xs text-zinc-500">
            Informativo — não é recomendação de investimento.
          </p>
        </div>
        <PatrimonyPeriodSelector
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {loading ? (
        <div className="h-56 w-full animate-pulse rounded-2xl bg-white/5" />
      ) : chartData.length < 2 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-zinc-500">
          Ainda não há histórico suficiente.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={224}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="referenceMonth" stroke="#71717a" fontSize={12} />
              <YAxis
                stroke="#71717a"
                fontSize={12}
                width={50}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const point = payload[0].payload as ChartPoint;
                  return (
                    <div className="glass rounded-xl px-3 py-2 text-xs text-white">
                      <p className="font-bold">{point.referenceMonth}</p>
                      <p className="text-emerald-400">
                        Patrimônio: {formatPct(point.patrimonyAccumulatedPct)}
                      </p>
                      <p className="text-blue-400">
                        IPCA: {formatPct(point.ipcaAccumulatedPct)}
                      </p>
                      <p className="text-amber-400">
                        CDI: {formatPct(point.cdiAccumulatedPct)}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="patrimonyAccumulatedPct"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="ipcaAccumulatedPct"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="cdiAccumulatedPct"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-emerald-500" />
              <span className="text-zinc-400">Patrimônio</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-blue-400" />
              <span className="text-zinc-400">IPCA acumulado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-amber-500" />
              <span className="text-zinc-400">CDI acumulado</span>
            </div>
          </div>
          {comparison && comparison.portfolioReturnPct !== null ? (
            <p className="mt-3 text-center text-sm text-zinc-400">
              Carteira {comparison.portfolioReturnPct.toFixed(2)}% vs CDI{" "}
              {comparison.cdiReturnPct !== null
                ? `${comparison.cdiReturnPct.toFixed(2)}%`
                : "—"}{" "}
              no período
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
```

The patrimony line plots `patrimonyIndexed - 100` (percent change from the
period's first snapshot), not the raw `patrimonyIndexed` value — plotting
an index centered on 100 next to accumulated percentages centered on 0
would put them on wildly different visual scales on the same axis (a
patrimony line hovering near "100" would dwarf IPCA/CDI lines hovering
near "5", making the comparison unreadable). Converting to the same
percent-change basis is what makes the three lines visually comparable.

- [ ] **Step 3: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/web` builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/investments/charts/patrimony-evolution-chart.tsx apps/web/src/components/features/investments/charts/benchmark-comparison-chart.tsx
git commit -m "feat(web): add patrimony evolution and benchmark comparison charts"
```

---

### Task 12: Frontend — wire charts into `InvestmentsPage`

**Files:**
- Modify: `apps/web/src/pages/InvestmentsPage.tsx`

**Interfaces:**
- Consumes: `AllocationDonutChart`, `PatrimonyEvolutionChart`, `BenchmarkComparisonChart` from `../components/features/investments/charts/*.js` (Tasks 10–11); `apiFetch` (existing).
- Produces: nothing consumed by later tasks — this is the last code change before browser verification.

- [ ] **Step 1: Add the three chart imports**

Current import block (top of file):

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
```

Replace with (three new imports added, alphabetically placed among the
existing `investments` component imports):

```tsx
import { useCallback, useEffect, useState } from "react";
import type {
  InvestmentAccount,
  InvestmentHolding,
  PatrimonySummary,
  PiggyBank,
} from "@money-manager/types";
import { AllocationDonutChart } from "../components/features/investments/charts/allocation-donut-chart";
import { BenchmarkComparisonChart } from "../components/features/investments/charts/benchmark-comparison-chart";
import { PatrimonyEvolutionChart } from "../components/features/investments/charts/patrimony-evolution-chart";
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
```

- [ ] **Step 2: Add snapshot-related state**

Current (end of the state declarations block):

```tsx
  const [transactionPiggyBank, setTransactionPiggyBank] =
    useState<PiggyBank | null>(null);
  const [transactionMode, setTransactionMode] = useState<
    "deposit" | "withdraw"
  >("deposit");
```

Replace with:

```tsx
  const [transactionPiggyBank, setTransactionPiggyBank] =
    useState<PiggyBank | null>(null);
  const [transactionMode, setTransactionMode] = useState<
    "deposit" | "withdraw"
  >("deposit");

  const [snapshotRefreshKey, setSnapshotRefreshKey] = useState(0);
  const [registeringSnapshot, setRegisteringSnapshot] = useState(false);
```

- [ ] **Step 3: Add the on-mount fire-and-forget snapshot call**

Current:

```tsx
  useEffect(() => {
    void loadAll();
  }, [loadAll]);
```

Replace with:

```tsx
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    // Backstop for days the scheduler hasn't run yet — best-effort, no
    // loading state or error surfaced, matches spec §1.7/§2.
    void apiFetch("/v1/patrimony/snapshots", { method: "POST" }).catch(() => {
      /* daily scheduler remains the primary mechanism */
    });
  }, []);
```

- [ ] **Step 4: Add the manual snapshot handler**

Insert after `handleToggleHoldingOverride` (before `function openCreatePiggyBank() {`):

```tsx
  async function handleRegisterSnapshot() {
    setRegisteringSnapshot(true);
    try {
      const res = await apiFetch("/v1/patrimony/snapshots", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erro ao registrar patrimônio de hoje");
      setSnapshotRefreshKey((k) => k + 1);
      void loadAll();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Erro ao registrar patrimônio",
      );
    } finally {
      setRegisteringSnapshot(false);
    }
  }

```

- [ ] **Step 5: Render the charts below `PatrimonySummaryCards`**

Current:

```tsx
          {summary ? <PatrimonySummaryCards summary={summary} /> : null}

          {accounts.length === 0 ? (
```

Replace with:

```tsx
          {summary ? (
            <div className="space-y-4 sm:space-y-6">
              <PatrimonySummaryCards summary={summary} />
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                <AllocationDonutChart buckets={summary.byAssetClass} />
                <PatrimonyEvolutionChart refreshKey={snapshotRefreshKey} />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleRegisterSnapshot()}
                  disabled={registeringSnapshot}
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-zinc-300 transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  {registeringSnapshot
                    ? "Registrando…"
                    : "Registrar patrimônio hoje"}
                </button>
              </div>
              <BenchmarkComparisonChart />
            </div>
          ) : null}

          {accounts.length === 0 ? (
```

- [ ] **Step 6: Build and typecheck**

Run from the repo root:

```bash
pnpm build
```

Expected: `@money-manager/web` builds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/InvestmentsPage.tsx
git commit -m "feat(web): wire allocation, evolution, and benchmark charts into investments page"
```

---

### Task 13: Browser verification

**Files:** none (verification only, may produce fix commits if issues are found).

**Interfaces:** none.

- [ ] **Step 1: Start the stack and log in**

Start the API and web dev servers per this repo's existing dev workflow.
Log in (or register a fresh test user) and navigate to `/dashboard/investments`.

- [ ] **Step 2: Verify the empty state (new user, no holdings)**

With no investment accounts/holdings yet: confirm the donut chart shows
"Ainda não há posições para mostrar alocação", the evolution chart shows
"Ainda não há histórico suficiente" (0 or 1 point), and the benchmark chart
shows the same — no crashes, no broken/empty recharts containers.

- [ ] **Step 3: Verify the donut chart**

Create at least one fixed-income holding (e.g. "CDB Teste", R$ 500) and, if
Brapi/CoinGecko credentials are configured, one variable-income holding
with a different `assetClass`. Confirm the donut renders a segment per
class with the correct percentages and the legend below it matches.

- [ ] **Step 4: Verify the manual snapshot button and evolution chart**

Click "Registrar patrimônio hoje". Confirm the button shows "Registrando…"
while in flight, then returns to its normal label. The evolution chart
still shows the empty state (a single day's point is not enough to draw a
line, per Task 11's `< 2` threshold) — this is expected, not a bug.

- [ ] **Step 5: Verify the benchmark comparison chart against seeded data**

Since a real day-1 environment won't have enough real history, seed at
least 2 months of `investment_snapshots` and 2 months of `benchmark_rates`
directly in the database (matching Task 9's integration test fixtures) to
verify the chart actually renders a multi-point line with a legend and a
"Carteira X% vs CDI Y%" summary line, not just its empty state. Confirm the
tooltip on hover shows patrimony/IPCA/CDI values for the hovered month.

- [ ] **Step 6: Verify period switching**

Click each period option (3M/6M/1A/2A on the evolution chart; Ano/12M on
the benchmark chart). Confirm each switch triggers its own loading skeleton
and refetch — switching one chart's period must not refetch the other
chart or the page's holdings/accounts list.

- [ ] **Step 7: Verify responsive layout**

Resize to a mobile viewport. Confirm the donut and evolution chart stack
vertically instead of side-by-side, and no chart overflows its container
or causes horizontal page scroll.

- [ ] **Step 8: Fix any issues found**

If any step above surfaces a bug, fix it in the relevant file from Tasks
10–12, re-verify the specific step that failed, and commit the fix
separately (`fix(web): ...`) rather than amending a prior task's commit.

