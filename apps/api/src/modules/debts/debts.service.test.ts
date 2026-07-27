import { describe, expect, it } from "@jest/globals";
import { resolveInstallmentCentsForUpdate } from "./debts.service.js";

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
});
