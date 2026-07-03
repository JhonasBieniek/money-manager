import { describe, expect, it } from "@jest/globals";
import { getPool } from "@money-manager/db";
import {
  addDays,
  findCurrentBillingCycle,
  nextBillingCycle,
} from "@money-manager/utils/billing-cycle";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("credit-cards integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  const DUE_DAY = 10;
  const CLOSING_OFFSET = 7;

  function billingTestContext(referenceDate = new Date()) {
    const cycle = findCurrentBillingCycle(
      referenceDate,
      DUE_DAY,
      CLOSING_OFFSET,
    );
    const purchaseDate = addDays(cycle.periodStart, 5);
    const next = nextBillingCycle(
      cycle.cycleYear,
      cycle.cycleMonth,
      DUE_DAY,
      CLOSING_OFFSET,
    );

    return {
      cycleYear: cycle.cycleYear,
      cycleMonth: cycle.cycleMonth,
      purchaseIso: purchaseDate.toISOString(),
      nextYear: next.cycleYear,
      nextMonth: next.cycleMonth,
    };
  }

  async function createCard(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app)
      .post("/v1/credit-cards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Nubank Roxinho",
        lastFour: "1234",
        dueDay: 10,
        ...overrides,
      });
    return res;
  }

  async function getStatement(
    accessToken: string,
    cardId: string,
    year: number,
    month: number,
  ) {
    const res = await request(app)
      .get(`/v1/credit-cards/${cardId}/statements?year=${year}&month=${month}`)
      .set("Authorization", `Bearer ${accessToken}`);
    return res.body.items[0] as { id: string; calculatedTotalCents: number; status: string } | undefined;
  }

  it("POST /v1/credit-cards cria cartão com fechamento calculado", async () => {
    const { accessToken } = await registerUser(app);
    const res = await createCard(accessToken);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Nubank Roxinho");
    expect(res.body.closingDay).toBe(3);
    expect(res.body.closingOffsetDays).toBe(7);
  });

  it("GET /v1/credit-cards/statements/current retorna fatura do período", async () => {
    const { accessToken } = await registerUser(app);
    await createCard(accessToken);

    const res = await request(app)
      .get("/v1/credit-cards/statements/current")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].currentStatement).not.toBeNull();
    expect(res.body.items[0].currentStatement.status).toBe("open");
  });

  it("despesa em cartão aloca na fatura correta", async () => {
    const { accessToken } = await registerUser(app);
    const cardRes = await createCard(accessToken);
    const cardId = cardRes.body.id as string;
    const { cycleYear, cycleMonth, purchaseIso } = billingTestContext();

    const expenseRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 99.9,
        description: "Compra crédito",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseIso,
      });

    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.creditCardId).toBe(cardId);
    expect(expenseRes.body.creditCardStatementId).toBeTruthy();
    expect(expenseRes.body.cardLastFour).toBe("1234");

    const statementsRes = await request(app)
      .get(
        `/v1/credit-cards/statements/current?year=${cycleYear}&month=${cycleMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);

    expect(statementsRes.status).toBe(200);
    const statement = statementsRes.body.items[0].currentStatement;
    expect(statement.calculatedTotalCents).toBe(9990);
  });

  it("despesa em ciclo fechado vai para próxima fatura aberta", async () => {
    const { accessToken } = await registerUser(app);
    const cardRes = await createCard(accessToken);
    const cardId = cardRes.body.id as string;
    const {
      cycleYear,
      cycleMonth,
      nextYear,
      nextMonth,
      purchaseIso,
    } = billingTestContext();

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 10,
        description: "Seed ciclo atual",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseIso,
      });

    const currentStatement = await getStatement(
      accessToken,
      cardId,
      cycleYear,
      cycleMonth,
    );
    expect(currentStatement).toBeDefined();
    const statementId = currentStatement!.id;

    await request(app)
      .patch(`/v1/credit-cards/${cardId}/statements/${statementId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "closed" });

    const expenseRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 50,
        description: "Após fechamento",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseIso,
      });

    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.creditCardStatementId).not.toBe(statementId);

    const closedRes = await request(app)
      .get(
        `/v1/credit-cards/${cardId}/statements?year=${cycleYear}&month=${cycleMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);
    expect(closedRes.body.items[0].calculatedTotalCents).toBe(1000);

    const nextStatement = await getStatement(
      accessToken,
      cardId,
      nextYear,
      nextMonth,
    );
    expect(nextStatement?.calculatedTotalCents).toBe(5000);
  });

  it("reabrir fatura move despesas de volta quando couber no período", async () => {
    const { accessToken } = await registerUser(app);
    const cardRes = await createCard(accessToken);
    const cardId = cardRes.body.id as string;
    const {
      cycleYear,
      cycleMonth,
      nextYear,
      nextMonth,
      purchaseIso,
    } = billingTestContext();

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 30,
        description: "No ciclo atual",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseIso,
      });

    const currentStatement = await getStatement(
      accessToken,
      cardId,
      cycleYear,
      cycleMonth,
    );
    expect(currentStatement).toBeDefined();
    const currentStatementId = currentStatement!.id;

    await request(app)
      .patch(`/v1/credit-cards/${cardId}/statements/${currentStatementId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "closed" });

    const laterPurchase = addDays(
      findCurrentBillingCycle(new Date(), DUE_DAY, CLOSING_OFFSET).periodStart,
      10,
    );

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 20,
        description: "Escapou para próximo ciclo",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: laterPurchase.toISOString(),
      });

    const nextStatement = await getStatement(
      accessToken,
      cardId,
      nextYear,
      nextMonth,
    );
    expect(nextStatement).toBeDefined();
    const nextStatementId = nextStatement!.id;

    await request(app)
      .patch(`/v1/credit-cards/${cardId}/statements/${currentStatementId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "open" });

    const currentAfter = await request(app)
      .get(
        `/v1/credit-cards/${cardId}/statements?year=${cycleYear}&month=${cycleMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);
    const nextAfter = await request(app)
      .get(
        `/v1/credit-cards/${cardId}/statements?year=${nextYear}&month=${nextMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);

    expect(currentAfter.body.items[0].status).toBe("open");
    expect(currentAfter.body.items[0].calculatedTotalCents).toBe(5000);
    expect(nextAfter.body.items[0].id).toBe(nextStatementId);
    expect(nextAfter.body.items[0].calculatedTotalCents).toBe(0);
  });

  it("marcar fatura como paga abre próximo ciclo", async () => {
    const { accessToken } = await registerUser(app);
    const cardRes = await createCard(accessToken);
    const cardId = cardRes.body.id as string;
    const {
      cycleYear,
      cycleMonth,
      nextYear,
      nextMonth,
      purchaseIso,
    } = billingTestContext();

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 15,
        description: "Seed ciclo atual",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseIso,
      });

    const currentStatement = await getStatement(
      accessToken,
      cardId,
      cycleYear,
      cycleMonth,
    );
    const statementId = currentStatement!.id;

    await request(app)
      .patch(`/v1/credit-cards/${cardId}/statements/${statementId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "closed" });

    const paidRes = await request(app)
      .patch(`/v1/credit-cards/${cardId}/statements/${statementId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });

    expect(paidRes.status).toBe(200);
    expect(paidRes.body.status).toBe("paid");

    const nextRes = await request(app)
      .get(
        `/v1/credit-cards/statements/current?year=${nextYear}&month=${nextMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);
    expect(nextRes.body.items[0].currentStatement.status).toBe("open");
  });

  it("fecha automaticamente fatura aberta quando period_end já passou", async () => {
    const { accessToken } = await registerUser(app);
    const cardRes = await createCard(accessToken);
    const cardId = cardRes.body.id as string;

    const currentRes = await request(app)
      .get("/v1/credit-cards/statements/current")
      .set("Authorization", `Bearer ${accessToken}`);

    const stmt = currentRes.body.items[0].currentStatement;
    expect(stmt.status).toBe("open");

    const { id, cycleYear, cycleMonth } = stmt;

    await getPool().query(
      "UPDATE credit_card_statements SET period_end = $1 WHERE id = $2",
      ["2020-01-01", id],
    );

    const expiredRes = await request(app)
      .get(
        `/v1/credit-cards/statements/current?year=${cycleYear}&month=${cycleMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);

    expect(expiredRes.body.items[0].currentStatement.status).toBe("closed");

    const next = nextBillingCycle(cycleYear, cycleMonth, 10, 7);
    const nextRes = await request(app)
      .get(
        `/v1/credit-cards/statements/current?year=${next.cycleYear}&month=${next.cycleMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);

    expect(nextRes.body.items[0].currentStatement.status).toBe("open");
  });

  it("ajuste manual reflete novas despesas no total exibido", async () => {
    const { accessToken } = await registerUser(app);
    const cardRes = await createCard(accessToken);
    const cardId = cardRes.body.id as string;
    const { cycleYear, cycleMonth, purchaseIso } = billingTestContext();

    const currentStatement = await getStatement(
      accessToken,
      cardId,
      cycleYear,
      cycleMonth,
    );
    expect(currentStatement).toBeDefined();
    const statementId = currentStatement!.id;

    const adjustRes = await request(app)
      .patch(`/v1/credit-cards/${cardId}/statements/${statementId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ adjustedTotalCents: 200_000 });

    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.adjustedTotalCents).toBe(200_000);
    expect(adjustRes.body.calculatedTotalCents).toBe(0);

    const expenseRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 500,
        description: "Compra após ajuste manual",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
        creditCardId: cardId,
        occurredAt: purchaseIso,
      });

    expect(expenseRes.status).toBe(201);

    const statementRes = await request(app)
      .get(
        `/v1/credit-cards/${cardId}/statements?year=${cycleYear}&month=${cycleMonth}`,
      )
      .set("Authorization", `Bearer ${accessToken}`);

    expect(statementRes.status).toBe(200);
    const statement = statementRes.body.items[0];
    expect(statement.calculatedTotalCents).toBe(50_000);
    expect(statement.adjustedTotalCents).toBe(250_000);
  });

  it("exige creditCardId para método crédito", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 10,
        description: "Sem cartão",
        goalCategory: "prazeres",
        paymentMethodIndex: 1,
      });

    expect(res.status).toBe(400);
  });
});
