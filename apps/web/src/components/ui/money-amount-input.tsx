import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../../lib/cn";

const MAX_DIGITS = 15;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Formata uma string de dígitos (representando centavos) como "1.234,56". */
export function formatMoneyDigits(rawDigits: string): string {
  const digits = onlyDigits(rawDigits).replace(/^0+(?=\d)/, "");
  if (!digits) return "";

  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const intPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${withThousands},${cents}`;
}

/** Converte um valor "1234,56"/"1234.56" (sem separador de milhar) em dígitos de centavos. */
function amountToDigits(value: string): string {
  if (!value.trim()) return "";
  const parsed = parseMoneyAmountInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return String(Math.round(parsed * 100));
}

export function parseMoneyAmountInput(value: string): number {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return parseFloat(normalized);
}

type MoneyAmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export const MoneyAmountInput = forwardRef<
  HTMLInputElement,
  MoneyAmountInputProps
>(function MoneyAmountInput(
  {
    value,
    onChange,
    placeholder = "0,00",
    required,
    className,
    onKeyDown,
  },
  forwardedRef,
) {
  const [digits, setDigits] = useState(() => amountToDigits(value));
  const [syncedValue, setSyncedValue] = useState(value);
  const innerRef = useRef<HTMLInputElement | null>(null);

  // `value` mudou por fora (edição carregada, campo resetado, valor
  // recalculado a partir de outro input) — resincroniza os dígitos internos.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDigits(amountToDigits(value));
  }

  const display = formatMoneyDigits(digits);

  useEffect(() => {
    const input = innerRef.current;
    if (!input || document.activeElement !== input) return;
    const len = input.value.length;
    input.setSelectionRange(len, len);
  });

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nextDigits = onlyDigits(e.target.value)
      .replace(/^0+(?=\d)/, "")
      .slice(-MAX_DIGITS);
    const formatted = formatMoneyDigits(nextDigits);
    setDigits(nextDigits);
    setSyncedValue(formatted);
    onChange(formatted);
  }

  return (
    <input
      ref={(node) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      required={required}
      value={display}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-[2rem] border border-white/5 bg-white/5 px-20 py-10 text-6xl font-black text-white outline-none transition-all placeholder:text-zinc-800 focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
    />
  );
});
