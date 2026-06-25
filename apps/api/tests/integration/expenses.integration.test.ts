import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("expenses integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  async function authContext() {
    const { accessToken } = await registerUser(app);
    const tagRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Mercado", color: "#22c55e" });
    return {
      accessToken,
      tagId: tagRes.body.id as string,
    };
  }

  it("GET /v1/expenses retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/expenses");
    expect(res.status).toBe(401);
  });

  it("POST /v1/expenses cria despesa com goalCategory e tags", async () => {
    const { accessToken, tagId } = await authContext();

    const res = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 42.5,
        description: "Mercado",
        goalCategory: "prazeres",
        tagIds: [tagId],
        paymentMethodIndex: 2,
        occurredAt: "2025-06-10T15:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(4250);
    expect(res.body.goalCategory).toBe("prazeres");
    expect(res.body.tagIds).toEqual([tagId]);
    expect(res.body.paymentMethod).toBe("pix");
  });

  it("exige goalCategory na criação", async () => {
    const { accessToken } = await authContext();

    const res = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 10,
        description: "Sem meta",
        paymentMethodIndex: 0,
      });

    expect(res.status).toBe(400);
  });

  it("GET /v1/expenses lista com paginação e total real", async () => {
    const { accessToken } = await authContext();

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/v1/expenses")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          amount: 10 + i,
          description: `Despesa ${i}`,
          goalCategory: "custos-fixos",
          paymentMethodIndex: 0,
          occurredAt: `2025-06-${10 + i}T12:00:00.000Z`,
        });
    }

    const res = await request(app)
      .get("/v1/expenses?year=2025&month=6&limit=2&offset=0")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  it("filtra por goalCategory", async () => {
    const { accessToken } = await authContext();

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 15,
        description: "Filtrada",
        goalCategory: "metas",
        paymentMethodIndex: 1,
      });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 20,
        description: "Outra",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
      });

    const res = await request(app)
      .get("/v1/expenses?goalCategory=metas")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.items[0].description).toBe("Filtrada");
  });

  it("filtra por descrição, tags e mês (OR entre tags)", async () => {
    const { accessToken } = await authContext();

    const tagA = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Tag A", color: "#22c55e" });
    const tagB = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Tag B", color: "#3b82f6" });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 10,
        description: "Mercado semanal",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        tagIds: [tagA.body.id],
        occurredAt: "2025-06-15T12:00:00.000Z",
      });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 20,
        description: "Farmácia",
        goalCategory: "conforto",
        paymentMethodIndex: 0,
        tagIds: [tagB.body.id],
        occurredAt: "2025-06-20T12:00:00.000Z",
      });

    await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 30,
        description: "Outro mês",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
        occurredAt: "2025-07-01T12:00:00.000Z",
      });

    const byDescription = await request(app)
      .get("/v1/expenses?description=mercado")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(byDescription.status).toBe(200);
    expect(byDescription.body.meta.total).toBe(1);
    expect(byDescription.body.items[0].description).toBe("Mercado semanal");

    const byTags = await request(app)
      .get(
        `/v1/expenses?tagIds=${tagA.body.id},${tagB.body.id}&year=2025&month=6`,
      )
      .set("Authorization", `Bearer ${accessToken}`);
    expect(byTags.status).toBe(200);
    expect(byTags.body.meta.total).toBe(2);
  });

  it("GET /v1/expenses/:id retorna despesa", async () => {
    const { accessToken } = await authContext();

    const createRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 99.99,
        description: "Detalhe",
        goalCategory: "conforto",
        paymentMethodIndex: 0,
      });

    const res = await request(app)
      .get(`/v1/expenses/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.amountCents).toBe(9999);
  });

  it("PATCH /v1/expenses/:id atualiza despesa e tags", async () => {
    const { accessToken, tagId } = await authContext();

    const createRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 10,
        description: "Original",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
      });

    const patchRes = await request(app)
      .patch(`/v1/expenses/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 25,
        description: "Atualizada",
        goalCategory: "prazeres",
        paymentMethodIndex: 2,
        tagIds: [tagId],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.amountCents).toBe(2500);
    expect(patchRes.body.goalCategory).toBe("prazeres");
    expect(patchRes.body.tagIds).toEqual([tagId]);
  });

  it("DELETE /v1/expenses/:id faz soft delete", async () => {
    const { accessToken } = await authContext();

    const createRes = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        amount: 5,
        description: "Excluir",
        goalCategory: "custos-fixos",
        paymentMethodIndex: 0,
      });

    const deleteRes = await request(app)
      .delete(`/v1/expenses/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/v1/expenses/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getRes.status).toBe(404);
  });

  it("respeita idempotency key por usuário", async () => {
    const { accessToken } = await authContext();

    const payload = {
      amount: 30,
      description: "Idempotente",
      goalCategory: "custos-fixos",
      paymentMethodIndex: 0,
      idempotencyKey: "unique-key-1",
    };

    const first = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    const second = await request(app)
      .post("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });
});
