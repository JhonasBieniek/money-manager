import { expect, type Page } from "@playwright/test";

/** Mês/ano correntes no formato usado pelos seletores do dashboard ("1".."12"). */
export function currentMonthYear(): { month: string; year: string } {
  const now = new Date();
  return { month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
}

/** Mês/ano seguintes ao corrente (rola o ano em dezembro). */
export function nextMonthYear(): { month: string; year: string } {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { month: String(next.getMonth() + 1), year: String(next.getFullYear()) };
}

/**
 * Seleciona um período (mês/ano) no resumo e aguarda o fetch correspondente.
 * O matcher casa exatamente com o mês/ano alvo, então ignora fetches
 * intermediários disparados ao trocar os dois seletores.
 */
export async function selectDashboardPeriod(
  page: Page,
  month: string,
  year: string,
) {
  const target = page.waitForResponse((response) => {
    if (
      !response.url().includes("/v1/dashboard/summary") ||
      response.request().method() !== "GET" ||
      !response.ok()
    ) {
      return false;
    }
    const params = new URL(response.url()).searchParams;
    return params.get("month") === month && params.get("year") === year;
  });

  await page.getByLabel("Mês").selectOption(month);
  await page.getByLabel("Ano").selectOption(year);
  await target;
}

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
