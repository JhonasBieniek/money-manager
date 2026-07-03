import { forwardRef, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";

/** Permite apenas dígitos e um separador decimal (vírgula ou ponto). */
export function sanitizeMoneyAmountInput(raw: string): string {
  const value = raw.replace(/[^\d.,]/g, "");
  const separatorIndex = value.search(/[.,]/);

  if (separatorIndex === -1) {
    return value;
  }

  const intPart = value.slice(0, separatorIndex).replace(/[.,]/g, "");
  const separator = value[separatorIndex];
  const decPart = value
    .slice(separatorIndex + 1)
    .replace(/[.,]/g, "")
    .slice(0, 2);

  return `${intPart}${separator}${decPart}`;
}

export function parseMoneyAmountInput(value: string): number {
  const normalized = value.trim().replace(",", ".");
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
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      required={required}
      value={value}
      onChange={(e) => onChange(sanitizeMoneyAmountInput(e.target.value))}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-[2rem] border border-white/5 bg-white/5 px-20 py-10 text-6xl font-black text-white outline-none transition-all placeholder:text-zinc-800 focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
    />
  );
});
