import { expect, type Page } from "@playwright/test";

export type FillIncomeOptions = {
  amount: string;
  description: string;
};

export async function openNewIncomeModal(page: Page) {
  await page.getByRole("link", { name: "Receitas" }).click();
  await expect(page).toHaveURL(/\/dashboard\/incomes/);
  await page.getByRole("button", { name: "Nova receita" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nova receita" }),
  ).toBeVisible();
}

export async function fillIncomeForm(
  page: Page,
  { amount, description }: FillIncomeOptions,
) {
  await page.getByPlaceholder("0,00").fill(amount);
  await page.getByPlaceholder("Ex: Salário mensal").fill(description);
}

export async function submitIncomeForm(page: Page) {
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/incomes") &&
      response.request().method() === "POST" &&
      response.ok(),
  );

  await page.getByRole("button", { name: "Salvar Receita" }).click();
  await createResponse;
  await expect(page.getByRole("dialog")).toBeHidden();
}

export async function createIncome(page: Page, options: FillIncomeOptions) {
  await openNewIncomeModal(page);
  await fillIncomeForm(page, options);
  await submitIncomeForm(page);
}

export async function expectIncomeInList(page: Page, description: string) {
  await expect(
    page.getByRole("heading", { level: 4, name: description }),
  ).toBeVisible();
}

export async function expectIncomeOnDashboard(
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

  await expect(page.getByTestId("dashboard-total-incomes")).toContainText(
    formattedAmount,
  );
}
