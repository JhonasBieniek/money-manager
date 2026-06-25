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

describeWithDb("goals integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/goals retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/goals");
    expect(res.status).toBe(401);
  });

  it("rejeita upsert com soma diferente de 100%", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/goals")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        goals: defaultGoals.map((goal, index) =>
          index === 0 ? { ...goal, percentage: 5 } : goal,
        ),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("100%");
  });

  it("upsert e lista metas", async () => {
    const { accessToken } = await registerUser(app);

    const upsertRes = await request(app)
      .post("/v1/goals")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ goals: defaultGoals });

    expect(upsertRes.status).toBe(200);
    expect(upsertRes.body.items).toHaveLength(6);

    const listRes = await request(app)
      .get("/v1/goals")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(6);
  });

  it("GET /v1/goals/usage retorna 6 itens com zeros sem transações", async () => {
    const { accessToken } = await registerUser(app);

    await request(app)
      .post("/v1/goals")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ goals: defaultGoals });

    const usageRes = await request(app)
      .get("/v1/goals/usage?month=6&year=2025")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(usageRes.status).toBe(200);
    expect(usageRes.body.items).toHaveLength(6);

    for (const item of usageRes.body.items) {
      expect(item.ceiling).toBe(0);
      expect(item.spent).toBe(0);
      expect(item.usagePercent).toBe(0);
    }
  });

  it("GET /v1/goals/usage reflete spent de despesas por goal_category", async () => {
    const { accessToken } = await registerUser(app);

    await request(app)
      .post("/v1/goals")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ goals: defaultGoals });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 150,
        description: "Aluguel",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        occurredAt: "2025-06-15T12:00:00.000Z",
      });

    const usageRes = await request(app)
      .get("/v1/goals/usage?month=6&year=2025")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(usageRes.status).toBe(200);

    const custosFixos = usageRes.body.items.find(
      (item: { category: string }) => item.category === "custos-fixos",
    );
    expect(custosFixos.spent).toBe(15000);
    expect(custosFixos.ceiling).toBe(0);
    expect(custosFixos.usagePercent).toBe(100);
  });
});
