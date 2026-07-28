# Investment RV Quotes (Cotação Automática) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock variable-income (`renda variável`) investment holdings — stocks/FIIs via Brapi, crypto via CoinGecko — with automatic price quotes, a shared cache, on-demand + scheduled refresh, and a manual-override escape hatch.

**Architecture:** A new `apps/api/src/modules/investments/pricing/` subdirectory (providers → router/cache → refresh orchestration → scheduler), consumed by extending the existing `investment-holdings` module (removing its hard RV rejection) and `patrimony.service.ts` (real `quotesStale` + `byAssetClass` segmentation + a quantity-multiplication money fix). One new table, `investment_quote_cache`. No migration on `investment_holdings` — every RV-related column already exists from the 20a migration, unused until now.

**Tech Stack:** Express + Drizzle + Zod (API), React + `apiFetch` (web), native `fetch` for outbound HTTP (Node 18+ global — no HTTP client dependency). Jest (unit + integration). No new npm dependencies.

**Source spec:** `docs/superpowers/specs/2026-07-28-investment-rv-quotes-design.md` — restate nothing from it beyond what's copied verbatim below; read it if a task references a section number (e.g. "§1.5") for rationale.

## Global Constraints

- Money is always integer cents (`bigint` DB columns, `number` in TS/JSON). Dates are always `"YYYY-MM-DD"` strings over the wire. `quantity` is always a numeric **string** end-to-end (DB `numeric` column default mode, API JSON field, and request body accepts a `number` that the service converts to a string before insert) — this avoids float precision loss on 8-decimal-place crypto quantities.
- **Money bug fix, load-bearing for this whole plan:** every place that currently sums `holding.currentUnitValueCents` directly (patrimony totals, byAccount, byAssetClass, per-account totals in the frontend) is wrong the moment a holding's `quantity` isn't `1` — `current_unit_value_cents` is a **per-unit** price for RV, not the position's total value. Every such sum must use `quantity × currentUnitValueCents`, rounded to the nearest cent. This was invisible in 20a because RF holdings always default `quantity` to `"1"`. Task 9 fixes the backend; Task 12 fixes the two frontend spots.
- `investment_quote_cache` has **no soft delete and no `id`/`user_id` columns** — it's a shared, non-user-owned cache keyed by composite primary key `(symbol, asset_class)`; rows are upserted (`onConflictDoUpdate`), never soft-deleted. This is a deliberate exception to this codebase's usual soft-delete convention (see 20a plan's Global Constraints) — cache rows aren't user data, and sharing one row across every user holding the same ticker is the entire point (§20.8: "Mesmo símbolo na carteira de N usuários → 1 chamada externa").
- Errors use the existing `AppError` subclasses (`NotFoundError` 404, `BadRequestError` 400) — no new HTTP-facing error classes. The one new error type, `QuoteProviderError` (`pricing/types.ts`), is **internal-only** and never crosses an HTTP boundary: every provider/refresh failure is absorbed into the holding's `last_quote_error` column and a normal `200` response, per spec §1.5's fallback rule ("usuário não fica bloqueado"). A future reviewer expecting a `502`/`503` on provider failure would be wrong for this feature — it's a deliberate design choice, not an oversight.
- Every route is mounted behind the existing `authenticate` middleware and reads the caller's id via `getUserId(req)`, exactly as 20a's routes already do. Every query/mutation filters by `userId`; cross-user access 404s or 400s (matching existing patterns in this module), never 403.
- Outbound HTTP always goes through an injectable `fetchFn` parameter that **defaults to the global `fetch`** (e.g. `function createXProvider(fetchFn: typeof fetch = fetch)`). This is the only seam needed for unit tests to substitute a mock — no HTTP-mocking library (msw/nock) exists in this repo's dependencies, and this plan doesn't add one.
- `BRAPI_TOKEN` and `COINGECKO_API_KEY` are read via `process.env` **inline**, inside the two provider files — matching this codebase's existing convention for feature-scoped env vars (see `apps/api/src/shared/cors.ts`, `csrf.ts`, `session.ts`, all of which read `process.env.X` directly). This is different from `apps/api/src/config/secrets.ts`'s `requireEnv` pattern, which is reserved for boot-blocking secrets (JWT keys) that crash the server if absent — Brapi/CoinGecko keys must **never** crash the server; a missing key is a normal, recoverable per-holding error state.
- **Brapi hard-requires `BRAPI_TOKEN`** (throws `QuoteProviderError` immediately if absent, per spec's provider table: "Sim (token free)" — no anonymous tier). **CoinGecko's key is optional** — its public tier works without one, per spec's provider table listing CoinGecko's free tier as usable without hard-requiring a key; when `COINGECKO_API_KEY` is set, it's added as a query param, otherwise the request is sent without it.
- **No live network calls in any automated test.** Unit tests inject a mock `fetchFn`. Integration tests use `jest.spyOn(globalThis, "fetch")`. Neither `BRAPI_TOKEN` nor `COINGECKO_API_KEY` needs to exist in any `.env` for `pnpm build`, `pnpm typecheck`, or the full test suite to pass — this is a hard requirement carried over from the spec's explicit credential-sequencing decision, not optional.
- **Resolved spec ambiguity — non-routable RV asset classes:** the spec allows `real_estate`/`cash`/`other` as explicit RV `asset_class` values even though no provider exists for them (§1.5 "power-user" case: user explicitly classifies an asset as RV without automatic pricing). Such holdings get `pricing_source: "manual"` at creation (same as RF) and are **never** counted in `quotesStale` or attempted by the refresh scheduler — `patrimony.service.ts`'s staleness check keys off the holding's own stored `pricing_source` column, not a re-derived routability check, so this falls out naturally without special-casing in every consumer.
- **Resolved spec ambiguity — percentage precision in `byAssetClass`:** rounded to one decimal place (`Math.round((totalCents / investmentsCents) * 1000) / 10`). No existing convention in this codebase covers "percentage of a multi-bucket whole"; this is a new, explicit choice for this plan, not a guess.
- **Resolved spec ambiguity — pending vs. stale quote display:** the approved spec's "24h" simplification (§1.5) was written for a holding that *was* quoting successfully and started failing — it under-specifies the very first quote (`lastQuoteError: "Cotação pendente"`, set at creation, `lastValuationAt` only seconds old). Applying the literal 24h gate to that case would hide the "pending" state from a user who just created the holding. Task 12 distinguishes the two: the `"Cotação pendente"` sentinel (a string this plan controls end-to-end — set in Task 4, checked in Task 12) always displays immediately; any other `last_quote_error` (an actual provider failure) stays gated behind the 24h threshold, matching the approved spec exactly.
- Run `pnpm build` once before starting any task in a fresh worktree (builds `@money-manager/db`, `@money-manager/types`, and other workspace deps other packages import from).

## Task Dependency Summary

```
Task 1 (DB: investment_quote_cache table) ─┐
Task 2 (types: RV fields, AssetClass/PricingSource, quotesStale→boolean) ─┴─→ Task 3 (pricing providers: Brapi + CoinGecko, unit tested)
Task 3 done ─┬─→ Task 4 (unblock RV in investment-holdings module)
             └─→ Task 5 (quote-cache repository + quote-router, needs Task 1 too)
Task 4 + Task 5 done ─→ Task 6 (quote-refresh orchestration service, unit tested)
Task 6 done ─→ Task 7 (in-process scheduler + server.ts wiring)
Task 4 + Task 6 done ─→ Task 8 (new endpoints: quote-mode, refresh-quote, refresh-quotes + app.ts mount)
Task 1 + Task 2 done ─→ Task 9 (patrimony: real quotesStale, real byAssetClass, quantity-multiplication fix)
Task 8 + Task 9 done ─→ Task 10 (integration tests: RV CRUD, quote-mode, refresh throttle, patrimony)
Task 8 done ─→ Task 11 (frontend: RV creation form)
Task 8 + Task 9 done ─→ Task 12 (frontend: quote display/refresh/override, byAssetClass + quantity-fix rendering)
Task 11 + Task 12 done ─→ Task 13 (browser verification)
```

Tasks 1 and 2 touch fully disjoint files — safe to run in parallel. This plan is more of a pipeline than 20a's mostly-independent CRUD modules was: providers (3) gate almost everything else, since both the RV-unblock path (4) and the router/cache (5) need `pricingSourceForAssetClass` / the provider interface from `pricing/types.ts`. Task 9 (patrimony) only needs Tasks 1+2, so it can run any time after those — it's placed after Task 8 here purely for narrative flow (endpoints before the summary that reports on them), not because of a real dependency; an implementer could do it right after Task 2 if picking up out of order for some reason (not recommended — subagent-driven-development executes tasks strictly in order).

---

### Task 1: Database schema — `investment_quote_cache` table

**Files:**
- Modify: `packages/db/src/schema/investments.ts`
- Generated: `packages/db/migrations/*.sql` (via `drizzle-kit generate`, do not hand-write)

**Interfaces:**
- Consumes: `assetClassEnum`, `pricingSourceEnum` (already defined in this file from 20a).
- Produces: Drizzle table `investmentQuoteCache` and its `$inferSelect`/`$inferInsert` row types, re-exported from `@money-manager/db` (the barrel `packages/db/src/schema/index.ts` already has `export * from "./investments.js"`, so no barrel change needed). Task 5, Task 9 import this by name.

- [ ] **Step 1: Add the table to `packages/db/src/schema/investments.ts`**

Add `jsonb` and `primaryKey` to the existing `drizzle-orm/pg-core` import at the top of the file, then append this table definition at the end of the file:

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
  uuid,
} from "drizzle-orm/pg-core";
```

```typescript
export const investmentQuoteCache = pgTable(
  "investment_quote_cache",
  {
    symbol: text("symbol").notNull(),
    assetClass: assetClassEnum("asset_class").notNull(),
    unitValueCents: bigint("unit_value_cents", { mode: "number" }).notNull(),
    pricingSource: pricingSourceEnum("pricing_source").notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rawResponse: jsonb("raw_response"),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.assetClass] })],
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @money-manager/db db:generate`
Expected: a new `packages/db/migrations/00XX_*.sql` file containing `CREATE TABLE "investment_quote_cache" (...)` with a composite primary key on `(symbol, asset_class)`, plus an updated `packages/db/migrations/meta/00XX_snapshot.json` and `_journal.json` entry. No changes to any other table.

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @money-manager/db build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/investments.ts packages/db/migrations
git commit -m "feat(db): add investment_quote_cache table"
```

