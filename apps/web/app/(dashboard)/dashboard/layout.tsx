"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Receipt,
  Search,
  Plus,
  Wallet,
  Target,
  Hash,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  TransactionModalsProvider,
  useTransactionModals,
} from "@/components/providers/transaction-modals";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: "Resumo", href: "/dashboard", icon: LayoutDashboard },
  { name: "Receitas", href: "/dashboard/incomes", icon: Wallet },
  { name: "Despesas", href: "/dashboard/expenses", icon: Receipt },
  { name: "Metas", href: "/dashboard/goals", icon: Target },
  { name: "Tags", href: "/dashboard/tags", icon: Hash },
];

function getHeaderAction(
  pathname: string
): { type: "expense" | "income"; label: string } | null {
  if (pathname.startsWith("/dashboard/expenses")) {
    return { type: "expense", label: "Nova Despesa" };
  }
  if (pathname.startsWith("/dashboard/incomes")) {
    return { type: "income", label: "Nova Receita" };
  }
  return null;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const headerAction = getHeaderAction(pathname);
  const { openExpenseModal, openIncomeModal } = useTransactionModals();

  function handleHeaderClick() {
    if (!headerAction) return;
    if (headerAction.type === "expense") openExpenseModal();
    else openIncomeModal();
  }

  return (
    <div className="flex min-h-[100dvh] bg-zinc-950 text-white selection:bg-emerald-500/30">
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 border-r border-white/5 bg-zinc-950/50 backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col p-6">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950">
              <Receipt className="h-6 w-6" />
            </div>
            <span className="text-lg font-bold tracking-tight">Money Manager</span>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-zinc-500 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-colors",
                      isActive ? "text-emerald-400" : "group-hover:text-white"
                    )}
                  />
                  {item.name}
                  {isActive ? (
                    <motion.div
                      layoutId="active-pill"
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/5 pt-6" />
        </div>
      </aside>

      <main className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/5 bg-zinc-950/50 px-8 backdrop-blur-xl">
          <div className="flex items-center gap-4 text-zinc-400">
            <div className="group/search relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors group-focus-within/search:text-white" />
              <input
                type="text"
                placeholder="Buscar transações..."
                className="h-10 w-64 rounded-xl bg-white/5 pl-10 pr-4 text-sm transition-all focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {headerAction ? (
              <button
                type="button"
                onClick={handleHeaderClick}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                {headerAction.label}
              </button>
            ) : null}
            <div className="h-10 w-10 rounded-full border border-white/10 p-0.5">
              <div className="h-full w-full rounded-full border border-emerald-500/30 bg-emerald-500/15" />
            </div>
          </div>
        </header>

        <div className="p-0 lg:p-4">
          <div className="min-h-[calc(100vh-6rem)] rounded-[2.25rem] border border-white/5 bg-zinc-900/30">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TransactionModalsProvider>
      <DashboardShell>{children}</DashboardShell>
    </TransactionModalsProvider>
  );
}
