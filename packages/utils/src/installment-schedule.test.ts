import { describe, expect, it } from "@jest/globals";
import {
  addInstallmentPeriod,
  calculateDebtEndDate,
  calendarDate,
  generateInstallmentDueDates,
  toDateString,
} from "./installment-schedule.js";

describe("installment-schedule", () => {
  it("generates monthly due dates", () => {
    const start = calendarDate(2026, 1, 15);
    const dates = generateInstallmentDueDates(start, 3, "monthly");
    expect(dates).toHaveLength(3);
    expect(toDateString(dates[0]!)).toBe("2026-01-15");
    expect(toDateString(dates[1]!)).toBe("2026-02-15");
    expect(toDateString(dates[2]!)).toBe("2026-03-15");
  });

  it("calculates end date as last installment", () => {
    const start = calendarDate(2026, 1, 10);
    const end = calculateDebtEndDate(start, 12, "monthly");
    expect(toDateString(end)).toBe("2026-12-10");
  });

  it("adds weekly periods", () => {
    const start = calendarDate(2026, 7, 1);
    const next = addInstallmentPeriod(start, "weekly", 2);
    expect(toDateString(next)).toBe("2026-07-15");
  });
});