---

### Task 2: `packages/types` — RV fields, AssetClass/PricingSource, quotesStale as boolean

**Files:**
- Modify: `packages/types/src/api/investments.ts`

**Interfaces:**
- Produces: `AssetClass`, `ASSET_CLASSES`, `ASSET_CLASS_LABELS`, `PricingSource` — consumed by Task 3 (providers), Task 4 (holdings service), Task 9 (patrimony), Task 11/12 (frontend). Extended `InvestmentHolding`, `CreateInvestmentHoldingBody`, `PatrimonySummary`, `PatrimonyAssetClassBucket` — consumed by every later task that touches the API contract.

- [ ] **Step 1: Add asset class and pricing source types**

Insert after the existing `IncomeType` line (`export type IncomeType = "fixed_income" | "variable_income";`) in `packages/types/src/api/investments.ts`:

```typescript
export const ASSET_CLASSES = [
  "stocks",
  "fii",
  "fixed_income",
  "crypto",
  "fund",
  "real_estate",
  "cash",
  "other",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stocks: "Ações",
  fii: "FIIs",
  fixed_income: "Renda fixa",
  crypto: "Cripto",
  fund: "Fundos",
  real_estate: "Imóveis",
  cash: "Caixa",
  other: "Outro",
};

export type PricingSource =
  | "manual"
  | "brapi"
  | "coingecko"
  | "yahoo"
  | "alpha_vantage";
```

- [ ] **Step 2: Extend `InvestmentHolding` and `CreateInvestmentHoldingBody`**

Replace the existing `InvestmentHolding` interface:

```typescript
export interface InvestmentHolding {
  id: string;
  accountId: string;
  userId: string;
  symbol: string;
  incomeType: IncomeType;
  assetClass: AssetClass | null;
  quantity: string;
  averageCostCents: number | null;
  currentUnitValueCents: number;
  maturityDate: string | null;
  pricingSource: PricingSource;
  manualOverride: boolean;
  lastQuoteError: string | null;
  notes: string | null;
  lastValuationAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

Replace the existing `CreateInvestmentHoldingBody` interface:

```typescript
export interface CreateInvestmentHoldingBody {
  accountId: string;
  symbol: string;
  incomeType?: IncomeType;
  currentUnitValueCents?: number;
  assetClass?: AssetClass;
  quantity?: number;
  averageCostCents?: number | null;
  maturityDate?: string | null;
  notes?: string | null;
}
```

Add a new interface directly after `UpdateHoldingValuationBody`:

```typescript
export interface UpdateHoldingQuoteModeBody {
  manualOverride: boolean;
}
```

- [ ] **Step 3: Widen `PatrimonyAssetClassBucket` and `PatrimonySummary.quotesStale`**

Replace the existing `PatrimonyAssetClassBucket` interface:

```typescript
export interface PatrimonyAssetClassBucket {
  class: AssetClass | "fixed_income_group";
  label: string;
  totalCents: number;
  percentage: number;
}
```

In `PatrimonySummary`, change `quotesStale: false;` to `quotesStale: boolean;`.

- [ ] **Step 4: Build and verify**

Run: `pnpm --filter @money-manager/types build`
Expected: no TypeScript errors. This will surface type errors in `apps/api`/`apps/web` if anything downstream isn't updated yet — that's expected until later tasks land; do not fix downstream errors in this task.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/api/investments.ts
git commit -m "feat(types): add RV fields to investment holding and patrimony types"
```

---

### Task 3: Pricing providers — Brapi and CoinGecko (unit tested with fixtures)

**Files:**
- Create: `apps/api/src/modules/investments/pricing/types.ts`
- Create: `apps/api/src/modules/investments/pricing/brapi-quote-provider.ts`
- Create: `apps/api/src/modules/investments/pricing/brapi-quote-provider.test.ts`
- Create: `apps/api/src/modules/investments/pricing/coingecko-quote-provider.ts`
- Create: `apps/api/src/modules/investments/pricing/coingecko-quote-provider.test.ts`

**Interfaces:**
- Consumes: `AssetClass`, `PricingSource` from `@money-manager/types` (Task 2).
- Produces: `QuoteResult`, `QuoteProviderError`, `QuoteProvider`, `pricingSourceForAssetClass(assetClass): PricingSource` (all from `types.ts`) and `createBrapiQuoteProvider(fetchFn?)`, `createCoinGeckoQuoteProvider(fetchFn?)`, `normalizeB3Symbol(symbol): string`, `normalizeCryptoSymbol(symbol): string`. Task 4 imports `pricingSourceForAssetClass`. Task 5 imports the two `create*QuoteProvider` factories.

- [ ] **Step 1: Create `pricing/types.ts`**

```typescript
import type { AssetClass, PricingSource } from "@money-manager/types";

export interface QuoteResult {
  unitValueCents: number;
  raw: unknown;
}

export class QuoteProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteProviderError";
  }
}

export interface QuoteProvider {
  fetchQuote(symbol: string): Promise<QuoteResult>;
}

const ROUTABLE_ASSET_CLASSES: Partial<Record<AssetClass, PricingSource>> = {
  stocks: "brapi",
  fii: "brapi",
  fund: "brapi",
  crypto: "coingecko",
};

export function pricingSourceForAssetClass(
  assetClass: AssetClass,
): PricingSource {
  return ROUTABLE_ASSET_CLASSES[assetClass] ?? "manual";
}
```

- [ ] **Step 2: Create `pricing/brapi-quote-provider.ts`**

```typescript
import { QuoteProviderError } from "./types.js";
import type { QuoteProvider, QuoteResult } from "./types.js";

const BRAPI_BASE_URL = "https://brapi.dev/api/quote";

interface BrapiQuoteResponse {
  results?: { symbol: string; regularMarketPrice: number | null }[];
}

export function normalizeB3Symbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.SA$/, "");
}

export function createBrapiQuoteProvider(
  fetchFn: typeof fetch = fetch,
): QuoteProvider {
  return {
    async fetchQuote(symbol: string): Promise<QuoteResult> {
      const token = process.env.BRAPI_TOKEN;
      if (!token) {
        throw new QuoteProviderError(
          "Brapi não configurado (BRAPI_TOKEN ausente)",
        );
      }

      const normalized = normalizeB3Symbol(symbol);
      const url = `${BRAPI_BASE_URL}/${encodeURIComponent(normalized)}?token=${encodeURIComponent(token)}`;

      let response: Response;
      try {
        response = await fetchFn(url);
      } catch {
        throw new QuoteProviderError(
          `Falha ao consultar Brapi para ${normalized}`,
        );
      }

      if (!response.ok) {
        throw new QuoteProviderError(
          `Brapi retornou status ${response.status} para ${normalized}`,
        );
      }

      const data = (await response.json()) as BrapiQuoteResponse;
      const price = data.results?.[0]?.regularMarketPrice;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new QuoteProviderError(
          `Brapi não retornou preço válido para ${normalized}`,
        );
      }

      return { unitValueCents: Math.round(price * 100), raw: data };
    },
  };
}
```

- [ ] **Step 3: Create `pricing/brapi-quote-provider.test.ts`**

```typescript
import { describe, expect, it, jest, afterEach } from "@jest/globals";
import {
  createBrapiQuoteProvider,
  normalizeB3Symbol,
} from "./brapi-quote-provider.js";
import { QuoteProviderError } from "./types.js";

describe("normalizeB3Symbol", () => {
  it("uppercases e remove sufixo .SA", () => {
    expect(normalizeB3Symbol("petr4.sa")).toBe("PETR4");
    expect(normalizeB3Symbol(" HGLG11 ")).toBe("HGLG11");
  });
});

describe("createBrapiQuoteProvider", () => {
  const originalToken = process.env.BRAPI_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.BRAPI_TOKEN;
    } else {
      process.env.BRAPI_TOKEN = originalToken;
    }
  });

  it("lança QuoteProviderError quando BRAPI_TOKEN não está configurado", async () => {
    delete process.env.BRAPI_TOKEN;
    const fetchFn = jest.fn();
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchQuote("PETR4")).rejects.toThrow(
      QuoteProviderError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("retorna a cotação em centavos a partir de regularMarketPrice", async () => {
    process.env.BRAPI_TOKEN = "test-token";
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 38.42 }],
      }),
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchQuote("petr4.sa");

    expect(result.unitValueCents).toBe(3842);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("https://brapi.dev/api/quote/PETR4"),
    );
  });

  it("lança QuoteProviderError quando a API retorna status de erro", async () => {
    process.env.BRAPI_TOKEN = "test-token";
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchQuote("INVALIDO")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando a resposta não tem preço válido", async () => {
    process.env.BRAPI_TOKEN = "test-token";
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchQuote("PETR4")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando fetchFn rejeita (erro de rede)", async () => {
    process.env.BRAPI_TOKEN = "test-token";
    const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchQuote("PETR4")).rejects.toThrow(
      QuoteProviderError,
    );
  });
});
```

- [ ] **Step 4: Run Brapi provider tests**

Run: `pnpm --filter @money-manager/api test -- brapi-quote-provider`
Expected: 6 tests pass.

- [ ] **Step 5: Create `pricing/coingecko-quote-provider.ts`**

