# Per-User Quote Provider API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared, process-wide `BRAPI_TOKEN`/`COINGECKO_API_KEY`
env vars with per-user encrypted credentials, stored in a new table and
managed through a Settings UI, so each user consumes their own Brapi/
CoinGecko quota instead of every user on the instance sharing one.

**Architecture:** New table `user_provider_credentials` (composite PK
`user_id, provider`) holds AES-256-GCM-encrypted keys. A new
`provider-credentials` API module exposes list/set/delete under
`/v1/me/provider-credentials/:provider`, validating a key against the real
provider before persisting it. `BrapiQuoteProvider`/`CoinGeckoQuoteProvider`
stop reading `process.env` and instead take the key as an explicit
`fetchQuote(symbol, apiKey?)` parameter; `quote-refresh.service.ts` looks up
the holding owner's decrypted credential before calling the provider. A new
`ProviderCredentialsSection` in the existing Settings page lets a user
save/remove their own keys.

**Tech stack:** Express + Drizzle + Zod on the API (existing), Node's
built-in `crypto` module for encryption (no new dependency), React +
`apiFetch` on the web (existing).

**Spec:** `docs/superpowers/specs/2026-07-29-per-user-quote-api-keys-design.md`
— read it once for full rationale; this plan restates every exact value
needed to implement, so tasks below are self-sufficient.

## Global Constraints

- **Never add a `Co-Authored-By` trailer to any commit.** Only the human
  user is a commit author.
- Encryption: AES-256-GCM via Node's native `crypto` (`createCipheriv` /
  `createDecipheriv`), master key from `process.env.SETTINGS_ENCRYPTION_KEY`
  (32 raw bytes, base64-encoded in `.env`), a fresh `crypto.randomBytes(12)`
  IV per encryption call (never reused), auth tag stored separately. Env var
  read lazily inside the helper functions (matches this codebase's existing
  convention — see `INTERNAL_API_KEY` in
  `apps/api/src/shared/middleware/internal-auth.ts` — no eager boot-time
  validation).
- `AppError` subclasses (`apps/api/src/shared/errors/app-error.ts`) take a
  Portuguese user-facing message; the global `errorHandler` serializes them
  as `{ error, code }` — every new error path in this feature uses
  `BadRequestError`/`NotFoundError`, never a hand-rolled `{ message }` body.
- `apiFetch` (`apps/web/src/lib/api.ts`) already sets
  `content-type: application/json`, the bearer token, and the CSRF header
  whenever `init.body` is set — call sites never set those headers
  themselves.
- Only `brapi` and `coingecko` are ever written to
  `user_provider_credentials.provider` this round (the column reuses
  `pricingSourceEnum`, which also has `manual`/`yahoo`/`alpha_vantage` —
  those are never inserted here).
- New API module follows the existing per-domain folder convention:
  `apps/api/src/modules/<name>/<name>.{service,controller,schema,routes}.ts`.

---

### Task 1: DB schema — `user_provider_credentials` table

**Files:**
- Create: `packages/db/src/schema/provider-credentials.ts`
- Modify: `packages/db/src/schema/index.ts`
- Migration: generated (see Step 2)

**Interfaces:**
- Produces: `userProviderCredentials` (Drizzle table), consumed by Task 4's
  service layer.

- [ ] **Step 1: Create the schema file**

Create `packages/db/src/schema/provider-credentials.ts`:

```ts
import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pricingSourceEnum } from "./investments.js";
import { users } from "./users.js";

export const userProviderCredentials = pgTable(
  "user_provider_credentials",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: pricingSourceEnum("provider").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);
```

- [ ] **Step 2: Export from the schema barrel**

In `packages/db/src/schema/index.ts`, add after the `investments.js` line:

```ts
export * from "./investments.js";
export * from "./provider-credentials.js";
export * from "./piggy-banks.js";
```

(insert the new line between the existing `investments.js` and
`piggy-banks.js` exports)

- [ ] **Step 3: Generate the migration**

Run: `cd "packages/db" && pnpm run db:generate`

Expected: a new `packages/db/migrations/00XX_<generated-name>.sql` file
containing a `CREATE TABLE "user_provider_credentials"` statement with a
composite primary key on `(user_id, provider)` and a foreign key to
`users(id)` with `ON DELETE CASCADE`. Note the generated filename for the
commit message.

- [ ] **Step 4: Apply the migration locally**

Run: `cd "packages/db" && pnpm run db:migrate`
Expected: migration applies without error against the local dev database.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @money-manager/db build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/provider-credentials.ts packages/db/src/schema/index.ts packages/db/migrations/
git commit -m "feat(db): add user_provider_credentials table"
```

---

### Task 2: Encryption helper

**Files:**
- Create: `apps/api/src/shared/crypto/secret-encryption.ts`
- Test: `apps/api/src/shared/crypto/secret-encryption.test.ts`
- Modify: `apps/api/jest.setup.cjs`

**Interfaces:**
- Produces: `encryptSecret(plaintext: string): { encryptedValue: string; iv: string; authTag: string }`
  and `decryptSecret(input: { encryptedValue: string; iv: string; authTag: string }): string`,
  consumed by Task 4's service layer. `jest.setup.cjs`'s new default value is
  consumed transitively by Task 10's integration tests (the only place
  besides this task's own test that exercises `encryptSecret`/`decryptSecret`
  without setting `SETTINGS_ENCRYPTION_KEY` itself).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/shared/crypto/secret-encryption.test.ts`:

