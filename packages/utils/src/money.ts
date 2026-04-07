/**
 * Único lugar do sistema para conversão entre centavos (inteiro) e valor decimal de exibição.
 */
const CENTS_PER_UNIT = 100;

export function parseMoneyToCents(input: string): number {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (Number.isNaN(n)) {
    throw new Error("Invalid money string");
  }
  return Math.round(n * CENTS_PER_UNIT);
}

export function centsToDisplay(cents: number, locale = "pt-BR"): string {
  const value = cents / CENTS_PER_UNIT;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
