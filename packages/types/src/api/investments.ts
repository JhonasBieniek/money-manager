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
  currentUnitValueCents: number;
  maturityDate: string | null;
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
  currentUnitValueCents: number;
  incomeType?: IncomeType;
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

export interface PatrimonyAssetClassBucket {
  class: "fixed_income_group";
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
  quotesStale: false;
  upcomingMaturities: PatrimonyUpcomingMaturity[];
}
