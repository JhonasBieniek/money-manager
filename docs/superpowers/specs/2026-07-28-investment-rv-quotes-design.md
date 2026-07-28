# Investment RV Quotes (Cotação Automática) — Design

**Goal:** Unblock variable-income (`renda variável`) investment holdings —
stocks/FIIs via Brapi, crypto via CoinGecko — with automatic price quotes, a
shared cache, on-demand + scheduled refresh, and a manual-override escape
hatch for when a quote is wrong or unavailable.

**Scope of this round:** roadmap Feature 20 phase **20b only** ("Cotação
RV"). Full feature context and rationale for every table/enum/route below
lives in `planning/ROADMAP.md` §"Feature 20 — Investimentos e patrimônio",
specifically §20.4 (modelo de domínio), §20.8 (estratégias de cotação), and
§20.9 (API) — that file is untracked/gitignored (planning doc for a separate,
larger multi-repo effort), so this spec restates everything needed to
implement this round without depending on it.

**Builds on:** Feature 20a + 20.5 (merged to `master`), which already shipped
fixed-income holdings, patrimony summary, and piggy banks. Confirmed by
reading the current schema and service code before writing this spec:
`investment_holdings` already has every RV-related column
(`asset_class`, `pricing_source`, `manual_override`, `last_valuation_at`,
`last_quote_error`) — 20a added them for exactly this round, unused until
now. `investment-holdings.service.ts` currently hard-rejects
`incomeType: "variable_income"` with `BadRequestError("Renda variável ainda
não suportada")` — this round removes that guard.

**Explicitly out of scope, deferred to future rounds (see §4):**
`investment_snapshots`, evolution/allocation/IPCA-CDI charts, and deeper
E2E coverage — all roadmap phases **20c** (Analytics) and **20d**
(Qualidade), which depend on this phase but are not part of it.

**Credential sequencing (explicit decision):** this round is built and fully
tested against **fixture/mocked provider responses** — no live Brapi/
CoinGecko calls are made in tests, and neither `BRAPI_TOKEN` nor
`COINGECKO_API_KEY` needs to exist yet for the app to build, typecheck, or
pass its test suite. A provider whose key is absent at runtime returns a
clear "not configured" `last_quote_error` instead of crashing. Real end-to-
end verification against live APIs happens whenever the user adds real keys
to `apps/api/.env` — not a gate on this round.

**Architecture:** One new subdirectory inside the existing `investments`
module, following the same isolation rule as 20a (no FK or import into
`expenses`, `debts`, `goals`, etc.):

```
apps/api/src/modules/investments/pricing/
  brapi-quote-provider.ts       # B3 stocks/FIIs
  coingecko-quote-provider.ts   # crypto
  quote-router.ts               # picks provider by asset_class
  quote-cache.repository.ts     # reads/writes investment_quote_cache
  quote-refresh.service.ts      # orchestrates refresh, TTL, throttle, fallback
  quote-scheduler.ts            # in-process daily-tick + interval
```

`investment-holdings.service.ts` and `patrimony.service.ts` (both existing,
from 20a) are extended, not replaced.

**Tech stack:** Same as the rest of the app — Express + Drizzle + Zod on the
API, React + `apiFetch` on the web, native `fetch` for outbound HTTP calls to
Brapi/CoinGecko. **No new npm dependencies** — the scheduler is a plain
`setInterval`, not a cron library (see §1.5 for why).

---

## 1. Backend

### 1.1 Data model (`packages/db`)

**No migration on `investment_holdings`** — every column 20b needs already
exists (added in 20a, unused). Verified directly in
`packages/db/src/schema/investments.ts` before writing this spec.

**One new table**, exactly per roadmap §20.4:

**`investment_quote_cache`**

| Column | Type | Notes |
|---|---|---|
| `symbol` | text, part of PK | normalized (uppercase, no `.SA` suffix for B3; CoinGecko id for crypto, e.g. `bitcoin`) |
| `asset_class` | asset_class, part of PK | routing key — same symbol string could theoretically collide across classes |
| `unit_value_cents` | bigint not null | latest quote in BRL cents |
| `pricing_source` | pricing_source not null | `brapi` \| `coingecko` |
| `quoted_at` | timestamptz not null | when the provider returned this value |
| `expires_at` | timestamptz not null | `quoted_at` + TTL (15 min market hours / 1 h off-hours) |
| `raw_response` | jsonb nullable | full provider payload, for debugging |

Keyed by `(symbol, asset_class)` so every user holding the same ticker shares
one cache row — one external call serves all of them. No `user_id` column;
this table is not per-user data.

### 1.2 Module `investments/pricing` — internals

**`BrapiQuoteProvider` / `CoinGeckoQuoteProvider`** — each exposes one method,
`fetchQuote(symbol: string): Promise<{ unitValueCents: number; raw: unknown }>`,
throwing a typed `QuoteProviderError` on any failure (network, non-200, bad
shape, missing API key). Symbol normalization (ticker case, `.SA` stripping,
`BTC`→`bitcoin` mapping) happens inside each provider, not in the router.

**`QuoteRouter`** — `getProviderFor(assetClass: AssetClass): QuoteProvider`.
`stocks`/`fii`/`fund` → Brapi; `crypto` → CoinGecko; anything else
(`real_estate`, `cash`, `other` when used as RV, which the roadmap allows for
explicit RV classification) has no automatic provider — treated as
always-manual, same as RF.

**`QuoteCacheRepository`** — `get(symbol, assetClass)`, `upsert(...)`. Plain
Drizzle queries against `investment_quote_cache`.

**`QuoteRefreshService`** — the orchestrator. `refreshHolding(holdingId,
userId)`:
1. Load the holding; if `manual_override` is `true`, no-op (return as-is).
2. Check cache for `(symbol, asset_class)`. If fresh (`expires_at` in the
   future) **and** this is the scheduled/background path, reuse it —
   no provider call, no rate-limit concern.
3. If this is the **on-demand** path (`refresh-quote` endpoint): if
   `quoted_at` was less than 60s ago, return the cached value unchanged
   (throttle — §20.8's "ignora TTL se > 1 min desde último hit").
4. Otherwise call the provider via `QuoteRouter`. On success: upsert the
   cache row, update the holding's `current_unit_value_cents`,
   `pricing_source`, `last_valuation_at`; clear `last_quote_error`.
5. On provider failure: leave `current_unit_value_cents` and the cache row
   untouched (last good value stands), set the holding's `last_quote_error`
   to a short human-readable message, do **not** throw — the caller always
   gets back a valid holding.

`refreshAllForUser(userId)` — loads every non-overridden RV holding for the
user and calls step 4/5 per distinct `(symbol, asset_class)` (dedup within
the batch so a user holding the same ticker in two accounts triggers one
provider call, not two).

**`QuoteScheduler`** — started once at server boot (`apps/api/src/server.ts`),
stopped on shutdown. A single `setInterval` (every 15 min) does two things
each tick:
1. If BRT wall-clock has crossed 08:00 since the last recorded daily run
   (in-memory timestamp, no persisted state), call `refreshAllForUser` for
   every user with at least one non-overridden RV holding, then record the
   run.
2. Nothing else — the "refresh if stale on page load" behavior lives in the
   frontend (§2), calling the existing on-demand endpoints, not the
   scheduler.

Restart caveat (accepted, matches the "in-process interval" choice): the
in-memory "last daily run" timestamp resets on server restart, so a restart
around 08:00 BRT could cause one extra or one skipped run. Harmless at this
app's scale (single user, idempotent refresh) — explicitly not solved with a
persisted job-state table this round.

### 1.3 Module `investments` — API changes

| Method | Route | Change |
|---|---|---|
| POST | `/v1/investment-holdings` | Now accepts `incomeType: "variable_income"` with `assetClass` + `quantity` required, `currentUnitValueCents` **optional** (omit → holding starts with `lastQuoteError: "Cotação pendente"`, populated by the next refresh) |
| PATCH | `/v1/investment-holdings/:id` | Unchanged shape; `assetClass`/`quantity` remain immutable after creation (same pattern as RF's immutable fields — full replace via delete+recreate if the user picked the wrong asset class) |
| GET (list/single) | `/v1/investment-holdings` | Response now includes `assetClass`, `pricingSource`, `manualOverride`, `lastQuoteError`, `quantity`, `averageCostCents` for every holding (`null`/default for RF rows) |
| PATCH | `/v1/investment-holdings/:id/quote-mode` | **New.** Body `{ manualOverride: boolean }`. Setting `true` freezes the current value (behaves like RF from then on, editable via the existing `.../valuation` endpoint). Setting `false` re-arms auto-refresh on the next cycle. RF-only holdings reject this with 400. |
| POST | `/v1/investment-holdings/:id/refresh-quote` | **New.** On-demand refresh for one holding, throttled per §1.2 step 3. Always returns `200` with the holding (fresh or stale + `lastQuoteError`), never `502`. |
| POST | `/v1/investments/refresh-quotes` | **New.** Refreshes all of the caller's non-overridden RV holdings; same never-throws contract. |
| GET | `/v1/patrimony/summary` | `quotesStale` becomes a real computed boolean (`true` if any RV holding's cache entry is expired); `byAssetClass` now segments RV holdings by their real `asset_class` (RF stays bucketed as `fixed_income_group`, unchanged from 20a) |

### 1.4 Deferred endpoints (not built this round)

Per roadmap §20.9, these stay unbuilt — they belong to 20c:
`GET /v1/patrimony/history`, `GET /v1/patrimony/benchmarks`,
`POST /v1/patrimony/snapshots`, and `GET /v1/investments/summary` (the
allocation-percentage endpoint feeding `AllocationDonutChart`, which isn't
built this round either).

### 1.5 Business rules

- **RV creation:** `assetClass` and `quantity` required; `currentUnitValueCents`
  optional (lazy quote, per the approved design discussion — decouples
  holding creation from provider uptime).
- **Manual override:** `manual_override = true` suspends both scheduled and
  on-demand auto-refresh for that holding; the user updates its value via
  the existing `PATCH .../valuation` endpoint, identical to RF. Turning
  override back off does not immediately fetch — the next scheduler tick or
  manual refresh click picks it up.
- **Fallback on provider failure:** always keep the last good cached value;
  stamp `last_quote_error`; never block the user (no endpoint in this round
  returns an error status purely because a third-party provider is down).
- **Stale-quote UI hint simplification (explicit, approved trim):** the
  roadmap mentions surfacing a suggestion after "3 consecutive failures in
  24h." This round approximates that with `lastQuoteError !== null &&
  lastValuationAt > 24h ago` instead of an exact consecutive-failure
  counter — same user-facing outcome, no new state to track.
- **Symbol normalization:** B3 tickers uppercased, `.SA` suffix stripped on
  persist (added back only in the outbound Brapi call if the provider needs
  it); crypto symbols resolved to CoinGecko ids in the provider, not stored
  pre-resolved.
- **No scheduler dependency:** `setInterval` + in-memory timestamp, not
  `node-cron` — approved trade-off, see §1.2.

### 1.6 `packages/types`

`InvestmentHolding` gains `assetClass: AssetClass | null`, `pricingSource:
PricingSource`, `manualOverride: boolean`, `lastQuoteError: string | null`,
`quantity: string`, `averageCostCents: number | null`. `CreateInvestmentHoldingBody`
gains the same fields as optional (required-when-RV is enforced in the Zod
schema/service, not the type). `PatrimonySummary.quotesStale` changes from
the literal `false` to `boolean`; `PatrimonyAssetClassBucket.class` widens
from the literal `"fixed_income_group"` to `AssetClass | "fixed_income_group"`.

New shared types: `AssetClass`, `PricingSource` (string unions mirroring the
DB enums, same pattern as `IncomeType` today).

### 1.7 Errors

- `BadRequestError` — RV create missing `assetClass`/`quantity`; `quote-mode`
  PATCH on an RF holding; malformed symbol.
- `NotFoundError` — unchanged patterns from 20a (holding/account not found
  or not owned by caller).
- Provider failures **never** surface as HTTP errors to the client — always
  absorbed into `last_quote_error` per §1.5. This is a deliberate deviation
  from typical upstream-failure handling, called out explicitly because a
  future reviewer might otherwise expect a 502/503 here.

---

## 2. Frontend (`apps/web`)

**Holding form** (`holding-form-modal.tsx`, extended): when `incomeType =
variable_income` is selected, show `assetClass` (select), `quantity`
(numeric), `averageCostCents` (optional, "preço médio") fields; hide the
manual current-value field entirely (it's populated by quotes, not typed by
the user). RF path is visually and behaviorally unchanged.

**Holdings list/card**: RV rows show the current quote, a "Cotação
desatualizada" badge when `quotesStale`-equivalent is true for that holding,
`lastValuationAt` (relative time), a refresh icon-button (spinner while its
request is in flight, calls `refresh-quote`), the manual-override toggle,
and — when `averageCostCents` is set — unrealized P/L
(`(current - average) × quantity`, informational only, no tax/IR framing).
A holding with `lastQuoteError` set shows the error inline plus the
manual-entry suggestion once `lastValuationAt` is 24h+ stale (§1.5).

**Patrimony summary page**: existing `byAssetClass` breakdown (from 20a,
today a simple list, not a chart) now renders real segments instead of only
ever showing "Renda fixa". No new chart components — `AllocationDonutChart`
and friends are 20c.

**No new pages or routes.** Everything lives inside the existing
`/dashboard/investments` surface from 20a.

---

## 3. Testing plan

**Unit tests** (`pricing/*.test.ts`): each provider tested against fixture
HTTP responses shaped like real Brapi/CoinGecko payloads (copied from each
provider's public API docs) — success case, malformed response, non-200,
network error, missing-API-key case. `QuoteRouter` routing table.
`QuoteRefreshService`'s branching: fresh-cache-reuse, throttle-window,
override-skip, fallback-on-failure, cache-shared-across-users.

**Integration tests** (`tests/integration/investment-holdings.integration.test.ts`,
extended): RV holding creation without `currentUnitValueCents` (lazy path),
validation errors for missing `assetClass`/`quantity`, `quote-mode` toggle
(including the RF-rejects-this case), `refresh-quote` throttling behavior,
`refresh-quotes` batch endpoint. Provider calls mocked at the HTTP-client
boundary (no live network access in CI, consistent with the rest of this
suite).

**Integration test** (`patrimony.integration.test.ts` or extended
existing): summary reflects real `byAssetClass` segments and a real
`quotesStale` boolean once RV holdings with stale/fresh cache entries exist.

**No live Brapi/CoinGecko calls anywhere in the automated suite** — per the
credential-sequencing decision at the top of this doc. Manual verification
against live providers happens post-merge, whenever real keys are added to
`.env`; it is not a merge gate for this round.

---

## 4. Out of scope (deferred to future rounds)

- **`investment_snapshots` table, evolution chart, allocation donut chart,
  IPCA/CDI benchmark comparison** — roadmap phase **20c**, depends on this
  round's quote data but is not part of it.
- **Deeper E2E coverage, UI polish** — roadmap phase **20d**.
- **A persisted job-state table for the scheduler** — accepted restart
  caveat, see §1.2.
- **An exact 3-consecutive-failures counter** — approximated instead, see
  §1.5.
- **Provider coverage beyond Brapi + CoinGecko** (Yahoo Finance, Alpha
  Vantage) — roadmap explicitly recommends against using either as primary;
  revisit only if Brapi/CoinGecko free tiers prove insufficient.
