import { describe, expect, it } from "@jest/globals";
import { todayCalendarDate } from "./credit-cards.service.js";

describe("todayCalendarDate", () => {
  it("retorna o dia corrente quando não há ambiguidade de fuso", () => {
    const now = new Date("2026-01-15T15:00:00.000Z"); // 12:00 BRT
    const result = todayCalendarDate(now);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it("usa a data BRT de hoje, mesmo quando UTC já virou o dia (fuso não-BRT)", () => {
    // 2026-01-16T01:30:00Z corresponde a 2026-01-15T22:30:00-03:00: já é
    // "amanhã" em UTC, mas ainda é "hoje" (dia 15) no horário de Brasília.
    // Uma implementação baseada em now.getFullYear()/getMonth()/getDate() sem
    // conversão explícita para BRT trataria "hoje" como dia 16 num host
    // não-BRT (CI/produção), fechando faturas com period_end = dia 15 um dia
    // antes da hora (autoCloseExpiredOpenStatements considera period_end
    // encerrado assim que periodEnd < today).
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-01-16T01:30:00.000Z");
      const result = todayCalendarDate(now);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