```ts
import { describe, expect, it, afterEach } from "@jest/globals";
import { encryptSecret, decryptSecret } from "./secret-encryption.js";

describe("encryptSecret / decryptSecret", () => {
  const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
    }
  });

  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
  });

  it("decryptSecret(encryptSecret(x)) === x", () => {
    const encrypted = encryptSecret("minha-chave-super-secreta");
    expect(decryptSecret(encrypted)).toBe("minha-chave-super-secreta");
  });

  it("gera um iv diferente a cada chamada, mesmo para o mesmo texto", () => {
    const first = encryptSecret("mesma-chave");
    const second = encryptSecret("mesma-chave");
    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedValue).not.toBe(second.encryptedValue);
  });

  it("lança erro ao descriptografar com authTag adulterada", () => {
    const encrypted = encryptSecret("qualquer-coisa");
    const tampered = {
      ...encrypted,
      authTag: Buffer.from(encrypted.authTag, "base64")
        .map((b, i) => (i === 0 ? b ^ 0xff : b))
        .toString("base64"),
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lança erro quando SETTINGS_ENCRYPTION_KEY não está configurada", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(
      "SETTINGS_ENCRYPTION_KEY não configurada",
    );
  });
});
```

Add `import { beforeEach } from "@jest/globals";` to the import line at the
top alongside the others.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit -t "encryptSecret"`
Expected: FAIL — `secret-encryption.js` does not exist yet.

- [ ] **Step 3: Implement**

Create `apps/api/src/shared/crypto/secret-encryption.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getMasterKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SETTINGS_ENCRYPTION_KEY não configurada");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY inválida (esperado 32 bytes em base64)",
    );
  }
  return key;
}

