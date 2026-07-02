import { Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className, compact }: BrandLogoProps) {
  return (
    <Link
      to="/"
      className={cn("group flex items-center gap-3", className)}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition-transform duration-200 group-hover:scale-105 sm:h-10 sm:w-10">
        <Receipt className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      {!compact ? (
        <span className="text-base font-semibold tracking-tight text-white sm:text-lg">
          Money Manager
        </span>
      ) : null}
    </Link>
  );
}
