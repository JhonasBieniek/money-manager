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
