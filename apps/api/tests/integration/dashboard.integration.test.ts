import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

const defaultGoals = [
  { category: "liberdade-financeira", percentage: 10 },
  { category: "custos-fixos", percentage: 40 },
  { category: "conforto", percentage: 10 },
  { category: "metas", percentage: 20 },
  { category: "prazeres", percentage: 10 },
  { category: "conhecimento", percentage: 10 },
];

describeWithDb("dashboard integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/dashboard/summary retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("GET /v1/dashboard/history retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/dashboard/history?period=3");
    expect(res.status).toBe(401);
  });

  it("summary calcula totais, expensesByCategory e goalsUsage", async () => {
    const { accessToken } = await registerUser(app);

    await request(app)
      .post("/v1/goals")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ goals: defaultGoals });

    await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 10000,
        description: "Salário",
        occurredAt: new Date(2025, 5, 10).toISOString(),
      });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 500,
        description: "Cinema",
        goalCategory: "prazeres",
        paymentMethodIndex: 0,
        occurredAt: new Date(2025, 5, 12).toISOString(),
      });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 200,
        description: "Aluguel",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        occurredAt: new Date(2025, 5, 15).toISOString(),
      });

    const res = await request(app)
      .get("/v1/dashboard/summary?year=2025&month=6")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalIncomes).toBe(1_000_000);
    expect(res.body.totalExpenses).toBe(70_000);
    expect(res.body.balance).toBe(930_000);

    expect(res.body.expensesByCategory).toEqual(
      expect.arrayContaining([
        { category: "Prazeres", amount: 50_000 },
        { category: "Custos Fixos", amount: 20_000 },
      ]),
    );

    const prazeres = res.body.goalsUsage.find(
      (g: { category: string }) => g.category === "prazeres",
    );
    expect(prazeres.spent).toBe(50_000);
    expect(prazeres.ceiling).toBe(100_000);
  });

  it("history retorna itens por período", async () => {
    const { accessToken } = await registerUser(app);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - 1, 5);
    const targetYear = target.getFullYear();
    const targetMonth = target.getMonth();
    const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;

    await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 1000,
        description: "Freela",
        occurredAt: new Date(targetYear, targetMonth, 5).toISOString(),
      });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 300,
        description: "Mercado",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        occurredAt: new Date(targetYear, targetMonth, 8).toISOString(),
      });

    const res = await request(app)
      .get("/v1/dashboard/history?period=3")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);

    const targetItem = res.body.items.find(
      (item: { month: string }) => item.month === monthKey,
    );
    expect(targetItem.incomes).toBe(100_000);
    expect(targetItem.expenses).toBe(30_000);
    expect(targetItem.balance).toBe(70_000);
  });
});
