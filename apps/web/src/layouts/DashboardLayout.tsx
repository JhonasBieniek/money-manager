import {
  CreditCard,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  ReceiptText,
  Settings,
  Tags,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AuthGuard } from "../components/AuthGuard";
import { OnboardingProvider } from "../contexts/onboarding-context";
import { PeriodProvider } from "../contexts/period-context";
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
  { name: "Cartões", href: "/dashboard/cards", icon: CreditCard },
  { name: "Dívidas", href: "/dashboard/debts", icon: Landmark },
  { name: "Tags", href: "/dashboard/tags", icon: Tags },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

const bottomNavItems = navItems.filter((item) =>
  ["Resumo", "Despesas", "Receitas", "Metas"].includes(item.name),
);

const drawerOnlyItems = navItems.filter((item) =>
  ["Tags", "Configurações"].includes(item.name),
);

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/tags")) return "Tags";
  if (pathname.startsWith("/dashboard/settings")) return "Configurações";
  if (pathname.startsWith("/dashboard/goals")) return "Metas";
  if (pathname.startsWith("/dashboard/cards")) return "Cartões";
  if (pathname.startsWith("/dashboard/debts")) return "Dívidas";
  if (pathname.startsWith("/dashboard/expenses")) return "Despesas";
  if (pathname.startsWith("/dashboard/incomes")) return "Receitas";
  return "Resumo";
}

function getHeaderAction(
  pathname: string,
): { type: "expense" | "income"; label: string; shortLabel: string } | null {
  if (pathname.startsWith("/dashboard/expenses")) {
    return {
      type: "expense",
      label: "Nova despesa",
      shortLabel: "Despesa",
    };
  }
  if (pathname.startsWith("/dashboard/incomes")) {
    return {
      type: "income",
      label: "Nova receita",
      shortLabel: "Receita",
    };
  }
  return null;
}

function NavItemLink({
  item,
  onNavigate,
  className,
}: {
  item: (typeof navItems)[number];
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <NavLink
      to={item.href}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
          isActive
            ? "bg-emerald-500/10 text-emerald-400"
            : "text-zinc-500 hover:bg-white/5 hover:text-white",
          className,
        )
      }
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {item.name}
    </NavLink>
  );
}

function DashboardShell() {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);
  const headerAction = getHeaderAction(location.pathname);
  const { openExpenseModal, openIncomeModal } = useTransactionModals();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  function handleHeaderClick() {
    if (!headerAction) return;
    if (headerAction.type === "expense") openExpenseModal();
    else openIncomeModal();
  }

  function closeDrawer() {
    setDrawerOpen(false);
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
              <NavItemLink key={item.href} item={item} />
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

      {drawerOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[min(100vw-3rem,18rem)] flex-col border-r border-white/10 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950">
                  <Receipt className="h-4 w-4" />
                </div>
                <span className="font-bold tracking-tight">Menu</span>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  onNavigate={closeDrawer}
                />
              ))}
            </nav>

            <div className="mt-4 border-t border-white/5 pt-4">
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <LogOut className="h-5 w-5" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="fixed top-0 left-0 right-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-zinc-950/90 px-4 backdrop-blur-xl sm:h-16 sm:px-6 lg:left-64 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white sm:text-lg">
                {pageTitle}
              </p>
              <p className="hidden text-xs text-zinc-500 sm:block">Painel</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <UncategorizedExpensesPanel />
            {headerAction ? (
              <button
                type="button"
                onClick={handleHeaderClick}
                className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95 sm:h-auto sm:px-4 sm:py-2"
                aria-label={headerAction.label}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="sm:hidden">{headerAction.shortLabel}</span>
                <span className="hidden sm:inline">{headerAction.label}</span>
              </button>
            ) : null}
          </div>
        </header>

        <div
          className="h-14 shrink-0 sm:h-16"
          aria-hidden
        />

        <div className="min-w-0 flex-1 p-3 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:p-4 lg:p-6 lg:pb-6">
          <div className="min-h-[calc(100dvh-8.5rem)] rounded-2xl border border-white/5 bg-zinc-900/30 p-4 sm:min-h-[calc(100vh-5rem)] sm:rounded-3xl sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navegação principal"
      >
        <div className="grid h-16 grid-cols-5">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors",
                  isActive ? "text-emerald-400" : "text-zinc-500",
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.name}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors",
              drawerOpen ||
                drawerOnlyItems.some((item) =>
                  location.pathname.startsWith(item.href),
                )
                ? "text-emerald-400"
                : "text-zinc-500",
            )}
            aria-label="Mais opções"
          >
            <Menu className="h-5 w-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export function DashboardLayout() {
  return (
    <AuthGuard>
      <PeriodProvider>
        <OnboardingProvider>
          <TransactionModalsProvider>
            <DashboardShell />
          </TransactionModalsProvider>
        </OnboardingProvider>
      </PeriodProvider>
    </AuthGuard>
  );
}
