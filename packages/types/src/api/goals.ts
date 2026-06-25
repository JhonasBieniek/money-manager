export type GoalCategory =
  | "liberdade-financeira"
  | "custos-fixos"
  | "conforto"
  | "metas"
  | "prazeres"
  | "conhecimento";

export const GOAL_CATEGORIES: GoalCategory[] = [
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
];

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  "liberdade-financeira": "Liberdade Financeira",
  "custos-fixos": "Custos Fixos",
  conforto: "Conforto",
  metas: "Metas",
  prazeres: "Prazeres",
  conhecimento: "Conhecimento",
};

export interface Goal {
  id: string;
  userId: string;
  category: GoalCategory;
  percentage: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalListResponse {
  items: Goal[];
}

export interface GoalWithUsage extends Goal {
  percentageValue: number;
  ceiling: number;
  spent: number;
  usagePercent: number;
}

export interface GoalUsageResponse {
  items: GoalWithUsage[];
}

export interface UpsertGoalsBody {
  goals: Array<{
    category: GoalCategory;
    percentage: number;
  }>;
}
