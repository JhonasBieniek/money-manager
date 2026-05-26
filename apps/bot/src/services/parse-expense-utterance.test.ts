import { describe, expect, it } from "vitest";
import { parseExpenseUtterance, parseExpenseUtterances } from "./parse-expense-utterance.js";

describe("parseExpenseUtterances", () => {
  it("extracts multiple items from comma-separated phrase", () => {
    const result = parseExpenseUtterances(
      "40 reais em manga, 30 reais em maçã, 20 reais em banana"
    );
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ amount: 40, description: "manga" });
    expect(result.items[1]).toMatchObject({ amount: 30, description: "maçã" });
    expect(result.items[2]).toMatchObject({ amount: 20, description: "banana" });
  });

  it("applies global payment method to all items", () => {
    const result = parseExpenseUtterances(
      "40 reais em manga, 30 reais em maçã, no pix"
    );
    expect(result.paymentMethod).toBe("pix");
    expect(result.items.every((i) => i.paymentMethod === "pix")).toBe(true);
  });

  it("extracts BRL formatted amount in single item", () => {
    const result = parseExpenseUtterances("paguei R$ 129,90 no uber");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.amount).toBe(129.9);
    expect(result.items[0]?.description).toBe("uber");
  });

  it("returns partial result when amount is missing", () => {
    const result = parseExpenseUtterances("comprei no mercado");
    expect(result.items[0]?.amount).toBeUndefined();
    expect(result.items[0]?.description).toBe("mercado");
  });

  it("detects credit card payment", () => {
    const result = parseExpenseUtterances("gastei 30 reais no cartão de crédito");
    expect(result.items[0]?.paymentMethod).toBe("credit_card");
  });
});

describe("parseExpenseUtterance", () => {
  it("returns first item for backward compatibility", () => {
    const result = parseExpenseUtterance("gastei 50 reais no mercado no pix");
    expect(result.amount).toBe(50);
    expect(result.description).toBe("mercado");
    expect(result.paymentMethod).toBe("pix");
  });
});
