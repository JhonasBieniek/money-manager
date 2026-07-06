import { Keyboard } from "grammy";
import type {
  BotUserContextResponse,
  DraftExpenseItem,
  TelegramBotSession,
} from "@money-manager/types";
import { findNextItemIndex } from "./conversation-session.service.js";

const MAX_REPLY_BUTTONS = 8;
const MAX_BUTTON_LABEL = 32;

function truncateLabel(label: string, max = MAX_BUTTON_LABEL): string {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
}

function availableTags(
  context: BotUserContextResponse,
  draft: DraftExpenseItem,
) {
  return context.tags.filter((tag) => !draft.tagIds.includes(tag.id));
}

export function dismissWizardReplyKeyboard(): { remove_keyboard: true } {
  return { remove_keyboard: true };
}

export function buildWizardReplyKeyboard(
  session: TelegramBotSession,
  context: BotUserContextResponse,
  options?: { tagsFollowUp?: boolean },
): Keyboard | undefined {
  const index = findNextItemIndex(session);
  const meta = session.itemMeta[index];
  const draft = session.draftItems[index];
  if (!meta || !draft) {
    return undefined;
  }

  const keyboard = new Keyboard().resized();

  if (!meta.goalCategoryResolved) {
    const goals = context.goals
      .filter((goal) => goal.isActive)
      .slice(0, MAX_REPLY_BUTTONS);
    if (goals.length === 0) {
      return undefined;
    }
    for (const goal of goals) {
      keyboard.text(truncateLabel(goal.label)).row();
    }
    return keyboard;
  }

  if (!meta.paymentMethodResolved) {
    keyboard.text("PIX");
    if (context.creditCards.length > 0) {
      keyboard.text("Cartão");
    }
    keyboard.row().text("Dinheiro").text("Manter PIX");
    return keyboard;
  }

  if (meta.paymentMethod === "credit_card" && !meta.creditCardResolved) {
    if (context.creditCards.length === 0) {
      return undefined;
    }
    const cards = context.creditCards.slice(0, MAX_REPLY_BUTTONS);
    for (const card of cards) {
      keyboard.text(truncateLabel(card.name)).row();
    }
    return keyboard;
  }

  if (!meta.tagsResolved) {
    const tags = availableTags(context, draft).slice(0, MAX_REPLY_BUTTONS);
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i]!;
      if (i > 0 && i % 2 === 0) {
        keyboard.row();
      }
      keyboard.text(tag.name);
    }

    if (tags.length > 0) {
      keyboard.row();
    }

    if (options?.tagsFollowUp || draft.tagIds.length > 0) {
      keyboard.text("Finalizar");
    } else {
      keyboard.text("Pular");
    }

    return keyboard;
  }

  return undefined;
}
