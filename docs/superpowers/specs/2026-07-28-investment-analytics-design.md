# Investment Analytics (Patrimônio — Snapshots, Evolução, IPCA/CDI) — Design

**Goal:** Give the existing "Patrimônio" page a history. Persist a daily
snapshot of total assets, show an allocation donut, a patrimony-evolution
line chart, and a comparison of the user's patrimony against IPCA/CDI —
purely informational, never investment advice.

**Scope of this round:** roadmap Feature 20 phase **20c only**
("Analytics"). Full feature context lives in `planning/ROADMAP.md`
§"Feature 20 — Investimentos e patrimônio", specifically §20.4 (modelo de
domínio), §20.5 (patrimônio bruto e snapshots), §20.7 (gráficos), and §20.9
(API) — that file is untracked/gitignored, so this spec restates everything
needed to implement this round without depending on it.

**Builds on:** Feature 20a (fixed income + patrimony summary) and 20b
(RV quotes, cache, scheduler), both merged to `master`. Confirmed by reading
the current schema and service code before writing this spec:
`computePatrimonySummary` in `patrimony.service.ts` already returns
`totalAssetsCents` (holdings + piggy banks) and `byAssetClass` in exactly
the shape `investment_snapshots` needs to persist — this round adds no new
aggregation logic, it persists two fields the existing function already
computes. The existing `pricing/quote-scheduler.ts` (20b) already
establishes the in-process daily-tick pattern this round extends to a
second, independent scheduler.

**Explicitly out of scope, deferred to Feature 20d (Qualidade):** broader
E2E coverage beyond this round's own integration tests, and any UI polish
pass beyond matching the existing `.glass` zinc/emerald dark theme.

**New external dependency (approved):** `recharts`, added to
`apps/web/package.json`. This is the project's first charting library — the
one existing chart (`dashboard-history.tsx`, Feature 08) is a hand-rolled
`<div>` bar chart, judged too limited for a donut and multi-series line
charts with correct scaling/tooltips/axes (see "Approaches considered"
below).

**New external API (approved):** Banco Central's public SGS ("Sistema
Gerenciador de Séries Temporais") REST API — free, no API key, no rate
limit encountered. Verified live against both series this spec relies on
before writing it:

- `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/N?formato=json`
  (IPCA, série 433) → `[{"data":"01/04/2026","valor":"0.67"}, ...]` — monthly
  % variation, one point per calendar month, dated the 1st of the month.
- `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/N?formato=json`
  (CDI, série 4389) → `[{"data":"27/07/2026","valor":"14.15"}, ...]` —
  annualized % rate, dated daily but empirically flat for weeks at a time
  (tracks the SELIC target, which only moves at COPOM meetings roughly every
  45 days). Confirmed flat across 15 consecutive business days at the time
  this spec was written.

IPCA's raw value is stored as-is; CDI's annualized rate needs converting to
a monthly-equivalent before storage. Both are compounded across whatever
window the caller asks for at read time, not pre-accumulated in storage —
§1.1 and §1.2 below explain why.

**Approaches considered (charting):**
1. **Hand-roll everything** (extend `dashboard-history.tsx`'s div+Framer-Motion
   style to a donut and line charts) — zero new dependencies, but correct
   multi-series scaling/tooltips/axes is meaningfully complex and bug-prone
   to hand-roll for two different line charts.
2. **Hybrid** (hand-roll the donut, use a library for the two line charts) —
   less new-dependency surface, but splits charting into two different
   implementation styles for one feature.
3. **Introduce `recharts` for all three charts (chosen).** SVG-based,
   themeable to the existing dark palette, ships `PieChart`/`innerRadius`,
   `LineChart`, and `Tooltip`/`CartesianGrid`/axis primitives that already
   handle scaling correctly. ~90KB gzipped, the project's first charting
   dependency — accepted cost for correctness and speed.

**Approaches considered (snapshot + benchmark job):**
1. **Fold into `pricing/quote-scheduler.ts`** — least new code, but the
   file's name and purpose ("keep RV quotes fresh") would stop matching
   what it does.
2. **New sibling `patrimony-scheduler.ts`, shared BRT-gate helper extracted
   (chosen).** Matches this module's existing convention of narrow,
   single-purpose files (`pricing/` already splits into 6 files by
   responsibility). The BRT-hour-gate logic (`todayBrtString`,
   `hasDailyTriggerPassed`) moves out of `quote-scheduler.ts` into a new
   `brt-date.ts`, so both schedulers share one implementation instead of
   two copies.
