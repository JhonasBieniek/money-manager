import { describe, expect, it } from "@jest/globals";
import {
  annualToMonthlyPct,
  compoundAccumulatedPct,
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
