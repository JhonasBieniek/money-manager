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

export type TelegramBotPendingAction =
  | "categorize"
  | "payment_method"
  | "credit_card"
  | "tags"
  | "none";

export interface SessionItemMeta {
  paymentMethod: "pix" | "credit_card" | "cash";
  goalCategoryResolved: boolean;
  paymentMethodResolved: boolean;
  creditCardResolved: boolean;
  tagsResolved: boolean;
}

export interface DraftExpenseItem {
  amountCents: number;
  description: string;
  goalCategory: import("./goals.js").GoalCategory | null;
  paymentMethod: "pix" | "credit_card" | "cash";
  creditCardId: string | null;
  tagIds: string[];
  occurredAt: string;
  source: "telegram_whisper" | "telegram_manual";
}

export interface TelegramBotSession {
  id: string;
  chatId: string;
  userId: string;
  confirmationMessageId: string | null;
  triggerMessageId: string | null;
  expenseIds: string[];
  draftItems: DraftExpenseItem[];
  pendingAction: TelegramBotPendingAction;
  pendingItemIndex: number;
  itemMeta: SessionItemMeta[];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBotSessionBody {
  chatId: string;
  triggerMessageId?: string;
  expenseIds?: string[];
  draftItems: DraftExpenseItem[];
  pendingAction: TelegramBotPendingAction;
  pendingItemIndex?: number;
  itemMeta: SessionItemMeta[];
  expiresAt?: string;
}

export interface PatchBotSessionBody {
  confirmationMessageId?: string | null;
  expenseIds?: string[];
  draftItems?: DraftExpenseItem[];
  pendingAction?: TelegramBotPendingAction;
  pendingItemIndex?: number;
  itemMeta?: SessionItemMeta[];
  expiresAt?: string;
}

export interface BotSessionResponse {
  session: TelegramBotSession;
  replacedPrevious?: boolean;
}

export interface BotContextGoalItem {
  index: number;
  category: import("./goals.js").GoalCategory;
  label: string;
  isActive: boolean;
}

export interface BotContextTagItem {
  index: number;
  id: string;
  name: string;
  parentId: string | null;
}

export interface BotContextCreditCardItem {
  index: number;
  id: string;
  name: string;
  lastFour: string;
}

export interface BotUserContextResponse {
  userId: string;
  chatId: string;
  goals: BotContextGoalItem[];
  tags: BotContextTagItem[];
  creditCards: BotContextCreditCardItem[];
}

export interface InboundMessageDto {
  id: string;
  chatId: string;
  telegramMessageId: string;
  kind: "voice" | "audio" | "text";
  fileId: string | null;
  transcription: string | null;
  status: string;
  syncError: string | null;
  expenseIds: string[] | null;
  messageAt: string;
  retryCount: number;
  nextRetryAt: string | null;
}
