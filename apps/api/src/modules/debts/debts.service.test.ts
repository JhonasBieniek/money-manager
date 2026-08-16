import { describe, expect, it } from "@jest/globals";
import { BadRequestError } from "../../shared/errors/app-error.js";
import {
  isFutureBrtMonth,
  resolveCurrentBrtMonth,
  resolveInstallmentCentsForUpdate,
} from "./debts.service.js";

const baseExisting = {
  installmentCents: 5000,
} as Parameters<typeof resolveInstallmentCentsForUpdate>[1];

describe("resolveInstallmentCentsForUpdate", () => {
  it("mantém o valor da parcela existente quando nada sobre valor é informado", () => {
    const result = resolveInstallmentCentsForUpdate(
      { installmentCount: 6 },
      baseExisting,
      2,
      10000,
      6,
    );
    expect(result).toBe(5000);
  });

  it("usa installmentAmount quando informado, mesmo com parcelas pagas", () => {
    const result = resolveInstallmentCentsForUpdate(
      { installmentAmount: 75 },
      baseExisting,
      2,
      10000,
      6,
    );
    expect(result).toBe(7500);
  });

  it("deriva o valor da parcela a partir de totalAmount, descontando o já pago", () => {
    // 2 paid @ 5000 = 10000 paidTotalCents; new total 40000; pendingCount = 6 - 2 = 4
    // pending total = 40000 - 10000 = 30000; per installment = 30000 / 4 = 7500
    const result = resolveInstallmentCentsForUpdate(
      { totalAmount: 400 },
      baseExisting,
      2,
      10000,
      6,
    );
    expect(result).toBe(7500);
  });

  it("cai no valor existente quando totalAmount é informado mas não há parcelas pendentes", () => {
    const result = resolveInstallmentCentsForUpdate(
      { totalAmount: 100 },
      baseExisting,
      6,
      30000,
      6,
    );
    expect(result).toBe(5000);
  });

  it("lança BadRequestError quando totalAmount é menor ou igual ao valor já pago", () => {
    // 2 paid @ 5000 = 10000 paidTotalCents; 6 total installments so
    // pendingCount = 4; caller sends totalAmount 90 (9000 cents), which is
    // less than the 10000 already paid.
    expect(() =>
      resolveInstallmentCentsForUpdate(
        { totalAmount: 90 },
        baseExisting,
        2,
        10000,
        6,
      ),
    ).toThrow(BadRequestError);
  });
});

describe("resolveCurrentBrtMonth", () => {
  it("retorna ano/mês BRT corrente sem ambiguidade de fuso", () => {
    const now = new Date("2026-06-15T15:00:00.000Z"); // 12:00 BRT
    expect(resolveCurrentBrtMonth(now)).toEqual({ year: 2026, month: 6 });
  });

  it("usa o mês BRT corrente mesmo quando UTC já virou o mês (fuso não-BRT)", () => {
    // 2026-02-01T01:00:00Z corresponde a 2026-01-31T22:00:00-03:00: já é
    // fevereiro em UTC, mas ainda é janeiro no horário de Brasília. Uma
    // implementação baseada em now.getFullYear()/getMonth() sem conversão
    // para BRT sincronizaria parcelas do mês errado (fevereiro) num host
    // não-BRT, quitando parcelas de janeiro incorretamente/deixando de
    // gerar a despesa correspondente.
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-02-01T01:00:00.000Z");
      expect(resolveCurrentBrtMonth(now)).toEqual({ year: 2026, month: 1 });
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});

describe("isFutureBrtMonth", () => {
  // now = 2026-06-15 (BRT)
  const now = new Date("2026-06-15T15:00:00.000Z");

  it("não considera futuro o próprio mês corrente", () => {
    expect(isFutureBrtMonth(2026, 6, now)).toBe(false);
  });

  it("não considera futuro um mês anterior", () => {
    expect(isFutureBrtMonth(2026, 5, now)).toBe(false);
    expect(isFutureBrtMonth(2025, 12, now)).toBe(false);
  });

  it("considera futuro o mês seguinte", () => {
    expect(isFutureBrtMonth(2026, 7, now)).toBe(true);
  });

  it("considera futuro um mês em ano seguinte", () => {
    expect(isFutureBrtMonth(2027, 1, now)).toBe(true);
  });

  it("considera futuro um mês do mesmo ano ainda não chegado", () => {
    expect(isFutureBrtMonth(2026, 12, now)).toBe(true);
  });
});