export interface EncryptedSecret {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(input: EncryptedSecret): string {
  const key = getMasterKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.encryptedValue, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit -t "encryptSecret"`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Add a default test key to `jest.setup.cjs`**

`jest.setup.cjs` sets `??=` defaults for secrets every test run needs
(`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_API_KEY`) so that
test files never have to set them individually. Task 10's integration
tests will exercise `setCredential`/`getDecryptedCredential` through the
real HTTP layer without setting `SETTINGS_ENCRYPTION_KEY` themselves (this
task's own unit test above manages the var itself via `beforeEach`, so it
doesn't depend on this default — but nothing else does either yet, which
is why Task 10 needs it). In `apps/api/jest.setup.cjs`, add one line after
the existing `INTERNAL_API_KEY` default:

```js
process.env.INTERNAL_API_KEY ??= "dev-internal-key-change-me";
process.env.SETTINGS_ENCRYPTION_KEY ??=
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.NODE_ENV = "test";
```

(that base64 string decodes to exactly 32 zero bytes — a valid, fixed
`SETTINGS_ENCRYPTION_KEY` for tests only; it must never be reused outside
a test environment)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/crypto/secret-encryption.ts apps/api/src/shared/crypto/secret-encryption.test.ts apps/api/jest.setup.cjs
git commit -m "feat(api): add AES-256-GCM secret encryption helper"
```

---

### Task 3: `packages/types` — provider credential types

**Files:**
- Create: `packages/types/src/api/provider-credentials.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `ProviderCredentialProvider`, `ProviderCredentialSummary`,
  `SetProviderCredentialBody`, `ListProviderCredentialsResponse` — consumed
  by Task 5 (API) and Task 9 (frontend).

- [ ] **Step 1: Create the types file**

Create `packages/types/src/api/provider-credentials.ts`:

```ts
export type ProviderCredentialProvider = "brapi" | "coingecko";

export interface ProviderCredentialSummary {
  provider: ProviderCredentialProvider;
  updatedAt: string; // ISO 8601
}

export interface ListProviderCredentialsResponse {
  items: ProviderCredentialSummary[];
}

export interface SetProviderCredentialBody {
  apiKey: string;
}
```

- [ ] **Step 2: Export from the package barrel**

In `packages/types/src/index.ts`, add after the `piggy-banks.js` line:

```ts
export * from "./api/piggy-banks.js";
export * from "./api/provider-credentials.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @money-manager/types build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/api/provider-credentials.ts packages/types/src/index.ts
git commit -m "feat(types): add provider credential types"
```

---

### Task 4: `provider-credentials` service layer

**Files:**
- Create: `apps/api/src/modules/provider-credentials/provider-credentials.service.ts`
- Test: `apps/api/src/modules/provider-credentials/provider-credentials.service.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` (Task 2), `userProviderCredentials`
  (Task 1), `createBrapiQuoteProvider`/`createCoinGeckoQuoteProvider`
  (existing, `apps/api/src/modules/investments/pricing/`).
- Produces: `listCredentials(userId)`, `setCredential(userId, provider, apiKey)`,
  `deleteCredential(userId, provider)`, `getDecryptedCredential(userId, provider)`
  — the last one consumed by Task 7.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/provider-credentials/provider-credentials.service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QuoteProviderError } from "../investments/pricing/types.js";

const dbMock = {
  select: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  transaction: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  userProviderCredentials: {
    userId: "user_id",
    provider: "provider",
    encryptedValue: "encrypted_value",
    iv: "iv",
    authTag: "auth_tag",
    updatedAt: "updated_at",
  },
}));

const mockFetchQuote = jest.fn();
jest.unstable_mockModule("../investments/pricing/brapi-quote-provider.js", () => ({
  createBrapiQuoteProvider: () => ({ fetchQuote: mockFetchQuote }),
}));
jest.unstable_mockModule("../investments/pricing/coingecko-quote-provider.js", () => ({
  createCoinGeckoQuoteProvider: () => ({ fetchQuote: mockFetchQuote }),
}));

const { setCredential, getDecryptedCredential } = await import(
  "./provider-credentials.service.js"
);

const originalEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
});

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  } else {
    process.env.SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe("setCredential", () => {
  it("valida a chave contra o provider antes de salvar", async () => {
    mockFetchQuote.mockResolvedValueOnce({ unitValueCents: 3800, raw: {} });
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({ onConflictDoUpdate }),
    });

    await setCredential("user-1", "brapi", "chave-valida");

    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4", "chave-valida");
    expect(dbMock.insert).toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });

  it("propaga o erro e não salva quando a validação falha", async () => {
    mockFetchQuote.mockRejectedValueOnce(
      new QuoteProviderError("chave inválida"),
    );

    await expect(
      setCredential("user-1", "brapi", "chave-invalida"),
    ).rejects.toThrow(QuoteProviderError);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("getDecryptedCredential", () => {
  it("retorna null quando não há credencial cadastrada", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    const result = await getDecryptedCredential("user-1", "coingecko");

    expect(result).toBeNull();
  });

  it("retorna null (sem lançar) quando a linha armazenada não descriptografa", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                encryptedValue: "aW52YWxpZG8=",
                iv: Buffer.alloc(12, 2).toString("base64"),
                authTag: Buffer.alloc(16, 3).toString("base64"),
              },
            ]),
        }),
      }),
    });

    const result = await getDecryptedCredential("user-1", "brapi");

    expect(result).toBeNull();
  });
});
```

This mocks `@money-manager/db` the same way `telegram.service.test.ts` does
(a shared `dbMock` with one `jest.fn()` per query-builder entry point,
`getDb: () => dbMock`, and table columns as plain string values — `eq`/`and`
from `drizzle-orm` are real and don't care about the column object's
runtime shape). The second `getDecryptedCredential` test deliberately
constructs an `authTag`/`iv` that won't authenticate against the real
`decryptSecret` (Task 2) so the GCM auth-tag check fails, exercising the
service's catch-and-return-null path (spec §1.7) instead of letting the
exception propagate.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit provider-credentials.service.test.ts`
Expected: FAIL — `provider-credentials.service.js` does not exist yet.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/provider-credentials/provider-credentials.service.ts`:

```ts
import { getDb, userProviderCredentials } from "@money-manager/db";
import type { ProviderCredentialSummary } from "@money-manager/types";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../shared/crypto/secret-encryption.js";
import { createBrapiQuoteProvider } from "../investments/pricing/brapi-quote-provider.js";
import { createCoinGeckoQuoteProvider } from "../investments/pricing/coingecko-quote-provider.js";

type Provider = "brapi" | "coingecko";

const VALIDATION_SYMBOL: Record<Provider, string> = {
  brapi: "PETR4",
  coingecko: "bitcoin",
};

async function validateApiKey(provider: Provider, apiKey: string): Promise<void> {
  const quoteProvider =
    provider === "brapi"
      ? createBrapiQuoteProvider()
      : createCoinGeckoQuoteProvider();
  await quoteProvider.fetchQuote(VALIDATION_SYMBOL[provider], apiKey);
}

export async function listCredentials(
  userId: string,
): Promise<ProviderCredentialSummary[]> {
  const rows = await getDb()
    .select({
      provider: userProviderCredentials.provider,
      updatedAt: userProviderCredentials.updatedAt,
    })
    .from(userProviderCredentials)
    .where(eq(userProviderCredentials.userId, userId));

  return rows.map((row) => ({
    provider: row.provider as Provider,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function setCredential(
  userId: string,
  provider: Provider,
  apiKey: string,
): Promise<void> {
  await validateApiKey(provider, apiKey);

  const { encryptedValue, iv, authTag } = encryptSecret(apiKey);
  const now = new Date();

  await getDb()
    .insert(userProviderCredentials)
    .values({ userId, provider, encryptedValue, iv, authTag, updatedAt: now })
    .onConflictDoUpdate({
      target: [userProviderCredentials.userId, userProviderCredentials.provider],
      set: { encryptedValue, iv, authTag, updatedAt: now },
    });
}

export async function deleteCredential(
  userId: string,
  provider: Provider,
): Promise<boolean> {
  const deleted = await getDb()
    .delete(userProviderCredentials)
    .where(
      and(
        eq(userProviderCredentials.userId, userId),
        eq(userProviderCredentials.provider, provider),
      ),
    )
    .returning({ userId: userProviderCredentials.userId });

  return deleted.length > 0;
}

export async function getDecryptedCredential(
  userId: string,
  provider: Provider,
): Promise<string | null> {
  const [row] = await getDb()
    .select({
      encryptedValue: userProviderCredentials.encryptedValue,
      iv: userProviderCredentials.iv,
      authTag: userProviderCredentials.authTag,
    })
    .from(userProviderCredentials)
    .where(
      and(
        eq(userProviderCredentials.userId, userId),
        eq(userProviderCredentials.provider, provider),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  try {
    return decryptSecret(row);
  } catch (err) {
    console.error(
      `[provider-credentials] falha ao descriptografar credencial ${provider} do usuário ${userId}`,
      err,
    );
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit provider-credentials.service.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/provider-credentials/provider-credentials.service.ts apps/api/src/modules/provider-credentials/provider-credentials.service.test.ts
git commit -m "feat(api): add provider-credentials service layer"
```

---

### Task 5: `provider-credentials` schema, controller, routes

**Files:**
- Create: `apps/api/src/modules/provider-credentials/provider-credentials.schema.ts`
- Create: `apps/api/src/modules/provider-credentials/provider-credentials.controller.ts`
- Create: `apps/api/src/modules/provider-credentials/provider-credentials.routes.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `listCredentials`/`setCredential`/`deleteCredential` (Task 4),
  `getUserId(req)` (existing, `apps/api/src/shared/types/request.js`),
  `BadRequestError`/`NotFoundError` (existing,
  `apps/api/src/shared/errors/app-error.js`).
- Produces: `providerCredentialsRoutes`, mounted at
  `/v1/me/provider-credentials`, consumed by Task 10's integration tests.

- [ ] **Step 1: Create the Zod schemas**

Create `apps/api/src/modules/provider-credentials/provider-credentials.schema.ts`:

```ts
import { z } from "zod";

export const providerParamsSchema = z.object({
  provider: z.enum(["brapi", "coingecko"]),
});

export type ProviderParams = z.infer<typeof providerParamsSchema>;

export const setProviderCredentialBodySchema = z.object({
  apiKey: z.string().trim().min(1),
});

export type SetProviderCredentialBody = z.infer<
  typeof setProviderCredentialBodySchema
>;
```

- [ ] **Step 2: Create the controller**

Create `apps/api/src/modules/provider-credentials/provider-credentials.controller.ts`:

```ts
import type { Request, Response } from "express";
import { QuoteProviderError } from "../investments/pricing/types.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/app-error.js";
import { getUserId } from "../../shared/types/request.js";
import {
  providerParamsSchema,
  setProviderCredentialBodySchema,
} from "./provider-credentials.schema.js";
import * as providerCredentialsService from "./provider-credentials.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const items = await providerCredentialsService.listCredentials(getUserId(req));
  res.status(200).json({ items });
}

export async function set(req: Request, res: Response): Promise<void> {
  const { provider } = providerParamsSchema.parse(req.params);
  const { apiKey } = setProviderCredentialBodySchema.parse(req.body);

  try {
    await providerCredentialsService.setCredential(getUserId(req), provider, apiKey);
  } catch (err) {
    if (err instanceof QuoteProviderError) {
      throw new BadRequestError(
        "Não foi possível validar essa chave. Confira se ela está correta.",
      );
    }
    throw err;
  }

  res.status(204).send();
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { provider } = providerParamsSchema.parse(req.params);
  const deleted = await providerCredentialsService.deleteCredential(
    getUserId(req),
    provider,
  );
  if (!deleted) {
    throw new NotFoundError("Nenhuma chave configurada para esse provider");
  }
  res.status(204).send();
}
```

- [ ] **Step 3: Create the routes**

Create `apps/api/src/modules/provider-credentials/provider-credentials.routes.ts`:

```ts
import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as providerCredentialsController from "./provider-credentials.controller.js";

export const providerCredentialsRoutes = Router();

providerCredentialsRoutes.get(
  "/",
  authenticate,
  providerCredentialsController.list,
);
providerCredentialsRoutes.put(
  "/:provider",
  authenticate,
  providerCredentialsController.set,
);
providerCredentialsRoutes.delete(
  "/:provider",
  authenticate,
  providerCredentialsController.remove,
);
```

- [ ] **Step 4: Mount the router**

In `apps/api/src/app.ts`, add the import near the other module route
imports, and mount it after the `/v1/me` line:

```ts
app.use("/v1/me", userRoutes);
app.use("/v1/me/provider-credentials", providerCredentialsRoutes);
```

(add the corresponding `import { providerCredentialsRoutes } from "./modules/provider-credentials/provider-credentials.routes.js";`
alongside the other route imports at the top of the file)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @money-manager/api build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/provider-credentials/provider-credentials.schema.ts apps/api/src/modules/provider-credentials/provider-credentials.controller.ts apps/api/src/modules/provider-credentials/provider-credentials.routes.ts apps/api/src/app.ts
git commit -m "feat(api): add provider-credentials endpoints"
```

---

### Task 6: Refactor Brapi/CoinGecko providers to take the key as a parameter

**Files:**
- Modify: `apps/api/src/modules/investments/pricing/brapi-quote-provider.ts`
- Modify: `apps/api/src/modules/investments/pricing/coingecko-quote-provider.ts`
- Modify: `apps/api/src/modules/investments/pricing/types.ts`
- Modify: `apps/api/src/modules/investments/pricing/brapi-quote-provider.test.ts`
- Modify: `apps/api/src/modules/investments/pricing/coingecko-quote-provider.test.ts`

**Interfaces:**
- Produces: `QuoteProvider.fetchQuote(symbol: string, apiKey?: string): Promise<QuoteResult>`
  — the new signature consumed by Task 7.

- [ ] **Step 1: Update the shared interface**

In `apps/api/src/modules/investments/pricing/types.ts`, change:

```ts
export interface QuoteProvider {
  fetchQuote(symbol: string): Promise<QuoteResult>;
}
```

to:

```ts
export interface QuoteProvider {
  fetchQuote(symbol: string, apiKey?: string): Promise<QuoteResult>;
}
```

- [ ] **Step 2: Update the Brapi provider**

In `apps/api/src/modules/investments/pricing/brapi-quote-provider.ts`,
replace the whole `fetchQuote` method signature and its first block:

```ts
    async fetchQuote(
      symbol: string,
      apiKey?: string,
    ): Promise<QuoteResult> {
      if (!apiKey) {
        throw new QuoteProviderError(
          "Configure sua chave da Brapi em Configurações para ativar a cotação automática.",
        );
      }

      const normalized = normalizeB3Symbol(symbol);
      const url = `${BRAPI_BASE_URL}/${encodeURIComponent(normalized)}?token=${encodeURIComponent(apiKey)}`;
```

(replaces the old `const token = process.env.BRAPI_TOKEN; if (!token) {...}`
block and the `url` line that referenced `token` — everything else in the
method, from `let response: Response;` onward, is unchanged)

- [ ] **Step 3: Update the CoinGecko provider**

In `apps/api/src/modules/investments/pricing/coingecko-quote-provider.ts`,
replace:

```ts
    async fetchQuote(symbol: string): Promise<QuoteResult> {
      const id = normalizeCryptoSymbol(symbol);
      const url = new URL(COINGECKO_BASE_URL);
      url.searchParams.set("ids", id);
      url.searchParams.set("vs_currencies", "brl");
      const apiKey = process.env.COINGECKO_API_KEY;
      if (apiKey) {
        url.searchParams.set("x_cg_demo_api_key", apiKey);
      }
```

with:

```ts
    async fetchQuote(symbol: string, apiKey?: string): Promise<QuoteResult> {
      const id = normalizeCryptoSymbol(symbol);
      const url = new URL(COINGECKO_BASE_URL);
      url.searchParams.set("ids", id);
      url.searchParams.set("vs_currencies", "brl");
      if (apiKey) {
        url.searchParams.set("x_cg_demo_api_key", apiKey);
      }
```

(everything else in the method is unchanged)

- [ ] **Step 4: Update the Brapi test file**

In `apps/api/src/modules/investments/pricing/brapi-quote-provider.test.ts`,
replace the whole `describe("createBrapiQuoteProvider", ...)` block's setup
and first test:

```ts
describe("createBrapiQuoteProvider", () => {
  it("lança QuoteProviderError quando nenhuma apiKey é passada", async () => {
    const fetchFn = jest.fn();
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchQuote("PETR4")).rejects.toThrow(
      QuoteProviderError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("retorna a cotação em centavos a partir de regularMarketPrice", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 38.42 }],
      }),
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchQuote("petr4.sa", "test-token");

    expect(result.unitValueCents).toBe(3842);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("https://brapi.dev/api/quote/PETR4"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("lança QuoteProviderError quando a API retorna status de erro", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("INVALIDO", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });

  it("lança QuoteProviderError quando a resposta não tem preço válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("PETR4", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });

  it("lança QuoteProviderError quando fetchFn rejeita (erro de rede)", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("PETR4", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });

  it("lança QuoteProviderError quando a resposta não é JSON válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("PETR4", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });
});
```

Also remove the now-unused `afterEach` import if nothing else in the file
uses it (check the `normalizeB3Symbol` describe block above it — it doesn't,
so remove `afterEach` from the `@jest/globals` import on line 1).

- [ ] **Step 5: Update the CoinGecko test file**

In `apps/api/src/modules/investments/pricing/coingecko-quote-provider.test.ts`,
replace the `describe("createCoinGeckoQuoteProvider", ...)` block's setup
and first two tests:

```ts
describe("createCoinGeckoQuoteProvider", () => {
  it("funciona sem apiKey (tier público)", async () => {
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

  it("inclui x_cg_demo_api_key quando apiKey é passada", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ethereum: { brl: 12000 } }),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await provider.fetchQuote("ETH", "demo-key");

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

  it("lança QuoteProviderError quando fetchFn rejeita (erro de rede)", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando a resposta não é JSON válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });
});
```

Also remove the now-unused `afterEach` import from the top-level
`@jest/globals` import (same reasoning as Step 4).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit -t "QuoteProvider"`
Expected: PASS — both provider test files green with the new
parameter-based assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/investments/pricing/brapi-quote-provider.ts apps/api/src/modules/investments/pricing/coingecko-quote-provider.ts apps/api/src/modules/investments/pricing/types.ts apps/api/src/modules/investments/pricing/brapi-quote-provider.test.ts apps/api/src/modules/investments/pricing/coingecko-quote-provider.test.ts
git commit -m "refactor(api): pass provider api keys as fetchQuote parameters"
```

---

### Task 7: Wire per-user credentials into quote refresh

**Files:**
- Modify: `apps/api/src/modules/investments/pricing/quote-refresh.service.ts`
- Test: `apps/api/src/modules/investments/pricing/quote-refresh.service.test.ts`

**Interfaces:**
- Consumes: `getDecryptedCredential` (Task 4), the new `fetchQuote(symbol, apiKey?)`
  signature (Task 6).

- [ ] **Step 1: Modify `refreshHoldingQuote`**

In `apps/api/src/modules/investments/pricing/quote-refresh.service.ts`,
add the import:

```ts
import { getDecryptedCredential } from "../../provider-credentials/provider-credentials.service.js";
```

Replace:

```ts
  try {
    const result = await provider.fetchQuote(holding.symbol);
```

with:

```ts
  try {
    // Safe: getProvider() above only returns non-null for "brapi"/"coingecko"
    // (see pricingSourceForAssetClass + ROUTABLE_ASSET_CLASSES in types.ts).
    const apiKey = await getDecryptedCredential(
      holding.userId,
      pricingSource as "brapi" | "coingecko",
    );
    const result = await provider.fetchQuote(holding.symbol, apiKey ?? undefined);
```

(the rest of the try block — `upsertCachedQuote`, `applyQuoteToHolding`,
and the `catch` block — is unchanged; the existing catch already converts
any thrown `QuoteProviderError`, including the new "sem chave configurada"
message from Task 6, into `last_quote_error` exactly as it does today)

- [ ] **Step 2: Update the test file**

`quote-refresh.service.test.ts` mocks `@money-manager/db`,
`./quote-cache.repository.js`, and `./quote-router.js` at the top via
`jest.unstable_mockModule`, then does `const { refreshHoldingQuote } =
await import("./quote-refresh.service.js")`. Add a fourth mock for the new
import, right after the existing `quote-router.js` mock block (before the
`await import(...)` line):

```ts
const mockGetDecryptedCredential = jest.fn();
jest.unstable_mockModule(
  "../../provider-credentials/provider-credentials.service.js",
  () => ({ getDecryptedCredential: mockGetDecryptedCredential }),
);
```

In the `describe("refreshHoldingQuote", ...)` block's `beforeEach`, add a
reset line alongside the existing three:

```ts
  beforeEach(() => {
    mockUpdate.mockReturnValue({ set: mockSet });
    mockGetCachedQuote.mockReset();
    mockUpsertCachedQuote.mockReset();
    mockFetchQuote.mockReset();
    mockGetDecryptedCredential.mockReset();
  });
```

The existing test `"busca cotação nova quando cache expirou (background)"`
asserts `expect(mockFetchQuote).toHaveBeenCalledWith("PETR4")` — after this
task's change, `fetchQuote` is always called with two arguments (the
second being `undefined` when no credential is configured), so a
1-argument `toHaveBeenCalledWith` no longer matches. Update that one
assertion:

