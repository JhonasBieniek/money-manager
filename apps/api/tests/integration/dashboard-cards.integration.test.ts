import { describe, expect, it } from "@jest/globals";
import { findBillingCycleForPurchase } from "@money-manager/utils/billing-cycle";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("dashboard cards fatura total integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("conta a fatura pelo mês do ciclo de faturamento, não pela data da despesa", async () => {
    const { accessToken } = await registerUser(app);

    const cardRes = await request(app)
      .post("/v1/credit-cards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Nubank Roxinho", lastFour: "1234", dueDay: 10 });
    expect(cardRes.status).toBe(201);
    const cardId = cardRes.body.id as string;

    // dueDay 10 / closingOffsetDays padrão 7 fecha por volta do dia 3.
    // Uma compra em 15/06 cai no ciclo de julho (04/06 a 03/07).
    const purchaseDate = new Date(2025, 5, 15);
    const cycle = findBillingCycleForPurchase(purchaseDate, 10, 7);

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 200,
        description: "Mercado (dinheiro)",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        occurredAt: new Date(2025, 5, 10).toISOString(),
      });

    const cardExpenseRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 300,
        description: "Compra no crédito",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseDate.toISOString(),
      });
    expect(cardExpenseRes.status).toBe(201);

    // Junho: nada é contabilizado. O gasto em dinheiro (10/06) é deslocado para
    // o mês seguinte e a fatura do cartão vence em julho.
    const juneRes = await request(app)
      .get("/v1/dashboard/summary?year=2025&month=6")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(juneRes.status).toBe(200);
    expect(juneRes.body.totalExpenses).toBe(0);
    expect(juneRes.body.expensesByCategory).toEqual([]);

    // Mês do ciclo (julho): a fatura do cartão (contada pelo ciclo) e o gasto em
    // dinheiro de junho (deslocado +1 mês) são contabilizados aqui.
    const cycleRes = await request(app)
      .get(`/v1/dashboard/summary?year=${cycle.cycleYear}&month=${cycle.cycleMonth}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(cycleRes.status).toBe(200);
    expect(cycleRes.body.totalExpenses).toBe(50_000);
    expect(cycleRes.body.expensesByCategory).toEqual(
      expect.arrayContaining([
        { category: "Custos Fixos", amount: 20_000 },
        { category: "Prazeres", amount: 30_000 },
      ]),
    );
  });
});
