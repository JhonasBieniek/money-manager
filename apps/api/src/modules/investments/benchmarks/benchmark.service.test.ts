import { describe, expect, it } from "@jest/globals";
import {
  annualToMonthlyPct,
  compoundAccumulatedPct,
  computeBenchmarkStartMonth,
  latestPerMonth,
} from "./benchmark.service.js";

describe("annualToMonthlyPct", () => {
  it("converte uma taxa anualizada para o equivalente mensal", () => {
    // 12.6825% a.a. -> ~1% a.m. (raiz duodécima de 1.126825 ≈ 1.01)
    const result = annualToMonthlyPct(12.6825);
    expect(result).toBeCloseTo(1, 1);
  });

  it("retorna 0 para taxa anual 0", () => {
    expect(annualToMonthlyPct(0)).toBe(0);
  });
});

describe("compoundAccumulatedPct", () => {
  it("retorna a própria taxa para um único mês", () => {
    expect(compoundAccumulatedPct([0.67])).toBeCloseTo(0.67, 2);
  });

  it("composição de múltiplos meses dentro do mesmo ano", () => {
    // (1.10 * 1.10) - 1 = 0.21 → 21%
    // If naively summed, 10 + 10 = 20% (would fail this test)
    expect(compoundAccumulatedPct([10, 10])).toBeCloseTo(21, 0);
  });

  it("retorna 0 para lista vazia", () => {
    expect(compoundAccumulatedPct([])).toBe(0);
  });
});

describe("latestPerMonth", () => {
  it("mantém apenas o ponto mais recente de cada mês (série diária)", () => {
    const points = [
      { date: "2026-07-07", value: 14.15 },
      { date: "2026-07-27", value: 14.25 },
      { date: "2026-06-30", value: 14.0 },
    ];
    const result = latestPerMonth(points);

    expect(result.get("2026-07")).toEqual({ date: "2026-07-27", value: 14.25 });
    expect(result.get("2026-06")).toEqual({ date: "2026-06-30", value: 14.0 });
  });

  it("é um no-op para uma série já mensal (um ponto por mês)", () => {
    const points = [
      { date: "2026-04-01", value: 0.67 },
      { date: "2026-05-01", value: 0.58 },
    ];
    const result = latestPerMonth(points);

    expect(result.size).toBe(2);
    expect(result.get("2026-04")).toEqual({ date: "2026-04-01", value: 0.67 });
  });
});

describe("computeBenchmarkStartMonth", () => {
  it("período 'year' retorna 1º de janeiro do ano corrente quando não há ambiguidade de fuso", () => {
    const now = new Date("2026-06-15T15:00:00.000Z"); // 12:00 BRT
    expect(computeBenchmarkStartMonth(now, "year")).toBe("2026-01-01");
  });

  it("período '12m' retorna o 1º dia do mês 11 meses atrás quando não há ambiguidade de fuso", () => {
    const now = new Date("2026-06-15T15:00:00.000Z"); // 12:00 BRT
    expect(computeBenchmarkStartMonth(now, "12m")).toBe("2025-07-01");
  });

  it("usa o ano BRT corrente, mesmo quando UTC já virou o ano (fuso não-BRT)", () => {
    // 2027-01-01T01:30:00Z corresponde a 2026-12-31T22:30:00-03:00: já é
    // "ano novo" em UTC, mas ainda é 31/12/2026 no horário de Brasília.
    // Uma implementação baseada em now.getFullYear() sem conversão para BRT
    // usaria 2027 como ano corrente num host não-BRT, excluindo o ano
    // 2026 inteiro do filtro `gte(snapshotDate, startMonth)`.
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2027-01-01T01:30:00.000Z");
      expect(computeBenchmarkStartMonth(now, "year")).toBe("2026-01-01");
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it("usa o mês BRT corrente para o corte de 12m, mesmo quando UTC já virou o mês (fuso não-BRT)", () => {
    // 2026-02-01T01:00:00Z corresponde a 2026-01-31T22:00:00-03:00: já é
    // fevereiro em UTC, mas ainda é janeiro no horário de Brasília.
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-02-01T01:00:00.000Z");
      expect(computeBenchmarkStartMonth(now, "12m")).toBe("2025-02-01");
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
