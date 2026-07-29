# Per-User Quote Provider API Keys — Design

**Goal:** Replace the single, shared Brapi/CoinGecko API keys (today read from
process-wide `.env` vars) with per-user encrypted credentials, so each user
consumes their own provider quota instead of every user on the instance
competing for one free-tier rate limit.

**Motivation:** the project started as personal-only, but the intent now is
that other people run/use their own account on the same instance. A shared
`BRAPI_TOKEN` was fine for a single user; it doesn't scale to independent
users who don't know or trust each other's usage patterns.

**Scope of this round:** both providers — Brapi (stocks/FIIs, currently
required for any automatic RV quote) and CoinGecko (crypto, currently
optional, only raises the rate limit).

**Explicit decisions made during design (see §4 for what's deliberately
excluded):**

- **No shared fallback.** A user who hasn't configured their own key for a
  provider gets the same UX as "provider unreachable" today: automatic
  quoting is unavailable for that provider, `last_quote_error` explains why,
  manual override remains available. The global `BRAPI_TOKEN` /
  `COINGECKO_API_KEY` env vars are removed entirely — there is nothing left
  to fall back to.
- **Encrypted at rest.** AES-256-GCM via Node's built-in `crypto` module (no
  new dependency), master key in a new `SETTINGS_ENCRYPTION_KEY` env var.
  Read lazily at the point of use (encrypt/decrypt call), matching this
  codebase's existing convention for optional/required env vars (e.g.
  `INTERNAL_API_KEY` in `shared/middleware/internal-auth.ts`, the very
  `BRAPI_TOKEN` this round removes) — no new boot-time env validation
  infrastructure is introduced.
- **Dedicated table**, not new columns on `users`. `pricingSourceEnum`
  already anticipates providers beyond Brapi/CoinGecko (`yahoo`,
  `alpha_vantage`); a table means a new provider is a new row shape, not a
  new pair of nullable columns on the core identity table every time.

---

## 1. Backend

### 1.1 Data model (`packages/db`)

New table, new migration:

**`user_provider_credentials`**

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid, part of PK | FK → `users.id`, `onDelete: "cascade"` |
| `provider` | `pricing_source_enum`, part of PK | reuses the existing enum; only `brapi` and `coingecko` rows are ever written this round (`manual`/`yahoo`/`alpha_vantage` stay unused here) |
| `encrypted_value` | text, not null | ciphertext, base64 |
| `iv` | text, not null | AES-GCM initialization vector, base64, fresh per write, never reused |
| `auth_tag` | text, not null | AES-GCM authentication tag, base64 — required to detect tampering on decrypt |
| `created_at` | timestamptz, not null, default now | |
| `updated_at` | timestamptz, not null, default now | bumped on every credential replace |

Primary key: composite `(user_id, provider)` — same pattern as
`investment_quote_cache`'s `(symbol, asset_class)` composite PK. Guarantees
"at most one credential per provider per user" without a separate unique
index.

### 1.2 Encryption helper (`apps/api/src/shared/crypto/secret-encryption.ts`)

```ts
export function encryptSecret(plaintext: string): {
  encryptedValue: string;
  iv: string;
  authTag: string;
};

export function decryptSecret(input: {
  encryptedValue: string;
  iv: string;
  authTag: string;
}): string;
```

- `SETTINGS_ENCRYPTION_KEY` — 32 raw bytes, base64-encoded in `.env`. Read
  inside `encryptSecret`/`decryptSecret` via `process.env`; throws a clear
  `Error` if absent or not valid base64/wrong length — surfaces the first
  time any credential is saved or read, not at process boot (no existing
  precedent in this codebase for eager env validation at startup).
- `crypto.randomBytes(12)` for the IV (12 bytes is the standard/recommended
  GCM nonce size), `crypto.createCipheriv("aes-256-gcm", key, iv)` /
  `createDecipheriv`, auth tag via `cipher.getAuthTag()` /
  `decipher.setAuthTag()`.
- `decryptSecret` lets `setAuthTag`/`final()`'s built-in exception propagate
  on a tampered/corrupted value — no bespoke error wrapping needed, the
  caller (service layer, §1.3) treats any thrown error the same way
  (surface as "credential unreadable", see §1.7).

### 1.3 Module `provider-credentials` — internals

New module, same shape as existing ones (`telegram`, `patrimony`, etc.):
`apps/api/src/modules/provider-credentials/{provider-credentials.service,
.controller, .schema, .routes}.ts`.

**Service:**

