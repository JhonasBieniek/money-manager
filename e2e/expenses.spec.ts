import { test, expect } from "./fixtures";
import {
  createExpense,
  expectExpenseInList,
  expectExpenseOnDashboard,
} from "./helpers/expenses";

test.describe("expenses", () => {
  test("creates an expense and shows it on the list and dashboard", async ({
    authenticatedPage: page,
  }) => {
    const description = `E2E Almoço ${Date.now()}`;
    const amount = "42,50";
    const formattedAmount = "R$ 42,50";

    await createExpense(page, { amount, description });
    await expectExpenseInList(page, description);
    await expectExpenseOnDashboard(page, formattedAmount);
  });

  test("keeps the expense modal open when goal category is missing", async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole("link", { name: "Despesas" }).click();
    await page.getByRole("button", { name: "Nova despesa" }).click();

    await page.getByPlaceholder("0,00").fill("10,00");
    await page.getByPlaceholder("Ex: Almoço Executivo").fill("Sem categoria");

    const createResponse = page
      .waitForResponse(
        (response) =>
          response.url().includes("/v1/expenses") &&
          response.request().method() === "POST",
        { timeout: 1_500 },
      )
      .catch(() => null);

    await page.getByRole("button", { name: "Salvar Despesa" }).click();

    expect(await createResponse).toBeNull();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nova despesa" }),
    ).toBeVisible();
  });
});