3. **Lazy-only, no daily job** — simplest, but the roadmap phrases the
   trigger as "daily job (**or** on page open if missing)" — daily is
   primary, on-open is a backstop for missed days. Users who don't open the
   page daily would get gappy evolution charts, undermining the chart's
   purpose.

**Tech stack:** Same as the rest of the app — Express + Drizzle + Zod on the
API, React + `apiFetch` on the web, native `fetch` for the outbound BCB
call, `recharts` for charts (new). No new backend npm dependencies — the
second scheduler is a plain `setInterval`, matching 20b's existing choice.

---

## 1. Backend

### 1.1 Data model (`packages/db`)

Two new tables in `packages/db/src/schema/investments.ts`, both compliant
with Feature 20's isolation rule (§20.11 — no FK/import into
expenses/incomes/goals/cards/debts/dashboard):

**`investment_snapshots`** — per-user, one row per BRT calendar day:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid not null, FK → `users.id` cascade | |
| `snapshot_date` | date not null | BRT calendar day (via `todayBrtString`, §1.3) — **not** server-local or UTC date, to stay consistent with the scheduler's own day boundary |
| `total_assets_cents` | bigint not null | copied verbatim from `getPatrimonySummary(userId).totalAssetsCents` |
| `by_asset_class` | jsonb not null | copied verbatim from `getPatrimonySummary(userId).byAssetClass` (`PatrimonyAssetClassBucket[]`) |
| `created_at` | timestamptz not null, default now | |

Unique index on `(user_id, snapshot_date)` — this is what makes "register
today" idempotent: both the daily job and the manual button upsert against
this pair, so calling it twice in one day updates the row instead of
duplicating it. No `updated_at`/`deleted_at` — this is an append-only
historical series, not an editable record.

**`benchmark_rates`** — global cache, not per-user (same shape as the
existing `investment_quote_cache`: no `id`, no `user_id`, composite PK):

| Column | Type | Notes |
|---|---|---|
| `benchmark` | enum (`ipca` \| `cdi`), part of PK | |
| `reference_month` | date, part of PK | 1st day of the month |
| `monthly_rate_pct` | numeric(10,4) not null | that month's own rate — see note below |
| `fetched_at` | timestamptz not null | |

One shared table for all users, refreshed weekly — avoids refetching the
same public series per user.

**Deliberate deviation from the roadmap's column sketch** (which names this
`accumulated_pct`, "acumulado no ano até o mês"): storing a
January-anchored year-to-date figure breaks the `period=12m` trailing
window whenever it spans a year boundary (e.g. Aug 2025–Jul 2026) — two
YTD figures anchored to different Januaries can't be combined into a
trailing accumulation; the "reset to 0 at January" throws away the
information needed. Storing each month's own independent rate instead, and
compounding over whichever window the caller actually asked for at read
time (§1.2), is correct for both `year` and `12m` and is simpler to
compute — the refresh job no longer needs to track a running product across
months, just convert one month's raw BCB value in isolation.

### 1.2 New module `investments/benchmarks`

```
apps/api/src/modules/investments/benchmarks/
  bcb-provider.ts        # fetches + parses raw BCB SGS series
  bcb-provider.test.ts
  benchmark.service.ts   # compounding math, refresh orchestration, comparison calc
  benchmark.service.test.ts
```

**`bcb-provider.ts`** — mirrors `pricing/brapi-quote-provider.ts`'s exact
shape: injectable `fetchFn`, `AbortSignal.timeout(8000)`, a typed error
class on any failure (network, non-200, bad shape).

```typescript
export interface BcbSeriesPoint {
  date: string;   // "YYYY-MM-DD", normalized from BCB's "DD/MM/AAAA" verbatim — NOT forced to day 1
  value: number;  // raw percentage from the API, un-compounded
}

export class BcbProviderError extends Error {}

export function createBcbProvider(fetchFn: typeof fetch = fetch) {
  return {
    async fetchSeries(seriesCode: number, lastN: number): Promise<BcbSeriesPoint[]> { ... },
  };
}
```

Series codes are constants owned by `benchmark.service.ts`, not hardcoded
in the provider (the provider is generic over any BCB SGS series code).
The provider stays domain-ignorant on purpose: IPCA (série 433) happens to
return one point already dated the 1st of each month, but CDI (série 4389)
returns **daily**-dated points (confirmed by the live check above) — the
provider passes every point through unchanged, and `benchmark.service.ts`
(§1.2, below) is what knows to reduce a series down to one point per
calendar month before storing into `benchmark_rates`, whose
`reference_month` is always day 1.

