export type StatementStatus = "open" | "closed" | "paid";

export interface CreditCard {
  id: string;
  userId: string;
  name: string;
  lastFour: string;
  dueDay: number;
  closingDay: number;
  closingOffsetDays: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreditCardStatement {
  id: string;
  creditCardId: string;
  userId: string;
  cycleYear: number;
  cycleMonth: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  calculatedTotalCents: number;
  adjustedTotalCents: number | null;
  status: StatementStatus;
  closedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCardWithCurrentStatement extends CreditCard {
  currentStatement: CreditCardStatement | null;
}

export interface CreateCreditCardBody {
  name: string;
  lastFour: string;
  dueDay: number;
  closingOffsetDays?: number;
}

export interface UpdateCreditCardBody {
  name?: string;
  lastFour?: string;
  dueDay?: number;
  closingOffsetDays?: number;
}

export interface UpdateStatementBody {
  status?: "open" | "closed" | "paid";
  adjustedTotalCents?: number | null;
}

export interface CreditCardListResponse {
  items: CreditCard[];
}

export interface StatementListResponse {
  items: CreditCardStatement[];
}

export interface CurrentStatementsResponse {
  items: CreditCardWithCurrentStatement[];
}
