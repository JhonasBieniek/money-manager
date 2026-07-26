import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("debts integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/debts cria dívida com cronograma e saldo restante", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Financiamento teste",
        installmentCount: 3,
        installmentPeriod: "monthly",
        installmentAmount: 100,
        autoSyncExpenses: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Financiamento teste");
    expect(res.body.totalCents).toBe(30000);
    expect(res.body.remainingBalanceCents).toBe(30000);
    expect(res.body.paymentMethod).toBe("cash");
    expect(res.body.installments).toHaveLength(3);
  });

  it("autoSyncExpenses lança despesa do mês e abate saldo", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Empréstimo sync",
        installmentCount: 2,
        installmentPeriod: "monthly",
        installmentAmount: 50,
        autoSyncExpenses: true,
        paymentMethodIndex: 2,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.paymentMethod).toBe("pix");
    expect(createRes.body.paidCents).toBe(5000);
    expect(createRes.body.remainingBalanceCents).toBe(5000);
    expect(
      createRes.body.installments.filter(
        (item: { status: string }) => item.status === "paid",
      ),
    ).toHaveLength(1);

    const expensesRes = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(expensesRes.status).toBe(200);
    expect(expensesRes.body.items.some((item: { description: string }) =>
      item.description.includes("Empréstimo sync"),
    )).toBe(true);
  });

  it("GET /v1/expenses com mês futuro dispara sync de parcelas", async () => {
    const { accessToken } = await registerUser(app);
    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth() + 2, 15);
    const startDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-01`;

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Parcela futura",
        installmentCount: 1,
        installmentPeriod: "monthly",
        installmentAmount: 75,
        autoSyncExpenses: true,
        startDate,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.paidCents).toBe(0);

    const year = future.getFullYear();
    const month = future.getMonth() + 1;

    const expensesRes = await request(app)
      .get(`/v1/expenses?year=${year}&month=${month}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(expensesRes.status).toBe(200);
    expect(
      expensesRes.body.items.some((item: { description: string }) =>
        item.description.includes("Parcela futura"),
      ),
    ).toBe(true);

    const debtsRes = await request(app)
      .get("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`);

    const debt = debtsRes.body.items.find(
      (item: { name: string }) => item.name === "Parcela futura",
    );
    expect(debt.paidCents).toBe(7500);
  });

  it("GET /v1/dashboard/summary dispara sync do mês consultado", async () => {
    const { accessToken } = await registerUser(app);
    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth() + 3, 10);
    const startDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-10`;

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Sync dashboard",
        installmentCount: 1,
        installmentPeriod: "monthly",
        installmentAmount: 40,
        autoSyncExpenses: true,
        startDate,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.paidCents).toBe(0);

    const year = future.getFullYear();
    const month = future.getMonth() + 1;

    const summaryRes = await request(app)
      .get(`/v1/dashboard/summary?year=${year}&month=${month}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.totalExpenses).toBeGreaterThanOrEqual(4000);
  });

  it("GET /v1/debts lista dívidas do usuário", async () => {
    const { accessToken } = await registerUser(app);

    await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Lista dívida",
        installmentCount: 1,
        installmentAmount: 10,
      });

    const listRes = await request(app)
      .get("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].name).toBe("Lista dívida");
  });

  it("PATCH /v1/debts/:id atualiza nome e flags com parcelas pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida editável",
        installmentCount: 2,
        installmentPeriod: "monthly",
        installmentAmount: 50,
        autoSyncExpenses: true,
        paymentMethodIndex: 2,
      });

    expect(createRes.status).toBe(201);
    const debtId = createRes.body.id as string;
    expect(createRes.body.paidCents).toBeGreaterThan(0);

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida renomeada",
        autoSyncExpenses: false,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe("Dívida renomeada");
    expect(patchRes.body.autoSyncExpenses).toBe(false);
    expect(patchRes.body.installmentCount).toBe(2);
    expect(patchRes.body.paidCents).toBeGreaterThan(0);
  });

  it("PATCH /v1/debts/:id bloqueia alteração estrutural com parcelas pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida bloqueada",
        installmentCount: 2,
        installmentAmount: 30,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 4 });

    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toContain("parcelas ou valores");
  });

  it("PATCH /v1/debts/:id permite alteração estrutural sem parcelas pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida estrutural",
        installmentCount: 3,
        installmentAmount: 20,
        autoSyncExpenses: false,
      });

    const debtId = createRes.body.id as string;

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        installmentCount: 2,
        installmentAmount: 40,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installmentCount).toBe(2);
    expect(patchRes.body.totalCents).toBe(8000);
    expect(patchRes.body.installments).toHaveLength(2);
    expect(patchRes.body.paidCents).toBe(0);
  });

  it("DELETE /v1/debts/:id faz soft delete mesmo com parcelas pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida excluída",
        installmentCount: 1,
        installmentAmount: 25,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    expect(createRes.body.paidCents).toBeGreaterThan(0);

    const deleteRes = await request(app)
      .delete(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(0);
  });
});
