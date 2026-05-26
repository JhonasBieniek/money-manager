"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const inputBase =
  "w-full rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/25";

export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
    >
      {children}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        {description ? (
          <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function FormField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wider text-zinc-500"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function FormInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function AmountField({
  id = "amount",
  value,
  onChange,
  label = "Valor",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-white/8 bg-white/[0.03] focus-within:border-emerald-500/40 focus-within:ring-1 focus-within:ring-emerald-500/25">
        <span className="flex items-center border-r border-white/8 bg-white/[0.02] px-4 text-sm font-medium text-zinc-500">
          R$
        </span>
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          className="min-w-0 flex-1 bg-transparent px-4 py-4 text-2xl font-semibold tracking-tight text-white outline-none placeholder:text-zinc-700 sm:text-3xl"
        />
      </div>
    </FormField>
  );
}

export function ChoiceOption({
  selected,
  onSelect,
  label,
  icon: Icon,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-h-[3.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all active:scale-[0.98]",
        selected
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
          : "border-white/8 bg-white/[0.02] text-zinc-500 hover:border-white/12 hover:bg-white/[0.04] hover:text-zinc-300"
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
      <span className="text-[11px] font-semibold uppercase tracking-wide leading-tight">
        {label}
      </span>
    </button>
  );
}

export function ChoiceGroup({
  label,
  children,
  columns = 3,
}: {
  label: string;
  children: React.ReactNode;
  columns?: 2 | 3 | 5;
}) {
  const gridCols =
    columns === 5
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      : columns === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <FormField label={label}>
      <div className={cn("grid gap-2", gridCols)}>{children}</div>
    </FormField>
  );
}

export function TagPicker({
  tags,
  selectedIds,
  onToggle,
}: {
  tags: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (tags.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nenhuma tag cadastrada.{" "}
        <a href="/dashboard/tags/new" className="text-emerald-400 hover:text-emerald-300">
          Criar tag
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const selected = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.98]",
              selected
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/12 hover:text-zinc-200"
            )}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

export function FormActions({
  onCancel,
  submitLabel,
  loading,
}: {
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Salvando…" : submitLabel}
      </button>
    </div>
  );
}
