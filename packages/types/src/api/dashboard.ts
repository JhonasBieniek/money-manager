import type { GoalCategory } from "./goals.js";

export interface DashboardExpenseByCategory {
  category: string;
  amount: number;
}

export interface DashboardGoalUsage {
  category: GoalCategory;
  percentage: number;
  ceiling: number;
  spent: number;
  usagePercent: number;
}

export interface DashboardSummary {
  totalIncomes: number;
  totalExpenses: number;
  balance: number;
  expensesByCategory: DashboardExpenseByCategory[];
  goalsUsage: DashboardGoalUsage[];
}

export interface DashboardHistoryMonth {
  month: string;
  year: number;
  monthNum: number;
  incomes: number;
  expenses: number;
  balance: number;
}

export interface DashboardHistoryResponse {
  items: DashboardHistoryMonth[];
}
