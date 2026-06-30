import {
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  ReceiptText,
  Settings,
  Tags,
  Target,
  TrendingUp,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AuthGuard } from "../components/AuthGuard";
import { UncategorizedExpensesPanel } from "../components/features/expenses/uncategorized-expenses-panel";
import {
  TransactionModalsProvider,
  useTransactionModals,
} from "../components/providers/transaction-modals";
import { logout } from "../lib/api";
import { cn } from "../lib/cn";

const navItems = [
  { name: "Resumo", href: "/dashboard", icon: LayoutDashboard, end: true },
  { name: "Despesas", href: "/dashboard/expenses", icon: ReceiptText },
  { name: "Receitas", href: "/dashboard/incomes", icon: TrendingUp },
  { name: "Metas", href: "/dashboard/goals", icon: Target },
  { name: "Tags", href: "/dashboard/tags", icon: Tags },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

function getHeaderAction(
  pathname: string,
): { type: "expense" | "income"; label: string } | null {
  if (pathname.startsWith("/dashboard/expenses")) {
    return { type: "expense", label: "Nova despesa" };
  }
  if (pathname.startsWith("/dashboard/incomes")) {
    return { type: "income", label: "Nova receita" };
  }
  return null;
}

function DashboardShell() {
  const location = useLocation();
  const headerAction = getHeaderAction(location.pathname);
  const { openExpenseModal, openIncomeModal } = useTransactionModals();

  function handleHeaderClick() {
    if (!headerAction) return;
    if (headerAction.type === "expense") openExpenseModal();
    else openIncomeModal();
  }

  return (
    <div className="flex min-h-dvh bg-zinc-950 text-white">
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-white/5 bg-zinc-950/80 backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col p-6">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950">
              <Receipt className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Money Manager
            </span>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-zinc-500 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto border-t border-white/5 pt-4">
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/5 bg-zinc-950/80 px-6 backdrop-blur-xl lg:px-8">
          <h2 className="text-sm font-medium text-zinc-400">Painel</h2>

          <div className="flex items-center gap-3">
            <UncategorizedExpensesPanel />
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
          </div>
        </header>

        <div className="p-4 lg:p-6">
          <div className="min-h-[calc(100vh-5rem)] rounded-3xl border border-white/5 bg-zinc-900/30 p-6 lg:p-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export function DashboardLayout() {
  return (
    <AuthGuard>
      <TransactionModalsProvider>
        <DashboardShell />
      </TransactionModalsProvider>
    </AuthGuard>
  );
}