**`benchmark.service.ts`** — the compounding math and orchestration:

```typescript
export const IPCA_SERIES_CODE = 433;
export const CDI_SERIES_CODE = 4389;

export async function refreshBenchmarks(now: Date): Promise<void>;
export async function getBenchmarkComparison(
  userId: string,
  period: "year" | "12m",
): Promise<BenchmarkComparison>;
```

`refreshBenchmarks`: fetches ~14 months of both series (comfortably covers
a trailing-12-month window with margin for the weekly refresh lag). Points
are first grouped by their `YYYY-MM` prefix, keeping only the **latest**
point within each month (a no-op for IPCA, which already has one point per
month; for CDI's daily points, this picks the most recent — i.e. most
representative — rate observed in that month). Then, for each remaining
month independently — no cross-month state — that month's raw BCB value
becomes `monthly_rate_pct` (IPCA's `valor` is already a monthly %
variation, stored directly; CDI's `valor` is an annualized rate, converted
to a monthly-equivalent via `(1 + annualPct/100)^(1/12) - 1`), upserted as
one row per `(benchmark, reference_month)` — `reference_month` always
normalized to day 1 regardless of which day-of-month the source point
carried — into `benchmark_rates`. Each series is fetched and upserted
independently inside its own try/catch — one series failing does not block
the other (§1.5).

`getBenchmarkComparison`: reads the user's `investment_snapshots` for the
requested window plus the matching `benchmark_rates` rows, indexes the
user's patrimony to 100 at the period's first snapshot, and **compounds
the requested benchmark's `monthly_rate_pct` values across exactly that
window** (`year` → January of the current year through the latest cached
month; `12m` → trailing 12 months through the latest cached month) to
produce both the month-aligned `ipcaAccumulatedPct`/`cdiAccumulatedPct`
series and the two headline numbers the roadmap's chart spec calls for
(`portfolioReturnPct`, `cdiReturnPct` — §20.7 "Rentabilidade vs CDI").
Doing the compounding here, over the caller's actual window, rather than
pre-baking it into the stored rows, is what makes both period options
correct (see the deviation note in §1.1). Partial data (fewer months
available than requested) is returned as-is, not padded or errored (§1.5).

### 1.3 Shared `brt-date.ts` (extracted from `pricing/quote-scheduler.ts`)

```typescript
export function todayBrtString(now: Date): string;               // moved verbatim from quote-scheduler.ts
export function hasDailyTriggerPassed(now: Date, lastRunDate: string | null): boolean; // moved verbatim
export function hasWeeklyElapsed(now: Date, lastRunAt: Date | null, intervalDays?: number): boolean; // new
```

`quote-scheduler.ts` (20b) is modified to import these instead of defining
them locally — no behavior change, purely a move. `hasWeeklyElapsed` is a
plain elapsed-time check (`now - lastRunAt >= intervalDays * 86400000`,
default 7), not a calendar-boundary check like the daily gate — the weekly
benchmark refresh doesn't need BRT-precision, just "roughly once a week."

### 1.4 `patrimony.service.ts` extensions (existing file)

```typescript
export async function registerSnapshot(userId: string, now: Date): Promise<PatrimonySnapshot>;
export async function getPatrimonyHistory(userId: string, months: number): Promise<PatrimonyHistoryPoint[]>;
```

`registerSnapshot`: calls the existing `getPatrimonySummary(userId)`,
computes `snapshotDate = todayBrtString(now)`, upserts
`investment_snapshots` on the `(user_id, snapshot_date)` conflict target,
returns the mapped row. `getPatrimonyHistory`: date-range select ordered by
`snapshot_date` ascending, going back `months` calendar months from today.

### 1.5 New scheduler — `patrimony-scheduler.ts`

Same interval-timer shape as `pricing/quote-scheduler.ts`: one
`setInterval` (15 min tick, matching the existing scheduler's cadence so
both wake up together), started once at server boot in `server.ts`
alongside `startQuoteScheduler()`, stopped on the same `SIGTERM`/`SIGINT`
handler.

Each tick:
1. If `hasDailyTriggerPassed` (08:00 BRT, same trigger hour as quotes):
   load every user, call `registerSnapshot(user.id, now)` for each,
   `console.error` + continue on any single user's failure (one user's
   error must not skip the rest — different from `quote-scheduler.ts`,
   which today aborts the whole sweep on error; this round does not change
   `quote-scheduler.ts`'s existing behavior, only establishes per-user
   isolation in the new scheduler).
