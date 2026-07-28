import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("piggy banks integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/piggy-banks cria cofrinho com meta monetária", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Viagem",
        icon: "plane",
        targetAmountCents: 500000,
        goalDescription: "Viagem para o Japão",
        targetDate: "2027-06-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Viagem");
    expect(res.body.currentAmountCents).toBe(0);
    expect(res.body.targetAmountCents).toBe(500000);
    expect(res.body.status).toBe("active");
  });

  it("POST /v1/piggy-banks cria cofrinho sem meta monetária", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Fundo de emergência",
        goalDescription: "6 meses de reserva",
      });

    expect(res.status).toBe(201);
    expect(res.body.targetAmountCents).toBeNull();
  });

  it("GET /v1/piggy-banks/:id retorna 404 para cofrinho de outro usuário", async () => {
    const { accessToken: tokenA } = await registerUser(app);
    const { accessToken: tokenB } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Cofrinho privado" });

    const getRes = await request(app)
      .get(`/v1/piggy-banks/${createRes.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(getRes.status).toBe(404);
    expect(getRes.body.error).toBe("Cofrinho não encontrado");
  });

  it("POST /v1/piggy-banks/:id/deposit incrementa o saldo", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho depósito" });

    const depositRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 10000, note: "Primeiro depósito" });

    expect(depositRes.status).toBe(200);
    expect(depositRes.body.currentAmountCents).toBe(10000);

    const transactionsRes = await request(app)
      .get(`/v1/piggy-banks/${createRes.body.id}/transactions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(transactionsRes.status).toBe(200);
    expect(transactionsRes.body.items).toHaveLength(1);
    expect(transactionsRes.body.items[0].type).toBe("deposit");
    expect(transactionsRes.body.items[0].amountCents).toBe(10000);
    expect(transactionsRes.body.meta.total).toBe(1);
  });

  it("POST /v1/piggy-banks/:id/withdraw decrementa o saldo", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho saque" });

    await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 10000 });

    const withdrawRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/withdraw`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 4000 });

    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.body.currentAmountCents).toBe(6000);
  });

  it("POST /v1/piggy-banks/:id/withdraw rejeita saque maior que o saldo", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho saldo insuficiente" });

    await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 1000 });

    const withdrawRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/withdraw`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 2000 });

    expect(withdrawRes.status).toBe(400);
    expect(withdrawRes.body.error).toContain("Saldo insuficiente");
  });

  it("PATCH /v1/piggy-banks/:id/status alterna entre completed e active", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho status" });

    const completeRes = await request(app)
      .patch(`/v1/piggy-banks/${createRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("completed");

    const reopenRes = await request(app)
      .patch(`/v1/piggy-banks/${createRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "active" });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.status).toBe("active");
  });

  it("um cofrinho completed continua aceitando depósitos", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho concluído" });

    await request(app)
      .patch(`/v1/piggy-banks/${createRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });

    const depositRes = await request(app)
      .post(`/v1/piggy-banks/${createRes.body.id}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 500 });

    expect(depositRes.status).toBe(200);
    expect(depositRes.body.currentAmountCents).toBe(500);
    expect(depositRes.body.status).toBe("completed");
  });

  it("GET /v1/piggy-banks filtra por status", async () => {
    const { accessToken } = await registerUser(app);
    const activeRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Ativo" });
    const completedRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Concluído" });
    await request(app)
      .patch(`/v1/piggy-banks/${completedRes.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "completed" });

    const res = await request(app)
      .get("/v1/piggy-banks?status=active")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(activeRes.body.id);
  });

  it("DELETE /v1/piggy-banks/:id faz soft delete", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho a excluir" });

    const deleteRes = await request(app)
      .delete(`/v1/piggy-banks/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });

  it("GET /v1/piggy-banks/:id/transactions pagina com limit/offset e total real", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho paginação" });
    const piggyBankId = createRes.body.id as string;

    // Depósitos sequenciais (com pequeno intervalo) para garantir occurredAt
    // crescente e uma ordenação determinística no ledger.
    for (const amountCents of [10000, 20000, 30000]) {
      await request(app)
        .post(`/v1/piggy-banks/${piggyBankId}/deposit`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ amountCents });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const firstPage = await request(app)
      .get(`/v1/piggy-banks/${piggyBankId}/transactions?limit=2&offset=0`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.meta).toEqual({ total: 3, limit: 2, offset: 0 });
    // Mais recente primeiro (ORDER BY occurredAt DESC).
    expect(firstPage.body.items[0].amountCents).toBe(30000);
    expect(firstPage.body.items[1].amountCents).toBe(20000);

    const secondPage = await request(app)
      .get(`/v1/piggy-banks/${piggyBankId}/transactions?limit=2&offset=2`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.meta).toEqual({ total: 3, limit: 2, offset: 2 });
    expect(secondPage.body.items[0].amountCents).toBe(10000);
  });

  it("depósitos concorrentes não perdem atualizações de saldo (atualização atômica)", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho concorrência depósito" });
    const piggyBankId = createRes.body.id as string;

    // Regressão para o fix de atomicidade (commit 553975e): antes, leituras
    // concorrentes do mesmo saldo base faziam a última escrita vencer,
    // perdendo depósitos. O UPDATE atômico no banco deve somar todos.
    const concurrentDeposits = 8;
    const responses = await Promise.all(
      Array.from({ length: concurrentDeposits }, () =>
        request(app)
          .post(`/v1/piggy-banks/${piggyBankId}/deposit`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ amountCents: 100 }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const finalRes = await request(app)
      .get(`/v1/piggy-banks/${piggyBankId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(finalRes.body.currentAmountCents).toBe(concurrentDeposits * 100);

    const transactionsRes = await request(app)
      .get(`/v1/piggy-banks/${piggyBankId}/transactions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(transactionsRes.body.meta.total).toBe(concurrentDeposits);
  });

  it("saques concorrentes não ultrapassam o saldo disponível (guarda atômica)", async () => {
    const { accessToken } = await registerUser(app);
    const createRes = await request(app)
      .post("/v1/piggy-banks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Cofrinho concorrência saque" });
    const piggyBankId = createRes.body.id as string;

    await request(app)
      .post(`/v1/piggy-banks/${piggyBankId}/deposit`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ amountCents: 10000 });

    // Três saques concorrentes de 6000: no máximo 1 pode ser aceito sem
    // deixar o saldo negativo (6000 * 2 > 10000). Sem a guarda atômica do
    // fix, leituras concorrentes do mesmo saldo base poderiam aprovar mais
    // de um saque e deixar o saldo negativo.
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app)
          .post(`/v1/piggy-banks/${piggyBankId}/withdraw`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ amountCents: 6000 }),
      ),
    );

    const succeeded = responses.filter((res) => res.status === 200);
    const rejected = responses.filter((res) => res.status === 400);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const res of rejected) {
      expect(res.body.error).toContain("Saldo insuficiente");
    }

    const finalRes = await request(app)
      .get(`/v1/piggy-banks/${piggyBankId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(finalRes.body.currentAmountCents).toBe(4000);

    const transactionsRes = await request(app)
      .get(`/v1/piggy-banks/${piggyBankId}/transactions`)
      .set("Authorization", `Bearer ${accessToken}`);

    // 1 depósito + exatamente 1 saque bem-sucedido; saques rejeitados não
    // devem gravar linha no ledger (a transação de banco é revertida).
    expect(transactionsRes.body.meta.total).toBe(2);
  });
});
