export const INVESTMENT_ACCOUNT_TYPES = [
  "brokerage",
  "crypto",
  "fixed_income",
  "pension",
  "real_estate",
  "cash",
  "other",
] as const;

export type InvestmentAccountType = (typeof INVESTMENT_ACCOUNT_TYPES)[number];

export const INVESTMENT_ACCOUNT_TYPE_LABELS: Record<
  InvestmentAccountType,
  string
> = {
  brokerage: "Corretora",
  crypto: "Cripto",
  fixed_income: "Renda fixa",
  pension: "Previdência",
  real_estate: "Imóveis",
  cash: "Caixa",
  other: "Outro",
};

export type IncomeType = "fixed_income" | "variable_income";

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

export interface InvestmentAccount {
  id: string;
  userId: string;
  name: string;
  type: InvestmentAccountType;
  institution: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

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

export interface CreateInvestmentAccountBody {
  name: string;
  type: InvestmentAccountType;
  institution?: string | null;
}

export interface UpdateInvestmentAccountBody {
  name?: string;
  type?: InvestmentAccountType;
  institution?: string | null;
}

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

export interface UpdateInvestmentHoldingBody {
  symbol?: string;
  maturityDate?: string | null;
  notes?: string | null;
}

export interface UpdateHoldingValuationBody {
  currentUnitValueCents: number;
}

export interface UpdateHoldingQuoteModeBody {
  manualOverride: boolean;
}

export interface PatrimonyAssetClassBucket {
  class: AssetClass | "fixed_income_group";
  label: string;
  totalCents: number;
  percentage: number;
}

export interface PatrimonyAccountBucket {
  accountId: string;
  name: string;
  totalCents: number;
}

export interface PatrimonyUpcomingMaturity {
  holdingId: string;
  name: string;
  maturityDate: string;
  totalCents: number;
}

export interface PatrimonySummary {
  totalAssetsCents: number;
  investmentsCents: number;
  piggyBanksCents: number;
  byAssetClass: PatrimonyAssetClassBucket[];
  byAccount: PatrimonyAccountBucket[];
  lastUpdatedAt: string | null;
  quotesStale: boolean;
  upcomingMaturities: PatrimonyUpcomingMaturity[];
}

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
  patrimonyIndexed: number | null;
  ipcaAccumulatedPct: number | null;
  cdiAccumulatedPct: number | null;
}

export interface BenchmarkComparison {
  series: BenchmarkComparisonPoint[];
  portfolioReturnPct: number | null;
  cdiReturnPct: number | null;
}
