import type { Context } from "grammy";
import type {
  BotUserContextResponse,
  DraftExpenseItem,
  Expense,
  GoalCategory,
  SessionItemMeta,
  TelegramBotSession,
} from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import type { InternalApiClient } from "../api/internal.client.js";
import {
  cancelSession,
  computeNextAction,
  createSession,
  fetchBotContext,
  findNextItemIndex,
  patchSession,
} from "./conversation-session.service.js";
import type { ExpenseTextPatch } from "./parse-expense-text.js";
import { parseExpenseText } from "./parse-expense-text.js";
import { parseExpenseEditText } from "./parse-expense-edit.js";
import type { ExpenseUtteranceItem } from "./parse-expense-utterance.js";
import { resolveCreditCard } from "./resolve-credit-card.js";
import { resolveGoalCategory } from "./resolve-goal-category.js";
import { resolveTags } from "./resolve-tags.js";
import {
  buildWizardReplyKeyboard,
  dismissWizardReplyKeyboard,
} from "./wizard-keyboards.js";
import { normalizeToken } from "../utils/normalize-text.js";

const PAYMENT_METHOD_INDEX: Record<DraftExpenseItem["paymentMethod"], 0 | 1 | 2> = {
  cash: 0,
  credit_card: 1,
  pix: 2,
};

