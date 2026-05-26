import { describe, expect, it } from "vitest";
import { parseExpenseUtterance } from "./parse-expense-utterance.js";

describe("parseExpenseUtterance", () => {
  it("extracts amount, description and pix from spoken phrase", () => {
    const result = parseExpenseUtterance("gastei 50 reais no mercado no pix");
    expect(result.amount).toBe(50);
    expect(result.description).toBe("mercado");
    expect(result.paymentMethod).toBe("pix");
    expect(result.rawText).toBe("gastei 50 reais no mercado no pix");
  });

  it("extracts BRL formatted amount", () => {
    const result = parseExpenseUtterance("paguei R$ 129,90 no uber");
    expect(result.amount).toBe(129.9);
    expect(result.description).toBe("uber");
  });

  it("returns partial result when amount is missing", () => {
    const result = parseExpenseUtterance("comprei no mercado");
    expect(result.amount).toBeUndefined();
    expect(result.description).toBe("mercado");
  });

  it("detects credit card payment", () => {
    const result = parseExpenseUtterance("gastei 30 reais no cartão de crédito");
    expect(result.paymentMethod).toBe("credit_card");
  });

  it("detects cash payment", () => {
    const result = parseExpenseUtterance("paguei 20 reais em dinheiro");
    expect(result.paymentMethod).toBe("cash");
  });
});
