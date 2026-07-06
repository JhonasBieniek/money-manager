import type {
  BotUserContextResponse,
  DraftExpenseItem,
  SessionItemMeta,
  TelegramBotSession,
} from "@money-manager/types";
import type { InternalApiClient } from "../api/internal.client.js";

export async function fetchBotContext(
  internal: InternalApiClient,
  chatId: string,
): Promise<BotUserContextResponse | null> {
  const res = await internal.getJson(
    `/v1/internal/users/by-chat/${encodeURIComponent(chatId)}/context`,
  );
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as BotUserContextResponse;
}

export async function getActiveSession(
  internal: InternalApiClient,
  chatId: string,
): Promise<TelegramBotSession | null> {
  const res = await internal.getJson(
    `/v1/internal/telegram/sessions/by-chat/${encodeURIComponent(chatId)}`,
  );
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { session: TelegramBotSession };
  return body.session;
}

export async function createSession(
  internal: InternalApiClient,
  body: {
    chatId: string;
    triggerMessageId?: string;
    expenseIds?: string[];
    draftItems: DraftExpenseItem[];
    pendingAction: TelegramBotSession["pendingAction"];
    pendingItemIndex?: number;
    itemMeta: SessionItemMeta[];
  },
): Promise<{ session: TelegramBotSession; replacedPrevious: boolean }> {
  const res = await internal.postJson("/v1/internal/telegram/sessions", body);
  if (!res.ok) {
    throw new Error(`Failed to create session: HTTP ${res.status}`);
  }
  return (await res.json()) as {
    session: TelegramBotSession;
    replacedPrevious: boolean;
  };
}

export async function patchSession(
  internal: InternalApiClient,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<TelegramBotSession> {
  const res = await internal.patchJson(
    `/v1/internal/telegram/sessions/${sessionId}`,
    body,
  );
  if (!res.ok) {
    throw new Error(`Failed to patch session: HTTP ${res.status}`);
  }
  const payload = (await res.json()) as { session: TelegramBotSession };
  return payload.session;
}

export async function cancelSession(
  internal: InternalApiClient,
  chatId: string,
): Promise<void> {
  const res = await internal.deleteJson(
    `/v1/internal/telegram/sessions/by-chat/${encodeURIComponent(chatId)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to cancel session: HTTP ${res.status}`);
  }
}

export function computeNextAction(
  session: TelegramBotSession,
): TelegramBotSession["pendingAction"] | null {
  for (let index = session.pendingItemIndex; index < session.draftItems.length; index++) {
    const meta = session.itemMeta[index];
    if (!meta) {
      continue;
    }
    if (!meta.goalCategoryResolved) {
      return "categorize";
    }
    if (!meta.paymentMethodResolved) {
      return "payment_method";
    }
    if (meta.paymentMethod === "credit_card" && !meta.creditCardResolved) {
      return "credit_card";
    }
    if (!meta.tagsResolved) {
      return "tags";
    }
  }
  return "none";
}

export function findNextItemIndex(session: TelegramBotSession): number {
  for (let index = 0; index < session.draftItems.length; index++) {
    const meta = session.itemMeta[index];
    if (!meta) {
      continue;
    }
    if (
      !meta.goalCategoryResolved ||
      !meta.paymentMethodResolved ||
      (meta.paymentMethod === "credit_card" && !meta.creditCardResolved) ||
      !meta.tagsResolved
    ) {
      return index;
    }
  }
  return session.draftItems.length;
}
