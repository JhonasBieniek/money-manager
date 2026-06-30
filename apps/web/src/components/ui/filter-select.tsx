import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

type FilterSelectOption = {
  value: string;
  label: string;
};

export function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full cursor-pointer appearance-none bg-transparent py-1 pr-7 text-sm font-medium text-zinc-100 outline-none transition-colors hover:text-white focus:text-white"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-zinc-900 text-zinc-100"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}
