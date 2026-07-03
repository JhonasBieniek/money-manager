import { test, expect } from "./fixtures";
import {
  createCreditCard,
  createCreditCardExpense,
  expectStatementCalculatedTotal,
  navigateToCreditCards,
} from "./helpers/credit-cards";
import { expectExpenseInList } from "./helpers/expenses";

test.describe("cartões de crédito", () => {
  test("integra cartão, despesa no crédito, lista e fatura", async ({
    authenticatedPage: page,
  }) => {
    const cardName = `E2E Nubank ${Date.now()}`;
    const lastFour = "4242";
    const description = `E2E Compra crédito ${Date.now()}`;
    const amount = "89,90";
    const formattedAmount = "R$ 89,90";

    await navigateToCreditCards(page);
    await createCreditCard(page, { name: cardName, lastFour });
    await createCreditCardExpense(page, {
      amount,
      description,
      cardLabel: cardName,
    });
    await expectExpenseInList(page, description);
    await expectStatementCalculatedTotal(page, cardName, formattedAmount);
  });
});
