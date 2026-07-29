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
