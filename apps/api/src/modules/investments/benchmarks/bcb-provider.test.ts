import { describe, expect, it, jest } from "@jest/globals";
import { BcbProviderError, createBcbProvider } from "./bcb-provider.js";

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("createBcbProvider", () => {
  it("retorna pontos normalizados para uma série mensal (IPCA)", async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse([
        { data: "01/04/2026", valor: "0.67" },
        { data: "01/05/2026", valor: "0.58" },
      ]),
    );
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchSeries(433, 3);

    expect(result).toEqual([
      { date: "2026-04-01", value: 0.67 },
      { date: "2026-05-01", value: 0.58 },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("retorna pontos diários sem forçar dia 1 (CDI)", async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse([{ data: "27/07/2026", valor: "14.15" }]),
    );
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchSeries(4389, 15);

    expect(result).toEqual([{ date: "2026-07-27", value: 14.15 }]);
  });

  it("lança BcbProviderError em status não-200", async () => {
    const fetchFn = jest.fn(async () => fakeResponse([], false, 503));
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });

  it("lança BcbProviderError em erro de rede", async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error("network down");
    });
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });

  it("lança BcbProviderError quando a resposta não é um array", async () => {
    const fetchFn = jest.fn(async () => fakeResponse({ erro: "formato" }));
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });

  it("lança BcbProviderError quando um ponto tem valor não numérico", async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse([{ data: "01/04/2026", valor: "N/D" }]),
    );
    const provider = createBcbProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchSeries(433, 3)).rejects.toThrow(
      BcbProviderError,
    );
  });
});
