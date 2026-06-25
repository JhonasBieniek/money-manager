import { Hash, LayoutDashboard, LogOut, Receipt, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { AuthGuard } from "../components/AuthGuard";
import { logout } from "../lib/api";
import { cn } from "../lib/cn";

const navItems = [
  { name: "Resumo", href: "/dashboard", icon: LayoutDashboard, end: true },
  { name: "Tags", href: "/dashboard/tags", icon: Hash },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

export function DashboardLayout() {
  return (
    <AuthGuard>
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
          <header className="sticky top-0 z-40 flex h-16 items-center border-b border-white/5 bg-zinc-950/80 px-6 backdrop-blur-xl lg:px-8">
            <h2 className="text-sm font-medium text-zinc-400">Painel</h2>
          </header>

          <div className="p-4 lg:p-6">
            <div className="min-h-[calc(100vh-5rem)] rounded-3xl border border-white/5 bg-zinc-900/30 p-6 lg:p-8">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
