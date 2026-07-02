export interface LinkTokenResponse {
  token: string;
  expiresAt: string;
  startCommand: string;
  botUsername: string | null;
  botDeepLink: string | null;
}

export interface TelegramBotInfoResponse {
  botUsername: string | null;
  botUrl: string | null;
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
