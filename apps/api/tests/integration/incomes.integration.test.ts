import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("incomes integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/incomes retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/incomes");
    expect(res.status).toBe(401);
  });

  it("CRUD completo de receita", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 5000,
        description: "Salário",
        source: "salary",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.amountCents).toBe(500000);
    expect(createRes.body.description).toBe("Salário");

    const incomeId = createRes.body.id as string;

    const listRes = await request(app)
      .get("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.meta.total).toBe(1);

    const patchRes = await request(app)
      .patch(`/v1/incomes/${incomeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ description: "Salário atualizado" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.description).toBe("Salário atualizado");

    const deleteRes = await request(app)
      .delete(`/v1/incomes/${incomeId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/v1/incomes/${incomeId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(afterDelete.status).toBe(404);
  });

  it("lista com paginação e total real", async () => {
    const { accessToken } = await registerUser(app);

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/v1/incomes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          amount: 1000 + i,
          description: `Receita ${i}`,
          occurredAt: `2025-06-${10 + i}T12:00:00.000Z`,
        });
    }

    const res = await request(app)
      .get("/v1/incomes?year=2025&month=6&limit=2&offset=0")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  it("filtra por mês e ano", async () => {
    const { accessToken } = await registerUser(app);

    await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 1000,
        description: "Junho",
        occurredAt: new Date(2025, 5, 10).toISOString(),
      });

    await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 2000,
        description: "Julho",
        occurredAt: new Date(2025, 6, 10).toISOString(),
      });

    const filtered = await request(app)
      .get("/v1/incomes?month=6&year=2025")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(filtered.status).toBe(200);
    expect(filtered.body.meta.total).toBe(1);
    expect(filtered.body.items[0].description).toBe("Junho");
  });

  it("filtra por descrição e tags", async () => {
    const { accessToken } = await registerUser(app);

    const tagRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Salário", color: "#22c55e" });

    await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 5000,
        description: "Salário CLT",
        tagIds: [tagRes.body.id],
        occurredAt: new Date(2025, 5, 5).toISOString(),
      });

    await request(app)
      .post("/v1/incomes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 500,
        description: "Freelance extra",
        occurredAt: new Date(2025, 5, 12).toISOString(),
      });

    const byDescription = await request(app)
      .get("/v1/incomes?description=salário&month=6&year=2025")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(byDescription.status).toBe(200);
    expect(byDescription.body.meta.total).toBe(1);
    expect(byDescription.body.items[0].description).toBe("Salário CLT");

    const byTag = await request(app)
      .get(`/v1/incomes?tagIds=${tagRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(byTag.status).toBe(200);
    expect(byTag.body.meta.total).toBe(1);
  });
});
