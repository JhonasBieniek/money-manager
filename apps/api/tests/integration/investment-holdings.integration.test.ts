import { describe, expect, it } from "@jest/globals";
import type { Express } from "express";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("investment holdings integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  async function createAccount(
    testApp: Express,
    accessToken: string,
  ): Promise<string> {
    const res = await request(testApp)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta teste", type: "brokerage" });
    return res.body.id as string;
  }

  it("POST /v1/investment-holdings cria posição de renda fixa", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "CDB Banco X", currentUnitValueCents: 100000 });

    expect(res.status).toBe(201);
    expect(res.body.symbol).toBe("CDB Banco X");
    expect(res.body.incomeType).toBe("fixed_income");
    expect(res.body.currentUnitValueCents).toBe(100000);
  });

  it("POST /v1/investment-holdings rejeita accountId de outro usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);
    const accountId = await createAccount(app, tokenA);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ accountId, symbol: "CDB inválido", currentUnitValueCents: 1000 });

    expect(res.status).toBe(400);
  });

  it("POST /v1/investment-holdings rejeita incomeType variable_income", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "Ação teste",
        currentUnitValueCents: 1000,
        incomeType: "variable_income",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Renda variável");
  });

  it("PATCH /v1/investment-holdings/:id/valuation atualiza valor e last_valuation_at", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const createRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "CDB valorização",
        currentUnitValueCents: 50000,
      });

    const beforeValuation = createRes.body.lastValuationAt as string;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const valuationRes = await request(app)
      .patch(`/v1/investment-holdings/${createRes.body.id}/valuation`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentUnitValueCents: 52000 });

    expect(valuationRes.status).toBe(200);
    expect(valuationRes.body.currentUnitValueCents).toBe(52000);
    expect(
      new Date(valuationRes.body.lastValuationAt).getTime(),
    ).toBeGreaterThan(new Date(beforeValuation).getTime());
  });

  it("DELETE /v1/investment-accounts/:id faz soft delete em cascata das holdings", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "CDB cascata", currentUnitValueCents: 10000 });

    await request(app)
      .delete(`/v1/investment-accounts/${accountId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const holdingsRes = await request(app)
      .get("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(holdingsRes.status).toBe(200);
    expect(holdingsRes.body.items).toHaveLength(0);
  });

  it("GET /v1/investment-holdings filtra por accountId", async () => {
    const { accessToken } = await registerUser(app);
    const accountId1 = await createAccount(app, accessToken);
    const accountId2 = await createAccount(app, accessToken);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountId1,
        symbol: "CDB conta 1",
        currentUnitValueCents: 1000,
      });
    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountId2,
        symbol: "CDB conta 2",
        currentUnitValueCents: 2000,
      });

    const res = await request(app)
      .get(`/v1/investment-holdings?accountId=${accountId1}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].symbol).toBe("CDB conta 1");
  });

  it("DELETE /v1/investment-holdings/:id faz soft delete", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const createRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "CDB a excluir",
        currentUnitValueCents: 5000,
      });

    const deleteRes = await request(app)
      .delete(`/v1/investment-holdings/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });
});
