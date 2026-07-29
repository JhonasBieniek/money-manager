import { getDb, userProviderCredentials } from "@money-manager/db";
import type { ProviderCredentialProvider, ProviderCredentialSummary } from "@money-manager/types";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../shared/crypto/secret-encryption.js";
import { createBrapiQuoteProvider } from "../investments/pricing/brapi-quote-provider.js";
import { createCoinGeckoQuoteProvider } from "../investments/pricing/coingecko-quote-provider.js";

const VALIDATION_SYMBOL: Record<ProviderCredentialProvider, string> = {
  brapi: "PETR4",
  coingecko: "bitcoin",
};

async function validateApiKey(provider: ProviderCredentialProvider, apiKey: string): Promise<void> {
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
    provider: row.provider as ProviderCredentialProvider,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function setCredential(
  userId: string,
  provider: ProviderCredentialProvider,
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
  provider: ProviderCredentialProvider,
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
  provider: ProviderCredentialProvider,
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