```ts
    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4", undefined);
```

(this is the only existing assertion that touches `fetchQuote`'s call
arguments — every other existing test either asserts `fetchQuote` was
NOT called, or doesn't inspect its arguments at all, so no other test
needs changes)

Then add two new tests in the same `describe("refreshHoldingQuote", ...)`
block, after the existing `"registra um log de aviso..."` test:

```ts
  it("busca a credencial do usuário e repassa como apiKey ao provider", async () => {
    mockGetCachedQuote.mockResolvedValue(null);
    mockGetDecryptedCredential.mockResolvedValue("chave-do-usuario");
    mockFetchQuote.mockResolvedValue({ unitValueCents: 3900, raw: {} });

    await refreshHoldingQuote(holding() as never, "on-demand");

    expect(mockGetDecryptedCredential).toHaveBeenCalledWith("user1", "brapi");
    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4", "chave-do-usuario");
  });

  it("repassa undefined ao provider quando não há credencial cadastrada", async () => {
    mockGetCachedQuote.mockResolvedValue(null);
    mockGetDecryptedCredential.mockResolvedValue(null);
    mockFetchQuote.mockRejectedValue(
      new Error(
        "Configure sua chave da Brapi em Configurações para ativar a cotação automática.",
      ),
    );

    const result = await refreshHoldingQuote(holding() as never, "on-demand");

    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4", undefined);
    expect(result.lastQuoteError).toBe(
      "Configure sua chave da Brapi em Configurações para ativar a cotação automática.",
    );
  });
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit quote-refresh.service.test.ts`
Expected: PASS, all 9 tests (7 existing + 2 new).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/investments/pricing/quote-refresh.service.ts apps/api/src/modules/investments/pricing/quote-refresh.service.test.ts
git commit -m "feat(api): look up per-user credential before fetching a quote"
```

---

### Task 8: Remove global env vars, add `SETTINGS_ENCRYPTION_KEY`

**Files:**
- Modify: `.env.example`
- Modify: `.env.prod.example`
- Modify: `docker-compose.yml`
- Modify: `docker/compose.prod.yml`

**Interfaces:**
- None (config-only task).

- [ ] **Step 1: Update `.env.example`**

Replace lines 34-36 (the `# ── Cotações RV` section header and the two
key lines):

