import { test, expect } from "./fixtures";
import {
  createIncome,
  expectIncomeInList,
  expectIncomeOnDashboard,
} from "./helpers/incomes";

test.describe("receitas", () => {
  test("cria receita e exibe na lista e no resumo", async ({
    authenticatedPage: page,
  }) => {
    const description = `E2E Salário ${Date.now()}`;
    const amount = "5000,00";
    const formattedAmount = "R$ 5.000,00";

    await createIncome(page, { amount, description });
    await expectIncomeInList(page, description);
    await expectIncomeOnDashboard(page, formattedAmount);
  });
});
