import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockUpdate = jest.fn();
const mockSet = jest.fn(() => ({ where: jest.fn() }));
jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => ({ update: mockUpdate }),
  investmentHoldings: {},
}));

const mockGetCachedQuote = jest.fn();
const mockUpsertCachedQuote = jest.fn();
jest.unstable_mockModule("./quote-cache.repository.js", () => ({
  getCachedQuote: mockGetCachedQuote,
  upsertCachedQuote: mockUpsertCachedQuote,
}));

const mockFetchQuote = jest.fn();
jest.unstable_mockModule("./quote-router.js", () => ({
  createQuoteRouter: () => ({
    getProvider: () => ({ fetchQuote: mockFetchQuote }),
  }),
}));

const { refreshHoldingQuote } = await import("./quote-refresh.service.js");

function holding(overrides: Record<string, unknown> = {}) {
  return {
    id: "h1",
    accountId: "acc1",
    userId: "user1",
    symbol: "PETR4",
    incomeType: "variable_income",
    assetClass: "stocks",
    quantity: "100",
    averageCostCents: null,
    currentUnitValueCents: 0,
    maturityDate: null,
    pricingSource: "brapi",
    manualOverride: false,
    lastQuoteError: null,
    lastValuationAt: new Date("2026-01-01T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("refreshHoldingQuote", () => {
  beforeEach(() => {
    mockUpdate.mockReturnValue({ set: mockSet });
    mockGetCachedQuote.mockReset();
    mockUpsertCachedQuote.mockReset();
    mockFetchQuote.mockReset();
  });

  it("não faz nada para holdings de renda fixa", async () => {
    const rf = holding({ incomeType: "fixed_income", assetClass: null });
    const result = await refreshHoldingQuote(rf as never, "on-demand");
    expect(result).toBe(rf);
    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("não faz nada quando manualOverride é true", async () => {
    const overridden = holding({ manualOverride: true });
    const result = await refreshHoldingQuote(overridden as never, "on-demand");
    expect(result).toBe(overridden);
    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("reutiliza cache fresco em trigger background sem chamar o provider", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    mockGetCachedQuote.mockResolvedValue({
      unitValueCents: 3800,
      quotedAt: new Date("2026-01-15T11:50:00.000Z"),
      expiresAt: new Date("2026-01-15T12:30:00.000Z"),
    });

    await refreshHoldingQuote(holding() as never, "background", now);

    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("ignora TTL mas respeita throttle de 1 min em trigger on-demand", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    mockGetCachedQuote.mockResolvedValue({
      unitValueCents: 3800,
      quotedAt: new Date("2026-01-15T11:59:30.000Z"),
      expiresAt: new Date("2026-01-15T11:00:00.000Z"),
    });

    await refreshHoldingQuote(holding() as never, "on-demand", now);

    expect(mockFetchQuote).not.toHaveBeenCalled();
  });

  it("busca cotação nova quando cache expirou (background)", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    mockGetCachedQuote.mockResolvedValue({
      unitValueCents: 3800,
      quotedAt: new Date("2026-01-15T09:00:00.000Z"),
      expiresAt: new Date("2026-01-15T10:00:00.000Z"),
    });
    mockFetchQuote.mockResolvedValue({ unitValueCents: 3900, raw: {} });

    await refreshHoldingQuote(holding() as never, "background", now);

    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4");
    expect(mockUpsertCachedQuote).toHaveBeenCalled();
  });

  it("mantém holding inalterado no valor e grava last_quote_error quando o provider falha", async () => {
    mockGetCachedQuote.mockResolvedValue(null);
    mockFetchQuote.mockRejectedValue(new Error("Brapi retornou status 500"));

    await refreshHoldingQuote(holding() as never, "on-demand");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lastQuoteError: "Brapi retornou status 500",
      }),
    );
    const setCallArg = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCallArg.currentUnitValueCents).toBeUndefined();
  });
});