```
# ── Cotações RV (Brapi / CoinGecko — usadas pela api)
BRAPI_TOKEN=
COINGECKO_API_KEY=
```

with:

```
# ── Chaves por usuário (Brapi / CoinGecko) — configuradas em Settings, não aqui
# ── Criptografia de credenciais por usuário
SETTINGS_ENCRYPTION_KEY=
```

- [ ] **Step 2: Update `.env.prod.example`**

Replace lines 32-34 (identical header wording to `.env.example`):

```
# ── Cotações RV (Brapi / CoinGecko — usadas pela api)
BRAPI_TOKEN=
COINGECKO_API_KEY=
```

with:

```
# ── Chaves por usuário (Brapi / CoinGecko) — configuradas em Settings, não aqui
# ── Criptografia de credenciais por usuário
SETTINGS_ENCRYPTION_KEY=
```

- [ ] **Step 3: Update `docker-compose.yml`**

Replace lines 39-40:

```
      BRAPI_TOKEN: ${BRAPI_TOKEN:-}
      COINGECKO_API_KEY: ${COINGECKO_API_KEY:-}
```

with:

```
      SETTINGS_ENCRYPTION_KEY: ${SETTINGS_ENCRYPTION_KEY:-}
```

- [ ] **Step 4: Update `docker/compose.prod.yml`**