```ts
export async function listCredentials(
  userId: string,
): Promise<{ provider: "brapi" | "coingecko"; updatedAt: string }[]>;

export async function setCredential(
  userId: string,
  provider: "brapi" | "coingecko",
  apiKey: string,
): Promise<void>;
// Validates apiKey against the real provider first (see below), then
// encryptSecret + upsert (insert ... onConflictDoUpdate on the (user_id,
// provider) PK, matching the registerSnapshot .returning() convention —
// no separate select needed here since the caller doesn't need the row
// back, just success/failure).

export async function deleteCredential(
  userId: string,
  provider: "brapi" | "coingecko",
): Promise<boolean>;
// Returns whether a row existed to delete (controller maps false -> 404).

export async function getDecryptedCredential(
  userId: string,
  provider: "brapi" | "coingecko",
): Promise<string | null>;
// Internal use only (called from quote-refresh.service.ts, §1.4) — never
// exposed through a controller/route.
```

**Validation before save:** `setCredential` makes one real call to the
target provider before persisting anything — reuses the same
`createBrapiQuoteProvider`/`createCoinGeckoQuoteProvider` factories from
`investments/pricing`, calling `fetchQuote` with a known-good symbol
(`"PETR4"` for Brapi, `"bitcoin"` for CoinGecko) and the candidate key. A
thrown `QuoteProviderError` means the key is rejected before it's ever
written to the database — `setCredential` propagates that as a validation
failure (§1.7), nothing is persisted.

### 1.4 Module `investments/pricing` — changes

`QuoteProvider.fetchQuote` signature changes from `(symbol: string)` to
`(symbol: string, apiKey?: string)` for both `BrapiQuoteProvider` and
`CoinGeckoQuoteProvider`. Both providers stop reading `process.env` inside
`fetchQuote`:

- **Brapi:** `apiKey` is now a required argument in practice — the caller
  (quote-refresh service, below) never calls `fetchQuote` for Brapi without
  first confirming a credential exists; if it's called with `undefined`
  anyway, the existing "não configurado" `QuoteProviderError` still fires
  (defensive, matches current test coverage shape).
- **CoinGecko:** unchanged behavior — `apiKey` present appends
  `x_cg_demo_api_key`; absent means an unauthenticated (more rate-limited)
  call, exactly like today when `COINGECKO_API_KEY` was unset.

`quote-refresh.service.ts` (the module that currently drives `fetchQuote`
for a holding) changes its call site: before invoking the router/provider
for a holding, it calls
`getDecryptedCredential(holding.userId, provider)`.

- Brapi + `null` credential → short-circuits without calling the provider
  at all, writes `last_quote_error: "Configure sua chave da Brapi em
  Configurações para ativar a cotação automática."` (replaces today's
  "Brapi não configurado (BRAPI_TOKEN ausente)", same mechanism, clearer
  destination).
- CoinGecko + `null` credential → calls the provider anyway with
  `apiKey: undefined`, same as today's no-env-var behavior.

`QuoteRouter.getProvider(assetClass)` is unchanged — it only resolves
*which* provider type an asset class maps to, never touches credentials.

Existing holdings whose `last_quote_error` was set under the old
shared-key regime need no backfill or migration: the next refresh attempt
(scheduled or on-demand) re-evaluates them against the new per-user lookup
automatically.

### 1.5 API changes

Mounted at `/v1/me/provider-credentials` (the existing `/v1/me` namespace
for the authenticated user's own account — today only `GET /` for the
profile).

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/v1/me/provider-credentials` | — | `200 { items: [{ provider, updatedAt }] }` — only providers with a row; never the decrypted value |
| `PUT` | `/v1/me/provider-credentials/:provider` | `{ apiKey: string }` | `204` on success; `400` if `:provider` isn't `brapi`/`coingecko` or the key fails live validation (§1.3) |
| `DELETE` | `/v1/me/provider-credentials/:provider` | — | `204` if a row existed and was removed; `404` if none existed |

All three routes require `authenticate` (same middleware as the rest of
`/v1/me`). The `:provider` route param is validated by a Zod params schema
(`z.enum(["brapi", "coingecko"])`, following the same
`installmentIdParamsSchema`-style params-schema convention already used
elsewhere in this codebase) — an invalid value never reaches the
controller/service, it 400s at the schema-validation middleware layer.

### 1.6 `packages/types`

```ts
export interface ProviderCredentialSummary {
  provider: "brapi" | "coingecko";
  updatedAt: string; // ISO 8601, row.updatedAt.toISOString() — same
                      // convention as PatrimonySnapshot.createdAt and
                      // every other timestamp field in this package
}

