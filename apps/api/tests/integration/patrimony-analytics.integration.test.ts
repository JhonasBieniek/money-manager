import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { decodeJwt } from "jose";
import { benchmarkRates, getDb, investmentSnapshots } from "@money-manager/db";
import { newId } from "@money-manager/utils";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("patrimony analytics integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/patrimony/snapshots cria um snapshot com o patrimônio atual", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta snapshot", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB snapshot",
        currentUnitValueCents: 50000,
      });

    const snapshotRes = await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.body.totalAssetsCents).toBe(50000);
    expect(snapshotRes.body.byAssetClass).toEqual([
      {
        class: "fixed_income_group",
        label: "Renda fixa",
        totalCents: 50000,
        percentage: 100,
      },
    ]);
  });

  it("POST /v1/patrimony/snapshots chamado duas vezes no mesmo dia atualiza, não duplica", async () => {
    const { accessToken } = await registerUser(app);

    const accountRes = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Conta idempotência", type: "brokerage" });

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB primeiro valor",
        currentUnitValueCents: 10000,
      });

    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        accountId: accountRes.body.id,
        symbol: "CDB segundo valor",
        currentUnitValueCents: 5000,
      });

    const secondSnapshotRes = await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondSnapshotRes.status).toBe(200);
    expect(secondSnapshotRes.body.totalAssetsCents).toBe(15000);

    const historyRes = await request(app)
      .get("/v1/patrimony/history?period=3")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(historyRes.body.items).toHaveLength(1);
    expect(historyRes.body.items[0].totalAssetsCents).toBe(15000);
  });

  it("GET /v1/patrimony/history não mistura snapshots de usuários diferentes", async () => {
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
        symbol: "CDB A",
        currentUnitValueCents: 20000,
      });
    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${tokenA}`);

    const accountB = await request(app)
      .post("/v1/investment-accounts")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Conta B", type: "brokerage" });
    await request(app)
      .post("/v1/investment-holdings")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        accountId: accountB.body.id,
        symbol: "CDB B",
        currentUnitValueCents: 99999,
      });
    await request(app)
      .post("/v1/patrimony/snapshots")
      .set("Authorization", `Bearer ${tokenB}`);

    const historyA = await request(app)
      .get("/v1/patrimony/history?period=3")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(historyA.body.items).toHaveLength(1);
    expect(historyA.body.items[0].totalAssetsCents).toBe(20000);
  });

  it("GET /v1/patrimony/history rejeita period inválido com 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/patrimony/history?period=5")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });

  it("GET /v1/patrimony/benchmarks casa snapshots com benchmark_rates por ano-mês e reflete o crescimento real do patrimônio", async () => {
    // Regressão para o fix do commit daf61ed: a implementação antiga fazia
    // `s.snapshotDate.startsWith(month)`, onde `month` é sempre ancorado no
    // dia 01 (ex: "2026-07-01"). Snapshots reais quase nunca caem no dia 01
    // (ex: "2026-07-28"), então o match falhava quase sempre e
    // `patrimonyIndexed` caía no fallback fixo de 100 mesmo quando o
    // patrimônio realmente cresceu. Este teste semeia dois meses de
    // benchmark_rates e dois snapshots em dias não-01, com totalAssetsCents
    // diferentes, para que uma regressão do bug volte a produzir 100 no
    // segundo mês em vez do crescimento real (~110).
    const { accessToken } = await registerUser(app);
    const userId = decodeJwt(accessToken).sub as string;

    const now = new Date();
    const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const yearMonth = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonth = `${yearMonth(currentMonthDate)}-01`;
    const previousMonth = `${yearMonth(previousMonthDate)}-01`;

    await getDb()
      .insert(benchmarkRates)
      .values([
        {
          benchmark: "ipca",
          referenceMonth: previousMonth,
          monthlyRatePct: "0.5000",
          fetchedAt: now,
        },
        {
          benchmark: "cdi",
          referenceMonth: previousMonth,
          monthlyRatePct: "1.0000",
          fetchedAt: now,
        },
        {
          benchmark: "ipca",
          referenceMonth: currentMonth,
          monthlyRatePct: "0.6700",
          fetchedAt: now,
        },
        {
          benchmark: "cdi",
          referenceMonth: currentMonth,
          monthlyRatePct: "1.0000",
          fetchedAt: now,
        },
      ]);

    await getDb()
      .insert(investmentSnapshots)
      .values([
        {
          id: newId(),
          userId,
          snapshotDate: `${yearMonth(previousMonthDate)}-15`,
          totalAssetsCents: 100000,
          byAssetClass: [],
        },
        {
          id: newId(),
          userId,
          snapshotDate: `${yearMonth(currentMonthDate)}-20`,
          totalAssetsCents: 110000,
          byAssetClass: [],
        },
      ]);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=12m")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(2);

    expect(res.body.series[0].referenceMonth).toBe(previousMonth);
    expect(res.body.series[0].patrimonyIndexed).toBe(100);
    // (1.005 - 1) * 100 = 0.5
    expect(res.body.series[0].ipcaAccumulatedPct).toBe(0.5);
    // (1.01 - 1) * 100 = 1.0
    expect(res.body.series[0].cdiAccumulatedPct).toBe(1.0);

    expect(res.body.series[1].referenceMonth).toBe(currentMonth);
    // 110000 / 100000 * 100 = 110 exatamente
    expect(res.body.series[1].patrimonyIndexed).toBe(110);
    // (1.005 * 1.0067 - 1) * 100 = 1.17335... arredondado para 1.17
    expect(res.body.series[1].ipcaAccumulatedPct).toBe(1.17);
    // (1.01 * 1.01 - 1) * 100 = 2.01
    expect(res.body.series[1].cdiAccumulatedPct).toBe(2.01);

    // (110000 - 100000) / 100000 * 100 = 10 exatamente
    expect(res.body.portfolioReturnPct).toBe(10);
    // mesmo valor de series[1].cdiAccumulatedPct (CDI acumulado do período todo)
    expect(res.body.cdiReturnPct).toBe(2.01);
  });

  it("GET /v1/patrimony/benchmarks?period=year compõe a série do ano corrente, alinhando patrimônio ao fim do mês e retornando null quando falta snapshot", async () => {
    // Restaura a cobertura de period=year que existia no plano original (Task 9)
    // e que foi descartada quando o teste de regressão 12m acima foi escrito —
    // regressão de cobertura, não uma decisão intencional. Também exercita os
    // dois comportamentos novos desta rodada de fixes:
    // - Fix 2 (fallback null): fevereiro tem benchmark_rates mas nenhum snapshot,
    //   então series[1].patrimonyIndexed deve ser exatamente `null` (não 100, não NaN).
    // - Fix 3 (alinhamento fim-de-mês): janeiro tem dois snapshots (dia 05 e dia 25).
    //   startCents usa o primeiro snapshot globalmente (dia 05 = 300000), mas o
    //   patrimonyIndexed de janeiro deve refletir o ÚLTIMO snapshot do mês (dia 25
    //   = 305000), não o primeiro. Com o bug antigo (`.find()` pegava o primeiro
    //   snapshot do mês, que aqui coincide com o snapshot de startCents), janeiro
    //   teria dado 100 flat; com o fix, dá 101.67 (305000/300000*100).
    //
    // Aritmética (verificada via script Node replicando compoundAccumulatedPct
    // e a fórmula de patrimonyIndexed, checando igualdade estrita com os literais
    // usados abaixo — não é só arredondamento visual):
    //   Jan: ipca compoundAccumulatedPct([0.8]) = 0.8
    //        cdi  compoundAccumulatedPct([1.0]) = 1
    //        patrimonyIndexed = round(305000/300000*10000)/100 = 101.67
    //   Fev: ipca compoundAccumulatedPct([0.8,0.6]) = 1.4
    //        cdi  compoundAccumulatedPct([1.0,0.9]) = 1.91
    //        patrimonyIndexed = null (sem snapshot em fevereiro)
    //   Mar: ipca compoundAccumulatedPct([0.8,0.6,0.4]) = 1.81
    //        cdi  compoundAccumulatedPct([1.0,0.9,1.1]) = 3.03
    //        patrimonyIndexed = round(330000/300000*10000)/100 = 110
    //   portfolioReturnPct = round((330000-300000)/300000*10000)/100 = 10
    //   cdiReturnPct = cdi acumulado do período todo = mesmo valor de Mar = 3.03
    const { accessToken } = await registerUser(app);
    const userId = decodeJwt(accessToken).sub as string;

    const now = new Date();
    const year = now.getFullYear();
    const jan = `${year}-01-01`;
    const feb = `${year}-02-01`;
    const mar = `${year}-03-01`;

    await getDb()
      .insert(benchmarkRates)
      .values([
        {
          benchmark: "ipca",
          referenceMonth: jan,
          monthlyRatePct: "0.8000",
          fetchedAt: now,
        },
        {
          benchmark: "cdi",
          referenceMonth: jan,
          monthlyRatePct: "1.0000",
          fetchedAt: now,
        },
        {
          benchmark: "ipca",
          referenceMonth: feb,
          monthlyRatePct: "0.6000",
          fetchedAt: now,
        },
        {
          benchmark: "cdi",
          referenceMonth: feb,
          monthlyRatePct: "0.9000",
          fetchedAt: now,
        },
        {
          benchmark: "ipca",
          referenceMonth: mar,
          monthlyRatePct: "0.4000",
          fetchedAt: now,
        },
        {
          benchmark: "cdi",
          referenceMonth: mar,
          monthlyRatePct: "1.1000",
          fetchedAt: now,
        },
      ]);

    await getDb()
      .insert(investmentSnapshots)
      .values([
        {
          id: newId(),
          userId,
          snapshotDate: `${year}-01-05`,
          totalAssetsCents: 300000,
          byAssetClass: [],
        },
        {
          id: newId(),
          userId,
          snapshotDate: `${year}-01-25`,
          totalAssetsCents: 305000,
          byAssetClass: [],
        },
        // Deliberadamente nenhum snapshot em fevereiro — cobre o fallback null do Fix 2.
        {
          id: newId(),
          userId,
          snapshotDate: `${year}-03-28`,
          totalAssetsCents: 330000,
          byAssetClass: [],
        },
      ]);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=year")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(3);

    expect(res.body.series[0].referenceMonth).toBe(jan);
    expect(res.body.series[0].ipcaAccumulatedPct).toBe(0.8);
    expect(res.body.series[0].cdiAccumulatedPct).toBe(1);
    expect(res.body.series[0].patrimonyIndexed).toBe(101.67);

    expect(res.body.series[1].referenceMonth).toBe(feb);
    expect(res.body.series[1].ipcaAccumulatedPct).toBe(1.4);
    expect(res.body.series[1].cdiAccumulatedPct).toBe(1.91);
    expect(res.body.series[1].patrimonyIndexed).toBeNull();

    expect(res.body.series[2].referenceMonth).toBe(mar);
    expect(res.body.series[2].ipcaAccumulatedPct).toBe(1.81);
    expect(res.body.series[2].cdiAccumulatedPct).toBe(3.03);
    expect(res.body.series[2].patrimonyIndexed).toBe(110);

    expect(res.body.portfolioReturnPct).toBe(10);
    expect(res.body.cdiReturnPct).toBe(3.03);
  });

  it("GET /v1/patrimony/benchmarks retorna série vazia sem lançar erro quando não há benchmark_rates", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=12m")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toEqual([]);
    expect(res.body.portfolioReturnPct).toBeNull();
    expect(res.body.cdiReturnPct).toBeNull();
  });

  it("GET /v1/patrimony/benchmarks rejeita period inválido com 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/patrimony/benchmarks?period=mes")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });
});