Replace lines 32-33 (same pattern as Step 3):

```
      BRAPI_TOKEN: ${BRAPI_TOKEN:-}
      COINGECKO_API_KEY: ${COINGECKO_API_KEY:-}
```

with:

```
      SETTINGS_ENCRYPTION_KEY: ${SETTINGS_ENCRYPTION_KEY:-}
```

- [ ] **Step 5: Confirm no remaining references**

Run: `grep -rn "BRAPI_TOKEN\|COINGECKO_API_KEY" --include="*.ts" --include="*.yml" --include="*.example" .`
Expected: zero matches (the only remaining references to these names, if
any, would be in this plan/spec's own prose, which grep with those
extensions won't match).

- [ ] **Step 6: Commit**

```bash
git add .env.example .env.prod.example docker-compose.yml docker/compose.prod.yml
git commit -m "chore: replace shared quote provider keys with SETTINGS_ENCRYPTION_KEY"
```

---

### Task 9: Frontend — `ProviderCredentialsSection`

**Files:**
- Create: `apps/web/src/components/features/settings/provider-credentials-section.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `ProviderCredentialSummary`, `ListProviderCredentialsResponse`,
  `SetProviderCredentialBody` (Task 3), `apiFetch` (existing,
  `apps/web/src/lib/api.ts`).

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/features/settings/provider-credentials-section.tsx`:

```tsx
import { useEffect, useState } from "react";
import type {
  ListProviderCredentialsResponse,
  ProviderCredentialProvider,
  ProviderCredentialSummary,
} from "@money-manager/types";
import { KeyRound } from "lucide-react";
import { apiFetch } from "../../../lib/api";

const PROVIDERS: {
  id: ProviderCredentialProvider;
  label: string;
  signupUrl: string;
  signupLabel: string;
}[] = [
  {
    id: "brapi",
    label: "Brapi (ações e FIIs)",
    signupUrl: "https://brapi.dev",
    signupLabel: "brapi.dev",
  },
  {
    id: "coingecko",
    label: "CoinGecko (cripto)",
    signupUrl: "https://www.coingecko.com/api",
    signupLabel: "coingecko.com/api",
  },
];

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(iso),
  );
}

interface ProviderRowProps {
  provider: (typeof PROVIDERS)[number];
  summary: ProviderCredentialSummary | undefined;
  onChanged: () => void;
}

function ProviderRow({ provider, summary, onChanged }: ProviderRowProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/v1/me/provider-credentials/${provider.id}`,
        { method: "PUT", body: JSON.stringify({ apiKey }) },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? "Não foi possível salvar essa chave.",
        );
      }
      setApiKey("");
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar essa chave.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/v1/me/provider-credentials/${provider.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error("Não foi possível remover essa chave.");
      }
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível remover essa chave.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="border-t border-white/5 pt-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-white">{provider.label}</p>

      {error ? (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Chave configurada em {formatUpdatedAt(summary.updatedAt)}
          </p>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing}
            className="btn-ghost text-sm"
          >
            {removing ? "Removendo…" : "Remover"}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-zinc-500">
            Consiga sua chave em{" "}
            <a
              href={provider.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              {provider.signupLabel}
            </a>
            .
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole sua chave aqui"
              className="auth-input flex-1"
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || apiKey.trim() === ""}
              className="btn-primary text-sm"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderCredentialsSection() {
  const [items, setItems] = useState<ProviderCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/v1/me/provider-credentials");
      if (res.ok) {
        const data = (await res.json()) as ListProviderCredentialsResponse;
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="glass mt-6 rounded-2xl p-6">
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="glass mt-6 rounded-2xl p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Chaves de cotação
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Configure suas próprias chaves para cotação automática de ações,
            FIIs e cripto.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            summary={items.find((i) => i.provider === provider.id)}
            onChanged={() => void load()}
          />
        ))}
      </div>
    </div>
  );
}
```

`auth-input`, `btn-primary`, `btn-ghost`, and `glass` are all existing
classes declared in `apps/web/src/index.css` (confirmed: `auth-input` is
the generic styled-text-input class also used by `LoginPage.tsx` and
`RegisterPage.tsx` — not literally auth-only despite the name) — no new
CSS is needed for this component.

- [ ] **Step 2: Wire into `SettingsPage.tsx`**

In `apps/web/src/pages/SettingsPage.tsx`, add the import:

```ts
import { ProviderCredentialsSection } from "../components/features/settings/provider-credentials-section";
```

And add `<ProviderCredentialsSection />` as a sibling right after
`<TelegramLinkSection />`:

```tsx
      <TelegramLinkSection />
      <ProviderCredentialsSection />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @money-manager/web build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/settings/provider-credentials-section.tsx apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): add provider credentials section to settings"
