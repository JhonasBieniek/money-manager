import { describe, expect, it } from "@jest/globals";
import { hasDailyTriggerPassed } from "./quote-scheduler.js";

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
