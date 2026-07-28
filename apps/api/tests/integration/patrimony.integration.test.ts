import { describe, expect, it, jest } from "@jest/globals";
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

  it("GET /v1/patrimony/summary não mistura totais de investimentos e cofrinhos entre usuários diferentes", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    const accountA = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Conta A", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        accountId: accountA.body.id,
        symbol: "CDB usuário A",
        currentUnitValueCents: 100000,
      });

    const piggyBankA = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Cofrinho A" });

    await request(app)
      .post(`/v1/piggy-banks/${piggyBankA.body.id}/deposit`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ amountCents: 25000 });

    const accountB = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Conta B", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        accountId: accountB.body.id,
        symbol: "CDB usuário B",
        currentUnitValueCents: 900000,
      });

    const piggyBankB = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Cofrinho B" });

    await request(app)
      .post(`/v1/piggy-banks/${piggyBankB.body.id}/deposit`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ amountCents: 750000 });

    const summaryRes = await request(app)
      .get("/v1/patrimony/summary")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.investmentsCents).toBe(100000);
    expect(summaryRes.body.piggyBanksCents).toBe(25000);
    expect(summaryRes.body.totalAssetsCents).toBe(125000);
    expect(summaryRes.body.byAccount).toEqual([
      {
        accountId: accountA.body.id,
        name: "Conta A",
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

  it("GET /v1/patrimony/summary inclui holding cujo vencimento é hoje mesmo quando UTC já virou o dia (fuso America/Sao_Paulo)", async () => {
    // Regressão para o fix de fuso horário (commit f29a1c8): a implementação
    // antiga calculava "hoje" com now.toISOString().slice(0, 10) (sempre
    // UTC). Em 2026-01-16T01:30:00Z — já dia 16 em UTC, mas ainda
    // 2026-01-15T22:30:00-03:00 no horário de Brasília — um holding vencendo
    // exatamente hoje (2026-01-15) era excluído de upcomingMaturities pelo
    // filtro `maturityDate >= todayStr`. getPatrimonySummary usa `new Date()`
    // internamente (ao contrário do teste unitário equivalente em
    // patrimony.service.test.ts, que injeta `now` por parâmetro), então aqui
    // travamos o relógio do processo no mesmo instante para reproduzir o
    // cenário de ponta a ponta via HTTP. Apenas `Date` é congelado — timers
    // reais (setTimeout/setImmediate/etc.) seguem ativos para não travar a
    // requisição HTTP real nem o round-trip com o Postgres.
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    jest.useFakeTimers({
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    jest.setSystemTime(new Date("2026-01-16T01:30:00.000Z"));

    try {
      const { accessToken } = await registerUser(app);

      const accountRes = await request(app)
        .post("/v1/investment-accounts")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Conta vencimento hoje", type: "fixed_income" });

      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId: accountRes.body.id,
          symbol: "CDB vence hoje",
          currentUnitValueCents: 10000,
          maturityDate: "2026-01-15",
        });

      const summaryRes = await request(app)
        .get("/v1/patrimony/summary")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.upcomingMaturities).toHaveLength(1);
      expect(summaryRes.body.upcomingMaturities[0].name).toBe(
        "CDB vence hoje",
      );
      expect(summaryRes.body.upcomingMaturities[0].maturityDate).toBe(
        "2026-01-15",
      );
    } finally {
      jest.useRealTimers();
      process.env.TZ = originalTz;
    }
  });
});
