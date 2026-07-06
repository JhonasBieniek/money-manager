import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  type BotUserContextResponse,
} from "@money-manager/types";
import { listCreditCards } from "../credit-cards/credit-cards.service.js";
import { listGoals } from "../goals/goals.service.js";
import { listTags } from "../tags/tags.service.js";
import { getAccountByChatId } from "./telegram.service.js";

export async function getBotUserContext(
  chatId: string,
): Promise<BotUserContextResponse> {
  const account = await getAccountByChatId(chatId);
  const userId = account.userId;

  const [goals, tags, creditCards] = await Promise.all([
    listGoals(userId),
    listTags(userId, {}),
    listCreditCards(userId),
  ]);

  const goalsByCategory = new Map(goals.map((goal) => [goal.category, goal]));

  const contextGoals = GOAL_CATEGORIES.map((category, index) => {
    const goal = goalsByCategory.get(category);
    return {
      index: index + 1,
      category,
      label: GOAL_CATEGORY_LABELS[category],
      isActive: goal?.isActive ?? false,
    };
  });

  const sortedTags = [...tags.items].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  const sortedCards = [...creditCards.items].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  return {
    userId,
    chatId,
    goals: contextGoals,
    tags: sortedTags.map((tag, index) => ({
      index: index + 1,
      id: tag.id,
      name: tag.name,
      parentId: tag.parentId,
    })),
    creditCards: sortedCards.map((card, index) => ({
      index: index + 1,
      id: card.id,
      name: card.name,
      lastFour: card.lastFour,
    })),
  };
}