```typescript
import { QuoteProviderError } from "./types.js";
import type { QuoteProvider, QuoteResult } from "./types.js";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3/simple/price";

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  SOL: "solana",
  BNB: "binancecoin",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
};

interface CoinGeckoResponse {
  [id: string]: { brl?: number } | undefined;
}

export function normalizeCryptoSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  const upper = trimmed.toUpperCase();
  return SYMBOL_TO_COINGECKO_ID[upper] ?? trimmed.toLowerCase();
}

export function createCoinGeckoQuoteProvider(
  fetchFn: typeof fetch = fetch,
): QuoteProvider {
  return {
    async fetchQuote(symbol: string): Promise<QuoteResult> {
      const id = normalizeCryptoSymbol(symbol);
      const url = new URL(COINGECKO_BASE_URL);
      url.searchParams.set("ids", id);
      url.searchParams.set("vs_currencies", "brl");
      const apiKey = process.env.COINGECKO_API_KEY;
      if (apiKey) {
        url.searchParams.set("x_cg_demo_api_key", apiKey);
      }

      let response: Response;
      try {
        response = await fetchFn(url.toString());
      } catch {
        throw new QuoteProviderError(`Falha ao consultar CoinGecko para ${id}`);
      }

      if (!response.ok) {
        throw new QuoteProviderError(
          `CoinGecko retornou status ${response.status} para ${id}`,
        );
      }

      const data = (await response.json()) as CoinGeckoResponse;
      const price = data[id]?.brl;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new QuoteProviderError(
          `CoinGecko não retornou preço válido para ${id}`,
        );
      }

      return { unitValueCents: Math.round(price * 100), raw: data };
    },
  };
}
```

- [ ] **Step 6: Create `pricing/coingecko-quote-provider.test.ts`**

```typescript
import { describe, expect, it, jest, afterEach } from "@jest/globals";
import {
  createCoinGeckoQuoteProvider,
  normalizeCryptoSymbol,
} from "./coingecko-quote-provider.js";
import { QuoteProviderError } from "./types.js";

describe("normalizeCryptoSymbol", () => {
  it("mapeia símbolos comuns para o id do CoinGecko", () => {
    expect(normalizeCryptoSymbol("btc")).toBe("bitcoin");
    expect(normalizeCryptoSymbol("ETH")).toBe("ethereum");
  });

  it("usa o texto em minúsculas quando não há mapeamento", () => {
    expect(normalizeCryptoSymbol("Cardano2")).toBe("cardano2");
  });
});

describe("createCoinGeckoQuoteProvider", () => {
  const originalKey = process.env.COINGECKO_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.COINGECKO_API_KEY;
    } else {
      process.env.COINGECKO_API_KEY = originalKey;
    }
  });

  it("funciona sem COINGECKO_API_KEY configurada (tier público)", async () => {
    delete process.env.COINGECKO_API_KEY;
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitcoin: { brl: 350000.5 } }),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.fetchQuote("BTC");

    expect(result.unitValueCents).toBe(35000050);
    const calledUrl = (fetchFn.mock.calls[0]?.[0] as string) ?? "";
    expect(calledUrl).not.toContain("x_cg_demo_api_key");
  });

  it("inclui x_cg_demo_api_key quando COINGECKO_API_KEY está configurada", async () => {
    process.env.COINGECKO_API_KEY = "demo-key";
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ethereum: { brl: 12000 } }),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await provider.fetchQuote("ETH");

    const calledUrl = (fetchFn.mock.calls[0]?.[0] as string) ?? "";
    expect(calledUrl).toContain("x_cg_demo_api_key=demo-key");
  });

  it("lança QuoteProviderError quando a resposta não tem preço válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando a API retorna status de erro", async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });
});
```

- [ ] **Step 7: Run all pricing tests**

Run: `pnpm --filter @money-manager/api test -- pricing`
Expected: all tests in `pricing/` pass (10 tests total across both files).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/investments/pricing/types.ts \
        apps/api/src/modules/investments/pricing/brapi-quote-provider.ts \
        apps/api/src/modules/investments/pricing/brapi-quote-provider.test.ts \
        apps/api/src/modules/investments/pricing/coingecko-quote-provider.ts \
        apps/api/src/modules/investments/pricing/coingecko-quote-provider.test.ts
git commit -m "feat(api): add Brapi and CoinGecko quote providers"
```

---

### Task 4: Unblock RV holdings — schema, service, mapper

**Files:**
- Modify: `apps/api/src/modules/investments/investment-holdings.schema.ts`
- Modify: `apps/api/src/modules/investments/investment-holdings.service.ts`

**Interfaces:**
- Consumes: `pricingSourceForAssetClass` from `./pricing/types.js` (Task 3); `AssetClass` from `@money-manager/types` (Task 2).
- Produces: `createInvestmentHolding` now accepts `incomeType: "variable_income"`. `toInvestmentHolding` now maps every new column onto the API response. Task 8 (quote-mode/refresh-quote endpoints) and Task 6 (refresh service) both read/write `investmentHoldings` rows shaped by this task.

- [ ] **Step 1: Replace `createInvestmentHoldingBodySchema` in `investment-holdings.schema.ts`**

```typescript
import { z } from "zod";
import { ASSET_CLASSES } from "@money-manager/types";

export const createInvestmentHoldingBodySchema = z
  .object({
    accountId: z.string().uuid(),
    symbol: z.string().trim().min(1, "Informe um nome para a posição"),
    incomeType: z.enum(["fixed_income", "variable_income"]).optional(),
    currentUnitValueCents: z
      .number()
      .int()
      .min(0, "Valor inválido")
      .optional(),
    assetClass: z.enum(ASSET_CLASSES).optional(),
    quantity: z.number().positive("Quantidade inválida").optional(),
    averageCostCents: z
      .number()
      .int()
      .min(0, "Valor inválido")
      .nullable()
      .optional(),
    maturityDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const incomeType = data.incomeType ?? "fixed_income";
    if (incomeType === "fixed_income") {
      if (data.currentUnitValueCents === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["currentUnitValueCents"],
          message: "Informe o valor atual",
        });
      }
    } else {
      if (data.assetClass === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assetClass"],
          message: "Informe a classe do ativo",
        });
      }
      if (data.quantity === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message: "Informe a quantidade",
        });
      }
    }
  });

export type CreateInvestmentHoldingBody = z.infer<
  typeof createInvestmentHoldingBodySchema
>;
```

This replaces the entire existing `createInvestmentHoldingBodySchema` block (the plain `z.object({...})` without `superRefine`). Leave `updateInvestmentHoldingBodySchema`, `updateHoldingValuationBodySchema`, `investmentHoldingIdParamsSchema`, and `listInvestmentHoldingsQuerySchema` unchanged — this task doesn't touch them.

- [ ] **Step 2: Add `updateHoldingQuoteModeBodySchema`**

Append to the end of `investment-holdings.schema.ts`:

```typescript
export const updateHoldingQuoteModeBodySchema = z.object({
  manualOverride: z.boolean(),
});

export type UpdateHoldingQuoteModeBody = z.infer<
  typeof updateHoldingQuoteModeBodySchema
