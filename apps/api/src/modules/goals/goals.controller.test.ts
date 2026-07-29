import { describe, expect, it } from "@jest/globals";
import { resolveUsageYearMonth } from "./goals.controller.js";

describe("resolveUsageYearMonth", () => {
  it("usa year/month da query quando ambos informados", () => {
    const now = new Date("2026-06-15T15:00:00.000Z");
    const result = resolveUsageYearMonth({ year: 2020, month: 3 }, now);
    expect(result).toEqual({ year: 2020, month: 3 });
  });

  it("usa o mês/ano BRT corrente quando query não informa, sem ambiguidade de fuso", () => {
    const now = new Date("2026-06-15T15:00:00.000Z"); // 12:00 BRT
    const result = resolveUsageYearMonth({}, now);
    expect(result).toEqual({ year: 2026, month: 6 });
  });

  it("usa o mês/ano BRT corrente mesmo quando UTC já virou o mês (fuso não-BRT)", () => {
    // 2026-02-01T01:00:00Z corresponde a 2026-01-31T22:00:00-03:00: já é
    // fevereiro em UTC, mas ainda é janeiro no horário de Brasília. Uma
    // implementação baseada em now.getFullYear()/getMonth() sem conversão
    // para BRT mostraria o uso de metas do mês errado (fevereiro) num host
    // não-BRT.
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-02-01T01:00:00.000Z");
      const result = resolveUsageYearMonth({}, now);
      expect(result).toEqual({ year: 2026, month: 1 });
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
