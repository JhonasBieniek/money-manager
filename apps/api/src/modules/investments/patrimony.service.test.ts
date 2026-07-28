import { describe, expect, it } from "@jest/globals";
import { computePatrimonySummary } from "./patrimony.service.js";

type HoldingFixture = Parameters<typeof computePatrimonySummary>[0][number];
type AccountFixture = Parameters<typeof computePatrimonySummary>[1][number];
type PiggyBankFixture = Parameters<typeof computePatrimonySummary>[2][number];

function holding(overrides: Partial<HoldingFixture>): HoldingFixture {
  return {
    id: "holding-1",
    accountId: "account-1",
    userId: "user-1",
    symbol: "CDB Banco X",
    incomeType: "fixed_income",
    assetClass: null,
    quantity: "1",
    averageCostCents: null,
    currentUnitValueCents: 10000,
    maturityDate: null,
    pricingSource: "manual",
    manualOverride: false,
    lastValuationAt: new Date("2026-01-01T00:00:00.000Z"),
    lastQuoteError: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as HoldingFixture;
}

function account(overrides: Partial<AccountFixture>): AccountFixture {
  return {
    id: "account-1",
    userId: "user-1",
    name: "XP Investimentos",
    type: "brokerage",
    institution: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as AccountFixture;
}

function piggyBank(overrides: Partial<PiggyBankFixture>): PiggyBankFixture {
  return {
    id: "piggy-1",
    userId: "user-1",
    name: "Viagem",
    icon: null,
    currentAmountCents: 5000,
    targetAmountCents: null,
    goalDescription: null,
    targetDate: null,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as PiggyBankFixture;
}

describe("computePatrimonySummary", () => {
  it("soma holdings e cofrinhos para o total de patrimônio", () => {
    const result = computePatrimonySummary(
      [holding({ currentUnitValueCents: 10000 })],
      [account({})],
      [piggyBank({ currentAmountCents: 5000 })],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.investmentsCents).toBe(10000);
    expect(result.piggyBanksCents).toBe(5000);
    expect(result.totalAssetsCents).toBe(15000);
    expect(result.quotesStale).toBe(false);
  });

  it("agrupa holdings por conta em byAccount", () => {
    const result = computePatrimonySummary(
      [
        holding({ id: "h1", accountId: "acc-1", currentUnitValueCents: 3000 }),
        holding({ id: "h2", accountId: "acc-1", currentUnitValueCents: 2000 }),
        holding({ id: "h3", accountId: "acc-2", currentUnitValueCents: 1000 }),
      ],
      [
        account({ id: "acc-1", name: "Conta A" }),
        account({ id: "acc-2", name: "Conta B" }),
      ],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.byAccount).toEqual(
      expect.arrayContaining([
        { accountId: "acc-1", name: "Conta A", totalCents: 5000 },
        { accountId: "acc-2", name: "Conta B", totalCents: 1000 },
      ]),
    );
  });

  it("retorna byAssetClass vazio quando não há holdings", () => {
    const result = computePatrimonySummary(
      [],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );
    expect(result.byAssetClass).toEqual([]);
    expect(result.totalAssetsCents).toBe(0);
  });

  it("filtra upcomingMaturities dentro da janela de 90 dias", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = computePatrimonySummary(
      [
        holding({
          id: "h-soon",
          symbol: "CDB vence em breve",
          maturityDate: "2026-02-01",
          currentUnitValueCents: 1000,
        }),
        holding({
          id: "h-far",
          symbol: "CDB vence longe",
          maturityDate: "2027-01-01",
          currentUnitValueCents: 2000,
        }),
        holding({
          id: "h-none",
          symbol: "CDB sem vencimento",
          maturityDate: null,
          currentUnitValueCents: 3000,
        }),
      ],
      [account({})],
      [],
      now,
    );

    expect(result.upcomingMaturities).toHaveLength(1);
    expect(result.upcomingMaturities[0]?.holdingId).toBe("h-soon");
  });

  it("inclui holding cujo vencimento é hoje mesmo quando UTC já virou o dia (fuso America/Sao_Paulo)", () => {
    // 2026-01-16T01:30:00Z corresponde a 2026-01-15T22:30:00-03:00: já é
    // "amanhã" em UTC, mas ainda é "hoje" (2026-01-15) no horário de Brasília.
    // Uma implementação baseada em now.toISOString().slice(0, 10) calcularia
    // todayStr = "2026-01-16" e excluiria erroneamente um holding vencendo
    // exatamente hoje (2026-01-15) do filtro `maturityDate >= todayStr`.
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    try {
      const now = new Date("2026-01-16T01:30:00.000Z");
      const result = computePatrimonySummary(
        [
          holding({
            id: "h-today",
            symbol: "CDB vence hoje",
            maturityDate: "2026-01-15",
            currentUnitValueCents: 1000,
          }),
        ],
        [account({})],
        [],
        now,
      );

      expect(result.upcomingMaturities.map((m) => m.holdingId)).toContain(
        "h-today",
      );
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("usa o maior last_valuation_at como lastUpdatedAt", () => {
    const result = computePatrimonySummary(
      [
        holding({
          id: "h1",
          lastValuationAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        holding({
          id: "h2",
          lastValuationAt: new Date("2026-01-10T00:00:00.000Z"),
        }),
      ],
      [account({})],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.lastUpdatedAt).toBe("2026-01-10T00:00:00.000Z");
  });

  it("retorna lastUpdatedAt null quando não há holdings", () => {
    const result = computePatrimonySummary(
      [],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );
    expect(result.lastUpdatedAt).toBeNull();
  });
});
