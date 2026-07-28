export type PiggyBankStatus = "active" | "completed";
export type PiggyBankTransactionType = "deposit" | "withdrawal";

export interface PiggyBank {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  currentAmountCents: number;
  targetAmountCents: number | null;
  goalDescription: string | null;
  targetDate: string | null;
  status: PiggyBankStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PiggyBankTransaction {
  id: string;
  piggyBankId: string;
  type: PiggyBankTransactionType;
  amountCents: number;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface CreatePiggyBankBody {
  name: string;
  icon?: string | null;
  targetAmountCents?: number | null;
  goalDescription?: string | null;
  targetDate?: string | null;
}

export interface UpdatePiggyBankBody {
  name?: string;
  icon?: string | null;
  targetAmountCents?: number | null;
  goalDescription?: string | null;
  targetDate?: string | null;
}

export interface PiggyBankTransactionBody {
  amountCents: number;
  note?: string;
}

export interface UpdatePiggyBankStatusBody {
  status: PiggyBankStatus;
}

export interface PiggyBankTransactionListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PiggyBankTransactionListResponse {
  items: PiggyBankTransaction[];
  meta: PiggyBankTransactionListMeta;
}