>;
```

- [ ] **Step 3: Update `investment-holdings.service.ts` — imports, mapper, and `createInvestmentHolding`**

Update the import block at the top of the file:

```typescript
import {
  getDb,
  investmentAccounts,
  investmentHoldings,
} from "@money-manager/db";
import type { AssetClass, InvestmentHolding } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import { pricingSourceForAssetClass } from "./pricing/types.js";
import type {
  CreateInvestmentHoldingBody,
  ListInvestmentHoldingsQuery,
  UpdateHoldingQuoteModeBody,
  UpdateHoldingValuationBody,
  UpdateInvestmentHoldingBody,
} from "./investment-holdings.schema.js";
```

Replace `toInvestmentHolding`:

```typescript
function toInvestmentHolding(row: InvestmentHoldingRow): InvestmentHolding {
  return {
    id: row.id,
    accountId: row.accountId,
    userId: row.userId,
    symbol: row.symbol,
    incomeType: row.incomeType,
    assetClass: row.assetClass,
    quantity: row.quantity,
    averageCostCents: row.averageCostCents,
    currentUnitValueCents: row.currentUnitValueCents,
    maturityDate: row.maturityDate,
    pricingSource: row.pricingSource,
    manualOverride: row.manualOverride,
    lastQuoteError: row.lastQuoteError,
    notes: row.notes,
    lastValuationAt: row.lastValuationAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
```

Replace `createInvestmentHolding` (this removes the `if (input.incomeType && input.incomeType !== "fixed_income") throw ...` rejection entirely):

```typescript
export async function createInvestmentHolding(
  userId: string,
  input: CreateInvestmentHoldingBody,
): Promise<InvestmentHolding> {
  await assertAccountBelongsToUser(userId, input.accountId);

  const incomeType = input.incomeType ?? "fixed_income";
  const isVariableIncome = incomeType === "variable_income";
  const pricingSource = isVariableIncome
    ? pricingSourceForAssetClass(input.assetClass as AssetClass)
    : "manual";
  const now = new Date();
  const id = newId();

  await getDb()
    .insert(investmentHoldings)
    .values({
      id,
      accountId: input.accountId,
      userId,
      symbol: input.symbol,
      incomeType,
      assetClass: isVariableIncome ? (input.assetClass ?? null) : null,
      quantity: isVariableIncome ? String(input.quantity) : "1",
      averageCostCents: isVariableIncome
        ? (input.averageCostCents ?? null)
        : null,
      currentUnitValueCents: input.currentUnitValueCents ?? 0,
      maturityDate: input.maturityDate ?? null,
      pricingSource,
      lastQuoteError:
        isVariableIncome && input.currentUnitValueCents === undefined
          ? "Cotação pendente"
          : null,
      notes: input.notes ?? null,
      lastValuationAt: now,
      createdAt: now,
      updatedAt: now,
    });

  return getInvestmentHolding(userId, id);
}
```

- [ ] **Step 4: Add `updateHoldingQuoteMode` to `investment-holdings.service.ts`**

Append after `updateHoldingValuation`:

```typescript
export async function updateHoldingQuoteMode(
  userId: string,
  holdingId: string,
  input: UpdateHoldingQuoteModeBody,
): Promise<InvestmentHolding> {
  const row = await getInvestmentHoldingRow(userId, holdingId);
  if (row.incomeType !== "variable_income") {
    throw new BadRequestError(
      "Alternância de cotação automática disponível apenas para renda variável",
    );
  }

  await getDb()
    .update(investmentHoldings)
    .set({ manualOverride: input.manualOverride, updatedAt: new Date() })
    .where(eq(investmentHoldings.id, holdingId));

  return getInvestmentHolding(userId, holdingId);
}
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @money-manager/api build`
Expected: no TypeScript errors. (`refreshHoldingQuoteById`, used by Task 8, is added in Task 6 — do not add it here.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/investment-holdings.schema.ts \
        apps/api/src/modules/investments/investment-holdings.service.ts
git commit -m "feat(api): unblock variable-income holding creation"
```

---

### Task 5: Quote cache repository + quote router

**Files:**
- Create: `apps/api/src/modules/investments/pricing/quote-cache.repository.ts`
- Create: `apps/api/src/modules/investments/pricing/quote-router.ts`
- Create: `apps/api/src/modules/investments/pricing/quote-router.test.ts`

**Interfaces:**
- Consumes: `investmentQuoteCache` table (Task 1); `QuoteProvider`, `pricingSourceForAssetClass` from `./types.js` (Task 3); `createBrapiQuoteProvider`, `createCoinGeckoQuoteProvider` (Task 3).
- Produces: `getCachedQuote(symbol, assetClass)`, `upsertCachedQuote(entry)`, `QuoteCacheRow` type — consumed by Task 6 and Task 9. `createQuoteRouter(fetchFn?)` returning `{ getProvider(assetClass): QuoteProvider | null }` — consumed by Task 6.

- [ ] **Step 1: Create `pricing/quote-cache.repository.ts`**

```typescript
import { getDb, investmentQuoteCache } from "@money-manager/db";
import type { AssetClass, PricingSource } from "@money-manager/types";
import { and, eq } from "drizzle-orm";

export type QuoteCacheRow = typeof investmentQuoteCache.$inferSelect;

export async function getCachedQuote(
  symbol: string,
  assetClass: AssetClass,
): Promise<QuoteCacheRow | null> {
  const [row] = await getDb()
    .select()
    .from(investmentQuoteCache)
    .where(
      and(
        eq(investmentQuoteCache.symbol, symbol),
        eq(investmentQuoteCache.assetClass, assetClass),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertCachedQuote(entry: {
  symbol: string;
  assetClass: AssetClass;
  unitValueCents: number;
  pricingSource: PricingSource;
  quotedAt: Date;
  expiresAt: Date;
  rawResponse: unknown;
}): Promise<void> {
  await getDb()
    .insert(investmentQuoteCache)
    .values(entry)
    .onConflictDoUpdate({
      target: [investmentQuoteCache.symbol, investmentQuoteCache.assetClass],
      set: {
        unitValueCents: entry.unitValueCents,
        pricingSource: entry.pricingSource,
        quotedAt: entry.quotedAt,
        expiresAt: entry.expiresAt,
        rawResponse: entry.rawResponse,
      },
    });
}
```

- [ ] **Step 2: Create `pricing/quote-router.ts`**

```typescript
import type { AssetClass } from "@money-manager/types";
import { createBrapiQuoteProvider } from "./brapi-quote-provider.js";
import { createCoinGeckoQuoteProvider } from "./coingecko-quote-provider.js";
import { pricingSourceForAssetClass } from "./types.js";
import type { QuoteProvider } from "./types.js";

export interface QuoteRouter {
  getProvider(assetClass: AssetClass): QuoteProvider | null;
}

export function createQuoteRouter(
  fetchFn: typeof fetch = fetch,
): QuoteRouter {
  const brapi = createBrapiQuoteProvider(fetchFn);
  const coingecko = createCoinGeckoQuoteProvider(fetchFn);

  return {
    getProvider(assetClass: AssetClass): QuoteProvider | null {
      const source = pricingSourceForAssetClass(assetClass);
      if (source === "brapi") return brapi;
      if (source === "coingecko") return coingecko;
      return null;
    },
  };
}
```

- [ ] **Step 3: Create `pricing/quote-router.test.ts`**

```typescript
import { describe, expect, it, jest } from "@jest/globals";
import { createQuoteRouter } from "./quote-router.js";

describe("createQuoteRouter", () => {
  it("roteia stocks, fii e fund para o provider Brapi", () => {
    const router = createQuoteRouter(jest.fn() as unknown as typeof fetch);
    const stocksProvider = router.getProvider("stocks");
    expect(stocksProvider).toBe(router.getProvider("fii"));
    expect(stocksProvider).toBe(router.getProvider("fund"));
    expect(stocksProvider).not.toBeNull();
  });

  it("roteia crypto para o provider CoinGecko, distinto do Brapi", () => {
    const router = createQuoteRouter(jest.fn() as unknown as typeof fetch);
    const stocksProvider = router.getProvider("stocks");
    const cryptoProvider = router.getProvider("crypto");
    expect(cryptoProvider).not.toBeNull();
    expect(cryptoProvider).not.toBe(stocksProvider);
  });

  it("retorna null para classes sem provider automático", () => {
    const router = createQuoteRouter(jest.fn() as unknown as typeof fetch);
    expect(router.getProvider("real_estate")).toBeNull();
    expect(router.getProvider("cash")).toBeNull();
    expect(router.getProvider("other")).toBeNull();
    expect(router.getProvider("fixed_income")).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @money-manager/api test -- quote-router`
Expected: 3 tests pass.

- [ ] **Step 5: Build**

Run: `pnpm --filter @money-manager/api build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/pricing/quote-cache.repository.ts \
        apps/api/src/modules/investments/pricing/quote-router.ts \
        apps/api/src/modules/investments/pricing/quote-router.test.ts
git commit -m "feat(api): add quote cache repository and provider router"
```

---

### Task 6: Quote refresh orchestration service

**Files:**
- Create: `apps/api/src/modules/investments/pricing/quote-refresh.service.ts`
- Create: `apps/api/src/modules/investments/pricing/quote-refresh.service.test.ts`
- Modify: `apps/api/src/modules/investments/investment-holdings.service.ts`

**Interfaces:**
- Consumes: `createQuoteRouter` (Task 5), `getCachedQuote`/`upsertCachedQuote` (Task 5), `pricingSourceForAssetClass` (Task 3), `investmentHoldings` table (existing), `getInvestmentHoldingRow`/`toInvestmentHolding` (Task 4, same file being modified).
- Produces: `refreshHoldingQuote(holding, trigger, now?)`, `refreshAllRvHoldingsForUser(userId, now?)` — consumed by Task 7 (scheduler) and this task's own addition to `investment-holdings.service.ts` (`refreshHoldingQuoteById`), which Task 8's controller calls.

- [ ] **Step 1: Create `pricing/quote-refresh.service.ts`**

```typescript
import { getDb, investmentHoldings } from "@money-manager/db";
import type { PricingSource } from "@money-manager/types";
import { and, eq, isNull } from "drizzle-orm";
import { getCachedQuote, upsertCachedQuote } from "./quote-cache.repository.js";
import { createQuoteRouter } from "./quote-router.js";
import { pricingSourceForAssetClass } from "./types.js";

export type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;
export type RefreshTrigger = "on-demand" | "background";

const ON_DEMAND_THROTTLE_MS = 60_000;
const CACHE_TTL_MARKET_HOURS_MS = 15 * 60 * 1000;
const CACHE_TTL_OFF_HOURS_MS = 60 * 60 * 1000;

function isBrazilMarketHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hour =
    Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && hour >= 10 && hour < 18;
}

function cacheTtlMs(now: Date): number {
  return isBrazilMarketHours(now)
    ? CACHE_TTL_MARKET_HOURS_MS
    : CACHE_TTL_OFF_HOURS_MS;
}

const router = createQuoteRouter();

async function applyQuoteToHolding(
  holding: InvestmentHoldingRow,
  unitValueCents: number | null,
  pricingSource: PricingSource,
  quotedAt: Date | null,
  quoteError: string | null,
): Promise<InvestmentHoldingRow> {
  const updates: Partial<InvestmentHoldingRow> = {
    pricingSource,
    lastQuoteError: quoteError,
    updatedAt: new Date(),
  };
  if (unitValueCents !== null && quotedAt !== null) {
    updates.currentUnitValueCents = unitValueCents;
    updates.lastValuationAt = quotedAt;
  }

  await getDb()
    .update(investmentHoldings)
    .set(updates)
    .where(eq(investmentHoldings.id, holding.id));

  return { ...holding, ...updates };
}

export async function refreshHoldingQuote(
  holding: InvestmentHoldingRow,
  trigger: RefreshTrigger,
  now: Date = new Date(),
): Promise<InvestmentHoldingRow> {
  if (
    holding.incomeType !== "variable_income" ||
    holding.manualOverride ||
    holding.assetClass === null
  ) {
    return holding;
  }

  const provider = router.getProvider(holding.assetClass);
  if (!provider) {
    return holding;
  }

  const pricingSource = pricingSourceForAssetClass(holding.assetClass);
  const cached = await getCachedQuote(holding.symbol, holding.assetClass);

  if (trigger === "background" && cached && cached.expiresAt > now) {
    return applyQuoteToHolding(
      holding,
      cached.unitValueCents,
      pricingSource,
      cached.quotedAt,
      null,
    );
  }

  if (
    trigger === "on-demand" &&
    cached &&
    now.getTime() - cached.quotedAt.getTime() < ON_DEMAND_THROTTLE_MS
  ) {
    return applyQuoteToHolding(
      holding,
      cached.unitValueCents,
      pricingSource,
      cached.quotedAt,
      null,
    );
  }

  try {
    const result = await provider.fetchQuote(holding.symbol);
    const expiresAt = new Date(now.getTime() + cacheTtlMs(now));
    await upsertCachedQuote({
      symbol: holding.symbol,
      assetClass: holding.assetClass,
      unitValueCents: result.unitValueCents,
      pricingSource,
      quotedAt: now,
      expiresAt,
      rawResponse: result.raw,
    });
    return applyQuoteToHolding(
      holding,
      result.unitValueCents,
      pricingSource,
      now,
      null,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao buscar cotação";
    return applyQuoteToHolding(holding, null, pricingSource, null, message);
  }
}

export async function refreshAllRvHoldingsForUser(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(investmentHoldings)
    .where(
      and(
        eq(investmentHoldings.userId, userId),
        eq(investmentHoldings.incomeType, "variable_income"),
        eq(investmentHoldings.manualOverride, false),
        isNull(investmentHoldings.deletedAt),
      ),
    );

  for (const row of rows) {
    await refreshHoldingQuote(row, "background", now);
  }
}
```

- [ ] **Step 2: Create `pricing/quote-refresh.service.test.ts`**

This test mocks the cache repository and router modules with `jest.mock`, since `refreshHoldingQuote` is a DB-touching orchestration function — per this codebase's convention (see 20a plan's Global Constraints: "anything that requires the database is covered by an integration test instead, never by mocking Drizzle"), the DB write itself is exercised by Task 10's integration tests; this unit test covers the **branching logic** (skip conditions, throttle, TTL, fallback) using a fake `investmentHoldings` row and mocked cache/router, without a real DB connection.

```typescript
import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockUpdate = jest.fn();
const mockSet = jest.fn(() => ({ where: jest.fn() }));
jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => ({ update: mockUpdate }),
  investmentHoldings: {},
}));

const mockGetCachedQuote = jest.fn();
const mockUpsertCachedQuote = jest.fn();
jest.unstable_mockModule("./quote-cache.repository.js", () => ({
  getCachedQuote: mockGetCachedQuote,
  upsertCachedQuote: mockUpsertCachedQuote,
}));

const mockFetchQuote = jest.fn();
jest.unstable_mockModule("./quote-router.js", () => ({
  createQuoteRouter: () => ({
    getProvider: () => ({ fetchQuote: mockFetchQuote }),
  }),
}));

const { refreshHoldingQuote } = await import("./quote-refresh.service.js");

function holding(overrides: Record<string, unknown> = {}) {
  return {
    id: "h1",
    accountId: "acc1",
    userId: "user1",
    symbol: "PETR4",
    incomeType: "variable_income",
    assetClass: "stocks",
    quantity: "100",
    averageCostCents: null,
    currentUnitValueCents: 0,
    maturityDate: null,
    pricingSource: "brapi",
    manualOverride: false,
    lastQuoteError: null,
    lastValuationAt: new Date("2026-01-01T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("refreshHoldingQuote", () => {
  beforeEach(() => {
    mockUpdate.mockReturnValue({ set: mockSet });
    mockGetCachedQuote.mockReset();
    mockUpsertCachedQuote.mockReset();
    mockFetchQuote.mockReset();
  });

  it("não faz nada para holdings de renda fixa", async () => {
    const rf = holding({ incomeType: "fixed_income", assetClass: null });
    const result = await refreshHoldingQuote(rf as never, "on-demand");
    expect(result).toBe(rf);
    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("não faz nada quando manualOverride é true", async () => {
    const overridden = holding({ manualOverride: true });
    const result = await refreshHoldingQuote(overridden as never, "on-demand");
    expect(result).toBe(overridden);
    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("reutiliza cache fresco em trigger background sem chamar o provider", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    mockGetCachedQuote.mockResolvedValue({
      unitValueCents: 3800,
      quotedAt: new Date("2026-01-15T11:50:00.000Z"),
      expiresAt: new Date("2026-01-15T12:30:00.000Z"),
    });

    await refreshHoldingQuote(holding() as never, "background", now);

    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("ignora TTL mas respeita throttle de 1 min em trigger on-demand", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    mockGetCachedQuote.mockResolvedValue({
      unitValueCents: 3800,
      quotedAt: new Date("2026-01-15T11:59:30.000Z"),
      expiresAt: new Date("2026-01-15T11:00:00.000Z"),
    });

    await refreshHoldingQuote(holding() as never, "on-demand", now);

    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("busca cotação nova quando cache expirou (background)", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    mockGetCachedQuote.mockResolvedValue({
      unitValueCents: 3800,
      quotedAt: new Date("2026-01-15T09:00:00.000Z"),
      expiresAt: new Date("2026-01-15T10:00:00.000Z"),
    });
    mockFetchQuote.mockResolvedValue({ unitValueCents: 3900, raw: {} });

    await refreshHoldingQuote(holding() as never, "background", now);

    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4");
    expect(mockUpsertCachedQuote).toHaveBeenCalled();
  });

  it("mantém holding inalterado no valor e grava last_quote_error quando o provider falha", async () => {
    mockGetCachedQuote.mockResolvedValue(null);
    mockFetchQuote.mockRejectedValue(new Error("Brapi retornou status 500"));

    await refreshHoldingQuote(holding() as never, "on-demand");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lastQuoteError: "Brapi retornou status 500",
      }),
    );
    const setCallArg = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCallArg.currentUnitValueCents).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @money-manager/api test -- quote-refresh`
Expected: 6 tests pass.

- [ ] **Step 4: Add `refreshHoldingQuoteById` to `investment-holdings.service.ts`**

Add this import to `investment-holdings.service.ts` (alongside the existing imports from Task 4):

```typescript
import { refreshHoldingQuote } from "./pricing/quote-refresh.service.js";
```

Append this function after `updateHoldingQuoteMode`:

```typescript
export async function refreshHoldingQuoteById(
  userId: string,
  holdingId: string,
): Promise<InvestmentHolding> {
  const row = await getInvestmentHoldingRow(userId, holdingId);
  const refreshed = await refreshHoldingQuote(row, "on-demand");
  return toInvestmentHolding(refreshed);
}
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @money-manager/api build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/pricing/quote-refresh.service.ts \
        apps/api/src/modules/investments/pricing/quote-refresh.service.test.ts \
        apps/api/src/modules/investments/investment-holdings.service.ts
git commit -m "feat(api): add quote refresh orchestration with fallback and throttle"
```

---

### Task 7: In-process quote scheduler

**Files:**
- Create: `apps/api/src/modules/investments/pricing/quote-scheduler.ts`
- Create: `apps/api/src/modules/investments/pricing/quote-scheduler.test.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `refreshAllRvHoldingsForUser` (Task 6), `users` table (existing, from `@money-manager/db`).
- Produces: `startQuoteScheduler(): { stop(): void }`, `hasDailyTriggerPassed(now, lastRunDate)` (exported for direct unit testing). `server.ts` calls `startQuoteScheduler()` at boot.

- [ ] **Step 1: Create `pricing/quote-scheduler.ts`**

```typescript
import { getDb, users } from "@money-manager/db";
import { refreshAllRvHoldingsForUser } from "./quote-refresh.service.js";

const TICK_INTERVAL_MS = 15 * 60 * 1000;
const DAILY_TRIGGER_HOUR_BRT = 8;

function todayBrtString(now: Date): string {
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

export interface QuoteScheduler {
  stop(): void;
}

export function startQuoteScheduler(): QuoteScheduler {
  let lastRunDate: string | null = null;

  const tick = async (): Promise<void> => {
    const now = new Date();
    if (!hasDailyTriggerPassed(now, lastRunDate)) return;
    lastRunDate = todayBrtString(now);

    const allUsers = await getDb().select({ id: users.id }).from(users);
    for (const user of allUsers) {
      await refreshAllRvHoldingsForUser(user.id, now);
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

- [ ] **Step 2: Create `pricing/quote-scheduler.test.ts`**

```typescript
import { describe, expect, it } from "@jest/globals";
import { hasDailyTriggerPassed } from "./quote-scheduler.js";

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
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @money-manager/api test -- quote-scheduler`
Expected: 4 tests pass.

- [ ] **Step 4: Wire into `server.ts`**

Modify `apps/api/src/server.ts`:

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

- [ ] **Step 5: Build**

Run: `pnpm --filter @money-manager/api build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/pricing/quote-scheduler.ts \
        apps/api/src/modules/investments/pricing/quote-scheduler.test.ts \
        apps/api/src/server.ts
git commit -m "feat(api): add daily quote refresh scheduler"
```

---

### Task 8: New endpoints — quote-mode, refresh-quote, refresh-quotes

**Files:**
- Modify: `apps/api/src/modules/investments/investment-holdings.controller.ts`
- Modify: `apps/api/src/modules/investments/investment-holdings.routes.ts`
- Create: `apps/api/src/modules/investments/investments.controller.ts`
- Create: `apps/api/src/modules/investments/investments.routes.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `updateHoldingQuoteMode`, `refreshHoldingQuoteById` (Task 4/6, `investment-holdings.service.ts`); `refreshAllRvHoldingsForUser` (Task 6).
- Produces: `PATCH /v1/investment-holdings/:id/quote-mode`, `POST /v1/investment-holdings/:id/refresh-quote`, `POST /v1/investments/refresh-quotes` — consumed by Task 10 (integration tests) and Task 12 (frontend).

- [ ] **Step 1: Add controller actions to `investment-holdings.controller.ts`**

Add `updateHoldingQuoteModeBodySchema` to the existing schema import, then append these two functions at the end of the file:

```typescript
import {
  createInvestmentHoldingBodySchema,
  investmentHoldingIdParamsSchema,
  listInvestmentHoldingsQuerySchema,
  updateHoldingQuoteModeBodySchema,
  updateHoldingValuationBodySchema,
  updateInvestmentHoldingBodySchema,
} from "./investment-holdings.schema.js";
```

```typescript
export async function updateQuoteMode(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const body = updateHoldingQuoteModeBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.updateHoldingQuoteMode(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(holding);
}

export async function refreshQuote(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const holding = await investmentHoldingsService.refreshHoldingQuoteById(
    getUserId(req),
    id,
  );
  res.status(200).json(holding);
}
```

- [ ] **Step 2: Add routes to `investment-holdings.routes.ts`**

Append before the `DELETE /:id` route:

```typescript
investmentHoldingsRoutes.patch(
  "/:id/quote-mode",
  authenticate,
  investmentHoldingsController.updateQuoteMode,
);
investmentHoldingsRoutes.post(
  "/:id/refresh-quote",
  authenticate,
  investmentHoldingsController.refreshQuote,
);
```

- [ ] **Step 3: Create `investments.controller.ts`**

```typescript
import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import { refreshAllRvHoldingsForUser } from "./pricing/quote-refresh.service.js";

export async function refreshAllQuotes(
  req: Request,
  res: Response,
): Promise<void> {
  await refreshAllRvHoldingsForUser(getUserId(req));
  res.status(204).send();
}
```

- [ ] **Step 4: Create `investments.routes.ts`**

```typescript
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as investmentsController from "./investments.controller.js";

export const investmentsRoutes = Router();

investmentsRoutes.post(
  "/refresh-quotes",
  authenticate,
  investmentsController.refreshAllQuotes,
);
```

- [ ] **Step 5: Mount in `app.ts`**

Add the import next to the other investments imports:

```typescript
import { investmentsRoutes } from "./modules/investments/investments.routes.js";
```

Add the mount line next to the other investment mounts (order doesn't matter — `/v1/investments` and `/v1/investment-accounts`/`/v1/investment-holdings` diverge early enough in the path string that Express's prefix matching never confuses them):

```typescript
app.use("/v1/investments", investmentsRoutes);
```

- [ ] **Step 6: Build**

Run: `pnpm --filter @money-manager/api build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/investments/investment-holdings.controller.ts \
        apps/api/src/modules/investments/investment-holdings.routes.ts \
        apps/api/src/modules/investments/investments.controller.ts \
        apps/api/src/modules/investments/investments.routes.ts \
        apps/api/src/app.ts
git commit -m "feat(api): add quote-mode, refresh-quote, and refresh-quotes endpoints"
```

---

### Task 9: Patrimony — real `quotesStale`, real `byAssetClass`, quantity-multiplication fix

**Files:**
- Modify: `apps/api/src/modules/investments/patrimony.service.ts`
- Modify: `apps/api/src/modules/investments/patrimony.service.test.ts`

**Interfaces:**
- Consumes: `investmentQuoteCache` table (Task 1); `ASSET_CLASS_LABELS` from `@money-manager/types` (Task 2).
- Produces: `computePatrimonySummary` gains a 4th positional parameter (`quoteCacheRows`, before `now`) — **breaking change** to every existing call site, all of which are in `patrimony.service.test.ts` and are updated in this same task. `holdingValueCents` (new, internal) — the money bug fix every later consumer of position totals relies on being correct.

- [ ] **Step 1: Replace `patrimony.service.ts`**

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

type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;
type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;
type PiggyBankRow = typeof piggyBanks.$inferSelect;
type QuoteCacheRow = typeof investmentQuoteCache.$inferSelect;

const UPCOMING_MATURITY_WINDOW_DAYS = 90;

function holdingValueCents(holding: InvestmentHoldingRow): number {
  return Math.round(Number(holding.quantity) * holding.currentUnitValueCents);
}

function isHoldingQuoteStale(
  holding: InvestmentHoldingRow,
  cacheBySymbolClass: Map<string, QuoteCacheRow>,
  now: Date,
): boolean {
  if (
    holding.incomeType !== "variable_income" ||
    holding.manualOverride ||
    holding.pricingSource === "manual"
  ) {
    return false;
  }
  const cached = cacheBySymbolClass.get(
    `${holding.symbol}:${holding.assetClass}`,
  );
  if (!cached) return true;
  return cached.expiresAt < now;
}

export function computePatrimonySummary(
  holdings: InvestmentHoldingRow[],
  accounts: InvestmentAccountRow[],
  piggyBankRows: PiggyBankRow[],
  quoteCacheRows: QuoteCacheRow[],
  now: Date,
): PatrimonySummary {
  const investmentsCents = holdings.reduce(
    (acc, holding) => acc + holdingValueCents(holding),
    0,
  );
  const piggyBanksCents = piggyBankRows.reduce(
    (acc, piggyBank) => acc + piggyBank.currentAmountCents,
    0,
  );
  const totalAssetsCents = investmentsCents + piggyBanksCents;

  const totalsByClassKey = new Map<string, number>();
  for (const holding of holdings) {
    const key =
      holding.incomeType === "fixed_income"
        ? "fixed_income_group"
        : (holding.assetClass ?? "other");
    totalsByClassKey.set(
      key,
      (totalsByClassKey.get(key) ?? 0) + holdingValueCents(holding),
    );
  }
  const byAssetClass: PatrimonyAssetClassBucket[] = Array.from(
    totalsByClassKey.entries(),
  ).map(([key, totalCents]) => ({
    class: key as PatrimonyAssetClassBucket["class"],
    label:
      key === "fixed_income_group"
        ? "Renda fixa"
        : (ASSET_CLASS_LABELS[key as keyof typeof ASSET_CLASS_LABELS] ?? key),
    totalCents,
    percentage:
      investmentsCents > 0
        ? Math.round((totalCents / investmentsCents) * 1000) / 10
        : 0,
  }));

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const totalsByAccount = new Map<string, number>();
  for (const holding of holdings) {
    totalsByAccount.set(
      holding.accountId,
      (totalsByAccount.get(holding.accountId) ?? 0) +
        holdingValueCents(holding),
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
  const todayStr = toDateString(now);
  const cutoffStr = toDateString(maturityCutoff);

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
      totalCents: holdingValueCents(holding),
    }))
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  const cacheBySymbolClass = new Map(
    quoteCacheRows.map((row) => [`${row.symbol}:${row.assetClass}`, row]),
  );
  const quotesStale = holdings.some((holding) =>
    isHoldingQuoteStale(holding, cacheBySymbolClass, now),
  );

  return {
    totalAssetsCents,
    investmentsCents,
    piggyBanksCents,
    byAssetClass,
    byAccount,
    lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    quotesStale,
    upcomingMaturities,
  };
}

export async function getPatrimonySummary(
  userId: string,
): Promise<PatrimonySummary> {
  const db = getDb();
  const [holdings, accounts, piggyBankRows, quoteCacheRows] =
    await Promise.all([
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
        .where(
          and(eq(piggyBanks.userId, userId), isNull(piggyBanks.deletedAt)),
        ),
      db.select().from(investmentQuoteCache),
    ]);

  return computePatrimonySummary(
    holdings,
    accounts,
    piggyBankRows,
    quoteCacheRows,
    new Date(),
  );
}
```

- [ ] **Step 2: Update every existing test call site in `patrimony.service.test.ts`**

Add a 4th fixture type alias and helper after the existing `PiggyBankFixture` alias:

```typescript
type HoldingFixture = Parameters<typeof computePatrimonySummary>[0][number];
type AccountFixture = Parameters<typeof computePatrimonySummary>[1][number];
type PiggyBankFixture = Parameters<typeof computePatrimonySummary>[2][number];
type QuoteCacheFixture = Parameters<typeof computePatrimonySummary>[3][number];

function quoteCache(overrides: Partial<QuoteCacheFixture>): QuoteCacheFixture {
  return {
    symbol: "PETR4",
    assetClass: "stocks",
    unitValueCents: 3800,
    pricingSource: "brapi",
    quotedAt: new Date("2026-01-15T00:00:00.000Z"),
    expiresAt: new Date("2026-01-15T01:00:00.000Z"),
    rawResponse: null,
    ...overrides,
  } as QuoteCacheFixture;
}
```

Every existing `computePatrimonySummary(...)` call in this file currently takes 4 arguments (`holdings`, `accounts`, `piggyBankRows`, `now`); insert an empty array `[]` as the new 4th argument (before `now`) in **all seven** existing calls. For example, the first test:

```typescript
it("soma holdings e cofrinhos para o total de patrimônio", () => {
    const result = computePatrimonySummary(
      [holding({ currentUnitValueCents: 10000 })],
      [account({})],
      [piggyBank({ currentAmountCents: 5000 })],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );
```

Apply the same `[],` insertion (as the new 4th positional argument, immediately before the `now` argument) to the other six calls: `"agrupa holdings por conta em byAccount"`, `"retorna byAssetClass vazio quando não há holdings"`, `"filtra upcomingMaturities dentro da janela de 90 dias"`, `"inclui holding cujo vencimento é hoje mesmo quando UTC já virou o dia"`, `"usa o maior last_valuation_at como lastUpdatedAt"`, and `"retorna lastUpdatedAt null quando não há holdings"`. None of these tests use RV holdings, so none of their existing assertions change — `quotesStale` stays `false` in all of them (no RV holdings means `holdings.some(...)` is vacuously `false`), and `byAssetClass` outputs are unaffected (multiplying by `quantity: "1"`, the fixture default, is a no-op).

- [ ] **Step 3: Add new test cases for the quantity-multiplication fix**

Append to the end of the `describe("computePatrimonySummary", ...)` block:

```typescript
  it("multiplica quantity × currentUnitValueCents para holdings de renda variável", () => {
    const result = computePatrimonySummary(
      [
        holding({
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: "100",
          currentUnitValueCents: 3000,
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.investmentsCents).toBe(300000);
  });

  it("segmenta byAssetClass por classe real em holdings RV, mantendo RF agrupado", () => {
    const result = computePatrimonySummary(
      [
        holding({
          id: "h-rf",
          incomeType: "fixed_income",
          currentUnitValueCents: 5000,
        }),
        holding({
          id: "h-rv",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: "10",
          currentUnitValueCents: 500,
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.byAssetClass).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ class: "fixed_income_group", totalCents: 5000 }),
        expect.objectContaining({ class: "stocks", totalCents: 5000, label: "Ações" }),
      ]),
    );
  });

  it("quotesStale é true quando uma holding RV não tem cache ou o cache expirou", () => {
    const result = computePatrimonySummary(
      [
        holding({
          incomeType: "variable_income",
          assetClass: "stocks",
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.quotesStale).toBe(true);
  });

  it("quotesStale é false quando o cache da holding RV ainda está válido", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");
    const result = computePatrimonySummary(
      [
        holding({
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [quoteCache({ symbol: "PETR4", assetClass: "stocks", expiresAt: new Date("2026-01-15T01:00:00.000Z") })],
      now,
    );

    expect(result.quotesStale).toBe(false);
  });

  it("quotesStale ignora holdings RV com manualOverride ou pricingSource manual", () => {
    const result = computePatrimonySummary(
      [
        holding({
          id: "h-override",
          incomeType: "variable_income",
          assetClass: "stocks",
          pricingSource: "brapi",
          manualOverride: true,
        }),
        holding({
          id: "h-manual-class",
          incomeType: "variable_income",
          assetClass: "real_estate",
          pricingSource: "manual",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.quotesStale).toBe(false);
  });
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @money-manager/api test -- patrimony.service`
Expected: 13 tests pass (7 existing + 6 new).

- [ ] **Step 5: Build**

Run: `pnpm --filter @money-manager/api build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/investments/patrimony.service.ts \
        apps/api/src/modules/investments/patrimony.service.test.ts
git commit -m "fix(api): multiply quantity into position totals, compute real quotesStale and byAssetClass"
```

---

### Task 10: Integration tests — RV holdings, quote-mode, refresh, patrimony

**Files:**
- Modify: `apps/api/tests/integration/investment-holdings.integration.test.ts`
- Modify: `apps/api/tests/integration/investment-accounts.integration.test.ts` (only if needed for a shared helper — see Step 1)

**Interfaces:**
- Consumes: every endpoint from Task 8, `createAccount` helper already defined in `investment-holdings.integration.test.ts`.

- [ ] **Step 1: Replace the now-outdated rejection test**

The existing test `"POST /v1/investment-holdings rejeita incomeType variable_income"` (asserting `res.status === 400`) is no longer true — Task 4 removed that rejection. Delete that entire `it(...)` block and replace it with the tests in the next step.

- [ ] **Step 2: Add RV creation tests**

Add to `investment-holdings.integration.test.ts`, in place of the deleted test:

```typescript
  it("POST /v1/investment-holdings cria posição de renda variável sem cotação inicial (lazy)", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "PETR4",
        incomeType: "variable_income",
        assetClass: "stocks",
        quantity: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.incomeType).toBe("variable_income");
    expect(res.body.assetClass).toBe("stocks");
    expect(res.body.quantity).toBe("100");
    expect(res.body.currentUnitValueCents).toBe(0);
    expect(res.body.pricingSource).toBe("brapi");
    expect(res.body.lastQuoteError).toBe("Cotação pendente");
  });

  it("POST /v1/investment-holdings rejeita renda variável sem assetClass ou quantity", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "PETR4", incomeType: "variable_income" });

    expect(res.status).toBe(400);
  });

  it("PATCH /v1/investment-holdings/:id/quote-mode alterna manualOverride e rejeita em holdings RF", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const rvRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "PETR4",
        incomeType: "variable_income",
        assetClass: "stocks",
        quantity: 10,
      });
    const rvId = rvRes.body.id as string;

    const toggleRes = await request(app)
      .patch(`/v1/investment-holdings/${rvId}/quote-mode`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ manualOverride: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.manualOverride).toBe(true);

    const rfRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "CDB", currentUnitValueCents: 1000 });
    const rfId = rfRes.body.id as string;

    const rejectedRes = await request(app)
      .patch(`/v1/investment-holdings/${rfId}/quote-mode`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ manualOverride: true });
    expect(rejectedRes.status).toBe(400);
  });

  it("POST /v1/investment-holdings/:id/refresh-quote busca cotação e respeita throttle de 1 min", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
        }),
      } as Response);

    try {
      const rvRes = await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      const rvId = rvRes.body.id as string;

      const firstRefresh = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(firstRefresh.status).toBe(200);
      expect(firstRefresh.body.currentUnitValueCents).toBe(4000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const secondRefresh = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(secondRefresh.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("POST /v1/investment-holdings/:id/refresh-quote nunca retorna erro HTTP quando o provider falha", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    delete process.env.BRAPI_TOKEN;

    try {
      const rvRes = await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      const rvId = rvRes.body.id as string;

      const res = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.lastQuoteError).toContain("BRAPI_TOKEN");
    } finally {
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("GET /v1/patrimony/summary reflete quantity × cotação e byAssetClass real para holdings RV", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      const rvRes = await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      const rvId = rvRes.body.id as string;
      await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);

      const summaryRes = await request(app)
        .get("/v1/patrimony/summary")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.investmentsCents).toBe(4000);
      expect(summaryRes.body.byAssetClass).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ class: "stocks", totalCents: 4000 }),
        ]),
      );
      expect(summaryRes.body.quotesStale).toBe(false);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("POST /v1/investments/refresh-quotes atualiza todas as posições RV do usuário em lote", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "VALE3",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 5,
        });

      const res = await request(app)
        .post("/v1/investments/refresh-quotes")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(204);

      const listRes = await request(app)
        .get("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`);
      const values = (listRes.body.items as { currentUnitValueCents: number }[])
        .map((h) => h.currentUnitValueCents);
      expect(values).toEqual([4000, 4000]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("compartilha uma única chamada externa entre duas posições com o mesmo símbolo", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 20,
        });

      const res = await request(app)
        .post("/v1/investments/refresh-quotes")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(204);

      // Duas posições no mesmo símbolo (PETR4): a primeira busca a cotação e
      // grava o cache; a segunda reaproveita o cache recém-gravado em vez de
      // chamar o provider de novo — daí exatamente 1 chamada, não 2.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });
```

Add `jest` to the existing `@jest/globals` import at the top of the file (alongside `describe`, `expect`, `it`).

- [ ] **Step 3: Run the integration suite**

Run: `pnpm --filter @money-manager/api test:integration -- investment-holdings`
Expected: all tests pass (existing tests minus the one deleted in Step 1, plus the 8 new ones).

- [ ] **Step 4: Run the full API test suite**

Run: `pnpm --filter @money-manager/api test && pnpm --filter @money-manager/api test:integration`
Expected: all tests pass, including `patrimony.service.test.ts` (Task 9) and every `pricing/*.test.ts` file (Tasks 3, 5, 6, 7).

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/integration/investment-holdings.integration.test.ts
git commit -m "test(api): cover RV holdings, quote-mode, refresh-quote, and patrimony integration"
```

---

### Task 11: Frontend — RV holding creation form

**Files:**
- Modify: `apps/web/src/components/features/investments/holding-form-modal.tsx`

**Interfaces:**
- Consumes: `AssetClass`, `ASSET_CLASSES`, `ASSET_CLASS_LABELS`, `IncomeType` from `@money-manager/types` (Task 2); `POST /v1/investment-holdings` (Task 4/8, now accepting the extended body).

- [ ] **Step 1: Add income-type toggle and conditional RV fields**

Replace the full contents of `holding-form-modal.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { AssetClass, IncomeType, InvestmentHolding } from "@money-manager/types";
import { ASSET_CLASSES, ASSET_CLASS_LABELS } from "@money-manager/types";
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

const RV_ASSET_CLASSES = ASSET_CLASSES.filter(
  (c): c is Exclude<AssetClass, "fixed_income"> => c !== "fixed_income",
);

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

  const [incomeType, setIncomeType] = useState<IncomeType>("fixed_income");
  const [symbol, setSymbol] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("stocks");
  const [quantity, setQuantity] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (holding) {
      setIncomeType(holding.incomeType);
      setSymbol(holding.symbol);
      setCurrentValue(formatMoneyDisplay(holding.currentUnitValueCents / 100));
      setAssetClass(holding.assetClass ?? "stocks");
      setQuantity(holding.quantity);
      setMaturityDate(holding.maturityDate ?? "");
      setNotes(holding.notes ?? "");
    } else {
      setIncomeType("fixed_income");
      setSymbol("");
      setCurrentValue("");
      setAssetClass("stocks");
      setQuantity("");
      setAverageCost("");
      setMaturityDate("");
      setNotes("");
    }
    setError(null);
  }, [open, holding]);

  if (!open) return null;

  const isRv = incomeType === "variable_income";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isEditing && !isRv) {
      const valueParsed = parseMoneyAmountInput(currentValue);
      if (!Number.isFinite(valueParsed) || valueParsed < 0) {
        setError("Informe um valor válido.");
        setLoading(false);
        return;
      }
    }
    if (!isEditing && isRv) {
      const quantityParsed = Number(quantity);
      if (!Number.isFinite(quantityParsed) || quantityParsed <= 0) {
        setError("Informe uma quantidade válida.");
        setLoading(false);
        return;
      }
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
              incomeType,
              ...(isRv
                ? {
                    assetClass,
                    quantity: Number(quantity),
                    averageCostCents: averageCost
                      ? Math.round(parseMoneyAmountInput(averageCost) * 100)
                      : null,
                  }
                : {
                    currentUnitValueCents: Math.round(
                      parseMoneyAmountInput(currentValue) * 100,
                    ),
                  }),
              maturityDate: maturityDate || null,
              notes: notes.trim() || null,
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
          {!isEditing ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Tipo
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIncomeType("fixed_income")}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    !isRv
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 bg-white/5 text-zinc-400"
                  }`}
                >
                  Renda fixa
                </button>
                <button
                  type="button"
                  onClick={() => setIncomeType("variable_income")}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    isRv
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 bg-white/5 text-zinc-400"
                  }`}
                >
                  Renda variável
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {isRv ? "Ticker" : "Nome"}
            </label>
            <input
              type="text"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={isRv ? "Ex.: PETR4" : "Ex.: CDB Banco X"}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {!isEditing && !isRv ? (
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

          {!isEditing && isRv ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Classe do ativo
                </label>
                <select
                  value={assetClass}
                  onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                  className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
                >
                  {RV_ASSET_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {ASSET_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Quantidade
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ex.: 100"
                  className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Preço médio (opcional)
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                  <span className="text-zinc-500">R$</span>
                  <MoneyAmountInput
                    value={averageCost}
                    onChange={setAverageCost}
                    className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                A cotação inicial é buscada automaticamente após criar a posição.
              </p>
            </>
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

The maturity-date field stays visible for RV in this form even though the roadmap models RV holdings as never having one in practice — leaving it visible but optional is harmless (an RV holding with a maturity date has no special behavior anywhere in the backend), and hiding it conditionally would add a branch for no functional benefit. Do not add that branch.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @money-manager/web typecheck`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/features/investments/holding-form-modal.tsx
git commit -m "feat(web): add variable-income fields to holding creation form"
```

---

### Task 12: Frontend — quote display, refresh, override, byAssetClass, quantity fix

**Files:**
- Modify: `apps/web/src/components/features/investments/holding-row.tsx`
- Modify: `apps/web/src/components/features/investments/investment-account-section.tsx`
- Modify: `apps/web/src/components/features/investments/patrimony-summary-cards.tsx`
- Modify: `apps/web/src/pages/InvestmentsPage.tsx`

**Interfaces:**
- Consumes: `PATCH /v1/investment-holdings/:id/quote-mode`, `POST /v1/investment-holdings/:id/refresh-quote` (Task 8); `PatrimonySummary.byAssetClass`/`quotesStale` (Task 9).

- [ ] **Step 1: Fix the money bug and add quote UI in `holding-row.tsx`**

Replace the full contents:

```tsx
import type { InvestmentHolding } from "@money-manager/types";
import { Edit3, Lock, RefreshCw, Trash2, TrendingUp, Unlock } from "lucide-react";

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

const PENDING_QUOTE_MESSAGE = "Cotação pendente";
const STALE_ERROR_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function positionValueCents(holding: InvestmentHolding): number {
  return Math.round(Number(holding.quantity) * holding.currentUnitValueCents);
}

function unrealizedPnlCents(holding: InvestmentHolding): number | null {
  if (holding.averageCostCents === null) return null;
  return Math.round(
    (holding.currentUnitValueCents - holding.averageCostCents) *
      Number(holding.quantity),
  );
}

function isQuoteErrorVisible(holding: InvestmentHolding): boolean {
  if (holding.lastQuoteError === null) return false;
  if (holding.lastQuoteError === PENDING_QUOTE_MESSAGE) return true;
  const age = Date.now() - new Date(holding.lastValuationAt).getTime();
  return age > STALE_ERROR_THRESHOLD_MS;
}

interface HoldingRowProps {
  holding: InvestmentHolding;
  onEdit: (holding: InvestmentHolding) => void;
  onValuation: (holding: InvestmentHolding) => void;
  onDelete: (id: string) => void;
  onRefreshQuote: (id: string) => void;
  onToggleOverride: (id: string, manualOverride: boolean) => void;
}

export function HoldingRow({
  holding,
  onEdit,
  onValuation,
  onDelete,
  onRefreshQuote,
  onToggleOverride,
}: HoldingRowProps) {
  const isRv = holding.incomeType === "variable_income";
  const showQuoteError = isRv && isQuoteErrorVisible(holding);
  const pnlCents = isRv ? unrealizedPnlCents(holding) : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{holding.symbol}</p>
        <p className="text-sm text-zinc-500">
          {formatCurrency(positionValueCents(holding))}
          {isRv ? ` · ${holding.quantity} × ${formatCurrency(holding.currentUnitValueCents)}` : ""}
          {holding.maturityDate
            ? ` · vence em ${formatDate(holding.maturityDate)}`
            : ""}
        </p>
        {pnlCents !== null ? (
          <p
            className={`text-xs ${pnlCents >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {pnlCents >= 0 ? "+" : ""}
            {formatCurrency(pnlCents)} não realizado
          </p>
        ) : null}
        {showQuoteError ? (
          <p className="mt-1 text-xs text-amber-400">
            {holding.lastQuoteError === PENDING_QUOTE_MESSAGE
              ? PENDING_QUOTE_MESSAGE
              : `Cotação desatualizada: ${holding.lastQuoteError}`}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isRv && holding.pricingSource !== "manual" ? (
          <>
            <button
              type="button"
              onClick={() => onRefreshQuote(holding.id)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400"
              aria-label="Atualizar cotação"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleOverride(holding.id, !holding.manualOverride)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label={
                holding.manualOverride
                  ? "Voltar à cotação automática"
                  : "Fixar valor manualmente"
              }
            >
              {holding.manualOverride ? (
                <Unlock className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
            </button>
          </>
        ) : null}
        {!isRv || holding.manualOverride || holding.pricingSource === "manual" ? (
          <button
            type="button"
            onClick={() => onValuation(holding)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400"
            aria-label="Atualizar valor"
          >
            <TrendingUp className="h-4 w-4" />
          </button>
        ) : null}
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

`isStale` here is intentionally driven by `lastQuoteError !== null`, not by re-deriving TTL expiry on the frontend (which would need the raw cache row this component never receives) — matches spec §1.5's approved simplification.

- [ ] **Step 2: Thread new callbacks through `investment-account-section.tsx`**

Fix the per-account total (same money bug) and pass the two new callbacks through:

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

function positionValueCents(holding: InvestmentHolding): number {
  return Math.round(Number(holding.quantity) * holding.currentUnitValueCents);
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
  onRefreshHoldingQuote: (id: string) => void;
  onToggleHoldingOverride: (id: string, manualOverride: boolean) => void;
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
  onRefreshHoldingQuote,
  onToggleHoldingOverride,
}: InvestmentAccountSectionProps) {
  const total = holdings.reduce((acc, h) => acc + positionValueCents(h), 0);

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
            onRefreshQuote={onRefreshHoldingQuote}
            onToggleOverride={onToggleHoldingOverride}
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

- [ ] **Step 3: Render `byAssetClass` and a `quotesStale` badge in `patrimony-summary-cards.tsx`**

Add a small allocation list after the existing three summary cards `<div>` and before the `lastUpdatedAt` paragraph:

```tsx
      {summary.byAssetClass.length > 0 ? (
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="mb-3 text-sm font-bold text-white">Alocação por classe</p>
          <div className="space-y-2">
            {summary.byAssetClass.map((bucket) => (
              <div
                key={bucket.class}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-zinc-300">{bucket.label}</span>
                <span className="text-zinc-500">
                  {formatCurrency(bucket.totalCents)} · {bucket.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

```

Add a stale indicator next to the existing `lastUpdatedAt` paragraph:

```tsx
      {summary.lastUpdatedAt ? (
        <p className="text-xs text-zinc-500">
          Última atualização: {formatDateTime(summary.lastUpdatedAt)}
          {summary.quotesStale ? (
            <span className="ml-2 text-amber-400">· cotações desatualizadas</span>
          ) : null}
        </p>
      ) : null}
```

This replaces the existing (non-conditional-on-stale) `lastUpdatedAt` paragraph block — same position in the file, same outer condition, just the added inline stale marker.

- [ ] **Step 4: Wire the new handlers and props in `InvestmentsPage.tsx`**

Add two new handler functions after `handleDeleteHolding`:

```tsx
  async function handleRefreshHoldingQuote(id: string) {
    try {
      const res = await apiFetch(`/v1/investment-holdings/${id}/refresh-quote`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erro ao atualizar cotação");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar cotação");
    }
  }

  async function handleToggleHoldingOverride(id: string, manualOverride: boolean) {
    try {
      const res = await apiFetch(`/v1/investment-holdings/${id}/quote-mode`, {
        method: "PATCH",
        body: JSON.stringify({ manualOverride }),
      });
      if (!res.ok) throw new Error("Erro ao alternar modo de cotação");
      void loadAll();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Erro ao alternar modo de cotação",
      );
    }
  }
```

Pass the two new props to `InvestmentAccountSection` in the JSX:

```tsx
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
                  onRefreshHoldingQuote={(id) => void handleRefreshHoldingQuote(id)}
                  onToggleHoldingOverride={(id, v) =>
                    void handleToggleHoldingOverride(id, v)
                  }
                />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @money-manager/web typecheck`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/investments/holding-row.tsx \
        apps/web/src/components/features/investments/investment-account-section.tsx \
        apps/web/src/components/features/investments/patrimony-summary-cards.tsx \
        apps/web/src/pages/InvestmentsPage.tsx
git commit -m "feat(web): show RV quotes, refresh/override controls, and fix position value display"
```

---

### Task 13: Browser verification

**Files:** none (manual verification only).

**Scope boundary, stated explicitly:** neither `BRAPI_TOKEN` nor `COINGECKO_API_KEY` is expected to be set in the local `.env` for this verification pass, per this plan's credential-sequencing decision. Verify every flow that doesn't require a live provider call; live quote fetching itself is verified later, whenever real keys are added — that is explicitly not a gate for this task or this branch.

- [ ] **Step 1: Start dev servers and open the app**

Start the API and web dev servers, open `/dashboard/investments` in the browser, log in.

- [ ] **Step 2: Verify RF path is untouched**

Create a fixed-income holding exactly as before (name + value, no asset class field visible). Confirm it saves and displays correctly — this path must behave identically to pre-20b.

- [ ] **Step 3: Verify RV creation (lazy quote)**

Click "Nova posição", switch to "Renda variável", fill in a ticker (e.g. `PETR4`), asset class `Ações`, quantity `100`. Save. Confirm: the holding appears with `R$ 0,00` (or equivalent zero display) and an amber "Cotação desatualizada: Cotação pendente" line, matching the `lastQuoteError` set at creation.

- [ ] **Step 4: Verify refresh-quote surfaces the "not configured" error without crashing**

Click the refresh icon on the RV holding from Step 3. Confirm the request succeeds (200, not a browser-visible error), and the stale line now reads the `BRAPI_TOKEN`-missing message — proving the "never blocks the user" fallback behavior end-to-end through the real UI, not just in tests.

- [ ] **Step 5: Verify manual override toggle**

Click the lock icon to enable manual override on the RV holding. Confirm: the refresh/lock icons are replaced by the same manual "Atualizar valor" (TrendingUp) button RF holdings use, and clicking it lets you set a value via the existing valuation modal. Toggle back off (unlock) and confirm the refresh/lock icons return.

- [ ] **Step 6: Verify patrimony summary**

Set a manual value on the RV holding via override (e.g. R$ 40,00 for 100 units). Confirm the patrimony summary's "Alocação por classe" list shows an "Ações" bucket at the correct total (`quantity × value`, e.g. R$ 4.000,00), separate from any "Renda fixa" bucket, with a plausible percentage.

- [ ] **Step 7: Tear down**

Stop dev servers started for this verification pass.

- [ ] **Step 8: Report results**

Summarize what was verified and any deviations found, without committing further changes unless a real defect was caught (in which case: fix, re-verify, commit separately, following this plan's existing per-task commit style).
