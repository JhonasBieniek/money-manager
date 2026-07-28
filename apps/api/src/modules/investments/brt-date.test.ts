import { describe, expect, it } from "@jest/globals";
import {
  hasDailyTriggerPassed,
  hasWeeklyElapsed,
  todayBrtString,
} from "./brt-date.js";

describe("todayBrtString", () => {
  it("retorna a data em BRT mesmo quando UTC já virou o dia seguinte", () => {
    // 01:30 UTC = 22:30 BRT do dia anterior (UTC-3)
    const now = new Date("2026-01-16T01:30:00.000Z");
    expect(todayBrtString(now)).toBe("2026-01-15");
  });
});

describe("hasDailyTriggerPassed", () => {
  it("retorna false antes das 8h BRT", () => {
    // 10:00 UTC = 07:00 BRT (UTC-3)
    const now = new Date("2026-01-15T10:00:00.000Z");
    expect(hasDailyTriggerPassed(now, null)).toBe(false);
  });

  it("retorna true às 8h BRT ou depois, se ainda não rodou hoje", () => {
    // 11:30 UTC = 08:30 BRT
    const now = new Date("2026-01-15T11:30:00.000Z");
    expect(hasDailyTriggerPassed(now, null)).toBe(true);
  });

  it("retorna false se já rodou hoje (mesma data BRT)", () => {
    const now = new Date("2026-01-15T11:30:00.000Z");
    expect(hasDailyTriggerPassed(now, "2026-01-15")).toBe(false);
  });

  it("retorna true no dia seguinte após as 8h, mesmo com lastRunDate do dia anterior", () => {
    const now = new Date("2026-01-16T11:30:00.000Z");
    expect(hasDailyTriggerPassed(now, "2026-01-15")).toBe(true);
  });
});

describe("hasWeeklyElapsed", () => {
  it("retorna true quando nunca rodou (lastRunAt null)", () => {
    expect(hasWeeklyElapsed(new Date("2026-01-15T00:00:00.000Z"), null)).toBe(
      true,
    );
  });

  it("retorna false quando faltam menos de 7 dias", () => {
    const lastRunAt = new Date("2026-01-10T00:00:00.000Z");
    const now = new Date("2026-01-15T00:00:00.000Z"); // 5 dias depois
    expect(hasWeeklyElapsed(now, lastRunAt)).toBe(false);
  });

  it("retorna true quando já passaram 7 dias ou mais", () => {
    const lastRunAt = new Date("2026-01-08T00:00:00.000Z");
    const now = new Date("2026-01-15T00:00:00.000Z"); // exatamente 7 dias depois
    expect(hasWeeklyElapsed(now, lastRunAt)).toBe(true);
  });

  it("aceita um intervalDays customizado", () => {
    const lastRunAt = new Date("2026-01-13T00:00:00.000Z");
    const now = new Date("2026-01-15T00:00:00.000Z"); // 2 dias depois
    expect(hasWeeklyElapsed(now, lastRunAt, 2)).toBe(true);
    expect(hasWeeklyElapsed(now, lastRunAt, 3)).toBe(false);
  });
});