```

---

### Task 10: Integration tests

**Files:**
- Create: `apps/api/tests/integration/provider-credentials.integration.test.ts`
- Modify: `apps/api/tests/integration/investment-holdings.integration.test.ts`

**Interfaces:**
- Consumes: the `/v1/me/provider-credentials` routes (Task 5), the
  `SETTINGS_ENCRYPTION_KEY` test default (Task 2 Step 5).

This module's routes call the real `createBrapiQuoteProvider()` /
`createCoinGeckoQuoteProvider()` with no injected `fetchFn` (see Task 4),
so they use the global `fetch`. Node's `fetch` is a mutable global and
`fetchFn: typeof fetch = fetch` (the providers' default parameter) is
evaluated per-call, not at module load — so monkey-patching
`globalThis.fetch` before a request reaches the controller works. This
suite is the only place that needs to do that; `supertest` itself talks to
the app directly over Node's `http` module and never goes through
`fetch`, so there's no conflict.

- [ ] **Step 1: Write the tests**

Create `apps/api/tests/integration/provider-credentials.integration.test.ts`:

```ts
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

function mockValidBrapiFetch() {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [{ symbol: "PETR4", regularMarketPrice: 38.42 }],
    }),
  }) as unknown as typeof fetch;
}

describeWithDb("provider credentials integration", () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;

  useIntegrationDbLifecycle();

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("GET /v1/me/provider-credentials retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/me/provider-credentials");
    expect(res.status).toBe(401);
  });

  it("PUT /v1/me/provider-credentials/brapi retorna 401 sem auth", async () => {
    const res = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .send({ apiKey: "qualquer-coisa" });
    expect(res.status).toBe(401);
  });

  it("PUT com :provider inválido retorna 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .put("/v1/me/provider-credentials/yahoo")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "qualquer-coisa" });

    expect(res.status).toBe(400);
  });

  it("PUT com apiKey vazia retorna 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "" });

    expect(res.status).toBe(400);
  });

  it("PUT com chave válida salva e GET lista a credencial", async () => {
    const { accessToken } = await registerUser(app);
    mockValidBrapiFetch();

    const putRes = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "chave-valida" });
    expect(putRes.status).toBe(204);

    const getRes = await request(app)
      .get("/v1/me/provider-credentials")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.items[0].provider).toBe("brapi");
    expect(typeof getRes.body.items[0].updatedAt).toBe("string");
  });

  it("PUT com chave rejeitada pelo provider retorna 400 e não salva nada", async () => {
    const { accessToken } = await registerUser(app);
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    const putRes = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "chave-invalida" });
    expect(putRes.status).toBe(400);
    expect(putRes.body.code).toBe("BAD_REQUEST");

    const getRes = await request(app)
      .get("/v1/me/provider-credentials")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.body.items).toHaveLength(0);
  });

  it("DELETE remove uma credencial configurada", async () => {
    const { accessToken } = await registerUser(app);
    mockValidBrapiFetch();
    await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "chave-valida" });

    const deleteRes = await request(app)
      .delete("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get("/v1/me/provider-credentials")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.body.items).toHaveLength(0);
  });

  it("DELETE em provider sem credencial cadastrada retorna 404", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .delete("/v1/me/provider-credentials/coingecko")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Fix `investment-holdings.integration.test.ts`'s BRAPI_TOKEN-based tests**

This existing file has 5 tests that set/delete `process.env.BRAPI_TOKEN`
directly to control whether the Brapi provider succeeds or fails — after
Task 6 removed that env-var read entirely, these tests would silently
break (the provider always gets `undefined` unless a credential exists,
so `fetchSpy` never gets called and every quote fetch fails). Fix each by
configuring a real credential through the new endpoint instead of an env
var — since `setCredential` also calls `fetchQuote` once to validate
before saving (Task 4), and that validation call goes through the same
mocked `globalThis.fetch`, the expected `fetchSpy` call counts in three of
these tests shift up by exactly one (the validation call).

Replace the test at line 171 (`"POST /v1/investment-holdings/:id/refresh-quote
busca cotação e respeita throttle de 1 min"`):

```ts
  it("POST /v1/investment-holdings/:id/refresh-quote busca cotação e respeita throttle de 1 min", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
        }),
      } as Response);

    try {
      await request(app)
        .put("/v1/me/provider-credentials/brapi")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ apiKey: "test-token" });

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
      expect(fetchSpy).toHaveBeenCalledTimes(2); // 1 validação (PUT) + 1 cotação

      const secondRefresh = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(secondRefresh.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // throttled, sem chamada nova
    } finally {
      fetchSpy.mockRestore();
    }
  });
```

Replace the test at (originally) line 221 (`"...nunca retorna erro HTTP
quando o provider falha"`) — this one gets simpler, since "no credential
configured" is now the default state and needs no setup at all:

```ts
  it("POST /v1/investment-holdings/:id/refresh-quote nunca retorna erro HTTP quando o provider falha", async () => {
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

    const res = await request(app)
      .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.lastQuoteError).toContain("Configure sua chave da Brapi");
  });
```

Replace the test at (originally) line 255 (`"GET /v1/patrimony/summary
reflete..."`) — same fix as the first test, add the `PUT` call, no
`fetchSpy` count assertion in this one so nothing else changes:

```ts
  it("GET /v1/patrimony/summary reflete quantity × cotação e byAssetClass real para holdings RV", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .put("/v1/me/provider-credentials/brapi")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ apiKey: "test-token" });

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
      expect(summaryRes.body.investmentsCents).toBe(40000);
      expect(summaryRes.body.byAssetClass).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ class: "stocks", totalCents: 40000 }),
        ]),
      );
      expect(summaryRes.body.quotesStale).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });
```

Replace the test at (originally) line 305 (`"POST /v1/investments/refresh-quotes
atualiza todas as posições RV do usuário em lote"`) — two holdings with
different symbols (PETR4, VALE3), so the batch refresh makes 2 quote
calls; add 1 for the validation call:

```ts
  it("POST /v1/investments/refresh-quotes atualiza todas as posições RV do usuário em lote", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .put("/v1/me/provider-credentials/brapi")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ apiKey: "test-token" });

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
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 validação (PUT) + 2 cotações (PETR4, VALE3)
    } finally {
      fetchSpy.mockRestore();
    }
  });
```

Replace the test at (originally) line 361 (`"compartilha uma única chamada
externa entre duas posições com o mesmo símbolo"`) — two holdings with the
SAME symbol (PETR4), so the batch refresh makes only 1 quote call (second
holding reuses the cache); add 1 for the validation call:

```ts
  it("compartilha uma única chamada externa entre duas posições com o mesmo símbolo", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .put("/v1/me/provider-credentials/brapi")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ apiKey: "test-token" });

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

      // 1 validação (PUT) + 1 cotação: as duas posições PETR4 compartilham o
      // cache, então a segunda não gera uma nova chamada ao provider.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
```

None of these five tests reference `BRAPI_TOKEN` anymore, so the
`originalToken` save/restore boilerplate is gone from all of them — check
after editing that `grep -n "BRAPI_TOKEN" investment-holdings.integration.test.ts`
returns nothing.

- [ ] **Step 3: Run the integration suite**

Run: `cd "apps/api" && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects integration --runInBand provider-credentials.integration.test.ts investment-holdings.integration.test.ts`
Expected: PASS — 8 tests in the new file, all tests in
`investment-holdings.integration.test.ts` (including the 5 just rewritten).

- [ ] **Step 4: Run the full suite**

Run: `pnpm --filter @money-manager/api test`
Expected: PASS — full unit + integration suite green, including every file
touched by Tasks 2, 4, 6, 7.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/integration/provider-credentials.integration.test.ts apps/api/tests/integration/investment-holdings.integration.test.ts
git commit -m "test(api): add provider-credentials integration coverage"
```

---

### Task 11: Browser verification

**Files:** none (manual verification task, no code changes expected).

- [ ] **Step 1: Set `SETTINGS_ENCRYPTION_KEY` locally**

Generate a real 32-byte base64 key and add it to `.env` (and `apps/api/.env`
if running the API standalone outside docker-compose, per this
repo's known `process.cwd()` quirk):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- [ ] **Step 2: Start the dev stack and open Settings**

Start the web + API dev servers, log in with a seeded test user, navigate
to `/settings`. Confirm the new "Chaves de cotação" card renders below the
Telegram section, showing both Brapi and CoinGecko as not-configured, each
with a working link to its signup page.

- [ ] **Step 3: Verify the save flow**

Enter an intentionally invalid string for Brapi, submit, confirm a 400
error renders inline with the "Não foi possível validar essa chave" message
(this exercises the live-validation call for real against the actual Brapi
API, network permitting — if Brapi itself is unreachable from the test
environment, confirm instead that the request fails gracefully with a
sensible error, not a crash).

- [ ] **Step 4: Verify the configured state and removal**

If a real Brapi token is available for testing, save it, confirm the row
switches to "Chave configurada em {date}" with a Remover button, click
Remover, confirm it reverts to the not-configured state. If no real token
is available, verify this state transition instead through the API
directly (`PUT` with a mocked-valid flow isn't possible outside tests) or
note in the report that this step needs a real Brapi token to fully verify
and was skipped.

- [ ] **Step 5: Verify an RV holding without a configured key**

With no Brapi credential configured for the test user, create or refresh a
stocks/FII holding and confirm its quote error now reads "Configure sua
chave da Brapi em Configurações para ativar a cotação automática." instead
of the old "BRAPI_TOKEN ausente" message.

- [ ] **Step 6: Report**

Summarize what was verified, any step skipped (and why), and any console
or network errors observed.
