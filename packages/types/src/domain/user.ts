export interface User {
  id: string;
  email: string;
  telegramChatId: bigint | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
