import { test } from "./fixtures";
import {
  createExpense,
  expectExpenseInList,
  expectExpenseOnDashboard,
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
});
