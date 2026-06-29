export interface LinkTokenResponse {
  token: string;
  expiresAt: string;
  startCommand: string;
}

export interface TelegramAccountResponse {
  userId: string;
  chatId: string;
  username: string | null;
  linkedAt: string;
}

export interface InternalLinkBody {
  token: string;
  chatId: string;
  username?: string;
}
