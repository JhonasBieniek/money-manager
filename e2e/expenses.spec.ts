import { test, expect } from "./fixtures";
import {
  createExpense,
  expectExpenseInList,
  expectExpenseOnDashboard,
  expectExpenseSaveBlocked,
  fillExpenseForm,
  openNewExpenseModal,
} from "./helpers/expenses";

test.describe("despesas", () => {
  test("cria despesa e exibe na lista e no resumo", async ({
    authenticatedPage: page,
  }) => {
    const description = `E2E Almoço ${Date.now()}`;
    const amount = "42,50";
    const formattedAmount = "R$ 42,50";

    await createExpense(page, { amount, description });
    await expectExpenseInList(page, description);
    await expectExpenseOnDashboard(page, formattedAmount);
  });

  test("mantém modal aberto quando categoria de meta está ausente", async ({
    authenticatedPage: page,
  }) => {
    await openNewExpenseModal(page);
    await fillExpenseForm(page, {
      amount: "10,00",
      description: "Sem categoria",
      categoryLabel: null,
    });
    await expectExpenseSaveBlocked(page);
    await expect(page.getByRole("heading", { name: "Nova despesa" })).toBeVisible();
  });
});
