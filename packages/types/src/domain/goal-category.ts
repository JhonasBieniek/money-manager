export const GOAL_CATEGORIES = [
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  "liberdade-financeira": "Liberdade Financeira",
  "custos-fixos": "Custos Fixos",
  conforto: "Conforto",
  metas: "Metas",
  prazeres: "Prazeres",
  conhecimento: "Conhecimento",
};