function formatMoneyFromCents(amountCents: number): string {
  return (amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function mapPaymentMethod(
  method: Expense["paymentMethod"],
): DraftExpenseItem["paymentMethod"] {
  if (method === "credit_card") return "credit_card";
  if (method === "cash") return "cash";
  return "pix";
}

function toPaymentMethodIndex(
  method: DraftExpenseItem["paymentMethod"],
): 0 | 1 | 2 {
  return PAYMENT_METHOD_INDEX[method];
}

export function toDraftExpenseItem(expense: Expense): DraftExpenseItem {
  return {
    amountCents: expense.amountCents,
    description: expense.description,
    goalCategory: expense.goalCategory,
    paymentMethod: mapPaymentMethod(expense.paymentMethod),
    creditCardId: expense.creditCardId,
    tagIds: expense.tagIds ?? [],
    occurredAt: expense.occurredAt,
    source:
      expense.source === "telegram_whisper"
        ? "telegram_whisper"
        : "telegram_manual",
  };
}

export function buildDraftExpenseItem(input: {
  amount: number;
  description: string;
  goalCategory?: GoalCategory | null;
  paymentMethod?: DraftExpenseItem["paymentMethod"];
  creditCardId?: string | null;
  tagIds?: string[];
  occurredAt: string;
  source: "telegram_whisper" | "telegram_manual";
}): DraftExpenseItem {
  return {
    amountCents: Math.round(input.amount * 100),
    description: input.description,
    goalCategory: input.goalCategory ?? null,
    paymentMethod: input.paymentMethod ?? "pix",
    creditCardId: input.creditCardId ?? null,
    tagIds: input.tagIds ?? [],
    occurredAt: input.occurredAt,
    source: input.source,
  };
}

function formatPaymentMethodLabel(
  method: DraftExpenseItem["paymentMethod"],
): string {
  if (method === "credit_card") return "Cartão";
  if (method === "cash") return "Dinheiro";
  return "PIX";
}

function buildItemMetaFromDraft(draft: DraftExpenseItem): SessionItemMeta {
  return {
    paymentMethod: draft.paymentMethod,
    goalCategoryResolved: draft.goalCategory !== null,
    paymentMethodResolved: false,
    creditCardResolved:
      draft.paymentMethod !== "credit_card" || draft.creditCardId !== null,
    tagsResolved: false,
  };
}

function buildItemMetaList(draftItems: DraftExpenseItem[]): SessionItemMeta[] {
  return draftItems.map(buildItemMetaFromDraft);
}

export async function createBotExpense(
  internal: InternalApiClient,
  input: {
    chatId: string;
    amount: number;
    description: string;
    goalCategory?: GoalCategory;
    paymentMethod?: DraftExpenseItem["paymentMethod"];
    creditCardId?: string;
    tagIds?: string[];
    occurredAt?: string;
    idempotencyKey: string;
    source: "telegram_whisper" | "telegram_manual";
  },
): Promise<Expense | null> {
  const paymentMethodIndex = toPaymentMethodIndex(input.paymentMethod ?? "pix");
  const res = await internal.postJson("/v1/internal/expenses", {
    chatId: input.chatId,
    amount: input.amount,
    description: input.description,
    goalCategory: input.goalCategory,
    paymentMethodIndex,
    creditCardId: input.creditCardId,
    tagIds: input.tagIds,
    occurredAt: input.occurredAt,
    idempotencyKey: input.idempotencyKey,
    source: input.source,
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as Expense;
}

export function formatGoalsMenu(context: BotUserContextResponse): string {
  const active = context.goals.filter((goal) => goal.isActive);
  if (active.length === 0) {
    return "Nenhuma meta ativa. Configure no site.";
  }
  return active.map((goal) => `${goal.index} ${goal.label}`).join("\n");
}

export function formatTagsMenu(context: BotUserContextResponse): string {
  if (context.tags.length === 0) {
    return "Nenhuma tag cadastrada.";
  }
  return context.tags.map((tag) => `${tag.index} ${tag.name}`).join(" · ");
}

export function formatCreditCardsMenu(context: BotUserContextResponse): string {
  if (context.creditCards.length === 0) {
    return "Nenhum cartão cadastrado. Cadastre no site.";
  }
  return context.creditCards
    .map((card) => `${card.index} ${card.name} ····${card.lastFour}`)
    .join("\n");
}

export function formatBatchRegisteredMessage(draftItems: DraftExpenseItem[]): string {
  if (draftItems.length === 1) {
    const item = draftItems[0]!;
    return [
      "✅ Despesa capturada",
      `${formatMoneyFromCents(item.amountCents)} — ${item.description}`,
      `${item.paymentMethod.toUpperCase()} · ${item.goalCategory ? GOAL_CATEGORY_LABELS[item.goalCategory] : "sem categoria"}`,
    ].join("\n");
  }

  const lines = draftItems.map(
    (item, index) =>
      `${index + 1}) ${formatMoneyFromCents(item.amountCents)} — ${item.description}`,
  );
  return ["✅ Despesas capturadas", ...lines].join("\n");
}

export function formatDraftItemPreview(
  draft: DraftExpenseItem,
  context: BotUserContextResponse,
  index: number,
  total: number,
): string {
  const tagNameById = new Map(context.tags.map((tag) => [tag.id, tag.name]));
  const category = draft.goalCategory
    ? GOAL_CATEGORY_LABELS[draft.goalCategory]
    : "sem categoria";
  const tagNames = draft.tagIds
    .map((id) => tagNameById.get(id))
    .filter(Boolean)
    .join(", ");
  const tagsSuffix = tagNames ? ` - tags: ${tagNames}` : "";
  const prefix = total > 1 ? `Item ${index + 1}/${total} - ` : "";
  return `${prefix}${formatMoneyFromCents(draft.amountCents)} - ${draft.description} - ${category} - ${formatPaymentMethodLabel(draft.paymentMethod)}${tagsSuffix}`;
}

export function formatWizardPrompt(
  session: TelegramBotSession,
  context: BotUserContextResponse,
): string | null {
  const index = findNextItemIndex(session);
  if (index >= session.draftItems.length) {
    return null;
  }

  const meta = session.itemMeta[index]!;
  const draft = session.draftItems[index];
  const total = session.draftItems.length;
  const prefix = total > 1 ? `Item ${index + 1}/${total}` : undefined;

  if (!meta.goalCategoryResolved) {
    return [
      prefix ? `Categoria — ${prefix}` : "Escolha a categoria",
      draft ? `${formatMoneyFromCents(draft.amountCents)} — ${draft.description}` : undefined,
      "Toque em uma opção abaixo ou responda com o número/nome.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (!meta.paymentMethodResolved) {
    return [
      prefix ? `Pagamento — ${prefix}` : "Pagamento",
      `Padrão: ${formatPaymentMethodLabel(draft?.paymentMethod ?? "pix")}`,
      context.creditCards.length > 0
        ? "Toque em uma opção abaixo ou em Manter PIX para continuar."
        : "Toque em PIX, Dinheiro ou Manter PIX abaixo.",
    ].join("\n");
  }

  if (meta.paymentMethod === "credit_card" && !meta.creditCardResolved) {
    return [
      prefix ? `Cartão — ${prefix}` : "💳 Qual cartão?",
      formatCreditCardsMenu(context),
      "Toque em uma opção abaixo ou responda com o número/nome.",
    ].join("\n");
  }

  if (!meta.tagsResolved) {
    const assigned = draft?.tagIds.length ?? 0;
    if (assigned > 0) {
      return [
        "Mais alguma tag?",
        "Toque em outra tag, Finalizar, ou /finalizar para concluir.",
      ].join("\n");
    }
    return [
      prefix ? `Tags (opcional) — ${prefix}` : "Tags (opcional)",
      "Toque em uma tag, Pular para seguir sem tags, ou Finalizar ao concluir.",
    ].join("\n");
  }

  return null;
}

export function formatFinalConfirmation(
  draftItems: DraftExpenseItem[],
  context: BotUserContextResponse,
): string {
  const tagNameById = new Map(context.tags.map((tag) => [tag.id, tag.name]));
  const lines = draftItems.map((item, index) => {
    const category = item.goalCategory
      ? GOAL_CATEGORY_LABELS[item.goalCategory]
      : "sem categoria";
    const tagNames = item.tagIds
      .map((id) => tagNameById.get(id))
      .filter(Boolean)
      .join(", ");
    const tagsSuffix = tagNames ? ` - tags: ${tagNames}` : "";
    const payment = formatPaymentMethodLabel(item.paymentMethod);
    return `${index + 1}) ${formatMoneyFromCents(item.amountCents)} - ${item.description} - ${category} - ${payment}${tagsSuffix}`;
  });

  return ["✅ Lançamento concluído", ...lines, "", formatEditHelp(draftItems.length > 1)].join(
    "\n",
  );
}

function formatEditHelp(multiItem: boolean): string {
  const lines = [
    "Para editar, responda esta mensagem:",
    "",
    "*valor",
    "100,50",
    "",
    "*descrição",
    "mercado",
    "",
    "*categoria",
    "prazeres",
    "",
    "*pagamento",
    "pix",
  ];

  if (multiItem) {
    lines.push("", "No lote, indique o item:", "*2 valor", "100,50");
  }

  return lines.join("\n");
}

async function sendWizardPrompt(
  ctx: Context,
  session: TelegramBotSession,
  context: BotUserContextResponse,
  options?: { tagsFollowUp?: boolean },
): Promise<void> {
  const prompt = formatWizardPrompt(session, context);
  if (!prompt) {
    return;
  }
  const keyboard = buildWizardReplyKeyboard(session, context, options);
  await ctx.reply(prompt, {
    reply_markup: keyboard ?? dismissWizardReplyKeyboard(),
  });
}

function applyPaymentMethodSelection(
  draft: DraftExpenseItem,
  meta: SessionItemMeta,
  method: DraftExpenseItem["paymentMethod"],
): void {
  draft.paymentMethod = method;
  meta.paymentMethod = method;
  meta.paymentMethodResolved = true;
  if (method !== "credit_card") {
    draft.creditCardId = null;
    meta.creditCardResolved = true;
  } else {
    draft.creditCardId = null;
    meta.creditCardResolved = false;
  }
}

function applyPaymentSkip(draft: DraftExpenseItem, meta: SessionItemMeta): void {
  applyPaymentMethodSelection(draft, meta, "pix");
}

async function advanceWizardAfterItemUpdate(
  ctx: Context,
  internal: InternalApiClient,
  session: TelegramBotSession,
  nextDraftItems: DraftExpenseItem[],
  nextItemMeta: SessionItemMeta[],
  index: number,
): Promise<void> {
  const context = await fetchBotContext(internal, session.chatId);
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  const patchedSession = await patchSession(internal, session.id, {
    draftItems: nextDraftItems,
    itemMeta: nextItemMeta,
    pendingItemIndex: index,
  });

  const nextIndex = findNextItemIndex({
    ...patchedSession,
    draftItems: nextDraftItems,
    itemMeta: nextItemMeta,
  });
  const nextAction =
    computeNextAction({
      ...patchedSession,
      draftItems: nextDraftItems,
      itemMeta: nextItemMeta,
      pendingItemIndex: nextIndex,
    }) ?? "none";

  if (nextAction === "none") {
    await finalizeDraftSession(
      ctx,
      internal,
      { ...patchedSession, draftItems: nextDraftItems, itemMeta: nextItemMeta },
      nextDraftItems,
    );
    return;
  }

  const updatedSession = await patchSession(internal, session.id, {
    draftItems: nextDraftItems,
    itemMeta: nextItemMeta,
    pendingAction: nextAction,
    pendingItemIndex: nextIndex,
  });

  await sendWizardPrompt(ctx, updatedSession, context);
}

async function sendTagsFollowUp(
  ctx: Context,
  internal: InternalApiClient,
  session: TelegramBotSession,
): Promise<void> {
  const context = await fetchBotContext(internal, session.chatId);
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  await sendWizardPrompt(ctx, session, context, { tagsFollowUp: true });
}

async function persistDraftItems(
  internal: InternalApiClient,
  session: TelegramBotSession,
  draftItems: DraftExpenseItem[],
): Promise<{ expenseIds: string[]; persistedDrafts: DraftExpenseItem[] } | null> {
  const triggerKeyBase = session.triggerMessageId ?? session.id;
  const expenseIds: string[] = [];
  const persistedDrafts: DraftExpenseItem[] = [];

  for (let index = 0; index < draftItems.length; index++) {
    const draft = draftItems[index]!;
    const expense = await createBotExpense(internal, {
      chatId: session.chatId,
      amount: draft.amountCents / 100,
      description: draft.description,
      goalCategory: draft.goalCategory ?? undefined,
      paymentMethod: draft.paymentMethod,
      creditCardId: draft.creditCardId ?? undefined,
      tagIds: draft.tagIds,
      occurredAt: draft.occurredAt,
      idempotencyKey: `tg:${session.chatId}:${triggerKeyBase}:${index}`,
      source: draft.source,
    });

    if (!expense) {
      return null;
    }

    expenseIds.push(expense.id);
    persistedDrafts.push(toDraftExpenseItem(expense));
  }

  return { expenseIds, persistedDrafts };
}

async function finalizeDraftSession(
  ctx: Context,
  internal: InternalApiClient,
  session: TelegramBotSession,
  draftItems: DraftExpenseItem[],
): Promise<void> {
  const context = await fetchBotContext(internal, session.chatId);
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  const persisted = await persistDraftItems(internal, session, draftItems);
  if (!persisted) {
    await ctx.reply("Não foi possível concluir o lançamento agora. Tente novamente.");
    return;
  }

  const message = await ctx.reply(formatFinalConfirmation(persisted.persistedDrafts, context), {
    reply_markup: dismissWizardReplyKeyboard(),
  });

  await patchSession(internal, session.id, {
    confirmationMessageId: String(message.message_id),
    expenseIds: persisted.expenseIds,
    draftItems: persisted.persistedDrafts,
    itemMeta: persisted.persistedDrafts.map((draft) => ({
      paymentMethod: draft.paymentMethod,
      goalCategoryResolved: true,
      paymentMethodResolved: true,
      creditCardResolved:
        draft.paymentMethod !== "credit_card" || draft.creditCardId !== null,
      tagsResolved: true,
    })),
    pendingAction: "none",
    pendingItemIndex: persisted.persistedDrafts.length,
  });
}

export async function startWizardWithDrafts(
  ctx: Context,
  internal: InternalApiClient,
  input: {
    chatId: string;
    triggerMessageId?: string;
    draftItems: DraftExpenseItem[];
    replacedPrevious?: boolean;
  },
): Promise<void> {
  if (input.replacedPrevious) {
    await ctx.reply("⚠️ Sessão anterior cancelada.");
  }

  const itemMeta = buildItemMetaList(input.draftItems);
  const draftSession: TelegramBotSession = {
    id: "",
    chatId: input.chatId,
    userId: "",
    confirmationMessageId: null,
    triggerMessageId: input.triggerMessageId ?? null,
    expenseIds: [],
    draftItems: input.draftItems,
    pendingAction: "categorize",
    pendingItemIndex: 0,
    itemMeta,
    expiresAt: "",
    createdAt: "",
    updatedAt: "",
  };

  const pendingItemIndex = findNextItemIndex(draftSession);
  const pendingAction =
    computeNextAction({ ...draftSession, pendingItemIndex }) ?? "none";

  const { session, replacedPrevious } = await createSession(internal, {
    chatId: input.chatId,
    triggerMessageId: input.triggerMessageId,
    expenseIds: [],
    draftItems: input.draftItems,
    pendingAction,
    pendingItemIndex,
    itemMeta,
  });

  if (replacedPrevious && !input.replacedPrevious) {
    await ctx.reply("⚠️ Sessão anterior cancelada.");
  }

  await ctx.reply(formatBatchRegisteredMessage(input.draftItems));

  if (pendingAction === "none") {
    await finalizeDraftSession(ctx, internal, session, input.draftItems);
    return;
  }

  const context = await fetchBotContext(internal, input.chatId);
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  await sendWizardPrompt(ctx, session, context);
}

export async function finalizeWizardTagsStep(
  ctx: Context,
  internal: InternalApiClient,
  session: TelegramBotSession,
): Promise<boolean> {
  if (session.pendingAction !== "tags") {
    return false;
  }

  const index = findNextItemIndex(session);
  if (index >= session.draftItems.length) {
    return false;
  }

  const nextDraftItems = [...session.draftItems];
  const nextItemMeta = [...session.itemMeta];
  const meta = { ...nextItemMeta[index]! };
  meta.tagsResolved = true;
  nextItemMeta[index] = meta;

  await advanceWizardAfterItemUpdate(
    ctx,
    internal,
    session,
    nextDraftItems,
    nextItemMeta,
    index,
  );
  return true;
}

function parsePaymentMethodText(
  text: string,
): DraftExpenseItem["paymentMethod"] | null {
  const token = normalizeToken(text);
  if (token === "pix") return "pix";
  if (token === "dinheiro" || token === "cash") return "cash";
  if (token === "cartao" || token === "credito" || token === "cartão") {
    return "credit_card";
  }
  return null;
}

export async function handleWizardInput(
  ctx: Context,
  internal: InternalApiClient,
  session: TelegramBotSession,
  text: string,
): Promise<void> {
  const context = await fetchBotContext(internal, session.chatId);
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  const index = findNextItemIndex(session);
  if (index >= session.draftItems.length) {
    await finalizeDraftSession(ctx, internal, session, session.draftItems);
    return;
  }

  const nextDraftItems = [...session.draftItems];
  const nextItemMeta = [...session.itemMeta];
  const draft = { ...nextDraftItems[index]! };
  const meta = { ...nextItemMeta[index]! };
  const action = computeNextAction({ ...session, pendingItemIndex: index });
  const normalized = normalizeToken(text);

  if (action === "categorize") {
    const resolved = resolveGoalCategory(text, context);
    if (!resolved.ok) {
      await ctx.reply("Categoria inválida. Escolha um número ou nome da lista.");
      await sendWizardPrompt(ctx, session, context);
      return;
    }
    draft.goalCategory = resolved.category;
    meta.goalCategoryResolved = true;
  } else if (action === "payment_method") {
    if (normalized === "pular" || normalized.startsWith("manter")) {
      applyPaymentSkip(draft, meta);
    } else {
      const method = parsePaymentMethodText(text);
      if (!method) {
        const hint =
          context.creditCards.length > 0
            ? "Use PIX, Cartão ou Dinheiro."
            : "Use PIX ou Dinheiro.";
        await ctx.reply(`Método inválido. ${hint}`);
        await sendWizardPrompt(ctx, session, context);
        return;
      }
      if (method === "credit_card" && context.creditCards.length === 0) {
        await ctx.reply("Nenhum cartão cadastrado. Cadastre no site.");
        await sendWizardPrompt(ctx, session, context);
        return;
      }
      applyPaymentMethodSelection(draft, meta, method);
    }
  } else if (action === "credit_card") {
    if (context.creditCards.length === 0) {
      await ctx.reply(
        "Nenhum cartão cadastrado. Cadastre no site e envie o lançamento novamente.",
      );
      return;
    }
    const resolved = resolveCreditCard(text, context);
    if (!resolved.ok) {
      await ctx.reply("Cartão inválido. Escolha um número ou nome da lista.");
      await sendWizardPrompt(ctx, session, context);
      return;
    }
    draft.creditCardId = resolved.creditCardId;
    meta.creditCardResolved = true;
  } else if (action === "tags") {
    if (normalized === "finalizar") {
      meta.tagsResolved = true;
    } else if (normalized === "pular" && draft.tagIds.length === 0) {
      meta.tagsResolved = true;
    } else {
      const resolved = resolveTags(text, context);
      if (!resolved.ok) {
        const names = context.tags.map((tag) => tag.name).join(", ");
        await ctx.reply(`Tag não encontrada. Tags válidas: ${names}`);
        return;
      }
      const newTagIds = resolved.tagIds.filter((id) => !draft.tagIds.includes(id));
      if (newTagIds.length === 0) {
        await ctx.reply("Tag já atribuída.");
        await sendWizardPrompt(ctx, session, context, { tagsFollowUp: true });
        return;
      }
      draft.tagIds = [...draft.tagIds, ...newTagIds];
      nextDraftItems[index] = draft;
      nextItemMeta[index] = meta;
      const patchedSession = await patchSession(internal, session.id, {
        draftItems: nextDraftItems,
        itemMeta: nextItemMeta,
        pendingItemIndex: index,
        pendingAction: "tags",
      });
      await sendTagsFollowUp(ctx, internal, patchedSession);
      return;
    }
  }

  nextDraftItems[index] = draft;
  nextItemMeta[index] = meta;
  await advanceWizardAfterItemUpdate(
    ctx,
    internal,
    session,
    nextDraftItems,
    nextItemMeta,
    index,
  );
}

export async function applyReplyPatches(
  internal: InternalApiClient,
  session: TelegramBotSession,
  text: string,
): Promise<{ error: string | null; draftItems: DraftExpenseItem[] }> {
  const context = await fetchBotContext(internal, session.chatId);
  if (!context) {
    return { error: "Falha ao carregar contexto do usuário.", draftItems: session.draftItems };
  }

  const parsed = parseExpenseEditText(text);
  if (!parsed.isValid || parsed.patches.length === 0) {
    return {
      error: "Responda com * e o novo valor na linha de baixo. Ex.:\n*valor\n100,50",
      draftItems: session.draftItems,
    };
  }

  const targetIndex = parsed.itemIndex !== undefined ? parsed.itemIndex - 1 : 0;
  if (targetIndex < 0 || targetIndex >= session.expenseIds.length) {
    return { error: "Item inválido no lote.", draftItems: session.draftItems };
  }

  const expenseId = session.expenseIds[targetIndex]!;
  const patchBody: Record<string, unknown> = { chatId: session.chatId };

  for (const patch of parsed.patches) {
    if (patch.field === "amount") {
      patchBody.amount = patch.value;
    }
    if (patch.field === "goalCategory") {
      const resolved = resolveGoalCategory(String(patch.value), context);
      if (!resolved.ok) {
        return { error: "Categoria inválida.", draftItems: session.draftItems };
      }
      patchBody.goalCategory = resolved.category;
    }
    if (patch.field === "description") {
      patchBody.description = patch.value;
      if (!patch.literal) {
        const resolved = resolveGoalCategory(String(patch.value), context);
        if (resolved.ok) {
          patchBody.goalCategory = resolved.category;
        }
      }
    }
    if (patch.field === "paymentMethod") {
      patchBody.paymentMethodIndex = toPaymentMethodIndex(
        patch.value as DraftExpenseItem["paymentMethod"],
      );
    }
    if (patch.field === "tags") {
      const resolved = resolveTags(patch.value as string[], context);
      if (!resolved.ok) {
        return { error: "Tag não encontrada.", draftItems: session.draftItems };
      }
      patchBody.tagIds = resolved.tagIds;
    }
  }

  const res = await internal.patchJson(`/v1/internal/expenses/${expenseId}`, patchBody);
  if (!res.ok) {
    return {
      error: "Não foi possível atualizar a despesa.",
      draftItems: session.draftItems,
    };
  }

  const expense = (await res.json()) as Expense;
  const nextDraftItems = [...session.draftItems];
  nextDraftItems[targetIndex] = toDraftExpenseItem(expense);

  await patchSession(internal, session.id, {
    draftItems: nextDraftItems,
    itemMeta: buildItemMetaList(nextDraftItems),
  });

  return { error: null, draftItems: nextDraftItems };
}

export async function cancelActiveSession(
  internal: InternalApiClient,
  chatId: string,
): Promise<void> {
  await cancelSession(internal, chatId);
}

export function isLikelyNewLaunch(text: string): boolean {
  if (hasStructuredCreateLines(text)) {
    return true;
  }
  const parsed = parseExpenseText(text);
  if (parsed.patches.some((patch) => patch.field === "amount")) {
    return true;
  }
  return /^\d+(?:[.,]\d{1,2})?\s+\S+/.test(text.trim());
}

function hasStructuredCreateLines(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some((line) => /^\*\d/.test(line.trim()) || /^\*[\d]/.test(line.trim()));
}

export function patchesToCreateFields(
  patches: ExpenseTextPatch[],
  context: BotUserContextResponse,
): {
  amount?: number;
  description?: string;
  goalCategory?: GoalCategory;
  tagIds?: string[];
  paymentMethod?: DraftExpenseItem["paymentMethod"];
} {
  const result: {
    amount?: number;
    description?: string;
    goalCategory?: GoalCategory;
    tagIds?: string[];
    paymentMethod?: DraftExpenseItem["paymentMethod"];
  } = {};

  for (const patch of patches) {
    if (patch.field === "amount") {
      result.amount = patch.value as number;
    }
    if (patch.field === "description" && typeof patch.value === "string") {
      const resolved = resolveGoalCategory(patch.value, context);
      if (resolved.ok) {
        result.goalCategory = resolved.category;
      } else {
        result.description = patch.value;
      }
    }
    if (patch.field === "tags") {
      const resolved = resolveTags(patch.value as string[], context);
      if (resolved.ok) {
        result.tagIds = resolved.tagIds;
      }
    }
    if (patch.field === "paymentMethod") {
      result.paymentMethod = patch.value as DraftExpenseItem["paymentMethod"];
    }
  }

  return result;
}

export function buildItemMetaFromUtterance(
  item: ExpenseUtteranceItem,
  goalCategory?: GoalCategory | null,
): SessionItemMeta {
  return buildItemMetaFromDraft(
    buildDraftExpenseItem({
      amount: item.amount ?? 0,
      description: item.description ?? "",
      goalCategory,
      paymentMethod: item.paymentMethod ?? "pix",
      occurredAt: new Date().toISOString(),
      source: "telegram_manual",
    }),
  );
}
