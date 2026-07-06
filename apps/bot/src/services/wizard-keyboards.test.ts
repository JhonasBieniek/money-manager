import { describe, expect, it } from "@jest/globals";
import type {
  BotUserContextResponse,
  TelegramBotSession,
} from "@money-manager/types";
import {
  buildWizardReplyKeyboard,
  dismissWizardReplyKeyboard,
} from "./wizard-keyboards.js";

const baseSession = (
  overrides: Partial<TelegramBotSession> = {},
): TelegramBotSession => ({
  id: "session-1",
  chatId: "123",
  userId: "user-1",
  confirmationMessageId: null,
  triggerMessageId: "99",
  expenseIds: [],
  draftItems: [
    {
      amountCents: 15000,
      description: "mercado",
      goalCategory: null,
      paymentMethod: "pix",
      creditCardId: null,
      tagIds: [],
      occurredAt: "2026-07-06T12:00:00.000Z",
      source: "telegram_manual",
    },
  ],
  pendingAction: "categorize",
  pendingItemIndex: 0,
  itemMeta: [
    {
      paymentMethod: "pix",
      goalCategoryResolved: false,
      paymentMethodResolved: false,
      creditCardResolved: true,
      tagsResolved: false,
    },
  ],
  expiresAt: "2026-07-07T12:00:00.000Z",
  createdAt: "2026-07-06T12:00:00.000Z",
  updatedAt: "2026-07-06T12:00:00.000Z",
  ...overrides,
});

const context: BotUserContextResponse = {
  userId: "user-1",
  chatId: "123",
  goals: [
    {
      index: 1,
      category: "needs",
      label: "Necessidades",
      isActive: true,
    },
    {
      index: 2,
      category: "wants",
      label: "Prazeres",
      isActive: true,
    },
  ],
  tags: [
    { index: 1, id: "tag-1", name: "Mercado", parentId: null },
    { index: 2, id: "tag-2", name: "Casa", parentId: null },
  ],
  creditCards: [
    { index: 1, id: "card-1", name: "Nubank", lastFour: "1234" },
  ],
};

describe("dismissWizardReplyKeyboard", () => {
  it("returns remove_keyboard markup", () => {
    expect(dismissWizardReplyKeyboard()).toEqual({ remove_keyboard: true });
  });
});

function buttonLabels(keyboard: { keyboard: { text: string }[][] }) {
  return keyboard.keyboard.flat().map((button) => button.text);
}

describe("buildWizardReplyKeyboard", () => {
  it("builds category buttons during categorize step", () => {
    const keyboard = buildWizardReplyKeyboard(baseSession(), context);
    expect(keyboard).toBeDefined();
    const labels = buttonLabels(keyboard!);
    expect(labels).toContain("Necessidades");
    expect(labels).toContain("Prazeres");
  });

  it("builds payment method buttons", () => {
    const keyboard = buildWizardReplyKeyboard(
      baseSession({
        pendingAction: "payment_method",
        itemMeta: [
          {
            paymentMethod: "pix",
            goalCategoryResolved: true,
            paymentMethodResolved: false,
            creditCardResolved: true,
            tagsResolved: false,
          },
        ],
      }),
      context,
    );
    const labels = buttonLabels(keyboard!);
    expect(labels).toContain("PIX");
    expect(labels).toContain("Cartão");
    expect(labels).toContain("Manter PIX");
  });

  it("omits credit card button when user has no cards", () => {
    const keyboard = buildWizardReplyKeyboard(
      baseSession({
        pendingAction: "payment_method",
        itemMeta: [
          {
            paymentMethod: "pix",
            goalCategoryResolved: true,
            paymentMethodResolved: false,
            creditCardResolved: true,
            tagsResolved: false,
          },
        ],
      }),
      { ...context, creditCards: [] },
    );
    const labels = buttonLabels(keyboard!);
    expect(labels).not.toContain("Cartão");
    expect(labels).toContain("PIX");
  });

  it("builds tag buttons with finish after assignment", () => {
    const keyboard = buildWizardReplyKeyboard(
      baseSession({
        pendingAction: "tags",
        draftItems: [
          {
            amountCents: 15000,
            description: "mercado",
            goalCategory: "needs",
            paymentMethod: "pix",
            creditCardId: null,
            tagIds: ["tag-1"],
            occurredAt: "2026-07-06T12:00:00.000Z",
            source: "telegram_manual",
          },
        ],
        itemMeta: [
          {
            paymentMethod: "pix",
            goalCategoryResolved: true,
            paymentMethodResolved: true,
            creditCardResolved: true,
            tagsResolved: false,
          },
        ],
      }),
      context,
      { tagsFollowUp: true },
    );
    const labels = buttonLabels(keyboard!);
    expect(labels).toContain("Casa");
    expect(labels).toContain("Finalizar");
    expect(labels).not.toContain("Mercado");
  });
});
