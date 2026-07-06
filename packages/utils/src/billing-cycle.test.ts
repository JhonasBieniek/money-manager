import { describe, expect, it } from "@jest/globals";
import {
  adjustToBusinessDay,
  calendarDate,
  computeBillingCycle,
  computeClosingDate,
  computeNominalClosingDay,
  findBillingCycleForPurchase,
  findCurrentBillingCycle,
  isDateInPeriod,
  toDateString,
} from "./billing-cycle.js";

describe("computeNominalClosingDay", () => {
  it("calcula dia nominal com offset padrão", () => {
    expect(computeNominalClosingDay(5, 7)).toBe(29);
    expect(computeNominalClosingDay(10, 7)).toBe(3);
  });
});

describe("adjustToBusinessDay", () => {
  it("move sábado para sexta", () => {
    const saturday = calendarDate(2026, 3, 28);
    expect(saturday.getDay()).toBe(6);
    const friday = adjustToBusinessDay(saturday);
    expect(friday.getDay()).toBe(5);
    expect(friday.getDate()).toBe(27);
  });

  it("move domingo para sexta", () => {
    const sunday = calendarDate(2026, 3, 29);
    const friday = adjustToBusinessDay(sunday);
    expect(friday.getDay()).toBe(5);
    expect(friday.getDate()).toBe(27);
  });
});

describe("computeClosingDate", () => {
  it("fecha ~7 dias antes do vencimento", () => {
    const closing = computeClosingDate(2026, 3, 10, 7);
    expect(toDateString(closing)).toBe("2026-03-03");
  });

  it("vencimento dia 5 → fechamento no mês anterior", () => {
    const closing = computeClosingDate(2026, 3, 5, 7);
    expect(closing.getMonth()).toBe(1);
    expect(closing.getDate()).toBe(26);
  });

  it("ajusta fechamento que cai no fim de semana", () => {
    const closing = computeClosingDate(2026, 4, 13, 7);
    expect(closing.getDay()).not.toBe(0);
    expect(closing.getDay()).not.toBe(6);
  });
});

describe("computeBillingCycle", () => {
  it("define período inclusivo no dia de fechamento", () => {
    const cycle = computeBillingCycle(2026, 3, 10, 7);
    const closingDay = calendarDate(2026, 3, 3);
    expect(isDateInPeriod(closingDay, cycle.periodStart, cycle.periodEnd)).toBe(
      true,
    );
  });

  it("compra após fechamento pertence ao próximo ciclo", () => {
    const cycleMar = computeBillingCycle(2026, 3, 10, 7);
    const afterClose = calendarDate(2026, 3, 4);
    expect(
      isDateInPeriod(afterClose, cycleMar.periodStart, cycleMar.periodEnd),
    ).toBe(false);

    const cycleApr = computeBillingCycle(2026, 4, 10, 7);
    expect(
      isDateInPeriod(afterClose, cycleApr.periodStart, cycleApr.periodEnd),
    ).toBe(true);
  });

  it("lida com vencimento dia 31 em fevereiro", () => {
    const cycle = computeBillingCycle(2026, 3, 31, 7);
    expect(cycle.dueDate.getDate()).toBe(31);
    expect(cycle.periodEnd.getTime()).toBeLessThan(cycle.dueDate.getTime());
  });
});

describe("findBillingCycleForPurchase", () => {
  it("encontra ciclo correto para compra no meio do período", () => {
    const purchase = calendarDate(2026, 3, 15);
    const cycle = findBillingCycleForPurchase(purchase, 10, 7);
    expect(cycle.cycleMonth).toBe(4);
    expect(
      isDateInPeriod(purchase, cycle.periodStart, cycle.periodEnd),
    ).toBe(true);
  });

  it("compra exatamente no period_end pertence ao ciclo", () => {
    const cycle = computeBillingCycle(2026, 3, 10, 7);
    const purchase = cycle.periodEnd;
    const found = findBillingCycleForPurchase(purchase, 10, 7);
    expect(found.cycleYear).toBe(cycle.cycleYear);
    expect(found.cycleMonth).toBe(cycle.cycleMonth);
  });

  it("compra após period_end vai para o ciclo seguinte (venc. dia 5)", () => {
    const june30 = calendarDate(2026, 6, 30);
    const found = findBillingCycleForPurchase(june30, 5, 7);
    expect(found.cycleYear).toBe(2026);
    expect(found.cycleMonth).toBe(8);
    expect(isDateInPeriod(june30, found.periodStart, found.periodEnd)).toBe(
      true,
    );

    const june25 = calendarDate(2026, 6, 25);
    const julyCycle = findBillingCycleForPurchase(june25, 5, 7);
    expect(julyCycle.cycleMonth).toBe(7);
    expect(
      isDateInPeriod(june25, julyCycle.periodStart, julyCycle.periodEnd),
    ).toBe(true);
  });
});

describe("findCurrentBillingCycle", () => {
  it("após o fechamento do mês civil, retorna o ciclo do vencimento seguinte", () => {
    const afterJulyClose = calendarDate(2026, 7, 6);
    const cycle = findCurrentBillingCycle(afterJulyClose, 10, 7);
    expect(cycle.cycleYear).toBe(2026);
    expect(cycle.cycleMonth).toBe(8);
    expect(
      isDateInPeriod(afterJulyClose, cycle.periodStart, cycle.periodEnd),
    ).toBe(true);
  });
});

describe("findCurrentBillingCycle", () => {
  it("após o fechamento do mês civil, retorna o ciclo do vencimento seguinte", () => {
    const afterJulyClose = calendarDate(2026, 7, 6);
    const cycle = findCurrentBillingCycle(afterJulyClose, 10, 7);
    expect(cycle.cycleYear).toBe(2026);
    expect(cycle.cycleMonth).toBe(8);
    expect(
      isDateInPeriod(afterJulyClose, cycle.periodStart, cycle.periodEnd),
    ).toBe(true);
  });
});
