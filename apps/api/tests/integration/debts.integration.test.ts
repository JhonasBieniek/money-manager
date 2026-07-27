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

  it("PATCH /v1/debts/:id aumenta parcelas mantendo as já pagas congeladas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida com parcelas pagas",
        installmentCount: 2,
        installmentAmount: 30,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const paidInstallment = createRes.body.installments.find(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidInstallment).toBeDefined();

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 4 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installmentCount).toBe(4);
    expect(patchRes.body.installments).toHaveLength(4);

    const stillPaid = patchRes.body.installments.find(
      (item: { id: string }) => item.id === paidInstallment.id,
    );
    expect(stillPaid.status).toBe("paid");
    expect(stillPaid.dueDate).toBe(paidInstallment.dueDate);
    expect(stillPaid.amountCents).toBe(paidInstallment.amountCents);

    // paid (3000) + 3 new pending @ 3000 = 3000 + 9000 = 12000
    expect(patchRes.body.totalCents).toBe(12000);
    expect(patchRes.body.paidCents).toBe(3000);
  });

  it("PATCH /v1/debts/:id altera período e data de início preservando parcelas pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida com período alterado",
        installmentCount: 2,
        installmentAmount: 40,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const paidInstallment = createRes.body.installments.find(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidInstallment).toBeDefined();

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentPeriod: "weekly", startDate: "2027-01-01" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installmentPeriod).toBe("weekly");

    const stillPaid = patchRes.body.installments.find(
      (item: { id: string }) => item.id === paidInstallment.id,
    );
    expect(stillPaid.status).toBe("paid");
    expect(stillPaid.dueDate).toBe(paidInstallment.dueDate);
    expect(stillPaid.amountCents).toBe(paidInstallment.amountCents);

    const pending = patchRes.body.installments.find(
      (item: { id: string }) => item.id !== paidInstallment.id,
    );
    expect(pending.status).toBe("pending");
    // paidCount = 1, so the pending row is index 1 of the regenerated
    // schedule: startDate (2027-01-01) + 1 week = 2027-01-08.
    expect(pending.dueDate).toBe("2027-01-08");
  });

  it("PATCH /v1/debts/:id rejeita quantidade de parcelas menor que as já pagas", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida quase paga",
        installmentCount: 2,
        installmentAmount: 30,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 0 });

    expect(patchRes.status).toBe(400);
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
