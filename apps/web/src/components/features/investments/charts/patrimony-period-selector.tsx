import { cn } from "../../../../lib/cn";

export interface PatrimonyPeriodOption {
  value: string;
  label: string;
}

interface PatrimonyPeriodSelectorProps {
  options: PatrimonyPeriodOption[];
  value: string;
  onChange: (value: string) => void;
}

export function PatrimonyPeriodSelector({
  options,
  value,
  onChange,
}: PatrimonyPeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-bold transition-all",
            value === option.value
              ? "bg-emerald-500 text-zinc-950"
              : "bg-white/5 text-zinc-400 hover:bg-white/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