2. If `hasWeeklyElapsed`: call `refreshBenchmarks(now)`, `console.error` on
   failure (already isolated per-series inside `refreshBenchmarks` itself,
   §1.2).

Restart caveat: identical to 20b's accepted trade-off — in-memory
"last run" state resets on restart, harmless at this app's scale.

### 1.6 API changes

| Method | Route | Behavior |
|---|---|---|
| POST | `/v1/patrimony/snapshots` | **New.** Calls `registerSnapshot(userId, now)`. Returns `200` with the `PatrimonySnapshot`. Upsert-based — safe to call more than once a day (the frontend calls this both automatically on page load and explicitly via the "Registrar patrimônio hoje" button, §2). |
| GET | `/v1/patrimony/history?period=3\|6\|12\|24` | **New.** Calls `getPatrimonyHistory(userId, months)`. Returns `{ items: PatrimonyHistoryPoint[] }`. Invalid/missing `period` → 400. |
| GET | `/v1/patrimony/benchmarks?period=year\|12m` | **New.** Calls `getBenchmarkComparison(userId, period)`. Returns a `BenchmarkComparison` object (not list-wrapped — one computed object, same convention as `GET /v1/patrimony/summary`). Invalid/missing `period` → 400. |
| GET | `/v1/patrimony/summary` | **Unchanged.** Still the only endpoint `InvestmentsPage`'s initial load calls; snapshot/benchmark data loads separately per chart (§2). |

### 1.7 Business rules

- **Lazy fallback, not a GET side effect:** `GET /v1/patrimony/summary`
  stays a pure read. The "create today's snapshot if missing" fallback the
  roadmap describes is implemented by the **frontend** firing a
  fire-and-forget `POST /v1/patrimony/snapshots` on `InvestmentsPage`
  mount, not by adding a write side effect to an existing read endpoint
  (§2). Harmless to call redundantly on a day the scheduler already ran —
  it just refreshes today's point with a fresher number.
- **Concurrent snapshot writes** (daily job and the on-mount call landing
  close together): harmless by construction — both go through the same
  `ON CONFLICT (user_id, snapshot_date) DO UPDATE`, never a constraint
  error, worst case one redundant recompute.
- **BCB failures:** never thrown to a caller of `refreshBenchmarks` as a
  whole — each series' fetch+upsert is independently try/caught. A failed
  week leaves last week's cached rows in place (stale-but-present beats
  absent), matching `quote-refresh.service.ts`'s existing fallback
  philosophy from 20b.
- **Partial history/benchmark windows:** never padded, never errored —
  `getPatrimonyHistory`/`getBenchmarkComparison` return whatever rows exist
  for the requested window. Empty-state rendering is a frontend concern
  (§2).
- **Not investment advice:** every user-facing benchmark comparison is
  informational framing only (roadmap §20.7: "informativo, não
  aconselhamento") — no projections, no recommendations, just historical
  percentages.

### 1.8 `packages/types` additions

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
  patrimonyIndexed: number | null;   // null if no snapshot exists for this month
  ipcaAccumulatedPct: number | null; // null if not yet cached for this month
  cdiAccumulatedPct: number | null;
}

export interface BenchmarkComparison {
  series: BenchmarkComparisonPoint[];
  portfolioReturnPct: number | null; // null if fewer than 2 snapshots in period
  cdiReturnPct: number | null;
}
```

### 1.9 Errors

- `BadRequestError` — invalid/missing `period` query param on the two new
  GET endpoints.
- BCB provider failures **never** surface as HTTP errors — always absorbed
  into a skipped refresh with last-known-good data retained, per §1.7. Same
  deliberate deviation from typical upstream-failure handling that 20b's
  quote providers already established, called out again here for the same
  reason: a future reviewer might otherwise expect a 502/503.

---

## 2. Frontend (`apps/web`)

**New dependency:** `recharts`.

**New files**, grouped in their own subfolder (`investments/` already has
7+ components; this adds 4 related ones):

```
apps/web/src/components/features/investments/charts/
  allocation-donut-chart.tsx      # PieChart + innerRadius, from summary.byAssetClass (existing data, no new fetch)
  patrimony-evolution-chart.tsx   # LineChart, from GET /v1/patrimony/history
  benchmark-comparison-chart.tsx  # LineChart, from GET /v1/patrimony/benchmarks
  patrimony-period-selector.tsx   # generic {value,label}[] selector, reused by both line charts
