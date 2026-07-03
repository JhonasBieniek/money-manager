import { expect, type Page } from "@playwright/test";
import {
  fillExpenseForm,
  openNewExpenseModal,
  submitExpenseForm,
} from "./expenses";

export type CreateCreditCardOptions = {
  name: string;
  lastFour: string;
  dueDay?: string;
};

export async function navigateToCreditCards(page: Page) {
  const statementsResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/credit-cards/statements/current") &&
      response.request().method() === "GET" &&
      response.ok(),
  );

  await page.getByRole("link", { name: "Cartões" }).click();
  await expect(page).toHaveURL(/\/dashboard\/cards/);
  await expect(
    page.getByRole("heading", { name: "Cartões e Faturas" }),
  ).toBeVisible();
  await statementsResponse;
}

export async function openNewCreditCardModal(page: Page) {
  await page.getByRole("button", { name: "Novo cartão" }).click();
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible();
}

export async function fillCreditCardForm(
  page: Page,
  { name, lastFour, dueDay = "10" }: CreateCreditCardOptions,
) {
  const form = page.locator("form").filter({
    has: page.getByPlaceholder("Nubank Roxinho"),
  });

  await form.getByPlaceholder("Nubank Roxinho").fill(name);
  await form.locator('input[maxlength="4"]').fill(lastFour);
  await form.locator('input[type="number"]').fill(dueDay);
}

export async function submitCreditCardForm(page: Page) {
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/credit-cards") &&
      response.request().method() === "POST" &&
      response.ok(),
  );

  await page.getByRole("button", { name: "Criar cartão" }).click();
  await createResponse;
  await expect(
    page.getByRole("heading", { name: "Novo cartão" }),
  ).toBeHidden();
}

export async function createCreditCard(
  page: Page,
  options: CreateCreditCardOptions,
) {
  await openNewCreditCardModal(page);
  await fillCreditCardForm(page, options);
  await submitCreditCardForm(page);
}

export async function createCreditCardExpense(
  page: Page,
  options: {
    amount: string;
    description: string;
    cardLabel: string;
    categoryLabel?: string;
  },
) {
  await openNewExpenseModal(page);
  await fillExpenseForm(page, {
    amount: options.amount,
    description: options.description,
    categoryLabel: options.categoryLabel,
  });
  await page.getByRole("dialog").getByRole("button", { name: "Cartão" }).click();

  const cardCombobox = page.getByPlaceholder("Selecione o cartão…");
  await cardCombobox.click();
  await cardCombobox.fill(options.cardLabel);
  await page
    .getByRole("listbox")
    .getByRole("button", { name: new RegExp(options.cardLabel) })
    .click();

  await submitExpenseForm(page);
}

export async function expectStatementCalculatedTotal(
  page: Page,
  cardName: string,
  formattedAmount: string,
) {
  await navigateToCreditCards(page);

  const cardSection = page
    .locator(".glass")
    .filter({ hasText: cardName })
    .first();
  await expect(cardSection.getByText("Calculado")).toBeVisible();
  await expect(cardSection).toContainText(formattedAmount);
}
