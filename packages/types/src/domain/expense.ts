export interface Expense {
  id: string;
  userId: string;
  categoryId: string;
  amountCents: number;
  description: string | null;
  establishment: string | null;
  paymentMethod: string | null;
  cardLastFour: string | null;
  source: string | null;
  idempotencyKey: string | null;
  ocrRaw: unknown;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
