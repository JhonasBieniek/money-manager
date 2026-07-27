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

  it("PATCH /v1/debts/:id rejeita quantidade de parcelas menor que a maior parcela já paga", async () => {
    const { accessToken } = await registerUser(app);

    // Use a "daily" schedule starting on day 1 of the current real month so
    // that all 3 due dates (day 1, 2, 3) land in the current month and get
    // auto-synced to "paid" immediately on creation — giving us a debt with
    // 3 paid installments (maxPaidNumber = 3) without needing the Task 4
    // per-installment toggle endpoint.
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida quase paga",
        installmentCount: 3,
        installmentPeriod: "daily",
        installmentAmount: 30,
        autoSyncExpenses: true,
        startDate,
      });

    const debtId = createRes.body.id as string;
    const paidInstallments = createRes.body.installments.filter(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidInstallments).toHaveLength(3);

    // installmentCount: 1 is valid per the Zod schema (min 1), but the
    // highest paid installmentNumber is 3, so the service-layer guard must
    // still reject it.
    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 1 });

    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toContain(
      "não pode ser menor que as parcelas já pagas",
    );
  });

  it("PATCH /v1/debts/:id aceita installmentCount igual à maior parcela já paga", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Dívida no limite",
        installmentCount: 2,
        installmentAmount: 30,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const paidInstallments = createRes.body.installments.filter(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidInstallments).toHaveLength(1);

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 1 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installmentCount).toBe(1);
    expect(patchRes.body.installments).toHaveLength(1);
    expect(patchRes.body.installments[0].status).toBe("paid");
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

  it("PATCH /v1/debts/:debtId/installments/:installmentId marca parcelas pagas manualmente em sequência, sem criar despesa", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Marcação manual",
        installmentCount: 5,
        installmentAmount: 60,
        autoSyncExpenses: false,
      });

    const debtId = createRes.body.id as string;
    const [firstId, secondId] = createRes.body.installments.map(
      (item: { id: string }) => item.id,
    );

    // Simulates marking 2 of 5 installments as already paid right after
    // creation, via sequential toggle calls (the pattern the frontend uses).
    await request(app)
      .patch(`/v1/debts/${debtId}/installments/${firstId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });

    const toggleRes = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${secondId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });

    expect(toggleRes.status).toBe(200);
    const paidItems = toggleRes.body.installments.filter(
      (item: { status: string }) => item.status === "paid",
    );
    expect(paidItems).toHaveLength(2);
    expect(paidItems.every((item: { expenseId: string | null }) => item.expenseId === null)).toBe(
      true,
    );
    expect(toggleRes.body.paidCents).toBe(12000);
    expect(toggleRes.body.remainingBalanceCents).toBe(18000);

    const expensesRes = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(
      expensesRes.body.items.some((item: { description: string }) =>
        item.description.includes("Marcação manual"),
      ),
    ).toBe(false);
  });

  it("PATCH /v1/debts/:debtId/installments/:installmentId desmarca parcela paga por autoSync sem apagar a despesa", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Desmarcar sync",
        installmentCount: 1,
        installmentAmount: 45,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const installment = createRes.body.installments[0];
    expect(installment.status).toBe("paid");
    expect(installment.expenseId).not.toBeNull();

    const toggleRes = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${installment.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "pending" });

    expect(toggleRes.status).toBe(200);
    const toggled = toggleRes.body.installments.find(
      (item: { id: string }) => item.id === installment.id,
    );
    expect(toggled.status).toBe("pending");
    expect(toggled.expenseId).toBeNull();
    expect(toggleRes.body.paidCents).toBe(0);

    const expensesRes = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(
      expensesRes.body.items.some((item: { description: string }) =>
        item.description.includes("Desmarcar sync"),
      ),
    ).toBe(true);
  });

  it("PATCH /v1/debts/:debtId/installments/:installmentId é idempotente e retorna 404 para parcela inexistente", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Idempotência",
        installmentCount: 1,
        installmentAmount: 10,
      });

    const debtId = createRes.body.id as string;
    const installmentId = createRes.body.installments[0].id as string;

    const first = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${installmentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "pending" });
    expect(first.status).toBe(200);

    const notFound = await request(app)
      .patch(`/v1/debts/${debtId}/installments/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });
    expect(notFound.status).toBe(404);
  });

  it("PATCH /v1/debts/:id preserva parcela paga fora de sequência ao alterar a quantidade", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Pagamento fora de ordem",
        installmentCount: 5,
        installmentAmount: 20,
        autoSyncExpenses: false,
      });

    const debtId = createRes.body.id as string;
    const thirdInstallment = createRes.body.installments[2];

    // Mark only the THIRD installment paid, leaving #1, #2, #4, #5 pending.
    await request(app)
      .patch(`/v1/debts/${debtId}/installments/${thirdInstallment.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "paid" });

    const patchRes = await request(app)
      .patch(`/v1/debts/${debtId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ installmentCount: 7 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.installments).toHaveLength(7);

    const stillPaid = patchRes.body.installments.find(
      (item: { id: string }) => item.id === thirdInstallment.id,
    );
    expect(stillPaid.status).toBe("paid");
    expect(stillPaid.installmentNumber).toBe(3);
    expect(stillPaid.dueDate).toBe(thirdInstallment.dueDate);
    expect(stillPaid.amountCents).toBe(thirdInstallment.amountCents);

    const pendingNumbers = patchRes.body.installments
      .filter((item: { status: string }) => item.status === "pending")
      .map((item: { installmentNumber: number }) => item.installmentNumber)
      .sort((a: number, b: number) => a - b);
    expect(pendingNumbers).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it("PATCH /v1/debts/:debtId/installments/:installmentId desmarcado permanece pendente após recarregar a lista (não é revertido pelo auto-sync)", async () => {
    const { accessToken } = await registerUser(app);

    const createRes = await request(app)
      .post("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Regressão auto-sync",
        installmentCount: 1,
        installmentAmount: 45,
        autoSyncExpenses: true,
      });

    const debtId = createRes.body.id as string;
    const installment = createRes.body.installments[0];
    expect(installment.status).toBe("paid");
    expect(installment.expenseId).not.toBeNull();

    const toggleRes = await request(app)
      .patch(`/v1/debts/${debtId}/installments/${installment.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "pending" });
    expect(toggleRes.status).toBe(200);

    // Simulates the frontend reloading the debts list after closing the
    // edit modal — this is what previously re-triggered auto-sync and
    // silently flipped the installment back to "paid" with a NEW expense.
    const listRes = await request(app)
      .get("/v1/debts")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);

    const reloadedDebt = listRes.body.items.find(
      (item: { id: string }) => item.id === debtId,
    );
    const reloadedInstallment = reloadedDebt.installments.find(
      (item: { id: string }) => item.id === installment.id,
    );
    expect(reloadedInstallment.status).toBe("pending");
    expect(reloadedInstallment.expenseId).toBeNull();
    expect(reloadedDebt.paidCents).toBe(0);

    const expensesRes = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);
    const matchingExpenses = expensesRes.body.items.filter(
      (item: { description: string }) =>
        item.description.includes("Regressão auto-sync"),
    );
    expect(matchingExpenses).toHaveLength(1);
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
