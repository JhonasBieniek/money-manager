import { expect, type Page } from "@playwright/test";

export async function navigateToDashboardSummary(page: Page) {
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
}

export async function expectDashboardTotals(
  page: Page,
  {
    incomes,
    expenses,
    balance,
  }: { incomes: string; expenses: string; balance: string },
) {
  await expect(page.getByTestId("dashboard-total-incomes")).toContainText(
    incomes,
  );
  await expect(page.getByTestId("dashboard-total-expenses")).toContainText(
    expenses,
  );
  await expect(page.getByTestId("dashboard-balance")).toContainText(balance);
}
