import { expect, type Page } from "@playwright/test";
import { nextMonthYear, selectDashboardPeriod } from "./dashboard";

export type FillExpenseOptions = {
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
  { amount, description, categoryLabel = "Prazeres" }: FillExpenseOptions,
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

export async function createExpense(page: Page, options: FillExpenseOptions) {
  await openNewExpenseModal(page);
  await fillExpenseForm(page, options);
  await submitExpenseForm(page);
}

export async function expectExpenseInList(page: Page, description: string) {
  await expect(
    page.getByRole("heading", { level: 4, name: description }),
  ).toBeVisible();
}

/**
 * Um gasto (não-cartão) é contabilizado no mês seguinte ao da data do gasto.
 * Como o gasto do teste é criado hoje, navegamos até o mês seguinte no resumo
 * para verificar que ele aparece lá.
 */
export async function expectExpenseOnDashboard(
  page: Page,
  formattedAmount: string,
) {
  const summaryResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/dashboard/summary") &&
      response.request().method() === "GET" &&
      response.ok(),
  );

  await page.getByRole("link", { name: "Resumo" }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await summaryResponse;
  await expect(
    page.getByRole("heading", { name: "Bem-vindo de volta!" }),
  ).toBeVisible();

  const next = nextMonthYear();
  await selectDashboardPeriod(page, next.month, next.year);

  await expect(page.getByTestId("dashboard-total-expenses")).toContainText(
    formattedAmount,
  );
}
