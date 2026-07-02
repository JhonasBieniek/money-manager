import type { ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import { MarketingBackground } from "./marketing-background";

type AuthPageShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthPageShell({
  title,
  subtitle,
  children,
  footer,
}: AuthPageShellProps) {
  return (
    <MarketingBackground>
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-6 lg:py-10">
        <div className="mb-8 lg:mb-10">
          <BrandLogo />
        </div>

        <div className="flex flex-1 items-center justify-center pb-8">
          <div className="w-full max-w-md">
            <div className="glass rounded-2xl p-6 sm:rounded-3xl sm:p-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Money Manager
              </p>
              <h2 className="mb-2 text-2xl font-bold text-white">{title}</h2>
              <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                {subtitle}
              </p>
              {children}
              <div className="mt-6 text-center text-sm text-zinc-500">
                {footer}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MarketingBackground>
  );
}
