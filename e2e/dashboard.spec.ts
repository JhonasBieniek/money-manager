import { test } from "./fixtures";
import {
  expectDashboardTotals,
  navigateToDashboardSummary,
  nextMonthYear,
  selectDashboardPeriod,
} from "./helpers/dashboard";
import { createExpense } from "./helpers/expenses";
import { createIncome } from "./helpers/incomes";

test.describe("resumo financeiro", () => {
  test("desloca o gasto para o mês seguinte e mantém a receita no mês corrente", async ({
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

    // Mês corrente: a receita conta, mas o gasto (não-cartão) foi deslocado
    // para o mês seguinte, então as despesas do mês corrente ficam zeradas.
    await navigateToDashboardSummary(page);
    await expectDashboardTotals(page, {
      incomes: "R$ 500,00",
      expenses: "R$ 0,00",
      balance: "R$ 500,00",
    });

    // Mês seguinte: o gasto de hoje é contabilizado aqui.
    const next = nextMonthYear();
    await selectDashboardPeriod(page, next.month, next.year);
    await expectDashboardTotals(page, {
      incomes: "R$ 0,00",
      expenses: "R$ 100,00",
      balance: "-R$ 100,00",
    });
  });
});
