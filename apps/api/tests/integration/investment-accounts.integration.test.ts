import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("investment accounts integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/investment-accounts cria conta", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "XP Investimentos", type: "brokerage", institution: "XP" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("XP Investimentos");
    expect(res.body.type).toBe("brokerage");
    expect(res.body.institution).toBe("XP");
  });

  it("POST /v1/investment-accounts aceita null nos campos opcionais (payload do frontend)", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta sem instituição", type: "brokerage", institution: null });

    expect(res.status).toBe(201);
    expect(res.body.institution).toBeNull();
  });

  it("GET /v1/investment-accounts lista apenas contas do usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Conta A", type: "brokerage" });
    await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Conta B", type: "crypto" });

    const listRes = await request(app)
      .get("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].name).toBe("Conta A");
  });

  it("GET /v1/investment-accounts/:id retorna 404 para conta de outro usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Conta privada", type: "brokerage" });

    const getRes = await request(app)
      .get(`/v1/investment-accounts/${createRes.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(getRes.status).toBe(404);
    expect(getRes.body.error).toBe("Conta não encontrada");
  });

  it("PATCH /v1/investment-accounts/:id atualiza campos parcialmente", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta original", type: "brokerage" });

    const patchRes = await request(app)
      .patch(`/v1/investment-accounts/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta renomeada" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe("Conta renomeada");
    expect(patchRes.body.type).toBe("brokerage");
  });

  it("DELETE /v1/investment-accounts/:id faz soft delete", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta a excluir", type: "brokerage" });

    const deleteRes = await request(app)
      .delete(`/v1/investment-accounts/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });
});
