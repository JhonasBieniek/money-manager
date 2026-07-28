import { describe, expect, it } from "@jest/globals";
import { BadRequestError } from "../../shared/errors/app-error.js";
import { resolveBalanceAfterTransaction } from "./piggy-banks.service.js";

describe("resolveBalanceAfterTransaction", () => {
  it("soma o valor ao saldo em um depósito", () => {
    const result = resolveBalanceAfterTransaction(1000, "deposit", 500);
    expect(result).toBe(1500);
  });

  it("subtrai o valor do saldo em um saque", () => {
    const result = resolveBalanceAfterTransaction(1000, "withdrawal", 400);
    expect(result).toBe(600);
  });

  it("permite saque que zera o saldo exatamente", () => {
    const result = resolveBalanceAfterTransaction(1000, "withdrawal", 1000);
    expect(result).toBe(0);
  });

  it("lança BadRequestError quando o saque excede o saldo", () => {
    expect(() =>
      resolveBalanceAfterTransaction(1000, "withdrawal", 1001),
    ).toThrow(BadRequestError);
  });
});
