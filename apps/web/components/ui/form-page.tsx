"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function FormPage({
  backHref,
  backLabel,
  title,
  description,
  children,
  className,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl px-6 py-10 lg:px-10 lg:py-12", className)}>
      <div className="mb-8 space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          <p className="max-w-prose text-sm text-zinc-500 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 sm:p-8">{children}</div>
    </div>
  );
}
