import { describe, expect, it, jest } from "@jest/globals";
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

  it("POST /v1/investment-holdings aceita null nos campos opcionais (payload do frontend)", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "CDB sem detalhes",
        currentUnitValueCents: 1000,
        maturityDate: null,
        notes: null,
      });

    expect(res.status).toBe(201);
    expect(res.body.maturityDate).toBeNull();
    expect(res.body.notes).toBeNull();
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
    expect(res.body.error).toBe("Conta de investimento inválida");
  });

  it("POST /v1/investment-holdings rejeita variable_income sem assetClass/quantity", async () => {
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
    expect(res.body.error).toBe("Invalid request");
  });

  it("POST /v1/investment-holdings cria posição de renda variável sem cotação inicial (lazy)", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const res = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "PETR4",
        incomeType: "variable_income",
        assetClass: "stocks",
        quantity: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.incomeType).toBe("variable_income");
    expect(res.body.assetClass).toBe("stocks");
    expect(res.body.quantity).toBe("100");
    expect(res.body.currentUnitValueCents).toBe(0);
    expect(res.body.pricingSource).toBe("brapi");
    expect(res.body.lastQuoteError).toBe("Cotação pendente");
  });

  it("PATCH /v1/investment-holdings/:id/quote-mode alterna manualOverride e rejeita em holdings RF", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);

    const rvRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId,
        symbol: "PETR4",
        incomeType: "variable_income",
        assetClass: "stocks",
        quantity: 10,
      });
    const rvId = rvRes.body.id as string;

    const toggleRes = await request(app)
      .patch(`/v1/investment-holdings/${rvId}/quote-mode`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ manualOverride: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.manualOverride).toBe(true);

    const rfRes = await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ accountId, symbol: "CDB", currentUnitValueCents: 1000 });
    const rfId = rfRes.body.id as string;

    const rejectedRes = await request(app)
      .patch(`/v1/investment-holdings/${rfId}/quote-mode`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ manualOverride: true });
    expect(rejectedRes.status).toBe(400);
  });

  it("POST /v1/investment-holdings/:id/refresh-quote busca cotação e respeita throttle de 1 min", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
        }),
      } as Response);

    try {
      const rvRes = await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      const rvId = rvRes.body.id as string;

      const firstRefresh = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(firstRefresh.status).toBe(200);
      expect(firstRefresh.body.currentUnitValueCents).toBe(4000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const secondRefresh = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(secondRefresh.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("POST /v1/investment-holdings/:id/refresh-quote nunca retorna erro HTTP quando o provider falha", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    delete process.env.BRAPI_TOKEN;

    try {
      const rvRes = await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      const rvId = rvRes.body.id as string;

      const res = await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.lastQuoteError).toContain("BRAPI_TOKEN");
    } finally {
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("GET /v1/patrimony/summary reflete quantity × cotação e byAssetClass real para holdings RV", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      const rvRes = await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      const rvId = rvRes.body.id as string;
      await request(app)
        .post(`/v1/investment-holdings/${rvId}/refresh-quote`)
        .set("Authorization", `Bearer ${accessToken}`);

      const summaryRes = await request(app)
        .get("/v1/patrimony/summary")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.investmentsCents).toBe(40000);
      expect(summaryRes.body.byAssetClass).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ class: "stocks", totalCents: 40000 }),
        ]),
      );
      expect(summaryRes.body.quotesStale).toBe(false);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("POST /v1/investments/refresh-quotes atualiza todas as posições RV do usuário em lote", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "VALE3",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 5,
        });

      const res = await request(app)
        .post("/v1/investments/refresh-quotes")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(204);

      const listRes = await request(app)
        .get("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`);
      const values = (listRes.body.items as { currentUnitValueCents: number }[])
        .map((h) => h.currentUnitValueCents);
      expect(values).toEqual([4000, 4000]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
  });

  it("compartilha uma única chamada externa entre duas posições com o mesmo símbolo", async () => {
    const { accessToken } = await registerUser(app);
    const accountId = await createAccount(app, accessToken);
    const originalToken = process.env.BRAPI_TOKEN;
    process.env.BRAPI_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 40 }],
      }),
    } as Response);

    try {
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 10,
        });
      await request(app)
        .post("/v1/investment-holdings")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          accountId,
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: 20,
        });

      const res = await request(app)
        .post("/v1/investments/refresh-quotes")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(204);

      // Duas posições no mesmo símbolo (PETR4): a primeira busca a cotação e
      // grava o cache; a segunda reaproveita o cache recém-gravado em vez de
      // chamar o provider de novo — daí exatamente 1 chamada, não 2.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
      if (originalToken === undefined) {
        delete process.env.BRAPI_TOKEN;
      } else {
        process.env.BRAPI_TOKEN = originalToken;
      }
    }
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