export interface SetProviderCredentialBody {
  apiKey: string;
}
```

### 1.7 Errors

- `PUT` with an empty/whitespace-only `apiKey` → `400` via Zod schema
  (`z.string().trim().min(1)`), same pattern as other body schemas in this
  codebase — never reaches the live-validation call.
- `PUT` where the live-validation call to Brapi/CoinGecko throws
  `QuoteProviderError` → `400 { error: "Não foi possível validar essa
  chave. Confira se ela está correta.", code: "invalid_provider_credential"
  }` (via `AppError`, matching this codebase's `{ error, code }` error
  envelope — never `{ message }`).
- `DELETE` on a provider with no stored credential → `404`.
- A `decryptSecret` failure while reading a stored credential (corrupted
  row, or `SETTINGS_ENCRYPTION_KEY` rotated without re-encrypting existing
  rows — see §4) is treated by `getDecryptedCredential` the same as "no
  credential": returns `null`, logs the error server-side. This keeps quote
  refresh resilient (never crashes a refresh sweep over one bad row) at the
  cost of a slightly misleading "not configured" message for that specific
  edge case — accepted trade-off, not expected to occur in practice since
  key rotation is explicitly out of scope (§4).

---

## 2. Frontend (`apps/web`)

New component `ProviderCredentialsSection`
(`apps/web/src/components/features/settings/provider-credentials-section.tsx`),
same visual/structural pattern as the existing `TelegramLinkSection`: a
`glass rounded-2xl p-6` card, `checkingStatus` loading skeleton, per-provider
block inside the same card (Brapi and CoinGecko as two rows of one card, not
two separate cards).

Per provider, two states:

- **Not configured:** short explanatory line + link to the provider's
  signup page (brapi.dev / coingecko.com), a `type="password"` input (key
  never rendered in plain text while typing) and a "Salvar" button. Inline
  `role="alert"` error text on `400` (matching `TelegramLinkSection`'s
  existing error display), including the live-validation-failure message
  from §1.7 verbatim.
- **Configured:** a status line — "Chave configurada em {updatedAt,
  formatted pt-BR}" — and a "Remover" button (calls `DELETE`, no
  confirmation dialog needed, re-adding a key is a single form submit away).
  The decrypted value is never fetched or displayed, consistent with §1.5's
  `GET` response never including it.

Wired into `SettingsPage.tsx` as a sibling section to `TelegramLinkSection`,
below the existing "Conta" card.

---

## 3. Testing plan

**Unit:**
- `secret-encryption.test.ts`: encrypt→decrypt round-trip returns the
  original plaintext; two calls with the same plaintext produce different
  `iv`/`encryptedValue` (proves the IV is fresh per call, not reused);
  decrypting with a flipped bit in `authTag` (or `encryptedValue`) throws.
- `brapi-quote-provider.test.ts` / `coingecko-quote-provider.test.ts`: the
  existing "missing key" test case changes from deleting
  `process.env.BRAPI_TOKEN`/`COINGECKO_API_KEY` to simply omitting the
  `apiKey` argument — same coverage, parameter-based instead of env-based.
- `quote-refresh.service.test.ts`: new case — holding's user has no stored
  Brapi credential → `last_quote_error` is set to the new message and the
  provider's `fetchQuote` is never called (mock assertion).
- `provider-credentials.service.test.ts`: `setCredential` calls the
  provider's live-validation `fetchQuote` before persisting; a rejected
  validation leaves no row written; `listCredentials` never includes
  `encryptedValue`/`iv`/`authTag` in its return shape.

**Integration (`tests/integration/provider-credentials.integration.test.ts`,
new file):**
- All three routes reject unauthenticated requests (401).
- `PUT` with a valid key (mocked `fetch`) persists and a subsequent `GET`
  lists it; the raw stored row in the DB is not the plaintext key (spot
  za check via a direct query in the test, same style already used
  elsewhere in this suite to assert persisted shape).
- `PUT` with an invalid `:provider` → 400. `PUT` with a key the mocked
  provider rejects → 400, no row written.
- `DELETE` existing → 204, subsequent `GET` no longer lists it. `DELETE`
  nonexistent → 404.

---

## 4. Out of scope (deferred to future rounds)

- **`SETTINGS_ENCRYPTION_KEY` rotation.** Rotating the master key would
  require re-encrypting every stored row; not built this round. If the key
  is ever rotated without a migration, existing rows become undecryptable
  (§1.7's accepted "treated as not-configured" fallback) — users would need
  to re-enter their key.
- **Migrating today's shared `.env` keys into any specific user's row.**
  The operator's existing `BRAPI_TOKEN`/`COINGECKO_API_KEY` are simply
  removed; nobody's account is pre-seeded with them. Every user (including
  the project's original/personal account) configures their own key after
  this ships.
- **Per-provider rate-limit-aware retry/backoff.** Out of scope; unrelated
  to moving from shared to per-user keys.
- **GitHub OAuth as an onboarding path that also collects these keys.**
  Related idea, already logged separately as roadmap Feature 23 — not part
  of this round, no coupling assumed between the two.
