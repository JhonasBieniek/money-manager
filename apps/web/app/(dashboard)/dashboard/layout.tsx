import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white px-6 py-3">
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard">Resumo</Link>
          <Link href="/dashboard/expenses">Despesas</Link>
          <Link href="/dashboard/categories">Categorias</Link>
        </nav>
      </header>
      <div className="p-6">{children}</div>
    </div>
    </AuthGuard>
  );
}
