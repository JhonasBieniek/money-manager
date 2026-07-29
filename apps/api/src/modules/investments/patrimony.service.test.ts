import { describe, expect, it } from "@jest/globals";
import {
  computeHistoryCutoffDate,
  computePatrimonySummary,
  subtractMonthsClamped,
} from "./patrimony.service.js";

type HoldingFixture = Parameters<typeof computePatrimonySummary>[0][number];
type AccountFixture = Parameters<typeof computePatrimonySummary>[1][number];
type PiggyBankFixture = Parameters<typeof computePatrimonySummary>[2][number];
type QuoteCacheFixture = Parameters<typeof computePatrimonySummary>[3][number];

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

function quoteCache(overrides: Partial<QuoteCacheFixture>): QuoteCacheFixture {
  return {
    symbol: "PETR4",
    assetClass: "stocks",
    unitValueCents: 3800,
    pricingSource: "brapi",
    quotedAt: new Date("2026-01-15T00:00:00.000Z"),
    expiresAt: new Date("2026-01-15T01:00:00.000Z"),
    rawResponse: null,
    ...overrides,
  } as QuoteCacheFixture;
}

describe("computePatrimonySummary", () => {
  it("soma holdings e cofrinhos para o total de patrimônio", () => {
    const result = computePatrimonySummary(
      [holding({ currentUnitValueCents: 10000 })],
      [account({})],
      [piggyBank({ currentAmountCents: 5000 })],
      [],
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
        [],
        now,
      );

      expect(result.upcomingMaturities.map((m) => m.holdingId)).toContain(
        "h-today",
      );
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
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
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );
    expect(result.lastUpdatedAt).toBeNull();
  });

  it("multiplica quantity × currentUnitValueCents para holdings de renda variável", () => {
    const result = computePatrimonySummary(
      [
        holding({
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: "100",
          currentUnitValueCents: 3000,
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.investmentsCents).toBe(300000);
  });

  it("segmenta byAssetClass por classe real em holdings RV, mantendo RF agrupado", () => {
    const result = computePatrimonySummary(
      [
        holding({
          id: "h-rf",
          incomeType: "fixed_income",
          currentUnitValueCents: 5000,
        }),
        holding({
          id: "h-rv",
          incomeType: "variable_income",
          assetClass: "stocks",
          quantity: "10",
          currentUnitValueCents: 500,
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.byAssetClass).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "fixed_income_group",
          totalCents: 5000,
        }),
        expect.objectContaining({
          class: "stocks",
          totalCents: 5000,
          label: "Ações",
        }),
      ]),
    );
  });

  it("quotesStale é true quando uma holding RV não tem cache ou o cache expirou", () => {
    const result = computePatrimonySummary(
      [
        holding({
          incomeType: "variable_income",
          assetClass: "stocks",
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.quotesStale).toBe(true);
  });

  it("quotesStale é false quando o cache da holding RV ainda está válido", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");
    const result = computePatrimonySummary(
      [
        holding({
          symbol: "PETR4",
          incomeType: "variable_income",
          assetClass: "stocks",
          pricingSource: "brapi",
        }),
      ],
      [account({})],
      [],
      [
        quoteCache({
          symbol: "PETR4",
          assetClass: "stocks",
          expiresAt: new Date("2026-01-15T01:00:00.000Z"),
        }),
      ],
      now,
    );

    expect(result.quotesStale).toBe(false);
  });

  it("quotesStale ignora holdings RV com manualOverride ou pricingSource manual", () => {
    const result = computePatrimonySummary(
      [
        holding({
          id: "h-override",
          incomeType: "variable_income",
          assetClass: "stocks",
          pricingSource: "brapi",
          manualOverride: true,
        }),
        holding({
          id: "h-manual-class",
          incomeType: "variable_income",
          assetClass: "real_estate",
          pricingSource: "manual",
        }),
      ],
      [account({})],
      [],
      [],
      new Date("2026-01-15T00:00:00.000Z"),
    );

    expect(result.quotesStale).toBe(false);
  });
});

describe("subtractMonthsClamped", () => {
  it("subtrai meses normalmente quando o dia existe no mês de destino", () => {
    const result = subtractMonthsClamped(new Date(2026, 0, 15), 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(15);
  });

  it("limita o dia ao último dia do mês de destino quando ele não existe (31 de julho − 3 meses)", () => {
    const result = subtractMonthsClamped(new Date(2026, 6, 31), 3);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(30);
  });

  it("volta corretamente mais de 12 meses, cruzando anos", () => {
    const result = subtractMonthsClamped(new Date(2026, 2, 10), 14);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(10);
  });

  it("limita ao último dia de fevereiro em ano não bissexto", () => {
    const result = subtractMonthsClamped(new Date(2026, 2, 31), 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it("limita ao último dia de fevereiro em ano bissexto", () => {
    const result = subtractMonthsClamped(new Date(2028, 2, 31), 1);
    expect(result.getFullYear()).toBe(2028);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });
});

describe("computeHistoryCutoffDate", () => {
  it("calcula o corte N meses antes de hoje quando não há ambiguidade de fuso", () => {
    const now = new Date("2026-01-15T15:00:00.000Z"); // 12:00 BRT, longe da virada do dia
    expect(computeHistoryCutoffDate(now, 6)).toBe("2025-07-15");
  });

  it("usa a data BRT de hoje como base do corte, mesmo quando UTC já virou o dia (fuso não-BRT)", () => {
    // 2026-01-16T01:30:00Z corresponde a 2026-01-15T22:30:00-03:00: já é
    // "amanhã" em UTC, mas ainda é "hoje" (2026-01-15) no horário de Brasília.
    // Rodando com TZ=UTC (fuso não-BRT, como CI/produção), uma implementação
    // que lê Date.getFullYear/Month/Date sem conversão explícita para BRT
    // calcularia o corte a partir de "2026-01-16", retornando "2025-07-16"
    // em vez de "2025-07-15" (6 meses antes de hoje em BRT).
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-01-16T01:30:00.000Z");
      expect(computeHistoryCutoffDate(now, 6)).toBe("2025-07-15");
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it("aplica o clamping de fim de mês sobre o dia BRT correto, não sobre o dia UTC deslocado", () => {
    // 2026-03-30T01:00:00Z corresponde a 2026-03-29T22:00:00-03:00: ainda é
    // dia 29 em BRT, mas UTC já é dia 30. Um "patch mínimo" que apenas troca
    // a formatação final do corte por todayBrtString (sem corrigir o dia
    // usado na aritmética de meses) faria o clamping de fim de mês usar o
    // dia UTC (30) em vez do dia BRT (29), retornando "2026-02-27" em vez de
    // "2026-02-28".
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-03-30T01:00:00.000Z");
      expect(computeHistoryCutoffDate(now, 1)).toBe("2026-02-28");
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
