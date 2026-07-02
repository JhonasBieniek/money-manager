import { expect, type Page } from "@playwright/test";

export type CreateExpenseOptions = {
  amount: string;
  description: string;
  categoryLabel?: string;
};

export async function openNewExpenseModal(page: Page) {
  await page.getByRole("link", { name: "Despesas" }).click();
  await expect(page).toHaveURL(/\/dashboard\/expenses/);
  await page.getByRole("button", { name: "Nova despesa" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nova despesa" }),
  ).toBeVisible();
}

export async function fillExpenseForm(
  page: Page,
  { amount, description, categoryLabel = "Prazeres" }: CreateExpenseOptions,
) {
  await page.getByPlaceholder("0,00").fill(amount);
  await page.getByPlaceholder("Ex: Almoço Executivo").fill(description);

  const categoryCombobox = page
    .getByRole("dialog")
    .getByRole("combobox")
    .first();
  await categoryCombobox.click();
  await categoryCombobox.fill(categoryLabel);
  await page
    .getByRole("listbox")
    .getByRole("button", { name: categoryLabel, exact: true })
    .click();
}

export async function submitExpenseForm(page: Page) {
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/expenses") &&
      response.request().method() === "POST" &&
      response.ok(),
  );

  await page.getByRole("button", { name: "Salvar Despesa" }).click();
  await createResponse;
  await expect(page.getByRole("dialog")).toBeHidden();
}

export async function createExpense(page: Page, options: CreateExpenseOptions) {
  await openNewExpenseModal(page);
  await fillExpenseForm(page, options);
  await submitExpenseForm(page);
}

export async function expectExpenseInList(page: Page, description: string) {
  await expect(page.getByRole("heading", { level: 4, name: description })).toBeVisible();
}

export async function expectExpenseOnDashboard(
  page: Page,
  formattedAmount: string,
) {
  await page.getByRole("link", { name: "Resumo" }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta!" })).toBeVisible();

  const expensesCard = page
    .locator("div")
    .filter({ has: page.getByText("Despesas", { exact: true }) })
    .filter({ has: page.locator("h3") })
    .first();

  await expect(expensesCard).toContainText(formattedAmount);
}
