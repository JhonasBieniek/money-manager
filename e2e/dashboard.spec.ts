import { test } from "./fixtures";
import { expectDashboardTotals, navigateToDashboardSummary } from "./helpers/dashboard";
import { createExpense } from "./helpers/expenses";
import { createIncome } from "./helpers/incomes";

test.describe("resumo financeiro", () => {
  test("consolida saldo do mês após despesa e receita", async ({
    authenticatedPage: page,
  }) => {
    const stamp = Date.now();

    await createExpense(page, {
      amount: "100,00",
      description: `E2E Despesa ${stamp}`,
    });
    await createIncome(page, {
      amount: "500,00",
      description: `E2E Receita ${stamp}`,
    });

    await navigateToDashboardSummary(page);
    await expectDashboardTotals(page, {
      incomes: "R$ 500,00",
      expenses: "R$ 100,00",
      balance: "R$ 400,00",
    });
  });
});