```

**Theming:** `CartesianGrid` in zinc-800, axis ticks in zinc-500, primary
series in emerald-500, benchmark comparison lines in amber-400 (reusing the
accent already established for "attention" data —
`patrimony-summary-cards.tsx`'s stale-quote warning), custom `Tooltip
content` styled as a `.glass` card instead of recharts' default.

**Placement on `InvestmentsPage.tsx`:** below the existing
`PatrimonySummaryCards`. Donut and evolution chart side-by-side on desktop
(stacked on mobile), benchmark comparison full-width beneath. Each chart
fetches its own period-scoped data independently on mount and on
period-selector change — not part of the page's initial
`loadAll()` — so switching a period only refetches that one chart.

**On-mount snapshot fallback:** `InvestmentsPage` fires
`POST /v1/patrimony/snapshots` once on mount, fire-and-forget — no loading
state, no error toast, alongside its existing data load.

**Manual "Registrar patrimônio hoje" button:** near `PatrimonySummaryCards`
or the evolution chart. Unlike the silent on-mount call, this surfaces a
real success/error state (loading spinner while in flight, error toast on
failure), consistent with how other explicit user actions in this module
(e.g. refresh-quote) already report errors. On success, refetches the
evolution chart's current period so the new point appears immediately.

**Empty/sparse states:** evolution and benchmark charts render a "ainda não
há histórico suficiente" placeholder instead of a chart when fewer than 2
data points are available (new users, or right after this feature ships
with no backfilled history) — never a broken or misleadingly sparse chart.

**No new pages or routes.** Everything lives inside the existing
`/dashboard/investments` surface.

---

## 3. Testing plan

**Unit tests:**
- `brt-date.test.ts` — the 4 existing `hasDailyTriggerPassed` cases (moved
  from `quote-scheduler.test.ts`) plus `todayBrtString` and
  `hasWeeklyElapsed` coverage (not-yet-run, exactly-at-threshold,
  just-under-threshold).
- `bcb-provider.test.ts` — fixture responses shaped like the live payloads
  captured in this spec's header: success case, malformed shape, non-200,
  network error/timeout.
- `benchmark.service.test.ts` — the compounding math is the one place a
  subtle bug would silently show a wrong percentage on screen, so it gets
  dedicated cases against hand-computed reference values, split by
  function: `refreshBenchmarks`'s CDI annual-to-monthly conversion in
  isolation (one month, known input/output pair); `getBenchmarkComparison`'s
  window compounding — a single month (no compounding), multiple months
  compounding correctly within one calendar year, a `12m` window that spans
  a year boundary (the exact case the §1.1 deviation note exists for), and
  a month with no cached rate (partial data, §1.7).
- `patrimony.service.test.ts` (extended) — `registerSnapshot`'s upsert
  shape and `getPatrimonyHistory`'s date-range selection, using the same
  pure-function-with-injected-`now` pattern the existing
  `computePatrimonySummary` tests already use.

**Integration tests** (new `tests/integration/patrimony-analytics.integration.test.ts`,
following `patrimony.integration.test.ts`'s existing `describeWithDb` +
`useIntegrationDbLifecycle` + `registerUser` pattern): `POST
/v1/patrimony/snapshots` idempotency (calling twice same-day updates, not
duplicates — asserted via `GET /v1/patrimony/history` returning exactly one
point for that day); `GET /v1/patrimony/history` period filtering and
per-user isolation; `GET /v1/patrimony/benchmarks` with seeded
`benchmark_rates` rows (seeded directly via `getDb()` in the test, not via
a live BCB call — no live external calls anywhere in the automated suite,
matching 20b's existing convention) returning a correctly indexed series
and partial-data behavior when a requested month has no cached rate.

**No live BCB calls anywhere in the automated suite.**

---

## 4. Out of scope (deferred to Feature 20d)

- **Broader E2E coverage** beyond this round's own integration tests.
- **UI polish pass** beyond matching the existing dark theme.
- **A persisted job-state table for either scheduler** — same accepted
  restart caveat as 20b, not solved this round.
- **Configurable trigger hour / refresh cadence** — 08:00 BRT daily and
  weekly are hardcoded constants, not user- or env-configurable.
- **Any projection or advice framing** on the IPCA/CDI comparison — strictly
  historical, informational data only (§1.7).
