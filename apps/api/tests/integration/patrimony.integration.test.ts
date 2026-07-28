import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("patrimony summary integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/patrimony/summary soma holdings e cofrinhos do usuário", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta patrimônio", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB patrimônio",
        currentUnitValueCents: 100000,
      });

    const piggyBankRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho patrimônio" });

    await request(app)
      .post(`/v1/piggy-banks/${piggyBankRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 25000 });

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.investmentsCents).toBe(100000);
    expect(summaryRes.body.piggyBanksCents).toBe(25000);
    expect(summaryRes.body.totalAssetsCents).toBe(125000);
    expect(summaryRes.body.quotesStale).toBe(false);
    expect(summaryRes.body.byAccount).toEqual([
      {
        accountId: accountRes.body.id,
        name: "Conta patrimônio",
        totalCents: 100000,
      },
    ]);
  });

  it("GET /v1/patrimony/summary retorna zeros para usuário sem posições", async () => {
    const { accessToken } = await registerUser(app);

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.totalAssetsCents).toBe(0);
    expect(summaryRes.body.byAssetClass).toEqual([]);
    expect(summaryRes.body.byAccount).toEqual([]);
    expect(summaryRes.body.lastUpdatedAt).toBeNull();
    expect(summaryRes.body.upcomingMaturities).toEqual([]);
  });

  it("GET /v1/patrimony/summary lista vencimentos dentro de 90 dias em upcomingMaturities", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta vencimento", type: "fixed_income" });

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const soonStr = soon.toISOString().slice(0, 10);

    const far = new Date();
    far.setDate(far.getDate() + 400);
    const farStr = far.toISOString().slice(0, 10);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB vence logo",
        currentUnitValueCents: 10000,
        maturityDate: soonStr,
      });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB vence longe",
        currentUnitValueCents: 20000,
        maturityDate: farStr,
      });

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.upcomingMaturities).toHaveLength(1);
    expect(summaryRes.body.upcomingMaturities[0].name).toBe("CDB vence logo");
  });
});
